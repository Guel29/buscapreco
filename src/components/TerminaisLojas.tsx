import React, { useState, useEffect } from 'react';
import { Store, Terminal, LabelModel, PrinterConfig } from '../types';
import {
  fetchStores,
  saveStore,
  deleteStore,
  fetchTerminals,
  deleteTerminal,
  cleanFakeTerminals,
} from '../services/api';
import {
  Store as StoreIcon,
  Monitor,
  Plus,
  CheckCircle2,
  Shield,
  Edit3,
  Trash2,
  Save,
  X,
  Building2,
  MapPin,
  FileText,
  Check,
  AlertCircle,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

interface TerminaisLojasProps {
  currentStoreId: number;
  onSelectStore: (storeId: number) => void;
  models: LabelModel[];
  printers: PrinterConfig[];
}

export const TerminaisLojas: React.FC<TerminaisLojasProps> = ({
  currentStoreId,
  onSelectStore,
  models,
  printers,
}) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Store modal state (Create / Edit)
  const [showStoreModal, setShowStoreModal] = useState<boolean>(false);
  const [editingStoreId, setEditingStoreId] = useState<number | null>(null);
  const [storeForm, setStoreForm] = useState<{
    id: number;
    nome: string;
    cnpj: string;
    endereco: string;
    ativa: boolean;
  }>({
    id: 1,
    nome: '',
    cnpj: '',
    endereco: '',
    ativa: true,
  });
  const [storeFeedback, setStoreFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [savingStore, setSavingStore] = useState<boolean>(false);

  // Deletion modals state (without window.confirm!)
  const [storeToDelete, setStoreToDelete] = useState<Store | null>(null);
  const [terminalToDelete, setTerminalToDelete] = useState<Terminal | null>(null);
  const [deletingAction, setDeletingAction] = useState<boolean>(false);
  const [cleaningFakes, setCleaningFakes] = useState<boolean>(false);
  const [generalFeedback, setGeneralFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // New terminal modal
  const [showNewTerm, setShowNewTerm] = useState<boolean>(false);
  const [termName, setTermName] = useState<string>('');
  const [termStoreId, setTermStoreId] = useState<number>(currentStoreId);
  const [termModelId, setTermModelId] = useState<string>(models[0]?.id || '');
  const [termPrinterId, setTermPrinterId] = useState<string>(printers[0]?.id || '');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [sData, tData] = await Promise.all([
        fetchStores(),
        fetchTerminals(),
      ]);
      setStores(sData);
      setTerminals(tData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNewStore = () => {
    const nextId = stores.length > 0 ? Math.max(...stores.map((s) => s.id)) + 1 : 1;
    setEditingStoreId(null);
    setStoreForm({
      id: nextId,
      nome: '',
      cnpj: '',
      endereco: '',
      ativa: true,
    });
    setStoreFeedback(null);
    setShowStoreModal(true);
  };

  const handleOpenEditStore = (store: Store, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingStoreId(store.id);
    setStoreForm({
      id: store.id,
      nome: store.nome,
      cnpj: store.cnpj || '',
      endereco: store.endereco || '',
      ativa: store.ativa !== undefined ? store.ativa : true,
    });
    setStoreFeedback(null);
    setShowStoreModal(true);
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeForm.nome.trim()) {
      setStoreFeedback({ success: false, message: 'O nome da loja é obrigatório.' });
      return;
    }

    setSavingStore(true);
    setStoreFeedback(null);

    try {
      const isEdit = editingStoreId !== null;
      const res = await saveStore(storeForm);

      if (res && res.success) {
        setStoreFeedback({
          success: true,
          message: isEdit ? 'Loja atualizada com sucesso!' : 'Nova loja cadastrada com sucesso!',
        });
        await fetchData();
        if (storeForm.id === currentStoreId || !editingStoreId) {
          onSelectStore(storeForm.id);
        }
        setTimeout(() => {
          setShowStoreModal(false);
        }, 1000);
      } else {
        setStoreFeedback({ success: false, message: res?.error || res?.message || 'Erro ao salvar loja.' });
      }
    } catch (err: any) {
      setStoreFeedback({ success: false, message: `Falha: ${err.message}` });
    } finally {
      setSavingStore(false);
    }
  };

  const handleDeleteStoreClick = (store: Store, e: React.MouseEvent) => {
    e.stopPropagation();
    if (stores.length <= 1) {
      setGeneralFeedback({
        success: false,
        message: 'Não é possível excluir a única loja cadastrada no sistema. Cadastre outra loja antes.',
      });
      setTimeout(() => setGeneralFeedback(null), 5000);
      return;
    }
    setStoreToDelete(store);
  };

  const executeDeleteStore = async () => {
    if (!storeToDelete) return;
    setDeletingAction(true);
    try {
      const res = await deleteStore(storeToDelete.id);
      if (res && res.success) {
        setGeneralFeedback({
          success: true,
          message: `Loja "${storeToDelete.nome}" (ID ${storeToDelete.id}) excluída com sucesso!`,
        });
        const remaining = stores.filter((s) => s.id !== storeToDelete.id);
        setStores(remaining);
        if (currentStoreId === storeToDelete.id && remaining.length > 0) {
          onSelectStore(remaining[0].id);
        }
        setStoreToDelete(null);
        await fetchData();
      } else {
        setGeneralFeedback({
          success: false,
          message: res?.error || res?.message || 'Erro ao excluir loja do banco de dados.',
        });
      }
    } catch (err: any) {
      setGeneralFeedback({ success: false, message: `Erro ao excluir loja: ${err.message}` });
    } finally {
      setDeletingAction(false);
      setTimeout(() => setGeneralFeedback(null), 6000);
    }
  };

  const handleDeleteTerminalClick = (terminal: Terminal, e: React.MouseEvent) => {
    e.stopPropagation();
    setTerminalToDelete(terminal);
  };

  const executeDeleteTerminal = async () => {
    if (!terminalToDelete) return;
    setDeletingAction(true);
    try {
      const res = await deleteTerminal(terminalToDelete.id);
      if (res && res.success) {
        setGeneralFeedback({
          success: true,
          message: `Terminal "${terminalToDelete.nome}" removido com sucesso!`,
        });
        setTerminals((prev) => prev.filter((t) => t.id !== terminalToDelete.id));
        setTerminalToDelete(null);
        await fetchData();
      } else {
        setGeneralFeedback({
          success: false,
          message: res?.error || 'Erro ao excluir terminal.',
        });
      }
    } catch (err: any) {
      setGeneralFeedback({ success: false, message: `Erro ao excluir terminal: ${err.message}` });
    } finally {
      setDeletingAction(false);
      setTimeout(() => setGeneralFeedback(null), 6000);
    }
  };

  const handleCleanFakeTerminals = async () => {
    setCleaningFakes(true);
    try {
      const res = await cleanFakeTerminals(currentStoreId);
      if (res && res.success) {
        setGeneralFeedback({
          success: true,
          message: res.message || 'Terminais virtuais/simulados removidos com sucesso! Restando apenas o terminal real da loja.',
        });
        if (res.terminals && Array.isArray(res.terminals)) {
          setTerminals(res.terminals);
        } else {
          setTerminals((prev) => prev.filter((t) => t.id === 'term-01' || t.identificador === 'TERM-01'));
        }
        await fetchData();
      } else {
        setGeneralFeedback({
          success: false,
          message: res?.message || 'Falha ao limpar terminais não reais.',
        });
      }
    } catch (err: any) {
      setGeneralFeedback({ success: false, message: `Erro ao limpar terminais: ${err.message}` });
    } finally {
      setCleaningFakes(false);
      setTimeout(() => setGeneralFeedback(null), 6000);
    }
  };

  const handleCreateTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termName.trim()) return;

    try {
      const res = await fetch('/api/terminals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: termName,
          id_loja: termStoreId,
          modelo_etiqueta_padrao_id: termModelId,
          impressora_id: termPrinterId,
        }),
      });

      if (res.ok) {
        setShowNewTerm(false);
        setTermName('');
        setGeneralFeedback({ success: true, message: 'Novo terminal cadastrado com sucesso!' });
        await fetchData();
        setTimeout(() => setGeneralFeedback(null), 5000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8 text-neutral-100 font-sans">
      {/* General Action Feedback Toast */}
      {generalFeedback && (
        <div
          className={`p-4 rounded-2xl border text-xs md:text-sm font-semibold flex items-center justify-between gap-3 animate-fadeIn shadow-lg ${
            generalFeedback.success
              ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
              : 'bg-red-950/90 border-red-500 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {generalFeedback.success ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span>{generalFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setGeneralFeedback(null)}
            className="p-1 hover:bg-black/30 rounded-lg text-neutral-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stores Section (Multi-Loja) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2.5">
              <StoreIcon className="w-6 h-6 text-emerald-400" />
              Cadastro de Lojas & Filiais (Multi-Loja)
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Cadastre e gerencie as lojas do supermercado. Os preços e a sincronização são isolados por loja (<code className="text-emerald-400 font-mono">id_loja</code>).
            </p>
          </div>

          <button
            onClick={handleOpenNewStore}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer shadow shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Nova Loja</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stores.map((s) => {
            const isCurrent = s.id === currentStoreId;
            return (
              <div
                key={s.id}
                className={`p-5 rounded-3xl border transition relative flex flex-col justify-between space-y-4 shadow-lg ${
                  isCurrent
                    ? 'bg-gradient-to-br from-emerald-950/60 to-neutral-900 border-emerald-500/80 ring-2 ring-emerald-500/20 shadow-emerald-950/30'
                    : 'bg-neutral-900/90 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2.5 rounded-xl ${isCurrent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-800 text-neutral-400'}`}>
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-white">{s.nome}</h3>
                        <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                          ID no ERP: id_loja = {s.id}
                        </span>
                      </div>
                    </div>

                    {isCurrent ? (
                      <span className="text-[11px] font-bold text-emerald-300 bg-emerald-950 px-2.5 py-1 rounded-lg border border-emerald-800 flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Loja Ativa
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-neutral-500 bg-neutral-800/80 px-2 py-0.5 rounded shrink-0">
                        Filial
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-neutral-300 space-y-1.5 bg-neutral-950/60 p-3.5 rounded-2xl border border-neutral-800/60 font-mono">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span>CNPJ: <strong className="text-white">{s.cnpj || 'Não informado'}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="truncate">Endereço: <strong className="text-neutral-200">{s.endereco || 'Não informado'}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-neutral-800/60 gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleOpenEditStore(s, e)}
                      className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-neutral-700 transition cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Editar Cadastro</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteStoreClick(s, e)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                        stores.length > 1
                          ? 'bg-neutral-800 hover:bg-red-950/80 text-neutral-300 hover:text-red-200 border-neutral-700 hover:border-red-700'
                          : 'bg-neutral-800/40 text-neutral-500 border-neutral-800 hover:bg-neutral-800'
                      }`}
                      title={stores.length > 1 ? `Excluir Loja ID ${s.id}` : 'Não é possível excluir a única loja cadastrada no sistema'}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span>Excluir</span>
                    </button>
                  </div>

                  {!isCurrent ? (
                    <button
                      type="button"
                      onClick={() => onSelectStore(s.id)}
                      className="px-3.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-xl text-xs font-bold border border-emerald-500/40 transition cursor-pointer"
                    >
                      Ativar no Busca Preço
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Selecionada
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Store Create / Edit Modal */}
      {showStoreModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <form
            onSubmit={handleSaveStore}
            className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8 max-w-lg w-full space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <StoreIcon className="w-5 h-5 text-emerald-400" />
                {editingStoreId !== null ? `Editar Loja (ID ${editingStoreId})` : 'Cadastrar Nova Loja'}
              </h3>
              <button
                type="button"
                onClick={() => setShowStoreModal(false)}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">
                    ID da Loja no ERP ($2) *
                  </label>
                  <input
                    type="number"
                    value={storeForm.id}
                    onChange={(e) => setStoreForm({ ...storeForm, id: parseInt(e.target.value) || 1 })}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
                    required
                  />
                  <span className="text-[10px] text-neutral-500">pc.id_loja</span>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-neutral-300 font-semibold block mb-1">
                    Nome da Loja / Razão Social *
                  </label>
                  <input
                    type="text"
                    value={storeForm.nome}
                    onChange={(e) => setStoreForm({ ...storeForm, nome: e.target.value })}
                    placeholder="Ex: Supermercado Central - Loja 01 (Matriz)"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-white font-bold text-sm focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-neutral-300 font-semibold block mb-1">
                  CNPJ da Unidade
                </label>
                <input
                  type="text"
                  value={storeForm.cnpj}
                  onChange={(e) => setStoreForm({ ...storeForm, cnpj: e.target.value })}
                  placeholder="00.000.000/0001-00"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-neutral-300 font-semibold block mb-1">
                  Endereço Completo
                </label>
                <input
                  type="text"
                  value={storeForm.endereco}
                  onChange={(e) => setStoreForm({ ...storeForm, endereco: e.target.value })}
                  placeholder="Ex: Av. Brasil, 1500 - Centro"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-neutral-300">
                  <input
                    type="checkbox"
                    checked={storeForm.ativa}
                    onChange={(e) => setStoreForm({ ...storeForm, ativa: e.target.checked })}
                    className="rounded text-emerald-500 focus:ring-0"
                  />
                  <span>Loja Ativa para Consulta e Impressão</span>
                </label>
              </div>
            </div>

            {storeFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  storeFeedback.success
                    ? 'bg-emerald-950/80 border border-emerald-700 text-emerald-200'
                    : 'bg-red-950/80 border border-red-700 text-red-200'
                }`}
              >
                {storeFeedback.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-red-400" />}
                <span>{storeFeedback.message}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setShowStoreModal(false)}
                className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingStore}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer shadow disabled:opacity-50"
              >
                <Save className={`w-4 h-4 ${savingStore ? 'animate-spin' : ''}`} />
                <span>{savingStore ? 'Gravando...' : 'Salvar Loja no Banco'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Terminais Section */}
      <div className="space-y-4 pt-6 border-t border-neutral-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Monitor className="w-5 h-5 text-emerald-400" />
              Terminais de Consulta & Gôndola
            </h2>
            <p className="text-xs text-neutral-400">
              Gerencie os terminais de consulta. Remova instâncias virtuais ou de teste com 1 clique.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleCleanFakeTerminals}
              disabled={cleaningFakes}
              className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-amber-950/50 disabled:opacity-50 border border-amber-400/40"
              title="Remove terminais fictícios/simulados, deixando apenas o terminal físico real da loja"
            >
              <Sparkles className={`w-4 h-4 text-amber-200 ${cleaningFakes ? 'animate-spin' : ''}`} />
              <span>{cleaningFakes ? 'Removendo...' : '🧹 Remover Terminais Não Reais'}</span>
            </button>

            <button
              onClick={() => setShowNewTerm(true)}
              className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-xl border border-neutral-700 flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-400" /> Novo Terminal
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {terminals.map((t) => {
            const isRealTerminal = t.id === 'term-01' || t.identificador === 'TERM-01' || t.nome.toLowerCase().includes('físico') || t.nome.toLowerCase().includes('principal');
            return (
              <div
                key={t.id}
                className={`p-5 rounded-2xl space-y-3 relative group transition border flex flex-col justify-between ${
                  isRealTerminal
                    ? 'bg-neutral-900 border-emerald-500/50 ring-1 ring-emerald-500/20'
                    : 'bg-neutral-900/80 border-neutral-800 hover:border-amber-600/40'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm truncate mr-2">{t.nome}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 shrink-0">
                        {t.status}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteTerminalClick(t, e)}
                        className="p-1 text-neutral-500 hover:text-red-400 hover:bg-red-950/60 rounded-lg transition cursor-pointer border border-transparent hover:border-red-900"
                        title="Excluir este terminal"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Badge de Real vs Simulado */}
                  <div>
                    {isRealTerminal ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Terminal Físico Real
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800 animate-pulse">
                        <Sparkles className="w-3 h-3 text-amber-400" /> Terminal Virtual / Simulado
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-neutral-400 space-y-1 font-mono bg-neutral-950/50 p-3 rounded-xl border border-neutral-800/60">
                    <div>ID: <strong className="text-white">{t.identificador}</strong></div>
                    <div>Loja: Loja {t.id_loja}</div>
                    <div>Impressora: {t.impressora_id}</div>
                    <div>Modelo: {t.modelo_etiqueta_padrao_id}</div>
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-800 space-y-2">
                  <div className="text-[11px] text-neutral-500 flex items-center justify-between">
                    <span>Heartbeat: {new Date(t.ultima_conexao).toLocaleTimeString('pt-BR')}</span>
                    <span className="text-neutral-600 font-mono text-[10px]">v{t.versao}</span>
                  </div>

                  {!isRealTerminal && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteTerminalClick(t, e)}
                      className="w-full py-1.5 bg-red-950/40 hover:bg-red-900/80 text-red-300 hover:text-white rounded-xl text-xs font-semibold border border-red-800/60 flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                      <span>Remover este Terminal Fictício</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirmation Modal: Delete Store */}
      {storeToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-neutral-900 border border-red-900/60 rounded-3xl p-6 md:p-7 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-2xl bg-red-950/70 border border-red-800">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">Excluir Loja</h3>
                <p className="text-xs text-neutral-400">Esta ação é irreversível</p>
              </div>
            </div>

            <p className="text-sm text-neutral-300">
              Deseja realmente excluir a loja <strong className="text-white">"{storeToDelete.nome}"</strong> (ID {storeToDelete.id})?
            </p>

            <p className="text-xs text-neutral-400 bg-neutral-950 p-3 rounded-xl border border-neutral-800">
              ⚠️ Se esta for a loja atualmente ativa no terminal, o sistema alternará automaticamente para outra loja cadastrada.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setStoreToDelete(null)}
                disabled={deletingAction}
                className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeDeleteStore}
                disabled={deletingAction}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer shadow disabled:opacity-50"
              >
                <Trash2 className={`w-4 h-4 ${deletingAction ? 'animate-spin' : ''}`} />
                <span>{deletingAction ? 'Excluindo...' : 'Sim, Excluir Loja'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete Terminal */}
      {terminalToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2.5 rounded-2xl bg-amber-950/70 border border-amber-800">
                <Monitor className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">Excluir Terminal</h3>
                <p className="text-xs text-neutral-400">Remover terminal do sistema</p>
              </div>
            </div>

            <p className="text-sm text-neutral-300">
              Deseja remover o terminal <strong className="text-white">"{terminalToDelete.nome}"</strong> ({terminalToDelete.identificador})?
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setTerminalToDelete(null)}
                disabled={deletingAction}
                className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeDeleteTerminal}
                disabled={deletingAction}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer shadow disabled:opacity-50"
              >
                <Trash2 className={`w-4 h-4 ${deletingAction ? 'animate-spin' : ''}`} />
                <span>{deletingAction ? 'Removendo...' : 'Sim, Remover Terminal'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Terminal Modal */}
      {showNewTerm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <form
            onSubmit={handleCreateTerminal}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-md w-full space-y-4"
          >
            <h3 className="text-base font-bold text-white">Cadastrar Novo Terminal</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-neutral-400 block mb-1">Nome do Terminal</label>
                <input
                  type="text"
                  value={termName}
                  onChange={(e) => setTermName(e.target.value)}
                  placeholder="ex: CONSULTA 03 - PADARIA"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">Loja</label>
                <select
                  value={termStoreId}
                  onChange={(e) => setTermStoreId(parseInt(e.target.value))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-white"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome} (ID {s.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">Modelo de Etiqueta Padrão</label>
                <select
                  value={termModelId}
                  onChange={(e) => setTermModelId(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-white"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">Impressora Vinculada</label>
                <select
                  value={termPrinterId}
                  onChange={(e) => setTermPrinterId(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-white"
                >
                  {printers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} ({p.porta})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setShowNewTerm(false)}
                className="px-4 py-2 bg-neutral-800 text-neutral-300 text-xs font-semibold rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl"
              >
                Salvar Terminal
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
