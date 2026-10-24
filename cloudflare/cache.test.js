import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { api } from './api.js';
import { cachedApi } from './cache.js';

const env = { REDIS_HOST: 'cache.example.com', REDIS_PORT: '12345', REDIS_PASSWORD: 'test-only', REDIS_TLS: 'false', CACHE_NAMESPACE: 'tests:v1' };
function redisServer() {
  const buckets = new Map();
  const commands = [];
  let now = 0;
  let offline = false;
  return {
    buckets, commands,
    offline(value) { offline = value; },
    advance(seconds) { now += seconds; },
    clientFactory(options) {
      assert.equal(options.socket.host, 'cache.example.com');
      assert.equal(options.password, 'test-only');
      return {
        isOpen: false, on() {},
        async connect() { if (offline) throw new Error('Offline'); this.isOpen = true; },
        destroy() { this.isOpen = false; },
        async sendCommand(command) {
          if (offline) throw new Error('Offline');
          commands.push(command);
          const key = command[0] === 'EVAL' ? command[3] : command[1];
          if (buckets.get(key)?.expires <= now) buckets.delete(key);
          let result;
          if (command[0] === 'HGET') result = buckets.get(key)?.fields.get(command[2]) ?? null;
          else if (command[0] === 'DEL') result = buckets.delete(key) ? 1 : 0;
          else if (command[0] === 'EVAL') {
            assert.match(command[1], /redis.call\('EXPIRE'/);
            assert.equal(command[6], '60');
            const bucket = buckets.get(key) ?? { fields: new Map(), expires: now + Number(command[6]) };
            if (bucket.fields.has(command[4]) || bucket.fields.size < 128) {
              bucket.fields.set(command[4], command[5]);
              buckets.set(key, bucket);
              result = 1;
            } else result = 0;
          } else throw new Error('Comando inesperado');
          return result;
        }
      };
    }
  };
}

test('Redis integrado ao PostgreSQL: cache, invalidação e recuperação', async t => {
  const postgres = new PGlite();
  const redis = redisServer();
  let reads = 0;
  const db = { async query(sql, params) {
    if (sql.startsWith('SELECT') && !sql.includes('app_cache_revision')) reads++;
    const result = await postgres.query(sql, params);
    return { ...result, rowCount: result.affectedRows };
  } };
  const request = (path, method = 'GET', data) => new Request(`https://example.com/api/${path}`, {
    method, ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });
  const run = (path, method = 'GET', data) => {
    const req = request(path, method, data);
    return cachedApi(req, db, env, () => api(req, db), redis.clientFactory);
  };
  const revision = async () => (await db.query('SELECT revision::text AS revision FROM app_cache_revision WHERE id=1')).rows[0].revision;
  const jogo = { nome: 'Portal', ano_lancamento: 2007, desenvolvedora: 'Valve', genero: 'Puzzle' };
  try {
    for (const file of ['ddl/01_schema.sql', 'ddl/03_igdb.sql', 'ddl/02_cache.sql', 'views/01_view_resumo_jogos.sql', 'functions/01_function_media_jogo.sql', 'procedure/01_procedure_atualizar_status_avaliacao.sql']) await postgres.exec(readFileSync(`database/${file}`, 'utf8'));

    await t.test('dashboard reutiliza JSON, sem repetir as nove consultas', async () => {
      assert.equal((await run('dashboard')).headers.get('X-Cache'), 'MISS');
      const before = reads;
      const cached = await run('dashboard');
      assert.equal(cached.headers.get('X-Cache'), 'HIT');
      assert.equal(reads, before);
      assert.equal(Number((await cached.json()).jogos[0].total), 0);
    });
    await t.test('POST, PUT e DELETE removem o bucket e recriam ambos os caches', async () => {
      for (const [method, path, data, expected] of [['POST', 'jogos', jogo, 'Portal'], ['PUT', 'jogos/1', { ...jogo, nome: 'Portal 2' }, 'Portal 2'], ['DELETE', 'jogos/1', undefined, null]]) {
        await run('dashboard');
        await run('consultas');
        const oldKey = `tests:v1:data:${await revision()}`;
        const result = await run(path, method, data);
        assert.ok(result.ok);
        assert.equal(redis.buckets.has(oldKey), false);
        assert.equal((await run('dashboard')).headers.get('X-Cache'), 'MISS');
        const query = await run('consultas');
        assert.equal(query.headers.get('X-Cache'), 'MISS');
        assert.equal((await query.json())[0]?.Nome ?? null, expected);
        assert.equal((await run('consultas')).headers.get('X-Cache'), 'HIT');
      }
    });
    await t.test('cada filtro tem sua chave e a ordem da URL não importa', async () => {
      const base = 'consultas?tabela=Jogos&modo=Simples&consulta=Buscar+por+nome';
      assert.equal((await run(`${base}&parametro=Portal`)).headers.get('X-Cache'), 'MISS');
      assert.equal((await run('consultas?parametro=Portal&consulta=Buscar+por+nome&modo=Simples&tabela=Jogos')).headers.get('X-Cache'), 'HIT');
      assert.equal((await run(`${base}&parametro=Outro`)).headers.get('X-Cache'), 'MISS');
      redis.advance(61);
      assert.equal((await run(`${base}&parametro=Portal`)).headers.get('X-Cache'), 'MISS');
    });
    await t.test('alterações nas quatro tabelas e na procedure invalidam a versão', async () => {
      const statements = [
        "INSERT INTO jogos (id_jogo, nome, ano_lancamento, desenvolvedora, genero) VALUES (9, 'Jogo', 2020, 'Dev', 'RPG')",
        "INSERT INTO jogadores VALUES (9, 'Ana', 'ana@test.com', 9)",
        "INSERT INTO plataformas VALUES (9, 'PC', 2, NULL, 9)",
        "INSERT INTO avaliacoes VALUES (9, 8, '', 'Pendente', CURRENT_DATE, 9, 9)",
        "CALL pr_atualizar_status_avaliacao(9, 'Aprovada')"
      ];
      for (const sql of statements) {
        await run('dashboard');
        const before = await revision();
        await db.query(sql);
        assert.notEqual(await revision(), before);
        assert.equal((await run('dashboard')).headers.get('X-Cache'), 'MISS');
      }
    });
    await t.test('falha ou rollback não invalidam o cache', async () => {
      await run('dashboard');
      const before = await revision();
      await assert.rejects(run('jogos/9', 'DELETE'), { code: '23503' });
      await db.query('BEGIN');
      await db.query("UPDATE jogos SET nome='Desfeito' WHERE id_jogo=9");
      await db.query('ROLLBACK');
      assert.equal(await revision(), before);
      assert.equal((await run('dashboard')).headers.get('X-Cache'), 'HIT');
      await assert.rejects(run('jogos', 'POST', {}), { status: 400 });
    });
    await t.test('Redis indisponível não bloqueia leitura ou gravação nem restaura cache velho', async () => {
      await run('consultas');
      redis.offline(true);
      assert.equal((await run('consultas')).headers.get('X-Cache'), 'BYPASS');
      assert.ok((await run('jogos/9', 'PUT', { ...jogo, nome: 'Atualizado' })).ok);
      redis.offline(false);
      const response = await run('consultas');
      assert.equal(response.headers.get('X-Cache'), 'MISS');
      assert.equal((await response.json())[0].Nome, 'Atualizado');
    });
    await t.test('leitura concorrente antiga não repopula a versão atual após uma alteração', async () => {
      redis.advance(61);
      let release;
      let loaded;
      const ready = new Promise(resolve => { loaded = resolve; });
      const wait = new Promise(resolve => { release = resolve; });
      const req = request('consultas');
      const pending = cachedApi(req, db, env, async () => {
        const response = await api(req, db);
        loaded();
        await wait;
        return response;
      }, redis.clientFactory);
      await ready;
      await run('jogos/9', 'PUT', { ...jogo, nome: 'Mais recente' });
      release();
      await pending;
      const response = await run('consultas');
      assert.equal(response.headers.get('X-Cache'), 'MISS');
      assert.equal((await response.json())[0].Nome, 'Mais recente');
    });
  } finally { await postgres.close(); }
});

test('sem Redis ou migração, consulta normalmente sem cache', async () => {
  const req = new Request('https://example.com/api/dashboard');
  const db = { query: async () => { throw new Error('Tabela ausente'); } };
  const handler = async () => Response.json({ ok: true });
  const transport = () => { throw new Error('Não deveria chamar Redis'); };
  assert.equal((await cachedApi(req, db, {}, handler, transport)).headers.get('X-Cache'), 'BYPASS');
  assert.equal((await cachedApi(req, db, env, handler, transport)).headers.get('X-Cache'), 'BYPASS');
});
