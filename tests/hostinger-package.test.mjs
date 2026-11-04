import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { createHostingerPackage } from '../scripts/hostinger-package.mjs';

test('packages only the Hostinger app, excluding old ZIPs, Windows tools and local data', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hostinger-package-'));
  try {
    await mkdir(path.join(root, 'dist/assets'), { recursive: true });
    await mkdir(path.join(root, 'public'));
    await writeFile(path.join(root, 'dist/index.html'), '<script src="/assets/app.js"></script>');
    await writeFile(path.join(root, 'dist/assets/app.js'), 'console.log("app");');
    const php = ['api.php', 'config.php', 'config_db.example.txt', 'index.php', 'install.php', 'auth.php', 'auth-session.php', 'atualizar_app.php', 'atualizar_produtos.php', 'erp-sync.php', '.htaccess', 'schema_buscapreco.sql'];
    for (const name of php) await writeFile(path.join(root, 'public', name), 'fixture');
    await mkdir(path.join(root, 'public/erp-agent'));
    for (const name of ['integrador.mjs', 'runtime.mjs', 'configure-windows.mjs', 'config.example.json', 'LEIA-ME.txt']) {
      await writeFile(path.join(root, 'public/erp-agent', name), 'fixture');
    }
    for (const dir of ['dist', 'public']) {
      for (const name of ['old.zip', 'agent.ps1', 'install.bat', 'config_db.json', '.central_db.json']) {
        await writeFile(path.join(root, dir, name), 'must not ship');
      }
    }
    const zip = await JSZip.loadAsync(await createHostingerPackage(root), { checkCRC32: true });
    for (const name of ['index.html', 'assets/app.js', ...php]) assert.ok(zip.file(name), name);
    assert.ok(!Object.keys(zip.files).some((name) => /\.(zip|ps1|bat)$/i.test(name)));
    assert.deepEqual(Object.keys(zip.files).filter((name) => name.endsWith('.json')), ['erp-agent/config.example.json']);
    await rm(path.join(root, 'dist/index.html'));
    await assert.rejects(createHostingerPackage(root), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
