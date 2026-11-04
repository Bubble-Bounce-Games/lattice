export const KNOWLEDGE_TYPES = ['ARTICLE', 'PODCAST', 'BOOK', 'VIDEO', 'OTHER'] as const;
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];
export const SORT_OPTIONS = ['newest', 'oldest', 'title-asc', 'title-desc'] as const;
export type KnowledgeSortOption = (typeof SORT_OPTIONS)[number];
export interface KnowledgeEntryInput {
  title: string;
  types: KnowledgeType[];
  sourceTag: string;
  summary: string;
  link: string;
}
export interface KnowledgeEntry extends KnowledgeEntryInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
export interface KnowledgeSearchFilters {
  query?: string;
  type?: KnowledgeType;
  source?: string;
  from?: string;
  to?: string;
  sort?: KnowledgeSortOption;
  page?: number;
  limit?: number;
}
export interface KnowledgePage {
  entries: KnowledgeEntry[];
  total: number;
  page: number;
  limit: number;
}
export interface KnowledgeSource {
  sourceTag: string;
  sourceKey: string;
  count: number;
}
export type LibraryView = 'all' | 'home' | 'sources' | 'settings';
