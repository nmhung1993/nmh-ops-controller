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
$serviceExe = Join-Path $InstallRoot 'WindowsControllerServer.exe'
$serviceXml = Join-Path $InstallRoot 'WindowsControllerServer.xml'

if (-not (Test-Path -LiteralPath $NodeExe)) { throw "Node.js 22.5+ was not found at $NodeExe" }
New-Item -ItemType Directory -Force -Path $InstallRoot, (Join-Path $InstallRoot 'data') | Out-Null
$existingService = Get-Service -Name 'WindowsControllerServer' -ErrorAction SilentlyContinue
if ((Test-Path -LiteralPath $serviceExe) -and $existingService) {
  & $serviceExe stop 2>$null
}
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

$existingService = Get-Service -Name 'WindowsControllerServer' -ErrorAction SilentlyContinue
if ($existingService) {
  & $serviceExe stop 2>$null
  & $serviceExe uninstall 2>$null
}
& $serviceExe install
& $serviceExe start

Remove-NetFirewallRule -DisplayName 'Windows Controller Central Server' -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName 'Windows Controller Central Server' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private | Out-Null

$privateAddresses = Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -ExpandProperty IPAddress
Write-Host ''
Write-Host 'Central Server installed and started.' -ForegroundColor Green
foreach ($address in $privateAddresses) { Write-Host "Open: http://${address}:$Port" }
Write-Host 'Configure a DHCP reservation or static IP before installing remote agents.'
