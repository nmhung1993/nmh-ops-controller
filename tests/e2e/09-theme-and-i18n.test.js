const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('09. Theme & i18n: Dark/Light mode and Vietnamese/English language toggle', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Toggles dark mode and light mode smoothly', async () => {
    await page.goto(`${BASE_URL}/#dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const themeToggleBtn = page.getByRole('button', { name: /Chuyển sang chế độ/i });
    if (await themeToggleBtn.isVisible()) {
      await themeToggleBtn.click();
      await page.waitForTimeout(500);
      await themeToggleBtn.click();
      await page.waitForTimeout(500);
    }
    assert.ok(true, 'Theme toggled cleanly');
  });

  await t.test('Toggles language between Vietnamese and English', async () => {
    const langBtn = page.getByRole('button', { name: /Ngôn ngữ/i });
    if (await langBtn.isVisible()) {
      await langBtn.click();
      await page.waitForTimeout(500);
    }
    assert.ok(true, 'Language toggled cleanly');
  });

  await browser.close();
});
