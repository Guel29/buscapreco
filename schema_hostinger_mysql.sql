-- ==============================================================================
-- BANCO DE DADOS MYSQL PARA HOSTINGER / CENTRAL NUVEM DE CONSULTA DE PREÇOS
-- Compatível com: MySQL 5.7+, MySQL 8.0+ e MariaDB 10.x+ (Hostinger)
-- ==============================================================================

-- Instruções para Importação no phpMyAdmin / Hostinger:
-- 1. Acesse o hPanel da Hostinger -> Bancos de Dados MySQL.
-- 2. Crie um novo Banco de Dados e Usuário com permissões completas.
-- 3. Clique em "phpMyAdmin" ao lado do banco criado.
-- 4. Clique na aba "SQL" ou "Importar" no topo da página do phpMyAdmin.
-- 5. Cole o conteúdo deste arquivo e clique em "Executar".

SET FOREIGN_KEY_CHECKS = 0;

-- -------------------------------------------------------------
-- 1. TABELA DE LOJAS
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lojas` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nome` VARCHAR(255) NOT NULL,
  `cnpj` VARCHAR(20) DEFAULT NULL,
  `endereco` VARCHAR(255) DEFAULT NULL,
  `ativa` TINYINT(1) NOT NULL DEFAULT 1,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 2. TABELA DE PRODUTOS CENTRAL EM NUVEM
-- -------------------------------------------------------------
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

-- -------------------------------------------------------------
-- 3. TABELA DE TERMINAIS DE CONSULTA
-- -------------------------------------------------------------
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
  `versao` VARCHAR(20) DEFAULT '2.4.0',
  KEY `idx_terminal_loja` (`id_loja`),
  CONSTRAINT `fk_terminais_loja` FOREIGN KEY (`id_loja`) REFERENCES `lojas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 4. TABELA DE LOGS DE SINCRONIZAÇÃO
-- -------------------------------------------------------------
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

-- -------------------------------------------------------------
-- 5. TABELA DE CONFIGURAÇÃO DE ERP E AGENTE
-- -------------------------------------------------------------
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

-- -------------------------------------------------------------
-- 6. TABELA DE LOGS DE SISTEMA E IMPRESSÕES
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `logs_sistema` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `data_hora` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `tipo` VARCHAR(50) NOT NULL,
  `mensagem` TEXT NOT NULL,
  `detalhes` TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reabilitar verificação de chaves estrangeiras
SET FOREIGN_KEY_CHECKS = 1;

-- -------------------------------------------------------------
-- DADOS INICIAIS DE REGISTRO DE LOJAS E TERMINAIS
-- -------------------------------------------------------------
INSERT INTO `lojas` (`id`, `nome`, `cnpj`, `endereco`, `ativa`) VALUES
(1, 'Supermercado Modelo - Loja 01 (Matriz)', '12.345.678/0001-90', 'Av. Brasil, 1500 - Centro', 1),
(2, 'Supermercado Modelo - Loja 02 (Filial Bairro)', '12.345.678/0002-71', 'Rua das Flores, 420 - Jardim', 1)
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);

INSERT INTO `terminais` (`id`, `nome`, `id_loja`, `identificador`, `modelo_etiqueta_padrao_id`, `status`) VALUES
('term-01', 'CONSULTA 01 - ENTRADA PRINCIPAL', 1, 'TERM-ENTRADA-01', 'gondola-dupla-100x30', 'ONLINE'),
('term-02', 'CONSULTA 02 - CORREDOR 04 (BEBIDAS)', 1, 'TERM-CORREDOR-02', 'gondola-dupla-100x30', 'ONLINE')
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);
