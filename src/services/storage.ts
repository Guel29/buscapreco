import { Product, LabelModel } from '../types';
import { DEFAULT_LABEL_MODELS } from './argoxPrinter';

const DB_NAME = 'SupermercadoConsultaDB';
const DB_VERSION = 1;

class LocalDatabase {
  private db: IDBDatabase | null = null;
  private isInitPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.isInitPromise) return this.isInitPromise;

    this.isInitPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        resolve();
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('produtos')) {
          const store = db.createObjectStore('produtos', { keyPath: 'id' });
          store.createIndex('by_barras', 'codigo_barras', { unique: false });
          store.createIndex('by_interno', 'codigo_interno', { unique: false });
          store.createIndex('by_loja', 'id_loja', { unique: false });
        }

        if (!db.objectStoreNames.contains('modelos')) {
          db.createObjectStore('modelos', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event);
        reject(event);
      };
    });

    return this.isInitPromise;
  }

  async saveProducts(products: Product[]): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('produtos', 'readwrite');
      const store = tx.objectStore('produtos');

      // Clear existing to keep in exact sync
      store.clear();

      for (const prod of products) {
        // Enforce string on barcode and internal code
        store.put({
          ...prod,
          codigo_barras: String(prod.codigo_barras || '').trim(),
          codigo_interno: String(prod.codigo_interno || '').trim(),
        });
      }

      tx.oncomplete = () => {
        try {
          localStorage.setItem('last_cache_sync', new Date().toISOString());
          localStorage.setItem('cached_products_count', String(products.length));
        } catch (_) {}
        resolve();
      };

      tx.onerror = () => reject(tx.error);
    });
  }

  async getAllProducts(idLoja?: number): Promise<Product[]> {
    await this.init();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('produtos', 'readonly');
      const store = tx.objectStore('produtos');
      const request = store.getAll();

      request.onsuccess = () => {
        let results = request.result as Product[];
        if (idLoja !== undefined) {
          results = results.filter((p) => Number(p.id_loja) === Number(idLoja));
        }
        results = results.filter((p) => p.ativo !== false);
        resolve(results);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Exact search with supermarket priority:
   * 1. Normalize code (preserving leading zeros, trim only spaces/control chars)
   * 2. Exact match on codigo_barras (EAN)
   * 3. Exact match on codigo_interno
   * 4. Numeric match without leading zeros
   * 5. Return null (PRODUTO NÃO ENCONTRADO) - STRICT: Never match against description!
   */
  async findProduct(rawInput: string, idLoja: number = 1): Promise<Product | null> {
    await this.init();
    const cleanInput = String(rawInput || '')
      .replace(/[\r\n\t]/g, '')
      .replace(/^\][a-zA-Z0-9]{2}/, '')
      .replace(/^_+|_+$/g, '')
      .trim();

    if (!cleanInput) return null;

    if (!this.db) {
      return null;
    }

    const isNumeric = /^\d+$/.test(cleanInput);
    const unpaddedInput = isNumeric ? cleanInput.replace(/^0+/, '') : cleanInput;

    return new Promise((resolve) => {
      const tx = this.db!.transaction('produtos', 'readonly');
      const store = tx.objectStore('produtos');

      // 1. Try exact barcode match first
      const barcodeIdx = store.index('by_barras');
      const barcodeReq = barcodeIdx.getAll(cleanInput);

      barcodeReq.onsuccess = () => {
        const matches = (barcodeReq.result as Product[]).filter(
          (p) => Number(p.id_loja) === Number(idLoja) && p.ativo !== false
        );

        if (matches.length > 0) {
          resolve(matches[0]);
          return;
        }

        // 2. Fallback to exact internal code match
        const internalIdx = store.index('by_interno');
        const internalReq = internalIdx.getAll(cleanInput);

        internalReq.onsuccess = () => {
          const intMatches = (internalReq.result as Product[]).filter(
            (p) => Number(p.id_loja) === Number(idLoja) && p.ativo !== false
          );

          if (intMatches.length > 0) {
            resolve(intMatches[0]);
            return;
          }

          // 3. If numeric, check if codes match without leading zeros (e.g. '00123' vs '123')
          if (isNumeric && unpaddedInput) {
            const allReq = store.getAll();
            allReq.onsuccess = () => {
              const all = (allReq.result as Product[]).filter(
                (p) => Number(p.id_loja) === Number(idLoja) && p.ativo !== false
              );
              const numMatch = all.find((p) => {
                const b = String(p.codigo_barras || '').replace(/^0+/, '');
                const i = String(p.codigo_interno || '').replace(/^0+/, '');
                return b === unpaddedInput || i === unpaddedInput;
              });
              resolve(numMatch || null);
            };
            allReq.onerror = () => resolve(null);
            return;
          }

          // Strict search: never search description in price checker
          resolve(null);
        };

        internalReq.onerror = () => resolve(null);
      };

      barcodeReq.onerror = () => resolve(null);
    });
  }

  // Label Models Persistence
  async getModels(): Promise<LabelModel[]> {
    await this.init();
    if (!this.db) {
      const saved = localStorage.getItem('label_models');
      return saved ? JSON.parse(saved) : DEFAULT_LABEL_MODELS;
    }

    return new Promise((resolve) => {
      const tx = this.db!.transaction('modelos', 'readonly');
      const store = tx.objectStore('modelos');
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result as LabelModel[];
        if (results && results.length > 0) {
          resolve(results);
        } else {
          // Seed defaults
          this.saveModels(DEFAULT_LABEL_MODELS).then(() => resolve(DEFAULT_LABEL_MODELS));
        }
      };

      request.onerror = () => resolve(DEFAULT_LABEL_MODELS);
    });
  }

  async saveModels(models: LabelModel[]): Promise<void> {
    await this.init();
    try {
      localStorage.setItem('label_models', JSON.stringify(models));
    } catch (_) {}

    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('modelos', 'readwrite');
      const store = tx.objectStore('modelos');
      store.clear();
      for (const m of models) {
        store.put(m);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const localDB = new LocalDatabase();
