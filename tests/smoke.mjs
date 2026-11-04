import assert from 'node:assert/strict';
const base = process.env.LATTICE_TEST_URL || 'http://127.0.0.1:3000';
const token = `Lattice verification ${crypto.randomUUID()}`;
let saved;
async function api(path, method = 'GET', body, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    result = text;
  }
  return { status: response.status, result, headers: response.headers };
}
try {
  const input = {
    title: token,
    types: ['ARTICLE', 'PODCAST'],
    sourceTag: 'Lattice verification',
    summary: '**Retained summary**\n\n- A durable note',
    link: 'https://example.com/notes',
  };
  assert.equal((await api('/api/entries', 'POST', { ...input, title: ' ' })).status, 400);
  assert.equal(
    (await api('/api/entries', 'POST', input, { Origin: 'https://untrusted.example' })).status,
    403,
  );
  const create = await api('/api/entries', 'POST', input);
  assert.equal(create.status, 201);
  saved = create.result;
  assert.deepEqual(saved.types, input.types);
  const read = await api(`/api/entries/${saved.id}`);
  assert.deepEqual(read.result, saved);
  const search = await api(
    `/api/entries?query=${encodeURIComponent(token.toUpperCase())}&type=PODCAST&source=Lattice%20verification`,
  );
  assert.equal(search.result.total, 1);
  assert.equal(search.result.entries[0].id, saved.id);
  assert.ok(search.headers.get('cache-control').includes('no-store'));
  const update = await api(`/api/entries/${saved.id}`, 'PUT', {
    ...input,
    title: `${token} edited`,
    expectedUpdatedAt: saved.updatedAt,
  });
  assert.equal(update.status, 200);
  const old = saved;
  saved = update.result;
  assert.equal(saved.createdAt, old.createdAt);
  assert.notEqual(saved.updatedAt, old.updatedAt);
  assert.equal(
    (await api(`/api/entries/${saved.id}`, 'PUT', { ...input, expectedUpdatedAt: old.updatedAt }))
      .status,
    409,
  );
  const sources = await api('/api/sources');
  assert.ok(sources.result.some((s) => s.sourceKey === 'lattice verification' && s.count >= 1));
  const exported = await api('/api/export');
  assert.ok(exported.result.entries.some((e) => e.id === saved.id));
  assert.equal(
    (await api(`/api/entries/${saved.id}`, 'DELETE', { expectedUpdatedAt: old.updatedAt })).status,
    409,
  );
  assert.equal(
    (await api(`/api/entries/${saved.id}`, 'DELETE', { expectedUpdatedAt: saved.updatedAt }))
      .status,
    200,
  );
  assert.equal((await api(`/api/entries/${saved.id}`)).status, 404);
  saved = undefined;
  console.log(
    'PASS: HTTP create, validation, CSRF rejection, reread, multi-type search, source filter, edit, conflict protection, export, delete, and no-store responses.',
  );
} finally {
  if (saved)
    await api(`/api/entries/${saved.id}`, 'DELETE', { expectedUpdatedAt: saved.updatedAt });
}
