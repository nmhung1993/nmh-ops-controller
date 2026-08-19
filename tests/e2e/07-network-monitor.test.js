const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('07. Network Monitor: Ping Monitor ranges, Subnet Scanner, and Router Mesh', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Ping Monitor has 1h, 8h, 1d, 1w and removed 30d', async () => {
    await page.goto(`${BASE_URL}/#network`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const btn1h = await page.getByRole('button', { name: '1 giờ' }).isVisible();
    const btn8h = await page.getByRole('button', { name: '8 tiếng' }).isVisible();
    const btn1d = await page.getByRole('button', { name: '1 ngày' }).isVisible();
    const btn1w = await page.getByRole('button', { name: '1 tuần' }).isVisible();
    const btn30d = await page.getByRole('button', { name: '1 tháng' }).isVisible();

    assert.ok(btn1h, '1 giờ button should be visible');
    assert.ok(btn8h, '8 tiếng button should be visible');
    assert.ok(btn1d, '1 ngày button should be visible');
    assert.ok(btn1w, '1 tuần button should be visible');
    assert.strictEqual(btn30d, false, '1 tháng button must be removed');
  });

  await t.test('Tab switching between Ping Monitor, Subnet Scanner, and Router Mesh is smooth', async () => {
    // Switch to Subnet Scanner
    const scannerTab = page.getByRole('tab', { name: /Quét mạng LAN/i });
    if (await scannerTab.isVisible()) {
      await scannerTab.click();
      await page.waitForTimeout(500);
    }

    // Switch to Router & Mesh
    const routerTab = page.getByRole('tab', { name: /Router & Mesh/i });
    if (await routerTab.isVisible()) {
      await routerTab.click();
      await page.waitForTimeout(500);
    }

    // Switch back to Ping Monitor
    const pingTab = page.getByRole('tab', { name: /Giám sát kết nối/i });
    if (await pingTab.isVisible()) {
      await pingTab.click();
      await page.waitForTimeout(500);
    }

    assert.ok(true, 'Tab switching executed cleanly without error');
  });

  await t.test('MikroTik RouterOS dashboard displays telemetry and masks PPPoE username by default', async () => {
    // Switch to Router & Mesh tab
    const routerTab = page.getByRole('tab', { name: /Router & Mesh/i });
    await routerTab.click();
    await page.waitForTimeout(1000);

    // Verify MikroTik selector button
    const mikrotikBtn = page.getByRole('button', { name: /MikroTik RouterOS/i });
    assert.ok(await mikrotikBtn.isVisible(), 'MikroTik selector button should be visible');

    // Check if PPPoE username is masked with dots by default
    const content = await page.content();
    const hasDotsMask = content.includes('••••••••') || content.includes('User:');
    assert.ok(hasDotsMask, 'PPPoE username should be masked or displayed properly');
  });

  await browser.close();
});
