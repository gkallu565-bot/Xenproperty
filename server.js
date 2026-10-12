const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const store = require('./lib/store');
const { saveImage, validateImage, MAX_BYTES } = require('./lib/storage');

const app = express();
const PORT = process.env.PORT || 3000;

// Cloud Functions sets K_SERVICE; treat that as production too.
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE);
const IS_FIRESTORE = (process.env.DB_PROVIDER || 'sqlite').toLowerCase() === 'firestore';

// Firebase Secret Manager injects the secret using the secret's name. Support
// both the configured lowercase name and the conventional uppercase variant,
// while retaining JWT_SECRET for local/CI environments.
const JWT_SECRET = process.env.JWT_SECRET || process.env.xenproperty_jwt || process.env.XENPROPERTY_JWT || 'xenproperty_super_secret_jwt_key_2026';
if (IS_PRODUCTION && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set in production. Refusing to start with the default secret.');
}

// Middleware
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    // The cors package expects a single value/function here; passing the
    // allowlist array directly is not a reliable production configuration.
    // Same-origin requests and server-to-server calls have no Origin header
    // and must remain allowed.
    origin: IS_PRODUCTION
      ? (origin, callback) => {
          if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
          return callback(new Error('Origin is not allowed by XenProperty CORS policy.'));
        }
      : true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Lightweight health endpoint for Firebase/uptime checks. It deliberately
// does not expose database contents or configuration secrets.
app.get('/api/health', (req, res) => {
  res.json({ success: true, service: 'xenproperty-api', status: 'ok' });
});

// Images are held in memory then persisted by lib/storage.js
// (local disk in dev, Cloud Storage in production).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

/* ==========================================================================
   MIDDLEWARE
   ========================================================================== */

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// Admin guard: must be used after authenticateToken.
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Administrator privileges required' });
  }
  next();
};

// Validates a YYYY-MM-DD calendar date (rejects impossible dates like 2026-02-31).
const isValidDateString = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/**
 * Normalises a property row for the public API.
 * Handles amenities / additional_images stored either as JSON strings (SQLite)
 * or as real arrays (Firestore), and adds sensible defaults.
 */
const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80';

function formatProperty(p) {
  let amenities = [];
  let additionalImages = [];
  try { amenities = Array.isArray(p.amenities) ? p.amenities : (p.amenities ? JSON.parse(p.amenities) : []); } catch (e) { amenities = p.amenities ? [p.amenities] : []; }
  try { additionalImages = Array.isArray(p.additional_images) ? p.additional_images : (p.additional_images ? JSON.parse(p.additional_images) : []); } catch (e) { additionalImages = []; }

  return {
    ...p,
    user_id: p.user_id ?? null,
    beds: p.beds ?? 0,
    baths: p.baths ?? 0,
    area_sqft: p.area_sqft ?? 0,
    ai_match_pct: p.ai_match_pct ?? 92,
    location_score: p.location_score ?? 9.0,
    lifestyle_score: p.lifestyle_score ?? 90,
    description: p.description ?? '',
    furnishing: p.furnishing || 'Semi-Furnished',
    is_verified: p.is_verified ?? 1,
    is_featured: p.is_featured ?? 0,
    image_url: p.image_url || DEFAULT_IMAGE,
    amenities: Array.isArray(amenities) ? amenities : [amenities],
    additional_images: Array.isArray(additionalImages) ? additionalImages : [],
  };
}

/* ==========================================================================
   AUTHENTICATION ROUTES
   ========================================================================== */

app.post('/api/auth/register', async (req, res) => {
  try {
    const { full_name, email, password, phone, role } = req.body;
    if (!full_name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please fill all required fields.' });
    }

    const cleanName = String(full_name).trim();
    const normalizedEmail = String(email).toLowerCase().trim();
    if (cleanName.length < 2 || cleanName.length > 80) {
      return res.status(400).json({ success: false, message: 'Name must be between 2 and 80 characters.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }
    if (String(password).length < 6 || String(password).length > 128) {
      return res.status(400).json({ success: false, message: 'Password must be between 6 and 128 characters.' });
    }

    const existingUser = await store.findUserByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // Never trust a client-supplied role: 'admin' cannot be self-assigned at signup.
    const assignedRole = role === 'agent' ? 'agent' : 'user';

    const { id } = await store.createUser({
      full_name: cleanName,
      email: normalizedEmail,
      password_hash: passwordHash,
      phone: phone || '',
      role: assignedRole,
    });

    const user = { id, full_name: cleanName, email: normalizedEmail, role: assignedRole };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      token,
      user,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password.' });
    }

    const user = await store.findUserByEmail(email.toLowerCase().trim());
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const payload = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'Logged in successfully!',
      token,
      user: payload,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await store.findUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error fetching user.' });
  }
});

app.patch('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { full_name, phone } = req.body || {};

    // Only these two fields are editable. email, role and the password hash are
    // never accepted here, so a profile form cannot escalate itself.
    if (full_name === undefined && phone === undefined) {
      return res.status(400).json({ success: false, message: 'There is nothing to update.' });
    }

    if (full_name !== undefined) {
      const name = String(full_name).trim();
      if (name.length < 2 || name.length > 80) {
        return res.status(400).json({
          success: false,
          message: 'Your name must be between 2 and 80 characters.',
        });
      }
    }

    if (phone !== undefined && String(phone).trim() !== '') {
      const digits = String(phone).replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid phone number (7 to 15 digits).',
        });
      }
    }

    const result = await store.updateUser(req.user.id, { full_name, phone });

    // No rows changed means the account no longer exists - the token is valid
    // but the user behind it was deleted.
    if (!result.changes) {
      const stillThere = await store.findUserById(req.user.id);
      if (!stillThere) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }
    }

    const user = await store.findUserById(req.user.id);
    res.json({ success: true, message: 'Profile updated successfully.', user });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ success: false, message: 'Server error updating your profile.' });
  }
});

/* ==========================================================================
   PROPERTIES ROUTES
   ========================================================================== */

// Query-string sanitising.
//
// These arrive as raw strings. Passing Number('abc') = NaN into a SQL LIMIT
// made SQLite throw, which surfaced as HTTP 500. Validate before they reach
// the data layer so bad input is ignored instead of crashing the request.

/** A finite number, or undefined when the value is missing/garbage. */
const toFiniteNumber = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/** A non-negative integer, or undefined. Guards LIMIT/OFFSET. */
const toNonNegativeInt = (value) => {
  const n = toFiniteNumber(value);
  if (n === undefined) return undefined;
  if (n < 0) return undefined;
  return Math.floor(n);
};

/** A short, printable string, or undefined. Used for LIKE/search terms. */
const toCleanString = (value, maxLength = 200) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > maxLength) return undefined;
  return trimmed;
};

/** Only these listing types are recognised; anything else is dropped. */
const LISTING_TYPES = new Set(['buy', 'rent', 'commercial']);

app.get('/api/properties', async (req, res) => {
  try {
    const { type, city, property_type, min_price, max_price, beds, search, sort, limit, offset } = req.query;

    const filters = {
      type: LISTING_TYPES.has(String(type || '').toLowerCase()) ? String(type).toLowerCase() : undefined,
      city: toCleanString(city, 100),
      property_type: toCleanString(property_type, 60),
      min_price: toFiniteNumber(min_price),
      max_price: toFiniteNumber(max_price),
      beds: toCleanString(beds, 4),
      search: toCleanString(search, 120),
      sort: ['price_asc', 'price_desc', 'ai_match', 'location'].includes(sort) ? sort : undefined,
      limit: toNonNegativeInt(limit),
      offset: toNonNegativeInt(offset),
    };

    // Guard against an inverted or nonsensical range.
    if (filters.min_price !== undefined && filters.max_price !== undefined &&
        filters.min_price > filters.max_price) {
      filters.min_price = filters.max_price;
    }
    // A runaway limit should not be able to pull the whole table.
    if (filters.limit === undefined || filters.limit > 200) filters.limit = 200;

    const rows = await store.queryProperties(filters);

    const formatted = rows.map(formatProperty);
    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (err) {
    console.error('Properties fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error retrieving properties.' });
  }
});

app.get('/api/properties/featured', async (req, res) => {
  try {
    const featured = await store.getFeaturedProperties(6);
    res.json({ success: true, data: featured.map(formatProperty) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error retrieving featured properties.' });
  }
});

app.get('/api/properties/:id', async (req, res) => {
  try {
    const property = await store.getPropertyById(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found.' });
    }
    res.json({ success: true, data: formatProperty(property) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error retrieving property details.' });
  }
});

app.post('/api/properties', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const {
      title, listing_type, property_type, price, city, state, address,
      beds, baths, area_sqft, description, amenities, furnishing, image_url
    } = req.body;

    if (!title || !listing_type || !price || !city) {
      return res.status(400).json({ success: false, message: 'Please provide required property details.' });
    }

    const imageError = validateImage(req.file);
    if (imageError) {
      return res.status(400).json({ success: false, message: imageError });
    }

    let finalImageUrl = DEFAULT_IMAGE;
    try {
      const uploaded = await saveImage(req.file);
      if (uploaded) finalImageUrl = uploaded;
      else if (image_url && image_url.trim() !== '') finalImageUrl = image_url.trim();
    } catch (uploadErr) {
      console.error('Image upload error:', uploadErr);
      // Most often the Cloud Storage bucket has not been created yet. Fall back
      // to the URL field rather than failing the whole listing.
      const fallback = image_url && image_url.trim() !== '' ? image_url.trim() : '';
      if (!fallback) {
        return res.status(400).json({
          success: false,
          message:
            'Image upload is unavailable right now. Please paste a direct image URL instead, or try again shortly.',
        });
      }
      finalImageUrl = fallback;
    }

    const numericPrice = Number(price);
    if (!isFinite(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({ success: false, message: 'Please provide a valid positive price.' });
    }

    let priceDisplay = '';
    const normalizedListingType = String(listing_type).toLowerCase();
    if (normalizedListingType === 'rent') {
      priceDisplay = `₹${numericPrice.toLocaleString('en-IN')} / month`;
    } else if (numericPrice >= 10000000) {
      priceDisplay = `₹${(numericPrice / 10000000).toFixed(2)} Cr`;
    } else {
      priceDisplay = `₹${(numericPrice / 100000).toFixed(2)} Lakh`;
    }

    let amenitiesList = [];
    if (Array.isArray(amenities)) {
      amenitiesList = amenities;
    } else if (amenities) {
      amenitiesList = String(amenities).split(',').map((s) => s.trim()).filter(Boolean);
    }

    const aiMatchPct = Math.floor(Math.random() * 8) + 90;
    const locationScore = (Math.floor(Math.random() * 10) + 88) / 10;
    const lifestyleScore = Math.floor(Math.random() * 8) + 89;

    const { id } = await store.createProperty({
      user_id: req.user.id,
      title: String(title).trim(),
      listing_type: normalizedListingType,
      property_type: property_type || 'Apartment',
      price: numericPrice,
      price_display: priceDisplay,
      city: String(city).trim(),
      state: state || 'India',
      address: address || city,
      beds: Number(beds) || 0,
      baths: Number(baths) || 0,
      area_sqft: Number(area_sqft) || 1000,
      image_url: finalImageUrl,
      additional_images: [finalImageUrl],
      ai_match_pct: aiMatchPct,
      location_score: locationScore,
      lifestyle_score: lifestyleScore,
      description: description || '',
      amenities: amenitiesList,
      furnishing: furnishing || 'Semi-Furnished',
      is_verified: 1,
      is_featured: 0,
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });

    res.status(201).json({
      success: true,
      message: 'Property listed successfully!',
      propertyId: id,
    });
  } catch (err) {
    console.error('Create property error:', err);
    res.status(500).json({ success: false, message: 'Server error listing property.' });
  }
});

app.delete('/api/properties/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await store.deleteProperty(req.params.id);
    if (!result.changes) {
      return res.status(404).json({ success: false, message: 'Property not found.' });
    }
    res.json({ success: true, message: 'Property deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error deleting property.' });
  }
});

/* ==========================================================================
   AI PROPERTY ASSISTANT & MATCHMAKER API
   ========================================================================== */

/** Formats a rupee amount the way the rest of the UI does (Cr / Lakh / plain). */
function formatBudget(amount) {
  if (amount >= 10000000) {
    const cr = amount / 10000000;
    return `₹${Number.isInteger(cr) ? cr : cr.toFixed(2).replace(/0$/, '')} Cr`;
  }
  if (amount >= 100000) {
    const lakh = amount / 100000;
    return `₹${Number.isInteger(lakh) ? lakh : lakh.toFixed(1).replace(/\.0$/, '')} Lakh`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

/**
 * Extracts a budget ceiling in rupees from natural language.
 * Handles "1.5 crore", "50 lakh", "20 thousand", "under 40,000", "Rs 1.2 Cr".
 * Scoped to the phrase around the budget keyword so bedroom counts
 * ("2 bhk ... under 40000") are not mistaken for the budget.
 */
function parseBudgetToRupees(text) {
  const lower = text.toLowerCase();

  // Crore: e.g. "1.5 crore", "1.2 cr", "2cr"
  const crore = lower.match(/([\d.,]+)\s*(?:crore|cr)\b/);
  if (crore) {
    const n = parseFloat(crore[1].replace(/,/g, ''));
    if (isFinite(n)) return Math.round(n * 10000000);
  }

  // Lakh: e.g. "50 lakh", "85 lac", "50L"
  const lakh = lower.match(/([\d.,]+)\s*(?:lakhs?|lacs?|l)\b/);
  if (lakh) {
    const n = parseFloat(lakh[1].replace(/,/g, ''));
    if (isFinite(n)) return Math.round(n * 100000);
  }

  // Thousand: e.g. "20 thousand", "20k"
  const thousand = lower.match(/([\d.,]+)\s*(?:thousand|thousands|k)\b/);
  if (thousand) {
    const n = parseFloat(thousand[1].replace(/,/g, ''));
    if (isFinite(n)) return Math.round(n * 1000);
  }

  // Bare number, but only when it directly follows a budget keyword.
  const bare = lower.match(
    /(?:budget|under|below|max(?:imum)?|upto|up to|less than|within|around|below|rs\.?|₹)\s*(?:of\s*|is\s*|₹\s*)?([\d][\d,]*)/i
  );
  if (bare) {
    const n = Number(bare[1].replace(/,/g, ''));
    if (isFinite(n) && n > 0) return n;
  }

  return null;
}

/** True when the message is about renting rather than buying. */
function impliesRent(lower) {
  return /\b(rent|rental|rented|lease|monthly|per month|\/ ?month|tenant)\b/.test(lower);
}

/** True when the message is about buying. */
function impliesBuy(lower) {
  return /\b(buy|purchase|purchasing|acquire|acquisition|own|owner)\b/.test(lower);
}

app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === '') {
      return res.status(400).json({ success: false, message: 'Message is required.' });
    }

    const lower = message.toLowerCase();

    // ---- Filters -----------------------------------------------------------
    const filters = {};
    const understood = [];

    const city = ['bangalore', 'bengaluru', 'mumbai', 'hyderabad', 'pune', 'gurgaon', 'gurugram', 'delhi', 'kochi', 'chennai', 'noida']
      .find((c) => lower.includes(c));
    if (city) {
      filters.city = city;
      understood.push(`in ${city}`);
    }

    if (/\b(1 bed|1bhk|1-bedroom|1 bed|studio)\b/.test(lower)) { filters.beds = '1'; understood.push('1 bedroom'); }
    else if (/\b(2 bed|2bhk|2-bedroom)\b/.test(lower)) { filters.beds = '2'; understood.push('2 bedrooms'); }
    else if (/\b(3 bed|3bhk|3-bedroom)\b/.test(lower)) { filters.beds = '3'; understood.push('3 bedrooms'); }
    else if (/\b(4 bed|4bhk|4-bedroom|4\+|5 bed|5bhk)\b/.test(lower)) { filters.beds = '4'; understood.push('4+ bedrooms'); }

    if (/\bvilla\b|\bindependent house\b/.test(lower)) { filters.property_type = 'villa'; understood.push('villa'); }
    else if (/\bapartment\b|\bflat\b/.test(lower)) { filters.property_type = 'apartment'; understood.push('apartment'); }
    else if (/\bpenthouse\b/.test(lower)) { filters.property_type = 'penthouse'; understood.push('penthouse'); }
    else if (/\bstudio\b/.test(lower)) { filters.property_type = 'studio'; understood.push('studio'); }
    else if (/\bcommercial\b|\boffice\b|\bshop\b|\bshowroom\b|\bwarehouse\b/.test(lower)) { filters.type = 'commercial'; understood.push('commercial'); }
    const wantsCommercial = /\b(commercial|office|shop|showroom|warehouse)\b/.test(lower);

    // ---- Listing type (buy vs rent) ----------------------------------------
    const wantsRent = impliesRent(lower);
    const wantsBuy = impliesBuy(lower);
    const budget = parseBudgetToRupees(message);

    if (wantsRent && !wantsBuy) {
      filters.type = 'rent';
      understood.push('for rent');
    } else if (wantsBuy && !wantsRent) {
      filters.type = 'buy';
      understood.push('for sale');
    } else if (budget && budget >= 1000000) {
      // Crore-scale budgets only make sense for purchases.
      filters.type = 'buy';
      understood.push('for sale');
    } else if (wantsRent && wantsBuy) {
      filters.type = 'buy';
      understood.push('for sale');
    }

    // ---- Budget ------------------------------------------------------------
    if (budget) {
      filters.max_price = budget;
      const isRentScale = wantsRent || (!wantsBuy && budget < 1000000);
      understood.push(`under ${formatBudget(budget)}${isRentScale ? '/month' : ''}`);
    }

    // ---- Run the search ----------------------------------------------------
    filters.sort = 'ai_match';
    let properties = await store.queryProperties(filters);
    const relaxed = [];

    // Nothing matched. Relax one constraint at a time, from least to most
    // important, and always tell the user exactly what was dropped.
    if (properties.length === 0) {
      const ladder = [
        { drop: ['max_price'], label: 'budget' },
        { drop: ['property_type'], label: 'property type' },
        { drop: ['beds'], label: 'bedroom count' },
        { drop: ['city'], label: 'location' },
      ];

      for (const step of ladder) {
        if (!step.drop.some((k) => filters[k] !== undefined)) continue;
        const attempt = { ...filters, sort: 'ai_match' };
        step.drop.forEach((k) => delete attempt[k]);
        properties = await store.queryProperties(attempt);
        if (properties.length) {
          relaxed.push(...step.drop);
          break;
        }
      }

      // Never answer a residential query with commercial listings.
      if (properties.length && !wantsCommercial) {
        const residential = properties.filter((p) => p.listing_type !== 'commercial');
        if (residential.length) properties = residential;
      }
    }

    // Keep responses consistent with the original top-4 behaviour.
    if (properties.length > 4) properties = properties.slice(0, 4);

    const criteria = understood.length ? understood.join(', ') : 'your preferences';

    let responseText;
    if (properties.length === 0) {
      responseText =
        `I could not find a listing matching ${criteria}.` +
        (city
          ? ` Try widening your search beyond ${city}, or browse the full marketplace.`
          : ' Try broadening your search, or browse the full marketplace.');
      return res.json({ success: true, reply: responseText, properties: [], relaxed: [] });
    }

    if (relaxed.length) {
      const RELAX_LABELS = { max_price: 'budget', property_type: 'property type', beds: 'bedroom count', city: 'location' };
      const pretty = relaxed.map((r) => RELAX_LABELS[r] || r);
      responseText =
        `I could not find a listing matching ${criteria}, so these are the closest ` +
        `${properties.length} option${properties.length === 1 ? '' : 's'} available once I relaxed your ` +
        `${pretty.join(' and ')} requirement.`;
    } else {
      responseText =
        `Based on ${criteria}, here ${properties.length === 1 ? 'is' : 'are'} ` +
        `${properties.length} verified propert${properties.length === 1 ? 'y' : 'ies'} that ` +
        `${properties.length === 1 ? 'matches' : 'match'} your requirements:`;
    }

    res.json({
      success: true,
      reply: responseText,
      relaxed,
      properties: properties.map(formatProperty),
    });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ success: false, message: 'Error generating AI recommendations.' });
  }
});

/* ==========================================================================
   INQUIRIES & SITE VISITS
   ========================================================================== */

app.post('/api/inquiries', async (req, res) => {
  try {
    const { property_id, property_title, user_name, user_email, user_phone, visit_date, visit_time, visit_type, message } = req.body;
    if (!user_name || !user_email || !user_phone) {
      return res.status(400).json({ success: false, message: 'Please provide your name, email, and phone number.' });
    }

    if (visit_date && !isValidDateString(visit_date)) {
      return res.status(400).json({ success: false, message: 'Visit date must be a valid calendar date (YYYY-MM-DD).' });
    }

    const { id } = await store.createInquiry({
      property_id: property_id || null,
      property_title: property_title || 'General Inquiry',
      user_name: String(user_name).trim(),
      user_email: String(user_email).trim(),
      user_phone: String(user_phone).trim(),
      visit_date: visit_date || null,
      visit_time: visit_time || null,
      visit_type: visit_type || 'in_person',
      message: message || '',
    });

    res.status(201).json({
      success: true,
      message: 'Your inquiry and visit request have been scheduled! An agent will connect with you within 30 minutes.',
      inquiryId: id,
    });
  } catch (err) {
    console.error('Inquiry error:', err);
    res.status(500).json({ success: false, message: 'Error scheduling inquiry.' });
  }
});

app.get('/api/inquiries', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const inquiries = await store.listInquiries();
    res.json({ success: true, data: inquiries });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching inquiries.' });
  }
});

app.patch('/api/inquiries/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'Status is required.' });
    const result = await store.updateInquiryStatus(req.params.id, status);
    if (!result.changes) {
      return res.status(404).json({ success: false, message: 'Inquiry not found.' });
    }
    res.json({ success: true, message: 'Inquiry status updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating inquiry status.' });
  }
});

/* ==========================================================================
   HOME LOANS API
   ========================================================================== */

app.post('/api/loans/apply', async (req, res) => {
  try {
    const { full_name, email, phone, loan_amount, monthly_income, property_city, employment_type, bank_preference } = req.body;
    if (!full_name || !email || !phone || !loan_amount || !monthly_income) {
      return res.status(400).json({ success: false, message: 'Please provide all required loan application details.' });
    }

    const amount = Number(loan_amount);
    const income = Number(monthly_income);
    if (!isFinite(amount) || amount <= 0 || !isFinite(income) || income <= 0) {
      return res.status(400).json({ success: false, message: 'Loan amount and monthly income must be valid positive numbers.' });
    }

    const { id } = await store.createLoanApplication({
      full_name: String(full_name).trim(),
      email: String(email).trim(),
      phone: String(phone).trim(),
      loan_amount: amount,
      monthly_income: income,
      property_city: property_city || 'Not Specified',
      employment_type: employment_type || 'Salaried',
      bank_preference: bank_preference || 'HDFC Bank',
    });

    const maxEligible = income * 60;
    const isPreApproved = amount <= maxEligible;
    const monthlyRate = 0.085 / 12;
    const pow = Math.pow(1 + monthlyRate, 240);

    res.status(201).json({
      success: true,
      message: 'Loan application submitted successfully!',
      applicationId: id,
      eligibility: {
        isPreApproved,
        maxEligibleAmount: maxEligible,
        estimatedEMI: Math.round((amount * monthlyRate * pow) / (pow - 1)),
      },
    });
  } catch (err) {
    console.error('Loan apply error:', err);
    res.status(500).json({ success: false, message: 'Error processing loan application.' });
  }
});

app.get('/api/loans', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const loans = await store.listLoans();
    res.json({ success: true, data: loans });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error retrieving loan applications.' });
  }
});

app.patch('/api/loans/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'Status is required.' });
    const result = await store.updateLoanStatus(req.params.id, status);
    if (!result.changes) {
      return res.status(404).json({ success: false, message: 'Loan application not found.' });
    }
    res.json({ success: true, message: 'Loan application status updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating loan status.' });
  }
});

/* ==========================================================================
   DESIGN STUDIO API
   ========================================================================== */

app.post('/api/design/request', async (req, res) => {
  try {
    const { full_name, email, phone, service_type, property_area, budget_range, message } = req.body;
    if (!full_name || !email || !phone || !service_type) {
      return res.status(400).json({ success: false, message: 'Please complete all required fields.' });
    }

    const { id } = await store.createDesignRequest({
      full_name: String(full_name).trim(),
      email: String(email).trim(),
      phone: String(phone).trim(),
      service_type,
      property_area: property_area ? Number(property_area) : null,
      budget_range: budget_range || 'Moderate',
      message: message || '',
    });

    res.status(201).json({
      success: true,
      message: 'Design consultation scheduled! Our senior architect will contact you with initial 3D mood boards.',
      requestId: id,
    });
  } catch (err) {
    console.error('Design request error:', err);
    res.status(500).json({ success: false, message: 'Error submitting design request.' });
  }
});

app.get('/api/design/requests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const requests = await store.listDesignRequests();
    res.json({ success: true, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching design requests.' });
  }
});

app.patch('/api/design/requests/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'Status is required.' });
    const result = await store.updateDesignStatus(req.params.id, status);
    if (!result.changes) {
      return res.status(404).json({ success: false, message: 'Design request not found.' });
    }
    res.json({ success: true, message: 'Design request status updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating design request status.' });
  }
});

/* ==========================================================================
   ADMIN STATISTICS API
   ========================================================================== */

app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [totalProperties, totalUsers, totalInquiries, totalLoanApplications, totalDesignRequests] =
      await Promise.all([
        store.countProperties(),
        store.countUsers(),
        store.countInquiries(),
        store.countLoans(),
        store.countDesignRequests(),
      ]);

    res.json({
      success: true,
      stats: {
        totalProperties,
        totalUsers,
        totalInquiries,
        totalLoanApplications,
        totalDesignRequests,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error loading admin stats.' });
  }
});

/* ==========================================================================
   PROFILE DASHBOARD
   ========================================================================== */

/**
 * Everything the "My Profile" page shows, in one request.
 *
 * Scoped to the signed-in user: listings by user_id, and visits / loans /
 * design requests by email. The admin-only list endpoints stay admin-only -
 * this is the visitor's own view of their own records.
 */
app.get('/api/me/dashboard', authenticateToken, async (req, res) => {
  try {
    const user = await store.findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const email = user.email;
    const [listings, inquiries, loans, designs] = await Promise.all([
      store.listPropertiesByUser(req.user.id),
      store.listInquiriesByEmail(email),
      store.listLoansByEmail(email),
      store.listDesignRequestsByEmail(email),
    ]);

    res.json({
      success: true,
      user,
      listings: listings.map(formatProperty),
      inquiries,
      loans,
      designs,
    });
  } catch (err) {
    console.error('Profile dashboard error:', err);
    res.status(500).json({ success: false, message: 'Error loading your profile.' });
  }
});

// Convert upload/parser failures into the same JSON contract as every other
// API failure. Express otherwise emits an HTML error page for multer errors.
app.use((err, req, res, next) => {
  if (!req.path.startsWith('/api')) return next(err);
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'Image must be 10MB or smaller.' });
  }
  if (err && err.message && /image|file|upload/i.test(err.message)) {
    return res.status(400).json({ success: false, message: err.message });
  }
  console.error('Unhandled API error:', err);
  return res.status(500).json({ success: false, message: 'Unexpected server error.' });
});

// Unknown API paths must remain JSON. Without this guard they fall through to
// the SPA index.html, which makes a missing backend route look like a 200.
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API route not found.' });
});

// Single Page application / fallback routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ==========================================================================
   BOOTSTRAP
   ========================================================================== */

// Firestore needs no local schema creation; SQLite needs its tables + seed data.
// database.js (and the native sqlite3 module) is only loaded on the SQLite path
// so production deploys never pull it in.
if (require.main === module || process.env.BOOT_SERVER === '1') {
if (!IS_FIRESTORE) {
  const { initDatabase } = require('./database');
  initDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log('====================================================');
        console.log(` XenProperty Server Running on http://localhost:${PORT}`);
        console.log(' Storage provider: SQLite (local)');
        console.log('====================================================');
      });
    })
    .catch((err) => {
      console.error('Database initialisation failed:', err);
      process.exit(1);
    });
} else {
  app.listen(PORT, () => {
    console.log('====================================================');
    console.log(` XenProperty Server Running on http://localhost:${PORT}`);
    console.log(' Storage provider: Firestore');
    console.log('====================================================');
  });
}
}

module.exports = app;
