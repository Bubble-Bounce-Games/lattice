import { z } from 'zod';
import { KNOWLEDGE_TYPES, SORT_OPTIONS } from '../types';
const required = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);
export const safeWebUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        ['https:', 'http:'].includes(url.protocol) &&
        !!url.hostname &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, 'Enter a valid http:// or https:// link.');
export const entryInputSchema = z
  .object({
    title: required('Title', 300),
    types: z
      .array(z.enum(KNOWLEDGE_TYPES))
      .min(1, 'Choose at least one type.')
      .max(5)
      .transform((types) => [...new Set(types)]),
    sourceTag: required('Source tag', 120),
    summary: required('Summary', 50000),
    link: safeWebUrl.default(''),
  })
  .strict();
export const entryUpdateSchema = entryInputSchema.extend({ expectedUpdatedAt: z.iso.datetime() });
export const entryDeleteSchema = z.object({ expectedUpdatedAt: z.iso.datetime() }).strict();
export const searchSchema = z
  .object({
    query: z.string().trim().max(300).optional(),
    type: z.enum(KNOWLEDGE_TYPES).optional(),
    source: z.string().trim().max(120).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    sort: z.enum(SORT_OPTIONS).default('newest'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(40),
  })
  .refine((f) => !f.from || !f.to || f.from < f.to, 'The date range is invalid.');
