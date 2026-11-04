import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Miniflare } from 'miniflare';
import {
  SqlKnowledgeRepository,
  EntryConflictError,
  EntryNotFoundError,
} from '../src/features/knowledge/repositories/knowledge-repository';
import { entryInputSchema, searchSchema } from '../src/features/knowledge/schemas/entry';
import { dateBounds } from '../src/features/knowledge/services/search';
import type { KnowledgeEntryInput } from '../src/features/knowledge/types';
import { createTestDatabase } from './support/d1';
const valid: KnowledgeEntryInput = {
  title: ' Small wins ',
  types: ['ARTICLE', 'PODCAST'],
  sourceTag: ' HBR ',
  summary: ' Make progress every day. ',
  link: 'https://example.com/article',
};
const clean = () => entryInputSchema.parse(valid);
describe('capture validation', () => {
  it('trims every text field and preserves multiple types', () => {
    expect(clean()).toEqual({
      ...valid,
      title: 'Small wins',
      sourceTag: 'HBR',
      summary: 'Make progress every day.',
    });
  });
  it.each(['title', 'sourceTag', 'summary'])('rejects a blank %s', (field) => {
    expect(entryInputSchema.safeParse({ ...valid, [field]: '  \n' }).success).toBe(false);
  });
  it('requires an allowed type and removes duplicates', () => {
    expect(entryInputSchema.safeParse({ ...valid, types: [] }).success).toBe(false);
    expect(entryInputSchema.safeParse({ ...valid, types: ['AI'] }).success).toBe(false);
    expect(entryInputSchema.parse({ ...valid, types: ['BOOK', 'BOOK'] }).types).toEqual(['BOOK']);
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///etc/passwd',
    'not a url',
    'https://user:pass@example.com',
  ])('rejects an unsafe or invalid link %s', (link) => {
    expect(entryInputSchema.safeParse({ ...valid, link }).success).toBe(false);
  });
  it('accepts empty links and safe web links', () => {
    expect(entryInputSchema.parse({ ...valid, link: ' ' }).link).toBe('');
    expect(entryInputSchema.parse({ ...valid, link: ' https://example.com/path?q=x ' }).link).toBe(
      'https://example.com/path?q=x',
    );
  });
  it('rejects invalid filters and pagination', () => {
    expect(searchSchema.safeParse({ page: -1 }).success).toBe(false);
    expect(searchSchema.safeParse({ limit: 1000 }).success).toBe(false);
    expect(searchSchema.safeParse({ sort: 'title; DROP TABLE knowledge_entries' }).success).toBe(
      false,
    );
  });
  it('uses local calendar boundaries for date filters', () => {
    const now = new Date(2026, 8, 28, 12);
    const week = dateBounds('week', now);
    expect(new Date(week.from!).getDate()).toBe(22);
    expect(new Date(week.to!).getDate()).toBe(29);
    expect(new Date(dateBounds('year', now).from!).getMonth()).toBe(0);
  });
});
describe('real SQLite repository', () => {
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
  it('creates a multi-type entry and reads it from a new repository instance', async () => {
    const saved = await repository.createEntry(clean());
    expect(await new SqlKnowledgeRepository(db).getEntry(saved.id)).toEqual(saved);
    expect(saved.types).toEqual(['ARTICLE', 'PODCAST']);
  });
  it('edits while preserving creation time and detects conflicting writes', async () => {
    const saved = await repository.createEntry(clean());
    const updated = await repository.updateEntry(
      saved.id,
      { ...clean(), title: 'Better wins', types: ['BOOK'] },
      saved.updatedAt,
    );
    expect(updated.createdAt).toBe(saved.createdAt);
    expect(updated.updatedAt > saved.updatedAt).toBe(true);
    expect((await repository.getEntry(saved.id))?.types).toEqual(['BOOK']);
    await expect(repository.updateEntry(saved.id, clean(), saved.updatedAt)).rejects.toBeInstanceOf(
      EntryConflictError,
    );
    expect((await repository.getEntry(saved.id))?.title).toBe('Better wins');
  });
  it('deletes only the expected version and reports absent records', async () => {
    const saved = await repository.createEntry(clean());
    await expect(
      repository.deleteEntry(saved.id, '2000-01-01T00:00:00.000Z'),
    ).rejects.toBeInstanceOf(EntryConflictError);
    expect(await repository.getEntry(saved.id)).not.toBeNull();
    await repository.deleteEntry(saved.id, saved.updatedAt);
    expect(await repository.getEntry(saved.id)).toBeNull();
    await expect(repository.deleteEntry(saved.id, saved.updatedAt)).rejects.toBeInstanceOf(
      EntryNotFoundError,
    );
  });
  it('searches title, source, and summary case-insensitively, including Unicode', async () => {
    await repository.createEntry(clean());
    await repository.createEntry({
      ...clean(),
      title: 'ÉNERGIE',
      sourceTag: 'Elsewhere',
      summary: 'Quiet reflection',
    });
    for (const query of ['SMALL WINS', 'hbr', 'PROGRESS'])
      expect((await repository.getEntries({ query })).total).toBe(1);
    expect((await repository.getEntries({ query: 'énergie' })).total).toBe(1);
    expect((await repository.getEntries({ query: '%' })).total).toBe(0);
  });
  it('combines source and multi-type filtering and groups source casing', async () => {
    await repository.createEntry(clean());
    await repository.createEntry({ ...clean(), sourceTag: 'hbr', types: ['BOOK'] });
    await repository.createEntry({ ...clean(), sourceTag: 'YouTube', types: ['VIDEO'] });
    expect((await repository.getEntries({ type: 'PODCAST', source: 'hbr' })).total).toBe(1);
    expect((await repository.getEntries({ type: 'BOOK', source: 'YouTube' })).total).toBe(0);
    expect(await repository.getSources()).toEqual([
      { sourceTag: 'HBR', sourceKey: 'hbr', count: 2 },
      { sourceTag: 'YouTube', sourceKey: 'youtube', count: 1 },
    ]);
  });
  it('sorts in all directions, filters dates, and paginates without changing totals', async () => {
    const alpha = await repository.createEntry({ ...clean(), title: 'Alpha' });
    const zulu = await repository.createEntry({ ...clean(), title: 'Zulu' });
    await db
      .prepare('UPDATE knowledge_entries SET created_at = ? WHERE id = ?')
      .bind('2026-01-01T00:00:00.000Z', zulu.id)
      .run();
    for (const [sort, title] of [
      ['newest', 'Alpha'],
      ['oldest', 'Zulu'],
      ['title-asc', 'Alpha'],
      ['title-desc', 'Zulu'],
    ] as const)
      expect((await repository.getEntries({ sort })).entries[0].title).toBe(title);
    const page = await repository.getEntries({ limit: 1, page: 2, sort: 'title-asc' });
    expect(page.total).toBe(2);
    expect(page.entries.map((e) => e.id)).toEqual([zulu.id]);
    expect(
      (await repository.getEntries({ from: '2026-01-02T00:00:00.000Z' })).entries.map((e) => e.id),
    ).toEqual([alpha.id]);
  });
  it('exports complete records and enforces database constraints', async () => {
    await repository.createEntry(clean());
    expect((await repository.exportEntries())[0].summary).toBe(clean().summary);
    await expect(repository.createEntry({ ...clean(), title: '' })).rejects.toThrow();
  });
});
