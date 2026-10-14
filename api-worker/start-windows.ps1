param(
  [switch]$ForceRestart
)

$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectDir "runtime"
$serverPath = Join-Path $PSScriptRoot "server.mjs"
$pidPath = Join-Path $runtimeDir "api-worker.windows.pid"
$stdoutPath = Join-Path $runtimeDir "api-worker.windows.log"
$stderrPath = Join-Path $runtimeDir "api-worker.windows.error.log"
$healthUrl = "http://127.0.0.1:43129/health"

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

function Get-PixelFlowWorkerProcess {
  if (Test-Path $pidPath) {
    try {
      $savedPid = [int](Get-Content $pidPath -Raw)
      $savedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $savedPid" -ErrorAction SilentlyContinue
      if ($savedProcess -and $savedProcess.CommandLine -match "api-worker[\\/]server\.mjs") {
        return $savedProcess
      }
    } catch {
    }
  }

  try {
    $connection = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort 43129 -State Listen -ErrorAction Stop | Select-Object -First 1
    if ($connection) {
      $portProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
      if ($portProcess -and $portProcess.CommandLine -match "api-worker[\\/]server\.mjs") {
        return $portProcess
      }
    }
  } catch {
  }

  return $null
}

$runningHealth = $null
try {
  $runningHealth = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
} catch {
}

if ($runningHealth -and $runningHealth.ok) {
  $supportsCurrentModels = $runningHealth.workerVersion -ge 2 -and $runningHealth.apiModels -contains "gpt-image-2.5-sunburst" -and $runningHealth.apiModels -contains "gpt-image-2.5-flare"
  if (-not $ForceRestart -and $supportsCurrentModels) {
    Write-Host "Pixel Flow API Worker is already running with current model support."
    exit 0
  }

  $runningProcess = Get-PixelFlowWorkerProcess
  if (-not $runningProcess) {
    throw "Port 43129 is in use, but the running process could not be verified as Pixel Flow API Worker. Stop it manually and retry."
  }
  Write-Host "Stopping previous Pixel Flow API Worker (PID $($runningProcess.ProcessId)) before update."
  Stop-Process -Id $runningProcess.ProcessId -Force -ErrorAction Stop
  Start-Sleep -Seconds 1
  Remove-Item -Path $pidPath -Force -ErrorAction SilentlyContinue
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
