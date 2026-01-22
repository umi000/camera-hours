@echo off
echo ===========================================
echo Employee Camera Hours Dashboard
echo ===========================================
echo.
echo Starting server automatically...
echo.

cd /d "%~dp0"
node playwright-server.js

pause

