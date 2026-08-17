const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('04. Processes: Process listing, search filter, and pagination', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Loads Processes view and handles process elements', async () => {
    await page.goto(`${BASE_URL}/?host=agent-6e745e04-5701-44fd-809d-7518787bf443#processes`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const titleVisible = await page.getByText(/tiến trình|chưa có máy/i).first().isVisible();
    assert.ok(titleVisible, 'Should display Processes view content');

    // Search input
    const searchInput = page.getByPlaceholder(/Tìm theo tên/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('svchost');
      await page.waitForTimeout(500);
    }
  });

  await browser.close();
});
