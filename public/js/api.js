const API_BASE = '/api';

/**
 * Backend selection.
 *
 * We try the real Express/Firestore API first. If it is unreachable - for
 * example on a static-only Firebase Hosting deploy where /api/* 404s because
 * Cloud Functions need the Blaze plan - we transparently fall back to the
 * in-browser demo backend (js/demo-store.js) so every feature still works.
 *
 * As soon as the real API responds again, it is used automatically.
 */
let backend = null;      // active backend object
let mode = 'unknown';    // 'live' | 'demo'
let probePromise = null;

function isDemoBackend(b) { return !!(b && b.isDemo); }

async function probeBackend() {
  let res = null;
  try {
    res = await fetch(`${API_BASE}/properties?limit=1`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch (e) {
    res = null; // network failure - fall through to the demo backend
  }

  if (res) {
    const type = res.headers.get('content-type') || '';
    if (res.ok && type.includes('application/json')) {
      mode = 'live';
      backend = api;   // the live HTTP backend is this very object
      return backend;
    }
  }

  if (window.xenDemoApi) {
    await window.xenDemoApi.init();
    mode = 'demo';
    backend = window.xenDemoApi;
    // Let the UI tell the visitor they are looking at demo data.
    try {
      window.dispatchEvent(new CustomEvent('xen:backend', { detail: { mode: 'demo' } }));
    } catch (e) { /* older browser */ }
    return backend;
  }

  // No demo backend available either - use the real API and let it report.
  mode = 'live';
  backend = api;
  return backend;
}

function getBackend() {
  if (backend) return Promise.resolve(backend);
  if (!probePromise) probePromise = probeBackend();
  return probePromise;
}

/** Current mode: 'live', 'demo', or 'unknown' before the first call. */
function apiMode() { return mode; }

const api = {
  get mode() { return mode; },

  getToken() {
    return localStorage.getItem('xen_token');
  },

  setToken(token) {
    localStorage.setItem('xen_token', token);
  },

  removeToken() {
    localStorage.removeItem('xen_token');
    localStorage.removeItem('xen_user');
    if (isDemoBackend(backend)) backend.logout();
  },

  getCurrentUser() {
    try {
      const user = localStorage.getItem('xen_user');
      return user ? JSON.parse(user) : null;
    } catch (e) {
      return null;
    }
  },

  setCurrentUser(user) {
    localStorage.setItem('xen_user', JSON.stringify(user));
  },

  /** Low-level HTTP call against the real API. */
  async request(endpoint, options = {}) {
    const headers = options.headers || {};
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    let response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });
    } catch (netErr) {
      throw new Error('Cannot reach the server. Please check your connection and try again.');
    }

    // A dead backend (or a static-only deploy) returns HTML, not JSON, and
    // response.json() would throw a cryptic "Unexpected token '<'" that told
    // the user nothing. Detect that case and explain it properly.
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      if (response.status === 404) {
        throw new Error('Login service is unavailable right now. Please try again later.');
      }
      throw new Error(`Unexpected server response (${response.status}). Please try again.`);
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Something went wrong');
    }
    return data;
  },

  // Properties
  async getProperties(params = {}) {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.getProperties(params);
    const query = new URLSearchParams();
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        query.append(key, params[key]);
      }
    });
    return this.request(`/properties?${query.toString()}`);
  },

  async getFeaturedProperties() {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.getFeaturedProperties();
    return this.request('/properties/featured');
  },

  async getPropertyById(id) {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.getPropertyById(id);
    return this.request(`/properties/${id}`);
  },

  async createProperty(formData) {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.createProperty(formData);
    return this.request('/properties', {
      method: 'POST',
      body: formData
    });
  },

  async deleteProperty(id) {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.deleteProperty(id);
    return this.request(`/properties/${id}`, {
      method: 'DELETE'
    });
  },

  // AI Chat & Matchmaker
  async askAI(message) {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.askAI(message);
    return this.request('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message })
    });
  },

  // Inquiries & Site Visits
  async submitInquiry(data) {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.submitInquiry(data);
    return this.request('/inquiries', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async getInquiries() {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.getInquiries();
    return this.request('/inquiries');
  },

  async updateInquiryStatus(id, status) {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.updateInquiryStatus(id, status);
    return this.request(`/inquiries/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  },

  // Home Loans
  async applyLoan(data) {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.applyLoan(data);
    return this.request('/loans/apply', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async getLoans() {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.getLoans();
    return this.request('/loans');
  },

  async updateLoanStatus(id, status) {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.updateLoanStatus(id, status);
    return this.request(`/loans/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  },

  // Design Studio
  async requestDesign(data) {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.requestDesign(data);
    return this.request('/design/request', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async getDesignRequests() {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.getDesignRequests();
    return this.request('/design/requests');
  },

  async updateDesignStatus(id, status) {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.updateDesignStatus(id, status);
    return this.request(`/design/requests/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  },

  // Auth
  async login(email, password) {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.login(email, password);
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (data.token) {
      this.setToken(data.token);
      this.setCurrentUser(data.user);
    }
    return data;
  },

  async register(userData) {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.register(userData);
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    if (data.token) {
      this.setToken(data.token);
      this.setCurrentUser(data.user);
    }
    return data;
  },

  async getMe() {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.getMe();
    return this.request('/auth/me');
  },

  /** Update the signed-in user's own editable details (name, phone). */
  async updateMe(details) {
    const b = await getBackend();
    const data = isDemoBackend(b)
      ? await b.updateMe(details)
      : await this.request('/auth/me', {
          method: 'PATCH',
          body: JSON.stringify(details)
        });

    // Keep the cached session user in step so the navbar name stays correct.
    if (data && data.user) this.setCurrentUser(data.user);
    return data;
  },

  /** The signed-in user's profile page data: details, listings, visits, loans, designs. */
  async getMyDashboard() {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.getMyDashboard();
    return this.request('/me/dashboard');
  },

  // Admin
  async getAdminStats() {
    const b = await getBackend();
    if (isDemoBackend(b)) return b.getAdminStats();
    return this.request('/admin/stats');
  },
};


window.api = api;
