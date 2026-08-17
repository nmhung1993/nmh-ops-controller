const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('06. Activity Logs: Audit log filtering and search', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Loads Activity Logs view', async () => {
    await page.goto(`${BASE_URL}/#activity`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const titleVisible = await page.getByText(/Nhật ký hoạt động/i).first().isVisible();
    assert.ok(titleVisible, 'Should display Activity logs title');
  });

  await browser.close();
});
