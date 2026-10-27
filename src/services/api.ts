import { Product, LabelModel, PrinterConfig, ERPConfig, SystemStatus, PrintJobProduct, SyncVerificationData, Store, Terminal } from '../types';
import { localDB } from './storage';
import { generateArgoxPPLB, generateArgoxPPLA, DEFAULT_LABEL_MODELS } from './argoxPrinter';
import { formatDateTimeBR } from '../utils/date';

const BASE_URL = '';

export async function checkOnline(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  try {
    const res = await fetch(`${BASE_URL}/api/status`, { method: 'GET', cache: 'no-store' });
    if (res.ok) return true;
    const phpRes = await fetch(`${BASE_URL}/api.php?action=status`, { method: 'GET', cache: 'no-store' });
    return phpRes.ok;
  } catch {
    return false;
  }
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  try {
    const res = await fetch(`${BASE_URL}/api/status`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {}

  // Fallback to Hostinger PHP backend
  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=status`);
    if (phpRes.ok) {
      const phpData = await phpRes.json();
      return {
        erp_conectado: true,
        internet_online: true,
        banco_online: true,
        cache_local_atualizado: true,
        impressora_online: true,
        ultima_sincronizacao: phpData.ultima_sincronizacao,
        ultima_sincronizacao_formatada: formatDateTimeBR(phpData.ultima_sincronizacao),
        proxima_sincronizacao: null,
        total_produtos: phpData.total_produtos || 0,
        total_produtos_ativos: phpData.total_produtos_ativos || phpData.total_produtos || 0,
        total_produtos_inativos: phpData.total_produtos_inativos || 0,
        loja_atual: phpData.loja_atual || 1,
        tempo_retorno_segundos: 5,
      };
    }
  } catch {}

  const cachedCount = Number(localStorage.getItem('cached_products_count') || 0);
  const lastSync = localStorage.getItem('last_cache_sync');

  return {
    erp_conectado: false,
    internet_online: false,
    banco_online: false,
    cache_local_atualizado: Boolean(cachedCount > 0),
    impressora_online: true,
    ultima_sincronizacao: lastSync,
    ultima_sincronizacao_formatada: formatDateTimeBR(lastSync),
    proxima_sincronizacao: null,
    total_produtos: cachedCount,
    total_produtos_ativos: cachedCount,
    total_produtos_inativos: 0,
    loja_atual: 1,
    tempo_retorno_segundos: 5,
  };
}

export async function fetchSyncVerification(idLoja: number = 1): Promise<SyncVerificationData | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/sync/verify?id_loja=${idLoja}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {}

  // Fallback direct to PHP backend
  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=status&id_loja=${idLoja}`);
    if (phpRes.ok) {
      const d = await phpRes.json();
      return {
        success: true,
        is_synced: (d.total_produtos || 0) > 0,
        status: (d.total_produtos || 0) > 0 ? 'SINCRONIZADO' : 'AGUARDANDO',
        status_mensagem: 'MySQL Hostinger Conectado',
        ultima_sincronizacao: d.ultima_sincronizacao,
        ultima_sincronizacao_formatada: formatDateTimeBR(d.ultima_sincronizacao),
        tempo_relativo: 'Recente',
        proxima_sincronizacao: null,
        proxima_sincronizacao_formatada: 'A cada 10 min',
        id_loja: d.loja_atual || idLoja,
        nome_loja: d.nome_loja || 'Supermercado Modelo',
        total_produtos_nuvem: d.total_produtos || 0,
        total_produtos_ativos: d.total_produtos_ativos || d.total_produtos || 0,
        total_produtos_inativos: d.total_produtos_inativos || 0,
        agente: {
          online: true,
          ultima_comunicacao: d.ultima_sincronizacao,
          ultima_comunicacao_formatada: formatDateTimeBR(d.ultima_sincronizacao),
          host_local: 'localhost',
          banco: 'MySQL Hostinger',
          loja: d.loja_atual || idLoja,
          ultimo_status: 'Online',
          erros_recentes: '',
        },
        ultimos_produtos_sincronizados: [],
        historico_recente: [],
      };
    }
  } catch {}

  return null;
}

export async function testProductSync(query: string, idLoja: number = 1): Promise<any> {
  const clean = query
    .replace(/[\r\n\t]/g, '')
    .replace(/^\][a-zA-Z0-9]{2}/, '')
    .replace(/^_+|_+$/g, '')
    .trim();
  if (!clean) return { success: false, mensagem: 'Código inválido.' };

  try {
    const res = await fetch(`${BASE_URL}/api/sync/test-product?q=${encodeURIComponent(clean)}&id_loja=${idLoja}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err: any) {}

  // Fallback to PHP search
  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=search&q=${encodeURIComponent(clean)}&id_loja=${idLoja}`);
    if (phpRes.ok) {
      const prod = await phpRes.json();
      return {
        success: true,
        encontrado: true,
        origem: 'MySQL Hostinger (Nuvem)',
        produto: prod,
        mensagem: `Produto encontrado: ${prod.descricao} por R$ ${Number(prod.preco_venda || prod.preco).toFixed(2)}`,
      };
    }
  } catch (e: any) {
    return {
      success: false,
      mensagem: 'Erro de comunicação com o servidor: ' + e.message,
    };
  }

  return { success: false, mensagem: 'Produto não encontrado na base de dados.' };
}

/**
 * Searches product with Supermarket exact-match priority:
 * 1. Checks online Node/Express API with exact match
 * 2. Checks online Hostinger PHP API with exact match
 * 3. Falls back seamlessly to offline IndexedDB cache
 */
export async function searchProduct(term: string, idLoja: number = 1): Promise<Product | null> {
  const cleanTerm = term
    .replace(/[\r\n\t]/g, '')
    .replace(/^\][a-zA-Z0-9]{2}/, '')
    .replace(/^_+|_+$/g, '')
    .trim();
  if (!cleanTerm) return null;

  // 1. Attempt Node.js express online search
  try {
    const res = await fetch(
      `${BASE_URL}/api/products/search?q=${encodeURIComponent(cleanTerm)}&id_loja=${idLoja}`
    );
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {}

  // 2. Attempt direct Hostinger PHP backend
  try {
    const phpRes = await fetch(
      `${BASE_URL}/api.php?action=search&q=${encodeURIComponent(cleanTerm)}&id_loja=${idLoja}`
    );
    if (phpRes.ok) {
      return await phpRes.json();
    }
  } catch {}

  // 3. Offline search in IndexedDB
  const cachedProduct = await localDB.findProduct(cleanTerm, idLoja);
  return cachedProduct;
}

/**
 * Preloads and updates local IndexedDB cache with all store products
 */
export async function syncLocalCache(idLoja: number = 1): Promise<number> {
  try {
    let products: Product[] | null = null;
    const res = await fetch(`${BASE_URL}/api/products?id_loja=${idLoja}`);
    if (res.ok) {
      products = await res.json();
    } else {
      const phpRes = await fetch(`${BASE_URL}/api.php?action=products&id_loja=${idLoja}`);
      if (phpRes.ok) {
        products = await phpRes.json();
      }
    }
    if (products && Array.isArray(products)) {
      await localDB.saveProducts(products);
      return products.length;
    }
  } catch (err) {
    console.error('Falha ao sincronizar cache local:', err);
  }
  return 0;
}

/**
 * Executes direct printing without dialogs
 */
export async function sendDirectPrint(
  model: LabelModel,
  printer: PrinterConfig,
  products: PrintJobProduct[],
  terminalId: string = 'TERM-01'
): Promise<{ success: boolean; message: string }> {
  // Generate RAW command sequence
  const rawCommands =
    printer.linguagem === 'PPLA'
      ? generateArgoxPPLA(model, printer, products)
      : generateArgoxPPLB(model, printer, products);

  // 1. Try local Windows Print Agent on localhost:9100 (if running on client PC)
  try {
    const localAgentRes = await fetch('http://localhost:9100/print-raw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelName: model.nome,
        printerName: printer.nome,
        rawCommands,
      }),
    });
    if (localAgentRes.ok) {
      return { success: true, message: `Etiqueta impressa com sucesso via Agente Local Argox (Porta 9100)!` };
    }
  } catch (e) {}

  // 2. Fallback to Cloud/Server print router
  try {
    const res = await fetch(`${BASE_URL}/api/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_terminal: terminalId,
        id_impressora: printer.id,
        id_modelo: model.id,
        produtos: products,
        comandos_raw: rawCommands,
      }),
    });

    if (res.ok) {
      return { success: true, message: 'Trabalho de impressão enviado com sucesso à impressora!' };
    }
    const errData = await res.json();
    return { success: false, message: errData.error || 'Falha ao processar impressão.' };
  } catch (e: any) {
    return { success: false, message: 'Impressora offline ou erro de comunicação de rede.' };
  }
}

// ERP Connection APIs
export async function testERPConnection(config: Partial<ERPConfig>) {
  try {
    const res = await fetch(`${BASE_URL}/api/erp/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=erp/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (phpRes.ok) return await phpRes.json();
  } catch (e) {}

  return { success: false, message: 'Não foi possível testar conexão com o ERP.' };
}

export async function triggerInstantLoad(idLoja: number = 1) {
  try {
    const res = await fetch(`${BASE_URL}/api/sync/instant-load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_loja: idLoja }),
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  // Fallback to PHP backend
  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=instant-load&id_loja=${idLoja}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_loja: idLoja }),
    });
    if (phpRes.ok) return await phpRes.json();
  } catch (e) {}

  return { success: false, message: 'Não foi possível disparar a carga instantânea.' };
}

export async function triggerSyncNow(idLoja: number = 1) {
  return triggerInstantLoad(idLoja);
}

export async function simulatePriceChange(id_produto: number, novo_preco: number, id_loja: number = 1) {
  try {
    const res = await fetch(`${BASE_URL}/api/erp/simulate-price-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_produto, novo_preco, id_loja }),
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  return { success: false, message: 'Simulação indisponível' };
}

export async function executeTestQuery(config: Partial<ERPConfig>) {
  try {
    const res = await fetch(`${BASE_URL}/api/erp/execute-query-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  return { success: false, message: 'Não foi possível executar a query de teste.' };
}

export async function fetchMySQLSchema() {
  try {
    const res = await fetch(`${BASE_URL}/api/mysql/schema`);
    if (res.ok) return await res.json();
  } catch (e) {}
  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=mysql/schema`);
    if (phpRes.ok) return await phpRes.json();
  } catch (e) {}
  return { success: false, schema_sql: '' };
}

export async function fetchMySQLConfig() {
  try {
    const res = await fetch(`${BASE_URL}/api/mysql/config`);
    if (res.ok) return await res.json();
  } catch (e) {}
  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=mysql/config`);
    if (phpRes.ok) return await phpRes.json();
  } catch (e) {}
  return null;
}

export async function saveMySQLConfig(config: { host?: string; port?: number; database?: string; user?: string; password?: string; enabled?: boolean }) {
  try {
    const res = await fetch(`${BASE_URL}/api/mysql/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=mysql/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (phpRes.ok) return await phpRes.json();
  } catch (e) {}
  return { success: false, message: 'Não foi possível salvar a configuração do MySQL.' };
}

export async function testMySQLConnection(config: { host?: string; port?: number; database?: string; user?: string; password?: string }) {
  try {
    const res = await fetch(`${BASE_URL}/api/mysql/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=mysql/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (phpRes.ok) return await phpRes.json();
  } catch (e) {}
  return { success: false, message: 'Falha ao testar conexão MySQL.' };
}

export async function syncProductsToMySQL(idLoja?: number) {
  try {
    const res = await fetch(`${BASE_URL}/api/mysql/sync-to-mysql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_loja: idLoja }),
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  return { success: false, message: 'Erro ao sincronizar com MySQL.' };
}

export async function syncProductsFromMySQL(idLoja?: number) {
  try {
    const res = await fetch(`${BASE_URL}/api/mysql/sync-from-mysql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_loja: idLoja }),
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  return { success: false, message: 'Erro ao baixar do MySQL.' };
}

export async function syncBatchProducts(items: any[], idLoja: number = 1, isFullSync: boolean = false) {
  let lastErrorMessage = 'Não foi possível sincronizar lote de produtos.';

  try {
    const res = await fetch(`${BASE_URL}/api/products/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, id_loja: idLoja, is_full_sync: isFullSync }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data) return data;
    if (data && (data.message || data.error)) {
      lastErrorMessage = data.message || data.error;
    }
  } catch (e: any) {
    if (e?.message) lastErrorMessage = e.message;
  }

  // Direct PHP fallback
  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=sync-batch&id_loja=${idLoja}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, id_loja: idLoja, is_full_sync: isFullSync }),
    });
    const phpData = await phpRes.json().catch(() => null);
    if (phpRes.ok && phpData) return phpData;
    if (phpData && (phpData.message || phpData.error)) {
      lastErrorMessage = phpData.message || phpData.error;
    }
  } catch (e: any) {
    if (e?.message) lastErrorMessage = e.message;
  }

  return { success: false, message: lastErrorMessage };
}

export async function wipeAllProducts(idLoja?: number) {
  try {
    const query = idLoja !== undefined ? `?id_loja=${idLoja}` : '';
    const res = await fetch(`${BASE_URL}/api/products/all${query}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data) return data;
  } catch (e) {}

  // Direct PHP fallback
  try {
    const query = idLoja !== undefined ? `&id_loja=${idLoja}` : '';
    const phpRes = await fetch(`${BASE_URL}/api.php?action=limpar-produtos${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_loja: idLoja, confirmar: true }),
    });
    const phpData = await phpRes.json().catch(() => null);
    if (phpRes.ok && phpData) return phpData;
  } catch (e) {}

  return { success: false, message: 'Erro ao zerar base de produtos.' };
}

export async function fetchStores(): Promise<Store[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/stores`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {}

  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=stores`);
    if (phpRes.ok) {
      const data = await phpRes.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {}

  return [
    {
      id: 1,
      nome: 'Supermercado Modelo · Loja 01 (Matriz)',
      cnpj: '00.000.000/0001-00',
      endereco: 'Av. Principal, 1000 - Centro',
      ativa: true,
    },
  ];
}

export async function saveStore(storeData: Partial<Store> & { id?: number; nome: string }): Promise<{ success: boolean; message?: string; store?: Store; error?: string }> {
  try {
    const isEdit = Boolean(storeData.id);
    const url = isEdit ? `${BASE_URL}/api/stores/${storeData.id}` : `${BASE_URL}/api/stores`;
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(storeData),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) return data;
    }
  } catch {}

  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=stores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(storeData),
    });
    if (phpRes.ok) {
      const data = await phpRes.json();
      return data;
    }
  } catch (e: any) {
    return { success: false, error: e.message || 'Erro ao salvar loja no servidor.' };
  }

  return { success: false, error: 'Não foi possível salvar loja.' };
}

export async function deleteStore(storeId: number): Promise<{ success: boolean; error?: string; message?: string }> {
  // 1. Try Express DELETE
  try {
    const res = await fetch(`${BASE_URL}/api/stores/${storeId}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) return data;
    if (data?.error) return { success: false, error: data.error };
  } catch {}

  // 2. Try Express POST alias
  try {
    const postRes = await fetch(`${BASE_URL}/api/stores/${storeId}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: storeId }),
    });
    const postData = await postRes.json().catch(() => null);
    if (postRes.ok && postData?.success) return postData;
  } catch {}

  // 3. Try Hostinger PHP action=stores/delete via POST
  try {
    const phpPost = await fetch(`${BASE_URL}/api.php?action=stores/delete&id=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: storeId, _method: 'DELETE', action: 'delete' }),
    });
    const phpPostData = await phpPost.json().catch(() => null);
    if (phpPost.ok && phpPostData?.success) return phpPostData;
    if (phpPostData?.error) return { success: false, error: phpPostData.error };
  } catch {}

  // 4. Try Hostinger PHP DELETE
  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=stores&id=${storeId}`, {
      method: 'DELETE',
    });
    const pData = await phpRes.json().catch(() => null);
    if (phpRes.ok && pData?.success) return pData;
    if (pData?.error) return { success: false, error: pData.error };
  } catch (e: any) {
    return { success: false, error: e.message || 'Erro ao excluir loja.' };
  }

  return { success: false, error: 'Não foi possível excluir a loja.' };
}

export async function fetchTerminals(): Promise<Terminal[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/terminals`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch {}

  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=terminals`);
    if (phpRes.ok) {
      const data = await phpRes.json();
      if (Array.isArray(data)) return data;
    }
  } catch {}

  return [
    {
      id: 'term-01',
      nome: 'Terminal 01 - Principal (Físico)',
      id_loja: 1,
      identificador: 'TERM-01',
      modelo_etiqueta_padrao_id: 'gondola-dupla-100x30',
      impressora_id: 'argox-os214-01',
      ultima_conexao: new Date().toISOString(),
      ultima_sincronizacao: new Date().toISOString(),
      status: 'ONLINE',
      versao: '3.0.0',
    },
  ];
}

export async function deleteTerminal(terminalId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/terminals/${terminalId}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) return data;
  } catch {}

  try {
    const postRes = await fetch(`${BASE_URL}/api/terminals/${terminalId}/delete`, {
      method: 'POST',
    });
    const postData = await postRes.json().catch(() => null);
    if (postRes.ok && postData?.success) return postData;
  } catch {}

  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=terminals/delete&id=${encodeURIComponent(terminalId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: terminalId }),
    });
    const phpData = await phpRes.json().catch(() => null);
    if (phpRes.ok && phpData?.success) return phpData;
  } catch (e: any) {
    return { success: false, error: e.message };
  }

  return { success: false, error: 'Não foi possível excluir o terminal.' };
}

export async function cleanFakeTerminals(idLoja: number = 1): Promise<{ success: boolean; message?: string; total_removidos?: number; terminals?: Terminal[] }> {
  try {
    const res = await fetch(`${BASE_URL}/api/terminals/clean-fakes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_loja: idLoja }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) return data;
  } catch {}

  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=terminals/clean-fakes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_loja: idLoja }),
    });
    const phpData = await phpRes.json().catch(() => null);
    if (phpRes.ok && phpData?.success) return phpData;
  } catch {}

  return { success: false, message: 'Falha ao remover terminais virtuais.' };
}

export async function fetchPrinters(): Promise<PrinterConfig[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/printers`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {}

  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=printers`);
    if (phpRes.ok) {
      const data = await phpRes.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {}

  return [
    {
      id: 'argox-os214-01',
      nome: 'Argox OS-214 Plus (Térmica)',
      tipo: 'argox_os214',
      linguagem: 'PPLB',
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
}

export async function savePrinter(printerData: Partial<PrinterConfig> & { nome: string }): Promise<{ success: boolean; printer?: PrinterConfig; printers?: PrinterConfig[]; message?: string; error?: string }> {
  const isEdit = Boolean(printerData.id);
  const url = isEdit ? `${BASE_URL}/api/printers/${printerData.id}` : `${BASE_URL}/api/printers`;
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(printerData),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) return data;
    if (data?.printer) return { success: true, ...data };
  } catch {}

  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=printers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(printerData),
    });
    const phpData = await phpRes.json().catch(() => null);
    if (phpRes.ok && phpData?.success) return phpData;
  } catch (e: any) {
    return { success: false, error: e.message };
  }

  return { success: false, error: 'Não foi possível salvar a impressora.' };
}

export async function deletePrinter(printerId: string): Promise<{ success: boolean; printers?: PrinterConfig[]; error?: string; message?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/printers/${printerId}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) return data;
    if (data?.error) return { success: false, error: data.error };
  } catch {}

  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=printers/delete&id=${encodeURIComponent(printerId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: printerId, _method: 'DELETE', action: 'delete' }),
    });
    const phpData = await phpRes.json().catch(() => null);
    if (phpRes.ok && phpData?.success) return phpData;
    if (phpData?.error) return { success: false, error: phpData.error };
  } catch (e: any) {
    return { success: false, error: e.message };
  }

  return { success: false, error: 'Não foi possível excluir a impressora.' };
}

export async function upsertSingleProduct(product: {
  codigo_interno: string;
  codigo_barras: string;
  descricao: string;
  preco: number;
  embalagem?: string;
  ncm?: string;
  id_loja?: number;
}) {
  let lastErrorMessage = 'Não foi possível salvar o produto.';

  try {
    const res = await fetch(`${BASE_URL}/api/products/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data) return data;
    if (data && (data.message || data.error)) {
      lastErrorMessage = data.message || data.error;
    }
  } catch (e: any) {
    if (e?.message) lastErrorMessage = e.message;
  }

  // Direct PHP fallback via sync-batch
  try {
    const phpRes = await fetch(`${BASE_URL}/api.php?action=sync-batch&id_loja=${product.id_loja || 1}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [product], id_loja: product.id_loja || 1 }),
    });
    const phpData = await phpRes.json().catch(() => null);
    if (phpRes.ok && phpData) return phpData;
    if (phpData && (phpData.message || phpData.error)) {
      lastErrorMessage = phpData.message || phpData.error;
    }
  } catch (e: any) {
    if (e?.message) lastErrorMessage = e.message;
  }

  return { success: false, message: lastErrorMessage };
}
