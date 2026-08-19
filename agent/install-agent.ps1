param(
  [Parameter(Mandatory = $true)]
  [string]$ServerUrl,
  [string]$InstallRoot = "$env:ProgramData\WindowsController\agent",
  [string]$NodeExe = "$env:ProgramFiles\nodejs\node.exe",
  [switch]$SkipHardwareMonitor,
  [string]$HardwareMonitorPackagePath,
  [string]$HardwareMonitorInstallRoot = "$env:ProgramData\WindowsController\hardware-monitor",
  [string]$DotnetRoot = "$env:ProgramData\WindowsController\dotnet"
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
$serviceName = 'WindowsControllerAgent'
$serviceExe = Join-Path $InstallRoot 'WindowsControllerAgent.exe'
$serviceXml = Join-Path $InstallRoot 'WindowsControllerAgent.xml'
$configFile = Join-Path $InstallRoot 'config.json'
$helperConfig = Join-Path $helperDir 'helper.json'
$pipeName = '\\.\pipe\windows-controller-desktop'
$helperTaskName = 'Windows Controller Desktop Helper'
$helperScript = Join-Path $runtimeDir 'desktop-helper.js'
$agentSource = Join-Path $sourceDir 'agent.js'
$agentRuntime = Join-Path $runtimeDir 'agent.js'

$packageJsonFallback = @'
{
  "name": "windows-controller-agent",
  "version": "2.1.5",
  "private": true,
  "main": "agent.js",
  "engines": {
    "node": ">=22.5"
  },
  "dependencies": {
    "ws": "^8.18.0"
  }
}
'@

function Read-FileTextResilient([string]$Path, [string]$Fallback = '') {
  try {
    if (Test-Path -LiteralPath $Path) {
      $encoding = New-Object System.Text.UTF8Encoding($false)
      return [System.IO.File]::ReadAllText($Path, $encoding)
    }
  } catch {}
  try {
    if (Test-Path -LiteralPath $Path) {
      return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 -ErrorAction Stop)
    }
  } catch {}
  return $Fallback
}

function Copy-FileResilient([string]$SourcePath, [string]$DestinationDir, [string]$FallbackContent = $null) {
  $fileName = Split-Path -Leaf $SourcePath
  $destPath = Join-Path $DestinationDir $fileName
  
  # Method 1: Direct text read/write (.NET handles OneDrive dehydration much better than PowerShell Copy-Item)
  try {
    if (Test-Path -LiteralPath $SourcePath) {
      $encoding = New-Object System.Text.UTF8Encoding($false)
      $content = [System.IO.File]::ReadAllText($SourcePath, $encoding)
      if ($content) {
        [System.IO.File]::WriteAllText($destPath, $content, $encoding)
        return
      }
    }
  } catch {
    Write-Warning "Direct text read of $fileName encountered: $($_.Exception.Message)"
  }

  # Method 2: Direct byte array read/write
  try {
    if (Test-Path -LiteralPath $SourcePath) {
      $bytes = [System.IO.File]::ReadAllBytes($SourcePath)
      if ($bytes -and $bytes.Length -gt 0) {
        [System.IO.File]::WriteAllBytes($destPath, $bytes)
        return
      }
    }
  } catch {
    Write-Warning "Direct byte read of $fileName encountered: $($_.Exception.Message)"
  }

  # Method 3: Standard Copy-Item
  try {
    if (Test-Path -LiteralPath $SourcePath) {
      Copy-Item -LiteralPath $SourcePath -Destination $destPath -Force -ErrorAction Stop
      return
    }
  } catch {
    Write-Warning "Copy-Item of $fileName encountered: $($_.Exception.Message)"
  }

  # Method 4: Fallback Content if available
  if ($FallbackContent) {
    Write-Host "Writing embedded fallback content for $fileName..." -ForegroundColor Yellow
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($destPath, $FallbackContent, $encoding)
    return
  }

  throw "Failed to copy $fileName to $DestinationDir. If files are in OneDrive, right-click the folder and choose 'Always keep on this device'."
}

$agentContent = Read-FileTextResilient -Path $agentSource -Fallback "const VERSION = '2.1.5';"
$versionMatch = [regex]::Match($agentContent, "const VERSION = '([^']+)'" )
$agentVersion = if ($versionMatch.Success) { $versionMatch.Groups[1].Value } else { '2.1.5' }

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Wait-ServiceStatus([string]$Name, [string]$Status, [int]$TimeoutSeconds = 30) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($service -and $service.Status.ToString() -eq $Status) { return $true }
    Start-Sleep -Milliseconds 500
  } while ([DateTime]::UtcNow -lt $deadline)
  return $false
}

function Wait-ServiceDeleted([string]$Name, [int]$TimeoutSeconds = 30) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    & sc.exe query $Name 2>$null | Out-Null
    $scExitCode = $LASTEXITCODE
    if (-not $service -and $scExitCode -eq 1060) { return $true }
    Start-Sleep -Milliseconds 500
  } while ([DateTime]::UtcNow -lt $deadline)
  return $false
}

function Invoke-WinSWChecked([string]$Executable, [string]$Operation) {
  $process = Start-Process -FilePath $Executable -ArgumentList $Operation -Wait -PassThru -NoNewWindow
  if ($process.ExitCode -ne 0) {
    throw "WinSW $Operation failed with exit code $($process.ExitCode)."
  }
}

function Remove-ExistingService([string]$Name, [string]$Executable) {
  $existingService = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $existingService) { return }

  Write-Host "Stopping existing service $Name..." -ForegroundColor Cyan
  if ($existingService.Status -ne 'Stopped') {
    if (Test-Path -LiteralPath $Executable) {
      Invoke-WinSWChecked -Executable $Executable -Operation 'stop'
    } else {
      Stop-Service -Name $Name -Force
    }
  }
  if (-not (Wait-ServiceStatus -Name $Name -Status 'Stopped')) {
    throw "Timed out waiting for service $Name to stop."
  }

  if (Test-Path -LiteralPath $Executable) {
    Invoke-WinSWChecked -Executable $Executable -Operation 'uninstall'
  } else {
    & sc.exe delete $Name | Out-Null
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1060) {
      throw "sc.exe could not delete service $Name (exit code $LASTEXITCODE)."
    }
  }

  if (-not (Wait-ServiceDeleted -Name $Name)) {
    # WinSW can return before SCM releases the service registration.
    & sc.exe delete $Name | Out-Null
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1060 -and $LASTEXITCODE -ne 1072) {
      throw "sc.exe could not delete service $Name (exit code $LASTEXITCODE)."
    }
    if (-not (Wait-ServiceDeleted -Name $Name -TimeoutSeconds 30)) {
      throw "Timed out waiting for service $Name to be removed from Windows SCM."
    }
  }
}

if (-not (Test-Path -LiteralPath $NodeExe)) {
  throw "Node.js 22.5+ was not found at $NodeExe"
}
try {
  $serverUri = [Uri]$ServerUrl
  if ($serverUri.Scheme -notin @('http', 'https') -or -not $serverUri.Host) {
    throw 'ServerUrl must be an absolute http:// or https:// URL.'
  }
} catch {
  throw "Invalid ServerUrl: $ServerUrl. Use for example http://192.168.1.10:3003"
}
$hardwareInstaller = Join-Path $sourceDir 'install-hardware-monitor.ps1'
if (-not $SkipHardwareMonitor -and -not (Test-Path -LiteralPath $hardwareInstaller)) {
  throw "Hardware monitor installer was not found at $hardwareInstaller"
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
Remove-ExistingService -Name $serviceName -Executable $serviceExe

Copy-FileResilient -SourcePath $agentSource -DestinationDir $runtimeDir
Copy-FileResilient -SourcePath (Join-Path $sourceDir 'windows.js') -DestinationDir $runtimeDir
Copy-FileResilient -SourcePath (Join-Path $sourceDir 'desktop-helper.js') -DestinationDir $runtimeDir
Copy-FileResilient -SourcePath (Join-Path $sourceDir 'start-helper-hidden.vbs') -DestinationDir $runtimeDir
Copy-FileResilient -SourcePath (Join-Path $sourceDir 'package.json') -DestinationDir $runtimeDir -FallbackContent $packageJsonFallback

if (-not (Test-Path -LiteralPath $agentRuntime) -or (Get-Item -LiteralPath $agentRuntime).Length -eq 0) {
  throw 'Installed Agent runtime agent.js is missing or empty.'
}

try {
  $sourceHash = (Get-FileHash -LiteralPath $agentSource -ErrorAction SilentlyContinue).Hash
  $runtimeHash = (Get-FileHash -LiteralPath $agentRuntime -ErrorAction SilentlyContinue).Hash
  if ($sourceHash -and $runtimeHash -and $sourceHash -ne $runtimeHash) {
    throw 'Installed Agent runtime does not match the source agent.js.'
  }
} catch {
  if ($_.Exception.Message -match 'Installed Agent runtime does not match') { throw $_ }
}

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

Invoke-WinSWChecked -Executable $serviceExe -Operation 'install'
Invoke-WinSWChecked -Executable $serviceExe -Operation 'start'
if (-not (Wait-ServiceStatus -Name $serviceName -Status 'Running')) {
  throw "Service $serviceName did not reach the Running state. Check the WinSW logs in $InstallRoot."
}
$processDeadline = [DateTime]::UtcNow.AddSeconds(30)
do {
  $agentProcess = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($agentRuntime, [StringComparison]::OrdinalIgnoreCase) -ge 0 } |
    Select-Object -First 1
  if ($agentProcess) { break }
  Start-Sleep -Milliseconds 500
} while ([DateTime]::UtcNow -lt $processDeadline)
if (-not $agentProcess) {
  throw "Agent service is running but the Node.js runtime did not stay alive. Check $InstallRoot\WindowsControllerAgent.err.log."
}

$helperVbs = Join-Path $runtimeDir 'start-helper-hidden.vbs'
$interactiveUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskAction = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wscript.exe" -Argument "`"$helperVbs`" `"$helperConfig`""
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $interactiveUser
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $interactiveUser -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $helperTaskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null
Start-ScheduledTask -TaskName $helperTaskName

Remove-NetFirewallRule -DisplayName 'Windows Controller Agent Outbound' -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName 'Windows Controller Agent Outbound' -Direction Outbound -Action Allow -Protocol TCP -RemotePort $serverUri.Port -Profile Any | Out-Null

$hardwareStatus = 'Skipped by -SkipHardwareMonitor'
if (-not $SkipHardwareMonitor) {
  Write-Host ''
  Write-Host 'Installing LibreHardwareMonitor bridge and PawnIO...' -ForegroundColor Cyan
  $hardwareArguments = @{
    InstallRoot = $HardwareMonitorInstallRoot
    DotnetRoot = $DotnetRoot
  }
  if ($HardwareMonitorPackagePath) {
    $hardwareArguments.PackagePath = $HardwareMonitorPackagePath
  }
  & $hardwareInstaller @hardwareArguments
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw "Hardware monitor installer failed with exit code $LASTEXITCODE"
  }
  $hardwareStatus = 'Installed'
}

$fingerprint = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography').MachineGuid
Write-Host ''
Write-Host 'Agent installed and started.' -ForegroundColor Green
Write-Host "Version:     $agentVersion"
Write-Host "Server:      $ServerUrl"
Write-Host "Hostname:    $env:COMPUTERNAME"
Write-Host "Fingerprint: $fingerprint"
Write-Host "Hardware:    $hardwareStatus"
Write-Host 'Approve this pending agent in the Central Server admin page.'
