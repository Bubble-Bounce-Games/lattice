// Restore a Lattice export into one signed-in AWS library, keeping IDs/dates.
// node scripts/import-aws.mjs export.json --email person@example.com --apply
// The password is prompted without echo and is never written to a file.
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { isDeepStrictEqual } from 'node:util';

const args = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1];
const filename = args[0];
const email = args.includes('--email') ? value('--email').trim().toLowerCase() : '';
if (!filename || !email)
  throw new Error(
    'Usage: node scripts/import-aws.mjs export.json --email person@example.com [--apply] [--resolve IP]',
  );
const data = JSON.parse(readFileSync(filename, 'utf8'));
const entries = Array.isArray(data) ? data : data.entries;
if (!Array.isArray(entries) || !entries.length) throw new Error('The export contains no entries.');
console.log(
  `Prepared ${entries.length} entries for ${email}; original IDs and dates will be preserved.`,
);
if (!args.includes('--apply')) {
  console.log('Dry run. Add --apply to sign in and import.');
  process.exit(0);
}
if (!process.stdin.isTTY) throw new Error('Run in a terminal to enter the password securely.');
process.stdout.write('Password: ');
const muted = new Writable({
  write(_chunk, _encoding, callback) {
    callback();
  },
});
const terminal = createInterface({ input: process.stdin, output: muted, terminal: true });
let password;
try {
  password = await terminal.question('');
} finally {
  terminal.close();
  process.stdout.write('\n');
}

const origin = 'https://lattice.abhijeet-anand.com';
const resolveIp = args.includes('--resolve') ? value('--resolve') : undefined;
let cookie = '';
async function api(path, method = 'GET', body) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const result = await new Promise((resolve, reject) => {
    const request = httpsRequest(
      new URL(path, origin),
      {
        method,
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(resolveIp
          ? {
              lookup: (_host, options, callback) =>
                options.all
                  ? callback(null, [{ address: resolveIp, family: 4 }])
                  : callback(null, resolveIp, 4),
            }
          : {}),
        timeout: 30000,
      },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          text += chunk;
        });
        response.on('end', () => {
          try {
            resolve({
              status: response.statusCode,
              headers: response.headers,
              body: JSON.parse(text),
            });
          } catch {
            reject(new Error(`The API returned a non-JSON response (${response.statusCode}).`));
          }
        });
        response.on('error', reject);
      },
    );
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('Request timed out.')));
    request.end(payload);
  });
  if (result.status < 200 || result.status >= 300)
    throw new Error(
      `Request failed (${result.status}): ${result.body.error ?? 'Unknown API error'}`,
    );
  return result;
}

try {
  const signedIn = await api('/api/signin', 'POST', { email, password });
  password = undefined;
  if (signedIn.body.username !== email)
    throw new Error('The API returned a different account. Import stopped.');
  cookie =
    signedIn.headers['set-cookie']
      ?.find((value) => value.startsWith('__Host-lattice-session='))
      ?.split(';')[0] ?? '';
  if (!cookie) throw new Error('The API did not return a session. Import stopped.');
  const before = (await api('/api/export')).body.entries;
  const byId = new Map(before.map((entry) => [entry.id, entry]));
  // Stop on a conflicting existing ID, so an old edited record cannot be
  // silently treated as a successful restore. Nothing has been written yet.
  for (const entry of entries)
    if (byId.has(entry.id) && !isDeepStrictEqual(byId.get(entry.id), entry))
      throw new Error(`An existing entry differs from the export (${entry.id}). Import stopped.`);
  const batches = [];
  let batch = [];
  for (const entry of entries) {
    if (Buffer.byteLength(JSON.stringify({ entries: [entry] })) > 240000)
      throw new Error(`Entry ${entry.id} exceeds the import request limit.`);
    if (
      batch.length &&
      (batch.length >= 100 ||
        Buffer.byteLength(JSON.stringify({ entries: [...batch, entry] })) > 240000)
    ) {
      batches.push(batch);
      batch = [];
    }
    batch.push(entry);
  }
  if (batch.length) batches.push(batch);
  let imported = 0,
    skipped = 0;
  for (const entries of batches) {
    const result = (await api('/api/import', 'POST', { entries })).body;
    imported += result.imported;
    skipped += result.skipped;
  }
  const restored = new Map(
    (await api('/api/export')).body.entries.map((entry) => [entry.id, entry]),
  );
  for (const entry of entries)
    if (!isDeepStrictEqual(restored.get(entry.id), entry))
      throw new Error(
        `Verification failed for ${entry.id}; the backup is unchanged. Re-running skips already imported records.`,
      );
  console.log(
    `Verified ${entries.length} entries: ${imported} imported, ${skipped} already present. Content, IDs, added dates, and edited dates match the export.`,
  );
} finally {
  password = undefined;
  if (cookie)
    await api('/api/signout', 'POST', {}).catch(() =>
      console.log('Import session could not be signed out; it will expire automatically.'),
    );
  cookie = '';
}
