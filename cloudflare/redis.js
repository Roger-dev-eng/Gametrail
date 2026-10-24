import { createClient } from '@redis/client';

// Um cliente por requisição: sockets não são compartilhados entre invocações do Worker.
export function createRedis(env, factory = createClient) {
  if (!env.REDIS_HOST && !env.REDIS_PASSWORD) return null;
  const port = Number(env.REDIS_PORT);
  if (!env.REDIS_HOST || /[\s/:@]/.test(env.REDIS_HOST) || !env.REDIS_PASSWORD || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Configuração Redis inválida');
  if (!['true', 'false'].includes(env.REDIS_TLS ?? 'false')) throw new Error('Configuração TLS inválida');
  const tls = env.REDIS_TLS === 'true';
  if (env.REDIS_CA_CERT && !tls) throw new Error('Certificado requer TLS');
  let client;
  let failed = false;
  const command = async args => {
    if (failed) throw new Error('Redis indisponível');
    try {
      if (!client) {
        client = factory({
          RESP: 2,
          username: env.REDIS_USERNAME || 'default',
          password: env.REDIS_PASSWORD,
          socket: {
            host: env.REDIS_HOST, port, tls,
            ...(tls ? { servername: env.REDIS_HOST, rejectUnauthorized: true, ...(env.REDIS_CA_CERT ? { ca: env.REDIS_CA_CERT } : {}) } : {}),
            connectTimeout: 1500,
            reconnectStrategy: false
          },
          commandOptions: { timeout: 1500 },
          disableOfflineQueue: true,
          disableClientInfo: true,
          maintNotifications: 'disabled'
        });
        // O tratamento por comando já aplica fallback; nunca registrar mensagens com credenciais.
        client.on('error', () => {});
        await client.connect();
      }
      return await client.sendCommand(args.map(String));
    } catch {
      failed = true;
      if (client?.isOpen) client.destroy();
      throw new Error('Redis indisponível');
    }
  };
  command.close = () => { if (client?.isOpen) client.destroy(); };
  return command;
}
