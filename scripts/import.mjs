// Imports a JSON file of articles, or a Lattice export from Settings, into the local library.
//
//   npm run db:import -- <file.json>           show what would be imported
//   npm run db:import -- <file.json> --apply   write the new entries
//
// Reads a top-level array or the list under "articles", "items", or "entries". Each record
// needs a title, source (or sourceTag), and summary; link is optional. key_points become a
// "Key points" list at the top of the summary. The date added comes from date (YYYY-MM-DD)
// or createdAt (ISO timestamp, as in an export). Types come from type/types when present;
// otherwise "podcast" in the text means Podcast, a video-site link means Video, and anything
// else is an Article. Fields the library cannot store are listed, not silently dropped.
// Entries already in the library (same link, or same title and source when there is no
// link) are skipped, so re-running is safe. Validation and derived columns mirror
// src/features/knowledge; tests/import.test.ts checks them against that code.
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com'];
// Source-name typos, corrected only when the link confirms the intended source.
const SOURCE_FIXES = { LESG: { to: 'LSEG', host: 'lseg.com' } };
const TYPE_NAMES = {
  article: 'ARTICLE',
  podcast: 'PODCAST',
  book: 'BOOK',
  video: 'VIDEO',
  other: 'OTHER',
};
const STORED_FIELDS = new Set([
  'id',
  'title',
  'source',
  'sourceTag',
  'type',
  'types',
  'summary',
  'key_points',
  'link',
  'date',
  'createdAt',
  'updatedAt',
]);

const normalizeText = (value) => value.normalize('NFKC').toLowerCase();
const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const onHost = (host, domain) => host === domain || host.endsWith(`.${domain}`);
function hostOf(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
function isSafeWebUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (
      ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
    );
  } catch {
    return false;
  }
}
function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
function isIsoTimestamp(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}
function dedupeKey(link, title, sourceKey) {
  return link ? `link:${link}` : `title:${sourceKey}\n${title}`;
}

/** The records in a file: a top-level array, or the list under articles, items, or entries. */
export function recordsOf(data) {
  if (Array.isArray(data)) return data;
  return [data?.articles, data?.items, data?.entries].find(Array.isArray) ?? null;
}

/** Record fields the library has nowhere to store. */
export function unstoredFields(records) {
  const fields = records.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r) : []));
  return [...new Set(fields)].filter((field) => !STORED_FIELDS.has(field));
}

export function classifyTypes({ title, summary, link }) {
  const types = [];
  if (/\bpodcast\b/i.test(`${title}\n${summary}\n${link}`)) types.push('PODCAST');
  if (VIDEO_HOSTS.some((domain) => onHost(hostOf(link), domain))) types.push('VIDEO');
  return types.length ? types : ['ARTICLE'];
}

/** Maps one record to a library entry and lists anything that stops it being imported. */
export function toEntry(input) {
  const record = input && typeof input === 'object' ? input : {};
  const text = (value) => String(value ?? '').trim();
  const points = Array.isArray(record.key_points)
    ? record.key_points.map(text).filter(Boolean)
    : [];
  const summary = text(record.summary);
  const entry = {
    title: text(record.title),
    types: [],
    sourceTag: text(record.source ?? record.sourceTag),
    summary: points.length
      ? ['## Key points', ...points.map((point) => `- ${point}`), '', summary].join('\n').trim()
      : summary,
    link: text(record.link),
  };
  const problems = [];
  const givenTypes = record.types ?? record.type;
  if (givenTypes === undefined || givenTypes === null || givenTypes === '') {
    entry.types = classifyTypes(entry);
  } else {
    const names = (Array.isArray(givenTypes) ? givenTypes : [givenTypes]).map(text);
    const unknown = names.filter((name) => !TYPE_NAMES[name.toLowerCase()]);
    if (unknown.length) problems.push(`unknown type ${unknown.map((t) => `"${t}"`).join(', ')}`);
    entry.types = [...new Set(names.map((name) => TYPE_NAMES[name.toLowerCase()]))].filter(Boolean);
    if (!names.length) problems.push('no type');
  }
  const notes = [];
  const fix = SOURCE_FIXES[entry.sourceTag];
  if (fix && onHost(hostOf(entry.link), fix.host)) {
    notes.push(`source "${entry.sourceTag}" corrected to "${fix.to}"`);
    entry.sourceTag = fix.to;
  }
  if (!entry.title) problems.push('no title');
  else if (entry.title.length > 300) problems.push('title too long');
  if (!entry.sourceTag) problems.push('no source');
  else if (entry.sourceTag.length > 120) problems.push('source too long');
  if (!entry.summary) problems.push('empty summary');
  else if (entry.summary.length > 50000) problems.push('summary too long');
  if (entry.link.length > 2048 || !isSafeWebUrl(entry.link)) problems.push('invalid link');
  const date = text(record.date);
  const created = text(record.createdAt);
  let createdAt = new Date().toISOString();
  if (date) {
    if (isCalendarDate(date)) createdAt = `${date}T12:00:00.000Z`;
    else problems.push('invalid date');
  } else if (created) {
    if (isIsoTimestamp(created)) createdAt = created;
    else problems.push('invalid createdAt');
  }
  const updated = text(record.updatedAt);
  const updatedAt = isIsoTimestamp(updated) && updated >= createdAt ? updated : createdAt;
  return { entry, createdAt, updatedAt, notes, problems };
}

/**
 * An INSERT that does nothing when the entry is already in the library.
 * @param {ReturnType<typeof toEntry>} planned
 * @param {string} [id]
 */
export function insertStatement({ entry, createdAt, updatedAt = createdAt }, id = randomUUID()) {
  const sourceKey = normalizeText(entry.sourceTag);
  const values = [
    id,
    entry.title,
    JSON.stringify(entry.types),
    entry.sourceTag,
    sourceKey,
    entry.summary,
    normalizeText([entry.title, entry.sourceTag, entry.summary].join('\n')),
    entry.link,
    createdAt,
    updatedAt,
  ].map(sqlString);
  const existing = entry.link
    ? `link = ${sqlString(entry.link)}`
    : `link = '' AND title = ${sqlString(entry.title)} AND source_key = ${sqlString(sourceKey)}`;
  return `INSERT INTO knowledge_entries (id, title, types, source_tag, source_key, summary, search_text, link, created_at, updated_at) SELECT ${values.join(', ')} WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE ${existing});`;
}

function d1(args) {
  return spawnSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'site-creator-d1',
      '--local',
      '--config',
      'wrangler.local.jsonc',
    ].concat(args, '--json'),
    { encoding: 'utf8' },
  );
}

function main([file, flag]) {
  const apply = flag === '--apply';
  if (!file || (flag && !apply)) {
    console.error('Usage: npm run db:import -- <file.json> [--apply]');
    return 2;
  }
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const records = recordsOf(data);
  if (!records) {
    console.error(
      'Expected an array of records, or a list under "articles", "items", or "entries".',
    );
    return 2;
  }
  const unstored = unstoredFields(records);
  const hasKeyPoints = records.some((record) => record?.key_points?.length);
  if (unstored.length) console.log(`Not stored (no matching field): ${unstored.join(', ')}`);
  if (hasKeyPoints)
    console.log('key_points: added as a "Key points" list at the top of each summary.');
  if (unstored.length || hasKeyPoints) console.log('');
  const read = d1(['--command', 'SELECT link, title, source_key FROM knowledge_entries']);
  if (read.status !== 0) {
    console.error('Could not read the local library. Run `npm run db:migrate` first.');
    console.error(read.stderr || read.stdout);
    return 1;
  }
  const inLibrary = new Set(
    JSON.parse(read.stdout)[0].results.map((row) => dedupeKey(row.link, row.title, row.source_key)),
  );
  const inFile = new Set();
  const statements = [];
  records.forEach((record, index) => {
    const planned = toEntry(record);
    const { entry } = planned;
    const label = `#${index + 1} ${entry.title || '(untitled)'}`;
    const key = dedupeKey(entry.link, entry.title, normalizeText(entry.sourceTag));
    let skip = planned.problems.join(', ');
    if (!skip && inLibrary.has(key)) skip = 'already in the library';
    if (!skip && inFile.has(key)) skip = 'repeated in this file';
    if (skip) {
      console.log(`skip    ${label} — ${skip}`);
      return;
    }
    inFile.add(key);
    statements.push(insertStatement(planned));
    const details = [entry.sourceTag, entry.types.join(' + '), planned.createdAt.slice(0, 10)];
    const notes = planned.notes.length ? ` (${planned.notes.join('; ')})` : '';
    console.log(`import  ${label}  [${details.join(', ')}]${notes}`);
  });
  const skipped = records.length - statements.length;
  console.log(`\n${statements.length} to import, ${skipped} skipped.`);
  if (!statements.length) return 0;
  if (!apply) {
    console.log('Nothing written yet. Re-run with --apply to import.');
    return 0;
  }
  const dir = mkdtempSync(join(tmpdir(), 'lattice-import-'));
  try {
    const path = join(dir, 'import.sql');
    writeFileSync(path, statements.join('\n'));
    const write = d1(['--file', path]);
    if (write.status !== 0) {
      console.error(
        'Import failed. Run the same command again; entries already saved are skipped.',
      );
      console.error(write.stderr || write.stdout);
      return 1;
    }
    console.log(`Imported ${statements.length} ${statements.length === 1 ? 'entry' : 'entries'}.`);
    return 0;
  } finally {
    rmSync(dir, { recursive: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
