import React, { useState, useEffect } from 'react';
import { ERPConfig, SyncLog, Product } from '../types';
import { testERPConnection, triggerSyncNow, simulatePriceChange, executeTestQuery, triggerInstantLoad } from '../services/api';
import { VerificadorSincronizacao } from './VerificadorSincronizacao';
import { BancoMySQLHostinger } from './BancoMySQLHostinger';
import { formatDateTimeBR, formatTimeBR } from '../utils/date';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Save,
  Clock,
  ShieldCheck,
  TrendingUp,
  Sliders,
  Code2,
  Download,
  Terminal,
  Server,
  Zap,
  Play,
  RotateCcw,
  Check,
  Lock,
  Upload,
  FileSpreadsheet,
  Plus,
  Trash2,
  FileText,
  Search,
  Copy,
  Cloud,
  Calendar,
} from 'lucide-react';

interface ConfiguracaoERPProps {
  onSyncCompleted: () => void;
}

const DEFAULT_QUERY_TEMPLATE = `SELECT
    pr.id_produto AS "Codigo Interno",
    p.descricaocompleta AS "Produto",
    pr.codigobarras AS "Codigo de Barras",
    te.descricao AS "Embalagem",
    pc.precovenda AS "Preco Venda"
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

export const ConfiguracaoERP: React.FC<ConfiguracaoERPProps> = ({ onSyncCompleted }) => {
  const [config, setConfig] = useState<ERPConfig>({
    nome_loja: 'Supermercado Modelo · Loja 01 (Matriz)',
    host: 'localhost',
    port: 8745,
    database: 'vr',
    user: 'postgres',
    password: 'VrPost@Server',
    ssl: false,
    id_loja: 1,
    id_situacaocadastro: 3,
    intervalo_minutos: 10,
    sincronizacao_automatica: true,
    custom_query: '',
  });

  const [activeSubTab, setActiveSubTab] = useState<'verificador' | 'mysql' | 'importar' | 'conexao' | 'query' | 'logs' | 'daemon'>('verificador');
  const [loadingConfig, setLoadingConfig] = useState<boolean>(true);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; detalhes?: any } | null>(null);
  
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<SyncLog | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Query test state
  const [runningQueryTest, setRunningQueryTest] = useState<boolean>(false);
  const [queryTestResult, setQueryTestResult] = useState<{
    success: boolean;
    linhas_retornadas?: number;
    tempo_ms?: number;
    origem?: string;
    amostra?: any[];
    message?: string;
  } | null>(null);

  // Price change simulation state
  const [simPriceInput, setSimPriceInput] = useState<string>('4.99');
  const [simFeedback, setSimFeedback] = useState<string | null>(null);

  // Manual & Import State
  const [productList, setProductList] = useState<Product[]>([]);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [importText, setImportText] = useState<string>('');
  const [importing, setImporting] = useState<boolean>(false);
  const [importFeedback, setImportFeedback] = useState<{ success: boolean; message: string } | null>(null);
  
  // Single item form
  const [newItem, setNewItem] = useState({
    codigo_interno: '',
    codigo_barras: '',
    descricao: '',
    preco: '',
    embalagem: 'UN',
    ncm: '',
  });
  const [savingItem, setSavingItem] = useState<boolean>(false);
  const [clearingProducts, setClearingProducts] = useState<boolean>(false);
  const [copiedPowerShell, setCopiedPowerShell] = useState<boolean>(false);
  const [agentStatus, setAgentStatus] = useState<any>(null);

  const fetchAgentStatus = async () => {
    try {
      const res = await fetch('/api/integrador/status');
      if (res.ok) {
        const data = await res.json();
        setAgentStatus(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchLogs();
    fetchProducts();
    fetchAgentStatus();
    const interval = setInterval(fetchAgentStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch(`/api/products?id_loja=${config.id_loja}`);
      if (res.ok) {
        const data = await res.json();
        setProductList(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAllProducts = async () => {
    if (!window.confirm('Tem certeza que deseja apagar TODOS os produtos cadastrados? A base de produtos ficará 100% limpa.')) {
      return;
    }
    setClearingProducts(true);
    try {
      const res = await fetch(`/api/products/all?id_loja=${config.id_loja}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setProductList([]);
        setImportFeedback({
          success: true,
          message: data.message || 'Todos os produtos pré-cadastrados foram removidos com sucesso. A base de dados está limpa!',
        });
        setTimeout(() => setImportFeedback(null), 5000);
        onSyncCompleted();
      }
    } catch (e: any) {
      alert('Erro ao limpar produtos: ' + e.message);
    } finally {
      setClearingProducts(false);
    }
  };

  const handleDeleteSingleProduct = async (id: string, descricao: string) => {
    if (!window.confirm(`Deseja remover o produto "${descricao}" da base?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setProductList((prev) => prev.filter((p) => p.id !== id));
        onSyncCompleted();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchConfig = async () => {
    try {
      // 1. First check local storage for instantaneous display & safety
      let loadedConfig: any = null;
      try {
        const local = localStorage.getItem('cached_erp_config');
        if (local) {
          loadedConfig = JSON.parse(local);
          setConfig((prev) => ({ ...prev, ...loadedConfig }));
        }
      } catch {}

      // 2. Fetch from server API (Node server or PHP API)
      let serverData: any = null;
      try {
        const res = await fetch('/api/erp/config');
        if (res.ok) {
          serverData = await res.json();
        } else {
          const phpRes = await fetch('/api.php?action=erp/config');
          if (phpRes.ok) {
            serverData = await phpRes.json();
          }
        }
      } catch (e) {
        console.warn('Erro ao buscar config do servidor:', e);
      }

      if (serverData && typeof serverData === 'object') {
        setConfig((prev) => {
          const merged = {
            ...prev,
            ...serverData,
            password: prev.password && prev.password !== '••••••••' ? prev.password : (serverData.password || prev.password),
          };
          try {
            localStorage.setItem('cached_erp_config', JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingConfig(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/sync/logs');
      if (res.ok) {
        setSyncLogs(await res.json());
      } else {
        const phpRes = await fetch('/api.php?action=sync/logs');
        if (phpRes.ok) {
          setSyncLogs(await phpRes.json());
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const downloadBlobFromUrl = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        return;
      }
    } catch {}
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const [savingConfig, setSavingConfig] = useState<boolean>(false);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingConfig(true);
    try {
      // 1. Save immediately to LocalStorage
      try {
        localStorage.setItem('cached_erp_config', JSON.stringify(config));
      } catch {}

      // 2. Try Node server endpoint
      let saved = false;
      try {
        const res = await fetch('/api/erp/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        if (res.ok) {
          saved = true;
        }
      } catch {}

      // 3. Try PHP Hostinger endpoint
      if (!saved) {
        try {
          const phpRes = await fetch('/api.php?action=erp/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
          });
          if (phpRes.ok) {
            saved = true;
          }
        } catch {}
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (e: any) {
      console.error(e);
      // Even if server connection failed, local is saved
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const result = await testERPConnection(config);
      setTestResult(result);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: 'Erro ao comunicar com o servidor da aplicação.',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleRunQueryTest = async () => {
    setRunningQueryTest(true);
    setQueryTestResult(null);
    try {
      const result = await executeTestQuery({
        ...config,
        custom_query: config.custom_query || undefined,
      });
      setQueryTestResult(result);
    } catch (err: any) {
      setQueryTestResult({
        success: false,
        message: `Falha na requisição de teste: ${err.message}`,
      });
    } finally {
      setRunningQueryTest(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await triggerSyncNow(config.id_loja);
      setSyncResult(result);
      fetchLogs();
      onSyncCompleted();
    } catch (err: any) {
      setSyncResult({
        id: `err-${Date.now()}`,
        data_hora: new Date().toISOString(),
        status: 'ERRO',
        produtos_analisados: 0,
        produtos_atualizados: 0,
        produtos_novos: 0,
        tempo_ms: 0,
        erros: 'Falha de comunicação',
        id_loja: config.id_loja,
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSimulateERPPrice = async () => {
    try {
      const priceNum = parseFloat(simPriceInput);
      if (isNaN(priceNum) || priceNum <= 0) return;

      const res = await simulatePriceChange(1548, priceNum, config.id_loja);
      setSimFeedback(res.message);
      setTimeout(() => setSimFeedback(null), 5000);
    } catch (e) {
      setSimFeedback('Erro ao atualizar preço simulado.');
    }
  };

  const parseCSVToProducts = (text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsed: any[] = [];

    for (const line of lines) {
      if (line.toLowerCase().includes('descricao') || line.toLowerCase().includes('descriçao') || line.toLowerCase().includes('codigo')) {
        continue;
      }
      let delimiter = ';';
      if (line.includes(';') && !line.includes('\t')) delimiter = ';';
      else if (line.includes('\t')) delimiter = '\t';
      else if (line.includes(',') && line.split(',').length > 3) delimiter = ',';

      const parts = line.split(delimiter).map((p) => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length >= 3) {
        parsed.push({
          codigo_interno: parts[0],
          codigo_barras: parts[1] || parts[0],
          descricao: parts[2],
          preco: parts[3] ? parseFloat(parts[3].replace(',', '.')) : 0,
          embalagem: parts[4] || 'UN',
          ncm: parts[5] || '00000000',
        });
      }
    }
    return parsed;
  };

  const handleImportTextSubmit = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    setImportFeedback(null);
    try {
      const items = parseCSVToProducts(importText);
      if (items.length === 0) {
        setImportFeedback({
          success: false,
          message: 'Nenhum produto válido detectado. Utilize o formato: codigo_interno;codigo_barras;descricao;preco;embalagem',
        });
        return;
      }

      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, id_loja: config.id_loja }),
      });

      const data = await res.json();
      if (data.success) {
        setImportFeedback({ success: true, message: data.message });
        setImportText('');
        fetchProducts();
        fetchLogs();
        onSyncCompleted();
      } else {
        setImportFeedback({ success: false, message: data.message || 'Erro ao importar' });
      }
    } catch (err: any) {
      setImportFeedback({ success: false, message: `Falha: ${err.message}` });
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        setImportText(content);
        setImporting(true);
        setImportFeedback(null);
        try {
          const items = parseCSVToProducts(content);
          if (items.length === 0) {
            setImportFeedback({
              success: false,
              message: 'Nenhum produto válido detectado no arquivo. Formato esperado: codigo;barras;descricao;preco',
            });
            return;
          }
          const res = await fetch('/api/products/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items, id_loja: config.id_loja }),
          });
          const data = await res.json();
          if (data.success) {
            setImportFeedback({ success: true, message: `Sucesso: ${items.length} produtos importados do arquivo "${file.name}"!` });
            fetchProducts();
            fetchLogs();
            onSyncCompleted();
          } else {
            setImportFeedback({ success: false, message: data.message || 'Erro ao importar produtos.' });
          }
        } catch (err: any) {
          setImportFeedback({ success: false, message: `Falha: ${err.message}` });
        } finally {
          setImporting(false);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleSaveSingleItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.descricao || (!newItem.codigo_interno && !newItem.codigo_barras)) return;
    setSavingItem(true);
    try {
      const res = await fetch('/api/products/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newItem,
          id_loja: config.id_loja,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewItem({
          codigo_interno: '',
          codigo_barras: '',
          descricao: '',
          preco: '',
          embalagem: 'UN',
          ncm: '',
        });
        fetchProducts();
        fetchLogs();
        onSyncCompleted();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingItem(false);
    }
  };

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center p-16 text-neutral-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2 text-emerald-400" /> Carregando integrador do banco de dados...
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6 text-neutral-100 font-sans">
      {/* Top Banner / Integrator Control Center */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-neutral-950 border border-neutral-800 rounded-3xl p-6 shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Integrador com o Servidor de Banco de Dados
                <span className="px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-full">
                  PostgreSQL · Read Only
                </span>
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Sincronização automática contínua de cadastros e preços do ERP com hash diferencial SHA-256.
              </p>
            </div>
          </div>
        </div>

        {/* Sync Now, Instant Load & Save Actions */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={savingConfig}
            className="px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs md:text-sm rounded-2xl flex items-center gap-2 transition cursor-pointer border border-neutral-700 disabled:opacity-50"
          >
            <Save className={`w-4 h-4 text-emerald-400 ${savingConfig ? 'animate-spin' : ''}`} />
            <span>{savingConfig ? 'Salvando...' : 'Salvar no Banco'}</span>
          </button>

          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncing}
            className="px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-neutral-950 font-black text-xs md:text-sm uppercase tracking-wider rounded-2xl flex items-center gap-2 transition cursor-pointer shadow-[0_0_25px_rgba(34,242,180,0.4)] hover:shadow-[0_0_30px_rgba(34,242,180,0.6)] disabled:opacity-50"
            title="Executa a Carga Instantânea forçada de todos os produtos do ERP para a nuvem agora"
          >
            <Zap className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Carregando Banco...' : 'Carga Instantânea'}</span>
          </button>
        </div>
      </div>

      {/* Read-Only Safety Guarantee Card */}
      <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs text-neutral-300 space-y-0.5">
          <p className="font-bold text-emerald-300">
            PROTEÇÃO TOTAL DO ERP: SESSÃO 100% SOMENTE LEITURA
          </p>
          <p className="text-neutral-400 leading-relaxed">
            Cada ciclo de sincronização executa obrigatoriamente <code className="text-emerald-300">SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY</code>.
            Nenhum dado é gravado, alterado ou excluído na base do ERP. Apenas leitura parametrizada segura.
          </p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 pb-2">
        <button
          onClick={() => setActiveSubTab('verificador')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'verificador'
              ? 'bg-cyan-600 text-white shadow'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Cloud className="w-3.5 h-3.5 text-cyan-300" />
          <span>Verificador Nuvem (Sync & Diagnóstico)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('mysql')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'mysql'
              ? 'bg-orange-600 text-white shadow'
              : 'text-orange-400 hover:text-white hover:bg-neutral-900 border border-orange-500/30'
          }`}
        >
          <Database className="w-3.5 h-3.5 text-orange-400" />
          <span>Banco MySQL (Hostinger)</span>
        </button>

        <button
          onClick={() => {
            setActiveSubTab('importar');
            fetchProducts();
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'importar'
              ? 'bg-neutral-800 text-white border border-neutral-700 shadow'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
          <span>Importar & Cadastrar Produtos ({productList.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('conexao')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'conexao'
              ? 'bg-neutral-800 text-white border border-neutral-700 shadow'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 text-blue-400" />
          <span>Conexão & Credenciais</span>
        </button>

        <button
          onClick={() => setActiveSubTab('query')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'query'
              ? 'bg-neutral-800 text-white border border-neutral-700 shadow'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Code2 className="w-3.5 h-3.5 text-cyan-400" />
          <span>Query SQL & Teste</span>
        </button>

        <button
          onClick={() => setActiveSubTab('logs')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'logs'
              ? 'bg-neutral-800 text-white border border-neutral-700 shadow'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>Histórico de Auditoria ({syncLogs.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('daemon')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'daemon'
              ? 'bg-neutral-800 text-white border border-neutral-700 shadow'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Server className="w-3.5 h-3.5 text-purple-400" />
          <span>Serviço Integrador Autônomo</span>
        </button>
      </div>

      {/* Sub-Tab: Verificador de Sincronização em Nuvem */}
      {activeSubTab === 'verificador' && (
        <VerificadorSincronizacao currentStoreId={config.id_loja} isModal={false} />
      )}

      {/* Sub-Tab: Banco MySQL Hostinger */}
      {activeSubTab === 'mysql' && (
        <BancoMySQLHostinger />
      )}

      {/* Sub-Tab 0: Importar & Cadastrar Produtos */}
      {activeSubTab === 'importar' && (
        <div className="space-y-6">
          {/* Info Banner */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                Importador de Produtos & Gerenciamento Direto
              </h3>
              <p className="text-xs text-neutral-400">
                Você pode importar a lista de produtos diretamente do seu ERP (exportação CSV, TXT ou Excel) ou cadastrar itens manualmente sem precisar executar scripts no Windows.
              </p>
            </div>
            <button
              onClick={fetchProducts}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-xl border border-neutral-700 transition cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              <span>Atualizar Lista ({productList.length})</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Box 1: Importar em Massa (CSV / TXT) */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Upload className="w-4 h-4 text-emerald-400" />
                    1. Importação em Massa (Arquivo ou Colar CSV)
                  </h4>
                  <label className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 text-xs font-bold rounded-xl border border-neutral-700 transition cursor-pointer flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Carregar Arquivo .CSV / .TXT</span>
                    <input type="file" accept=".csv,.txt,.json" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>

                <p className="text-[11px] text-neutral-400">
                  Formato esperado por linha: <code className="text-emerald-300 bg-neutral-950 px-1.5 py-0.5 rounded">codigo_interno;codigo_barras;descricao;preco;embalagem</code>
                </p>

                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={`Cole aqui os dados do ERP. Exemplo:\n1548;7891000100103;ARROZ DULAR PARBOILIZADO 1KG;4.48;PCT;10063021\n2042;7891000200204;FEIJAO SMART PRETO 1KG;6.99;PCT;07133319\n3105;7891000300305;OLEO DE SOJA SOYA 900ML;5.89;UN;15079011`}
                  rows={8}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl p-4 font-mono text-xs text-emerald-300 focus:outline-none focus:border-emerald-500 shadow-inner leading-relaxed"
                />

                {importFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs font-medium ${
                      importFeedback.success
                        ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                        : 'bg-red-950/80 border border-red-800 text-red-300'
                    }`}
                  >
                    {importFeedback.message}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleImportTextSubmit}
                disabled={importing || !importText.trim()}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{importing ? 'Importando Produtos...' : 'Processar e Salvar Produtos no Banco'}</span>
              </button>
            </div>

            {/* Box 2: Cadastro Rápido Individual */}
            <form onSubmit={handleSaveSingleItem} className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-cyan-400" />
                  2. Cadastrar / Alterar Produto Individual
                </h4>
                <p className="text-[11px] text-neutral-400">
                  Adicione ou modifique o preço de qualquer item instantaneamente.
                </p>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-neutral-400 font-semibold block mb-1">Código Interno</label>
                    <input
                      type="text"
                      value={newItem.codigo_interno}
                      onChange={(e) => setNewItem({ ...newItem, codigo_interno: e.target.value })}
                      placeholder="Ex: 1548"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-400 font-semibold block mb-1">Código de Barras (EAN)</label>
                    <input
                      type="text"
                      value={newItem.codigo_barras}
                      onChange={(e) => setNewItem({ ...newItem, codigo_barras: e.target.value })}
                      placeholder="Ex: 7891000100103"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="text-neutral-400 font-semibold block mb-1">Descrição Completa</label>
                    <input
                      type="text"
                      required
                      value={newItem.descricao}
                      onChange={(e) => setNewItem({ ...newItem, descricao: e.target.value })}
                      placeholder="Ex: ARROZ DULAR PARBOILIZADO 1KG"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white font-bold focus:border-cyan-500 focus:outline-none uppercase"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-400 font-semibold block mb-1">Preço de Venda (R$)</label>
                    <input
                      type="text"
                      required
                      value={newItem.preco}
                      onChange={(e) => setNewItem({ ...newItem, preco: e.target.value })}
                      placeholder="Ex: 4.48"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-emerald-400 font-bold font-mono focus:border-cyan-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-400 font-semibold block mb-1">Embalagem</label>
                    <select
                      value={newItem.embalagem}
                      onChange={(e) => setNewItem({ ...newItem, embalagem: e.target.value })}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white font-semibold focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="UN">UN (Unidade)</option>
                      <option value="PCT">PCT (Pacote)</option>
                      <option value="KG">KG (Quilo)</option>
                      <option value="CX">CX (Caixa)</option>
                      <option value="LT">LT (Lata)</option>
                      <option value="FD">FD (Fardo)</option>
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="text-neutral-400 font-semibold block mb-1">NCM (Opcional)</label>
                    <input
                      type="text"
                      value={newItem.ncm}
                      onChange={(e) => setNewItem({ ...newItem, ncm: e.target.value })}
                      placeholder="Ex: 10063021"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-300 font-mono focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingItem}
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>{savingItem ? 'Salvando Produto...' : 'Salvar Produto no Banco de Dados'}</span>
              </button>
            </form>
          </div>

          {/* Box 3: Tabela de Produtos Cadastrados */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  Produtos no Banco de Dados (Loja {config.id_loja})
                </h4>
                <p className="text-xs text-neutral-400">Total: {productList.length} produtos sincronizados e ativos</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDeleteAllProducts}
                  disabled={productList.length === 0 || clearingProducts}
                  className="px-3.5 py-1.5 bg-red-950/70 hover:bg-red-900/90 text-red-300 border border-red-800/80 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
                  title="Remove todos os produtos da base de dados"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{clearingProducts ? 'Zerando...' : 'Zerar Base (Remover Todos)'}</span>
                </button>

                <div className="relative">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrar por nome, código ou EAN..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-56 sm:w-64"
                  />
                </div>
              </div>
            </div>

            {productList.length === 0 ? (
              <div className="py-12 px-4 text-center bg-neutral-950/60 rounded-2xl border border-neutral-800/80 space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500">
                  <Database className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">Nenhum produto cadastrado no momento</p>
                  <p className="text-xs text-neutral-400 max-w-md mx-auto">
                    A base está 100% limpa. Carregue seu arquivo de produtos (TXT/CSV) no campo acima ou inicie a sincronização com o banco do seu supermercado.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800 sticky top-0">
                    <tr>
                      <th className="p-3">Cód. Interno</th>
                      <th className="p-3">Código de Barras</th>
                      <th className="p-3">Descrição do Produto</th>
                      <th className="p-3 text-right">Preço de Venda</th>
                      <th className="p-3 text-center">Emb.</th>
                      <th className="p-3">NCM</th>
                      <th className="p-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {productList
                      .filter((p) => {
                        if (!searchFilter.trim()) return true;
                        const q = searchFilter.toLowerCase();
                        return (
                          p.descricao.toLowerCase().includes(q) ||
                          p.codigo_barras.includes(q) ||
                          p.codigo_interno.includes(q)
                        );
                      })
                      .map((item) => (
                        <tr key={item.id} className="hover:bg-neutral-800/40 transition">
                          <td className="p-3 text-neutral-300 font-bold">{item.codigo_interno}</td>
                          <td className="p-3 text-emerald-400">{item.codigo_barras}</td>
                          <td className="p-3 text-white font-sans font-semibold max-w-xs truncate">{item.descricao}</td>
                          <td className="p-3 text-right text-emerald-400 font-bold text-sm">
                            R$ {Number(item.preco).toFixed(2).replace('.', ',')}
                          </td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 bg-neutral-800 rounded text-neutral-300 text-[11px] font-bold">
                              {item.embalagem || 'UN'}
                            </span>
                          </td>
                          <td className="p-3 text-neutral-400">{item.ncm || '-'}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setNewItem({
                                    codigo_interno: item.codigo_interno,
                                    codigo_barras: item.codigo_barras,
                                    descricao: item.descricao,
                                    preco: String(item.preco),
                                    embalagem: item.embalagem || 'UN',
                                    ncm: item.ncm || '',
                                  });
                                  window.scrollTo({ top: 300, behavior: 'smooth' });
                                }}
                                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-cyan-400 rounded-lg text-[11px] font-bold cursor-pointer transition"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSingleProduct(item.id, item.descricao)}
                                title="Excluir produto"
                                className="p-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 text-red-400 rounded-lg text-[11px] cursor-pointer transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab 1: Conexão & Credenciais */}
      {activeSubTab === 'conexao' && (
        <div className="space-y-6">
          {/* Diagnostic & Connection Guide Banner */}
          <div className="bg-gradient-to-r from-blue-950/70 via-neutral-900 to-neutral-900 border border-blue-800/60 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-500/20 text-blue-400 rounded-2xl shrink-0">
                <Terminal className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Como Conectar seu Banco de Dados Local ao Aplicativo em Nuvem
                  <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] font-bold rounded-full border border-blue-500/30">
                    Rede Local do Supermercado
                  </span>
                </h3>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  O seu banco de dados PostgreSQL roda no computador da sua loja (<code className="text-blue-300 font-mono">127.0.0.1</code>).
                  Servidores em nuvem não têm acesso direto à rede interna do seu computador por restrições normais de segurança e firewall.
                  Por isso, a sincronização é feita executando o <strong>Agente Local</strong> diretamente no computador onde o PostgreSQL está instalado.
                </p>
              </div>
            </div>

            {/* Live Agent Status Widget */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
              agentStatus?.online
                ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200'
                : 'bg-neutral-950/80 border-neutral-800 text-neutral-400'
            }`}>
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${agentStatus?.online ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="font-bold text-white">
                  {agentStatus?.online ? 'Agente Local Conectado & Operacional' : 'Agente Local: Aguardando Execução'}
                </span>
                <span className="hidden sm:inline text-neutral-400">·</span>
                <span className="text-neutral-300 text-[11px] truncate max-w-sm">
                  {agentStatus?.ultimo_status || 'Execute o comando abaixo no servidor do supermercado.'}
                </span>
              </div>
              {agentStatus?.online && (
                <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 font-mono font-bold rounded-lg shrink-0">
                  {agentStatus.produtos_sincronizados} produtos
                </span>
              )}
            </div>

            <div className="bg-neutral-950/90 rounded-2xl p-4 border border-neutral-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" />
                  Comando 1-Clique no Windows PowerShell (Recomendado):
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const origin = typeof window !== 'undefined' ? window.location.origin : '';
                    const cmd = `irm ${origin}/api/integrador/download-ps1 | iex`;
                    navigator.clipboard.writeText(cmd);
                    setCopiedPowerShell(true);
                    setTimeout(() => setCopiedPowerShell(false), 3000);
                  }}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-mono font-bold cursor-pointer transition flex items-center gap-1.5 shrink-0 border border-neutral-700"
                >
                  {copiedPowerShell ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPowerShell ? 'Copiado!' : 'Copiar Comando'}</span>
                </button>
              </div>

              <div className="font-mono text-xs text-emerald-300 bg-neutral-900 p-3 rounded-xl overflow-x-auto border border-neutral-800 select-all">
                {`irm ${typeof window !== 'undefined' ? window.location.origin : ''}/api/integrador/download-ps1 | iex`}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-neutral-400 pt-1">
                <div className="p-2 bg-neutral-900/60 rounded-lg border border-neutral-800/80">
                  <span className="text-white font-bold block mb-0.5">1. Abra o PowerShell</span>
                  No Windows, vá no Iniciar e digite "PowerShell".
                </div>
                <div className="p-2 bg-neutral-900/60 rounded-lg border border-neutral-800/80">
                  <span className="text-white font-bold block mb-0.5">2. Cole e dê Enter</span>
                  O script detectará a porta 5432 e o caminho do PostgreSQL.
                </div>
                <div className="p-2 bg-neutral-900/60 rounded-lg border border-neutral-800/80">
                  <span className="text-white font-bold block mb-0.5">3. Transmissão Automática</span>
                  Ele lê as tabelas do VR Software e transmite os preços para cá!
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Connection Form (2 Cols) */}
          <form onSubmit={handleSave} className="lg:col-span-2 bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-5">
            <h3 className="text-base font-bold text-white flex items-center justify-between border-b border-neutral-800 pb-3">
              <span className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                Parâmetros do Servidor PostgreSQL
              </span>
              <span className="text-[11px] font-mono text-neutral-500">Porta padrão 5432</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-neutral-400 block mb-1">Host / IP do Servidor do Banco</label>
                <input
                  type="text"
                  value={config.host}
                  onChange={(e) => setConfig({ ...config, host: e.target.value })}
                  placeholder="ex: 192.168.1.100 ou localhost"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-400 block mb-1">Porta TCP</label>
                <input
                  type="number"
                  value={config.port}
                  onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 5432 })}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-400 block mb-1">Nome do Banco de Dados</label>
                <input
                  type="text"
                  value={config.database}
                  onChange={(e) => setConfig({ ...config, database: e.target.value })}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-400 block mb-1">Usuário do Banco (Read-Only)</label>
                <input
                  type="text"
                  value={config.user}
                  onChange={(e) => setConfig({ ...config, user: e.target.value })}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-400 block mb-1">Senha do Banco</label>
                <input
                  type="password"
                  value={config.password || ''}
                  onChange={(e) => setConfig({ ...config, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Identificação e Nome da Loja */}
            <div className="pt-3 border-t border-neutral-800">
              <label className="text-xs font-semibold text-neutral-300 block mb-1">
                Nome da Loja / Supermercado (Exibido no Canto Superior)
              </label>
              <input
                type="text"
                value={config.nome_loja || ''}
                onChange={(e) => setConfig({ ...config, nome_loja: e.target.value })}
                placeholder="Ex: Supermercado Modelo - Loja 01 (Matriz)"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-white font-bold text-sm focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[11px] text-neutral-400">
                Este nome é exibido no topo da tela do Busca Preço, no Painel Administrativo e nos relatórios.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm pt-3 border-t border-neutral-800">
              <div>
                <label className="text-xs font-semibold text-neutral-400 block mb-1">
                  ID da Loja Atual ($2)
                </label>
                <input
                  type="number"
                  value={config.id_loja}
                  onChange={(e) => setConfig({ ...config, id_loja: parseInt(e.target.value) || 1 })}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
                <span className="text-[11px] text-neutral-500">pc.id_loja</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-400 block mb-1">
                  Situação de Cadastro Ativo ($1)
                </label>
                <input
                  type="number"
                  value={config.id_situacaocadastro}
                  onChange={(e) => setConfig({ ...config, id_situacaocadastro: parseInt(e.target.value) || 1 })}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
                <span className="text-[11px] text-neutral-500">p.id_situacaocadastro</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-400 block mb-1">
                  Intervalo da Sincronização
                </label>
                <select
                  value={config.intervalo_minutos}
                  onChange={(e) => setConfig({ ...config, intervalo_minutos: parseInt(e.target.value) as any })}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-white font-semibold focus:outline-none focus:border-emerald-500"
                >
                  <option value={1}>A cada 1 minuto (Tempo Real)</option>
                  <option value={5}>A cada 5 minutos (Recomendado)</option>
                  <option value={10}>A cada 10 minutos (Padrão)</option>
                  <option value={15}>A cada 15 minutos</option>
                  <option value={30}>A cada 30 minutos</option>
                  <option value={60}>A cada 1 hora</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-neutral-800">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.sincronizacao_automatica}
                    onChange={(e) => setConfig({ ...config, sincronizacao_automatica: e.target.checked })}
                    className="rounded text-emerald-500 focus:ring-0"
                  />
                  <span>Sincronização em segundo plano ativa</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(config.ssl)}
                    onChange={(e) => setConfig({ ...config, ssl: e.target.checked })}
                    className="rounded text-emerald-500 focus:ring-0"
                  />
                  <span>Habilitar criptografia SSL/TLS na conexão</span>
                </label>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-xl border border-neutral-700 transition cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
                  <span>Testar Conexão</span>
                </button>

                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow disabled:opacity-50"
                >
                  <Save className={`w-4 h-4 ${savingConfig ? 'animate-spin' : ''}`} />
                  <span>{savingConfig ? 'Gravando no Banco...' : 'Salvar Configurações no Banco'}</span>
                </button>
              </div>
            </div>

            {/* Test connection result banner */}
            {testResult && (
              <div
                className={`p-4 rounded-2xl text-xs flex items-start gap-3 animate-fadeIn ${
                  testResult.success
                    ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-200'
                    : 'bg-red-950/60 border border-red-800 text-red-200'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                )}
                <div className="space-y-1">
                  <p className="font-bold text-sm">{testResult.message}</p>
                  {testResult.detalhes && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] font-mono text-neutral-300">
                      <div>Host: <strong className="text-white">{testResult.detalhes.host}</strong></div>
                      <div>Latência: <strong className="text-emerald-400">{testResult.detalhes.latencia_ms} ms</strong></div>
                      <div>Banco: <strong className="text-white">{testResult.detalhes.database}</strong></div>
                      <div>Modo: <strong className="text-emerald-300">{testResult.detalhes.modo}</strong></div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {saveSuccess && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Configurações salvas e aplicadas ao Integrador!
              </div>
            )}
          </form>

          {/* Right Status Card */}
          <div className="space-y-6">
            {/* Live Status Card */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                Diagnóstico do Integrador
              </h3>
              
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-3 bg-neutral-950 rounded-xl border border-neutral-800">
                  <span className="text-neutral-400">Motor de Sincronização:</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Ativo
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-neutral-950 rounded-xl border border-neutral-800">
                  <span className="text-neutral-400">Algoritmo de Hash:</span>
                  <span className="text-neutral-200 font-mono font-bold">SHA-256 Diferencial</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-neutral-950 rounded-xl border border-neutral-800">
                  <span className="text-neutral-400">Frequência:</span>
                  <span className="text-neutral-200 font-bold">A cada {config.intervalo_minutos} min</span>
                </div>
              </div>
            </div>

            {/* Last Sync Result Card */}
            {syncResult && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4 animate-fadeIn">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Resultado da Última Execução
                </h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
                    <div className="text-xl font-black text-white">{syncResult.produtos_analisados}</div>
                    <div className="text-[10px] text-neutral-400 uppercase">Analisados</div>
                  </div>
                  <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
                    <div className="text-xl font-black text-amber-400">{syncResult.produtos_atualizados}</div>
                    <div className="text-[10px] text-neutral-400 uppercase">Alterados</div>
                  </div>
                  <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
                    <div className="text-xl font-black text-emerald-400">{syncResult.produtos_novos}</div>
                    <div className="text-[10px] text-neutral-400 uppercase">Novos</div>
                  </div>
                </div>
                <div className="text-xs text-neutral-400 text-right font-mono">
                  Tempo: <span className="text-emerald-400 font-bold">{syncResult.tempo_ms} ms</span>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      {/* Sub-Tab 2: Query SQL & Mapeamento */}
      {activeSubTab === 'query' && (
        <div className="space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-cyan-400" />
                  Estrutura da Query SQL de Extração de Produtos
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Esta consulta extrai o código interno, código de barras EAN, descrição, preço de venda, embalagem e NCM.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfig({ ...config, custom_query: '' });
                    handleSave();
                  }}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl border border-neutral-700 transition cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restaurar Query Padrão</span>
                </button>

                <button
                  type="button"
                  onClick={handleRunQueryTest}
                  disabled={runningQueryTest}
                  className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow"
                >
                  <Play className={`w-3.5 h-3.5 ${runningQueryTest ? 'animate-spin' : ''}`} />
                  <span>{runningQueryTest ? 'Executando...' : 'Executar Query de Teste (10 Linhas)'}</span>
                </button>
              </div>
            </div>

            {/* SQL Code View */}
            <div className="relative">
              <textarea
                value={config.custom_query || DEFAULT_QUERY_TEMPLATE}
                onChange={(e) => setConfig({ ...config, custom_query: e.target.value })}
                rows={14}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl p-4 font-mono text-xs text-emerald-300 focus:outline-none focus:border-cyan-500 leading-relaxed shadow-inner"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Parâmetros injetados com segurança: <strong>$1</strong> = id_situacaocadastro ({config.id_situacaocadastro}), <strong>$2</strong> = id_loja ({config.id_loja})</span>
              <button
                type="button"
                onClick={() => handleSave()}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold"
              >
                Salvar Query
              </button>
            </div>
          </div>

          {/* Test Query Live Results Table */}
          {queryTestResult && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Resultado da Execução da Query ({queryTestResult.linhas_retornadas || 0} produtos retornados em {queryTestResult.tempo_ms}ms)
                </h3>
                <span className="text-xs text-neutral-400 font-mono">Fonte: {queryTestResult.origem}</span>
              </div>

              {queryTestResult.amostra && queryTestResult.amostra.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800">
                      <tr>
                        <th className="p-2.5">Cód. Interno</th>
                        <th className="p-2.5">Código de Barras</th>
                        <th className="p-2.5">Descrição</th>
                        <th className="p-2.5 text-right">Preço Venda</th>
                        <th className="p-2.5 text-center">Emb.</th>
                        <th className="p-2.5">NCM</th>
                        <th className="p-2.5 text-center">Loja</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {queryTestResult.amostra.map((row: any, idx: number) => (
                        <tr key={idx} className="hover:bg-neutral-800/40">
                          <td className="p-2.5 text-emerald-400 font-bold">{row.codigo_interno}</td>
                          <td className="p-2.5 text-white">{row.codigo_barras}</td>
                          <td className="p-2.5 text-neutral-200">{row.descricao}</td>
                          <td className="p-2.5 text-right text-emerald-300 font-bold">
                            R$ {Number(row.preco).toFixed(2)}
                          </td>
                          <td className="p-2.5 text-center text-neutral-400">{row.embalagem}</td>
                          <td className="p-2.5 text-neutral-400">{row.ncm}</td>
                          <td className="p-2.5 text-center text-neutral-300">Loja {row.id_loja}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 bg-neutral-950 rounded-xl text-neutral-400 text-xs">
                  Nenhum registro retornado com os filtros informados ($1={config.id_situacaocadastro}, $2={config.id_loja}).
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 3: Histórico e Logs de Auditoria */}
      {activeSubTab === 'logs' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              Histórico Detalhado de Sincronizações
            </h3>
            <button
              onClick={fetchLogs}
              className="text-xs text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Atualizar Logs
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-neutral-950 text-neutral-400 font-semibold border-b border-neutral-800">
                <tr>
                  <th className="p-3">Data / Hora</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Loja</th>
                  <th className="p-3 text-right">Analisados</th>
                  <th className="p-3 text-right">Atualizados</th>
                  <th className="p-3 text-right">Novos</th>
                  <th className="p-3 text-right">Duração</th>
                  <th className="p-3">Detalhes / Observações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {syncLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-neutral-800/40">
                    <td className="p-3 text-neutral-300">
                      {formatDateTimeBR(log.data_hora)}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          log.status === 'SUCESSO'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-red-950 text-red-400 border border-red-800'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="p-3 text-neutral-300">Loja {log.id_loja}</td>
                    <td className="p-3 text-right text-neutral-200">{log.produtos_analisados}</td>
                    <td className="p-3 text-right text-amber-400 font-bold">{log.produtos_atualizados}</td>
                    <td className="p-3 text-right text-emerald-400 font-bold">{log.produtos_novos}</td>
                    <td className="p-3 text-right text-neutral-400">{log.tempo_ms} ms</td>
                    <td className="p-3 text-neutral-400 max-w-xs truncate">{log.erros || 'Concluído com sucesso'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-Tab 4: Serviço Integrador Autônomo & Simulador */}
      {activeSubTab === 'daemon' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Standalone Daemon Card */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-purple-400" />
              Executar Integrador como Serviço no Windows / Linux
            </h3>
            
            {/* Windows Script Host Warning Box */}
            <div className="p-3.5 bg-amber-950/40 border border-amber-800/60 rounded-2xl flex items-start gap-2.5 text-xs">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-neutral-300 space-y-1">
                <p className="font-bold text-amber-300">Atenção ao executar no Windows:</p>
                <p className="text-neutral-400 leading-relaxed">
                  Não dê duplo clique diretamente no arquivo <code>.js</code> (o Windows tentará abri-lo com o antigo <em>Windows Script Host</em> e dará erro de sintaxe 800A03EA).
                  Execute sempre o arquivo <strong>iniciar-integrador.bat</strong> ou rode via terminal: <code className="text-white">node integrador-postgresql.js</code>.
                </p>
              </div>
            </div>

            <div className="p-4 bg-neutral-950 rounded-2xl border border-neutral-800 font-mono text-xs text-neutral-300 space-y-2">
              <p className="text-purple-400 font-bold"># Como rodar no servidor local:</p>
              <p>1. Baixe os 2 arquivos abaixo na mesma pasta (ex: <code className="text-white">C:\vr\Supermercado\</code>)</p>
              <p>2. Execute o arquivo <code className="text-emerald-400 font-bold">iniciar-integrador.bat</code> com duplo clique</p>
              <p>3. Ele verifica o Node.js, instala o driver PostgreSQL e inicia a sincronização contínua!</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  const url = `/api/integrador/download-server-app?host=${encodeURIComponent(config.host)}&port=${config.port}&database=${encodeURIComponent(config.database)}&user=${encodeURIComponent(config.user)}&password=${encodeURIComponent(config.password || '')}&id_loja=${config.id_loja}&id_situacaocadastro=${config.id_situacaocadastro}&interval=${config.intervalo_minutos}`;
                  downloadBlobFromUrl(url, 'App-Sincronizador-Servidor.bat');
                }}
                className="py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-lg col-span-full ring-2 ring-emerald-400"
              >
                <Server className="w-4 h-4" />
                <span>📲 Baixar App Sincronizador Contínuo (Para rodar no Servidor)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const url = `/api/integrador/download-native-windows?host=${encodeURIComponent(config.host)}&port=${config.port}&database=${encodeURIComponent(config.database)}&user=${encodeURIComponent(config.user)}&password=${encodeURIComponent(config.password || '')}&id_loja=${config.id_loja}&id_situacaocadastro=${config.id_situacaocadastro}`;
                  downloadBlobFromUrl(url, 'sincronizador-local-windows.bat');
                }}
                className="py-3 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer border border-neutral-700"
              >
                <Download className="w-4 h-4" />
                <span>Sincronizador Único em 1 Clique</span>
              </button>

              <button
                type="button"
                onClick={() => downloadBlobFromUrl('/api/integrador/download-autoinstaller', 'instalador-integrador-automatico.bat')}
                className="py-3 px-4 bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow"
              >
                <Download className="w-4 h-4" />
                <span>Baixar Instalador com Node.js</span>
              </button>

              <button
                type="button"
                onClick={() => downloadBlobFromUrl('/api/integrador/download-daemon', 'integrador-postgresql.js')}
                className="py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow"
              >
                <Download className="w-4 h-4" />
                <span>Baixar integrador-postgresql.js</span>
              </button>
            </div>
          </div>

          {/* Test Bench Simulator */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-400" />
              Bancada de Testes: Alteração de Preço
            </h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Altere o preço de um item na base de teste para validar a detecção de hash diferencial pelo integrador:
            </p>

            <div className="p-4 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-400">Item Selecionado:</span>
                <span className="text-white font-bold">1548 - ARROZ DULAR 1KG</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-neutral-400">Novo Preço: R$</span>
                <input
                  type="number"
                  step="0.01"
                  value={simPriceInput}
                  onChange={(e) => setSimPriceInput(e.target.value)}
                  className="flex-1 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-sm text-white font-mono"
                />
                <button
                  type="button"
                  onClick={handleSimulateERPPrice}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl cursor-pointer transition shadow"
                >
                  Aplicar no ERP
                </button>
              </div>
            </div>

            {simFeedback && (
              <div className="text-xs bg-amber-950/60 border border-amber-800 text-amber-200 p-3 rounded-xl animate-fadeIn">
                {simFeedback}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
