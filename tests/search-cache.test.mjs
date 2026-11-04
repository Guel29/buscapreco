import assert from 'node:assert/strict';
import test from 'node:test';
import { searchProduct } from '../src/services/api.ts';
import { localDB } from '../src/services/storage.ts';

test('an authoritative inactive/not-found response never revives an old cached product', async () => {
  const originalFetch = globalThis.fetch;
  const originalSearch = localDB.findProduct;
  let usedCache = false;
  localDB.findProduct = async () => { usedCache = true; return { id: 'outdated' }; };
  try {
    for (const error of ['PRODUTO NÃO ENCONTRADO', 'PRODUTO INATIVO NO CADASTRO']) {
      globalThis.fetch = async () => Response.json({ error }, { status: 404 });
      assert.equal(await searchProduct('123', 1), null);
      assert.equal(usedCache, false);
    }
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.deepEqual(await searchProduct('123', 1), { id: 'outdated' });
    assert.equal(usedCache, true);
  } finally {
    globalThis.fetch = originalFetch;
    localDB.findProduct = originalSearch;
  }
});
