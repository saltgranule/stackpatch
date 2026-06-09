@echo off
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22.5+ is required. Install from https://nodejs.org/
  pause
  exit /b 1
)

node scripts\run-dev.mjs
pause
