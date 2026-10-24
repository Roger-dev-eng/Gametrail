import { createRedis } from './redis.js';

// Cache Redis Cloud via TCP, com TLS quando habilitado no banco.
const TTL_SECONDS = 60;
const MAX_ENTRY_BYTES = 128 * 1024;
const STORE = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 or redis.call('HLEN', KEYS[1]) < 128 then
  redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
  if redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[3]) end
  return 1
end
return 0`;

function identity(request) {
  const url = new URL(request.url);
  if (request.method !== 'GET') return null;
  if (url.pathname === '/api/dashboard') return ['dashboard'];
  if (url.pathname !== '/api/consultas') return null;
  const q = url.searchParams;
  return ['consultas', q.get('tabela') ?? 'Jogos', q.get('modo') ?? 'Simples', q.get('consulta') ?? 'Listar todos', q.get('parametro') ?? ''];
}

function marked(response, status) {
  response.headers.set('X-Cache', status);
  return response;
}

// A versão no PostgreSQL é a autoridade: uma chave antiga nunca atende uma nova versão.
// Assim, falhas no DEL ou preenchimentos concorrentes não reativam dados obsoletos.
export async function cachedApi(request, db, env, handler, clientFactory) {
  let redis;
  try { redis = createRedis(env, clientFactory); }
  catch { console.warn(JSON.stringify({ event: 'cache_configuration_invalid' })); }
  try { return await runCached(request, db, env, handler, redis); }
  finally { redis?.close(); }
}

async function runCached(request, db, env, handler, redis) {
  const keyParts = identity(request);
  const mutation = ['POST', 'PUT', 'DELETE'].includes(request.method);
  if (!redis || (!keyParts && !mutation)) return marked(await handler(), 'BYPASS');

  let revision;
  try {
    const result = await db.query('SELECT revision::text AS revision FROM app_cache_revision WHERE id = 1');
    revision = result.rows[0]?.revision;
    if (!/^\d+$/.test(revision ?? '')) throw new Error('Versão ausente');
  } catch {
    // Sem a migração de invalidação, não é seguro usar o Redis.
    console.warn(JSON.stringify({ event: 'cache_revision_unavailable' }));
    return marked(await handler(), 'BYPASS');
  }
  const bucket = `${env.CACHE_NAMESPACE || 'gametrail:v1'}:data:${revision}`;
  if (mutation) {
    const response = await handler();
    if (response.ok) {
      try { await redis(['DEL', bucket]); }
      catch { console.warn(JSON.stringify({ event: 'cache_delete_unavailable' })); }
    }
    return marked(response, 'BYPASS');
  }

  // O hash evita colocar termos de busca e emails nos nomes das chaves.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(keyParts)));
  const field = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  let available = true;
  try {
    const cached = await redis(['HGET', bucket, field]);
    if (cached !== null) return marked(Response.json(JSON.parse(cached)), 'HIT');
  } catch {
    available = false;
    console.warn(JSON.stringify({ event: 'cache_read_unavailable' }));
  }

  const response = await handler();
  if (available && response.ok) {
    const body = await response.clone().text();
    if (new TextEncoder().encode(body).byteLength <= MAX_ENTRY_BYTES) {
      try { await redis(['EVAL', STORE, 1, bucket, field, body, TTL_SECONDS]); }
      catch { console.warn(JSON.stringify({ event: 'cache_write_unavailable' })); }
    }
  }
  return marked(response, available ? 'MISS' : 'BYPASS');
}
