param(
  [string]$InstallRoot = "$env:ProgramData\WindowsController\agent",
  [switch]$RemoveData,
  [switch]$KeepHardwareMonitor,
  [string]$HardwareMonitorInstallRoot = "$env:ProgramData\WindowsController\hardware-monitor",
  [string]$DotnetRoot = "$env:ProgramData\WindowsController\dotnet"
)

$ErrorActionPreference = 'Stop'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this uninstaller from a PowerShell window opened with Run as administrator.'
}
$serviceExe = Join-Path $InstallRoot 'WindowsControllerAgent.exe'
$helperScript = Join-Path (Join-Path $InstallRoot 'runtime') 'desktop-helper.js'
$hardwareTaskName = 'Windows Controller Hardware Monitor'
$hardwareProbeDll = Join-Path (Join-Path $HardwareMonitorInstallRoot 'bridge') 'HardwareProbe.dll'
$existingService = Get-Service -Name 'WindowsControllerAgent' -ErrorAction SilentlyContinue
if ((Test-Path -LiteralPath $serviceExe) -and $existingService) {
  & $serviceExe stop 2>$null
  & $serviceExe uninstall 2>$null
}
Stop-ScheduledTask -TaskName 'Windows Controller Desktop Helper' -ErrorAction SilentlyContinue
$helperProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($helperScript, [StringComparison]::OrdinalIgnoreCase) -ge 0 }
foreach ($helperProcess in $helperProcesses) {
  Stop-Process -Id $helperProcess.ProcessId -Force -ErrorAction SilentlyContinue
}
Unregister-ScheduledTask -TaskName 'Windows Controller Desktop Helper' -Confirm:$false -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName 'Windows Controller Agent Outbound' -ErrorAction SilentlyContinue

if (-not $KeepHardwareMonitor) {
  Stop-ScheduledTask -TaskName $hardwareTaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $hardwareTaskName -Confirm:$false -ErrorAction SilentlyContinue
  $probeProcesses = Get-CimInstance Win32_Process -Filter "Name = 'dotnet.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($hardwareProbeDll, [StringComparison]::OrdinalIgnoreCase) -ge 0 }
  foreach ($probeProcess in $probeProcesses) {
    Stop-Process -Id $probeProcess.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

if ($RemoveData) {
  $windowsControllerPath = Join-Path $env:ProgramData 'WindowsController'
  if (-not (Test-Path -LiteralPath $windowsControllerPath)) {
    Write-Host 'No Windows Controller data directory remains.'
  }
  else {
    $windowsControllerRoot = (Resolve-Path -LiteralPath $windowsControllerPath).Path
    $dataCandidates = @($InstallRoot)
    if (-not $KeepHardwareMonitor) {
      $dataCandidates += $HardwareMonitorInstallRoot, $DotnetRoot
    }
    foreach ($candidate in $dataCandidates) {
      if (-not (Test-Path -LiteralPath $candidate)) { continue }
      $resolved = (Resolve-Path -LiteralPath $candidate).Path
      if ($resolved.Equals($windowsControllerRoot, [StringComparison]::OrdinalIgnoreCase) -or
        -not $resolved.StartsWith($windowsControllerRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove data outside $windowsControllerRoot`: $resolved"
      }
      Remove-Item -LiteralPath $resolved -Recurse -Force
    }
  }
}
$hardwareMessage = if ($KeepHardwareMonitor) { 'Hardware monitor preserved.' } else { 'Hardware monitor task removed; PawnIO driver is preserved.' }
Write-Host "NMH Opss Controller Agent uninstalled. $hardwareMessage" -ForegroundColor Green
