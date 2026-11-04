import type { KnowledgeEntryInput, KnowledgeSearchFilters } from '../types';
export function normalizeText(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}
export function buildSearchText(entry: KnowledgeEntryInput): string {
  return normalizeText([entry.title, entry.sourceTag, entry.summary].join('\n'));
}
export interface SearchClause {
  where: string;
  values: (string | number)[];
  order: string;
}
// Replace this adapter for a future search provider; components only use the API.
export function buildSearchClause(filters: KnowledgeSearchFilters): SearchClause {
  const clauses: string[] = [];
  const values: (string | number)[] = [];
  if (filters.query?.trim()) {
    clauses.push('instr(search_text, ?) > 0');
    values.push(normalizeText(filters.query.trim()));
  }
  if (filters.source) {
    clauses.push('source_key = ?');
    values.push(normalizeText(filters.source));
  }
  if (filters.type) {
    clauses.push('EXISTS (SELECT 1 FROM json_each(knowledge_entries.types) WHERE value = ?)');
    values.push(filters.type);
  }
  if (filters.from) {
    clauses.push('created_at >= ?');
    values.push(filters.from);
  }
  if (filters.to) {
    clauses.push('created_at < ?');
    values.push(filters.to);
  }
  const orders = {
    newest: 'created_at DESC, id DESC',
    oldest: 'created_at ASC, id ASC',
    'title-asc': 'title COLLATE NOCASE ASC, id ASC',
    'title-desc': 'title COLLATE NOCASE DESC, id DESC',
  };
  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
    order: orders[filters.sort ?? 'newest'],
  };
}
export type DateFilter = 'all' | 'today' | 'week' | 'month' | 'year';
export function dateBounds(filter: DateFilter, now = new Date()): { from?: string; to?: string } {
  if (filter === 'all') return {};
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (filter === 'week') start.setDate(start.getDate() - 6);
  if (filter === 'month') start.setDate(start.getDate() - 29);
  if (filter === 'year') start.setMonth(0, 1);
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  return { from: start.toISOString(), to: end.toISOString() };
}
