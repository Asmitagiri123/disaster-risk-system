# setup-scheduled-tasks.ps1
# Registers the Nepal FLDS auto-start tasks:
#   1. FLDS-Services-Watchdog - every 2 minutes, restarts services if down
#   2. FLDS-Services-Logon    - at user logon, starts services
# Safe to re-run (uses -Force). No admin required.

$ErrorActionPreference = 'Stop'

$Root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$PS1    = Join-Path $Root 'start-services.ps1'
$Action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $PS1 + '"')

# --- Watchdog: repeat every 2 minutes, start 1 minute from now ---
# (Task Scheduler XML caps repetition duration; 10 years is effectively forever.)
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 2) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'FLDS-Services-Watchdog' `
  -Action $Action -Trigger $trigger -Settings $settings `
  -Description 'Restarts Nepal FLDS backend + ML service if down (every 2 min)' -Force | Out-Null

# --- Logon: also try to register an at-logon trigger (may need elevation; registry Run entry covers it otherwise) ---
try {
  $tLogon = New-ScheduledTaskTrigger -AtLogOn
  Register-ScheduledTask -TaskName 'FLDS-Services-Logon' `
    -Action $Action -Trigger $tLogon `
    -Description 'Starts Nepal FLDS backend + ML service at logon' -Force | Out-Null
  Write-Host 'FLDS-Services-Logon registered.'
} catch {
  Write-Host ('FLDS-Services-Logon skipped (needs elevation): ' + $_.Exception.Message)
}

Write-Host '=== Tasks now registered ==='
Get-ScheduledTask -TaskName 'FLDS-Services-*' |
  Select-Object TaskName, State | Format-Table -AutoSize

foreach ($t in @('FLDS-Services-Watchdog', 'FLDS-Services-Logon')) {
  try {
    $info = Get-ScheduledTaskInfo -TaskName $t
    Write-Host ("{0}: Next={1} LastRun={2} LastResult={3}" -f $t, $info.NextRunTime, $info.LastRunTime, $info.LastTaskResult)
  } catch {
    Write-Host ("{0}: not present" -f $t)
  }
}
