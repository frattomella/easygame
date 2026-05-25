$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

Write-Host ""
Write-Host "EasyGame - Avvio locale"
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js non e' installato o non e' nel PATH." -ForegroundColor Red
  Write-Host "Installa Node.js LTS da https://nodejs.org/"
  Read-Host "Premi Invio per chiudere"
  exit 1
}

$env:EASYGAME_HOLD_ON_ERROR = "1"

try {
  & node "scripts/start-local.mjs"
  if ($LASTEXITCODE -ne 0) {
    throw "Avvio locale terminato con codice $LASTEXITCODE."
  }
} catch {
  Write-Host ""
  Write-Host "Avvio interrotto: $_" -ForegroundColor Red
  Write-Host "Se PowerShell blocca lo script, esegui:"
  Write-Host "powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1"
  Read-Host "Premi Invio per chiudere"
  exit 1
}
