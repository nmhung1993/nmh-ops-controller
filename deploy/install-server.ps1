param(
  [string]$InstallRoot = "$env:ProgramData\WindowsController\server",
  [int]$Port = 3003,
  [string]$NodeExe = "$env:ProgramFiles\nodejs\node.exe"
)

$ErrorActionPreference = 'Stop'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this installer from a PowerShell window opened with Run as administrator.'
}
$sourceRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$serviceName = 'WindowsControllerServer'
$serviceExe = Join-Path $InstallRoot 'WindowsControllerServer.exe'
$serviceXml = Join-Path $InstallRoot 'WindowsControllerServer.xml'

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

function Wait-HttpReady([int]$Port, [int]$TimeoutSeconds = 30) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/api/setup/status" -TimeoutSec 2
      if ($response.StatusCode -eq 200) { return $true }
    } catch {}
    Start-Sleep -Milliseconds 500
  } while ([DateTime]::UtcNow -lt $deadline)
  return $false
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

if (-not (Test-Path -LiteralPath $NodeExe)) { throw "Node.js 22.5+ was not found at $NodeExe" }
New-Item -ItemType Directory -Force -Path $InstallRoot, (Join-Path $InstallRoot 'data') | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot 'server') -Destination $InstallRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'public') -Destination $InstallRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'package.json') -Destination $InstallRoot -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'package-lock.json') -Destination $InstallRoot -Force

foreach ($legacyFile in @('users.json', 'config.json', 'history.json')) {
  $source = Join-Path (Join-Path $sourceRoot 'data') $legacyFile
  $destination = Join-Path (Join-Path $InstallRoot 'data') $legacyFile
  if ((Test-Path -LiteralPath $source) -and -not (Test-Path -LiteralPath $destination)) {
    Copy-Item -LiteralPath $source -Destination $destination
  }
}

Push-Location $InstallRoot
try {
  & "$env:ProgramFiles\nodejs\npm.cmd" ci --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $serviceExe)) {
  Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe' -OutFile $serviceExe
}

# Keep the current server online during file preparation and dependency install.
# The brief service replacement below is the only intentional outage.
Remove-ExistingService -Name $serviceName -Executable $serviceExe

$xmlNode = [Security.SecurityElement]::Escape($NodeExe)
$xmlServer = [Security.SecurityElement]::Escape((Join-Path $InstallRoot 'server\server.js'))
$xmlRoot = [Security.SecurityElement]::Escape($InstallRoot)
@"
<service>
  <id>WindowsControllerServer</id>
  <name>Windows Controller Central Server</name>
  <description>Hosts the Windows fleet monitoring web application.</description>
  <executable>$xmlNode</executable>
  <arguments>&quot;$xmlServer&quot;</arguments>
  <workingdirectory>$xmlRoot</workingdirectory>
  <hidewindow>true</hidewindow>
  <env name="HOST" value="0.0.0.0" />
  <env name="PORT" value="$Port" />
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <onfailure action="restart" delay="10 sec" />
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>5</keepFiles></log>
</service>
"@ | Set-Content -LiteralPath $serviceXml -Encoding UTF8

Invoke-WinSWChecked -Executable $serviceExe -Operation 'install'
Invoke-WinSWChecked -Executable $serviceExe -Operation 'start'
if (-not (Wait-ServiceStatus -Name $serviceName -Status 'Running')) {
  throw "Service $serviceName did not reach the Running state. Check the WinSW logs in $InstallRoot."
}
if (-not (Wait-HttpReady -Port $Port)) {
  throw "Central Server service is running but HTTP port $Port did not become ready. Check the WinSW logs in $InstallRoot."
}

# Force the co-located Agent to establish a fresh socket after a server deployment.
$localAgent = Get-Service -Name 'WindowsControllerAgent' -ErrorAction SilentlyContinue
if ($localAgent) {
  Write-Host 'Restarting local Windows Controller Agent...' -ForegroundColor Cyan
  if ($localAgent.Status -eq 'Running') {
    Restart-Service -Name 'WindowsControllerAgent' -Force
  } else {
    Start-Service -Name 'WindowsControllerAgent'
  }
  (Get-Service -Name 'WindowsControllerAgent').WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
}

Remove-NetFirewallRule -DisplayName 'Windows Controller Central Server' -ErrorAction SilentlyContinue
# Network profiles can be classified as Public/Domain by Windows even on a trusted
# LAN. Restrict the rule to the local subnet instead of relying on one profile.
New-NetFirewallRule -DisplayName 'Windows Controller Central Server' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Any -RemoteAddress LocalSubnet | Out-Null

$privateAddresses = Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -ExpandProperty IPAddress
Write-Host ''
Write-Host 'Central Server installed and started.' -ForegroundColor Green
foreach ($address in $privateAddresses) { Write-Host "Open: http://${address}:$Port" }
Write-Host 'Configure a DHCP reservation or static IP before installing remote agents.'
