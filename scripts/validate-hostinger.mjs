import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { createHostingerPackage } from './hostinger-package.mjs';
import assert from 'node:assert/strict';

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
  const configFixture = path.join(temporary, 'config-fixture');
  await fs.mkdir(configFixture);
  await fs.copyFile(path.join(root, 'public/config.php'), path.join(configFixture, 'config.php'));
  const inspect = "$_SERVER['REQUEST_METHOD']='GET'; require '/fixture/config.php'; echo json_encode(['state'=>$configReadStatus,'ready'=>strlen(erpSyncToken())>=32,'source'=>erpSyncTokenSource(),'error'=>adminSetupError(),'database'=>$activeConfig['database']]);";
  for (const [state, body, ready] of [
    ['missing', null, false], ['invalid', '{broken-json', false], ['valid', '{}', false],
    ['valid', '\uFEFF' + JSON.stringify({ database: 'fixture_db', erp_sync_token: 'x'.repeat(64) }), true],
  ]) {
    const cfg = path.join(configFixture, 'config_db.json');
    if (body === null) await fs.rm(cfg, { force: true }); else await fs.writeFile(cfg, body);
    const result = JSON.parse(docker(['run', '--rm', '--network', 'none', '--mount', `type=bind,src=${configFixture},dst=/fixture,readonly`,
      'buscapreco-php-test', 'php', '-r', inspect]));
    assert.equal(result.state, state);
    assert.equal(result.ready, ready);
    assert.equal(Boolean(result.error), !ready);
    if (ready) assert.equal(result.database, 'fixture_db');
  }
  for (const [value, ready] of [['fixture-environment-token-' + 'y'.repeat(40), true], ['0', false]]) {
    const result = JSON.parse(docker(['run', '--rm', '--network', 'none', '-e', `ERP_SYNC_TOKEN=${value}`,
      '--mount', `type=bind,src=${configFixture},dst=/fixture,readonly`, 'buscapreco-php-test', 'php', '-r', inspect]));
    assert.equal(result.source, 'ERP_SYNC_TOKEN');
    assert.equal(result.ready, ready);
    if (!ready) assert.match(result.error, /variável ERP_SYNC_TOKEN/);
  }
  await fs.copyFile(path.join(root, 'public/verificar-configuracao.php'), path.join(configFixture, 'verificar-configuracao.php'));
  const safePage = docker(['run', '--rm', '--network', 'none', '--mount', `type=bind,src=${configFixture},dst=/fixture,readonly`,
    'buscapreco-php-test', 'php', '/fixture/verificar-configuracao.php']);
  assert.ok(!safePage.includes('x'.repeat(64)), 'Diagnostic must never render the configured token.');
  console.log('Verified missing/invalid config, absent token and UTF-8 BOM handling without exposing secret values.');
  docker(['network', 'create', network]);
  const webPort = await port(), pgPort = await port();
  docker(['run', '-d', '--name', db, '--network', network, '-e', 'MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1', '-e', 'MARIADB_DATABASE=buscapreco', 'mariadb:11.4']);
  docker(['run', '-d', '--name', pg, '--network', network, '-p', `127.0.0.1:${pgPort}:5432`, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=vr', 'postgres:16-alpine']);
  // Image entrypoints briefly start socket-only temporary servers before creating
  // the application database. Require the final TCP server and the actual DB.
  await ready(['exec', db, 'mariadb', '-h127.0.0.1', '-uroot', 'buscapreco', '-e', 'SELECT 1']);
  await ready(['exec', pg, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'vr', '-c', 'SELECT 1']);
  docker(['exec', '-i', pg, 'psql', '-U', 'postgres', '-d', 'vr', '-v', 'ON_ERROR_STOP=1'], await fs.readFile(path.join(root, 'tests/fixtures/vr.sql')));
  // Reproduce existing Hostinger staging tables with different collations.
  const receiver = await fs.readFile(path.join(root, 'public/erp-sync.php'), 'utf8');
  const staging = [...receiver.matchAll(/\$pdo->exec\("(CREATE TABLE IF NOT EXISTS erp_[\s\S]*?)"\);/g)].map((match) => match[1]);
  assert.equal(staging.length, 2);
  staging[1] = staging[1].replace(/COLLATE=utf8mb4_unicode_ci/g, 'COLLATE=utf8mb4_uca1400_ai_ci');
  docker(['exec', '-i', db, 'mariadb', '-uroot', 'buscapreco'], staging.join(';') + ';');
  let mismatchReproduced = false;
  try { docker(['exec', db, 'mariadb', '-uroot', 'buscapreco', '-e', 'SELECT c.sync_id FROM erp_cargas c JOIN erp_carga_itens i ON c.sync_id=i.sync_id']); }
  catch (error) { mismatchReproduced = /1267|Illegal mix of collations/.test(error.message); }
  assert.equal(mismatchReproduced, true, 'Fixture must reproduce the Hostinger collation error.');
  console.log('Reproduced mixed-collation error; checking receiver compatibility without schema migration.');
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
  await fs.writeFile(path.join(site, 'config_db.json'), '\uFEFF' + JSON.stringify({ host: db, database: 'buscapreco', user: 'root', password: '',
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
