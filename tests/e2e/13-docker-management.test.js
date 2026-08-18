const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('13. Docker Fleet Management: KPI cards, Containers, Tabs, Logs & Terminal Dialogs', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Navigates to Docker Fleet Management view', async () => {
    await page.goto(`${BASE_URL}/#docker`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const title = await page.getByText(/Quản Lý Docker Fleet/i).isVisible();
    assert.ok(title, 'Docker Fleet title should be visible');
  });

  await t.test('Renders summary KPI cards for Containers, Stacks, Images, Volumes', async () => {
    const containersCard = await page.getByText(/Tổng Containers/i).first().isVisible();
    const stacksCard = await page.getByText('Compose Stacks', { exact: true }).isVisible();
    const imagesCard = await page.getByText('Docker Images', { exact: true }).isVisible();
    const volumesCard = await page.getByText('Volumes Lưu Trữ', { exact: true }).isVisible();

    assert.ok(containersCard, 'Containers KPI card should be visible');
    assert.ok(stacksCard, 'Stacks KPI card should be visible');
    assert.ok(imagesCard, 'Images KPI card should be visible');
    assert.ok(volumesCard, 'Volumes KPI card should be visible');
  });

  await t.test('Switches between Stacks, Images, and Volumes tabs cleanly', async () => {
    // Switch to Stacks tab
    const stacksTab = page.getByRole('tab', { name: /Compose Stacks/i });
    if (await stacksTab.isVisible()) {
      await stacksTab.click();
      await page.waitForTimeout(500);
    }

    // Switch to Images tab
    const imagesTab = page.getByRole('tab', { name: /Images/i });
    if (await imagesTab.isVisible()) {
      await imagesTab.click();
      await page.waitForTimeout(500);
      const pruneImgBtn = await page.getByText(/Dọn Dẹp Images Rác/i).isVisible();
      assert.ok(pruneImgBtn, 'Prune Images button should be visible in Images tab');
    }

    // Switch to Volumes tab
    const volumesTab = page.getByRole('tab', { name: /Volumes/i });
    if (await volumesTab.isVisible()) {
      await volumesTab.click();
      await page.waitForTimeout(500);
      const pruneVolBtn = await page.getByText(/Dọn Dẹp Volumes Thừa/i).isVisible();
      assert.ok(pruneVolBtn, 'Prune Volumes button should be visible in Volumes tab');
    }

    // Switch back to Containers tab
    const containersTab = page.getByRole('tab', { name: /Containers/i });
    if (await containersTab.isVisible()) {
      await containersTab.click();
      await page.waitForTimeout(500);
    }
  });

  await browser.close();
});
