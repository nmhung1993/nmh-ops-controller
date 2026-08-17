const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('05. Watchdog & Automation: Heartbeat rules and self-healing status', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Loads Automation / Watchdog view', async () => {
    await page.goto(`${BASE_URL}/#watchdog`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const titleVisible = await page.getByText(/Giám sát tự động|Watchdog/i).first().isVisible();
    assert.ok(titleVisible, 'Should display Watchdog title');
  });

  await browser.close();
});
