import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = path.resolve(process.env.BUSCAPRECO_INSTALLER_WORK || '/workspace/.windows-installer');
await fs.mkdir(workspace, { recursive: true });
const env = { ...process.env, BUILDX_CONFIG: process.env.BUILDX_CONFIG || path.join(workspace, 'buildx') };
function run(command, args) {
  execFileSync(command, args, { cwd: root, env, stdio: 'inherit' });
}
const release = JSON.parse(await fs.readFile(path.join(root, 'installer/windows/node-release.json'), 'utf8'));
run('python3', [path.join(root, 'scripts/fetch-node-runtime.py'), path.join(root, 'installer/windows/node-release.json'), workspace]);
const app = path.join(workspace, 'app');
await fs.mkdir(app, { recursive: true });
for (const file of ['package.json', 'package-lock.json']) {
  await fs.copyFile(path.join(root, 'installer/windows/app-deps', file), path.join(app, file));
}
run('npm', ['ci', '--prefix', app, '--cache', path.join(workspace, 'npm-cache'), '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund']);
for (const file of ['integrador.mjs', 'runtime.mjs', 'configure-windows.mjs', 'config.example.json', 'LEIA-ME.txt']) {
  await fs.copyFile(path.join(root, 'public/erp-agent', file), path.join(app, file));
}
// Local configuration/logs/control tokens must never become installer payload.
for (const file of ['config.json', 'config.backup.json', 'config.new.json', '.agent-control.json', '.env', 'logs']) {
  await fs.rm(path.join(app, file), { recursive: true, force: true });
}
await fs.writeFile(path.join(app, 'build-information.json'), JSON.stringify({ application: 'Busca Preço Integrador VR', version: '1.0.0', node: release }, null, 2));
const build = ['build', '-t', 'buscapreco-nsis', path.join(root, 'installer/windows')];
for (const certificate of [process.env.CODEX_PROXY_CERT, '/etc/ssl/certs/ca-certificates.crt'].filter(Boolean)) {
  try { await fs.access(certificate); build.splice(1, 0, '--secret', `id=proxy_ca,src=${certificate}`); break; } catch {}
}
run('docker', build);
const uid = process.getuid?.() || 1000;
const gid = process.getgid?.() || 1000;
await fs.mkdir(path.join(workspace, 'service'), { recursive: true });
run('docker', ['run', '--rm', '--network', 'none', '--user', `${uid}:${gid}`,
  '--mount', `type=bind,src=${root},dst=/src,readonly`,
  '--mount', `type=bind,src=${path.join(workspace, 'service')},dst=/build`,
  'buscapreco-nsis', 'x86_64-w64-mingw32-gcc', '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror',
  '-municode', '-static-libgcc', '/src/installer/windows/service.c', '-o', '/build/BuscaPrecoIntegradorServico.exe', '-ladvapi32', '-lshell32']);
run('docker', ['run', '--rm', '--network', 'none', '--user', `${uid}:${gid}`,
  '--mount', `type=bind,src=${root},dst=/src,readonly`,
  '--mount', `type=bind,src=${workspace},dst=/payload,readonly`,
  '--mount', `type=bind,src=${path.join(root, 'public')},dst=/out`,
  'buscapreco-nsis', 'makensis', '-V3', '-DPAYLOAD=/payload', '-DOUTPUT=/out',
  '-DSERVICE=/payload/service/BuscaPrecoIntegradorServico.exe', '/src/installer/windows/setup.nsi']);
const filename = 'BuscaPrecoIntegrador-Setup.exe';
const binary = await fs.readFile(path.join(root, 'public', filename));
if (binary.subarray(0, 2).toString() !== 'MZ') throw new Error('Invalid Windows executable.');
const sha256 = createHash('sha256').update(binary).digest('hex');
await fs.writeFile(path.join(root, 'public', filename + '.sha256'), `${sha256}  ${filename}\n`);
console.log(`Windows installer: ${binary.length} bytes; SHA-256 ${sha256}`);
