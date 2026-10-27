@echo off
chcp 65001 > nul
title Instalador de Tarefa Automática (10 Minutos) - Busca Preço
color 0B
cls

echo ==============================================================================
echo   INSTALADOR DE TAREFA AGENDADA DO WINDOWS - CARGA A CADA 10 MINUTOS
echo ==============================================================================
echo.
echo Este instalador configurará o Windows para disparar a carga de produtos
echo na nuvem automaticamente a cada 10 minutos em segundo plano.
echo.
echo Servidor de Destino: https://buscapreco.instara.com.br
echo Intervalo          : 10 Minutos
echo.
echo ------------------------------------------------------------------------------

set TASK_NAME=BuscaPreco_Carga_10Min
set SCRIPT_PATH=%~dp0sincronizar_automatico_10min.bat

REM Cria a tarefa agendada para rodar a cada 10 minutos
schtasks /create /tn "%TASK_NAME%" /tr "\"%SCRIPT_PATH%\"" /sc minute /mo 10 /f >nul 2>&1

if %errorlevel% equ 0 (
    echo.
    echo ==============================================================================
    echo [SUCESSO] Tarefa "%TASK_NAME%" instalada com êxito no Agendador do Windows!
    echo.
    echo O Windows agora executará a carga automaticamente a cada 10 minutos,
    echo mesmo se o computador for reiniciado.
    echo ==============================================================================
) else (
    echo.
    echo ==============================================================================
    echo [ATENÇÃO] Permissão de Administrador necessária!
    echo.
    echo Para instalar a tarefa agendada:
    echo 1. Clique com o BOTÃO DIREITO neste arquivo (%~nx0)
    echo 2. Selecione "Executar como Administrador"
    echo ==============================================================================
)

echo.
echo Pressione qualquer tecla para sair...
pause > nul
