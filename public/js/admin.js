// Admin Portal Controller
document.addEventListener('DOMContentLoaded', () => {
  // The admin API requires an authenticated admin token. Bail out to the
  // login page rather than rendering an empty dashboard.
  const user = api.getCurrentUser();
  if (!api.getToken() || !user || user.role !== 'admin') {
    if (typeof showToast === 'function') {
      showToast('Please sign in with an administrator account to continue.', 'error');
    }
    setTimeout(() => {
      window.location.href = 'login.html?redirect=' + encodeURIComponent('admin.html');
    }, 1200);
    return;
  }

  loadAdminStats();
  loadPropertiesTable();
  loadInquiriesTable();
  loadLoanApplicationsTable();
  loadDesignRequestsTable();
});

async function loadAdminStats() {
  try {
    const res = await api.getAdminStats();
    const stats = res.stats;
    const propEl = document.getElementById('statTotalProperties');
    const userEl = document.getElementById('statTotalUsers');
    const inqEl = document.getElementById('statTotalInquiries');
    const loanEl = document.getElementById('statTotalLoans');
    const designEl = document.getElementById('statTotalDesign');

    if (propEl) propEl.innerText = stats.totalProperties || 0;
    if (userEl) userEl.innerText = stats.totalUsers || 0;
    if (inqEl) inqEl.innerText = stats.totalInquiries || 0;
    if (loanEl) loanEl.innerText = stats.totalLoanApplications || 0;
    if (designEl) designEl.innerText = stats.totalDesignRequests || 0;
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

async function loadPropertiesTable() {
  const tbody = document.getElementById('adminPropsTableBody');
  if (!tbody) return;

  try {
    const res = await api.getProperties();
    const properties = res.data || [];
    tbody.innerHTML = properties.map(p => `
      <tr>
        <td><strong>#${p.id}</strong></td>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <img src="${escapeHtml(p.image_url)}" style="width:44px; height:44px; border-radius:8px; object-fit:cover;">
            <div>
              <strong>${escapeHtml(p.title)}</strong>
              <div style="font-size:0.75rem; color:#6b7280;">${escapeHtml(p.city)}</div>
            </div>
          </div>
        </td>
        <td><span class="badge-status active">${escapeHtml(p.listing_type).toUpperCase()}</span></td>
        <td><strong>${escapeHtml(p.price_display)}</strong></td>
        <td><span style="color:var(--primary); font-weight:800;">${p.ai_match_pct}%</span></td>
        <td>
          <button onclick="viewPropertyDetails(${p.id})" style="background:#edf6f2; border:none; padding:5px 10px; border-radius:6px; color:var(--primary); cursor:pointer; font-weight:700; margin-right:4px;">
            <i class="fa-solid fa-eye"></i> View
          </button>
          <button onclick="deletePropertyItem(${p.id})" style="background:#fee2e2; border:none; padding:5px 10px; border-radius:6px; color:#dc2626; cursor:pointer; font-weight:700;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:#ef4444; text-align:center;">Failed to load properties</td></tr>`;
  }
}

async function deletePropertyItem(id) {
  if (!confirm(`Are you sure you want to delete property #${id}?`)) return;
  try {
    await api.deleteProperty(id);
    showToast('Property deleted successfully', 'success');
    loadPropertiesTable();
    loadAdminStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadInquiriesTable() {
  const tbody = document.getElementById('adminInquiriesTableBody');
  if (!tbody) return;

  try {
    const res = await api.getInquiries();
    const inquiries = res.data || [];
    if (inquiries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#9ca3af; padding:20px;">No customer inquiries yet</td></tr>`;
      return;
    }
    tbody.innerHTML = inquiries.map(i => {
      const currentStatus = (i.status || 'pending').toLowerCase();
      return `
        <tr class="filterable-row">
          <td><strong>#${i.id}</strong></td>
          <td><strong>${escapeHtml(i.user_name)}</strong></td>
          <td>${escapeHtml(i.user_phone)}<br><small style="color:#6b7280;">${escapeHtml(i.user_email)}</small></td>
          <td>${escapeHtml(i.property_title || 'General')}</td>
          <td>${i.visit_date ? `<i class="fa-regular fa-calendar"></i> ${i.visit_date}` : 'Callback Request'}</td>
          <td>
            <select onchange="handleInquiryStatusChange(${i.id}, this.value)" style="padding:4px 8px; border-radius:6px; font-size:0.78rem; font-weight:700; border:1px solid #d1d5db; background:#f9fafb; cursor:pointer;">
              <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>⏳ Pending</option>
              <option value="contacted" ${currentStatus === 'contacted' ? 'selected' : ''}>📞 Contacted</option>
              <option value="scheduled" ${currentStatus === 'scheduled' ? 'selected' : ''}>📅 Scheduled</option>
              <option value="completed" ${currentStatus === 'completed' ? 'selected' : ''}>✅ Completed</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:#ef4444; text-align:center;">Failed to load inquiries</td></tr>`;
  }
}

async function handleInquiryStatusChange(id, status) {
  try {
    await api.updateInquiryStatus(id, status);
    showToast(`Inquiry #${id} status updated to "${status}"`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
    loadInquiriesTable();
  }
}

async function loadLoanApplicationsTable() {
  const tbody = document.getElementById('adminLoansTableBody');
  if (!tbody) return;

  try {
    const res = await api.getLoans();
    const loans = res.data || [];
    if (loans.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#9ca3af; padding:20px;">No loan applications yet</td></tr>`;
      return;
    }
    tbody.innerHTML = loans.map(l => {
      const currentStatus = l.status || 'Under Review';
      return `
        <tr class="filterable-row">
          <td><strong>#${l.id}</strong></td>
          <td><strong>${escapeHtml(l.full_name)}</strong><br><small style="color:#6b7280;">${escapeHtml(l.phone)} • ${escapeHtml(l.email)}</small></td>
          <td><strong>₹${Number(l.loan_amount).toLocaleString('en-IN')}</strong></td>
          <td>₹${Number(l.monthly_income).toLocaleString('en-IN')} / mo</td>
          <td><i class="fa-solid fa-building-columns" style="color:var(--primary);"></i> ${escapeHtml(l.bank_preference)}</td>
          <td>
            <select onchange="handleLoanStatusChange(${l.id}, this.value)" style="padding:4px 8px; border-radius:6px; font-size:0.78rem; font-weight:700; border:1px solid #d1d5db; background:#f9fafb; cursor:pointer;">
              <option value="Under Review" ${currentStatus === 'Under Review' ? 'selected' : ''}>⏳ Under Review</option>
              <option value="Pre-Approved" ${currentStatus === 'Pre-Approved' ? 'selected' : ''}>⭐ Pre-Approved</option>
              <option value="Approved" ${currentStatus === 'Approved' ? 'selected' : ''}>✅ Approved</option>
              <option value="Rejected" ${currentStatus === 'Rejected' ? 'selected' : ''}>❌ Rejected</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:#ef4444; text-align:center;">Failed to load loans</td></tr>`;
  }
}

async function handleLoanStatusChange(id, status) {
  try {
    await api.updateLoanStatus(id, status);
    showToast(`Loan Application #${id} status updated to "${status}"`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
    loadLoanApplicationsTable();
  }
}

async function loadDesignRequestsTable() {
  const tbody = document.getElementById('adminDesignTableBody');
  if (!tbody) return;

  try {
    const res = await api.getDesignRequests();
    const requests = res.data || [];
    if (requests.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#9ca3af; padding:20px;">No architecture/design consultation requests yet</td></tr>`;
      return;
    }
    tbody.innerHTML = requests.map(d => {
      const currentStatus = (d.status || 'pending').toLowerCase();
      return `
        <tr class="filterable-row">
          <td><strong>#${d.id}</strong></td>
          <td><strong>${escapeHtml(d.full_name)}</strong><br><small style="color:#6b7280;">${escapeHtml(d.phone)} • ${escapeHtml(d.email)}</small></td>
          <td><span class="badge-status active" style="background:#f3e8ff; color:#7e22ce;">${escapeHtml(d.service_type)}</span></td>
          <td>${d.property_area ? `${d.property_area} sq.ft` : 'N/A'}<br><small style="color:#6b7280;">Budget: ${escapeHtml(d.budget_range || 'Moderate')}</small></td>
          <td>
            <select onchange="handleDesignStatusChange(${d.id}, this.value)" style="padding:4px 8px; border-radius:6px; font-size:0.78rem; font-weight:700; border:1px solid #d1d5db; background:#f9fafb; cursor:pointer;">
              <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>⏳ Pending</option>
              <option value="in_progress" ${currentStatus === 'in_progress' ? 'selected' : ''}>🎨 In Progress</option>
              <option value="completed" ${currentStatus === 'completed' ? 'selected' : ''}>✅ Completed</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:#ef4444; text-align:center;">Failed to load design requests</td></tr>`;
  }
}

async function handleDesignStatusChange(id, status) {
  try {
    await api.updateDesignStatus(id, status);
    showToast(`Design Request #${id} status updated to "${status}"`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
    loadDesignRequestsTable();
  }
}

// Live table search/filter
function filterAdminTables(query) {
  const q = (query || '').toLowerCase().trim();
  const rows = document.querySelectorAll('.filterable-row');
  rows.forEach(row => {
    const text = row.innerText.toLowerCase();
    if (!q || text.includes(q)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}
window.filterAdminTables = filterAdminTables;
