<?php
/**
 * ==============================================================================
 * INSTALADOR E ATUALIZADOR DO BANCO DE DADOS MYSQL - HOSTINGER
 * ==============================================================================
 * Subdomínio: buscapreco.instara.com.br
 * Execute no navegador: https://buscapreco.instara.com.br/install.php
 * ==============================================================================
 */

require_once __DIR__ . '/config.php';

$isAjax = (!empty($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) == 'xmlhttprequest') || 
          (isset($_GET['format']) && $_GET['format'] === 'json');

try {
    $pdo = getDbConnection();

    $sql = "
    SET FOREIGN_KEY_CHECKS = 0;

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
      KEY `idx_ativo` (`ativo`),
      CONSTRAINT `fk_produtos_loja` FOREIGN KEY (`id_loja`) REFERENCES `lojas` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS `terminais` (
      `id` VARCHAR(50) NOT NULL PRIMARY KEY,
      `nome` VARCHAR(150) NOT NULL,
      `id_loja` INT NOT NULL DEFAULT 1,
      `identificador` VARCHAR(100) DEFAULT NULL,
      `modelo_etiqueta_padrao_id` VARCHAR(100) DEFAULT 'gondola-dupla-100x30',
      `impressora_id` VARCHAR(100) DEFAULT NULL,
      `ultima_conexao` DATETIME DEFAULT CURRENT_TIMESTAMP,
      `ultima_sincronizacao` DATETIME DEFAULT CURRENT_TIMESTAMP,
      `status` VARCHAR(20) DEFAULT 'ONLINE',
      `versao` VARCHAR(20) DEFAULT '2.5.0',
      KEY `idx_terminal_loja` (`id_loja`),
      CONSTRAINT `fk_terminais_loja` FOREIGN KEY (`id_loja`) REFERENCES `lojas` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS `logs_sincronizacao` (
      `id` INT AUTO_INCREMENT PRIMARY KEY,
      `id_loja` INT NOT NULL,
      `data_hora` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `status` VARCHAR(20) NOT NULL,
      `produtos_analisados` INT DEFAULT 0,
      `produtos_atualizados` INT DEFAULT 0,
      `novos_produtos` INT DEFAULT 0,
      `tempo_ms` INT DEFAULT 0,
      `mensagem` TEXT,
      KEY `idx_log_loja` (`id_loja`),
      KEY `idx_log_data` (`data_hora`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS `configuracao_erp` (
      `id` INT AUTO_INCREMENT PRIMARY KEY,
      `id_loja` INT NOT NULL UNIQUE,
      `nome_loja` VARCHAR(255) DEFAULT NULL,
      `tipo_banco` VARCHAR(20) DEFAULT 'mysql',
      `host` VARCHAR(255) DEFAULT NULL,
      `port` INT DEFAULT 3306,
      `database_name` VARCHAR(100) DEFAULT NULL,
      `user_name` VARCHAR(100) DEFAULT NULL,
      `password` VARCHAR(255) DEFAULT NULL,
      `ssl` TINYINT(1) DEFAULT 0,
      `intervalo_minutos` INT DEFAULT 10,
      `sincronizacao_automatica` TINYINT(1) DEFAULT 1,
      `custom_query` TEXT,
      `atualizado_em` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT `fk_config_loja` FOREIGN KEY (`id_loja`) REFERENCES `lojas` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS `logs_sistema` (
      `id` INT AUTO_INCREMENT PRIMARY KEY,
      `data_hora` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `tipo` VARCHAR(50) NOT NULL,
      `mensagem` TEXT NOT NULL,
      `detalhes` TEXT DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    SET FOREIGN_KEY_CHECKS = 1;

    INSERT INTO `lojas` (`id`, `nome`, `cnpj`, `endereco`, `ativa`) VALUES
    (1, 'Instara Supermercados - Matriz', '00.000.000/0001-00', 'Av. Principal, 1000', 1)
    ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);
    ";

    $pdo->exec($sql);

    if ($isAjax) {
        sendJson([
            'success' => true,
            'message' => 'Instalação concluída com sucesso! Todas as tabelas MySQL foram criadas.',
            'tabelas' => ['lojas', 'produtos', 'terminais', 'logs_sincronizacao', 'configuracao_erp', 'logs_sistema']
        ], 200);
    }

} catch (Exception $e) {
    if ($isAjax) {
        sendJson([
            'success' => false,
            'message' => 'Erro ao criar tabelas na Hostinger: ' . $e->getMessage()
        ], 500);
    }
    $erro = $e->getMessage();
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Instalação do Banco de Dados · Hostinger</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-neutral-950 text-neutral-100 min-h-screen flex items-center justify-center p-6 font-sans">
    <div class="max-w-xl w-full bg-neutral-900 border border-neutral-800 rounded-3xl p-8 space-y-6 shadow-2xl">
        <div class="flex items-center gap-4">
            <div class="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-3xl">
                🚀
            </div>
            <div>
                <h1 class="text-xl font-black text-white">Instalador do Banco MySQL</h1>
                <p class="text-xs text-neutral-400">Hostinger · buscapreco.instara.com.br</p>
            </div>
        </div>

        <?php if (!isset($erro)): ?>
            <div class="p-5 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl space-y-2">
                <div class="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <span>✅</span> Instalação Concluída com Sucesso!
                </div>
                <p class="text-xs text-emerald-200/90 leading-relaxed">
                    Todas as 6 tabelas (<code class="bg-black/40 px-1 rounded text-white">produtos</code>, <code class="bg-black/40 px-1 rounded text-white">lojas</code>, <code class="bg-black/40 px-1 rounded text-white">terminais</code>, <code class="bg-black/40 px-1 rounded text-white">logs_sincronizacao</code>, etc.) foram criadas no seu banco MySQL na Hostinger.
                </p>
            </div>

            <div class="space-y-3 pt-2">
                <a href="index.html" class="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-lg transition text-center block">
                    Abrir o Aplicativo Busca Preço Online ↵
                </a>
            </div>
        <?php else: ?>
            <div class="p-5 bg-rose-950/60 border border-rose-500/40 rounded-2xl space-y-2">
                <div class="flex items-center gap-2 text-rose-400 font-bold text-sm">
                    <span>❌</span> Falha na Conexão com o MySQL
                </div>
                <p class="text-xs text-rose-200/90 font-mono">
                    <?= htmlspecialchars($erro) ?>
                </p>
                <p class="text-xs text-neutral-300 mt-2">
                    Abra o arquivo <code class="text-amber-300">config.php</code> no Gerenciador de Arquivos da Hostinger e verifique se as credenciais (<code class="text-white">DB_NAME</code>, <code class="text-white">DB_USER</code>, <code class="text-white">DB_PASS</code>) estão corretas.
                </p>
            </div>
        <?php endif; ?>
    </div>
</body>
</html>
