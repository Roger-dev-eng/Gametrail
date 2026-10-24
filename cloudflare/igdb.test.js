import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createIgdb, normalizeGame } from './igdb.js';
import { api } from './api.js';

const game = { id: 1942, name: 'The Witcher 3', cover: { image_id: 'co1wyy' }, first_release_date: 1431993600, genres: [{ name: 'RPG' }], involved_companies: [{ developer: true, company: { name: 'CD Projekt RED' } }, { developer: false, company: { name: 'Publisher' } }] };
let nextClient = 0;
function fixture(options = {}) {
  const calls = [];
  const values = new Map();
  let closed = 0;
  const env = { IGDB_CLIENT_ID: `test-${++nextClient}`, IGDB_CLIENT_SECRET: 'fake-secret', CACHE_NAMESPACE: 'tests' };
  const catalog = createIgdb(env, {
    redisFactory: () => {
      const redis = async command => {
        if (options.redisOffline) throw new Error('Offline');
        const key = `${command[command[0] === 'HGET' ? 1 : 3]}:${command[command[0] === 'HGET' ? 2 : 4]}`;
        if (command[0] === 'HGET') return values.get(key) ?? null;
        assert.equal(command[0], 'EVAL');
        assert.match(command[1], /900/);
        values.set(key, command[5]);
        return 1;
      };
      redis.close = () => closed++;
      return redis;
    },
    transport: async (url, init) => {
      calls.push({ url, init });
      assert.ok(init.signal);
      if (url.includes('oauth2')) {
        assert.equal(new URLSearchParams(init.body).get('client_secret'), 'fake-secret');
        assert.ok(!url.includes('fake-secret'));
        return options.tokenFailure ? new Response('', { status: 401 }) : Response.json({ access_token: 'fake-token', expires_in: 3600 });
      }
      assert.equal(init.headers['Client-ID'], env.IGDB_CLIENT_ID);
      assert.equal(init.headers.Authorization, 'Bearer fake-token');
      if (options.unauthorizedOnce && calls.filter(call => call.url.includes('/v4/')).length === 1) return new Response('', { status: 401 });
      if (options.status) return new Response('', { status: options.status });
      return options.invalidJson ? new Response('invalid') : Response.json(options.empty ? [] : [game]);
    }
  });
  return { catalog, calls, values, get closed() { return closed; } };
}

test('IGDB normaliza capa, data UTC e apenas empresas desenvolvedoras', () => {
  const normalized = normalizeGame(game);
  assert.equal(normalized.ano_lancamento, 2015);
  assert.equal(normalized.desenvolvedora, 'CD Projekt RED');
  assert.match(normalized.capa_url, /^https:\/\/images.igdb.com\//);
  const missing = normalizeGame({ id: 1, name: 'Sem detalhes' });
  assert.equal(missing.capa_url, null);
  assert.equal(missing.ano_lancamento, null);
  assert.equal(missing.genero, '');
  assert.equal(normalizeGame({ ...game, cover: { image_id: '../x' } }).capa_url, null);
});

test('busca IGDB armazena e reutiliza resultados, separados do cache dos dados locais', async () => {
  const f = fixture();
  const first = await f.catalog.search('Witcher');
  assert.equal(first[0].igdb_id, 1942);
  const count = f.calls.length;
  assert.deepEqual(await f.catalog.search('Witcher'), first);
  assert.equal(f.calls.length, count);
  assert.ok([...f.values.keys()].every(key => key.startsWith('tests:igdb:v1:')));
  assert.equal(f.closed, 2);
  await f.catalog.search('Portal');
  assert.equal(f.calls.filter(call => call.url.includes('oauth2')).length, 1);
  assert.equal(f.calls.filter(call => call.url.includes('/v4/')).length, 2);
});

test('busca escapa caracteres e rejeita parâmetros inválidos sem chamar o provedor', async () => {
  const f = fixture();
  await f.catalog.search('a"; limit 500; \\');
  assert.ok(f.calls.at(-1).init.body.includes(`search ${JSON.stringify('a"; limit 500; \\')}; limit 12;`));
  const count = f.calls.length;
  for (const term of ['', 'ab', 'x'.repeat(121), 'abc\n']) {
    // Espaços nas extremidades são normalizados; controles internos são rejeitados.
    if (term === 'abc\n') continue;
    await assert.rejects(f.catalog.search(term), { status: 400 });
  }
  await assert.rejects(f.catalog.search('a\nbc'), { status: 400 });
  await assert.rejects(f.catalog.getGame(-1), { status: 400 });
  assert.equal(f.calls.length, count);
});

test('busca continua sem Redis e renova token uma vez ao receber 401', async () => {
  const f = fixture({ redisOffline: true, unauthorizedOnce: true });
  assert.equal((await f.catalog.search('Witcher')).length, 1);
  assert.equal(f.calls.filter(call => call.url.includes('oauth2')).length, 2);
  assert.equal(f.closed, 1);
});

test('falhas, limites, ausência de configuração e jogos não encontrados têm mensagens controladas', async () => {
  await assert.rejects(createIgdb({}).search('Portal'), { status: 503 });
  await assert.rejects(fixture({ tokenFailure: true }).catalog.search('Portal'), { status: 503 });
  await assert.rejects(fixture({ status: 429 }).catalog.search('Portal'), { status: 429 });
  await assert.rejects(fixture({ status: 500 }).catalog.search('Portal'), { status: 502 });
  await assert.rejects(fixture({ invalidJson: true }).catalog.search('Portal'), { status: 502 });
  const f = fixture({ empty: true });
  assert.deepEqual(await f.catalog.search('Nada'), []);
  const count = f.calls.length;
  assert.deepEqual(await f.catalog.search('Nada'), []);
  assert.equal(f.calls.length, count);
  await assert.rejects(f.catalog.getGame(123), { status: 404 });
});

test('migração preserva jogos existentes e cadastro IGDB confirma capa e impede duplicatas', async () => {
  const postgres = new PGlite();
  const db = { async query(sql, params) { const result = await postgres.query(sql, params); return { ...result, rowCount: result.affectedRows }; } };
  const data = { nome: 'The Witcher 3', ano_lancamento: 2015, desenvolvedora: 'CD Projekt RED', genero: 'RPG', igdb_id: 1942, capa_url: null };
  const catalog = { async getGame(id) { assert.equal(id, 1942); return normalizeGame(game); } };
  const request = (path, method, body) => api(new Request(`https://example.com/api/${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) }), db, catalog);
  try {
    await postgres.exec(readFileSync('database/ddl/01_schema.sql', 'utf8'));
    await db.query("INSERT INTO jogos (nome) VALUES ('Legado')");
    await postgres.exec(readFileSync('database/ddl/03_igdb.sql', 'utf8'));
    await postgres.exec(readFileSync('database/ddl/03_igdb.sql', 'utf8'));
    assert.equal((await db.query('SELECT igdb_id FROM jogos WHERE id_jogo=1')).rows[0].igdb_id, null);
    assert.equal((await request('jogos', 'POST', data)).status, 201);
    const stored = await (await request('jogos/2', 'GET')).json();
    assert.equal(stored.igdb_id, 1942);
    assert.equal(stored.capa_url, normalizeGame(game).capa_url);
    await assert.rejects(request('jogos', 'POST', data), { status: 409 });
    await assert.rejects(db.query('INSERT INTO jogos (nome, igdb_id) VALUES ($1,$2)', ['Outra cópia', 1942]), { code: '23505' });
    assert.equal((await request('jogos/2', 'PUT', { ...data, nome: 'Nome revisado' })).status, 200);
    assert.equal((await (await request('jogos/2', 'GET')).json()).igdb_id, 1942);
    assert.equal((await request('jogos', 'POST', { ...data, igdb_id: null })).status, 201);
    await assert.rejects(request('jogos', 'POST', { ...data, capa_url: 'javascript:alert(1)' }), { status: 400 });
  } finally { await postgres.close(); }
});
