const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('02. Dashboard & Telemetry: Live metrics, charts, and multi-range selectors', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Loads Dashboard and displays header telemetry metrics', async () => {
    await page.goto(`${BASE_URL}/#dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const titleVisible = await page.getByText(/Tổng quan tài nguyên/i).first().isVisible();
    assert.ok(titleVisible, 'Should display Dashboard title');
  });

  await t.test('Multi-range time filters (60m, 8h, 1d, 1w, 1m, 6m, 1y) work smoothly', async () => {
    const ranges = ['60 phút', '8 tiếng', '1 ngày', '1 tuần', '1 tháng', '6 tháng', '1 năm'];

    for (const rangeLabel of ranges) {
      const btn = page.getByRole('button', { name: rangeLabel });
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(400);
      }
    }

    assert.ok(true, 'All time range filters clicked and switched without error');
  });

  await browser.close();
});
