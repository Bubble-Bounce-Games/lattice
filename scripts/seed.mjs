import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const samples = [
  [
    'The Power of Small Wins',
    ['ARTICLE'],
    'HBR',
    'Small, consistent wins create momentum and build identity change over time.\n\n**The takeaway:** meaningful progress, however small, gives us the energy to keep going.\n\n- Make the next step clear and achievable.\n- Notice progress, not just the final outcome.\n- Build a habit of reflection at the end of the day.',
    '2024-04-20',
  ],
  [
    'How to Build a Second Brain',
    ['PODCAST'],
    'Tiago Forte',
    'Discussion on capturing, organizing and using information effectively.\n\nKeep a trusted place for the ideas you encounter. Organize information around what you want to do with it, then distill the parts that matter most.\n\n1. Capture what resonates.\n2. Organize for action.\n3. Distill the essential ideas.\n4. Express what you learn.',
    '2024-04-18',
  ],
  [
    'Atomic Habits — Book Notes',
    ['BOOK'],
    'James Clear',
    'Key ideas from Atomic Habits including the 1% rule and identity-based habits.\n\n*Every action is a vote for the person you wish to become.* Focus on systems, make good habits easy, and start small enough to repeat consistently.',
    '2024-04-15',
  ],
  [
    'The Future of Work',
    ['ARTICLE'],
    'McKinsey',
    'How AI and automation are reshaping work, and the skills that will matter.\n\nThe most useful question is how our tasks change, and what new skills we need to practice. Keep learning intentionally and make room for human judgment.',
    '2024-04-10',
  ],
  [
    'What Makes a Good Life?',
    ['PODCAST'],
    'The Happiness Lab',
    'Exploration of what research says about a fulfilling life.\n\nConnection, attention, and everyday moments often matter more than the milestones we chase. Make time for people and notice what brings lasting satisfaction.',
    '2024-04-05',
  ],
  [
    'Deep Work — Key Takeaways',
    ['BOOK'],
    'Cal Newport',
    'Notes on the importance of deep work and strategies to achieve it.\n\nProtect time for focused, demanding work.\n\n- Set a clear intention before each session.\n- Remove distractions from the environment.\n- Schedule a finish time and a recovery period.',
    '2024-03-28',
  ],
];
const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const dir = mkdtempSync(join(tmpdir(), 'lattice-seed-'));
try {
  // One statement seeds an empty local library atomically and never changes an existing library.
  const rows = [];
  for (const [index, [title, types, source, summary, day]] of samples.entries()) {
    const timestamp = `${day}T12:00:00.000Z`;
    const searchText = [title, source, summary].join('\n').normalize('NFKC').toLowerCase();
    const values = [
      `sample-${index + 1}`,
      title,
      JSON.stringify(types),
      source,
      source.toLowerCase(),
      summary,
      searchText,
      '',
      timestamp,
      timestamp,
    ]
      .map(sqlString)
      .join(', ');
    rows.push(`(${values})`);
  }
  const sql = `WITH seed(id,title,types,source_tag,source_key,summary,search_text,link,created_at,updated_at) AS (VALUES ${rows.join(', ')}) INSERT INTO knowledge_entries SELECT * FROM seed WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries);`;
  const path = join(dir, 'seed.sql');
  writeFileSync(path, sql);
  const result = spawnSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'site-creator-d1',
      '--local',
      '--config',
      'wrangler.local.jsonc',
      '--file',
      path,
    ],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  rmSync(dir, { recursive: true });
}
