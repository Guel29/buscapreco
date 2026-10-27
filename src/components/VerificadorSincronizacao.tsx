import React, { useState, useEffect, useRef } from 'react';
import { SyncVerificationData } from '../types';
import { localDB } from '../services/storage';
import {
  fetchSyncVerification,
  testProductSync,
  triggerInstantLoad,
  syncBatchProducts,
  wipeAllProducts,
  upsertSingleProduct,
} from '../services/api';
import { formatDateTimeBR } from '../utils/date';
import {
  Cloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  Calendar,
  Database,
  Search,
  Check,
  X,
  Server,
  Package,
  Layers,
  Activity,
  ArrowRight,
  ShieldCheck,
  Zap,
  Upload,
  FileText,
  Trash2,
  PlusCircle,
  Download,
  AlertTriangle,
} from 'lucide-react';

interface VerificadorSincronizacaoProps {
  currentStoreId: number;
  onClose?: () => void;
  isModal?: boolean;
}

export const VerificadorSincronizacao: React.FC<VerificadorSincronizacaoProps> = ({
  currentStoreId,
  onClose,
  isModal = false,
}) => {
  const [data, setData] = useState<SyncVerificationData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [runningInstantLoad, setRunningInstantLoad] = useState<boolean>(false);
  const [instantLoadMessage, setInstantLoadMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [testQuery, setTestQuery] = useState<string>('');
  const [testingProduct, setTestingProduct] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any>(null);

  // File Import State (CSV / TXT / Export ERP)
  const [importOpen, setImportOpen] = useState<boolean>(false);
  const [parsedItems, setParsedItems] = useState<any[]>([]);
  const [importing, setImporting] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Single Product Quick Add State
  const [quickAddOpen, setQuickAddOpen] = useState<boolean>(false);
  const [quickProduct, setQuickProduct] = useState({
    codigo_interno: '',
    codigo_barras: '',
    descricao: '',
    preco: '',
    embalagem: 'UN',
    ncm: '00000000',
  });
  const [savingProduct, setSavingProduct] = useState<boolean>(false);

  // Wipe status
  const [wiping, setWiping] = useState<boolean>(false);

  const loadVerification = async (showRefreshAnimation = false) => {
    if (showRefreshAnimation) setRefreshing(true);
    else setLoading(true);

    try {
      const result = await fetchSyncVerification(currentStoreId);
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleExecuteInstantLoad = async () => {
    setRunningInstantLoad(true);
    setInstantLoadMessage(null);
    try {
      const res = await triggerInstantLoad(currentStoreId);
      if (res.success) {
        setInstantLoadMessage({
          success: true,
          text: `⚡ Sincronização executada com sucesso às ${formatDateTimeBR(res.ultima_sincronizacao || new Date().toISOString())}! Total de produtos ativos: ${res.total_ativos || data?.total_produtos_ativos || 0}.`,
        });
        await loadVerification(false);
      } else {
        setInstantLoadMessage({
          success: false,
          text: res.message || 'Falha ao sincronizar.',
        });
      }
    } catch (err: any) {
      setInstantLoadMessage({
        success: false,
        text: 'Erro ao executar sincronização: ' + err.message,
      });
    } finally {
      setRunningInstantLoad(false);
      setTimeout(() => setInstantLoadMessage(null), 8000);
    }
  };

  const handleWipeProducts = async () => {
    if (
      !window.confirm(
        'Tem certeza que deseja ZERAR todos os produtos cadastrados?\n\nEsta ação limpará itens de teste para você sincronizar os produtos reais do supermercado.'
      )
    ) {
      return;
    }

    setWiping(true);
    try {
      const res = await wipeAllProducts(currentStoreId);
      setInstantLoadMessage({
        success: true,
        text: res.message || 'Base zerada com sucesso! Todos os produtos foram removidos.',
      });
      await loadVerification(false);
    } catch (e: any) {
      setInstantLoadMessage({
        success: false,
        text: 'Erro ao zerar base: ' + e.message,
      });
    } finally {
      setWiping(false);
      setTimeout(() => setInstantLoadMessage(null), 8000);
    }
  };

  // Helper to parse price string safely
  const parsePrice = (raw: string | number | undefined): number => {
    if (raw === undefined || raw === null) return 0;
    if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
    const clean = String(raw).replace(/[R$\s]/g, '').trim();
    if (!clean) return 0;
    // Handle Brazilian format 1.250,50 vs 1250.50
    if (clean.includes(',') && clean.includes('.')) {
      if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
        return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
      } else {
        return parseFloat(clean.replace(/,/g, '')) || 0;
      }
    } else if (clean.includes(',')) {
      return parseFloat(clean.replace(',', '.')) || 0;
    }
    return parseFloat(clean) || 0;
  };

  // Parse CSV/TXT file with intelligent column mapping (VR Software / PostgreSQL / SysPDV / Balança)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        let text = event.target?.result as string;
        // Strip BOM if present
        if (text.charCodeAt(0) === 0xFEFF) {
          text = text.substring(1);
        }

        const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
        if (rawLines.length === 0) {
          alert('O arquivo selecionado está vazio.');
          return;
        }

        const items: any[] = [];
        const firstLine = rawLines[0];

        // 1. Detect separator (; or | or \t or ,)
        let sep = ';';
        const countPipes = (firstLine.match(/\|/g) || []).length;
        const countSemicolons = (firstLine.match(/;/g) || []).length;
        const countTabs = (firstLine.match(/\t/g) || []).length;
        const countCommas = (firstLine.match(/,/g) || []).length;

        if (countPipes >= countSemicolons && countPipes >= countTabs && countPipes >= countCommas && countPipes > 0) {
          sep = '|';
        } else if (countSemicolons >= countTabs && countSemicolons >= countCommas && countSemicolons > 0) {
          sep = ';';
        } else if (countTabs >= countCommas && countTabs > 0) {
          sep = '\t';
        } else if (countCommas > 0) {
          sep = ',';
        }

        const firstParts = firstLine.split(sep).map((p) => p.trim().replace(/^["']|["']$/g, '').toLowerCase());
        
        // 2. Detect Header columns
        let colCodInt = -1;
        let colCodBar = -1;
        let colDesc = -1;
        let colPreco = -1;
        let colEmb = -1;
        let colNcm = -1;

        firstParts.forEach((header, idx) => {
          const norm = header.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (norm.includes('interno') || norm === 'id_produto' || norm === 'codigo' || norm === 'cod' || norm === 'id' || norm === 'codigo interno') {
            if (colCodInt === -1) colCodInt = idx;
          } else if (norm.includes('barra') || norm.includes('ean') || norm.includes('gtin') || norm === 'codigobarras' || norm === 'codigo de barras') {
            if (colCodBar === -1) colCodBar = idx;
          } else if (norm.includes('produto') || norm.includes('descri') || norm.includes('nome') || norm === 'descricao') {
            if (colDesc === -1) colDesc = idx;
          } else if (norm.includes('preco') || norm.includes('valor') || norm.includes('venda') || norm === 'precovenda') {
            if (colPreco === -1) colPreco = idx;
          } else if (norm.includes('embalag') || norm.includes('unid') || norm === 'emb' || norm === 'tipoembalagem') {
            if (colEmb === -1) colEmb = idx;
          } else if (norm.includes('ncm') || norm.includes('sh')) {
            if (colNcm === -1) colNcm = idx;
          }
        });

        const hasDetectedHeader = colDesc >= 0 || (colPreco >= 0 && (colCodInt >= 0 || colCodBar >= 0));
        const startIndex = hasDetectedHeader ? 1 : 0;

        for (let i = startIndex; i < rawLines.length; i++) {
          const line = rawLines[i];
          const parts = line.split(sep).map((p) => p.trim().replace(/^["']|["']$/g, ''));
          if (parts.length < 2 && !hasDetectedHeader) continue;

          let codInt = '';
          let codBar = '';
          let desc = '';
          let preco = 0;
          let emb = 'UN';
          let ncm = '00000000';

          if (hasDetectedHeader) {
            if (colCodInt >= 0 && parts[colCodInt]) codInt = parts[colCodInt];
            if (colCodBar >= 0 && parts[colCodBar]) codBar = parts[colCodBar];
            if (colDesc >= 0 && parts[colDesc]) desc = parts[colDesc];
            if (colPreco >= 0 && parts[colPreco]) preco = parsePrice(parts[colPreco]);
            if (colEmb >= 0 && parts[colEmb]) emb = parts[colEmb] || 'UN';
            if (colNcm >= 0 && parts[colNcm]) ncm = parts[colNcm] || '00000000';
          } else {
            // Intelligent heuristic without header
            // Order 1: VR Software export format: [0] Codigo Interno, [1] Produto, [2] Codigo de Barras, [3] Embalagem, [4] Preco Venda
            if (parts.length >= 5) {
              const isPart1Text = /[a-zA-Z]/.test(parts[1]);
              const isPart2Barcode = /^\d{7,14}$/.test(parts[2]);
              if (isPart1Text && (isPart2Barcode || parts[2].length >= 7)) {
                codInt = parts[0];
                desc = parts[1];
                codBar = parts[2];
                emb = parts[3] || 'UN';
                preco = parsePrice(parts[4]);
              } else {
                // Generic format: [0] Codigo Interno, [1] Codigo Barras, [2] Descricao, [3] Preco, [4] Embalagem
                codInt = parts[0];
                codBar = parts[1] || parts[0];
                desc = parts[2];
                preco = parsePrice(parts[3]);
                emb = parts[4] || 'UN';
              }
            } else if (parts.length === 4) {
              // [0] Codigo, [1] Barras, [2] Descricao, [3] Preco OR [0] Codigo, [1] Descricao, [2] Preco, [3] Embalagem
              if (/[a-zA-Z]/.test(parts[1])) {
                codInt = parts[0];
                desc = parts[1];
                preco = parsePrice(parts[2]);
                emb = parts[3] || 'UN';
                codBar = parts[0];
              } else {
                codInt = parts[0];
                codBar = parts[1];
                desc = parts[2];
                preco = parsePrice(parts[3]);
              }
            } else if (parts.length === 3) {
              // [0] EAN/Cod, [1] Descricao, [2] Preco
              codBar = parts[0];
              codInt = parts[0];
              desc = parts[1];
              preco = parsePrice(parts[2]);
            } else if (parts.length === 2) {
              codBar = parts[0];
              codInt = parts[0];
              desc = parts[1];
              preco = 0;
            }
          }

          if (!desc) {
            // Fallback: locate longest string
            for (const p of parts) {
              if (p.length > desc.length && /[a-zA-Z]/.test(p)) desc = p;
            }
          }

          if (!codBar && !codInt) {
            for (const p of parts) {
              if (/^\d{7,14}$/.test(p)) {
                codBar = p;
                break;
              }
            }
          }

          if (desc && (codInt || codBar)) {
            const finalInt = (codInt || codBar).replace(/^_+|_+$/g, '').trim();
            const finalBar = (codBar || codInt).replace(/^_+|_+$/g, '').trim();
            items.push({
              codigo_interno: finalInt,
              codigo_barras: finalBar,
              descricao: desc.trim().toUpperCase(),
              produto: desc.trim().toUpperCase(),
              preco: preco,
              preco_venda: preco,
              embalagem: (emb || 'UN').trim().toUpperCase(),
              ncm: ncm || '00000000',
              id_loja: currentStoreId,
              ativo: true,
            });
          }
        }

        setParsedItems(items);
        setImportStatus(`✅ ${items.length} produtos válidos identificados no arquivo com mapeamento correto.`);
      } catch (err: any) {
        alert('Erro ao processar arquivo: ' + err.message);
      }
    };
    reader.readAsText(file, 'ISO-8859-1');
  };

  const handleSendImportedProducts = async () => {
    if (parsedItems.length === 0) return;
    setImporting(true);
    setImportStatus(`Iniciando sincronização de ${parsedItems.length} produtos para o MySQL em nuvem...`);

    try {
      const chunkSize = 300;
      let totalSaved = 0;
      const totalLotes = Math.ceil(parsedItems.length / chunkSize);

      let lastBatchError = '';

      for (let i = 0; i < parsedItems.length; i += chunkSize) {
        const chunk = parsedItems.slice(i, i + chunkSize);
        const loteNum = Math.floor(i / chunkSize) + 1;
        setImportStatus(`Enviando Lote ${loteNum} de ${totalLotes} (${totalSaved}/${parsedItems.length} produtos gravados)...`);

        let attempts = 0;
        let success = false;
        let lastErr = '';

        while (attempts < 3 && !success) {
          attempts++;
          try {
            const res = await syncBatchProducts(chunk, currentStoreId, false);
            if (res.success || res.total_processados !== undefined || res.adicionados !== undefined || res.total_gravados !== undefined) {
              success = true;
              totalSaved += chunk.length;
            } else {
              lastErr = res.message || res.error || 'Falha no lote';
              if (attempts < 3) await new Promise((r) => setTimeout(r, 1000));
            }
          } catch (e: any) {
            lastErr = e.message;
            if (attempts < 3) await new Promise((r) => setTimeout(r, 1000));
          }
        }

        if (!success) {
          lastBatchError = lastErr;
          console.warn(`Aviso no Lote ${loteNum}: ${lastErr}`);
        }
      }

      // Sincroniza também no cache local IndexedDB para resposta ultra-rápida offline no Kiosk
      try {
        const formattedProducts = parsedItems.map((p, idx) => ({
          id: `${currentStoreId}_${p.codigo_interno}_${p.codigo_barras}_${idx}`,
          id_loja: currentStoreId,
          codigo_interno: p.codigo_interno,
          codigo_barras: p.codigo_barras,
          descricao: p.descricao,
          produto: p.descricao,
          preco: p.preco,
          preco_venda: p.preco,
          embalagem: p.embalagem,
          ncm: p.ncm || '00000000',
          ativo: true,
          ultima_sincronizacao: new Date().toISOString(),
        }));
        await localDB.saveProducts(formattedProducts as any);
      } catch (cacheErr) {
        console.warn('Erro ao salvar no cache local:', cacheErr);
      }

      if (totalSaved > 0) {
        setInstantLoadMessage({
          success: true,
          text: `✅ Sucesso! ${totalSaved} produtos gravados com sucesso no banco MySQL da Hostinger e no terminal de busca!`,
        });
      } else if (lastBatchError) {
        setInstantLoadMessage({
          success: false,
          text: `⚠️ Produtos salvos no cache local do terminal! Porém a gravação no MySQL em nuvem retornou: "${lastBatchError}". Verifique as credenciais na aba "Banco MySQL Hostinger".`,
        });
      } else {
        setInstantLoadMessage({
          success: true,
          text: `✅ ${parsedItems.length} produtos importados e prontos para consulta no terminal!`,
        });
      }

      setParsedItems([]);
      setImportOpen(false);
      await loadVerification(false);
    } catch (e: any) {
      setImportStatus('Erro durante o envio: ' + e.message);
    } finally {
      setImporting(false);
      setTimeout(() => setInstantLoadMessage(null), 10000);
    }
  };

  const handleSaveQuickProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickProduct.descricao || (!quickProduct.codigo_interno && !quickProduct.codigo_barras)) {
      alert('Preencha a descrição e pelo menos um código.');
      return;
    }

    setSavingProduct(true);
    try {
      const priceNum = parseFloat(quickProduct.preco.replace(',', '.')) || 0;
      const res = await upsertSingleProduct({
        codigo_interno: quickProduct.codigo_interno || quickProduct.codigo_barras,
        codigo_barras: quickProduct.codigo_barras || quickProduct.codigo_interno,
        descricao: quickProduct.descricao,
        preco: priceNum,
        embalagem: quickProduct.embalagem || 'UN',
        ncm: quickProduct.ncm || '00000000',
        id_loja: currentStoreId,
      });

      if (res.success) {
        setInstantLoadMessage({
          success: true,
          text: `✅ Produto "${quickProduct.descricao}" salvo com sucesso no banco de dados!`,
        });
        setQuickProduct({
          codigo_interno: '',
          codigo_barras: '',
          descricao: '',
          preco: '',
          embalagem: 'UN',
          ncm: '00000000',
        });
        setQuickAddOpen(false);
        await loadVerification(false);
      } else {
        alert(res.message || 'Erro ao salvar produto.');
      }
    } catch (err: any) {
      alert('Erro: ' + err.message);
    } finally {
      setSavingProduct(false);
    }
  };

  useEffect(() => {
    loadVerification();
    const interval = setInterval(() => {
      loadVerification(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [currentStoreId]);

  const handleTestProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQuery.trim()) return;

    setTestingProduct(true);
    setTestResult(null);
    try {
      const res = await testProductSync(testQuery.trim(), currentStoreId);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        mensagem: 'Erro ao testar produto: ' + err.message,
      });
    } finally {
      setTestingProduct(false);
    }
  };

  const content = (
    <div className="space-y-6 text-neutral-100 font-sans">
      {/* Top Header / Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Sincronizador & Carga de Produtos
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Central de sincronização dos produtos reais do supermercado para o banco de dados na nuvem (Hostinger).
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExecuteInstantLoad}
            disabled={runningInstantLoad}
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-neutral-950 text-xs font-black rounded-xl transition cursor-pointer flex items-center gap-2 shadow-[0_0_20px_rgba(34,242,180,0.35)] disabled:opacity-50"
            title="Executa a sincronização imediata dos produtos reais"
          >
            <Zap className={`w-4 h-4 ${runningInstantLoad ? 'animate-spin' : ''}`} />
            <span>{runningInstantLoad ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
          </button>

          <button
            onClick={() => loadVerification(true)}
            disabled={refreshing}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-xl border border-neutral-700 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-400 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Verificando...' : 'Verificar Status'}</span>
          </button>

          <button
            type="button"
            onClick={handleWipeProducts}
            disabled={wiping}
            className="px-3.5 py-2 bg-red-950/40 hover:bg-red-900/60 text-red-300 text-xs font-bold rounded-xl border border-red-500/30 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            title="Remove produtos para deixar a base 100% limpa para sincronização real"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
            <span>{wiping ? 'Limpando...' : 'Zerar Base'}</span>
          </button>

          {isModal && onClose && (
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 cursor-pointer transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Instant Load Feedback Toast */}
      {instantLoadMessage && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center gap-3 animate-fadeIn ${
            instantLoadMessage.success
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200 shadow-[0_0_25px_rgba(34,242,180,0.25)]'
              : 'bg-red-950/80 border-red-500/50 text-red-200'
          }`}
        >
          {instantLoadMessage.success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <span>{instantLoadMessage.text}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
          <p className="text-sm text-neutral-400 font-medium">Conectando ao banco de dados MySQL...</p>
        </div>
      ) : (
        <>
          {/* Main Hero Card: Date, Time and Sync Health Status */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950/70 via-neutral-900 to-neutral-900 border border-emerald-500/40 p-6 md:p-8 shadow-2xl space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              {/* Left: Big Status & Sync Date/Time */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-3.5 w-3.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-bold tracking-widest uppercase text-emerald-400 font-mono bg-emerald-950/80 px-3 py-1 rounded-full border border-emerald-500/40">
                    {data?.status === 'SINCRONIZADO' ? 'BANCO ATIVO & CONECTADO' : 'AGUARDANDO SINCRONIZAÇÃO'}
                  </span>
                  <span className="text-xs text-neutral-400 font-mono">
                    Loja {data?.id_loja || currentStoreId}
                  </span>
                </div>

                {/* Highlighted Last Sync Date & Time */}
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-emerald-400" />
                    <span>Data e Hora da Última Sincronização:</span>
                  </div>
                  <div className="text-2xl sm:text-3xl md:text-4xl font-black text-white font-mono tracking-tight flex items-baseline gap-3 flex-wrap">
                    <span className="text-emerald-300 drop-shadow-[0_0_15px_rgba(34,242,180,0.3)]">
                      {data?.ultima_sincronizacao_formatada || 'Aguardando primeiro envio'}
                    </span>
                    {data?.tempo_relativo && (
                      <span className="text-xs sm:text-sm font-sans font-semibold text-neutral-400 bg-neutral-800/80 px-2.5 py-1 rounded-lg border border-neutral-700">
                        {data.tempo_relativo}
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-neutral-300 leading-relaxed max-w-2xl">
                  {data?.status_mensagem || 'Sincronização configurada para manter os preços da nuvem idênticos ao supermercado.'}
                </p>
              </div>

              {/* Right: Active / Inactive Product Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3 shrink-0">
                <div className="bg-neutral-950/80 border border-emerald-500/30 rounded-2xl p-4 text-center">
                  <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                    Produtos Ativos (Nuvem)
                  </div>
                  <div className="text-2xl md:text-3xl font-black text-emerald-400 font-mono">
                    {data?.total_produtos_ativos || 0}
                  </div>
                  <div className="text-[10px] text-emerald-500 font-medium mt-0.5 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Visíveis no Busca Preço
                  </div>
                </div>

                <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 text-center">
                  <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                    Produtos Inativos
                  </div>
                  <div className="text-2xl md:text-3xl font-black text-neutral-400 font-mono">
                    {data?.total_produtos_inativos || 0}
                  </div>
                  <div className="text-[10px] text-neutral-500 font-medium mt-0.5">
                    Bloqueados no Kiosk
                  </div>
                </div>

                <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 text-center sm:col-span-1 lg:col-span-2">
                  <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                    Total no MySQL
                  </div>
                  <div className="text-xl font-bold text-white font-mono">
                    {data?.total_produtos_nuvem || 0} itens
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action Bar for Sincronização */}
            <div className="pt-4 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setImportOpen(!importOpen)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <span>Importar Arquivo ERP (CSV / TXT)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickAddOpen(!quickAddOpen)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4 text-purple-400" />
                  <span>Cadastrar / Alterar Produto Manual</span>
                </button>
              </div>

              <div className="text-xs text-neutral-400 font-mono flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Próximo ciclo automático: a cada 10 min</span>
              </div>
            </div>
          </div>

          {/* Quick Import Drawer / Card */}
          {importOpen && (
            <div className="bg-neutral-900 border border-cyan-500/40 rounded-3xl p-6 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Upload className="w-5 h-5 text-cyan-400" />
                    Importação e Sincronização Direta de Arquivo (CSV / TXT)
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Envie a planilha ou exportação de produtos do seu sistema de supermercado para sincronizar diretamente no banco de dados.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.txt,.tsv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl border border-neutral-700 transition cursor-pointer flex items-center gap-2 shrink-0"
                >
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span>Selecionar Arquivo do Supermercado (.CSV / .TXT)</span>
                </button>

                <div className="text-xs text-neutral-400 font-mono truncate flex-1">
                  {importStatus || 'Formatos aceitos: Código; Código de Barras; Descrição; Preço; Embalagem'}
                </div>

                {parsedItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSendImportedProducts}
                    disabled={importing}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-neutral-950 text-xs font-black rounded-xl transition cursor-pointer flex items-center gap-2 shadow-lg disabled:opacity-50 shrink-0"
                  >
                    <Zap className={`w-4 h-4 ${importing ? 'animate-spin' : ''}`} />
                    <span>{importing ? 'Sincronizando...' : `Sincronizar ${parsedItems.length} Produtos`}</span>
                  </button>
                )}
              </div>

              {parsedItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-neutral-300">
                    <span>Prévia dos primeiros {Math.min(parsedItems.length, 8)} produtos identificados no arquivo:</span>
                    <span className="text-emerald-400 font-mono">Total de {parsedItems.length} produtos prontos para gravar</span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-neutral-900 text-neutral-400 border-b border-neutral-800 text-[10px]">
                        <tr>
                          <th className="p-2.5">Cód. Interno</th>
                          <th className="p-2.5">Código de Barras (EAN)</th>
                          <th className="p-2.5">Descrição do Produto</th>
                          <th className="p-2.5 text-right">Preço de Venda</th>
                          <th className="p-2.5">Emb.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800 text-neutral-300">
                        {parsedItems.slice(0, 8).map((item, idx) => (
                          <tr key={idx} className="hover:bg-neutral-900/50">
                            <td className="p-2.5 text-cyan-400 font-bold">{item.codigo_interno}</td>
                            <td className="p-2.5 text-neutral-200">{item.codigo_barras}</td>
                            <td className="p-2.5 text-white font-medium">{item.descricao}</td>
                            <td className="p-2.5 text-right text-emerald-400 font-bold">R$ {Number(item.preco).toFixed(2)}</td>
                            <td className="p-2.5 text-neutral-400">{item.embalagem}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Add Product Card */}
          {quickAddOpen && (
            <form onSubmit={handleSaveQuickProduct} className="bg-neutral-900 border border-purple-500/40 rounded-3xl p-6 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <PlusCircle className="w-5 h-5 text-purple-400" />
                    Cadastrar ou Atualizar Preço Manual
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Insira um produto diretamente no banco MySQL da nuvem.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickAddOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-neutral-400 mb-1 font-semibold">Código de Barras (EAN):</label>
                  <input
                    type="text"
                    value={quickProduct.codigo_barras}
                    onChange={(e) => setQuickProduct({ ...quickProduct, codigo_barras: e.target.value })}
                    placeholder="Ex: 7891000100103"
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-white font-mono focus:border-purple-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1 font-semibold">Código Interno ERP:</label>
                  <input
                    type="text"
                    value={quickProduct.codigo_interno}
                    onChange={(e) => setQuickProduct({ ...quickProduct, codigo_interno: e.target.value })}
                    placeholder="Ex: 1042"
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-white font-mono focus:border-purple-400 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-neutral-400 mb-1 font-semibold">Descrição do Produto:</label>
                  <input
                    type="text"
                    value={quickProduct.descricao}
                    onChange={(e) => setQuickProduct({ ...quickProduct, descricao: e.target.value })}
                    placeholder="Ex: ARROZ TIPO 1 5KG"
                    required
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-white focus:border-purple-400 focus:outline-none uppercase"
                  />
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1 font-semibold">Preço de Venda (R$):</label>
                  <input
                    type="text"
                    value={quickProduct.preco}
                    onChange={(e) => setQuickProduct({ ...quickProduct, preco: e.target.value })}
                    placeholder="Ex: 24.90"
                    required
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-emerald-400 font-mono font-bold focus:border-purple-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1 font-semibold">Embalagem:</label>
                  <select
                    value={quickProduct.embalagem}
                    onChange={(e) => setQuickProduct({ ...quickProduct, embalagem: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-white focus:border-purple-400 focus:outline-none"
                  >
                    <option value="UN">UN - Unidade</option>
                    <option value="KG">KG - Quilo</option>
                    <option value="PC">PC - Pacote</option>
                    <option value="CX">CX - Caixa</option>
                    <option value="FD">FD - Fardo</option>
                    <option value="LT">LT - Lata</option>
                  </select>
                </div>

                <div className="sm:col-span-2 flex items-end">
                  <button
                    type="submit"
                    disabled={savingProduct}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>{savingProduct ? 'Salvando...' : 'Salvar no Banco de Dados'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Test Tool: Verify a Specific Product in Cloud */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Search className="w-5 h-5 text-cyan-400" />
                Testar se um Produto Específico já está na Nuvem
              </h3>
              <p className="text-xs text-neutral-400">
                Digite um código de barras (EAN) ou código interno para checar em tempo real se o item foi recebido pela nuvem, seu preço e status no terminal.
              </p>
            </div>

            <form onSubmit={handleTestProduct} className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  placeholder="Ex: 7891000100103 (EAN) ou 123 (Código Interno)..."
                  className="w-full pl-4 pr-10 py-3 bg-neutral-950 border border-neutral-700 rounded-2xl text-sm font-mono text-white placeholder:text-neutral-500 focus:outline-none focus:border-cyan-400"
                />
                {testQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setTestQuery('');
                      setTestResult(null);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={testingProduct || !testQuery.trim()}
                className="px-5 py-3 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-2xl flex items-center gap-2 transition cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Search className={`w-4 h-4 ${testingProduct ? 'animate-spin' : ''}`} />
                <span>{testingProduct ? 'Consultando...' : 'Testar Produto'}</span>
              </button>
            </form>

            {/* Test Result Display */}
            {testResult && (
              <div
                className={`p-5 rounded-2xl border transition-all animate-fadeIn ${
                  testResult.encontrado && testResult.ativo !== false
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-100'
                    : testResult.encontrado && testResult.ativo === false
                    ? 'bg-amber-950/40 border-amber-500/40 text-amber-100'
                    : 'bg-red-950/40 border-red-500/40 text-red-100'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {testResult.encontrado && testResult.ativo !== false ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : testResult.encontrado && testResult.ativo === false ? (
                        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                      )}
                      <span className="text-sm font-bold tracking-wide">
                        {testResult.encontrado && testResult.ativo !== false
                          ? 'PRODUTO SINCRONIZADO E ATIVO NA NUVEM!'
                          : testResult.encontrado && testResult.ativo === false
                          ? 'PRODUTO NA NUVEM, MAS MARCADO COMO INATIVO'
                          : 'PRODUTO NÃO ENCONTRADO NA NUVEM'}
                      </span>
                    </div>

                    <p className="text-xs text-neutral-300 leading-relaxed">
                      {testResult.mensagem}
                    </p>

                    {testResult.encontrado && testResult.produto && (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/40 p-3.5 rounded-xl text-xs font-mono border border-white/10">
                        <div>
                          <div className="text-[10px] text-neutral-400">PRODUTO:</div>
                          <div className="font-bold text-white truncate">{testResult.produto.descricao}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-neutral-400">PREÇO DE VENDA:</div>
                          <div className="font-bold text-emerald-400">R$ {Number(testResult.produto.preco || testResult.produto.preco_venda).toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-neutral-400">EAN / CÓDIGO:</div>
                          <div className="font-bold text-neutral-200">{testResult.produto.codigo_barras || testResult.produto.codigo_interno}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-neutral-400">ÚLTIMA SINCRONIZAÇÃO:</div>
                          <div className="font-bold text-cyan-300">{testResult.produto.ultima_sincronizacao_formatada || 'Registrado'}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Recently Synced Products in Cloud */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-emerald-400" />
                  Últimos Produtos Sincronizados na Nuvem
                </h3>
                <p className="text-xs text-neutral-400">
                  Mostrando os itens mais recentes com confirmação de status e data/hora.
                </p>
              </div>
              <span className="text-xs font-mono text-neutral-400">
                {data?.ultimos_produtos_sincronizados?.length || 0} produtos listados
              </span>
            </div>

            {(!data?.ultimos_produtos_sincronizados || data.ultimos_produtos_sincronizados.length === 0) ? (
              <div className="p-8 text-center bg-neutral-950 rounded-2xl border border-neutral-800 text-neutral-400 text-xs">
                Nenhum produto cadastrado na base de dados ainda. Importe seu arquivo CSV/TXT ou execute o sincronizador local no servidor.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-900/90 text-neutral-400 font-mono border-b border-neutral-800 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Cód. Interno</th>
                      <th className="p-3">Código de Barras</th>
                      <th className="p-3">Produto / Descrição</th>
                      <th className="p-3">Embalagem</th>
                      <th className="p-3 text-right">Preço de Venda</th>
                      <th className="p-3 text-center">Situação</th>
                      <th className="p-3 text-right">Data & Hora Sincronização</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800 font-mono text-neutral-300">
                    {data.ultimos_produtos_sincronizados.map((prod, idx) => (
                      <tr key={`${prod.codigo_interno}-${prod.codigo_barras}-${idx}`} className="hover:bg-neutral-900/60 transition">
                        <td className="p-3 font-bold text-emerald-400">{prod.codigo_interno}</td>
                        <td className="p-3 text-neutral-300">{prod.codigo_barras}</td>
                        <td className="p-3 font-sans font-medium text-white max-w-xs truncate">{prod.descricao}</td>
                        <td className="p-3 text-neutral-400">{prod.embalagem || 'UN'}</td>
                        <td className="p-3 text-right font-bold text-emerald-400">
                          R$ {Number(prod.preco).toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-[10px] font-bold">
                            ATIVO
                          </span>
                        </td>
                        <td className="p-3 text-right text-cyan-300 text-[11px]">
                          {prod.ultima_sincronizacao_formatada}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Audit Logs / Sync History */}
          {data?.historico_recente && data.historico_recente.length > 0 && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-amber-400" />
                Histórico Recente de Ciclos de Sincronização
              </h3>
              <div className="space-y-2">
                {data.historico_recente.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 bg-neutral-950 rounded-2xl border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          log.status === 'SUCESSO' ? 'bg-emerald-400' : 'bg-red-400'
                        }`}
                      />
                      <span className="font-bold text-white">
                        {formatDateTimeBR(log.data_hora)}
                      </span>
                      <span className="text-neutral-400 font-sans">
                        &bull; {log.produtos_analisados} itens analisados
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px]">
                      {log.produtos_novos > 0 && (
                        <span className="text-emerald-400">+{log.produtos_novos} novos</span>
                      )}
                      {log.produtos_atualizados > 0 && (
                        <span className="text-blue-400">{log.produtos_atualizados} atualizados</span>
                      )}
                      <span className="px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded">
                        Loja {log.id_loja}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
          {content}
        </div>
      </div>
    );
  }

  return content;
};
