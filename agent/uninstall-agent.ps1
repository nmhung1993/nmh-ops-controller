param(
  [string]$InstallRoot = "$env:ProgramData\WindowsController\agent",
  [switch]$RemoveData
)

$ErrorActionPreference = 'Stop'
$serviceExe = Join-Path $InstallRoot 'WindowsControllerAgent.exe'
$helperScript = Join-Path (Join-Path $InstallRoot 'runtime') 'desktop-helper.js'
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

if ($RemoveData -and (Test-Path -LiteralPath $InstallRoot)) {
  $resolved = (Resolve-Path -LiteralPath $InstallRoot).Path
  $programData = (Resolve-Path -LiteralPath $env:ProgramData).Path
  if (-not $resolved.StartsWith($programData, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove data outside ProgramData: $resolved"
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
Write-Host 'Windows Controller Agent uninstalled.' -ForegroundColor Green
