<?php
/**
 * ==============================================================================
 * CENTRAL BUSCA PREÇO & IMPRESSÃO - ENTRY POINT HOSTINGER
 * ==============================================================================
 * Subdomínio: buscapreco.instara.com.br
 * 
 * 1. Se receber requisição de API (?action=... ou /api/...), processa MySQL e JSON
 * 2. Se for acesso visual pelo navegador, serve o SPA React completo (index.html)
 * ==============================================================================
 */

// Se for requisição de API com parâmetro action ou método POST com JSON
if (isset($_GET['action']) || (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false)) {
    require_once __DIR__ . '/api.php';
    exit;
}

// Se for acesso web ao Kiosk/Terminal, entrega o index.html original compilado do React SPA
$htmlPath = __DIR__ . '/index.html';
if (file_exists($htmlPath)) {
    header('Content-Type: text/html; charset=UTF-8');
    readfile($htmlPath);
    exit;
}

// Fallback caso o index.html não esteja presente
require_once __DIR__ . '/api.php';
