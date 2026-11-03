const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let reports = { pending: [], published: [], users: [] };
let currentView = 'pending';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const sellerFor = (item) => reports.users.find((u) => String(u.id) === String(item.user_id)) || {};

function setReport(view) {
  currentView = view;
  document.querySelectorAll('[data-report]').forEach((button) => button.classList.toggle('active', button.dataset.report === view));
  const title = document.getElementById('reportTitle');
  const head = document.getElementById('reportHead');
  const rows = document.getElementById('reportRows');
  if (view === 'users') {
    title.textContent = 'Users Report';
    head.innerHTML = '<tr><th>User ID</th><th>Name</th><th>Gmail</th><th>Phone</th><th>Role</th><th>Joined</th><th>Listings</th></tr>';
    rows.innerHTML = reports.users.length ? reports.users.map((u) => `<tr><td>${esc(u.id)}</td><td>${esc(u.full_name || '—')}</td><td>${esc(u.email || '—')}</td><td>${esc(u.phone || '—')}</td><td>${esc(u.role || 'buyer')}</td><td>${esc(u.created_at || '—')}</td><td>${reports.published.concat(reports.pending).filter((p) => String(p.user_id) === String(u.id)).length}</td></tr>`).join('') : '<tr><td colspan="7">No users found.</td></tr>';
    return;
  }

  const collection = view === 'pending' ? reports.pending : reports.published;
  title.textContent = view === 'pending' ? 'Pending Submissions Report' : 'Published Properties Report';
  head.innerHTML = '<tr><th>Seller ID</th><th>Seller</th><th>Gmail</th><th>Phone</th><th>Property ID</th><th>Type</th><th>Address</th><th>Pincode</th><th>Price</th><th>Submitted</th><th>Status</th><th>Action</th></tr>';
  rows.innerHTML = collection.length ? collection.map((p) => {
    const seller = sellerFor(p);
    const status = view === 'pending' ? 'Pending' : 'Published';
    const action = view === 'pending' ? `<button onclick="publish('${esc(p.id)}')">Approve & Publish</button><button class="danger" onclick="reject('${esc(p.id)}')">Reject</button>` : '<span class="status published">Live</span>';
    return `<tr><td>${esc(p.user_id || '—')}</td><td>${esc(p.seller_name || seller.full_name || '—')}</td><td>${esc(p.seller_email || seller.email || '—')}</td><td>${esc(p.seller_phone || seller.phone || '—')}</td><td>${esc(p.id)}</td><td><b>${esc((p.listing_type || 'buy').toUpperCase())}</b></td><td>${esc(p.address || '—')}</td><td>${esc(p.pincode || '—')}</td><td>${money(p.price)}</td><td>${esc(p.created_at || '—')}</td><td><span class="status ${view === 'pending' ? 'pending' : 'published'}">${status}</span></td><td>${action}</td></tr>`;
  }).join('') : `<tr><td colspan="12">No ${view === 'pending' ? 'pending submissions' : 'published properties'} found.</td></tr>`;
}

async function load() {
  const [pending, published, users] = await Promise.all([fsList('pending_properties'), fsList('properties'), fsList('users')]);
  reports = { pending, published, users };
  pendingCount.textContent = pending.length;
  approvedCount.textContent = published.length;
  usersCount.textContent = users.length;
  setReport(currentView);
}

async function publish(id) {
  const property = reports.pending.find((p) => String(p.id) === String(id)) || (await fsList('pending_properties')).find((p) => String(p.id) === String(id));
  if (!property) return;
  const { photo_data, video_data, status, ...publicProperty } = property;
  publicProperty.image_url = photo_data || publicProperty.image_url || '';
  await fsPost('properties', publicProperty);
  await fsDelete('pending_properties', id);
  await load();
}

async function reject(id) {
  if (confirm('Reject this submission?')) { await fsDelete('pending_properties', id); await load(); }
}

document.querySelectorAll('[data-report]').forEach((button) => button.addEventListener('click', () => setReport(button.dataset.report)));
logoutBtn.onclick = () => firebase.auth().signOut().then(() => { location.href = 'login.html'; });
firebase.auth().onAuthStateChanged((user) => {
  if (!user || !ADMIN_EMAIL_ALLOWLIST.includes((user.email || '').toLowerCase())) return location.href = 'login.html';
  load().catch((e) => { reportRows.innerHTML = `<tr><td colspan="12" class="error">${esc(e.message)}</td></tr>`; });
});
