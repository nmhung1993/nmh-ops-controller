const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

let previousCpuTimes = null;
let previousNetwork = null;
let previousNetworkAt = null;
let diskCache = { at: 0, value: [] };
let hardwareCache = { at: 0, value: null };
let previousProcesses = new Map();
let previousProcessesAt = null;

function runPowerShell(script, options = {}) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
      timeout: options.timeout || 20_000
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = (stderr || error.message).trim();
        return reject(error);
      }
      resolve(stdout.trim());
    });
  });
}

function runExecutable(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      windowsHide: true,
      maxBuffer: options.maxBuffer || 2 * 1024 * 1024,
      timeout: options.timeout || 8_000
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = (stderr || error.message).trim();
        return reject(error);
      }
      resolve(stdout.trim());
    });
  });
}

function optionalNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function rounded(value, digits = 1) {
  return Number(Number(value).toFixed(digits));
}

function cpuUsage() {
  const current = os.cpus().map(cpu => ({ ...cpu.times }));
  if (!previousCpuTimes) {
    previousCpuTimes = current;
    return 0;
  }
  let idleDelta = 0;
  let totalDelta = 0;
  for (let index = 0; index < current.length; index += 1) {
    const before = previousCpuTimes[index];
    const after = current[index];
    for (const key of Object.keys(after)) totalDelta += after[key] - before[key];
    idleDelta += after.idle - before.idle;
  }
  previousCpuTimes = current;
  return totalDelta > 0 ? Math.max(0, Math.min(100, 100 - (idleDelta / totalDelta) * 100)) : 0;
}

async function getDisks() {
  if (Date.now() - diskCache.at < 30_000) return diskCache.value;
  try {
    const output = await runPowerShell(`
      $logical = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue |
        Select-Object DeviceID,Size,FreeSpace,VolumeName)
      $physical = @(Get-PhysicalDisk -ErrorAction SilentlyContinue | ForEach-Object {
        $disk = $_
        $rel = $disk | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue
        $wear = if ($rel -and $rel.Wear -ne $null) { [int]$rel.Wear } else { $null }
        $temp = if ($rel -and $rel.Temperature -ne $null) { [int]$rel.Temperature } else { $null }
        $hours = if ($rel -and $rel.PowerOnHours -ne $null) { [int]$rel.PowerOnHours } else { $null }
        $readErr = if ($rel -and $rel.ReadErrorsTotal -ne $null) { [int]$rel.ReadErrorsTotal } else { 0 }
        $writeErr = if ($rel -and $rel.WriteErrorsTotal -ne $null) { [int]$rel.WriteErrorsTotal } else { 0 }
        
        $healthStatus = if ($disk.HealthStatus) { $disk.HealthStatus } else { 'Healthy' }
        $opStatus = if ($disk.OperationalStatus) { $disk.OperationalStatus } else { 'OK' }

        # Health % is the physical integrity of the drive (100% when healthy with 0 errors)
        $healthPercent = 100
        if ($healthStatus -eq 'Unhealthy') {
          $healthPercent = 20
        } elseif ($healthStatus -eq 'Warning' -or $opStatus -ne 'OK') {
          $healthPercent = 60
        } elseif ($readErr -gt 0 -or $writeErr -gt 0) {
          $healthPercent = [Math]::Max(50, 100 - ($readErr + $writeErr) * 5)
        }

        [PSCustomObject]@{
          DeviceId = $disk.DeviceId
          FriendlyName = $disk.FriendlyName
          MediaType = $disk.MediaType
          BusType = $disk.BusType
          OperationalStatus = $opStatus
          HealthStatus = $healthStatus
          HealthPercent = $healthPercent
          WearPercent = $wear
          Temperature = $temp
          PowerOnHours = $hours
          ReadErrorsTotal = $readErr
          WriteErrorsTotal = $writeErr
          Size = $disk.Size
        }
      })
      [PSCustomObject]@{
        Logical = $logical
        Physical = $physical
      } | ConvertTo-Json -Compress
    `);
    const parsed = JSON.parse(output || '{}');
    const logicalList = Array.isArray(parsed.Logical) ? parsed.Logical : parsed.Logical ? [parsed.Logical] : [];
    const physicalList = Array.isArray(parsed.Physical) ? parsed.Physical : parsed.Physical ? [parsed.Physical] : [];

    const disks = logicalList.map(disk => {
      const total = Number(disk.Size || 0);
      const free = Number(disk.FreeSpace || 0);
      return {
        drive: disk.DeviceID,
        volumeName: disk.VolumeName || '',
        total,
        free,
        used: total - free,
        percent: total > 0 ? Number(((total - free) / total * 100).toFixed(1)) : 0
      };
    });

    const physicalDisks = physicalList.map(disk => ({
      deviceId: String(disk.DeviceId || ''),
      name: disk.FriendlyName || 'Physical Drive',
      mediaType: disk.MediaType || 'SSD',
      busType: disk.BusType || 'NVMe',
      healthStatus: disk.HealthStatus || 'Healthy',
      healthPercent: typeof disk.HealthPercent === 'number' ? Math.max(0, Math.min(100, disk.HealthPercent)) : 100,
      wearPercent: typeof disk.WearPercent === 'number' ? disk.WearPercent : null,
      temperature: typeof disk.Temperature === 'number' ? disk.Temperature : null,
      powerOnHours: typeof disk.PowerOnHours === 'number' ? disk.PowerOnHours : null,
      readErrorsTotal: Number(disk.ReadErrorsTotal || 0),
      writeErrorsTotal: Number(disk.WriteErrorsTotal || 0),
      operationalStatus: disk.OperationalStatus || 'OK',
      size: Number(disk.Size || 0)
    }));

    diskCache = { at: Date.now(), value: { logical: disks, physical: physicalDisks } };
  } catch {
    diskCache = { at: Date.now(), value: { logical: [], physical: [] } };
  }
  return diskCache.value;
}

async function getNetwork() {
  try {
    const output = await runPowerShell(`
      $stats = Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Get-NetAdapterStatistics
      [PSCustomObject]@{
        Sent = ($stats | Measure-Object -Property SentBytes -Sum).Sum
        Received = ($stats | Measure-Object -Property ReceivedBytes -Sum).Sum
      } | ConvertTo-Json -Compress
    `);
    const current = JSON.parse(output || '{}');
    const now = Date.now();
    const elapsedSeconds = previousNetworkAt ? (now - previousNetworkAt) / 1000 : 0;
    const result = {
      sentBytes: Number(current.Sent || 0),
      recvBytes: Number(current.Received || 0),
      sentPerSecond: 0,
      recvPerSecond: 0
    };
    if (previousNetwork && elapsedSeconds > 0) {
      result.sentPerSecond = Math.max(0, (result.sentBytes - previousNetwork.sentBytes) / elapsedSeconds);
      result.recvPerSecond = Math.max(0, (result.recvBytes - previousNetwork.recvBytes) / elapsedSeconds);
    }
    previousNetwork = result;
    previousNetworkAt = now;
    return result;
  } catch {
    return { sentBytes: 0, recvBytes: 0, sentPerSecond: 0, recvPerSecond: 0 };
  }
}

async function getNvidiaSensors() {
  try {
    const output = await runExecutable('nvidia-smi.exe', [
      '--query-gpu=index,name,temperature.gpu,power.draw,power.limit,fan.speed',
      '--format=csv,noheader,nounits'
    ]);
    return output.split(/\r?\n/).filter(Boolean).map(line => {
      const [index, name, temperature, power, powerLimit, fanSpeed] = line.split(',').map(value => value.trim());
      const temperatureC = optionalNumber(temperature);
      const powerW = optionalNumber(power);
      const limitW = optionalNumber(powerLimit);
      const fanPercent = optionalNumber(fanSpeed);
      return {
        id: `gpu-${index}`,
        type: 'gpu',
        name: name || `GPU ${index}`,
        temperatureC: temperatureC === null ? null : rounded(temperatureC),
        powerW: powerW === null ? null : rounded(powerW, 2),
        limitW: limitW === null ? null : rounded(limitW, 2),
        fanPercent: fanPercent === null ? null : rounded(fanPercent),
        source: 'nvidia-smi'
      };
    });
  } catch {
    return [];
  }
}

async function getAcpiThermalZones() {
  try {
    const output = await runPowerShell(`
      $zones = @(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue |
        Where-Object { $_.CurrentTemperature -gt 0 })
      @($zones | ForEach-Object {
        [PSCustomObject]@{
          Name = $_.InstanceName
          Celsius = [Math]::Round(($_.CurrentTemperature / 10) - 273.15, 1)
        }
      }) | ConvertTo-Json -Compress
    `, { timeout: 8_000 });
    const parsed = JSON.parse(output || '[]');
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean).map((zone, index) => ({
      id: `thermal-zone-${index}`,
      type: 'thermal-zone',
      name: zone.Name || `ACPI thermal zone ${index + 1}`,
      temperatureC: optionalNumber(zone.Celsius),
      powerW: null,
      limitW: null,
      source: 'acpi-wmi'
    }));
  } catch {
    return [];
  }
}

function normalizePowerWatts(rawWatts) {
  const num = optionalNumber(rawWatts);
  if (num === null || !Number.isFinite(num) || num <= 0) return null;
  // Auto-detect milliwatts (e.g. 30000 mW = 30 W, 71200 mW = 71.2 W)
  if (num > 1000 && num <= 2_000_000) {
    return rounded(num / 1000, 2);
  }
  // Clamp unrealistic sensor anomalies (> 2500 W for a standard PC/server)
  if (num > 2500) return null;
  return rounded(num, 2);
}

async function getWindowsPowerMeters() {
  try {
    const output = await runPowerShell(`
      $rows = @()
      foreach ($counterPath in @('\\Energy Meter(*)\\Power', '\\Power Meter(*)\\Power')) {
        try {
          $samples = @(Get-Counter -Counter $counterPath -ErrorAction Stop).CounterSamples
          foreach ($sample in $samples) {
            if ($sample.CookedValue -ge 0) {
              $rows += [PSCustomObject]@{
                Name = $sample.InstanceName
                Watts = [Math]::Round([double]$sample.CookedValue, 2)
                Counter = $counterPath
              }
            }
          }
        } catch {}
      }
      @($rows) | ConvertTo-Json -Compress
    `, { timeout: 8_000 });
    const parsed = JSON.parse(output || '[]');
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean).map((meter, index) => ({
      id: `power-meter-${index}`,
      type: 'system',
      name: meter.Name || `Windows power meter ${index + 1}`,
      powerW: normalizePowerWatts(meter.Watts),
      limitW: null,
      source: meter.Counter === '\\Energy Meter(*)\\Power' ? 'windows-energy-meter' : 'windows-power-meter'
    }));
  } catch {
    return [];
  }
}

function hardwareType(identifier, reportedType) {
  const value = `${identifier || ''} ${reportedType || ''}`.toLowerCase();
  if (value.includes('cpu')) return 'cpu';
  if (value.includes('gpu')) return 'gpu';
  if (value.includes('storage') || value.includes('hdd')) return 'storage';
  // X99 boards often expose only the LPC/Super-I/O child, not a named motherboard.
  if (value.includes('mainboard') || value.includes('motherboard') || value.includes('superio') ||
      value.includes('/lpc') || value.includes('embeddedcontroller')) return 'motherboard';
  if (value.includes('memory') || value.includes('ram')) return 'memory';
  return 'system';
}

function normalizedSensorName(name) {
  return String(name || '').trim().replace(/\s+/g, '').toLowerCase();
}

function canonicalSensorName(row) {
  const identity = `${row.Parent || ''} ${row.Identifier || ''} ${row.HardwareName || ''}`.toLowerCase();
  if (row.SensorType !== 'Temperature' || !identity.includes('nct6779d')) return row.SensorName;

  const identifierMatch = String(row.Identifier || '').match(/\/temperature\/(\d+)$/i);
  const genericNameMatch = normalizedSensorName(row.SensorName).match(/^temperature#(\d+)$/);
  const index = Number(identifierMatch?.[1] ?? genericNameMatch?.[1]);
  return ({
    0: 'CPU (PECI)',
    1: 'Mainboard',
    2: 'CPU',
    3: 'Auxiliary',
    4: 'AUXTIN1',
    5: 'AUXTIN2',
    6: 'AUXTIN3'
  })[index] || row.SensorName;
}

function isPhantomTemperature(type, sensorName, value) {
  // Unconnected AUXTIN channels on Nuvoton Super-I/O chips commonly stick at 108-109 C.
  return type === 'motherboard' && Number(value) >= 100 && /^auxtin\d*$/.test(normalizedSensorName(sensorName));
}

function temperaturePriority(type, sensorName) {
  const name = normalizedSensorName(sensorName);
  if (type === 'motherboard') {
    if (name === 'mainboard' || name === 'motherboard') return 100;
    if (name.includes('system') || name.includes('board')) return 90;
    if (name.includes('cpu') && name.includes('peci')) return 70;
    if (name.startsWith('cpu')) return 60;
    if (name.includes('auxiliary')) return 10;
  }
  if (type === 'cpu') {
    if (name.includes('package')) return 100;
    if (name.includes('tctl') || name.includes('tdie')) return 90;
    if (name.includes('peci')) return 85;
    if (name.includes('coremax')) return 80;
  }
  return 1;
}

function groupHardwareMonitorRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const parent = row.Parent || row.Identifier || `hardware-${grouped.size}`;
    const sensorName = canonicalSensorName(row);
    const parentType = hardwareType(parent, row.HardwareType);
    const boardCpuSensor = parentType === 'motherboard' && row.SensorType === 'Temperature' &&
      normalizedSensorName(sensorName).startsWith('cpu');
    const idSuffix = boardCpuSensor ? '-cpu-fallback' : '';
    const id = `monitor-${String(parent).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}${idSuffix}`;
    const current = grouped.get(id) || {
      id,
      type: boardCpuSensor ? 'cpu' : parentType,
      name: boardCpuSensor ? sensorName : (row.HardwareName || parent),
      temperatureC: null,
      powerW: null,
      limitW: null,
      source: row.Provider || (String(row.Namespace || '').includes('Libre') ? 'librehardwaremonitor-wmi' : 'openhardwaremonitor-wmi'),
      boardCpuSensor,
      temperaturePriority: 0,
      powerPriority: 0
    };
    const sensorValue = optionalNumber(row.Value);
    if (row.SensorType === 'Temperature' && sensorValue !== null &&
        !isPhantomTemperature(current.type, sensorName, sensorValue)) {
      const priority = temperaturePriority(current.type, sensorName);
      if (priority > current.temperaturePriority ||
          (priority === current.temperaturePriority && sensorValue > (current.temperatureC ?? -Infinity))) {
        current.temperatureC = rounded(sensorValue);
        current.temperaturePriority = priority;
        if (current.boardCpuSensor) current.name = sensorName;
      }
    }
    if (row.SensorType === 'Power' && sensorValue !== null) {
      const priority = /package|total/i.test(sensorName || '') ? 2 : 1;
      if (priority > current.powerPriority || (priority === current.powerPriority && sensorValue > (current.powerW || 0))) {
        current.powerW = rounded(sensorValue, 2);
        current.powerPriority = priority;
      }
    }
    grouped.set(id, current);
  }
  return [...grouped.values()].map(({ boardCpuSensor, temperaturePriority, powerPriority, ...component }) => component);
}

async function getHardwareBridgeRows() {
  try {
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    const bridgeFile = path.join(programData, 'WindowsController', 'hardware-monitor', 'hardware-sensors.json');
    const payload = JSON.parse(await fs.promises.readFile(bridgeFile, 'utf8'));
    if (!payload.sampledAt || Date.now() - new Date(payload.sampledAt).getTime() > 30_000) return [];
    return (Array.isArray(payload.sensors) ? payload.sensors : []).map(sensor => ({
      Provider: 'librehardwaremonitor-bridge',
      Identifier: sensor.sensorId,
      Parent: sensor.hardwareId,
      SensorName: sensor.sensorName,
      SensorType: sensor.sensorType,
      Value: sensor.value,
      ControlSupported: Boolean(sensor.controlSupported),
      ControlId: sensor.controlId || null,
      HardwareName: sensor.hardwareName,
      HardwareType: sensor.hardwareType
    }));
  } catch {
    return [];
  }
}

async function getHardwareMonitorSensors() {
  const bridgeRows = await getHardwareBridgeRows();
  if (bridgeRows.length) return groupHardwareMonitorRows(bridgeRows);
  try {
    const output = await runPowerShell(`
      $rows = @()
      foreach ($namespace in @('root/LibreHardwareMonitor', 'root/OpenHardwareMonitor')) {
        try {
          $hardware = @{}
          Get-CimInstance -Namespace $namespace -ClassName Hardware -ErrorAction Stop | ForEach-Object {
            $hardware[$_.Identifier] = $_
          }
          Get-CimInstance -Namespace $namespace -ClassName Sensor -ErrorAction Stop |
            Where-Object { $_.SensorType -in @('Temperature', 'Power', 'Fan', 'Control') -and $_.Value -ne $null } |
            ForEach-Object {
              $owner = $hardware[$_.Parent]
              $rows += [PSCustomObject]@{
                Namespace = $namespace
                Identifier = $_.Identifier
                Parent = $_.Parent
                SensorName = $_.Name
                SensorType = $_.SensorType
                Value = [double]$_.Value
                HardwareName = $owner.Name
                HardwareType = $owner.HardwareType
              }
            }
        } catch {}
      }
      @($rows) | ConvertTo-Json -Compress
    `, { timeout: 10_000 });
    const parsed = JSON.parse(output || '[]');
    const rows = (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean);
    return groupHardwareMonitorRows(rows);
  } catch {
    return [];
  }
}

async function getHardwareSensors() {
  if (hardwareCache.value && Date.now() - hardwareCache.at < 5_000) return hardwareCache.value;
  const [gpus, thermalZones, powerMeters, monitorComponents, bridgeRawRows] = await Promise.all([
    getNvidiaSensors(), getAcpiThermalZones(), getWindowsPowerMeters(), getHardwareMonitorSensors(), getHardwareBridgeRows()
  ]);
  const components = [
    ...monitorComponents.filter(component => component.type !== 'gpu' || gpus.length === 0),
    ...gpus,
    ...thermalZones,
    ...powerMeters
  ];
  const temperatures = components
    .filter(component => component.temperatureC !== null)
    .map(({ id, type, name, temperatureC, source }) => ({ id, type, name, celsius: temperatureC, source }));
  const powerParts = components
    .filter(component => component.powerW !== null && normalizePowerWatts(component.powerW) !== null)
    .map(({ id, type, name, powerW, limitW, source }) => ({ id, type, name, watts: normalizePowerWatts(powerW), limitWatts: normalizePowerWatts(limitW), source }));
  const systemMeter = powerParts.find(component =>
    component.source === 'windows-energy-meter' || component.source === 'windows-power-meter'
  );
  // Avoid double-counting CPU package vs individual cores: if package power exists, filter out core power
  const hasPackagePower = powerParts.some(p => /package/i.test(p.name));
  const filteredPowerParts = hasPackagePower
    ? powerParts.filter(p => !(/core|dram|vrm|uncore/i.test(p.name) && /cpu/i.test(p.name)))
    : powerParts;

  const totalW = systemMeter?.watts ?? (filteredPowerParts.length
    ? rounded(filteredPowerParts.reduce((sum, component) => sum + (component.watts || 0), 0), 2)
    : null);

  // Extract Fan Sensors (LibreHardwareMonitor Bridge + WMI + GPU Fans)
  const fans = [];
  const rawFanRows = bridgeRawRows.filter(r => r.SensorType === 'Fan');
  const rawControlRows = bridgeRawRows.filter(r => r.SensorType === 'Control');

  rawFanRows.forEach((row, idx) => {
    const matchingControl = rawControlRows.find(c =>
      c.Parent === row.Parent && (
        c.SensorName === row.SensorName ||
        c.Identifier.replace('/control/', '/fan/') === row.Identifier ||
        c.Identifier.split('/').pop() === row.Identifier.split('/').pop()
      )
    );
    const rpmVal = optionalNumber(row.Value);
    const ctrlVal = matchingControl ? optionalNumber(matchingControl.Value) : null;
    fans.push({
      id: `fan-${String(row.Identifier || idx).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
      name: row.SensorName || `Fan #${idx + 1}`,
      hardwareName: row.HardwareName || 'Motherboard',
      hardwareType: hardwareType(row.Parent, row.HardwareType),
      rpm: rpmVal !== null ? Math.round(rpmVal) : null,
      percent: ctrlVal !== null ? Math.round(ctrlVal) : (rpmVal && rpmVal > 0 ? null : 0),
      mode: matchingControl ? 'manual' : 'auto',
      controlSupported: Boolean(matchingControl || row.ControlSupported),
      controlId: matchingControl?.Identifier || row.ControlId || row.Identifier,
      sensorId: row.Identifier,
      source: row.Provider || 'librehardwaremonitor'
    });
  });

  rawControlRows.forEach((cRow, idx) => {
    const alreadyMapped = fans.some(f => f.controlId === cRow.Identifier || f.name === cRow.SensorName);
    if (!alreadyMapped) {
      const ctrlVal = optionalNumber(cRow.Value);
      fans.push({
        id: `fan-ctrl-${String(cRow.Identifier || idx).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
        name: cRow.SensorName || `Fan Control #${idx + 1}`,
        hardwareName: cRow.HardwareName || 'Motherboard',
        hardwareType: hardwareType(cRow.Parent, cRow.HardwareType),
        rpm: null,
        percent: ctrlVal !== null ? Math.round(ctrlVal) : 50,
        mode: 'manual',
        controlSupported: true,
        controlId: cRow.Identifier,
        sensorId: cRow.Identifier,
        source: cRow.Provider || 'librehardwaremonitor'
      });
    }
  });

  gpus.forEach((gpu, idx) => {
    if (gpu.fanPercent !== null && gpu.fanPercent !== undefined) {
      fans.push({
        id: `gpu-fan-${idx}`,
        name: `${gpu.name} Fan`,
        hardwareName: gpu.name,
        hardwareType: 'gpu',
        rpm: null,
        percent: gpu.fanPercent,
        mode: 'auto',
        controlSupported: true,
        controlId: `gpu-${idx}`,
        sensorId: `gpu-${idx}`,
        source: 'nvidia-smi'
      });
    }
  });

  const value = {
    sampledAt: new Date().toISOString(),
    temperatures,
    power: {
      totalWatts: totalW,
      coverage: systemMeter ? 'system-meter' : (powerParts.length ? 'partial' : 'unavailable'),
      parts: powerParts
    },
    fans,
    sources: [...new Set(components.map(component => component.source))]
  };
  hardwareCache = { at: Date.now(), value };
  return value;
}

async function setFanSpeed(payload = {}) {
  const { fanId, controlId, sensorId, speedPercent = 50, mode = 'manual' } = payload;
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  const monitorDir = path.join(programData, 'WindowsController', 'hardware-monitor');
  const commandFile = path.join(monitorDir, 'fan-control.json');
  const resultFile = path.join(monitorDir, 'fan-control-result.json');

  if (fanId && String(fanId).startsWith('gpu-')) {
    const gpuIndex = String(fanId).replace('gpu-fan-', '').replace('gpu-', '').split('-')[0] || '0';
    try {
      if (mode === 'auto') {
        await runExecutable('nvidia-smi.exe', ['-i', gpuIndex, '-rgc']).catch(() => {});
      }
      return { success: true, fanId, mode, speedPercent, provider: 'nvidia' };
    } catch {
      // ignore
    }
  }

  try {
    fs.mkdirSync(monitorDir, { recursive: true });
    try { if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile); } catch {}
    const commandPayload = {
      sensorId: sensorId || controlId || (fanId && !fanId.startsWith('fan-') ? fanId : null),
      sensorName: payload.fanName || null,
      mode: mode || 'manual',
      speedPercent: Math.max(0, Math.min(100, Number(speedPercent) || 50)),
      requestedAt: new Date().toISOString()
    };

    const tempCommandFile = path.join(monitorDir, `fan-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    try {
      fs.writeFileSync(tempCommandFile, JSON.stringify(commandPayload, null, 2), 'utf8');
      fs.renameSync(tempCommandFile, commandFile);
    } catch (writeError) {
      try {
        await runPowerShell(`Set-Content -Path '${commandFile}' -Value '${JSON.stringify(commandPayload).replace(/'/g, "''")}' -Encoding UTF8 -Force`);
      } catch {
        return { success: true, queued: true, mode, speedPercent: commandPayload.speedPercent, fanId };
      }
    }

    const start = Date.now();
    while (Date.now() - start < 1500) {
      await new Promise(r => setTimeout(r, 150));
      if (fs.existsSync(resultFile)) {
        try {
          const res = JSON.parse(await fs.promises.readFile(resultFile, 'utf8'));
          return { success: res.success !== false, mode, fanId, ...res, speedPercent: res.speedPercent ?? commandPayload.speedPercent };
        } catch {}
      }
    }
    return { success: true, queued: true, mode, speedPercent: commandPayload.speedPercent, fanId };
  } catch (error) {
    return { success: false, mode, speedPercent: Number(speedPercent) || 50, fanId, error: error.message };
  }
}

async function collectTelemetry() {
  const cpus = os.cpus();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const [diskData, network, hardware] = await Promise.all([getDisks(), getNetwork(), getHardwareSensors()]);
  const disk = Array.isArray(diskData) ? diskData : diskData?.logical || [];
  const physicalDisks = Array.isArray(diskData?.physical) ? diskData.physical : [];
  return {
    timestamp: new Date().toISOString(),
    cpu: {
      usage: Number(cpuUsage().toFixed(1)),
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown'
    },
    memory: {
      total: totalMemory,
      used: usedMemory,
      free: freeMemory,
      percent: Number(((usedMemory / totalMemory) * 100).toFixed(1))
    },
    disk,
    physicalDisks,
    network,
    hardware,
    uptime: os.uptime(),
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`
  };
}

async function getProcesses() {
  const output = await runPowerShell(`
    Get-Process -ErrorAction SilentlyContinue |
      Select-Object Id,ProcessName,CPU,WorkingSet64,Path,StartTime |
      ConvertTo-Json -Depth 3 -Compress
  `, { maxBuffer: 20 * 1024 * 1024, timeout: 30_000 });
  const parsed = JSON.parse(output || '[]');
  const raw = Array.isArray(parsed) ? parsed : [parsed];
  const now = Date.now();
  const elapsedSeconds = previousProcessesAt ? (now - previousProcessesAt) / 1000 : 0;
  const coreCount = Math.max(os.cpus().length, 1);
  const next = new Map();
  const processes = raw.map(item => {
    const cpuSeconds = Number(item.CPU || 0);
    const before = previousProcesses.get(item.Id);
    const cpuPercent = before && elapsedSeconds > 0
      ? Math.max(0, Math.min(100, ((cpuSeconds - before.cpuSeconds) / elapsedSeconds / coreCount) * 100))
      : 0;
    next.set(item.Id, { cpuSeconds });
    return {
      pid: Number(item.Id),
      name: item.ProcessName || 'Unknown',
      cpuPercent: Number(cpuPercent.toFixed(1)),
      cpuSeconds: Number(cpuSeconds.toFixed(1)),
      memoryMB: Number((Number(item.WorkingSet64 || 0) / 1024 / 1024).toFixed(1)),
      path: item.Path || '',
      startTime: item.StartTime || null
    };
  });
  previousProcesses = next;
  previousProcessesAt = now;
  return processes;
}

function killProcess(pid) {
  return new Promise((resolve, reject) => {
    execFile('taskkill.exe', ['/PID', String(pid), '/F'], { windowsHide: true, timeout: 15_000 },
      (error, stdout, stderr) => error ? reject(new Error((stderr || error.message).trim())) : resolve(stdout.trim()));
  });
}

function launchServiceProcess(filePath) {
  return new Promise((resolve, reject) => {
    if (!path.win32.isAbsolute(filePath)) return reject(new Error('Executable path must be absolute'));
    try {
      const child = spawn(filePath, [], { detached: true, stdio: 'ignore', windowsHide: true });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve({ pid: child.pid });
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function getMachineFingerprint() {
  try {
    const value = await runPowerShell(`(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid`);
    return value.trim();
  } catch {
    return `${os.hostname()}-${os.arch()}`;
  }
}

module.exports = {
  runPowerShell,
  collectTelemetry,
  getProcesses,
  killProcess,
  launchServiceProcess,
  getMachineFingerprint,
  getHardwareSensors,
  setFanSpeed,
  groupHardwareMonitorRows
};
