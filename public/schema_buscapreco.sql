-- ==============================================================================
-- SCHEMA LIMPO DO BANCO DE DADOS MYSQL (SEM DADOS/SEM INSERTS)
-- Subdomínio: buscapreco.instara.com.br
-- Compatível com: MySQL 5.7+, MySQL 8.0+, MariaDB 10.x (Hostinger / cPanel)
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";

-- ------------------------------------------------------------------------------
-- 1. TABELA DE LOJAS / FILIAIS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lojas` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(100) NOT NULL,
  `subdominio` VARCHAR(100) DEFAULT 'buscapreco.instara.com.br',
  `criado_em` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. TABELA DE PRODUTOS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `produtos` (
  `id` VARCHAR(100) NOT NULL,
  `id_loja` INT NOT NULL DEFAULT 1,
  `codigo_interno` VARCHAR(50) NOT NULL,
  `codigo_barras` VARCHAR(50) NOT NULL,
  `descricao` VARCHAR(255) NOT NULL,
  `preco` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `preco_venda` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `preco_anterior` DECIMAL(10,2) DEFAULT NULL,
  `embalagem` VARCHAR(20) DEFAULT 'UN',
  `ncm` VARCHAR(20) DEFAULT '00000000',
  `hash` VARCHAR(64) DEFAULT NULL,
  `ativo` TINYINT(1) NOT NULL DEFAULT 1,
  `atualizado_em` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `ultima_sincronizacao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_busca` (`id_loja`, `codigo_barras`, `ativo`),
  INDEX `idx_interno` (`id_loja`, `codigo_interno`, `ativo`),
  INDEX `idx_desc` (`id_loja`, `descricao`, `ativo`),
  INDEX `idx_atualizado` (`id_loja`, `atualizado_em`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. TABELA DE CONFIGURAÇÃO ERP (POSTGRESQL / VR SOFTWARE / OUTROS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `configuracao_erp` (
  `id` INT NOT NULL DEFAULT 1,
  `nome_loja` VARCHAR(100) DEFAULT 'Supermercado Modelo · Loja 01',
  `host` VARCHAR(100) DEFAULT 'localhost',
  `port` INT DEFAULT 8745,
  `database` VARCHAR(100) DEFAULT 'vr',
  `user` VARCHAR(100) DEFAULT 'postgres',
  `password` VARCHAR(255) DEFAULT '',
  `ssl` TINYINT(1) DEFAULT 0,
  `id_loja` INT DEFAULT 1,
  `id_situacaocadastro` INT DEFAULT 1,
  `intervalo_minutos` INT DEFAULT 10,
  `sincronizacao_automatica` TINYINT(1) DEFAULT 1,
  `custom_query` TEXT DEFAULT NULL,
  `atualizado_em` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 4. TABELA DE CONFIGURAÇÃO MYSQL HOSTINGER
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `configuracao_mysql` (
  `id` INT NOT NULL DEFAULT 1,
  `host` VARCHAR(100) DEFAULT 'localhost',
  `port` INT DEFAULT 3306,
  `database` VARCHAR(100) DEFAULT '',
  `user` VARCHAR(100) DEFAULT '',
  `password` VARCHAR(255) DEFAULT '',
  `enabled` TINYINT(1) DEFAULT 1,
  `atualizado_em` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 5. TABELA DE LOGS DE SINCRONIZAÇÃO
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `logs_sincronizacao` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_loja` INT NOT NULL DEFAULT 1,
  `data_hora` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `status` VARCHAR(20) NOT NULL DEFAULT 'SUCESSO',
  `produtos_analisados` INT DEFAULT 0,
  `produtos_atualizados` INT DEFAULT 0,
  `novos_produtos` INT DEFAULT 0,
  `tempo_ms` INT DEFAULT 0,
  `mensagem` TEXT DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_loja_data` (`id_loja`, `data_hora`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 6. TABELA DE TERMINAIS DE CONSULTA
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `terminais` (
  `id` VARCHAR(50) NOT NULL,
  `id_loja` INT NOT NULL DEFAULT 1,
  `identificacao` VARCHAR(100) NOT NULL,
  `ip_local` VARCHAR(45) DEFAULT NULL,
  `ultimo_acesso` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `versao_app` VARCHAR(20) DEFAULT '1.0.0',
  `status` VARCHAR(20) DEFAULT 'ONLINE',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
