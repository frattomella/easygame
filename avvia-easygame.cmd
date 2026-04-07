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
echo Se la porta 3000 e occupata, Next.js usera una porta diversa.
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
