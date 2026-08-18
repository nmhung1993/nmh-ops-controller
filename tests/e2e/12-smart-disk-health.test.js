const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('12. S.M.A.R.T Disk Health & Storage Breakdown', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Loads Dashboard view and verifies Storage & Fixed Disks card', async () => {
    await page.goto(`${BASE_URL}/#dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const storageCardHeading = page.getByText(/Dung lượng lưu trữ|Các ổ đĩa cố định trên máy|Storage|Fixed Disks/i).first();
    assert.ok(await storageCardHeading.isVisible(), 'Disk storage section should be visible in Dashboard');
  });

  await browser.close();
});
