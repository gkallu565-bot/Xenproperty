// Admin console: direct Firestore reads/writes, without the application API.
const ADMIN_COLLECTIONS = {
  properties: 'properties',
  users: 'users',
  inquiries: 'inquiries',
  loans: 'loan_applications',
  design: 'design_requests',
};

const adminData = { properties: [], users: [], inquiries: [], loans: [], design: [] };

document.addEventListener('DOMContentLoaded', () => {
  const user = typeof api !== 'undefined' ? api.getCurrentUser() : null;
  if (!user || user.role !== 'admin') {
    showToast('Please sign in with an administrator account to continue.', 'error');
    setTimeout(() => { window.location.href = 'login.html?redirect=' + encodeURIComponent('admin.html'); }, 900);
    return;
  }
  refreshAdminData();
  document.getElementById('adminPropertyForm')?.addEventListener('submit', saveAdminProperty);
});

async function loadCollection(key) {
  adminData[key] = await firestoreDirect.list(ADMIN_COLLECTIONS[key]);
  return adminData[key];
}

async function refreshAdminData() {
  try {
    await Promise.all(Object.keys(ADMIN_COLLECTIONS).map(loadCollection));
    renderAdminStats();
    renderProperties();
    renderInquiries();
    renderLoans();
    renderDesignRequests();
  } catch (error) {
    console.error(error);
    showToast(`Firestore connection error: ${error.message}`, 'error');
    ['adminPropsTableBody', 'adminInquiriesTableBody', 'adminLoansTableBody', 'adminDesignTableBody'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<tr><td colspan="6" style="color:#ef4444;text-align:center;padding:20px;">${escapeHtml(error.message)}</td></tr>`;
    });
  }
}

function renderAdminStats() {
  const values = {
    statTotalProperties: adminData.properties.length,
    statTotalUsers: adminData.users.length,
    statTotalInquiries: adminData.inquiries.length,
    statTotalLoans: adminData.loans.length,
    statTotalDesign: adminData.design.length,
  };
  Object.entries(values).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value; });
}

function renderProperties() {
  const tbody = document.getElementById('adminPropsTableBody');
  if (!tbody) return;
  if (!adminData.properties.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">No properties in Firestore yet</td></tr>';
    return;
  }
  tbody.innerHTML = adminData.properties.map((p) => `
    <tr class="filterable-row">
      <td><strong>#${escapeHtml(String(p.id || ''))}</strong></td>
      <td><div style="display:flex;align-items:center;gap:10px;"><img src="${escapeHtml(p.image_url || '')}" alt="" style="width:44px;height:44px;border-radius:8px;object-fit:cover;"><div><strong>${escapeHtml(p.title || 'Property')}</strong><div style="font-size:.75rem;color:#6b7280;">${escapeHtml(p.address || p.city || '')}</div></div></div></td>
      <td><span class="badge-status active">${escapeHtml(String(p.listing_type || 'buy')).toUpperCase()}</span></td>
      <td><strong>₹${Number(p.price || 0).toLocaleString('en-IN')}</strong></td>
      <td><span style="color:var(--primary);font-weight:800;">${escapeHtml(String(p.pincode || '—'))}</span></td>
      <td><button onclick="deletePropertyItem('${escapeHtml(String(p.id))}')" style="background:#fee2e2;border:0;padding:6px 10px;border-radius:6px;color:#dc2626;cursor:pointer;font-weight:700;"><i class="fa-solid fa-trash"></i> Delete</button></td>
    </tr>`).join('');
}

function renderInquiries() {
  const tbody = document.getElementById('adminInquiriesTableBody');
  if (!tbody) return;
  tbody.innerHTML = adminData.inquiries.length ? adminData.inquiries.map((i) => `
    <tr class="filterable-row"><td><strong>#${escapeHtml(String(i.id || ''))}</strong></td><td><strong>${escapeHtml(i.user_name || i.full_name || '')}</strong></td><td>${escapeHtml(i.user_phone || i.phone || '')}<br><small>${escapeHtml(i.user_email || i.email || '')}</small></td><td>${escapeHtml(i.property_title || 'General')}</td><td>${escapeHtml(i.visit_date || 'Callback Request')}</td><td>${statusSelect('inquiry', i.id, i.status || 'pending')}</td></tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:20px;">No inquiries in Firestore</td></tr>';
}

function renderLoans() {
  const tbody = document.getElementById('adminLoansTableBody');
  if (!tbody) return;
  tbody.innerHTML = adminData.loans.length ? adminData.loans.map((l) => `
    <tr class="filterable-row"><td><strong>#${escapeHtml(String(l.id || ''))}</strong></td><td><strong>${escapeHtml(l.full_name || '')}</strong><br><small>${escapeHtml(l.phone || '')} • ${escapeHtml(l.email || '')}</small></td><td>₹${Number(l.loan_amount || 0).toLocaleString('en-IN')}</td><td>₹${Number(l.monthly_income || 0).toLocaleString('en-IN')}</td><td>${escapeHtml(l.bank_preference || '')}</td><td>${statusSelect('loan', l.id, l.status || 'Under Review')}</td></tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:20px;">No loan applications in Firestore</td></tr>';
}

function renderDesignRequests() {
  const tbody = document.getElementById('adminDesignTableBody');
  if (!tbody) return;
  tbody.innerHTML = adminData.design.length ? adminData.design.map((d) => `
    <tr class="filterable-row"><td><strong>#${escapeHtml(String(d.id || ''))}</strong></td><td><strong>${escapeHtml(d.full_name || '')}</strong><br><small>${escapeHtml(d.phone || '')} • ${escapeHtml(d.email || '')}</small></td><td>${escapeHtml(d.service_type || '')}</td><td>${escapeHtml(String(d.property_area || 'N/A'))} sq.ft<br><small>Budget: ${escapeHtml(d.budget_range || '')}</small></td><td>${statusSelect('design', d.id, d.status || 'pending')}</td></tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:20px;">No design requests in Firestore</td></tr>';
}

function statusSelect(type, id, value) {
  const options = type === 'loan' ? ['Under Review', 'Pre-Approved', 'Approved', 'Rejected'] : type === 'design' ? ['pending', 'in_progress', 'completed'] : ['pending', 'contacted', 'scheduled', 'completed'];
  return `<select onchange="updateAdminStatus('${type}','${escapeHtml(String(id))}',this.value)" style="padding:4px 8px;border-radius:6px;border:1px solid #d1d5db;">${options.map((o) => `<option ${o === value ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`;
}

async function updateAdminStatus(type, id, status) {
  const key = type === 'inquiry' ? 'inquiries' : type === 'loan' ? 'loans' : 'design';
  try {
    const record = adminData[key].find((item) => String(item.id) === String(id));
    await firestoreDirect.update(ADMIN_COLLECTIONS[key], id, { ...record, status });
    record.status = status;
    showToast('Status saved directly to Firestore.', 'success');
  } catch (error) { showToast(error.message, 'error'); }
}

async function deletePropertyItem(id) {
  if (!confirm(`Delete property #${id} from Firestore?`)) return;
  try {
    await firestoreDirect.remove(ADMIN_COLLECTIONS.properties, id);
    adminData.properties = adminData.properties.filter((p) => String(p.id) !== String(id));
    renderAdminStats(); renderProperties();
    showToast('Property deleted from Firestore.', 'success');
  } catch (error) { showToast(error.message, 'error'); }
}

function openAdminPropertyForm() { document.getElementById('adminPropertyModal')?.classList.add('active'); }
function closeAdminPropertyForm() { document.getElementById('adminPropertyModal')?.classList.remove('active'); }

async function saveAdminProperty(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  if (!/^\d{6}$/.test(data.pincode)) return showToast('Pincode must be exactly 6 digits.', 'error');
  try {
    await firestoreDirect.create(ADMIN_COLLECTIONS.properties, {
      title: 'New Property Listing', listing_type: 'buy', property_type: 'Apartment', price: Number(data.price),
      price_display: `₹${Number(data.price).toLocaleString('en-IN')}`, city: 'India', state: 'India',
      address: data.address.trim(), pincode: data.pincode, image_url: data.image_url.trim(), beds: 0, baths: 0,
      area_sqft: 1000, ai_match_pct: 92, is_verified: true, is_featured: false,
    });
    form.reset(); closeAdminPropertyForm(); await refreshAdminData();
    showToast('Property saved directly to Firestore.', 'success');
  } catch (error) { showToast(error.message, 'error'); }
}

window.openAdminPropertyForm = openAdminPropertyForm;
window.closeAdminPropertyForm = closeAdminPropertyForm;
window.deletePropertyItem = deletePropertyItem;
window.updateAdminStatus = updateAdminStatus;
window.filterAdminTables = (query) => {
  const q = String(query || '').toLowerCase();
  document.querySelectorAll('.filterable-row').forEach((row) => { row.style.display = !q || row.innerText.toLowerCase().includes(q) ? '' : 'none'; });
};
