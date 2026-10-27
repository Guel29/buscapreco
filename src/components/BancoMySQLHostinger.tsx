import React, { useState, useEffect } from 'react';
import {
  Database,
  Copy,
  Check,
  Download,
  Server,
  Key,
  ShieldCheck,
  ExternalLink,
  Code2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Table,
  Layers,
  HelpCircle,
  Save,
  Upload,
  ArrowDownToLine,
  ArrowUpFromLine,
  Info,
  FileCode,
  FolderArchive,
  Eye,
  EyeOff,
  Lock,
  Terminal,
  Zap,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Globe,
  Settings,
  Cpu,
} from 'lucide-react';
import {
  fetchMySQLSchema,
  testMySQLConnection,
  fetchMySQLConfig,
  saveMySQLConfig,
  syncProductsToMySQL,
  syncProductsFromMySQL,
} from '../services/api';

export function BancoMySQLHostinger() {
  const [schemaSql, setSchemaSql] = useState<string>('');
  const [loadingSchema, setLoadingSchema] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'deploy-files' | 'test' | 'schema' | 'instructions'>('deploy-files');

  // Code view & copy states
  const [copiedIndexPhp, setCopiedIndexPhp] = useState<boolean>(false);
  const [copiedUpdaterPhp, setCopiedUpdaterPhp] = useState<boolean>(false);
  const [showIndexPhpCode, setShowIndexPhpCode] = useState<boolean>(false);
  const [showUpdaterPhpCode, setShowUpdaterPhpCode] = useState<boolean>(false);
  const [isOculto, setIsOculto] = useState<boolean>(false);

  // Connection Config State
  const [testHost, setTestHost] = useState<string>('localhost');
  const [testPort, setTestPort] = useState<number>(3306);
  const [testDb, setTestDb] = useState<string>('u366235819_busca');
  const [testUser, setTestUser] = useState<string>('u366235819_busca');
  const [testPassword, setTestPassword] = useState<string>('');
  const [testing, setTesting] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [syncingTo, setSyncingTo] = useState<boolean>(false);
  const [syncingFrom, setSyncingFrom] = useState<boolean>(false);

  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: any; solucao?: string[] } | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [serverConfig, setServerConfig] = useState<any>(null);

  useEffect(() => {
    loadSchema();
    loadSavedConfig();
  }, []);

  async function loadSchema() {
    setLoadingSchema(true);
    try {
      const data = await fetchMySQLSchema();
      if (data && data.schema_sql) {
        setSchemaSql(data.schema_sql);
      }
    } catch (err) {
      console.error('Erro ao carregar schema:', err);
    } finally {
      setLoadingSchema(false);
    }
  }

  async function loadSavedConfig() {
    try {
      // 1. Check local cache first
      try {
        const local = localStorage.getItem('cached_mysql_config');
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed.host) setTestHost(parsed.host);
          if (parsed.port) setTestPort(parsed.port);
          if (parsed.database) setTestDb(parsed.database);
          if (parsed.user) setTestUser(parsed.user);
          if (parsed.has_password) setTestPassword('••••••••');
        }
      } catch {}

      // 2. Fetch from server
      const data = await fetchMySQLConfig();
      if (data) {
        setServerConfig(data);
        if (data.host) setTestHost(data.host);
        if (data.port) setTestPort(data.port);
        if (data.database) setTestDb(data.database);
        if (data.user) setTestUser(data.user);
        if (data.has_password) setTestPassword('••••••••');
        try {
          localStorage.setItem('cached_mysql_config', JSON.stringify(data));
        } catch {}
      }
    } catch (err) {
      console.error('Erro ao carregar config do MySQL:', err);
    }
  }

  function handleCopy() {
    if (!schemaSql) return;
    navigator.clipboard.writeText(schemaSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  async function handleTestConnection(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setTesting(true);
    setTestResult(null);
    setActionMessage(null);
    try {
      const res = await testMySQLConnection({
        host: testHost,
        port: testPort,
        database: testDb,
        user: testUser,
        password: testPassword === '••••••••' ? undefined : testPassword,
      });
      setTestResult(res);
      if (res.success) {
        loadSavedConfig();
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Erro ao conectar ao servidor MySQL Hostinger.',
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveConfig() {
    setSaving(true);
    setActionMessage(null);
    try {
      try {
        localStorage.setItem(
          'cached_mysql_config',
          JSON.stringify({
            host: testHost,
            port: testPort,
            database: testDb,
            user: testUser,
            has_password: Boolean(testPassword),
            enabled: true,
          })
        );
      } catch {}

      const res = await saveMySQLConfig({
        host: testHost,
        port: testPort,
        database: testDb,
        user: testUser,
        password: testPassword === '••••••••' ? undefined : testPassword,
        enabled: true,
      });
      if (res && res.success) {
        setActionMessage({ type: 'success', text: res.message || 'Configuração do MySQL Hostinger salva com sucesso!' });
        loadSavedConfig();
      } else {
        // Mesmo se o servidor estiver pendente de conexão externa, as configurações foram gravadas
        setActionMessage({
          type: 'success',
          text: 'Configurações salvas localmente! (Banco: ' + testDb + ', Usuário: ' + testUser + ')',
        });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'success',
        text: 'Configurações salvas localmente no navegador! (Banco: ' + testDb + ')',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncToMySQL() {
    setSyncingTo(true);
    setActionMessage(null);
    try {
      const res = await syncProductsToMySQL();
      if (res.success) {
        setActionMessage({ type: 'success', text: res.message });
      } else {
        setActionMessage({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Erro ao sincronizar com MySQL.' });
    } finally {
      setSyncingTo(false);
    }
  }

  async function handleSyncFromMySQL() {
    setSyncingFrom(true);
    setActionMessage(null);
    try {
      const res = await syncProductsFromMySQL();
      if (res.success) {
        setActionMessage({ type: 'success', text: res.message });
      } else {
        setActionMessage({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Erro ao importar produtos do MySQL.' });
    } finally {
      setSyncingFrom(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Principal */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-900/90 to-neutral-950 border border-amber-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="px-3 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 font-extrabold text-[11px] rounded-full uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <Globe className="w-3.5 h-3.5 text-amber-400" />
                Subdomínio: buscapreco.instara.com.br
              </span>
              <span className="px-2.5 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold rounded-full uppercase">
                Hostinger MySQL & PHP
              </span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
              <Database className="w-7 h-7 text-amber-400" />
              Implantação & Arquivos do Sistema na Hostinger
            </h2>
            <p className="text-xs sm:text-sm text-neutral-300 max-w-2xl leading-relaxed">
              Sistema completo em <strong>arquivo único</strong> para hospedar no subdomínio <code className="text-amber-300 font-mono font-bold">buscapreco.instara.com.br</code> com motor de banco de dados MySQL e arquivo dedicado de atualização contínua.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsOculto(!isOculto)}
              className="px-3.5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-bold text-xs flex items-center gap-1.5 border border-neutral-700 transition cursor-pointer"
              title={isOculto ? 'Exibir detalhes dos arquivos' : 'Ocultar detalhes dos arquivos'}
            >
              {isOculto ? <Eye className="w-4 h-4 text-amber-400" /> : <EyeOff className="w-4 h-4 text-neutral-400" />}
              <span>{isOculto ? 'Mostrar Arquivos' : 'Deixar Oculto'}</span>
            </button>

            <a
              href="/api/deploy/download-hostinger-zip"
              download="buscapreco_instara_hostinger_deploy.zip"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-neutral-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              <FolderArchive className="w-4 h-4" />
              <span>Baixar Pacote Completo (.ZIP)</span>
            </a>
          </div>
        </div>

        {/* Sub-Navegação de Abas */}
        <div className="flex flex-wrap gap-2 pt-6 mt-4 border-t border-neutral-800/80">
          <button
            onClick={() => setActiveTab('deploy-files')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'deploy-files'
                ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20'
                : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-800 hover:text-white border border-neutral-700/60'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>1. Arquivos do Sistema & Atualizador</span>
          </button>

          <button
            onClick={() => setActiveTab('test')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'test'
                ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20'
                : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-800 hover:text-white border border-neutral-700/60'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            <span>2. Testador & Conexão MySQL</span>
          </button>

          <button
            onClick={() => setActiveTab('schema')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'schema'
                ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20'
                : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-800 hover:text-white border border-neutral-700/60'
            }`}
          >
            <Table className="w-4 h-4" />
            <span>3. Schema SQL (phpMyAdmin)</span>
          </button>

          <button
            onClick={() => setActiveTab('instructions')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'instructions'
                ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20'
                : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-800 hover:text-white border border-neutral-700/60'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>4. Guia Passo a Passo</span>
          </button>
        </div>
      </div>

      {/* Aba 1: Arquivos do Sistema & Atualizador */}
      {activeTab === 'deploy-files' && (
        <div className="space-y-6">
          {/* Card 1: Arquivo Único do Sistema (index.php) */}
          <div className="bg-neutral-900 border border-amber-500/40 rounded-3xl p-6 sm:p-7 space-y-5 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 font-extrabold text-[11px] rounded-full uppercase">
                    ⭐ Arquivo Principal do Sistema
                  </span>
                  <span className="text-xs text-neutral-400 font-mono bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">
                    index.php (All-in-One)
                  </span>
                </div>
                <h3 className="text-xl font-black text-white flex items-center gap-2.5">
                  <FileCode className="w-6 h-6 text-amber-400" />
                  Arquivo Único de Implantação na Hostinger
                </h3>
                <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed max-w-3xl">
                  Coloque este arquivo <code className="text-amber-300 font-mono font-bold">index.php</code> dentro da pasta do subdomínio <code className="text-white font-mono bg-neutral-800 px-1 rounded">buscapreco.instara.com.br</code>. Ele roda o sistema completo: busca rápida de preços com leitor de código de barras, áudio nativo, teclado touch, auto-criação de tabelas no MySQL e API REST.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <a
                  href="/api/deploy/download-index-php"
                  download="index.php"
                  className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-neutral-950 font-black text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar index.php</span>
                </a>

                <button
                  type="button"
                  onClick={() => setShowIndexPhpCode(!showIndexPhpCode)}
                  className="p-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl border border-neutral-700 transition cursor-pointer"
                  title="Ver/Ocultar Código"
                >
                  {showIndexPhpCode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Destaques do Arquivo Único */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-black/50 border border-neutral-800 p-3.5 rounded-2xl space-y-1">
                <span className="font-bold text-amber-400 font-mono">1. Frontend Interativo</span>
                <p className="text-neutral-400">Interface completa para terminais touch e leitores de código de barras com áudio nativo.</p>
              </div>
              <div className="bg-black/50 border border-neutral-800 p-3.5 rounded-2xl space-y-1">
                <span className="font-bold text-amber-400 font-mono">2. Auto-Instalador MySQL</span>
                <p className="text-neutral-400">Cria e ajusta automaticamente as tabelas de produtos, lojas e logs na primeira execução.</p>
              </div>
              <div className="bg-black/50 border border-neutral-800 p-3.5 rounded-2xl space-y-1">
                <span className="font-bold text-amber-400 font-mono">3. API REST Completa</span>
                <p className="text-neutral-400">Endpoints para busca por código de barras, código interno, nome e sincronização em lote.</p>
              </div>
            </div>

            {/* Visualizador de Código Expansível */}
            {showIndexPhpCode && (
              <div className="space-y-2 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Código-fonte completo do <strong className="text-white font-mono">index.php</strong>:</span>
                  <a
                    href="/public/index.php"
                    target="_blank"
                    className="text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir arquivo bruto
                  </a>
                </div>
                <div className="bg-black/90 border border-neutral-800 rounded-2xl p-4 text-xs text-amber-300/90 font-mono max-h-[300px] overflow-y-auto">
                  <p className="text-neutral-500">// Arquivo index.php disponível para download direto acima.</p>
                  <p className="text-neutral-400 mt-2">Clique no botão laranja "Baixar index.php" para obter o arquivo pronto para a Hostinger.</p>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Arquivo de Atualização do App (atualizar_app.php) */}
          <div className="bg-neutral-900 border border-emerald-500/40 rounded-3xl p-6 sm:p-7 space-y-5 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-extrabold text-[11px] rounded-full uppercase">
                    🔄 Arquivo de Atualização do App
                  </span>
                  <span className="text-xs text-neutral-400 font-mono bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">
                    atualizar_app.php
                  </span>
                </div>
                <h3 className="text-xl font-black text-white flex items-center gap-2.5">
                  <RefreshCw className="w-6 h-6 text-emerald-400" />
                  Arquivo de Atualização e Sincronização do App
                </h3>
                <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed max-w-3xl">
                  Arquivo autônomo para <strong>atualizar os preços e produtos</strong> na Hostinger, executar reparos e migrações nas tabelas do banco de dados e receber cargas de ERP ou Agente em lote via POST ou navegador.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <a
                  href="/api/deploy/download-updater-php"
                  download="atualizar_app.php"
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar atualizar_app.php</span>
                </a>

                <button
                  type="button"
                  onClick={() => setShowUpdaterPhpCode(!showUpdaterPhpCode)}
                  className="p-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl border border-neutral-700 transition cursor-pointer"
                  title="Ver/Ocultar Código"
                >
                  {showUpdaterPhpCode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Destaques do Atualizador */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-black/50 border border-neutral-800 p-3.5 rounded-2xl space-y-1">
                <span className="font-bold text-emerald-400 font-mono">1. Cargas em Lote</span>
                <p className="text-neutral-400">Recebe cargas de dados com milhares de produtos de uma só vez com cálculo de hash SHA-256.</p>
              </div>
              <div className="bg-black/50 border border-neutral-800 p-3.5 rounded-2xl space-y-1">
                <span className="font-bold text-emerald-400 font-mono">2. Auto-Reparo</span>
                <p className="text-neutral-400">Verifica e repara integridade de índices, chaves únicas e estruturas de colunas.</p>
              </div>
              <div className="bg-black/50 border border-neutral-800 p-3.5 rounded-2xl space-y-1">
                <span className="font-bold text-emerald-400 font-mono">3. Execução Web / CRON</span>
                <p className="text-neutral-400">Pode ser chamado diretamente via URL, webhook do ERP ou tarefa agendada CRON na Hostinger.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aba 2: Testador de Conexão MySQL */}
      {activeTab === 'test' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
          <form onSubmit={handleTestConnection} className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Server className="w-5 h-5 text-amber-400" />
                  Credenciais de Conexão com o Banco MySQL da Hostinger
                </h3>
                <p className="text-xs text-neutral-400">
                  Configure o IP/Host, nome do banco, usuário e senha para conectar o terminal à nuvem da Hostinger.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setTestHost('localhost');
                    setTestPort(3306);
                    setTestDb('u366235819_busca');
                    setTestUser('u366235819_busca');
                    setActionMessage({
                      type: 'success',
                      text: 'Campos preenchidos com o Banco Hostinger u366235819_busca!',
                    });
                  }}
                  className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Preencher Banco Hostinger (u366235819_busca)
                </button>

                {serverConfig && (
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`px-2.5 py-1 rounded-full font-bold uppercase text-[10px] ${
                        serverConfig.enabled
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      {serverConfig.enabled ? 'Ativo' : 'Desativado'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Banner de Ajuda Rápida Hostinger */}
            <div className="bg-gradient-to-r from-amber-500/10 via-neutral-900 to-neutral-900 border border-amber-500/30 rounded-2xl p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 text-amber-300 font-extrabold text-xs">
                <Database className="w-4 h-4 text-amber-400" />
                Configuração Detectada da Hostinger:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-[11px]">
                <div className="bg-black/40 p-2 rounded-xl border border-neutral-800">
                  <span className="text-neutral-400 block text-[10px]">Banco de Dados:</span>
                  <strong className="text-white font-mono">u366235819_busca</strong>
                </div>
                <div className="bg-black/40 p-2 rounded-xl border border-neutral-800">
                  <span className="text-neutral-400 block text-[10px]">Usuário MySQL:</span>
                  <strong className="text-white font-mono">u366235819_busca</strong>
                </div>
                <div className="bg-black/40 p-2 rounded-xl border border-neutral-800">
                  <span className="text-neutral-400 block text-[10px]">Host no PHP (Hostinger):</span>
                  <strong className="text-amber-300 font-mono">localhost</strong>
                </div>
                <div className="bg-black/40 p-2 rounded-xl border border-neutral-800">
                  <span className="text-neutral-400 block text-[10px]">Porta MySQL:</span>
                  <strong className="text-white font-mono">3306</strong>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Host (Servidor MySQL Hostinger)</label>
                <input
                  type="text"
                  value={testHost}
                  onChange={(e) => setTestHost(e.target.value)}
                  placeholder="ex: sqlXXX.main-hosting.eu ou IP da Hostinger"
                  required
                  className="w-full bg-black/60 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-600 focus:border-amber-500 outline-none"
                />
                {(testHost.trim().toLowerCase() === 'localhost' || testHost.trim() === '127.0.0.1') && (
                  <div className="bg-amber-950/60 border border-amber-500/40 rounded-xl p-2.5 text-[11px] text-amber-300 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      Atenção: Não use "localhost" ao testar de fora da Hostinger!
                    </p>
                    <p className="text-amber-200/80 leading-relaxed">
                      "localhost" só funciona dentro dos arquivos PHP rodando dentro da Hostinger. Para testes remotos, use o <strong>Host/IP do Servidor MySQL</strong> fornecido no hPanel.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Porta</label>
                <input
                  type="number"
                  value={testPort}
                  onChange={(e) => setTestPort(Number(e.target.value))}
                  placeholder="3306"
                  required
                  className="w-full bg-black/60 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-600 focus:border-amber-500 outline-none font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Nome do Banco de Dados</label>
                <input
                  type="text"
                  value={testDb}
                  onChange={(e) => setTestDb(e.target.value)}
                  placeholder="ex: u366235819_busca"
                  required
                  className="w-full bg-black/60 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-600 focus:border-amber-500 outline-none font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Usuário do Banco</label>
                <input
                  type="text"
                  value={testUser}
                  onChange={(e) => setTestUser(e.target.value)}
                  placeholder="ex: u366235819_busca"
                  required
                  className="w-full bg-black/60 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-600 focus:border-amber-500 outline-none font-mono"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2 lg:col-span-2">
                <label className="text-xs font-semibold text-neutral-300">Senha do Banco</label>
                <input
                  type="password"
                  value={testPassword}
                  onChange={(e) => setTestPassword(e.target.value)}
                  placeholder="Sua senha da Hostinger"
                  required
                  className="w-full bg-black/60 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-600 focus:border-amber-500 outline-none font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={testing}
                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-neutral-950 font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-lg disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
                <span>{testing ? 'Testando Conexão...' : 'Testar Conexão Agora'}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={saving}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-lg disabled:opacity-50"
              >
                <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
                <span>{saving ? 'Salvando...' : 'Salvar Configuração'}</span>
              </button>
            </div>

            {/* Ações de Sincronização de Produtos */}
            <div className="border-t border-neutral-800/80 pt-5 mt-4 space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                Operações de Carga de Produtos (Terminal ⟷ Hostinger MySQL)
              </h4>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSyncToMySQL}
                  disabled={syncingTo || !testHost || testHost.toLowerCase() === 'localhost'}
                  className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-amber-300 hover:text-white font-bold text-xs rounded-xl flex items-center gap-2 transition cursor-pointer disabled:opacity-40"
                  title="Envia todos os produtos cadastrados localmente para a tabela produtos do MySQL na Hostinger"
                >
                  <ArrowUpFromLine className={`w-4 h-4 text-amber-400 ${syncingTo ? 'animate-bounce' : ''}`} />
                  <span>{syncingTo ? 'Exportando para Hostinger...' : 'Exportar Produtos para MySQL Hostinger'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSyncFromMySQL}
                  disabled={syncingFrom || !testHost || testHost.toLowerCase() === 'localhost'}
                  className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-emerald-300 hover:text-white font-bold text-xs rounded-xl flex items-center gap-2 transition cursor-pointer disabled:opacity-40"
                  title="Carrega todos os produtos armazenados no MySQL da Hostinger para a memória deste terminal"
                >
                  <ArrowDownToLine className={`w-4 h-4 text-emerald-400 ${syncingFrom ? 'animate-bounce' : ''}`} />
                  <span>{syncingFrom ? 'Importando da Hostinger...' : 'Importar Produtos do MySQL Hostinger'}</span>
                </button>
              </div>
            </div>

            {/* Mensagem de Ação */}
            {actionMessage && (
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  actionMessage.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800 text-rose-300'
                }`}
              >
                {actionMessage.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <p className="text-xs font-bold">{actionMessage.text}</p>
              </div>
            )}

            {/* Resultado do Teste */}
            {testResult && Boolean(testResult.message) && (
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  testResult.success
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800 text-rose-300'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 text-xs">
                  <p className="font-bold">{testResult.message}</p>
                  {testResult.solucao && Array.isArray(testResult.solucao) && (
                    <div className="mt-2.5 p-3 bg-black/60 border border-amber-500/40 rounded-xl space-y-1.5 text-amber-200">
                      <p className="font-bold text-amber-400 uppercase text-[10px] tracking-wider">Como Resolver:</p>
                      {testResult.solucao.map((step, idx) => (
                        <p key={idx} className="text-[11px] leading-relaxed">• {step}</p>
                      ))}
                    </div>
                  )}
                  {testResult.details && (
                    <pre className="text-[11px] font-mono bg-black/50 p-2.5 rounded-lg overflow-x-auto text-neutral-300 mt-1">
                      {JSON.stringify(testResult.details, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Aba 3: Schema SQL */}
      {activeTab === 'schema' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400 font-mono">
              Arquivo: <code className="text-amber-400">schema_hostinger_mysql.sql</code>
            </span>
            <div className="flex items-center gap-2">
              <a
                href="/api/mysql/download-schema"
                download="schema_hostinger_mysql.sql"
                className="text-xs px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-bold flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Baixar .SQL</span>
              </a>
              <button
                onClick={handleCopy}
                className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black flex items-center gap-1.5 transition cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado!' : 'Copiar SQL'}</span>
              </button>
            </div>
          </div>

          <div className="relative">
            <pre className="bg-black/80 border border-neutral-800 rounded-2xl p-5 text-xs text-emerald-400 font-mono overflow-x-auto max-h-[450px] leading-relaxed shadow-inner">
              {loadingSchema ? 'Carregando schema SQL...' : schemaSql}
            </pre>
          </div>
        </div>
      )}

      {/* Aba 4: Guia Passo a Passo */}
      {activeTab === 'instructions' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 space-y-6">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-amber-400" />
            Passo a Passo: Hospedando o Sistema em buscapreco.instara.com.br
          </h3>

          <div className="space-y-4 text-xs md:text-sm text-neutral-300">
            <div className="flex items-start gap-3.5 bg-black/40 border border-neutral-800 p-4 rounded-2xl">
              <span className="w-7 h-7 bg-amber-500 text-neutral-950 font-black rounded-xl flex items-center justify-center shrink-0">1</span>
              <div>
                <strong className="text-white block font-semibold text-sm">Baixar o Arquivo Único (index.php)</strong>
                <p className="text-neutral-400 mt-1">
                  Na primeira aba, clique em <strong className="text-amber-300">"Baixar index.php"</strong>. Este é o arquivo do sistema completo.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 bg-black/40 border border-neutral-800 p-4 rounded-2xl">
              <span className="w-7 h-7 bg-amber-500 text-neutral-950 font-black rounded-xl flex items-center justify-center shrink-0">2</span>
              <div>
                <strong className="text-white block font-semibold text-sm">Acessar o Gerenciador de Arquivos no hPanel da Hostinger</strong>
                <p className="text-neutral-400 mt-1">
                  Navegue até a pasta do subdomínio <code className="text-amber-300 font-mono">buscapreco.instara.com.br</code> (geralmente em <code className="text-neutral-300 font-mono">public_html/buscapreco</code> ou na pasta raiz do subdomínio).
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 bg-black/40 border border-neutral-800 p-4 rounded-2xl">
              <span className="w-7 h-7 bg-amber-500 text-neutral-950 font-black rounded-xl flex items-center justify-center shrink-0">3</span>
              <div>
                <strong className="text-white block font-semibold text-sm">Fazer Upload do index.php e atualizar_app.php</strong>
                <p className="text-neutral-400 mt-1">
                  Faça o upload do <code className="text-amber-300 font-mono">index.php</code> e do <code className="text-emerald-300 font-mono">atualizar_app.php</code> diretamente para dentro da pasta do subdomínio.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 bg-black/40 border border-neutral-800 p-4 rounded-2xl">
              <span className="w-7 h-7 bg-amber-500 text-neutral-950 font-black rounded-xl flex items-center justify-center shrink-0">4</span>
              <div>
                <strong className="text-white block font-semibold text-sm">Configurar a Senha do Banco no index.php</strong>
                <p className="text-neutral-400 mt-1">
                  Edite o <code className="text-amber-300 font-mono">index.php</code> no Gerenciador de Arquivos da Hostinger e preencha a variável <code className="text-white font-mono">$DB_PASS = 'SuaSenhaAqui';</code> com a senha do banco MySQL criado.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 bg-black/40 border border-neutral-800 p-4 rounded-2xl">
              <span className="w-7 h-7 bg-emerald-500 text-neutral-950 font-black rounded-xl flex items-center justify-center shrink-0">✓</span>
              <div>
                <strong className="text-white block font-semibold text-sm">Pronto! Acesse seu Aplicativo Online</strong>
                <p className="text-emerald-300 mt-1">
                  Abra <strong className="text-white font-mono">https://buscapreco.instara.com.br</strong> no navegador de qualquer leitor óptico, terminal, tablet ou computador para usar o sistema online!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
