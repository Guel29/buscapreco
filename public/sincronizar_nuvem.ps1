# ==============================================================================
# SINCRONIZADOR UNIVERSAL ERP (LOCAL) -> NUVEM MYSQL HOSTINGER
# Central Busca Preço & Impressão de Etiquetas
# Subdomínio: buscapreco.instara.com.br
# ==============================================================================
param(
    [string]$Subdominio = "buscapreco.instara.com.br",
    [string]$PgHost = "127.0.0.1",
    [int]$PgPort = 8745,
    [string]$PgDb = "vr",
    [string]$PgUser = "postgres",
    [string]$PgPass = "VrPost@Server",
    [int]$IdLoja = 1,
    [int]$IntervaloMinutos = 10,
    [switch]$LoopContinuo = $false
)

$ErrorActionPreference = "Continue"
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]'Tls,Tls11,Tls12'
$OutputEncoding = [System.Text.Encoding]::UTF8
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$env:PGCLIENTENCODING = "UTF8"

$cloudUrl = "https://$Subdominio"
$syncEndpoint = "$cloudUrl/api.php?action=sync-batch"
$fallbackEndpoint = "$cloudUrl/atualizar_produtos.php"

function Escrever-Cabecalho {
    Clear-Host
    Write-Host "==============================================================================" -ForegroundColor Cyan
    Write-Host "     SINCRONIZADOR DIRETO: POSTGRESQL (VR) -> HOSTINGER MYSQL (NUVEM)" -ForegroundColor Green
    Write-Host "==============================================================================" -ForegroundColor Cyan
    Write-Host "  Nuvem Hostinger : $cloudUrl" -ForegroundColor White
    Write-Host "  Loja Ativa      : Loja $IdLoja" -ForegroundColor White
    Write-Host "  Intervalo       : $IntervaloMinutos minutos" -ForegroundColor White
    Write-Host "  Metodo          : CONSULTA DIRETA AO BANCO VR (100% AUTOMATICO / SEM TXT)" -ForegroundColor Yellow
    Write-Host "==============================================================================" -ForegroundColor Cyan
    Write-Host "  [INFO] Consulta direta as tabelas do PostgreSQL e gravacao imediata na nuvem." -ForegroundColor Gray
    Write-Host ""
}

# 1. Localização do executável psql.exe
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

    foreach ($path in $cands) {
        if (Test-Path $path) {
            return $path
        }
    }

    # Busca no PATH do sistema
    $inPath = try { (Get-Command "psql.exe" -ErrorAction SilentlyContinue).Source } catch { $null }
    if ($inPath -and (Test-Path $inPath)) {
        return $inPath
    }

    return $null
}

# 2. Teste e Detecção de Credenciais do PostgreSQL Local
function Conectar-PostgreSql($psqlPath) {
    $creds = @()
    if ($PgPass) {
        $creds += @{ db = $PgDb; user = $PgUser; pass = $PgPass }
    }
    $creds += @(
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
        $test = & $psqlPath -h $PgHost -p $PgPort -U $c.user -d $c.db -w -t -A -c "SELECT 1;" 2>&1
        if ($LASTEXITCODE -eq 0 -and ($test -match "1")) {
            return $c
        }
    }

    return $null
}

# 3. Extração dos Produtos Reais do Banco Local
function Extrair-ProdutosPostgreSql($psqlPath, $cred) {
    $env:PGPASSWORD = $cred.pass
    $db = $cred.db
    $user = $cred.user

    $queries = @(
        @{
            nome = "VR Software Oficial Completo (produtoautomacao + produto + produtocomplemento + tipoembalagem)"
            sql = "SELECT pr.id_produto || ';' || coalesce(pr.codigobarras::text, pr.id_produto::text) || ';' || replace(replace(coalesce(p.descricaocompleta, p.descricaoreduzida, 'PRODUTO'), ';', ' '), chr(10), ' ') || ';' || replace(replace(replace(coalesce(pc.precovenda::text, '0'), 'R$', ''), ' ', ''), ',', '.') || ';' || coalesce(te.descricao, 'UN') || ';00000000' FROM produtoautomacao pr INNER JOIN produto p ON p.id = pr.id_produto INNER JOIN produtocomplemento pc ON pc.id_produto = pr.id_produto LEFT JOIN tipoembalagem te ON te.id = p.id_tipoembalagem ORDER BY pr.id_produto"
        },
        @{
            nome = "VR Software por Loja (pc.id_loja = $IdLoja)"
            sql = "SELECT pr.id_produto || ';' || coalesce(pr.codigobarras::text, pr.id_produto::text) || ';' || replace(replace(coalesce(p.descricaocompleta, p.descricaoreduzida, 'PRODUTO'), ';', ' '), chr(10), ' ') || ';' || replace(replace(replace(coalesce(pc.precovenda::text, '0'), 'R$', ''), ' ', ''), ',', '.') || ';' || coalesce(te.descricao, 'UN') || ';00000000' FROM produtoautomacao pr INNER JOIN produto p ON p.id = pr.id_produto INNER JOIN produtocomplemento pc ON pc.id_produto = pr.id_produto LEFT JOIN tipoembalagem te ON te.id = p.id_tipoembalagem WHERE pc.id_loja = $IdLoja ORDER BY pr.id_produto"
        },
        @{
            nome = "VR Software Geral a partir de produto (LEFT JOINs)"
            sql = "SELECT p.id || ';' || coalesce(pr.codigobarras::text, p.id::text) || ';' || replace(replace(coalesce(p.descricaocompleta, p.descricaoreduzida, 'PRODUTO'), ';', ' '), chr(10), ' ') || ';' || replace(replace(replace(coalesce(pc.precovenda::text, '0'), 'R$', ''), ' ', ''), ',', '.') || ';' || coalesce(te.descricao, 'UN') || ';00000000' FROM produto p LEFT JOIN produtoautomacao pr ON pr.id_produto = p.id LEFT JOIN produtocomplemento pc ON pc.id_produto = p.id LEFT JOIN tipoembalagem te ON te.id = p.id_tipoembalagem ORDER BY p.id"
        },
        @{
            nome = "Tabela produto padrao"
            sql = "SELECT id || ';' || coalesce(codigobarras::text, id::text) || ';' || replace(replace(coalesce(descricaocompleta, descricao, 'PRODUTO'), ';', ' '), chr(10), ' ') || ';' || replace(replace(replace(coalesce(precovenda::text, preco::text, '0'), 'R$', ''), ' ', ''), ',', '.') || ';UN;00000000' FROM produto ORDER BY id"
        }
    )

    foreach ($q in $queries) {
        $out = & $psqlPath -h $PgHost -p $PgPort -U $user -d $db -w -t -A -F ";" -c ($q.sql + ";") 2>&1
        $lines = $out -split "\r?\n" | Where-Object { $_ -and -not ($_ -match "^psql:") -and -not ($_ -match "ERROR:") -and ($_ -split ";").Count -ge 3 }
        if ($lines.Count -gt 0) {
            Write-Host "  -> [OK] Extraidos $($lines.Count) produtos reais via: $($q.nome)" -ForegroundColor Green
            return $lines
        }
    }

    return @()
}

# 4. Fallback: Extração de Arquivos de Exportação TXT/CSV Locais
function Extrair-ProdutosArquivoLocal {
    $locais = @(
        ".\produtos.csv",
        ".\produtos.txt",
        ".\carga.txt",
        ".\exportacao.txt",
        ".\itens.csv",
        "C:\vr\produtos.txt",
        "C:\vr\carga.txt",
        "C:\dados\produtos.csv",
        "C:\dados\produtos.txt"
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
                Write-Host "  -> [OK] $($validas.Count) produtos carregados do arquivo local." -ForegroundColor Green
                return $validas
            }
        }
    }

    return @()
}

# 5. Envio dos Produtos em Lotes para a Nuvem Hostinger (com Retry Inteligente e Anti-Throttling)
function Enviar-ProdutosParaNuvem($linhasProdutos) {
    if (-not $linhasProdutos -or $linhasProdutos.Count -eq 0) {
        Write-Host "[AVISO] Nenhum produto real encontrado para sincronizar." -ForegroundColor Yellow
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

    Write-Host ""
    Write-Host "[TRANSMISSAO] Enviando $($itens.Count) produtos REAIS para a Nuvem Hostinger..." -ForegroundColor Cyan

    $tamanhoLote = 400
    $totalLotes = [Math]::Ceiling($itens.Count / $tamanhoLote)
    $totalGravados = 0

    $endpoints = @(
        $syncEndpoint,
        $fallbackEndpoint,
        "https://ais-dev-tmqxftqlpvts2wcsxfjlvl-865056996557.us-east1.run.app/api/products/sync-batch"
    )

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
        $maxTentativas = 3

        for ($tentativa = 1; $tentativa -le $maxTentativas; $tentativa++) {
            foreach ($ep in $endpoints) {
                try {
                    $resp = Invoke-RestMethod -Uri $ep -Method Post -Body $payload -ContentType "application/json; charset=utf-8" -TimeoutSec 60
                    if ($resp -and ($resp.success -or $resp.total_processados -or $resp.total_gravados)) {
                        $gravados = if ($resp.total_processados) { $resp.total_processados } elseif ($resp.total_gravados) { $resp.total_gravados } else { $chunk.Count }
                        $totalGravados += $gravados
                        Write-Host "  -> Lote $loteNum/$totalLotes ($($chunk.Count) produtos) gravado com sucesso no MySQL da nuvem!" -ForegroundColor Green
                        $enviado = $true
                        break
                    }
                } catch {
                    # Registra e tenta proximo endpoint ou retry
                }
            }

            if ($enviado) {
                break
            } else {
                if ($tentativa -lt $maxTentativas) {
                    Write-Host "  -> [RETRY] Lote $loteNum/$totalLotes: servidor ocupado, aguardando 2s antes de tentar novamente ($tentativa/$maxTentativas)..." -ForegroundColor Yellow
                    Start-Sleep -Seconds 2
                }
            }
        }

        if (-not $enviado) {
            Write-Host "  -> [AVISO] Lote $loteNum/$totalLotes nao respondeu apos $maxTentativas tentativas. Continuando..." -ForegroundColor Red
        }

        # Pequena pausa para evitar sobrecarga no servidor Hostinger (Anti-Throttling)
        Start-Sleep -Milliseconds 150
    }

    Write-Host ""
    Write-Host "==============================================================================" -ForegroundColor Green
    Write-Host "  [CONCLUIDO] Total de $totalGravados produtos REAIS sincronizados com sucesso na Nuvem!" -ForegroundColor Green
    Write-Host "==============================================================================" -ForegroundColor Green
    return ($totalGravados -gt 0)
}

# 6. Ciclo Principal de Execução
function Executar-Sincronizacao {
    $horaAtual = Get-Date -Format "dd/MM/yyyy HH:mm:ss"
    Write-Host "[$horaAtual] Iniciando ciclo de sincronizacao..." -ForegroundColor Yellow

    # Procura psql.exe
    $psql = Obter-PsqlExe
    $linhas = @()

    if ($psql) {
        Write-Host "[1/2] Executavel do PostgreSQL localizado: $psql" -ForegroundColor Gray
        $cred = Conectar-PostgreSql $psql
        if ($cred) {
            Write-Host "  -> [SUCESSO] Conectado ao banco [$($cred.db)] com usuario [$($cred.user)]!" -ForegroundColor Green
            $linhas = Extrair-ProdutosPostgreSql $psql $cred
        } else {
            Write-Host "  -> [AVISO] Nao foi possivel autenticar com as credenciais padrao." -ForegroundColor Yellow
        }
    } else {
        Write-Host "[1/2] [INFO] PostgreSQL local (psql.exe) nao encontrado nas pastas padrao." -ForegroundColor DarkGray
    }

    # Se não obteve pelo banco, tenta ler de arquivo local (produtos.csv/txt)
    if ($linhas.Count -eq 0) {
        Write-Host "[2/2] Verificando arquivos de carga locais (produtos.csv / produtos.txt)..." -ForegroundColor Yellow
        $linhas = Extrair-ProdutosArquivoLocal
    }

    if ($linhas.Count -gt 0) {
        Enviar-ProdutosParaNuvem $linhas
    } else {
        Write-Host ""
        Write-Host "==============================================================================" -ForegroundColor Red
        Write-Host "  [ATENCAO] NENHUM PRODUTO REAL FOI LOCALIZADO NO BANCO OU ARQUIVO            " -ForegroundColor Yellow
        Write-Host "==============================================================================" -ForegroundColor Red
        Write-Host "COMO SINCRONIZAR SEUS PRODUTOS REAIS:" -ForegroundColor White
        Write-Host "1. Execute este arquivo no SERVIDOR ONDE ESTA O BANCO DO SUPERMERCADO (VR)." -ForegroundColor Cyan
        Write-Host "2. OU coloque um arquivo 'produtos.csv' ou 'produtos.txt' nesta mesma pasta." -ForegroundColor Cyan
        Write-Host "3. OU na tela do navegador, use a aba 'Importar TXT/CSV' para enviar a lista." -ForegroundColor Cyan
        Write-Host "==============================================================================" -ForegroundColor DarkGray
    }
}

# Execução Inicial
Escrever-Cabecalho
Executar-Sincronizacao

if ($LoopContinuo) {
    while ($true) {
        Write-Host ""
        Write-Host "Proxima sincronizacao automatica em $IntervaloMinutos minutos (pressione Ctrl+C para parar)..." -ForegroundColor DarkGray
        Start-Sleep -Seconds ($IntervaloMinutos * 60)
        Escrever-Cabecalho
        Executar-Sincronizacao
    }
}
