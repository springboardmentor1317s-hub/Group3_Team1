@echo off
title Campus Event Hub

echo ========================================
echo    Event Hub
echo Starting Campus ========================================
echo.

cd /d "%~dp0"

echo [1/3] Starting Backend Server on port 5000...
start "Backend Server" cmd /k "cd /d "%~dp0backend" && node server.js"

timeout /t 3 /nobreak >nul

echo [2/3] Starting Angular Frontend on port 4200...
start "Angular Frontend" cmd /k "npm start"

echo [3/3] Done!
echo.
echo ========================================
echo    Servers are starting...
echo    Backend:   http://localhost:5000
echo    Frontend:  http://localhost:4200
echo ========================================

pause
