@echo off
rem Sobe o servidor do 2º turno e abre a tela no navegador. Feche esta janela para parar.
cd /d %~dp0
start "" http://localhost:3026
node servidor-2t.js
