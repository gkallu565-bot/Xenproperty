/**
 * Cloud Functions entry point for XenProperty.
 *
 * Firebase Hosting serves the static frontend from public/ and rewrites
 * /api/** to this function, so the browser only ever talks to /api.
 */
// Explicit v1 import keeps the Express onRequest adapter compatible with the
// firebase-functions v6 package. The root package no longer exposes the old
// functions.region() chain used by v1 examples.
const { onRequest } = require('firebase-functions/v1/https');

// The deployed function is the production backend, not the local SQLite
// server. Set these before requiring server.js because its store selector and
// production safety checks run during module initialisation.
process.env.NODE_ENV = 'production';
process.env.DB_PROVIDER = 'firestore';
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || [
  'https://xenpro-855a3.web.app',
  'https://xenpro-855a3.firebaseapp.com',
].join(',');

const app = require('./server');

const REGION = process.env.FUNCTIONS_REGION || 'asia-south1';

exports.api = onRequest({
  region: REGION,
  // Image uploads and the AI matcher both do a little work before responding.
  timeoutSeconds: 60,
  memory: '512MB',
  secrets: ['xenproperty_jwt'],
}, app);
