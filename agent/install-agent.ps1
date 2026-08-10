param(
  [Parameter(Mandatory = $true)]
  [string]$ServerUrl,
  [string]$InstallRoot = "$env:ProgramData\WindowsController\agent",
  [string]$NodeExe = "$env:ProgramFiles\nodejs\node.exe"
)

$ErrorActionPreference = 'Stop'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this installer from a PowerShell window opened with Run as administrator.'
}
$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $InstallRoot 'runtime'
$stateDir = Join-Path $InstallRoot 'state'
$helperDir = Join-Path $InstallRoot 'helper'
$captureDir = Join-Path $helperDir 'captures'
$serviceExe = Join-Path $InstallRoot 'WindowsControllerAgent.exe'
$serviceXml = Join-Path $InstallRoot 'WindowsControllerAgent.xml'
$configFile = Join-Path $InstallRoot 'config.json'
$helperConfig = Join-Path $helperDir 'helper.json'
$pipeName = '\\.\pipe\windows-controller-desktop'
$helperTaskName = 'Windows Controller Desktop Helper'
$helperScript = Join-Path $runtimeDir 'desktop-helper.js'

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($Path, $Content, $encoding)
}

if (-not (Test-Path -LiteralPath $NodeExe)) {
  throw "Node.js 22.5+ was not found at $NodeExe"
}

# Stop the old helper before rotating its pipe secret and replacing the runtime.
Stop-ScheduledTask -TaskName $helperTaskName -ErrorAction SilentlyContinue
$helperProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($helperScript, [StringComparison]::OrdinalIgnoreCase) -ge 0 }
foreach ($helperProcess in $helperProcesses) {
  Stop-Process -Id $helperProcess.ProcessId -Force -ErrorAction SilentlyContinue
}
if ($helperProcesses) { Start-Sleep -Milliseconds 500 }
New-Item -ItemType Directory -Force -Path $runtimeDir, $stateDir, $helperDir, $captureDir | Out-Null
$existingService = Get-Service -Name 'WindowsControllerAgent' -ErrorAction SilentlyContinue
if ((Test-Path -LiteralPath $serviceExe) -and $existingService) {
  & $serviceExe stop 2>$null
}
Copy-Item -LiteralPath (Join-Path $sourceDir 'agent.js') -Destination $runtimeDir -Force
Copy-Item -LiteralPath (Join-Path $sourceDir 'windows.js') -Destination $runtimeDir -Force
Copy-Item -LiteralPath (Join-Path $sourceDir 'desktop-helper.js') -Destination $runtimeDir -Force
Copy-Item -LiteralPath (Join-Path $sourceDir 'start-helper-hidden.vbs') -Destination $runtimeDir -Force
Copy-Item -LiteralPath (Join-Path $sourceDir 'package.json') -Destination $runtimeDir -Force

Push-Location $runtimeDir
try {
  & "$env:ProgramFiles\nodejs\npm.cmd" install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
} finally {
  Pop-Location
}

$config = @{
  serverUrl = $ServerUrl.TrimEnd('/')
  stateDir = $stateDir
  helperConfig = $helperConfig
  helperCaptureDir = $captureDir
}
Write-Utf8NoBom -Path $configFile -Content ($config | ConvertTo-Json)

$secretBytes = New-Object byte[] 32
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
$random.GetBytes($secretBytes)
$random.Dispose()
$helper = @{
  pipeName = $pipeName
  secret = [Convert]::ToBase64String($secretBytes)
  stateDir = $captureDir
}
Write-Utf8NoBom -Path $helperConfig -Content ($helper | ConvertTo-Json)

# Agent secrets remain readable only by SYSTEM and local administrators.
& icacls.exe $stateDir /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' | Out-Null
# Runtime code and service configuration cannot be modified by standard users.
& icacls.exe $runtimeDir /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' 'Users:(OI)(CI)RX' | Out-Null
& icacls.exe $configFile /inheritance:r /grant:r 'SYSTEM:F' 'Administrators:F' | Out-Null
# The interactive helper needs its own config and screenshot staging directory.
& icacls.exe $helperDir /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' 'Users:(OI)(CI)M' | Out-Null

if (-not (Test-Path -LiteralPath $serviceExe)) {
  Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe' -OutFile $serviceExe
}

$xmlNode = [Security.SecurityElement]::Escape($NodeExe)
$xmlAgent = [Security.SecurityElement]::Escape((Join-Path $runtimeDir 'agent.js'))
$xmlConfig = [Security.SecurityElement]::Escape($configFile)
$xmlRoot = [Security.SecurityElement]::Escape($InstallRoot)
@"
<service>
  <id>WindowsControllerAgent</id>
  <name>Windows Controller Agent</name>
  <description>Collects Windows telemetry and executes approved controller commands.</description>
  <executable>$xmlNode</executable>
  <arguments>&quot;$xmlAgent&quot; --config &quot;$xmlConfig&quot;</arguments>
  <workingdirectory>$xmlRoot</workingdirectory>
  <hidewindow>true</hidewindow>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <onfailure action="restart" delay="10 sec" />
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>5</keepFiles></log>
</service>
"@ | ForEach-Object { Write-Utf8NoBom -Path $serviceXml -Content $_ }

$existingService = Get-Service -Name 'WindowsControllerAgent' -ErrorAction SilentlyContinue
if ($existingService) {
  & $serviceExe stop 2>$null
  & $serviceExe uninstall 2>$null
}
& $serviceExe install
& $serviceExe start

$helperVbs = Join-Path $runtimeDir 'start-helper-hidden.vbs'
$interactiveUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskAction = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wscript.exe" -Argument "`"$helperVbs`" `"$helperConfig`""
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $interactiveUser
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $interactiveUser -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $helperTaskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null
Start-ScheduledTask -TaskName $helperTaskName

$serverUri = [Uri]$ServerUrl
New-NetFirewallRule -DisplayName 'Windows Controller Agent Outbound' -Direction Outbound -Action Allow -Protocol TCP -RemotePort $serverUri.Port -Profile Private -ErrorAction SilentlyContinue | Out-Null

$fingerprint = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography').MachineGuid
Write-Host ''
Write-Host 'Agent installed and started.' -ForegroundColor Green
Write-Host "Server:      $ServerUrl"
Write-Host "Hostname:    $env:COMPUTERNAME"
Write-Host "Fingerprint: $fingerprint"
Write-Host 'Approve this pending agent in the Central Server admin page.'
