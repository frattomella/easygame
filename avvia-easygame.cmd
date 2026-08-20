@echo off
setlocal

cd /d "%~dp0"

echo.
echo Avvio EasyGame in locale...
echo.

if not exist "node_modules" (
  echo Dipendenze non trovate. Avvio installazione...
  call npm.cmd install
  if errorlevel 1 goto :error
)

echo Il server di sviluppo sta per partire.
echo EasyGame sara disponibile su http://localhost:3001
echo Quando compare la riga "Local:", apri quell'indirizzo nel browser.
echo Per fermare l'app premi Ctrl + C in questa finestra.
echo.

call npm.cmd run dev
goto :eof

:error
echo.
echo Avvio interrotto. Controlla i messaggi di errore sopra.
pause
exit /b 1
