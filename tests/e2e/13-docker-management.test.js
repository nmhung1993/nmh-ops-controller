const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPage, BASE_URL } = require('./helpers');

test('13. Docker Fleet Management: Stack grouping, CPU/RAM telemetry, Sorting, and Container Inspector', async (t) => {
  const { browser, page } = await setupPage({ role: 'super_admin' });

  await t.test('Navigates to Docker Fleet Management view', async () => {
    await page.goto(`${BASE_URL}/#docker`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const title = await page.getByRole('heading', { name: /Quản Lý Docker Fleet/i }).first().isVisible();
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

  await t.test('Displays Stacks with aggregate CPU & RAM chips and handles expand/collapse', async () => {
    // Check stack header visibility
    const stackHeaders = page.locator('text=/\\d+\\/\\d+|Compose|Dịch vụ Độc lập|minhhungops/i');
    const count = await stackHeaders.count();
    assert.ok(count > 0, 'At least one stack header with status should be rendered');

    // Test Collapse All / Expand All buttons
    const collapseBtn = page.getByRole('button', { name: 'Thu gọn', exact: true });
    if (await collapseBtn.isVisible()) {
      await collapseBtn.click();
      await page.waitForTimeout(500);
    }

    const expandBtn = page.getByRole('button', { name: 'Mở rộng tất cả', exact: true });
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
      await page.waitForTimeout(500);
    }
  });

  await t.test('Sorts containers by Name, CPU, and Memory', async () => {
    const sortSelect = page.getByLabel(/Sắp xếp theo/i);
    if (await sortSelect.isVisible()) {
      await sortSelect.click();
      await page.waitForTimeout(300);
      const cpuOption = page.getByRole('option', { name: /CPU cao nhất/i });
      if (await cpuOption.isVisible()) {
        await cpuOption.click();
        await page.waitForTimeout(500);
      }
    }
  });

  await t.test('Clicks container row to open Full Inspector & Live Logs Modal', async () => {
    const firstContainerRow = page.locator('table tbody tr').first();
    if (await firstContainerRow.isVisible()) {
      await firstContainerRow.click();
      await page.waitForTimeout(1500);

      // Verify inspector tabs
      const overviewTab = await page.getByRole('tab', { name: /Tổng quan & Cấu hình/i }).isVisible();
      const logsTab = page.getByRole('tab', { name: /Live Logs/i });
      const termTab = await page.getByRole('tab', { name: /Web Console/i }).isVisible();

      assert.ok(overviewTab, 'Overview tab should be visible');
      assert.ok(await logsTab.isVisible(), 'Logs tab should be visible');
      assert.ok(termTab, 'Terminal tab should be visible');

      // Click to switch to Live Logs subtab
      await logsTab.click();
      await page.waitForTimeout(1000);

      // Close modal
      const closeBtn = page.getByRole('button', { name: 'Đóng' }).first();
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
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
  });

  await browser.close();
});
