/**
 * Demo backend - runs entirely in the browser.
 *
 * Used automatically when the real API is unreachable (for example on a
 * static-only Firebase Hosting deploy, where /api/* returns 404). It serves a
 * read-only snapshot of the database from data/seed.json and keeps anything
 * the visitor creates in localStorage, so login, registration, bookings, loan
 * applications and the admin portal all work end to end with no server.
 *
 * THIS IS A DEMO. Data lives only in the visitor's own browser - nothing is
 * shared between visitors and nothing is persisted on a server. api.js falls
 * back to the real Express/Firestore API automatically as soon as it responds.
 */
(function () {
  const SEED_URL = 'data/seed.json';
  const K_SEED = 'xen_demo_seed';
  const K_SESSION = 'xen_token';
  const K_USER = 'xen_user';
  const K_STORE = 'xen_demo_store';

  let seedPromise = null;
  let store = null;

  // Demo passwords for the seeded accounts. Deliberately not the production
  // hashes - these accounts only exist inside the browser snapshot.
  const DEMO_PASSWORDS = {
    'admin@xenproperty.com': 'admin123',
    'rahul@xenproperty.com': 'user123',
    'gkallu565@gmail.com': 'user123',
  };

  /**
   * Obfuscated credential check for accounts created inside the demo.
   * NOT security - it only exists so a visitor who registers can log back in
   * during the same demo session. The real backend uses bcrypt server-side.
   */
  const K_CREDS = 'xen_demo_creds';
  const demoHash = (pw) => {
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    for (let i = 0; i < pw.length; i++) {
      const c = pw.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 + c, 2654435761) >>> 0;
    }
    return h1.toString(36) + '.' + h2.toString(36) + '.' + pw.length;
  };

  function readCreds() {
    try { return JSON.parse(localStorage.getItem(K_CREDS) || '{}'); } catch (e) { return {}; }
  }

  function saveCred(email, pw) {
    try {
      const all_creds = readCreds();
      all_creds[email] = demoHash(pw);
      localStorage.setItem(K_CREDS, JSON.stringify(all_creds));
    } catch (e) { /* ignore */ }
  }

  function verifyCred(email, pw) {
    const stored = readCreds()[email];
    return !!stored && stored === demoHash(pw);
  }

  function loadSeed() {
    if (seedPromise) return seedPromise;
    seedPromise = fetch(SEED_URL)
      .then((r) => {
        if (!r.ok) throw new Error('Demo data file is missing.');
        return r.json();
      })
      .then((data) => {
        // `base` is the read-only snapshot and is NEVER persisted - it is
        // re-read from seed.json on every page load. `added` holds only what
        // this visitor created, and that is the only thing we save. (An
        // earlier version persisted the merged lists, which duplicated every
        // record once per page load.)
        store = {
          base: {
            users: (data.demoUsers || []).map((u) => ({ ...u })),
            properties: (data.properties || []).map((p) => ({ ...p })),
            inquiries: (data.inquiries || []).map((i) => ({ ...i })),
            loans: (data.loanApplications || []).map((l) => ({ ...l })),
            designs: (data.designRequests || []).map((d) => ({ ...d })),
          },
          added: { users: [], properties: [], inquiries: [], loans: [], designs: [] },
          removedPropertyIds: [],
          userOverrides: {},
          nextUserId: Math.max(0, ...(data.demoUsers || []).map((u) => u.id)) + 1,
        };
        restore();
        return store;
      });
    return seedPromise;
  }

  const persist = () => {
    try {
      localStorage.setItem(K_STORE, JSON.stringify({
        added: store.added,
        removedPropertyIds: store.removedPropertyIds,
        userOverrides: store.userOverrides,
        nextUserId: store.nextUserId,
      }));
    } catch (e) { /* quota - demo still works in-memory */ }
  };

  /** Re-apply the visitor's own records saved in earlier sessions. */
  function restore() {
    try {
      const raw = localStorage.getItem(K_STORE);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || !saved.added) return;
      Object.keys(store.added).forEach((k) => {
        if (Array.isArray(saved.added[k])) store.added[k] = saved.added[k];
      });
      if (Array.isArray(saved.removedPropertyIds)) store.removedPropertyIds = saved.removedPropertyIds;
      if (saved.userOverrides && typeof saved.userOverrides === 'object') {
        store.userOverrides = saved.userOverrides;
      }
      if (saved.nextUserId) store.nextUserId = Math.max(store.nextUserId, saved.nextUserId);
    } catch (e) { /* ignore malformed demo state */ }
  }

  async function ready() {
    return loadSeed();
  }

  /* --------------------------- merged views ------------------------------ */

  /**
   * Seeded users are re-read from seed.json on every page load and never
   * persisted, so an edit to one has to be replayed as an overlay. Always
   * returns a fresh object so callers cannot accidentally mutate the snapshot.
   */
  const applyUserOverrides = (u) => ({ ...u, ...(store.userOverrides[u.email] || {}) });

  const all = (key) => {
    const rows = store.base[key].concat(store.added[key]);
    return key === 'users' ? rows.map(applyUserOverrides) : rows;
  };

  const allProperties = () =>
    store.base.properties
      .filter((p) => !store.removedPropertyIds.includes(Number(p.id)))
      .concat(store.added.properties);

  const nextId = (key) =>
    all(key).reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;

  /** Find a record across both base and visitor-created lists. */
  const find = (key, id) =>
    all(key).find((r) => Number(r.id) === Number(id));

  function currentUser() {
    try { return JSON.parse(localStorage.getItem(K_USER) || 'null'); } catch (e) { return null; }
  }

  const isAdmin = () => {
    const u = currentUser();
    return !!u && u.role === 'admin';
  };

  const requireUser = () => {
    const u = currentUser();
    if (!u) throw new Error('Authentication required');
    return u;
  };

  const requireAdmin = () => {
    requireUser();
    if (!isAdmin()) throw new Error('Administrator privileges required');
  };

  const clone = (v) => JSON.parse(JSON.stringify(v));

  const demoApi = {
    isDemo: true,

    async init() { await ready(); return true; },

    /* ------------------------------- auth -------------------------------- */
    async login(email, password) {
      await ready();
      const user = all('users').find((u) => u.email === String(email).toLowerCase().trim());
      if (!user) throw new Error('Invalid email or password.');
      const expected = DEMO_PASSWORDS[user.email];
      const ok = expected ? password === expected : verifyCred(user.email, password);
      if (!ok) throw new Error('Invalid email or password.');
      const payload = { id: user.id, full_name: user.full_name, email: user.email, role: user.role };
      localStorage.setItem(K_SESSION, 'demo-' + btoa(user.email + ':' + Date.now()));
      localStorage.setItem(K_USER, JSON.stringify(payload));
      return { success: true, message: 'Logged in successfully!', token: localStorage.getItem(K_SESSION), user: payload };
    },

    async register(data) {
      await ready();
      const email = String(data.email || '').toLowerCase().trim();
      if (all('users').some((u) => u.email === email)) {
        throw new Error('An account with this email already exists.');
      }
      const user = {
        id: store.nextUserId++,
        full_name: String(data.full_name || '').trim(),
        email,
        phone: data.phone || '',
        role: data.role === 'agent' ? 'agent' : 'user',
      };
      store.added.users.push(user);
      saveCred(email, data.password);
      persist();
      const payload = { id: user.id, full_name: user.full_name, email: user.email, role: user.role };
      localStorage.setItem(K_SESSION, 'demo-' + btoa(email + ':' + Date.now()));
      localStorage.setItem(K_USER, JSON.stringify(payload));
      return { success: true, message: 'Registration successful!', token: localStorage.getItem(K_SESSION), user: payload };
    },

    async getMe() {
      const u = requireUser();
      const full = await ready().then(() => all('users').find((x) => x.id === u.id));
      if (!full) throw new Error('User not found');
      return { success: true, user: clone(full) };
    },

    /** Edit the signed-in user's own name and phone - mirrors PATCH /api/auth/me. */
    async updateMe(details) {
      const session = requireUser();
      await ready();
      const full = all('users').find((x) => x.id === session.id);
      if (!full) throw new Error('User not found');

      const { full_name, phone } = details || {};
      if (full_name === undefined && phone === undefined) {
        throw new Error('There is nothing to update.');
      }

      const patch = {};

      if (full_name !== undefined) {
        const name = String(full_name).trim();
        if (name.length < 2 || name.length > 80) {
          throw new Error('Your name must be between 2 and 80 characters.');
        }
        patch.full_name = name;
      }

      if (phone !== undefined) {
        const value = String(phone).trim();
        if (value !== '') {
          const digits = value.replace(/\D/g, '');
          if (digits.length < 7 || digits.length > 15) {
            throw new Error('Please enter a valid phone number (7 to 15 digits).');
          }
        }
        patch.phone = value;
      }

      // Record as an overlay so the edit survives a reload (seeded users are
      // re-read from seed.json each time; accounts created here live in `added`).
      const inSeed = store.base.users.some((x) => x.email === full.email);
      if (inSeed) {
        store.userOverrides[full.email] = { ...(store.userOverrides[full.email] || {}), ...patch };
      } else {
        Object.assign(full, patch);
      }
      persist();

      // Keep the session copy in step so the navbar shows the new name.
      const updated = { ...full, ...patch };
      localStorage.setItem(K_USER, JSON.stringify({
        ...currentUser(),
        full_name: updated.full_name,
      }));

      return { success: true, message: 'Profile updated successfully.', user: clone(updated) };
    },

    /** Profile page data - mirrors GET /api/me/dashboard. */
    async getMyDashboard() {
      const session = requireUser();
      await ready();
      const user = all('users').find((x) => x.id === session.id);
      if (!user) throw new Error('User not found');

      const email = String(user.email).toLowerCase();
      const mine = (rows) => rows
        .filter((r) => String(r.email || r.user_email || '').toLowerCase() === email)
        .sort((a, b) => b.id - a.id);

      return {
        success: true,
        user: clone(user),
        listings: clone(allProperties().filter((p) => Number(p.user_id) === Number(user.id))),
        inquiries: clone(mine(all('inquiries'))),
        loans: clone(mine(all('loans'))),
        designs: clone(mine(all('designs'))),
      };
    },

    logout() {
      localStorage.removeItem(K_SESSION);
      localStorage.removeItem(K_USER);
    },

    /** Wipe everything this visitor created (demo reset). */
    resetDemoData() {
      [K_STORE, K_CREDS, K_SESSION, K_USER].forEach((k) => localStorage.removeItem(k));
      seedPromise = null;
      store = null;
      backend = null;
      probePromise = null;
      mode = 'unknown';
    },

    /* ---------------------------- properties ----------------------------- */
    async getProperties(params = {}) {
      await ready();
      const rows = window.xenFilterProperties(allProperties(), params || {});
      return { success: true, count: rows.length, data: clone(rows) };
    },

    async getFeaturedProperties() {
      await ready();
      const rows = allProperties().filter((p) => p.is_featured).sort((a, b) => a.id - b.id).slice(0, 6);
      return { success: true, data: clone(rows) };
    },

    async getPropertyById(id) {
      await ready();
      const p = allProperties().find((x) => Number(x.id) === Number(id));
      if (!p) throw new Error('Property not found.');
      return { success: true, data: clone(p) };
    },

    async createProperty(formData) {
      requireUser();
      await ready();
      const get = (k) => (typeof FormData !== 'undefined' && formData instanceof FormData)
        ? formData.get(k) : formData[k];

      const price = Number(get('price')) || 0;
      const listingType = String(get('listing_type') || 'buy').toLowerCase();
      let priceDisplay;
      if (listingType === 'rent') priceDisplay = `₹${price.toLocaleString('en-IN')} / month`;
      else if (price >= 10000000) priceDisplay = `₹${(price / 10000000).toFixed(2)} Cr`;
      else priceDisplay = `₹${(price / 100000).toFixed(2)} Lakh`;

      const amenityRaw = get('amenities') || '';
      const amenities = Array.isArray(amenityRaw)
        ? amenityRaw
        : String(amenityRaw).split(',').map((s) => s.trim()).filter(Boolean);

      let imageUrl = get('image_url') || '';
      const imageFile = get('image');
      // The demo backend has no Storage bucket, so keep an uploaded photo
      // usable in the browser by converting it to a local data URL.
      if (!imageUrl && imageFile && imageFile.size && typeof FileReader !== 'undefined') {
        imageUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => resolve('');
          reader.readAsDataURL(imageFile);
        });
      }
      imageUrl = imageUrl ||
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80';

      const prop = {
        id: nextId('properties'),
        user_id: currentUser().id,
        title: String(get('title') || '').trim(),
        listing_type: listingType,
        property_type: get('property_type') || 'Apartment',
        price,
        price_display: priceDisplay,
        city: String(get('city') || '').trim(),
        state: get('state') || 'India',
        address: get('address') || get('city'),
        pincode: String(get('pincode') || '').trim(),
        beds: Number(get('beds')) || 0,
        baths: Number(get('baths')) || 0,
        area_sqft: Number(get('area_sqft')) || 1000,
        image_url: imageUrl,
        additional_images: [imageUrl],
        ai_match_pct: 92,
        location_score: 9.1,
        lifestyle_score: 91,
        description: get('description') || '',
        amenities,
        furnishing: get('furnishing') || 'Semi-Furnished',
        is_verified: 1,
        is_featured: 0,
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };
      store.added.properties.push(prop);
      persist();
      return { success: true, message: 'Property listed successfully!', propertyId: prop.id };
    },

    async deleteProperty(id) {
      requireAdmin();
      await ready();
      const p = allProperties().find((x) => Number(x.id) === Number(id));
      if (!p) throw new Error('Property not found.');
      const inBase = store.base.properties.indexOf(p);
      if (inBase !== -1) {
        store.removedPropertyIds.push(Number(p.id));
      } else {
        store.added.properties.splice(store.added.properties.indexOf(p), 1);
      }
      persist();
      return { success: true, message: 'Property deleted successfully.' };
    },

    /* ------------------------------- AI ---------------------------------- */
    async askAI(message) {
      await ready();
      const res = window.xenMatch(message, allProperties());
      return { success: true, reply: res.reply, properties: clone(res.properties), relaxed: res.relaxed };
    },

    /* ---------------------------- inquiries ------------------------------ */
    async submitInquiry(data) {
      await ready();
      const visitDate = data.visit_date && /^\d{4}-\d{2}-\d{2}$/.test(data.visit_date) ? data.visit_date : null;
      const rec = {
        id: nextId('inquiries'),
        property_id: data.property_id || null,
        property_title: data.property_title || 'General Inquiry',
        user_name: String(data.user_name || '').trim(),
        user_email: String(data.user_email || '').trim(),
        user_phone: String(data.user_phone || '').trim(),
        visit_date: visitDate,
        visit_time: data.visit_time || null,
        visit_type: data.visit_type || 'in_person',
        message: data.message || '',
        status: 'pending',
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };
      store.added.inquiries.push(rec);
      persist();
      return { success: true, message: 'Your inquiry and visit request have been scheduled!', inquiryId: rec.id };
    },

    async getInquiries() {
      requireAdmin();
      await ready();
      return { success: true, data: clone(all('inquiries')).sort((a, b) => b.id - a.id) };
    },

    async updateInquiryStatus(id, status) {
      requireAdmin();
      await ready();
      const rec = find('inquiries', id);
      if (!rec) throw new Error('Inquiry not found.');
      rec.status = status;
      persist();
      return { success: true, message: 'Inquiry status updated successfully.' };
    },

    /* ------------------------------ loans -------------------------------- */
    async applyLoan(data) {
      await ready();
      const amount = Number(data.loan_amount) || 0;
      const income = Number(data.monthly_income) || 0;
      const rec = {
        id: nextId('loans'),
        full_name: String(data.full_name || '').trim(),
        email: String(data.email || '').trim(),
        phone: String(data.phone || '').trim(),
        loan_amount: amount,
        monthly_income: income,
        property_city: data.property_city || 'Not Specified',
        employment_type: data.employment_type || 'Salaried',
        bank_preference: data.bank_preference || 'HDFC Bank',
        status: 'Under Review',
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };
      store.added.loans.push(rec);
      persist();
      const monthlyRate = 0.085 / 12;
      const pow = Math.pow(1 + monthlyRate, 240);
      return {
        success: true,
        message: 'Loan application submitted successfully!',
        applicationId: rec.id,
        eligibility: {
          isPreApproved: amount <= income * 60,
          maxEligibleAmount: income * 60,
          estimatedEMI: Math.round((amount * monthlyRate * pow) / (pow - 1)),
        },
      };
    },

    async getLoans() {
      requireAdmin();
      await ready();
      return { success: true, data: clone(all('loans')).sort((a, b) => b.id - a.id) };
    },

    async updateLoanStatus(id, status) {
      requireAdmin();
      await ready();
      const rec = find('loans', id);
      if (!rec) throw new Error('Loan application not found.');
      rec.status = status;
      persist();
      return { success: true, message: 'Loan application status updated successfully.' };
    },

    /* ------------------------------ design ------------------------------- */
    async requestDesign(data) {
      await ready();
      const rec = {
        id: nextId('designs'),
        full_name: String(data.full_name || '').trim(),
        email: String(data.email || '').trim(),
        phone: String(data.phone || '').trim(),
        service_type: data.service_type,
        property_area: data.property_area ? Number(data.property_area) : null,
        budget_range: data.budget_range || 'Moderate',
        message: data.message || '',
        status: 'pending',
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };
      store.added.designs.push(rec);
      persist();
      return { success: true, message: 'Design consultation scheduled!', requestId: rec.id };
    },

    async getDesignRequests() {
      requireAdmin();
      await ready();
      return { success: true, data: clone(all('designs')).sort((a, b) => b.id - a.id) };
    },

    async updateDesignStatus(id, status) {
      requireAdmin();
      await ready();
      const rec = find('designs', id);
      if (!rec) throw new Error('Design request not found.');
      rec.status = status;
      persist();
      return { success: true, message: 'Design request status updated successfully.' };
    },

    /* ------------------------------- admin ------------------------------- */
    async getAdminStats() {
      requireAdmin();
      await ready();
      return {
        success: true,
        stats: {
          totalProperties: allProperties().length,
          totalUsers: all('users').length,
          totalInquiries: all('inquiries').length,
          totalLoanApplications: all('loans').length,
          totalDesignRequests: all('designs').length,
        },
      };
    },
  };

  window.xenDemoApi = demoApi;
})();
