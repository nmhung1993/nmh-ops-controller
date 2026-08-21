const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3003';

function getAdminToken() {
  const secret = fs.readFileSync('data/jwt-secret', 'utf8').trim();
  return jwt.sign({ username: 'nmhung1993', role: 'super_admin' }, secret, { expiresIn: '24h' });
}

function getViewerToken() {
  const secret = fs.readFileSync('data/jwt-secret', 'utf8').trim();
  return jwt.sign({ username: 'nmhung1993', role: 'super_admin' }, secret, { expiresIn: '24h' });
}

async function setupPage({ role = 'super_admin' } = {}) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext();

  const token = getAdminToken();

  await context.addInitScript(({ token, role }) => {
    localStorage.setItem('wc_token', token);
    localStorage.setItem('wc_user', JSON.stringify({
      username: 'nmhung1993',
      role: role,
      mustChangePassword: false
    }));
  }, { token, role });

  const page = await context.newPage();
  return { browser, context, page, BASE_URL };
}

module.exports = {
  BASE_URL,
  getAdminToken,
  getViewerToken,
  setupPage
};
