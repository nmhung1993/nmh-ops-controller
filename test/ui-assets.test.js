const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

test('English and Vietnamese dictionaries cover UI translation keys', () => {
  const app = fs.readFileSync(path.join(root, 'frontend', 'src', 'App.jsx'), 'utf8');
  const english = JSON.parse(fs.readFileSync(path.join(root, 'frontend', 'src', 'lang', 'en.json'), 'utf8'));
  const vietnamese = JSON.parse(fs.readFileSync(path.join(root, 'frontend', 'src', 'lang', 'vi.json'), 'utf8'));
  const keys = new Set();

  for (const match of app.matchAll(/\bt\('([^'$]+)'/g)) keys.add(match[1]);

  assert.deepEqual(Object.keys(english).sort(), Object.keys(vietnamese).sort(), 'Translation dictionaries must expose identical keys');
  for (const key of keys) {
    assert.ok(english[key], `Missing English translation: ${key}`);
    assert.ok(vietnamese[key], `Missing Vietnamese translation: ${key}`);
  }
});

test('theme assets expose persistent light and dark variants', () => {
  const app = fs.readFileSync(path.join(root, 'frontend', 'src', 'App.jsx'), 'utf8');
  assert.match(app, /themeMode === 'dark'/);
  assert.match(app, /localStorage\.setItem\('wc_theme'/);
});

test('React Material UI shell preserves responsive, accessible operational affordances', () => {
  const app = fs.readFileSync(path.join(root, 'frontend', 'src', 'App.jsx'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'frontend', 'src', 'styles.css'), 'utf8');
  assert.match(app, /ThemeProvider/);
  assert.match(app, /CssBaseline/);
  assert.match(app, /Drawer/);
  assert.match(app, /AppBar/);
  assert.match(app, /useMediaQuery/);
  assert.match(app, /aria-label=\{title\}/);
  assert.match(app, /variant="determinate"/);
  assert.match(app, /function DashboardPage/);
  assert.match(app, /function ProcessesPage/);
  assert.match(app, /function WatchdogPage/);
  assert.match(app, /function ActivityPage/);
  assert.match(app, /function AdminPage/);
  assert.match(app, /function PasswordChangeDialog/);
  assert.match(app, /disableEscapeKeyDown/);
  assert.match(app, /api\/v1\/users\/\$\{encodeURIComponent\(username\)\}\/password/);
  assert.match(app, /ws\/ui/);
  assert.match(app, /ui\.processes/);
  assert.match(app, /ui\.event/);
  assert.match(app, /ui\.command/);
  assert.match(app, /localStorage\.setItem\('wc_token'/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /\bzoom\s*:/);
});

test('super admin UI can edit user roles and host assignments', () => {
  const app = fs.readFileSync(path.join(root, 'frontend', 'src', 'App.jsx'), 'utf8');
  assert.match(app, /user\.role === 'super_admin'/);
  assert.match(app, /function UserDialog/);
  assert.match(app, /function AgentDialog/);
  assert.match(app, /hostIds/);
  assert.match(app, /ui\.access\.changed/);
  assert.match(app, /api\/v1\/agents/);
  assert.match(app, /api\/v1\/users/);
  assert.doesNotMatch(app, /revoke-host/);
});
