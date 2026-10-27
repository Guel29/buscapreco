import React, { useState } from 'react';
import { PrinterConfig, LabelModel } from '../types';
import { sendDirectPrint, savePrinter, deletePrinter } from '../services/api';
import {
  Printer,
  Sliders,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Save,
  Cpu,
  Layers,
  Plus,
  Trash2,
  X,
  Check,
} from 'lucide-react';

interface GerenciadorImpressorasProps {
  printers: PrinterConfig[];
  activeModel: LabelModel;
  onUpdatePrinter: (updated: PrinterConfig) => void;
  onAddPrinter?: (newPrinter: PrinterConfig) => void;
  onDeletePrinter?: (printerId: string) => void;
}

export const GerenciadorImpressoras: React.FC<GerenciadorImpressorasProps> = ({
  printers,
  activeModel,
  onUpdatePrinter,
  onAddPrinter,
  onDeletePrinter,
}) => {
  const [selectedPrinter, setSelectedPrinter] = useState<PrinterConfig>(printers[0] || {
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
  });
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // New printer modal state
  const [showNewPrinterModal, setShowNewPrinterModal] = useState<boolean>(false);
  const [newPrinterForm, setNewPrinterForm] = useState<{
    nome: string;
    tipo: string;
    linguagem: string;
    porta: string;
    dpi: number;
    offset_x: number;
    offset_y: number;
    gap: number;
    avanco: number;
    padrao: boolean;
  }>({
    nome: '',
    tipo: 'argox_os214',
    linguagem: 'PPLB',
    porta: 'USB001',
    dpi: 203,
    offset_x: 0,
    offset_y: 0,
    gap: 3,
    avanco: 0,
    padrao: false,
  });

  const [printerToDelete, setPrinterToDelete] = useState<PrinterConfig | null>(null);
  const [savingNewPrinter, setSavingNewPrinter] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ success: boolean; text: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await savePrinter(selectedPrinter);
      if (res.success || res.printer) {
        onUpdatePrinter(selectedPrinter);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreatePrinterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrinterForm.nome.trim()) return;

    setSavingNewPrinter(true);
    try {
      const res = await savePrinter(newPrinterForm);
      if (res.success && res.printer) {
        if (onAddPrinter) onAddPrinter(res.printer);
        setSelectedPrinter(res.printer);
        setShowNewPrinterModal(false);
        setNewPrinterForm({
          nome: '',
          tipo: 'argox_os214',
          linguagem: 'PPLB',
          porta: 'USB001',
          dpi: 203,
          offset_x: 0,
          offset_y: 0,
          gap: 3,
          avanco: 0,
          padrao: false,
        });
        setFeedbackMsg({ success: true, text: `Impressora "${res.printer.nome}" cadastrada com sucesso!` });
        setTimeout(() => setFeedbackMsg(null), 5000);
      } else {
        setFeedbackMsg({ success: false, text: res.error || 'Erro ao cadastrar impressora.' });
      }
    } catch (err: any) {
      setFeedbackMsg({ success: false, text: err.message });
    } finally {
      setSavingNewPrinter(false);
    }
  };

  const executeDeletePrinter = async () => {
    if (!printerToDelete) return;
    if (printers.length <= 1) {
      setFeedbackMsg({ success: false, text: 'Não é possível excluir a única impressora configurada.' });
      setPrinterToDelete(null);
      return;
    }

    try {
      const res = await deletePrinter(printerToDelete.id);
      if (res.success) {
        if (onDeletePrinter) onDeletePrinter(printerToDelete.id);
        const remaining = printers.filter((p) => p.id !== printerToDelete.id);
        if (remaining.length > 0) {
          setSelectedPrinter(remaining[0]);
        }
        setFeedbackMsg({ success: true, text: `Impressora "${printerToDelete.nome}" removida.` });
        setPrinterToDelete(null);
      } else {
        setFeedbackMsg({ success: false, text: res.error || 'Erro ao remover impressora.' });
      }
    } catch (err: any) {
      setFeedbackMsg({ success: false, text: err.message });
    } finally {
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  const handleTestPrint = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const testProducts = [
        {
          codigo_interno: '1548',
          codigo_barras: '7891000100103',
          descricao: 'PRODUTO TESTE 1 ARGOX',
          preco: 4.48,
          embalagem: 'UN',
          ncm: '1006.30.21',
        },
        {
          codigo_interno: '2042',
          codigo_barras: '7891000200204',
          descricao: 'PRODUTO TESTE 2 ARGOX',
          preco: 6.99,
          embalagem: 'UN',
          ncm: '0713.33.19',
        },
      ];

      const res = await sendDirectPrint(activeModel, selectedPrinter, testProducts);
      setTestResult(res.message);
    } catch (err: any) {
      setTestResult('Falha ao enviar comando para impressora.');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 text-neutral-100">
      {/* Header with Add Printer Button */}
      <div className="border-b border-neutral-800 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Printer className="w-6 h-6 text-emerald-400" />
            Configuração & Cadastro de Impressoras
          </h2>
          <p className="text-sm text-neutral-400">
            Cadastre e calibre impressoras térmicas (<strong className="text-white">Argox OS-214 Plus</strong>, Zebra, Elgin, Bematech ou Spooler Windows).
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNewPrinterModal(true)}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer shadow shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Nova Impressora</span>
        </button>
      </div>

      {/* Feedback Toast */}
      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between animate-fadeIn shadow ${
            feedbackMsg.success
              ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
              : 'bg-red-950/80 border-red-500 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
            <span>{feedbackMsg.text}</span>
          </div>
          <button type="button" onClick={() => setFeedbackMsg(null)} className="text-neutral-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Printer Selection Card */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Impressoras Cadastradas ({printers.length})
            </h3>
          </div>

          <div className="space-y-3">
            {printers.map((p) => {
              const isSelected = selectedPrinter.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPrinter(p)}
                  className={`p-4 rounded-2xl border cursor-pointer transition relative group ${
                    isSelected
                      ? 'bg-neutral-800 border-emerald-500 shadow'
                      : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white text-sm truncate mr-2">{p.nome}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
                      {printers.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrinterToDelete(p);
                          }}
                          className="p-1 text-neutral-500 hover:text-red-400 hover:bg-red-950/60 rounded transition cursor-pointer"
                          title="Excluir impressora"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-400 space-y-0.5 font-mono">
                    <div>Porta: <strong className="text-neutral-200">{p.porta}</strong></div>
                    <div>Linguagem: {p.linguagem} · {p.dpi} DPI</div>
                    <div>Offset: X {p.offset_x}mm / Y {p.offset_y}mm</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Hardware Spec Box */}
          <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl text-xs space-y-2">
            <span className="font-bold text-neutral-300 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-emerald-400" /> Compatibilidade de Impressão:
            </span>
            <ul className="text-neutral-400 space-y-1 list-disc list-inside">
              <li>Argox OS-214 Plus (PPLB / PPLA)</li>
              <li>Zebra ZD220 / ZD230 / GC420 (ZPL II)</li>
              <li>Elgin L42 Pro / Bematech</li>
              <li>Spooler Direto Windows (USB/COM)</li>
            </ul>
          </div>
        </div>

        {/* Configuration & Calibration Form */}
        <form onSubmit={handleSave} className="md:col-span-2 bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              Parâmetros & Calibração da Impressora
            </h3>
            <span className="text-xs bg-neutral-800 text-neutral-400 px-3 py-1 rounded font-mono">
              {selectedPrinter.id}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-neutral-400 block mb-1 font-semibold">Nome da Impressora *</label>
              <input
                type="text"
                value={selectedPrinter.nome}
                onChange={(e) => setSelectedPrinter({ ...selectedPrinter, nome: e.target.value })}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-white font-semibold focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="text-neutral-400 block mb-1 font-semibold">Porta / Conexão *</label>
              <input
                type="text"
                value={selectedPrinter.porta}
                onChange={(e) => setSelectedPrinter({ ...selectedPrinter, porta: e.target.value })}
                placeholder="Ex: USB001, COM1, 127.0.0.1:9100"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="text-neutral-400 block mb-1 font-semibold">Linguagem Térmica</label>
              <select
                value={selectedPrinter.linguagem}
                onChange={(e) =>
                  setSelectedPrinter({
                    ...selectedPrinter,
                    linguagem: e.target.value as 'PPLA' | 'PPLB' | 'RAW',
                  })
                }
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-white font-semibold focus:outline-none focus:border-emerald-500"
              >
                <option value="PPLB">PPLB (Argox / Emulação EPL2 - Padrão)</option>
                <option value="PPLA">PPLA (Argox / Emulação Datamax)</option>
                <option value="RAW">RAW Spooler Direto / ZPL</option>
              </select>
            </div>

            <div>
              <label className="text-neutral-400 block mb-1 font-semibold">Resolução Térmica (DPI)</label>
              <select
                value={selectedPrinter.dpi}
                onChange={(e) => setSelectedPrinter({ ...selectedPrinter, dpi: parseInt(e.target.value) || 203 })}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
              >
                <option value={203}>203 DPI (8 pontos/mm - Padrão Argox/Zebra)</option>
                <option value={300}>300 DPI (12 pontos/mm - Alta Definição)</option>
              </select>
            </div>
          </div>

          {/* Offsets (mm) for mechanical fine-tuning */}
          <div className="space-y-3 pt-3 border-t border-neutral-800">
            <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider block">
              Calibração de Margens Físicas (Offsets em mm)
            </span>
            <p className="text-[11px] text-neutral-500">
              Ajuste fino de posicionamento no rolo de etiquetas físicas sem alterar os templates de gôndola.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
              <div>
                <label className="text-neutral-400 block mb-1">Offset X (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={selectedPrinter.offset_x}
                  onChange={(e) =>
                    setSelectedPrinter({ ...selectedPrinter, offset_x: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">Offset Y (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={selectedPrinter.offset_y}
                  onChange={(e) =>
                    setSelectedPrinter({ ...selectedPrinter, offset_y: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">Gap / Sensor (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={selectedPrinter.gap}
                  onChange={(e) =>
                    setSelectedPrinter({ ...selectedPrinter, gap: parseFloat(e.target.value) || 3 })
                  }
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">Avanço (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={selectedPrinter.avanco}
                  onChange={(e) =>
                    setSelectedPrinter({ ...selectedPrinter, avanco: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
            <button
              type="button"
              onClick={handleTestPrint}
              disabled={isTesting}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-xl border border-neutral-700 transition cursor-pointer flex items-center gap-2"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>{isTesting ? 'Enviando...' : 'Imprimir Etiqueta de Teste'}</span>
            </button>

            <button
              type="submit"
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 shadow"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Alterações</span>
            </button>
          </div>

          {testResult && (
            <div className="p-3 bg-neutral-800 border border-neutral-700 text-xs text-neutral-200 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {testResult}
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Calibração salva com sucesso!
            </div>
          )}
        </form>
      </div>

      {/* Modal: Cadastrar Nova Impressora */}
      {showNewPrinterModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <form
            onSubmit={handleCreatePrinterSubmit}
            className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8 max-w-lg w-full space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-400" />
                Cadastrar Nova Impressora Térmica
              </h3>
              <button
                type="button"
                onClick={() => setShowNewPrinterModal(false)}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Presets rápidos */}
              <div>
                <label className="text-neutral-400 block mb-1.5 font-medium">Modelos Pré-definidos (Clique para autocompletar):</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setNewPrinterForm({
                        ...newPrinterForm,
                        nome: 'Argox OS-214 Plus (Térmica)',
                        tipo: 'argox_os214',
                        linguagem: 'PPLB',
                        porta: 'USB001',
                        dpi: 203,
                        gap: 3,
                      })
                    }
                    className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 rounded-lg border border-neutral-700 font-semibold cursor-pointer"
                  >
                    Argox OS-214 (PPLB)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setNewPrinterForm({
                        ...newPrinterForm,
                        nome: 'Zebra ZD220 / ZPL',
                        tipo: 'zebra_zpl',
                        linguagem: 'RAW',
                        porta: 'USB001',
                        dpi: 203,
                        gap: 3,
                      })
                    }
                    className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-cyan-400 rounded-lg border border-neutral-700 font-semibold cursor-pointer"
                  >
                    Zebra (ZPL / RAW)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setNewPrinterForm({
                        ...newPrinterForm,
                        nome: 'Elgin L42 Pro',
                        tipo: 'elgin_l42',
                        linguagem: 'PPLB',
                        porta: 'USB001',
                        dpi: 203,
                        gap: 3,
                      })
                    }
                    className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-amber-400 rounded-lg border border-neutral-700 font-semibold cursor-pointer"
                  >
                    Elgin L42 Pro
                  </button>
                </div>
              </div>

              <div>
                <label className="text-neutral-300 font-semibold block mb-1">Nome da Impressora *</label>
                <input
                  type="text"
                  value={newPrinterForm.nome}
                  onChange={(e) => setNewPrinterForm({ ...newPrinterForm, nome: e.target.value })}
                  placeholder="Ex: Argox OS-214 Plus - Caixa 01"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-white font-bold focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Tipo / Fabricante</label>
                  <select
                    value={newPrinterForm.tipo}
                    onChange={(e) => setNewPrinterForm({ ...newPrinterForm, tipo: e.target.value })}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-white font-semibold focus:outline-none focus:border-emerald-500"
                  >
                    <option value="argox_os214">Argox OS-214 Plus / CP-2140</option>
                    <option value="zebra_zpl">Zebra (ZPL / EPL)</option>
                    <option value="elgin_l42">Elgin L42 / L42 Pro</option>
                    <option value="bematech">Bematech LB-1000</option>
                    <option value="windows_spooler">Spooler do Windows (Padrão)</option>
                    <option value="network_raw">Rede Ethernet TCP/IP (9100)</option>
                  </select>
                </div>

                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Linguagem Térmica</label>
                  <select
                    value={newPrinterForm.linguagem}
                    onChange={(e) =>
                      setNewPrinterForm({ ...newPrinterForm, linguagem: e.target.value })
                    }
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-white font-semibold focus:outline-none focus:border-emerald-500"
                  >
                    <option value="PPLB">PPLB (Argox / EPL2 padrão)</option>
                    <option value="PPLA">PPLA (Argox / Datamax)</option>
                    <option value="RAW">RAW Spooler / ZPL</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Porta de Comunicação *</label>
                  <input
                    type="text"
                    value={newPrinterForm.porta}
                    onChange={(e) => setNewPrinterForm({ ...newPrinterForm, porta: e.target.value })}
                    placeholder="USB001, COM1 ou 192.168.1.50"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">Resolução (DPI)</label>
                  <select
                    value={newPrinterForm.dpi}
                    onChange={(e) => setNewPrinterForm({ ...newPrinterForm, dpi: parseInt(e.target.value) || 203 })}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                  >
                    <option value={203}>203 DPI (Padrão Argox/Zebra)</option>
                    <option value={300}>300 DPI (Alta Resolução)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-neutral-300 font-semibold">
                  <input
                    type="checkbox"
                    checked={newPrinterForm.padrao}
                    onChange={(e) => setNewPrinterForm({ ...newPrinterForm, padrao: e.target.checked })}
                    className="w-4 h-4 accent-emerald-500 rounded"
                  />
                  <span>Definir como impressora padrão do sistema</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setShowNewPrinterModal(false)}
                className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingNewPrinter}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer shadow disabled:opacity-50"
              >
                <Save className={`w-4 h-4 ${savingNewPrinter ? 'animate-spin' : ''}`} />
                <span>{savingNewPrinter ? 'Gravando...' : 'Salvar Impressora'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmation Modal: Delete Printer */}
      {printerToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-neutral-900 border border-red-900/60 rounded-3xl p-6 md:p-7 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-2xl bg-red-950/70 border border-red-800">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">Excluir Impressora</h3>
                <p className="text-xs text-neutral-400">Remover configuração</p>
              </div>
            </div>

            <p className="text-sm text-neutral-300">
              Deseja realmente remover a impressora <strong className="text-white">"{printerToDelete.nome}"</strong> ({printerToDelete.porta})?
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setPrinterToDelete(null)}
                className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeDeletePrinter}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer shadow"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sim, Excluir Impressora</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
