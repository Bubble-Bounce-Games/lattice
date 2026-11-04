// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntryForm } from '../src/features/knowledge/components/entry-form';
import { knowledgeApi } from '../src/features/knowledge/services/client';
import type { KnowledgeEntry } from '../src/features/knowledge/types';
vi.mock('../src/features/knowledge/services/client', () => ({
  knowledgeApi: { create: vi.fn(), update: vi.fn() },
}));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const entry: KnowledgeEntry = {
  id: 'test-entry',
  title: 'A saved idea',
  types: ['ARTICLE', 'PODCAST'],
  sourceTag: 'HBR',
  summary: 'A meaningful takeaway',
  link: 'https://example.com/',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
describe('entry capture workflow', () => {
  it('shows required-field errors before sending any data', async () => {
    const user = userEvent.setup();
    render(<EntryForm sources={[]} onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Save Entry' }));
    expect(await screen.findByText('Title is required.')).toBeTruthy();
    expect(screen.getByText('Choose at least one type.')).toBeTruthy();
    expect(knowledgeApi.create).not.toHaveBeenCalled();
  });
  it('saves multiple selected types and trims the submitted fields', async () => {
    const user = userEvent.setup();
    const saved = vi.fn();
    vi.mocked(knowledgeApi.create).mockResolvedValue(entry);
    render(<EntryForm sources={['HBR']} onClose={vi.fn()} onSaved={saved} />);
    await user.type(screen.getByLabelText('Title *'), ' A saved idea ');
    await user.click(screen.getByRole('checkbox', { name: 'Article' }));
    await user.click(screen.getByRole('checkbox', { name: 'Podcast' }));
    await user.type(screen.getByLabelText('Source Tag *'), ' HBR ');
    await user.type(screen.getByLabelText('Summary *'), ' A meaningful takeaway ');
    await user.click(screen.getByRole('button', { name: 'Save Entry' }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(entry));
    expect(knowledgeApi.create).toHaveBeenCalledWith({
      title: 'A saved idea',
      types: ['ARTICLE', 'PODCAST'],
      sourceTag: 'HBR',
      summary: 'A meaningful takeaway',
      link: '',
    });
  });
  it('retains an edited draft after a save failure and confirms discarding', async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    vi.mocked(knowledgeApi.update).mockRejectedValue(
      new Error('Connection interrupted. Try again.'),
    );
    render(<EntryForm entry={entry} sources={[]} onClose={close} onSaved={vi.fn()} />);
    expect((screen.getByRole('checkbox', { name: 'Podcast' }) as HTMLInputElement).checked).toBe(
      true,
    );
    await user.clear(screen.getByLabelText('Title *'));
    await user.type(screen.getByLabelText('Title *'), 'An improved idea');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Connection interrupted. Try again.',
    );
    expect((screen.getByLabelText('Title *') as HTMLInputElement).value).toBe('An improved idea');
    expect(close).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(await screen.findByRole('dialog', { name: 'Discard your changes?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(close).toHaveBeenCalledOnce();
  });
  it('formats summaries and renders Markdown preview safely', async () => {
    const user = userEvent.setup();
    render(<EntryForm sources={[]} onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect((screen.getByLabelText('Summary *') as HTMLTextAreaElement).value).toBe('**bold text**');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText('bold text').tagName).toBe('STRONG');
  });
});
