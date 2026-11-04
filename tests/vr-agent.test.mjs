import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProducts, sendSnapshot, validateConfig, readProducts } from '../public/erp-agent/integrador.mjs';

test('agent rejects invalid configuration and preserves barcode zeros', () => {
  assert.throws(() => validateConfig({ url: 'http://example.com' }), /HTTPS/);
  assert.throws(() => validateConfig({ url: 'https://example.com', token: '' }), /token/);
  const products = normalizeProducts([{ codigo_interno: '01', codigo_barras: '000123', descricao: 'Arroz', preco: '12.34' }]);
  assert.equal(products[0].codigo_barras, '000123');
  assert.equal(products[0].preco, 12.34);
  assert.throws(() => normalizeProducts([...products, ...products]), /duplicado/);
  assert.throws(() => normalizeProducts([{ ...products[0], preco: -1 }]), /inválido/);
});

test('agent stops a failed batch without committing or reporting success', async () => {
  const products = Array.from({ length: 501 }, (_, i) => ({ codigo_interno: String(i), codigo_barras: String(i), descricao: 'Produto', preco: 1 }));
  const operations = [];
  await assert.rejects(sendSnapshot({ url: 'https://example.com', id_loja: 1, token: 'fixture' }, products, async (_, options) => {
    const data = JSON.parse(options.body);
    operations.push(data.operation);
    return new Response(JSON.stringify({ success: operations.length === 1 }), { status: operations.length === 1 ? 200 : 503 });
  }), /recusada/);
  assert.deepEqual(operations, ['batch', 'batch']);
  await assert.rejects(sendSnapshot({ url: 'https://example.com' }, []), /preservado/);
});

test('ERP extraction always uses a read-only transaction and closes on failure', async () => {
  const statements = [];
  class Client {
    async connect() {}
    async query(sql, values) {
      statements.push([sql, values]);
      if (sql.startsWith('SELECT')) throw new Error('ERP unavailable');
    }
    async end() { statements.push(['CLOSED']); }
  }
  await assert.rejects(readProducts({ postgres: {}, situacao_ativa: 3, id_loja: 2 }, Client), /ERP unavailable/);
  assert.match(statements[0][0], /READ ONLY/);
  assert.deepEqual(statements[1][1], [3, 2]);
  assert.equal(statements.at(-1)[0], 'CLOSED');
});
