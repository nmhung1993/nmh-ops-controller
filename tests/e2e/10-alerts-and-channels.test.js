const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('10. Smart Alerts & Multi-Channel Notifications (Telegram, Discord, Thresholds)', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Loads Admin view and verifies Smart Multi-Channel Alert card', async () => {
    await page.goto(`${BASE_URL}/#admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const alertHeading = page.getByText(/Cảnh báo Thông minh & Tích hợp Đa kênh/i);
    assert.ok(await alertHeading.isVisible(), 'Smart Alert card heading should be visible in Admin');

    const tgChannel = page.getByText(/Telegram Bot Channel/i);
    assert.ok(await tgChannel.isVisible(), 'Telegram Bot Channel section should be visible');

    const discordChannel = page.getByText(/Discord Webhook Channel/i);
    assert.ok(await discordChannel.isVisible(), 'Discord Webhook Channel section should be visible');

    const saveAlertBtn = page.getByRole('button', { name: /Lưu cấu hình cảnh báo/i });
    assert.ok(await saveAlertBtn.isVisible(), 'Save alert config button should be visible');

    const testAlertBtn = page.getByRole('button', { name: /Gửi thử cảnh báo/i });
    assert.ok(await testAlertBtn.isVisible(), 'Test alert button should be visible');
  });

  await browser.close();
});
