const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { setupPage, BASE_URL } = require('./helpers');

test('01. Auth & Roles: Login flow, token persistence, and role guards', async (t) => {
  await t.test('Unauthenticated user is redirected to Login view', async () => {
    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/#dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const hasLoginButton = await page.getByRole('button', { name: /đăng nhập|login/i }).isVisible();
    assert.ok(hasLoginButton, 'Should display login button when unauthenticated');

    await browser.close();
  });

  await t.test('Super Admin user has full access to Admin settings', async () => {
    const { browser, page } = await setupPage({ role: 'super_admin' });

    await page.goto(`${BASE_URL}/#admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const adminHeading = await page.getByText(/Quản trị hệ thống|Cấu hình quản trị/i).first().isVisible();
    assert.ok(adminHeading, 'Super admin should see Admin page heading');

    const brandSettings = await page.getByText(/Cấu hình Hệ thống/i).first().isVisible();
    assert.ok(brandSettings, 'Super admin should see Brand & Timezone settings card');

    await browser.close();
  });

  await t.test('Viewer role has restricted access from privileged actions', async () => {
    const { browser, page } = await setupPage({ role: 'viewer' });

    await page.goto(`${BASE_URL}/#dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Viewer should not see the "Quản trị" menu in sidebar
    const adminNav = await page.getByRole('button', { name: /Quản trị|Admin/i }).isVisible();
    assert.strictEqual(adminNav, false, 'Viewer should not see Admin menu in sidebar');

    await browser.close();
  });
});
