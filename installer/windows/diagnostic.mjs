import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export function missingColumn(error, query) {
  if (error.code !== '42703') return null;
  const position = Number(error.position) - 1;
  for (const match of query.matchAll(/\b(?:pr|pc|p|te)\.[a-z_][a-z0-9_]*/gi)) {
    if (Number.isInteger(position) && position >= match.index && position < match.index + match[0].length) return match[0];
  }
  // Only emit identifiers actually present in our fixed query, never raw
  // database error messages (which can include connection information).
  for (const match of String(error.message || '').matchAll(/\b(?:pr|pc|p|te)\.[a-z_][a-z0-9_]*/gi)) {
    if (query.includes(match[0])) return match[0];
  }
  return null;
}

export async function collectDiagnostic(config, Client, readProducts, query) {
  const lines = ['DIAGNÓSTICO VR — SOMENTE LEITURA', new Date().toISOString(),
    'Este relatório contém nomes de tabelas/colunas e códigos de erro; não inclui credenciais nem produtos.', ''];
  try {
    const products = await readProducts(config, Client);
    lines.push(`Consulta instalada: OK (${products.length} produtos lidos; nenhuma carga enviada).`);
  } catch (error) {
    const code = /^[A-Z0-9_]{1,32}$/.test(error.code || '') ? error.code : 'FALHA_NA_CONSULTA';
    lines.push(`Consulta instalada: ERRO ${code}`);
    const column = missingColumn(error, query);
    if (column) lines.push(`COLUNA AUSENTE: ${column}`);
    if (code === '42703' && !column) lines.push('COLUNA AUSENTE: veja a estrutura abaixo para conferir a consulta.');
  }
  const client = new Client({ ...config.postgres, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const { rows } = await client.query(`SELECT table_schema, table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema::text = ANY(current_schemas(false)::text[])
      AND table_name::text = ANY($1::text[])
      ORDER BY table_schema, table_name, ordinal_position`, [['produto', 'produtoautomacao', 'produtocomplemento', 'tipoembalagem']]);
    await client.query('COMMIT');
    lines.push('', 'ESTRUTURA DAS TABELAS:');
    for (const row of rows) lines.push(`${row.table_schema}.${row.table_name}.${row.column_name} — ${row.data_type}`);
    if (!rows.length) lines.push('Nenhuma coluna visível ao usuário de leitura nas tabelas esperadas.');
  } catch (error) {
    const code = /^[A-Z0-9_]{1,32}$/.test(error.code || '') ? error.code : 'FALHA_NA_ESTRUTURA';
    lines.push(`Leitura da estrutura não concluída (${code}).`);
  } finally { await client.end().catch(() => {}); }
  return lines.join('\r\n') + '\r\n';
}

async function main() {
  const app = process.argv[2], directory = process.argv[3];
  if (!app || !directory || !path.isAbsolute(app) || !path.isAbsolute(directory)) throw new Error('Instalação inválida.');
  const folder = path.join(directory, 'logs');
  await fs.mkdir(folder, { recursive: true });
  let report;
  try {
    const config = JSON.parse(await fs.readFile(path.join(directory, 'config.json'), 'utf8'));
    const require = createRequire(path.join(app, 'package.json'));
    const pg = require('pg');
    const agent = await import(pathToFileURL(path.join(app, 'integrador.mjs')).href);
    report = await collectDiagnostic(config, pg.Client, agent.readProducts, agent.VR_QUERY);
  } catch {
    report = 'Não foi possível ler a configuração/instalação do integrador. Verifique se este computador tem o instalador completo.\r\n';
  }
  await fs.writeFile(path.join(folder, 'diagnostico-vr.txt'), report, { mode: 0o600 });
  console.log('Relatório criado em logs/diagnostico-vr.txt.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Não foi possível criar o diagnóstico. Execute como administrador.'); process.exitCode = 1; });
}
