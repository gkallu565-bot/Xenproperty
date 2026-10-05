/**
 * Cloud Functions entry point for XenProperty.
 *
 * Firebase Hosting serves the static frontend from public/ and rewrites
 * /api/** to this function, so the browser only ever talks to /api.
 */
const functions = require('firebase-functions');
const app = require('./server');

const REGION = process.env.FUNCTIONS_REGION || 'asia-south1';

exports.api = functions
  .runWith({
    // Image uploads and the AI matcher both do a little work before responding.
    timeoutSeconds: 60,
    memory: '512MB',
  })
  .https.onRequest({ region: REGION, cors: true }, app);