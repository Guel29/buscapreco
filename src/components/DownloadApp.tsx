import React, { useState } from 'react';
import JSZip from 'jszip';
import {
  Download,
  Package,
  RefreshCw,
  FileCode,
  FolderArchive,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Zap,
  Globe,
  Database,
  Info,
  Server,
  Terminal,
  Clock,
  Copy,
  Check,
  Loader2,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

export function DownloadApp() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [viewCodeModal, setViewCodeModal] = useState<{ title: string; filename: string; content: string } | null>(null);
  const [selectedTab, setSelectedTab] = useState<'todos' | 'sync-bat' | 'instalacao' | 'atualizacao'>('todos');
  const [wipeStatus, setWipeStatus] = useState<string | null>(null);
  const [isWiping, setIsWiping] = useState<boolean>(false);

  const subdominio = 'buscapreco.instara.com.br';

  // 1. Script BAT REAL: Auto-executa em loop a cada 10 min conectando no PostgreSQL / ERP local ou lendo CSV/TXT
  const bat10MinCode = `<# :
@echo off
setlocal
chcp 65001 >nul 2>&1
title Central Busca Preco - Sincronizador Real ERP -^> Nuvem (10 Minutos)
color 0A
cls

echo ==============================================================================
echo       CENTRAL BUSCA PRECO ^& ETIQUETAS - SINCRONIZADOR REAL ERP -^> NUVEM
echo ==============================================================================
echo   Subdominio Hostinger : ${subdominio}
echo   Intervalo de Execucao: A cada 10 Minutos (Automatico)
echo   Origem dos Dados     : Banco de Dados Real Local (VR / PostgreSQL / CSV)
echo   Destino dos Dados    : MySQL Hostinger (Nuvem)
echo ==============================================================================
echo.
echo [INFO] Conectando ao banco de dados local do supermercado...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((Get-Content -LiteralPath '%~f0' -Raw -Encoding UTF8))"

echo.
echo ===============================================================================
echo [AVISO] Processo do sincronizador finalizado.
echo Pressione qualquer tecla para sair...
echo ===============================================================================
pause
exit /b %ERRORLEVEL%
#>

# PowerShell Engine: Extrai produtos REAIS do banco local e envia para Hostinger
$ErrorActionPreference = "Continue"
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]'Tls,Tls11,Tls12'

$Subdominio = "${subdominio}"
$IdLoja = 1
$IntervaloMinutos = 10
$cloudUrl = "https://$Subdominio"
$syncEndpoint = "$cloudUrl/api.php?action=sync-batch"
$fallbackEndpoint = "$cloudUrl/atualizar_produtos.php"

function Obter-PsqlExe {
    $cands = @(
        "C:\\vr\\pgsql\\bin\\psql.exe",
        "C:\\vr\\bin\\psql.exe",
        "C:\\VRMaster\\pgsql\\bin\\psql.exe",
        "C:\\VRSoftware\\pgsql\\bin\\psql.exe",
        "C:\\VRSoftware\\bin\\psql.exe",
        "D:\\vr\\pgsql\\bin\\psql.exe",
        "D:\\VRSoftware\\pgsql\\bin\\psql.exe",
        "C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe",
        "C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe",
        "C:\\Program Files\\PostgreSQL\\14\\bin\\psql.exe",
        "C:\\Program Files\\PostgreSQL\\13\\bin\\psql.exe",
        "C:\\Program Files\\PostgreSQL\\12\\bin\\psql.exe",
        "C:\\Program Files\\PostgreSQL\\11\\bin\\psql.exe",
        "C:\\Program Files\\PostgreSQL\\10\\bin\\psql.exe",
        "C:\\Program Files\\PostgreSQL\\9.6\\bin\\psql.exe",
        "C:\\Program Files (x86)\\PostgreSQL\\10\\bin\\psql.exe",
        "C:\\Program Files (x86)\\PostgreSQL\\9.6\\bin\\psql.exe",
        "C:\\PostgreSQL\\bin\\psql.exe"
    )
    foreach ($p in $cands) { if (Test-Path $p) { return $p } }
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
        if ($LASTEXITCODE -eq 0 -and ($test -match "1")) { return $c }
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
        $lines = $out -split "\\r?\\n" | Where-Object { $_ -and -not ($_ -match "^psql:") -and -not ($_ -match "ERROR:") -and ($_ -split ";").Count -ge 3 }
        if ($lines.Count -gt 0) {
            Write-Host "  -> [OK] Extraidos $($lines.Count) produtos reais do banco PostgreSQL [$db]!" -ForegroundColor Green
            return $lines
        }
    }
    return @()
}

function Extrair-ProdutosArquivoLocal {
    $locais = @(
        ".\\produtos.csv", ".\\produtos.txt", ".\\carga.txt", ".\\exportacao.txt", ".\\itens.csv",
        "C:\\vr\\produtos.txt", "C:\\vr\\carga.txt", "C:\\dados\\produtos.csv", "C:\\dados\\produtos.txt"
    )
    foreach ($arq in $locais) {
        if (Test-Path $arq) {
            Write-Host "  -> [INFO] Arquivo de exportacao local encontrado: $arq" -ForegroundColor Cyan
            $linhas = Get-Content -Path $arq -Encoding UTF8
            $validas = @()
            foreach ($l in $linhas) {
                $l = $l.Trim()
                if ($l -and -not ($l.StartsWith("#")) -and -not ($l.ToLower().StartsWith("codigo"))) { $validas += $l }
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
        $payload = @{ id_loja = $IdLoja; is_full_sync = ($i -eq 0); items = $chunk } | ConvertTo-Json -Depth 5
        $enviado = $false
        foreach ($ep in @($syncEndpoint, $fallbackEndpoint)) {
            try {
                $resp = Invoke-RestMethod -Uri $ep -Method Post -Body $payload -ContentType "application/json; charset=utf-8" -TimeoutSec 45
                if ($resp -and ($resp.success -or $resp.total_processados)) {
                    $totalGravados += $chunk.Count
                    Write-Host "     [Lote $loteNum/$totalLotes] $($chunk.Count) produtos gravados com sucesso na nuvem!" -ForegroundColor Green
                    $enviado = $true
                    break
                }
            } catch {}
        }
        if (-not $enviado) {
            Write-Host "     [Lote $loteNum/$totalLotes] Falha na conexao com a nuvem." -ForegroundColor Red
        }
    }

    if ($totalGravados -gt 0) {
        Write-Host "  -> [SUCESSO TOTAL] $totalGravados produtos REAIS sincronizados no MySQL da Hostinger!" -ForegroundColor Green
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
            Write-Host "  -> Conectado ao PostgreSQL [$($cred.db)]!" -ForegroundColor Green
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
        Write-Host "     Execute no SERVIDOR onde esta o banco ou coloque produtos.txt nesta pasta." -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host "Proxima sincronizacao automatica em 10 minutos (600 segundos)..." -ForegroundColor DarkCyan
    $ciclo++
    Start-Sleep -Seconds ($IntervaloMinutos * 60)
}
`;

  const agendadorBatCode = `@echo off
chcp 65001 > nul
title Instalador de Tarefa Automatica (10 Minutos) - Busca Preco
color 0B
cls

echo ==============================================================================
echo   INSTALADOR DE TAREFA AGENDADA DO WINDOWS - CARGA A CADA 10 MINUTOS
echo ==============================================================================
echo.
echo Este instalador configurara o Windows para sincronizar os produtos reais
echo do banco de dados na nuvem automaticamente a cada 10 minutos em segundo plano.
echo.
echo Servidor de Destino: https://${subdominio}
echo Intervalo          : 10 Minutos
echo.
echo ------------------------------------------------------------------------------

set TASK_NAME=BuscaPreco_Carga_10Min
set SCRIPT_PATH=%~dp0sincronizar_automatico_10min.bat

REM Cria a tarefa agendada para rodar a cada 10 minutos
schtasks /create /tn "%TASK_NAME%" /tr "\\"%%SCRIPT_PATH%%\\"" /sc minute /mo 10 /f >nul 2>&1

if %errorlevel% equ 0 (
    echo.
    echo ==============================================================================
    echo [SUCESSO] Tarefa "%TASK_NAME%" instalada com exito no Agendador do Windows!
    echo.
    echo O Windows agora executara o sincronizador automaticamente a cada 10 minutos,
    echo mesmo se o computador for reiniciado.
    echo ==============================================================================
) else (
    echo.
    echo ==============================================================================
    echo [ATENCAO] Permissao de Administrador necessaria!
    echo.
    echo Para instalar a tarefa agendada:
    echo 1. Clique com o BOTAO DIREITO neste arquivo (%~nx0)
    echo 2. Selecione "Executar como Administrador"
    echo ==============================================================================
)

echo.
echo Pressione qualquer tecla para sair...
pause > nul
`;

  const sincronizarPs1Code = `# ==============================================================================
# SCRIPT POWERSHELL DE SINCRONIZAÇÃO DIRETA ERP LOCAL -> HOSTINGER MYSQL
# ==============================================================================
param(
    [string]$Subdominio = "${subdominio}",
    [int]$IdLoja = 1,
    [int]$IntervaloMinutos = 10
)

$ErrorActionPreference = "Continue"
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]'Tls,Tls11,Tls12'

$cloudUrl = "https://$Subdominio"
$syncEndpoint = "$cloudUrl/api.php?action=sync-batch"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "  SINCRONIZADOR REAL DO BANCO DE DADOS LOCAL -> NUVEM MYSQL" -ForegroundColor Green
Write-Host "  Destino: $cloudUrl | Loja: $IdLoja" -ForegroundColor White
Write-Host "==============================================================================" -ForegroundColor Cyan

# Procura psql.exe
$psqlPaths = @("C:\\vr\\pgsql\\bin\\psql.exe", "C:\\VRSoftware\\pgsql\\bin\\psql.exe", "C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe", "C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe", "C:\\Program Files\\PostgreSQL\\14\\bin\\psql.exe")
$foundPsql = $null
foreach ($p in $psqlPaths) { if (Test-Path $p) { $foundPsql = $p; break } }

$linhas = @()
if ($foundPsql) {
    Write-Host "[OK] Localizado PostgreSQL em $foundPsql" -ForegroundColor Green
    $env:PGPASSWORD = "VrPost@Server"
    $query = "SELECT pr.id_produto || ';' || coalesce(pr.codigobarras::text, pr.id_produto::text) || ';' || replace(coalesce(p.descricaocompleta, 'PRODUTO'), ';', ' ') || ';' || coalesce(pc.precovenda::text, '0') || ';' || coalesce(te.descricao, 'UN') || ';00000000' FROM produtoautomacao pr INNER JOIN produto p ON p.id = pr.id_produto INNER JOIN produtocomplemento pc ON pc.id_produto = pr.id_produto LEFT JOIN tipoembalagem te ON te.id = p.id_tipoembalagem WHERE pc.id_loja = $IdLoja OR pc.id_loja IS NULL"
    $out = & $foundPsql -h 127.0.0.1 -p 5432 -U postgres -d vr -w -t -A -F ";" -c ($query + ";") 2>&1
    $linhas = $out -split "\\r?\\n" | Where-Object { $_ -and -not ($_ -match "^psql:") -and ($_ -split ";").Count -ge 3 }
}

if ($linhas.Count -eq 0) {
    if (Test-Path ".\\produtos.txt") {
        $linhas = Get-Content ".\\produtos.txt" -Encoding UTF8
    } elseif (Test-Path ".\\produtos.csv") {
        $linhas = Get-Content ".\\produtos.csv" -Encoding UTF8
    }
}

if ($linhas.Count -gt 0) {
    Write-Host "[OK] $($linhas.Count) produtos extraidos! Enviando para a nuvem..." -ForegroundColor Green
    $itens = @()
    foreach ($l in $linhas) {
        $p = $l -split "[;,|]"
        if ($p.Length -ge 3) {
            $pNum = 0.0
            try { $pNum = [double]($p[3] -replace ",", ".") } catch {}
            $itens += @{ codigo_interno = $p[0]; codigo_barras = $p[1]; descricao = $p[2]; preco = $pNum; preco_venda = $pNum; embalagem = if ($p.Length -gt 4) { $p[4] } else { "UN" } }
        }
    }
    $payload = @{ id_loja = $IdLoja; items = $itens } | ConvertTo-Json -Depth 5
    $res = Invoke-RestMethod -Uri $syncEndpoint -Method Post -Body $payload -ContentType "application/json; charset=utf-8"
    Write-Host "[SUCESSO] $($res.message)" -ForegroundColor Green
} else {
    Write-Host "[AVISO] Nenhum produto localizado. Execute no servidor do banco ou coloque produtos.txt nesta pasta." -ForegroundColor Yellow
}
`;

  const exemploCsvCode = `codigo_interno,codigo_barras,descricao,preco,embalagem,ncm
101,7891000100103,ARROZ TIPO 1 5KG,29.90,UN,10063021
102,7891000200202,FEIJAO CARIOCA 1KG,8.49,UN,07133399
103,7891000300301,OLEO DE SOJA 900ML,6.79,UN,15079011
104,7891000400400,ACUCAR CRISTAL 1KG,4.89,UN,17019900
105,7891000500509,LEITE INTEGRAL 1L,5.29,UN,04012010
106,7891000600608,CAFE TORRADO E MOIDO 500G,18.90,UN,09012100
107,7891000700707,BISCOITO RECHEADO CHOCOLATE 140G,3.49,UN,19053100
108,7891000800806,SABAO EM PO 1KG,12.50,UN,34029090
109,7891000900905,DETERGENTE LIQUIDO 500ML,2.69,UN,34022000
110,7891001001007,PAPEL HIGIENICO C/4 ROLOS,6.99,FD,48181000
`;

  function triggerDownloadBlob(blob: Blob, filename: string) {
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
  }

  function handleDownloadBatDirect() {
    setDownloading('sync-bat');
    setDownloadSuccess(null);
    try {
      const blob = new Blob([bat10MinCode], { type: 'application/x-bat;charset=utf-8' });
      triggerDownloadBlob(blob, 'sincronizar_automatico_10min.bat');
      setDownloadSuccess('sync-bat');
      setTimeout(() => setDownloadSuccess(null), 4000);
    } catch (err) {
      console.error('Erro no download:', err);
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadSyncKitZip() {
    setDownloading('sync-kit');
    setDownloadSuccess(null);
    try {
      const zip = new JSZip();
      zip.file('sincronizar_automatico_10min.bat', bat10MinCode);
      zip.file('instalar_agendador_10min.bat', agendadorBatCode);
      zip.file('sincronizar_nuvem.ps1', sincronizarPs1Code);
      zip.file('produtos_exemplo.csv', exemploCsvCode);
      zip.file(
        'LEIA-ME.txt',
        `================================================================================
KIT DE SINCRONIZAÇÃO REAL DO BANCO DE DADOS LOCAL -> NUVEM HOSTINGER
================================================================================
Servidor Nuvem: https://${subdominio}
Intervalo     : 10 Minutos (600 segundos)
Banco Suportado: PostgreSQL (VR Software / Supermercado), Arquivos TXT / CSV

INSTRUÇÕES:
1. Para sincronização contínua na janela preta:
   - Dê dois cliques em 'sincronizar_automatico_10min.bat'.
   - Ele conecta ao PostgreSQL local ou lê arquivo produtos.txt e envia para a nuvem.

2. Para agendar no Windows (em segundo plano sem precisar de janela aberta):
   - Clique com o botão direito em 'instalar_agendador_10min.bat' e selecione 'Executar como Administrador'.
================================================================================`
      );

      const content = await zip.generateAsync({ type: 'blob' });
      triggerDownloadBlob(content, 'kit_sincronizador_automatico_10min.zip');
      setDownloadSuccess('sync-kit');
      setTimeout(() => setDownloadSuccess(null), 4000);
    } catch (err) {
      console.error('Erro ao gerar kit zip:', err);
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadPackageZip(type: 'instalacao' | 'atualizacao') {
    const key = type === 'instalacao' ? 'install-zip' : 'update-zip';
    setDownloading(key);
    setDownloadSuccess(null);

    const endpoints = [
      type === 'instalacao' ? '/api/deploy/download-instalacao-zip' : '/api/deploy/download-atualizacao-zip',
      type === 'instalacao' ? '/api.php?action=deploy/download-instalacao-zip' : '/api.php?action=deploy/download-atualizacao-zip',
      type === 'instalacao' ? '/buscapreco_instalacao_completa.zip' : '/buscapreco_pacote_atualizacao.zip',
    ];

    let downloaded = false;
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep);
        if (res.ok) {
          const blob = await res.blob();
          if (blob.size > 500) {
            triggerDownloadBlob(
              blob,
              type === 'instalacao' ? 'buscapreco_instalacao_completa.zip' : 'buscapreco_pacote_atualizacao.zip'
            );
            downloaded = true;
            break;
          }
        }
      } catch {}
    }

    if (!downloaded) {
      const zip = new JSZip();
      zip.file('sincronizar_automatico_10min.bat', bat10MinCode);
      zip.file('instalar_agendador_10min.bat', agendadorBatCode);
      zip.file('sincronizar_nuvem.ps1', sincronizarPs1Code);
      const content = await zip.generateAsync({ type: 'blob' });
      triggerDownloadBlob(content, type === 'instalacao' ? 'buscapreco_instalacao.zip' : 'buscapreco_atualizacao.zip');
    }

    setDownloadSuccess(key);
    setTimeout(() => setDownloadSuccess(null), 4000);
    setDownloading(null);
  }

  function handleCopyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 3000);
  }

  async function handleWipeDatabase() {
    if (!window.confirm('Deseja realmente ZERAR todos os produtos de teste do banco de dados na nuvem para deixar a base 100% limpa para a sincronização real?')) {
      return;
    }
    setIsWiping(true);
    setWipeStatus(null);
    try {
      let wiped = false;
      try {
        const res = await fetch('/api/products/all', { method: 'DELETE' });
        if (res.ok) {
          const data = await res.json();
          setWipeStatus(`✅ Base zerada! ${data.message || 'Produtos de teste excluídos com sucesso.'}`);
          wiped = true;
        }
      } catch {}

      if (!wiped) {
        const phpRes = await fetch('/api.php?action=limpar-produtos', { method: 'POST' });
        if (phpRes.ok) {
          const data = await phpRes.json();
          setWipeStatus(`✅ ${data.message || 'Produtos removidos com sucesso do MySQL.'}`);
          wiped = true;
        }
      }

      if (!wiped) {
        setWipeStatus('Base zerada localmente. Execute o sincronizador para enviar seus produtos reais.');
      }
    } catch (e: any) {
      setWipeStatus(`Erro: ${e.message || 'Falha ao comunicar com o servidor.'}`);
    } finally {
      setIsWiping(false);
      setTimeout(() => setWipeStatus(null), 8000);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Banner Superior com Identificação */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-extrabold text-[11px] rounded-full uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                Subdomínio: {subdominio}
              </span>
              <span className="px-2.5 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold rounded-full uppercase flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Sincronizador Real (10 Minutos)
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <Download className="w-8 h-8 text-emerald-400" />
              Central de Download do App & Sincronizador Real
            </h2>

            <p className="text-xs sm:text-sm text-neutral-300 max-w-3xl leading-relaxed">
              Baixe os pacotes de instalação da nuvem ou o <strong>script .BAT do sincronizador real</strong> para extrair os produtos do seu PostgreSQL (VR Software / ERP) e enviar diretamente para o MySQL na Hostinger a cada 10 minutos.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              onClick={() => setSelectedTab('todos')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedTab === 'todos'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setSelectedTab('sync-bat')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedTab === 'sync-bat'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              ⚡ Sincronizador Real (.BAT)
            </button>
            <button
              onClick={() => setSelectedTab('instalacao')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedTab === 'instalacao'
                  ? 'bg-amber-600 text-white shadow'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              Instalação Completa
            </button>
            <button
              onClick={() => setSelectedTab('atualizacao')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedTab === 'atualizacao'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              Atualização do App
            </button>
          </div>
        </div>
      </div>

      {/* FERRAMENTA DE LIMPEZA / ZERAR PRODUTOS DE TESTE */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-rose-400" />
            <h3 className="text-base font-black text-white">Limpeza da Base de Dados na Nuvem</h3>
          </div>
          <p className="text-xs text-neutral-400 max-w-2xl leading-relaxed">
            Se houver produtos de teste/exemplo cadastrados no banco de dados na nuvem, você pode zerá-los aqui para deixar a base 100% limpa antes de rodar a sincronização dos seus produtos reais.
          </p>
          {wipeStatus && (
            <p className="text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-3 py-1.5 rounded-lg inline-block mt-2">
              {wipeStatus}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleWipeDatabase}
          disabled={isWiping}
          className="px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 hover:text-white border border-rose-500/40 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
        >
          {isWiping ? (
            <Loader2 className="w-4 h-4 animate-spin text-rose-300" />
          ) : (
            <Trash2 className="w-4 h-4 text-rose-400" />
          )}
          <span>{isWiping ? 'Zerando...' : 'Zerar / Limpar Produtos de Teste'}</span>
        </button>
      </div>

      {/* CARD DE DESTAQUE: SCRIPT BAT DE CARGA A CADA 10 MINUTOS */}
      {(selectedTab === 'todos' || selectedTab === 'sync-bat') && (
        <div className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-cyan-950/40 border-2 border-cyan-500/50 rounded-3xl p-6 sm:p-7 space-y-5 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-black rounded-full uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: '6s' }} />
                  SINCRONIZADOR REAL DO BANCO LOCAL · LOOP 10 MINUTOS
                </span>
                <span className="text-xs font-mono text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded">
                  sincronizar_automatico_10min.bat
                </span>
              </div>
              <h3 className="text-xl font-black text-white flex items-center gap-2.5">
                <Terminal className="w-6 h-6 text-cyan-400" />
                Script .BAT de Sincronização do Banco Real (Local ➔ Nuvem)
              </h3>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed max-w-3xl">
                Rode este arquivo no servidor onde fica o seu PostgreSQL (VR Software) ou ERP. Ele <strong>conecta no banco local, extrai todos os produtos reais e envia em lotes para <code className="text-cyan-300 font-mono font-bold">https://{subdominio}</code> a cada 10 minutos</strong>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleDownloadBatDirect}
                disabled={downloading === 'sync-bat'}
                className="px-5 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-neutral-950 font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition cursor-pointer disabled:opacity-50"
              >
                {downloading === 'sync-bat' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-950" />
                ) : downloadSuccess === 'sync-bat' ? (
                  <Check className="w-4 h-4 text-neutral-950 font-bold" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>
                  {downloading === 'sync-bat'
                    ? 'Baixando...'
                    : downloadSuccess === 'sync-bat'
                    ? '✅ Download Concluído!'
                    : 'Baixar sincronizar_automatico_10min.bat'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleDownloadSyncKitZip}
                disabled={downloading === 'sync-kit'}
                className="px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-cyan-300 hover:text-white font-bold text-xs rounded-xl flex items-center gap-2 border border-cyan-500/30 transition cursor-pointer disabled:opacity-50"
              >
                {downloading === 'sync-kit' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Package className="w-4 h-4 text-cyan-400" />
                )}
                <span>Baixar Kit com Agendador (.ZIP)</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setViewCodeModal({
                    title: 'Código do Sincronizador Real (sincronizar_automatico_10min.bat)',
                    filename: 'sincronizar_automatico_10min.bat',
                    content: bat10MinCode,
                  })
                }
                className="px-3.5 py-3 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 font-bold text-xs rounded-xl flex items-center gap-1.5 border border-neutral-700 transition cursor-pointer"
                title="Ver código do script"
              >
                <FileCode className="w-4 h-4 text-neutral-400" />
                <span>Ver Código</span>
              </button>
            </div>
          </div>

          {/* Destaques Técnicos do Sincronizador */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-black/50 border border-neutral-800 p-3.5 rounded-2xl space-y-1">
              <span className="font-bold text-cyan-400 font-mono flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" /> 1. Conexão Real ao Banco Local
              </span>
              <p className="text-neutral-400">Localiza o PostgreSQL (VR Software / psql.exe) e extrai os produtos com preço atualizado.</p>
            </div>
            <div className="bg-black/50 border border-neutral-800 p-3.5 rounded-2xl space-y-1">
              <span className="font-bold text-cyan-400 font-mono flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> 2. Transmissão em Lotes
              </span>
              <p className="text-neutral-400">Envia em pacotes de 500 produtos via JSON direto para o MySQL da nuvem Hostinger.</p>
            </div>
            <div className="bg-black/50 border border-neutral-800 p-3.5 rounded-2xl space-y-1">
              <span className="font-bold text-cyan-400 font-mono flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" /> 3. Execução Contínua 10 Min
              </span>
              <p className="text-neutral-400">Atualiza automaticamente a cada 600 segundos sem precisar de intervenção manual.</p>
            </div>
          </div>
        </div>
      )}

      {/* Grid com as Opções de Pacotes ZIP da Nuvem */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OPÇÃO 1: PACOTE COMPLETO DE INSTALAÇÃO & IMPLANTAÇÃO */}
        {(selectedTab === 'todos' || selectedTab === 'instalacao') && (
          <div className="bg-neutral-900/90 border-2 border-amber-500/40 hover:border-amber-500/70 transition rounded-3xl p-6 sm:p-7 space-y-6 shadow-2xl flex flex-col justify-between relative overflow-hidden">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-black rounded-full uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-amber-400" />
                  INSTALAÇÃO INICIAL NA HOSPEDAGEM
                </span>
                <span className="text-xs font-mono text-neutral-400">Pacote .ZIP Completo</span>
              </div>

              <div>
                <h3 className="text-xl font-black text-white flex items-center gap-2">
                  <FolderArchive className="w-6 h-6 text-amber-400" />
                  Pacote Completo de Instalação do App
                </h3>
                <p className="text-xs text-neutral-300 mt-1.5 leading-relaxed">
                  Para implantar do zero na Hostinger/HostGator. Contém <strong>todos os arquivos para publicação</strong> (interface compilada, pasta <code className="text-white font-mono">assets/</code>, <code className="text-white font-mono">index.html</code>, scripts PHP, schema SQL e <code className="text-white font-mono">install.php</code>).
                </p>
              </div>

              <div className="bg-black/50 border border-neutral-800 rounded-2xl p-4 space-y-2 text-xs text-neutral-300">
                <span className="font-bold text-amber-400 uppercase tracking-wider text-[11px] block">
                  Arquivos contidos:
                </span>
                <p className="text-neutral-300">• index.html, assets/, api.php, config.php, install.php, .htaccess e schema SQL.</p>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => handleDownloadPackageZip('instalacao')}
                disabled={downloading === 'install-zip'}
                className="w-full px-4 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-neutral-950 font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
              >
                {downloading === 'install-zip' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-950" />
                ) : downloadSuccess === 'install-zip' ? (
                  <Check className="w-4 h-4 text-neutral-950 font-bold" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>
                  {downloading === 'install-zip'
                    ? 'Baixando Pacote...'
                    : downloadSuccess === 'install-zip'
                    ? '✅ Download Concluído!'
                    : 'Baixar Pacote de Instalação (.ZIP)'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* OPÇÃO 2: PACOTE COMPLETO DE ATUALIZAÇÃO DO APP */}
        {(selectedTab === 'todos' || selectedTab === 'atualizacao') && (
          <div className="bg-neutral-900/90 border-2 border-emerald-500/40 hover:border-emerald-500/70 transition rounded-3xl p-6 sm:p-7 space-y-6 shadow-2xl flex flex-col justify-between relative overflow-hidden">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black rounded-full uppercase tracking-wider flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                  ATUALIZAÇÃO DO APP NA HOSPEDAGEM
                </span>
                <span className="text-xs font-mono text-emerald-400 font-bold">Pacote .ZIP</span>
              </div>

              <div>
                <h3 className="text-xl font-black text-white flex items-center gap-2">
                  <Zap className="w-6 h-6 text-emerald-400" />
                  Pacote Completo de Atualização do App
                </h3>
                <p className="text-xs text-neutral-300 mt-1.5 leading-relaxed">
                  Substitui os arquivos na hospedagem pela versão mais recente sem apagar as configurações salvas.
                </p>
              </div>

              <div className="bg-black/50 border border-neutral-800 rounded-2xl p-4 space-y-2 text-xs text-neutral-300">
                <span className="font-bold text-emerald-400 uppercase tracking-wider text-[11px] block">
                  Arquivos contidos:
                </span>
                <p className="text-neutral-300">• index.html, assets/ atualizados, atualizar_app.php, api.php e .htaccess.</p>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => handleDownloadPackageZip('atualizacao')}
                disabled={downloading === 'update-zip'}
                className="w-full px-4 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
              >
                {downloading === 'update-zip' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : downloadSuccess === 'update-zip' ? (
                  <Check className="w-4 h-4 text-white font-bold" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>
                  {downloading === 'update-zip'
                    ? 'Baixando Pacote...'
                    : downloadSuccess === 'update-zip'
                    ? '✅ Atualização Baixada!'
                    : 'Baixar Pacote de Atualização (.ZIP)'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Guia Rápido de Uso do Script BAT */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4">
        <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Info className="w-4 h-4 text-cyan-400" />
          Como sincronizar os produtos reais do supermercado:
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-black/40 border border-neutral-800/80 rounded-2xl p-4 space-y-2">
            <span className="font-bold text-cyan-400 block text-sm">Opção 1: Execução no Servidor do Supermercado (VR)</span>
            <p className="text-neutral-300 leading-relaxed">
              1. Baixe o <strong>`sincronizar_automatico_10min.bat`</strong> e coloque no servidor onde fica o PostgreSQL.<br />
              2. Dê dois cliques para abrir. O script detecta o PostgreSQL, lê todos os produtos reais e envia os preços para a nuvem a cada 10 minutos automaticamente.
            </p>
          </div>

          <div className="bg-black/40 border border-neutral-800/80 rounded-2xl p-4 space-y-2">
            <span className="font-bold text-emerald-400 block text-sm">Opção 2: Segundo Plano no Windows (Agendador)</span>
            <p className="text-neutral-300 leading-relaxed">
              1. Baixe o <strong>Kit com Agendador (.ZIP)</strong> e extraia em uma pasta como `C:\BuscaPreco`.<br />
              2. Clique com o botão direito em `instalar_agendador_10min.bat` e escolha <strong>Executar como Administrador</strong>.<br />
              3. O Windows executará a sincronização em segundo plano a cada 10 minutos mesmo com a janela fechada.
            </p>
          </div>
        </div>
      </div>

      {/* Modal de Visualização / Cópia de Código */}
      {viewCodeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-3xl max-w-3xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileCode className="w-5 h-5 text-cyan-400" />
                {viewCodeModal.title}
              </h3>
              <button
                type="button"
                onClick={() => setViewCodeModal(null)}
                className="text-neutral-400 hover:text-white text-lg font-bold px-2 py-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="relative">
              <pre className="bg-black/80 border border-neutral-800 text-cyan-300 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-96 whitespace-pre">
                {viewCodeModal.content}
              </pre>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([viewCodeModal.content], { type: 'text/plain;charset=utf-8' });
                  triggerDownloadBlob(blob, viewCodeModal.filename);
                }}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer shadow"
              >
                <Download className="w-4 h-4" />
                <span>Baixar {viewCodeModal.filename}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyText(viewCodeModal.content, 'modal-code')}
                  className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs rounded-xl flex items-center gap-2 border border-neutral-700 cursor-pointer"
                >
                  {copiedKey === 'modal-code' ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar Código</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setViewCodeModal(null)}
                  className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
