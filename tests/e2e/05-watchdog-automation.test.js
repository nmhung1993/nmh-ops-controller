const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('05. Watchdog & Automation: Heartbeat rules and per-host self-healing notifications', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Loads Automation / Watchdog view', async () => {
    await page.goto(`${BASE_URL}/#watchdog`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const titleVisible = await page.getByText(/Giám sát tự động|Watchdog/i).first().isVisible();
    assert.ok(titleVisible, 'Should display Watchdog title');
  });

  await t.test('Verifies dedicated per-host Watchdog Notification card and fields', async () => {
    const notifyHeading = page.getByText(/KÊNH THÔNG BÁO SỰ CỐ WATCHDOG/i);
    assert.ok(await notifyHeading.isVisible(), 'Dedicated Watchdog Notification card heading should be visible');

    const tgSection = page.getByText(/Telegram Channel \(Sự cố Watchdog\)/i);
    assert.ok(await tgSection.isVisible(), 'Watchdog Telegram channel section should be visible');

    const discordSection = page.getByText(/Discord Webhook Channel \(Watchdog\)/i);
    assert.ok(await discordSection.isVisible(), 'Watchdog Discord channel section should be visible');

    const topicIdInput = page.getByLabel(/Telegram Topic ID/i).first();
    assert.ok(await topicIdInput.isVisible(), 'Telegram Topic ID input should be visible in Watchdog settings');

    const saveNotifyBtn = page.getByRole('button', { name: /Lưu Kênh Thông Báo Watchdog/i });
    assert.ok(await saveNotifyBtn.isVisible(), 'Save Watchdog notification button should be visible');
  });

  await browser.close();
});
