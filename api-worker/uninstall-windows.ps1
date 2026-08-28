$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectDir "runtime"
$pidPath = Join-Path $runtimeDir "api-worker.windows.pid"
$serverPath = Join-Path $PSScriptRoot "server.mjs"
$launcherPath = Join-Path ([Environment]::GetFolderPath("Startup")) "Pixel Flow API Worker.cmd"

Remove-Item -Path $launcherPath -Force -ErrorAction SilentlyContinue

if (Test-Path $pidPath) {
  $workerPid = [int](Get-Content $pidPath -Raw)
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $workerPid" -ErrorAction SilentlyContinue
  if ($process -and $process.CommandLine -and $process.CommandLine.Contains($serverPath)) {
    Stop-Process -Id $workerPid -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -Path $pidPath -Force -ErrorAction SilentlyContinue
}

Write-Host "Pixel Flow API Worker startup launcher was removed."
