const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('08. Admin & System Settings: Branding customization, Timezone GMT+7, and User management', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Loads Admin view and verifies System Settings form', async () => {
    await page.goto(`${BASE_URL}/#admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const appNameInput = page.getByLabel(/Tên hệ thống/i);
    assert.ok(await appNameInput.isVisible(), 'App Name input should be visible');

    const signatureInput = page.getByLabel(/Chữ ký Footer/i);
    assert.ok(await signatureInput.isVisible(), 'Footer signature input should be visible');

    const saveButton = page.getByRole('button', { name: /Lưu cấu hình hệ thống/i });
    assert.ok(await saveButton.isVisible(), 'Save configuration button should be visible');
  });

  await browser.close();
});
