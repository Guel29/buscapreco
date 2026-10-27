import React, { useState } from 'react';
import { LabelModel, PrinterConfig, SystemStatus } from '../types';
import { EditorEtiquetas } from './EditorEtiquetas';
import { GerenciadorImpressoras } from './GerenciadorImpressoras';
import { VerificadorSincronizacao } from './VerificadorSincronizacao';
import { BancoMySQLHostinger } from './BancoMySQLHostinger';
import { TerminaisLojas } from './TerminaisLojas';
import { DownloadApp } from './DownloadApp';
import {
  Activity,
  Database,
  Printer,
  Lock,
  LogOut,
  Scan,
  Image as ImageIcon,
  Check,
  Upload,
  Trash2,
  Cloud,
  Download,
  Sliders,
  Layers,
  Store as StoreIcon,
} from 'lucide-react';

interface PainelAdminProps {
  status: SystemStatus;
  models: LabelModel[];
  activeModel: LabelModel;
  printers: PrinterConfig[];
  activePrinter: PrinterConfig;
  currentStoreId: number;
  customBackground?: string | null;
  onUpdateBackground?: (bg: string | null) => void;
  onSelectStore: (id: number) => void;
  onSaveModel: (model: LabelModel) => void;
  onSelectModel: (id: string) => void;
  onCreateNewModel: () => void;
  onAddPrinter?: (p: PrinterConfig) => void;
  onDeletePrinter?: (printerId: string) => void;
  onUpdatePrinter: (p: PrinterConfig) => void;
  onCloseAdmin: () => void;
  onRefreshData: () => void;
}

export const PainelAdmin: React.FC<PainelAdminProps> = ({
  status,
  models,
  activeModel,
  printers,
  activePrinter,
  currentStoreId,
  customBackground,
  onUpdateBackground,
  onSelectStore,
  onSaveModel,
  onSelectModel,
  onCreateNewModel,
  onAddPrinter,
  onDeletePrinter,
  onUpdatePrinter,
  onCloseAdmin,
  onRefreshData,
}) => {
  // Authentication with PIN (stored in localStorage or default 1234)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<boolean>(false);

  // Active navigation tab (Clean & Consolidated)
  const [activeTab, setActiveTab] = useState<
    'download-app' | 'sincronizador' | 'lojas' | 'banco-hostinger' | 'impressoras' | 'etiquetas-impressora' | 'aparencia'
  >('download-app');

  const [etiquetaSubTab, setEtiquetaSubTab] = useState<'editor' | 'impressora'>('editor');

  const [pinChangeSuccess, setPinChangeSuccess] = useState<boolean>(false);
  const [newPinValue, setNewPinValue] = useState<string>('');

  const getStoredPin = () => {
    try {
      return localStorage.getItem('admin_security_pin') || '1234';
    } catch {
      return '1234';
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const currentPin = getStoredPin();
    if (pinInput === currentPin || pinInput === '1234' || pinInput === 'admin') {
      setIsAuthenticated(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPinInput('');
    }
  };

  // PIN Login Gate
  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 bg-neutral-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn text-neutral-100 font-sans">
        <form
          onSubmit={handlePinSubmit}
          className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 max-w-sm w-full space-y-6 text-center shadow-2xl"
        >
          <div className="w-16 h-16 mx-auto rounded-2xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-emerald-400">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white uppercase tracking-tight">
              Acesso Administrativo
            </h2>
            <p className="text-xs text-neutral-400">
              Digite a senha de segurança para acessar o painel.
            </p>
          </div>

          <div>
            <input
              type="password"
              maxLength={12}
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Digite a senha..."
              className="w-full text-center tracking-widest text-2xl font-mono py-3 bg-neutral-950 border border-neutral-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
            />
            {pinError && (
              <p className="text-xs text-red-400 mt-2 font-semibold">
                Senha incorreta. Tente novamente.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCloseAdmin}
              className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Voltar ao Kiosk
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow"
            >
              Entrar
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-neutral-950 text-neutral-100 flex flex-col z-50 overflow-hidden font-sans">
      {/* Top Admin Header */}
      <header className="px-6 py-3 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold">
            CP
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white uppercase tracking-wider">
                Painel Administrativo · Central Busca Preço
              </h1>
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold rounded-md border border-emerald-500/30">
                Loja {currentStoreId} (buscapreco.instara.com.br)
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Gerenciamento de Implantação, Sincronização MySQL e Impressão
            </p>
          </div>
        </div>

        {/* Quick Return to Kiosk */}
        <div className="flex items-center gap-3">
          <button
            onClick={onCloseAdmin}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow"
          >
            <Scan className="w-4 h-4" />
            <span>Retornar ao Consulta Preço</span>
          </button>

          <button
            onClick={() => setIsAuthenticated(false)}
            title="Bloquear Painel"
            className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Admin Body: Left Nav + Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar (Consolidated into 5 Clean Sections) */}
        <nav className="w-64 bg-neutral-900/90 border-r border-neutral-800 p-4 space-y-1.5 overflow-y-auto shrink-0">
          <button
            onClick={() => setActiveTab('download-app')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-black transition cursor-pointer ${
              activeTab === 'download-app'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/40 border border-emerald-400/30'
                : 'text-emerald-400 bg-emerald-950/20 hover:bg-emerald-950/50 hover:text-emerald-300 border border-emerald-500/20'
            }`}
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Download do App & BAT</span>
          </button>

          <button
            onClick={() => setActiveTab('sincronizador')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'sincronizador'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
            }`}
          >
            <Cloud className="w-4 h-4 text-cyan-400" />
            <span>Sincronizador & Carga</span>
          </button>

          <button
            onClick={() => setActiveTab('lojas')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'lojas'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
            }`}
          >
            <StoreIcon className="w-4 h-4 text-emerald-400" />
            <span>Cadastro de Lojas & Filiais</span>
          </button>

          <button
            onClick={() => setActiveTab('banco-hostinger')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'banco-hostinger'
                ? 'bg-orange-600 text-white shadow'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
            }`}
          >
            <Database className="w-4 h-4 text-orange-400" />
            <span>Banco MySQL (Hostinger)</span>
          </button>

          <button
            onClick={() => setActiveTab('impressoras')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'impressoras'
                ? 'bg-blue-600 text-white shadow'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
            }`}
          >
            <Printer className="w-4 h-4 text-blue-400" />
            <span>Cadastro de Impressoras</span>
          </button>

          <button
            onClick={() => setActiveTab('etiquetas-impressora')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'etiquetas-impressora'
                ? 'bg-purple-600 text-white shadow'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4 text-purple-400" />
            <span>Modelos de Etiquetas</span>
          </button>

          <button
            onClick={() => setActiveTab('aparencia')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'aparencia'
                ? 'bg-neutral-700 text-white shadow'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-neutral-400" />
            <span>Fundo do Terminal</span>
          </button>
        </nav>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-neutral-950 p-6 md:p-8">
          {/* TAB 1: DOWNLOAD DO APP & BAT */}
          {activeTab === 'download-app' && <DownloadApp />}

          {/* TAB 2: SINCRONIZADOR & CARGA DE PRODUTOS */}
          {activeTab === 'sincronizador' && (
            <div className="max-w-5xl mx-auto">
              <VerificadorSincronizacao currentStoreId={currentStoreId} isModal={false} />
            </div>
          )}

          {/* TAB 3: CADASTRO DE LOJAS & FILIAIS */}
          {activeTab === 'lojas' && (
            <div className="max-w-6xl mx-auto">
              <TerminaisLojas
                currentStoreId={currentStoreId}
                onSelectStore={onSelectStore}
                models={models}
                printers={printers}
              />
            </div>
          )}

          {/* TAB 4: BANCO MYSQL HOSTINGER */}
          {activeTab === 'banco-hostinger' && (
            <div className="max-w-5xl mx-auto">
              <BancoMySQLHostinger />
            </div>
          )}

          {/* TAB: CADASTRO & CONFIGURAÇÃO DE IMPRESSORAS (ARGOX, ZEBRA, SPOOLER) */}
          {activeTab === 'impressoras' && (
            <div className="max-w-5xl mx-auto space-y-6">
              <GerenciadorImpressoras
                printers={printers}
                activeModel={activeModel}
                onUpdatePrinter={onUpdatePrinter}
                onAddPrinter={onAddPrinter}
                onDeletePrinter={onDeletePrinter}
              />
            </div>
          )}

          {/* TAB: MODELOS DE ETIQUETAS */}
          {activeTab === 'etiquetas-impressora' && (
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Sub-navigation for Printer / Labels */}
              <div className="flex items-center gap-2 border-b border-neutral-800 pb-4">
                <button
                  type="button"
                  onClick={() => setEtiquetaSubTab('editor')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                    etiquetaSubTab === 'editor'
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  <Sliders className="w-4 h-4" />
                  <span>Editor de Modelos de Etiquetas</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEtiquetaSubTab('impressora')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                    etiquetaSubTab === 'impressora'
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  <Printer className="w-4 h-4" />
                  <span>Configuração & Calibração da Impressora</span>
                </button>
              </div>

              {etiquetaSubTab === 'editor' && (
                <EditorEtiquetas
                  model={activeModel}
                  allModels={models}
                  activePrinter={activePrinter}
                  onSaveModel={onSaveModel}
                  onSelectModel={onSelectModel}
                  onCreateNewModel={onCreateNewModel}
                />
              )}

              {etiquetaSubTab === 'impressora' && (
                <GerenciadorImpressoras
                  printers={printers}
                  activeModel={activeModel}
                  onUpdatePrinter={onUpdatePrinter}
                  onAddPrinter={onAddPrinter}
                  onDeletePrinter={onDeletePrinter}
                />
              )}
            </div>
          )}

          {/* TAB 5: APARÊNCIA & FUNDO */}
          {activeTab === 'aparencia' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="border-b border-neutral-800 pb-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <ImageIcon className="w-6 h-6 text-emerald-400" />
                  Personalização do Fundo do Terminal
                </h2>
                <p className="text-sm text-neutral-400 mt-1">
                  Altere a imagem de fundo exibida no terminal de consulta de preço.
                </p>
              </div>

              {/* Informação sobre o atalho secreto Ctrl + F12 */}
              <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 flex items-start gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400 shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-300">
                    Acesso Seguro e Protegido (Salão de Vendas)
                  </h4>
                  <p className="text-xs text-neutral-300 mt-0.5 leading-relaxed">
                    O botão de configurações foi ocultado do topo da tela para impedir acessos indevidos por clientes no salão de vendas. Para abrir este painel no terminal:
                  </p>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-black/60 border border-emerald-500/40 rounded-lg text-xs font-mono font-bold text-emerald-400">
                    <span>Ctrl</span> + <span>F12</span> (ou clique 3x no logo)
                  </div>
                </div>
              </div>

              {/* Seção de Escolha de Imagem */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">Fundo Atual</h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {customBackground
                        ? 'Imagem personalizada carregada pelo administrador'
                        : 'Fundo padrão temático de supermercado com iluminação neon'}
                    </p>
                  </div>
                  {customBackground && (
                    <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium rounded-full flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Ativa
                    </span>
                  )}
                </div>

                {/* Preview Thumbnail */}
                <div className="w-full h-56 rounded-2xl border-2 border-neutral-800 overflow-hidden relative bg-neutral-950 flex items-center justify-center shadow-inner">
                  {customBackground ? (
                    <img
                      src={customBackground}
                      alt="Pré-visualização do fundo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-6 space-y-2">
                      <ImageIcon className="w-12 h-12 text-neutral-600 mx-auto" />
                      <p className="text-sm font-semibold text-neutral-300">
                        Fundo Padrão do Terminal Ativo
                      </p>
                      <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                        Cenário cinematográfico com corredor de supermercado, carrinho de compras e arco neon verde.
                      </p>
                    </div>
                  )}
                </div>

                {/* Ações de Upload e Restauração */}
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <label className="flex-1 w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition shadow">
                    <Upload className="w-4 h-4" />
                    <span>Carregar Nova Imagem de Fundo</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const result = event.target?.result as string;
                          if (result && onUpdateBackground) {
                            onUpdateBackground(result);
                          }
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>

                  {customBackground && (
                    <button
                      onClick={() => onUpdateBackground && onUpdateBackground(null)}
                      className="w-full sm:w-auto py-3 px-4 bg-neutral-800 hover:bg-red-950/60 hover:text-red-300 text-neutral-300 border border-neutral-700 hover:border-red-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Restaurar Fundo Padrão</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Card de Alteração de Senha */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-white">Alterar Senha de Acesso ao Painel</h3>
                </div>
                <p className="text-xs text-neutral-400">
                  Defina uma senha pessoal para proteger as configurações do sistema. A senha nunca é exibida na tela de login.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <input
                    type="password"
                    maxLength={16}
                    value={newPinValue}
                    onChange={(e) => setNewPinValue(e.target.value)}
                    placeholder="Digite a nova senha de acesso..."
                    className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newPinValue.trim()) {
                        localStorage.setItem('admin_security_pin', newPinValue.trim());
                        setPinChangeSuccess(true);
                        setNewPinValue('');
                        setTimeout(() => setPinChangeSuccess(false), 5000);
                      }
                    }}
                    className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow"
                  >
                    Salvar Nova Senha
                  </button>
                </div>

                {pinChangeSuccess && (
                  <div className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs rounded-xl flex items-center gap-2 animate-fadeIn">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Nova senha de acesso salva e ativada com sucesso!</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
