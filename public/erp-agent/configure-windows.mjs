import fs from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateConfig } from './integrador.mjs';

export function parseInstallerFields(text) {
  const values = text.replace(/^\uFEFF/, '').split('\r\n');
  if (values.at(-1) === '') values.pop();
  if (values.length !== 11 || values.some((value) => /[\r\n\0]/.test(value))) throw new Error('Dados inválidos.');
  const [url, token, store, interval, host, port, database, user, password, situation, ssl] = values;
  if (!situation.trim() || !['true', 'false'].includes(ssl)) throw new Error('Situação/TLS inválidos.');
  const config = { url: url.trim(), token, id_loja: Number(store), intervalo_minutos: Number(interval), situacao_ativa: Number(situation),
    postgres: { host, port: Number(port), database, user, password, ssl: ssl === 'true' ? { rejectUnauthorized: true } : false } };
  if (!Number.isInteger(config.postgres.port) || config.postgres.port < 1 || config.postgres.port > 65535) throw new Error('Porta inválida.');
  validateConfig(config);
  return config;
}

async function main() {
  const input = process.argv[2];
  try {
    const config = parseInstallerFields(await fs.readFile(input, 'utf16le'));
    const directory = process.argv[3] || fileURLToPath(new URL('.', import.meta.url));
    const destination = path.join(directory, 'config.json');
    // Replace only after parsing and validating all fields. Preserve a private
    // backup when the user explicitly chooses to reconfigure an installation.
    await fs.copyFile(destination, path.join(directory, 'config.backup.json')).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    const temporary = path.join(directory, 'config.new.json');
    await fs.writeFile(temporary, JSON.stringify(config, null, 2), { mode: 0o600 });
    await fs.rename(temporary, destination);
    console.log('Configuração salva. O serviço iniciará na próxima inicialização do Windows.');
  } finally {
    if (input) await fs.unlink(input).catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Não foi possível salvar. Confira URL HTTPS, token, loja, porta, usuário e senha do banco.'); process.exitCode = 1; });
}
