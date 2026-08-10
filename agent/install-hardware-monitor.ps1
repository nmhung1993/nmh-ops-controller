param(
  [string]$InstallRoot = "$env:ProgramData\WindowsController\hardware-monitor",
  [string]$DotnetRoot = "$env:ProgramData\WindowsController\dotnet",
  [string]$PackagePath
)

$ErrorActionPreference = 'Stop'
$taskName = 'Windows Controller Hardware Monitor'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this installer from a PowerShell window opened with Run as administrator.'
}

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("windows-controller-lhm-" + [Guid]::NewGuid().ToString('N'))
$archivePath = Join-Path $temporaryRoot 'LibreHardwareMonitor.zip'
$extractRoot = Join-Path $temporaryRoot 'extracted'
$dotnetInstaller = Join-Path $temporaryRoot 'dotnet-install.ps1'
$installedDll = Join-Path $InstallRoot 'LibreHardwareMonitor.dll'
$installedLibrary = Join-Path $InstallRoot 'LibreHardwareMonitorLib.dll'
$dotnetExe = Join-Path $DotnetRoot 'dotnet.exe'
$probeSource = Join-Path $PSScriptRoot 'hardware-probe'
$probeOutput = Join-Path $InstallRoot 'bridge'
$probeDll = Join-Path $probeOutput 'HardwareProbe.dll'
$bridgeJson = Join-Path $InstallRoot 'hardware-sensors.json'

try {
  New-Item -ItemType Directory -Force -Path $temporaryRoot, $extractRoot, $InstallRoot, $DotnetRoot | Out-Null

  if ($PackagePath) {
    $resolvedPackage = (Resolve-Path -LiteralPath $PackagePath).Path
    Copy-Item -LiteralPath $resolvedPackage -Destination $archivePath -Force
  } else {
    Write-Host 'Finding the latest official LibreHardwareMonitor release...'
    $headers = @{ 'User-Agent' = 'windows-controller-webapp' }
    $release = Invoke-RestMethod -UseBasicParsing -Uri 'https://api.github.com/repos/LibreHardwareMonitor/LibreHardwareMonitor/releases/latest' -Headers $headers
    $zipAssets = @($release.assets | Where-Object { $_.name -match '(?i)\.zip$' })
    $asset = $zipAssets | Where-Object { $_.name -match '(?i)NET[._ -]?10' } | Select-Object -First 1
    if (-not $asset) { $asset = $zipAssets | Select-Object -First 1 }
    if (-not $asset) { throw 'The latest stable official release does not contain a downloadable ZIP package.' }
    Write-Host "Selected official release $($release.tag_name)."
    Write-Host "Downloading $($asset.name) from the official GitHub repository..."
    Invoke-WebRequest -UseBasicParsing -Uri $asset.browser_download_url -OutFile $archivePath -Headers $headers
  }

  $sdkInstalled = @(Get-ChildItem -LiteralPath (Join-Path $DotnetRoot 'sdk') -Directory -Filter '10.*' -ErrorAction SilentlyContinue).Count -gt 0
  $desktopRuntimeInstalled = @(Get-ChildItem -LiteralPath (Join-Path $DotnetRoot 'shared\Microsoft.WindowsDesktop.App') -Directory -Filter '10.*' -ErrorAction SilentlyContinue).Count -gt 0
  if (-not $sdkInstalled -or -not $desktopRuntimeInstalled) {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://dot.net/v1/dotnet-install.ps1' -OutFile $dotnetInstaller
  }
  if (-not $sdkInstalled) {
    Write-Host 'Installing the official Microsoft .NET 10 SDK locally for the hardware bridge...'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dotnetInstaller -Channel '10.0' -Architecture x64 -InstallDir $DotnetRoot -NoPath
    if ($LASTEXITCODE -ne 0) { throw 'Microsoft .NET 10 SDK installation failed.' }
  }
  if (-not $desktopRuntimeInstalled) {
    Write-Host 'Installing the official Microsoft .NET 10 Windows Desktop Runtime locally...'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dotnetInstaller -Runtime windowsdesktop -Channel '10.0' -Architecture x64 -InstallDir $DotnetRoot -NoPath
    if ($LASTEXITCODE -ne 0) { throw 'Microsoft .NET 10 Windows Desktop Runtime installation failed.' }
  }
  if (-not (Test-Path -LiteralPath $dotnetExe)) { throw "The local .NET runtime was not created at $dotnetExe" }

  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  # LibreHardwareMonitor is single-instance; an interactive copy would prevent the SYSTEM task from starting.
  Get-CimInstance Win32_Process -Filter "Name = 'LibreHardwareMonitor.exe'" -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name = 'dotnet.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and (
        $_.CommandLine.IndexOf($installedDll, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
        $_.CommandLine.IndexOf($probeDll, [StringComparison]::OrdinalIgnoreCase) -ge 0
      )
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force
  $sourceExe = Get-ChildItem -LiteralPath $extractRoot -Filter 'LibreHardwareMonitor.exe' -Recurse | Select-Object -First 1
  if (-not $sourceExe) { throw 'LibreHardwareMonitor.exe was not found in the downloaded package.' }
  Copy-Item -Path (Join-Path $sourceExe.DirectoryName '*') -Destination $InstallRoot -Recurse -Force

  if (-not (Test-Path -LiteralPath $installedDll)) { throw "Installation failed: $installedDll was not created." }
  if (-not (Test-Path -LiteralPath $installedLibrary)) { throw "Installation failed: $installedLibrary was not created." }
  if (-not (Test-Path -LiteralPath (Join-Path $probeSource 'HardwareProbe.csproj'))) {
    throw "Hardware bridge source was not found at $probeSource"
  }
  New-Item -ItemType Directory -Force -Path $probeOutput | Out-Null
  Write-Host 'Building the direct LibreHardwareMonitor sensor bridge...'
  & $dotnetExe publish (Join-Path $probeSource 'HardwareProbe.csproj') --configuration Release --output $probeOutput --property:LhmDirectory=$InstallRoot --self-contained false --nologo
  if ($LASTEXITCODE -ne 0) { throw 'LibreHardwareMonitor sensor bridge build failed.' }
  if (-not (Test-Path -LiteralPath $probeDll)) { throw "Hardware bridge was not created at $probeDll" }
  # LHM loads optional hardware backends (including System.Management) at runtime.
  Get-ChildItem -LiteralPath $InstallRoot -Filter '*.dll' -File | Copy-Item -Destination $probeOutput -Force
  & icacls.exe $InstallRoot /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' 'Users:(OI)(CI)RX' | Out-Null
  & icacls.exe $DotnetRoot /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' 'Users:(OI)(CI)RX' | Out-Null

  $action = New-ScheduledTaskAction -Execute $dotnetExe -Argument "`"$probeDll`" `"$bridgeJson`"" -WorkingDirectory $InstallRoot
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -Hidden -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $taskPrincipal -Settings $settings -Force | Out-Null
  Remove-Item -LiteralPath $bridgeJson -Force -ErrorAction SilentlyContinue
  $bridgeStartedAt = [DateTime]::UtcNow
  Start-ScheduledTask -TaskName $taskName

  $payload = $null
  # PawnIO setup may take a little longer on the first SYSTEM start.
  $deadline = [DateTime]::UtcNow.AddSeconds(90)
  do {
    Start-Sleep -Seconds 1
    if (Test-Path -LiteralPath $bridgeJson) {
      try {
        $candidatePayload = Get-Content -LiteralPath $bridgeJson -Raw | ConvertFrom-Json
        if ($candidatePayload.sampledAt -and [DateTime]$candidatePayload.sampledAt -ge $bridgeStartedAt.AddSeconds(-1)) {
          $payload = $candidatePayload
        }
      } catch { $payload = $null }
    }
  } while (-not $payload -and [DateTime]::UtcNow -lt $deadline)

  Write-Host ''
  Write-Host 'LibreHardwareMonitor installed and started in the background.' -ForegroundColor Green
  Write-Host "Scheduled Task: $taskName"
  Write-Host "Install path:   $InstallRoot"
  Write-Host "Runtime path:   $DotnetRoot"
  $sensors = @($payload.sensors | Where-Object { $_ -ne $null })
  if ($sensors.Count -gt 0) {
    $temperatures = @($sensors | Where-Object sensorType -eq 'Temperature')
    $power = @($sensors | Where-Object sensorType -eq 'Power')
    Write-Host "Bridge sensors:  $($sensors.Count) total, $($temperatures.Count) temperature, $($power.Count) power"
    $sensorRows = @($sensors |
      Where-Object { $_.sensorType -in @('Temperature', 'Power') } |
      ForEach-Object {
        [PSCustomObject]@{
          Part = $_.hardwareType
          Hardware = $_.hardwareName
          Sensor = $_.sensorName
          Type = $_.sensorType
          Value = [Math]::Round([double]$_.value, 2)
        }
      } |
      Sort-Object Part, Hardware, Type, Sensor)
    if ($sensorRows.Count -gt 0) {
      Write-Host ''
      $sensorRows | Format-Table -AutoSize
    }
  } else {
    Write-Warning 'The LibreHardwareMonitor bridge started, but no sensor snapshot appeared within 90 seconds. Check hardware-probe.log and the Scheduled Task history.'
  }
} finally {
  if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}
