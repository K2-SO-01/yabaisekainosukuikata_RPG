@echo off
rem Double-click this file to play the game on this PC (opens http://localhost:8123/ in your browser).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\server.ps1" -Port 8123 %*
pause
