import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function dataDirectory(scriptUrl, args = process.argv.slice(2)) {
  const index = args.indexOf('--data-dir');
  if (index < 0) return fileURLToPath(new URL('.', scriptUrl));
  const value = args[index + 1];
  if (!value || value.startsWith('--') || !path.isAbsolute(value)) throw new Error('Diretório de dados inválido.');
  return path.resolve(value);
}

export function controlAddress(directory) {
  const id = createHash('sha256').update(path.resolve(directory).toLowerCase()).digest('hex').slice(0, 24);
  return process.platform === 'win32' ? `\\\\.\\pipe\\BuscaPrecoIntegrador-${id}` : path.join(os.tmpdir(), `buscapreco-${id}.sock`);
}

export async function startControl(directory, onStop) {
  const address = controlAddress(directory);
  const filename = path.join(directory, '.agent-control.json');
  const token = randomBytes(32).toString('hex');
  const server = net.createServer((client) => {
    client.setTimeout(3000, () => client.destroy());
    let data = '';
    client.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1024) { client.destroy(); return; }
      if (!data.includes('\n')) return;
      try {
        const message = JSON.parse(data.trim());
        if (message.command !== 'stop' || typeof message.token !== 'string' || message.token.length !== token.length ||
            !timingSafeEqual(Buffer.from(message.token), Buffer.from(token))) { client.destroy(); return; }
        Promise.resolve(onStop()).then(() => client.end('stopping\n')).catch(() => client.destroy());
      } catch { client.destroy(); }
    });
    client.on('error', () => {});
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(address, resolve); });
  } catch (error) {
    if (error.code === 'EADDRINUSE') return null;
    throw error;
  }
  try {
    await fs.writeFile(filename, JSON.stringify({ token }), { mode: 0o600 });
  } catch (error) {
    await new Promise((resolve) => server.close(resolve));
    throw error;
  }
  return async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.unlink(filename).catch(() => {});
  };
}

export async function stopAgent(directory) {
  let token;
  try { ({ token } = JSON.parse(await fs.readFile(path.join(directory, '.agent-control.json'), 'utf8'))); }
  catch { return false; }
  return new Promise((resolve, reject) => {
    const client = net.createConnection(controlAddress(directory));
    let reply = '';
    client.setTimeout(5000, () => { client.destroy(); reject(new Error('Não foi possível parar o integrador.')); });
    client.on('connect', () => client.write(JSON.stringify({ command: 'stop', token }) + '\n'));
    client.on('data', (chunk) => { reply += chunk; });
    client.on('end', () => resolve(reply.includes('stopping')));
    client.on('error', (error) => {
      if (['ECONNREFUSED', 'ENOENT'].includes(error.code)) resolve(false);
      else reject(error);
    });
  });
}

export async function createLogger(directory, background) {
  const folder = path.join(directory, 'logs');
  await fs.mkdir(folder, { recursive: true });
  const logfile = path.join(folder, 'integrador.log');
  return async (message, state) => {
    try {
      if ((await fs.stat(logfile)).size > 2 * 1024 * 1024) {
        await fs.unlink(logfile + '.1').catch(() => {});
        await fs.rename(logfile, logfile + '.1');
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const timestamp = new Date().toISOString();
    await fs.appendFile(logfile, `${timestamp} — ${message}\n`, { mode: 0o600 });
    if (state) await fs.writeFile(path.join(folder, 'status.json'), JSON.stringify({ timestamp, ...state }, null, 2), { mode: 0o600 });
    if (!background) console.log(`${timestamp} — ${message}`);
  };
}
