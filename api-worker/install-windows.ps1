$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$startupDir = [Environment]::GetFolderPath("Startup")
$launcherPath = Join-Path $startupDir "Pixel Flow API Worker.cmd"
$startScript = Join-Path $PSScriptRoot "start-windows.ps1"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found. Install Node.js 20 or newer and reopen PowerShell."
}

$launcher = @"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$startScript"
"@
Set-Content -Path $launcherPath -Value $launcher -Encoding ascii

& $startScript
Write-Host "Installed startup launcher: $launcherPath"
Write-Host "Pixel Flow API Worker will start automatically after Windows sign-in."
