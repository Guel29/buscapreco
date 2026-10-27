import React, { useState, useRef, useEffect } from 'react';
import { LabelModel, LabelElement, ElementType, PrinterConfig } from '../types';
import { formatPrice, resolveElementText } from '../services/argoxPrinter';
import { sendDirectPrint } from '../services/api';
import {
  Move,
  Type,
  Barcode,
  Layers,
  Save,
  RotateCcw,
  Printer,
  Eye,
  Plus,
  Trash2,
  Copy,
  Sliders,
  Maximize2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface EditorEtiquetasProps {
  model: LabelModel;
  allModels: LabelModel[];
  activePrinter: PrinterConfig;
  onSaveModel: (updatedModel: LabelModel) => void;
  onSelectModel: (modelId: string) => void;
  onCreateNewModel: () => void;
}

export const EditorEtiquetas: React.FC<EditorEtiquetasProps> = ({
  model,
  allModels,
  activePrinter,
  onSaveModel,
  onSelectModel,
  onCreateNewModel,
}) => {
  const [currentModel, setCurrentModel] = useState<LabelModel>(model);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(4.0); // pixels per mm (e.g. 4px = 1mm)
  const [testPrintLoading, setTestPrintLoading] = useState<boolean>(false);
  const [testPrintFeedback, setTestPrintFeedback] = useState<string | null>(null);

  // Sync when prop model changes
  useEffect(() => {
    setCurrentModel(model);
    setSelectedElementId(model.elementos[0]?.id || null);
  }, [model]);

  // Dragging state
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartPos, setDragStartPos] = useState<{ mouseX: number; mouseY: number; elemX: number; elemY: number }>({
    mouseX: 0,
    mouseY: 0,
    elemX: 0,
    elemY: 0,
  });

  const selectedElement = currentModel.elementos.find((el) => el.id === selectedElementId) || null;

  // Sample products for preview
  const sampleProducts = [
    {
      codigo_interno: '1548',
      codigo_barras: '7891000100103',
      descricao: 'ARROZ DULAR PARBOILIZADO 1KG',
      preco: 4.48,
      embalagem: 'PCT',
      ncm: '1006.30.21',
    },
    {
      codigo_interno: '2042',
      codigo_barras: '7891000200204',
      descricao: 'FEIJÃO SMART PRETO TIPO 1 1KG',
      preco: 6.99,
      embalagem: 'PCT',
      ncm: '0713.33.19',
    },
  ];

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent, elem: LabelElement) => {
    e.stopPropagation();
    setSelectedElementId(elem.id);
    setIsDragging(true);
    setDragStartPos({
      mouseX: e.clientX,
      mouseY: e.clientY,
      elemX: elem.x,
      elemY: elem.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedElement) return;

    const deltaX = (e.clientX - dragStartPos.mouseX) / scale;
    const deltaY = (e.clientY - dragStartPos.mouseY) / scale;

    const newX = Math.max(0, Math.min(currentModel.largura_mm - selectedElement.largura, Number((dragStartPos.elemX + deltaX).toFixed(1))));
    const newY = Math.max(0, Math.min(currentModel.altura_mm - selectedElement.altura, Number((dragStartPos.elemY + deltaY).toFixed(1))));

    updateElement(selectedElement.id, { x: newX, y: newY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Keyboard fine-tuning (0.5 mm steps)
  useEffect(() => {
    const handleKeyNav = (e: KeyboardEvent) => {
      if (!selectedElement) return;
      if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement) return;

      const step = e.shiftKey ? 1.0 : 0.5;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateElement(selectedElement.id, { y: Math.max(0, Number((selectedElement.y - step).toFixed(1))) });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateElement(selectedElement.id, { y: Math.min(currentModel.altura_mm - selectedElement.altura, Number((selectedElement.y + step).toFixed(1))) });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        updateElement(selectedElement.id, { x: Math.max(0, Number((selectedElement.x - step).toFixed(1))) });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        updateElement(selectedElement.id, { x: Math.min(currentModel.largura_mm - selectedElement.largura, Number((selectedElement.x + step).toFixed(1))) });
      }
    };

    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  }, [selectedElement, currentModel]);

  const updateElement = (id: string, updates: Partial<LabelElement>) => {
    setCurrentModel((prev) => ({
      ...prev,
      elementos: prev.elementos.map((el) => (el.id === id ? { ...el, ...updates } : el)),
    }));
  };

  const addNewElement = (tipo: ElementType, slot: 1 | 2 = 1) => {
    const newId = `el_${Date.now()}`;
    const newElem: LabelElement = {
      id: newId,
      tipo,
      slot,
      x: slot === 2 ? 52 : 4,
      y: 10,
      largura: tipo === 'separador' || tipo === 'linha_vertical' ? 0.5 : 30,
      altura: tipo === 'separador' || tipo === 'linha_vertical' ? currentModel.altura_mm - 4 : 8,
      fonte: 'Arial',
      tamanho_fonte: tipo === 'preco_reais' ? 24 : 11,
      negrito: tipo.includes('preco') || tipo === 'descricao',
      alinhamento: 'left',
      rotacao: 0,
      quebra_linha: tipo === 'descricao',
      max_linhas: 2,
      visivel: true,
      texto_personalizado: tipo === 'texto_fixo' ? 'TEXTO' : undefined,
    };

    setCurrentModel((prev) => ({
      ...prev,
      elementos: [...prev.elementos, newElem],
    }));
    setSelectedElementId(newId);
  };

  const deleteElement = (id: string) => {
    setCurrentModel((prev) => ({
      ...prev,
      elementos: prev.elementos.filter((el) => el.id !== id),
    }));
    if (selectedElementId === id) setSelectedElementId(null);
  };

  // Test print trigger
  const handleTestPrint = async () => {
    setTestPrintLoading(true);
    setTestPrintFeedback(null);
    try {
      const res = await sendDirectPrint(currentModel, activePrinter, sampleProducts);
      if (res.success) {
        setTestPrintFeedback('✓ Etiqueta de teste enviada com sucesso à Argox OS-214!');
      } else {
        setTestPrintFeedback(`Falha: ${res.message}`);
      }
    } catch (e: any) {
      setTestPrintFeedback('Erro de conexão com o serviço de impressão.');
    } finally {
      setTestPrintLoading(false);
      setTimeout(() => setTestPrintFeedback(null), 4000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* Top Action Bar */}
      <div className="px-6 py-3 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-400 uppercase">Modelo:</span>
            <select
              value={currentModel.id}
              onChange={(e) => onSelectModel(e.target.value)}
              className="bg-neutral-800 text-white text-sm font-semibold rounded-lg px-3 py-1.5 border border-neutral-700 focus:outline-none focus:border-emerald-500"
            >
              {allModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome} ({m.largura_mm}×{m.altura_mm}mm · {m.produtos_por_etiqueta} prod)
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={onCreateNewModel}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Novo Modelo
          </button>
        </div>

        {/* Zoom & Test Print & Save */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-neutral-800 rounded-lg p-0.5 border border-neutral-700">
            <button
              onClick={() => setScale((s) => Math.max(2, s - 0.5))}
              className="p-1 text-neutral-400 hover:text-white"
              title="Diminuir Zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono px-2 text-neutral-300">{Math.round((scale / 4) * 100)}%</span>
            <button
              onClick={() => setScale((s) => Math.min(8, s + 0.5))}
              className="p-1 text-neutral-400 hover:text-white"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleTestPrint}
            disabled={testPrintLoading}
            className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-lg border border-neutral-700 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span>{testPrintLoading ? 'Enviando...' : 'Testar Impressão'}</span>
          </button>

          <button
            onClick={() => onSaveModel(currentModel)}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow"
          >
            <Save className="w-4 h-4" />
            <span>Salvar Modelo</span>
          </button>
        </div>
      </div>

      {testPrintFeedback && (
        <div className="bg-emerald-950 border-b border-emerald-800 text-emerald-300 px-6 py-2 text-xs font-medium flex items-center gap-2">
          <Printer className="w-4 h-4" />
          <span>{testPrintFeedback}</span>
        </div>
      )}

      {/* Main Workspace: Left Palette + Center Canvas + Right Property Inspector */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar / Element Palette */}
        <div className="w-64 bg-neutral-900 border-r border-neutral-800 p-4 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-4">
            <h3 className="text-xs font-bold tracking-wider uppercase text-neutral-400">
              Adicionar Elementos
            </h3>

            {/* Product 1 Elements */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-neutral-500 uppercase">
                {currentModel.produtos_por_etiqueta === 2 ? 'PRODUTO 1 (Esquerda)' : 'PRODUTO'}
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => addNewElement('descricao', 1)}
                  className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 flex items-center gap-1.5 cursor-pointer"
                >
                  <Type className="w-3.5 h-3.5 text-emerald-400" /> Descrição
                </button>
                <button
                  onClick={() => addNewElement('preco_completo', 1)}
                  className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="font-bold text-emerald-400">R$</span> Preço Total
                </button>
                <button
                  onClick={() => addNewElement('preco_reais', 1)}
                  className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="font-black text-emerald-400 text-sm">4</span> Reais
                </button>
                <button
                  onClick={() => addNewElement('preco_centavos', 1)}
                  className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="font-bold text-emerald-400 text-xs">,48</span> Centavos
                </button>
                <button
                  onClick={() => addNewElement('codigo_barras', 1)}
                  className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 flex items-center gap-1.5 cursor-pointer"
                >
                  <Barcode className="w-3.5 h-3.5 text-blue-400" /> Cód. Barras
                </button>
                <button
                  onClick={() => addNewElement('codigo_interno', 1)}
                  className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="font-mono text-xs text-blue-400">#</span> Cód. Interno
                </button>
                <button
                  onClick={() => addNewElement('embalagem', 1)}
                  className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 flex items-center gap-1.5 cursor-pointer"
                >
                  Embalagem
                </button>
                <button
                  onClick={() => addNewElement('ncm', 1)}
                  className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 flex items-center gap-1.5 cursor-pointer"
                >
                  NCM
                </button>
              </div>
            </div>

            {/* Product 2 Elements (If dual model) */}
            {currentModel.produtos_por_etiqueta === 2 && (
              <div className="space-y-1.5 pt-2 border-t border-neutral-800">
                <span className="text-[11px] font-semibold text-amber-500 uppercase">
                  PRODUTO 2 (Direita)
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => addNewElement('descricao', 2)}
                    className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Type className="w-3.5 h-3.5 text-amber-400" /> Descrição 2
                  </button>
                  <button
                    onClick={() => addNewElement('preco_reais', 2)}
                    className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="font-black text-amber-400">6</span> Reais 2
                  </button>
                  <button
                    onClick={() => addNewElement('preco_centavos', 2)}
                    className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="font-bold text-amber-400">,99</span> Cents 2
                  </button>
                  <button
                    onClick={() => addNewElement('codigo_barras', 2)}
                    className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Barcode className="w-3.5 h-3.5 text-amber-400" /> Barras 2
                  </button>
                </div>
              </div>
            )}

            {/* Separators and Geometry */}
            <div className="space-y-1.5 pt-2 border-t border-neutral-800">
              <span className="text-[11px] font-semibold text-neutral-500 uppercase">
                Formas & Separadores
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => addNewElement('separador', 1)}
                  className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 cursor-pointer"
                >
                  | Separador
                </button>
                <button
                  onClick={() => addNewElement('linha_horizontal', 1)}
                  className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 cursor-pointer"
                >
                  — Linha Horiz.
                </button>
                <button
                  onClick={() => addNewElement('retangulo', 1)}
                  className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 cursor-pointer"
                >
                  □ Retângulo
                </button>
                <button
                  onClick={() => addNewElement('texto_fixo', 1)}
                  className="p-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-left rounded text-neutral-300 border border-neutral-700/60 cursor-pointer"
                >
                  Texto Fixo
                </button>
              </div>
            </div>
          </div>

          {/* Model Physical Dimensions Info */}
          <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 text-[11px] text-neutral-400 space-y-1">
            <div className="font-bold text-neutral-300">Medidas Físicas:</div>
            <div>Largura: {currentModel.largura_mm} mm ({currentModel.largura_mm * 8} dots)</div>
            <div>Altura: {currentModel.altura_mm} mm ({currentModel.altura_mm * 8} dots)</div>
            <div>Resolução: 203 DPI (8 dots/mm)</div>
          </div>
        </div>

        {/* Center Area: Millimeter Canvas with Grid and Rulers */}
        <div
          className="flex-1 bg-neutral-950 p-8 flex items-center justify-center overflow-auto select-none relative"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          {/* Label Container simulating physical thermal label */}
          <div className="relative shadow-2xl p-6 bg-neutral-900/60 rounded-2xl border border-neutral-800">
            {/* Top mm Ruler */}
            <div
              className="absolute -top-6 left-6 h-5 border-b border-neutral-700 flex text-[9px] font-mono text-neutral-500 pointer-events-none"
              style={{ width: `${currentModel.largura_mm * scale}px` }}
            >
              {Array.from({ length: Math.floor(currentModel.largura_mm / 10) + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="border-l border-neutral-600 pl-1 h-3 flex items-start"
                  style={{ width: `${10 * scale}px` }}
                >
                  {i * 10}mm
                </div>
              ))}
            </div>

            {/* Left mm Ruler */}
            <div
              className="absolute top-6 -left-8 w-6 border-r border-neutral-700 flex flex-col text-[9px] font-mono text-neutral-500 pointer-events-none"
              style={{ height: `${currentModel.altura_mm * scale}px` }}
            >
              {Array.from({ length: Math.floor(currentModel.altura_mm / 10) + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="border-t border-neutral-600 pt-0.5 w-3"
                  style={{ height: `${10 * scale}px` }}
                >
                  {i * 10}
                </div>
              ))}
            </div>

            {/* Physical Label Canvas (White background like physical Argox roll) */}
            <div
              ref={canvasRef}
              onClick={() => setSelectedElementId(null)}
              className="relative bg-white text-black border border-neutral-400 overflow-hidden shadow-inner cursor-crosshair"
              style={{
                width: `${currentModel.largura_mm * scale}px`,
                height: `${currentModel.altura_mm * scale}px`,
                backgroundImage:
                  'radial-gradient(circle, #e5e5e5 1px, transparent 1px)',
                backgroundSize: `${scale}px ${scale}px`, // 1mm dots grid!
              }}
            >
              {/* Elements rendering */}
              {currentModel.elementos.map((elem) => {
                if (!elem.visivel) return null;
                const isSelected = elem.id === selectedElementId;
                const text = resolveElementText(elem, sampleProducts);

                const elemLeft = elem.x * scale;
                const elemTop = elem.y * scale;
                const elemW = elem.largura * scale;
                const elemH = elem.altura * scale;

                return (
                  <div
                    key={elem.id}
                    onMouseDown={(e) => handleMouseDown(e, elem)}
                    className={`absolute cursor-move overflow-hidden flex select-none transition-shadow ${
                      isSelected
                        ? 'ring-2 ring-emerald-500 ring-offset-1 bg-emerald-50/40 z-20'
                        : 'hover:outline hover:outline-1 hover:outline-blue-400 z-10'
                    }`}
                    style={{
                      left: `${elemLeft}px`,
                      top: `${elemTop}px`,
                      width: `${elemW}px`,
                      height: `${elemH}px`,
                      fontFamily: elem.fonte || 'Arial',
                      fontSize: `${elem.tamanho_fonte * (scale / 4)}px`,
                      fontWeight: elem.negrito ? '900' : 'normal',
                      justifyContent:
                        elem.alinhamento === 'center'
                          ? 'center'
                          : elem.alinhamento === 'right'
                          ? 'flex-end'
                          : 'flex-start',
                      alignItems: 'center',
                    }}
                  >
                    {/* Element Render based on Type */}
                    {elem.tipo === 'codigo_barras' ? (
                      <div className="w-full h-full flex flex-col items-center justify-center p-0.5">
                        {/* Simulates clean vector barcode bars */}
                        <div className="w-full h-4/5 flex items-stretch justify-between bg-black/5 p-0.5">
                          {Array.from({ length: 28 }).map((_, i) => (
                            <div
                              key={i}
                              className={`bg-black ${i % 3 === 0 ? 'w-1' : 'w-0.5'}`}
                            />
                          ))}
                        </div>
                        <span className="text-[7px] font-mono tracking-tighter text-black leading-none">
                          {text}
                        </span>
                      </div>
                    ) : elem.tipo === 'separador' || elem.tipo === 'linha_vertical' ? (
                      <div className="w-full h-full bg-black" />
                    ) : elem.tipo === 'linha_horizontal' ? (
                      <div className="w-full h-full bg-black" />
                    ) : elem.tipo === 'retangulo' ? (
                      <div className="w-full h-full border-2 border-black" />
                    ) : (
                      <span className="truncate leading-tight px-0.5">{text}</span>
                    )}

                    {/* Resize handle if selected */}
                    {isSelected && (
                      <div
                        className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-600 cursor-se-resize"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const startW = elem.largura;
                          const startH = elem.altura;
                          const startX = e.clientX;
                          const startY = e.clientY;

                          const onMove = (moveEvt: MouseEvent) => {
                            const newW = Math.max(2, Number((startW + (moveEvt.clientX - startX) / scale).toFixed(1)));
                            const newH = Math.max(2, Number((startH + (moveEvt.clientY - startY) / scale).toFixed(1)));
                            updateElement(elem.id, { largura: newW, altura: newH });
                          };

                          const onUp = () => {
                            window.removeEventListener('mousemove', onMove);
                            window.removeEventListener('mouseup', onUp);
                          };

                          window.addEventListener('mousemove', onMove);
                          window.addEventListener('mouseup', onUp);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Inspector: Element Properties */}
        <div className="w-80 bg-neutral-900 border-l border-neutral-800 p-5 overflow-y-auto">
          {selectedElement ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-200">
                    Propriedades ({selectedElement.tipo})
                  </span>
                </div>
                <button
                  onClick={() => deleteElement(selectedElement.id)}
                  className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-neutral-800"
                  title="Excluir Elemento"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Slot Selection (if dual model) */}
              {currentModel.produtos_por_etiqueta === 2 && (
                <div>
                  <label className="text-[11px] font-bold text-neutral-400 uppercase block mb-1">
                    Vincular a qual Produto
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateElement(selectedElement.id, { slot: 1 })}
                      className={`py-1.5 text-xs font-bold rounded border ${
                        selectedElement.slot === 1
                          ? 'bg-emerald-600 text-white border-emerald-500'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}
                    >
                      Produto 1 (Esq)
                    </button>
                    <button
                      onClick={() => updateElement(selectedElement.id, { slot: 2 })}
                      className={`py-1.5 text-xs font-bold rounded border ${
                        selectedElement.slot === 2
                          ? 'bg-amber-600 text-white border-amber-500'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}
                    >
                      Produto 2 (Dir)
                    </button>
                  </div>
                </div>
              )}

              {/* Position and Dimensions in Millimeters */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-neutral-400 uppercase block">
                  Posição & Dimensão (em mm)
                </span>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-neutral-500 block mb-0.5">X (mm)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={selectedElement.x}
                      onChange={(e) => updateElement(selectedElement.id, { x: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded px-2.5 py-1 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-neutral-500 block mb-0.5">Y (mm)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={selectedElement.y}
                      onChange={(e) => updateElement(selectedElement.id, { y: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded px-2.5 py-1 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-neutral-500 block mb-0.5">Largura (mm)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={selectedElement.largura}
                      onChange={(e) => updateElement(selectedElement.id, { largura: parseFloat(e.target.value) || 1 })}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded px-2.5 py-1 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-neutral-500 block mb-0.5">Altura (mm)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={selectedElement.altura}
                      onChange={(e) => updateElement(selectedElement.id, { altura: parseFloat(e.target.value) || 1 })}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded px-2.5 py-1 text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Typography */}
              {selectedElement.tipo !== 'separador' &&
                selectedElement.tipo !== 'linha_horizontal' &&
                selectedElement.tipo !== 'linha_vertical' &&
                selectedElement.tipo !== 'retangulo' && (
                  <div className="space-y-3 pt-3 border-t border-neutral-800">
                    <span className="text-[11px] font-bold text-neutral-400 uppercase block">
                      Tipografia
                    </span>

                    <div>
                      <label className="text-neutral-500 text-xs block mb-1">Tamanho da Fonte (pt)</label>
                      <input
                        type="number"
                        value={selectedElement.tamanho_fonte}
                        onChange={(e) =>
                          updateElement(selectedElement.id, {
                            tamanho_fonte: parseInt(e.target.value) || 10,
                          })
                        }
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2.5 py-1 text-white font-mono text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedElement.negrito}
                          onChange={(e) =>
                            updateElement(selectedElement.id, { negrito: e.target.checked })
                          }
                          className="rounded text-emerald-600 focus:ring-0"
                        />
                        Negrito
                      </label>
                    </div>

                    <div>
                      <label className="text-neutral-500 text-xs block mb-1">Alinhamento</label>
                      <div className="grid grid-cols-3 gap-1">
                        {(['left', 'center', 'right'] as const).map((align) => (
                          <button
                            key={align}
                            onClick={() => updateElement(selectedElement.id, { alinhamento: align })}
                            className={`py-1 text-xs rounded border capitalize ${
                              selectedElement.alinhamento === align
                                ? 'bg-neutral-700 text-white border-neutral-500'
                                : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                            }`}
                          >
                            {align}
                          </button>
                        ))}
                      </div>
                    </div>

                    {selectedElement.tipo === 'texto_fixo' && (
                      <div>
                        <label className="text-neutral-500 text-xs block mb-1">Texto Fixo</label>
                        <input
                          type="text"
                          value={selectedElement.texto_personalizado || ''}
                          onChange={(e) =>
                            updateElement(selectedElement.id, {
                              texto_personalizado: e.target.value,
                            })
                          }
                          className="w-full bg-neutral-800 border border-neutral-700 rounded px-2.5 py-1 text-white text-xs"
                        />
                      </div>
                    )}
                  </div>
                )}

              {/* Arrow Keys Nudge Helper */}
              <div className="pt-3 border-t border-neutral-800 text-[11px] text-neutral-500">
                <span className="font-semibold text-neutral-400">Dica:</span> Use as setas do teclado (↑ ↓ ← →) para ajuste fino milimétrico (0.5 mm).
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 space-y-2">
              <Eye className="w-8 h-8 opacity-40" />
              <p className="text-xs">Selecione um elemento na etiqueta para editar suas propriedades.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
