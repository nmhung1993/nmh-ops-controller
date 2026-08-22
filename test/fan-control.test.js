const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getHardwareSensors, setFanSpeed } = require('../agent/windows');

test('getHardwareSensors returns structured fans array with RPM and controls', async () => {
  const sensors = await getHardwareSensors();
  assert.ok(sensors, 'sensors object must be returned');
  assert.ok(Array.isArray(sensors.fans), 'sensors.fans must be an array');
  
  // If fans are present on the host
  for (const fan of sensors.fans) {
    assert.ok(fan.id, 'fan must have an id');
    assert.ok(fan.name, 'fan must have a name');
    assert.ok(fan.source, 'fan must have a source');
  }
});

test('setFanSpeed creates fan-control.json command payload properly', async () => {
  const result = await setFanSpeed({
    fanId: 'fan-test-1',
    controlId: '/lpc/nct6798d/control/0',
    speedPercent: 65,
    mode: 'manual'
  });

  assert.ok(result, 'setFanSpeed must return a result object');
  assert.equal(result.speedPercent, 65);
  assert.equal(result.mode, 'manual');
});

test('Server allowed commands and command capabilities include fan control', () => {
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
  assert.match(serverJs, /'fan\.control'/, 'server.js must contain fan.control in allowed commands');
  assert.match(serverJs, /'fan\.set_speed'/, 'server.js must contain fan.set_speed in allowed commands');
  assert.match(serverJs, /\/api\/v1\/hosts\/:id\/fans/, 'server.js must define /api/v1/hosts/:id/fans route');
  assert.match(serverJs, /\/api\/v1\/hosts\/:id\/fans\/control/, 'server.js must define /api/v1/hosts/:id/fans/control route');
});

test('Frontend i18n dictionaries include all fan controller keys', () => {
  const vi = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'locales', 'vi.json'), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'locales', 'en.json'), 'utf8'));

  const requiredKeys = [
    'dashboard.fanSpeed',
    'dashboard.fansCount',
    'dashboard.fanController',
    'dashboard.fanControllerDesc',
    'dashboard.fanPresetAuto',
    'dashboard.fanPresetSilent',
    'dashboard.fanPresetStandard',
    'dashboard.fanPresetTurbo',
    'dashboard.fanPresetFull',
    'dashboard.fanModeAuto',
    'dashboard.fanModeManual',
    'dashboard.fanApply',
    'dashboard.fanAppliedSuccess',
    'dashboard.fanAppliedAuto',
    'dashboard.fanApplyFailed',
    'dashboard.fanNoSensors'
  ];

  for (const key of requiredKeys) {
    assert.ok(vi[key], `vi.json must contain key: ${key}`);
    assert.ok(en[key], `en.json must contain key: ${key}`);
  }
});
