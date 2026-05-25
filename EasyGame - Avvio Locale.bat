@echo off
setlocal

cd /d "%~dp0"

echo.
echo EasyGame - Avvio locale
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non e' installato o non e' nel PATH.
  echo Installa Node.js LTS da https://nodejs.org/
  echo Poi chiudi e riapri questo launcher.
  echo.
  pause
  exit /b 1
)

set EASYGAME_HOLD_ON_ERROR=1
node scripts\start-local.mjs
if errorlevel 1 (
  echo.
  echo Avvio interrotto. Controlla i messaggi sopra.
  pause
  exit /b 1
)

endlocal
