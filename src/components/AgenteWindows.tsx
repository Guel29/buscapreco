import React, { useState, useEffect } from 'react';
import { formatDateTimeBR } from '../utils/date';
import { Download, Terminal, CheckCircle2, ShieldCheck, Cpu, HardDrive, Database, Server, RefreshCw, Copy, Check, Play, AlertCircle, Cloud, Clock } from 'lucide-react';

interface AgentStatusData {
  online: boolean;
  ultima_comunicacao: string;
  host_local: string;
  banco: string;
  loja: number;
  versao: string;
  ultimo_status: string;
  produtos_sincronizados: number;
  erros_recentes: string;
  logs?: Array<{ data_hora: string; tipo: string; mensagem: string }>;
}

export const AgenteWindows: React.FC = () => {
  const [downloaded, setDownloaded] = useState<boolean>(false);
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatusData | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(false);

  const fetchAgentStatus = async () => {
    try {
      setLoadingStatus(true);
      const res = await fetch('/api/integrador/status');
      if (res.ok) {
        const data = await res.json();
        setAgentStatus(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchAgentStatus();
    const interval = setInterval(fetchAgentStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  async function downloadFromUrl(url: string, filename: string) {
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
      }
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setDownloaded(true);
  }

  const downloadSyncBatFile = () => {
    downloadFromUrl('/api/integrador/download-bat', 'iniciar-integrador.bat');
  };

  const downloadServerContinuousApp = () => {
    downloadFromUrl('/api/integrador/download-server-app', 'App-Sincronizador-Servidor.bat');
  };

  const downloadStandalonePs1 = () => {
    downloadFromUrl('/api/integrador/download-standalone-ps1', 'sincronizador-autonomo.ps1');
  };

  const copyPowerShellCommand = () => {
    const origin = window.location.origin;
    const cmd = `irm ${origin}/api/integrador/download-ps1 | iex`;
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 3000);
  };

  const downloadPrintBatFile = () => {
    const batContent = `@echo off
title SERVICO LOCAL DE IMPRESSAO ARGOX OS-214 - SUPERMERCADO
echo ===================================================
echo INICIANDO AGENTE LOCAL ARGOX OS-214 (PORTA 9100)
echo ===================================================

REM Verifica se o Node.js esta instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no sistema.
    echo Baixe e instale o Node.js LTS em https://nodejs.org
    pause
    exit /b
)

echo Executando servico de impressao direta...
node argox-print-agent.js
pause
`;
    const blob = new Blob([batContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'iniciar-servico-argox.bat';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPowerShellService = () => {
    const psContent = `# SERVIÇO WINDOWS: ARGOX OS-214 PRINT SPOOLER
# Execute como Administrador no PowerShell do Windows para registrar como serviço

$serviceName = "ArgoxPrintAgent"
$nodePath = (Get-Command node).Source
$scriptPath = "$PSScriptRoot\\argox-print-agent.js"

Write-Host "Criando servico $serviceName..." -ForegroundColor Green
New-Service -Name $serviceName -BinaryPathName "$nodePath $scriptPath" -DisplayName "Supermercado Argox OS-214 Print Agent" -StartupType Automatic
Start-Service -Name $serviceName
Write-Host "Servico iniciado com sucesso! Rodando em segundo plano." -ForegroundColor Green
`;
    const blob = new Blob([psContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'instalar-servico-windows.ps1';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8 text-neutral-100 font-sans">
      <div className="border-b border-neutral-800 pb-5">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Terminal className="w-6 h-6 text-emerald-400" />
          Serviços Locais & Downloads (Sincronizador + Impressora Argox)
        </h2>
        <p className="text-sm text-neutral-400">
          Baixe os scripts para execução autônoma no servidor local ou nos computadores com Windows.
        </p>
      </div>

      {/* Real-Time Agent Telemetry Card */}
      <div className={`p-5 rounded-3xl border transition-all ${
        agentStatus?.online
          ? 'bg-gradient-to-r from-emerald-950/80 via-neutral-900 to-neutral-900 border-emerald-500/50 shadow-xl'
          : 'bg-neutral-900/90 border-neutral-800'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`p-3 rounded-2xl ${
              agentStatus?.online
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
            }`}>
              <Server className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${agentStatus?.online ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  {agentStatus?.online ? 'Agente Servidor Windows: CONECTADO & ATIVO' : 'Agente Servidor Windows: AGUARDANDO EXECUÇÃO'}
                </h3>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                {agentStatus?.ultimo_status || 'Execute o sincronizador no computador do supermercado para iniciar a transmissão.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {agentStatus?.online && (
              <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold rounded-xl">
                {agentStatus.produtos_sincronizados} produtos na nuvem
              </span>
            )}
            <button
              onClick={fetchAgentStatus}
              className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition cursor-pointer"
              title="Atualizar status agora"
            >
              <RefreshCw className={`w-4 h-4 ${loadingStatus ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {agentStatus?.ultima_comunicacao && (
          <div className="mt-3 pt-3 border-t border-neutral-800/80 flex flex-wrap items-center justify-between text-[11px] text-neutral-400 font-mono gap-2">
            <span className="flex items-center gap-1.5 text-emerald-300 font-bold">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              Última Sincronização Recebida na Nuvem: {formatDateTimeBR(agentStatus.ultima_comunicacao)}
            </span>
            <span>Banco: {agentStatus.banco || 'vr'} ({agentStatus.host_local || '127.0.0.1'})</span>
            <span>Loja Alvo: {agentStatus.loja || 1}</span>
          </div>
        )}
      </div>

      {/* Reassurance Banner: Zero Additional Apps Needed */}
      <div className="bg-gradient-to-r from-emerald-950/80 via-neutral-900 to-neutral-900 border border-emerald-500/50 rounded-3xl p-5 space-y-3 shadow-xl">
        <div className="flex items-start gap-3.5">
          <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Preciso de outro aplicativo instalado para o .BAT funcionar?
              <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-full border border-emerald-500/30">
                NÃO PRECISA DE OUTRO APP
              </span>
            </h3>
            <p className="text-xs text-neutral-300 leading-relaxed">
              <strong>Não é necessário instalar nenhum outro aplicativo (nem Node.js, nem Python).</strong> O Windows já vem de fábrica com o PowerShell necessário. O arquivo <code className="text-emerald-400 font-mono">.BAT</code> já é 100% completo e autônomo.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row gap-2 text-xs text-neutral-400">
              <span className="text-amber-300 font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" /> Onde executar o .BAT:
              </span>
              <span>
                Execute o arquivo no <strong>computador SERVIDOR</strong> do supermercado (onde o VR Software / PostgreSQL está instalado).
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO 1: SINCRONIZADOR DE BANCO DE DADOS ERP */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-2xl text-purple-400">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Sincronizador de Banco de Dados (VR Software / PostgreSQL ERP)
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] font-bold rounded-full">
                Serviço em Segundo Plano
              </span>
            </h3>
            <p className="text-xs text-neutral-400">
              Executa no computador do supermercado, lê os preços em Somente Leitura e atualiza o sistema na nuvem automaticamente.
            </p>
          </div>
        </div>

        {/* VR Database Config Summary */}
        <div className="p-3.5 bg-neutral-950 rounded-2xl border border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg">
              <Database className="w-4 h-4" />
            </span>
            <span className="font-bold text-neutral-200">Parâmetros do VR Software Configurados:</span>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-mono">
            <span className="px-2 py-0.5 bg-neutral-800 text-cyan-300 rounded border border-neutral-700">Host: localhost</span>
            <span className="px-2 py-0.5 bg-neutral-800 text-emerald-300 rounded border border-neutral-700">Porta: 8745</span>
            <span className="px-2 py-0.5 bg-neutral-800 text-purple-300 rounded border border-neutral-700">Banco: vr</span>
            <span className="px-2 py-0.5 bg-neutral-800 text-amber-300 rounded border border-neutral-700">Usuário: postgres</span>
            <span className="px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded border border-neutral-700">Senha: VrPost@Server</span>
          </div>
        </div>

        {/* 1-Click PowerShell Command Box */}
        <div className="p-4 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5" />
              Opção 1: Executar Direto no Windows PowerShell (Sem Baixar Arquivos):
            </span>
            <button
              onClick={copyPowerShellCommand}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-mono font-bold cursor-pointer transition flex items-center gap-1.5 border border-neutral-700 shrink-0"
            >
              {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCmd ? 'Copiado!' : 'Copiar Comando'}</span>
            </button>
          </div>

          <div className="font-mono text-xs text-emerald-300 bg-neutral-900 p-3 rounded-xl overflow-x-auto border border-neutral-800 select-all">
            {`irm ${typeof window !== 'undefined' ? window.location.origin : ''}/api/integrador/download-ps1 | iex`}
          </div>

          <p className="text-[11px] text-neutral-400">
            Abra o <strong>PowerShell</strong> no servidor Windows, cole o comando acima e aperte <strong>Enter</strong>. Ele detecta automaticamente o PostgreSQL, lê os preços e envia para a nuvem!
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card App Servidor Contínuo */}
          <div className="p-5 bg-gradient-to-br from-emerald-950/60 to-neutral-950 rounded-2xl border-2 border-emerald-500/60 flex flex-col justify-between space-y-4 col-span-full shadow-2xl">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-emerald-300 flex items-center gap-2">
                  <Server className="w-5 h-5 text-emerald-400" />
                  Opção 2: App Servidor de Sincronização Contínua (.bat)
                </span>
                <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[11px] font-bold rounded-full border border-emerald-500/30">
                  Loop Automático a cada 5 min · 100% Autônomo
                </span>
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Arquivo executável em lote (.bat) completo e independente. Basta dar <strong>duplo clique</strong> no servidor do supermercado. Ele detecta o PostgreSQL, lê a tabela de produtos e envia os preços periodicamente.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={downloadServerContinuousApp}
                className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-lg hover:shadow-emerald-500/20"
              >
                <Download className="w-4 h-4" />
                <span>Baixar App-Sincronizador (.bat)</span>
              </button>
              <button
                onClick={downloadStandalonePs1}
                className="py-3 bg-neutral-800 hover:bg-neutral-700 text-emerald-300 border border-neutral-700 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Terminal className="w-4 h-4" />
                <span>Baixar Script Puro (.ps1)</span>
              </button>
            </div>
          </div>

          {/* Card Native Windows (ZERO DEPENDENCIES) */}
          <div className="p-4 bg-neutral-950 rounded-2xl border border-neutral-800 flex flex-col justify-between space-y-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Sincronizador Único em 1 Clique (.bat)
              </span>
              <p className="text-[11px] text-neutral-400">
                Executa um ciclo único de teste e sincronização imediata no Windows.
              </p>
            </div>
            <a
              href="/api/integrador/download-native-windows"
              download="sincronizador-local-windows.bat"
              className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer border border-neutral-700"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Sincronizador Único (.bat)</span>
            </a>
          </div>

          {/* Card Consulta Direta ao Banco */}
          <div className="p-4 bg-neutral-950 rounded-2xl border border-neutral-800 flex flex-col justify-between space-y-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Database className="w-4 h-4 text-emerald-400" /> Consulta Direta ao PostgreSQL (Sem Arquivos TXT)
              </span>
              <p className="text-[11px] text-neutral-400">
                O arquivo .BAT consulta diretamente a base do VR Software na memória do servidor e transmite os lotes para o MySQL na Hostinger.
              </p>
            </div>
            <div className="text-[11px] text-emerald-300 bg-neutral-900 p-2.5 rounded-xl border border-emerald-500/20 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span><strong>100% Automático:</strong> Não precisa gerar nem exportar arquivos TXT manualmente.</span>
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO 2: AGENTE DE IMPRESSÃO DIRETA ARGOX OS-214 */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              2. Agente de Impressão Direta Argox OS-214 (RAW Spooler)
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-full">
                Porta 9100 / Sem Diálogo
              </span>
            </h3>
            <p className="text-xs text-neutral-400">
              Recebe os comandos térmicos PPLB/PPLA e despacha direto para o spooler USB/Serial sem abrir janelas.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card JS Agent */}
          <div className="p-4 bg-neutral-950 rounded-2xl border border-neutral-800 flex flex-col justify-between space-y-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-white">1. Script do Agente</span>
              <p className="text-[11px] text-neutral-400">
                Servidor HTTP local na porta 9100 integrado ao Spooler RAW.
              </p>
            </div>
            <a
              href="/api/agent/download-script"
              download="argox-print-agent.js"
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow"
            >
              <Download className="w-4 h-4" />
              <span>Baixar argox-print-agent.js</span>
            </a>
          </div>

          {/* Card BAT Launcher */}
          <div className="p-4 bg-neutral-950 rounded-2xl border border-neutral-800 flex flex-col justify-between space-y-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-white">2. Executável .BAT</span>
              <p className="text-[11px] text-neutral-400">
                Inicia o serviço da impressora local com um clique duplo.
              </p>
            </div>
            <button
              onClick={downloadPrintBatFile}
              className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl border border-neutral-700 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Baixar iniciar-servico-argox.bat</span>
            </button>
          </div>

          {/* Card PowerShell Service */}
          <div className="p-4 bg-neutral-950 rounded-2xl border border-neutral-800 flex flex-col justify-between space-y-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-white">3. Serviço Windows</span>
              <p className="text-[11px] text-neutral-400">
                Instala como serviço nativo do Windows para iniciar com o PC.
              </p>
            </div>
            <button
              onClick={downloadPowerShellService}
              className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl border border-neutral-700 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Baixar servico-windows.ps1</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
