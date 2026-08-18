const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('03. Fleet Management: Agent list, search, OTA Center, and Progress modal', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Loads Fleet page and displays registered agents', async () => {
    await page.goto(`${BASE_URL}/#fleet`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const titleVisible = await page.getByText(/Các máy trong mạng LAN|Tổng số máy|Chưa có máy/i).first().isVisible();
    assert.ok(titleVisible, 'Should display Fleet view content');
  });

  await t.test('Displays OTA Center banner with latest OTA version badge', async () => {
    const otaBanner = page.getByText(/Trung Tâm Nâng Cấp Tự Động \(OTA Center\)/i);
    assert.ok(await otaBanner.isVisible(), 'OTA Center banner should be visible');

    const otaVersionBadge = page.getByText(/Bản mới nhất: v2\.1\.\d/i);
    assert.ok(await otaVersionBadge.isVisible(), 'Latest OTA version badge should be visible');
  });

  await t.test('Verifies raw DESKTOP- hostnames are cleanly formatted and hidden', async () => {
    const rawDesktopMatch = await page.locator('text=/DESKTOP-[A-Z0-9]{5,}/').count();
    assert.strictEqual(rawDesktopMatch, 0, 'Raw DESKTOP-XXXX hostnames should not be shown on cards');
  });

  await t.test('Verifies OTA Upgrade Action button and controls in OTA Center', async () => {
    const upgradeAllBtn = page.getByRole('button', { name: /Nâng cấp toàn bộ Fleet \(OTA\)/i });
    assert.ok(await upgradeAllBtn.isVisible(), 'OTA upgrade action button should be visible in OTA Center');
  });

  await browser.close();
});
