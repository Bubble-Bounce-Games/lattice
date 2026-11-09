import { z } from 'zod';
import { entryInputSchema } from '../../src/features/knowledge/schemas/entry';

// Imports are scoped to the authenticated library. Original IDs make retries
// safe; timestamps retain the dates shown in the local library.
export const importEntrySchema = entryInputSchema
  .extend({
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .refine(
    (entry) => entry.updatedAt >= entry.createdAt,
    'The edited date must not precede the added date.',
  );
export const importSchema = z
  .object({ entries: z.array(importEntrySchema).min(1).max(100) })
  .strict();
