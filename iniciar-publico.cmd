@echo off
rem Sobe o servidor do 2o turno numa janela propria e abre um link publico temporario
rem (Cloudflare quick tunnel). O link aparece abaixo, numa linha com "trycloudflare.com".
rem Feche esta janela para tirar o link do ar; feche a janela do servidor para para-lo.
cd /d %~dp0
set CF=cloudflared
where cloudflared >nul 2>nul
if errorlevel 1 set CF="%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not exist %CF% if "%CF%"=="cloudflared" goto ok
if not "%CF%"=="cloudflared" if not exist %CF% (
  echo cloudflared nao encontrado. Instale com:
  echo   winget install Cloudflare.cloudflared
  echo e abra este atalho de novo.
  pause
  exit /b 1
)
:ok
start "Servidor 2o turno" /min node servidor-2t.js
timeout /t 5 /nobreak >nul
echo.
echo Procure abaixo o endereco https://....trycloudflare.com e envie para as pessoas.
echo.
%CF% tunnel --url http://localhost:3026
