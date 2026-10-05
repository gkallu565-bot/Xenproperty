/**
 * SQLite-backed implementation of the XenProperty data-access layer.
 * Used for local development. Behaviour is identical to the original
 * inline SQL in server.js.
 */
const { dbRun, dbAll, dbGet } = require('../database');

/**
 * Defence in depth: never hand a non-finite number to SQLite.
 * SQLite rejects NaN with a datatype error, which would surface as HTTP 500.
 */
const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const int = (value) => {
  const n = num(value);
  if (n === undefined || n < 0) return undefined;
  return Math.floor(n);
};

/* ---------------------------------- users --------------------------------- */

const findUserByEmail = (email) =>
  dbGet('SELECT * FROM users WHERE email = ?', [email]);

const findUserById = (id) =>
  dbGet('SELECT id, full_name, email, phone, role, created_at FROM users WHERE id = ?', [id]);

async function createUser({ full_name, email, password_hash, phone, role }) {
  const result = await dbRun(
    'INSERT INTO users (full_name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)',
    [full_name, email, password_hash, phone || '', role]
  );
  return { id: result.lastID };
}

const countUsers = async () => (await dbGet('SELECT COUNT(*) as count FROM users')).count;

/* ------------------------------- properties ------------------------------- */

async function queryProperties(filters = {}) {
  const { type, city, property_type, min_price, max_price, beds, search, sort, limit, offset } = filters;

  let sql = 'SELECT * FROM properties WHERE 1=1';
  const params = [];

  if (type && type !== 'all') {
    sql += ' AND listing_type = ?';
    params.push(type.toLowerCase());
  }

  if (city && city !== 'all' && city.trim() !== '') {
    sql += ' AND (LOWER(city) LIKE ? OR LOWER(address) LIKE ?)';
    params.push(`%${city.toLowerCase().trim()}%`, `%${city.toLowerCase().trim()}%`);
  }

  if (property_type && property_type !== 'all' && property_type.trim() !== '') {
    sql += ' AND LOWER(property_type) = ?';
    params.push(property_type.toLowerCase().trim());
  }

  if (min_price !== undefined && num(min_price) !== undefined) {
    sql += ' AND price >= ?';
    params.push(num(min_price));
  }

  if (max_price !== undefined && num(max_price) !== undefined) {
    sql += ' AND price <= ?';
    params.push(num(max_price));
  }

  if (beds && beds !== 'all') {
    const bedsNum = parseInt(beds, 10);
    if (bedsNum >= 4) {
      sql += ' AND beds >= 4';
    } else if (!isNaN(bedsNum)) {
      sql += ' AND beds = ?';
      params.push(bedsNum);
    }
  }

  if (search && search.trim() !== '') {
    const q = `%${search.toLowerCase().trim()}%`;
    sql += ' AND (LOWER(title) LIKE ? OR LOWER(city) LIKE ? OR LOWER(state) LIKE ? OR LOWER(address) LIKE ? OR LOWER(description) LIKE ?)';
    params.push(q, q, q, q, q);
  }

  if (sort === 'price_asc') {
    sql += ' ORDER BY price ASC';
  } else if (sort === 'price_desc') {
    sql += ' ORDER BY price DESC';
  } else if (sort === 'ai_match') {
    sql += ' ORDER BY ai_match_pct DESC';
  } else if (sort === 'location') {
    sql += ' ORDER BY location_score DESC';
  } else {
    sql += ' ORDER BY is_featured DESC, id DESC';
  }

  const safeLimit = int(limit);
  const safeOffset = int(offset);

  if (safeLimit !== undefined) {
    sql += ' LIMIT ?';
    params.push(safeLimit);
    if (safeOffset !== undefined && safeOffset > 0) {
      sql += ' OFFSET ?';
      params.push(safeOffset);
    }
  }

  return dbAll(sql, params);
}

const getFeaturedProperties = (limit = 6) =>
  dbAll('SELECT * FROM properties WHERE is_featured = 1 ORDER BY id ASC LIMIT ?', [limit]);

const getPropertyById = (id) => dbGet('SELECT * FROM properties WHERE id = ?', [id]);

async function createProperty(data) {
  const result = await dbRun(
    `INSERT INTO properties (
      user_id, title, listing_type, property_type, price, price_display, city, state, address,
      beds, baths, area_sqft, image_url, additional_images, ai_match_pct, location_score,
      lifestyle_score, description, amenities, furnishing, is_verified, is_featured
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
    [
      data.user_id ?? null,
      data.title,
      data.listing_type,
      data.property_type || 'Apartment',
      data.price,
      data.price_display,
      data.city,
      data.state,
      data.address,
      data.beds,
      data.baths,
      data.area_sqft,
      data.image_url,
      data.additional_images,
      data.ai_match_pct,
      data.location_score,
      data.lifestyle_score,
      data.description,
      data.amenities,
      data.furnishing,
    ]
  );
  return { id: result.lastID };
}

async function deleteProperty(id) {
  const result = await dbRun('DELETE FROM properties WHERE id = ?', [id]);
  return { changes: result.changes };
}

const countProperties = async () => (await dbGet('SELECT COUNT(*) as count FROM properties')).count;

/* -------------------------------- inquiries ------------------------------- */

async function createInquiry(data) {
  const result = await dbRun(
    `INSERT INTO inquiries (
      property_id, property_title, user_name, user_email, user_phone,
      visit_date, visit_time, visit_type, message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.property_id || null,
      data.property_title || 'General Inquiry',
      data.user_name,
      data.user_email,
      data.user_phone,
      data.visit_date || null,
      data.visit_time || null,
      data.visit_type || 'in_person',
      data.message || '',
    ]
  );
  return { id: result.lastID };
}

const listInquiries = () => dbAll('SELECT * FROM inquiries ORDER BY id DESC');

async function updateInquiryStatus(id, status) {
  const result = await dbRun('UPDATE inquiries SET status = ? WHERE id = ?', [status, id]);
  return { changes: result.changes };
}

const countInquiries = async () => (await dbGet('SELECT COUNT(*) as count FROM inquiries')).count;

/* ---------------------------------- loans --------------------------------- */

async function createLoanApplication(data) {
  const result = await dbRun(
    `INSERT INTO loan_applications (
      full_name, email, phone, loan_amount, monthly_income,
      property_city, employment_type, bank_preference
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.full_name,
      data.email,
      data.phone,
      data.loan_amount,
      data.monthly_income,
      data.property_city,
      data.employment_type,
      data.bank_preference,
    ]
  );
  return { id: result.lastID };
}

const listLoans = () => dbAll('SELECT * FROM loan_applications ORDER BY id DESC');

async function updateLoanStatus(id, status) {
  const result = await dbRun('UPDATE loan_applications SET status = ? WHERE id = ?', [status, id]);
  return { changes: result.changes };
}

const countLoans = async () => (await dbGet('SELECT COUNT(*) as count FROM loan_applications')).count;

/* --------------------------------- design --------------------------------- */

async function createDesignRequest(data) {
  const result = await dbRun(
    `INSERT INTO design_requests (
      full_name, email, phone, service_type, property_area, budget_range, message
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.full_name,
      data.email,
      data.phone,
      data.service_type,
      data.property_area,
      data.budget_range,
      data.message,
    ]
  );
  return { id: result.lastID };
}

const listDesignRequests = () => dbAll('SELECT * FROM design_requests ORDER BY id DESC');

async function updateDesignStatus(id, status) {
  const result = await dbRun('UPDATE design_requests SET status = ? WHERE id = ?', [status, id]);
  return { changes: result.changes };
}

const countDesignRequests = async () =>
  (await dbGet('SELECT COUNT(*) as count FROM design_requests')).count;

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  countUsers,
  queryProperties,
  getFeaturedProperties,
  getPropertyById,
  createProperty,
  deleteProperty,
  countProperties,
  createInquiry,
  listInquiries,
  updateInquiryStatus,
  countInquiries,
  createLoanApplication,
  listLoans,
  updateLoanStatus,
  countLoans,
  createDesignRequest,
  listDesignRequests,
  updateDesignStatus,
  countDesignRequests,
};