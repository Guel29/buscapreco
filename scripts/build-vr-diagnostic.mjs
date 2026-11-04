import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
// The compiler image is prepared by npm run build:windows. Compilation needs
// no network, Windows credentials, or connection to a customer's ERP.
execFileSync('docker', ['run', '--rm', '--network', 'none', '--user', `${process.getuid?.() || 1000}:${process.getgid?.() || 1000}`,
  '--mount', `type=bind,src=${root},dst=/src,readonly`,
  '--mount', `type=bind,src=${path.join(root, 'public')},dst=/out`,
  'buscapreco-nsis', 'makensis', '-V3', '-DSOURCE=/src', '-DOUTPUT=/out', '/src/installer/windows/diagnostic.nsi'], { stdio: 'inherit' });
const filename = path.join(root, 'public/DiagnosticoVR.exe');
const bytes = await fs.readFile(filename);
await fs.writeFile(filename + '.sha256', `${createHash('sha256').update(bytes).digest('hex')}  DiagnosticoVR.exe\n`);
