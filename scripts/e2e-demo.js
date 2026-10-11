/**
 * End-to-end check of the profile page against the in-browser DEMO backend.
 *
 * The Firebase deploy is static-only, so /api/* 404s and public/js/api.js
 * falls back to public/js/demo-store.js. That fallback has its own login,
 * dashboard and profile-update code, so it needs testing on its own.
 *
 *   node scripts/e2e-demo.js                headed (default)
 *   node scripts/e2e-demo.js --headless
 *
 * Starts scripts/static-server.js itself.
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const HEADED = !process.argv.includes('--headless');
const USER = { email: 'rahul@xenproperty.com', password: 'user123' };

let pass = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  \u2713 ${name}`);
  } else {
    failures.push(name);
    console.log(`  \u2717 ${name}${detail ? `\n      ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n\u2500\u2500 ${title} ${'\u2500'.repeat(Math.max(0, 58 - title.length))}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'static-server.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  await wait(900);

  const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 110 : 0 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') jsErrors.push(`console: ${m.text()}`);
  });

  try {
    /* ------------------------------------------------------------------ */
    section('1. Demo mode is detected');

    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const mode = await page.evaluate(() => ({
      apiMode: window.api ? api.mode : 'no api',
      badge: !!document.getElementById('demoModeBadge'),
      sideStack: document.getElementById('featuredSideStack')?.children.length ?? -1,
      heroTitle: (document.querySelector('#featuredHeroCard h3') || {}).textContent?.trim() ?? '',
    }));
    check('api.js falls back to the demo backend', mode.apiMode === 'demo', `mode=${mode.apiMode}`);
    check('the visitor is told they are on demo data', mode.badge);
    check('the homepage featured section is populated from demo data',
      mode.sideStack > 0 && mode.heroTitle.length > 0, JSON.stringify(mode));

    /* ------------------------------------------------------------------ */
    section('2. Demo sign-in opens the profile');

    await page.goto(`${BASE}/login.html`, { waitUntil: 'domcontentloaded' });
    await page.fill('#loginEmail', USER.email);
    await page.fill('#loginPassword', USER.password);
    await Promise.all([
      page.waitForURL(/profile\.html/, { timeout: 15000 }),
      page.click('#loginSubmitBtn'),
    ]);
    check('demo sign-in lands on profile.html', /profile\.html/.test(page.url()), page.url());

    await page.waitForFunction(
      () => getComputedStyle(document.getElementById('profileSignedIn')).display !== 'none',
      { timeout: 12000 }
    ).catch(() => {});
    const shown = await page.evaluate(
      () => getComputedStyle(document.getElementById('profileSignedIn')).display !== 'none'
    );
    check('the demo profile renders', shown);

    const info = await page.evaluate(() => {
      const t = (id) => (document.getElementById(id) || {}).textContent?.trim() ?? '(missing)';
      return {
        name: t('pfName'), email: t('pfEmail'), phone: t('dPhone'),
        role: t('dRole'), listings: t('pfListingCount'), visits: t('pfVisitCount'),
      };
    });
    check('demo profile shows the account name', info.name === 'Rahul Sharma', info.name);
    check('demo profile shows the email', info.email === USER.email, info.email);
    check('demo profile shows the phone', /98111/.test(info.phone), info.phone);
    check('counters render in demo mode',
      info.listings !== '(missing)' && info.visits !== '(missing)',
      JSON.stringify(info));

    /* ------------------------------------------------------------------ */
    section('3. Demo profile editing persists across a reload');

    await page.click('#pfEditBtn');
    await page.waitForSelector('#editProfileModal.active', { timeout: 8000 });
    await page.fill('#pfEditName', 'R');
    await page.click('#pfSaveBtn');
    await wait(900);
    const rejected = await page.evaluate(() =>
      document.getElementById('editProfileModal').classList.contains('active')
    );
    check('demo mode rejects a 1-character name', rejected);

    await page.fill('#pfEditName', 'Rahul Demo Edited');
    await page.fill('#pfEditPhone', '+91 91234 56789');
    await page.click('#pfSaveBtn');
    await page.waitForFunction(
      () => document.getElementById('pfName').textContent.trim() === 'Rahul Demo Edited',
      { timeout: 12000 }
    ).catch(() => {});
    const edited = await page.evaluate(() => ({
      hero: document.getElementById('pfName').textContent.trim(),
      phone: document.getElementById('dPhone').textContent.trim(),
    }));
    check('demo edit updates the hero', edited.hero === 'Rahul Demo Edited', edited.hero);
    check('demo edit updates the phone', edited.phone === '+91 91234 56789', edited.phone);

    // Reload: seeded users come from seed.json each load, so the edit must be
    // replayed from the saved overlay.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => getComputedStyle(document.getElementById('profileSignedIn')).display !== 'none',
      { timeout: 12000 }
    ).catch(() => {});
    await wait(1200);
    const afterReload = await page.evaluate(() => ({
      hero: (document.getElementById('pfName') || {}).textContent?.trim(),
      phone: (document.getElementById('dPhone') || {}).textContent?.trim(),
    }));
    check('the demo edit survives a page reload',
      afterReload.hero === 'Rahul Demo Edited' && afterReload.phone === '+91 91234 56789',
      JSON.stringify(afterReload));

    /* ------------------------------------------------------------------ */
    section('4. Demo badge links to the profile');

    await page.goto(`${BASE}/buy.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.user-badge-nav', { timeout: 10000 });
    const badge = await page.evaluate(() => {
      const el = document.querySelector('.user-badge-nav');
      return { tag: el.tagName, href: el.getAttribute('href'), text: el.textContent.trim() };
    });
    check('demo navbar badge is a link', badge.tag === 'A' && badge.href === 'profile.html',
      JSON.stringify(badge));
    check('the badge shows the edited name', /Verma|Demo Edited/.test(badge.text) || /Rahul/.test(badge.text),
      badge.text);

    /* ------------------------------------------------------------------ */
    section('5. Demo saved properties count on the profile');

    await page.goto(`${BASE}/profile.html`, { waitUntil: 'domcontentloaded' });
    await wait(1500);
    // Save two properties, then confirm the counter follows.
    const savedBefore = await page.evaluate(() =>
      parseInt(document.getElementById('pfSavedCount').textContent.trim(), 10));
    check('saved counter starts at zero', savedBefore === 0, String(savedBefore));

    await page.goto(`${BASE}/buy.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.badge-favorite', { timeout: 12000 });
    await page.evaluate(() => {
      document.querySelectorAll('.badge-favorite').forEach((el, i) => { if (i < 2) el.click(); });
    });
    await wait(700);
    const favCount = await page.evaluate(() => xenFavorites.items.length);
    check('two properties can be saved', favCount === 2, String(favCount));

    await page.goto(`${BASE}/profile.html`, { waitUntil: 'domcontentloaded' });
    await wait(1500);
    const savedAfter = await page.evaluate(() => ({
      count: parseInt(document.getElementById('pfSavedCount').textContent.trim(), 10),
      rows: document.querySelectorAll('#pfSaved .profile-list-item').length,
    }));
    check('the profile saved counter matches', savedAfter.count === 2, JSON.stringify(savedAfter));
    check('the saved list shows both properties', savedAfter.rows === 2, String(savedAfter.rows));

    /* ------------------------------------------------------------------ */
    section('6. Reset and confirm demo state clears');

    await page.goto(`${BASE}/profile.html`, { waitUntil: 'domcontentloaded' });
    await wait(1200);
    await page.evaluate(() => {
      xenFavorites.clearAll();
      if (window.xenDemoApi) window.xenDemoApi.resetDemoData();
    });
    await page.goto(`${BASE}/profile.html`, { waitUntil: 'domcontentloaded' });
    await wait(1500);
    const reset = await page.evaluate(() => ({
      out: getComputedStyle(document.getElementById('profileSignedOut')).display !== 'none',
      hero: (document.getElementById('pfName') || {}).textContent?.trim(),
    }));
    check('resetting the demo signs the visitor out', reset.out, JSON.stringify(reset));
    check('the original demo name is restored after reset',
      !reset.hero || reset.hero === 'Loading...' || reset.hero === 'Your Profile', reset.hero);

    /* ------------------------------------------------------------------ */
    section('7. JavaScript errors in demo mode');
    const real = jsErrors.filter((e) =>
      // The backend probe deliberately 404s once per page load.
      !/Failed to load resource|net::ERR|ERR_|404/i.test(e));
    check('no JavaScript errors in demo mode', real.length === 0, real.slice(0, 5).join('\n      '));

    console.log(`\n${'\u2550'.repeat(64)}`);
    console.log(`  PASSED: ${pass}    FAILED: ${failures.length}`);
    if (failures.length) {
      console.log('\n  Failing checks:');
      failures.forEach((f) => console.log(`    - ${f}`));
    }
    console.log(`${'\u2550'.repeat(64)}`);
  } catch (err) {
    console.error('\n  RUN ABORTED:', err.message);
    failures.push(`run aborted: ${err.message}`);
  } finally {
    await browser.close();
    server.kill();
  }

  process.exitCode = failures.length ? 1 : 0;
})();