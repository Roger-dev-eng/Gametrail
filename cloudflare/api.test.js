import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { api, consulta, dashboard, validateData } from './api.js';

test('API Cloudflare com PostgreSQL: CRUD, todas as consultas e dashboard', async t => {
  const postgres = new PGlite();
  const db = { async query(sql, params) {
    const result = await postgres.query(sql, params);
    return { ...result, rowCount: result.affectedRows };
  } };
  const request = (path, method = 'GET', data) => api(new Request(`https://example.com/api/${path}`, {
    method, ...(data === undefined ? {} : { body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } })
  }), db);
  try {
    for (const file of ['ddl/01_schema.sql', 'ddl/03_igdb.sql', 'views/01_view_resumo_jogos.sql', 'functions/01_function_media_jogo.sql', 'procedure/01_procedure_atualizar_status_avaliacao.sql']) {
      await postgres.exec(readFileSync(`database/${file}`, 'utf8'));
    }
    const records = {
      jogos: { nome: 'Portal', ano_lancamento: '2007', desenvolvedora: 'Valve', genero: 'Puzzle' },
      jogadores: { nickname: 'Ana', email: 'ana@example.com', fk_jogo: '1' },
      plataformas: { nome: 'PC', horas_jogadas: '12', fk_jogador: '1' },
      avaliacoes: { nota: '9', comentario: 'Excelente', status: 'Pendente', data_avaliacao: new Date().toISOString().slice(0, 10), fk_jogo: '1', fk_jogador: '1' }
    };
    await t.test('cria e lista as quatro entidades; atualiza avaliação via procedure', async () => {
      for (const [name, data] of Object.entries(records)) {
        assert.equal((await request(name, 'POST', data)).status, 201);
        assert.equal((await (await request(name)).json()).length, 1);
        assert.equal((await request(`${name}/1`, 'PUT', data)).status, 200);
      }
      await request('avaliacoes/1', 'PUT', { ...records.avaliacoes, status: 'Aprovada' });
      assert.equal((await (await request('avaliacoes')).json())[0].status, 'Aprovada');
    });
    // Opções reais oferecidas pelo frontend: garante a compatibilidade do contrato.
    await t.test('busca por ID retorna o registro completo para editar uma consulta', async () => {
      for (const [name, data] of Object.entries(records)) {
        const row = await (await request(`${name}/1`)).json();
        for (const key of Object.keys(data)) assert.ok(Object.hasOwn(row, key));
      }
      await assert.rejects(request('jogos/999'), { status: 404 });
      await assert.rejects(request('jogos/abc'), { status: 400 });
    });
    const optionsSource = readFileSync('frontend/app.js', 'utf8').match(/const options = (\{[\s\S]*?\n  \});/)[1];
    const options = Function(`return (${optionsSource})`)();
    for (const [table, modes] of Object.entries(options)) {
      for (const [mode, choices] of Object.entries(modes)) {
        for (const choice of choices) {
          await t.test(`${table} / ${mode} / ${choice}`, async () => {
            const parameters = { 'Buscar por ID': '1', 'Buscar por nome': table === 'Avaliacoes' ? 'Excelente' : table === 'Jogos' ? 'Portal' : table === 'Jogadores' ? 'Ana' : 'PC', 'Filtrar por genero': 'Puzzle', 'Filtrar por ano': '2007', 'Buscar por nickname': 'Ana', 'Filtrar por nome': 'PC', 'Filtrar por nota': '9', 'Filtrar por status': 'Aprovada', 'Avaliacoes recentes': '30' };
            const rows = await consulta(db, table, mode, choice, parameters[choice] ?? '');
            assert.equal(rows.length, 1);
            for (const value of Object.values(rows[0])) assert.notEqual(value, undefined);
          });
        }
      }
    }
    await t.test('dashboard mantém os nove conjuntos esperados', async () => {
      const result = await dashboard(db);
      assert.equal(Object.keys(result).length, 9);
      assert.equal(Number(result.jogos[0].total), 1);
      assert.equal(Number(result.media[0].total), 9);
      assert.equal(Number(result.horasJogadores[0]['Total Horas']), 12);
    });
    await t.test('parâmetros não permitem injeção SQL', async () => {
      assert.deepEqual(await consulta(db, 'Jogos', 'Simples', 'Buscar por nome', "' OR 1=1 --"), []);
      await assert.rejects(request('jogos/1 OR 1=1', 'DELETE'), { status: 400 });
      await assert.rejects(consulta(db, 'jogos; DROP TABLE jogos'), { status: 400 });
    });
    await t.test('rollback preserva a avaliação se a procedure falha', async () => {
      await postgres.exec('DROP PROCEDURE pr_atualizar_status_avaliacao(INTEGER, VARCHAR)');
      await assert.rejects(request('avaliacoes/1', 'PUT', { ...records.avaliacoes, nota: 2 }));
      assert.equal((await (await request('avaliacoes')).json())[0].nota, 9);
    });
    await t.test('exclusão respeita vínculos e retorna 404 para ID ausente', async () => {
      await assert.rejects(request('jogos/1', 'DELETE'), { code: '23503' });
      for (const name of ['avaliacoes', 'plataformas', 'jogadores', 'jogos']) assert.equal((await request(`${name}/1`, 'DELETE')).status, 200);
      await assert.rejects(request('jogos/999', 'DELETE'), { status: 404 });
      await assert.rejects(request('jogos/999', 'PUT', records.jogos), { status: 404 });
      await assert.rejects(request('jogos/1/extra'), { status: 404 });
    });
    await t.test('validações rejeitam notas, datas e inteiros inválidos', async () => {
      for (const data of [{ nota: 11 }, { nota: '1.5' }, { data_avaliacao: '2026-02-30' }, { fk_jogo: 'abc' }]) {
        assert.throws(() => validateData('avaliacoes', { ...records.avaliacoes, ...data }), { status: 400 });
      }
      await assert.rejects(request('jogos', 'PATCH'), { status: 405 });
      await assert.rejects(api(new Request('https://example.com/api/jogos', { method: 'POST', body: '{' }), db), { status: 400 });
    });
  } finally { await postgres.close(); }
});
