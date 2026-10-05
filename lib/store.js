/**
 * Storage backend selector.
 *
 * DB_PROVIDER=firestore  -> lib/store.firestore.js   (production / Cloud Functions)
 * default                -> lib/store.sqlite.js      (local development)
 */
const PROVIDER = (process.env.DB_PROVIDER || 'sqlite').toLowerCase();

const store = PROVIDER === 'firestore' ? require('./store.firestore') : require('./store.sqlite');

module.exports = store;