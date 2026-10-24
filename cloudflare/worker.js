import pg from 'pg';
import { api, HttpError } from './api.js';
import { cachedApi } from './cache.js';
import { createIgdb } from './igdb.js';

// Preserve DATE/TIMESTAMP como texto, evitando deslocamento de fuso no frontend.
const types = { getTypeParser: (oid, format) => [1082, 1114, 1184].includes(oid) ? value => value : pg.types.getTypeParser(oid, format) };

export default {
  async fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const catalog = createIgdb(env);
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/catalogo/')) {
      try {
        if (request.method !== 'GET') throw new HttpError(405, 'Método não permitido.');
        const match = path.match(/^\/api\/catalogo\/jogos(?:\/(\d+))?$/);
        if (!match) throw new HttpError(404, 'Recurso não encontrado.');
        const data = match[1] ? await catalog.getGame(Number(match[1])) : await catalog.search(new URL(request.url).searchParams.get('q'));
        return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
      } catch (error) {
        return Response.json({ error: error instanceof HttpError ? error.message : 'Falha ao consultar o catálogo.' }, { status: error instanceof HttpError ? error.status : 502, headers: { 'Cache-Control': 'no-store' } });
      }
    }
    if (!env.HYPERDRIVE?.connectionString) return Response.json({ error: 'Configure a conexão HYPERDRIVE com o PostgreSQL.' }, { status: 503 });
    const client = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString, types, connectionTimeoutMillis: 10000, query_timeout: 15000 });
    try {
      await client.connect();
      const response = await cachedApi(request, client, env, () => api(request, client, catalog));
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch (error) {
      let status = error instanceof HttpError ? error.status : 500;
      let message = error instanceof HttpError ? error.message : 'Não foi possível acessar o banco. Tente novamente.';
      if (error.code === '23503') { status = 409; message = 'Registro relacionado inexistente ou em uso por outros registros.'; }
      if (error.code === '23505') { status = 409; message = error.constraint === 'jogos_igdb_id_unique' ? 'Este jogo do IGDB já está cadastrado.' : 'Já existe um registro com esses dados.'; }
      if (['23514', '22001', '22007', '22008', '22P02'].includes(error.code)) { status = 400; message = 'Dados inválidos. Confira os valores informados.'; }
      // Não registrar mensagens do driver: podem conter dados e credenciais.
      if (status === 500) console.error(JSON.stringify({ event: 'database_error', code: error.code ?? 'unknown' }));
      return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
    } finally {
      await client.end().catch(() => {});
    }
  }
};
