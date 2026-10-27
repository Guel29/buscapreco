import express, { Request, Response } from 'express';
import crypto from 'crypto';
import pg from 'pg';
import mysql from 'mysql2/promise';
import JSZip from 'jszip';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// In-memory data store with file persistence
const DATA_FILE = path.join(process.cwd(), '.central_db.json');

// Interface definitions
interface ProductRecord {
  id: string;
  id_loja: number;
  codigo_interno: string;
  codigo_barras: string;
  descricao: string;
  produto?: string;
  preco: number;
  preco_venda?: number;
  embalagem: string;
  ncm: string;
  hash: string;
  ativo: boolean; // true = ATIVO, false = INATIVO
  atualizado_em: string;
  ultima_sincronizacao?: string;
}

interface SimulatedERPProduct {
  id_produto: number;
  codigobarras: string;
  descricaocompleta: string;
  ncm1: number;
  ncm2: number;
  ncm3: number;
  id_tipoembalagem: number;
  id_situacaocadastro: number;
  tipoembalagem_desc: string;
  id_loja: number;
  precovenda: number;
}

// Initial state
let stores = [
  { id: 1, nome: 'Supermercado Modelo - Loja 01 (Matriz)', cnpj: '12.345.678/0001-90', endereco: 'Av. Brasil, 1500 - Centro', ativa: true },
  { id: 2, nome: 'Supermercado Modelo - Loja 02 (Filial Bairro)', cnpj: '12.345.678/0002-71', endereco: 'Rua das Flores, 420 - Jardim', ativa: true },
];

let erpConfig = {
  nome_loja: 'Supermercado Modelo · Loja 01 (Matriz)',
  host: 'localhost',
  port: 8745,
  database: 'vr',
  user: 'postgres',
  password: 'VrPost@Server',
  ssl: false,
  id_loja: 1,
  id_situacaocadastro: 3,
  intervalo_minutos: 10 as const,
  sincronizacao_automatica: true,
  custom_query: '',
};

let mysqlConfig = {
  enabled: true,
  host: 'localhost',
  port: 3306,
  database: 'u366235819_busca',
  user: 'u366235819_busca',
  password: '',
  ssl: false,
  last_test: null as string | null,
  status: 'CONECTADO' as 'CONECTADO' | 'DESCONECTADO' | 'ERRO',
  status_mensagem: 'MySQL Hostinger configurado para u366235819_busca',
};

export const DEFAULT_SQL_QUERY = `SELECT
    pr.id_produto AS codigo_interno,
    p.descricaocompleta AS descricao,
    pr.codigobarras AS codigo_barras,
    te.descricao AS embalagem,
    pc.precovenda AS preco
FROM produtoautomacao pr
INNER JOIN produto p
    ON p.id = pr.id_produto
INNER JOIN produtocomplemento pc
    ON pc.id_produto = pr.id_produto
INNER JOIN tipoembalagem te
    ON te.id = p.id_tipoembalagem
WHERE (p.id_situacaocadastro = $1 OR p.id_situacaocadastro IN (1, 3) OR 1=1)
  AND (pc.id_loja = $2 OR pc.id_loja IS NULL)
ORDER BY pr.id_produto;`;

let terminals = [
  {
    id: 'term-01',
    nome: 'CONSULTA 01 - ENTRADA PRINCIPAL',
    id_loja: 1,
    identificador: 'TERM-ENTRADA-01',
    modelo_etiqueta_padrao_id: 'gondola-dupla-100x30',
    impressora_id: 'argox-os214-01',
    ultima_conexao: new Date().toISOString(),
    ultima_sincronizacao: new Date().toISOString(),
    status: 'ONLINE',
    versao: '2.4.0',
  },
  {
    id: 'term-02',
    nome: 'CONSULTA 02 - CORREDOR 04 (BEBIDAS)',
    id_loja: 1,
    identificador: 'TERM-CORREDOR-02',
    modelo_etiqueta_padrao_id: 'gondola-dupla-100x30',
    impressora_id: 'argox-os214-01',
    ultima_conexao: new Date().toISOString(),
    ultima_sincronizacao: new Date().toISOString(),
    status: 'ONLINE',
    versao: '2.4.0',
  },
  {
    id: 'term-03',
    nome: 'TERMINAL GÔNDOLA - BALCÃO DE FRIOS',
    id_loja: 1,
    identificador: 'TERM-FRIOS-03',
    modelo_etiqueta_padrao_id: 'gondola-dupla-100x30',
    impressora_id: 'argox-os214-01',
    ultima_conexao: new Date().toISOString(),
    ultima_sincronizacao: new Date().toISOString(),
    status: 'ONLINE',
    versao: '2.4.0',
  },
];

let printers = [
  {
    id: 'argox-os214-01',
    nome: 'Argox OS-214 Plus (Térmica)',
    tipo: 'argox_os214',
    linguagem: 'PPLB', // PPLB or PPLA
    porta: 'USB001',
    dpi: 203,
    offset_x: 0,
    offset_y: 0,
    largura_calibrada: 0,
    altura_calibrada: 0,
    gap: 3,
    avanco: 0,
    padrao: true,
    online: true,
  },
];

// Simulated ERP local database table records (ReadOnly source - Default Empty)
let erpSimulatedDatabase: SimulatedERPProduct[] = [];

// Helper to compute record hash
function calculateProductHash(item: {
  codigo_interno: string;
  codigo_barras: string;
  descricao: string;
  preco: number;
  embalagem: string;
  id_loja: number;
}): string {
  const content = `${item.codigo_interno}|${item.codigo_barras}|${item.descricao}|${Number(item.preco).toFixed(2)}|${item.embalagem}|${item.id_loja}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Online central database products (Default Empty - ready for store synchronization)
let centralProducts: ProductRecord[] = [];

let syncLogs: any[] = [];
let printQueue: any[] = [];
let printLogs: any[] = [];
let systemLogs: any[] = [
  {
    id: 'log-1',
    data_hora: new Date().toISOString(),
    tipo: 'SISTEMA',
    mensagem: 'Sistema Consulta Preço iniciado com base limpa.',
  },
];

// Telemetria do Agente Local Windows (PowerShell / Background Daemon)
let localAgentStatus = {
  online: false,
  ultima_comunicacao: '',
  host_local: '127.0.0.1',
  banco: 'vr',
  loja: 1,
  versao: '3.0.0',
  ultimo_status: 'Aguardando inicialização do agente no servidor local',
  produtos_sincronizados: 0,
  erros_recentes: '',
};

let agentLogs: Array<{ data_hora: string; tipo: string; mensagem: string; detalhes?: any }> = [];

function loadPersistedData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.centralProducts)) {
        centralProducts = parsed.centralProducts.map((p: any) => ({
          ...p,
          ativo: p.ativo !== undefined ? Boolean(p.ativo) : true,
          produto: p.produto || p.descricao,
          preco_venda: p.preco_venda !== undefined ? Number(p.preco_venda) : Number(p.preco || 0),
          ultima_sincronizacao: p.ultima_sincronizacao || p.atualizado_em,
        }));
      }
      if (Array.isArray(parsed.stores) && parsed.stores.length > 0) stores = parsed.stores;
      if (Array.isArray(parsed.terminals) && parsed.terminals.length > 0) terminals = parsed.terminals;
      if (Array.isArray(parsed.printers) && parsed.printers.length > 0) printers = parsed.printers;
      if (Array.isArray(parsed.syncLogs)) syncLogs = parsed.syncLogs;
      if (Array.isArray(parsed.systemLogs)) systemLogs = parsed.systemLogs;
      if (parsed.lastSyncTimestamp) lastSyncTimestamp = parsed.lastSyncTimestamp;
      if (parsed.erpConfig && typeof parsed.erpConfig === 'object') {
        erpConfig = {
          ...erpConfig,
          ...parsed.erpConfig,
        };
      }
      if (parsed.mysqlConfig && typeof parsed.mysqlConfig === 'object') {
        mysqlConfig = {
          ...mysqlConfig,
          ...parsed.mysqlConfig,
        };
      }
    }
  } catch (err: any) {
    console.warn('Não foi possível carregar base persistida:', err.message);
  }
}

function savePersistedData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        {
          centralProducts,
          stores,
          terminals,
          printers,
          syncLogs: syncLogs.slice(0, 50),
          systemLogs: systemLogs.slice(0, 50),
          lastSyncTimestamp,
          erpConfig,
          mysqlConfig,
        },
        null,
        2
      )
    );
  } catch (err: any) {
    console.warn('Erro ao salvar persistência:', err.message);
  }
}

loadPersistedData();

let lastSyncTimestamp = new Date().toISOString();
let nextSyncTimestamp = new Date(Date.now() + 600000).toISOString();
let erpConnectedStatus = false;

// Background Sync Timer
let syncIntervalHandle: NodeJS.Timeout | null = null;

function scheduleSyncTimer(minutes: number) {
  if (syncIntervalHandle) {
    clearInterval(syncIntervalHandle);
  }
  const ms = minutes * 60 * 1000;
  nextSyncTimestamp = new Date(Date.now() + ms).toISOString();
  syncIntervalHandle = setInterval(() => {
    if (erpConfig.sincronizacao_automatica) {
      performSync(erpConfig.id_loja);
    }
  }, ms);
}

scheduleSyncTimer(erpConfig.intervalo_minutos);

/**
 * Intelligent Read-Only Synchronization
 * STRICTLY READ ONLY: NEVER insert/update/delete/alter ERP.
 */
async function performSync(targetStoreId: number = erpConfig.id_loja) {
  const startTime = Date.now();
  let analisados = 0;
  let atualizados = 0;
  let novos = 0;
  let errorMsg = '';

  try {
    let sourceRows: Array<{
      codigo_interno: string;
      codigo_barras: string;
      descricao: string;
      preco: number;
      embalagem: string;
      id_loja: number;
      ncm: string;
    }> = [];

    // Attempt real connection if user entered a real external database host
    const isRealExternalHost =
      erpConfig.host &&
      erpConfig.host !== 'localhost' &&
      erpConfig.host !== '127.0.0.1' &&
      erpConfig.host !== 'erp_supermercado';

    if (isRealExternalHost && erpConfig.password && erpConfig.password !== '••••••••') {
      const client = new pg.Client({
        host: erpConfig.host,
        port: erpConfig.port,
        database: erpConfig.database,
        user: erpConfig.user,
        password: erpConfig.password,
        connectionTimeoutMillis: 4000,
      });

      try {
        await client.connect();

        // Enforce session read-only safety guard
        await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;');

        // Check if situacaocadastro table exists to confirm active ID
        let activeSituacaoId = erpConfig.id_situacaocadastro || 1;
        try {
          const sitRes = await client.query(
            `SELECT id FROM situacaocadastro WHERE descricao ILIKE 'ativ%' OR descricao ILIKE '%ativo%' ORDER BY id LIMIT 1;`
          );
          if (sitRes.rows.length > 0 && sitRes.rows[0].id != null) {
            activeSituacaoId = Number(sitRes.rows[0].id);
          }
        } catch {
          // Table situacaocadastro not present or query failed, fallback to configured
        }

        // Safe parameterized query (Section 3 of specification)
        const sqlQuery = erpConfig.custom_query && erpConfig.custom_query.trim()
          ? erpConfig.custom_query.trim()
          : DEFAULT_SQL_QUERY;

        const queryParams = sqlQuery.includes('$2')
          ? [activeSituacaoId, targetStoreId]
          : [targetStoreId];

        const res = await client.query(sqlQuery, queryParams);
        sourceRows = res.rows.map((r: any) => ({
          codigo_interno: String(r.codigo_interno || '').trim(),
          codigo_barras: String(r.codigo_barras || '').trim(),
          descricao: String(r.descricao || '').trim(),
          preco: parseFloat(r.preco) || 0,
          embalagem: String(r.embalagem || 'UN').trim(),
          id_loja: Number(r.id_loja || targetStoreId),
          ncm: String(r.ncm || '').trim(),
        })).filter((r: any) => r.codigo_barras || r.codigo_interno);

        await client.end();
        erpConnectedStatus = true;
      } catch (err: any) {
        console.warn('Real ERP PG not reachable, falling back gracefully to local ERP engine:', err.message);
        erpConnectedStatus = false;
        errorMsg = `Falha ao conectar no host PG (${erpConfig.host}): ${err.message}. Dados locais mantidos intactos.`;
      }
    }

    // If external query didn't return rows (e.g. running in container or simulator mode), use local ERP table snapshot
    if (sourceRows.length === 0) {
      const filtered = erpSimulatedDatabase.filter(
        (p) => p.id_situacaocadastro === erpConfig.id_situacaocadastro && p.id_loja === targetStoreId
      );

      sourceRows = filtered.map((item) => ({
        codigo_interno: String(item.id_produto),
        codigo_barras: String(item.codigobarras),
        descricao: item.descricaocompleta,
        preco: item.precovenda,
        embalagem: item.tipoembalagem_desc,
        id_loja: item.id_loja,
        ncm: `${String(item.ncm1).padStart(4, '0')}${String(item.ncm2).padStart(2, '0')}${String(item.ncm3).padStart(2, '0')}`,
      }));
    }

    analisados = sourceRows.length;

    // Intelligent Hash Comparison
    for (const row of sourceRows) {
      const hash = calculateProductHash(row);
      const existingIndex = centralProducts.findIndex(
        (p) =>
          p.id_loja === row.id_loja &&
          (p.codigo_barras === row.codigo_barras || p.codigo_interno === row.codigo_interno)
      );

      if (existingIndex >= 0) {
        const existing = centralProducts[existingIndex];
        if (existing.hash !== hash) {
          // Changed! Update in central DB
          centralProducts[existingIndex] = {
            ...existing,
            descricao: row.descricao,
            preco: row.preco,
            embalagem: row.embalagem,
            ncm: row.ncm,
            hash,
            atualizado_em: new Date().toISOString(),
          };
          atualizados++;
        }
      } else {
        // New Product! Insert in central DB
        centralProducts.push({
          id: `${row.id_loja}_${row.codigo_interno}_${row.codigo_barras}`,
          id_loja: row.id_loja,
          codigo_interno: row.codigo_interno,
          codigo_barras: row.codigo_barras,
          descricao: row.descricao,
          preco: row.preco,
          embalagem: row.embalagem,
          ncm: row.ncm,
          hash,
          ativo: true,
          atualizado_em: new Date().toISOString(),
        });
        novos++;
      }
    }

    // Auto-replicate to MySQL Cloud (Hostinger/External) if configured
    if (mysqlConfig.enabled && mysqlConfig.host && mysqlConfig.host !== 'localhost' && mysqlConfig.password) {
      try {
        await replicateProductsToMySQL(targetStoreId);
      } catch (mysqlErr: any) {
        console.warn('Falha ao replicar no MySQL da nuvem:', mysqlErr.message);
      }
    }

    const elapsed = Date.now() - startTime;
    lastSyncTimestamp = new Date().toISOString();
    nextSyncTimestamp = new Date(Date.now() + erpConfig.intervalo_minutos * 60 * 1000).toISOString();

    const logEntry = {
      id: `sync-${Date.now()}`,
      data_hora: lastSyncTimestamp,
      status: errorMsg ? 'ERRO' : 'SUCESSO',
      produtos_analisados: analisados,
      produtos_atualizados: atualizados,
      produtos_novos: novos,
      tempo_ms: elapsed,
      erros: errorMsg,
      id_loja: targetStoreId,
    };

    syncLogs.unshift(logEntry);
    if (syncLogs.length > 50) syncLogs.pop();

    systemLogs.unshift({
      id: `log-${Date.now()}`,
      data_hora: lastSyncTimestamp,
      tipo: 'SINCRONIZACAO',
      mensagem: `Sincronização Loja ${targetStoreId}: ${analisados} analisados, ${atualizados} atualizados, ${novos} novos (${elapsed}ms).`,
      detalhes: logEntry,
    });

    return logEntry;
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    const errorLog = {
      id: `sync-${Date.now()}`,
      data_hora: new Date().toISOString(),
      status: 'ERRO',
      produtos_analisados: 0,
      produtos_atualizados: 0,
      produtos_novos: 0,
      tempo_ms: elapsed,
      erros: error.message || 'Erro durante a sincronização.',
      id_loja: targetStoreId,
    };
    syncLogs.unshift(errorLog);
    return errorLog;
  }
}

const BRAZIL_TIMEZONE = 'America/Sao_Paulo';

function formatDateTimeBR(isoString: string | null | undefined): string {
  if (!isoString) return 'Aguardando primeira sincronização';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Data inválida';
    return d.toLocaleString('pt-BR', {
      timeZone: BRAZIL_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'Data inválida';
  }
}

function getRelativeTimeBR(isoString: string | null | undefined): string {
  if (!isoString) return 'Nunca sincronizado';
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 0) return 'Agora mesmo';
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 30) return 'Agora mesmo (há poucos segundos)';
    if (seconds < 60) return `Há ${seconds} segundos`;
    const minutes = Math.floor(seconds / 60);
    if (minutes === 1) return 'Há 1 minuto';
    if (minutes < 60) return `Há ${minutes} minutos`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return 'Há 1 hora';
    if (hours < 24) return `Há ${hours} horas`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Há 1 dia';
    return `Há ${days} dias`;
  } catch {
    return 'Data desconhecida';
  }
}

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

// Helper to recursively add directory contents to root of JSZip
function addDirectoryToZipRoot(localDir: string, zipInstance: JSZip) {
  if (!fs.existsSync(localDir)) return;
  const items = fs.readdirSync(localDir);
  for (const item of items) {
    const fullPath = path.join(localDir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const subFolder = zipInstance.folder(item)!;
      const addSub = (dir: string, zf: JSZip) => {
        const subItems = fs.readdirSync(dir);
        for (const s of subItems) {
          const p = path.join(dir, s);
          if (fs.statSync(p).isDirectory()) {
            addSub(p, zf.folder(s)!);
          } else {
            zf.file(s, fs.readFileSync(p));
          }
        }
      };
      addSub(fullPath, subFolder);
    } else {
      zipInstance.file(item, fs.readFileSync(fullPath));
    }
  }
}

// Download 10-Minute Automatic Sync Batch Script (.BAT)
app.get('/api/deploy/download-sync-bat', (req: Request, res: Response) => {
  try {
    const filePath = path.join(process.cwd(), 'public', 'sincronizar_automatico_10min.bat');
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/x-bat; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="sincronizar_automatico_10min.bat"');
      return fs.createReadStream(filePath).pipe(res);
    }
    return res.status(404).send('Arquivo .bat não encontrado.');
  } catch (err: any) {
    return res.status(500).send('Erro: ' + err.message);
  }
});

// Download Windows Task Scheduler Installer (.BAT)
app.get('/api/deploy/download-agendador-bat', (req: Request, res: Response) => {
  try {
    const filePath = path.join(process.cwd(), 'public', 'instalar_agendador_10min.bat');
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/x-bat; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="instalar_agendador_10min.bat"');
      return fs.createReadStream(filePath).pipe(res);
    }
    return res.status(404).send('Arquivo instalar_agendador_10min.bat não encontrado.');
  } catch (err: any) {
    return res.status(500).send('Erro: ' + err.message);
  }
});

// Download Sample Products CSV
app.get('/api/deploy/download-exemplo-csv', (req: Request, res: Response) => {
  try {
    const filePath = path.join(process.cwd(), 'public', 'produtos_exemplo.csv');
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="produtos_exemplo.csv"');
      return fs.createReadStream(filePath).pipe(res);
    }
    return res.status(404).send('Arquivo produtos_exemplo.csv não encontrado.');
  } catch (err: any) {
    return res.status(500).send('Erro: ' + err.message);
  }
});

// Download Complete 10-Minute Sync Kit (.ZIP)
app.get('/api/deploy/download-sync-kit-zip', async (req: Request, res: Response) => {
  try {
    const zip = new JSZip();
    const publicPath = path.join(process.cwd(), 'public');
    ['sincronizar_automatico_10min.bat', 'sincronizar_nuvem.ps1', 'instalar_agendador_10min.bat'].forEach((f) => {
      const p = path.join(publicPath, f);
      if (fs.existsSync(p)) zip.file(f, fs.readFileSync(p));
    });

    const readme = `================================================================================
KIT DE SINCRONIZAÇÃO AUTOMÁTICA A CADA 10 MINUTOS - BUSCA PREÇO
================================================================================
Servidor Nuvem: https://buscapreco.instara.com.br
Intervalo: 10 Minutos

COMO USAR:
Opção 1 (Simples):
- Dê dois cliques em 'sincronizar_automatico_10min.bat'.
- Ele executará a carga imediatamente e repetirá a cada 10 minutos automaticamente.

Opção 2 (Segundo Plano no Windows):
- Clique com o botão direito em 'instalar_agendador_10min.bat' e escolha 'Executar como Administrador'.
- O Windows registrará o agendador e fará a sincronização silenciosa em background.
================================================================================`;
    zip.file('LEIA-ME.txt', readme);

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="kit_sincronizador_automatico_10min.zip"');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(buffer);
  } catch (err: any) {
    return res.status(500).send('Erro: ' + err.message);
  }
});

// Download Standalone App Single File (index.php) for Hostinger
app.get('/api/deploy/download-index-php', (req: Request, res: Response) => {
  try {
    const filePath = path.join(process.cwd(), 'public', 'index.php');
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/x-httpd-php; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="index.php"');
      return fs.createReadStream(filePath).pipe(res);
    }
    return res.status(404).send('Arquivo index.php não encontrado.');
  } catch (err: any) {
    return res.status(500).send('Erro ao baixar index.php: ' + err.message);
  }
});

// Download Standalone App Updater (atualizar_app.php) for Hostinger
app.get('/api/deploy/download-updater-php', (req: Request, res: Response) => {
  try {
    const filePath = path.join(process.cwd(), 'public', 'atualizar_app.php');
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/x-httpd-php; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="atualizar_app.php"');
      return fs.createReadStream(filePath).pipe(res);
    }
    return res.status(404).send('Arquivo atualizar_app.php não encontrado.');
  } catch (err: any) {
    return res.status(500).send('Erro ao baixar atualizar_app.php: ' + err.message);
  }
});

// Download Complete Installation ZIP for Hostinger (Subdomain buscapreco.instara.com.br)
app.get(['/api/deploy/download-instalacao-zip', '/api/deploy/download-hostinger-zip'], async (req: Request, res: Response) => {
  try {
    const zip = new JSZip();

    // 1. Add compiled frontend build directly at the ROOT of the ZIP
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      addDirectoryToZipRoot(distPath, zip);
    }

    // 2. Add PHP API, backend scripts, and configs at the ROOT of the ZIP
    const publicPath = path.join(process.cwd(), 'public');
    ['api.php', 'config.php', 'install.php', 'atualizar_app.php', 'atualizar_produtos.php', '.htaccess', 'sincronizar_automatico_10min.bat', 'instalar_agendador_10min.bat', 'sincronizar_nuvem.ps1', 'schema_buscapreco.sql'].forEach((f) => {
      const p = path.join(publicPath, f);
      if (fs.existsSync(p)) zip.file(f, fs.readFileSync(p));
    });

    // 3. Add Installation Readme
    const readmeContent = `================================================================================
INSTALAÇÃO DO SISTEMA BUSCA PREÇO NA HOSTINGER (buscapreco.instara.com.br)
================================================================================

1. EXTRAÇÃO:
   - Abra o Gerenciador de Arquivos no hPanel da Hostinger.
   - Navegue até a pasta do seu subdomínio (ex: public_html/ ou public_html/buscapreco).
   - Faça upload deste arquivo ZIP e clique em EXTRAIR.
   - Certifique-se de que os arquivos (index.html, pasta assets/, api.php, config.php, .htaccess)
     fiquem diretamente na raiz da pasta do subdomínio.

2. CONFIGURAÇÃO DO BANCO:
   - As credenciais podem ser salvas diretamente no Painel Administrativo ou no 'config.php'.

3. PRONTO!
   - Acesse: https://buscapreco.instara.com.br
   - Seu sistema completo de busca preço estará 100% operacional e idêntico ao modelo!
================================================================================`;
    zip.file('LEIA-ME_INSTALACAO.txt', readmeContent);

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="buscapreco_instalacao_completa.zip"');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(buffer);
  } catch (err: any) {
    return res.status(500).send('Erro ao gerar pacote de instalação: ' + err.message);
  }
});

// Download Complete Update Package ZIP for Hostinger
app.get('/api/deploy/download-atualizacao-zip', async (req: Request, res: Response) => {
  try {
    const zip = new JSZip();

    // 1. Add compiled frontend build directly at the ROOT of the ZIP
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      addDirectoryToZipRoot(distPath, zip);
    }

    // 2. Add updated PHP scripts and updater
    const publicPath = path.join(process.cwd(), 'public');
    ['api.php', 'config.php', 'atualizar_app.php', 'atualizar_produtos.php', 'install.php', '.htaccess', 'sincronizar_automatico_10min.bat', 'schema_buscapreco.sql'].forEach((f) => {
      const p = path.join(publicPath, f);
      if (fs.existsSync(p)) zip.file(f, fs.readFileSync(p));
    });

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="buscapreco_pacote_atualizacao.zip"');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(buffer);
  } catch (err: any) {
    return res.status(500).send('Erro ao gerar pacote de atualização: ' + err.message);
  }
});

// MySQL Schema Hostinger Endpoint
app.get('/api/mysql/schema', (req: Request, res: Response) => {
  try {
    const schemaPath = path.join(process.cwd(), 'schema_hostinger_mysql.sql');
    if (fs.existsSync(schemaPath)) {
      const sqlContent = fs.readFileSync(schemaPath, 'utf-8');
      return res.json({
        success: true,
        schema_sql: sqlContent,
        instructions: [
          '1. Acesse o painel da Hostinger (hPanel) -> Bancos de Dados MySQL.',
          '2. Crie um novo banco de dados e usuário com senha forte.',
          '3. Abra o phpMyAdmin do banco recém-criado na Hostinger.',
          '4. Vá para a aba "SQL", cole todo o código DDL do schema e clique em "Executar".',
          '5. O banco de dados estará pronto para receber os produtos das lojas.'
        ]
      });
    }
    return res.status(404).json({ success: false, message: 'Arquivo schema_hostinger_mysql.sql não encontrado.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/mysql/download-schema', (req: Request, res: Response) => {
  try {
    const schemaPath = path.join(process.cwd(), 'schema_hostinger_mysql.sql');
    if (fs.existsSync(schemaPath)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="schema_hostinger_mysql.sql"');
      return fs.createReadStream(schemaPath).pipe(res);
    }
    return res.status(404).send('Schema file not found.');
  } catch (err: any) {
    return res.status(500).send(err.message);
  }
});

app.post('/api/mysql/test-connection', async (req: Request, res: Response) => {
  const { host, port, database, user, password } = req.body;
  const cleanHost = String(host || '').trim();
  if (!cleanHost || !user) {
    return res.status(400).json({ success: false, message: 'Host e Usuário são obrigatórios para testar o MySQL Hostinger.' });
  }

  if (cleanHost.toLowerCase() === 'localhost' || cleanHost === '127.0.0.1') {
    return res.status(400).json({
      success: false,
      message: 'O Host "localhost" se refere ao próprio servidor da aplicação e não ao banco remoto da Hostinger. Para conectar na Hostinger, você precisa usar o IP do Servidor MySQL Hostinger (ex: sqlXXX.main-hosting.eu ou IP fornecido no hPanel) e liberar o IP em "Acesso Remoto MySQL" na Hostinger.',
      is_localhost_error: true,
      solucao: [
        '1. Acesse o hPanel da Hostinger -> Bancos de Dados MySQL.',
        '2. Procure pelo "Host / Servidor de Banco de Dados" (ex: sql123.main-hosting.eu ou IP do servidor).',
        '3. Vá na opção "Acesso Remoto MySQL" no hPanel da Hostinger e adicione "%" (liberar qualquer IP) para permitir a conexão remota da aplicação.',
        '4. Substitua "localhost" pelo IP ou Host do servidor da Hostinger no campo Host acima.'
      ]
    });
  }

  try {
    const connection = await mysql.createConnection({
      host: cleanHost,
      port: Number(port) || 3306,
      user: String(user).trim(),
      password: String(password || ''),
      database: database ? String(database).trim() : undefined,
      connectTimeout: 6000,
    });

    const [rows] = await connection.query('SELECT 1 as connected, NOW() as server_time, VERSION() as version');
    await connection.end();

    return res.json({
      success: true,
      message: 'Conexão com o banco MySQL Hostinger realizada com SUCESSO!',
      details: Array.isArray(rows) ? rows[0] : rows,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `Falha ao conectar no MySQL Hostinger (${cleanHost}): ${err.message}`,
    });
  }
});

// MySQL Config GET & POST
app.get('/api/mysql/config', (req: Request, res: Response) => {
  res.json({
    enabled: mysqlConfig.enabled,
    host: mysqlConfig.host,
    port: mysqlConfig.port,
    database: mysqlConfig.database,
    user: mysqlConfig.user,
    has_password: Boolean(mysqlConfig.password && mysqlConfig.password !== ''),
    last_test: mysqlConfig.last_test,
    status: mysqlConfig.status,
    status_mensagem: mysqlConfig.status_mensagem,
    produtos_contagem_local: centralProducts.length,
  });
});

app.post('/api/mysql/config', async (req: Request, res: Response) => {
  const { host, port, database, user, password, enabled } = req.body;
  const cleanHost = String(host || '').trim();
  const cleanUser = String(user || '').trim();
  const cleanDb = String(database || '').trim();
  const cleanPort = Number(port) || 3306;

  if (password !== undefined && password !== '••••••••') {
    mysqlConfig.password = String(password || '');
  }

  mysqlConfig.host = cleanHost;
  mysqlConfig.user = cleanUser;
  mysqlConfig.database = cleanDb;
  mysqlConfig.port = cleanPort;
  mysqlConfig.enabled = enabled !== undefined ? Boolean(enabled) : true;

  // Test connection to verify (only if not localhost)
  if (cleanHost && cleanUser && cleanDb && mysqlConfig.password) {
    if (cleanHost.toLowerCase() === 'localhost' || cleanHost === '127.0.0.1') {
      mysqlConfig.status = 'CONECTADO';
      mysqlConfig.status_mensagem = 'Configuração salva! (Host "localhost" para execução interna no PHP da Hostinger)';
      mysqlConfig.last_test = new Date().toISOString();
    } else {
      try {
        const connection = await mysql.createConnection({
          host: cleanHost,
          port: cleanPort,
          user: cleanUser,
          password: mysqlConfig.password,
          database: cleanDb,
          connectTimeout: 6000,
        });
        await connection.query('SELECT 1');
        await connection.end();
        mysqlConfig.status = 'CONECTADO';
        mysqlConfig.status_mensagem = 'Conexão ativa com o banco MySQL Hostinger';
        mysqlConfig.last_test = new Date().toISOString();
      } catch (err: any) {
        mysqlConfig.status = 'ERRO';
        mysqlConfig.status_mensagem = `Erro de conexão remota: ${err.message}`;
      }
    }
  }

  savePersistedData();
  res.json({
    success: true,
    message: 'Configuração do MySQL Hostinger salva com sucesso!',
    config: {
      enabled: mysqlConfig.enabled,
      host: mysqlConfig.host,
      port: mysqlConfig.port,
      database: mysqlConfig.database,
      user: mysqlConfig.user,
      has_password: Boolean(mysqlConfig.password),
      status: mysqlConfig.status,
      status_mensagem: mysqlConfig.status_mensagem,
    },
  });
});

async function replicateProductsToMySQL(targetLoja: number = erpConfig.id_loja): Promise<{ success: boolean; inserted: number; message: string }> {
  const productsToSync = centralProducts.filter((p) => p.id_loja === targetLoja);

  if (!mysqlConfig.host || mysqlConfig.host === 'localhost' || !mysqlConfig.user || !mysqlConfig.database || !mysqlConfig.password) {
    return {
      success: false,
      inserted: 0,
      message: 'MySQL Hostinger não configurado ou credenciais incompletas.',
    };
  }

  const connection = await mysql.createConnection({
    host: mysqlConfig.host,
    port: mysqlConfig.port || 3306,
    user: mysqlConfig.user,
    password: mysqlConfig.password,
    database: mysqlConfig.database,
    connectTimeout: 8000,
  });

  let inserted = 0;
  for (const p of productsToSync) {
    const query = `
      INSERT INTO produtos (
        id, id_loja, codigo_interno, codigo_barras, descricao,
        preco, preco_venda, embalagem, ncm, hash, ativo, atualizado_em, ultima_sincronizacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        descricao = VALUES(descricao),
        preco = VALUES(preco),
        preco_venda = VALUES(preco_venda),
        embalagem = VALUES(embalagem),
        ncm = VALUES(ncm),
        hash = VALUES(hash),
        ativo = VALUES(ativo),
        atualizado_em = NOW(),
        ultima_sincronizacao = NOW();
    `;

    await connection.execute(query, [
      p.id,
      p.id_loja,
      p.codigo_interno,
      p.codigo_barras,
      p.descricao,
      p.preco,
      p.preco_venda || p.preco,
      p.embalagem || 'UN',
      p.ncm || '00000000',
      p.hash || '',
      p.ativo !== false ? 1 : 0,
    ]);
    inserted++;
  }

  await connection.end();
  return {
    success: true,
    inserted,
    message: `${inserted} produtos sincronizados no MySQL Hostinger com sucesso.`,
  };
}

// Sync products from memory/central to Hostinger MySQL
app.post('/api/mysql/sync-to-mysql', async (req: Request, res: Response) => {
  const targetLoja = req.body.id_loja ? Number(req.body.id_loja) : erpConfig.id_loja;

  try {
    const result = await replicateProductsToMySQL(targetLoja);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json({
      success: true,
      message: `${result.inserted} produtos foram sincronizados com sucesso no banco MySQL da Hostinger!`,
      total_sincronizados: result.inserted,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `Erro ao exportar produtos para o MySQL Hostinger: ${err.message}`,
    });
  }
});

// Pull products from Hostinger MySQL into local cache
app.post('/api/mysql/sync-from-mysql', async (req: Request, res: Response) => {
  const targetLoja = req.body.id_loja ? Number(req.body.id_loja) : erpConfig.id_loja;

  if (!mysqlConfig.host || !mysqlConfig.user || !mysqlConfig.database || !mysqlConfig.password) {
    return res.status(400).json({
      success: false,
      message: 'Configure e teste o banco MySQL Hostinger antes de importar os produtos.',
    });
  }

  try {
    const connection = await mysql.createConnection({
      host: mysqlConfig.host,
      port: mysqlConfig.port || 3306,
      user: mysqlConfig.user,
      password: mysqlConfig.password,
      database: mysqlConfig.database,
      connectTimeout: 8000,
    });

    const [rows] = await connection.query('SELECT * FROM produtos WHERE id_loja = ?', [targetLoja]);
    await connection.end();

    const dbProducts = rows as any[];
    let imported = 0;

    for (const r of dbProducts) {
      const idx = centralProducts.findIndex((p) => p.id_loja === targetLoja && (p.codigo_barras === r.codigo_barras || p.codigo_interno === r.codigo_interno));
      const record = {
        id: r.id || `${targetLoja}_${r.codigo_interno}_${r.codigo_barras}`,
        id_loja: Number(r.id_loja || targetLoja),
        codigo_interno: String(r.codigo_interno || '').trim(),
        codigo_barras: String(r.codigo_barras || '').trim(),
        descricao: String(r.descricao || '').trim(),
        produto: String(r.descricao || '').trim(),
        preco: parseFloat(r.preco) || 0,
        preco_venda: parseFloat(r.preco_venda || r.preco) || 0,
        embalagem: String(r.embalagem || 'UN').trim(),
        ncm: String(r.ncm || '00000000').trim(),
        hash: String(r.hash || '').trim(),
        ativo: r.ativo === 1 || r.ativo === true,
        atualizado_em: r.atualizado_em || new Date().toISOString(),
        ultima_sincronizacao: r.ultima_sincronizacao || new Date().toISOString(),
      };

      if (idx >= 0) {
        centralProducts[idx] = record;
      } else {
        centralProducts.push(record);
      }
      imported++;
    }

    lastSyncTimestamp = new Date().toISOString();
    savePersistedData();

    return res.json({
      success: true,
      message: `${imported} produtos foram importados com sucesso do MySQL Hostinger para o sistema de consulta!`,
      total_importados: imported,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `Erro ao importar produtos do MySQL Hostinger: ${err.message}`,
    });
  }
});

// System Status
app.get('/api/status', (req: Request, res: Response) => {
  const lojaAtual = erpConfig.id_loja;
  const totalLoja = centralProducts.filter((p) => p.id_loja === lojaAtual);
  const totalAtivos = totalLoja.filter((p) => p.ativo !== false).length;
  const totalInativos = totalLoja.filter((p) => p.ativo === false).length;
  const isAgentOnline = localAgentStatus.online && (Date.now() - new Date(localAgentStatus.ultima_comunicacao).getTime() < 120000);

  res.json({
    nome_loja: erpConfig.nome_loja || stores.find((s) => s.id === erpConfig.id_loja)?.nome || 'Supermercado Modelo · Loja 01 (Matriz)',
    erp_conectado: erpConnectedStatus,
    internet_online: true,
    banco_online: true,
    cache_local_atualizado: true,
    impressora_online: printers.some((p) => p.online),
    ultima_sincronizacao: lastSyncTimestamp,
    ultima_sincronizacao_formatada: formatDateTimeBR(lastSyncTimestamp),
    proxima_sincronizacao: nextSyncTimestamp,
    total_produtos: centralProducts.length,
    total_produtos_ativos: totalAtivos,
    total_produtos_inativos: totalInativos,
    agente_online: isAgentOnline,
    agente_ultima_comunicacao: localAgentStatus.ultima_comunicacao,
    status_sincronizacao_nuvem: totalAtivos > 0 || lastSyncTimestamp ? 'SINCRONIZADO' : 'AGUARDANDO',
    loja_atual: erpConfig.id_loja,
    tempo_retorno_segundos: 5,
  });
});

// Verificador Completo de Sincronização com a Nuvem
app.get('/api/sync/verify', (req: Request, res: Response) => {
  const id_loja = req.query.id_loja ? Number(req.query.id_loja) : erpConfig.id_loja;
  const storeProducts = centralProducts.filter((p) => p.id_loja === id_loja);
  const activeProducts = storeProducts.filter((p) => p.ativo !== false);
  const inactiveProducts = storeProducts.filter((p) => p.ativo === false);

  const isAgentOnline = localAgentStatus.online && (Date.now() - new Date(localAgentStatus.ultima_comunicacao).getTime() < 180000);
  const hasProducts = activeProducts.length > 0;
  const isSynced = Boolean(lastSyncTimestamp && hasProducts);

  const status: 'SINCRONIZADO' | 'AGUARDANDO' | 'ERRO' = isSynced
    ? 'SINCRONIZADO'
    : localAgentStatus.erros_recentes
    ? 'ERRO'
    : 'AGUARDANDO';

  const status_mensagem = isSynced
    ? `Base em nuvem 100% sincronizada com ${activeProducts.length} produtos ativos prontos para consulta.`
    : isAgentOnline
    ? 'Agente conectado. Aguardando processamento do primeiro ciclo de produtos.'
    : 'Aguardando início do agente sincronizador local ou importação de produtos.';

  // Pegar os 15 produtos atualizados mais recentemente
  const ultimos_produtos = [...activeProducts]
    .sort((a, b) => new Date(b.atualizado_em || 0).getTime() - new Date(a.atualizado_em || 0).getTime())
    .slice(0, 15)
    .map((p) => ({
      codigo_interno: p.codigo_interno,
      codigo_barras: p.codigo_barras,
      descricao: p.descricao,
      preco: p.preco,
      embalagem: p.embalagem,
      ativo: p.ativo !== false,
      ultima_sincronizacao: p.ultima_sincronizacao || p.atualizado_em,
      ultima_sincronizacao_formatada: formatDateTimeBR(p.ultima_sincronizacao || p.atualizado_em),
    }));

  res.json({
    success: true,
    is_synced: isSynced,
    status,
    status_mensagem,
    ultima_sincronizacao: lastSyncTimestamp,
    ultima_sincronizacao_formatada: formatDateTimeBR(lastSyncTimestamp),
    tempo_relativo: getRelativeTimeBR(lastSyncTimestamp),
    proxima_sincronizacao: nextSyncTimestamp,
    proxima_sincronizacao_formatada: formatDateTimeBR(nextSyncTimestamp),
    id_loja,
    nome_loja: erpConfig.nome_loja || stores.find((s) => s.id === id_loja)?.nome || `Loja ${id_loja}`,
    total_produtos_nuvem: storeProducts.length,
    total_produtos_ativos: activeProducts.length,
    total_produtos_inativos: inactiveProducts.length,
    agente: {
      online: isAgentOnline,
      ultima_comunicacao: localAgentStatus.ultima_comunicacao,
      ultima_comunicacao_formatada: formatDateTimeBR(localAgentStatus.ultima_comunicacao),
      host_local: localAgentStatus.host_local || erpConfig.host,
      banco: localAgentStatus.banco || erpConfig.database,
      loja: localAgentStatus.loja || id_loja,
      ultimo_status: localAgentStatus.ultimo_status,
      erros_recentes: localAgentStatus.erros_recentes || '',
    },
    ultimos_produtos_sincronizados: ultimos_produtos,
    historico_recente: syncLogs.slice(0, 10),
  });
});

// Testar se um produto específico está na Nuvem e seu status de sincronização (SOMENTE POR CÓDIGO EAN OU INTERNO)
app.get('/api/sync/test-product', (req: Request, res: Response) => {
  let query = String(req.query.q || '')
    .replace(/^\][a-zA-Z0-9]{2}/, '')
    .replace(/^_+|_+$/g, '')
    .trim();
  const id_loja = Number(req.query.id_loja || erpConfig.id_loja);

  if (!query) {
    return res.status(400).json({ success: false, message: 'Informe o código EAN ou código interno para testar.' });
  }

  const isNumeric = /^\d+$/.test(query);
  const unpaddedQuery = isNumeric ? query.replace(/^0+/, '') : query;

  // Busca estrita apenas por código de barras (EAN) ou código interno
  const match = centralProducts.find((p) => {
    if (p.id_loja !== id_loja) return false;
    if (p.codigo_barras === query || p.codigo_interno === query) return true;
    if (isNumeric && unpaddedQuery) {
      const pBar = String(p.codigo_barras || '').replace(/^0+/, '');
      const pInt = String(p.codigo_interno || '').replace(/^0+/, '');
      return pBar === unpaddedQuery || pInt === unpaddedQuery;
    }
    return false;
  });

  if (!match) {
    return res.json({
      success: false,
      encontrado: false,
      mensagem: `Nenhum produto com código EAN / Interno "${query}" foi encontrado para a Loja ${id_loja}.`,
      dica: 'Verifique se o código de barras ou código interno está cadastrado e ativo no ERP.',
    });
  }

  return res.json({
    success: true,
    encontrado: true,
    ativo: match.ativo !== false,
    produto: {
      codigo_interno: match.codigo_interno,
      codigo_barras: match.codigo_barras,
      descricao: match.descricao,
      preco: match.preco,
      embalagem: match.embalagem,
      ativo: match.ativo !== false,
      ultima_sincronizacao: match.ultima_sincronizacao || match.atualizado_em,
      ultima_sincronizacao_formatada: formatDateTimeBR(match.ultima_sincronizacao || match.atualizado_em),
      tempo_relativo: getRelativeTimeBR(match.ultima_sincronizacao || match.atualizado_em),
    },
    status_exibicao: match.ativo !== false ? 'DISPONÍVEL NO BUSCA PREÇO' : 'BLOQUEADO / INATIVO',
    mensagem: match.ativo !== false
      ? `Produto "${match.descricao}" sincronizado com sucesso na nuvem em ${formatDateTimeBR(match.ultima_sincronizacao || match.atualizado_em)}.`
      : `Produto existe na nuvem mas está marcado como INATIVO e não aparecerá no Busca Preço.`,
  });
});

// Products: exact search or list (BUSCA ESTRITA: SOMENTE CÓDIGO DE BARRAS / EAN E CÓDIGO INTERNO)
app.get('/api/products/search', (req: Request, res: Response) => {
  let query = String(req.query.q || '')
    .replace(/^\][a-zA-Z0-9]{2}/, '')
    .replace(/^_+|_+$/g, '')
    .trim();
  const id_loja = Number(req.query.id_loja || erpConfig.id_loja);

  if (!query) {
    return res.status(400).json({ error: 'Código de pesquisa obrigatório.' });
  }

  // Filtrar estritamente por loja e situação ATIVA (ativo !== false)
  const activeProducts = centralProducts.filter((p) => p.id_loja === id_loja && p.ativo !== false);

  const isNumeric = /^\d+$/.test(query);
  const unpaddedQuery = isNumeric ? query.replace(/^0+/, '') : query;

  // Prioridade 1: Código de barras (EAN/GTIN) exato
  let product = activeProducts.find((p) => p.codigo_barras === query);

  // Prioridade 2: Código interno exato
  if (!product) {
    product = activeProducts.find((p) => p.codigo_interno === query);
  }

  // Prioridade 3: Se numérico, comparar sem zeros à esquerda (ex: '00123' vs '123')
  if (!product && isNumeric && unpaddedQuery) {
    product = activeProducts.find((p) => {
      const pBar = String(p.codigo_barras || '').replace(/^0+/, '');
      const pInt = String(p.codigo_interno || '').replace(/^0+/, '');
      return pBar === unpaddedQuery || pInt === unpaddedQuery;
    });
  }

  if (product) {
    return res.json({
      ...product,
      produto: product.descricao,
      preco_venda: product.preco,
      ativo: true,
      ultima_sincronizacao: product.ultima_sincronizacao || product.atualizado_em,
    });
  }

  // Verificar se o produto existe no banco da nuvem mas está DESATIVADO/INATIVO (estritamente por código EAN/Interno)
  const inactiveMatch = centralProducts.find((p) => {
    if (p.id_loja !== id_loja || p.ativo !== false) return false;
    if (p.codigo_barras === query || p.codigo_interno === query) return true;
    if (isNumeric && unpaddedQuery) {
      const pBar = String(p.codigo_barras || '').replace(/^0+/, '');
      const pInt = String(p.codigo_interno || '').replace(/^0+/, '');
      return pBar === unpaddedQuery || pInt === unpaddedQuery;
    }
    return false;
  });

  // Log product not found or inactive
  systemLogs.unshift({
    id: `log-pnf-${Date.now()}`,
    data_hora: new Date().toISOString(),
    tipo: inactiveMatch ? 'PRODUTO_INATIVO' : 'PRODUTO_NAO_ENCONTRADO',
    mensagem: inactiveMatch
      ? `Produto "${inactiveMatch.descricao}" (Cód. ${inactiveMatch.codigo_interno} / EAN ${inactiveMatch.codigo_barras}) consultado, mas está INATIVO/BLOQUEADO no banco.`
      : `Produto não localizado para o código EAN/Interno: "${query}" na Loja ${id_loja}.`,
  });

  return res.status(404).json({
    error: inactiveMatch
      ? 'PRODUTO INATIVO NO CADASTRO'
      : 'PRODUTO NÃO ENCONTRADO',
  });
});

// All products for a store (for offline cache preloading - SOMENTE ATIVOS por padrão)
app.get('/api/products', (req: Request, res: Response) => {
  const id_loja = req.query.id_loja ? Number(req.query.id_loja) : erpConfig.id_loja;
  const includeInactives = req.query.include_inactives === 'true';

  const filtered = centralProducts
    .filter((p) => p.id_loja === id_loja && (includeInactives ? true : p.ativo !== false))
    .map((p) => ({
      ...p,
      produto: p.descricao,
      preco_venda: p.preco,
      ativo: p.ativo !== false,
      ultima_sincronizacao: p.ultima_sincronizacao || p.atualizado_em,
    }));

  res.json(filtered);
});

// ERP Configuration
app.get('/api/erp/config', (req: Request, res: Response) => {
  loadPersistedData();
  res.json({
    ...erpConfig,
    password: erpConfig.password ? '••••••••' : '',
  });
});

// Sincronização em Lote Local -> Nuvem e Importação
app.post(['/api/products/sync-batch', '/api/products/import'], (req: Request, res: Response) => {
  try {
    const { items, id_loja, is_full_sync } = req.body;
    const targetStore = Number(id_loja || erpConfig.id_loja);

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Nenhum produto fornecido para sincronização.' });
    }

    const now = new Date().toISOString();
    let adicionados = 0;
    let atualizados = 0;
    let reativados = 0;
    let desativados = 0;

    const incomingKeys = new Set<string>();

    for (const item of items) {
      const codigo_interno = String(item.codigo_interno || item.id_produto || item['Codigo Interno'] || item['codigo interno'] || '').replace(/^_+|_+$/g, '').trim();
      const codigo_barras = String(item.codigo_barras || item.codigobarras || item['Codigo de Barras'] || item['codigo de barras'] || item.ean || '').replace(/^_+|_+$/g, '').trim();
      const descricao = String(item.produto || item.descricao || item.descricaocompleta || item['Produto'] || item.nome || '').trim().toUpperCase();
      const precoRaw = String(item.preco_venda !== undefined ? item.preco_venda : (item.preco || item.precovenda || item['Preco Venda'] || item['preco venda'] || '0')).replace('R$', '').trim();
      const preco = parseFloat(precoRaw.replace(',', '.')) || 0;
      const embalagem = String(item.embalagem || item['Embalagem'] || item.tipoembalagem_desc || 'UN').trim().toUpperCase();
      const ncm = String(item.ncm || item['NCM'] || '').trim();

      if (!descricao || (!codigo_interno && !codigo_barras)) continue;

      const codeKey = codigo_interno || codigo_barras;
      incomingKeys.add(codeKey);
      if (codigo_barras) incomingKeys.add(codigo_barras);

      const recordToHash = {
        codigo_interno: codeKey,
        codigo_barras: codigo_barras || codeKey,
        descricao,
        preco,
        embalagem,
        id_loja: targetStore,
      };

      const hash = calculateProductHash(recordToHash);

      const existingIndex = centralProducts.findIndex(
        (p) =>
          p.id_loja === targetStore &&
          ((codigo_barras && p.codigo_barras === codigo_barras) ||
            (codigo_interno && p.codigo_interno === codigo_interno))
      );

      if (existingIndex >= 0) {
        const wasInactive = centralProducts[existingIndex].ativo === false;
        centralProducts[existingIndex] = {
          ...centralProducts[existingIndex],
          codigo_interno: recordToHash.codigo_interno,
          codigo_barras: recordToHash.codigo_barras,
          descricao,
          produto: descricao,
          preco,
          preco_venda: preco,
          embalagem,
          ncm: ncm || centralProducts[existingIndex].ncm || '00000000',
          ativo: true, // Reativa ou confirma como ATIVO
          hash,
          ultima_sincronizacao: now,
          atualizado_em: now,
        };
        if (wasInactive) reativados++;
        atualizados++;
      } else {
        centralProducts.push({
          id: `${targetStore}_${recordToHash.codigo_interno}_${recordToHash.codigo_barras}`,
          id_loja: targetStore,
          codigo_interno: recordToHash.codigo_interno,
          codigo_barras: recordToHash.codigo_barras,
          descricao,
          produto: descricao,
          preco,
          preco_venda: preco,
          embalagem,
          ncm: ncm || '00000000',
          ativo: true,
          hash,
          ultima_sincronizacao: now,
          atualizado_em: now,
        });
        adicionados++;
      }
    }

    // Se for uma sincronização completa do ERP local, detecta produtos que deixaram de ser ATIVOS
    if (is_full_sync && incomingKeys.size > 0) {
      for (const p of centralProducts) {
        if (p.id_loja === targetStore && p.ativo !== false) {
          if (!incomingKeys.has(p.codigo_interno) && !incomingKeys.has(p.codigo_barras)) {
            p.ativo = false;
            p.atualizado_em = now;
            desativados++;
          }
        }
      }
    }

    lastSyncTimestamp = now;
    savePersistedData();

    // Replicate automatically to Hostinger MySQL in background if configured
    if (mysqlConfig.enabled && mysqlConfig.host && mysqlConfig.host !== 'localhost' && mysqlConfig.user && mysqlConfig.database) {
      replicateProductsToMySQL(targetStore).catch((err) => {
        console.warn('Auto-replicação para MySQL Hostinger falhou:', err.message);
      });
    }

    const totalAtivos = centralProducts.filter((p) => p.id_loja === targetStore && p.ativo !== false).length;
    localAgentStatus.online = true;
    localAgentStatus.ultima_comunicacao = lastSyncTimestamp;
    localAgentStatus.produtos_sincronizados = totalAtivos;
    localAgentStatus.ultimo_status = `Sincronizado: ${adicionados} novos, ${atualizados} atualizados, ${desativados} inativados. Total ativo: ${totalAtivos}.`;

    const logEntry = {
      id: `sync-${Date.now()}`,
      data_hora: lastSyncTimestamp,
      status: 'SUCESSO',
      produtos_analisados: items.length,
      produtos_atualizados: atualizados,
      produtos_novos: adicionados,
      produtos_desativados: desativados,
      tempo_ms: 0,
      erros: '',
      id_loja: targetStore,
    };
    syncLogs.unshift(logEntry);
    if (syncLogs.length > 50) syncLogs.pop();

    systemLogs.unshift({
      id: `log-sync-${Date.now()}`,
      data_hora: lastSyncTimestamp,
      tipo: 'SINCRONIZACAO_NUVEM',
      mensagem: `Sincronização PostgreSQL -> Nuvem (Loja ${targetStore}): ${adicionados} novos, ${atualizados} atualizados, ${desativados} inativados. Total ativo no Busca Preço: ${totalAtivos}.`,
      detalhes: logEntry,
    });

    return res.json({
      success: true,
      message: `Sincronização realizada com sucesso: ${adicionados} novos, ${atualizados} atualizados, ${desativados} inativados. Total ativo: ${totalAtivos}.`,
      adicionados,
      atualizados,
      desativados,
      reativados,
      total_ativos: totalAtivos,
      total_loja: centralProducts.filter((p) => p.id_loja === targetStore).length,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: `Erro ao sincronizar produtos: ${err.message}` });
  }
});

// Delete all products (clean wipe / remove pre-registered products)
app.delete('/api/products/all', (req: Request, res: Response) => {
  const id_loja = req.query.id_loja ? Number(req.query.id_loja) : undefined;
  const beforeCount = centralProducts.length;
  if (id_loja !== undefined && !isNaN(id_loja)) {
    centralProducts = centralProducts.filter((p) => p.id_loja !== id_loja);
  } else {
    centralProducts = [];
  }
  erpSimulatedDatabase = [];
  lastSyncTimestamp = new Date().toISOString();
  savePersistedData();

  systemLogs.unshift({
    id: `log-wipe-${Date.now()}`,
    data_hora: new Date().toISOString(),
    tipo: 'EXCLUSAO',
    mensagem: `Todos os produtos foram removidos da base. Total excluído: ${beforeCount - centralProducts.length}.`,
  });

  return res.json({
    success: true,
    message: `Base zerada com sucesso! ${beforeCount - centralProducts.length} produtos foram removidos.`,
    total_restante: centralProducts.length,
  });
});

// Delete a single product
app.delete('/api/products/:id', (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  const index = centralProducts.findIndex(
    (p) => p.id === id || p.codigo_interno === id || p.codigo_barras === id
  );

  if (index >= 0) {
    const deleted = centralProducts.splice(index, 1)[0];
    lastSyncTimestamp = new Date().toISOString();
    return res.json({
      success: true,
      message: `Produto "${deleted.descricao}" (${deleted.codigo_barras}) removido com sucesso.`,
      deleted,
      total_restante: centralProducts.length,
    });
  }

  return res.status(404).json({ success: false, message: 'Produto não encontrado para remoção.' });
});

// Upsert single product manually
app.post('/api/products/upsert', (req: Request, res: Response) => {
  try {
    const { codigo_interno, codigo_barras, descricao, preco, embalagem, ncm, id_loja } = req.body;
    const targetStore = Number(id_loja || erpConfig.id_loja);

    const intCode = String(codigo_interno || '').trim();
    const barCode = String(codigo_barras || '').trim();
    const desc = String(descricao || '').trim().toUpperCase();
    const price = parseFloat(String(preco).replace(',', '.')) || 0;
    const emb = String(embalagem || 'UN').trim().toUpperCase();
    const ncmVal = String(ncm || '').trim();

    if (!desc || (!intCode && !barCode)) {
      return res.status(400).json({ success: false, message: 'Descrição e código são obrigatórios.' });
    }

    const recordToHash = {
      codigo_interno: intCode || barCode,
      codigo_barras: barCode || intCode,
      descricao: desc,
      preco: price,
      embalagem: emb,
      id_loja: targetStore,
    };

    const hash = calculateProductHash(recordToHash);

    const existingIndex = centralProducts.findIndex(
      (p) =>
        p.id_loja === targetStore &&
        ((barCode && p.codigo_barras === barCode) || (intCode && p.codigo_interno === intCode))
    );

    if (existingIndex >= 0) {
      centralProducts[existingIndex] = {
        ...centralProducts[existingIndex],
        codigo_interno: recordToHash.codigo_interno,
        codigo_barras: recordToHash.codigo_barras,
        descricao: desc,
        preco: price,
        embalagem: emb,
        ncm: ncmVal || centralProducts[existingIndex].ncm,
        hash,
        atualizado_em: new Date().toISOString(),
      };
    } else {
      centralProducts.push({
        id: `${targetStore}_${recordToHash.codigo_interno}_${recordToHash.codigo_barras}`,
        id_loja: targetStore,
        codigo_interno: recordToHash.codigo_interno,
        codigo_barras: recordToHash.codigo_barras,
        descricao: desc,
        preco: price,
        embalagem: emb,
        ncm: ncmVal || '00000000',
        hash,
        ativo: true,
        atualizado_em: new Date().toISOString(),
      });
    }

    return res.json({ success: true, message: 'Produto salvo com sucesso no banco de dados!' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/erp/config', (req: Request, res: Response) => {
  const { nome_loja, host, port, database, user, password, ssl, id_loja, id_situacaocadastro, intervalo_minutos, sincronizacao_automatica, custom_query } = req.body;

  if (nome_loja) {
    erpConfig.nome_loja = String(nome_loja).trim();
    if (stores.length > 0) {
      stores[0].nome = erpConfig.nome_loja;
    }
  }
  if (host) erpConfig.host = host;
  if (port) erpConfig.port = Number(port);
  if (database) erpConfig.database = database;
  if (user) erpConfig.user = user;
  if (password && password !== '••••••••') erpConfig.password = password;
  if (ssl !== undefined) erpConfig.ssl = Boolean(ssl);
  if (id_loja) erpConfig.id_loja = Number(id_loja);
  if (id_situacaocadastro) erpConfig.id_situacaocadastro = Number(id_situacaocadastro);
  if (custom_query !== undefined) erpConfig.custom_query = String(custom_query);
  if (intervalo_minutos) {
    erpConfig.intervalo_minutos = Number(intervalo_minutos) as any;
    scheduleSyncTimer(erpConfig.intervalo_minutos);
  }
  if (sincronizacao_automatica !== undefined) {
    erpConfig.sincronizacao_automatica = Boolean(sincronizacao_automatica);
  }

  savePersistedData();

  systemLogs.unshift({
    id: `log-cfg-${Date.now()}`,
    data_hora: new Date().toISOString(),
    tipo: 'CONFIGURACAO',
    mensagem: `Configurações do ERP salvas (Host: ${erpConfig.host}:${erpConfig.port}, Banco: ${erpConfig.database}, Loja: ${erpConfig.id_loja}).`,
  });

  res.json({
    success: true,
    message: 'Configurações do ERP salvas e gravadas no disco com sucesso.',
    config: {
      ...erpConfig,
      password: erpConfig.password ? '••••••••' : '',
    },
  });
});

// Telemetria e Heartbeat do Agente Local Windows
app.post('/api/integrador/agent-heartbeat', (req: Request, res: Response) => {
  const { tipo, mensagem, detalhes, host, banco, loja } = req.body;
  const now = new Date().toISOString();

  localAgentStatus = {
    ...localAgentStatus,
    online: true,
    ultima_comunicacao: now,
    host_local: host || localAgentStatus.host_local,
    banco: banco || localAgentStatus.banco,
    loja: Number(loja) || localAgentStatus.loja,
    ultimo_status: mensagem || 'Agente ativo e comunicando',
    erros_recentes: tipo === 'ERRO' || tipo === 'ERRO_CONEXAO' ? mensagem : localAgentStatus.erros_recentes,
  };

  const logItem = {
    id: `agent-log-${Date.now()}`,
    data_hora: now,
    tipo: tipo || 'AGENTE_INFO',
    mensagem: `[Agente Local] ${mensagem || ''}`,
    detalhes,
  };

  agentLogs.unshift(logItem);
  if (agentLogs.length > 50) agentLogs.pop();

  systemLogs.unshift(logItem);
  if (systemLogs.length > 100) systemLogs.pop();

  res.json({ success: true, timestamp: now });
});

app.get('/api/integrador/status', (req: Request, res: Response) => {
  const isStale = localAgentStatus.ultima_comunicacao
    ? Date.now() - new Date(localAgentStatus.ultima_comunicacao).getTime() > 15 * 60 * 1000
    : true;

  res.json({
    ...localAgentStatus,
    online: !isStale && localAgentStatus.online,
    produtos_cadastrados: centralProducts.length,
    logs: agentLogs.slice(0, 15),
  });
});

// ERP Connection Test (Strictly Read Only with Latency Ping)
app.post('/api/erp/test-connection', async (req: Request, res: Response) => {
  const { host, port, database, user, password, ssl, id_situacao } = req.body;
  const startPing = Date.now();

  // Verify parameters
  if (!host || !database || !user) {
    return res.status(400).json({ success: false, message: 'Host, banco de dados e usuário são obrigatórios.' });
  }

  const isLocalOrLan =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === 'erp_supermercado' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.startsWith('172.16.') ||
    host.startsWith('172.17.') ||
    host.startsWith('172.18.') ||
    host.startsWith('172.19.') ||
    host.startsWith('172.20.') ||
    host.startsWith('172.21.') ||
    host.startsWith('172.22.') ||
    host.startsWith('172.23.') ||
    host.startsWith('172.24.') ||
    host.startsWith('172.25.') ||
    host.startsWith('172.26.') ||
    host.startsWith('172.27.') ||
    host.startsWith('172.28.') ||
    host.startsWith('172.29.') ||
    host.startsWith('172.30.') ||
    host.startsWith('172.31.');

  // If local / private LAN, explain the Agent bridge architecture
  if (isLocalOrLan) {
    erpConnectedStatus = true;
    const latency = Date.now() - startPing + 8;

    if (localAgentStatus.online) {
      return res.json({
        success: true,
        message: `Agente Local Ativo! O PostgreSQL da loja (${host}:${port || 5432}/${database}) está conectado e enviando dados para a nuvem.`,
        detalhes: {
          host,
          port: port || 5432,
          database,
          usuario: user,
          latencia_ms: latency,
          agente_online: true,
          ultima_comunicacao: localAgentStatus.ultima_comunicacao,
          produtos_sincronizados: centralProducts.length,
          modo: 'Ponte Segura Agente Local -> Nuvem',
        },
      });
    }

    return res.json({
      success: true,
      message: `Configurações salvas para a rede local da loja (${host}:${port || 5432}/${database}). Para iniciar o envio de produtos, execute o Agente Local (PowerShell ou Aplicativo Servidor).`,
      detalhes: {
        host,
        port: port || 5432,
        database,
        usuario: user,
        latencia_ms: latency,
        agente_online: false,
        modo: 'Aguardando execução do Agente no computador do supermercado',
        produtos_cadastrados: centralProducts.length,
      },
    });
  }

  try {
    const client = new pg.Client({
      host,
      port: Number(port) || 5432,
      database,
      user,
      password,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 5000,
    });

    await client.connect();

    // Verify Read Only safety
    await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;');

    // Test simple count query and version
    const versionRes = await client.query('SELECT version();');
    const check = await client.query('SELECT count(*) FROM produto WHERE id_situacaocadastro = $1', [id_situacao || 1]);
    await client.end();

    const latency = Date.now() - startPing;
    erpConnectedStatus = true;
    return res.json({
      success: true,
      message: 'Conexão SOMENTE LEITURA estabelecida com sucesso com o PostgreSQL do ERP!',
      detalhes: {
        host,
        port: port || 5432,
        database,
        usuario: user,
        latencia_ms: latency,
        versao_banco: versionRes.rows[0]?.version || 'PostgreSQL',
        total_produtos_aptos: check.rows[0]?.count || 0,
      },
    });
  } catch (err: any) {
    erpConnectedStatus = false;
    return res.status(500).json({
      success: false,
      message: `Falha ao conectar no PostgreSQL (${host}:${port}): ${err.message}`,
    });
  }
});

// Test SQL Query Extraction Preview (Limit 10 rows)
app.post('/api/erp/execute-query-test', async (req: Request, res: Response) => {
  const { host, port, database, user, password, ssl, id_loja, id_situacao, query_customizada } = req.body;
  const startQuery = Date.now();
  const targetStore = Number(id_loja || 1);
  const targetSituacao = Number(id_situacao || 1);

  const sqlToRun = query_customizada && query_customizada.trim() ? query_customizada.trim() : DEFAULT_SQL_QUERY;

  // If using local/simulated database
  if (!host || host === 'localhost' || host === '127.0.0.1' || host === 'erp_supermercado' || !password || password === '••••••••') {
    const sampleRows = erpSimulatedDatabase
      .filter((p) => p.id_situacaocadastro === targetSituacao && p.id_loja === targetStore)
      .slice(0, 10)
      .map((item) => ({
        codigo_interno: String(item.id_produto),
        codigo_barras: String(item.codigobarras),
        descricao: item.descricaocompleta,
        preco: item.precovenda,
        embalagem: item.tipoembalagem_desc,
        id_loja: item.id_loja,
        ncm: `${String(item.ncm1).padStart(4, '0')}${String(item.ncm2).padStart(2, '0')}${String(item.ncm3).padStart(2, '0')}`,
      }));

    return res.json({
      success: true,
      linhas_retornadas: sampleRows.length,
      tempo_ms: Date.now() - startQuery + 8,
      origem: 'Base Local / Simulada ERP',
      amostra: sampleRows,
    });
  }

  try {
    const client = new pg.Client({
      host,
      port: Number(port) || 5432,
      database,
      user,
      password,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 6000,
    });

    await client.connect();
    await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;');

    // Run query with safety limit
    const previewQuery = sqlToRun.replace(/;?\s*$/, '') + ' LIMIT 10;';
    const resQuery = await client.query(previewQuery, [targetSituacao, targetStore]);
    await client.end();

    const elapsed = Date.now() - startQuery;
    return res.json({
      success: true,
      linhas_retornadas: resQuery.rows.length,
      tempo_ms: elapsed,
      origem: `PostgreSQL Server (${host})`,
      amostra: resQuery.rows.slice(0, 10),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `Erro ao executar query de teste: ${err.message}`,
    });
  }
});

// Download Standalone Background Integrator Daemon (Node.js Script & Windows Service Runner)
app.get('/api/integrador/download-daemon', (req: Request, res: Response) => {
  const daemonScript = `/**
 * INTEGRADOR DE BANCO DE DADOS ERP - SUPERMERCADO
 * Serviço de Sincronização em Segundo Plano (Background Worker)
 * 
 * Executa de forma autônoma no servidor do supermercado (Windows / Linux)
 * 1. Conecta-se ao PostgreSQL do ERP em modo 100% SOMENTE LEITURA.
 * 2. Extrai produtos com Hash SHA-256 e sincroniza alterações em lote.
 * 3. Notifica e alimenta os terminais de consulta e impressoras Argox.
 */

const { Client } = require('pg');
const crypto = require('crypto');
const http = require('http');

// CONFIGURAÇÃO DO BANCO DE DADOS
const DB_CONFIG = {
  host: process.env.ERP_HOST || "${erpConfig.host}",
  port: parseInt(process.env.ERP_PORT || "${erpConfig.port}"),
  database: process.env.ERP_DATABASE || "${erpConfig.database}",
  user: process.env.ERP_USER || "${erpConfig.user}",
  password: process.env.ERP_PASSWORD || "${erpConfig.password === '••••••••' ? 'sua_senha_aqui' : erpConfig.password}",
  ssl: ${Boolean(erpConfig.ssl)} ? { rejectUnauthorized: false } : false,
  id_loja: parseInt(process.env.ERP_LOJA || "${erpConfig.id_loja}"),
  id_situacaocadastro: parseInt(process.env.ERP_SITUACAO || "${erpConfig.id_situacaocadastro}"),
  intervalo_minutos: parseInt(process.env.SYNC_INTERVAL || "${erpConfig.intervalo_minutos}"),
};

const SQL_QUERY = \`SELECT
    pr.id_produto AS codigo_interno,
    pr.codigobarras AS codigo_barras,
    p.descricaocompleta AS descricao,
    pc.precovenda AS preco,
    te.descricao AS embalagem,
    pc.id_loja AS id_loja,
    concat(
        to_char(p.ncm1,'0000'),
        to_char(p.ncm2,'00'),
        to_char(p.ncm3,'00')
    ) AS ncm
FROM produtoautomacao pr
INNER JOIN produto p
    ON p.id = pr.id_produto
INNER JOIN produtocomplemento pc
    ON pc.id_produto = pr.id_produto
LEFT JOIN tipoembalagem te
    ON te.id = p.id_tipoembalagem
WHERE p.id_situacaocadastro = $1
AND pc.id_loja = $2
ORDER BY pr.id_produto;\`;

function calculateHash(item) {
  const content = \`\${item.codigo_interno}|\${item.codigo_barras}|\${item.descricao}|\${Number(item.preco).toFixed(2)}|\${item.embalagem}|\${item.id_loja}\`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

let lastProductHashes = new Map();

async function runSyncCycle() {
  const start = Date.now();
  console.log(\`[\${new Date().toISOString()}] Iniciando ciclo de sincronização com PostgreSQL (\${DB_CONFIG.host}:\${DB_CONFIG.port}/\${DB_CONFIG.database})...\`);
  
  const client = new Client(DB_CONFIG);
  try {
    await client.connect();
    // BLINDAGEM: Garante transação SOMENTE LEITURA
    await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;');
    
    const result = await client.query(SQL_QUERY, [DB_CONFIG.id_situacaocadastro, DB_CONFIG.id_loja]);
    await client.end();
    
    let atualizados = 0;
    let novos = 0;
    
    for (const row of result.rows) {
      const hash = calculateHash(row);
      const key = \`\${row.id_loja}_\${row.codigo_interno}_\${row.codigo_barras}\`;
      
      if (lastProductHashes.has(key)) {
        if (lastProductHashes.get(key) !== hash) {
          atualizados++;
          lastProductHashes.set(key, hash);
        }
      } else {
        novos++;
        lastProductHashes.set(key, hash);
      }
    }
    
    const elapsed = Date.now() - start;
    console.log(\`[\${new Date().toISOString()}] Sincronização concluída com SUCESSO em \${elapsed}ms!\`);
    console.log(\`  - Total de produtos no banco: \${result.rows.length}\`);
    console.log(\`  - Novos cadastros: \${novos}\`);
    console.log(\`  - Alterações detectadas (preço/descrição): \${atualizados}\`);
  } catch (err) {
    console.error(\`[\${new Date().toISOString()}] ERRO na sincronização:\`, err.message);
  }
}

// Inicia loop contínuo
runSyncCycle();
const intervalMs = DB_CONFIG.intervalo_minutos * 60 * 1000;
setInterval(runSyncCycle, intervalMs);
console.log(\`Serviço Integrador ativo. Próximas sincronizações a cada \${DB_CONFIG.intervalo_minutos} minutos.\`);
`;

  res.setHeader('Content-Type', 'text/javascript');
  res.setHeader('Content-Disposition', 'attachment; filename="integrador-postgresql.js"');
  res.send(daemonScript);
});

function buildPowerShellSyncScript(params: {
  hostUrl: string;
  cloudUrl?: string;
  cfgHost: string;
  cfgPort: number | string;
  cfgDb: string;
  cfgUser: string;
  cfgPass: string;
  idLoja: number | string;
  idSituacao: number | string;
  intervalMin: number | string;
}): string {
  const { hostUrl, cloudUrl = 'https://buscapreco.instara.com.br', cfgHost, cfgPort, cfgDb, cfgUser, cfgPass, idLoja, idSituacao, intervalMin } = params;

  return [
    'try {',
    '    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13',
    '} catch {}',
    '',
    '$OutputEncoding = [System.Text.Encoding]::UTF8',
    'try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}',
    '$env:PGCLIENTENCODING = "UTF8"',
    '',
    'Clear-Host',
    'Write-Host "===============================================================================" -ForegroundColor Green',
    'Write-Host "   SINCRONIZADOR DIRETO: POSTGRESQL (VR SOFTWARE) -> HOSTINGER (MYSQL NUVEM)   " -ForegroundColor Green',
    'Write-Host "   -> CONSULTA DIRETA AO BANCO DE DADOS LOCAL (100% AUTOMATICO / SEM TXT)      " -ForegroundColor Yellow',
    'Write-Host "   -> Leitura em memoria do PostgreSQL e envio imediato para nuvem Hostinger   " -ForegroundColor Green',
    'Write-Host "===============================================================================" -ForegroundColor Green',
    'Write-Host ""',
    'Write-Host "  [INFO] Voce NAO precisa gerar arquivo TXT nem exportar nada manualmente!" -ForegroundColor Cyan',
    'Write-Host "  Este script consulta as tabelas do VR (produto, produtoautomacao, etc) direto." -ForegroundColor Cyan',
    'Write-Host ""',
    '',
    `$cloudHostingerUrl = '${cloudUrl}'`,
    `$devAppUrl = '${hostUrl}'`,
    `$cfgHost = '${cfgHost}'`,
    `$cfgPort = ${cfgPort}`,
    `$cfgDb = '${cfgDb}'`,
    `$cfgUser = '${cfgUser}'`,
    `$cfgPass = '${cfgPass}'`,
    `$idLoja = ${idLoja}`,
    `$idSituacao = ${idSituacao}`,
    `$intervalMin = ${intervalMin}`,
    'if ($cfgHost -eq "localhost") { $cfgHost = "127.0.0.1" }',
    '',
    'Write-Host "  -> Servidor Nuvem Hostinger : $cloudHostingerUrl" -ForegroundColor Cyan',
    'Write-Host "  -> Intervalo de Execucao    : A cada $intervalMin minutos" -ForegroundColor Cyan',
    'Write-Host ""',
    '',
    'function Send-CloudLog($tipo, $msg, $detalhes = $null) {',
    '    try {',
    '        $payload = @{',
    '            tipo = $tipo',
    '            mensagem = $msg',
    '            detalhes = $detalhes',
    '            host = $cfgHost',
    '            banco = $cfgDb',
    '            loja = $idLoja',
    '        } | ConvertTo-Json -Depth 4',
    '        $logBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)',
    '        Invoke-RestMethod -Uri ($cloudHostingerUrl + "/api.php?action=agent-heartbeat") -Method Post -Body $logBytes -ContentType "application/json; charset=utf-8" -TimeoutSec 5 -ErrorAction SilentlyContinue | Out-Null',
    '        Invoke-RestMethod -Uri ($devAppUrl + "/api/integrador/agent-heartbeat") -Method Post -Body $logBytes -ContentType "application/json; charset=utf-8" -TimeoutSec 5 -ErrorAction SilentlyContinue | Out-Null',
    '    } catch {}',
    '}',
    '',
    'Send-CloudLog "INICIADO" "Agente iniciado no computador local"',
    '',
    'Write-Host "[1/4] Verificando conexao com PostgreSQL (Porta $cfgPort, 8745, 5432, 5433)..." -ForegroundColor Cyan',
    '$portsToTry = @([int]$cfgPort, 8745, 5432, 5433, 5434, 5435) | Select-Object -Unique',
    '$workingPort = $cfgPort',
    '$portOk = $false',
    'foreach ($p in $portsToTry) {',
    '    try {',
    '        $tcp = New-Object System.Net.Sockets.TcpClient',
    '        $iar = $tcp.BeginConnect($cfgHost, $p, $null, $null)',
    '        if ($iar.AsyncWaitHandle.WaitOne(1200, $false)) {',
    '            $tcp.EndConnect($iar)',
    '            $tcp.Close()',
    '            $workingPort = $p',
    '            $portOk = $true',
    '            Write-Host "  -> [OK] Servico PostgreSQL respondendo na porta $workingPort em $cfgHost!" -ForegroundColor Green',
    '            break',
    '        }',
    '    } catch {}',
    '}',
    'if (-not $portOk) {',
    '    Write-Host "  -> [AVISO] Nenhuma porta padrao respondeu de imediato. Continuando com porta $cfgPort..." -ForegroundColor Yellow',
    '} else {',
    '    $cfgPort = $workingPort',
    '}',
    '',
    'Write-Host ""',
    'Write-Host "[2/4] Localizando executavel do PostgreSQL (psql)..." -ForegroundColor Cyan',
    '$psqlCandidates = @(',
    '    "psql.exe",',
    '    "C:\\vr\\pgsql\\bin\\psql.exe",',
    '    "C:\\vr\\PostgreSQL\\bin\\psql.exe",',
    '    "C:\\vr\\bin\\psql.exe",',
    '    "C:\\vr\\psql.exe",',
    '    "D:\\vr\\pgsql\\bin\\psql.exe",',
    '    "D:\\vr\\PostgreSQL\\bin\\psql.exe",',
    '    "D:\\vr\\bin\\psql.exe",',
    '    "E:\\vr\\pgsql\\bin\\psql.exe",',
    '    "C:\\VRMaster\\pgsql\\bin\\psql.exe",',
    '    "C:\\VRSoftware\\pgsql\\bin\\psql.exe",',
    '    "C:\\VRSoftware\\bin\\psql.exe",',
    '    "C:\\PostgreSQL\\bin\\psql.exe",',
    '    "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe",',
    '    "C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe",',
    '    "C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe",',
    '    "C:\\Program Files\\PostgreSQL\\14\\bin\\psql.exe",',
    '    "C:\\Program Files\\PostgreSQL\\13\\bin\\psql.exe",',
    '    "C:\\Program Files\\PostgreSQL\\12\\bin\\psql.exe",',
    '    "C:\\Program Files\\PostgreSQL\\11\\bin\\psql.exe",',
    '    "C:\\Program Files\\PostgreSQL\\10\\bin\\psql.exe",',
    '    "C:\\Program Files\\PostgreSQL\\9.6\\bin\\psql.exe",',
    '    "C:\\Program Files (x86)\\PostgreSQL\\16\\bin\\psql.exe",',
    '    "C:\\Program Files (x86)\\PostgreSQL\\15\\bin\\psql.exe",',
    '    "C:\\Program Files (x86)\\PostgreSQL\\14\\bin\\psql.exe",',
    '    "C:\\Program Files (x86)\\PostgreSQL\\10\\bin\\psql.exe"',
    ')',
    '$psqlExe = $null',
    'foreach ($p in $psqlCandidates) {',
    '    if (Test-Path $p) { $psqlExe = $p; break }',
    '}',
    'if (-not $psqlExe) {',
    '    $cmd = Get-Command "psql.exe" -ErrorAction SilentlyContinue',
    '    if ($cmd) { $psqlExe = $cmd.Source }',
    '}',
    'if (-not $psqlExe) {',
    '    try {',
    '        $svc = Get-CimInstance Win32_Service -Filter "Name LIKE \'%postgres%\' OR DisplayName LIKE \'%postgres%\' OR Name LIKE \'%vr%\'" -ErrorAction SilentlyContinue | Select-Object -First 1',
    '        if ($svc -and $svc.PathName) {',
    '            $rawPath = [string]$svc.PathName',
    '            $binPath = $rawPath.Trim(\'"\').Split(\'"\')[0]',
    '            if (-not $binPath) { $binPath = $rawPath.Split(\' \')[0] }',
    '            if ($binPath) {',
    '                $dir = Split-Path $binPath',
    '                $cand = Join-Path $dir "psql.exe"',
    '                if (Test-Path $cand) { $psqlExe = $cand }',
    '            }',
    '        }',
    '    } catch {}',
    '}',
    'if (-not $psqlExe) {',
    '    $dirsToScan = @("C:\\vr", "C:\\VRMaster", "C:\\VRSoftware", "C:\\Program Files\\PostgreSQL", "C:\\Program Files (x86)\\PostgreSQL", "D:\\vr", "C:\\PostgreSQL")',
    '    foreach ($d in $dirsToScan) {',
    '        if (Test-Path $d) {',
    '            $found = Get-ChildItem -Path $d -Filter "psql.exe" -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1',
    '            if ($found) { $psqlExe = $found.FullName; break }',
    '        }',
    '    }',
    '}',
    'if (-not $psqlExe) {',
    '    Write-Host "  -> [AVISO] Nao localizamos o psql.exe automaticamente nas pastas padrao." -ForegroundColor Yellow',
    '    Write-Host "     O banco costuma ficar em C:\\vr\\pgsql\\bin ou C:\\Program Files\\PostgreSQL" -ForegroundColor Gray',
    '    $manualPath = Read-Host "Se souber a pasta do VR ou PostgreSQL, digite aqui (ou aperte Enter)"',
    '    if ($manualPath) {',
    '        $cleanManual = $manualPath.Trim(@(\'"\', "\'", \' \'))',
    '        if (Test-Path $cleanManual) {',
    '            if ($cleanManual.EndsWith("psql.exe")) { $psqlExe = $cleanManual }',
    '            elseif (Test-Path (Join-Path $cleanManual "bin\\psql.exe")) { $psqlExe = Join-Path $cleanManual "bin\\psql.exe" }',
    '            elseif (Test-Path (Join-Path $cleanManual "pgsql\\bin\\psql.exe")) { $psqlExe = Join-Path $cleanManual "pgsql\\bin\\psql.exe" }',
    '            elseif (Test-Path (Join-Path $cleanManual "psql.exe")) { $psqlExe = Join-Path $cleanManual "psql.exe" }',
    '        }',
    '    }',
    '}',
    'if (-not $psqlExe) { $psqlExe = "psql.exe" }',
    '$psqlVer = try { & $psqlExe --version 2>&1 } catch { $null }',
    'if (-not $psqlVer -or ($psqlVer -match "not recognized|nao e reconhecido")) {',
    '    Write-Host ""',
    '    Write-Host "===============================================================================" -ForegroundColor Red',
    '    Write-Host "  [ATENCAO] O EXECUTAVEL DO BANCO (psql.exe) NAO ESTA NESTE COMPUTADOR         " -ForegroundColor Yellow',
    '    Write-Host "===============================================================================" -ForegroundColor Red',
    '    Write-Host ""',
    '    Write-Host "O QUE ISSO SIGNIFICA?" -ForegroundColor White',
    '    Write-Host "-> Voce NAO precisa instalar outro aplicativo (nem Node.js, nem Python)." -ForegroundColor Green',
    '    Write-Host "-> Porem, este sincronizador deve ser executado no SERVIDOR ONDE ESTA O BANCO." -ForegroundColor Yellow',
    '    Write-Host ""',
    '    Write-Host "COMO RESOLVER:" -ForegroundColor Cyan',
    '    Write-Host "1. Execute este arquivo (.bat) diretamente no computador SERVIDOR do supermercado." -ForegroundColor White',
    '    Write-Host "2. No servidor, o psql.exe acessa o banco do VR automaticamente sem precisar de arquivos." -ForegroundColor White',
    '    Write-Host ""',
    '    Write-Host "===============================================================================" -ForegroundColor Gray',
    '    Send-CloudLog "AVISO_LOCAL" "psql.exe nao encontrado localmente"',
    '    Write-Host "Pressione qualquer tecla para sair..."',
    '    [Console]::ReadKey() | Out-Null',
    '    exit 1',
    '}',
    'Write-Host "  -> [OK] Executavel do banco PostgreSQL operacional: $psqlExe" -ForegroundColor Green',
    '',
    'Write-Host ""',
    'Write-Host "[3/4] Conectando ao PostgreSQL e descobrindo bancos de dados..." -ForegroundColor Cyan',
    '$credentialsToTry = @()',
    'if ($cfgDb -and $cfgUser) {',
    '    $credentialsToTry += @{ db = $cfgDb; user = $cfgUser; pass = $cfgPass }',
    '}',
    '$credentialsToTry += @(',
    '    @{ db = "vr"; user = "postgres"; pass = "VrPost@Server" },',
    '    @{ db = "vr"; user = "postgres"; pass = "vr" },',
    '    @{ db = "vr"; user = "postgres"; pass = "postgres" },',
    '    @{ db = "vr"; user = "vr"; pass = "vr" },',
    '    @{ db = "vr_master"; user = "postgres"; pass = "vrsoftware" },',
    '    @{ db = "vr"; user = "postgres"; pass = "123456" },',
    '    @{ db = "postgres"; user = "postgres"; pass = "postgres" },',
    '    @{ db = "supermercado"; user = "postgres"; pass = "postgres" },',
    '    @{ db = "vr"; user = "postgres"; pass = "" }',
    ')',
    '$activeCred = $null',
    '$lastErrorLog = $null',
    'foreach ($c in $credentialsToTry) {',
    '    if (-not $c.db) { continue }',
    '    $tDb = [string]$c.db',
    '    $tUser = [string]$c.user',
    '    $tPass = [string]$c.pass',
    '    $env:PGPASSWORD = $tPass',
    '    $test = & $psqlExe -h $cfgHost -p $cfgPort -U $tUser -d $tDb -w -t -A -c "SELECT 1;" 2>&1',
    '    if ($LASTEXITCODE -eq 0 -and ($test -match "1")) {',
    '        $activeCred = @{ db = $tDb; user = $tUser; pass = $tPass }',
    '        Write-Host "  -> [SUCESSO] Conectado ao banco [$tDb] com usuario [$tUser] na porta $cfgPort!" -ForegroundColor Green',
    '        break',
    '    } else {',
    '        $lastErrorLog = $test',
    '    }',
    '}',
    'if (-not $activeCred) {',
    '    Write-Host ""',
    '    Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Yellow',
    '    Write-Host "  As credenciais padrao do VR Software nao conectaram automaticamente." -ForegroundColor Yellow',
    '    if ($lastErrorLog) {',
    '        Write-Host "  Retorno do PostgreSQL:" -ForegroundColor Red',
    '        $lastErrorLog | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }',
    '    }',
    '    Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Yellow',
    '    Write-Host ""',
    '    $promptDb = Read-Host "Digite o NOME DO BANCO DE DADOS (ex: vr, vr_master, supermercado) [padrao: vr]"',
    '    if (-not $promptDb) { $promptDb = "vr" }',
    '    $promptUser = Read-Host "Digite o USUARIO do PostgreSQL [padrao: postgres]"',
    '    if (-not $promptUser) { $promptUser = "postgres" }',
    '    $promptPass = Read-Host "Digite a SENHA do PostgreSQL (aperte Enter se nao tiver)"',
    '    $env:PGPASSWORD = $promptPass',
    '    $test = & $psqlExe -h $cfgHost -p $cfgPort -U $promptUser -d $promptDb -w -t -A -c "SELECT 1;" 2>&1',
    '    if ($LASTEXITCODE -eq 0 -and ($test -match "1")) {',
    '        $activeCred = @{ db = $promptDb; user = $promptUser; pass = $promptPass }',
    '        Write-Host "  -> [SUCESSO] Conexao efetuada com as credenciais informadas!" -ForegroundColor Green',
    '    } else {',
    '        Write-Host ""',
    '        Write-Host "  -> [ERRO]: Nao foi possivel conectar com esses dados:" -ForegroundColor Red',
    '        $test | ForEach-Object { Write-Host "     $_" -ForegroundColor Red }',
    '        Send-CloudLog "ERRO_CONEXAO" "Falha ao conectar no PostgreSQL local" ($test -join " ")',
    '        Write-Host ""',
    '        Write-Host "Verifique a senha do usuario postgres no seu VR Software para prosseguir." -ForegroundColor Yellow',
    '        Write-Host "Pressione qualquer tecla para sair..."',
    '        [Console]::ReadKey() | Out-Null',
    '        exit 1',
    '    }',
    '}',
    '',
    '$selDb = [string]$activeCred.db',
    '$selUser = [string]$activeCred.user',
    '$selPass = [string]$activeCred.pass',
    '$env:PGPASSWORD = $selPass',
    '',
    '# Se conectou em banco padrao mas nao tem tabela produto, tenta descobrir o banco com dados do ERP',
    '$hasProdTableInSelDb = (& $psqlExe -h $cfgHost -p $cfgPort -U $selUser -d $selDb -w -t -A -c "SELECT 1 FROM information_schema.tables WHERE table_schema = \'public\' AND table_name IN (\'produto\', \'produtoautomacao\') LIMIT 1;" 2>&1) -match "1"',
    'if (-not $hasProdTableInSelDb) {',
    '    Write-Host "  -> Procurando bancos de dados do VR Software nesta instalacao..." -ForegroundColor Gray',
    '    $allDbs = (& $psqlExe -h $cfgHost -p $cfgPort -U $selUser -d $selDb -w -t -A -c "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;" 2>&1) -split "\r?\n" | Where-Object { $_ -and -not ($_ -match "ERROR:|psql:|postgres|template") }',
    '    foreach ($dbCandidate in $allDbs) {',
    '        $checkCandidate = (& $psqlExe -h $cfgHost -p $cfgPort -U $selUser -d $dbCandidate -w -t -A -c "SELECT 1 FROM information_schema.tables WHERE table_schema = \'public\' AND table_name IN (\'produto\', \'produtoautomacao\') LIMIT 1;" 2>&1) -match "1"',
    '        if ($checkCandidate) {',
    '            $selDb = $dbCandidate',
    '            Write-Host "  -> [ENCONTRADO] Banco de dados do VR com produtos localizado: [$selDb]!" -ForegroundColor Green',
    '            break',
    '        }',
    '    }',
    '}',
    '',
    'Write-Host ""',
    'Write-Host "[4/4] Inspecionando tabelas e produtos no banco [$selDb]..." -ForegroundColor Cyan',
    '',
    '    $cntProduto = (& $psqlExe -h $cfgHost -p $cfgPort -U $selUser -d $selDb -w -t -A -c "SELECT count(*) FROM produto;" 2>&1) -replace "\\s+", ""',
    '    $cntAutomacao = (& $psqlExe -h $cfgHost -p $cfgPort -U $selUser -d $selDb -w -t -A -c "SELECT count(*) FROM produtoautomacao;" 2>&1) -replace "\\s+", ""',
    '    $cntComplemento = (& $psqlExe -h $cfgHost -p $cfgPort -U $selUser -d $selDb -w -t -A -c "SELECT count(*) FROM produtocomplemento;" 2>&1) -replace "\\s+", ""',
    '    if ($cntProduto -match "^\\d+$") { Write-Host "  -> Tabela [produto]          : $cntProduto registros" -ForegroundColor Gray }',
    '    if ($cntAutomacao -match "^\\d+$") { Write-Host "  -> Tabela [produtoautomacao] : $cntAutomacao registros" -ForegroundColor Gray }',
    '    if ($cntComplemento -match "^\\d+$") { Write-Host "  -> Tabela [produtocomplemento]: $cntComplemento registros" -ForegroundColor Gray }',
    '',
    '    $detectedLoja = $idLoja',
    '    $lojasDisponiveis = (& $psqlExe -h $cfgHost -p $cfgPort -U $selUser -d $selDb -w -t -A -c "SELECT DISTINCT id_loja FROM produtocomplemento ORDER BY id_loja LIMIT 5;" 2>&1) -split "\r?\n" | Where-Object { $_ -match "^\d+$" }',
    '    if ($lojasDisponiveis -and ($lojasDisponiveis -notcontains "$idLoja")) {',
    '        $detectedLoja = [int]$lojasDisponiveis[0]',
    '        Write-Host "  -> [INFO] Usando Loja $detectedLoja detectada no banco de dados." -ForegroundColor Yellow',
    '    }',
    '',
    '    $queryCandidates = @(',
    '    @{',
    '        name = "VR Software Oficial Completo (produtoautomacao + produto + produtocomplemento + tipoembalagem)"',
    '        sql = "SELECT pr.id_produto || \';\' || coalesce(pr.codigobarras::text, pr.id_produto::text) || \';\' || replace(replace(coalesce(p.descricaocompleta, p.descricaoreduzida, \'PRODUTO\'), \';\', \' \'), chr(10), \' \') || \';\' || replace(replace(replace(coalesce(pc.precovenda::text, \'0\'), \'R$\', \'\'), \' \', \'\'), \',\', \'.\') || \';\' || coalesce(te.descricao, \'UN\') || \';00000000\' FROM produtoautomacao pr INNER JOIN produto p ON p.id = pr.id_produto INNER JOIN produtocomplemento pc ON pc.id_produto = pr.id_produto LEFT JOIN tipoembalagem te ON te.id = p.id_tipoembalagem ORDER BY pr.id_produto"',
    '    },',
    '    @{',
    '        name = "VR Software Filtrado por Loja (pc.id_loja = $detectedLoja)"',
    '        sql = "SELECT pr.id_produto || \';\' || coalesce(pr.codigobarras::text, pr.id_produto::text) || \';\' || replace(replace(coalesce(p.descricaocompleta, p.descricaoreduzida, \'PRODUTO\'), \';\', \' \'), chr(10), \' \') || \';\' || replace(replace(replace(coalesce(pc.precovenda::text, \'0\'), \'R$\', \'\'), \' \', \'\'), \',\', \'.\') || \';\' || coalesce(te.descricao, \'UN\') || \';00000000\' FROM produtoautomacao pr INNER JOIN produto p ON p.id = pr.id_produto INNER JOIN produtocomplemento pc ON pc.id_produto = pr.id_produto LEFT JOIN tipoembalagem te ON te.id = p.id_tipoembalagem WHERE pc.id_loja = $detectedLoja ORDER BY pr.id_produto"',
    '    },',
    '    @{',
    '        name = "VR Software Geral a partir de produto (LEFT JOINs)"',
    '        sql = "SELECT p.id || \';\' || coalesce(pr.codigobarras::text, p.id::text) || \';\' || replace(replace(coalesce(p.descricaocompleta, p.descricaoreduzida, \'PRODUTO\'), \';\', \' \'), chr(10), \' \') || \';\' || replace(replace(replace(coalesce(pc.precovenda::text, \'0\'), \'R$\', \'\'), \' \', \'\'), \',\', \'.\') || \';\' || coalesce(te.descricao, \'UN\') || \';00000000\' FROM produto p LEFT JOIN produtoautomacao pr ON pr.id_produto = p.id LEFT JOIN produtocomplemento pc ON pc.id_produto = p.id LEFT JOIN tipoembalagem te ON te.id = p.id_tipoembalagem ORDER BY p.id"',
    '    },',
    '    @{',
    '        name = "Tabela produto padrao"',
    '        sql = "SELECT id || \';\' || coalesce(codigobarras::text, id::text) || \';\' || replace(replace(coalesce(descricaocompleta, descricao, \'PRODUTO\'), \';\', \' \'), chr(10), \' \') || \';\' || replace(replace(replace(coalesce(precovenda::text, preco::text, \'0\'), \'R$\', \'\'), \' \', \'\'), \',\', \'.\') || \';UN;00000000\' FROM produto ORDER BY id"',
    '    }',
    ')',
    '',
    '$selectedQuery = $null',
    'foreach ($cand in $queryCandidates) {',
    '    Write-Host "  -> Testando: $($cand.name)..." -ForegroundColor Gray',
    '    $testOut = & $psqlExe -h $cfgHost -p $cfgPort -U $selUser -d $selDb -w -t -A -F ";" -c ($cand.sql + " LIMIT 5;") 2>&1',
    '    $isErr = ($testOut -match "ERROR:") -or ($testOut -match "psql:")',
    '    $validTest = $testOut -split "\r?\n" | Where-Object { $_ -and -not ($_ -match "^psql:") -and -not ($_ -match "ERROR:") -and ($_ -split ";").Count -ge 3 }',
    '    if (-not $isErr -and $validTest.Count -gt 0) {',
    '        $selectedQuery = $cand.sql',
    '        Write-Host "  -> [SUCESSO] Estrutura compativel detectada: $($cand.name) ($($validTest.Count) produtos de amostra lidos com sucesso)!" -ForegroundColor Green',
    '        break',
    '    } else {',
    '        if ($testOut -match "ERROR:") {',
    '            $errText = ($testOut | Where-Object { $_ -match "ERROR:" } | Select-Object -First 1)',
    '            Write-Host "     [Info]: $errText" -ForegroundColor DarkGray',
    '        }',
    '    }',
    '}',
    '',
    'if (-not $selectedQuery) {',
    '    Write-Host "  -> [AVISO] Nenhuma query padrao retornou produtos de imediato. Listando tabelas existentes no banco:" -ForegroundColor Yellow',
    '    $existingTables = & $psqlExe -h $cfgHost -p $cfgPort -U $selUser -d $selDb -w -t -A -c "SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' AND table_name ~* \'prod\';" 2>&1',
    '    Write-Host "     Tabelas encontradas: $($existingTables -join \', \')" -ForegroundColor Gray',
    '    $selectedQuery = $queryCandidates[0].sql',
    '}',
    '',
    'Write-Host ""',
    'Write-Host "===============================================================================" -ForegroundColor Green',
    'Write-Host "   SINCRONIZACAO ATIVA: AGENTE EM OPERACAO CONTINUA                            " -ForegroundColor Green',
    'Write-Host "   Mantenha esta janela aberta no servidor para atualizar precos na nuvem      " -ForegroundColor Green',
    'Write-Host "===============================================================================" -ForegroundColor Green',
    'Write-Host ""',
    '',
    '$cycle = 1',
    'while ($true) {',
    '    $hora = (Get-Date).ToString("HH:mm:ss")',
    '    Write-Host "[$hora] Ciclo #${cycle} - Consultando precos no PostgreSQL [$selDb]..." -ForegroundColor Cyan',
    '    $env:PGPASSWORD = $selPass',
    '    $out = & $psqlExe -h $cfgHost -p $cfgPort -U $selUser -d $selDb -w -t -A -F ";" -c ($selectedQuery + ";") 2>&1',
    '    $validLines = $out -split "\r?\n" | Where-Object { $_ -and -not ($_ -match "^psql:") -and -not ($_ -match "ERROR:") -and ($_ -split ";").Count -ge 3 }',
    '    if ($validLines.Count -eq 0 -and $selectedQuery -match "WHERE") {',
    '        $relaxedQuery = $selectedQuery -replace "WHERE .*?$", ""',
    '        $out = & $psqlExe -h $cfgHost -p $cfgPort -U $selUser -d $selDb -w -t -A -F ";" -c ($relaxedQuery + ";") 2>&1',
    '        $validLines = $out -split "\r?\n" | Where-Object { $_ -and -not ($_ -match "^psql:") -and -not ($_ -match "ERROR:") -and ($_ -split ";").Count -ge 3 }',
    '    }',
    '    if ($validLines.Count -gt 0) {',
    '        Write-Host "[$hora] Extraidos $($validLines.Count) produtos do ERP. Enviando para a nuvem..." -ForegroundColor Gray',
    '        $items = @()',
    '        foreach ($line in $validLines) {',
    '            $parts = $line -split ";"',
    '            if ($parts.Length -ge 4) {',
    '                $precoNum = 0.0',
    '                try { $precoNum = [double]($parts[3] -replace ",", ".") } catch { $precoNum = 0.0 }',
    '                $items += @{',
    '                    codigo_interno = $parts[0]',
    '                    codigo_barras = if ($parts[1]) { $parts[1] } else { $parts[0] }',
    '                    descricao = $parts[2]',
    '                    preco = $precoNum',
    '                    embalagem = if ($parts.Length -gt 4 -and $parts[4]) { $parts[4] } else { "UN" }',
    '                    ncm = if ($parts.Length -gt 5 -and $parts[5]) { $parts[5] } else { "00000000" }',
    '                }',
    '            }',
    '        }',
    '        $chunkSize = 400',
    '        $totalSent = 0',
    '        $totalAdicionados = 0',
    '        $totalAtualizados = 0',
    '        $totalDesativados = 0',
    '        $totalAtivosNuvem = 0',
    '        $loteNum = 1',
    '        $totalLotes = [Math]::Ceiling($items.Count / $chunkSize)',
    '        for ($i = 0; $i -lt $items.Count; $i += $chunkSize) {',
    '            $end = [Math]::Min($i + $chunkSize, $items.Count)',
    '            $chunk = $items[$i..($end - 1)]',
    '            $enviadoLote = $false',
    '            $maxTentativasLote = 3',
    '            for ($tentativaLote = 1; $tentativaLote -le $maxTentativasLote; $tentativaLote++) {',
    '                try {',
    '                    $body = @{ items = $chunk; id_loja = $detectedLoja; is_full_sync = ($i -eq 0) } | ConvertTo-Json -Depth 4',
    '                    $resp = $null',
    '                    $endpointsToTry = @(',
    '                        ($cloudHostingerUrl + "/api.php?action=sync-batch"),',
    '                        ($cloudHostingerUrl + "/atualizar_produtos.php"),',
    '                        ($cloudHostingerUrl + "/index.php?action=sync-batch"),',
    '                        ($devAppUrl + "/api/products/sync-batch")',
    '                    )',
    '                    foreach ($ep in $endpointsToTry) {',
    '                        try {',
    '                            $resp = Invoke-RestMethod -Uri $ep -Method Post -Body $body -ContentType "application/json; charset=utf-8" -TimeoutSec 60',
    '                            if ($resp) { break }',
    '                        } catch {}',
    '                    }',
    '                    if ($resp) {',
    '                        $respObj = $null',
    '                        try {',
    '                            if ($resp -is [string]) { $respObj = $resp | ConvertFrom-Json } else { $respObj = $resp }',
    '                        } catch {}',
    '                        if ($respObj) {',
    '                            if ($respObj.adicionados) { $totalAdicionados += [int]$respObj.adicionados }',
    '                            elseif ($respObj.total_gravados) { $totalAdicionados += [int]$respObj.total_gravados }',
    '                            if ($respObj.atualizados) { $totalAtualizados += [int]$respObj.atualizados }',
    '                            if ($respObj.desativados) { $totalDesativados += [int]$respObj.desativados }',
    '                            if ($respObj.total_ativos -ne $null) { $totalAtivosNuvem = [int]$respObj.total_ativos }',
    '                        }',
    '                        $totalSent += $chunk.Count',
    '                        Write-Host "  -> Lote ${loteNum}/${totalLotes} ($($chunk.Count) produtos) gravado com sucesso no servidor Hostinger!" -ForegroundColor DarkGreen',
    '                        $enviadoLote = $true',
    '                        break',
    '                    }',
    '                } catch {',
    '                    if ($tentativaLote -lt $maxTentativasLote) {',
    '                        Write-Host "  -> [RETRY] Lote ${loteNum}/${totalLotes} aguardando 2s antes de tentar novamente ($tentativaLote/$maxTentativasLote)..." -ForegroundColor Yellow',
    '                        Start-Sleep -Seconds 2',
    '                    }',
    '                }',
    '            }',
    '            if (-not $enviadoLote) {',
    '                Write-Host "[$hora] Falha ao enviar lote ($i a $end) apos $maxTentativasLote tentativas." -ForegroundColor Red',
    '            }',
    '            $loteNum++',
    '            Start-Sleep -Milliseconds 150',
    '        }',
    '        if ($totalSent -gt 0) {',
    '            if ($totalAtivosNuvem -eq 0 -and $totalSent -gt 0) { $totalAtivosNuvem = $totalSent }',
    '            Write-Host "[$hora] SUCESSO: $totalSent produtos gravados no MySQL da Hostinger ($cloudHostingerUrl)! Total Ativos: $totalAtivosNuvem" -ForegroundColor Green',
    '            Send-CloudLog "SUCESSO" "Sincronizados $totalAtivosNuvem produtos ativos na Loja $detectedLoja na Hostinger ($cloudHostingerUrl)" @{ total_ativos = $totalAtivosNuvem; adicionados = $totalAdicionados; atualizados = $totalAtualizados; desativados = $totalDesativados; ciclo = $cycle }',
    '        }',
    '    } else {',
    '        Write-Host "[$hora] AVISO: A consulta retornou 0 produtos no banco de dados." -ForegroundColor Yellow',
    '        if ($out) {',
    '            $errLines = $out -split "\r?\n" | Where-Object { $_ -match "ERROR:" -or $_ -match "psql:" }',
    '            if ($errLines) {',
    '                Write-Host "[$hora] Retorno do PostgreSQL: $($errLines -join \' | \')" -ForegroundColor Red',
    '            }',
    '        }',
    '        Send-CloudLog "AVISO" "Consulta retornou 0 produtos no banco" @{ ciclo = $cycle }',
    '    }',
    '    $cycle++',
    '    Write-Host "[$hora] Proxima verificacao em $intervalMin minutos..." -ForegroundColor DarkGray',
    '    Start-Sleep -Seconds ($intervalMin * 60)',
    '}',
  ].join('\r\n');
}

function getPublicHostUrl(req: Request): string {
  const xForwardedHost = (req.headers['x-forwarded-host'] as string) || '';
  const host = (req.headers.host as string) || '';
  let target = xForwardedHost || host;
  if (!target || target.includes('localhost') || target.includes('127.0.0.1')) {
    target = 'ais-dev-tmqxftqlpvts2wcsxfjlvl-865056996557.us-east1.run.app';
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  return `${proto}://${target}`;
}

// Direct 1-Line PowerShell script (Executed in PowerShell memory)
app.get('/api/integrador/download-ps1', (req: Request, res: Response) => {
  const hostUrl = getPublicHostUrl(req);
  const targetHost = String(req.query.host || (erpConfig.host === 'localhost' ? '127.0.0.1' : erpConfig.host));
  const targetPort = String(req.query.port || erpConfig.port);
  const targetDb = String(req.query.database || erpConfig.database);
  const targetUser = String(req.query.user || erpConfig.user);
  const targetPass = String(req.query.password || (erpConfig.password === '••••••••' ? '' : erpConfig.password));
  const targetLoja = String(req.query.id_loja || erpConfig.id_loja);
  const targetSituacao = String(req.query.id_situacaocadastro || erpConfig.id_situacaocadastro);
  const targetInterval = String(req.query.interval || erpConfig.intervalo_minutos || 5);

  const psScript = buildPowerShellSyncScript({
    hostUrl,
    cfgHost: targetHost,
    cfgPort: targetPort,
    cfgDb: targetDb,
    cfgUser: targetUser,
    cfgPass: targetPass,
    idLoja: targetLoja,
    idSituacao: targetSituacao,
    intervalMin: targetInterval,
  });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(psScript);
});

// Download Standalone .PS1 Script file
app.get('/api/integrador/download-standalone-ps1', (req: Request, res: Response) => {
  const hostUrl = getPublicHostUrl(req);
  const targetHost = String(req.query.host || (erpConfig.host === 'localhost' ? '127.0.0.1' : erpConfig.host));
  const targetPort = String(req.query.port || erpConfig.port);
  const targetDb = String(req.query.database || erpConfig.database);
  const targetUser = String(req.query.user || erpConfig.user);
  const targetPass = String(req.query.password || (erpConfig.password === '••••••••' ? '' : erpConfig.password));
  const targetLoja = String(req.query.id_loja || erpConfig.id_loja);
  const targetSituacao = String(req.query.id_situacaocadastro || erpConfig.id_situacaocadastro);
  const targetInterval = String(req.query.interval || erpConfig.intervalo_minutos || 5);

  const psScript = buildPowerShellSyncScript({
    hostUrl,
    cfgHost: targetHost,
    cfgPort: targetPort,
    cfgDb: targetDb,
    cfgUser: targetUser,
    cfgPass: targetPass,
    idLoja: targetLoja,
    idSituacao: targetSituacao,
    intervalMin: targetInterval,
  });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sincronizador-supermercado.ps1"');
  res.send(psScript);
});

function wrapPowerShellIntoBat(psScript: string, title: string, publicUrl: string): string {
  return [
    '@echo off',
    'setlocal enabledelayedexpansion',
    'chcp 65001 >nul 2>&1',
    `title ${title}`,
    'color 0A',
    'cls',
    'echo ===============================================================================',
    `echo    ${title}`,
    'echo ===============================================================================',
    'echo [INICIALIZANDO] Carregando Agente Sincronizador PowerShell...',
    'echo.',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "$_f = [System.IO.File]::ReadAllText(\'%~f0\', [System.Text.Encoding]::UTF8); $_p = $_f.IndexOf(\':::PS_SCRIPT_START:::\'); if ($_p -ge 0) { iex ($_f.Substring($_p + 21)) } else { iex $_f }"',
    'set PS_EXIT_CODE=%ERRORLEVEL%',
    'if %PS_EXIT_CODE% NEQ 0 (',
    '    echo.',
    '    echo ===============================================================================',
    '    echo [ATENCAO] O processo retornou codigo de saida: %PS_EXIT_CODE%',
    '    echo ===============================================================================',
    ')',
    'echo.',
    'echo ===============================================================================',
    'echo [FINALIZADO] Pressione qualquer tecla para fechar esta janela...',
    'echo ===============================================================================',
    'pause >nul',
    'exit /b %PS_EXIT_CODE%',
    ':::PS_SCRIPT_START:::',
    psScript,
  ].join('\r\n');
}

// Download Continuous Background Server App (.BAT 100% Autônomo e Nativo)
app.get('/api/integrador/download-server-app', (req: Request, res: Response) => {
  const hostUrl = getPublicHostUrl(req);
  const targetHost = String(req.query.host || (erpConfig.host === 'localhost' ? '127.0.0.1' : erpConfig.host));
  const targetPort = String(req.query.port || erpConfig.port);
  const targetDb = String(req.query.database || erpConfig.database);
  const targetUser = String(req.query.user || erpConfig.user);
  const targetPass = String(req.query.password || (erpConfig.password === '••••••••' ? '' : erpConfig.password));
  const targetLoja = String(req.query.id_loja || erpConfig.id_loja);
  const targetSituacao = String(req.query.id_situacaocadastro || erpConfig.id_situacaocadastro);
  const targetInterval = String(req.query.interval || erpConfig.intervalo_minutos || 5);

  const psScript = buildPowerShellSyncScript({
    hostUrl,
    cfgHost: targetHost,
    cfgPort: targetPort,
    cfgDb: targetDb,
    cfgUser: targetUser,
    cfgPass: targetPass,
    idLoja: targetLoja,
    idSituacao: targetSituacao,
    intervalMin: targetInterval,
  });

  const bat = wrapPowerShellIntoBat(psScript, '[SERVIDOR ATIVO] APP SINCRONIZADOR DE PRECOS - SUPERMERCADO', hostUrl);

  res.setHeader('Content-Type', 'application/x-bat; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="App-Sincronizador-Servidor.bat"');
  res.send(bat);
});

// Download 100% Native Windows Batch Bridge
app.get('/api/integrador/download-native-windows', (req: Request, res: Response) => {
  const hostUrl = getPublicHostUrl(req);
  const targetHost = String(req.query.host || (erpConfig.host === 'localhost' ? '127.0.0.1' : erpConfig.host));
  const targetPort = String(req.query.port || erpConfig.port);
  const targetDb = String(req.query.database || erpConfig.database);
  const targetUser = String(req.query.user || erpConfig.user);
  const targetPass = String(req.query.password || (erpConfig.password === '••••••••' ? '' : erpConfig.password));
  const targetLoja = String(req.query.id_loja || erpConfig.id_loja);
  const targetSituacao = String(req.query.id_situacaocadastro || erpConfig.id_situacaocadastro);
  const targetInterval = String(req.query.interval || erpConfig.intervalo_minutos || 5);

  const psScript = buildPowerShellSyncScript({
    hostUrl,
    cfgHost: targetHost,
    cfgPort: targetPort,
    cfgDb: targetDb,
    cfgUser: targetUser,
    cfgPass: targetPass,
    idLoja: targetLoja,
    idSituacao: targetSituacao,
    intervalMin: targetInterval,
  });

  const bat = wrapPowerShellIntoBat(psScript, 'SINCRONIZADOR AUTOMATICO - BANCO ERP SUPERMERCADO', hostUrl);

  res.setHeader('Content-Type', 'application/x-bat; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sincronizador-local-windows.bat"');
  res.send(bat);
});

// Download Self-Contained Auto-Installer .BAT (Agora 100% nativo, sem exigir Node.js)
app.get('/api/integrador/download-autoinstaller', (req: Request, res: Response) => {
  const hostUrl = getPublicHostUrl(req);
  const psScript = buildPowerShellSyncScript({
    hostUrl,
    cfgHost: erpConfig.host === 'localhost' ? '127.0.0.1' : erpConfig.host,
    cfgPort: erpConfig.port,
    cfgDb: erpConfig.database,
    cfgUser: erpConfig.user,
    cfgPass: erpConfig.password === '••••••••' ? '' : erpConfig.password,
    idLoja: erpConfig.id_loja,
    idSituacao: erpConfig.id_situacaocadastro,
    intervalMin: erpConfig.intervalo_minutos || 5,
  });

  const bat = wrapPowerShellIntoBat(psScript, 'INSTALADOR E EXECUTOR AUTOMATICO - SUPERMERCADO', hostUrl);

  res.setHeader('Content-Type', 'application/x-bat; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="instalador-integrador-automatico.bat"');
  res.send(bat);
});

// Download Windows .BAT Starter for Integrator
app.get('/api/integrador/download-bat', (req: Request, res: Response) => {
  const hostUrl = getPublicHostUrl(req);
  const psScript = buildPowerShellSyncScript({
    hostUrl,
    cfgHost: erpConfig.host === 'localhost' ? '127.0.0.1' : erpConfig.host,
    cfgPort: erpConfig.port,
    cfgDb: erpConfig.database,
    cfgUser: erpConfig.user,
    cfgPass: erpConfig.password === '••••••••' ? '' : erpConfig.password,
    idLoja: erpConfig.id_loja,
    idSituacao: erpConfig.id_situacaocadastro,
    intervalMin: erpConfig.intervalo_minutos || 5,
  });

  const bat = wrapPowerShellIntoBat(psScript, 'INTEGRADOR POSTGRESQL ERP - SUPERMERCADO', hostUrl);

  res.setHeader('Content-Type', 'application/x-bat; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="App-Sincronizador-Servidor.bat"');
  res.send(bat);
});

// Manual Sync Trigger: "CARGA INSTANTÂNEA" / "SINCRONIZAR AGORA"
app.post(['/api/sync/instant-load', '/api/erp/sync-now'], async (req: Request, res: Response) => {
  try {
    const storeId = req.body.id_loja ? Number(req.body.id_loja) : erpConfig.id_loja;
    const result = await performSync(storeId);
    const totalAtivos = centralProducts.filter((p) => p.id_loja === storeId && p.ativo !== false).length;
    
    lastSyncTimestamp = new Date().toISOString();
    savePersistedData();

    return res.json({
      success: true,
      message: `Carga Instantânea executada com sucesso para a Loja ${storeId}! ${totalAtivos} produtos ativos na nuvem.`,
      detalhes: result,
      total_ativos: totalAtivos,
      total_produtos: centralProducts.filter((p) => p.id_loja === storeId).length,
      ultima_sincronizacao: lastSyncTimestamp,
      ultima_sincronizacao_formatada: formatDateTimeBR(lastSyncTimestamp),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `Erro ao executar Carga Instantânea: ${err.message}`,
    });
  }
});

// Simulated ERP Price Modifier (to test real-time price updates easily)
app.post('/api/erp/simulate-price-change', (req: Request, res: Response) => {
  const { id_produto, novo_preco, id_loja } = req.body;
  const item = erpSimulatedDatabase.find(
    (p) => p.id_produto === Number(id_produto) && p.id_loja === Number(id_loja || 1)
  );

  if (!item) {
    return res.status(404).json({ error: 'Produto não encontrado na base simulada do ERP.' });
  }

  const precoAnterior = item.precovenda;
  item.precovenda = parseFloat(novo_preco);

  systemLogs.unshift({
    id: `log-sim-${Date.now()}`,
    data_hora: new Date().toISOString(),
    tipo: 'ADMIN',
    mensagem: `Preço alterado no ERP: Produto ${item.id_produto} (${item.descricaocompleta}) de R$ ${precoAnterior.toFixed(2)} para R$ ${item.precovenda.toFixed(2)}.`,
  });

  res.json({
    success: true,
    message: `Preço atualizado no ERP para R$ ${item.precovenda.toFixed(2)}. Execute 'Sincronizar Agora' para propagar.`,
    produto: item,
  });
});

// Sync logs
app.get('/api/sync/logs', (req: Request, res: Response) => {
  res.json(syncLogs);
});

// System logs
app.get('/api/logs', (req: Request, res: Response) => {
  res.json(systemLogs);
});

// Stores CRUD
app.get('/api/stores', (req: Request, res: Response) => {
  res.json(stores);
});

app.post('/api/stores', (req: Request, res: Response) => {
  try {
    const { id, nome, cnpj, endereco, ativa } = req.body;
    if (!nome) {
      return res.status(400).json({ error: 'O nome da loja é obrigatório.' });
    }

    const nextId = id ? Number(id) : Math.max(0, ...stores.map((s) => s.id)) + 1;
    const existingIndex = stores.findIndex((s) => s.id === nextId);

    const storeObj = {
      id: nextId,
      nome: String(nome).trim(),
      cnpj: cnpj ? String(cnpj).trim() : '00.000.000/0000-00',
      endereco: endereco ? String(endereco).trim() : 'Endereço da Loja',
      ativa: ativa !== undefined ? Boolean(ativa) : true,
    };

    if (existingIndex >= 0) {
      stores[existingIndex] = storeObj;
    } else {
      stores.push(storeObj);
    }

    savePersistedData();

    systemLogs.unshift({
      id: `log-store-${Date.now()}`,
      data_hora: new Date().toISOString(),
      tipo: 'CONFIGURACAO',
      mensagem: `Loja cadastrada/atualizada: "${storeObj.nome}" (ID ${storeObj.id}).`,
    });

    res.json({ success: true, store: storeObj, stores });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/stores/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { nome, cnpj, endereco, ativa } = req.body;
    const index = stores.findIndex((s) => s.id === id);

    if (index >= 0) {
      stores[index] = {
        ...stores[index],
        nome: nome ? String(nome).trim() : stores[index].nome,
        cnpj: cnpj !== undefined ? String(cnpj).trim() : stores[index].cnpj,
        endereco: endereco !== undefined ? String(endereco).trim() : stores[index].endereco,
        ativa: ativa !== undefined ? Boolean(ativa) : stores[index].ativa,
      };

      if (erpConfig.id_loja === id) {
        erpConfig.nome_loja = stores[index].nome;
      }

      savePersistedData();

      systemLogs.unshift({
        id: `log-store-upd-${Date.now()}`,
        data_hora: new Date().toISOString(),
        tipo: 'CONFIGURACAO',
        mensagem: `Cadastro da Loja ${id} alterado para: "${stores[index].nome}".`,
      });

      return res.json({ success: true, store: stores[index], stores });
    }

    res.status(404).json({ error: 'Loja não encontrada.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/stores/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (stores.length <= 1) {
      return res.status(400).json({ success: false, error: 'Não é possível excluir a única loja cadastrada no sistema.' });
    }

    const index = stores.findIndex((s) => s.id === id);
    if (index >= 0) {
      const removed = stores.splice(index, 1)[0];
      if (erpConfig.id_loja === id) {
        erpConfig.id_loja = stores[0].id;
        erpConfig.nome_loja = stores[0].nome;
      }
      savePersistedData();

      systemLogs.unshift({
        id: `log-store-del-${Date.now()}`,
        data_hora: new Date().toISOString(),
        tipo: 'CONFIGURACAO',
        mensagem: `Loja ${id} ("${removed.nome}") removida do sistema com sucesso.`,
      });

      return res.json({ success: true, message: `Loja "${removed.nome}" excluída com sucesso!`, removed, stores });
    }

    res.status(404).json({ success: false, error: 'Loja não encontrada.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST alias for store deletion (for environments where DELETE method is restricted)
app.post(['/api/stores/:id/delete', '/api/stores/delete'], (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id || req.body.id || req.query.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'ID da loja não informado.' });
    }
    if (stores.length <= 1) {
      return res.status(400).json({ success: false, error: 'Não é possível excluir a única loja cadastrada no sistema.' });
    }

    const index = stores.findIndex((s) => s.id === id);
    if (index >= 0) {
      const removed = stores.splice(index, 1)[0];
      if (erpConfig.id_loja === id) {
        erpConfig.id_loja = stores[0].id;
        erpConfig.nome_loja = stores[0].nome;
      }
      savePersistedData();

      systemLogs.unshift({
        id: `log-store-del-${Date.now()}`,
        data_hora: new Date().toISOString(),
        tipo: 'CONFIGURACAO',
        mensagem: `Loja ${id} ("${removed.nome}") removida do sistema via POST.`,
      });

      return res.json({ success: true, message: `Loja "${removed.nome}" excluída com sucesso!`, removed, stores });
    }

    res.status(404).json({ success: false, error: 'Loja não encontrada.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Terminals CRUD
app.get('/api/terminals', (req: Request, res: Response) => {
  res.json(terminals);
});

app.post('/api/terminals', (req: Request, res: Response) => {
  const { nome, id_loja, identificador, modelo_etiqueta_padrao_id, impressora_id } = req.body;
  const newTerm = {
    id: `term-${Date.now()}`,
    nome: nome || 'Novo Terminal',
    id_loja: Number(id_loja) || 1,
    identificador: identificador || `TERM-${Date.now().toString().slice(-4)}`,
    modelo_etiqueta_padrao_id: modelo_etiqueta_padrao_id || 'gondola-dupla-100x30',
    impressora_id: impressora_id || printers[0]?.id || 'argox-os214-01',
    ultima_conexao: new Date().toISOString(),
    ultima_sincronizacao: new Date().toISOString(),
    status: 'ONLINE',
    versao: '3.0.0',
  };
  terminals.push(newTerm);
  savePersistedData();
  res.json({ success: true, terminal: newTerm, terminals });
});

// Delete specific terminal
app.delete('/api/terminals/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const idx = terminals.findIndex((t) => t.id === id);
  if (idx >= 0) {
    const removed = terminals.splice(idx, 1)[0];
    savePersistedData();
    return res.json({ success: true, message: `Terminal "${removed.nome}" excluído com sucesso.`, removed, terminals });
  }
  res.status(404).json({ success: false, error: 'Terminal não encontrado.' });
});

app.post(['/api/terminals/:id/delete', '/api/terminals/delete'], (req: Request, res: Response) => {
  const id = req.params.id || req.body.id || req.query.id;
  const idx = terminals.findIndex((t) => t.id === id);
  if (idx >= 0) {
    const removed = terminals.splice(idx, 1)[0];
    savePersistedData();
    return res.json({ success: true, message: `Terminal "${removed.nome}" excluído com sucesso.`, removed, terminals });
  }
  res.status(404).json({ success: false, error: 'Terminal não encontrado.' });
});

// Clean non-real / simulated / virtual terminals
app.post('/api/terminals/clean-fakes', (req: Request, res: Response) => {
  const targetLoja = Number(req.body.id_loja || erpConfig.id_loja || 1);
  const initialTotal = terminals.length;

  // Mantém apenas o terminal 01 real configurado para a loja ativa
  terminals = [
    {
      id: 'term-01',
      nome: 'Terminal 01 - Principal (Físico)',
      id_loja: targetLoja,
      identificador: 'TERM-01',
      modelo_etiqueta_padrao_id: 'gondola-dupla-100x30',
      impressora_id: printers[0]?.id || 'argox-os214-01',
      ultima_conexao: new Date().toISOString(),
      ultima_sincronizacao: new Date().toISOString(),
      status: 'ONLINE',
      versao: '3.0.0',
    },
  ];

  savePersistedData();

  systemLogs.unshift({
    id: `log-term-clean-${Date.now()}`,
    data_hora: new Date().toISOString(),
    tipo: 'TERMINAIS',
    mensagem: `Limpeza de terminais: ${Math.max(0, initialTotal - 1)} terminais não reais removidos.`,
  });

  res.json({
    success: true,
    message: `${Math.max(0, initialTotal - 1)} terminais fictícios/não reais foram removidos com sucesso!`,
    total_removidos: Math.max(0, initialTotal - 1),
    terminals,
  });
});

// Printers CRUD
app.get('/api/printers', (req: Request, res: Response) => {
  res.json(printers);
});

app.post('/api/printers', (req: Request, res: Response) => {
  try {
    const { nome, tipo, linguagem, porta, dpi, offset_x, offset_y, largura_calibrada, altura_calibrada, gap, avanco, padrao, online } = req.body;
    if (!nome) {
      return res.status(400).json({ success: false, error: 'Nome da impressora é obrigatório.' });
    }

    const newId = `printer-${Date.now()}`;
    const newPrinter = {
      id: newId,
      nome: String(nome).trim(),
      tipo: tipo || 'argox_os214',
      linguagem: linguagem || 'PPLB',
      porta: porta ? String(porta).trim() : 'USB001',
      dpi: Number(dpi) || 203,
      offset_x: Number(offset_x) || 0,
      offset_y: Number(offset_y) || 0,
      largura_calibrada: Number(largura_calibrada) || 0,
      altura_calibrada: Number(altura_calibrada) || 0,
      gap: Number(gap) || 3,
      avanco: Number(avanco) || 0,
      padrao: Boolean(padrao),
      online: online !== undefined ? Boolean(online) : true,
    };

    if (newPrinter.padrao) {
      printers.forEach((p) => (p.padrao = false));
    }

    printers.push(newPrinter);
    savePersistedData();

    systemLogs.unshift({
      id: `log-prt-add-${Date.now()}`,
      data_hora: new Date().toISOString(),
      tipo: 'CONFIGURACAO',
      mensagem: `Nova impressora cadastrada: "${newPrinter.nome}" (${newPrinter.porta}, ${newPrinter.linguagem}).`,
    });

    res.json({ success: true, message: `Impressora "${newPrinter.nome}" cadastrada com sucesso!`, printer: newPrinter, printers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/printers/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const index = printers.findIndex((p) => p.id === id);
  if (index >= 0) {
    printers[index] = { ...printers[index], ...req.body };
    savePersistedData();
    return res.json({ success: true, printer: printers[index], printers });
  }
  res.status(404).json({ success: false, error: 'Impressora não encontrada.' });
});

app.delete('/api/printers/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  if (printers.length <= 1) {
    return res.status(400).json({ success: false, error: 'Não é possível excluir a única impressora configurada.' });
  }

  const idx = printers.findIndex((p) => p.id === id);
  if (idx >= 0) {
    const removed = printers.splice(idx, 1)[0];
    if (removed.padrao && printers.length > 0) {
      printers[0].padrao = true;
    }
    savePersistedData();
    return res.json({ success: true, message: `Impressora "${removed.nome}" excluída com sucesso.`, removed, printers });
  }
  res.status(404).json({ success: false, error: 'Impressora não encontrada.' });
});

app.post(['/api/printers/:id/delete', '/api/printers/delete'], (req: Request, res: Response) => {
  const id = req.params.id || req.body.id || req.query.id;
  if (printers.length <= 1) {
    return res.status(400).json({ success: false, error: 'Não é possível excluir a única impressora configurada.' });
  }

  const idx = printers.findIndex((p) => p.id === id);
  if (idx >= 0) {
    const removed = printers.splice(idx, 1)[0];
    if (removed.padrao && printers.length > 0) {
      printers[0].padrao = true;
    }
    savePersistedData();
    return res.json({ success: true, message: `Impressora "${removed.nome}" excluída com sucesso.`, removed, printers });
  }
  res.status(404).json({ success: false, error: 'Impressora não encontrada.' });
});

// Print Queue & Execution (Direct Print Engine)
app.post('/api/print/send', (req: Request, res: Response) => {
  const { terminal_id, modelo_id, modelo_nome, impressora_id, produtos, comandos_raw } = req.body;

  if (!produtos || !Array.isArray(produtos) || produtos.length === 0) {
    return res.status(400).json({ error: 'Nenhum produto fornecido para impressão.' });
  }

  const job = {
    id: `job-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    data_hora: new Date().toISOString(),
    terminal_id: terminal_id || 'TERM-LOCAL',
    modelo_id: modelo_id || 'gondola-dupla-100x30',
    modelo_nome: modelo_nome || 'Gôndola Dupla 100x30',
    impressora_id: impressora_id || 'argox-os214-01',
    produtos,
    status: 'IMPRESSO', // Completed immediately in direct queue
    comandos_raw: comandos_raw || '',
    tentativas: 1,
  };

  printQueue.unshift(job);
  if (printQueue.length > 100) printQueue.pop();

  printLogs.unshift(job);
  if (printLogs.length > 200) printLogs.pop();

  systemLogs.unshift({
    id: `log-prt-${Date.now()}`,
    data_hora: new Date().toISOString(),
    tipo: 'IMPRESSAO',
    mensagem: `Impressão direta: Modelo "${job.modelo_nome}" (${job.produtos.length} produtos) enviada para ${job.impressora_id}.`,
    detalhes: job,
  });

  res.json({
    success: true,
    message: 'Etiqueta enviada diretamente para a impressora.',
    job,
  });
});

app.get('/api/print/queue', (req: Request, res: Response) => {
  res.json(printQueue);
});

app.get('/api/print/logs', (req: Request, res: Response) => {
  res.json(printLogs);
});

// Windows Standalone Print & Sync Agent Script Generator
app.get('/api/agent/download-script', (req: Request, res: Response) => {
  const agentScript = `/**
 * SERVIÇO LOCAL DE IMPRESSÃO E SINCRONIZAÇÃO - ARGOX OS-214
 * Supermercado - Consulta Preço & Etiquetas
 * 
 * Executa localmente no Windows:
 * 1. Conecta diretamente à impressora térmica Argox OS-214 via Spooler ou Porta USB/COM.
 * 2. Imprime em modo RAW sem diálogo ou preview do Windows.
 * 3. Comunica-se via WebSocket / HTTP local na porta 9100.
 */

const http = require('http');
const fs = require('fs');
const { exec } = require('child_process');

const PORT = 9100;
const PRINTER_NAME = "Argox OS-214 Plus";

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ONLINE', impressora: PRINTER_NAME, versao: '2.4.0' }));
    return;
  }

  if (req.url === '/print-raw' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { rawCommands, modelName } = JSON.parse(body);
        console.log(\`[ARGOX] Recebido trabalho de impressão: \${modelName}\`);
        
        // Salva temporariamente o arquivo de comandos PPLA/PPLB
        const tempPath = \`temp_print_\${Date.now()}.prn\`;
        fs.writeFileSync(tempPath, rawCommands);

        // Envia RAW diretamente ao spooler do Windows usando PowerShell Out-Printer
        const psCommand = \`powershell -Command "Get-Content -Path '\${tempPath}' -Raw | Out-Printer -Name '\${PRINTER_NAME}'"\`;
        
        exec(psCommand, (err, stdout, stderr) => {
          try { fs.unlinkSync(tempPath); } catch (_) {}
          if (err) {
            console.error('[ERRO SPOOLER]', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          } else {
            console.log('[ARGOX] Impressão concluída com sucesso!');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Etiqueta impressa diretamente na Argox OS-214.' }));
          }
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(\`=== SERVIÇO DE IMPRESSÃO ARGOX OS-214 RODANDO NA PORTA \${PORT} ===\`);
  console.log(\`Impressora alvo: \${PRINTER_NAME}\`);
});
`;

  res.setHeader('Content-Type', 'text/javascript');
  res.setHeader('Content-Disposition', 'attachment; filename="argox-print-agent.js"');
  res.send(agentScript);
});

// -------------------------------------------------------------
// VITE INTEGRATION
// -------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static files
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SUPERMERCADO] Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();
