import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { readProducts, sendSnapshot } from '../public/erp-agent/integrador.mjs';
import { VR_QUERY } from '../public/erp-agent/integrador.mjs';
import { collectDiagnostic } from '../installer/windows/diagnostic.mjs';

const base = process.env.BUSCAPRECO_TEST_URL;
test('VR PostgreSQL → staged PHP/MySQL sync → price lookup', { skip: !base }, async () => {
  assert.equal(new URL(base).hostname, '127.0.0.1', 'Integration tests must use a disposable local service.');
  const token = 'test-only-token-000000000000000000000000';
  const config = { url: 'https://hostinger.example/', id_loja: 1, token, situacao_ativa: 3,
    postgres: { host: '127.0.0.1', port: Number(process.env.BUSCAPRECO_TEST_PG_PORT || 15432), database: 'vr', user: 'erp_reader' } };
  const request = (url, options) => fetch(base + new URL(url).pathname, options);
  const api = async (route) => {
    const r = await fetch(base + route);
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  };
  assert.equal((await fetch(base + '/install.php?format=json')).status, 401);
  assert.equal((await fetch(base + '/api.php?action=mysql/config')).status, 401);
  for (const route of ['/api.php?action=products/import', '/atualizar_produtos.php', '/atualizar_app.php']) {
    assert.equal((await fetch(base + route, { method: 'POST', body: '{}' })).status, 401);
  }
  let cookie = '';
  const auth = async (data) => {
    const r = await fetch(base + '/auth.php', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(data) });
    const set = r.headers.getSetCookie();
    if (set.length) cookie = set.map((value) => value.split(';')[0]).join('; ');
    return r;
  };
  const authState = await (await fetch(base + '/auth.php')).json();
  assert.equal(authState.backend, 'hostinger-php');
  assert.equal(authState.config_status, 'valid');
  assert.equal(authState.token_configured, true);
  assert.equal(authState.setup_error, null);
  if (!authState.configured) {
    const rejected = await auth({ operation: 'setup', password: 'test-admin-password', setup_token: 'wrong-configuration-token-000000000000000000' });
    assert.equal(rejected.status, 401);
    assert.match((await rejected.json()).error, /erp_sync_token/);
    assert.equal((await auth({ operation: 'setup', password: 'test-admin-password', setup_token: token })).status, 200);
  }
  assert.equal((await auth({ operation: 'login', password: 'wrong' })).status, 401);
  assert.equal((await auth({ operation: 'login', password: 'test-admin-password' })).status, 200);
  const installed = await fetch(base + '/install.php?format=json', { headers: { Cookie: cookie } });
  assert.equal(installed.status, 200, await installed.clone().text());
  assert.equal((await installed.json()).success, true);
  assert.equal((await fetch(base + '/api.php?action=mysql/config', { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(base + '/api.php?action=products/import', { method: 'POST',
    headers: { Cookie: cookie, Origin: 'https://foreign.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  const initialStatus = await api('/api.php?action=status');
  assert.equal(initialStatus.total_produtos, 0);
  assert.equal(initialStatus.ultima_sincronizacao, null, 'An empty catalog must not report the current time as a confirmed sync.');
  const unauthorized = await fetch(base + '/erp-sync.php', { method: 'POST', body: '{}' });
  assert.equal(unauthorized.status, 401);
  assert.equal((await fetch(base + '/config_db.json')).status, 403);
  assert.equal((await fetch(base + '/erp-agent/config.example.json')).status, 200);
  const products = await readProducts(config, pg.Client);
  assert.equal(products.length, 2);
  assert.equal(products[0].codigo_barras, '007891000100103');
  assert.equal(products[0].preco, 12.34);
  const client = new pg.Client(config.postgres);
  await client.connect();
  try { await assert.rejects(client.query('UPDATE produto SET descricaocompleta=descricaocompleta'), { code: '42501' }); }
  finally { await client.end(); }
  const incompatible = VR_QUERY.replace('p.id_tipoembalagem', 'p.diagnostico_coluna_ausente');
  const diagnostic = await collectDiagnostic(config, pg.Client, async () => {
    const probe = new pg.Client(config.postgres);
    try {
      await probe.connect();
      await probe.query('BEGIN READ ONLY');
      await probe.query(incompatible, [3, 1]);
      return [];
    } finally { await probe.end(); }
  }, incompatible);
  assert.match(diagnostic, /COLUNA AUSENTE: p.diagnostico_coluna_ausente/);
  assert.match(diagnostic, /public.produto.id_tipoembalagem/);
  const uploaded = await sendSnapshot(config, products, request);
  assert.equal(uploaded.total_processados, 2);
  const cloudStatus = await api('/api.php?action=status&id_loja=1');
  assert.equal(cloudStatus.agente_online, true);
  assert.ok(cloudStatus.ultima_carga_erp);
  const found = await api('/api/products/search?q=_007891000100103_&id_loja=1');
  assert.equal(found.preco, 12.34);
  assert.equal(found.codigo_barras, '007891000100103');
  assert.equal((await api('/api/products/search?q=101&id_loja=1')).codigo_barras, found.codigo_barras);
  assert.equal((await fetch(base + '/api/products/search?q=INEXISTENTE&id_loja=1')).status, 404);
  assert.equal((await fetch(base + '/api/products/search?q=7891000100103&id_loja=1')).status, 200);
  const pendingId = randomUUID();
  const stage = (payload) => fetch(base + '/erp-sync.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ERP-Token': token },
    body: JSON.stringify({ sync_id: pendingId, id_loja: 1, total: 2, ...payload }),
  });
  assert.equal((await stage({ operation: 'batch', items: [products[0]] })).status, 200);
  assert.equal((await stage({ operation: 'commit' })).status, 409);
  assert.equal((await api('/api/products?id_loja=1')).length, 2);
  assert.equal((await stage({ operation: 'batch', items: [{ ...products[0], preco: -1 }] })).status, 400);
  assert.equal((await stage({ operation: 'batch', id_loja: 2, items: [products[0]] })).status, 403);
  await sendSnapshot(config, [{ ...products[0], preco: 15.90 }], request);
  const changed = await api('/api/products/search?q=101&id_loja=1');
  assert.equal(changed.preco, 15.90);
  assert.equal((await api('/api/products?id_loja=1')).length, 1);
  assert.equal((await fetch(base + '/api/products/search?q=7891000200202&id_loja=1')).status, 404);
  const oldCommit = await stage({ operation: 'batch', items: [products[1]] });
  assert.equal(oldCommit.status, 200);
  assert.equal((await stage({ operation: 'commit' })).status, 409, 'An old snapshot cannot replace a newer committed catalog.');
  assert.equal((await auth({ operation: 'change-password', password: 'changed-admin-password' })).status, 200);
  await auth({ operation: 'logout' });
  assert.equal((await auth({ operation: 'login', password: 'test-admin-password' })).status, 401);
  assert.equal((await auth({ operation: 'login', password: 'changed-admin-password' })).status, 200);
  await auth({ operation: 'change-password', password: 'test-admin-password' });
  await auth({ operation: 'logout' });
  assert.equal((await fetch(base + '/api.php?action=mysql/config', { headers: { Cookie: cookie } })).status, 401);
});
