import { readFileSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
/** An in-memory D1 (SQLite) database with the app's migrations applied. */
export async function createTestDatabase() {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'test',
          modules: true,
          script: 'export default { fetch() { return new Response("test"); } }',
          d1Databases: ['DB'],
          compatibilityDate: '2026-05-15',
        },
      ],
    }),
  );
  const db = (await mf.getD1Database('DB')) as unknown as D1Database;
  const migration = readFileSync(
    new URL('../../drizzle/0000_giant_mercury.sql', import.meta.url),
    'utf8',
  );
  for (const statement of migration.split('--> statement-breakpoint'))
    await db.prepare(statement.trim()).run();
  return { mf, db };
}
