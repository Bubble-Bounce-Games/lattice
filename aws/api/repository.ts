import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  EntryConflictError,
  EntryNotFoundError,
  type KnowledgeRepository,
} from '../../src/features/knowledge/repositories/knowledge-repository';
import type {
  KnowledgeEntry,
  KnowledgeEntryInput,
  KnowledgePage,
  KnowledgeSearchFilters,
  KnowledgeSource,
} from '../../src/features/knowledge/types';
import { buildSearchText, normalizeText } from '../../src/features/knowledge/services/search';

export class DynamoKnowledgeRepository implements KnowledgeRepository {
  private readonly pk: string;
  constructor(
    private readonly db: DynamoDBDocumentClient,
    private readonly table: string,
    userId: string,
  ) {
    this.pk = `LIBRARY#${userId}`;
  }
  private key(id: string) {
    return { pk: this.pk, sk: `ENTRY#${id}` };
  }
  async getEntry(id: string): Promise<KnowledgeEntry | null> {
    const result = await this.db.send(
      new GetCommand({ TableName: this.table, Key: this.key(id), ConsistentRead: true }),
    );
    return result.Item?.entry ?? null;
  }
  async createEntry(input: KnowledgeEntryInput): Promise<KnowledgeEntry> {
    const timestamp = new Date().toISOString();
    const entry = { ...input, id: crypto.randomUUID(), createdAt: timestamp, updatedAt: timestamp };
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: { ...this.key(entry.id), entry, version: timestamp },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
    return entry;
  }
  async updateEntry(
    id: string,
    input: KnowledgeEntryInput,
    expectedUpdatedAt: string,
  ): Promise<KnowledgeEntry> {
    const previous = await this.getEntry(id);
    if (!previous) throw new EntryNotFoundError('This entry no longer exists.');
    const updatedAt = new Date(
      Math.max(Date.now(), Date.parse(previous.updatedAt) + 1),
    ).toISOString();
    const entry = { ...input, id, createdAt: previous.createdAt, updatedAt };
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.table,
          Item: { ...this.key(id), entry, version: updatedAt },
          ConditionExpression: '#version = :expected',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: { ':expected': expectedUpdatedAt },
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException')
        throw new EntryConflictError(
          'This entry changed in another tab. Keep your draft, then reopen the latest entry.',
        );
      throw error;
    }
    return entry;
  }
  async deleteEntry(id: string, expectedUpdatedAt: string): Promise<void> {
    try {
      await this.db.send(
        new DeleteCommand({
          TableName: this.table,
          Key: this.key(id),
          ConditionExpression: '#version = :expected',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: { ':expected': expectedUpdatedAt },
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        if (!(await this.getEntry(id)))
          throw new EntryNotFoundError('This entry no longer exists.');
        throw new EntryConflictError(
          'This entry changed in another tab. Reopen it before deleting.',
        );
      }
      throw error;
    }
  }
  private async all(): Promise<KnowledgeEntry[]> {
    const entries: KnowledgeEntry[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const result = await this.db.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': this.pk, ':prefix': 'ENTRY#' },
          ConsistentRead: true,
          ExclusiveStartKey: cursor,
        }),
      );
      entries.push(...(result.Items ?? []).map((item) => item.entry as KnowledgeEntry));
      cursor = result.LastEvaluatedKey;
    } while (cursor);
    return entries;
  }
  async exportEntries(): Promise<KnowledgeEntry[]> {
    return (await this.all()).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
  }
  async getEntries(filters: KnowledgeSearchFilters = {}): Promise<KnowledgePage> {
    const query = normalizeText(filters.query?.trim() ?? '');
    const entries = (await this.all()).filter(
      (entry) =>
        (!query || buildSearchText(entry).includes(query)) &&
        (!filters.source || normalizeText(entry.sourceTag) === normalizeText(filters.source)) &&
        (!filters.type || entry.types.includes(filters.type)) &&
        (!filters.from || entry.createdAt >= filters.from) &&
        (!filters.to || entry.createdAt < filters.to),
    );
    const sort = filters.sort ?? 'newest';
    // Match SQLite's ASCII NOCASE collation used by the local repository.
    const fold = (value: string) => value.replace(/[A-Z]/g, (char) => char.toLowerCase());
    const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    entries.sort((a, b) => {
      const titles = sort.startsWith('title');
      const direction = sort === 'newest' || sort === 'title-desc' ? -1 : 1;
      const order = titles
        ? compare(fold(a.title), fold(b.title))
        : compare(a.createdAt, b.createdAt);
      return direction * (order || compare(a.id, b.id));
    });
    const page = filters.page ?? 1,
      limit = filters.limit ?? 40;
    return {
      entries: entries.slice((page - 1) * limit, page * limit),
      total: entries.length,
      page,
      limit,
    };
  }
  async getSources(): Promise<KnowledgeSource[]> {
    const groups = new Map<string, KnowledgeSource>();
    for (const entry of await this.all()) {
      const key = normalizeText(entry.sourceTag);
      const source = groups.get(key);
      if (source) {
        source.count++;
        if (entry.sourceTag < source.sourceTag) source.sourceTag = entry.sourceTag;
      } else groups.set(key, { sourceKey: key, sourceTag: entry.sourceTag, count: 1 });
    }
    return [...groups.values()].sort((a, b) =>
      normalizeText(a.sourceTag).localeCompare(normalizeText(b.sourceTag)),
    );
  }
}
