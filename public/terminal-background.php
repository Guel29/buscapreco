<?php
require_once __DIR__ . '/config.php';
header('Cache-Control: no-store');
$manifest = __DIR__ . '/.terminal-background.json';
$directory = __DIR__ . '/terminal-media';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_once __DIR__ . '/auth-session.php';
    requireAdminSession();
    $input = json_decode(file_get_contents('php://input'), true);
    $image = $input['image'] ?? '';
    if (!is_string($image) || strlen($image) > 8500000 || !preg_match('~^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=\\r\\n]+)$~D', $image, $match)) {
        sendJson(['error' => 'Selecione uma imagem PNG, JPG ou WebP de até 6 MB.'], 400);
    }
    $bytes = base64_decode($match[2], true);
    $details = $bytes === false ? false : @getimagesizefromstring($bytes);
    $mime = ['png' => 'image/png', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp'][$match[1]];
    if (!$details || strlen($bytes) > 6 * 1024 * 1024 || ($details['mime'] ?? '') !== $mime || $details[0] * $details[1] > 40000000) {
        sendJson(['error' => 'Imagem inválida ou muito grande. Use PNG, JPG ou WebP de até 6 MB.'], 400);
    }
    if (!is_dir($directory) && !@mkdir($directory, 0755, true)) sendJson(['error' => 'Não foi possível criar a pasta de imagens.'], 503);
    $name = 'default-' . hash('sha256', $bytes) . '.' . $match[1];
    if (file_put_contents($directory . '/' . $name, $bytes, LOCK_EX) !== strlen($bytes)) sendJson(['error' => 'Não foi possível salvar a imagem.'], 503);
    if (file_put_contents($manifest, json_encode(['file' => $name]), LOCK_EX) === false) sendJson(['error' => 'Não foi possível definir o fundo padrão.'], 503);
} elseif ($_SERVER['REQUEST_METHOD'] !== 'GET') sendJson(['error' => 'Método não permitido.'], 405);
$name = '';
$handle = @fopen($manifest, 'r');
if ($handle) {
    if (flock($handle, LOCK_SH)) { $saved = json_decode(stream_get_contents($handle), true); $name = $saved['file'] ?? ''; flock($handle, LOCK_UN); }
    fclose($handle);
}
$valid = is_string($name) && preg_match('/^default-[a-f0-9]{64}\.(png|jpeg|webp)$/D', $name) && is_file($directory . '/' . $name);
sendJson(['success' => true, 'url' => $valid ? 'terminal-media/' . $name : null]);
