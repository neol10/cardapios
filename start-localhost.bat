@echo off
setlocal
cd /d %~dp0
echo Iniciando localhost em http://localhost:5500
echo (Nao feche esta janela)
node tools\keepalive.js
echo.
echo O servidor parou. Pressione qualquer tecla para fechar.
pause >nul
