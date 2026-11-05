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
  const scheduleUrl = base + '/erp-schedule.php?id_loja=1';
  assert.equal((await fetch(scheduleUrl)).status, 401);
  assert.equal((await fetch(scheduleUrl, { headers: { 'X-ERP-Token': token } })).status, 200);
  const scheduleHeaders = { Cookie: cookie, 'Content-Type': 'application/json' };
  const updateSchedule = (value, headers = scheduleHeaders) => fetch(base + '/api/erp/schedule', { method: 'POST', headers, body: JSON.stringify(value) });
  assert.equal((await updateSchedule({ id_loja: 1, intervalo_minutos: 5 }, { 'Content-Type': 'application/json', 'X-ERP-Token': token })).status, 401, 'ERP token must not edit the schedule.');
  for (const value of [0, 1441, 1.5, '5']) {
    assert.equal((await updateSchedule({ id_loja: 1, intervalo_minutos: value })).status, 400);
  }
  assert.equal((await updateSchedule({ id_loja: 2, intervalo_minutos: 5 })).status, 400);
  assert.equal((await updateSchedule({ id_loja: 1, intervalo_minutos: 5 }, { ...scheduleHeaders, Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await updateSchedule({ id_loja: 1, intervalo_minutos: 5 })).status, 200);
  const remoteSchedule = await (await fetch(scheduleUrl, { headers: { 'X-ERP-Token': token } })).json();
  assert.deepEqual(remoteSchedule, { success: true, id_loja: 1, configured: true, intervalo_minutos: 5 });
  assert.equal((await fetch(base + '/erp-schedule.php?id_loja=2', { headers: { 'X-ERP-Token': token } })).status, 403);
  assert.equal((await fetch(base + '/.erp-schedule.json')).status, 403);
  assert.equal((await (await fetch(base + '/api/erp/schedule', { headers: { Cookie: cookie } })).json()).intervalo_minutos, 5);
  assert.equal((await auth({ operation: 'login', password: 'test-admin-password' })).status, 200, 'Changing the schedule must preserve the admin credentials.');
  const backgroundUrl = base + '/api/terminal/background';
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  assert.equal((await (await fetch(backgroundUrl)).json()).url, null);
  const uploadBackground = (value, headers = { Cookie: cookie, 'Content-Type': 'application/json' }) => fetch(backgroundUrl, { method: 'POST', headers, body: JSON.stringify({ image: value }) });
  assert.equal((await uploadBackground(image, { 'Content-Type': 'application/json' })).status, 401);
  assert.equal((await uploadBackground(image, { 'Content-Type': 'application/json', 'X-ERP-Token': token })).status, 401);
  assert.equal((await uploadBackground('data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64'))).status, 400);
  assert.equal((await uploadBackground('data:image/png;base64,' + Buffer.from('<?php echo 1;').toString('base64'))).status, 400);
  const backgroundSaved = await uploadBackground(image);
  assert.equal(backgroundSaved.status, 200, await backgroundSaved.clone().text());
  const background = await backgroundSaved.json();
  assert.match(background.url, /^terminal-media\/default-[a-f0-9]{64}\.png$/);
  assert.equal((await (await fetch(backgroundUrl)).json()).url, background.url, 'Default background must be available without an admin session.');
  const picture = await fetch(base + '/' + background.url);
  assert.equal(picture.status, 200);
  assert.match(picture.headers.get('content-type'), /image\/png/);
  assert.deepEqual(Buffer.from(await picture.arrayBuffer()), Buffer.from(image.split(',')[1], 'base64'));
  assert.equal((await fetch(base + '/.terminal-background.json')).status, 403);
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
  assert.equal(products[0].codigo_barras, '7891000100103');
  assert.equal(products[0].preco, 12.34);
  const otherStore = await readProducts({ ...config, id_loja: 2 }, pg.Client);
  assert.equal(otherStore.length, 1, 'Active status must be evaluated for the selected store, not globally on produto.');
  assert.equal(otherStore[0].codigo_interno, '103');
  assert.equal(otherStore[0].preco, 7.89);
  const client = new pg.Client(config.postgres);
  await client.connect();
  try {
    await assert.rejects(client.query('SELECT p.id_situacaocadastro FROM produto p'), { code: '42703' });
    await assert.rejects(client.query('UPDATE produto SET descricaocompleta=descricaocompleta'), { code: '42501' });
  }
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
  assert.equal(found.codigo_barras, '7891000100103');
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
