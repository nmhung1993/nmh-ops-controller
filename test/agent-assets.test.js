const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { groupHardwareMonitorRows } = require('../agent/windows');

const root = path.join(__dirname, '..');

test('desktop helper is launched through a hidden VBS host', () => {
  const installer = fs.readFileSync(path.join(root, 'agent', 'install-agent.ps1'), 'utf8');
  const launcher = fs.readFileSync(path.join(root, 'agent', 'start-helper-hidden.vbs'), 'utf8');
  assert.match(installer, /wscript\.exe/i);
  assert.match(installer, /start-helper-hidden\.vbs/i);
  assert.match(launcher, /shell\.Run[\s\S]*,\s*0,\s*False/i, 'VBS window style must remain hidden');
});

test('WinSW installers wait for SCM and fail when a service operation fails', () => {
  const serverInstaller = fs.readFileSync(path.join(root, 'deploy', 'install-server.ps1'), 'utf8');
  const agentInstaller = fs.readFileSync(path.join(root, 'agent', 'install-agent.ps1'), 'utf8');
  for (const installer of [serverInstaller, agentInstaller]) {
    assert.match(installer, /Get-Service -Name \$Name -ErrorAction SilentlyContinue/);
    assert.match(installer, /function Wait-ServiceDeleted/);
    assert.match(installer, /function Invoke-WinSWChecked/);
    assert.match(installer, /\$process\.ExitCode -ne 0/);
    assert.match(installer, /Wait-ServiceStatus -Name \$serviceName -Status 'Running'/);
    assert.match(installer, /Remove-ExistingService -Name \$serviceName/);
  }
});

test('agent uninstall cleans the bundled hardware monitor task safely', () => {
  const uninstaller = fs.readFileSync(path.join(root, 'agent', 'uninstall-agent.ps1'), 'utf8');
  assert.match(uninstaller, /Windows Controller Hardware Monitor/);
  assert.match(uninstaller, /KeepHardwareMonitor/);
  assert.match(uninstaller, /Refusing to remove data outside/);
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
  const probe = fs.readFileSync(path.join(root, 'agent', 'hardware-probe', 'Program.cs'), 'utf8');
  assert.match(probe, /LibreHardwareMonitor\.Resources\.PawnIO_setup\.exe/);
  assert.match(probe, /-install -silent/);
  assert.match(probe, /PawnIO setup warning/);
  assert.match(probe, /PawnIo\.IsInstalled/);
  assert.match(windows, /value\.includes\('\/lpc'\)/);
  assert.match(installer, /AddSeconds\(90\)/);
});

test('one agent installer also installs hardware monitoring by default', () => {
  const installer = fs.readFileSync(path.join(root, 'agent', 'install-agent.ps1'), 'utf8');
  assert.match(installer, /install-hardware-monitor\.ps1/);
  assert.match(installer, /SkipHardwareMonitor/);
  assert.match(installer, /HardwareMonitorPackagePath/);
  assert.match(installer, /Installing LibreHardwareMonitor bridge and PawnIO/);
});

test('Nuvoton X99 phantom AUXTIN values do not override real motherboard temperature', () => {
  const common = {
    Provider: 'librehardwaremonitor-bridge',
    Parent: '/lpc/nct6779d',
    HardwareName: 'Nuvoton NCT6779D',
    HardwareType: 'SuperIO',
    SensorType: 'Temperature'
  };
  const components = groupHardwareMonitorRows([
    { ...common, Identifier: '/lpc/nct6779d/0/temperature/0', SensorName: 'CPU Core', Value: 36 },
    { ...common, Identifier: '/lpc/nct6779d/0/temperature/1', SensorName: 'Temperature #1', Value: 20 },
    { ...common, Identifier: '/lpc/nct6779d/0/temperature/2', SensorName: 'Temperature #2', Value: 20 },
    { ...common, Identifier: '/lpc/nct6779d/0/temperature/3', SensorName: 'Temperature #3', Value: 20 },
    { ...common, Identifier: '/lpc/nct6779d/0/temperature/4', SensorName: 'Temperature #4', Value: 108 },
    { ...common, Identifier: '/lpc/nct6779d/0/temperature/5', SensorName: 'Temperature #5', Value: 108 },
    { ...common, Identifier: '/lpc/nct6779d/0/temperature/6', SensorName: 'Temperature #6', Value: 109 }
  ]);
  const mainboard = components.find(component => component.type === 'motherboard');
  const cpuFallback = components.find(component => component.id.endsWith('-cpu-fallback'));

  assert.equal(mainboard.type, 'motherboard');
  assert.equal(mainboard.temperatureC, 20);
  assert.equal(cpuFallback.type, 'cpu');
  assert.equal(cpuFallback.name, 'CPU (PECI)');
  assert.equal(cpuFallback.temperatureC, 36);
});

test('CPU Package is preferred over individual core temperature', () => {
  const common = {
    Provider: 'librehardwaremonitor-bridge',
    Parent: '/intelcpu/0',
    HardwareName: 'Intel Xeon E5-2676 v3',
    HardwareType: 'Cpu',
    SensorType: 'Temperature'
  };
  const [cpu] = groupHardwareMonitorRows([
    { ...common, SensorName: 'CPU Core #1', Value: 68 },
    { ...common, SensorName: 'CPU Package', Value: 61 }
  ]);

  assert.equal(cpu.type, 'cpu');
  assert.equal(cpu.temperatureC, 61);
});
