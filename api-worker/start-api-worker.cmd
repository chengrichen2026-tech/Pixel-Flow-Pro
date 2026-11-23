@echo off
setlocal

echo Starting Pixel Flow API Worker...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-windows.ps1"

if errorlevel 1 (
  echo.
  echo API Worker failed to start. Check "%~dp0..\runtime\api-worker.windows.error.log"
  pause
  exit /b 1
)

echo.
echo API Worker is ready at http://127.0.0.1:43129/health
pause
