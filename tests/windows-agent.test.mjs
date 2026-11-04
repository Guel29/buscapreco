import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseInstallerFields } from '../public/erp-agent/configure-windows.mjs';
import { startControl, stopAgent, createLogger } from '../public/erp-agent/runtime.mjs';
import { dataDirectory } from '../public/erp-agent/runtime.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('service data paths are independent of the interactive user profile and program folder', () => {
  const directory = path.resolve(os.tmpdir(), 'service-private-data');
  assert.equal(dataDirectory('file:///program/integrador.mjs', ['--background', '--data-dir', directory]), directory);
  assert.throws(() => dataDirectory('file:///program/integrador.mjs', ['--data-dir']), /inválido/);
});

test('Windows installer preserves Unicode, quotes and backslashes without interpreting commands', () => {
  const password = 'Sênha "complexa" \\ $ & ;';
  const fields = ['https://loja.example/', 'a'.repeat(64), '1', '10', '127.0.0.1', '5432', 'vr', 'leitura', password, '3', 'true'];
  const config = parseInstallerFields('\uFEFF' + fields.join('\r\n') + '\r\n');
  assert.equal(config.postgres.password, password);
  assert.deepEqual(config.postgres.ssl, { rejectUnauthorized: true });
  assert.equal(config.postgres.port, 5432);
  fields[5] = '70000';
  assert.throws(() => parseInstallerFields(fields.join('\r\n')), /Porta/);
  fields[5] = '5432'; fields[0] = 'http://loja.example/';
  assert.throws(() => parseInstallerFields(fields.join('\r\n')), /HTTPS/);
});

test('only one instance starts; authenticated local IPC stops it without arbitrary PID killing', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buscapreco-runtime-'));
  let stopped = false;
  let close;
  try {
    assert.equal(await stopAgent(directory), false);
    close = await startControl(directory, () => { stopped = true; });
    assert.equal(typeof close, 'function');
    assert.equal(await startControl(directory, () => assert.fail('duplicate instance started')), null);
    assert.equal(await stopAgent(directory), true);
    assert.equal(stopped, true);
    await close(); close = null;
    assert.equal(await stopAgent(directory), false);
  } finally {
    if (close) await close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('background logging rotates bounded logs and stores no connection credentials', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buscapreco-logs-'));
  try {
    const log = await createLogger(directory, true);
    await fs.writeFile(path.join(directory, 'logs/integrador.log'), 'x'.repeat(2 * 1024 * 1024 + 1));
    await log('10 produtos confirmados.', { state: 'success', total: 10 });
    assert.ok((await fs.stat(path.join(directory, 'logs/integrador.log.1'))).size > 2 * 1024 * 1024);
    assert.ok((await fs.stat(path.join(directory, 'logs/integrador.log'))).size < 1024);
    assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'logs/status.json'), 'utf8')).total, 10);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('installer configuration is validated before replacing an existing private config', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buscapreco-config-'));
  try {
    const previous = '{"private":"previous-configuration"}';
    await fs.writeFile(path.join(directory, 'config.json'), previous);
    const values = ['https://loja.example/', 'a'.repeat(64), '1', '10', '127.0.0.1', '5432', 'vr', 'leitura', 'senha "especial" \\ &', '3', 'false'];
    const input = path.join(directory, 'input.tmp');
    await fs.writeFile(input, '\uFEFF' + values.join('\r\n') + '\r\n', 'utf16le');
    const helper = fileURLToPath(new URL('../public/erp-agent/configure-windows.mjs', import.meta.url));
    const output = execFileSync(process.execPath, [helper, input, directory], { encoding: 'utf8' });
    assert.equal(output.includes(values[8]), false);
    assert.equal(await fs.readFile(path.join(directory, 'config.backup.json'), 'utf8'), previous);
    assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'config.json'), 'utf8')).postgres.password, values[8]);
    await assert.rejects(fs.access(input), { code: 'ENOENT' });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
