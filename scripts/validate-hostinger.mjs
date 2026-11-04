import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { createHostingerPackage } from './hostinger-package.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'buscapreco-validation-'));
const suffix = `${process.pid}-${Date.now()}`;
const network = `buscapreco-test-${suffix}`;
const db = `${network}-mysql`, pg = `${network}-pg`, web = `${network}-web`;
const env = { ...process.env, BUILDX_CONFIG: process.env.BUILDX_CONFIG || path.join(temporary, 'buildx') };
function docker(args, input) {
  try { return execFileSync('docker', args, { env, input, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch (error) { throw new Error(`docker ${args[0]} failed: ${String(error.stderr || error.message).slice(-2000)}`); }
}
async function port() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const selected = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return selected;
}
async function ready(args) {
  for (let i = 0; i < 60; i++) {
    try { docker(args); return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Database did not become ready within 30 seconds.');
}
try {
  console.log('Preparing disposable PHP/Apache, MySQL and PostgreSQL services.');
  const build = ['build', '-q', '-t', 'buscapreco-php-test', path.join(root, 'tests/hostinger')];
  for (const certificate of [process.env.CODEX_PROXY_CERT, '/etc/ssl/certs/ca-certificates.crt'].filter(Boolean)) {
    try { await fs.access(certificate); build.splice(1, 0, '--secret', `id=proxy_ca,src=${certificate}`); break; } catch {}
  }
  docker(build);
  docker(['network', 'create', network]);
  const webPort = await port(), pgPort = await port();
  docker(['run', '-d', '--name', db, '--network', network, '-e', 'MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1', '-e', 'MARIADB_DATABASE=buscapreco', 'mariadb:11.4']);
  docker(['run', '-d', '--name', pg, '--network', network, '-p', `127.0.0.1:${pgPort}:5432`, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=vr', 'postgres:16-alpine']);
  // Image entrypoints briefly start socket-only temporary servers before creating
  // the application database. Require the final TCP server and the actual DB.
  await ready(['exec', db, 'mariadb', '-h127.0.0.1', '-uroot', 'buscapreco', '-e', 'SELECT 1']);
  await ready(['exec', pg, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'vr', '-c', 'SELECT 1']);
  docker(['exec', '-i', pg, 'psql', '-U', 'postgres', '-d', 'vr', '-v', 'ON_ERROR_STOP=1'], await fs.readFile(path.join(root, 'tests/fixtures/vr.sql')));
  docker(['run', '-d', '--name', web, '--network', network, '-p', `127.0.0.1:${webPort}:80`, 'buscapreco-php-test']);
  const site = path.join(temporary, 'site');
  await fs.mkdir(site);
  const archive = await JSZip.loadAsync(await createHostingerPackage(root));
  for (const [name, entry] of Object.entries(archive.files)) {
    const destination = path.join(site, name);
    if (entry.dir) { await fs.mkdir(destination, { recursive: true }); continue; }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, await entry.async('nodebuffer'), { mode: 0o644 });
  }
  await fs.writeFile(path.join(site, 'config_db.json'), JSON.stringify({ host: db, database: 'buscapreco', user: 'root', password: '',
    erp_sync_token: 'test-only-token-000000000000000000000000', erp_sync_loja: 1 }));
  docker(['cp', `${site}/.`, `${web}:/var/www/html/`]);
  docker(['exec', web, 'chown', '-R', 'www-data:www-data', '/var/www/html']);
  console.log('Running the production PHP/MySQL and read-only VR integration test.');
  execFileSync(process.execPath, ['--test', 'tests/vr-sync.integration.test.mjs'], { cwd: root,
    env: { ...process.env, BUSCAPRECO_TEST_URL: `http://127.0.0.1:${webPort}`, BUSCAPRECO_TEST_PG_PORT: String(pgPort) }, stdio: 'inherit' });
} finally {
  for (const name of [web, pg, db]) { try { docker(['rm', '-f', name]); } catch {} }
  try { docker(['network', 'rm', network]); } catch {}
  await fs.rm(temporary, { recursive: true, force: true });
}
