import assert from 'node:assert/strict';
import test from 'node:test';
import { missingColumn, collectDiagnostic } from '../installer/windows/diagnostic.mjs';
import { VR_QUERY } from '../public/erp-agent/integrador.mjs';

test('42703 diagnostic identifies the precise static query identifier without printing raw errors', () => {
  const column = 'p.id_tipoembalagem';
  assert.equal(missingColumn({ code: '42703', position: String(VR_QUERY.indexOf(column) + 1) }, VR_QUERY), column);
  assert.equal(missingColumn({ code: '42703', message: 'column pc.precovenda does not exist' }, VR_QUERY), 'pc.precovenda');
  assert.equal(missingColumn({ code: '42703', message: 'column p.customer_secret does not exist' }, VR_QUERY), null);
});

test('diagnostic reads metadata in a read-only transaction and omits connection secrets and product values', async () => {
  const statements = [];
  class Client {
    async connect() {}
    async query(sql, values) {
      statements.push([sql, values]);
      return { rows: [{ table_schema: 'public', table_name: 'produto', column_name: 'id', data_type: 'integer' }] };
    }
    async end() {}
  }
  const report = await collectDiagnostic({ token: 'SECRET_TOKEN', postgres: { password: 'SECRET_PASSWORD' } }, Client, async () => {
    throw Object.assign(new Error('SECRET_PASSWORD'), { code: '42703', position: String(VR_QUERY.indexOf('pc.precovenda') + 1) });
  }, VR_QUERY);
  assert.match(report, /COLUNA AUSENTE: pc.precovenda/);
  assert.match(report, /public.produto.id/);
  assert.doesNotMatch(report, /SECRET_/);
  assert.equal(statements[0][0], 'BEGIN READ ONLY');
  assert.equal(statements.at(-1)[0], 'COMMIT');
});
