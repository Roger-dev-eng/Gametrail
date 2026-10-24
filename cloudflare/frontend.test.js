import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fieldRules, validateRecord } from '../frontend/validation.js';

// DOM mínimo para testar os eventos reais da tela sem dependências de navegador.
function screen() {
  const nodes = new Map();
  const calls = [];
  let result = [{ ID: 7, Nome: 'Portal' }];
  class Element {
    value = '';
    style = {};
    dataset = {};
    classList = { add() {}, remove() {} };
    set innerHTML(value) {
      this.html = value;
      if (this === nodes.get('#content')) {
        for (const key of [...nodes.keys()]) if (key !== '#content') nodes.delete(key);
        for (const match of value.matchAll(/id="([^"]+)"/g)) nodes.set(`#${match[1]}`, new Element());
        if (nodes.has('#query-table')) {
          nodes.get('#query-table').value = 'Jogos';
          nodes.get('#query-mode').value = 'Simples';
        }
      }
      if (this === nodes.get('#query-choice')) this.value = value.match(/<option>(.*?)<\/option>/)?.[1] ?? '';
    }
    querySelectorAll(selector) {
      return [...(this.html ?? '').matchAll(/class="(edit|del)" data-row="(\d+)"/g)]
        .filter(match => `.${match[1]}` === selector)
        .map(match => ({ dataset: { row: match[2] } }));
    }
  }
  const content = new Element();
  nodes.set('#content', content);
  const document = {
    body: new Element(),
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, new Element()); return nodes.get(selector); },
    querySelectorAll: () => []
  };
  // Guardar os botões para disparar os handlers registrados pelo frontend.
  const querySelectorAll = Element.prototype.querySelectorAll;
  Element.prototype.querySelectorAll = function(selector) {
    const buttons = querySelectorAll.call(this, selector);
    this[selector] = buttons;
    return buttons;
  };
  const context = {
    fieldRules, validateRecord,
    document, localStorage: { getItem: () => null }, console, setTimeout: () => {}, confirm: () => true,
    FormData: class { constructor(form) { return Object.entries(form.values); } },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      const data = url.startsWith('/api/consultas?') ? result : options.method ? { ok: true } : { id_jogo: 7, nome: 'Portal', ano_lancamento: 2007, desenvolvedora: 'Valve', genero: 'Puzzle' };
      return { ok: true, status: 200, text: async () => JSON.stringify(data) };
    }
  };
  const script = readFileSync('frontend/app.js', 'utf8').replace(/^import .* from '\.\/validation\.js';\s*/, '');
  runInNewContext(script + '\nglobalThis.openQueries = renderQueries; globalThis.openForm = renderForm;', context);
  return { nodes, calls, context, content, setResult: value => { result = value; } };
}

test('edição em consulta carrega registro completo e restaura os filtros ao salvar', async () => {
  const ui = screen();
  await ui.context.openQueries({ table: 'Jogos', mode: 'Filtros', choice: 'Filtrar por genero', parameter: 'Puzzle' });
  await ui.nodes.get('#query-result')['.edit'][0].onclick();
  assert.equal(ui.calls.at(-1).url, '/api/jogos/7');
  assert.match(ui.content.html, /value="Valve"/);
  const form = ui.nodes.get('#record');
  form.values = { nome: 'Portal 2', ano_lancamento: '2011', desenvolvedora: 'Valve', genero: 'Puzzle' };
  await form.onsubmit({ preventDefault() {}, target: form });
  assert.equal(ui.calls.at(-2).options.method, 'PUT');
  assert.equal(ui.nodes.get('#query-parameter').value, 'Puzzle');
  assert.equal(ui.nodes.get('#query-mode').value, 'Filtros');
  assert.match(ui.calls.at(-1).url, /parametro=Puzzle/);
});

test('exclusão em join usa o ID da entidade consultada e atualiza os resultados', async () => {
  const ui = screen();
  ui.setResult([{ 'ID Jogo': 7, Nome: 'Portal', 'ID Jogador': 99 }]);
  await ui.context.openQueries({ table: 'Jogos', mode: 'Joins', choice: 'Jogos com jogadores', parameter: '' });
  await ui.nodes.get('#query-result')['.del'][0].onclick();
  assert.equal(ui.calls.at(-2).url, '/api/jogos/7');
  assert.equal(ui.calls.at(-2).options.method, 'DELETE');
  assert.match(ui.calls.at(-1).url, /modo=Joins/);
});

test('agregações sem registro individual não oferecem editar ou excluir', async () => {
  const ui = screen();
  ui.setResult([{ 'Total Jogos': 3 }]);
  await ui.context.openQueries({ table: 'Jogos', mode: 'Agregações', choice: 'Contar total', parameter: '' });
  assert.doesNotMatch(ui.nodes.get('#query-result').html, /class="(?:edit|del)"/);
});

test('edição nas consultas bloqueia valores inválidos antes de chamar a API', async () => {
  const ui = screen();
  await ui.context.openQueries({ table: 'Jogos', mode: 'Simples', choice: 'Buscar por ID', parameter: '7' });
  await ui.nodes.get('#query-result')['.edit'][0].onclick();
  const form = ui.nodes.get('#record');
  const before = ui.calls.length;
  for (const invalid of [{ nome: '   ' }, { ano_lancamento: '-1' }, { ano_lancamento: '2.5' }, { nome: 'a'.repeat(101) }]) {
    form.values = { nome: 'Portal', ano_lancamento: '2007', desenvolvedora: 'Valve', genero: 'Puzzle', ...invalid };
    await form.onsubmit({ preventDefault() {}, target: form });
    assert.equal(ui.calls.length, before);
    assert.equal(ui.nodes.get('#toast').className, 'error');
    assert.equal(ui.nodes.get('#record'), form);
  }
});

test('formulários compartilham limites e comentário opcional', async () => {
  const ui = screen();
  ui.context.openForm('avaliacoes', { id_avaliacao: 3 }, async () => {});
  assert.match(ui.content.html, /name="nota"[^>]*min="0" max="10" step="1"/);
  assert.match(ui.content.html, /name="fk_jogo"[^>]*min="1"/);
  assert.match(ui.content.html, /name="status"[^>]*maxlength="20"/);
  assert.doesNotMatch(ui.content.html.match(/<input name="comentario"[^>]*>/)[0], /required/);
  const form = ui.nodes.get('#record');
  const valid = { nota: '10', comentario: '', status: 'Pendente', data_avaliacao: '2026-10-23', fk_jogador: '1', fk_jogo: '1' };
  for (const invalid of [{ nota: '11' }, { nota: '0.5' }, { fk_jogo: '0' }, { data_avaliacao: '2026-02-30' }]) {
    form.values = { ...valid, ...invalid };
    await form.onsubmit({ preventDefault() {}, target: form });
    assert.equal(ui.calls.length, 0);
  }
  form.values = valid;
  await form.onsubmit({ preventDefault() {}, target: form });
  assert.equal(ui.calls[0].options.method, 'PUT');
  assert.equal(JSON.parse(ui.calls[0].options.body).comentario, null);
  ui.context.openForm('jogadores', { id_jogador: 2 });
  const playerForm = ui.nodes.get('#record');
  playerForm.values = { nickname: 'Ana', email: 'invalido', fk_jogo: '1' };
  await playerForm.onsubmit({ preventDefault() {}, target: playerForm });
  assert.equal(ui.calls.length, 1);
  assert.match(ui.nodes.get('#toast').textContent, /E-mail/);
});
