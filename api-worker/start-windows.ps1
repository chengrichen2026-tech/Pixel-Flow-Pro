$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectDir "runtime"
$serverPath = Join-Path $PSScriptRoot "server.mjs"
$pidPath = Join-Path $runtimeDir "api-worker.windows.pid"
$stdoutPath = Join-Path $runtimeDir "api-worker.windows.log"
$stderrPath = Join-Path $runtimeDir "api-worker.windows.error.log"
$healthUrl = "http://127.0.0.1:43129/health"

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
  if ($health.ok) {
    Write-Host "Pixel Flow API Worker is already running."
    exit 0
  }
} catch {
}

$node = (Get-Command node -ErrorAction Stop).Source
$process = Start-Process -FilePath $node `
  -ArgumentList @($serverPath) `
  -WorkingDirectory $projectDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -PassThru
Set-Content -Path $pidPath -Value $process.Id -Encoding ascii

for ($attempt = 0; $attempt -lt 15; $attempt++) {
  Start-Sleep -Seconds 1
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if ($health.ok) {
      Write-Host "Pixel Flow API Worker is running on 127.0.0.1:43129 (PID $($process.Id))."
      exit 0
    }
  } catch {
  }
  if ($process.HasExited) {
    throw "Pixel Flow API Worker exited during startup. See $stderrPath"
  }
}

Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
throw "Pixel Flow API Worker did not pass its health check. See $stderrPath"
