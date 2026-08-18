const { setupPage, BASE_URL } = require('../tests/e2e/helpers');
const path = require('path');

async function main() {
  const { browser, page } = await setupPage({ role: 'super_admin' });
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('Navigating to #docker...');
  await page.goto(`${BASE_URL}/#docker`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const artifactDir = 'C:\\Users\\MinhHungServer\\.gemini\\antigravity-ide\\brain\\c761cd42-07fd-4ef0-8461-e54a44837293';
  
  // 1. Capture Stack Grouped View
  const p1 = path.join(artifactDir, 'docker_stack_grouped_view.png');
  await page.screenshot({ path: p1, fullPage: false });
  console.log('Saved:', p1);

  // 2. Click first container row to open Full Inspector Modal
  const firstRow = page.locator('table tbody tr').first();
  if (await firstRow.isVisible()) {
    await firstRow.click();
    await page.waitForTimeout(2000);
    const p2 = path.join(artifactDir, 'docker_container_inspector_overview.png');
    await page.screenshot({ path: p2, fullPage: false });
    console.log('Saved:', p2);

    // Switch to Live Logs tab inside the inspector
    const logsTab = page.getByRole('tab', { name: /Live Logs/i });
    if (await logsTab.isVisible()) {
      await logsTab.click();
      await page.waitForTimeout(2000);
      const p3 = path.join(artifactDir, 'docker_container_inspector_logs.png');
      await page.screenshot({ path: p3, fullPage: false });
      console.log('Saved:', p3);
    }
  }

  await browser.close();
  console.log('Capture completed successfully!');
}

main().catch(console.error);
