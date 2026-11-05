import React, { useState, useEffect } from 'react';
import { Product, LabelModel, PrinterConfig, SystemStatus } from './types';
import { DEFAULT_LABEL_MODELS } from './services/argoxPrinter';
import { localDB } from './services/storage';
import { fetchSystemStatus, syncLocalCache, fetchStores, fetchPrinters } from './services/api';
import { ConsultaPreco } from './components/ConsultaPreco';
import { PainelAdmin } from './components/PainelAdmin';

export function App() {
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [currentStoreId, setCurrentStoreId] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('kiosk_store_id');
      return saved ? Number(saved) : 1;
    } catch {
      return 1;
    }
  });
  const [currentStoreName, setCurrentStoreName] = useState<string>(() => {
    try {
      return localStorage.getItem('kiosk_store_name') || 'Supermercado Modelo · Loja 01 (Matriz)';
    } catch {
      return 'Supermercado Modelo · Loja 01 (Matriz)';
    }
  });

  // Label Models
  const [models, setModels] = useState<LabelModel[]>(DEFAULT_LABEL_MODELS);
  const [activeModelId, setActiveModelId] = useState<string>(() => {
    try {
      return localStorage.getItem('kiosk_active_model_id') || 'gondola-dupla-100x30';
    } catch {
      return 'gondola-dupla-100x30';
    }
  });

  // Printers
  const [printers, setPrinters] = useState<PrinterConfig[]>([
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
  ]);

  // System Status
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    erp_conectado: false,
    internet_online: true,
    banco_online: false,
    cache_local_atualizado: false,
    impressora_online: false,
    ultima_sincronizacao: new Date().toISOString(),
    proxima_sincronizacao: new Date(Date.now() + 600000).toISOString(),
    total_produtos: 0,
    loja_atual: 1,
    tempo_retorno_segundos: 5,
  });

  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  const [siteBackground, setSiteBackground] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/terminal/background', { cache: 'no-store' });
        const data = await response.json();
        if (active && response.ok && data.success === true && (data.url === null || /^terminal-media\/default-[a-f0-9]{64}\.(png|jpeg|webp)$/.test(data.url))) setSiteBackground(data.url);
      } catch { /* Keep the last background when offline. */ }
    };
    void load();
    const timer = setInterval(load, 60000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  // Images use IndexedDB, avoiding the small localStorage quota used by settings.
  const [customBackground, setCustomBackground] = useState<string | null>(null);
  const [backgroundReady, setBackgroundReady] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      let saved = await localDB.getBackground();
      let legacy: string | null = null;
      try { legacy = localStorage.getItem('kiosk_custom_background'); } catch {}
      if (!saved && legacy) {
        await localDB.saveBackground(legacy);
        saved = legacy;
        try { localStorage.removeItem('kiosk_custom_background'); } catch {}
      }
      if (active) setCustomBackground(saved);
    })().catch(() => {}).finally(() => { if (active) setBackgroundReady(true); });
    return () => { active = false; };
  }, []);

  const handleUpdateBackground = async (bg: string | null) => {
    if (!backgroundReady) throw new Error('Aguarde o carregamento do fundo.');
    await localDB.saveBackground(bg);
    try { localStorage.removeItem('kiosk_custom_background'); } catch {}
    setCustomBackground(bg);
  };

  const handleSaveDefaultBackground = async () => {
    if (!customBackground?.startsWith('data:image/')) throw new Error('Carregue uma imagem PNG, JPG ou WebP antes de salvar como padrão.');
    const response = await fetch('/api/terminal/background', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: customBackground }) });
    const data = await response.json();
    if (!response.ok || data.success !== true) throw new Error(data.error || 'Não foi possível salvar o fundo padrão.');
    setSiteBackground(data.url);
    setCustomBackground(null);
    await localDB.saveBackground(null).catch(() => {});
  };

  // Initial load
  useEffect(() => {
    // 1. Initialize local IndexedDB database
    localDB.init().then(async () => {
      const savedModels = await localDB.getModels();
      if (savedModels && savedModels.length > 0) {
        // Enforce 100x30mm physical size for all models
        const standardizedModels = savedModels.map((m) => ({
          ...m,
          largura_mm: 100,
          altura_mm: 30,
        }));
        setModels(standardizedModels);
      } else {
        setModels(DEFAULT_LABEL_MODELS);
      }
      // Sync local cache
      await syncLocalCache(currentStoreId);
    });

    // 2. Load system status and registered printers from API
    loadStatus();
    fetchPrinters().then((loaded) => {
      if (loaded && loaded.length > 0) {
        setPrinters(loaded);
      }
    });

    // 3. Setup online/offline event listeners
    const handleOnline = () => {
      setIsOffline(false);
      syncLocalCache(currentStoreId);
      loadStatus();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 4. Periodic status heartbeat
    const statusInterval = setInterval(loadStatus, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(statusInterval);
    };
  }, [currentStoreId]);

  const loadStatus = async () => {
    try {
      const status = await fetchSystemStatus(currentStoreId);
      setSystemStatus(status);
      if (status.nome_loja) {
        setCurrentStoreName(status.nome_loja);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectStore = async (storeId: number) => {
    setCurrentStoreId(storeId);
    let storeName = `Supermercado Modelo · Loja ${String(storeId).padStart(2, '0')}`;
    try {
      const stores = await fetchStores();
      const match = stores.find((s) => s.id === storeId);
      if (match && match.nome) {
        storeName = match.nome;
      }
    } catch {}

    setCurrentStoreName(storeName);
    try {
      localStorage.setItem('kiosk_store_id', String(storeId));
      localStorage.setItem('kiosk_store_name', storeName);
    } catch {}
    syncLocalCache(storeId);
  };

  const handleSelectModel = (modelId: string) => {
    setActiveModelId(modelId);
    try {
      localStorage.setItem('kiosk_active_model_id', modelId);
    } catch {}
  };

  const handleSaveModel = async (updatedModel: LabelModel) => {
    const updated = models.map((m) => (m.id === updatedModel.id ? updatedModel : m));
    setModels(updated);
    await localDB.saveModels(updated);
  };

  const handleCreateNewModel = () => {
    const newId = `modelo-${Date.now()}`;
    const newModel: LabelModel = {
      id: newId,
      nome: `NOVO MODELO ${models.length + 1} (100×30 mm)`,
      largura_mm: 100,
      altura_mm: 30,
      orientacao: 'paisagem',
      produtos_por_etiqueta: 1,
      margem_esquerda: 1,
      margem_direita: 1,
      margem_superior: 1,
      margem_inferior: 1,
      gap: 3,
      padrao: false,
      ativo: true,
      elementos: [
        {
          id: 'desc_1',
          tipo: 'descricao',
          slot: 1,
          x: 2,
          y: 2,
          largura: 90,
          altura: 8,
          fonte: 'Arial',
          tamanho_fonte: 12,
          negrito: true,
          alinhamento: 'left',
          rotacao: 0,
          quebra_linha: true,
          max_linhas: 2,
          visivel: true,
        },
        {
          id: 'preco_1',
          tipo: 'preco_completo',
          slot: 1,
          x: 2,
          y: 12,
          largura: 50,
          altura: 10,
          fonte: 'Arial Black',
          tamanho_fonte: 22,
          negrito: true,
          alinhamento: 'left',
          rotacao: 0,
          quebra_linha: false,
          max_linhas: 1,
          visivel: true,
        },
        {
          id: 'barras_1',
          tipo: 'codigo_barras',
          slot: 1,
          x: 2,
          y: 22,
          largura: 35,
          altura: 7,
          fonte: 'Monospace',
          tamanho_fonte: 8,
          negrito: false,
          alinhamento: 'left',
          rotacao: 0,
          quebra_linha: false,
          max_linhas: 1,
          visivel: true,
        },
      ],
    };

    const nextModels = [...models, newModel];
    setModels(nextModels);
    setActiveModelId(newId);
    localDB.saveModels(nextModels);
  };

  const activeModel =
    models.find((m) => m.id === activeModelId) || models[0] || DEFAULT_LABEL_MODELS[0];

  const activePrinter =
    printers.find((p) => p.padrao) || printers[0] || {
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
    };

  return (
    <div className="min-h-screen w-full bg-neutral-950 font-sans text-neutral-100 antialiased selection:bg-emerald-500 selection:text-white">
      {/* Consulta Preço Kiosk (Main Interface) */}
      <ConsultaPreco
        currentStoreId={currentStoreId}
        currentStoreName={currentStoreName}
        activeModel={activeModel}
        activePrinter={activePrinter}
        printers={printers}
        onOpenAdmin={() => setIsAdminOpen(true)}
        isAdminOpen={isAdminOpen}
        isOffline={isOffline}
        customBackground={customBackground || siteBackground}
      />

      {/* Admin Panel (Secured with PIN) */}
      {isAdminOpen && (
        <PainelAdmin
          status={systemStatus}
          models={models}
          activeModel={activeModel}
          printers={printers}
          activePrinter={activePrinter}
          currentStoreId={currentStoreId}
          customBackground={customBackground || siteBackground}
          onUpdateBackground={handleUpdateBackground}
          onSaveDefaultBackground={handleSaveDefaultBackground}
          onSelectStore={handleSelectStore}
          onSaveModel={handleSaveModel}
          onSelectModel={handleSelectModel}
          onCreateNewModel={handleCreateNewModel}
          onAddPrinter={(newP) => {
            setPrinters((prev) => [...prev.filter((p) => p.id !== newP.id), newP]);
          }}
          onDeletePrinter={(id) => {
            setPrinters((prev) => prev.filter((p) => p.id !== id));
          }}
          onUpdatePrinter={(p) => {
            setPrinters((prev) => prev.map((item) => (item.id === p.id ? p : item)));
          }}
          onCloseAdmin={() => setIsAdminOpen(false)}
          onRefreshData={() => {
            loadStatus();
            syncLocalCache(currentStoreId);
            fetchPrinters().then((res) => {
              if (res && res.length > 0) setPrinters(res);
            });
          }}
        />
      )}
    </div>
  );
}

export default App;
