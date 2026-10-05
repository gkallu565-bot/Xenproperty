/**
 * Firestore-backed implementation of the XenProperty data-access layer.
 * Used in production (Firebase Hosting + Cloud Functions).
 *
 * DESIGN NOTES
 * ------------
 * - Documents keep the legacy numeric `id` as their Firestore document ID so
 *   that existing links (/buy.html?id=7, /api/properties/7) keep working and
 *   the SQLite -> Firestore migration is lossless.
 * - Firestore has no SQL LIKE, so substring matching (city / address / title /
 *   description) is applied in memory after the query, mirroring the original
 *   SQLite semantics. This is fine at the current data volume. If the catalogue
 *   grows into the tens of thousands, move search to Algolia / Typesense and
 *   keep this file as the fallback path.
 * - Only single-field equality filters are pushed down to Firestore, so no
 *   composite indexes are required for the app to function.
 * - Timestamps are converted to 'YYYY-MM-DD HH:MM:SS' strings to match the
 *   format the frontend already expects from SQLite.
 */
const { getFirestore } = require('firebase-admin/firestore');

const COLLECTIONS = {
  users: 'users',
  properties: 'properties',
  inquiries: 'inquiries',
  loans: 'loan_applications',
  design: 'design_requests',
};

// Internal bookkeeping (id counters, migration markers) lives here so it is
// never included in application-level counts or listings.
const META = '_meta';

let db;

function ensureApp() {
  // Cloud Functions initialises the default app for us; standalone runs
  // (emulator, migration script) must do it themselves.
  const { getApps, initializeApp } = require('firebase-admin/app');
  if (getApps().length === 0) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT });
  }
}

function getDb() {
  if (!db) {
    ensureApp();
    db = getFirestore();
  }
  return db;
}

/* --------------------------------- helpers -------------------------------- */

/** Firestore Timestamp -> 'YYYY-MM-DD HH:MM:SS' (matches SQLite output). */
function toSqlDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') {
    const d = value.toDate();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  }
  return null;
}

/** Normalise stored JSON-string-or-array columns into real arrays. */
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch (e) {
      return [value];
    }
  }
  return [];
}

/** Strip Firestore internals and coerce types to the public API contract. */
function normalise(doc, data) {
  if (!doc) return null;
  const out = { id: doc.id, ...data };
  if ('created_at' in data) out.created_at = toSqlDate(data.created_at);
  if ('amenities' in data) out.amenities = toArray(data.amenities);
  if ('additional_images' in data) out.additional_images = toArray(data.additional_images);
  return out;
}

/**
 * Allocate the next numeric id for a collection, mirroring SQLite AUTOINCREMENT.
 * The counter lives in the separate `_meta` collection so it can never be
 * mistaken for a real record by count() or list queries.
 */
async function nextId(collection) {
  const ref = getDb().collection(META).doc(`ids_${collection}`);
  return getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data().next || 0 : 0;
    const next = current + 1;
    tx.set(ref, { next }, { merge: true });
    return next;
  });
}

async function insertDoc(collection, data) {
  const id = await nextId(collection);
  await getDb().collection(collection).doc(String(id)).set({ ...data, id });
  return { id };
}

/** Apply sort + limit/offset in memory (matches original ORDER BY semantics). */
function applySortAndPaging(rows, { sort, limit, offset }) {
  const sorted = [...rows];
  if (sort === 'price_asc') sorted.sort((a, b) => a.price - b.price);
  else if (sort === 'price_desc') sorted.sort((a, b) => b.price - a.price);
  else if (sort === 'ai_match') sorted.sort((a, b) => (b.ai_match_pct || 0) - (a.ai_match_pct || 0));
  else if (sort === 'location') sorted.sort((a, b) => (b.location_score || 0) - (a.location_score || 0));
  else sorted.sort((a, b) => (b.is_featured || 0) - (a.is_featured || 0) || b.id - a.id);

  // slice(NaN, NaN) silently returns [] - an invalid limit must be ignored,
  // not turned into an empty result set.
  const safeOffset = int(offset) || 0;
  const safeLimit = int(limit);
  if (safeLimit === undefined) return sorted.slice(safeOffset);
  return sorted.slice(safeOffset, safeOffset + safeLimit);
}

const includes = (haystack, needle) =>
  String(haystack || '').toLowerCase().includes(needle);

/** Coerce to a finite number, or undefined. Never let NaN reach a where() clause. */
const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/** Non-negative integer, or undefined. Guards slice bounds. */
const int = (value) => {
  const n = num(value);
  if (n === undefined || n < 0) return undefined;
  return Math.floor(n);
};

/* ---------------------------------- users --------------------------------- */

async function findUserByEmail(email) {
  const snap = await getDb().collection(COLLECTIONS.users).where('email', '==', email).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return normalise(doc, doc.data());
}

async function findUserById(id) {
  const doc = await getDb().collection(COLLECTIONS.users).doc(String(id)).get();
  if (!doc.exists) return null;
  return normalise(doc, doc.data());
}

const createUser = (data) => insertDoc(COLLECTIONS.users, data);

const countUsers = () => countCollection(COLLECTIONS.users);

/* ------------------------------- properties ------------------------------- */

async function queryProperties(filters = {}) {
  const { type, city, property_type, min_price, max_price, beds, search, sort, limit, offset } = filters;

  // Push down the single indexed equality filter that Firestore can serve natively.
  let base = getDb().collection(COLLECTIONS.properties);
  if (type && type !== 'all') base = base.where('listing_type', '==', String(type).toLowerCase());

  const snap = await base.get();
  let rows = snap.docs.map((d) => normalise(d, d.data()));

  if (city && city !== 'all' && String(city).trim() !== '') {
    const needle = String(city).toLowerCase().trim();
    rows = rows.filter((p) => includes(p.city, needle) || includes(p.address, needle));
  }

  if (property_type && property_type !== 'all' && String(property_type).trim() !== '') {
    const needle = String(property_type).toLowerCase().trim();
    rows = rows.filter((p) => String(p.property_type || '').toLowerCase() === needle);
  }

  const minP = num(min_price);
  const maxP = num(max_price);
  if (minP !== undefined) rows = rows.filter((p) => p.price >= minP);
  if (maxP !== undefined) rows = rows.filter((p) => p.price <= maxP);

  if (beds && beds !== 'all') {
    const bedsNum = parseInt(beds, 10);
    if (bedsNum >= 4) rows = rows.filter((p) => (p.beds || 0) >= 4);
    else if (!isNaN(bedsNum)) rows = rows.filter((p) => p.beds === bedsNum);
  }

  if (search && String(search).trim() !== '') {
    const needle = String(search).toLowerCase().trim();
    rows = rows.filter(
      (p) =>
        includes(p.title, needle) ||
        includes(p.city, needle) ||
        includes(p.state, needle) ||
        includes(p.address, needle) ||
        includes(p.description, needle)
    );
  }

  return applySortAndPaging(rows, { sort, limit, offset });
}

async function getFeaturedProperties(limit = 6) {
  const snap = await getDb()
    .collection(COLLECTIONS.properties)
    .where('is_featured', '==', 1)
    .get();
  const rows = snap.docs.map((d) => normalise(d, d.data()));
  rows.sort((a, b) => a.id - b.id);
  return rows.slice(0, limit);
}

async function getPropertyById(id) {
  const doc = await getDb().collection(COLLECTIONS.properties).doc(String(id)).get();
  if (!doc.exists) return null;
  return normalise(doc, doc.data());
}

const createProperty = (data) => insertDoc(COLLECTIONS.properties, data);

async function deleteProperty(id) {
  const ref = getDb().collection(COLLECTIONS.properties).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return { changes: 0 };
  await ref.delete();
  return { changes: 1 };
}

async function countProperties() {
  const snap = await getDb().collection(COLLECTIONS.properties).count().get();
  return snap.data().count;
}

/* -------------------------------- inquiries ------------------------------- */

const createInquiry = (data) => insertDoc(COLLECTIONS.inquiries, data);
const listInquiries = () => listDesc(COLLECTIONS.inquiries);

async function updateInquiryStatus(id, status) {
  const ref = getDb().collection(COLLECTIONS.inquiries).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return { changes: 0 };
  await ref.update({ status });
  return { changes: 1 };
}

const countInquiries = () => countCollection(COLLECTIONS.inquiries);

/* ---------------------------------- loans --------------------------------- */

const createLoanApplication = (data) => insertDoc(COLLECTIONS.loans, data);
const listLoans = () => listDesc(COLLECTIONS.loans);

async function updateLoanStatus(id, status) {
  const ref = getDb().collection(COLLECTIONS.loans).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return { changes: 0 };
  await ref.update({ status });
  return { changes: 1 };
}

const countLoans = () => countCollection(COLLECTIONS.loans);

/* --------------------------------- design --------------------------------- */

const createDesignRequest = (data) => insertDoc(COLLECTIONS.design, data);
const listDesignRequests = () => listDesc(COLLECTIONS.design);

async function updateDesignStatus(id, status) {
  const ref = getDb().collection(COLLECTIONS.design).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return { changes: 0 };
  await ref.update({ status });
  return { changes: 1 };
}

const countDesignRequests = () => countCollection(COLLECTIONS.design);

/* ------------------------------ shared helpers ---------------------------- */

async function listDesc(collection) {
  const snap = await getDb().collection(collection).get();
  const rows = snap.docs.map((d) => normalise(d, d.data()));
  rows.sort((a, b) => b.id - a.id);
  return rows;
}

async function countCollection(collection) {
  const snap = await getDb().collection(collection).count().get();
  return snap.data().count;
}

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