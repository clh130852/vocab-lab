@echo off
setlocal
cd /d "%~dp0"
set PORT=5180
netstat -ano | findstr ":%PORT%" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 goto open
where node >nul 2>nul
if errorlevel 1 goto nonode
start "VocabLab Server" /min cmd /c "node tools\serve.js %PORT%"
ping -n 3 127.0.0.1 >nul
goto open
:open
start "" "http://127.0.0.1:%PORT%/index.html"
exit /b
:nonode
start "" "%~dp0index.html"
exit /b