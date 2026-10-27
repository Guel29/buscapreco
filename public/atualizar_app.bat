@echo off
chcp 65001 > nul
title Sincronizador Busca Preco
cls
echo ========================================================
echo  INICIANDO ATUALIZADOR E SINCRONIZADOR DE PRECOS
echo ========================================================
echo.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0atualizar_app.ps1"
pause
