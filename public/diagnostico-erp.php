<?php
// Read-only metadata. Never emit PDO messages, credentials or product values.
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth-session.php';
header('Cache-Control: no-store');
requireAdminSession();
$report = ['diagnostico' => 'Receptor ERP — somente leitura', 'php' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION,
    'mbstring' => function_exists('mb_strlen'), 'pdo_mysql' => extension_loaded('pdo_mysql')];
$pdo = getDbConnection(null, true);
if (!$pdo) { $report['conexao_mysql'] = false; sendJson($report); }
$report['conexao_mysql'] = true;
try {
    $pdo->exec('SET TRANSACTION READ ONLY');
    $pdo->beginTransaction();
    $q = $pdo->query("SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('lojas','produtos','logs_sincronizacao','erp_cargas','erp_carga_itens') ORDER BY TABLE_NAME");
    $report['tabelas'] = $q->fetchAll();
    $q = $pdo->query("SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('lojas','produtos','logs_sincronizacao','erp_cargas','erp_carga_itens') ORDER BY TABLE_NAME,ORDINAL_POSITION");
    // Defaults can contain business data in customized databases; omit values.
    $report['colunas'] = array_map(function ($row) { unset($row['COLUMN_DEFAULT']); return $row; }, $q->fetchAll());
    $q = $pdo->prepare('SELECT COUNT(*) FROM lojas WHERE id=?');
    $q->execute([(int)($activeConfig['erp_sync_loja'] ?? 1)]);
    $report['loja_configurada_existe'] = (int)$q->fetchColumn() > 0;
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $report['falha_leitura'] = $error instanceof PDOException ? ['sqlstate' => $error->errorInfo[0] ?? null, 'codigo' => $error->errorInfo[1] ?? null] : 'FALHA_INTERNA';
}
sendJson($report);
