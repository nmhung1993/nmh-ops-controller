const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('11. Remote PowerShell Console & Terminal Execution', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Loads Processes view and opens Remote Terminal dialog', async () => {
    await page.goto(`${BASE_URL}/#processes`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const terminalBtn = page.getByRole('button', { name: /Console \/ Terminal/i });
    assert.ok(await terminalBtn.isVisible(), 'Console / Terminal button should be visible in Processes');

    await terminalBtn.click();
    await page.waitForTimeout(800);

    const terminalHeading = page.getByText(/Remote PowerShell Console/i);
    assert.ok(await terminalHeading.isVisible(), 'Remote PowerShell Console dialog should be visible');

    const cmdInput = page.getByPlaceholder(/Nhập lệnh PowerShell hoặc CMD/i);
    assert.ok(await cmdInput.isVisible(), 'PowerShell command text input should be visible');

    const execBtn = page.getByRole('button', { name: /Chạy/i });
    assert.ok(await execBtn.isVisible(), 'Execute command button should be visible');
  });

  await t.test('Verifies Command Preset chips in Remote Terminal', async () => {
    const ipconfigPreset = page.getByText(/ipconfig \/all/i).first();
    assert.ok(await ipconfigPreset.isVisible(), 'ipconfig /all preset chip should be visible');

    const getServicePreset = page.getByText(/Get-Service/i).first();
    assert.ok(await getServicePreset.isVisible(), 'Get-Service preset chip should be visible');
  });

  await browser.close();
});
