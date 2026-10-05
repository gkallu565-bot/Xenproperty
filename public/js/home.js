// Home Page Controller
let currentSearchTab = 'buy';

document.addEventListener('DOMContentLoaded', () => {
  initSearchTabs();
  loadFeaturedProperties();
  initAIChat();
});

// Search Tab Switcher (Buy | Rent | Commercial)
function initSearchTabs() {
  const tabs = document.querySelectorAll('.search-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentSearchTab = tab.getAttribute('data-tab');
    });
  });

  const searchForm = document.getElementById('homeSearchForm');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      executeSearch();
    });
  }
}

function executeSearch() {
  const location = document.getElementById('heroLocation').value;
  const propertyType = document.getElementById('heroPropType').value;
  const budget = document.getElementById('heroBudget').value;

  const targetPage = currentSearchTab === 'rent' ? 'rent.html' : 'buy.html';
  const queryParams = new URLSearchParams();
  
  if (currentSearchTab) queryParams.append('type', currentSearchTab);
  if (location && location !== 'all') queryParams.append('city', location);
  if (propertyType && propertyType !== 'all') queryParams.append('property_type', propertyType);
  if (budget && budget !== 'all') {
    const parts = budget.split('-');
    if (parts[0]) queryParams.append('min_price', parts[0]);
    if (parts[1]) queryParams.append('max_price', parts[1]);
  }

  window.location.href = `${targetPage}?${queryParams.toString()}`;
}

// Load Featured Properties
async function loadFeaturedProperties() {
  try {
    const res = await api.getFeaturedProperties();
    const properties = res.data || [];
    if (properties.length === 0) return;

    // First property is the large hero card
    const heroProp = properties[0];
    const heroCard = document.getElementById('featuredHeroCard');
    if (heroCard && heroProp) {
      const isHeroFav = xenFavorites.isFavorite(heroProp.id);
      const heroPropJson = JSON.stringify(heroProp).replace(/"/g, '&quot;');
      heroCard.style.backgroundImage = `url('${heroProp.image_url}')`;
      heroCard.onclick = () => viewPropertyDetails(heroProp.id);
      heroCard.innerHTML = `
        <div class="prop-badge-row">
          <span class="badge-verified"><i class="fa-solid fa-circle-check"></i> Verified</span>
          <div class="badge-favorite ${isHeroFav ? 'active' : ''}" data-id="${heroProp.id}" onclick="event.stopPropagation(); xenFavorites.toggleFavorite(${heroPropJson}, this)">
            <i class="${isHeroFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
          </div>
        </div>
        <div class="hero-prop-info">
          <h3>${escapeHtml(heroProp.title)}</h3>
          <p class="hero-prop-location">${escapeHtml(heroProp.city)}, ${escapeHtml(heroProp.state)}</p>
          <div class="hero-prop-price-specs">
            <div class="hero-prop-price">${escapeHtml(heroProp.price_display)}</div>
            <div class="hero-prop-specs">
              <span><i class="fa-solid fa-bed"></i> ${heroProp.beds} Beds</span>
              <span><i class="fa-solid fa-bath"></i> ${heroProp.baths} Baths</span>
              <span><i class="fa-solid fa-vector-square"></i> ${heroProp.area_sqft} sq.ft.</span>
            </div>
          </div>
        </div>
      `;
    }

    // Next 2 properties are the stacked side cards
    const sideStack = document.getElementById('featuredSideStack');
    if (sideStack) {
      const sideProps = properties.slice(1, 3);
      sideStack.innerHTML = sideProps.map(p => {
        const isFav = xenFavorites.isFavorite(p.id);
        const pJson = JSON.stringify(p).replace(/"/g, '&quot;');
        return `
          <div class="side-property-card" onclick="viewPropertyDetails(${p.id})">
            <div class="side-prop-thumb" style="background-image: url('${escapeHtml(p.image_url)}');">
              <span class="badge-verified"><i class="fa-solid fa-circle-check"></i> Verified</span>
            </div>
            <div class="side-prop-details">
              <div class="side-prop-header">
                <div>
                  <h4>${escapeHtml(p.title)}</h4>
                  <div class="prop-city">${escapeHtml(p.city)}, ${escapeHtml(p.state)}</div>
                </div>
                <div class="badge-favorite ${isFav ? 'active' : ''}" data-id="${p.id}" onclick="event.stopPropagation(); xenFavorites.toggleFavorite(${pJson}, this)" style="width:28px; height:28px; font-size:0.78rem;">
                  <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                </div>
              </div>
              <div class="side-prop-price">${escapeHtml(p.price_display)}</div>
              <div class="side-prop-meta">
                <span><i class="fa-solid fa-bed"></i> ${p.beds} Beds</span>
                <span><i class="fa-solid fa-bath"></i> ${p.baths} Baths</span>
                <span><i class="fa-solid fa-vector-square"></i> ${p.area_sqft} sq.ft.</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    xenFavorites.syncHeartIcons();
  } catch (err) {
    console.error('Error loading featured properties:', err);
  }
}

function toggleFav(el, prop = null) {
  if (prop) {
    xenFavorites.toggleFavorite(prop, el);
  } else {
    el.classList.toggle('active');
  }
}

// AI Matchmaker Chat & Property Cards
function initAIChat() {
  const form = document.getElementById('aiChatForm');
  const input = document.getElementById('aiChatInput');
  const messagesBox = document.getElementById('aiChatMessages');
  if (!form || !input || !messagesBox) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) return;

    // Append user message
    appendChatMessage('user', query);
    input.value = '';

    // Typing placeholder
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'chat-bubble ai';
    typingIndicator.id = 'aiTypingBubble';
    typingIndicator.innerHTML = `
      <div class="chat-avatar"><i class="fa-solid fa-robot"></i></div>
      <div class="chat-text"><em>AI is finding optimal properties...</em></div>
    `;
    messagesBox.appendChild(typingIndicator);
    messagesBox.scrollTop = messagesBox.scrollHeight;

    try {
      const res = await api.askAI(query);
      typingIndicator.remove();

      appendChatMessage('ai', res.reply);

      // Render updated matches on the right
      if (res.properties && res.properties.length > 0) {
        renderAIMatches(res.properties);
      }
    } catch (err) {
      typingIndicator.remove();
      appendChatMessage('ai', 'I apologize, could you try phrasing your search again with a city or budget?');
    }
  });
}

function appendChatMessage(sender, text) {
  const messagesBox = document.getElementById('aiChatMessages');
  if (!messagesBox) return;

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${sender}`;
  const icon = sender === 'ai' ? 'fa-robot' : 'fa-user';
  bubble.innerHTML = `
    <div class="chat-avatar"><i class="fa-solid ${icon}"></i></div>
    <div class="chat-text">${escapeHtml(text)}</div>
  `;
  messagesBox.appendChild(bubble);
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

function renderAIMatches(properties) {
  const container = document.getElementById('aiMatchesGrid');
  if (!container) return;

  container.innerHTML = properties.slice(0, 3).map(p => `
    <div class="ai-prop-card" onclick="viewPropertyDetails(${p.id})">
      <div class="ai-prop-thumb" style="background-image: url('${p.image_url}');">
        <span style="position:absolute; top:6px; left:6px; background:rgba(15,91,70,0.9); color:#fff; font-size:0.65rem; font-weight:800; padding:2px 8px; border-radius:999px;">
          ${p.ai_match_pct}% Match
        </span>
      </div>
      <div class="ai-prop-details">
        <h5>${escapeHtml(p.title)}</h5>
        <div class="ai-prop-price-tag">${escapeHtml(p.price_display)}</div>
        <div class="ai-score-bars">
          <div class="score-bar-row">
            <span>Location</span>
            <strong>${p.location_score * 10}%</strong>
          </div>
          <div class="score-bar-row">
            <span>Lifestyle</span>
            <strong>${p.lifestyle_score}%</strong>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

// Quick trigger for "Ask AI" in hero search bar
function triggerAskAIFocus() {
  const chatInput = document.getElementById('aiChatInput');
  const section = document.getElementById('aiAssistantSection');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
      if (chatInput) {
        chatInput.focus();
        chatInput.placeholder = "e.g., 3 BHK villa in Bangalore under 1.5 Cr";
      }
    }, 500);
  }
}
