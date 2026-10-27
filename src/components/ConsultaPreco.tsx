import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Product, LabelModel, PrinterConfig, SystemStatus } from '../types';
import { searchProduct, sendDirectPrint, fetchSystemStatus, triggerInstantLoad } from '../services/api';
import { formatPrice } from '../services/argoxPrinter';
import { SupermarketKioskBackdrop } from './SmartinhoHero';
import { VerificadorSincronizacao } from './VerificadorSincronizacao';
import {
  Scan,
  Barcode,
  Search,
  CheckCircle2,
  AlertCircle,
  Printer,
  Layers,
  Store,
  RefreshCw,
  Cloud,
  Calendar,
  Clock,
  Zap,
  Plus,
  Minus,
  X,
  FileText,
} from 'lucide-react';

interface ConsultaPrecoProps {
  currentStoreId: number;
  currentStoreName: string;
  activeModel: LabelModel;
  activePrinter: PrinterConfig;
  printers?: PrinterConfig[];
  onOpenAdmin: () => void;
  isOffline: boolean;
  customBackground?: string | null;
}

export const ConsultaPreco: React.FC<ConsultaPrecoProps> = ({
  currentStoreId,
  currentStoreName,
  activeModel,
  activePrinter,
  printers = [],
  onOpenAdmin,
  isOffline,
  customBackground,
}) => {
  // Operational state
  const [modoEtiqueta, setModoEtiqueta] = useState<boolean>(false);
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [searchedTerm, setSearchedTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [showSyncVerifier, setShowSyncVerifier] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<SystemStatus | null>(null);
  const [runningInstantLoad, setRunningInstantLoad] = useState<boolean>(false);

  // User Print Modal state
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [printQuantity, setPrintQuantity] = useState<number>(1);
  const [selectedPrinterForJob, setSelectedPrinterForJob] = useState<PrinterConfig>(activePrinter);
  const [isSendingJob, setIsSendingJob] = useState<boolean>(false);
  const [jobFeedback, setJobFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Auto return timer (5 seconds)
  const [autoReturnTimer, setAutoReturnTimer] = useState<number>(5);
  const returnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const returnCountdownRef = useRef<NodeJS.Timeout | null>(null);

  // Carregar status da sincronização com a nuvem
  const loadSyncStatus = useCallback(async () => {
    try {
      const status = await fetchSystemStatus();
      setSyncStatus(status);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleInstantLoadHeader = async () => {
    setRunningInstantLoad(true);
    try {
      await triggerInstantLoad(currentStoreId);
      await loadSyncStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setRunningInstantLoad(false);
    }
  };

  useEffect(() => {
    loadSyncStatus();
    const interval = setInterval(loadSyncStatus, 10000);
    return () => clearInterval(interval);
  }, [loadSyncStatus, currentStoreId]);

  // Modo Etiqueta - Dual Product Buffer
  const [etiquetaSlot1, setEtiquetaSlot1] = useState<Product | null>(null);
  const [etiquetaSlot2, setEtiquetaSlot2] = useState<Product | null>(null);
  const [printStatus, setPrintStatus] = useState<{
    status: 'idle' | 'printing' | 'success' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });

  // Barcode / Keyboard input buffer
  const [manualInput, setManualInput] = useState<string>('');
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear / Reset to home
  const resetToHome = useCallback(() => {
    setCurrentProduct(null);
    setNotFound(false);
    setSearchedTerm('');
    setManualInput('');
    if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
    if (returnCountdownRef.current) clearInterval(returnCountdownRef.current);
    setAutoReturnTimer(5);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  }, []);

  // Permanent Focus Keeper: guarantees focus is ALWAYS on the scan field
  useEffect(() => {
    const ensureFocus = () => {
      // Do not steal focus if the user is typing in another input (e.g. admin modals)
      const active = document.activeElement;
      if (
        active &&
        active !== inputRef.current &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')
      ) {
        return;
      }
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    };

    // Immediate focus
    ensureFocus();

    // Regular interval enforcement (keeps focus even after background clicks or window switches)
    const interval = setInterval(ensureFocus, 250);

    // Click anywhere on window refocuses the scan field
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('select') ||
        (target.closest('input') && target !== inputRef.current)
      ) {
        return;
      }
      ensureFocus();
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('focus', ensureFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('focus', ensureFocus);
    };
  }, []);

  // Schedule auto return
  const triggerAutoReturn = useCallback(() => {
    if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
    if (returnCountdownRef.current) clearInterval(returnCountdownRef.current);

    setAutoReturnTimer(5);
    returnCountdownRef.current = setInterval(() => {
      setAutoReturnTimer((prev) => (prev > 1 ? prev - 1 : 1));
    }, 1000);

    returnTimerRef.current = setTimeout(() => {
      resetToHome();
    }, 5000);
  }, [resetToHome]);

  // Handle direct print action in Modo Etiqueta
  const executeEtiquetaPrint = async (p1: Product, p2?: Product) => {
    setPrintStatus({ status: 'printing', message: 'Enviando etiqueta para Argox OS-214...' });

    const productsToPrint = [
      {
        codigo_interno: p1.codigo_interno,
        codigo_barras: p1.codigo_barras,
        descricao: p1.descricao,
        preco: p1.preco,
        embalagem: p1.embalagem,
        ncm: p1.ncm,
      },
    ];

    if (p2) {
      productsToPrint.push({
        codigo_interno: p2.codigo_interno,
        codigo_barras: p2.codigo_barras,
        descricao: p2.descricao,
        preco: p2.preco,
        embalagem: p2.embalagem,
        ncm: p2.ncm,
      });
    }

    try {
      const result = await sendDirectPrint(activeModel, activePrinter, productsToPrint);
      if (result.success) {
        setPrintStatus({
          status: 'success',
          message: activeModel.produtos_por_etiqueta === 2
            ? 'Etiqueta Dupla impressa com sucesso!'
            : 'Etiqueta impressa com sucesso!',
        });

        // Reset slots immediately for next read
        setEtiquetaSlot1(null);
        setEtiquetaSlot2(null);

        setTimeout(() => {
          setPrintStatus({ status: 'idle', message: '' });
          resetToHome();
        }, 2200);
      } else {
        setPrintStatus({
          status: 'error',
          message: `NÃO FOI POSSÍVEL IMPRIMIR: ${result.message}`,
        });
      }
    } catch (err: any) {
      setPrintStatus({
        status: 'error',
        message: 'NÃO FOI POSSÍVEL IMPRIMIR. Verifique se a Argox OS-214 está ligada e com papel.',
      });
    }
  };

  // Abrir modal de impressão manual para o usuário
  const handleOpenPrintModal = useCallback(() => {
    if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
    if (returnCountdownRef.current) clearInterval(returnCountdownRef.current);
    setJobFeedback(null);
    setSelectedPrinterForJob(activePrinter);
    setPrintQuantity(1);
    setShowPrintModal(true);
  }, [activePrinter]);

  const handleClosePrintModal = useCallback(() => {
    setShowPrintModal(false);
    setJobFeedback(null);
    triggerAutoReturn();
  }, [triggerAutoReturn]);

  const handlePrintThermal = async () => {
    if (!currentProduct) return;
    setIsSendingJob(true);
    setJobFeedback(null);

    const items = Array.from({ length: Math.max(1, printQuantity) }).map(() => ({
      codigo_interno: currentProduct.codigo_interno,
      codigo_barras: currentProduct.codigo_barras,
      descricao: currentProduct.descricao,
      preco: currentProduct.preco,
      embalagem: currentProduct.embalagem,
      ncm: currentProduct.ncm,
    }));

    try {
      const res = await sendDirectPrint(activeModel, selectedPrinterForJob || activePrinter, items);
      if (res.success) {
        setJobFeedback({
          success: true,
          message: `${printQuantity} etiqueta(s) enviada(s) para ${selectedPrinterForJob?.nome || activePrinter.nome}!`,
        });
        setTimeout(() => {
          setShowPrintModal(false);
          resetToHome();
        }, 2500);
      } else {
        setJobFeedback({
          success: false,
          message: res.message || 'Falha ao enviar comando para impressora térmica.',
        });
      }
    } catch (err: any) {
      setJobFeedback({
        success: false,
        message: err.message || 'Erro ao conectar à impressora.',
      });
    } finally {
      setIsSendingJob(false);
    }
  };

  const handlePrintBrowser = () => {
    window.print();
  };

  // Perform search query
  const handleExecuteSearch = useCallback(
    async (code: string) => {
      // Normalização avançada para leitores USB e digitação manual:
      // Remove quebras, espaços, identificadores AIM (ex: ]E0) e prefixo/sufixo '_' comum em certos leitores
      const cleanCode = code
        .replace(/[\r\n\t]/g, '')
        .replace(/^\][a-zA-Z0-9]{2}/, '')
        .replace(/^_+|_+$/g, '')
        .trim();
      if (!cleanCode) return;

      setLoading(true);
      setNotFound(false);
      setSearchedTerm(cleanCode);

      try {
        const product = await searchProduct(cleanCode, currentStoreId);

        if (!product) {
          setCurrentProduct(null);
          setNotFound(true);
          triggerAutoReturn();
          return;
        }

        // Product found!
        setCurrentProduct(product);
        setNotFound(false);

        // Check if we are in MODO ETIQUETA
        if (modoEtiqueta) {
          if (activeModel.produtos_por_etiqueta === 1) {
            // Model 1: BIP -> IMPRIME IMEDIATAMENTE (sem confirmação, sem quantidade)
            await executeEtiquetaPrint(product);
          } else {
            // Model 2: Dual products (100x30mm)
            if (!etiquetaSlot1) {
              // 1st Read
              setEtiquetaSlot1(product);
              setPrintStatus({
                status: 'idle',
                message: '1/2 - Primeiro produto registrado. Aguardando segundo produto...',
              });
            } else {
              // 2nd Read -> Generates dual physical label and prints automatically!
              setEtiquetaSlot2(product);
              await executeEtiquetaPrint(etiquetaSlot1, product);
            }
          }
        } else {
          // Normal customer Consulta Preço: show big price and trigger auto-return timer
          triggerAutoReturn();
        }
      } catch (err) {
        setNotFound(true);
        triggerAutoReturn();
      } finally {
        setLoading(false);
        setManualInput('');
      }
    },
    [currentStoreId, modoEtiqueta, activeModel, activePrinter, etiquetaSlot1, triggerAutoReturn]
  );

  // Global Keydown Listener for USB Barcode Reader & F8 Shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Atalho Secreto: Ctrl + F12 para abrir o Painel Administrativo / Configurações
      if ((e.ctrlKey || e.metaKey) && (e.key === 'F12' || e.code === 'F12')) {
        e.preventDefault();
        e.stopPropagation();
        onOpenAdmin();
        return;
      }

      // Toggle Modo Etiqueta with F8
      if (e.key === 'F8') {
        e.preventDefault();
        setModoEtiqueta((prev) => {
          const next = !prev;
          // Clear slots when exiting or entering
          setEtiquetaSlot1(null);
          setEtiquetaSlot2(null);
          setPrintStatus({ status: 'idle', message: '' });
          resetToHome();
          return next;
        });
        return;
      }

      // Ignore other function keys
      if (e.key.startsWith('F') && e.key !== 'F8') {
        return;
      }

      // Check if user is typing in a modal or text input
      const activeElement = document.activeElement;
      const isInput =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement;

      // Allow barcode capture even if not focused on input
      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        e.preventDefault();
        // Dá prioridade total ao texto digitado no campo manualInput, sanitizando prefixo '_' do leitor
        let code = (manualInput || inputRef.current?.value || barcodeBufferRef.current || '').trim();
        code = code.replace(/^\][a-zA-Z0-9]{2}/, '').replace(/^_+|_+$/g, '').trim();
        barcodeBufferRef.current = '';
        if (code) {
          handleExecuteSearch(code);
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Leitor de código de barras USB digita em rajada super rápida (<60ms)
        if (timeDiff < 60) {
          barcodeBufferRef.current += e.key;
        } else {
          // Se for digitação lenta e não estiver no input, reinicia buffer
          barcodeBufferRef.current = e.key;
        }

        // Se o foco não estiver no input, sincroniza com o manualInput limpando prefixo '_' que certos leitores inserem
        if (!isInput) {
          // Atalho rápido: se usuário pressionar 'p' ou 'P' com produto na tela, abre impressão
          if ((e.key === 'p' || e.key === 'P' || e.key === 'F9') && currentProduct && !showPrintModal) {
            e.preventDefault();
            handleOpenPrintModal();
            return;
          }

          setManualInput((prev) => (prev + e.key).replace(/^_+/, ''));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [manualInput, handleExecuteSearch, resetToHome, onOpenAdmin, currentProduct, showPrintModal, handleOpenPrintModal]);

  const priceParts = currentProduct ? formatPrice(currentProduct.preco) : null;

  return (
    <div className="relative min-h-screen w-full bg-[#050b12] text-neutral-100 flex flex-col justify-between select-none overflow-hidden font-sans">
      {/* Supermarket Background (Supports Built-in or User Custom Image) */}
      <SupermarketKioskBackdrop customImage={customBackground} />

      {/* Barra Superior: Somente o Nome da Loja */}
      <header className="w-full py-2.5 px-6 bg-black/40 backdrop-blur-sm border-b border-neutral-800/40 flex items-center justify-center z-20 shrink-0">
        <h1 className="text-xs md:text-sm font-extrabold text-white uppercase tracking-wider text-center drop-shadow">
          {currentStoreName}
        </h1>
      </header>

      {/* Main Kiosk Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 relative max-w-7xl mx-auto w-full z-10">
        {/* Campo de Bipar (Largura reduzida em 25% para melhor proporção) */}
        <div className="w-full max-w-4xl px-2 mb-6 shrink-0 animate-fadeIn">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              let code = (manualInput || inputRef.current?.value || barcodeBufferRef.current || '').trim();
              code = code.replace(/^\][a-zA-Z0-9]{2}/, '').replace(/^_+|_+$/g, '').trim();
              barcodeBufferRef.current = '';
              if (code) handleExecuteSearch(code);
            }}
            className="relative flex items-center w-full shadow-[0_0_35px_rgba(34,242,180,0.35)] rounded-2xl bg-[#09111e]/95 border-2 border-[#22f2b4] hover:border-[#38f8bf] focus-within:border-[#22f2b4] focus-within:ring-2 focus-within:ring-[#22f2b4]/40 transition-all duration-200"
          >
            <div className="absolute left-5 flex items-center pointer-events-none text-slate-300">
              <Search className="w-6 h-6 stroke-[2]" />
            </div>
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={manualInput}
              onChange={(e) => {
                // Remove prefixo '_' na hora se o leitor enviar '_' antes do código
                const cleanVal = e.target.value.replace(/^_+/, '');
                setManualInput(cleanVal);
              }}
              onBlur={() => {
                setTimeout(() => {
                  const active = document.activeElement;
                  if (!active || active === document.body || active === document.documentElement) {
                    inputRef.current?.focus();
                  }
                }, 30);
              }}
              placeholder="Bipe o código de barras (EAN) ou digite o código interno..."
              className="w-full pl-15 pr-28 py-3.5 md:py-4 bg-transparent rounded-2xl text-base md:text-lg text-slate-100 font-mono tracking-wide focus:outline-none placeholder:text-slate-400"
            />
            <div className="absolute right-3.5 flex items-center gap-2">
              {loading ? (
                <RefreshCw className="w-5 h-5 text-[#22f2b4] animate-spin" />
              ) : (
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0e1a2d] hover:bg-[#162742] text-slate-200 rounded-lg border border-[#203657] text-xs font-mono font-bold tracking-wider shadow cursor-pointer transition active:scale-95"
                >
                  ENTER
                </button>
              )}
            </div>
          </form>

          {/* Subtext under Search Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-400 mt-2 px-2 gap-1.5">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#22f2b4] inline-block animate-pulse shadow-[0_0_8px_#22f2b4]" />
              Foco permanente no leitor USB (compatível com leitores com prefixo _ ou padrão).
            </span>
            <span className="font-mono text-emerald-400/90 hidden sm:inline text-[11px] font-semibold">
              Busca estrita: Código de Barras (EAN) · Código Interno
            </span>
          </div>
        </div>

        {/* State 1: Standby / Secondary Guide below Search Bar */}
        {!currentProduct && !notFound && (
          <div className="text-center flex flex-col items-center justify-center space-y-4 animate-fadeIn w-full py-4">
            {syncStatus && syncStatus.total_produtos_ativos === 0 && (
              <div className="bg-amber-950/80 border border-amber-500/50 rounded-2xl p-4 max-w-lg mx-auto text-amber-200 text-xs space-y-2 shadow-xl animate-fadeIn">
                <div className="font-bold text-sm flex items-center justify-center gap-2 text-amber-300">
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                  <span>Base de Dados em Nuvem sem Produtos Ativos</span>
                </div>
                <p>
                  A base de dados está pronta. Clique no botão <strong className="text-white bg-amber-900/80 px-2 py-0.5 rounded">⚡ Carga Instantânea</strong> no topo da tela para importar/sincronizar os produtos do seu PostgreSQL ou arquivo CSV/TXT do supermercado.
                </p>
                <button
                  type="button"
                  onClick={handleInstantLoadHeader}
                  disabled={runningInstantLoad}
                  className="mt-1 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-neutral-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 mx-auto cursor-pointer shadow transition"
                >
                  <Zap className={`w-4 h-4 ${runningInstantLoad ? 'animate-spin' : ''}`} />
                  <span>{runningInstantLoad ? 'Executando Carga...' : 'Executar Carga Instantânea Agora'}</span>
                </button>
              </div>
            )}

            {/* Minimalist Barcode Frame with red laser line */}
            <div className="w-18 h-18 rounded-2xl bg-neutral-900/90 border border-neutral-800 flex items-center justify-center relative overflow-hidden shadow-xl">
              <div className="relative w-8 h-8 flex items-center justify-center">
                {/* Corner Marks */}
                <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-[#22f2b4]" />
                <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-[#22f2b4]" />
                <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-[#22f2b4]" />
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-[#22f2b4]" />
                {/* Red Laser Bar */}
                <div className="w-full h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse" />
              </div>
            </div>

            {/* Typography */}
            <div className="space-y-1">
              <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white uppercase">
                Consulte o Preço
              </h2>
              <p className="text-sm md:text-base text-neutral-400 font-medium max-w-md mx-auto">
                Passe o código de barras no leitor ou digite o código do produto acima
              </p>
            </div>
          </div>
        )}

        {/* State 2: Product Found - Direto e sem o card maior pesado atrás */}
        {currentProduct && priceParts && (
          <div className="w-full max-w-4xl flex flex-col items-center justify-center text-center relative animate-fadeIn py-2 space-y-4">
            {/* Auto-return timer progress bar */}
            {!modoEtiqueta && (
              <div className="w-full max-w-3xl h-1.5 bg-neutral-800/80 rounded-full overflow-hidden shadow">
                <div
                  className="h-full bg-emerald-400 shadow-[0_0_10px_#22f2b4] transition-all duration-1000 ease-linear"
                  style={{ width: `${(autoReturnTimer / 5) * 100}%` }}
                />
              </div>
            )}

            {/* Product Header & Description */}
            <div className="space-y-2.5 w-full">
              <div className="flex flex-wrap items-center justify-center gap-2 text-neutral-300 text-xs md:text-sm font-mono tracking-wider">
                <span className="bg-[#09111e]/90 border border-slate-700/60 px-3 py-1 rounded-lg text-slate-200 font-semibold shadow">
                  CÓDIGO: {currentProduct.codigo_interno}
                </span>
                <span className="text-slate-600">·</span>
                <span className="bg-[#09111e]/90 border border-slate-700/60 px-3 py-1 rounded-lg text-slate-200 font-semibold shadow">
                  EAN: {currentProduct.codigo_barras}
                </span>
                {currentProduct.embalagem && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="bg-[#09111e]/90 border border-slate-700/60 px-3 py-1 rounded-lg text-emerald-400 uppercase font-semibold shadow">
                      EMBALAGEM: {currentProduct.embalagem}
                    </span>
                  </>
                )}
              </div>

              {/* Nome do Produto */}
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white uppercase tracking-tight max-w-3xl mx-auto leading-tight drop-shadow-md">
                {currentProduct.descricao}
              </h2>
            </div>

            {/* Preço Destacado em Amarelo Neon */}
            <div className="w-full max-w-3xl my-2 py-8 md:py-12 px-6 md:px-12 bg-[#09111e]/95 border-2 border-yellow-400/70 rounded-3xl flex items-baseline justify-center gap-2 md:gap-3 shadow-[0_0_70px_rgba(250,204,21,0.28)] relative overflow-hidden backdrop-blur-md">
              {/* Brilho neon de fundo */}
              <div className="absolute inset-0 bg-radial from-yellow-400/20 via-transparent to-transparent pointer-events-none" />

              <span className="text-4xl md:text-6xl lg:text-7xl font-black text-yellow-300 tracking-tight drop-shadow-[0_0_20px_rgba(250,204,21,0.6)]">
                {priceParts.cifrao}
              </span>
              <span className="text-8xl md:text-9xl lg:text-[11rem] font-black text-yellow-300 tracking-tighter leading-none select-all drop-shadow-[0_0_40px_rgba(250,204,21,0.7)]">
                {priceParts.reais}
              </span>
              <span className="text-5xl md:text-7xl lg:text-8xl font-black text-yellow-300 tracking-tight self-start mt-2 md:mt-4 drop-shadow-[0_0_25px_rgba(250,204,21,0.6)]">
                {priceParts.centavos}
              </span>
              {currentProduct.embalagem && (
                <span className="text-xl md:text-2xl font-bold text-slate-300 ml-2 md:ml-4 self-end mb-4 md:mb-6">
                  / {currentProduct.embalagem}
                </span>
              )}
            </div>

            {/* Bottom Status / Actions */}
            <div className="w-full max-w-3xl flex flex-wrap items-center justify-between gap-3 pt-2 text-xs md:text-sm text-neutral-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-neutral-300">Preço atualizado em {new Date(currentProduct.atualizado_em).toLocaleDateString('pt-BR')}</span>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap justify-center sm:justify-end">
                {/* BOTÃO PRINCIPAL DE IMPRIMIR ETIQUETA */}
                <button
                  type="button"
                  onClick={handleOpenPrintModal}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs md:text-sm shadow-lg shadow-emerald-950/60 flex items-center gap-2 transition cursor-pointer active:scale-95 border border-emerald-400/40"
                  title="Imprimir Etiqueta de Gôndola deste Produto (Atalho: tecla P)"
                >
                  <Printer className="w-4 h-4 md:w-5 md:h-5 text-emerald-200" />
                  <span>Imprimir Etiqueta</span>
                  <span className="hidden sm:inline px-1.5 py-0.5 bg-black/30 rounded text-[10px] text-emerald-300 font-mono">(P)</span>
                </button>

                {!modoEtiqueta ? (
                  <button
                    onClick={resetToHome}
                    className="px-4 py-2.5 bg-[#0e1a2d] hover:bg-[#162742] text-slate-200 border border-[#203657] rounded-xl text-xs font-semibold transition cursor-pointer shadow active:scale-95"
                  >
                    Nova Consulta ({autoReturnTimer}s)
                  </button>
                ) : (
                  <div className="text-amber-400 font-bold text-xs uppercase tracking-wide flex items-center gap-1.5 px-3 py-2 bg-amber-950/50 rounded-xl border border-amber-800">
                    <Printer className="w-4 h-4" />
                    Modo Etiqueta Ativo
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* State 3: Product Not Found */}
        {notFound && (
          <div className="w-full max-w-xl bg-neutral-900 border border-red-900/50 rounded-3xl p-8 md:p-10 shadow-2xl text-center space-y-6 animate-fadeIn">
            <div className="w-20 h-20 mx-auto rounded-full bg-red-950/50 border border-red-800/60 flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-red-400" />
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-black text-white uppercase tracking-tight">
                Produto Não Encontrado
              </h2>
              <p className="text-neutral-400 text-lg">
                O código <span className="font-mono text-red-400 font-bold">{searchedTerm}</span> não possui cadastro ativo nesta loja.
              </p>
              <p className="text-neutral-500 text-sm">
                Tente novamente ou procure auxílio com um funcionário.
              </p>
            </div>

            <button
              onClick={resetToHome}
              className="px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-sm font-semibold transition cursor-pointer"
            >
              Voltar à Tela Inicial ({autoReturnTimer}s)
            </button>
          </div>
        )}

        {/* MODO ETIQUETA OPERATIONAL HUD (When F8 is active) */}
        {modoEtiqueta && (
          <div className="mt-8 w-full max-w-3xl bg-neutral-900/90 border border-amber-500/40 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4 border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm tracking-wide">
                <Printer className="w-5 h-5" />
                <span>FLUXO OPERACIONAL DE ETIQUETAS</span>
              </div>
              <span className="text-xs text-neutral-400 bg-neutral-800 px-3 py-1 rounded">
                Modelo: {activeModel.nome} ({activeModel.produtos_por_etiqueta} produto{activeModel.produtos_por_etiqueta > 1 ? 's' : ''}/etiqueta)
              </span>
            </div>

            {/* 1-Product Model Flow */}
            {activeModel.produtos_por_etiqueta === 1 ? (
              <div className="text-sm text-neutral-300 space-y-1">
                <p className="font-medium text-emerald-400">
                  ✓ Modo 1 Produto: Bipa ou digita o código → Imprime imediatamente na Argox OS-214.
                </p>
                <p className="text-xs text-neutral-500">Sem confirmações ou diálogo de impressão.</p>
              </div>
            ) : (
              /* 2-Product Model Flow (Gôndola Dupla 100x30mm) */
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {/* Slot 1 */}
                  <div
                    className={`p-3 rounded-xl border ${
                      etiquetaSlot1
                        ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                    }`}
                  >
                    <div className="font-bold mb-1 flex items-center justify-between">
                      <span>PRODUTO 1 (Esquerda)</span>
                      {etiquetaSlot1 && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </div>
                    {etiquetaSlot1 ? (
                      <div>
                        <div className="font-semibold text-white truncate">{etiquetaSlot1.descricao}</div>
                        <div className="text-emerald-400 font-mono">
                          R$ {Number(etiquetaSlot1.preco).toFixed(2)} · Cód: {etiquetaSlot1.codigo_interno}
                        </div>
                      </div>
                    ) : (
                      <span className="italic text-neutral-500">Aguardando 1º bip/código...</span>
                    )}
                  </div>

                  {/* Slot 2 */}
                  <div
                    className={`p-3 rounded-xl border ${
                      etiquetaSlot2
                        ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200'
                        : etiquetaSlot1
                        ? 'bg-amber-950/40 border-amber-500 text-amber-200 animate-pulse'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                    }`}
                  >
                    <div className="font-bold mb-1 flex items-center justify-between">
                      <span>PRODUTO 2 (Direita)</span>
                      {etiquetaSlot2 && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </div>
                    {etiquetaSlot2 ? (
                      <div>
                        <div className="font-semibold text-white truncate">{etiquetaSlot2.descricao}</div>
                        <div className="text-emerald-400 font-mono">
                          R$ {Number(etiquetaSlot2.preco).toFixed(2)} · Cód: {etiquetaSlot2.codigo_interno}
                        </div>
                      </div>
                    ) : (
                      <span className="italic text-neutral-500">
                        {etiquetaSlot1 ? 'Bipe o 2º produto agora...' : 'Aguardando 1º produto...'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Cancel buffer button if needed */}
                {etiquetaSlot1 && !etiquetaSlot2 && (
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-amber-300">
                      1 de 2 produtos capturados. Uma etiqueta única física será impressa ao bipar o segundo.
                    </span>
                    <button
                      onClick={() => {
                        setEtiquetaSlot1(null);
                        setPrintStatus({ status: 'idle', message: '' });
                      }}
                      className="text-red-400 hover:underline cursor-pointer"
                    >
                      Cancelar Par
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Print Status Feedback */}
            {printStatus.message && (
              <div
                className={`mt-3 p-3 rounded-xl text-xs font-semibold flex items-center justify-between ${
                  printStatus.status === 'error'
                    ? 'bg-red-950/70 border border-red-800 text-red-200'
                    : printStatus.status === 'printing'
                    ? 'bg-blue-950/70 border border-blue-800 text-blue-200 animate-pulse'
                    : 'bg-emerald-950/70 border border-emerald-800 text-emerald-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4" />
                  <span>{printStatus.message}</span>
                </div>
                {printStatus.status === 'error' && (
                  <button
                    onClick={() => {
                      if (etiquetaSlot1) {
                        executeEtiquetaPrint(etiquetaSlot1, etiquetaSlot2 || undefined);
                      }
                    }}
                    className="px-3 py-1 bg-red-800 hover:bg-red-700 text-white rounded cursor-pointer"
                  >
                    Tentar Novamente
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer Info */}
      <footer className="w-full px-6 py-2.5 bg-black/60 backdrop-blur-md border-t border-neutral-900/80 text-xs text-neutral-400 flex flex-wrap items-center justify-between gap-3 z-10 relative">
        <div className="flex items-center gap-3">
          <span>Supermercado Sistema · Argox OS-214 Térmica (203 DPI)</span>
          <span className="text-neutral-600 hidden sm:inline">|</span>
          <button
            type="button"
            onClick={() => setShowSyncVerifier(true)}
            className="flex items-center gap-1.5 text-neutral-300 hover:text-emerald-300 transition cursor-pointer font-mono text-[11px]"
          >
            <Cloud className="w-3.5 h-3.5 text-emerald-400" />
            <span>Última Sincronização em Nuvem:</span>
            <strong className="text-emerald-400">
              {syncStatus?.ultima_sincronizacao_formatada || 'Aguardando'}
            </strong>
          </button>
        </div>
        <div className="flex items-center gap-1.5 font-medium text-neutral-300">
          <span>Desenvolvedor:</span>
          <span className="text-[#22f2b4] font-bold tracking-wide">Guel</span>
        </div>
      </footer>

      {/* Modal Verificador de Sincronização com a Nuvem */}
      {showSyncVerifier && (
        <VerificadorSincronizacao
          currentStoreId={currentStoreId}
          isModal={true}
          onClose={() => setShowSyncVerifier(false)}
        />
      )}

      {/* Modal de Impressão de Etiqueta para o Usuário */}
      {showPrintModal && currentProduct && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn text-neutral-100 font-sans">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8 max-w-lg w-full space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-bold text-white">
                    Imprimir Etiqueta de Gôndola
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Emissão para prateleiras e gôndolas da loja
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClosePrintModal}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Prévia Realista da Etiqueta Física (100×30 mm) */}
            <div className="bg-white text-black p-4 rounded-2xl shadow-inner border border-neutral-300 space-y-2 select-none">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono flex items-center justify-between border-b border-neutral-200 pb-1">
                <span>{currentStoreName}</span>
                <span>CÓD: {currentProduct.codigo_interno}</span>
              </div>
              <div className="font-black text-sm md:text-base leading-tight uppercase truncate">
                {currentProduct.descricao}
              </div>
              <div className="flex items-end justify-between pt-1">
                <div>
                  <div className="text-[10px] text-neutral-600 font-bold">PREÇO À VISTA</div>
                  <div className="text-2xl md:text-3xl font-black text-black leading-none">
                    R$ {Number(currentProduct.preco).toFixed(2).replace('.', ',')}
                    {currentProduct.embalagem && (
                      <span className="text-xs font-normal text-neutral-600 ml-1">
                        /{currentProduct.embalagem}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right font-mono text-[10px] text-neutral-700">
                  <div className="tracking-widest font-bold">||| | | |||| || | ||</div>
                  <div>{currentProduct.codigo_barras}</div>
                </div>
              </div>
            </div>

            {/* Controles: Quantidade e Impressora */}
            <div className="space-y-4 text-xs">
              <div>
                <label className="text-neutral-300 font-semibold block mb-1.5">
                  Quantidade de Cópias:
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPrintQuantity((q) => Math.max(1, q - 1))}
                      className="px-3 py-2 text-neutral-300 hover:text-white hover:bg-neutral-700 cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="px-4 py-2 font-mono font-bold text-base text-white min-w-[40px] text-center">
                      {printQuantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPrintQuantity((q) => q + 1)}
                      className="px-3 py-2 text-neutral-300 hover:text-white hover:bg-neutral-700 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Botões rápidos de quantidade */}
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 5, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setPrintQuantity(num)}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer ${
                          printQuantity === num
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700'
                        }`}
                      >
                        {num}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-neutral-300 font-semibold block mb-1.5">
                  Impressora Selecionada:
                </label>
                <select
                  value={selectedPrinterForJob?.id || activePrinter.id}
                  onChange={(e) => {
                    const list = printers && printers.length > 0 ? printers : [activePrinter];
                    const match = list.find((p) => p.id === e.target.value);
                    if (match) setSelectedPrinterForJob(match);
                  }}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-white font-semibold focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {(printers && printers.length > 0 ? printers : [activePrinter]).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} ({p.porta} · {p.linguagem})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Feedback Message */}
            {jobFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-fadeIn ${
                  jobFeedback.success
                    ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
                    : 'bg-red-950/80 border-red-500 text-red-200'
                }`}
              >
                {jobFeedback.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{jobFeedback.message}</span>
              </div>
            )}

            {/* Ações */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={handlePrintBrowser}
                className="w-full sm:w-auto px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer border border-neutral-700"
                title="Imprime a etiqueta usando o diálogo de impressão do navegador ou gera PDF"
              >
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>Imprimir no Navegador (PDF)</span>
              </button>

              <button
                type="button"
                onClick={handlePrintThermal}
                disabled={isSendingJob}
                className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow shadow-emerald-950/50 disabled:opacity-50"
              >
                <Printer className={`w-4 h-4 ${isSendingJob ? 'animate-spin' : ''}`} />
                <span>{isSendingJob ? 'Enviando...' : `Imprimir ${printQuantity}x na Térmica`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Area for window.print() */}
      {currentProduct && (
        <div className="hidden print:block print:fixed print:top-0 print:left-0 print:w-[100mm] print:h-[30mm] print:p-2 print:bg-white print:text-black">
          <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}>
            {currentStoreName}
          </div>
          <div style={{ fontSize: '12px', fontWeight: 'bold', margin: '2px 0' }}>
            {currentProduct.descricao}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '4px' }}>
            <div style={{ fontSize: '20px', fontWeight: '900' }}>
              R$ {Number(currentProduct.preco).toFixed(2).replace('.', ',')}
            </div>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', textAlign: 'right' }}>
              <div>* {currentProduct.codigo_barras} *</div>
              <div>Cód: {currentProduct.codigo_interno}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
