$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$startupDir = [Environment]::GetFolderPath("Startup")
$launcherPath = Join-Path $startupDir "Pixel Flow API Worker.cmd"
$startScript = Join-Path $PSScriptRoot "start-windows.ps1"
$bundledNodePath = Join-Path $PSScriptRoot "node-runtime\node.exe"

if (-not (Test-Path -LiteralPath $bundledNodePath) -and -not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found. Use the partner package with api-worker\node-runtime, or install Node.js 20 or newer."
}

$launcher = @"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$startScript"
"@
Set-Content -Path $launcherPath -Value $launcher -Encoding ascii

& $startScript -ForceRestart
Write-Host "Installed startup launcher: $launcherPath"
Write-Host "Pixel Flow API Worker will start automatically after Windows sign-in."
