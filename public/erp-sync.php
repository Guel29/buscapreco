<?php
// Authenticated, staged VR snapshots. Public product queries remain in api.php.
require_once __DIR__ . '/config.php';
header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') sendJson(['success' => false, 'error' => 'Use POST.'], 405);
$token = getenv('ERP_SYNC_TOKEN') ?: ($activeConfig['erp_sync_token'] ?? '');
if (strlen($token) < 32) sendJson(['success' => false, 'error' => 'Integração não configurada.'], 503);
if (!hash_equals($token, $_SERVER['HTTP_X_ERP_TOKEN'] ?? '')) sendJson(['success' => false, 'error' => 'Não autorizado.'], 401);
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) sendJson(['success' => false, 'error' => 'JSON inválido.'], 400);
$sync = $input['sync_id'] ?? '';
$store = $input['id_loja'] ?? 0;
$total = $input['total'] ?? 0;
$operation = $input['operation'] ?? '';
if (!is_string($sync) || !preg_match('/^[a-f0-9-]{36}$/D', $sync) || !is_int($store) || $store < 1 ||
    !is_int($total) || $total < 1 || $total > 500000 || !in_array($operation, ['batch', 'commit'], true)) {
    sendJson(['success' => false, 'error' => 'Carga inválida.'], 400);
}
if ($store !== (int)($activeConfig['erp_sync_loja'] ?? 1)) sendJson(['success' => false, 'error' => 'Loja não autorizada.'], 403);
$items = [];
if ($operation === 'batch') {
    if (!isset($input['items']) || !is_array($input['items']) || count($input['items']) < 1 || count($input['items']) > 500) {
        sendJson(['success' => false, 'error' => 'Lote inválido.'], 400);
    }
    foreach ($input['items'] as $row) {
        if (!is_array($row)) sendJson(['success' => false, 'error' => 'Produto inválido.'], 400);
        foreach (['codigo_interno' => 50, 'codigo_barras' => 50, 'descricao' => 255, 'embalagem' => 20] as $key => $limit) {
            if (!isset($row[$key]) || !is_string($row[$key]) || trim($row[$key]) === '' || mb_strlen($row[$key]) > $limit) {
                sendJson(['success' => false, 'error' => 'Campos de produto inválidos.'], 400);
            }
        }
        if (!isset($row['preco']) || !is_numeric($row['preco']) || !is_finite((float)$row['preco']) || $row['preco'] < 0 || $row['preco'] > 99999999.99) {
            sendJson(['success' => false, 'error' => 'Preço inválido.'], 400);
        }
        $row['id'] = hash('sha256', json_encode([$store, $row['codigo_interno'], $row['codigo_barras']]));
        $items[] = $row;
    }
}
$pdo = getDbConnection(null, true);
if (!$pdo) sendJson(['success' => false, 'error' => 'Banco indisponível.'], 503);
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS erp_cargas (
        sync_id CHAR(36) PRIMARY KEY, id_loja INT NOT NULL, total INT NOT NULL,
        concluida TINYINT NOT NULL DEFAULT 0, criada_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX por_loja(id_loja,concluida,criada_em)
    ) ENGINE=InnoDB");
    $pdo->exec("CREATE TABLE IF NOT EXISTS erp_carga_itens (
        sync_id CHAR(36) NOT NULL, id CHAR(64) NOT NULL, codigo_interno VARCHAR(50) NOT NULL,
        codigo_barras VARCHAR(50) NOT NULL, descricao VARCHAR(255) NOT NULL,
        preco DECIMAL(12,2) NOT NULL, embalagem VARCHAR(20) NOT NULL,
        PRIMARY KEY(sync_id, id), UNIQUE KEY ean_por_carga(sync_id,codigo_barras)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec('DELETE i FROM erp_carga_itens i JOIN erp_cargas c ON c.sync_id=i.sync_id WHERE c.criada_em < NOW() - INTERVAL 1 HOUR');
    $pdo->exec('DELETE FROM erp_cargas WHERE criada_em < NOW() - INTERVAL 1 DAY');
    $pdo->beginTransaction();
    if ($operation === 'batch') {
        $q = $pdo->prepare('INSERT IGNORE INTO erp_cargas(sync_id,id_loja,total) VALUES(?,?,?)');
        $q->execute([$sync, $store, $total]);
    }
    $q = $pdo->prepare('SELECT *, criada_em < NOW() - INTERVAL 1 HOUR AS expirada FROM erp_cargas WHERE sync_id=? FOR UPDATE');
    $q->execute([$sync]);
    $run = $q->fetch();
    if (!$run || (int)$run['id_loja'] !== $store || (int)$run['total'] !== $total || $run['expirada']) {
        $pdo->rollBack(); sendJson(['success' => false, 'error' => 'Carga ausente, expirada ou incompatível.'], 409);
    }
    if ($run['concluida']) {
        $pdo->commit(); sendJson(['success' => true, 'total_processados' => $total]);
    }
    if ($operation === 'batch') {
        $q = $pdo->prepare('INSERT INTO erp_carga_itens(sync_id,id,codigo_interno,codigo_barras,descricao,preco,embalagem)
            VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE descricao=VALUES(descricao),preco=VALUES(preco),embalagem=VALUES(embalagem)');
        foreach ($items as $row) $q->execute([$sync,$row['id'],$row['codigo_interno'],$row['codigo_barras'],$row['descricao'],$row['preco'],$row['embalagem']]);
        $pdo->commit(); sendJson(['success' => true, 'recebidos' => count($items)]);
    }
    $q = $pdo->prepare('SELECT COUNT(*) FROM erp_carga_itens WHERE sync_id=?');
    $q->execute([$sync]);
    if ((int)$q->fetchColumn() !== $total) {
        $pdo->rollBack(); sendJson(['success' => false, 'error' => 'Carga incompleta; catálogo preservado.'], 409);
    }
    // Serialize commits for a store. An older snapshot must never overwrite a newer one.
    $q = $pdo->prepare('SELECT id FROM lojas WHERE id=? FOR UPDATE'); $q->execute([$store]);
    if (!$q->fetch()) { $pdo->rollBack(); sendJson(['success' => false, 'error' => 'Cadastre a loja primeiro.'], 409); }
    $q = $pdo->prepare('SELECT sync_id FROM erp_cargas WHERE id_loja=? AND concluida=1 AND criada_em>? LIMIT 1');
    $q->execute([$store,$run['criada_em']]);
    if ($q->fetch()) { $pdo->rollBack(); sendJson(['success' => false, 'error' => 'Carga substituída por uma mais recente.'], 409); }
    $q = $pdo->prepare('UPDATE produtos SET ativo=0 WHERE id_loja=?'); $q->execute([$store]);
    $q = $pdo->prepare("INSERT INTO produtos(id,id_loja,codigo_interno,codigo_barras,descricao,preco,preco_venda,embalagem,ncm,ativo,atualizado_em,ultima_sincronizacao)
        SELECT id,?,codigo_interno,codigo_barras,descricao,preco,preco,embalagem,'',1,NOW(),NOW() FROM erp_carga_itens WHERE sync_id=?
        ON DUPLICATE KEY UPDATE codigo_interno=VALUES(codigo_interno),codigo_barras=VALUES(codigo_barras),descricao=VALUES(descricao),
        preco=VALUES(preco),preco_venda=VALUES(preco_venda),embalagem=VALUES(embalagem),ativo=1,atualizado_em=NOW(),ultima_sincronizacao=NOW()");
    $q->execute([$store,$sync]);
    $q = $pdo->prepare("INSERT INTO logs_sincronizacao(id_loja,status,produtos_analisados,produtos_atualizados,mensagem) VALUES(?,'SUCESSO',?,?,?)");
    $q->execute([$store,$total,$total,'Carga VR confirmada: ' . $sync]);
    $q = $pdo->prepare('UPDATE erp_cargas SET concluida=1 WHERE sync_id=?'); $q->execute([$sync]);
    $q = $pdo->prepare('DELETE FROM erp_carga_itens WHERE sync_id=?'); $q->execute([$sync]);
    $pdo->commit();
    sendJson(['success' => true, 'total_processados' => $total]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Falha na carga ERP: ' . get_class($e));
    sendJson(['success' => false, 'error' => 'Carga não concluída; verifique a instalação do banco.'], 500);
}
