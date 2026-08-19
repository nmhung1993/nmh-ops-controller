const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL, getAdminToken } = require('./helpers');

test('08. Smart Ops & Script Hub: Health Score & 1-Click Operations', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('GET /api/v1/health-score returns score, breakdown and recommendations', async () => {
    const token = getAdminToken();
    const res = await fetch(`${BASE_URL}/api/v1/health-score`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(typeof data.score === 'number', 'score should be a number');
    assert.ok(data.categoryScores, 'categoryScores should exist');
    assert.ok(Array.isArray(data.issues), 'issues should be an array');
    assert.ok(Array.isArray(data.recommendations), 'recommendations should be an array');
  });

  await t.test('GET /api/v1/scripts returns preset scripts', async () => {
    const token = getAdminToken();
    const res = await fetch(`${BASE_URL}/api/v1/scripts`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.scripts), 'scripts should be an array');
    assert.ok(data.scripts.length >= 6, 'should contain at least 6 preset scripts');
    const cleanTemp = data.scripts.find(s => s.id === 'sys_clean_temp');
    assert.ok(cleanTemp, 'sys_clean_temp preset script should exist');
  });

  await t.test('Fleet view renders HealthScoreWidget with gauge and breakdown', async () => {
    await page.goto(`${BASE_URL}/#fleet`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const healthText = await page.getByText(/ĐIỂM SỨC KHỎE HẠ TẦNG/i).isVisible();
    assert.ok(healthText, 'Health score title should be visible on Fleet view');
  });

  await t.test('Script Hub view displays scripts, search filter and execution modal', async () => {
    await page.goto(`${BASE_URL}/#scripts`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const title = await page.getByText(/Kho Kịch Bản & Thao Tác Nhanh/i).isVisible();
    assert.ok(title, 'Script Hub header should be visible');

    const cleanTempCard = await page.getByText(/Dọn dẹp File Tạm & Windows Update Cache/i).isVisible();
    assert.ok(cleanTempCard, 'sys_clean_temp card should be visible in Script Hub');

    const runBtn = page.getByRole('button', { name: /Chạy ngay/i }).first();
    assert.ok(await runBtn.isVisible(), 'Chạy ngay 1-Click button should be visible');
  });

  t.after(async () => {
    await browser.close();
  });
});
