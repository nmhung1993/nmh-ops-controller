const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

test('desktop helper is launched through a hidden VBS host', () => {
  const installer = fs.readFileSync(path.join(root, 'agent', 'install-agent.ps1'), 'utf8');
  const launcher = fs.readFileSync(path.join(root, 'agent', 'start-helper-hidden.vbs'), 'utf8');
  assert.match(installer, /wscript\.exe/i);
  assert.match(installer, /start-helper-hidden\.vbs/i);
  assert.match(launcher, /shell\.Run[\s\S]*,\s*0,\s*False/i, 'VBS window style must remain hidden');
});

test('WinSW installers do not stop or uninstall services that are not registered', () => {
  const serverInstaller = fs.readFileSync(path.join(root, 'deploy', 'install-server.ps1'), 'utf8');
  const agentInstaller = fs.readFileSync(path.join(root, 'agent', 'install-agent.ps1'), 'utf8');
  for (const installer of [serverInstaller, agentInstaller]) {
    assert.match(installer, /Get-Service -Name '[^']+' -ErrorAction SilentlyContinue/);
    assert.match(installer, /if \(\$existingService\) \{[\s\S]*?uninstall[\s\S]*?\}/);
  }
});

test('manual launch marks its deferred screenshot and helper can restore hidden windows', () => {
  const agent = fs.readFileSync(path.join(root, 'agent', 'agent.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
  const helper = fs.readFileSync(path.join(root, 'agent', 'desktop-helper.js'), 'utf8');
  const installer = fs.readFileSync(path.join(root, 'agent', 'install-agent.ps1'), 'utf8');
  assert.match(agent, /process\.manual\.launch/);
  assert.match(agent, /captureScheduled/);
  assert.match(agent, /requestDesktop\('activate'/);
  assert.match(agent, /captureWindowWithRetry\(rule\.processName, commandId, 'manual\.launch'\)/);
  assert.match(server, /payload\.captureScheduled \? null/);
  assert.match(helper, /throw 'window_not_found'/);
  assert.match(helper, /ShowWindowAsync\(hWnd, 9\)/);
  assert.match(helper, /PrintWindow\(hWnd, hdc, 2\)/);
  assert.match(helper, /width > 0 && height > 0/);
  assert.doesNotMatch(helper, /MainWindowHandle/);
  assert.match(helper, /ActivateBest/);
  assert.match(helper, /GetWindowTextLength/);
  assert.match(helper, /readJson\(configFile, config\)/);
  assert.match(installer, /Get-CimInstance Win32_Process/);
});

test('hardware telemetry supports GPU temperature and per-part power without requiring WinSW support', () => {
  const windows = fs.readFileSync(path.join(root, 'agent', 'windows.js'), 'utf8');
  const agent = fs.readFileSync(path.join(root, 'agent', 'agent.js'), 'utf8');
  const installer = fs.readFileSync(path.join(root, 'agent', 'install-hardware-monitor.ps1'), 'utf8');
  assert.match(windows, /nvidia-smi\.exe/);
  assert.match(windows, /MSAcpi_ThermalZoneTemperature/);
  assert.match(windows, /Energy Meter/);
  assert.match(windows, /LibreHardwareMonitor/);
  assert.match(windows, /totalWatts/);
  assert.match(windows, /coverage: systemMeter \? 'system-meter' : \(powerParts\.length \? 'partial' : 'unavailable'\)/);
  assert.match(agent, /hardware-sensors/);
  assert.match(installer, /LibreHardwareMonitor\/LibreHardwareMonitor\/releases\/latest/);
  assert.match(installer, /release\.tag_name/);
  assert.match(installer, /zipAssets/);
  assert.match(installer, /dot\.net\/v1\/dotnet-install\.ps1/);
  assert.match(installer, /-Channel '10\.0' -Architecture x64 -InstallDir \$DotnetRoot/);
  assert.match(installer, /-Runtime windowsdesktop -Channel '10\.0'/);
  assert.match(installer, /New-ScheduledTaskAction -Execute \$dotnetExe/);
  assert.match(installer, /HardwareProbe\.csproj/);
  assert.match(installer, /LibreHardwareMonitorLib\.dll/);
  assert.match(installer, /LhmDirectory=\$InstallRoot/);
  assert.match(installer, /hardware-sensors\.json/);
  assert.match(installer, /New-ScheduledTaskPrincipal -UserId 'SYSTEM'/);
  assert.match(installer, /Name = 'LibreHardwareMonitor\.exe'/);
  assert.match(installer, /Stop-Process -Id \$_\.ProcessId/);
  assert.match(installer, /hardware-probe\.log/);
});
