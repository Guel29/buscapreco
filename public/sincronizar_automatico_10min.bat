<# :
@echo off
setlocal
chcp 65001 >nul 2>&1
title Central Busca Preco - Sincronizador Real de Produtos (10 Minutos)
color 0A
cls

echo ==============================================================================
echo       CENTRAL BUSCA PRECO ^& ETIQUETAS - SINCRONIZADOR REAL ERP -> NUVEM
echo ==============================================================================
echo   Subdominio Hostinger : buscapreco.instara.com.br
echo   Intervalo de Execucao: A cada 10 Minutos (Automatico)
echo   Origem dos Dados     : Banco de Dados Real Local (VR / PostgreSQL / CSV)
echo   Destino dos Dados    : MySQL Hostinger (Nuvem)
echo ==============================================================================
echo.
echo [INFO] Iniciando sincronizacao direta dos produtos reais...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((Get-Content -LiteralPath '%~f0' -Raw -Encoding UTF8))"

echo.
echo ===============================================================================
echo [AVISO] Processo de sincronizacao concluido ou interrompido.
echo Pressione qualquer tecla para sair...
echo ===============================================================================
pause
exit /b %ERRORLEVEL%
#>

# PowerShell Code Starts Here
$ErrorActionPreference = "Continue"
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]'Tls,Tls11,Tls12'

$Subdominio = "buscapreco.instara.com.br"
$IdLoja = 1
$IntervaloMinutos = 10
$cloudUrl = "https://$Subdominio"
$syncEndpoint = "$cloudUrl/api.php?action=sync-batch"
$fallbackEndpoint = "$cloudUrl/atualizar_produtos.php"

function Obter-PsqlExe {
    $cands = @(
        "C:\vr\pgsql\bin\psql.exe",
        "C:\vr\bin\psql.exe",
        "C:\VRMaster\pgsql\bin\psql.exe",
        "C:\VRSoftware\pgsql\bin\psql.exe",
        "C:\VRSoftware\bin\psql.exe",
        "D:\vr\pgsql\bin\psql.exe",
        "D:\VRSoftware\pgsql\bin\psql.exe",
        "C:\Program Files\PostgreSQL\16\bin\psql.exe",
        "C:\Program Files\PostgreSQL\15\bin\psql.exe",
        "C:\Program Files\PostgreSQL\14\bin\psql.exe",
        "C:\Program Files\PostgreSQL\13\bin\psql.exe",
        "C:\Program Files\PostgreSQL\12\bin\psql.exe",
        "C:\Program Files\PostgreSQL\11\bin\psql.exe",
        "C:\Program Files\PostgreSQL\10\bin\psql.exe",
        "C:\Program Files\PostgreSQL\9.6\bin\psql.exe",
        "C:\Program Files (x86)\PostgreSQL\10\bin\psql.exe",
        "C:\Program Files (x86)\PostgreSQL\9.6\bin\psql.exe",
        "C:\PostgreSQL\bin\psql.exe"
    )

    foreach ($p in $cands) {
        if (Test-Path $p) { return $p }
    }

    $inPath = try { (Get-Command "psql.exe" -ErrorAction SilentlyContinue).Source } catch { $null }
    if ($inPath -and (Test-Path $inPath)) { return $inPath }
    return $null
}

function Conectar-PostgreSql($psqlPath) {
    $creds = @(
        @{ db = "vr"; user = "postgres"; pass = "VrPost@Server" },
        @{ db = "vr"; user = "postgres"; pass = "vr" },
        @{ db = "vr"; user = "postgres"; pass = "postgres" },
        @{ db = "vr"; user = "vr"; pass = "vr" },
        @{ db = "vr_master"; user = "postgres"; pass = "vrsoftware" },
        @{ db = "vr"; user = "postgres"; pass = "123456" },
        @{ db = "supermercado"; user = "postgres"; pass = "postgres" },
        @{ db = "postgres"; user = "postgres"; pass = "postgres" },
        @{ db = "vr"; user = "postgres"; pass = "" }
    )

    foreach ($c in $creds) {
        $env:PGPASSWORD = $c.pass
        $test = & $psqlPath -h 127.0.0.1 -p 5432 -U $c.user -d $c.db -w -t -A -c "SELECT 1;" 2>&1
        if ($LASTEXITCODE -eq 0 -and ($test -match "1")) {
            return $c
        }
    }
    return $null
}

function Extrair-ProdutosPostgreSql($psqlPath, $cred) {
    $env:PGPASSWORD = $cred.pass
    $db = $cred.db
    $user = $cred.user

    $queries = @(
        "SELECT pr.id_produto || ';' || coalesce(pr.codigobarras::text, pr.id_produto::text) || ';' || replace(coalesce(p.descricaocompleta, p.descricaoreduzida, 'PRODUTO'), ';', ' ') || ';' || coalesce(pc.precovenda::text, '0') || ';' || coalesce(te.descricao, 'UN') || ';' || coalesce(p.ncm::text, '00000000') FROM produtoautomacao pr INNER JOIN produto p ON p.id = pr.id_produto INNER JOIN produtocomplemento pc ON pc.id_produto = pr.id_produto LEFT JOIN tipoembalagem te ON te.id = p.id_tipoembalagem WHERE (p.id_situacaocadastro IN (1, 3) OR p.idsituacaocadastro IN (1, 3) OR 1=1) AND (pc.id_loja = $IdLoja OR pc.id_loja IS NULL) ORDER BY pr.id_produto",
        "SELECT pr.id_produto || ';' || coalesce(pr.codigobarras::text, pr.id_produto::text) || ';' || replace(coalesce(p.descricaocompleta, 'PRODUTO'), ';', ' ') || ';' || coalesce(pc.precovenda::text, '0') || ';' || coalesce(te.descricao, 'UN') || ';00000000' FROM produtoautomacao pr INNER JOIN produto p ON p.id = pr.id_produto INNER JOIN produtocomplemento pc ON pc.id_produto = pr.id_produto LEFT JOIN tipoembalagem te ON te.id = p.id_tipoembalagem WHERE pc.id_loja = $IdLoja OR pc.id_loja IS NULL",
        "SELECT id || ';' || coalesce(codigobarras::text, id::text) || ';' || replace(coalesce(descricaocompleta, descricao, 'PRODUTO'), ';', ' ') || ';' || coalesce(precovenda::text, preco::text, '0') || ';UN;00000000' FROM produto"
    )

    foreach ($q in $queries) {
        $out = & $psqlPath -h 127.0.0.1 -p 5432 -U $user -d $db -w -t -A -F ";" -c ($q + ";") 2>&1
        $lines = $out -split "\r?\n" | Where-Object { $_ -and -not ($_ -match "^psql:") -and -not ($_ -match "ERROR:") -and ($_ -split ";").Count -ge 3 }
        if ($lines.Count -gt 0) {
            Write-Host "  -> [OK] Extraidos $($lines.Count) produtos reais do banco PostgreSQL [$db]!" -ForegroundColor Green
            return $lines
        }
    }
    return @()
}

function Extrair-ProdutosArquivoLocal {
    $locais = @(
        ".\produtos.csv", ".\produtos.txt", ".\carga.txt", ".\exportacao.txt", ".\itens.csv",
        "C:\vr\produtos.txt", "C:\vr\carga.txt", "C:\dados\produtos.csv", "C:\dados\produtos.txt"
    )
    foreach ($arq in $locais) {
        if (Test-Path $arq) {
            Write-Host "  -> [INFO] Arquivo de exportacao local encontrado: $arq" -ForegroundColor Cyan
            $linhas = Get-Content -Path $arq -Encoding UTF8
            $validas = @()
            foreach ($l in $linhas) {
                $l = $l.Trim()
                if ($l -and -not ($l.StartsWith("#")) -and -not ($l.ToLower().StartsWith("codigo"))) {
                    $validas += $l
                }
            }
            if ($validas.Count -gt 0) {
                Write-Host "  -> [OK] $($validas.Count) produtos lidos do arquivo local." -ForegroundColor Green
                return $validas
            }
        }
    }
    return @()
}

function Enviar-ProdutosParaNuvem($linhasProdutos) {
    if (-not $linhasProdutos -or $linhasProdutos.Count -eq 0) {
        Write-Host "  -> [AVISO] Nenhum produto real localizado para envio." -ForegroundColor Yellow
        return $false
    }

    $itens = @()
    foreach ($line in $linhasProdutos) {
        $parts = $line -split "[;,|]"
        if ($parts.Length -ge 3) {
            $codInterno = $parts[0].Trim()
            $codBarras = if ($parts.Length -ge 2 -and $parts[1]) { $parts[1].Trim() } else { $codInterno }
            $descricao = if ($parts.Length -ge 3) { $parts[2].Trim() } else { "PRODUTO $codInterno" }
            $precoRaw = if ($parts.Length -ge 4) { $parts[3].Trim() } else { "0" }
            $emb = if ($parts.Length -ge 5 -and $parts[4]) { $parts[4].Trim() } else { "UN" }
            $ncm = if ($parts.Length -ge 6 -and $parts[5]) { $parts[5].Trim() } else { "00000000" }

            $precoNum = 0.0
            try { $precoNum = [double]($precoRaw -replace ",", ".") } catch { $precoNum = 0.0 }

            $itens += @{
                codigo_interno = $codInterno
                codigo_barras = $codBarras
                descricao = $descricao
                preco = $precoNum
                preco_venda = $precoNum
                embalagem = $emb
                ncm = $ncm
            }
        }
    }

    Write-Host "  -> Enviando $($itens.Count) produtos REAIS em lotes para a nuvem Hostinger ($cloudUrl)..." -ForegroundColor Cyan
    $tamanhoLote = 500
    $totalLotes = [Math]::Ceiling($itens.Count / $tamanhoLote)
    $totalGravados = 0

    for ($i = 0; $i -lt $itens.Count; $i += $tamanhoLote) {
        $loteNum = [int]($i / $tamanhoLote) + 1
        $fim = [Math]::Min($i + $tamanhoLote, $itens.Count)
        $chunk = $itens[$i..($fim - 1)]

        $payload = @{
            id_loja = $IdLoja
            is_full_sync = ($i -eq 0)
            items = $chunk
        } | ConvertTo-Json -Depth 5

        $enviado = $false
        $endpoints = @($syncEndpoint, $fallbackEndpoint)

        foreach ($ep in $endpoints) {
            try {
                $resp = Invoke-RestMethod -Uri $ep -Method Post -Body $payload -ContentType "application/json; charset=utf-8" -TimeoutSec 45
                if ($resp -and ($resp.success -or $resp.total_processados)) {
                    $totalGravados += $chunk.Count
                    Write-Host "     [Lote $loteNum/$totalLotes] $($chunk.Count) produtos gravados no MySQL com sucesso!" -ForegroundColor Green
                    $enviado = $true
                    break
                }
            } catch {}
        }

        if (-not $enviado) {
            Write-Host "     [Lote $loteNum/$totalLotes] Falha na transmissao pela internet." -ForegroundColor Red
        }
    }

    if ($totalGravados -gt 0) {
        Write-Host "  -> [SUCESSO TOTAL] $totalGravados produtos REAIS sincronizados no MySQL Hostinger!" -ForegroundColor Green
        return $true
    }
    return $false
}

$ciclo = 1
while ($true) {
    $hora = (Get-Date).ToString("dd/MM/yyyy HH:mm:ss")
    Write-Host "------------------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "[$hora] Ciclo #$ciclo -> Conectando ao Banco Local do Supermercado..." -ForegroundColor Yellow
    Write-Host "------------------------------------------------------------------------------" -ForegroundColor DarkGray

    $psql = Obter-PsqlExe
    $linhas = @()

    if ($psql) {
        $cred = Conectar-PostgreSql $psql
        if ($cred) {
            Write-Host "  -> Conectado ao PostgreSQL [$($cred.db)] com usuario [$($cred.user)]!" -ForegroundColor Green
            $linhas = Extrair-ProdutosPostgreSql $psql $cred
        }
    }

    if ($linhas.Count -eq 0) {
        $linhas = Extrair-ProdutosArquivoLocal
    }

    if ($linhas.Count -gt 0) {
        Enviar-ProdutosParaNuvem $linhas
    } else {
        Write-Host "  -> [AVISO] Nenhum produto retornado da base local." -ForegroundColor Yellow
        Write-Host "     Dica: Certifique-se de executar no servidor do VR Software ou colocar o arquivo produtos.txt" -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host "Aguardando 10 minutos (600 segundos) para a proxima sincronizacao..." -ForegroundColor DarkCyan
    $ciclo++
    Start-Sleep -Seconds ($IntervaloMinutos * 60)
}
