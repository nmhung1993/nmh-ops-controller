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
  assert.match(css, /\.live-indicator \{[^}]*height: 52px/);
  assert.match(css, /\.app-active \.preference-dock \{[^}]*height: 52px/);
  assert.match(html, /id="temperature-value"/);
  assert.match(html, /id="power-value"/);
  assert.match(app, /function renderHardware\(/);
});
