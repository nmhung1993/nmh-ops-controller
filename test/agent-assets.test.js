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
