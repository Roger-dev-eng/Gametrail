import { HttpError } from './api.js';
import { createRedis } from './redis.js';

// Somente dados de autenticação reutilizáveis; não compartilha sockets ou promises de requisições.
let tokenCache;
const FIELDS = 'fields name,cover.image_id,first_release_date,genres.name,involved_companies.developer,involved_companies.company.name;';
const STORE = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 or redis.call('HLEN', KEYS[1]) < 128 then
 redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
 if redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], 900) end
 return 1
end
return 0`;

async function limitedJson(response, limit = 256 * 1024) {
  if (!response.body) throw new HttpError(502, 'O catálogo retornou uma resposta inválida.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new HttpError(502, 'A resposta do catálogo excedeu o limite.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new HttpError(502, 'O catálogo retornou uma resposta inválida.'); }
}

export function normalizeGame(game) {
  if (!Number.isInteger(game.id) || game.id < 1 || typeof game.name !== 'string') return null;
  const image = game.cover?.image_id;
  const date = Number.isFinite(game.first_release_date) ? new Date(game.first_release_date * 1000) : null;
  const year = date && Number.isFinite(date.getTime()) ? date.getUTCFullYear() : null;
  return {
    igdb_id: game.id,
    nome: game.name,
    ano_lancamento: year > 0 && year <= 9999 ? year : null,
    desenvolvedora: [...new Set((game.involved_companies ?? []).filter(item => item.developer).map(item => item.company?.name).filter(Boolean))].join(', '),
    genero: (game.genres ?? []).map(item => item.name).filter(Boolean).join(', '),
    capa_url: typeof image === 'string' && /^[a-zA-Z0-9_-]+$/.test(image) ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${image}.jpg` : null
  };
}

export function createIgdb(env, { transport = fetch, redisFactory = createRedis } = {}) {
  async function accessToken(force = false) {
    if (!force && tokenCache?.clientId === env.IGDB_CLIENT_ID && tokenCache?.secret === env.IGDB_CLIENT_SECRET && tokenCache.expires > Date.now()) return tokenCache.value;
    const response = await transport('https://id.twitch.tv/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.IGDB_CLIENT_ID, client_secret: env.IGDB_CLIENT_SECRET, grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new HttpError(503, 'Não foi possível autenticar no catálogo. Verifique a configuração do IGDB.');
    const data = await limitedJson(response, 16 * 1024);
    if (typeof data.access_token !== 'string' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new HttpError(502, 'Autenticação do catálogo inválida.');
    tokenCache = { clientId: env.IGDB_CLIENT_ID, secret: env.IGDB_CLIENT_SECRET, value: data.access_token, expires: Date.now() + Math.max(0, data.expires_in - 60) * 1000 };
    return data.access_token;
  }
  async function query(kind, value) {
    if (!env.IGDB_CLIENT_ID || !env.IGDB_CLIENT_SECRET) throw new HttpError(503, 'A busca de jogos ainda não está configurada. Você pode usar o cadastro manual.');
    let redis;
    try { redis = redisFactory(env); } catch { /* Redis é opcional. */ }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([env.IGDB_CLIENT_ID, kind, value])));
    const field = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const bucket = `${env.CACHE_NAMESPACE || 'gametrail:v1'}:igdb:v1`;
    try {
      if (redis) {
        try {
          const cached = await redis(['HGET', bucket, field]);
          if (cached) return JSON.parse(cached);
        } catch { /* Consultar diretamente se o cache falhar. */ }
      }
      let response;
      for (let attempt = 0; attempt < 2; attempt++) {
        const token = await accessToken(attempt === 1);
        response = await transport('https://api.igdb.com/v4/games', {
          method: 'POST',
          headers: { 'Client-ID': env.IGDB_CLIENT_ID, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
          body: `${FIELDS} ${kind === 'search' ? `search ${JSON.stringify(value)}; limit 12;` : `where id = ${value}; limit 1;`}`,
          signal: AbortSignal.timeout(8000)
        });
        if (response.status !== 401 || attempt === 1) break;
        await response.body?.cancel();
      }
      if (response.status === 429) throw new HttpError(429, 'O catálogo recebeu muitas buscas. Aguarde alguns segundos e tente novamente.');
      if (!response.ok) throw new HttpError(502, 'O catálogo está indisponível. Tente novamente ou use o cadastro manual.');
      const data = await limitedJson(response);
      if (!Array.isArray(data)) throw new HttpError(502, 'O catálogo retornou uma resposta inválida.');
      const games = data.map(normalizeGame).filter(Boolean);
      const serialized = JSON.stringify(games);
      if (redis && new TextEncoder().encode(serialized).byteLength <= 32 * 1024) {
        try { await redis(['EVAL', STORE, 1, bucket, field, serialized]); }
        catch { /* Não bloquear a busca quando Redis estiver indisponível. */ }
      }
      return games;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, 'Não foi possível consultar o catálogo. Tente novamente ou use o cadastro manual.');
    } finally { redis?.close(); }
  }
  return {
    async search(term) {
      const value = String(term ?? '').trim();
      if (value.length < 3 || value.length > 120 || /[\u0000-\u001f]/.test(value)) throw new HttpError(400, 'Pesquise um nome com 3 a 120 caracteres.');
      return query('search', value);
    },
    async getGame(id) {
      if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new HttpError(400, 'ID do catálogo inválido.');
      const games = await query('id', id);
      const game = games.find(item => item.igdb_id === id);
      if (!game) throw new HttpError(404, 'Jogo não encontrado no catálogo.');
      return game;
    }
  };
}
