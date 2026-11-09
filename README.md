# Lattice

A personal knowledge library for the articles, podcasts, books, videos, and ideas you want to remember. Uses the supplied Lattice logo and the reference's quiet sidebar, teal accent, library rows, and right-side entry panel.

## Deploy to AWS

Follow [the AWS deployment guide](docs/aws-deployment.md) to publish at **https://lattice.abhijeet-anand.com** in the Bubble-Bounce-Games organization, using the same AWS account as Focus List. This deployment uses a private S3 bucket, CloudFront HTTPS, and a Lambda/DynamoDB API with separate private libraries for signed-in users. GitHub Actions builds and deploys the site.

`npm run build:aws` builds the shared library interface as static files under `dist/aws/website/` and bundles the AWS API under `dist/aws/api/`. Uploading just the website files will not provide accounts or saved entries; the guide deploys the API and CloudFront routing too.

## Run locally

Requires Node.js compatible with the `engines` field in `package.json`.

```sh
./start.sh
```

`start.sh` checks the Node.js version, installs dependencies when `package-lock.json` has changed, applies pending database migrations, starts the dev server on http://127.0.0.1:3000, and opens it in your browser. If Lattice is already running, it just reopens the page. Use `./start.sh --no-open` to skip the browser or `PORT=4000 ./start.sh` for another port; Ctrl+C stops the server. The manual equivalent is `npm ci && npm run dev`.

Optionally run `npm run db:seed` to add the six reference-inspired sample entries to an **empty local database**. Seeding never modifies an existing library and does not run in production. The samples are illustrative notes, not verified quotations or source summaries.

### Importing a JSON export

```sh
npm run db:import -- ~/Downloads/articles.json           # show what would be imported
npm run db:import -- ~/Downloads/articles.json --apply   # write the new entries
```

The file can be a plain array of records or have them under `articles`, `items`, or `entries`. Each record needs `title`, `source`, and `summary`; `link` is optional. `key_points` become a "Key points" list at the top of the summary. The date added comes from `date` (`YYYY-MM-DD`) or `createdAt`. Types come from `type`/`types` when given; otherwise "podcast" in the text makes it a Podcast, a YouTube or Vimeo link makes it a Video, and anything else is an Article. Each record is checked with the same rules as the entry form; records with an empty summary, an unknown type, or a bad link or date are listed and skipped, and fields the library cannot store (such as `topics`) are named in the output. Entries already in the library (same link, or same title and source when there is no link) are skipped, so running an import twice is safe. It writes to the local database only.

**Restoring a backup:** a JSON export from **Settings → Export** is also an import file. `npm run db:import -- lattice-export.json --apply` brings back every entry with its original dates added and edited.

## Features

- Create, view, edit, and delete entries; deletion and unsaved-draft dismissal require confirmation.
- One or several types per entry: Article, Podcast, Book, Video, Other.
- Markdown summaries with formatting controls and a rendered preview. Raw HTML and remote images are not rendered.
- Case-insensitive text search across title, source, and summary; literal text queries do not interpret SQL wildcard characters.
- Combined type, source, and local-calendar date filters; four sort orders; paginated list/grid views.
- Sources are grouped without case duplication and link back to a filtered library.
- Recent-items Home, device-local view preferences, and complete JSON export in Settings.
- Keyboard shortcuts: Cmd/Ctrl+K for search, Cmd/Ctrl+N for capture while the page receives the shortcut, Cmd/Ctrl+Enter to save, Escape to safely close a dialog. A browser may reserve its own new-window shortcut.
- Responsive layout, native modal dialogs, labeled controls, focus restoration, validation feedback, request errors, and loading states.

## Architecture

React + strict TypeScript, Next.js App Router conventions running on Vinext/Vite, Lucide icons, and CSS using the Tailwind build pipeline. The server is compatible with Cloudflare Workers. This preserves the Sites scaffold and uses Drizzle migrations with SQLite/D1 instead of adding a second Prisma database.

### Project layout

```
src/
  app/                  Next.js App Router: pages and app/api/ JSON routes
  features/knowledge/   the knowledge-library feature (UI, validation, data access, search)
  lib/                  shared server helpers
  db/                   database schema, connection, and Cloudflare env types
tests/                  Vitest unit/integration tests and the HTTP smoke test
scripts/                development tooling (sample-data seeding)
drizzle/                versioned SQL migrations (the hosting build reads this exact path)
public/                 static assets served as-is
start.sh                one-command local start
```

Config files stay at the root because each tool looks for them there; `.vscode/settings.json` nests them under `package.json` in the VS Code explorer.

Each product capability is a folder under `src/features/`. Later phases such as AI tags, semantic search, chat, or a knowledge graph belong in their own feature folders (for example `src/features/search/`), reusing the knowledge repository and search interfaces rather than reaching into the database directly.

- `src/features/knowledge/types.ts`: shared domain model.
- `src/features/knowledge/schemas/entry.ts`: shared Zod validation, including safe web URLs and filter limits.
- `src/features/knowledge/repositories/knowledge-repository.ts`: injected database repository with prepared queries and conditional updates/deletes.
- `src/features/knowledge/services/search.ts`: replaceable text-search adapter and date boundaries.
- `src/features/knowledge/services/client.ts`: typed HTTP client and readable request errors.
- `src/features/knowledge/components/`: library, entry cards, shared form, detail view, and dialog primitives.
- `src/app/api/`: JSON CRUD endpoints, source grouping, and export.
- `src/db/schema.ts` and `drizzle/`: relational schema and versioned migrations.

React components never access the database. Search and database code can be replaced separately. PostgreSQL migration requires a new repository adapter and equivalent migrations; the UI contract can remain intact. No unused AI columns, AI requests, ingestion, graph, or collaboration features are included.

## Database and data safety

`knowledge_entries` stores `id`, `title`, `types` (a JSON array), `source_tag`, `summary`, `link`, `created_at`, and `updated_at`. `source_key` and `search_text` are normalized derived fields used for grouping and Unicode-aware case-insensitive matching. Indexes serve created-date ordering and source/date filtering. Database constraints reject empty required text and empty type arrays; shared validation enforces allowed type values at the API boundary.

The initial schema lives in `drizzle/0000_giant_mercury.sql`. To change it, edit `src/db/schema.ts`, run `npm run db:generate`, inspect the SQL, then run `npm run db:migrate` locally. Deployment packages include migrations for the hosted D1 database.

Local SQLite data lives under `.wrangler/state/v3/d1/` and survives server restarts. Do not delete that directory if you want to keep local entries. Hosted D1, local SQLite, and AWS DynamoDB are separate libraries. JSON export provides a readable backup; the import command above restores to local SQLite only.

Writes use validated prepared statements. Updates and deletes require the last observed `updatedAt`; a stale tab cannot silently replace or remove newer content. A failed save keeps the form open. Entries are never stored primarily in browser storage; only the preferred list/grid view is device-local. API responses containing knowledge are not cached.

The local Vinext/Cloudflare version has no app-level multi-user authentication and should use loopback for development. The AWS build uses one email-and-password sign-in form: first sign-in saves a new email's access automatically (minimum eight-character password); subsequent visits require the same password. Passwords are hashed and sessions use secure HttpOnly cookies. Each email has its own private library, separate from Focus List.

To transfer a Lattice JSON export to a signed-in AWS library, run `node scripts/import-aws.mjs lattice-export.json --email person@example.com` to preview, then add `--apply` to import. The script prompts for the password without echo, preserves entry IDs and original dates, verifies the restored content, and skips identical existing records. It never changes the local source database. Imports use the authenticated `/api/import` endpoint and cannot select another user's library.

## Verification

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:api  # requires the local server; override LATTICE_TEST_URL if needed
npm run build
npm audit
```

Vitest checks validation and the actual SQLite repository through Miniflare, including multi-type CRUD, stale-write protection, Unicode search, literal wildcard handling, source grouping, combined filters, sorting, pagination, and date boundaries. Component tests check multi-select form submission, required fields, preserved drafts after failed saves, discard confirmation, and Markdown preview. The HTTP smoke test creates and cleans up only its own test record.

Browser visual and responsive testing is not part of the automated suite. The reference image is a design target; CSS breakpoints and native-dialog behavior should also be reviewed in the browsers you use.

## Code graph (graphify)

graphify (PyPI package `graphifyy`, v0.9.70+) maps the **codebase only** into a queryable knowledge graph. `.graphifyignore` keeps the knowledge library (`.wrangler/` SQLite state), dependencies, build output, images, and prose out of it. Code is extracted structurally, so building the graph needs no LLM or API key.

Output lands in `graphify-out/` (git-ignored, machine-local): `graph.html` to browse, `GRAPH_REPORT.md` for the audit report, and `graph.json` for queries.

```sh
graphify update .                         # re-extract changed code and refresh the graph
graphify query "how does an entry get saved?"
graphify path "POST()" "KnowledgeRepository"
graphify explain "SqlKnowledgeRepository"
graphify export html                      # regenerate graph.html
```

Optional: `graphify hook install` rebuilds the graph after every commit, and `graphify claude install` makes Claude Code consult the graph before answering codebase questions.
