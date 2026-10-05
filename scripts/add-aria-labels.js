/**
 * Adds accessible names to form controls and icon-only buttons that have none.
 *
 * These are WCAG 4.1.2 (Name, Role, Value) and 3.3.2 (Labels or Instructions)
 * failures: screen readers announce an unlabelled <select> as just "combo box"
 * and an icon-only button as "button". Idempotent - re-running adds nothing.
 *
 *   node scripts/add-aria-labels.js
 */
const fs = require('fs');
const path = require('path');

const HTML_DIR = path.join(__dirname, '..', 'public');

/** id -> accessible name */
const CONTROL_LABELS = {
  // Home hero search
  heroLocation: 'Search location',
  heroPropType: 'Filter by property type',
  heroBudget: 'Filter by budget',
  // Marketplace filters
  filterCity: 'Filter by city',
  filterPropType: 'Filter by property type',
  sortSelect: 'Sort properties',
  // Sell form
  propImageFile: 'Upload property photo',
  // Loans
  loanAmountSlider: 'Loan amount',
  interestRateSlider: 'Interest rate',
  tenureSlider: 'Loan tenure in years',
  loanReqAmount: 'Requested loan amount',
  loanCity: 'Property city',
  loanEmployment: 'Employment type',
  loanBankPref: 'Preferred bank',
  // Contact
  contactCategory: 'Enquiry category',
  // Design studio
  estAreaSlider: 'Carpet area in square feet',
  estPackageSelect: 'Design package',
  consultService: 'Service required',
  // Auth
  regRole: 'Account role',
};

const BTN_LABELS = {
  'mobile-menu-toggle': 'Open navigation menu',
  'fav-drawer-close': 'Close saved properties',
  'ai-popup-close': 'Close XenAI assistant',
  'ai-popup-send': 'Send message to XenAI',
  'chat-send-btn': 'Send message',
  'btn-dock-clear': 'Clear comparison list',
};

/** aria-label for a control that has no id, keyed by a unique marker in its markup. */
const CONTROL_LABELS_BY_MARKER = [
  { file: 'sell.html', marker: 'name="listing_type"', label: 'Listing type' },
  { file: 'sell.html', marker: 'name="property_type"', label: 'Property type' },
  { file: 'sell.html', marker: 'name="price"', label: 'Price' },
];

let changedFiles = 0;
let totalAdded = 0;

function addAttrToTag(tag, attr, value) {
  // Already present?
  if (new RegExp(`\\s${attr}\\s*=`).test(tag)) return null;
  const selfClosing = /\/>\s*$/.test(tag);
  const cut = selfClosing ? tag.length - 2 : tag.length - 1;
  return tag.slice(0, cut) + ` ${attr}="${value}"` + tag.slice(cut);
}

for (const file of fs.readdirSync(HTML_DIR).filter((f) => f.endsWith('.html'))) {
  const full = path.join(HTML_DIR, file);
  let src = fs.readFileSync(full, 'utf8');
  const before = src;
  let added = 0;

  // --- selects / inputs / textareas that carry a known id ---
  src = src.replace(/<(select|input|textarea)\b[^>]*>/gi, (tag) => {
    const idMatch = tag.match(/\bid\s*=\s*"([^"]+)"/i);
    const nameMatch = tag.match(/\bname\s*=\s*"([^"]+)"/i);
    const label = (idMatch && CONTROL_LABELS[idMatch[1]]) ||
      (nameMatch && CONTROL_LABELS[nameMatch[1]]);
    if (!label) return tag;
    if (/\btype\s*=\s*"hidden"/i.test(tag)) return tag;
    const out = addAttrToTag(tag, 'aria-label', label);
    if (out) added++;
    return out || tag;
  });

  // --- id-less controls on sell.html, matched by their name attribute ---
  if (file === 'sell.html') {
    for (const { marker, label } of CONTROL_LABELS_BY_MARKER) {
      const re = new RegExp(`(<(?:select|input)\\b(?![^>]*\\bid=)[^>]*${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*>)`, 'gi');
      src = src.replace(re, (tag) => {
        if (/aria-label/.test(tag)) return tag;
        const out = addAttrToTag(tag, 'aria-label', label);
        if (out) added++;
        return out || tag;
      });
    }
  }

  // --- icon-only buttons identified by class ---
  src = src.replace(/<button\b([^>]*)>/gi, (tag, attrs) => {
    const cls = (tag.match(/class\s*=\s*"([^"]*)"/i) || [])[1] || '';
    for (const [clsName, label] of Object.entries(BTN_LABELS)) {
      if (cls.split(/\s+/).includes(clsName)) {
        const out = addAttrToTag(tag, 'aria-label', label);
        if (out) added++;
        return out || tag;
      }
    }
    return tag;
  });

  if (src !== before) {
    fs.writeFileSync(full, src, 'utf8');
    changedFiles++;
    totalAdded += added;
    console.log(`  ${file}: +${added} aria-label(s)`);
  }
}

console.log(`\n${totalAdded} aria-label attributes added across ${changedFiles} file(s).`);
