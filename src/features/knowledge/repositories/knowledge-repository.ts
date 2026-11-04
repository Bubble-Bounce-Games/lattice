import type {
  KnowledgeEntry,
  KnowledgeEntryInput,
  KnowledgePage,
  KnowledgeSearchFilters,
  KnowledgeSource,
} from '../types';
import { buildSearchClause, buildSearchText, normalizeText } from '../services/search';
interface EntryRow {
  id: string;
  title: string;
  types: string;
  source_tag: string;
  summary: string;
  link: string;
  created_at: string;
  updated_at: string;
}
function mapEntry(row: EntryRow): KnowledgeEntry {
  return {
    id: row.id,
    title: row.title,
    types: JSON.parse(row.types) as KnowledgeEntry['types'],
    sourceTag: row.source_tag,
    summary: row.summary,
    link: row.link,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export class EntryNotFoundError extends Error {}
export class EntryConflictError extends Error {}
export interface KnowledgeRepository {
  createEntry(input: KnowledgeEntryInput): Promise<KnowledgeEntry>;
  getEntry(id: string): Promise<KnowledgeEntry | null>;
  getEntries(filters?: KnowledgeSearchFilters): Promise<KnowledgePage>;
  updateEntry(
    id: string,
    input: KnowledgeEntryInput,
    expectedUpdatedAt: string,
  ): Promise<KnowledgeEntry>;
  deleteEntry(id: string, expectedUpdatedAt: string): Promise<void>;
  getSources(): Promise<KnowledgeSource[]>;
  exportEntries(): Promise<KnowledgeEntry[]>;
}
export class SqlKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly db: D1Database) {}
  async createEntry(input: KnowledgeEntryInput): Promise<KnowledgeEntry> {
    const timestamp = new Date().toISOString();
    const entry: KnowledgeEntry = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.db
      .prepare(
        'INSERT INTO knowledge_entries (id, title, types, source_tag, source_key, summary, search_text, link, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        entry.id,
        entry.title,
        JSON.stringify(entry.types),
        entry.sourceTag,
        normalizeText(entry.sourceTag),
        entry.summary,
        buildSearchText(entry),
        entry.link,
        entry.createdAt,
        entry.updatedAt,
      )
      .run();
    return entry;
  }
  async getEntry(id: string): Promise<KnowledgeEntry | null> {
    const row = await this.db
      .prepare('SELECT * FROM knowledge_entries WHERE id = ?')
      .bind(id)
      .first<EntryRow>();
    return row ? mapEntry(row) : null;
  }
  async getEntries(filters: KnowledgeSearchFilters = {}): Promise<KnowledgePage> {
    const { where, values, order } = buildSearchClause(filters);
    const page = filters.page ?? 1,
      limit = filters.limit ?? 40;
    const results = await this.db.batch([
      this.db
        .prepare(`SELECT * FROM knowledge_entries ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
        .bind(...values, limit, (page - 1) * limit),
      this.db.prepare(`SELECT COUNT(*) AS total FROM knowledge_entries ${where}`).bind(...values),
    ]);
    return {
      entries: (results[0].results as unknown as EntryRow[]).map(mapEntry),
      total: Number((results[1].results[0] as { total: number }).total),
      page,
      limit,
    };
  }
  async updateEntry(
    id: string,
    input: KnowledgeEntryInput,
    expectedUpdatedAt: string,
  ): Promise<KnowledgeEntry> {
    const previous = await this.getEntry(id);
    if (!previous) throw new EntryNotFoundError('This entry no longer exists.');
    // Always advance the version, even for two writes in the same millisecond.
    const updatedAt = new Date(
      Math.max(Date.now(), Date.parse(previous.updatedAt) + 1),
    ).toISOString();
    const result = await this.db
      .prepare(
        'UPDATE knowledge_entries SET title = ?, types = ?, source_tag = ?, source_key = ?, summary = ?, search_text = ?, link = ?, updated_at = ? WHERE id = ? AND updated_at = ?',
      )
      .bind(
        input.title,
        JSON.stringify(input.types),
        input.sourceTag,
        normalizeText(input.sourceTag),
        input.summary,
        buildSearchText(input),
        input.link,
        updatedAt,
        id,
        expectedUpdatedAt,
      )
      .run();
    if (!result.meta.changes)
      throw new EntryConflictError(
        'This entry changed in another tab. Keep your draft, then reopen the latest entry.',
      );
    return { ...input, id, createdAt: previous.createdAt, updatedAt };
  }
  async deleteEntry(id: string, expectedUpdatedAt: string): Promise<void> {
    const result = await this.db
      .prepare('DELETE FROM knowledge_entries WHERE id = ? AND updated_at = ?')
      .bind(id, expectedUpdatedAt)
      .run();
    if (!result.meta.changes) {
      if (!(await this.getEntry(id))) throw new EntryNotFoundError('This entry no longer exists.');
      throw new EntryConflictError('This entry changed in another tab. Reopen it before deleting.');
    }
  }
  async getSources(): Promise<KnowledgeSource[]> {
    const result = await this.db
      .prepare(
        'SELECT MIN(source_tag) AS sourceTag, source_key AS sourceKey, COUNT(*) AS count FROM knowledge_entries GROUP BY source_key ORDER BY sourceTag COLLATE NOCASE',
      )
      .all<KnowledgeSource>();
    return result.results;
  }
  async exportEntries(): Promise<KnowledgeEntry[]> {
    const result = await this.db
      .prepare('SELECT * FROM knowledge_entries ORDER BY created_at DESC, id DESC')
      .all<EntryRow>();
    return result.results.map(mapEntry);
  }
}
