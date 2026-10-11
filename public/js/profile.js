// My Profile - renders the signed-in user's account, listings, saved
// properties, site visits, loan applications and design requests.
//
// Saved properties live in localStorage (xenFavorites), everything else comes
// from GET /api/me/dashboard, which is scoped to the signed-in user.
document.addEventListener('DOMContentLoaded', initProfilePage);

async function initProfilePage() {
  const signedOut = document.getElementById('profileSignedOut');
  const signedIn = document.getElementById('profileSignedIn');

  if (!signedOut || !signedIn) return;

  // The cached session user is only a hint - if there is no token at all there
  // is no point spending a round trip on the API.
  const session = api.getCurrentUser();
  if (!session || !api.getToken()) {
    signedOut.style.display = 'block';
    return;
  }

  let data;
  try {
    data = await api.getMyDashboard();
  } catch (err) {
    // An expired or rejected token means the session is not really valid.
    if (/unauthor|token|expired|authentic|required|login/i.test(err.message || '')) {
      api.removeToken();
      showToast('Your session has expired. Please sign in again.', 'info');
      setTimeout(() => { window.location.href = 'login.html?redirect=profile.html'; }, 1200);
      return;
    }
    showToast(err.message || 'Could not load your profile.', 'error');
    signedOut.style.display = 'block';
    return;
  }

  signedOut.style.display = 'none';
  signedIn.style.display = 'block';

  renderProfile(data);
  bindProfileActions(data);
}

/* ------------------------------- rendering -------------------------------- */

function renderProfile(data) {
  const user = data.user || {};
  const listings = data.listings || [];
  const inquiries = data.inquiries || [];
  const loans = data.loans || [];
  const designs = data.designs || [];
  const saved = (window.xenFavorites && xenFavorites.items) || [];

  // Hero
  setText('pfName', user.full_name || 'Your Profile');
  setText('pfEmail', user.email || '');
  setText('pfRole', user.role ? String(user.role).toUpperCase() : 'USER');

  const since = formatJoinDate(user.created_at);
  setText('pfSince', since ? `Member since ${since}` : 'Member');

  // Account details
  setText('dName', user.full_name || '-');
  setText('dEmail', user.email || '-');
  setText('dPhone', user.phone && String(user.phone).trim() ? user.phone : 'Not added yet');
  setText('dRole', user.role ? capitalise(user.role) : '-');
  setText('dSince', since || '-');

  // Counters
  setText('pfSavedCount', String(saved.length));
  setText('pfListingCount', String(listings.length));
  setText('pfVisitCount', String(inquiries.length));

  // Lists
  renderList('pfSaved', saved.map((s) => ({
    image: s.image_url,
    title: s.title,
    meta: s.city || 'India',
    detail: s.price_display || '',
    action: `onclick="viewPropertyDetails(${Number(s.id)})"`,
    actionLabel: 'View',
  })), {
    icon: 'fa-regular fa-heart',
    heading: 'No Saved Properties',
    hint: 'Tap the heart on any property to keep it here for later.',
    cta: ['Explore Properties', 'buy.html'],
  });

  renderList('pfListings', listings.map((p) => ({
    image: p.image_url,
    title: p.title,
    meta: `${p.city || 'India'} • ${p.property_type || 'Property'}`,
    detail: p.price_display || '',
    action: `onclick="viewPropertyDetails(${Number(p.id)})"`,
    actionLabel: 'View',
  })), {
    icon: 'fa-solid fa-building',
    heading: 'You Have Not Listed Anything Yet',
    hint: 'List your property and it will show up here for you to manage.',
    cta: ['List a Property', 'sell.html'],
  });

  renderList('pfVisits', inquiries.map((i) => ({
    image: null,
    title: i.property_title || 'General Inquiry',
    meta: i.visit_date
      ? `Site visit on ${formatDate(i.visit_date)}`
      : 'Enquiry received',
    detail: i.status ? capitalise(String(i.status).replace(/_/g, ' ')) : '',
    action: i.property_id ? `onclick="viewPropertyDetails(${Number(i.property_id)})"` : '',
    actionLabel: 'View',
  })), {
    icon: 'fa-regular fa-calendar-check',
    heading: 'No Site Visits Booked',
    hint: 'Book a free site visit from any property and track it here.',
    cta: ['Browse Properties', 'buy.html'],
  });

  renderList('pfLoans', loans.map((l) => ({
    image: null,
    title: `Home Loan - ${formatMoney(l.loan_amount)}`,
    meta: `${capitalise(String(l.employment_type || 'Salaried'))} • ${l.property_city || 'India'}`,
    detail: l.status ? capitalise(String(l.status)) : 'Submitted',
    action: '',
    actionLabel: '',
  })), {
    icon: 'fa-solid fa-landmark',
    heading: 'No Loan Applications',
    hint: 'Check your EMI and apply for a home loan in a couple of minutes.',
    cta: ['Home Loans', 'loans.html'],
  });

  renderList('pfDesigns', designs.map((d) => ({
    image: null,
    title: `${d.service_type || 'Design'} Consultation`,
    meta: d.property_area ? `${d.property_area} sq.ft` : 'Design request',
    detail: d.status ? capitalise(String(d.status).replace(/_/g, ' ')) : 'Submitted',
    action: '',
    actionLabel: '',
  })), {
    icon: 'fa-solid fa-compass-drafting',
    heading: 'No Design Requests',
    hint: 'Get a free consultation with our architecture partners.',
    cta: ['Design Studio', 'design.html'],
  });
}

/**
 * Render a list of rows, or a friendly empty state with a call to action.
 */
function renderList(containerId, rows, empty) {
  const box = document.getElementById(containerId);
  if (!box) return;

  if (!rows.length) {
    box.innerHTML = `
      <div class="profile-empty">
        <i class="${empty.icon}"></i>
        <div style="font-weight:700; color:var(--text-main); margin-bottom:4px;">${escapeHtml(empty.heading)}</div>
        <div style="margin-bottom:12px;">${escapeHtml(empty.hint)}</div>
        <a href="${escapeHtml(empty.cta[1])}" class="btn-submit-primary"
           style="display:inline-flex; align-items:center; justify-content:center; width:auto; padding:9px 20px; font-size:0.82rem; text-decoration:none;">
          ${escapeHtml(empty.cta[0])}
        </a>
      </div>
    `;
    return;
  }

  box.innerHTML = rows.map((r) => `
    <div class="profile-list-item">
      ${r.image
        ? `<img src="${escapeHtml(r.image)}" alt="" loading="lazy">`
        : '<div class="profile-list-icon"><i class="fa-solid fa-circle-info"></i></div>'}
      <div class="info">
        <h4>${escapeHtml(r.title)}</h4>
        <p>${escapeHtml(r.meta)}</p>
      </div>
      ${r.detail ? `<div class="profile-list-detail">${escapeHtml(r.detail)}</div>` : ''}
      ${r.action
        ? `<button type="button" class="btn-fav-view" ${r.action}>${escapeHtml(r.actionLabel)}</button>`
        : ''}
    </div>
  `).join('');
}

/* ------------------------------- actions ---------------------------------- */

function bindProfileActions(data) {
  const editBtn = document.getElementById('pfEditBtn');
  const form = document.getElementById('profileEditForm');

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      const user = data.user || {};
      document.getElementById('pfEditName').value = user.full_name || '';
      document.getElementById('pfEditPhone').value = user.phone || '';
      openModal('editProfileModal');
    });
  }

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const full_name = document.getElementById('pfEditName').value.trim();
    const phone = document.getElementById('pfEditPhone').value.trim();
    const saveBtn = document.getElementById('pfSaveBtn');
    const original = saveBtn.innerHTML;

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      const res = await api.updateMe({ full_name, phone });
      closeModal('editProfileModal');
      showToast(res.message || 'Profile updated.', 'success');

      // Refresh so the navbar name, counters and account card all agree.
      data = await api.getMyDashboard();
      renderProfile(data);
      initAuthUI();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = original;
    }
  });
}

/**
 * Logging out lives here rather than in the navbar, so it is easy to press by
 * accident. Ask first.
 */
function confirmLogout() {
  if (window.confirm('Log out of XenProperty?')) handleLogout();
}

/* -------------------------------- helpers --------------------------------- */

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/** SQLite hands back "YYYY-MM-DD HH:MM:SS"; Firestore returns a Date or ISO. */
function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  const d = parseDate(value);
  if (!d) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatJoinDate(value) {
  const d = parseDate(value);
  if (!d) return '';
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function formatMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 'Loan amount';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} Lakh`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function capitalise(text) {
  const s = String(text || '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}