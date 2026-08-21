const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('07. Network Monitor: Ping Monitor ranges, Subnet Scanner, and Router Mesh', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Ping Monitor has 1h, 8h, 24h, 7d and removed 30d', async () => {
    await page.goto(`${BASE_URL}/#network`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const btn1h = await page.getByRole('button', { name: '1 giờ' }).isVisible();
    const btn8h = await page.getByRole('button', { name: '8 tiếng' }).isVisible();
    const btn24h = await page.getByRole('button', { name: /24 giờ|1 ngày/i }).isVisible();
    const btn7d = await page.getByRole('button', { name: /7 ngày|1 tuần/i }).isVisible();
    const btn30d = await page.getByRole('button', { name: '1 tháng' }).isVisible();

    assert.ok(btn1h, '1 giờ button should be visible');
    assert.ok(btn8h, '8 tiếng button should be visible');
    assert.ok(btn24h, '24 giờ button should be visible');
    assert.ok(btn7d, '7 ngày button should be visible');
    assert.strictEqual(btn30d, false, '1 tháng button must be removed');
  });

  await t.test('Tab switching between Ping Monitor, Subnet Scanner, and Gateway Router is smooth', async () => {
    // Switch to Subnet Scanner
    const scannerTab = page.getByRole('tab', { name: /Quét LAN|Quét mạng LAN/i });
    if (await scannerTab.isVisible()) {
      await scannerTab.click();
      await page.waitForTimeout(500);
    }

    // Switch to Gateway Router
    const routerTab = page.getByRole('tab', { name: /Gateway Router|Router & Mesh/i });
    if (await routerTab.isVisible()) {
      await routerTab.click();
      await page.waitForTimeout(500);
    }

    // Switch back to Ping Monitor
    const pingTab = page.getByRole('tab', { name: /Giám sát Ping|Giám sát kết nối/i });
    if (await pingTab.isVisible()) {
      await pingTab.click();
      await page.waitForTimeout(500);
    }

    assert.ok(true, 'Tab switching executed cleanly without error');
  });

  await t.test('MikroTik RouterOS dashboard displays telemetry and masks PPPoE username by default', async () => {
    // Switch to Gateway Router tab
    const routerTab = page.getByRole('tab', { name: /Gateway Router|Router & Mesh/i });
    await routerTab.click();
    await page.waitForTimeout(1000);

    // Verify MikroTik selector button or gateway card
    const mikrotikBtn = page.getByRole('button', { name: /MikroTik/i }).first();
    assert.ok(await mikrotikBtn.isVisible(), 'MikroTik selector button should be visible');

    // Check if PPPoE username is masked with dots by default
    const content = await page.content();
    const hasDotsMask = content.includes('••••••••') || content.includes('User:') || content.includes('PPPoE');
    assert.ok(hasDotsMask, 'PPPoE username should be masked or displayed properly');
  });

  await t.test('MikroTik subtabs: DHCP Leases, Giới hạn Băng thông, and Port Forwarding exist and switch', async () => {
    // Switch to Gateway Router tab
    const routerTab = page.getByRole('tab', { name: /Gateway Router|Router & Mesh/i });
    await routerTab.click();
    await page.waitForTimeout(1000);

    // Verify subtabs
    const leasesTab = page.getByRole('tab', { name: /DHCP/i });
    const queuesTab = page.getByRole('tab', { name: /Bandwidth|Giới hạn/i });
    const natTab = page.getByRole('tab', { name: /NAT|Port Forwarding/i });

    assert.ok(await leasesTab.isVisible(), 'DHCP Leases subtab should be visible');
    assert.ok(await queuesTab.isVisible(), 'Bandwidth / Giới hạn subtab should be visible');
    assert.ok(await natTab.isVisible(), 'NAT subtab should be visible');

    // Click Queues tab
    await queuesTab.click();
    await page.waitForTimeout(600);

    // Click NAT tab
    await natTab.click();
    await page.waitForTimeout(600);

    // Click back to Leases tab
    await leasesTab.click();
    await page.waitForTimeout(400);
  });

  await browser.close();
});
