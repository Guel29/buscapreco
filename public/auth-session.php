<?php
// Include after config.php. Authentication protects mutations on the server,
// rather than relying on a browser-local PIN.
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_name('buscapreco_admin');
    session_set_cookie_params(['httponly' => true, 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'samesite' => 'Strict', 'path' => '/']);
    session_start();
}
function adminAuthenticated() {
    global $activeConfig;
    $version = hash('sha256', $activeConfig['admin_password_hash'] ?? '');
    return !empty($_SESSION['admin_until']) && $_SESSION['admin_until'] > time() &&
        hash_equals($version, $_SESSION['admin_version'] ?? '');
}
function requireAdminSession() {
    if (!adminAuthenticated()) sendJson(['success' => false, 'error' => 'Autenticação administrativa necessária.'], 401);
    // SameSite cookies protect cross-site submissions; reject explicit foreign origins too.
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]) {
        sendJson(['success' => false, 'error' => 'Origem não autorizada.'], 403);
    }
}
