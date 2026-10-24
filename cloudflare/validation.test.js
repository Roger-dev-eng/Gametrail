import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRecord } from '../frontend/validation.js';
import { api, validateData } from './api.js';

const records = {
  jogos: { nome: 'Portal', ano_lancamento: '2007', desenvolvedora: 'Valve', genero: 'Puzzle' },
  jogadores: { nickname: 'Ana', email: 'ana@example.com', fk_jogo: '1' },
  plataformas: { nome: 'PC', horas_jogadas: '0', fk_jogador: '1' },
  avaliacoes: { nota: '0', comentario: '', status: 'Pendente', data_avaliacao: '2024-02-29', fk_jogador: '1', fk_jogo: '1' }
};

test('cadastro e edição de cada entidade usam as mesmas regras no navegador e na API', async t => {
  const invalid = {
    jogos: [{ nome: '  ' }, { nome: 'a'.repeat(101) }, { ano_lancamento: '-1' }, { ano_lancamento: '1.5' }, { ano_lancamento: '2147483648' }, { desenvolvedora: '' }, { genero: 'g'.repeat(51) }],
    jogadores: [{ nickname: 'n'.repeat(51) }, { email: 'sem-arroba' }, { email: 'ana @example.com' }, { email: 'a'.repeat(101) }, { fk_jogo: '0' }],
    plataformas: [{ nome: '' }, { horas_jogadas: '-1' }, { horas_jogadas: '1.5' }, { fk_jogador: '0' }],
    avaliacoes: [{ nota: '11' }, { nota: '-1' }, { nota: '1.2' }, { comentario: {} }, { status: 'a'.repeat(21) }, { data_avaliacao: '2026-02-29' }, { data_avaliacao: '0000-01-01' }, { fk_jogo: '' }]
  };
  for (const [resource, record] of Object.entries(records)) {
    await t.test(resource, async () => {
      assert.deepEqual(validateData(resource, record), validateRecord(resource, record));
      for (const changes of invalid[resource]) {
        const data = { ...record, ...changes };
        let message;
        try { validateRecord(resource, data); assert.fail('Deveria rejeitar'); }
        catch (error) { message = error.message; assert.ok(error.field); }
        assert.throws(() => validateData(resource, data), { status: 400, message });
        for (const method of ['POST', 'PUT']) {
          const request = new Request(`https://example.com/api/${resource}${method === 'PUT' ? '/1' : ''}`, { method, body: JSON.stringify(data) });
          await assert.rejects(api(request, { query: () => assert.fail('Dados inválidos não podem chegar ao SQL') }), { status: 400, message });
        }
      }
    });
  }
  assert.equal(validateData('avaliacoes', records.avaliacoes).comentario, null);
  assert.equal(validateData('jogos', { ...records.jogos, nome: '  Portal  ' }).nome, 'Portal');
});
