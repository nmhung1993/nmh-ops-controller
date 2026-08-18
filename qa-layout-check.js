// QA layout check: detect clipped/overlapping elements on Fleet + Dashboard
// Run against http://127.0.0.1:3303/ with demo credentials.
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3303';
const WIDTH = 900;
const HEIGHT = 600;

const results = [];

async function detectViewportOverflow(page) {
  // Elements extending beyond viewport horizontally
  return await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const issues = [];
    const els = document.querySelectorAll('body *');
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      // Check meaningful elements only
      const hasText = el.textContent && el.textContent.trim().length > 0;
      const isWidget = el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT' ||
        el.tagName === 'A' || ['H1','H2','H3','H4','H5','H6','P','TABLE','CANVAS','SVG'].includes(el.tagName);
      if (!hasText && !isWidget) continue;
      if (r.right > vw + 2 || r.left < -2) {
        issues.push({
          tag: el.tagName, cls: (el.className || '').toString().slice(0, 80),
          text: (el.textContent || '').trim().slice(0, 60),
          left: Math.round(r.left), right: Math.round(r.right), vw
        });
      }
    }
    // Dedupe and limit
    const seen = new Set();
    return issues.filter(i => { const k = i.tag + i.cls + i.left + i.right; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 30);
  });
}

async function detectTextClipping(page) {
  // Detect text clipped by overflow hidden/ellipsis where the scrollWidth exceeds clientWidth
  return await page.evaluate(() => {
    const issues = [];
    const els = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, td, th, div[class*="MuiTypography"]');
    for (const el of els) {
      if (el.clientWidth === 0) continue;
      const style = window.getComputedStyle(el);
      if (style.overflow === 'hidden' || style.textOverflow === 'ellipsis') {
        if (el.scrollWidth > el.clientWidth + 4) {
          issues.push({
            tag: el.tagName,
            text: (el.textContent || '').trim().slice(0, 50),
            clientW: el.clientWidth, scrollW: el.scrollWidth
          });
        }
      }
    }
    // Group: report each short text only once
    const seen = new Set();
    return issues.filter(i => { const k = i.tag + i.text; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 40);
  });
}

async function detectOverlaps(page) {
  // Detect sibling-level visual overlaps of visible text blocks (cheap heuristic)
  return await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const issues = [];
    const els = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, td, th, button, a, span, div[class*="MuiTypography"]'));
    const visible = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width < 5 || r.height < 5) continue;
      const st = window.getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none') continue;
      visible.push({ el, r, text: (el.textContent || '').trim().slice(0, 40) });
    }
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const a = visible[i], b = visible[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ix = Math.max(0, Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left));
        const iy = Math.max(0, Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top));
        if (ix > 6 && iy > 6) {
          issues.push({ a: a.text, b: b.text, x: a.r.left, y: a.r.top });
          if (issues.length > 20) return issues;
        }
      }
    }
    return issues;
  });
}

async function snapshotLayout(page, label) {
  const overflow = await detectViewportOverflow(page);
  const clipping = await detectTextClipping(page);
  const overlaps = await detectOverlaps(page);
  results.push({ label, overflowCount: overflow.length, clippingCount: clipping.length, overlapCount: overlaps.length });
  if (overflow.length) {
    console.log(`\n=== ${label} — VIEWPORT OVERFLOW (${overflow.length}) ===`);
    for (const o of overflow.slice(0, 12)) console.log(`  ${o.tag}.${o.cls} [${o.text}] left=${o.left} right=${o.right} vw=${o.vw}`);
  }
  if (clipping.length) {
    console.log(`\n=== ${label} — TEXT CLIPPED (${clipping.length}) ===`);
    for (const c of clipping.slice(0, 12)) console.log(`  ${c.tag} "${c.text}" clientW=${c.clientW} scrollW=${c.scrollW}`);
  }
  if (overlaps.length) {
    console.log(`\n=== ${label} — POSSIBLE OVERLAPS (${overlaps.length}) ===`);
    for (const o of overlaps.slice(0, 10)) console.log(`  "${o.a}" <-> "${o.b}"`);
  }
  if (!overflow.length && !clipping.length && !overlaps.length) {
    console.log(`\n=== ${label} — CLEAN (no overflow/clipping/overlap detected) ===`);
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log(`Opening ${BASE} at ${WIDTH}x${HEIGHT}`);
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Determine if logged in already
  const loginVisible = await page.locator('input').count().then(async n => {
    return n > 0 && await page.getByText('Đăng nhập', { exact: false }).count() > 0;
  }).catch(() => false);
  console.log('Login form visible:', loginVisible);

  if (loginVisible) {
    // Find username/password fields
    const inputs = page.locator('input');
    const n = await inputs.count();
    console.log('Input count on login:', n);
    await page.locator('input[type="text"], input[name="username"]').first().fill('demo-admin');
    await page.locator('input[type="password"]').fill('demo-password-2026');
    await page.getByRole('button', { name: /đăng nhập|login/i }).click();
    await page.waitForTimeout(2500);
  }

  // Wait for fleet content
  try {
    await page.waitForSelector('text=Danh sách máy', { timeout: 8000 });
  } catch (e) {
    console.log('WARN: fleet nav not found, trying dashboard anchor');
  }
  await page.waitForTimeout(1500);

  const url = page.url();
  console.log('URL after login:', url);

  if (url.includes('#dashboard')) {
    await snapshotLayout(page, 'DASHBOARD (desktop-ish 900x600)');
  } else {
    await snapshotLayout(page, 'FLEET (900x600)');
    // Click first host card
    const cards = page.locator('article, [role="button"]').filter({ hasText: /HCM|Design|Warehouse/i }).first();
    try {
      await cards.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
      await snapshotLayout(page, 'DASHBOARD (900x600)');
    } catch (e) {
      console.log('Could not navigate to dashboard:', e.message);
    }
  }

  // Toggle dark mode if a toggle button is accessible
  const darkBtn = page.locator('button[aria-label*="tối"], button[aria-label*="dark"], button[aria-label*="Chuyển"]').first();
  const darkCount = await darkBtn.count();
  if (darkCount > 0) {
    await darkBtn.click();
    await page.waitForTimeout(1200);
    await snapshotLayout(page, 'DARK MODE (900x600)');
  } else {
    console.log('Dark toggle not directly accessible at this viewport');
  }

  // Extra viewport sizes
  for (const [w, h, label] of [[1366, 768, 'DESKTOP 1366x768'], [375, 667, 'MOBILE 375x667']]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(1200);
    await snapshotLayout(page, label);
  }

  await page.screenshot({ path: 'qa-final-state.png', fullPage: false });
  console.log('\nScreenshot saved qa-final-state.png');

  console.log('\n=== SUMMARY ===');
  for (const r of results) console.log(`  ${r.label}: overflow=${r.overflowCount} clipping=${r.clippingCount} overlap=${r.overlapCount}`);

  await browser.close();
})().catch(err => { console.error('FATAL:', err); process.exit(1); });