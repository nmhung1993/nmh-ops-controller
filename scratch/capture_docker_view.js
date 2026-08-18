const { setupPage, BASE_URL } = require('../tests/e2e/helpers');
const path = require('path');

async function main() {
  const { browser, page } = await setupPage({ role: 'super_admin' });
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('Navigating to #docker...');
  await page.goto(`${BASE_URL}/#docker`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const artifactDir = 'C:\\Users\\MinhHungServer\\.gemini\\antigravity-ide\\brain\\c761cd42-07fd-4ef0-8461-e54a44837293';
  
  // Capture Docker Fleet Overview
  const p1 = path.join(artifactDir, 'docker_fleet_overview.png');
  await page.screenshot({ path: p1, fullPage: false });
  console.log('Saved:', p1);

  // Switch to Stacks tab & capture
  const stacksTab = page.getByRole('tab', { name: /Compose Stacks/i });
  if (await stacksTab.isVisible()) {
    await stacksTab.click();
    await page.waitForTimeout(1000);
    const p2 = path.join(artifactDir, 'docker_compose_stacks.png');
    await page.screenshot({ path: p2, fullPage: false });
    console.log('Saved:', p2);
  }

  // Switch to Images tab & capture
  const imagesTab = page.getByRole('tab', { name: /Images/i });
  if (await imagesTab.isVisible()) {
    await imagesTab.click();
    await page.waitForTimeout(1000);
    const p3 = path.join(artifactDir, 'docker_images_view.png');
    await page.screenshot({ path: p3, fullPage: false });
    console.log('Saved:', p3);
  }

  // Switch to Volumes tab & capture
  const volumesTab = page.getByRole('tab', { name: /Volumes/i });
  if (await volumesTab.isVisible()) {
    await volumesTab.click();
    await page.waitForTimeout(1000);
    const p4 = path.join(artifactDir, 'docker_volumes_view.png');
    await page.screenshot({ path: p4, fullPage: false });
    console.log('Saved:', p4);
  }

  // Switch back to Containers and open Live Logs modal on first container
  const containersTab = page.getByRole('tab', { name: /Containers/i });
  if (await containersTab.isVisible()) {
    await containersTab.click();
    await page.waitForTimeout(1000);
    const logsBtn = page.getByRole('button', { name: /Live Logs/i }).first();
    if (await logsBtn.isVisible()) {
      await logsBtn.click();
      await page.waitForTimeout(2000);
      const p5 = path.join(artifactDir, 'docker_live_logs_modal.png');
      await page.screenshot({ path: p5, fullPage: false });
      console.log('Saved:', p5);
    }
  }

  await browser.close();
  console.log('All screenshots captured successfully!');
}

main().catch(console.error);
