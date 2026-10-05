/**
 * One-time migration of the local SQLite database into Firestore.
 *
 *   node scripts/migrate-to-firestore.js [--project xenproperty-5944b] [--force]
 *
 * - Keeps the existing numeric IDs by using them as Firestore document IDs, so
 *   bookmarks and the /api/properties/:id contract stay valid.
 * - Bookkeeping (migration markers, id counters) goes in the separate `_meta`
 *   collection so it never pollutes application-level counts.
 * - Writes a `migrated_<collection>` marker; re-running is a no-op unless
 *   --force is passed.
 * - The local SQLite file is only ever read, never modified.
 */
process.env.DB_PROVIDER = 'sqlite';

const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const FORCE = args.includes('--force');
const PROJECT_ID =
  getArg('--project', process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'xenproperty-5944b');

const COLLECTIONS = {
  users: 'users',
  properties: 'properties',
  inquiries: 'inquiries',
  loans: 'loan_applications',
  design: 'design_requests',
};

function initAdmin() {
  const { initializeApp, getApps } = require('firebase-admin/app');

  if (getApps().length > 0) {
    return require('firebase-admin/firestore').getFirestore();
  }

  // Prefer a short-lived OAuth access token from the Firebase CLI
  // (`firebase auth:print-access-token`) so no service-account key file has to
  // live on disk. Falls back to Application Default Credentials.
  const accessToken = process.env.FIREBASE_ACCESS_TOKEN;
  if (accessToken) {
    const credential = {
      getAccessToken: async () => ({ access_token: accessToken, expires_in: 3600 }),
    };
    initializeApp({ projectId: PROJECT_ID, credential });
  } else {
    initializeApp({ projectId: PROJECT_ID });
  }

  return require('firebase-admin/firestore').getFirestore();
}

/** JSON-string columns become real arrays in Firestore. */
const decodeMaybeJson = (value) => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
};

const TABLE_QUERY = {
  users: 'SELECT * FROM users ORDER BY id',
  properties: 'SELECT * FROM properties ORDER BY id',
  inquiries: 'SELECT * FROM inquiries ORDER BY id',
  loans: 'SELECT * FROM loan_applications ORDER BY id',
  design: 'SELECT * FROM design_requests ORDER BY id',
};

function readSqlite() {
  return new Promise((resolve, reject) => {
    const sqlite3 = require('sqlite3');
    const dbPath = path.resolve(__dirname, '..', 'xenproperty.sqlite');
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(new Error(`Cannot open ${dbPath}: ${err.message}`));
    });

    const out = {};
    let pending = Object.keys(TABLE_QUERY).length;
    if (pending === 0) return resolve(out);

    for (const [key, sql] of Object.entries(TABLE_QUERY)) {
      db.all(sql, (err, rows) => {
        if (err) {
          db.close();
          return reject(err);
        }
        out[key] = rows;
        if (--pending === 0) {
          db.close();
          resolve(out);
        }
      });
    }
  });
}

/** Sanitise a SQLite row into a Firestore-safe document. */
function toDocument(row, kind) {
  const doc = { ...row };

  // Drop undefined / null ids; Firestore forbids undefined values.
  Object.keys(doc).forEach((k) => {
    if (doc[k] === undefined) delete doc[k];
  });

  if (kind === 'properties') {
    const amenities = decodeMaybeJson(doc.amenities);
    const additional = decodeMaybeJson(doc.additional_images);
    if (amenities) doc.amenities = amenities;
    if (additional) doc.additional_images = additional;
    // The AI matcher filters on listing_type; keep it indexed-friendly.
    if (typeof doc.listing_type === 'string') doc.listing_type = doc.listing_type.toLowerCase();
  }

  if (kind === 'users') {
    // Never copy the password hash into a client-readable doc shape by accident;
    // it must stay, but we make the intent explicit.
    doc.password_hash = doc.password_hash;
  }

  return doc;
}

async function alreadyMigrated(db, collection) {
  const snap = await db.collection('_meta').doc(`migrated_${collection}`).get();
  return snap.exists;
}

async function migrate() {
  console.log(`\nXenProperty -> Firestore migration`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Mode:    ${FORCE ? 'FORCE (overwrites marker)' : 'skip if already migrated'}\n`);

  const data = await readSqlite();
  const db = initAdmin();

  const summary = [];
  let anyWritten = false;

  for (const [kind, collection] of Object.entries(COLLECTIONS)) {
    const rows = data[kind] || [];

    if (!FORCE && (await alreadyMigrated(db, collection))) {
      console.log(`  [skip] ${collection.padEnd(20)} already migrated`);
      summary.push(`${collection}: skipped (already migrated)`);
      continue;
    }

    if (rows.length === 0) {
      console.log(`  [warn] ${collection.padEnd(20)} no rows in SQLite`);
      continue;
    }

    const batch = db.batch();
    for (const row of rows) {
      const id = String(row.id);
      batch.set(db.collection(collection).doc(id), toDocument(row, kind));
    }
    batch.set(db.collection('_meta').doc(`migrated_${collection}`), {
      migratedAt: new Date().toISOString(),
      source: 'xenproperty.sqlite',
      rowCount: rows.length,
      tool: 'scripts/migrate-to-firestore.js',
    });

    await batch.commit();
    anyWritten = true;
    console.log(`  [ok]   ${collection.padEnd(20)} ${rows.length} documents`);
    summary.push(`${collection}: ${rows.length} documents`);
  }

  // Point the id allocator past the migrated rows so new inserts don't collide.
  if (anyWritten) {
    const counters = db.batch();
    for (const [kind, collection] of Object.entries(COLLECTIONS)) {
      const rows = data[kind] || [];
      const maxId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
      counters.set(db.collection('_meta').doc(`ids_${collection}`), { next: maxId });
    }
    await counters.commit();
    console.log('\n  [ok]   id counters advanced past migrated rows');
  }

  console.log(`\nDone.${FORCE ? '' : ' Re-running is safe (marker documents).'}\n`);
  return summary;
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nMigration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });