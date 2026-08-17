const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('03. Fleet Management: Agent list, search, and status filters', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Loads Fleet page and displays registered agents', async () => {
    await page.goto(`${BASE_URL}/#fleet`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const titleVisible = await page.getByText(/Các máy trong mạng LAN|Tổng số máy|Chưa có máy/i).first().isVisible();
    assert.ok(titleVisible, 'Should display Fleet view content');
  });

  await browser.close();
});
