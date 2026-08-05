# setup-scheduled-tasks.ps1
# Registers the Nepal FLDS auto-start tasks:
#   1. FLDS-Services-Watchdog - every 2 minutes, restarts services if down.
#   2. FLDS-Services-Logon    - at user logon, starts services.
# Safe to re-run (uses -Force). No admin required.

$ErrorActionPreference = 'Stop'

Write-Host "Setting up Nepal FLDS auto-start tasks..." -ForegroundColor Yellow

try {
    $Root   = Split-Path -Parent $MyInvocation.MyCommand.Path -Resolve
    $PS1    = Join-Path $Root 'start-services.ps1'
    $Action = New-ScheduledTaskAction -Execute 'powershell.exe' `
      -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PS1`""

    # --- Watchdog: repeat every 2 minutes, start 1 minute from now ---
    # (Task Scheduler XML caps repetition duration; 10 years is effectively forever.)
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
      -RepetitionInterval (New-TimeSpan -Minutes 2) `
      -RepetitionDuration (New-TimeSpan -Days 3650)
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
      -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
      -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
      -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName 'FLDS-Services-Watchdog' `
      -Action $Action -Trigger $trigger -Settings $settings `
      -Description 'Restarts Nepal FLDS backend + ML service if down (every 2 min)' -Force | Out-Null
    Write-Host "[OK] Watchdog task 'FLDS-Services-Watchdog' registered." -ForegroundColor Green

    # --- Logon: also try to register an at-logon trigger ---
    try {
      $tLogon = New-ScheduledTaskTrigger -AtLogOn
      Register-ScheduledTask -TaskName 'FLDS-Services-Logon' `
        -Action $Action -Trigger $tLogon `
        -Description 'Starts Nepal FLDS backend + ML service at logon' -Force | Out-Null
      Write-Host "[OK] Logon task 'FLDS-Services-Logon' registered." -ForegroundColor Green
    } catch {
      Write-Warning ('Logon task registration skipped (may need elevation): ' + $_.Exception.Message)
    }

    Write-Host "`n=== Task Status ===" -ForegroundColor Cyan
    Get-ScheduledTask -TaskName 'FLDS-Services-*' | Select-Object TaskName, State | Format-Table -AutoSize

    foreach ($t in @('FLDS-Services-Watchdog', 'FLDS-Services-Logon')) {
      try {
        $info = Get-ScheduledTaskInfo -TaskName $t
        Write-Host ("{0}: Next Run = {1}, Last Run = {2}, Last Result = {3}" -f $t, $info.NextRunTime, $info.LastRunTime, $info.LastTaskResult)
      } catch {
        Write-Warning ("Could not get info for task '{0}'." -f $t)
      }
    }
    Write-Host "`nSetup complete. The services will now start automatically." -ForegroundColor Green
} catch {
    Write-Error "An error occurred during task setup: $_"
    exit 1
}
