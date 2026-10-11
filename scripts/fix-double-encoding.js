/**
 * Repair double-encoded UTF-8 text.
 *
 * At some point a tool read UTF-8 files as Windows-1252 and wrote the result
 * back as UTF-8, which "mangles" characters outside ASCII. A rupee sign
 * (U+20B9, bytes E2 82 B9) becomes the three characters "a-circumflex,
 * single-low-9-quote, superscript-one" - which is what visitors were seeing
 * instead of the price symbol.
 *
 * This script finds every such run and converts it back to the character that
 * was originally intended, by mapping the mangled characters back to their
 * original bytes and decoding those bytes as UTF-8.
 *
 * Usage:  node scripts/fix-double-encoding.js          (report only)
 *         node scripts/fix-double-encoding.js --write  (rewrite files)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.firebase', 'uploads']);
const EXT = /\.(html|js|css|json|md)$/i;
const WRITE = process.argv.includes('--write');

// Windows-1252 codepoints that map back to bytes 0x80-0xBF.
const CP1252_TO_BYTE = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

// Lead characters are bytes >= 0xC2 that cp1252 rendered as a Latin-1 letter.
const isLead = (c) => c >= 0x00c2 && c <= 0x00f4;

// Trail characters are the bytes 0x80-0xBF. Most of those map to themselves in
// cp1252, but 0x80-0x9F are the special characters cp1252 replaces (euro,
// smart quotes, dashes), so they surface as codepoints well above 0xBF.
const isTrail = (c) => (c >= 0x0080 && c <= 0x00bf) || CP1252_TO_BYTE[c] !== undefined;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Find maximal runs of mangled characters and return them with their decoded
 * replacement. Returns null for a run that does not decode to valid UTF-8, so
 * legitimate text (e.g. a real "a-circumflex") is never touched.
 */
function findMojibake(text) {
  const hits = [];
  let i = 0;
  while (i < text.length - 1) {
    if (!isLead(text.charCodeAt(i))) { i++; continue; }

    const bytes = [text.charCodeAt(i)];
    let j = i + 1;
    while (j < text.length && isTrail(text.charCodeAt(j))) {
      bytes.push(text.charCodeAt(j));
      j++;
    }
    if (bytes.length < 2) { i++; continue; }

    // Map each mangled char back to its original byte (identity for ASCII).
    const buf = Buffer.from(bytes.map((c) => {
      const back = CP1252_TO_BYTE[c];
      return back === undefined ? c : back;
    }));
    const decoded = buf.toString('utf8');

    // If the round-trip did not produce valid, non-replacement text, this was
    // legitimate input rather than mojibake.
    if (decoded.includes('�')) { i++; continue; }

    hits.push({ start: i, end: j, bad: text.slice(i, j), good: decoded });
    i = j;
  }
  return hits;
}

const files = walk(ROOT).filter((f) => EXT.test(f) && !f.includes(`${path.sep}scripts${path.sep}fix-double-encoding.js`));
let total = 0;
const summary = [];

for (const file of files) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    continue;
  }

  const hits = findMojibake(text);
  if (!hits.length) continue;

  const rel = path.relative(ROOT, file);
  total += hits.length;

  const kinds = new Map();
  for (const h of hits) {
    const k = `${h.bad} -> ${h.good}`;
    kinds.set(k, (kinds.get(k) || 0) + 1);
  }

  let out = text;
  for (const h of hits.reverse()) {
    out = out.slice(0, h.start) + h.good + out.slice(h.end);
  }

  if (WRITE) fs.writeFileSync(file, out, 'utf8');

  summary.push({ rel, n: hits.length, kinds, firstLine: text.slice(0, hits[0].start).split('\n').length });
}

summary.sort((a, b) => b.n - a.n);
for (const s of summary) {
  console.log(`  ${String(s.n).padStart(3)}  ${s.rel}  (first at line ${s.firstLine})`);
  for (const [k, v] of s.kinds) console.log(`         ${String(v).padStart(3)}x  ${k}`);
}
console.log(`\n  ${WRITE ? 'REPAIRED' : 'FOUND'}: ${total} mojibake run(s) across ${summary.length} file(s)`);
if (!WRITE && total) console.log('  Re-run with --write to apply the fix.');