@echo off
rem Sobe o servidor do 2º turno numa janela própria e abre um link público temporário
rem (Cloudflare quick tunnel). O link aparece abaixo, numa linha com "trycloudflare.com".
rem Feche esta janela para tirar o link do ar; feche a janela do servidor para pará-lo.
cd /d %~dp0
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo cloudflared nao encontrado. Instale com:
  echo   winget install Cloudflare.cloudflared
  echo e abra este atalho de novo.
  pause
  exit /b 1
)
start "Servidor 2o turno" /min node servidor-2t.js
timeout /t 5 /nobreak >nul
echo.
echo Procure abaixo o endereco https://....trycloudflare.com e envie para as pessoas.
echo.
cloudflared tunnel --url http://localhost:3026
