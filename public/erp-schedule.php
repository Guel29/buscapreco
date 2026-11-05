<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth-session.php';
header('Cache-Control: no-store');
$method = $_SERVER['REQUEST_METHOD'];
$agentToken = $_SERVER['HTTP_X_ERP_TOKEN'] ?? '';
$expected = erpSyncToken();
$agent = is_string($agentToken) && strlen($expected) >= 32 && hash_equals($expected, $agentToken);
if ($method !== 'GET' || !$agent) requireAdminSession();
if (!in_array($method, ['GET', 'POST'], true)) sendJson(['error' => 'Método não permitido.'], 405);
$store = (int)($activeConfig['erp_sync_loja'] ?? 1);
if ($agent && (int)($_GET['id_loja'] ?? 0) !== $store) sendJson(['error' => 'Loja não autorizada.'], 403);
$file = __DIR__ . '/.erp-schedule.json';
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $minutes = $input['intervalo_minutos'] ?? null;
    if (!is_int($minutes) || $minutes < 1 || $minutes > 1440 || ($input['id_loja'] ?? null) !== $store) {
        sendJson(['error' => 'Informe a loja autorizada e um intervalo inteiro de 1 a 1440 minutos.'], 400);
    }
    $saved = ['id_loja' => $store, 'intervalo_minutos' => $minutes];
    if (file_put_contents($file, json_encode($saved), LOCK_EX) === false) sendJson(['error' => 'Não foi possível salvar o intervalo.'], 503);
}
$handle = @fopen($file, 'r');
$saved = null;
if ($handle) {
    if (flock($handle, LOCK_SH)) { $saved = json_decode(stream_get_contents($handle), true); flock($handle, LOCK_UN); }
    fclose($handle);
}
$configured = is_array($saved) && ($saved['id_loja'] ?? null) === $store && is_int($saved['intervalo_minutos'] ?? null) && $saved['intervalo_minutos'] >= 1 && $saved['intervalo_minutos'] <= 1440;
sendJson(['success' => true, 'id_loja' => $store, 'configured' => $configured, 'intervalo_minutos' => $configured ? $saved['intervalo_minutos'] : null]);
