<?php
/**
 * ==============================================================================
 * SCRIPT DE ATUALIZAÇÃO AUTOMÁTICA DE PRODUTOS - HOSTINGER
 * ==============================================================================
 * Este arquivo recebe cargas de dados via POST do Agente Windows, ERP ou Webhook
 * e atualiza diretamente as tabelas do MySQL na Hostinger.
 */

require_once __DIR__ . '/config.php';

$pdo = getDbConnection(null, true);

// Se pdo for nulo, tenta recarregar do config_db.json
if (!$pdo && file_exists(__DIR__ . '/config_db.json')) {
    $cfgJson = @json_decode(@file_get_contents(__DIR__ . '/config_db.json'), true);
    if ($cfgJson) {
        $pdo = getDbConnection($cfgJson, true);
    }
}

if (!$pdo) {
    sendJson([
        'success' => false,
        'error' => 'BANCO_NAO_CONECTADO',
        'message' => 'Não foi possível conectar ao banco MySQL Hostinger. Verifique as credenciais no painel.'
    ], 500);
}

// Aceita requisições POST com JSON ou Multipart Form
$rawInput = file_get_contents('php://input');
$payload = json_decode($rawInput, true);

if (!$payload && isset($_POST['data'])) {
    $payload = json_decode($_POST['data'], true);
}

if (!$payload || !isset($payload['items']) || !is_array($payload['items'])) {
    sendJson([
        'success' => false,
        'message' => 'Nenhum dado de produto recebido. Envie um JSON no formato: {"id_loja": 1, "items": [...]}'
    ], 400);
}

$id_loja = isset($payload['id_loja']) ? (int)$payload['id_loja'] : 1;
$items = $payload['items'];
$is_full_sync = !empty($payload['is_full_sync']);
$now = date('Y-m-d H:i:s');
$startTime = microtime(true);

try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
        INSERT INTO produtos (
            id, id_loja, codigo_interno, codigo_barras, descricao,
            preco, preco_venda, embalagem, ncm, hash, ativo, atualizado_em, ultima_sincronizacao
        ) VALUES (
            :id, :id_loja, :codigo_interno, :codigo_barras, :descricao,
            :preco, :preco_venda, :embalagem, :ncm, :hash, 1, :atualizado_em, :ultima_sincronizacao
        ) ON DUPLICATE KEY UPDATE
            descricao = VALUES(descricao),
            preco = VALUES(preco),
            preco_venda = VALUES(preco_venda),
            embalagem = VALUES(embalagem),
            ncm = VALUES(ncm),
            hash = VALUES(hash),
            ativo = 1,
            atualizado_em = VALUES(atualizado_em),
            ultima_sincronizacao = VALUES(ultima_sincronizacao)
    ");

    $adicionados = 0;
    $barcodes = [];

    foreach ($items as $item) {
        $codigo_interno = trim(preg_replace('/^_+|_+$/', '', trim($item['codigo_interno'] ?? $item['id_produto'] ?? $item['Codigo Interno'] ?? $item['codigo interno'] ?? '')));
        $codigo_barras = trim(preg_replace('/^_+|_+$/', '', trim($item['codigo_barras'] ?? $item['codigobarras'] ?? $item['Codigo de Barras'] ?? $item['codigo de barras'] ?? $item['ean'] ?? '')));
        $descricao = mb_strtoupper(trim($item['produto'] ?? $item['descricao'] ?? $item['descricaocompleta'] ?? $item['Produto'] ?? $item['nome'] ?? ''));
        $rawPreco = str_replace(['R$', ' '], '', (string)($item['preco_venda'] ?? $item['preco'] ?? $item['precovenda'] ?? $item['Preco Venda'] ?? $item['preco venda'] ?? 0));
        $preco = (float)str_replace(',', '.', $rawPreco);
        $embalagem = mb_strtoupper(trim($item['embalagem'] ?? $item['Embalagem'] ?? $item['tipoembalagem_desc'] ?? 'UN'));
        $ncm = trim($item['ncm'] ?? $item['NCM'] ?? '00000000');

        if (empty($descricao) || (empty($codigo_interno) && empty($codigo_barras))) {
            continue;
        }

        $codeKey = !empty($codigo_interno) ? $codigo_interno : $codigo_barras;
        $barCodeFinal = !empty($codigo_barras) ? $codigo_barras : $codeKey;
        $id = $id_loja . '_' . $codeKey . '_' . $barCodeFinal;

        $hashContent = "{$codeKey}|{$barCodeFinal}|{$descricao}|" . number_format($preco, 2, '.', '') . "|{$embalagem}|{$id_loja}";
        $hash = hash('sha256', $hashContent);

        $stmt->execute([
            ':id' => $id,
            ':id_loja' => $id_loja,
            ':codigo_interno' => $codeKey,
            ':codigo_barras' => $barCodeFinal,
            ':descricao' => $descricao,
            ':preco' => $preco,
            ':preco_venda' => $preco,
            ':embalagem' => $embalagem ?: 'UN',
            ':ncm' => $ncm ?: '00000000',
            ':hash' => $hash,
            ':atualizado_em' => $now,
            ':ultima_sincronizacao' => $now
        ]);

        $adicionados++;
        $barcodes[] = $barCodeFinal;
    }

    $desativados = 0;
    if ($is_full_sync && count($barcodes) > 0) {
        // Inativar produtos ausentes
        $inClause = implode(',', array_map(function($b) use ($pdo) { return $pdo->quote($b); }, array_slice($barcodes, 0, 5000)));
        $desativados = $pdo->exec("UPDATE produtos SET ativo = 0, atualizado_em = '{$now}' WHERE id_loja = {$id_loja} AND codigo_barras NOT IN ({$inClause})");
    }

    $tempoMs = (int)((microtime(true) - $startTime) * 1000);

    // Registrar log
    $stmtLog = $pdo->prepare("INSERT INTO logs_sincronizacao (id_loja, data_hora, status, produtos_analisados, produtos_atualizados, novos_produtos, tempo_ms, mensagem) VALUES (:id_loja, :data_hora, 'SUCESSO', :total, :total, 0, :tempo, :msg)");
    $stmtLog->execute([
        ':id_loja' => $id_loja,
        ':data_hora' => $now,
        ':total' => $adicionados,
        ':tempo' => $tempoMs,
        ':msg' => "Atualização executada: {$adicionados} produtos gravados no banco Hostinger."
    ]);

    $pdo->commit();

    sendJson([
        'success' => true,
        'message' => "Carga concluída: {$adicionados} produtos gravados com sucesso!",
        'total_gravados' => $adicionados,
        'desativados' => $desativados,
        'tempo_execucao_ms' => $tempoMs,
        'data_hora' => $now
    ], 200);

} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    sendJson([
        'success' => false,
        'message' => 'Erro ao processar atualização no MySQL Hostinger: ' . $e->getMessage()
    ], 500);
}
