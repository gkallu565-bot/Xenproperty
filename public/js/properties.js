// Marketplace Controller for buy.html & rent.html
let activeFilters = {
  type: 'buy',
  city: '',
  property_type: '',
  beds: '',
  min_price: '',
  max_price: '',
  sort: 'is_featured',
  search: ''
};

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('rent')) activeFilters.type = 'rent';
  // Read URL params
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('type')) activeFilters.type = urlParams.get('type');
  if (urlParams.has('city')) activeFilters.city = urlParams.get('city');
  if (urlParams.has('property_type')) activeFilters.property_type = urlParams.get('property_type');
  if (urlParams.has('min_price')) activeFilters.min_price = urlParams.get('min_price');
  if (urlParams.has('max_price')) activeFilters.max_price = urlParams.get('max_price');
  if (urlParams.has('beds')) activeFilters.beds = urlParams.get('beds');
  if (urlParams.has('search')) activeFilters.search = urlParams.get('search');
  if (urlParams.has('sort')) activeFilters.sort = urlParams.get('sort');

  syncFilterUI();
  loadProperties();
  initFilterEvents();
});

function syncFilterUI() {
  const citySelect = document.getElementById('filterCity');
  if (citySelect && activeFilters.city) citySelect.value = activeFilters.city;

  const typeSelect = document.getElementById('filterPropType');
  if (typeSelect && activeFilters.property_type) typeSelect.value = activeFilters.property_type;

  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect && activeFilters.sort) sortSelect.value = activeFilters.sort;

  const searchBox = document.getElementById('filterSearch');
  if (searchBox && activeFilters.search) searchBox.value = activeFilters.search;

  // Active chips for BHK
  if (activeFilters.beds) {
    document.querySelectorAll('.bhk-chip').forEach(chip => {
      if (chip.getAttribute('data-beds') === activeFilters.beds) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }
}

function initFilterEvents() {
  const citySelect = document.getElementById('filterCity');
  if (citySelect) {
    citySelect.addEventListener('change', () => {
      activeFilters.city = citySelect.value;
      loadProperties();
    });
  }

  const typeSelect = document.getElementById('filterPropType');
  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      activeFilters.property_type = typeSelect.value;
      loadProperties();
    });
  }

  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      activeFilters.sort = sortSelect.value;
      loadProperties();
    });
  }

  const searchBox = document.getElementById('filterSearch');
  if (searchBox) {
    let timeout = null;
    searchBox.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        activeFilters.search = searchBox.value.trim();
        loadProperties();
      }, 400);
    });
  }

  // BHK Chips
  document.querySelectorAll('.bhk-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.bhk-chip').forEach(c => c.classList.remove('active'));
      const val = chip.getAttribute('data-beds');
      if (activeFilters.beds === val) {
        activeFilters.beds = '';
      } else {
        chip.classList.add('active');
        activeFilters.beds = val;
      }
      loadProperties();
    });
  });

  // Price presets
  document.querySelectorAll('.price-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.price-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const min = btn.getAttribute('data-min');
      const max = btn.getAttribute('data-max');
      activeFilters.min_price = min || '';
      activeFilters.max_price = max || '';
      loadProperties();
    });
  });
}

function resetFilters() {
  activeFilters = {
    type: window.location.pathname.includes('rent') ? 'rent' : 'buy',
    city: '',
    property_type: '',
    beds: '',
    min_price: '',
    max_price: '',
    sort: 'is_featured',
    search: ''
  };
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  const citySelect = document.getElementById('filterCity');
  if (citySelect) citySelect.value = 'all';
  const typeSelect = document.getElementById('filterPropType');
  if (typeSelect) typeSelect.value = 'all';
  const searchBox = document.getElementById('filterSearch');
  if (searchBox) searchBox.value = '';
  loadProperties();
}

async function loadProperties() {
  const container = document.getElementById('propertiesGrid');
  const countSpan = document.getElementById('propertyResultsCount');
  if (!container) return;

  container.innerHTML = `
    <div style="grid-column: 1/-1; text-align:center; padding: 60px 0;">
      <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:var(--primary);"></i>
      <p style="margin-top:12px; color:var(--text-muted);">Finding properties matching your criteria...</p>
    </div>
  `;

  try {
    const res = await api.getProperties(activeFilters);
    const properties = res.data || [];

    if (countSpan) {
      countSpan.innerText = `${properties.length} Properties Found`;
    }

    if (properties.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding: 60px 20px; background:#ffffff; border-radius:16px; border:1px solid #e5ebe7;">
          <i class="fa-solid fa-house-circle-xmark" style="font-size:3rem; color:#9ca3af; margin-bottom:14px;"></i>
          <h3 style="font-size:1.2rem; font-weight:700; color:#111827;">No matching properties found</h3>
          <p style="color:#6b7280; font-size:0.9rem; margin:6px 0 18px 0;">Try broadening your budget or clearing filters to view available listings.</p>
          <button onclick="resetFilters()" class="btn-hero-primary" style="padding:10px 22px; font-size:0.88rem;">Reset All Filters</button>
        </div>
      `;
      return;
    }

    container.innerHTML = properties.map(p => {
      const isFav = xenFavorites.isFavorite(p.id);
      const isComp = xenComparison.isInCompare(p.id);
      const pJson = JSON.stringify(p).replace(/"/g, '&quot;');

      return `
        <div class="marketplace-card" onclick="viewPropertyDetails(${p.id})">
          <div class="market-card-img" style="background-image: url('${escapeHtml(p.image_url)}');">
            <span class="badge-verified" style="position:absolute; top:12px; left:12px;">
              <i class="fa-solid fa-circle-check"></i> Verified
            </span>
            <div class="badge-favorite ${isFav ? 'active' : ''}" data-id="${p.id}" onclick="event.stopPropagation(); xenFavorites.toggleFavorite(${pJson}, this)" style="position:absolute; top:12px; right:12px;">
              <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
            </div>
            <span style="position:absolute; bottom:12px; left:12px; background:rgba(15,91,70,0.92); color:#fff; font-size:0.75rem; font-weight:800; padding:3px 10px; border-radius:999px;">
              <i class="fa-solid fa-sparkles"></i> ${p.ai_match_pct}% Match
            </span>
          </div>

          <div class="market-card-body">
            <div>
              <div style="font-size:0.76rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">
                ${escapeHtml(p.property_type)} • ${escapeHtml(p.city)}
              </div>
              <h3 class="market-card-title">${escapeHtml(p.title)}</h3>
              <p style="font-size:0.8rem; color:#6b7280; margin-top:2px;">
                <i class="fa-solid fa-location-dot" style="color:var(--primary);"></i> ${escapeHtml(p.address)}${p.pincode ? ` · ${escapeHtml(p.pincode)}` : ''}
              </p>
            </div>

            <div class="market-card-price">${escapeHtml(p.price_display)}</div>

            <div class="market-card-specs">
              <span><i class="fa-solid fa-bed"></i> ${p.beds || 'N/A'} Beds</span>
              <span><i class="fa-solid fa-bath"></i> ${p.baths || 'N/A'} Baths</span>
              <span><i class="fa-solid fa-vector-square"></i> ${p.area_sqft} sq.ft.</span>
            </div>

            <div class="market-card-footer">
              <button class="btn-card-compare ${isComp ? 'active' : ''}" data-id="${p.id}" onclick="event.stopPropagation(); xenComparison.toggleCompare(${pJson}, this)">
                <i class="fa-solid ${isComp ? 'fa-check' : 'fa-code-compare'}"></i> ${isComp ? 'Compared' : 'Compare'}
              </button>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:0.78rem; font-weight:700; color:var(--primary);">
                  <i class="fa-solid fa-star" style="color:#f59e0b;"></i> ${p.location_score}/10
                </span>
                <button class="btn-hero-primary" style="padding:7px 14px; font-size:0.78rem;" onclick="event.stopPropagation(); viewPropertyDetails(${p.id})">
                  Details <i class="fa-solid fa-arrow-right" style="margin-left:4px;"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    xenFavorites.syncHeartIcons();
    xenComparison.syncCompareButtons();
  } catch (err) {
    container.innerHTML = `<div style="grid-column:1/-1; color:#ef4444; text-align:center; padding:40px;">Error: ${escapeHtml(err.message)}</div>`;
  }
}
