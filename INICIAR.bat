@echo off
chcp 65001 >nul
title Tributa.AI
cd /d "%~dp0"
color 0b
echo.
echo   ======================================================
echo      TRIBUTA.AI  -  Agente da Reforma Tributaria
echo   ======================================================
echo.
echo   Iniciando... duas janelas vao abrir (API e site).
echo   NAO FECHE elas enquanto estiver usando.
echo.

REM --- 1) Backend (API + agente) na porta 8000 ---
start "Tributa.AI - API (porta 8000)" cmd /k "cd /d "%~dp0backend" && python -m uvicorn app.main:app --port 8000"

REM --- 2) Site (frontend) na porta 5500 ---
start "Tributa.AI - Site (porta 5500)" cmd /k "cd /d "%~dp0web" && python -m http.server 5500"

REM --- 3) Abrir no navegador ---
echo   Abrindo o navegador em http://localhost:5500 ...
timeout /t 4 >nul
start "" "http://localhost:5500"

echo.
echo   Pronto! Se nao abrir sozinho, acesse:  http://localhost:5500
echo.
echo   Para PARAR: feche as duas janelas pretas (API e Site).
echo.
pause
