/**
 * End-to-end check of the profile / pricing / sorting work, run in a real
 * headed Chromium so the steps can be watched as they happen.
 *
 *   node scripts/e2e-profile.js              headed (default)
 *   node scripts/e2e-profile.js --headless   no window
 *
 * Requires the local server: npm start   (http://localhost:3000)
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const HEADED = !process.argv.includes('--headless');
const USER = { email: 'rahul@xenproperty.com', password: 'user123' };

/** Tolerates Firebase cleanUrls, which serves /profile rather than /profile.html. */
const PROFILE_URL = /profile(\.html)?($|[?#])/;

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

/** Characters that mean a UTF-8 string was once read as Windows-1252. */
const MOJIBAKE = /[\u00C2-\u00F4][\u0080-\u00BF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u20AC\u2122]/;

(async () => {
  const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 110 : 0 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') jsErrors.push(`console: ${m.text()}`);
  });

  const seenJsErrors = () => jsErrors.splice(0, jsErrors.length);

  try {
    /* ------------------------------------------------------------------ */
    section('1. Signing in opens the profile');

    await page.goto(`${BASE}/login.html`, { waitUntil: 'domcontentloaded' });
    await page.fill('#loginEmail', USER.email);
    await page.fill('#loginPassword', USER.password);
    await Promise.all([
      page.waitForURL(PROFILE_URL , { timeout: 15000 }),
      page.click('#loginSubmitBtn'),
    ]);
    check('signing in lands on profile.html', PROFILE_URL.test(page.url()), page.url());

    await page.waitForSelector('#profileSignedIn:not([style*="none"])', { timeout: 10000 }).catch(() => {});
    const signedIn = await page.evaluate(
      () => getComputedStyle(document.getElementById('profileSignedIn')).display !== 'none'
    );
    check('the signed-in profile is shown, not the sign-in prompt', signedIn);

    /* ------------------------------------------------------------------ */
    section('2. Clicking the profile badge opens the full profile');

    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.user-badge-nav', { timeout: 10000 });
    const badge = await page.evaluate(() => {
      const el = document.querySelector('.user-badge-nav');
      return { tag: el.tagName, href: el.getAttribute('href'), label: el.getAttribute('aria-label') };
    });
    check('the navbar badge is a link', badge.tag === 'A', `tag=${badge.tag}`);
    check('the navbar badge points at profile.html', badge.href === 'profile.html', `href=${badge.href}`);
    check('the navbar badge has an accessible name', !!badge.label, `aria-label=${badge.label}`);

    await Promise.all([
      page.waitForURL(PROFILE_URL , { timeout: 15000 }),
      page.click('.user-badge-nav'),
    ]);
    check('clicking the badge opens the full profile', PROFILE_URL.test(page.url()), page.url());

    /* ------------------------------------------------------------------ */
    section('3. Profile shows the right account');

    const profile = await page.evaluate(() => {
      const t = (id) => (document.getElementById(id) || {}).textContent?.trim() ?? '(missing)';
      return {
        name: t('pfName'),
        email: t('pfEmail'),
        role: t('pfRole'),
        since: t('pfSince'),
        detailName: t('dName'),
        detailEmail: t('dEmail'),
        detailPhone: t('dPhone'),
        cards: [...document.querySelectorAll('.profile-card h2')].map((h) => h.textContent.trim()),
      };
    });
    check('name is rendered', profile.name === 'Rahul Sharma', profile.name);
    check('email is rendered', profile.email === USER.email, profile.email);
    check('phone is rendered', /98111/.test(profile.detailPhone), profile.detailPhone);
    check('role is rendered', profile.role === 'USER', profile.role);
    check('member-since is rendered', /Member since/.test(profile.since), profile.since);
    check('account + saved + listings + visits cards are present',
      ['Account Details', 'Saved Properties', 'My Listings', 'My Site Visits']
        .every((c) => profile.cards.includes(c)),
      profile.cards.join(' | '));

    /* ------------------------------------------------------------------ */
    section('4. Editing profile details');

    await page.click('#pfEditBtn');
    await page.waitForSelector('#editProfileModal.active', { timeout: 8000 });
    const prefilled = await page.evaluate(() => ({
      name: document.getElementById('pfEditName').value,
      phone: document.getElementById('pfEditPhone').value,
    }));
    check('the edit form is pre-filled from the account', prefilled.name === 'Rahul Sharma', JSON.stringify(prefilled));

    // Too-short name must be rejected.
    await page.fill('#pfEditName', 'R');
    await page.click('#pfSaveBtn');
    await page.waitForTimeout(1200);
    const stillOpen = await page.evaluate(
      () => document.getElementById('editProfileModal').classList.contains('active')
    );
    check('a 1-character name is rejected', stillOpen);

    // Bad phone must be rejected.
    await page.fill('#pfEditName', 'Rahul Sharma');
    await page.fill('#pfEditPhone', '123');
    await page.click('#pfSaveBtn');
    await page.waitForTimeout(1200);
    const stillOpen2 = await page.evaluate(
      () => document.getElementById('editProfileModal').classList.contains('active')
    );
    check('a too-short phone number is rejected', stillOpen2);

    // A valid change must save and refresh everywhere.
    await page.fill('#pfEditName', 'Rahul S. Verma');
    await page.fill('#pfEditPhone', '+91 90000 11111');
    await page.click('#pfSaveBtn');
    // Wait for the success toast specifically. Earlier validation errors live
    // for 7 seconds, so the first toast in the container is a stale one.
    await page.waitForFunction(
      () => [...document.querySelectorAll('.toast')].some((t) => /updated/i.test(t.textContent)),
      { timeout: 12000 }
    ).catch(() => {});
    await page.waitForFunction(
      () => document.getElementById('pfName').textContent.trim() === 'Rahul S. Verma',
      { timeout: 12000 }
    ).catch(() => {});
    const after = await page.evaluate(() => ({
      hero: document.getElementById('pfName').textContent.trim(),
      detail: document.getElementById('dName').textContent.trim(),
      phone: document.getElementById('dPhone').textContent.trim(),
      modalOpen: document.getElementById('editProfileModal').classList.contains('active'),
      toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent.trim()),
    }));
    check('the new name shows in the hero', after.hero === 'Rahul S. Verma', after.hero);
    check('the new name shows in account details', after.detail === 'Rahul S. Verma', after.detail);
    check('the new phone shows in account details', after.phone === '+91 90000 11111', after.phone);
    check('the edit modal closes on success', !after.modalOpen);
    check('a success toast is shown', after.toasts.some((t) => /updated/i.test(t)),
      JSON.stringify(after.toasts));

    // Restore the account to its original values.
    await page.click('#pfEditBtn');
    await page.waitForSelector('#editProfileModal.active', { timeout: 8000 });
    await page.fill('#pfEditName', 'Rahul Sharma');
    await page.fill('#pfEditPhone', '+91 98111 22334');
    await page.click('#pfSaveBtn');
    await page.waitForFunction(
      () => document.getElementById('pfName').textContent.trim() === 'Rahul Sharma',
      { timeout: 12000 }
    ).catch(() => {});
    const restored = await page.evaluate(() => ({
      name: document.getElementById('pfName').textContent.trim(),
      phone: document.getElementById('dPhone').textContent.trim(),
    }));
    check('the account is restored to its original values',
      restored.name === 'Rahul Sharma' && restored.phone === '+91 98111 22334',
      JSON.stringify(restored));

    /* ------------------------------------------------------------------ */
    section('5. Prices show a real rupee sign, not mangled text');

    const pagesWithPrices = [
      ['rent.html', 'Monthly Rent'],
      ['buy.html', 'Properties Found'],
      ['loans.html', 'Interest Rate'],
      ['index.html', 'hero-title'],
    ];
    for (const [file, waitFor] of pagesWithPrices) {
      await page.goto(`${BASE}/${file}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1800);
      const text = await page.evaluate(() => document.body.innerText);
      check(`${file}: no mangled currency text`, !MOJIBAKE.test(text),
        (text.match(MOJIBAKE) || [''])[0]);
      if (file !== 'index.html') {
        check(`${file}: shows the ₹ sign`, text.includes('\u20B9'), 'no rupee sign found');
      }
    }

    const chips = await page.evaluate(async () => {
      const res = await fetch('/');
      return res.ok;
    });
    check('the site still serves', chips);

    /* ------------------------------------------------------------------ */
    section('6. Sorting is low\u2192high and high\u2192low by price');

    const all = await (await fetch(`${BASE}/api/properties`)).json();
    const priceOf = Object.fromEntries(all.data.map((p) => [String(p.id), p.price]));

    for (const file of ['buy.html', 'rent.html']) {
      await page.goto(`${BASE}/${file}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => document.querySelectorAll('.properties-grid > *').length > 0,
        { timeout: 15000 }
      ).catch(() => {});

      const labels = await page.evaluate(() =>
        [...document.getElementById('sortSelect').options].map((o) => o.textContent.trim())
      );
      check(`${file}: offers a low-to-high price option`,
        labels.some((l) => /low to high/i.test(l)), labels.join(' | '));
      check(`${file}: offers a high-to-low price option`,
        labels.some((l) => /high to low/i.test(l)), labels.join(' | '));

      const readOrder = () => page.evaluate(() =>
        [...document.querySelectorAll('.properties-grid > *')].map((el) => {
          const onclick = el.getAttribute('onclick') || '';
          const m = onclick.match(/viewPropertyDetails\((\d+)\)/);
          if (m) return m[1];
          const badge = el.querySelector('.badge-favorite');
          return badge ? badge.getAttribute('data-id') : null;
        })
      );

      await page.selectOption('#sortSelect', 'price_asc');
      await page.waitForTimeout(1500);
      const asc = (await readOrder()).map((id) => priceOf[String(id)]).filter((v) => v != null);

      await page.selectOption('#sortSelect', 'price_desc');
      await page.waitForTimeout(1500);
      const desc = (await readOrder()).map((id) => priceOf[String(id)]).filter((v) => v != null);

      check(`${file}: price_asc returns ascending prices`,
        asc.length > 0 && asc.every((v, i, a) => i === 0 || v >= a[i - 1]), JSON.stringify(asc));
      check(`${file}: price_desc returns descending prices`,
        desc.length > 0 && desc.every((v, i, a) => i === 0 || v <= a[i - 1]), JSON.stringify(desc));
    }

    /* ------------------------------------------------------------------ */
    section('7. Interest rate slider reaches 25%');

    await page.goto(`${BASE}/loans.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#interestRateSlider', { timeout: 10000 });
    const rates = await page.evaluate(() => {
      const s = document.getElementById('interestRateSlider');
      const read = () => document.getElementById('interestRateVal').textContent.trim();
      const before = read();
      s.value = s.max;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      const atMax = read();
      s.value = '8.5';
      s.dispatchEvent(new Event('input', { bubbles: true }));
      return { min: s.min, max: s.max, before, atMax, back: read() };
    });
    check('the slider maximum is 25%', rates.max === '25.0', `max=${rates.max}`);
    check('the label reaches 25.00% at maximum', rates.atMax === '25.00%', rates.atMax);
    check('the label returns to 8.50% at the default', rates.back === '8.50%', rates.back);

    const emi = await page.evaluate(() => {
      const s = document.getElementById('interestRateSlider');
      const el = document.getElementById('monthlyEMIVal');
      const readEmi = () => (el ? el.textContent.trim() : null);
      s.value = '8.5'; s.dispatchEvent(new Event('input', { bubbles: true }));
      const low = readEmi();
      s.value = '25'; s.dispatchEvent(new Event('input', { bubbles: true }));
      const high = readEmi();
      s.value = '8.5'; s.dispatchEvent(new Event('input', { bubbles: true }));
      return { low, high, target: el ? el.id : 'not found' };
    });
    check('the EMI readout exists', emi.target === 'monthlyEMIVal', emi.target);
    check('a higher rate produces a higher EMI',
      emi.low && emi.high && Number(emi.high.replace(/[^\d]/g, '')) > Number(emi.low.replace(/[^\d]/g, '')),
      JSON.stringify(emi));

    /* ------------------------------------------------------------------ */
    section('8. Profile page on small screens');

    await page.goto(`${BASE}/profile.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 780 });
      await page.waitForTimeout(700);
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const over = [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
          .map((el) => `${el.tagName}.${(el.className || '').toString().split(' ')[0]}`);
        return {
          docW: de.scrollWidth,
          winW: window.innerWidth,
          overflow: de.scrollWidth > window.innerWidth + 1,
          offenders: [...new Set(over)].slice(0, 5),
        };
      });
      check(`no horizontal scroll at ${width}px`, !m.overflow,
        `scrollWidth=${m.docW} vs ${m.winW}; ${m.offenders.join(', ')}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    /* ------------------------------------------------------------------ */
    section('9. Signed-out visitors get a sign-in prompt');

    const anon = await context.browser().newContext({ viewport: { width: 1280, height: 860 } });
    const anonPage = await anon.newPage();
    await anonPage.goto(`${BASE}/profile.html`, { waitUntil: 'domcontentloaded' });
    await anonPage.waitForTimeout(1500);
    const anonState = await anonPage.evaluate(() => ({
      out: getComputedStyle(document.getElementById('profileSignedOut')).display !== 'none',
      in: getComputedStyle(document.getElementById('profileSignedIn')).display !== 'none',
      cta: document.querySelector('#profileSignedOut a')?.getAttribute('href') ?? '',
    }));
    check('a signed-out visitor sees the sign-in prompt', anonState.out && !anonState.in, JSON.stringify(anonState));
    check('the prompt links back to sign in', anonState.cta.includes('login.html'), anonState.cta);
    await anon.close();

    /* ------------------------------------------------------------------ */
    section('10. JavaScript errors');
    const errs = seenJsErrors();
    // A failed image fetch from a remote CDN is noise, not a page fault.
    const real = errs.filter((e) => !/Failed to load resource|net::ERR|ERR_/i.test(e));
    check('no JavaScript errors on any page tested', real.length === 0,
      real.slice(0, 5).join('\n      '));

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
  }

  process.exitCode = failures.length ? 1 : 0;
})();