/* Direct Firestore REST client for the test admin console.
 * No Express API or Cloud Function is used here. Firestore rules currently
 * allow public access for testing only; lock them down before production.
 */
(function () {
  const PROJECT_ID = 'xenpro-855a3';
  const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  function encode(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (typeof value === 'object') {
      const fields = {};
      Object.keys(value).forEach((key) => { fields[key] = encode(value[key]); });
      return { mapValue: { fields } };
    }
    return { stringValue: String(value) };
  }

  function decode(field) {
    if (!field) return null;
    if ('nullValue' in field) return null;
    if ('stringValue' in field) return field.stringValue;
    if ('integerValue' in field) return Number(field.integerValue);
    if ('doubleValue' in field) return field.doubleValue;
    if ('booleanValue' in field) return field.booleanValue;
    if ('timestampValue' in field) return field.timestampValue;
    if ('arrayValue' in field) return (field.arrayValue.values || []).map(decode);
    if ('mapValue' in field) return fromFields(field.mapValue.fields || {});
    return null;
  }

  function fromFields(fields) {
    const result = {};
    Object.keys(fields || {}).forEach((key) => { result[key] = decode(fields[key]); });
    return result;
  }

  function documentToObject(doc) {
    const data = fromFields(doc.fields || {});
    const name = String(doc.name || '').split('/').pop();
    if (data.id === undefined) data.id = /^\d+$/.test(name) ? Number(name) : name;
    return data;
  }

  async function request(url, options) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options && options.headers) } });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) { /* handled below */ }
    if (!response.ok) throw new Error(body.error?.message || `Firestore request failed (${response.status})`);
    return body;
  }

  async function list(collection) {
    const body = await request(`${ROOT}/${encodeURIComponent(collection)}?pageSize=1000`, { method: 'GET' });
    return (body.documents || []).map(documentToObject);
  }

  async function create(collection, data) {
    const id = String(data.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    const clean = { ...data, id: /^\d+$/.test(id) ? Number(id) : id, created_at: data.created_at || new Date().toISOString() };
    const body = { fields: {} };
    Object.keys(clean).forEach((key) => { body.fields[key] = encode(clean[key]); });
    return documentToObject(await request(`${ROOT}/${encodeURIComponent(collection)}?documentId=${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(body) }));
  }

  async function update(collection, id, data) {
    const body = { fields: {} };
    Object.keys(data).forEach((key) => { body.fields[key] = encode(data[key]); });
    return documentToObject(await request(`${ROOT}/${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}`, { method: 'PATCH', body: JSON.stringify(body) }));
  }

  async function remove(collection, id) {
    await request(`${ROOT}/${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
  }

  window.firestoreDirect = { list, create, update, remove };
})();
