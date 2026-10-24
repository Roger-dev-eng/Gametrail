import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { createRedis } from './redis.js';

const env = { REDIS_HOST: 'cache.example.com', REDIS_PORT: '12345', REDIS_PASSWORD: 'test-only' };

test('Redis Cloud configura autenticação, TLS opcional e encerramento do socket', async () => {
  for (const tls of [false, true]) {
    let options;
    let destroyed = 0;
    let connected = 0;
    const redis = createRedis({ ...env, REDIS_TLS: String(tls), ...(tls ? { REDIS_CA_CERT: 'certificado-de-teste' } : {}) }, config => {
      options = config;
      return {
        isOpen: false,
        on(event, handler) { assert.equal(event, 'error'); assert.equal(typeof handler, 'function'); },
        async connect() { this.isOpen = true; connected++; },
        async sendCommand(args) { assert.deepEqual(args, ['EVAL', 'script', '1', 'key']); return 'OK'; },
        destroy() { this.isOpen = false; destroyed++; }
      };
    });
    assert.equal(connected, 0);
    assert.equal(await redis(['EVAL', 'script', 1, 'key']), 'OK');
    assert.equal(options.username, 'default');
    assert.equal(options.password, 'test-only');
    assert.equal(options.socket.tls, tls);
    assert.equal(options.socket.reconnectStrategy, false);
    assert.equal(options.disableOfflineQueue, true);
    assert.equal(options.commandOptions.timeout, 1500);
    if (tls) {
      assert.equal(options.socket.rejectUnauthorized, true);
      assert.equal(options.socket.ca, 'certificado-de-teste');
    }
    redis.close();
    assert.equal(destroyed, 1);
  }
});

test('configuração inválida não envia credenciais nem faz conexão', () => {
  assert.equal(createRedis({}), null);
  for (const values of [{ REDIS_PORT: '0' }, { REDIS_HOST: 'https://host' }, { REDIS_PASSWORD: '' }, { REDIS_TLS: 'yes' }, { REDIS_TLS: 'false', REDIS_CA_CERT: 'ca' }]) {
    assert.throws(() => createRedis({ ...env, ...values }), /Configuração|Certificado/);
  }
});

test('erro fecha conexão e não tenta reconectar na mesma requisição', async () => {
  let attempts = 0;
  let destroyed = false;
  const redis = createRedis(env, () => ({
    isOpen: true, on() {},
    async connect() { attempts++; },
    async sendCommand() { throw new Error('Erro contendo senha confidencial'); },
    destroy() { this.isOpen = false; destroyed = true; }
  }));
  await assert.rejects(redis(['PING']), { message: 'Redis indisponível' });
  await assert.rejects(redis(['PING']), { message: 'Redis indisponível' });
  assert.equal(attempts, 1);
  assert.equal(destroyed, true);
  redis.close();
});

test('cliente oficial autentica e executa comandos pelo protocolo TCP Redis', async () => {
  const commands = [];
  const sockets = new Set();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let buffer = Buffer.alloc(0);
    socket.on('data', data => {
      buffer = Buffer.concat([buffer, data]);
      while (buffer.length) {
        const lineEnd = buffer.indexOf('\r\n');
        if (lineEnd < 0) return;
        const count = Number(buffer.subarray(1, lineEnd).toString());
        let offset = lineEnd + 2;
        const args = [];
        for (let i = 0; i < count; i++) {
          const end = buffer.indexOf('\r\n', offset);
          if (end < 0) return;
          const size = Number(buffer.subarray(offset + 1, end).toString());
          if (buffer.length < end + 2 + size + 2) return;
          args.push(buffer.subarray(end + 2, end + 2 + size).toString());
          offset = end + 2 + size + 2;
        }
        buffer = buffer.subarray(offset);
        commands.push(args);
        socket.write(args[0] === 'PING' ? '+PONG\r\n' : '+OK\r\n');
      }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const redis = createRedis({ ...env, REDIS_HOST: '127.0.0.1', REDIS_PORT: String(server.address().port), REDIS_USERNAME: 'default', REDIS_TLS: 'false' });
  try {
    assert.equal(await redis(['PING']), 'PONG');
    assert.ok(commands.some(args => args[0] === 'AUTH' && args[1] === 'default' && args[2] === 'test-only'));
  } finally {
    redis.close();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});
