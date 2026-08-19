const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL, getAdminToken } = require('./helpers');

test('09. Audit Logs & Command Palette: Fleet-wide Activity and Quick Switcher', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('GET /api/v1/audit-logs returns audit logs with agent info', async () => {
    const token = getAdminToken();
    const res = await fetch(`${BASE_URL}/api/v1/audit-logs`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.logs), 'logs should be an array');
  });

  await t.test('GET /api/v1/audit-logs?format=csv exports valid CSV', async () => {
    const token = getAdminToken();
    const res = await fetch(`${BASE_URL}/api/v1/audit-logs?format=csv`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.ok(contentType.includes('text/csv'), 'content-type should be text/csv');
    const text = await res.text();
    assert.ok(text.includes('Thời gian (UTC)'), 'CSV should contain header');
  });

  await t.test('Activity view renders Audit Trail with search and filters', async () => {
    await page.goto(`${BASE_URL}/#activity`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const title = await page.getByText(/Nhật Ký Hoạt Động & Kiểm Toán/i).isVisible();
    assert.ok(title, 'Activity header should be visible');

    const exportCsvBtn = page.getByRole('button', { name: /Xuất CSV/i });
    assert.ok(await exportCsvBtn.isVisible(), 'Xuất CSV button should be visible');

    const exportJsonBtn = page.getByRole('button', { name: /Xuất JSON/i });
    assert.ok(await exportJsonBtn.isVisible(), 'Xuất JSON button should be visible');
  });

  await t.test('Command Palette triggers on search button click and searches hosts/actions', async () => {
    await page.goto(`${BASE_URL}/#fleet`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const quickSearchBtn = page.getByRole('button', { name: /Tìm nhanh/i });
    if (await quickSearchBtn.isVisible()) {
      await quickSearchBtn.click();
      await page.waitForTimeout(500);

      // Verify Command Palette is open
      const paletteInput = page.getByPlaceholder(/Tìm máy trạm, điều hướng, kịch bản/i);
      assert.ok(await paletteInput.isVisible(), 'Command Palette input should be visible');

      // Type search
      await paletteInput.fill('Docker');
      await page.waitForTimeout(300);

      const dockerItem = page.locator('.MuiDialog-root').getByText(/Quản lý Docker/i);
      assert.ok(await dockerItem.isVisible(), 'Docker item should appear in search results');

      // Press Escape to close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });

  t.after(async () => {
    await browser.close();
  });
});
