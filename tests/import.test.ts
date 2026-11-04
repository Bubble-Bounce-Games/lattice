import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Miniflare } from 'miniflare';
import {
  classifyTypes,
  insertStatement,
  recordsOf,
  toEntry,
  unstoredFields,
} from '../scripts/import.mjs';
import { SqlKnowledgeRepository } from '../src/features/knowledge/repositories/knowledge-repository';
import { entryInputSchema } from '../src/features/knowledge/schemas/entry';
import { buildSearchText, normalizeText } from '../src/features/knowledge/services/search';
import { createTestDatabase } from './support/d1';
const record = {
  title: " AI's big questions ",
  source: ' BlackRock ',
  summary: ' **AI** is reshaping markets. ',
  link: 'https://www.blackrock.com/insights/ai',
  date: '2026-03-02',
};
describe('JSON import mapping', () => {
  it('produces entries the app accepts unchanged', () => {
    const { entry, problems } = toEntry(record);
    expect(problems).toEqual([]);
    expect(entryInputSchema.parse(entry)).toEqual(entry);
  });
  it('keeps the record date as the date added', () => {
    expect(toEntry(record).createdAt).toBe('2026-03-02T12:00:00.000Z');
  });
  it.each([
    ['https://www.bcg.com/publications/x', 'The BCG article examines…', ['ARTICLE']],
    ['https://www.bain.com/insights/x', 'The Bain Dry Powder podcast episode…', ['PODCAST']],
    ['https://www.youtube.com/watch?v=1', 'This podcast from BlackRock…', ['PODCAST', 'VIDEO']],
    ['https://youtu.be/1', 'A conference talk.', ['VIDEO']],
  ])('derives types from %s', (link, summary, types) => {
    expect(classifyTypes({ title: 'Title', summary, link })).toEqual(types);
  });
  it('corrects a known source typo only when the link confirms it', () => {
    const lseg = 'https://www.lseg.com/en/insights/x';
    expect(toEntry({ ...record, source: 'LESG', link: lseg }).entry.sourceTag).toBe('LSEG');
    expect(toEntry({ ...record, source: 'LESG' }).entry.sourceTag).toBe('LESG');
  });
  it.each([
    ['summary', ''],
    ['title', '   '],
    ['link', 'javascript:alert(1)'],
    ['date', '2026-02-30'],
    ['date', '28/09/2026'],
  ])('refuses a record with a bad %s', (field, value) => {
    expect(toEntry({ ...record, [field]: value }).problems).not.toEqual([]);
  });
  it('finds records in an array or under articles, items, or entries', () => {
    expect(recordsOf([record])).toEqual([record]);
    for (const key of ['articles', 'items', 'entries'])
      expect(recordsOf({ database: 'x', [key]: [record] })).toEqual([record]);
    expect(recordsOf({ records: [record] })).toBeNull();
  });
  it('lists fields the library cannot store', () => {
    expect(
      unstoredFields([{ ...record, topics: ['AI'], key_points: [] }, { section: 'x' }]),
    ).toEqual(['topics', 'section']);
  });
  it('uses explicit types over derived ones and rejects unknown types', () => {
    const youtube = { ...record, link: 'https://www.youtube.com/watch?v=1' };
    expect(toEntry({ ...youtube, type: 'podcast' }).entry.types).toEqual(['PODCAST']);
    expect(toEntry({ ...record, types: ['Article', 'VIDEO'] }).entry.types).toEqual([
      'ARTICLE',
      'VIDEO',
    ]);
    expect(toEntry({ ...record, type: 'webinar' }).problems).toContain('unknown type "webinar"');
    expect(toEntry({ ...record, types: [] }).problems).toContain('no type');
  });
  it('puts key points at the top of the summary', () => {
    const { entry, problems } = toEntry({ ...record, key_points: [' First ', '', 'Second'] });
    expect(problems).toEqual([]);
    expect(entry.summary).toBe('## Key points\n- First\n- Second\n\n**AI** is reshaping markets.');
    expect(toEntry({ ...record, summary: '', key_points: ['Only'] }).entry.summary).toBe(
      '## Key points\n- Only',
    );
  });
});
describe('JSON import into SQLite', () => {
  let mf: Miniflare, db: D1Database, repository: SqlKnowledgeRepository;
  beforeAll(async () => {
    ({ mf, db } = await createTestDatabase());
    repository = new SqlKnowledgeRepository(db);
  });
  beforeEach(async () => {
    await db.prepare('DELETE FROM knowledge_entries').run();
  });
  afterAll(async () => {
    await mf?.dispose();
  });
  it('stores rows the app reads back and searches, and never duplicates them', async () => {
    const planned = toEntry(record);
    await db.prepare(insertStatement(planned, 'import-1')).run();
    await db.prepare(insertStatement(planned, 'import-2')).run();
    expect(await repository.getEntry('import-1')).toEqual({
      ...planned.entry,
      id: 'import-1',
      createdAt: planned.createdAt,
      updatedAt: planned.createdAt,
    });
    expect((await repository.getEntries({ query: 'RESHAPING' })).total).toBe(1);
    expect(
      await db.prepare('SELECT source_key, search_text FROM knowledge_entries').first(),
    ).toEqual({
      source_key: normalizeText('BlackRock'),
      search_text: buildSearchText(planned.entry),
    });
  });
  it('restores a Settings export exactly, apart from new ids', async () => {
    await repository.createEntry(entryInputSchema.parse({ ...toEntry(record).entry }));
    const second = await repository.createEntry(
      entryInputSchema.parse({ ...toEntry(record).entry, title: 'Second', link: '' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    await repository.updateEntry(second.id, { ...second, summary: 'Edited.' }, second.updatedAt);
    const exported = await repository.exportEntries();
    const backup = JSON.parse(JSON.stringify({ version: 1, entries: exported }));
    await db.prepare('DELETE FROM knowledge_entries').run();
    for (const item of recordsOf(backup)!) {
      const planned = toEntry(item);
      expect(planned.problems).toEqual([]);
      await db.prepare(insertStatement(planned)).run();
      await db.prepare(insertStatement(planned)).run();
    }
    // Compared by title: entries created in the same millisecond are ordered by id.
    const withoutIds = (entries: typeof exported) =>
      entries.map(({ id: _id, ...rest }) => rest).sort((a, b) => a.title.localeCompare(b.title));
    expect(withoutIds(await repository.exportEntries())).toEqual(withoutIds(exported));
  });
  it('matches link-less records by title and source instead of by empty link', async () => {
    const noLink = (title: string) => toEntry({ ...record, title, link: '' });
    await db.prepare(insertStatement(noLink('First note'), 'a')).run();
    await db.prepare(insertStatement(noLink('Second note'), 'b')).run();
    await db.prepare(insertStatement(noLink('First note'), 'c')).run();
    expect((await repository.getEntries()).total).toBe(2);
  });
});
