# start-services.ps1
# Idempotent starter/watchdog for the Nepal FLDS stack on this machine.
#   - Backend (Node/Express) on :5000
#   - ML service (Python/Uvicorn) on :8000
#
# Safe to run on a schedule: it only starts a service when its port is free,
# so a 2-minute watchdog task simply does nothing when everything is healthy.
# After launching, it waits briefly and logs whether the service actually
# came up, so the log always tells the truth. Logs go to logs/service-watchdog.log
# and are capped at 1 MB (rotated by truncation).

$ErrorActionPreference = 'Continue'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $Root 'logs'
$LogFile = Join-Path $LogDir 'service-watchdog.log'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Cap the log so it cannot grow forever (~1 MB).
if (Test-Path $LogFile) {
  try {
    if ((Get-Item $LogFile).Length -gt 1MB) { Clear-Content $LogFile }
  } catch { /* ignore */ }
}

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $LogFile -Value $line
}

function Test-Port([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-Port([int]$port, [int]$seconds) {
  for ($i = 0; $i -lt $seconds; $i++) {
    if (Test-Port $port) { return $true }
    Start-Sleep -Seconds 1
  }
  return Test-Port $port
}

function Start-IfDown {
  param(
    [string]$Name,
    [int]$Port,
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$WorkingDirectory,
    [int]$WaitSeconds
  )
  if (Test-Port $Port) {
    Write-Log "$Name already up on :$Port - skipping"
    return
  }
  Write-Log "Starting $Name on :$Port ..."
  try {
    Start-Process -FilePath $FilePath -ArgumentList $ArgumentList `
      -WorkingDirectory $WorkingDirectory -WindowStyle Hidden
    if (Wait-Port $Port $WaitSeconds) {
      Write-Log "  $Name confirmed up on :$Port"
    } else {
      Write-Log "  $Name launch issued but not listening yet - will re-check next pass"
    }
  } catch {
    Write-Log "  FAILED to start $Name : $($_.Exception.Message)"
  }
}

# --- Backend: node src/server.js (cwd = backend/) ---
$node = (Get-Command node -ErrorAction SilentlyContinue).Source | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $node) {
  Write-Log 'Could not find node.exe - Backend service not started'
} else {
  Start-IfDown -Name 'backend' -Port 5000 -FilePath $node `
    -ArgumentList @('src/server.js') `
    -WorkingDirectory (Join-Path $Root 'backend') -WaitSeconds 15
}

# --- ML service: python -m uvicorn predict_service:app (cwd = models/) ---
$pythonCandidates = @((Get-Command python -ErrorAction SilentlyContinue).Source) | Where-Object { $_ -and (Test-Path $_) }
$python = $pythonCandidates | Select-Object -First 1
if (-not $python) {
  Write-Log 'Could not find python.exe - ML service not started'
} else {
  # Uvicorn loads XGBoost models at boot, so allow up to 25s to confirm.
  Start-IfDown -Name 'ml-service' -Port 8000 -FilePath $python `
    -ArgumentList @('-m', 'uvicorn', 'predict_service:app', '--host', '127.0.0.1', '--port', '8000') `
    -WorkingDirectory (Join-Path $Root 'models') -WaitSeconds 25
}

Write-Log 'Watchdog pass complete.'
