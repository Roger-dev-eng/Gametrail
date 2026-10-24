import pg from 'pg';
import { api, HttpError } from './api.js';
import { cachedApi } from './cache.js';

// Preserve DATE/TIMESTAMP como texto, evitando deslocamento de fuso no frontend.
const types = { getTypeParser: (oid, format) => [1082, 1114, 1184].includes(oid) ? value => value : pg.types.getTypeParser(oid, format) };

export default {
  async fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!env.HYPERDRIVE?.connectionString) return Response.json({ error: 'Configure a conexão HYPERDRIVE com o PostgreSQL.' }, { status: 503 });
    const client = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString, types, connectionTimeoutMillis: 10000, query_timeout: 15000 });
    try {
      await client.connect();
      const response = await cachedApi(request, client, env, () => api(request, client));
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch (error) {
      let status = error instanceof HttpError ? error.status : 500;
      let message = error instanceof HttpError ? error.message : 'Não foi possível acessar o banco. Tente novamente.';
      if (error.code === '23503') { status = 409; message = 'Registro relacionado inexistente ou em uso por outros registros.'; }
      if (error.code === '23505') { status = 409; message = 'Já existe um registro com esses dados.'; }
      if (['23514', '22001', '22007', '22008', '22P02'].includes(error.code)) { status = 400; message = 'Dados inválidos. Confira os valores informados.'; }
      // Não registrar mensagens do driver: podem conter dados e credenciais.
      if (status === 500) console.error(JSON.stringify({ event: 'database_error', code: error.code ?? 'unknown' }));
      return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
    } finally {
      await client.end().catch(() => {});
    }
  }
};
