import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('restores timestamp and database configuration on each startup', { timeout: 20000 }, async () => {
  // The application uses port 3000; stop the development server before this test.
  const directory = await mkdtemp(path.join(tmpdir(), 'buscapreco-startup-'));
  const persisted = JSON.stringify({
    lastSyncTimestamp: '2025-01-02T03:04:05.000Z',
    erpConfig: { nome_loja: 'Loja de teste persistida', id_loja: 42, sincronizacao_automatica: false },
    mysqlConfig: { enabled: false, host: '127.0.0.1', database: 'persisted_test' },
  });
  const database = path.join(directory, '.central_db.json');
  await writeFile(database, persisted);
  try {
    for (let restart = 0; restart < 2; restart++) {
      const child = spawn(process.execPath, ['--import', path.join(root, 'node_modules/tsx/dist/loader.mjs'), path.join(root, 'server.ts')], {
        cwd: directory,
        env: { ...process.env, NODE_ENV: 'production', ERP_SYNC_TOKEN: 'test-only-token-000000000000000000000000' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      const exited = once(child, 'exit');
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
          const collect = (chunk) => {
            output += chunk;
            if (output.includes('Servidor rodando')) {
              clearTimeout(timeout);
              resolve();
            }
          };
          child.stdout.on('data', collect);
          child.stderr.on('data', collect);
          child.once('error', (error) => { clearTimeout(timeout); reject(error); });
          child.once('exit', () => { clearTimeout(timeout); reject(new Error(`Server exited: ${output}`)); });
        });
        assert.doesNotMatch(output, /Não foi possível carregar base persistida/);
        const statusResponse = await fetch('http://127.0.0.1:3000/api/status');
        assert.equal(statusResponse.status, 200);
        const status = await statusResponse.json();
        assert.equal(status.ultima_sincronizacao, '2025-01-02T03:04:05.000Z');
        assert.equal(status.nome_loja, 'Loja de teste persistida');
        assert.equal(status.loja_atual, 42);
        assert.equal((await fetch('http://127.0.0.1:3000/api/mysql/config')).status, 401);
        const auth = await fetch('http://127.0.0.1:3000/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: restart === 0 ? 'setup' : 'login', password: 'fixture-admin-password', setup_token: 'test-only-token-000000000000000000000000' }) });
        assert.equal(auth.status, 200);
        const cookie = auth.headers.getSetCookie()[0].split(';')[0];
        const mysqlResponse = await fetch('http://127.0.0.1:3000/api/mysql/config', { headers: { Cookie: cookie } });
        assert.equal(mysqlResponse.status, 200);
        const mysql = await mysqlResponse.json();
        assert.equal(mysql.database, 'persisted_test');
        assert.equal(mysql.enabled, false);
        const denied = await fetch('http://127.0.0.1:3000/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'login', password: '1234' }) });
        assert.equal(denied.status, 401);
      } finally {
        child.kill('SIGTERM');
        await exited;
      }
    }
    assert.equal(await readFile(database, 'utf8'), persisted);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
