// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Library } from '../src/features/knowledge/components/library';
import { knowledgeApi } from '../src/features/knowledge/services/client';
import type { KnowledgeEntry } from '../src/features/knowledge/types';
vi.mock('../src/features/knowledge/services/client', () => ({
  knowledgeApi: { search: vi.fn(), sources: vi.fn() },
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('next/image', () => ({ default: () => null }));
const entry: KnowledgeEntry = {
  id: 'test-entry',
  title: 'A saved idea',
  types: ['ARTICLE'],
  sourceTag: 'HBR',
  summary: 'A meaningful takeaway',
  link: 'https://example.com/',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
beforeEach(() => {
  vi.mocked(knowledgeApi.search).mockResolvedValue({
    entries: [entry],
    total: 1,
    page: 1,
    limit: 40,
  });
  vi.mocked(knowledgeApi.sources).mockResolvedValue([
    { sourceTag: 'HBR', sourceKey: 'hbr', count: 1 },
  ]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('library header', () => {
  it.each([
    ['home', 'A little more perspective.'],
    ['all', 'All Items.'],
    ['sources', 'Sources.'],
  ] as const)('keeps the %s title and filters in the header', async (view, title) => {
    render(<Library view={view} />);
    const header = within(screen.getByRole('banner'));
    expect(header.getByRole('heading', { level: 1, name: title })).toBeTruthy();
    for (const name of ['Filter by type', 'Filter by source', 'Filter by date added']) {
      expect(header.getByRole('combobox', { name })).toBeTruthy();
    }
    const main = within(screen.getByRole('main'));
    expect(main.queryByRole('heading', { level: 1 })).toBeNull();
    expect(main.queryByRole('combobox')).toBeNull();
    await screen.findByText(view === 'sources' ? '1 source' : '1 item');
  });
  it('leaves the settings title in the page, with no filters in the header', async () => {
    render(<Library view="settings" />);
    expect(
      within(screen.getByRole('main')).getByRole('heading', { level: 1, name: 'Settings.' }),
    ).toBeTruthy();
    expect(within(screen.getByRole('banner')).queryByRole('combobox')).toBeNull();
    await screen.findByRole('heading', { level: 2, name: 'Your library view' });
  });
  it('shows matching entries when a header filter is used on sources, until cleared', async () => {
    const user = userEvent.setup();
    render(<Library view="sources" />);
    await screen.findByRole('heading', { level: 2, name: 'HBR' });
    expect(screen.queryByRole('group', { name: 'View mode' })).toBeNull();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by type' }), 'ARTICLE');
    await screen.findByRole('heading', { level: 2, name: 'A saved idea' });
    expect(screen.getByRole('group', { name: 'View mode' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await screen.findByRole('heading', { level: 2, name: 'HBR' });
    expect(screen.queryByRole('heading', { level: 2, name: 'A saved idea' })).toBeNull();
  });
});
