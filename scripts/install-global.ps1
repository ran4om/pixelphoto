# Install PixelPhoto globally on Windows (PowerShell). Run from repo root:
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-global.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "node is not installed (need Node.js 20+)."
}

Write-Host "Installing dependencies…"
npm install

Write-Host "Building…"
npm run build

Write-Host "Installing globally…"
npm install -g .

Write-Host "Done. Try: pixelphoto --help"
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Host "Note: install Bun from https://bun.sh for the TUI (pixelphoto tui)."
}
