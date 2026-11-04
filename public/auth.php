<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth-session.php';
header('Cache-Control: no-store');
$hash = $activeConfig['admin_password_hash'] ?? '';
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    sendJson(['configured' => $hash !== '', 'authenticated' => adminAuthenticated(),
        'backend' => 'hostinger-php', 'config_file' => 'config_db.json', 'config_status' => $configReadStatus,
        'setup_token_source' => erpSyncTokenSource(),
        'token_configured' => strlen(erpSyncToken()) >= 32, 'setup_error' => $hash === '' ? adminSetupError() : null]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') sendJson(['error' => 'Use POST.'], 405);
$data = json_decode(file_get_contents('php://input'), true) ?: [];
$operation = $data['operation'] ?? 'login';
if ($operation === 'logout') {
    $_SESSION = []; session_destroy(); sendJson(['success' => true]);
}
$password = $data['password'] ?? '';
if (!is_string($password) || strlen($password) > 128) sendJson(['error' => 'Senha inválida.'], 400);
if ($operation === 'setup') {
    if ($hash !== '') sendJson(['error' => 'Administrador já configurado. Atualize a página para entrar.'], 409);
    $setupError = adminSetupError();
    if ($setupError) sendJson(['error' => $setupError], 503);
    if (strlen($password) < 10) sendJson(['error' => 'Use pelo menos 10 caracteres na senha.'], 400);
    if (!is_string($data['setup_token'] ?? null) || strlen($data['setup_token']) < 32) {
        sendJson(['error' => 'Preencha o token de configuração com pelo menos 32 caracteres.'], 400);
    }
}
// Persist a small per-source-IP throttle; the file is private under .htaccess.
$rateFile = __DIR__ . '/.auth-rate-' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown') . '.json';
$rateHandle = fopen($rateFile, 'c+');
if (!$rateHandle || !flock($rateHandle, LOCK_EX)) sendJson(['error' => 'Autenticação indisponível.'], 503);
$rate = json_decode(stream_get_contents($rateHandle), true) ?: ['start' => time(), 'attempts' => 0];
if (time() - $rate['start'] > 900) $rate = ['start' => time(), 'attempts' => 0];
if ($rate['attempts'] >= 10) { fclose($rateHandle); sendJson(['error' => 'Muitas tentativas. Aguarde 15 minutos.'], 429); }
$rate['attempts']++;
ftruncate($rateHandle, 0); rewind($rateHandle); fwrite($rateHandle, json_encode($rate));
flock($rateHandle, LOCK_UN); fclose($rateHandle);
if ($operation === 'setup') {
    $token = erpSyncToken();
    if (strlen($token) < 32 || !is_string($data['setup_token'] ?? null) || !hash_equals($token, $data['setup_token'])) {
        $source = erpSyncTokenSource() === 'ERP_SYNC_TOKEN' ? 'variável ERP_SYNC_TOKEN do servidor' : 'campo erp_sync_token do config_db.json na mesma pasta do auth.php';
        sendJson(['error' => 'O token digitado não corresponde à ' . $source . '.'], 401);
    }
    if (strlen($password) < 10) sendJson(['error' => 'Use pelo menos 10 caracteres na senha.'], 400);
    $file = fopen($configFile, 'c+');
    if (!$file || !flock($file, LOCK_EX)) sendJson(['error' => 'Não foi possível salvar a configuração.'], 503);
    $raw = stream_get_contents($file);
    $saved = $raw === '' && $configReadStatus === 'missing' ? [] : decodeConfigDocument($raw);
    if ($saved === null) { fclose($file); sendJson(['error' => 'O config_db.json ficou inválido; nenhuma alteração foi salva.'], 503); }
    if (!empty($saved['admin_password_hash'])) { fclose($file); sendJson(['error' => 'Administrador já configurado.'], 409); }
    if (!hash_equals(erpSyncToken($saved), $data['setup_token'])) { fclose($file); sendJson(['error' => 'O token foi alterado durante a configuração. Atualize a página.'], 409); }
    $saved['admin_password_hash'] = password_hash($password, PASSWORD_DEFAULT);
    ftruncate($file, 0); rewind($file); fwrite($file, json_encode($saved, JSON_PRETTY_PRINT));
    fflush($file); flock($file, LOCK_UN); fclose($file);
} elseif ($operation === 'change-password') {
    requireAdminSession();
    if (strlen($password) < 10) sendJson(['error' => 'Use pelo menos 10 caracteres na senha.'], 400);
    $saved = $activeConfig;
    $saved['admin_password_hash'] = password_hash($password, PASSWORD_DEFAULT);
    if (file_put_contents($configFile, json_encode($saved, JSON_PRETTY_PRINT), LOCK_EX) === false) sendJson(['error' => 'Falha ao salvar.'], 503);
} elseif ($operation !== 'login' || !$hash || !password_verify($password, $hash)) {
    sendJson(['error' => 'Senha inválida ou administrador não configurado.'], 401);
}
file_put_contents($rateFile, json_encode(['start' => time(), 'attempts' => 0]), LOCK_EX);
session_regenerate_id(true);
$_SESSION['admin_until'] = time() + 3600;
$current = decodeConfigDocument(file_get_contents($configFile)) ?? [];
$_SESSION['admin_version'] = hash('sha256', $current['admin_password_hash'] ?? '');
sendJson(['success' => true, 'authenticated' => true]);
