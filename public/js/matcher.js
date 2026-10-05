/**
 * Shared property matching / AI-matchmaker logic for demo (browser) mode.
 *
 * This mirrors the rules implemented in server.js (/api/ai/chat) so the demo
 * produces the same answers as the real backend. Keep the two in sync if you
 * change either.
 */

const xenFormatBudget = (amount) => {
  if (amount >= 10000000) {
    const cr = amount / 10000000;
    return `₹${Number.isInteger(cr) ? cr : cr.toFixed(2).replace(/0$/, '')} Cr`;
  }
  if (amount >= 100000) {
    const lakh = amount / 100000;
    return `₹${Number.isInteger(lakh) ? lakh : lakh.toFixed(1).replace(/\.0$/, '')} Lakh`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
};

/** Extract a budget ceiling in rupees from natural language. */
const xenParseBudget = (text) => {
  const lower = text.toLowerCase();

  const crore = lower.match(/([\d.,]+)\s*(?:crore|cr)\b/);
  if (crore) {
    const n = parseFloat(crore[1].replace(/,/g, ''));
    if (isFinite(n)) return Math.round(n * 10000000);
  }

  const lakh = lower.match(/([\d.,]+)\s*(?:lakhs?|lacs?|l)\b/);
  if (lakh) {
    const n = parseFloat(lakh[1].replace(/,/g, ''));
    if (isFinite(n)) return Math.round(n * 100000);
  }

  const thousand = lower.match(/([\d.,]+)\s*(?:thousand|thousands|k)\b/);
  if (thousand) {
    const n = parseFloat(thousand[1].replace(/,/g, ''));
    if (isFinite(n)) return Math.round(n * 1000);
  }

  // Bare number, but only when it directly follows a budget keyword - so
  // "2 bhk ... under 40000" is not read as a budget of 2.
  const bare = lower.match(
    /(?:budget|under|below|max(?:imum)?|upto|up to|less than|within|around|rs\.?|₹)\s*(?:of\s*|is\s*|₹\s*)?([\d][\d,]*)/i
  );
  if (bare) {
    const n = Number(bare[1].replace(/,/g, ''));
    if (isFinite(n) && n > 0) return n;
  }

  return null;
};

const CITIES = ['bangalore', 'bengaluru', 'mumbai', 'hyderabad', 'pune', 'gurgaon',
  'gurugram', 'delhi', 'kochi', 'chennai', 'noida'];

const impliesRent = (l) => /\b(rent|rental|rented|lease|monthly|per month|\/ ?month|tenant)\b/.test(l);
const impliesBuy = (l) => /\b(buy|purchase|purchasing|acquire|acquisition|own|owner)\b/.test(l);

const includes = (hay, needle) => String(hay || '').toLowerCase().includes(needle);

/**
 * Run a match against a property array.
 * @returns {{reply:string, properties:Array, relaxed:string[], criteria:string}}
 */
const xenMatch = (message, properties) => {
  const lower = String(message || '').toLowerCase();
  const filters = {};
  const understood = [];

  const city = CITIES.find((c) => lower.includes(c));
  if (city) { filters.city = city; understood.push(`in ${city}`); }

  if (/\b(1 bed|1bhk|1-bedroom|studio)\b/.test(lower)) { filters.beds = 1; understood.push('1 bedroom'); }
  else if (/\b(2 bed|2bhk|2-bedroom)\b/.test(lower)) { filters.beds = 2; understood.push('2 bedrooms'); }
  else if (/\b(3 bed|3bhk|3-bedroom)\b/.test(lower)) { filters.beds = 3; understood.push('3 bedrooms'); }
  else if (/\b(4 bed|4bhk|4-bedroom|4\+|5 bed|5bhk)\b/.test(lower)) { filters.beds = 4; understood.push('4+ bedrooms'); }

  const wantsCommercial = /\b(commercial|office|shop|showroom|warehouse)\b/.test(lower);

  if (/\bvilla\b|\bindependent house\b/.test(lower)) { filters.property_type = 'villa'; understood.push('villa'); }
  else if (/\bapartment\b|\bflat\b/.test(lower)) { filters.property_type = 'apartment'; understood.push('apartment'); }
  else if (/\bpenthouse\b/.test(lower)) { filters.property_type = 'penthouse'; understood.push('penthouse'); }
  else if (/\bstudio\b/.test(lower)) { filters.property_type = 'studio'; understood.push('studio'); }
  else if (wantsCommercial) { filters.type = 'commercial'; understood.push('commercial'); }

  const wantsRent = impliesRent(lower);
  const wantsBuy = impliesBuy(lower);
  const budget = xenParseBudget(lower);

  if (wantsRent && !wantsBuy) { filters.type = 'rent'; understood.push('for rent'); }
  else if (wantsBuy && !wantsRent) { filters.type = 'buy'; understood.push('for sale'); }
  else if (budget && budget >= 1000000) { filters.type = 'buy'; understood.push('for sale'); }

  if (budget) {
    filters.max_price = budget;
    const isRentScale = wantsRent || (!wantsBuy && budget < 1000000);
    understood.push(`under ${xenFormatBudget(budget)}${isRentScale ? '/month' : ''}`);
  }

  const apply = (f) => xenFilterProperties(properties, f);

  let results = apply(filters);
  const relaxed = [];

  if (results.length === 0) {
    const ladder = [
      { drop: ['max_price'], label: 'budget' },
      { drop: ['property_type'], label: 'property type' },
      { drop: ['beds'], label: 'bedroom count' },
      { drop: ['city'], label: 'location' },
    ];
    for (const step of ladder) {
      if (!step.drop.some((k) => filters[k] !== undefined)) continue;
      const attempt = { ...filters };
      step.drop.forEach((k) => delete attempt[k]);
      const got = apply(attempt);
      if (got.length) { relaxed.push(step.label); results = got; break; }
    }
    if (results.length && !wantsCommercial) {
      const residential = results.filter((p) => p.listing_type !== 'commercial');
      if (residential.length) results = residential;
    }
  }

  if (results.length > 4) results = results.slice(0, 4);

  const criteria = understood.length ? understood.join(', ') : 'your preferences';

  if (results.length === 0) {
    return {
      reply: `I could not find a listing matching ${criteria}.` +
        (city ? ` Try widening your search beyond ${city}, or browse the full marketplace.` : ' Try broadening your search, or browse the full marketplace.'),
      properties: [],
      relaxed: [],
      criteria,
    };
  }

  let reply;
  if (relaxed.length) {
    reply = `I could not find a listing matching ${criteria}, so these are the closest ` +
      `${results.length} option${results.length === 1 ? '' : 's'} available once I relaxed your ` +
      `${relaxed.join(' and ')} requirement.`;
  } else {
    reply = `Based on ${criteria}, here ${results.length === 1 ? 'is' : 'are'} ` +
      `${results.length} verified propert${results.length === 1 ? 'y' : 'ies'} that ` +
      `${results.length === 1 ? 'matches' : 'match'} your requirements:`;
  }

  return { reply, properties: results, relaxed, criteria };
};

/** Filter + sort a property array the same way the SQL layer does. */
const xenFilterProperties = (properties, f = {}) => {
  let rows = properties.slice();

  if (f.type && f.type !== 'all') {
    rows = rows.filter((p) => p.listing_type === String(f.type).toLowerCase());
  }
  if (f.city && f.city !== 'all' && String(f.city).trim() !== '') {
    const needle = String(f.city).toLowerCase().trim();
    rows = rows.filter((p) => includes(p.city, needle) || includes(p.address, needle));
  }
  if (f.property_type && f.property_type !== 'all' && String(f.property_type).trim() !== '') {
    const needle = String(f.property_type).toLowerCase().trim();
    rows = rows.filter((p) => String(p.property_type || '').toLowerCase() === needle);
  }
  if (f.min_price) rows = rows.filter((p) => p.price >= Number(f.min_price));
  if (f.max_price) rows = rows.filter((p) => p.price <= Number(f.max_price));
  if (f.beds && f.beds !== 'all') {
    const n = parseInt(f.beds, 10);
    if (n >= 4) rows = rows.filter((p) => (p.beds || 0) >= 4);
    else if (!isNaN(n)) rows = rows.filter((p) => p.beds === n);
  }
  if (f.search && String(f.search).trim() !== '') {
    const needle = String(f.search).toLowerCase().trim();
    rows = rows.filter((p) =>
      includes(p.title, needle) || includes(p.city, needle) || includes(p.state, needle) ||
      includes(p.address, needle) || includes(p.description, needle));
  }

  if (f.sort === 'price_asc') rows.sort((a, b) => a.price - b.price);
  else if (f.sort === 'price_desc') rows.sort((a, b) => b.price - a.price);
  else if (f.sort === 'ai_match') rows.sort((a, b) => (b.ai_match_pct || 0) - (a.ai_match_pct || 0));
  else if (f.sort === 'location') rows.sort((a, b) => (b.location_score || 0) - (a.location_score || 0));
  else rows.sort((a, b) => (b.is_featured || 0) - (a.is_featured || 0) || b.id - a.id);

  if (f.limit) {
    const start = f.offset ? Number(f.offset) : 0;
    rows = rows.slice(start, start + Number(f.limit));
  }
  return rows;
};

window.xenMatch = xenMatch;
window.xenFilterProperties = xenFilterProperties;
window.xenFormatBudget = xenFormatBudget;
