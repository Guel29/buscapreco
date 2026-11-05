import assert from 'node:assert/strict';
import test from 'node:test';
import { sendDirectPrint } from '../src/services/api.ts';
import { DEFAULT_LABEL_MODELS } from '../src/services/argoxPrinter.ts';

test('RAW printing requires a valid local-agent confirmation and never claims cloud USB delivery', async () => {
  const originalFetch = globalThis.fetch;
  const printer = { id: 'argox', nome: 'Argox OS-214 Plus', porta: 'USB001', dpi: 203, linguagem: 'PPLB' };
  const products = [{ codigo_interno: '101', codigo_barras: '7891000100103', descricao: 'ARROZ', preco: 1 }];
  try {
    for (const response of [new Response('<html>SPA fallback</html>'), Response.json({ success: false }), Response.json({})]) {
      const urls = [];
      globalThis.fetch = async (url) => { urls.push(url); return response; };
      const result = await sendDirectPrint(DEFAULT_LABEL_MODELS[0], printer, products);
      assert.equal(result.success, false);
      assert.match(result.message, /Windows/);
      assert.deepEqual(urls, ['http://localhost:9100/print-raw']);
    }
    globalThis.fetch = async () => Response.json({ success: true });
    const result = await sendDirectPrint(DEFAULT_LABEL_MODELS[0], printer, products);
    assert.equal(result.success, true);
    assert.match(result.message, /aceito/);
    assert.doesNotMatch(result.message, /impressa com sucesso/);
  } finally { globalThis.fetch = originalFetch; }
});
