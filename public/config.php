<?php
/**
 * ==============================================================================
 * CONFIGURAÇÃO DINÂMICA DO BANCO DE DADOS MYSQL - HOSTINGER
 * Sistema de Consulta de Preços e Impressão de Etiquetas
 * ==============================================================================
 */

// Headers de CORS e JSON para integração com terminais e navegadores
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Configurações de Fuso Horário do Brasil
date_default_timezone_set('America/Sao_Paulo');

// Caminho do arquivo de configuração persistente
$configFile = __DIR__ . '/config_db.json';
$defaultConfig = [
    'host'     => 'localhost',
    'port'     => 3306,
    'database' => 'u366235819_busca',
    'user'     => 'u366235819_busca',
    'password' => ''
];

$savedConfig = [];
if (file_exists($configFile)) {
    $content = @file_get_contents($configFile);
    if ($content) {
        $savedConfig = json_decode($content, true) ?: [];
    }
}

$activeConfig = array_merge($defaultConfig, $savedConfig);

define('DB_HOST', $activeConfig['host'] ?? 'localhost');
define('DB_PORT', (int)($activeConfig['port'] ?? 3306));
define('DB_NAME', $activeConfig['database'] ?? 'u366235819_busca');
define('DB_USER', $activeConfig['user'] ?? 'u366235819_busca');
define('DB_PASS', $activeConfig['password'] ?? '');

/**
 * Salva credenciais do banco no arquivo config_db.json
 */
function saveDbCredentials($host, $port, $database, $user, $password = null) {
    global $configFile, $activeConfig;
    
    $newConfig = [
        'host'     => trim($host),
        'port'     => (int)$port,
        'database' => trim($database),
        'user'     => trim($user),
        'password' => ($password !== null && $password !== '••••••••') ? $password : ($activeConfig['password'] ?? '')
    ];

    @file_put_contents($configFile, json_encode($newConfig, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    return $newConfig;
}

// Variável global para armazenar o último erro de conexão com o banco
$GLOBALS['g_lastDbError'] = null;

function getLastDbError() {
    return $GLOBALS['g_lastDbError'] ?? null;
}

/**
 * Função para obter conexão PDO com o MySQL da Hostinger
 * @param array|null $customCredentials
 * @param bool $suppressExit Se true, retorna null em caso de erro sem interromper o script
 * @return PDO|null
 */
function getDbConnection($customCredentials = null, $suppressExit = false) {
    static $pdo = null;

    if ($customCredentials !== null) {
        $host = $customCredentials['host'] ?? DB_HOST;
        $port = (int)($customCredentials['port'] ?? DB_PORT);
        $db   = $customCredentials['database'] ?? DB_NAME;
        $user = $customCredentials['user'] ?? DB_USER;
        $pass = $customCredentials['password'] ?? DB_PASS;

        $dsn = "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
        ];
        try {
            $customPdo = new PDO($dsn, $user, $pass, $options);
            return $customPdo;
        } catch (PDOException $e) {
            $GLOBALS['g_lastDbError'] = $e->getMessage();
            if ($suppressExit) {
                return null;
            }
            throw $e;
        }
    }

    if ($pdo === null) {
        $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
        ];
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
            $GLOBALS['g_lastDbError'] = null;
        } catch (PDOException $e) {
            $GLOBALS['g_lastDbError'] = $e->getMessage();
            if ($suppressExit) {
                return null;
            }
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error'   => 'Falha ao conectar no MySQL Hostinger: ' . $e->getMessage()
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    return $pdo;
}

/**
 * Helper para retorno formatado JSON
 */
function sendJson($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}
