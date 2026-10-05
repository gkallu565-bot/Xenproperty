/**
 * Property image storage.
 *
 * Local development : writes to public/uploads and returns a relative URL.
 * Cloud Functions   : writes to a Firebase Storage bucket (the container
 *                     filesystem is ephemeral, so local disk cannot be used)
 *                     and returns a public HTTPS URL.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IS_CLOUD_RUNTIME = Boolean(process.env.K_SERVICE);
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

let bucketPromise;

function getBucket() {
  if (!bucketPromise) {
    const { getApps, initializeApp } = require('firebase-admin/app');
    if (getApps().length === 0) {
      initializeApp({ projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT });
    }
    const { getStorage } = require('firebase-admin/storage');
    const name =
      process.env.PROPERTY_IMAGES_BUCKET ||
      `${process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT}.appspot.com`;
    bucketPromise = getStorage().bucket(name);
  }
  return bucketPromise;
}

/** Validate a multer memory-storage file. Returns an error string or null. */
function validateImage(file) {
  if (!file) return null;
  if (file.size > MAX_BYTES) return 'Image must be 10MB or smaller.';
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return 'Only JPG, PNG, WEBP, GIF or AVIF images are allowed.';
  return null;
}

/**
 * Persist an uploaded image and return the URL to store on the property.
 * Throws on failure so the route can surface a real error.
 */
async function saveImage(file) {
  if (!file) return null;

  const ext = MIME_EXT[file.mimetype] || path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const filename = `prop-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

  if (IS_CLOUD_RUNTIME) {
    const bucket = await getBucket();
    const fileRef = bucket.file(`properties/${filename}`);
    await fileRef.save(file.buffer, {
      resumable: false,
      contentType: file.mimetype || 'image/jpeg',
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    });
    await fileRef.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/properties/${filename}`;
  }

  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), file.buffer);
  return `/uploads/${filename}`;
}

module.exports = { saveImage, validateImage, IS_CLOUD_RUNTIME, MAX_BYTES };