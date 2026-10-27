# ==============================================================================
# SCRIPT DE ATUALIZAÇÃO E SINCRONIZAÇÃO AUTOMÁTICA - TERMINAL & ERP
# ==============================================================================
# Este script roda no Windows (Servidor ERP ou Terminal) e sincroniza os produtos
# com a Nuvem / Hostinger e atualiza o aplicativo.

param(
    [string]$AppUrl = "https://ais-dev-tmqxftqlpvts2wcsxfjlvl-865056996557.us-east1.run.app",
    [string]$HostingerUrl = "https://seusite.com/buscapreco_hostinger.php",
    [int]$IdLoja = 1,
    [int]$IntervaloMinutos = 10
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " SINCRONIZADOR & ATUALIZADOR DE PREÇOS - NUVEM / HOSTINGER" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Terminal / Nuvem: $AppUrl" -ForegroundColor White
Write-Host "Loja ID: $IdLoja" -ForegroundColor White
Write-Host "Intervalo: $IntervaloMinutos minutos" -ForegroundColor White
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray

function Executar-Carga {
    $dataHora = Get-Date -Format "dd/MM/yyyy HH:mm:ss"
    Write-Host "[$dataHora] Iniciando ciclo de sincronização de produtos..." -ForegroundColor Yellow

    try {
        # 1. Disparar Carga Instantânea no App / Nuvem
        $endpoint = "$AppUrl/api/sync/instant-load"
        $body = @{ id_loja = $IdLoja } | ConvertTo-Json

        $response = Invoke-RestMethod -Uri $endpoint -Method POST -Body $body -ContentType "application/json" -TimeoutSec 15
        
        if ($response.success) {
            Write-Host "[$dataHora] SUCESSO: $($response.message)" -ForegroundColor Green
            Write-Host "   Novos: $($response.adicionados) | Atualizados: $($response.atualizados) | Total Ativo: $($response.total_ativos)" -ForegroundColor Cyan
        } else {
            Write-Host "[$dataHora] Resposta: $($response.message)" -ForegroundColor DarkYellow
        }

        # 2. Se houver URL da Hostinger configurada, dispara replicação
        if ($HostingerUrl -and $HostingerUrl -ne "https://seusite.com/buscapreco_hostinger.php") {
            Write-Host "   Sincronizando com Hostinger MySQL..." -ForegroundColor DarkGray
            $hResp = Invoke-RestMethod -Uri "$HostingerUrl?action=status&id_loja=$IdLoja" -Method GET -TimeoutSec 10
            Write-Host "   Hostinger Total: $($hResp.total_produtos) produtos." -ForegroundColor DarkGreen
        }

    } catch {
        Write-Host "[$dataHora] AVISO na sincronização: $_" -ForegroundColor Red
    }
}

# Executa primeira carga imediatamente
Executar-Carga

# Loop Contínuo de Atualização
Write-Host "`nServiço ativo e aguardando próximos ciclos de $IntervaloMinutos minutos (Pressione Ctrl+C para parar)...`n" -ForegroundColor DarkCyan

while ($true) {
    Start-Sleep -Seconds ($IntervaloMinutos * 60)
    Executar-Carga
}
