// Global UI & Session Controller
document.addEventListener('DOMContentLoaded', () => {
  initAuthUI();
  initGlobalModals();
  initMobileMenu();
  xenFavorites.init();
  xenComparison.init();
  initFloatingAI();
  initSearchAutocomplete();
  initDemoModeNotice();
});

/**
 * Guard a page that needs an account.
 *
 * Signed in, go straight through. Signed out, bounce to the login page with
 * ?redirect set so the visitor lands back here afterwards. That page carries
 * both a login and a register tab, so one entry point covers both.
 */
function requireAuth(target = 'sell.html') {
  if (api.getCurrentUser() && api.getToken()) {
    window.location.href = target;
    return true;
  }
  window.location.href = `login.html?redirect=${encodeURIComponent(target)}`;
  return false;
}

/** The navbar's "List Property" button, gated behind an account. */
function goListProperty(event) {
  if (event) event.preventDefault();
  return requireAuth('sell.html');
}

// Sync authentication state with navbar.
//
// The navbar deliberately carries no Login / Sign Up / Logout controls. One
// entry point - "List Property" - sends signed-out visitors to the login page,
// and once signed in their name takes their place; clicking it opens the
// profile, which is where logging out lives.
function initAuthUI() {
  const user = api.getCurrentUser();
  const authContainer = document.getElementById('navbarAuthArea');
  if (!authContainer) return;

  const favBtnHtml = `
    <button onclick="xenFavorites.openDrawer()" class="btn-nav-favorites" title="View Saved Properties">
      <i class="fa-solid fa-heart" style="color:#ef4444;"></i>
      <span class="nav-fav-text">Saved</span>
      <span class="fav-count-badge" id="navFavBadge">0</span>
    </button>
  `;

  const listBtnHtml = `
    <a href="sell.html" class="btn-list-prop" onclick="goListProperty(event)">
      <i class="fa-solid fa-plus"></i> List Property
    </a>
  `;

  if (user) {
    // A record with no name must not throw - fall back to a neutral label.
    const firstName = String(user.full_name || '').split(' ')[0] || 'Profile';
    authContainer.innerHTML = `
      ${favBtnHtml}
      <a href="profile.html" class="user-badge-nav" title="View my full profile"
         aria-label="View my full profile">
        <i class="fa-solid fa-user-circle"></i>
        <span>${escapeHtml(firstName)}</span>
      </a>
      ${user.role === 'admin'
        ? '<a href="admin.html" class="user-badge-admin"><i class="fa-solid fa-shield"></i> Admin</a>'
        : ''}
      ${listBtnHtml}
    `;
  } else {
    authContainer.innerHTML = `
      ${favBtnHtml}
      ${listBtnHtml}
    `;
  }
  xenFavorites.updateBadge();
}

function handleLogout() {
  api.removeToken();
  showToast('Logged out successfully', 'success');
  // Go home rather than reloading: reloading the profile would just show the
  // visitor the sign-in prompt they have already dismissed.
  setTimeout(() => {
    window.location.href = 'index.html';
  }, 700);
}

// Show a toast centred on the screen. Used for auth failures so the message
// cannot be missed behind the floating AI widget.
function showAuthError(message) {
  showToast(message, 'error');

  let banner = document.getElementById('authErrorBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'authErrorBanner';
    banner.setAttribute('role', 'alert');
    document.body.appendChild(banner);
  }
  banner.textContent = message;
  banner.style.cssText = `
    position: fixed; inset: 0; z-index: 100001;
    display: flex; align-items: center; justify-content: center;
    padding: 24px; background: rgba(11, 18, 32, 0.55);
    backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background: #ffffff; border-left: 5px solid #ef4444; border-radius: 14px;
    padding: 22px 26px; max-width: 420px; width: 100%;
    box-shadow: 0 24px 60px rgba(0,0,0,0.3); text-align: center;
  `;
  card.innerHTML = `
    <div style="font-size:2.2rem;line-height:1;margin-bottom:10px;">&#9888;&#65039;</div>
    <div style="font-size:1.05rem;font-weight:800;color:#111827;margin-bottom:8px;">Could not continue</div>
    <div style="font-size:0.9rem;color:#4b5563;line-height:1.55;margin-bottom:18px;"></div>
    <button type="button" style="background:#0f5b46;color:#fff;border:0;padding:11px 26px;border-radius:999px;font-weight:700;font-size:0.9rem;cursor:pointer;">Close</button>
  `;
  card.querySelector('div:nth-child(3)').textContent = message;
  card.querySelector('button').addEventListener('click', () => banner.remove());
  card.addEventListener('click', (e) => { if (e.target === card) banner.remove(); });
  banner.appendChild(card);
  document.body.appendChild(banner);
}

// Demo-mode notice.
//
// When the real API is not reachable (a static-only Firebase Hosting deploy),
// api.js falls back to an in-browser demo backend. Tell the visitor plainly
// rather than letting them assume the data is live.
function initDemoModeNotice() {
  const show = () => {
    if (document.getElementById('demoModeBadge')) return;
    const badge = document.createElement('div');
    badge.id = 'demoModeBadge';
    badge.title = 'The live API is unavailable, so XenProperty is running on in-browser demo data. Anything you create stays in this browser.';
    badge.innerHTML = '<i class="fa-solid fa-flask"></i> Demo data';
    badge.style.cssText = `
      position: fixed; left: 50%; transform: translateX(-50%);
      bottom: 12px; z-index: 100002;
      background: #1f2937; color: #fcd34d; border: 1px solid #f59e0b;
      padding: 7px 16px; border-radius: 999px; font-size: 0.74rem; font-weight: 800;
      letter-spacing: 0.3px; display: inline-flex; align-items: center; gap: 7px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25); cursor: help;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    document.body.appendChild(badge);
    setTimeout(() => {
      if (typeof showToast === 'function') {
        showToast('Demo mode: the live API is offline, so data is loaded in your browser. Anything you create stays here.', 'info');
      }
    }, 1200);
  };

  window.addEventListener('xen:backend', (e) => {
    if (e.detail && e.detail.mode === 'demo') show();
  });

  // The backend may already have been resolved before this ran.
  if (typeof api !== 'undefined' && api.mode === 'demo') show();
}

// Global Toast Notifications
function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

  const isError = type === 'error' || type === 'info';
  const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  // Errors stay longer - they are the only feedback the user gets.
  const life = isError ? 7000 : 4000;
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, life);
}

// Modal handling
function initGlobalModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal.id);
      }
    });
  });

  // Global search keyboard shortcut (Cmd+K or Ctrl+K)
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.getElementById('globalSearchInput');
      if (searchInput) searchInput.focus();
    }
  });

  const searchInput = document.getElementById('globalSearchInput');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = searchInput.value.trim();
        if (val) {
          window.location.href = `buy.html?search=${encodeURIComponent(val)}`;
        }
      }
    });
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Collapsed navigation (see the responsive breakpoints in base.css).
function initMobileMenu() {
  const toggleBtn = document.getElementById('mobileMenuToggle');
  const navLinks = document.querySelector('.nav-links');
  const authArea = document.getElementById('navbarAuthArea');
  if (!toggleBtn || !navLinks) return;

  // Wrap the nav links and the auth/action cluster in a single panel so that on
  // phones BOTH collapse behind the hamburger. On wider screens the wrapper is
  // `display: contents`, so the desktop layout is completely unaffected.
  let panel = document.querySelector('.nav-mobile-panel');
  if (!panel && navLinks.parentElement) {
    panel = document.createElement('div');
    panel.className = 'nav-mobile-panel';
    navLinks.parentElement.insertBefore(panel, navLinks);
    panel.appendChild(navLinks);
    if (authArea) panel.appendChild(authArea);
  }
  if (!panel) return;

  const close = () => {
    panel.classList.remove('open');
    navLinks.classList.remove('open');
    toggleBtn.setAttribute('aria-expanded', 'false');
  };

  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = panel.classList.toggle('open');
    navLinks.classList.toggle('open', open);
    toggleBtn.setAttribute('aria-expanded', String(open));
  });

  // Close when clicking elsewhere, navigating, or resizing back to desktop.
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !toggleBtn.contains(e.target)) close();
  });

  panel.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 1180) close();
  });
}

// Property Details Modal Opener
async function viewPropertyDetails(id) {
  try {
    let p = null;
    try {
      const res = await api.getPropertyById(id);
      if (res && res.data) p = res.data;
    } catch (e) {
      p = null;
    }
    if (!p) {
      const fav = xenFavorites.items.find(item => Number(item.id) === Number(id));
      if (fav) {
        p = {
          id: fav.id,
          title: fav.title,
          price: fav.price || 14999,
          price_display: fav.price_display,
          city: fav.city || 'India',
          address: fav.address || 'Turnkey Architectural Blueprint',
          image_url: fav.image_url,
          beds: fav.beds || 3,
          baths: fav.baths || 3,
          area_sqft: fav.area_sqft || 1500,
          property_type: fav.listing_type || 'House Plan',
          ai_match_pct: 98,
          location_score: 9.5,
          description: 'Official pre-engineered architectural house blueprint with complete CAD drawings, 3D model, and structural layouts.',
          amenities: ['100% Vastu Compliant', 'Full CAD Files', 'Structural Calculations', 'Turnkey Construction Ready'],
          status: 'available'
        };
      }
    }
    if (!p) return;

    let modal = document.getElementById('propertyDetailModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'propertyDetailModal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-card" style="max-width:760px; padding:24px; max-height:90vh; overflow-y:auto;">
          <button class="modal-close-btn" onclick="closeModal('propertyDetailModal')">&times;</button>
          <div id="propDetailContent"></div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal('propertyDetailModal'); });
    }

    // EMI Calculation for Modal
    const loanPrincipal = Math.round(Number(p.price) * 0.8);
    const r = 8.5 / 12 / 100;
    const n = 20 * 12;
    const initialEmi = Math.round((loanPrincipal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
    const isFav = xenFavorites.isFavorite(p.id);
    const isComp = xenComparison.isInCompare(p.id);

    const content = document.getElementById('propDetailContent');
    content.innerHTML = `
      <div style="border-radius:14px; overflow:hidden; margin-bottom:16px; height:280px; position:relative;">
        <img src="${escapeHtml(p.image_url)}" style="width:100%; height:100%; object-fit:cover;" alt="${escapeHtml(p.title)}">
        <span class="badge-verified" style="position:absolute; top:14px; left:14px;">
          <i class="fa-solid fa-circle-check"></i> Verified Listing
        </span>
        <div style="position:absolute; bottom:14px; right:14px; background:rgba(15,91,70,0.92); color:#fff; padding:6px 14px; border-radius:999px; font-weight:800; font-size:1.1rem;">
          ${escapeHtml(p.price_display)}
        </div>
      </div>

      <!-- Action Bar (Share, Print, Compare, Favorite) -->
      <div class="modal-action-bar">
        <button onclick="window.open('https://api.whatsapp.com/send?text=${encodeURIComponent('Check out this verified property on XenProperty: ' + p.title + ' - ' + p.price_display + ' in ' + p.city + ' ' + window.location.origin + '/buy.html?search=' + encodeURIComponent(p.title))}', '_blank')" class="btn-modal-action whatsapp">
          <i class="fa-brands fa-whatsapp"></i> Share
        </button>
        <button onclick="copyPropertyLink('${escapeHtml(p.title)}', ${p.id})" class="btn-modal-action">
          <i class="fa-solid fa-link"></i> Copy Link
        </button>
        <button onclick="window.print()" class="btn-modal-action">
          <i class="fa-solid fa-print"></i> Brochure
        </button>
        <button id="modalCompareBtn" onclick="xenComparison.toggleCompare(${JSON.stringify(p).replace(/"/g, '&quot;')}, this); this.innerHTML = xenComparison.isInCompare(${p.id}) ? '<i class=\\'fa-solid fa-check\\'></i> Compared' : '<i class=\\'fa-solid fa-code-compare\\'></i> Compare';" class="btn-modal-action">
          <i class="fa-solid ${isComp ? 'fa-check' : 'fa-code-compare'}"></i> ${isComp ? 'Compared' : 'Compare'}
        </button>
        <button id="modalFavBtn" onclick="xenFavorites.toggleFavorite(${JSON.stringify(p).replace(/"/g, '&quot;')}, this); this.innerHTML = xenFavorites.isFavorite(${p.id}) ? '<i class=\\'fa-solid fa-heart\\' style=\\'color:#ef4444;\\'></i> Saved' : '<i class=\\'fa-regular fa-heart\\'></i> Save';" class="btn-modal-action">
          <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart" style="color:#ef4444;"></i> ${isFav ? 'Saved' : 'Save'}
        </button>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
        <div>
          <h2 style="font-size:1.4rem; font-weight:800; color:#111827;">${escapeHtml(p.title)}</h2>
          <p style="color:#6b7280; font-size:0.88rem;"><i class="fa-solid fa-location-dot" style="color:#0f5b46;"></i> ${escapeHtml(p.address)}, ${escapeHtml(p.city)}</p>
        </div>
        <div style="text-align:right;">
          <span style="display:inline-block; background:#e6f7f2; color:#0f5b46; font-weight:800; font-size:0.85rem; padding:4px 10px; border-radius:999px;">
            <i class="fa-solid fa-wand-magic-sparkles"></i> ${p.ai_match_pct}% AI Match
          </span>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; background:#f8faf9; padding:12px; border-radius:12px; border:1px solid #e5ebe7; margin-bottom:16px; text-align:center;">
        <div><div style="font-size:0.75rem; color:#6b7280;">Bedrooms</div><strong style="color:#111827;">${p.beds || 'N/A'} Beds</strong></div>
        <div><div style="font-size:0.75rem; color:#6b7280;">Bathrooms</div><strong style="color:#111827;">${p.baths || 'N/A'} Baths</strong></div>
        <div><div style="font-size:0.75rem; color:#6b7280;">Carpet Area</div><strong style="color:#111827;">${p.area_sqft} sq.ft</strong></div>
        <div><div style="font-size:0.75rem; color:#6b7280;">Location Score</div><strong style="color:#0f5b46;">${p.location_score}/10</strong></div>
      </div>

      <div style="margin-bottom:16px;">
        <h4 style="font-size:0.95rem; font-weight:700; margin-bottom:6px;">Property Overview</h4>
        <p style="font-size:0.85rem; color:#4b5563; line-height:1.5;">${escapeHtml(p.description)}</p>
      </div>

      <div style="margin-bottom:20px;">
        <h4 style="font-size:0.95rem; font-weight:700; margin-bottom:8px;">Key Amenities</h4>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${(p.amenities || []).map(a => `<span style="background:#edf6f2; color:#0b3b2e; font-size:0.78rem; font-weight:600; padding:4px 10px; border-radius:6px;"><i class="fa-solid fa-check" style="color:#10b981; margin-right:4px;"></i>${escapeHtml(a)}</span>`).join('')}
        </div>
      </div>

      <!-- Instant EMI Calculator Box -->
      <div class="modal-emi-box">
        <div class="modal-emi-header">
          <div>
            <h4 style="font-size:0.95rem; font-weight:800; color:#065f46; margin:0;"><i class="fa-solid fa-calculator"></i> Estimated Monthly EMI</h4>
            <div style="font-size:0.75rem; color:#047857; margin-top:2px;">Based on 20% down payment (₹${(Math.round(p.price * 0.2) / 100000).toFixed(1)} Lakh) & 8.5% interest rate</div>
          </div>
          <div class="modal-emi-val" id="modalEmiValue">₹${initialEmi.toLocaleString('en-IN')}<span style="font-size:0.75rem; font-weight:600; color:#047857;">/mo</span></div>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px; font-size:0.78rem; color:#4b5563;">
          <span>Tenure: <strong id="modalTenureLabel" style="color:#065f46;">20 Years</strong></span>
          <a href="loans.html" style="color:var(--primary); font-weight:700; text-decoration:none;">Check Instant Loan Eligibility <i class="fa-solid fa-arrow-right"></i></a>
        </div>
        <input type="range" min="5" max="30" step="5" value="20" oninput="updateModalEMI(${loanPrincipal}, this.value)" style="width:100%; accent-color:#10b981; margin-top:8px; cursor:pointer;">
      </div>

      <!-- Schedule Site Visit / Inquiry Form -->
      <div style="border-top:1px solid #e5ebe7; padding-top:18px;">
        <h4 style="font-size:1rem; font-weight:800; color:#0f5b46; margin-bottom:12px;">
          <i class="fa-regular fa-calendar-check"></i> Schedule a Free Site Visit
        </h4>
        <form onsubmit="handleScheduleVisit(event, ${p.id}, '${escapeHtml(p.title)}')">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
            <input type="text" id="visitName" placeholder="Your Full Name *" required class="form-control">
            <input type="tel" id="visitPhone" placeholder="Mobile Number *" required class="form-control">
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
            <input type="email" id="visitEmail" placeholder="Email Address *" required class="form-control">
            <input type="date" id="visitDate" required class="form-control">
          </div>
          <button type="submit" class="btn-submit-primary">
            Confirm Visit Request <i class="fa-solid fa-arrow-right" style="margin-left:6px;"></i>
          </button>
        </form>
      </div>
    `;

    openModal('propertyDetailModal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateModalEMI(principal, years) {
  const r = 8.5 / 12 / 100;
  const n = Number(years) * 12;
  const emi = Math.round((principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
  const valEl = document.getElementById('modalEmiValue');
  const tenureLabel = document.getElementById('modalTenureLabel');
  if (valEl) valEl.innerHTML = `₹${emi.toLocaleString('en-IN')}<span style="font-size:0.75rem; font-weight:600; color:#047857;">/mo</span>`;
  if (tenureLabel) tenureLabel.innerText = `${years} Years`;
}

function copyPropertyLink(title, id) {
  const url = `${window.location.origin}/buy.html?search=${encodeURIComponent(title)}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Property link copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Link copied!', 'success');
    });
  } else {
    showToast('Link: ' + url, 'info');
  }
}

async function handleScheduleVisit(e, propertyId, propertyTitle) {
  e.preventDefault();
  const name = document.getElementById('visitName').value;
  const phone = document.getElementById('visitPhone').value;
  const email = document.getElementById('visitEmail').value;
  const date = document.getElementById('visitDate').value;

  try {
    const res = await api.submitInquiry({
      property_id: propertyId,
      property_title: propertyTitle,
      user_name: name,
      user_email: email,
      user_phone: phone,
      visit_date: date,
      message: `Site visit scheduled for ${propertyTitle} on ${date}`
    });

    closeModal('propertyDetailModal');
    showToast('Visit scheduled successfully! Our advisor will call you shortly.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ==========================================================================
   FAVORITES MANAGER
   ========================================================================== */
const xenFavorites = {
  key: 'xen_favorites',
  items: [],

  init() {
    try {
      this.items = JSON.parse(localStorage.getItem(this.key)) || [];
    } catch (e) {
      this.items = [];
    }
    this.updateBadge();
    this.createDrawer();
    this.syncHeartIcons();
  },

  isFavorite(id) {
    return this.items.some(item => Number(item.id) === Number(id));
  },

  toggleFavorite(prop, triggerEl = null) {
    const propId = Number(prop.id);
    const index = this.items.findIndex(item => Number(item.id) === propId);

    if (index > -1) {
      this.items.splice(index, 1);
      showToast('Removed from saved properties', 'info');
    } else {
      this.items.push({
        id: prop.id,
        title: prop.title,
        price_display: prop.price_display,
        price: prop.price,
        city: prop.city,
        address: prop.address,
        image_url: prop.image_url,
        beds: prop.beds,
        baths: prop.baths,
        area_sqft: prop.area_sqft,
        listing_type: prop.listing_type
      });
      showToast('Saved to your favorites!', 'success');
    }

    try {
      localStorage.setItem(this.key, JSON.stringify(this.items));
    } catch (e) {}

    this.updateBadge();
    this.syncHeartIcons();
    this.renderDrawer();
  },

  updateBadge() {
    const badges = document.querySelectorAll('.fav-count-badge');
    badges.forEach(b => {
      b.innerText = this.items.length;
    });
  },

  syncHeartIcons() {
    document.querySelectorAll('.badge-favorite').forEach(el => {
      const id = el.getAttribute('data-id');
      if (id) {
        const isFav = this.isFavorite(id);
        el.classList.toggle('active', isFav);
        const icon = el.querySelector('i');
        if (icon) {
          icon.className = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        }
      }
    });
  },

  createDrawer() {
    if (document.getElementById('favDrawerOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'favDrawerOverlay';
    overlay.className = 'fav-drawer-overlay';
    overlay.innerHTML = `
      <div class="fav-drawer">
        <div class="fav-drawer-header">
          <h3><i class="fa-solid fa-heart" style="color:#ef4444;"></i> Saved Properties (<span id="drawerFavCount">0</span>)</h3>
          <button class="fav-drawer-close" aria-label="Close saved properties" onclick="xenFavorites.closeDrawer()">&times;</button>
        </div>
        <div class="fav-drawer-body" id="favDrawerBody"></div>
        <div class="fav-drawer-footer" id="favDrawerFooter">
          <button onclick="xenFavorites.shareWishlistWhatsApp()" class="btn-modal-action whatsapp" style="width:100%;">
            <i class="fa-brands fa-whatsapp"></i> Share Wishlist on WhatsApp
          </button>
          <button onclick="xenFavorites.clearAll()" class="btn-dock-clear" style="align-self:center;">Clear All Saved Properties</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) xenFavorites.closeDrawer();
    });
  },

  openDrawer() {
    this.createDrawer();
    this.renderDrawer();
    const overlay = document.getElementById('favDrawerOverlay');
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  closeDrawer() {
    const overlay = document.getElementById('favDrawerOverlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
  },

  renderDrawer() {
    const body = document.getElementById('favDrawerBody');
    const countSpan = document.getElementById('drawerFavCount');
    const footer = document.getElementById('favDrawerFooter');
    if (!body) return;

    if (countSpan) countSpan.innerText = this.items.length;

    if (this.items.length === 0) {
      body.innerHTML = `
        <div style="text-align:center; padding:50px 20px; color:#9ca3af;">
          <i class="fa-regular fa-heart" style="font-size:3rem; margin-bottom:12px; color:#d1d5db;"></i>
          <h4 style="color:#374151; font-weight:700; margin-bottom:6px;">No Saved Properties Yet</h4>
          <p style="font-size:0.85rem; margin-bottom:18px;">Click the heart icon on any property to save it to your personalized wishlist.</p>
          <a href="buy.html" onclick="xenFavorites.closeDrawer()" class="btn-hero-primary" style="display:inline-block; padding:8px 18px; font-size:0.85rem;">Explore Properties</a>
        </div>
      `;
      if (footer) footer.style.display = 'none';
      return;
    }

    if (footer) footer.style.display = 'flex';
    body.innerHTML = this.items.map(item => `
      <div class="fav-item-card">
        <div class="fav-item-img" style="background-image: url('${escapeHtml(item.image_url)}');"></div>
        <div class="fav-item-info">
          <h4>${escapeHtml(item.title)}</h4>
          <div class="fav-item-city"><i class="fa-solid fa-location-dot" style="color:var(--primary); font-size:0.75rem;"></i> ${escapeHtml(item.city)}</div>
          <div class="fav-item-price">${escapeHtml(item.price_display)}</div>
          <div class="fav-item-actions">
            <button class="btn-fav-view" onclick="xenFavorites.closeDrawer(); viewPropertyDetails(${item.id})">
              <i class="fa-solid fa-eye"></i> View
            </button>
            <button class="btn-fav-remove" onclick="xenFavorites.toggleFavorite({id: ${item.id}})" title="Remove">
              <i class="fa-solid fa-trash-can"></i> Remove
            </button>
          </div>
        </div>
      </div>
    `).join('');
  },

  clearAll() {
    if (!confirm('Are you sure you want to clear your saved properties?')) return;
    this.items = [];
    localStorage.removeItem(this.key);
    this.updateBadge();
    this.syncHeartIcons();
    this.renderDrawer();
    showToast('Wishlist cleared', 'info');
  },

  shareWishlistWhatsApp() {
    if (this.items.length === 0) return;
    const text = 'Here are my saved properties from XenProperty:%0A' +
      this.items.map((i, idx) => `${idx + 1}. *${i.title}* - ${i.price_display} (${i.city})`).join('%0A') +
      '%0A%0ABrowse more on XenProperty: ' + window.location.origin;
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  }
};
window.xenFavorites = xenFavorites;

/* ==========================================================================
   PROPERTY COMPARISON MANAGER
   ========================================================================== */
const xenComparison = {
  items: [],

  init() {
    this.renderDock();
  },

  isInCompare(id) {
    return this.items.some(item => Number(item.id) === Number(id));
  },

  toggleCompare(prop, btnEl = null) {
    const propId = Number(prop.id);
    const index = this.items.findIndex(item => Number(item.id) === propId);

    if (index > -1) {
      this.items.splice(index, 1);
      showToast('Removed from comparison', 'info');
    } else {
      if (this.items.length >= 4) {
        showToast('You can compare up to 4 properties at once', 'error');
        return;
      }
      this.items.push(prop);
      showToast(`Added "${prop.title}" to compare`, 'success');
    }

    this.renderDock();
    this.syncCompareButtons();
  },

  clearAll() {
    this.items = [];
    this.renderDock();
    this.syncCompareButtons();
    showToast('Comparison cleared', 'info');
  },

  syncCompareButtons() {
    document.querySelectorAll('.btn-card-compare').forEach(btn => {
      const id = btn.getAttribute('data-id');
      if (id) {
        const inComp = this.isInCompare(id);
        btn.classList.toggle('active', inComp);
        btn.innerHTML = inComp ? '<i class="fa-solid fa-check"></i> Compared' : '<i class="fa-solid fa-code-compare"></i> Compare';
      }
    });
  },

  renderDock() {
    let dock = document.getElementById('xenComparisonDock');
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'xenComparisonDock';
      dock.className = 'comparison-dock';
      document.body.appendChild(dock);
    }

    if (this.items.length === 0) {
      dock.classList.remove('active');
      return;
    }

    dock.classList.add('active');
    dock.innerHTML = `
      <div class="dock-thumbs">
        ${this.items.map(item => `
          <div class="dock-thumb-item" style="background-image:url('${escapeHtml(item.image_url)}');" title="${escapeHtml(item.title)}">
            <span class="dock-thumb-remove" onclick="xenComparison.toggleCompare({id: ${item.id}})">&times;</span>
          </div>
        `).join('')}
      </div>
      <div class="dock-label"><strong>${this.items.length}</strong> / 4 Selected</div>
      <button class="btn-dock-compare" onclick="xenComparison.openCompareModal()">
        <i class="fa-solid fa-table-columns"></i> Compare Now
      </button>
      <button class="btn-dock-clear" onclick="xenComparison.clearAll()">Clear</button>
    `;
  },

  openCompareModal() {
    if (this.items.length < 2) {
      showToast('Please select at least 2 properties to compare', 'info');
      return;
    }

    let modal = document.getElementById('compareMatrixModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'compareMatrixModal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal('compareMatrixModal');
      });
    }

    const items = this.items;
    const allAmenities = Array.from(new Set(items.flatMap(item => {
      let ams = item.amenities || [];
      if (typeof ams === 'string') {
        try { ams = JSON.parse(ams); } catch (e) { ams = [ams]; }
      }
      return ams;
    }))).slice(0, 8);

    modal.innerHTML = `
      <div class="modal-card" style="max-width:960px; max-height:90vh; overflow-y:auto; padding:28px;">
        <button class="modal-close-btn" onclick="closeModal('compareMatrixModal')">&times;</button>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div>
            <h2 style="font-size:1.4rem; font-weight:800; color:var(--text-main);"><i class="fa-solid fa-code-compare" style="color:var(--primary);"></i> Side-by-Side Property Comparison</h2>
            <p style="font-size:0.85rem; color:#6b7280;">Comparing ${items.length} verified residences across pricing, specifications & amenities</p>
          </div>
          <button onclick="xenComparison.clearAll(); closeModal('compareMatrixModal')" class="btn-dock-clear" style="color:#ef4444;">Clear All</button>
        </div>

        <div style="overflow-x:auto;">
          <table class="compare-matrix-table">
            <thead>
              <tr>
                <th style="width:160px; background:#f1f5f9;">Feature</th>
                ${items.map(item => `
                  <th style="text-align:center; min-width:200px; background:#ffffff;">
                    <img src="${escapeHtml(item.image_url)}" style="width:100%; height:120px; object-fit:cover; border-radius:10px; margin-bottom:8px;">
                    <div style="font-weight:800; font-size:0.95rem; color:#111827;">${escapeHtml(item.title)}</div>
                    <div style="font-size:0.78rem; color:#6b7280;"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(item.city)}</div>
                    <div style="font-size:1.05rem; font-weight:800; color:var(--primary); margin-top:4px;">${escapeHtml(item.price_display)}</div>
                  </th>
                `).join('')}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Price / sq.ft</th>
                ${items.map(item => `
                  <td style="text-align:center; font-weight:700; color:#111827;">
                    ₹${Math.round(item.price / (item.area_sqft || 1000)).toLocaleString('en-IN')} / sq.ft
                  </td>
                `).join('')}
              </tr>
              <tr>
                <th>Property Type</th>
                ${items.map(item => `
                  <td style="text-align:center;">${escapeHtml(item.property_type || 'Apartment')}</td>
                `).join('')}
              </tr>
              <tr>
                <th>Bedrooms & Baths</th>
                ${items.map(item => `
                  <td style="text-align:center; font-weight:600;">
                    ${item.beds || 'N/A'} Beds / ${item.baths || 'N/A'} Baths
                  </td>
                `).join('')}
              </tr>
              <tr>
                <th>Carpet Area</th>
                ${items.map(item => `
                  <td style="text-align:center;">${item.area_sqft} sq.ft</td>
                `).join('')}
              </tr>
              <tr>
                <th>AI Match Rating</th>
                ${items.map(item => `
                  <td style="text-align:center;">
                    <span style="background:#e6f7f2; color:#0f5b46; font-weight:800; padding:3px 10px; border-radius:999px; font-size:0.8rem;">
                      ${item.ai_match_pct || 92}% Match
                    </span>
                  </td>
                `).join('')}
              </tr>
              <tr>
                <th>Location Score</th>
                ${items.map(item => `
                  <td style="text-align:center; font-weight:700; color:var(--primary);">
                    ⭐ ${item.location_score || 9.0}/10
                  </td>
                `).join('')}
              </tr>
              <tr>
                <th>Furnishing</th>
                ${items.map(item => `
                  <td style="text-align:center;">${escapeHtml(item.furnishing || 'Semi-Furnished')}</td>
                `).join('')}
              </tr>
              ${allAmenities.map(amenity => `
                <tr>
                  <th>${escapeHtml(amenity)}</th>
                  ${items.map(item => {
                    let ams = item.amenities || [];
                    if (typeof ams === 'string') {
                      try { ams = JSON.parse(ams); } catch (e) { ams = [ams]; }
                    }
                    const has = ams.some(a => a.toLowerCase().includes(amenity.toLowerCase()));
                    return `<td style="text-align:center; font-size:1rem;">${has ? '<i class="fa-solid fa-circle-check" style="color:#10b981;"></i>' : '<span style="color:#d1d5db;">—</span>'}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
              <tr>
                <th>Action</th>
                ${items.map(item => `
                  <td style="text-align:center;">
                    <button class="btn-hero-primary" style="padding:8px 14px; font-size:0.8rem; width:100%;" onclick="closeModal('compareMatrixModal'); viewPropertyDetails(${item.id})">
                      View Details <i class="fa-solid fa-arrow-right"></i>
                    </button>
                  </td>
                `).join('')}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
    openModal('compareMatrixModal');
  }
};
window.xenComparison = xenComparison;

/* ==========================================================================
   UNIVERSAL FLOATING AI ASSISTANT WIDGET
   ========================================================================== */
function initFloatingAI() {
  if (document.getElementById('xenFloatingAI')) return;
  const widget = document.createElement('div');
  widget.id = 'xenFloatingAI';
  widget.className = 'floating-ai-widget';
  widget.innerHTML = `
    <div class="floating-ai-popup" id="floatingAIPopup">
      <div class="ai-popup-header">
        <h4><i class="fa-solid fa-wand-magic-sparkles"></i> XenAI Real Estate Assistant</h4>
        <button class="ai-popup-close" aria-label="Close XenAI assistant" onclick="toggleFloatingAI()">&times;</button>
      </div>
      <div class="ai-popup-body" id="floatingAIMessages">
        <div class="chat-bubble ai">
          <div class="chat-avatar"><i class="fa-solid fa-robot"></i></div>
          <div class="chat-text">
            Hello! I am your XenProperty AI Matchmaker. Tell me what kind of property, budget, or city you are exploring!
          </div>
        </div>
        <div style="font-size:0.75rem; font-weight:700; color:#6b7280; margin-top:4px;">Try asking:</div>
        <div class="ai-prompt-chips">
          <button class="ai-chip" onclick="askFloatingAI('3 BHK Villa in Bangalore under 1.5 Cr')">3 BHK Bangalore under 1.5 Cr</button>
          <button class="ai-chip" onclick="askFloatingAI('Luxury Villa with private pool')">Villa with Pool</button>
          <button class="ai-chip" onclick="askFloatingAI('Rental apartment in Mumbai')">Rental in Mumbai</button>
          <button class="ai-chip" onclick="askFloatingAI('Calculate Home Loan for 60 Lakh')">Home Loan for 60L</button>
        </div>
      </div>
      <div class="ai-popup-footer">
        <form class="ai-popup-form" onsubmit="handleFloatingAISubmit(event)">
          <input type="text" id="floatingAIInput" placeholder="Ask XenAI anything..." class="ai-popup-input" required>
          <button type="submit" class="ai-popup-send" aria-label="Send message to XenAI"><i class="fa-solid fa-paper-plane"></i></button>
        </form>
      </div>
    </div>
    <button class="floating-ai-btn" onclick="toggleFloatingAI()">
      <i class="fa-solid fa-wand-magic-sparkles"></i>
      <span>Ask XenAI</span>
    </button>
  `;
  document.body.appendChild(widget);
}

function toggleFloatingAI() {
  const popup = document.getElementById('floatingAIPopup');
  if (popup) popup.classList.toggle('open');
}

function askFloatingAI(query) {
  const input = document.getElementById('floatingAIInput');
  if (input) {
    input.value = query;
    handleFloatingAISubmit(new Event('submit'));
  }
}

async function handleFloatingAISubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const input = document.getElementById('floatingAIInput');
  const messagesBox = document.getElementById('floatingAIMessages');
  if (!input || !messagesBox) return;

  const query = input.value.trim();
  if (!query) return;

  // Append user message
  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user';
  userBubble.innerHTML = `<div class="chat-text">${escapeHtml(query)}</div>`;
  messagesBox.appendChild(userBubble);
  input.value = '';
  messagesBox.scrollTop = messagesBox.scrollHeight;

  // Typing indicator
  const typing = document.createElement('div');
  typing.className = 'chat-bubble ai';
  typing.id = 'floatingAITyping';
  typing.innerHTML = `<div class="chat-avatar"><i class="fa-solid fa-robot"></i></div><div class="chat-text"><em>Analyzing verified listings...</em></div>`;
  messagesBox.appendChild(typing);
  messagesBox.scrollTop = messagesBox.scrollHeight;

  try {
    const res = await api.askAI(query);
    typing.remove();

    const aiBubble = document.createElement('div');
    aiBubble.className = 'chat-bubble ai';
    aiBubble.innerHTML = `
      <div class="chat-avatar"><i class="fa-solid fa-robot"></i></div>
      <div class="chat-text">${escapeHtml(res.reply)}</div>
    `;
    messagesBox.appendChild(aiBubble);

    if (res.properties && res.properties.length > 0) {
      const cardsWrap = document.createElement('div');
      cardsWrap.style.display = 'flex';
      cardsWrap.style.flexDirection = 'column';
      cardsWrap.style.gap = '8px';
      cardsWrap.style.marginTop = '6px';

      cardsWrap.innerHTML = res.properties.slice(0, 2).map(p => `
        <div style="background:#ffffff; border:1px solid #e5ebe7; border-radius:10px; padding:8px; display:flex; gap:10px; align-items:center; cursor:pointer;" onclick="toggleFloatingAI(); viewPropertyDetails(${p.id})">
          <img src="${escapeHtml(p.image_url)}" style="width:50px; height:50px; border-radius:6px; object-fit:cover;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; font-size:0.82rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.title)}</div>
            <div style="font-size:0.72rem; color:#6b7280;">${escapeHtml(p.city)} • ${p.beds || 'N/A'} Beds</div>
            <div style="font-weight:800; font-size:0.82rem; color:var(--primary);">${escapeHtml(p.price_display)}</div>
          </div>
          <button class="btn-fav-view" style="font-size:0.7rem; padding:3px 8px;">View</button>
        </div>
      `).join('');
      messagesBox.appendChild(cardsWrap);
    }
  } catch (err) {
    if (typing) typing.remove();
    const errorBubble = document.createElement('div');
    errorBubble.className = 'chat-bubble ai';
    errorBubble.innerHTML = `<div class="chat-avatar"><i class="fa-solid fa-robot"></i></div><div class="chat-text" style="color:#ef4444;">Error: ${escapeHtml(err.message)}</div>`;
    messagesBox.appendChild(errorBubble);
  }

  messagesBox.scrollTop = messagesBox.scrollHeight;
}

/* ==========================================================================
   SEARCH AUTOCOMPLETE DROPDOWN
   ========================================================================== */
function initSearchAutocomplete() {
  const searchInput = document.getElementById('globalSearchInput');
  if (!searchInput) return;

  const parent = searchInput.parentElement;
  if (!parent) return;
  parent.style.position = 'relative';

  let dropdown = document.getElementById('globalSearchAutocomplete');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'globalSearchAutocomplete';
    dropdown.className = 'search-autocomplete-dropdown';
    parent.appendChild(dropdown);
  }

  let debounceTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const val = searchInput.value.trim();
    if (val.length < 2) {
      dropdown.classList.remove('active');
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const res = await api.getProperties({ search: val, limit: 4 });
        const props = res.data || [];
        if (props.length === 0) {
          dropdown.innerHTML = `
            <div style="padding:14px; text-align:center; font-size:0.82rem; color:#9ca3af;">
              No properties matching "<strong>${escapeHtml(val)}</strong>"
            </div>
          `;
          dropdown.classList.add('active');
          return;
        }

        dropdown.innerHTML = props.map(p => `
          <div class="autocomplete-item" onclick="viewPropertyDetails(${p.id}); document.getElementById('globalSearchAutocomplete').classList.remove('active');">
            <div class="autocomplete-thumb" style="background-image:url('${escapeHtml(p.image_url)}');"></div>
            <div class="autocomplete-info">
              <h5>${escapeHtml(p.title)}</h5>
              <p><i class="fa-solid fa-location-dot" style="font-size:0.7rem; color:var(--primary);"></i> ${escapeHtml(p.city)} • ${p.beds || 'N/A'} BHK ${escapeHtml(p.property_type)}</p>
            </div>
            <div class="autocomplete-price">${escapeHtml(p.price_display)}</div>
          </div>
        `).join('') + `
          <div style="padding:8px 14px; background:#f9fafb; text-align:center; border-top:1px solid #e5e7eb;">
            <a href="buy.html?search=${encodeURIComponent(val)}" style="font-size:0.78rem; font-weight:700; color:var(--primary); text-decoration:none;">
              View all results for "${escapeHtml(val)}" <i class="fa-solid fa-arrow-right"></i>
            </a>
          </div>
        `;
        dropdown.classList.add('active');
      } catch (e) {}
    }, 280);
  });

  document.addEventListener('click', (e) => {
    if (!parent.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });
}

// Utility: escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

