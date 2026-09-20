@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   K PLUS First Jobber - prototype
echo   starting server...
echo.
if not exist "data\db.json" node server\seed.js
start "" http://localhost:4173/
node server\index.js
pause
