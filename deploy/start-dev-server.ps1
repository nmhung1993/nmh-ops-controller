param(
  [int]$Port = 3003,
  [string]$NodeExe = "$env:ProgramFiles\nodejs\node.exe",
  [string]$DataDir = "$env:ProgramData\WindowsController\server\data"
)

$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$serviceName = 'WindowsControllerServer'

if (-not (Test-Path -LiteralPath $NodeExe)) {
  throw "Node.js 22.5+ was not found at $NodeExe"
}
if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot 'node_modules'))) {
  throw 'Dependencies are missing. Run npm.cmd install in the repository first.'
}

$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
$restartInstalledService = $service -and $service.Status -ne 'Stopped'
if ($restartInstalledService) {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this development launcher as administrator so it can temporarily stop the installed Central Server service.'
  }
  Write-Host "Stopping installed service $serviceName..." -ForegroundColor Cyan
  Stop-Service -Name $serviceName -Force
  (Get-Service -Name $serviceName).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
}

$previousHost = $env:HOST
$previousPort = $env:PORT
$previousDataDir = $env:DATA_DIR
$env:HOST = '0.0.0.0'
$env:PORT = $Port.ToString()
$env:DATA_DIR = $DataDir

Push-Location $sourceRoot
try {
  Write-Host ''
  Write-Host 'Development server is serving server/ and public/ directly from the repository.' -ForegroundColor Green
  Write-Host "Data: $DataDir"
  Write-Host "Open: http://localhost:$Port"
  Write-Host 'CSS/HTML changes only require a browser refresh. Press Ctrl+C to stop.'
  & $NodeExe --watch server/server.js
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw "Development server exited with code $LASTEXITCODE"
  }
} finally {
  Pop-Location
  $env:HOST = $previousHost
  $env:PORT = $previousPort
  $env:DATA_DIR = $previousDataDir
  if ($restartInstalledService) {
    Write-Host "Restarting installed service $serviceName..." -ForegroundColor Cyan
    Start-Service -Name $serviceName
    (Get-Service -Name $serviceName).WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
  }
}
