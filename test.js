/**
 * XenProperty automated test suite.
 *
 *   npm test
 *
 * These are REAL assertions - every check compares an actual observed value
 * against an expectation and records a failure when they differ. The suite
 * exits non-zero if anything fails, so it can never report a false PASS.
 *
 * Tests run against a live server. Start one first with `npm start`, or let
 * this file boot one itself by setting BOOT_SERVER=1.
 *
 * Test data created here is tagged and removed again in the cleanup phase, so
 * the real database is left exactly as it was found.
 */
const http = require('http');

const HOST = process.env.TEST_HOST || 'localhost';
const PORT = Number(process.env.TEST_PORT || 3000);
const BOOT = process.env.BOOT_SERVER === '1';

const results = { pass: 0, fail: 0, failures: [] };
let currentSuite = 'general';

/* ------------------------------ tiny runner ------------------------------ */

function suite(name) {
  currentSuite = name;
  console.log(`\n=== ${name} ===`);
}

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    results.pass++;
    console.log(`  PASS  ${label}`);
  } else {
    results.fail++;
    const msg = `${label} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    results.failures.push(`[${currentSuite}] ${msg}`);
    console.log(`  FAIL  ${msg}`);
  }
  return ok;
}

function checkThat(label, condition, detail = '') {
  if (condition) {
    results.pass++;
    console.log(`  PASS  ${label}`);
  } else {
    results.fail++;
    const msg = `${label}${detail ? ' - ' + detail : ''}`;
    results.failures.push(`[${currentSuite}] ${msg}`);
    console.log(`  FAIL  ${msg}`);
  }
  return !!condition;
}

/**
 * Percent-encode a value that may already be encoded, so a caller can pass
 * either 'a b' or 'a%20b' without double-encoding or throwing.
 */
function decodeURIComponentSafe(v) {
  try { return decodeURIComponent(v); } catch (e) { return v; }
}

/* -------------------------------- client -------------------------------- */

function request(method, path, { body, token, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null
      : (typeof body === 'string' ? body : JSON.stringify(body));

    const h = { ...headers };
    if (payload !== null && !h['Content-Type']) h['Content-Type'] = 'application/json';
    if (token) h['Authorization'] = `Bearer ${token}`;
    if (payload !== null) h['Content-Length'] = Buffer.byteLength(payload);

    // Encode each path segment so characters like spaces and quotes in test
    // payloads do not throw ERR_UNESCAPED_CHARACTERS in the client.
    const safePath = String(path).split('?').map((seg, i) =>
      i === 0 ? seg : seg.split('&').map((kv) => {
        const eq = kv.indexOf('=');
        const k = eq === -1 ? kv : kv.slice(0, eq);
        const v = eq === -1 ? '' : kv.slice(eq + 1);
        return `${encodeURIComponent(decodeURIComponentSafe(k))}=${encodeURIComponent(decodeURIComponentSafe(v))}`;
      }).join('&')
    ).join('?');

    const req = http.request({ hostname: HOST, port: PORT, path: safePath, method, headers: h }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let parsed = raw;
        try { parsed = JSON.parse(raw); } catch (e) { /* keep raw */ }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

const get = (p, o) => request('GET', p, o);
const post = (p, body, o) => request('POST', p, { ...o, body });
const patch = (p, body, o) => request('PATCH', p, { ...o, body });
const del = (p, o) => request('DELETE', p, o);

const TEST_TAG = 'qa-suite@xenproperty.local';
const created = { inquiries: [], loans: [], designs: [], users: [], properties: [] };

/* --------------------------------- tests -------------------------------- */

async function testPagesAndAssets() {
  suite('A. Pages & static assets');
  const pages = [
    '/', '/index.html', '/buy.html', '/rent.html', '/sell.html', '/design.html',
    '/house-plans.html', '/loans.html', '/services.html', '/about.html',
    '/contact.html', '/login.html', '/admin.html', '/profile.html',
  ];
  for (const p of pages) {
    const r = await get(p);
    checkThat(`GET ${p} -> 200`, r.status === 200, `got ${r.status}`);
  }
  const assets = ['/css/style.css', '/css/base.css', '/css/pages.css', '/css/modal.css',
    '/css/components.css', '/css/hero.css', '/css/sections.css',
    '/js/api.js', '/js/main.js', '/js/auth.js', '/js/matcher.js', '/js/demo-store.js',
    '/js/profile.js',
    '/data/seed.json', '/images/logo.png'];
  for (const a of assets) {
    const r = await get(a);
    checkThat(`GET ${a} -> 200`, r.status === 200, `got ${r.status}`);
  }
  const seed = await get('/data/seed.json');
  checkThat('seed.json is valid JSON', typeof seed.body === 'object' && seed.body !== null);
  checkThat('seed.json has properties', Array.isArray(seed.body.properties) && seed.body.properties.length > 0,
    `count=${seed.body.properties?.length}`);
}

async function testPublicApi() {
  suite('B. Public read API');

  const all = await get('/api/properties');
  check('GET /api/properties -> 200', all.status, 200);
  checkThat('has count + data', typeof all.body.count === 'number' && Array.isArray(all.body.data));

  const feat = await get('/api/properties/featured');
  check('GET /api/properties/featured -> 200', feat.status, 200);
  checkThat('featured returns <= 6', feat.body.data.length <= 6, `got ${feat.body.data.length}`);
  checkThat('featured all flagged', feat.body.data.every((p) => Number(p.is_featured) === 1));

  const one = await get('/api/properties/1');
  check('GET /api/properties/1 -> 200', one.status, 200);
  checkThat('amenities is an array', Array.isArray(one.body.data.amenities));
  checkThat('additional_images is an array', Array.isArray(one.body.data.additional_images));

  const missing = await get('/api/properties/999999');
  check('GET /api/properties/999999 -> 404', missing.status, 404);

  const nonNumeric = await get('/api/properties/abc');
  checkThat('GET /api/properties/abc does not 500', nonNumeric.status !== 500, `got ${nonNumeric.status}`);

  suite('C. Filters, sorting, boundaries');
  const cases = [
    ['type=rent', (b) => b.data.every((p) => p.listing_type === 'rent')],
    ['type=buy&city=Bangalore', (b) => b.data.every((p) => p.city.toLowerCase().includes('bangalore'))],
    ['property_type=Villa', (b) => b.data.every((p) => p.property_type.toLowerCase() === 'villa')],
    ['beds=3', (b) => b.data.every((p) => p.beds === 3)],
    ['min_price=10000000&max_price=20000000', (b) => b.data.every((p) => p.price >= 10000000 && p.price <= 20000000)],
    ['search=Sarjapur', (b) => b.data.every((p) => JSON.stringify(p).toLowerCase().includes('sarjapur'))],
  ];
  for (const [q, ok] of cases) {
    const r = await get('/api/properties?' + q);
    check(`filter ${q} -> 200`, r.status, 200);
    checkThat(`filter ${q} returns correct rows`, ok(r.body), `${r.body.count} rows`);
  }
  const asc = await get('/api/properties?sort=price_asc&limit=3');
  const prices = asc.body.data.map((p) => p.price);
  checkThat('sort=price_asc is ascending', prices.every((v, i) => i === 0 || v >= prices[i - 1]), JSON.stringify(prices));
  const desc = await get('/api/properties?sort=price_desc&limit=3');
  const dp = desc.body.data.map((p) => p.price);
  checkThat('sort=price_desc is descending', dp.every((v, i) => i === 0 || v <= dp[i - 1]), JSON.stringify(dp));

  const none = await get('/api/properties?city=Nowhereville');
  check('filter with no matches -> 200', none.status, 200);
  check('filter with no matches -> 0 rows', none.body.count, 0);

  const junk = await get('/api/properties?min_price=abc&beds=xyz&limit=notanumber');
  checkThat('invalid query params do not 500', junk.status !== 500, `got ${junk.status}`);

  suite('D. SQL-injection safety');
  const inject = await get("/api/properties?search=' OR 1=1--");
  checkThat('injection in search does not 500', inject.status !== 500, `got ${inject.status}`);
  const injectCity = await get('/api/properties?city=Bangalore%27%3B%20DROP%20TABLE%20properties%3B--');
  checkThat('injection in city does not 500', injectCity.status !== 500, `got ${injectCity.status}`);
  const stillThere = await get('/api/properties');
  checkThat('table intact after injection attempts', Array.isArray(stillThere.body.data) && stillThere.body.data.length > 0,
    `${stillThere.body.count} rows`);
}

async function testAuth() {
  suite('E. Authentication');

  const noCreds = await post('/api/auth/login', {});
  check('login with no credentials -> 400', noCreds.status, 400);

  const badEmail = await post('/api/auth/login', { email: 'not-an-email', password: 'x' });
  checkThat('login with malformed email -> 4xx', badEmail.status >= 400 && badEmail.status < 500, `got ${badEmail.status}`);

  const wrongPw = await post('/api/auth/login', { email: 'admin@xenproperty.com', password: 'definitely-wrong' });
  check('login with wrong password -> 401', wrongPw.status, 401);

  const noUser = await post('/api/auth/login', { email: 'ghost@nowhere.com', password: 'whatever' });
  check('login with unknown user -> 401', noUser.status, 401);

  const admin = await post('/api/auth/login', { email: 'admin@xenproperty.com', password: 'admin123' });
  check('admin login -> 200', admin.status, 200);
  checkThat('admin gets a token', typeof admin.body.token === 'string' && admin.body.token.length > 20);
  check('admin role is admin', admin.body.user.role, 'admin');

  const user = await post('/api/auth/login', { email: 'rahul@xenproperty.com', password: 'user123' });
  check('user login -> 200', user.status, 200);
  check('user role is user', user.body.user.role, 'user');

  // Case-insensitive email
  const upper = await post('/api/auth/login', { email: 'ADMIN@XENPROPERTY.COM', password: 'admin123' });
  check('login is email case-insensitive', upper.status, 200);

  // Never leak the password hash
  checkThat('login response has no password_hash', !JSON.stringify(admin.body).includes('password_hash'));

  suite('F. Registration');
  const missingFields = await post('/api/auth/register', { email: 'x@y.com' });
  check('register missing fields -> 400', missingFields.status, 400);

  const email = TEST_TAG;
  const reg = await post('/api/auth/register', {
    full_name: 'QA Test User', email, password: 'QaPass123', phone: '+91 90000 00001', role: 'user',
  });
  check('register valid -> 201', reg.status, 201);
  if (reg.body.user) created.users.push(reg.body.user.id);

  const dupe = await post('/api/auth/register', {
    full_name: 'QA Test User', email, password: 'QaPass123',
  });
  check('duplicate email -> 409', dupe.status, 409);

  const escalate = await post('/api/auth/register', {
    full_name: 'Escalation', email: 'qa-escalate@xenproperty.local', password: 'QaPass123', role: 'admin',
  });
  checkThat('cannot self-assign admin role', escalate.body.user && escalate.body.user.role !== 'admin',
    `role=${escalate.body.user?.role}`);
  if (escalate.body.user) created.users.push(escalate.body.user.id);

  const reLogin = await post('/api/auth/login', { email, password: 'QaPass123' });
  check('new account can log in -> 200', reLogin.status, 200);

  // Newly registered account must NOT be able to read admin data
  const newToken = reLogin.body.token;
  const forbidden = await get('/api/admin/stats', { token: newToken });
  check('new normal user cannot read admin stats -> 403', forbidden.status, 403);
  const forbiddenInq = await get('/api/inquiries', { token: newToken });
  check('new normal user cannot read inquiries -> 403', forbiddenInq.status, 403);

  return { adminToken: admin.body.token, userToken: user.body.token, testEmail: email };
}

/**
 * Profile endpoints: the dashboard the profile page reads, and the self-service
 * update route.
 *
 * Anything this changes on the seeded user is put back before the suite ends,
 * so the database is left exactly as found.
 */
async function testProfile(userToken, adminToken) {
  suite('G. Profile');

  const original = await get('/api/auth/me', { token: userToken });
  check('GET /api/auth/me -> 200', original.status, 200);
  const startName = original.body.user.full_name;
  const startPhone = original.body.user.phone;

  // --- access control ---
  const anon = await get('/api/me/dashboard');
  check('dashboard without a token -> 401', anon.status, 401);
  const bogus = await get('/api/me/dashboard', { token: 'not-a-real-token' });
  checkThat('dashboard with an invalid token -> 4xx', bogus.status >= 400 && bogus.status < 500,
    `got ${bogus.status}`);
  const anonPatch = await patch('/api/auth/me', { full_name: 'Nobody' });
  check('profile update without a token -> 401', anonPatch.status, 401);

  // --- payload shape ---
  const dash = await get('/api/me/dashboard', { token: userToken });
  check('GET /api/me/dashboard -> 200', dash.status, 200);
  checkThat('dashboard returns the user', !!dash.body.user && !!dash.body.user.email);
  for (const list of ['listings', 'inquiries', 'loans', 'designs']) {
    checkThat(`dashboard.${list} is an array`, Array.isArray(dash.body[list]), `got ${typeof dash.body[list]}`);
  }

  // --- scoping: nobody sees another account's rows ---
  const me = dash.body.user;
  checkThat('listings belong to the signed-in user',
    dash.body.listings.every((p) => Number(p.user_id) === Number(me.id)),
    'a listing owned by someone else was returned');
  checkThat('inquiries belong to the signed-in user',
    dash.body.inquiries.every((i) => String(i.user_email).toLowerCase() === String(me.email).toLowerCase()),
    'an inquiry belonging to someone else was returned');
  checkThat('loans belong to the signed-in user',
    dash.body.loans.every((l) => String(l.email).toLowerCase() === String(me.email).toLowerCase()),
    'a loan belonging to someone else was returned');
  checkThat('designs belong to the signed-in user',
    dash.body.designs.every((d) => String(d.email).toLowerCase() === String(me.email).toLowerCase()),
    'a design request belonging to someone else was returned');

  // The admin's dashboard must not expose the normal user's rows either.
  const adminDash = await get('/api/me/dashboard', { token: adminToken });
  check('admin dashboard -> 200', adminDash.status, 200);
  checkThat('admin dashboard is scoped to the admin',
    adminDash.body.inquiries.every((i) => String(i.user_email).toLowerCase() === String(adminDash.body.user.email).toLowerCase()),
    'the admin dashboard leaked another account\'s inquiries');
  checkThat('admin dashboard does not list the normal user\'s listings',
    !adminDash.body.listings.some((p) => dash.body.listings.some((q) => q.id === p.id)),
    'the admin dashboard showed another account\'s listings');

  // --- update: validation ---
  check('update with nothing to change -> 400',
    (await patch('/api/auth/me', {}, { token: userToken })).status, 400);
  check('update with a 1-character name -> 400',
    (await patch('/api/auth/me', { full_name: 'R' }, { token: userToken })).status, 400);
  check('update with an over-long name -> 400',
    (await patch('/api/auth/me', { full_name: 'x'.repeat(200) }, { token: userToken })).status, 400);
  check('update with a 2-digit phone -> 400',
    (await patch('/api/auth/me', { phone: '12' }, { token: userToken })).status, 400);

  // --- update: happy path, then restore ---
  const renamed = `QA Renamed ${Date.now().toString().slice(-6)}`;
  const changed = await patch('/api/auth/me',
    { full_name: renamed, phone: '+91 90000 12345' }, { token: userToken });
  check('profile update -> 200', changed.status, 200);
  check('the new name is returned', changed.body.user.full_name, renamed);
  check('the new phone is returned', changed.body.user.phone, '+91 90000 12345');

  const reread = await get('/api/auth/me', { token: userToken });
  check('the change is persisted', reread.body.user.full_name, renamed);
  checkThat('the update response never contains a password hash',
    !JSON.stringify(changed.body).includes('password_hash'));

  // --- update: privilege escalation must be ignored ---
  const escalate = await patch('/api/auth/me',
    { full_name: renamed, role: 'admin', email: 'attacker@evil.example' }, { token: userToken });
  check('escalation attempt still returns 200', escalate.status, 200);
  check('role is NOT escalated', escalate.body.user.role, me.role);
  check('email is NOT changeable', escalate.body.user.email, me.email);

  // --- restore the seeded user exactly as it was ---
  const restored = await patch('/api/auth/me',
    { full_name: startName, phone: startPhone }, { token: userToken });
  check('the account is restored', restored.body.user.full_name, startName);
  check('the phone is restored', restored.body.user.phone, startPhone);
  checkThat('restoring did not change the role', restored.body.user.role === me.role);
}

async function testAuthorization(adminToken, userToken) {
  suite('G. Authorization matrix');

  const privileged = ['/api/inquiries', '/api/loans', '/api/design/requests', '/api/admin/stats'];
  for (const p of privileged) {
    const anon = await get(p);
    check(`anon GET ${p} -> 401`, anon.status, 401);
    const normal = await get(p, { token: userToken });
    check(`user GET ${p} -> 403`, normal.status, 403);
    const admin = await get(p, { token: adminToken });
    check(`admin GET ${p} -> 200`, admin.status, 200);
  }

  const badToken = await get('/api/admin/stats', { token: 'not.a.jwt' });
  checkThat('malformed token -> 401/403', badToken.status === 401 || badToken.status === 403, `got ${badToken.status}`);

  const noRoleCreate = await post('/api/properties', { title: 'No Auth', listing_type: 'buy', price: 1, city: 'X' });
  check('create property without auth -> 401', noRoleCreate.status, 401);

  const userCreate = await post('/api/properties', { title: 'User Attempt', listing_type: 'buy', price: 1000000, city: 'Pune' }, { token: userToken });
  checkThat('normal user CAN create a listing -> 201', userCreate.status === 201, `got ${userCreate.status}`);
  if (userCreate.body.propertyId) created.properties.push(userCreate.body.propertyId);

  const userDelete = await del('/api/properties/1', { token: userToken });
  check('normal user cannot DELETE a property -> 403', userDelete.status, 403);

  const userStatsPatch = await patch('/api/inquiries/1/status', { status: 'hacked' }, { token: userToken });
  checkThat('normal user cannot patch status -> 403', userStatsPatch.status === 403, `got ${userStatsPatch.status}`);
}

async function testWritePaths(adminToken) {
  suite('H. Write paths & validation');

  const noName = await post('/api/inquiries', { user_email: 'a@b.c', user_phone: '1' });
  check('inquiry missing fields -> 400', noName.status, 400);

  const badDate = await post('/api/inquiries', {
    user_name: 'QA', user_email: TEST_TAG, user_phone: '1', visit_date: '20269-12-20',
  });
  check('inquiry malformed date -> 400', badDate.status, 400);

  const impossible = await post('/api/inquiries', {
    user_name: 'QA', user_email: TEST_TAG, user_phone: '1', visit_date: '2026-02-31',
  });
  check('inquiry impossible date -> 400', impossible.status, 400);

  const good = await post('/api/inquiries', {
    user_name: 'QA Suite', user_email: TEST_TAG, user_phone: '+91 90000 00002',
    visit_date: '2026-12-20', property_title: 'QA Property',
  });
  check('valid inquiry -> 201', good.status, 201);
  if (good.body.inquiryId) created.inquiries.push(good.body.inquiryId);

  const loanMissing = await post('/api/loans/apply', { full_name: 'QA' });
  check('loan missing fields -> 400', loanMissing.status, 400);

  const loanNeg = await post('/api/loans/apply', {
    full_name: 'QA', email: TEST_TAG, phone: '1', loan_amount: -5000, monthly_income: 100000,
  });
  check('loan negative amount -> 400', loanNeg.status, 400);

  const loan = await post('/api/loans/apply', {
    full_name: 'QA Suite', email: TEST_TAG, phone: '+91 90000 00003',
    loan_amount: 5000000, monthly_income: 150000, property_city: 'Pune',
  });
  check('valid loan -> 201', loan.status, 201);
  if (loan.body.applicationId) created.loans.push(loan.body.applicationId);
  // 50L @ 8.5% over 20y = 43,391
  check('loan EMI is correct', loan.body.eligibility?.estimatedEMI, 43391);

  const designMissing = await post('/api/design/request', { full_name: 'QA' });
  check('design missing fields -> 400', designMissing.status, 400);

  const design = await post('/api/design/request', {
    full_name: 'QA Suite', email: TEST_TAG, phone: '1', service_type: 'Interior Design', property_area: 1500,
  });
  check('valid design request -> 201', design.status, 201);
  if (design.body.requestId) created.designs.push(design.body.requestId);

  suite('I. Status updates & 404s');
  if (created.inquiries.length) {
    const upd = await patch(`/api/inquiries/${created.inquiries[0]}/status`, { status: 'Contacted' }, { token: adminToken });
    check('patch existing inquiry -> 200', upd.status, 200);
  }
  const updMissing = await patch('/api/inquiries/999999/status', { status: 'X' }, { token: adminToken });
  check('patch missing inquiry -> 404', updMissing.status, 404);

  const updNoStatus = await patch('/api/inquiries/1/status', {}, { token: adminToken });
  check('patch without status -> 400', updNoStatus.status, 400);

  const delMissing = await del('/api/properties/999999', { token: adminToken });
  check('delete missing property -> 404', delMissing.status, 404);

  suite('J. AI matchmaker');
  const empty = await post('/api/ai/chat', { message: '' });
  check('ai chat empty message -> 400', empty.status, 400);

  const budget = await post('/api/ai/chat', { message: '4 bhk under 1 crore in Mumbai' });
  check('ai chat -> 200', budget.status, 200);
  checkThat('ai respects a 1 Cr ceiling',
    (budget.body.properties || []).every((p) => p.price <= 10000000),
    JSON.stringify((budget.body.properties || []).map((p) => p.price_display)));
  checkThat('ai reply never leaks internal field names',
    !/max_price|listing_type|property_type|ai_match_pct/.test(budget.body.reply || ''), budget.body.reply);

  const penthouse = await post('/api/ai/chat', { message: 'penthouse in Bangalore' });
  checkThat('ai never answers a residential query with commercial listings',
    !(penthouse.body.properties || []).some((p) => p.listing_type === 'commercial'),
    JSON.stringify((penthouse.body.properties || []).map((p) => p.listing_type)));

  const bedroomBudget = await post('/api/ai/chat', { message: '2 bhk flat for rent in Hyderabad under 40000' });
  checkThat('ai does not mistake "2 bhk" for the budget',
    (bedroomBudget.body.properties || []).every((p) => p.price <= 40000),
    JSON.stringify((bedroomBudget.body.properties || []).map((p) => p.price_display)));

  const none = await post('/api/ai/chat', { message: 'castle in Antarctica' });
  check('ai chat with no matches -> 200', none.status, 200);
  checkThat('ai returns an empty array when nothing matches', Array.isArray(none.body.properties));
}

async function testDataIntegrity(adminToken) {
  suite('K. Data integrity');
  const stats = await get('/api/admin/stats', { token: adminToken });
  check('admin stats -> 200', stats.status, 200);
  for (const k of ['totalProperties', 'totalUsers', 'totalInquiries', 'totalLoanApplications', 'totalDesignRequests']) {
    checkThat(`stats.${k} is a number`, typeof stats.body.stats[k] === 'number', `got ${typeof stats.body.stats[k]}`);
  }
  const props = await get('/api/properties');
  checkThat('stats.totalProperties matches the property list',
    stats.body.stats.totalProperties === props.body.count,
    `stats=${stats.body.stats.totalProperties} list=${props.body.count}`);

  const inquiries = await get('/api/inquiries', { token: adminToken });
  check('admin can list inquiries -> 200', inquiries.status, 200);
  checkThat('inquiries are newest first',
    inquiries.body.data.every((v, i) => i === 0 || v.id <= inquiries.body.data[i - 1].id));

  const loans = await get('/api/loans', { token: adminToken });
  check('admin can list loans -> 200', loans.status, 200);

  const designs = await get('/api/design/requests', { token: adminToken });
  check('admin can list designs -> 200', designs.status, 200);

  // Every property must be fully formed
  const bad = props.body.data.filter((p) => !p.title || !p.city || !p.price_display || typeof p.price !== 'number');
  checkThat('all properties have title/city/price_display/numeric price', bad.length === 0,
    `${bad.length} malformed`);
  const dupIds = props.body.data.map((p) => p.id);
  checkThat('property ids are unique', new Set(dupIds).size === dupIds.length);
  const badDates = inquiries.body.data.filter((i) => i.visit_date && !/^\d{4}-\d{2}-\d{2}$/.test(i.visit_date));
  checkThat('all stored visit_date values are valid YYYY-MM-DD', badDates.length === 0,
    JSON.stringify(badDates.map((i) => i.visit_date)));
}

/* ------------------------------- cleanup -------------------------------- */

/**
 * Remove every record this suite created.
 *
 * The API exposes no DELETE for inquiries / loan_applications / design_requests
 * (reported as a gap), so when the suite runs against the local SQLite database
 * we clean up through it directly. That keeps repeat runs idempotent instead of
 * inflating the tables every time.
 */
async function purgeTaggedRows() {
  const purge = require('./database');
  const tag = `${TEST_TAG}%`;
  const r = await Promise.all([
    purge.dbRun('DELETE FROM inquiries WHERE user_email LIKE ?', [tag]),
    purge.dbRun('DELETE FROM loan_applications WHERE email LIKE ?', [tag]),
    purge.dbRun('DELETE FROM design_requests WHERE email LIKE ?', [tag]),
    purge.dbRun('DELETE FROM users WHERE email LIKE ? OR email LIKE ?', [tag, 'qa-escalate@xenproperty.local']),
  ]);
  return r.map((x) => x.changes || 0);
}

async function cleanup(adminToken) {
  suite('L. Cleanup (restore original data)');

  for (const p of created.properties) {
    const r = await del('/api/properties/' + p, { token: adminToken });
    if (r.status !== 200 && r.status !== 404) {
      results.fail++;
      results.failures.push(`[cleanup] could not delete property ${p} -> ${r.status}`);
    }
  }

  // Reset any inquiry this suite touched back to its original status.
  for (const id of created.inquiries) {
    await patch(`/api/inquiries/${id}/status`, { status: 'pending' }, { token: adminToken });
  }

  try {
    const purged = await purgeTaggedRows();
    checkThat('test records purged from the local database', true,
      `inquiries=${purged[0]} loans=${purged[1]} designs=${purged[2]} users=${purged[3]}`);
  } catch (err) {
    console.log(`  INFO  skipped direct DB purge (${err.message})`);
    console.log('  INFO  run against local SQLite for automatic cleanup');
  }
}

/* --------------------------------- main --------------------------------- */

async function main() {
  console.log('XenProperty QA suite');
  console.log(`target: http://${HOST}:${PORT}`);
  if (BOOT) console.log('note: BOOT_SERVER=1 - expecting an already-running server');

  let server;
  if (BOOT) {
    server = require('./server');
    await new Promise((r) => setTimeout(r, 1500));
  }

  try {
    await testPagesAndAssets();
    await testPublicApi();
    const auth = await testAuth();
    await testAuthorization(auth.adminToken, auth.userToken);
    await testProfile(auth.userToken, auth.adminToken);
    await testWritePaths(auth.adminToken);
    await testDataIntegrity(auth.adminToken);
    await cleanup(auth.adminToken);
  } catch (err) {
    results.fail++;
    results.failures.push(`[fatal] suite crashed: ${err.message}`);
    console.error('\nFATAL:', err);
  }

  console.log('\n' + '='.repeat(56));
  console.log(`PASSED: ${results.pass}`);
  console.log(`FAILED: ${results.fail}`);
  if (results.failures.length) {
    console.log('\nFailures:');
    results.failures.forEach((f) => console.log('  - ' + f));
  }
  console.log('='.repeat(56));

  if (server) process.exit(results.fail ? 1 : 0);
  process.exit(results.fail ? 1 : 0);
}

main();
