<?php
/**
 * ==============================================================================
 * API REST MYSQL - CENTRAL DE CONSULTA DE PREÇOS HOSTINGER
 * ==============================================================================
 * Subdomínio: buscapreco.instara.com.br
 * ==============================================================================
 */

require_once __DIR__ . '/config.php';

// Tenta obter conexão sem interromper o script caso ainda esteja sendo configurado
$pdo = getDbConnection(null, true);

// Se pdo for nulo, tenta recarregar do config_db.json
if (!$pdo && file_exists(__DIR__ . '/config_db.json')) {
    $cfgJson = @json_decode(@file_get_contents(__DIR__ . '/config_db.json'), true);
    if ($cfgJson) {
        $pdo = getDbConnection($cfgJson, true);
    }
}

// Garante que as tabelas necessárias existam no MySQL automaticamente
function ensureTablesExist($pdo) {
    if (!$pdo) return;
    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS lojas (
                id INT PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                cnpj VARCHAR(30) DEFAULT '00.000.000/0000-00',
                endereco VARCHAR(255) DEFAULT 'Endereço da Loja',
                ativa TINYINT(1) DEFAULT 1,
                subdominio VARCHAR(100) DEFAULT 'buscapreco.instara.com.br',
                criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS terminais (
                id VARCHAR(50) PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                id_loja INT NOT NULL DEFAULT 1,
                identificador VARCHAR(50) DEFAULT 'TERM-01',
                modelo_etiqueta_padrao_id VARCHAR(100) DEFAULT 'gondola-dupla-100x30',
                impressora_id VARCHAR(100) DEFAULT 'argox-os214-01',
                status VARCHAR(20) DEFAULT 'ONLINE',
                versao VARCHAR(20) DEFAULT '3.0.0',
                ultima_conexao DATETIME DEFAULT CURRENT_TIMESTAMP,
                ultima_sincronizacao DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS produtos (
                id VARCHAR(100) PRIMARY KEY,
                id_loja INT NOT NULL DEFAULT 1,
                codigo_interno VARCHAR(50) NOT NULL,
                codigo_barras VARCHAR(50) NOT NULL,
                descricao VARCHAR(255) NOT NULL,
                preco DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                preco_venda DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                embalagem VARCHAR(20) DEFAULT 'UN',
                ncm VARCHAR(20) DEFAULT '00000000',
                hash VARCHAR(64) DEFAULT NULL,
                ativo TINYINT(1) DEFAULT 1,
                atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                ultima_sincronizacao DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_busca (id_loja, codigo_barras, ativo),
                INDEX idx_interno (id_loja, codigo_interno, ativo),
                INDEX idx_desc (id_loja, descricao, ativo)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS logs_sincronizacao (
                id INT PRIMARY KEY AUTO_INCREMENT,
                id_loja INT NOT NULL DEFAULT 1,
                data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(20) NOT NULL DEFAULT 'SUCESSO',
                produtos_analisados INT DEFAULT 0,
                produtos_atualizados INT DEFAULT 0,
                novos_produtos INT DEFAULT 0,
                tempo_ms INT DEFAULT 0,
                mensagem TEXT DEFAULT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS configuracao_erp (
                id INT PRIMARY KEY DEFAULT 1,
                nome_loja VARCHAR(100) DEFAULT 'Supermercado Modelo · Loja 01',
                host VARCHAR(100) DEFAULT 'localhost',
                port INT DEFAULT 8745,
                `database` VARCHAR(100) DEFAULT 'vr',
                user VARCHAR(100) DEFAULT 'postgres',
                password VARCHAR(255) DEFAULT '',
                ssl TINYINT(1) DEFAULT 0,
                id_loja INT DEFAULT 1,
                id_situacaocadastro INT DEFAULT 1,
                intervalo_minutos INT DEFAULT 10,
                sincronizacao_automatica TINYINT(1) DEFAULT 1,
                custom_query TEXT DEFAULT NULL,
                atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS configuracao_mysql (
                id INT PRIMARY KEY DEFAULT 1,
                host VARCHAR(100) DEFAULT 'localhost',
                port INT DEFAULT 3306,
                `database` VARCHAR(100) DEFAULT '',
                user VARCHAR(100) DEFAULT '',
                password VARCHAR(255) DEFAULT '',
                enabled TINYINT(1) DEFAULT 1,
                atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Insere Loja 1 padrão se não existir nenhuma
        $stmtCount = $pdo->query("SELECT COUNT(*) as c FROM lojas");
        $rowCount = $stmtCount->fetch();
        if (($rowCount['c'] ?? 0) == 0) {
            $pdo->exec("INSERT IGNORE INTO lojas (id, nome, cnpj, endereco, ativa) VALUES (1, 'Supermercado Modelo · Loja 01 (Matriz)', '00.000.000/0001-00', 'Av. Principal, 1000 - Centro', 1)");
        }
    } catch (Exception $e) {
        // Prossegue mesmo se tabela já existir
    }
}

if ($pdo) {
    ensureTablesExist($pdo);
}

$action = isset($_GET['action']) ? trim($_GET['action']) : 'status';
// Normaliza ação para remover leading/trailing slashes
$action = trim($action, '/');
$method = $_SERVER['REQUEST_METHOD'];

// Captura payload JSON de requisições POST/PUT
$inputJSON = file_get_contents('php://input');
$inputData = json_decode($inputJSON, true) ?: $_POST;

switch ($action) {

    // --------------------------------------------------------------------------
    // 0. DIAGNÓSTICO DO BANCO DE DADOS
    // Ex: api.php?action=diagnostic
    // --------------------------------------------------------------------------
    case 'diagnostic':
    case 'db-status':
    case 'mysql/status':
        $lastErr = getLastDbError();
        sendJson([
            'success' => $pdo !== null,
            'banco_online' => $pdo !== null,
            'host' => DB_HOST,
            'port' => DB_PORT,
            'database' => DB_NAME,
            'user' => DB_USER,
            'has_password' => !empty(DB_PASS),
            'erro_conexao' => $lastErr,
            'mensagem' => $pdo !== null ? 'Conexão com MySQL Hostinger ativa e operacional!' : 'MySQL não conectado: ' . ($lastErr ?: 'Verifique usuário e senha no painel ou config_db.json'),
            'php_version' => phpversion(),
            'hora_servidor' => date('d/m/Y H:i:s')
        ], 200);
        break;

    // --------------------------------------------------------------------------
    // 1. BUSCA DE PRODUTO (BUSCA ESTRITA: SOMENTE CÓDIGO DE BARRAS / EAN OU CÓDIGO INTERNO)
    // Ex: api.php?action=search&q=7891000100101&id_loja=1
    // --------------------------------------------------------------------------
    case 'search':
    case 'products/search':
        $q = isset($_GET['q']) ? trim($_GET['q']) : '';
        // Normalização de Leitor USB: remove prefixos AIM (ex: ]E0) e prefixo/sufixo '_' comum em certos leitores
        $q = preg_replace('/^\][a-zA-Z0-9]{2}/', '', $q);
        $q = trim($q, "_\t\n\r\0\x0B ");
        $id_loja = isset($_GET['id_loja']) ? (int)$_GET['id_loja'] : 1;

        if (empty($q)) {
            sendJson(['error' => 'Código EAN ou Código Interno não informado.'], 400);
        }

        if (!$pdo) {
            sendJson([
                'error' => 'BANCO_NAO_CONECTADO',
                'mensagem' => 'Banco de dados MySQL Hostinger desconectado: ' . (getLastDbError() ?: 'Configure as credenciais no painel.')
            ], 503);
        }

        // Prioridade 1: Código de Barras (EAN) Exato
        $stmt = $pdo->prepare("SELECT * FROM produtos WHERE id_loja = :id_loja AND codigo_barras = :q AND ativo = 1 LIMIT 1");
        $stmt->execute([':id_loja' => $id_loja, ':q' => $q]);
        $prod = $stmt->fetch();

        // Prioridade 2: Código Interno Exato
        if (!$prod) {
            $stmt = $pdo->prepare("SELECT * FROM produtos WHERE id_loja = :id_loja AND codigo_interno = :q AND ativo = 1 LIMIT 1");
            $stmt->execute([':id_loja' => $id_loja, ':q' => $q]);
            $prod = $stmt->fetch();
        }

        // Prioridade 3: Se numérico, comparar sem zeros à esquerda (ex: 00123 vs 123)
        if (!$prod && ctype_digit($q)) {
            $unpadded = ltrim($q, '0');
            if (!empty($unpadded)) {
                $stmt = $pdo->prepare("SELECT * FROM produtos WHERE id_loja = :id_loja AND (TRIM(LEADING '0' FROM codigo_barras) = :unpadded OR TRIM(LEADING '0' FROM codigo_interno) = :unpadded) AND ativo = 1 LIMIT 1");
                $stmt->execute([':id_loja' => $id_loja, ':unpadded' => $unpadded]);
                $prod = $stmt->fetch();
            }
        }

        if ($prod) {
            $prod['preco'] = (float)$prod['preco'];
            $prod['preco_venda'] = $prod['preco_venda'] !== null ? (float)$prod['preco_venda'] : (float)$prod['preco'];
            $prod['produto'] = $prod['descricao'];
            $prod['ativo'] = (bool)$prod['ativo'];
            sendJson($prod, 200);
        }

        // Verificar se está inativo (estritamente por código EAN/Interno)
        $stmt = $pdo->prepare("SELECT descricao, codigo_interno, codigo_barras FROM produtos WHERE id_loja = :id_loja AND (codigo_barras = :q OR codigo_interno = :q) AND ativo = 0 LIMIT 1");
        $stmt->execute([':id_loja' => $id_loja, ':q' => $q]);
        $inactive = $stmt->fetch();

        if ($inactive) {
            sendJson(['error' => 'PRODUTO INATIVO NO CADASTRO', 'descricao' => $inactive['descricao']], 404);
        }

        sendJson(['error' => 'PRODUTO NÃO ENCONTRADO'], 404);
        break;

    // --------------------------------------------------------------------------
    // 2. LISTAR TODOS OS PRODUTOS / LIMPAR PRODUTOS
    // Ex: api.php?action=products&id_loja=1
    // --------------------------------------------------------------------------
    case 'products':
    case 'produtos':
        $id_loja = isset($_GET['id_loja']) ? (int)$_GET['id_loja'] : 1;

        if (!$pdo) {
            sendJson([], 200);
        }

        if ($method === 'DELETE') {
            $stmt = $pdo->prepare("DELETE FROM produtos WHERE id_loja = :id_loja");
            $stmt->execute([':id_loja' => $id_loja]);
            $count = $stmt->rowCount();
            sendJson([
                'success' => true,
                'message' => "Base de produtos da Loja {$id_loja} zerada com sucesso! {$count} produtos removidos.",
                'total_removidos' => $count
            ], 200);
            break;
        }

        $includeInactives = isset($_GET['include_inactives']) && $_GET['include_inactives'] === 'true';

        $sql = "SELECT * FROM produtos WHERE id_loja = :id_loja";
        if (!$includeInactives) {
            $sql .= " AND ativo = 1";
        }
        $sql .= " ORDER BY descricao ASC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([':id_loja' => $id_loja]);
        $rows = $stmt->fetchAll();

        $result = [];
        foreach ($rows as $r) {
            $result[] = [
                'id' => $r['id'],
                'id_loja' => (int)$r['id_loja'],
                'codigo_interno' => $r['codigo_interno'],
                'codigo_barras' => $r['codigo_barras'],
                'descricao' => $r['descricao'],
                'produto' => $r['descricao'],
                'preco' => (float)$r['preco'],
                'preco_venda' => $r['preco_venda'] !== null ? (float)$r['preco_venda'] : (float)$r['preco'],
                'embalagem' => $r['embalagem'],
                'ncm' => $r['ncm'],
                'hash' => $r['hash'],
                'ativo' => (bool)$r['ativo'],
                'atualizado_em' => $r['atualizado_em'],
                'ultima_sincronizacao' => $r['ultima_sincronizacao']
            ];
        }

        sendJson($result, 200);
        break;

    // --------------------------------------------------------------------------
    // 2.1 ZERAR / LIMPAR BASE DE PRODUTOS
    // Ex: api.php?action=products/all ou action=limpar-produtos
    // --------------------------------------------------------------------------
    case 'products/all':
    case 'limpar-produtos':
    case 'zerar-produtos':
    case 'zerar-base':
    case 'wipe-products':
        $id_loja = isset($_GET['id_loja']) ? (int)$_GET['id_loja'] : (isset($inputData['id_loja']) ? (int)$inputData['id_loja'] : 0);

        if (!$pdo) {
            sendJson([
                'success' => false,
                'message' => 'Banco de dados não conectado para zerar produtos.'
            ], 200);
            break;
        }

        if ($id_loja > 0) {
            $stmt = $pdo->prepare("DELETE FROM produtos WHERE id_loja = :id_loja");
            $stmt->execute([':id_loja' => $id_loja]);
            $count = $stmt->rowCount();
        } else {
            $count = $pdo->exec("DELETE FROM produtos");
        }

        $now = date('Y-m-d H:i:s');
        try {
            $stmtLog = $pdo->prepare("INSERT INTO logs_sincronizacao (id_loja, data_hora, status, produtos_analisados, produtos_atualizados, novos_produtos, tempo_ms, mensagem) VALUES (:id_loja, :data_hora, 'LIMPEZA', :total, 0, 0, 0, :msg)");
            $stmtLog->execute([
                ':id_loja' => $id_loja ?: 1,
                ':data_hora' => $now,
                ':total' => $count,
                ':msg' => "Base de produtos zerada ({$count} registros excluídos)."
            ]);
        } catch (Exception $e) {}

        sendJson([
            'success' => true,
            'message' => "Base de produtos zerada com sucesso! {$count} produtos foram excluídos.",
            'total_removidos' => $count,
            'total_restante' => 0
        ], 200);
        break;

    // --------------------------------------------------------------------------
    // 3. STATUS DO SERVIDOR E CONTAGEM
    // Ex: api.php?action=status&id_loja=1
    // --------------------------------------------------------------------------
    case 'status':
        $id_loja = isset($_GET['id_loja']) ? (int)$_GET['id_loja'] : 1;

        if (!$pdo) {
            $lastErr = getLastDbError();
            sendJson([
                'success' => true,
                'banco_online' => false,
                'banco_erro' => $lastErr ?: 'Credenciais do banco ainda não configuradas.',
                'mensagem' => 'Aguardando configuração das credenciais do MySQL na Hostinger.',
                'servidor' => 'Hostinger PHP API',
                'loja_atual' => $id_loja,
                'nome_loja' => 'Supermercado Modelo · Loja ' . $id_loja,
                'total_produtos' => 0,
                'total_produtos_ativos' => 0,
                'total_produtos_inativos' => 0,
                'ultima_sincronizacao' => null,
                'hora_servidor' => date('d/m/Y H:i:s')
            ], 200);
            break;
        }

        $stmt = $pdo->prepare("SELECT COUNT(*) as total, SUM(CASE WHEN ativo = 1 THEN 1 ELSE 0 END) as ativos, SUM(CASE WHEN ativo = 0 THEN 1 ELSE 0 END) as inativos, MAX(atualizado_em) as ultima_atualizacao FROM produtos WHERE id_loja = :id_loja");
        $stmt->execute([':id_loja' => $id_loja]);
        $counts = $stmt->fetch();

        $stmtStore = $pdo->prepare("SELECT nome FROM lojas WHERE id = :id_loja LIMIT 1");
        $stmtStore->execute([':id_loja' => $id_loja]);
        $store = $stmtStore->fetch();

        sendJson([
            'success' => true,
            'banco_online' => true,
            'servidor' => 'Hostinger MySQL PHP API',
            'loja_atual' => $id_loja,
            'nome_loja' => $store ? $store['nome'] : 'Loja ' . $id_loja,
            'total_produtos' => (int)($counts['total'] ?? 0),
            'total_produtos_ativos' => (int)($counts['ativos'] ?? 0),
            'total_produtos_inativos' => (int)($counts['inativos'] ?? 0),
            'ultima_sincronizacao' => $counts['ultima_atualizacao'] ?? date('Y-m-d H:i:s'),
            'hora_servidor' => date('d/m/Y H:i:s')
        ], 200);
        break;

    // --------------------------------------------------------------------------
    // 4. ATUALIZAR / SINCRONIZAR / IMPORTAR PRODUTOS EM LOTE
    // POST api.php?action=sync ou action=sync-batch ou action=import
    // --------------------------------------------------------------------------
    case 'sync':
    case 'sync-batch':
    case 'products/sync-batch':
    case 'import':
    case 'products/import':
    case 'products/upsert':
        if ($method !== 'POST') {
            sendJson(['error' => 'Método não permitido. Use POST.'], 405);
        }

        // Se veio objeto individual
        if (isset($inputData['descricao']) || isset($inputData['produto'])) {
            $items = [$inputData];
        } else {
            $items = $inputData['items'] ?? [];
        }

        $id_loja = isset($inputData['id_loja']) ? (int)$inputData['id_loja'] : 1;
        $is_full_sync = !empty($inputData['is_full_sync']);

        if (!is_array($items) || empty($items)) {
            sendJson(['error' => 'Array de produtos "items" vazio ou inválido.'], 400);
        }

        if (!$pdo) {
            sendJson([
                'success' => false,
                'error' => 'BANCO_NAO_CONECTADO',
                'message' => 'Não foi possível conectar ao banco de dados MySQL na Hostinger. Verifique as credenciais no painel (Host, Usuário, Senha, Banco).'
            ], 500);
        }

        $now = date('Y-m-d H:i:s');
        $startTime = microtime(true);

        try {
            $pdo->beginTransaction();

            $query = "INSERT INTO produtos (
                id, id_loja, codigo_interno, codigo_barras, descricao,
                preco, preco_venda, embalagem, ncm, hash, ativo, atualizado_em, ultima_sincronizacao
            ) VALUES (
                :id, :id_loja, :codigo_interno, :codigo_barras, :descricao,
                :preco, :preco_venda, :embalagem, :ncm, :hash, :ativo, :atualizado_em, :ultima_sincronizacao
            ) ON DUPLICATE KEY UPDATE
                descricao = VALUES(descricao),
                preco = VALUES(preco),
                preco_venda = VALUES(preco_venda),
                embalagem = VALUES(embalagem),
                ncm = VALUES(ncm),
                hash = VALUES(hash),
                ativo = 1,
                atualizado_em = VALUES(atualizado_em),
                ultima_sincronizacao = VALUES(ultima_sincronizacao)";

            $stmt = $pdo->prepare($query);

            $totalProcessados = 0;
            $incomingCodes = [];

            foreach ($items as $item) {
                $intCode = trim(preg_replace('/^_+|_+$/', '', trim($item['codigo_interno'] ?? $item['id_produto'] ?? $item['Codigo Interno'] ?? $item['codigo interno'] ?? $item['cod_interno'] ?? $item['cod'] ?? $item['id'] ?? '')));
                $barcode = trim(preg_replace('/^_+|_+$/', '', trim($item['codigo_barras'] ?? $item['codigobarras'] ?? $item['Codigo de Barras'] ?? $item['codigo de barras'] ?? $item['cod_barras'] ?? $item['ean'] ?? $item['gtin'] ?? '')));
                $desc = mb_strtoupper(trim($item['produto'] ?? $item['descricao'] ?? $item['descricaocompleta'] ?? $item['Produto'] ?? $item['nome'] ?? $item['desc'] ?? ''));
                $rawPreco = str_replace(['R$', ' ', '$'], '', (string)($item['preco_venda'] ?? $item['preco'] ?? $item['precovenda'] ?? $item['Preco Venda'] ?? $item['preco venda'] ?? $item['valor'] ?? 0));
                $preco = (float)str_replace(',', '.', $rawPreco);
                $emb = mb_strtoupper(trim($item['embalagem'] ?? $item['Embalagem'] ?? $item['tipoembalagem_desc'] ?? $item['tipoembalagem'] ?? $item['unidade'] ?? $item['emb'] ?? 'UN'));
                $ncm = trim($item['ncm'] ?? $item['NCM'] ?? '00000000');

                if (empty($desc) || (empty($intCode) && empty($barcode))) {
                    continue;
                }

                $primaryCode = !empty($intCode) ? $intCode : $barcode;
                $barCodeFinal = !empty($barcode) ? $barcode : $primaryCode;
                $id = $id_loja . '_' . $primaryCode . '_' . $barCodeFinal;

                $hashContent = "{$primaryCode}|{$barCodeFinal}|{$desc}|" . number_format($preco, 2, '.', '') . "|{$emb}|{$id_loja}";
                $hash = hash('sha256', $hashContent);

                try {
                    $stmt->execute([
                        ':id' => $id,
                        ':id_loja' => $id_loja,
                        ':codigo_interno' => $primaryCode,
                        ':codigo_barras' => $barCodeFinal,
                        ':descricao' => $desc,
                        ':preco' => $preco,
                        ':preco_venda' => $preco,
                        ':embalagem' => $emb ?: 'UN',
                        ':ncm' => $ncm ?: '00000000',
                        ':hash' => $hash,
                        ':ativo' => 1,
                        ':atualizado_em' => $now,
                        ':ultima_sincronizacao' => $now
                    ]);
                    $totalProcessados++;
                    $incomingCodes[] = $pdo->quote($barCodeFinal);
                } catch (Exception $rowErr) {
                    // Continua para o próximo produto
                }
            }

            // Se for sincronização completa do ERP, inativa os produtos que não vieram
            $desativados = 0;
            if ($is_full_sync && !empty($incomingCodes)) {
                $inList = implode(',', array_slice($incomingCodes, 0, 5000));
                $sqlDeactivate = "UPDATE produtos SET ativo = 0, atualizado_em = '{$now}' WHERE id_loja = {$id_loja} AND codigo_barras NOT IN ({$inList})";
                $desativados = $pdo->exec($sqlDeactivate);
            }

            $tempoMs = (int)((microtime(true) - $startTime) * 1000);

            // Gravar Log de Sincronização
            try {
                $stmtLog = $pdo->prepare("INSERT INTO logs_sincronizacao (id_loja, data_hora, status, produtos_analisados, produtos_atualizados, novos_produtos, tempo_ms, mensagem) VALUES (:id_loja, :data_hora, 'SUCESSO', :total, :total, 0, :tempo, :msg)");
                $stmtLog->execute([
                    ':id_loja' => $id_loja,
                    ':data_hora' => $now,
                    ':total' => $totalProcessados,
                    ':tempo' => $tempoMs,
                    ':msg' => "Sincronização em nuvem: {$totalProcessados} produtos processados ({$tempoMs}ms)."
                ]);
            } catch (Exception $logErr) {}

            $pdo->commit();

            sendJson([
                'success' => true,
                'message' => "{$totalProcessados} produtos sincronizados com sucesso na Hostinger!",
                'total_processados' => $totalProcessados,
                'total_gravados' => $totalProcessados,
                'adicionados' => $totalProcessados,
                'atualizados' => $totalProcessados,
                'desativados' => $desativados,
                'tempo_ms' => $tempoMs,
                'data_hora' => $now
            ], 200);
        } catch (Exception $e) {
            if ($pdo && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            sendJson([
                'success' => false,
                'message' => 'Erro ao gravar produtos no MySQL Hostinger: ' . $e->getMessage()
            ], 500);
        }
        break;

    // --------------------------------------------------------------------------
    // 5. CONFIGURAÇÃO ERP (GET & POST) - PERSISTÊNCIA EM BANCO
    // GET/POST api.php?action=erp/config ou action=erp-config
    // --------------------------------------------------------------------------
    case 'erp/config':
    case 'erp-config':
    case 'config':
        if ($method === 'POST') {
            $nome_loja = trim($inputData['nome_loja'] ?? '');
            $host = trim($inputData['host'] ?? 'localhost');
            $port = (int)($inputData['port'] ?? 8745);
            $database = trim($inputData['database'] ?? 'vr');
            $user = trim($inputData['user'] ?? 'postgres');
            $password = $inputData['password'] ?? '';
            $ssl = !empty($inputData['ssl']) ? 1 : 0;
            $id_loja = (int)($inputData['id_loja'] ?? 1);
            $id_situacaocadastro = (int)($inputData['id_situacaocadastro'] ?? 1);
            $intervalo_minutos = (int)($inputData['intervalo_minutos'] ?? 10);
            $sincronizacao_automatica = isset($inputData['sincronizacao_automatica']) ? ($inputData['sincronizacao_automatica'] ? 1 : 0) : 1;
            $custom_query = $inputData['custom_query'] ?? null;

            // Busca senha atual se vier máscara
            if ($password === '••••••••' || $password === '') {
                $stmtCheck = $pdo->prepare("SELECT password FROM configuracao_erp WHERE id = 1 LIMIT 1");
                $stmtCheck->execute();
                $row = $stmtCheck->fetch();
                if ($row && !empty($row['password'])) {
                    $password = $row['password'];
                }
            }

            $stmt = $pdo->prepare("
                INSERT INTO configuracao_erp (id, nome_loja, host, port, `database`, user, password, ssl, id_loja, id_situacaocadastro, intervalo_minutos, sincronizacao_automatica, custom_query)
                VALUES (1, :nome_loja, :host, :port, :database, :user, :password, :ssl, :id_loja, :id_situacaocadastro, :intervalo_minutos, :sincronizacao_automatica, :custom_query)
                ON DUPLICATE KEY UPDATE
                    nome_loja = VALUES(nome_loja),
                    host = VALUES(host),
                    port = VALUES(port),
                    `database` = VALUES(`database`),
                    user = VALUES(user),
                    password = VALUES(password),
                    ssl = VALUES(ssl),
                    id_loja = VALUES(id_loja),
                    id_situacaocadastro = VALUES(id_situacaocadastro),
                    intervalo_minutos = VALUES(intervalo_minutos),
                    sincronizacao_automatica = VALUES(sincronizacao_automatica),
                    custom_query = VALUES(custom_query)
            ");
            $stmt->execute([
                ':nome_loja' => $nome_loja ?: 'Supermercado Modelo · Loja 01',
                ':host' => $host,
                ':port' => $port,
                ':database' => $database,
                ':user' => $user,
                ':password' => $password,
                ':ssl' => $ssl,
                ':id_loja' => $id_loja,
                ':id_situacaocadastro' => $id_situacaocadastro,
                ':intervalo_minutos' => $intervalo_minutos,
                ':sincronizacao_automatica' => $sincronizacao_automatica,
                ':custom_query' => $custom_query,
            ]);

            // Atualiza nome na tabela de lojas se fornecido
            if (!empty($nome_loja)) {
                $stmtLoja = $pdo->prepare("UPDATE lojas SET nome = :nome WHERE id = :id_loja");
                $stmtLoja->execute([':nome' => $nome_loja, ':id_loja' => $id_loja]);
            }

            sendJson([
                'success' => true,
                'message' => 'Configurações do ERP salvas com sucesso no banco de dados!',
            ], 200);
        } else {
            // GET
            $stmt = $pdo->prepare("SELECT * FROM configuracao_erp WHERE id = 1 LIMIT 1");
            $stmt->execute();
            $cfg = $stmt->fetch();

            if (!$cfg) {
                $cfg = [
                    'id' => 1,
                    'nome_loja' => 'Supermercado Modelo · Loja 01',
                    'host' => 'localhost',
                    'port' => 8745,
                    'database' => 'vr',
                    'user' => 'postgres',
                    'password' => '',
                    'ssl' => false,
                    'id_loja' => 1,
                    'id_situacaocadastro' => 1,
                    'intervalo_minutos' => 10,
                    'sincronizacao_automatica' => true,
                    'custom_query' => null,
                ];
            } else {
                $cfg['port'] = (int)$cfg['port'];
                $cfg['id_loja'] = (int)$cfg['id_loja'];
                $cfg['id_situacaocadastro'] = (int)$cfg['id_situacaocadastro'];
                $cfg['intervalo_minutos'] = (int)$cfg['intervalo_minutos'];
                $cfg['ssl'] = (bool)$cfg['ssl'];
                $cfg['sincronizacao_automatica'] = (bool)$cfg['sincronizacao_automatica'];
                $cfg['password'] = !empty($cfg['password']) ? '••••••••' : '';
            }

            sendJson($cfg, 200);
        }
        break;

    // --------------------------------------------------------------------------
    // 6. CONFIGURAÇÃO MYSQL (GET & POST)
    // --------------------------------------------------------------------------
    case 'mysql/config':
    case 'mysql-config':
        if ($method === 'POST') {
            $host = trim($inputData['host'] ?? 'localhost');
            $port = (int)($inputData['port'] ?? 3306);
            $database = trim($inputData['database'] ?? '');
            $user = trim($inputData['user'] ?? '');
            $password = $inputData['password'] ?? '';
            $enabled = isset($inputData['enabled']) ? ($inputData['enabled'] ? 1 : 0) : 1;

            // Salva credenciais no arquivo JSON
            saveDbCredentials($host, $port, $database, $user, $password);

            // Testa conexão com as novas credenciais
            $testCreds = [
                'host' => $host,
                'port' => $port,
                'database' => $database,
                'user' => $user,
                'password' => $password
            ];

            $testPdo = null;
            $connectionStatus = 'PENDENTE';
            $connectionMessage = '';

            try {
                $testPdo = getDbConnection($testCreds, false);
                if ($testPdo) {
                    ensureTablesExist($testPdo);
                    $connectionStatus = 'CONECTADO';
                    $connectionMessage = 'Conexão ativa com o banco MySQL Hostinger!';

                    // Salva também na tabela configuracao_mysql
                    $stmt = $testPdo->prepare("
                        INSERT INTO configuracao_mysql (id, host, port, `database`, user, password, enabled)
                        VALUES (1, :host, :port, :database, :user, :password, :enabled)
                        ON DUPLICATE KEY UPDATE
                            host = VALUES(host),
                            port = VALUES(port),
                            `database` = VALUES(`database`),
                            user = VALUES(user),
                            password = VALUES(password),
                            enabled = VALUES(enabled)
                    ");
                    $stmt->execute([
                        ':host' => $host,
                        ':port' => $port,
                        ':database' => $database,
                        ':user' => $user,
                        ':password' => $password,
                        ':enabled' => $enabled,
                    ]);
                }
            } catch (Exception $e) {
                $connectionStatus = 'ERRO';
                $connectionMessage = 'Configuração salva no arquivo, mas o MySQL retornou: ' . $e->getMessage();
            }

            sendJson([
                'success' => true,
                'message' => 'Configuração salva com sucesso!',
                'status' => $connectionStatus,
                'status_mensagem' => $connectionMessage,
                'config' => [
                    'host' => $host,
                    'port' => $port,
                    'database' => $database,
                    'user' => $user,
                    'has_password' => !empty($password),
                    'enabled' => (bool)$enabled
                ]
            ], 200);
        } else {
            $mcfg = [
                'host' => DB_HOST,
                'port' => DB_PORT,
                'database' => DB_NAME,
                'user' => DB_USER,
                'has_password' => !empty(DB_PASS),
                'enabled' => true,
            ];

            if ($pdo) {
                try {
                    $stmt = $pdo->prepare("SELECT * FROM configuracao_mysql WHERE id = 1 LIMIT 1");
                    $stmt->execute();
                    $dbCfg = $stmt->fetch();
                    if ($dbCfg) {
                        $mcfg['host'] = $dbCfg['host'];
                        $mcfg['port'] = (int)$dbCfg['port'];
                        $mcfg['database'] = $dbCfg['database'];
                        $mcfg['user'] = $dbCfg['user'];
                        $mcfg['has_password'] = !empty($dbCfg['password']) || !empty(DB_PASS);
                        $mcfg['enabled'] = (bool)$dbCfg['enabled'];
                    }
                } catch (Exception $e) {}
            }

            sendJson($mcfg, 200);
        }
        break;

    // --------------------------------------------------------------------------
    // 7. TESTE DE CONEXÃO MYSQL
    // --------------------------------------------------------------------------
    case 'test':
    case 'mysql/test-connection':
        $testCreds = null;
        if ($method === 'POST' && !empty($inputData['database'])) {
            $testCreds = [
                'host' => trim($inputData['host'] ?? 'localhost'),
                'port' => (int)($inputData['port'] ?? 3306),
                'database' => trim($inputData['database'] ?? ''),
                'user' => trim($inputData['user'] ?? ''),
                'password' => $inputData['password'] ?? DB_PASS
            ];
        }

        try {
            $conn = $testCreds ? getDbConnection($testCreds, false) : ($pdo ?: getDbConnection(null, false));
            $ver = $conn->query('SELECT VERSION() as version, NOW() as server_time')->fetch();
            ensureTablesExist($conn);
            sendJson([
                'success' => true,
                'message' => 'Conexão com MySQL Hostinger ativa e funcionando!',
                'info' => $ver
            ], 200);
        } catch (Exception $e) {
            sendJson([
                'success' => false,
                'message' => 'Falha na conexão com o MySQL Hostinger: ' . $e->getMessage()
            ], 200);
        }
        break;

    // --------------------------------------------------------------------------
    // 7.1 GESTÃO DE LOJAS E FILIAIS (CRUD)
    // --------------------------------------------------------------------------
    case 'stores':
    case 'lojas':
    case 'stores/create':
    case 'stores/update':
    case 'stores/delete':
        if (!$pdo) {
            sendJson([
                [
                    'id' => 1,
                    'nome' => 'Supermercado Modelo · Loja 01 (Matriz)',
                    'cnpj' => '00.000.000/0001-00',
                    'endereco' => 'Av. Principal, 1000 - Centro',
                    'ativa' => true,
                ]
            ], 200);
            break;
        }

        // DELEÇÃO DE LOJA: Dá prioridade máxima quando a ação é delete ou method é DELETE
        if ($method === 'DELETE' || $action === 'stores/delete' || $action === 'stores-delete' || (isset($inputData['_method']) && $inputData['_method'] === 'DELETE') || (isset($inputData['action']) && $inputData['action'] === 'delete')) {
            $id = isset($_GET['id']) ? (int)$_GET['id'] : (int)($inputData['id'] ?? 0);
            if ($id <= 0) {
                sendJson(['success' => false, 'error' => 'ID da loja não informado.'], 400);
                break;
            }

            // Garante que não deleta se for a única loja
            $stmtCount = $pdo->query("SELECT COUNT(*) as c FROM lojas");
            $c = (int)($stmtCount->fetch()['c'] ?? 1);
            if ($c <= 1) {
                sendJson(['success' => false, 'error' => 'Não é possível excluir a única loja cadastrada no sistema. Cadastre outra loja antes.'], 400);
                break;
            }

            try {
                // Reatribui produtos e terminais da loja removida para a loja matriz (1) antes de deletar
                $pdo->prepare("UPDATE produtos SET id_loja = 1 WHERE id_loja = :id")->execute([':id' => $id]);
                $pdo->prepare("UPDATE terminais SET id_loja = 1 WHERE id_loja = :id")->execute([':id' => $id]);

                $stmtDel = $pdo->prepare("DELETE FROM lojas WHERE id = :id");
                $stmtDel->execute([':id' => $id]);

                // Retorna lojas atualizadas
                $stmtRem = $pdo->query("SELECT id, nome, cnpj, endereco, ativa FROM lojas ORDER BY id ASC");
                $remainingStores = $stmtRem->fetchAll();

                sendJson([
                    'success' => true,
                    'message' => "Loja ID {$id} excluída com sucesso do banco de dados!",
                    'stores' => $remainingStores
                ], 200);
            } catch (Exception $e) {
                sendJson(['success' => false, 'error' => 'Falha ao excluir loja: ' . $e->getMessage()], 500);
            }
            break;
        }

        if ($method === 'POST' || $method === 'PUT') {
            $id = isset($inputData['id']) ? (int)$inputData['id'] : (isset($_GET['id']) ? (int)$_GET['id'] : 1);
            $nome = trim($inputData['nome'] ?? 'Loja ' . $id);
            $cnpj = trim($inputData['cnpj'] ?? '00.000.000/0000-00');
            $endereco = trim($inputData['endereco'] ?? 'Endereço da Loja');
            $ativa = isset($inputData['ativa']) ? ($inputData['ativa'] ? 1 : 0) : 1;

            if ($id <= 0) {
                $stmtMax = $pdo->query("SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM lojas");
                $id = (int)$stmtMax->fetch()['next_id'];
            }

            $stmt = $pdo->prepare("
                INSERT INTO lojas (id, nome, cnpj, endereco, ativa)
                VALUES (:id, :nome, :cnpj, :endereco, :ativa)
                ON DUPLICATE KEY UPDATE
                    nome = VALUES(nome),
                    cnpj = VALUES(cnpj),
                    endereco = VALUES(endereco),
                    ativa = VALUES(ativa)
            ");
            $stmt->execute([
                ':id' => $id,
                ':nome' => $nome,
                ':cnpj' => $cnpj,
                ':endereco' => $endereco,
                ':ativa' => $ativa,
            ]);

            sendJson([
                'success' => true,
                'message' => "Loja '{$nome}' (ID {$id}) gravada com sucesso!",
                'store' => [
                    'id' => $id,
                    'nome' => $nome,
                    'cnpj' => $cnpj,
                    'endereco' => $endereco,
                    'ativa' => (bool)$ativa,
                ]
            ], 200);
        } else {
            // GET
            $stmt = $pdo->query("SELECT id, nome, cnpj, endereco, ativa FROM lojas ORDER BY id ASC");
            $lojas = $stmt->fetchAll();
            if (empty($lojas)) {
                $lojas = [
                    [
                        'id' => 1,
                        'nome' => 'Supermercado Modelo · Loja 01 (Matriz)',
                        'cnpj' => '00.000.000/0001-00',
                        'endereco' => 'Av. Principal, 1000 - Centro',
                        'ativa' => true,
                    ]
                ];
            } else {
                $lojas = array_map(function($l) {
                    return [
                        'id' => (int)$l['id'],
                        'nome' => $l['nome'],
                        'cnpj' => $l['cnpj'] ?? '00.000.000/0000-00',
                        'endereco' => $l['endereco'] ?? 'Endereço da Loja',
                        'ativa' => (bool)$l['ativa'],
                    ];
                }, $lojas);
            }
            sendJson($lojas, 200);
        }
        break;

    // --------------------------------------------------------------------------
    // 7.2 GESTÃO DE TERMINAIS
    // --------------------------------------------------------------------------
    case 'terminals':
    case 'terminais':
    case 'terminals/delete':
    case 'terminals/clean-fakes':
        if (!$pdo) {
            sendJson([
                [
                    'id' => 'term-01',
                    'nome' => 'Terminal 01 - Principal (Físico)',
                    'id_loja' => 1,
                    'identificador' => 'TERM-01',
                    'modelo_etiqueta_padrao_id' => 'gondola-dupla-100x30',
                    'impressora_id' => 'argox-os214-01',
                    'ultima_conexao' => date('Y-m-d H:i:s'),
                    'ultima_sincronizacao' => date('Y-m-d H:i:s'),
                    'status' => 'ONLINE',
                    'versao' => '3.0.0',
                ]
            ], 200);
            break;
        }

        if ($action === 'terminals/clean-fakes' || (isset($inputData['action']) && $inputData['action'] === 'clean-fakes')) {
            $targetLoja = (int)($inputData['id_loja'] ?? 1);
            // Remove terminais fictícios/simulados, deixando apenas o terminal 01 real
            $pdo->exec("DELETE FROM terminais WHERE id != 'term-01'");
            $check = $pdo->query("SELECT COUNT(*) as c FROM terminais")->fetch();
            if (($check['c'] ?? 0) == 0) {
                $stmtIns = $pdo->prepare("
                    INSERT INTO terminais (id, nome, id_loja, identificador, modelo_etiqueta_padrao_id, impressora_id, status, versao, ultima_conexao, ultima_sincronizacao)
                    VALUES ('term-01', 'Terminal 01 - Principal (Físico)', :id_loja, 'TERM-01', 'gondola-dupla-100x30', 'argox-os214-01', 'ONLINE', '3.0.0', NOW(), NOW())
                ");
                $stmtIns->execute([':id_loja' => $targetLoja]);
            }
            $stmtTerms = $pdo->query("SELECT * FROM terminais ORDER BY id ASC");
            $remTerms = $stmtTerms->fetchAll();
            sendJson([
                'success' => true,
                'message' => 'Terminais não reais removidos com sucesso! Restando apenas o terminal real da loja.',
                'terminals' => $remTerms
            ], 200);
            break;
        }

        if ($method === 'DELETE' || $action === 'terminals/delete' || (isset($inputData['_method']) && $inputData['_method'] === 'DELETE')) {
            $id = isset($_GET['id']) ? trim($_GET['id']) : trim($inputData['id'] ?? '');
            if (!empty($id)) {
                $stmtDel = $pdo->prepare("DELETE FROM terminais WHERE id = :id");
                $stmtDel->execute([':id' => $id]);
                sendJson(['success' => true, 'message' => "Terminal '{$id}' excluído com sucesso."], 200);
            } else {
                sendJson(['success' => false, 'error' => 'ID do terminal não informado.'], 400);
            }
            break;
        }

        if ($method === 'POST') {
            $nome = trim($inputData['nome'] ?? 'Novo Terminal');
            $id_loja = (int)($inputData['id_loja'] ?? 1);
            $modelo = trim($inputData['modelo_etiqueta_padrao_id'] ?? 'gondola-dupla-100x30');
            $impressora = trim($inputData['impressora_id'] ?? 'argox-os214-01');
            $id = 'term-' . time();
            $identificador = 'TERM-' . str_pad((string)rand(1, 99), 2, '0', STR_PAD_LEFT);

            $stmt = $pdo->prepare("
                INSERT INTO terminais (id, nome, id_loja, identificador, modelo_etiqueta_padrao_id, impressora_id, status, versao, ultima_conexao, ultima_sincronizacao)
                VALUES (:id, :nome, :id_loja, :identificador, :modelo, :impressora, 'ONLINE', '3.0.0', NOW(), NOW())
            ");
            $stmt->execute([
                ':id' => $id,
                ':nome' => $nome,
                ':id_loja' => $id_loja,
                ':identificador' => $identificador,
                ':modelo' => $modelo,
                ':impressora' => $impressora,
            ]);

            sendJson(['success' => true, 'id' => $id], 200);
        } else {
            $stmt = $pdo->query("SELECT * FROM terminais ORDER BY id ASC");
            $terms = $stmt->fetchAll();
            if (empty($terms)) {
                $terms = [
                    [
                        'id' => 'term-01',
                        'nome' => 'Terminal 01 - Principal (Físico)',
                        'id_loja' => 1,
                        'identificador' => 'TERM-01',
                        'modelo_etiqueta_padrao_id' => 'gondola-dupla-100x30',
                        'impressora_id' => 'argox-os214-01',
                        'ultima_conexao' => date('Y-m-d H:i:s'),
                        'ultima_sincronizacao' => date('Y-m-d H:i:s'),
                        'status' => 'ONLINE',
                        'versao' => '3.0.0',
                    ]
                ];
            }
            sendJson($terms, 200);
        }
        break;

    // --------------------------------------------------------------------------
    // 7.3 GESTÃO DE IMPRESSORAS (CRUD)
    // --------------------------------------------------------------------------
    case 'printers':
    case 'impressoras':
    case 'printers/create':
    case 'printers/delete':
        $printersFile = __DIR__ . '/printers_config.json';
        $defaultPrinters = [
            [
                'id' => 'argox-os214-01',
                'nome' => 'Argox OS-214 Plus (Térmica)',
                'tipo' => 'argox_os214',
                'linguagem' => 'PPLB',
                'porta' => 'USB001',
                'dpi' => 203,
                'offset_x' => 0,
                'offset_y' => 0,
                'largura_calibrada' => 0,
                'altura_calibrada' => 0,
                'gap' => 3,
                'avanco' => 0,
                'padrao' => true,
                'online' => true,
            ]
        ];

        $currentPrinters = file_exists($printersFile) ? @json_decode(file_get_contents($printersFile), true) : $defaultPrinters;
        if (!is_array($currentPrinters) || empty($currentPrinters)) {
            $currentPrinters = $defaultPrinters;
        }

        if ($method === 'DELETE' || $action === 'printers/delete' || (isset($inputData['_method']) && $inputData['_method'] === 'DELETE') || (isset($inputData['action']) && $inputData['action'] === 'delete')) {
            $delId = isset($_GET['id']) ? trim($_GET['id']) : trim($inputData['id'] ?? '');
            if (empty($delId)) {
                sendJson(['success' => false, 'error' => 'ID da impressora não informado.'], 400);
                break;
            }

            if (count($currentPrinters) <= 1) {
                sendJson(['success' => false, 'error' => 'Não é possível excluir a única impressora configurada.'], 400);
                break;
            }

            $currentPrinters = array_values(array_filter($currentPrinters, function($pr) use ($delId) {
                return $pr['id'] !== $delId;
            }));

            // Se a impressora excluída era a padrão, define a primeira restante como padrão
            if (!empty($currentPrinters)) {
                $hasDefault = false;
                foreach ($currentPrinters as $pr) {
                    if (!empty($pr['padrao'])) {
                        $hasDefault = true;
                        break;
                    }
                }
                if (!$hasDefault) {
                    $currentPrinters[0]['padrao'] = true;
                }
            }

            @file_put_contents($printersFile, json_encode($currentPrinters, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            sendJson(['success' => true, 'message' => "Impressora '{$delId}' excluída com sucesso.", 'printers' => $currentPrinters], 200);
            break;
        }

        if ($method === 'POST') {
            $pId = trim($inputData['id'] ?? ('printer-' . time()));
            $pNome = trim($inputData['nome'] ?? 'Nova Impressora');
            $pPorta = trim($inputData['porta'] ?? 'USB001');
            $pLing = trim($inputData['linguagem'] ?? 'PPLB');
            $pTipo = trim($inputData['tipo'] ?? 'argox_os214');
            $pDpi = (int)($inputData['dpi'] ?? 203);

            $newP = [
                'id' => $pId,
                'nome' => $pNome,
                'tipo' => $pTipo,
                'linguagem' => $pLing,
                'porta' => $pPorta,
                'dpi' => $pDpi,
                'offset_x' => (float)($inputData['offset_x'] ?? 0),
                'offset_y' => (float)($inputData['offset_y'] ?? 0),
                'largura_calibrada' => (float)($inputData['largura_calibrada'] ?? 0),
                'altura_calibrada' => (float)($inputData['altura_calibrada'] ?? 0),
                'gap' => (float)($inputData['gap'] ?? 3),
                'avanco' => (float)($inputData['avanco'] ?? 0),
                'padrao' => !empty($inputData['padrao']),
                'online' => true,
            ];

            // Se for marcada como padrão, desmarca as outras
            if (!empty($newP['padrao'])) {
                foreach ($currentPrinters as &$pr) {
                    $pr['padrao'] = false;
                }
            }

            // Se for atualização de impressora existente
            $found = false;
            foreach ($currentPrinters as &$pr) {
                if ($pr['id'] === $pId) {
                    $pr = array_merge($pr, $newP);
                    $found = true;
                    break;
                }
            }
            if (!$found) {
                $currentPrinters[] = $newP;
            }

            @file_put_contents($printersFile, json_encode($currentPrinters, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            sendJson(['success' => true, 'message' => "Impressora '{$pNome}' salva com sucesso!", 'printer' => $newP, 'printers' => $currentPrinters], 200);
            break;
        } else {
            sendJson($currentPrinters, 200);
        }
        break;

    // --------------------------------------------------------------------------
    // 8. LOGS DE SINCRONIZAÇÃO
    // --------------------------------------------------------------------------
    case 'logs':
    case 'sync/logs':
        $id_loja = isset($_GET['id_loja']) ? (int)$_GET['id_loja'] : 1;
        if (!$pdo) {
            sendJson([], 200);
        }
        $stmt = $pdo->prepare("SELECT * FROM logs_sincronizacao WHERE id_loja = :id_loja ORDER BY data_hora DESC LIMIT 50");
        $stmt->execute([':id_loja' => $id_loja]);
        $logs = $stmt->fetchAll();
        sendJson($logs, 200);
        break;

    // --------------------------------------------------------------------------
    // 9. STATUS / SINCRONIZAÇÃO INSTANTÂNEA
    // Ex: api.php?action=instant-load
    // --------------------------------------------------------------------------
    case 'instant-load':
    case 'sync/instant-load':
    case 'carga-inicial':
        $id_loja = isset($_GET['id_loja']) ? (int)$_GET['id_loja'] : 1;
        $isDemoRequested = isset($_GET['demo']) || isset($_GET['exemplo']) || (isset($inputData['demo']) && $inputData['demo']);

        if (!$pdo) {
            sendJson([
                'success' => false,
                'banco_online' => false,
                'message' => 'Banco de dados MySQL Hostinger desconectado. Configure o banco na aba "Banco MySQL Hostinger".'
            ], 200);
            break;
        }

        if (!$isDemoRequested) {
            // Retorna o status atual dos produtos reais no banco
            $stmtCount = $pdo->prepare("SELECT COUNT(*) as total, SUM(CASE WHEN ativo = 1 THEN 1 ELSE 0 END) as ativos FROM produtos WHERE id_loja = :id_loja");
            $stmtCount->execute([':id_loja' => $id_loja]);
            $counts = $stmtCount->fetch();
            $totalAtivos = (int)($counts['ativos'] ?? 0);

            sendJson([
                'success' => true,
                'message' => "Banco de dados em nuvem operacional! Total de produtos reais ativos: {$totalAtivos}.",
                'total_produtos' => (int)($counts['total'] ?? 0),
                'total_ativos' => $totalAtivos,
                'id_loja' => $id_loja,
                'modo' => 'PRODUCAO_REAL'
            ], 200);
            break;
        }

        // Caso o usuário solicite explicitamente produtos de exemplo (?demo=1)
        $catalogoPadrao = [
            ['cod' => '1001', 'ean' => '7891000100101', 'desc' => 'LEITE INTEGRAL 1L', 'preco' => 5.49, 'emb' => 'UN', 'ncm' => '04012010'],
            ['cod' => '1002', 'ean' => '7891000200202', 'desc' => 'ARROZ BRANCO TIPO 1 5KG', 'preco' => 28.90, 'emb' => 'PC', 'ncm' => '10063021'],
            ['cod' => '1003', 'ean' => '7891000300303', 'desc' => 'FEIJAO CARIOCA 1KG', 'preco' => 7.89, 'emb' => 'UN', 'ncm' => '07133399'],
        ];

        $now = date('Y-m-d H:i:s');
        $stmt = $pdo->prepare("
            INSERT INTO produtos (id, id_loja, codigo_interno, codigo_barras, descricao, preco, preco_venda, embalagem, ncm, hash, ativo, atualizado_em, ultima_sincronizacao)
            VALUES (:id, :id_loja, :codigo_interno, :codigo_barras, :descricao, :preco, :preco_venda, :embalagem, :ncm, :hash, 1, :atualizado_em, :ultima_sincronizacao)
            ON DUPLICATE KEY UPDATE descricao = VALUES(descricao), preco = VALUES(preco), preco_venda = VALUES(preco_venda), ativo = 1, atualizado_em = VALUES(atualizado_em)
        ");

        $inserted = 0;
        foreach ($catalogoPadrao as $item) {
            $id = $id_loja . '_' . $item['cod'] . '_' . $item['ean'];
            $hash = hash('sha256', "{$item['cod']}|{$item['ean']}|{$item['desc']}|{$item['preco']}|{$item['emb']}|{$id_loja}");
            $stmt->execute([
                ':id' => $id,
                ':id_loja' => $id_loja,
                ':codigo_interno' => $item['cod'],
                ':codigo_barras' => $item['ean'],
                ':descricao' => $item['desc'],
                ':preco' => $item['preco'],
                ':preco_venda' => $item['preco'],
                ':embalagem' => $item['emb'],
                ':ncm' => $item['ncm'],
                ':hash' => $hash,
                ':atualizado_em' => $now,
                ':ultima_sincronizacao' => $now
            ]);
            $inserted++;
        }

        sendJson([
            'success' => true,
            'message' => "Catálogo de exemplo gravado ({$inserted} produtos).",
            'total_produtos' => $inserted
        ], 200);
        break;

    case 'agent-heartbeat':
        sendJson(['success' => true, 'timestamp' => date('Y-m-d H:i:s')], 200);
        break;

    // --------------------------------------------------------------------------
    // 15. DOWNLOADS DE SCRIPTS BAT, PS1, CSV E PACOTES ZIP
    // --------------------------------------------------------------------------
    case 'deploy/download-sync-bat':
    case 'download-sync-bat':
    case 'download-bat':
        $batPath = __DIR__ . '/sincronizar_automatico_10min.bat';
        header('Content-Type: application/x-bat; charset=utf-8');
        header('Content-Disposition: attachment; filename="sincronizar_automatico_10min.bat"');
        if (file_exists($batPath)) {
            readfile($batPath);
        } else {
            echo "@echo off\r\nchcp 65001 > nul\r\ntitle Central Busca Preco - Sincronizador Automatico (10 Minutos)\r\ncolor 0A\r\ncls\r\n\r\nset SUBDOMINIO=buscapreco.instara.com.br\r\nset ID_LOJA=1\r\n\r\n:LOOP\r\necho [%date% %time%] Disparando carga para https://%SUBDOMINIO%...\r\ncurl -s -k -X GET \"https://%SUBDOMINIO%/api.php?action=instant-load&id_loja=%ID_LOJA%\"\r\necho.\r\necho Proxima carga em 10 minutos (600s)...\r\ntimeout /t 600 /nobreak\r\ngoto LOOP\r\n";
        }
        exit;

    case 'deploy/download-agendador-bat':
    case 'download-agendador-bat':
        $batPath = __DIR__ . '/instalar_agendador_10min.bat';
        header('Content-Type: application/x-bat; charset=utf-8');
        header('Content-Disposition: attachment; filename="instalar_agendador_10min.bat"');
        if (file_exists($batPath)) {
            readfile($batPath);
        } else {
            echo "@echo off\r\nchcp 65001 > nul\r\nschtasks /create /tn \"BuscaPreco_Carga_10Min\" /tr \"\\\"%~dp0sincronizar_automatico_10min.bat\\\"\" /sc minute /mo 10 /f\r\npause\r\n";
        }
        exit;

    case 'deploy/download-exemplo-csv':
    case 'download-exemplo-csv':
        $csvPath = __DIR__ . '/produtos_exemplo.csv';
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="produtos_exemplo.csv"');
        if (file_exists($csvPath)) {
            readfile($csvPath);
        } else {
            echo "codigo_interno,codigo_barras,descricao,preco,embalagem,ncm\r\n101,7891000100103,ARROZ TIPO 1 5KG,29.90,UN,10063021\r\n102,7891000200202,FEIJAO CARIOCA 1KG,8.49,UN,07133399\r\n103,7891000300301,OLEO DE SOJA 900ML,6.79,UN,15079011\r\n";
        }
        exit;

    case 'deploy/download-sync-kit-zip':
    case 'download-sync-kit-zip':
        $zipPath = __DIR__ . '/kit_sincronizador_automatico_10min.zip';
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="kit_sincronizador_automatico_10min.zip"');
        if (file_exists($zipPath)) {
            readfile($zipPath);
            exit;
        }
        // Se a classe ZipArchive existir no PHP do servidor, cria em tempo de execução
        if (class_exists('ZipArchive')) {
            $tmpFile = tempnam(sys_get_temp_dir(), 'zip');
            $zip = new ZipArchive();
            if ($zip->open($tmpFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) === TRUE) {
                if (file_exists(__DIR__ . '/sincronizar_automatico_10min.bat')) {
                    $zip->addFile(__DIR__ . '/sincronizar_automatico_10min.bat', 'sincronizar_automatico_10min.bat');
                }
                if (file_exists(__DIR__ . '/sincronizar_nuvem.ps1')) {
                    $zip->addFile(__DIR__ . '/sincronizar_nuvem.ps1', 'sincronizar_nuvem.ps1');
                }
                if (file_exists(__DIR__ . '/instalar_agendador_10min.bat')) {
                    $zip->addFile(__DIR__ . '/instalar_agendador_10min.bat', 'instalar_agendador_10min.bat');
                }
                $zip->addFromString('LEIA-ME.txt', "KIT DE SINCRONIZACAO 10 MINUTOS\r\n1. De dois cliques em sincronizar_automatico_10min.bat para rodar continuous.\r\n2. Ou execute instalar_agendador_10min.bat como Administrador.");
                $zip->close();
                readfile($tmpFile);
                @unlink($tmpFile);
                exit;
            }
        }
        sendJson(['error' => 'Arquivo ZIP nao encontrado no servidor.'], 404);
        exit;

    case 'deploy/download-instalacao-zip':
    case 'download-instalacao-zip':
    case 'download-hostinger-zip':
        $zipPath = __DIR__ . '/buscapreco_instalacao_completa.zip';
        if (file_exists($zipPath)) {
            header('Content-Type: application/zip');
            header('Content-Disposition: attachment; filename="buscapreco_instalacao_completa.zip"');
            readfile($zipPath);
            exit;
        }
        sendJson(['error' => 'Pacote de instalacao nao encontrado.'], 404);
        exit;

    case 'deploy/download-atualizacao-zip':
    case 'download-atualizacao-zip':
        $zipPath = __DIR__ . '/buscapreco_pacote_atualizacao.zip';
        if (file_exists($zipPath)) {
            header('Content-Type: application/zip');
            header('Content-Disposition: attachment; filename="buscapreco_pacote_atualizacao.zip"');
            readfile($zipPath);
            exit;
        }
        sendJson(['error' => 'Pacote de atualizacao nao encontrado.'], 404);
        exit;

    default:
        sendJson(['error' => 'Ação desconhecida: ' . htmlspecialchars($action)], 404);
        break;
}
