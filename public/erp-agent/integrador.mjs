import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { startControl, stopAgent, createLogger, dataDirectory } from './runtime.mjs';

export const VR_QUERY = `SELECT pr.id_produto::text AS codigo_interno,
  pr.codigobarras::text AS codigo_barras, p.descricaocompleta AS descricao,
  pc.precovenda AS preco, COALESCE(te.descricao, 'UN') AS embalagem
FROM produtoautomacao pr
JOIN produto p ON p.id = pr.id_produto
JOIN produtocomplemento pc ON pc.id_produto = pr.id_produto
LEFT JOIN tipoembalagem te ON te.id = p.id_tipoembalagem
WHERE pc.id_situacaocadastro = $1 AND pc.id_loja = $2
ORDER BY pr.id_produto, pr.codigobarras`;

export function validateConfig(config) {
  const url = new URL(config.url);
  if (url.protocol !== 'https:') throw new Error('O destino da Hostinger deve usar HTTPS.');
  if (url.username || url.password || url.search || url.hash) throw new Error('URL de destino inválida.');
  if (!config.token || config.token.length < 32) throw new Error('Configure um token com pelo menos 32 caracteres.');
  if (!Number.isInteger(config.id_loja) || config.id_loja < 1) throw new Error('Loja inválida.');
  if (!Number.isInteger(config.situacao_ativa)) throw new Error('Informe a situação de cadastro ativa do VR.');
  if (!config.postgres?.host || !config.postgres?.database || !config.postgres?.user || !config.postgres?.password) {
    throw new Error('Preencha a conexão PostgreSQL com um usuário de leitura.');
  }
  if (!Number.isFinite(config.intervalo_minutos) || config.intervalo_minutos < 1) throw new Error('Intervalo inválido.');
}

export function normalizeProducts(rows) {
  const keys = new Set();
  return rows.map((row) => {
    const item = {
      codigo_interno: String(row.codigo_interno ?? '').trim(),
      codigo_barras: String(row.codigo_barras ?? '').trim(),
      descricao: String(row.descricao ?? '').trim(),
      preco: Number(row.preco), embalagem: String(row.embalagem || 'UN').trim(),
    };
    const key = item.codigo_barras;
    if (!item.codigo_interno || !item.codigo_barras || !item.descricao ||
        !Number.isFinite(item.preco) || item.preco < 0 || keys.has(key)) {
      throw new Error('O ERP retornou produto inválido ou duplicado; a carga não foi enviada.');
    }
    keys.add(key);
    return item;
  });
}

export async function readProducts(config, Client) {
  const client = new Client({ ...config.postgres, connectionTimeoutMillis: 10000,
    statement_timeout: 120000, application_name: 'buscapreco_integrador' });
  try {
    await client.connect();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await client.query(VR_QUERY, [config.situacao_ativa, config.id_loja]);
    const products = normalizeProducts(result.rows);
    await client.query('COMMIT');
    return products;
  } finally {
    await client.end();
  }
}

export async function sendSnapshot(config, products, request = fetch) {
  // An empty source can mean a bad store/status setting. Never deactivate the
  // entire cloud catalog automatically on an empty extraction.
  if (!products.length) throw new Error('ERP sem produtos ativos para esta loja; catálogo da nuvem preservado.');
  const syncId = randomUUID();
  const endpoint = new URL('erp-sync.php', config.url.endsWith('/') ? config.url : config.url + '/');
  async function send(payload) {
    const response = await request(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ERP-Token': config.token },
      body: JSON.stringify({ ...payload, sync_id: syncId, id_loja: config.id_loja, total: products.length }),
      signal: AbortSignal.timeout(120000), redirect: 'error',
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) {
      const error = new Error(`Carga recusada pela nuvem (HTTP ${response.status}).`);
      error.code = `HTTP_${response.status}`;
      throw error;
    }
    return result;
  }
  for (let offset = 0; offset < products.length; offset += 500) {
    await send({ operation: 'batch', items: products.slice(offset, offset + 500) });
  }
  const result = await send({ operation: 'commit' });
  if (result.total_processados !== products.length) throw new Error('A nuvem não confirmou todos os produtos.');
  return result;
}

async function main() {
  const directory = dataDirectory(import.meta.url);
  if (process.argv.includes('--stop')) { await stopAgent(directory); return; }
  const log = await createLogger(directory, process.argv.includes('--background'));
  const close = await startControl(directory, async () => {
    await log('Integrador encerrado a pedido do usuário.', { state: 'stopped' });
    setTimeout(() => process.exit(0), 100);
  });
  if (!close) return; // Another instance of this installation is already running.
  try {
    const config = JSON.parse(await fs.readFile(path.join(directory, 'config.json'), 'utf8'));
    validateConfig(config);
    const { default: pg } = await import('pg');
    await log('Integrador iniciado; aguardando confirmação da primeira carga.', { state: 'starting' });
    do {
      let success = false;
      try {
        const products = await readProducts(config, pg.Client);
        const result = await sendSnapshot(config, products);
        success = true;
        await log(`${result.total_processados} produtos confirmados na nuvem.`, { state: 'success', total: result.total_processados });
      } catch (error) {
        const code = /^[A-Z0-9_]{1,32}$/.test(error.code || '') ? error.code : 'CONFIGURACAO_OU_CONEXAO';
        await log(`Sincronização não concluída (${code}).`, { state: 'error', code });
        if (process.argv.includes('--once')) process.exitCode = 1;
      }
      if (process.argv.includes('--once')) break;
      // Windows may log in before the network is ready. Retry failures after a
      // minute, without overlapping queries or multiple instances.
      await new Promise((resolve) => setTimeout(resolve, (success ? config.intervalo_minutos : 1) * 60000));
    } while (true);
  } catch {
    await log('Configuração inválida ou dependência ausente. Confira o config.json.', { state: 'configuration-error' });
    process.exitCode = 1;
  } finally {
    await close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Não foi possível iniciar. Verifique o config.json e instale a dependência pg.'); process.exitCode = 1; });
}
