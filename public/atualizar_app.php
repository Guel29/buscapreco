<?php
/**
 * ==============================================================================
 * ARQUIVO DE ATUALIZAÇÃO DO APP E BANCO DE DADOS - HOSTINGER
 * ==============================================================================
 * Subdomínio: buscapreco.instara.com.br
 * Função: Atualização do Catálogo, Reparo e Migração de Tabelas, e Diagnóstico
 * ==============================================================================
 */

// Configurações do Banco de Dados na Hostinger
$DB_HOST = 'localhost';
$DB_PORT = 3306;
$DB_NAME = 'u366235819_busca';   // Altere para o seu banco na Hostinger
$DB_USER = 'u366235819_busca';   // Altere para o seu usuário MySQL na Hostinger
$DB_PASS = 'SuaSenhaAqui';       // Altere para a sua senha na Hostinger
$SUBDOMINIO = 'buscapreco.instara.com.br';

date_default_timezone_set('America/Sao_Paulo');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

function getDatabaseConnection($host, $port, $name, $user, $pass) {
    try {
        $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
        ]);
        return $pdo;
    } catch (PDOException $e) {
        return ['error' => $e->getMessage()];
    }
}

function sendJsonResponse($data, $status = 200) {
    header("Content-Type: application/json; charset=UTF-8");
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

$db = getDatabaseConnection($DB_HOST, $DB_PORT, $DB_NAME, $DB_USER, $DB_PASS);
$action = isset($_GET['action']) ? strtolower(trim($_GET['action'])) : '';
$method = $_SERVER['REQUEST_METHOD'];

// Processamento de Requisições de Atualização via API ou POST
if ($method === 'POST' || !empty($action)) {
    if (is_array($db) && isset($db['error'])) {
        sendJsonResponse([
            'success' => false,
            'message' => 'Erro ao conectar no MySQL da Hostinger: ' . $db['error']
        ], 500);
    }

    // 1. Ação: Migrar / Reparar Tabelas
    if ($action === 'migrate' || $action === 'reparar_banco') {
        try {
            $sql = "
            CREATE TABLE IF NOT EXISTS `lojas` (
              `id` INT AUTO_INCREMENT PRIMARY KEY,
              `nome` VARCHAR(255) NOT NULL,
              `cnpj` VARCHAR(20) DEFAULT NULL,
              `endereco` VARCHAR(255) DEFAULT NULL,
              `ativa` TINYINT(1) NOT NULL DEFAULT 1,
              `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS `produtos` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `id_loja` INT NOT NULL DEFAULT 1,
              `codigo_interno` VARCHAR(50) NOT NULL,
              `codigo_barras` VARCHAR(50) NOT NULL,
              `descricao` VARCHAR(255) NOT NULL,
              `preco` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `preco_venda` DECIMAL(12,2) DEFAULT NULL,
              `embalagem` VARCHAR(20) NOT NULL DEFAULT 'UN',
              `ncm` VARCHAR(20) DEFAULT NULL,
              `hash` VARCHAR(64) DEFAULT NULL,
              `ativo` TINYINT(1) NOT NULL DEFAULT 1,
              `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              `ultima_sincronizacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              UNIQUE KEY `idx_loja_barras` (`id_loja`, `codigo_barras`),
              KEY `idx_barras` (`codigo_barras`),
              KEY `idx_loja` (`id_loja`),
              KEY `idx_codigo_interno` (`codigo_interno`),
              KEY `idx_ativo` (`ativo`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS `terminais` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `nome` VARCHAR(150) NOT NULL,
              `id_loja` INT NOT NULL DEFAULT 1,
              `identificador` VARCHAR(100) DEFAULT NULL,
              `modelo_etiqueta_padrao_id` VARCHAR(100) DEFAULT 'gondola-dupla-100x30',
              `impressora_id` VARCHAR(100) DEFAULT NULL,
              `ultima_conexao` DATETIME DEFAULT CURRENT_TIMESTAMP,
              `status` VARCHAR(20) DEFAULT 'ONLINE'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS `logs_sincronizacao` (
              `id` INT AUTO_INCREMENT PRIMARY KEY,
              `id_loja` INT NOT NULL DEFAULT 1,
              `data_hora` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `status` VARCHAR(20) NOT NULL,
              `produtos_analisados` INT DEFAULT 0,
              `produtos_atualizados` INT DEFAULT 0,
              `novos_produtos` INT DEFAULT 0,
              `tempo_ms` INT DEFAULT 0,
              `mensagem` TEXT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ";
            $db->exec($sql);
            sendJsonResponse([
                'success' => true,
                'message' => 'Estrutura do banco de dados verificada e atualizada com sucesso!'
            ]);
        } catch (Exception $e) {
            sendJsonResponse(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    // 2. Ação: Atualizar Catálogo via POST JSON
    if ($method === 'POST') {
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw, true) ?: $_POST;
        $items = $payload['items'] ?? [];
        $id_loja = isset($payload['id_loja']) ? (int)$payload['id_loja'] : 1;
        $now = date('Y-m-d H:i:s');
        $startTime = microtime(true);

        if (!is_array($items) || empty($items)) {
            sendJsonResponse(['error' => 'Nenhum produto enviado para atualização.'], 400);
        }

        try {
            $db->beginTransaction();
            $stmt = $db->prepare("
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

            $gravados = 0;
            foreach ($items as $item) {
                $intCode = trim($item['codigo_interno'] ?? $item['id_produto'] ?? '');
                $barcode = trim($item['codigo_barras'] ?? $item['codigobarras'] ?? $item['ean'] ?? '');
                $descricao = mb_strtoupper(trim($item['produto'] ?? $item['descricao'] ?? ''));
                $preco = (float)str_replace(',', '.', $item['preco_venda'] ?? $item['preco'] ?? 0);
                $embalagem = mb_strtoupper(trim($item['embalagem'] ?? 'UN'));
                $ncm = trim($item['ncm'] ?? '00000000');

                if (empty($descricao) || (empty($intCode) && empty($barcode))) continue;

                $codeKey = !empty($intCode) ? $intCode : $barcode;
                $barCodeFinal = !empty($barcode) ? $barcode : $codeKey;
                $id = $id_loja . '_' . $codeKey . '_' . $barCodeFinal;
                $hash = hash('sha256', "{$codeKey}|{$barCodeFinal}|{$descricao}|" . number_format($preco, 2, '.', '') . "|{$embalagem}|{$id_loja}");

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
                $gravados++;
            }

            $tempoMs = (int)((microtime(true) - $startTime) * 1000);
            $stmtLog = $db->prepare("INSERT INTO logs_sincronizacao (id_loja, data_hora, status, produtos_analisados, produtos_atualizados, novos_produtos, tempo_ms, mensagem) VALUES (:id_loja, :data_hora, 'SUCESSO', :total, :total, 0, :tempo, :msg)");
            $stmtLog->execute([
                ':id_loja' => $id_loja,
                ':data_hora' => $now,
                ':total' => $gravados,
                ':tempo' => $tempoMs,
                ':msg' => "Atualizador processou {$gravados} produtos com sucesso."
            ]);

            $db->commit();
            sendJsonResponse([
                'success' => true,
                'message' => "Atualização concluída: {$gravados} produtos salvos com sucesso!",
                'total_gravados' => $gravados,
                'tempo_ms' => $tempoMs
            ]);
        } catch (Exception $e) {
            if ($db->inTransaction()) $db->rollBack();
            sendJsonResponse(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }
}

// Visualização Web do Atualizador
$dbOk = !is_array($db) || !isset($db['error']);
$totalAtivos = 0;
if ($dbOk) {
    try {
        $st = $db->query("SELECT COUNT(*) as c FROM produtos WHERE ativo = 1");
        $totalAtivos = (int)($st->fetch()['c'] ?? 0);
    } catch(Exception $e) {}
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Atualizador do App · <?= htmlspecialchars($SUBDOMINIO) ?></title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-neutral-950 text-neutral-100 min-h-screen p-6 font-sans">
    <div class="max-w-2xl mx-auto bg-neutral-900 border border-neutral-800 rounded-3xl p-8 space-y-6 shadow-2xl">
        <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl">
                ⚡
            </div>
            <div>
                <h1 class="text-xl font-black text-white">Atualizador do Sistema Busca Preço</h1>
                <p class="text-xs text-neutral-400">Hostinger · <?= htmlspecialchars($SUBDOMINIO) ?></p>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
            <div class="bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
                <span class="text-xs text-neutral-500 font-bold uppercase">Status do Banco</span>
                <div class="text-lg font-bold <?= $dbOk ? 'text-emerald-400' : 'text-rose-400' ?> mt-1">
                    <?= $dbOk ? '● Conectado e Ativo' : '● Erro de Conexão' ?>
                </div>
            </div>
            <div class="bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
                <span class="text-xs text-neutral-500 font-bold uppercase">Produtos no Banco</span>
                <div class="text-lg font-bold text-amber-400 mt-1 font-mono">
                    <?= $totalAtivos ?> produtos
                </div>
            </div>
        </div>

        <div class="space-y-3">
            <h2 class="text-sm font-bold text-white">Ferramentas de Manutenção:</h2>
            <div class="flex flex-col sm:flex-row gap-3">
                <button onclick="executarReparo()" class="flex-1 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition">
                    🔧 Verificar / Reparar Tabelas MySQL
                </button>
                <a href="index.php" class="flex-1 px-4 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs text-center transition flex items-center justify-center">
                    🔍 Abrir Terminal Busca Preço
                </a>
            </div>
        </div>

        <div id="resultadoBox" class="hidden p-4 rounded-xl text-xs font-mono"></div>
    </div>

    <script>
        async function executarReparo() {
            const box = document.getElementById('resultadoBox');
            box.className = 'p-4 rounded-xl text-xs font-mono bg-neutral-800 text-neutral-300';
            box.innerText = 'Processando reparo e migração das tabelas...';
            box.classList.remove('hidden');

            try {
                const res = await fetch('?action=reparar_banco');
                const data = await res.json();
                if (data.success) {
                    box.className = 'p-4 rounded-xl text-xs font-mono bg-emerald-950/80 border border-emerald-500/40 text-emerald-300';
                    box.innerText = '✅ ' + data.message;
                    setTimeout(() => location.reload(), 1500);
                } else {
                    box.className = 'p-4 rounded-xl text-xs font-mono bg-rose-950/80 border border-rose-500/40 text-rose-300';
                    box.innerText = '❌ Erro: ' + (data.message || 'Falha ao executar reparo.');
                }
            } catch (e) {
                box.className = 'p-4 rounded-xl text-xs font-mono bg-rose-950/80 border border-rose-500/40 text-rose-300';
                box.innerText = '❌ Erro de requisição: ' + e.message;
            }
        }
    </script>
</body>
</html>
