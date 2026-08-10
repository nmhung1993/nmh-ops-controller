const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

test('English and Vietnamese dictionaries cover UI translation keys', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public', 'js', 'app.js'), 'utf8');
  const english = JSON.parse(fs.readFileSync(path.join(root, 'public', 'lang', 'en.json'), 'utf8'));
  const vietnamese = JSON.parse(fs.readFileSync(path.join(root, 'public', 'lang', 'vi.json'), 'utf8'));
  const keys = new Set();

  for (const match of html.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)) keys.add(match[1]);
  for (const match of app.matchAll(/\bt\('([^'$]+)'/g)) keys.add(match[1]);

  assert.deepEqual(Object.keys(english).sort(), Object.keys(vietnamese).sort(), 'Translation dictionaries must expose identical keys');
  for (const key of keys) {
    assert.ok(english[key], `Missing English translation: ${key}`);
    assert.ok(vietnamese[key], `Missing Vietnamese translation: ${key}`);
  }
});

test('theme assets expose persistent light and dark variants', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public', 'js', 'app.js'), 'utf8');
  assert.match(html, /id="theme-toggle"/);
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(app, /localStorage\.setItem\('wc_theme'/);
});

test('redesigned operations shell keeps core accessibility and responsive affordances', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public', 'js', 'app.js'), 'utf8');
  assert.match(html, /class="skip-link"/);
  assert.match(html, /id="socket-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /<caption class="sr-only"/);
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(app, /setAttribute\('aria-current', 'page'\)/);
  assert.match(app, /card\.addEventListener\('keydown'/);
  assert.match(app, /if \(host\) updateFleetHostCard\(host\)/);
  assert.match(css, /\.live-indicator \{[^}]*height: 44\.2px/);
  assert.match(css, /\.app-active \.preference-dock \{[^}]*height: 44\.2px/);
  assert.match(css, /body \{[^}]*font-size: 12\.75px/);
  assert.match(css, /\.app-shell \{[^}]*min-height: 100vh[^}]*grid-template-columns: 227\.8px/);
  assert.doesNotMatch(css, /\bzoom\s*:/);
  assert.match(css, /\.host-control select \{[^}]*border: 0;/);
  assert.match(css, /\[data-theme="dark"\] \.preference-select, \[data-theme="dark"\] \.host-control select \{ color-scheme: dark; \}/);
  assert.doesNotMatch(css, /\.metric:hover/);
  assert.match(app, /data-role="power-value"/);
  assert.match(app, /fleet\.power/);
  assert.doesNotMatch(html, /class="metric-track"/);
  assert.doesNotMatch(css, /\.mini-track|\.metric-track/);
  assert.match(html, /id="temperature-value"/);
  assert.match(html, /id="power-value"/);
  assert.match(app, /function renderHardware\(/);
});

test('super admin UI can edit user roles and host assignments', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public', 'js', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
  assert.match(html, /data-super-admin/);
  assert.match(html, /id="user-host-list"/);
  assert.match(html, /value="super_admin"/);
  assert.match(app, /function openUserDialog\(/);
  assert.match(app, /hostIds/);
  assert.match(app, /ui\.access\.changed/);
  assert.match(css, /\.host-access-list/);
});
