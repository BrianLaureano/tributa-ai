@echo off
chcp 65001 >nul
title Tributa.AI - Instalacao
cd /d "%~dp0"
color 0e
echo.
echo   ======================================================
echo      TRIBUTA.AI  -  Instalacao (so precisa 1 vez)
echo   ======================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo   [ERRO] Python nao encontrado.
  echo   Instale em https://www.python.org/downloads/  e marque "Add to PATH".
  echo.
  pause
  exit /b 1
)

echo   Instalando as dependencias do backend...
echo.
cd backend
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cd ..
echo.
echo   ======================================================
echo      Pronto! Agora e so dar 2 cliques em INICIAR.bat
echo   ======================================================
echo.
echo   (Opcional) Para usar o Claude de verdade, crie o arquivo
echo   backend\.env com:   ANTHROPIC_API_KEY=sua-chave-aqui
echo.
pause
