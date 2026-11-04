<?php
// Public metadata only. Never echo configuration values, tokens, hashes or passwords.
header('Cache-Control: no-store, max-age=0');
header('Content-Type: text/html; charset=UTF-8');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
$file = __DIR__ . '/config_db.json';
$exists = is_file($file);
$text = $exists ? @file_get_contents($file) : false;
$bom = is_string($text) && substr($text, 0, 3) === "\xEF\xBB\xBF";
$object = is_string($text) ? json_decode(preg_replace('/^\xEF\xBB\xBF/', '', $text)) : null;
$valid = is_object($object) && json_last_error() === JSON_ERROR_NONE;
$configuration = $valid ? (array)$object : [];
$environment = getenv('ERP_SYNC_TOKEN');
$fileToken = $configuration['erp_sync_token'] ?? null;
$fromEnvironment = is_string($environment) && $environment !== '';
$selectedToken = $fromEnvironment ? $environment : $fileToken;
$checks = [
    'Arquivo config_db.json encontrado nesta pasta' => $exists,
    'Arquivo pode ser lido pelo PHP' => $text !== false,
    'Conteúdo é um objeto JSON válido' => $valid,
    'Campo erp_sync_token é texto com pelo menos 32 caracteres' => is_string($fileToken) && strlen($fileToken) >= 32,
    'Variável ERP_SYNC_TOKEN presente no servidor' => $fromEnvironment,
    'Token selecionado pelo receptor ERP está configurado' => is_string($selectedToken) && strlen($selectedToken) >= 32,
    'Arquivo tem marca BOM UTF-8 (incompatível com versões antigas do aplicativo)' => $bom,
    'Existe um config_db.json.txt nesta pasta' => is_file(__DIR__ . '/config_db.json.txt'),
    'Administrador já configurado no arquivo' => is_string($configuration['admin_password_hash'] ?? null) && $configuration['admin_password_hash'] !== '',
];
?>
<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Diagnóstico de configuração — Busca Preço</title>
<style>body{font:16px system-ui;background:#101820;color:#eee;margin:30px auto;padding:20px;max-width:850px}table{border-collapse:collapse;width:100%}td{padding:12px;border-bottom:1px solid #455}td:last-child{font-weight:bold;white-space:nowrap}p{line-height:1.5;color:#ccd}</style>
<h1>Diagnóstico de configuração</h1>
<p>Esta página apenas lê os nomes dos campos e seu estado. Não altera a configuração, não testa senhas e não conta tentativas de login.</p>
<table><?php foreach ($checks as $label => $result): ?><tr><td><?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?></td><td><?= $result ? 'SIM' : 'NÃO' ?></td></tr><?php endforeach; ?></table>
<p>Arquivo verificado: <strong>config_db.json na mesma pasta desta página</strong>. A chave e as credenciais não são exibidas. Envie uma imagem desta tabela para identificar a correção necessária.</p>
<p>Depois do diagnóstico, remova este arquivo da hospedagem.</p>
</html>
