/**
 * Static file server - reproduces a Firebase Hosting deploy with no Cloud
 * Functions behind it, so /api/* 404s and public/js/api.js falls back to the
 * in-browser demo backend.
 *
 * Used by scripts/e2e-demo.js. Not part of the site itself.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3100);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);

    // No API here - this is the point of the exercise.
    if (url.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end('<!doctype html><title>404</title>Not Found');
    }

    let file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!path.resolve(file).startsWith(path.resolve(ROOT))) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(ROOT, 'index.html');
    }

    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`static demo server on http://localhost:${PORT}`));