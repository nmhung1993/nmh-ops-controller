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

    const otaVersionBadge = page.getByText(/Bản mới nhất: v2\.1\.4/i);
    assert.ok(await otaVersionBadge.isVisible(), 'Latest OTA version badge should be visible');
  });

  await t.test('Verifies raw DESKTOP- hostnames are cleanly formatted and hidden', async () => {
    const rawDesktopMatch = await page.locator('text=/DESKTOP-[A-Z0-9]{5,}/').count();
    assert.strictEqual(rawDesktopMatch, 0, 'Raw DESKTOP-XXXX hostnames should not be shown on cards');
  });

  await t.test('Opens OTA Upgrade Progress Dialog when clicking upgrade', async () => {
    const upgradeAllBtn = page.getByRole('button', { name: /Nâng cấp toàn bộ Fleet \(OTA\)/i });
    if (await upgradeAllBtn.isVisible()) {
      // Setup dialog handler to auto-accept confirm alert
      page.once('dialog', async (dialog) => {
        await dialog.accept();
      });

      await upgradeAllBtn.click();
      await page.waitForTimeout(1000);

      const otaModalHeading = page.getByText(/Tiến Trình Nâng Cấp Agent OTA/i);
      assert.ok(await otaModalHeading.isVisible(), 'OTA Progress modal should be visible');

      // Close modal
      const closeBtn = page.getByRole('button', { name: /Đóng Màn Hình/i });
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      }
    }
  });

  await browser.close();
});
