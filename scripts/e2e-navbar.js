/**
 * End-to-end check for the navbar sign-in change.
 *
 * What it verifies:
 *   1. The navbar has no Login / Sign Up / Logout controls.
 *   2. Pressing "List Property" while signed out lands on the login page, and
 *      the login page offers both logging in and registering.
 *   3. Registering puts the new name in the navbar.
 *   4. Clicking that name opens the profile.
 *   5. Logging out is on the profile page, and afterwards the navbar shows no
 *      name and no auth buttons.
 *
 *   node scripts/e2e-navbar.js                headed (default)
 *   node scripts/e2e-navbar.js --headless
 *   BASE_URL=https://your-deploy.web.app node scripts/e2e-navbar.js
 *
 * With no BASE_URL it boots scripts/static-server.js, so it runs against the
 * in-browser demo backend and needs no live API.
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const EXTERNAL = !!process.env.BASE_URL;
const PORT = Number(process.env.PORT || 3100);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const HEADED = !process.argv.includes('--headless');
const PROFILE_URL = /profile(\.html)?($|[?#])/;

/** Register a throwaway account. Unique per run so the suite is repeatable. */
const NEW_USER = {
  full_name: 'Niranjan',
  email: `niranjan.${Date.now().toString(36)}@example.com`,
  password: 'Niranjan@123',
  phone: '+91 90000 24680',
};

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

const section = (t) => console.log(`\n\u2500\u2500 ${t} ${'\u2500'.repeat(Math.max(0, 56 - t.length))}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Let a navigation finish before touching the page.
 *
 * Firebase Hosting serves cleanUrls, so /sell.html answers with a 301 to /sell.
 * waitForURL fires on the first hop, and the second one then tears the
 * execution context out from under any evaluate() that runs straight after.
 */
async function settle(page, ms = 1600) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await wait(ms);
}

/** Everything the navbar auth area currently shows. */
const readNav = (page) =>
  page.evaluate(() => {
    const area = document.getElementById('navbarAuthArea');
    if (!area) return null;
    const badge = area.querySelector('.user-badge-nav');
    const texts = [...area.querySelectorAll('a,button')]
      .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    return {
      texts,
      badge: badge ? badge.textContent.trim() : null,
      badgeHref: badge ? badge.getAttribute('href') : null,
      hasLogout: /logout|sign out/i.test(area.textContent),
      hasSignInLink: !!area.querySelector('a[href^="login.html"]'),
      listBtn: !!area.querySelector('.btn-list-prop'),
    };
  });

/**
 * readNav, but tolerant of a navigation landing mid-read.
 *
 * A live deploy answers /sell.html with a 301 to /sell, which can destroy the
 * execution context between one evaluate() and the next. Retrying for a moment
 * is the honest fix - the page genuinely has not finished arriving yet.
 */
async function navState(page, attempts = 6) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await readNav(page);
    } catch (err) {
      lastErr = err;
      if (!/context was destroyed|Target (page|closed)|navigation|Execution context/i.test(err.message)) {
        throw err;
      }
      await wait(700);
    }
  }
  throw lastErr;
}

(async () => {
  let server = null;
  if (!EXTERNAL) {
    server = spawn(process.execPath, [path.join(__dirname, 'static-server.js')], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'ignore',
    });
    await wait(900);
  }
  console.log(`\n  target: ${BASE}${EXTERNAL ? '  (live deploy)' : '  (local static server)'}`);

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
    section('1. Signed-out navbar has no auth buttons');

    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    const anon = await navState(page);
    check('the navbar auth area exists', !!anon);
    check('there is no Login button', !anon.hasSignInLink, JSON.stringify(anon.texts));
    check('there is no Logout button', !anon.hasLogout, JSON.stringify(anon.texts));
    check('there is no "Sign Up" button', !/sign\s*up/i.test(anon.texts.join(' ')), JSON.stringify(anon.texts));
    check('there is no account badge', anon.badge === null, String(anon.badge));
    check('"List Property" is still there', anon.listBtn, JSON.stringify(anon.texts));

    // Same on a second page, to be sure it is not just the homepage.
    await page.goto(`${BASE}/buy.html`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    const anonBuy = await navState(page);
    check('buy.html is also free of Login/Sign Up', !anonBuy.hasSignInLink && !anonBuy.hasLogout,
      JSON.stringify(anonBuy.texts));

    /* ------------------------------------------------------------------ */
    section('2. "List Property" sends you to the login page');

    await Promise.all([
      page.waitForURL(/login(\.html)?($|[?#])/, { timeout: 15000 }),
      page.click('.btn-list-prop'),
    ]);
    check('clicking "List Property" opens the login page', /login(\.html)?($|[?#])/.test(page.url()), page.url());
    check('it carries a redirect back to the listing form',
      /redirect=sell(\.html)?/i.test(page.url()), page.url());

    const tabs = await page.evaluate(() => ({
      login: !!document.getElementById('loginForm'),
      register: !!document.getElementById('registerForm'),
      hasLoginTab: !!document.getElementById('tabLoginBtn'),
      hasSignupTab: !!document.getElementById('tabSignupBtn'),
    }));
    check('the page offers a login form', tabs.login);
    check('the page offers a register form too', tabs.register, JSON.stringify(tabs));
    check('both tabs are present', tabs.hasLoginTab && tabs.hasSignupTab, JSON.stringify(tabs));

    /* ------------------------------------------------------------------ */
    section('3. Registering puts the name in the navbar');

    await page.click('#tabSignupBtn');
    await wait(500);
    await page.fill('#regName', NEW_USER.full_name);
    await page.fill('#regEmail', NEW_USER.email);
    await page.fill('#regPhone', NEW_USER.phone);
    await page.fill('#regPassword', NEW_USER.password);
    await Promise.all([
      page.waitForURL(/sell(\.html)?($|[?#])/, { timeout: 15000 }),
      page.click('#registerSubmitBtn'),
    ]);
    // Registering honours the ?redirect= the visitor arrived with, so they end
    // up back on the listing form they originally asked for.
    check('registering returns to where the visitor was heading',
      /sell(\.html)?($|[?#])/.test(page.url()), page.url());

    const nav1 = await navState(page);
    check('the new name appears in the navbar', nav1.badge === NEW_USER.full_name, String(nav1.badge));
    check('the badge links to the profile', nav1.badgeHref === 'profile.html', String(nav1.badgeHref));
    check('still no Login/Sign Up after registering', !nav1.hasSignInLink, JSON.stringify(nav1.texts));
    check('still no Logout in the navbar', !nav1.hasLogout, JSON.stringify(nav1.texts));

    /* ------------------------------------------------------------------ */
    section('4. Clicking the name opens the profile');

    await page.goto(`${BASE}/buy.html`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    const navBefore = await navState(page);
    check('the name is visible on other pages too', navBefore.badge === NEW_USER.full_name, String(navBefore.badge));

    await Promise.all([
      page.waitForURL(PROFILE_URL, { timeout: 15000 }),
      page.click('.user-badge-nav'),
    ]);
    await settle(page);
    check('clicking the name opens the profile', PROFILE_URL.test(page.url()), page.url());

    /* ------------------------------------------------------------------ */
    section('5. Listing works once signed in');

    await page.goto(`${BASE}/sell.html`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    check('"List Property" now goes straight through to the listing form',
      /sell(\.html)?($|[?#])/.test(page.url()), page.url());

    /* ------------------------------------------------------------------ */
    section('6. Logging out lives on the profile');

    // First confirm it is NOT in the navbar (checked from any page), then
    // actually open the profile and confirm it is there.
    const inNavbar = await page.evaluate(() => {
      const area = document.getElementById('navbarAuthArea');
      return area ? /logout|sign out/i.test(area.textContent) : false;
    });
    check('there is no logout control in the navbar', !inNavbar);

    await page.goto(`${BASE}/profile.html`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    const onProfile = await page.evaluate(() => {
      const btn = document.querySelector('button[onclick*="confirmLogout"], button[onclick*="handleLogout"]');
      return btn ? btn.textContent.replace(/\s+/g, ' ').trim() : null;
    });
    check('there is a logout control on the profile', !!onProfile, String(onProfile));

    // accept the confirm() dialog
    page.once('dialog', (d) => d.accept());
    await Promise.all([
      page.waitForURL(/index\.html|(\/)$/, { timeout: 15000 }),
      page.click('button[onclick*="confirmLogout"], button[onclick*="handleLogout"]'),
    ]);
    check('logging out returns to the home page', /(\/)$|index\.html/.test(page.url()), page.url());

    await wait(1800);
    const after = await navState(page);
    check('the name is gone from the navbar', after.badge === null, String(after.badge));
    check('no Login/Sign Up reappeared', !after.hasSignInLink, JSON.stringify(after.texts));
    check('"List Property" is back to gating again', after.listBtn, JSON.stringify(after.texts));

    // And the gate must work again after signing out.
    await Promise.all([
      page.waitForURL(/login(\.html)?($|[?#])/, { timeout: 15000 }),
      page.click('.btn-list-prop'),
    ]);
    check('after logging out, "List Property" goes to login again',
      /login(\.html)?($|[?#])/.test(page.url()), page.url());

    /* ------------------------------------------------------------------ */
    section('7. JavaScript errors');
    const real = jsErrors.filter((e) => !/Failed to load resource|net::ERR|ERR_|404/i.test(e));
    check('no JavaScript errors', real.length === 0, real.slice(0, 5).join('\n      '));

    console.log(`\n${'\u2550'.repeat(62)}`);
    console.log(`  PASSED: ${pass}    FAILED: ${failures.length}`);
    if (failures.length) {
      console.log('\n  Failing checks:');
      failures.forEach((f) => console.log(`    - ${f}`));
    }
    console.log(`${'\u2550'.repeat(62)}`);
  } catch (err) {
    console.error('\n  RUN ABORTED:', err.message);
    failures.push(`run aborted: ${err.message}`);
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  process.exitCode = failures.length ? 1 : 0;
})();