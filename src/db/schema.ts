import { index, sqliteTable, text, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const knowledgeEntries = sqliteTable(
  'knowledge_entries',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    types: text('types', { mode: 'json' }).$type<string[]>().notNull(),
    sourceTag: text('source_tag').notNull(),
    sourceKey: text('source_key').notNull(),
    summary: text('summary').notNull(),
    searchText: text('search_text').notNull(),
    link: text('link').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_entries_created_at').on(table.createdAt),
    index('idx_entries_source_created_at').on(table.sourceKey, table.createdAt),
    check('entry_title_nonempty', sql`length(trim(${table.title})) > 0`),
    check('entry_source_nonempty', sql`length(trim(${table.sourceTag})) > 0`),
    check('entry_summary_nonempty', sql`length(trim(${table.summary})) > 0`),
    check(
      'entry_types_array',
      sql`json_valid(${table.types}) AND json_array_length(${table.types}) BETWEEN 1 AND 5`,
    ),
  ],
);
