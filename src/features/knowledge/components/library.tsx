'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Search,
  Plus,
  House,
  Files,
  Database,
  Settings,
  Menu,
  X,
  ChevronDown,
  ArrowDownUp,
  LayoutGrid,
  List,
  ArrowUpRight,
  BookOpen,
  Check,
  Download,
  Keyboard,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import type {
  KnowledgeEntry,
  KnowledgePage,
  KnowledgeSource,
  KnowledgeType,
  KnowledgeSortOption,
  LibraryView,
} from '../types';
import { KNOWLEDGE_TYPES } from '../types';
import { dateBounds, type DateFilter } from '../services/search';
import { knowledgeApi } from '../services/client';
import { EntryCard } from './entry-card';
import { EntryForm } from './entry-form';
import { EntryDetail } from './entry-detail';
import { ConfirmDialog, typeDetails } from './shared';
function subscribeView(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('lattice-view-change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('lattice-view-change', callback);
  };
}
function getGridPreference() {
  try {
    return localStorage.getItem('lattice-view') === 'grid';
  } catch {
    return false;
  }
}
// Matches the CSS breakpoint where the sidebar becomes a slide-in drawer.
const DRAWER_NAV_QUERY = '(max-width: 760px)';
function subscribeDrawerNav(callback: () => void) {
  const media = window.matchMedia(DRAWER_NAV_QUERY);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
function getDrawerNav() {
  return window.matchMedia(DRAWER_NAV_QUERY).matches;
}
type Panel = { mode: 'new' } | { mode: 'edit' | 'view'; entry: KnowledgeEntry };
export function Library({
  view = 'all',
  initialSource = '',
  initialQuery = '',
}: {
  view?: LibraryView;
  initialSource?: string;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<KnowledgeType | ''>('');
  const [source, setSource] = useState(initialSource);
  const [date, setDate] = useState<DateFilter>('all');
  const [sort, setSort] = useState<KnowledgeSortOption>('newest');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<KnowledgePage | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [sourcesError, setSourcesError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const grid = useSyncExternalStore(subscribeView, getGridPreference, () => false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [remove, setRemove] = useState<KnowledgeEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const drawerNav = useSyncExternalStore(subscribeDrawerNav, getDrawerNav, () => false);
  const navOpen = drawerNav ? mobileNav : !navCollapsed;
  const [toast, setToast] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const activeBeforePanel = useRef<HTMLElement | null>(null);
  const deletingRef = useRef(false);
  const filtered = !!(query || type || source || date !== 'all');
  const showEntries = view === 'all' || view === 'home' || filtered;
  // Settings keeps its compact header until a search turns it into a results page.
  const pageInHeader = view !== 'settings' || filtered;
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        setError('');
        knowledgeApi
          .search(
            {
              query,
              type: type || undefined,
              source: source || undefined,
              ...dateBounds(date),
              sort,
              page,
              limit: view === 'home' && !filtered ? 12 : 40,
            },
            controller.signal,
          )
          .then((result) => {
            if (!controller.signal.aborted) {
              setData(result);
              setLoading(false);
            }
          })
          .catch((cause) => {
            if (!controller.signal.aborted) {
              setError(cause instanceof Error ? cause.message : 'Could not load your library.');
              setLoading(false);
            }
          });
      },
      query ? 180 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, type, source, date, sort, page, revision, view, filtered]);
  useEffect(() => {
    const controller = new AbortController();
    knowledgeApi
      .sources(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setSources(result);
          setSourcesError('');
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setSourcesError(cause instanceof Error ? cause.message : 'Could not load sources.');
      });
    return () => controller.abort();
  }, [revision]);
  const openPanel = useCallback((next: Panel) => {
    activeBeforePanel.current = document.activeElement as HTMLElement;
    setPanel(next);
  }, []);
  const closePanel = useCallback(() => {
    setPanel(null);
    requestAnimationFrame(() => {
      const previous = activeBeforePanel.current;
      if (previous?.isConnected) previous.focus();
      else newButton.current?.focus();
    });
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (panel || remove) return;
      if (event.key === 'Escape' && mobileNav) {
        setMobileNav(false);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        openPanel({ mode: 'new' });
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [panel, remove, openPanel, mobileNav]);
  function clearFilters() {
    setQuery('');
    setType('');
    setSource('');
    setDate('all');
    setPage(1);
  }
  function setView(next: boolean) {
    try {
      localStorage.setItem('lattice-view', next ? 'grid' : 'list');
      window.dispatchEvent(new Event('lattice-view-change'));
    } catch {
      notify('Your browser could not save this display preference.');
    }
  }
  function saved(entry: KnowledgeEntry) {
    const isEdit = panel?.mode === 'edit';
    closePanel();
    if (!isEdit) {
      clearFilters();
      setSort('newest');
    }
    setData((current) =>
      current
        ? {
            ...current,
            entries: isEdit
              ? current.entries.map((item) => (item.id === entry.id ? entry : item))
              : [entry, ...current.entries],
            total: current.total + (isEdit ? 0 : 1),
          }
        : current,
    );
    setRevision((current) => current + 1);
    notify(isEdit ? 'Changes saved' : 'Entry saved');
  }
  function confirmDelete(entry: KnowledgeEntry) {
    setDeleteError('');
    setRemove(entry);
  }
  async function deleteEntry() {
    if (!remove || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError('');
    try {
      await knowledgeApi.delete(remove);
      if (panel && 'entry' in panel && panel.entry.id === remove.id) closePanel();
      setRemove(null);
      setPage(1);
      setRevision((current) => current + 1);
      notify('Entry deleted');
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'Could not delete this entry.');
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }
  async function copy(entry: KnowledgeEntry) {
    try {
      await navigator.clipboard.writeText(entry.link);
      notify('Link copied');
    } catch {
      notify('Could not copy the link. Open the entry to use its original link.');
    }
  }
  const headings = {
    all: [
      'All Items',
      'A collection of articles, podcasts, books and more that I’ve read, listened to or explored.',
    ],
    home: [
      'A little more perspective',
      'Pick up where your curiosity left off. Here’s what you’ve saved recently.',
    ],
    sources: ['Sources', 'The people, publications, and places that shape your thinking.'],
    settings: ['Settings', 'Make a little space for the way you like to learn.'],
  };
  const pageTitle = (
    <>
      <h1>
        {query ? 'Search results' : headings[view][0]}
        <span className="heading-dot">.</span>
      </h1>
      <p>{query ? `Finding “${query}” in your knowledge library.` : headings[view][1]}</p>
    </>
  );
  const countLabel = showEntries
    ? loading
      ? 'Gathering your ideas…'
      : data
        ? `${data.total} ${data.total === 1 ? 'item' : 'items'}${filtered ? ' found' : ''}`
        : 'Your library'
    : sourcesError
      ? ''
      : `${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`;
  return (
    <div className={`app-shell ${panel ? 'has-panel' : ''} ${navCollapsed ? 'nav-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside id="sidebar" className={`sidebar ${mobileNav ? 'mobile-open' : ''}`} inert={!navOpen}>
        <Link href="/" className="brand" aria-label="Lattice home">
          <span className="brand-mark">
            <Image unoptimized src="/brand/lattice.png" alt="" width={77} height={77} />
          </span>
          <span>Lattice</span>
        </Link>
        <div className="nav-label">YOUR LIBRARY</div>
        <nav aria-label="Main navigation">
          {[
            { href: '/home', label: 'Home', id: 'home', Icon: House },
            { href: '/', label: 'All Items', id: 'all', Icon: Files },
            { href: '/sources', label: 'Sources', id: 'sources', Icon: Database },
          ].map(({ href, label, id, Icon }) => (
            <Link
              key={id}
              href={href}
              className={view === id ? 'active' : ''}
              aria-current={view === id ? 'page' : undefined}
            >
              <Icon size={18} strokeWidth={1.6} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link
            className={`settings-link ${view === 'settings' ? 'active' : ''}`}
            href="/settings"
            aria-current={view === 'settings' ? 'page' : undefined}
          >
            <Settings size={18} strokeWidth={1.6} />
            Settings
          </Link>
        </div>
      </aside>
      <div className="workspace">
        <header className={`topbar ${pageInHeader ? 'topbar-expanded' : ''}`}>
          <div className="topbar-main">
            <button
              className="nav-toggle icon-button"
              aria-label={navOpen ? 'Hide navigation' : 'Show navigation'}
              aria-controls="sidebar"
              aria-expanded={navOpen}
              onClick={() =>
                drawerNav ? setMobileNav(!mobileNav) : setNavCollapsed(!navCollapsed)
              }
            >
              <Menu size={21} />
            </button>
            <div className="top-actions">
              <div className="search-input">
                <Search size={17} />
                <input
                  ref={searchInput}
                  aria-label="Search entries"
                  placeholder="Search articles, podcasts, books..."
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  maxLength={300}
                />
                {query ? (
                  <button
                    className="icon-button"
                    aria-label="Clear search"
                    onClick={() => {
                      setQuery('');
                      setPage(1);
                      searchInput.current?.focus();
                    }}
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <kbd>⌘ K</kbd>
                )}
              </div>
              <button
                ref={newButton}
                className="button primary new-entry"
                onClick={() => openPanel({ mode: 'new' })}
                disabled={!!panel}
              >
                <Plus size={18} />
                <span>New Entry</span>
              </button>
            </div>
          </div>
          {pageInHeader && (
            <>
              <div className="topbar-heading">{pageTitle}</div>
              <div className="filters">
                <div className={`select-control ${type ? 'selected' : ''}`}>
                  <select
                    aria-label="Filter by type"
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value as KnowledgeType | '');
                      setPage(1);
                    }}
                  >
                    <option value="">Type</option>
                    {KNOWLEDGE_TYPES.map((t) => (
                      <option value={t} key={t}>
                        {typeDetails[t].label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} />
                </div>
                <div className={`select-control ${source ? 'selected' : ''}`}>
                  <select
                    aria-label="Filter by source"
                    value={source}
                    onChange={(e) => {
                      setSource(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">Source</option>
                    {sources.map((s) => (
                      <option key={s.sourceKey} value={s.sourceKey}>
                        {s.sourceTag}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} />
                </div>
                <div className={`select-control ${date !== 'all' ? 'selected' : ''}`}>
                  <select
                    aria-label="Filter by date added"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value as DateFilter);
                      setPage(1);
                    }}
                  >
                    <option value="all">Date added</option>
                    <option value="today">Today</option>
                    <option value="week">Last 7 days</option>
                    <option value="month">Last 30 days</option>
                    <option value="year">This year</option>
                  </select>
                  <ChevronDown size={13} />
                </div>
                {filtered && (
                  <button className="clear-filters" onClick={clearFilters}>
                    <X size={12} />
                    Clear filters
                  </button>
                )}
                <div className="filter-summary">
                  <span className="filter-count" aria-live="polite">
                    {countLabel}
                  </span>
                  {showEntries && (
                    <>
                      <div className="select-control sort-control">
                        <ArrowDownUp size={13} />
                        <select
                          aria-label="Sort entries"
                          value={sort}
                          onChange={(e) => {
                            setSort(e.target.value as KnowledgeSortOption);
                            setPage(1);
                          }}
                        >
                          <option value="newest">Newest first</option>
                          <option value="oldest">Oldest first</option>
                          <option value="title-asc">Title A–Z</option>
                          <option value="title-desc">Title Z–A</option>
                        </select>
                        <ChevronDown size={12} />
                      </div>
                      <div className="view-switch" role="group" aria-label="View mode">
                        <button
                          className={!grid ? 'active' : ''}
                          aria-label="List view"
                          aria-pressed={!grid}
                          onClick={() => setView(false)}
                        >
                          <List size={17} />
                        </button>
                        <button
                          className={grid ? 'active' : ''}
                          aria-label="Grid view"
                          aria-pressed={grid}
                          onClick={() => setView(true)}
                        >
                          <LayoutGrid size={15} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </header>
        <main id="main-content" className={`library ${pageInHeader ? 'items-only' : ''}`}>
          {!pageInHeader && <div className="page-heading">{pageTitle}</div>}
          {showEntries &&
            (error ? (
              <section className="error-state" role="alert">
                <h2>Your library couldn’t load</h2>
                <p>{error}</p>
                <button className="button" onClick={() => setRevision((v) => v + 1)}>
                  <RotateCcw size={14} />
                  Try again
                </button>
              </section>
            ) : loading ? (
              <div className="skeleton-list" aria-label="Loading entries" aria-busy="true">
                {[0, 1, 2, 3].map((i) => (
                  <div className="skeleton-row" key={i}>
                    <span />
                    <div>
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                ))}
              </div>
            ) : data?.entries.length ? (
              <>
                <div className={`entries ${grid ? 'grid-view' : ''}`}>
                  {data.entries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      onView={() => openPanel({ mode: 'view', entry })}
                      onEdit={() => openPanel({ mode: 'edit', entry })}
                      onDelete={() => confirmDelete(entry)}
                      onCopy={() => void copy(entry)}
                    />
                  ))}
                </div>
                {data.total > data.limit && (
                  <div className="pagination">
                    <button
                      className="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Page {page} of {Math.ceil(data.total / data.limit)}
                    </span>
                    <button
                      className="button"
                      disabled={page * data.limit >= data.total}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
                <div className="library-foot">
                  <span className="foot-line" />
                  <span>A place for ideas to take root.</span>
                  <span className="foot-line" />
                </div>
              </>
            ) : (
              <section className="empty-state">
                <span className="empty-icon">
                  {filtered ? (
                    <Search size={26} strokeWidth={1.4} />
                  ) : (
                    <BookOpen size={28} strokeWidth={1.3} />
                  )}
                </span>
                <div className="eyebrow">
                  {filtered ? 'A FRESH PERSPECTIVE' : 'MAKE ROOM FOR YOUR NEXT IDEA'}
                </div>
                <h2>{filtered ? 'No matching entries' : 'Your knowledge library is empty'}</h2>
                <p>
                  {filtered ? (
                    'Try a different search or give your filters a little more room.'
                  ) : (
                    <>
                      Save articles, podcasts, books and ideas you want to remember.
                      <br />A few words today. A little more clarity tomorrow.
                    </>
                  )}
                </p>
                <button
                  className={`button ${filtered ? '' : 'primary'}`}
                  onClick={filtered ? clearFilters : () => openPanel({ mode: 'new' })}
                >
                  {filtered ? (
                    <>
                      <RotateCcw size={14} />
                      Clear filters
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Create your first entry
                    </>
                  )}
                </button>
              </section>
            ))}
          {!showEntries && view === 'sources' && (
            <div className="sources-view">
              {sourcesError ? (
                <section className="error-state" role="alert">
                  <p>{sourcesError}</p>
                  <button className="button" onClick={() => setRevision((v) => v + 1)}>
                    Try again
                  </button>
                </section>
              ) : sources.length ? (
                <div className="source-grid">
                  {sources.map((s) => (
                    <Link
                      className="source-card"
                      key={s.sourceKey}
                      href={`/?source=${encodeURIComponent(s.sourceKey)}`}
                    >
                      <div className="source-initial">{s.sourceTag.slice(0, 2).toUpperCase()}</div>
                      <div>
                        <h2>{s.sourceTag}</h2>
                        <p>
                          {s.count} {s.count === 1 ? 'entry' : 'entries'}
                        </p>
                      </div>
                      <ArrowUpRight size={18} />
                    </Link>
                  ))}
                </div>
              ) : (
                <section className="empty-state">
                  <span className="empty-icon">
                    <Database size={28} strokeWidth={1.3} />
                  </span>
                  <h2>Good ideas come from everywhere</h2>
                  <p>Your sources will appear here as you save entries.</p>
                  <button className="button primary" onClick={() => openPanel({ mode: 'new' })}>
                    <Plus size={16} />
                    New Entry
                  </button>
                </section>
              )}
            </div>
          )}
          {!showEntries && view === 'settings' && (
            <div className="settings-view">
              <section className="settings-section">
                <div className="settings-section-title">
                  <LayoutGrid size={18} />
                  <h2>Your library view</h2>
                </div>
                <p>Choose how you like to browse. This preference is saved on this device.</p>
                <div className="view-preferences">
                  <button
                    className={`view-preference ${!grid ? 'active' : ''}`}
                    aria-pressed={!grid}
                    onClick={() => setView(false)}
                  >
                    <List size={21} />
                    <span>
                      List view<small>A little room for every idea</small>
                    </span>
                    {!grid && <Check size={16} />}
                  </button>
                  <button
                    className={`view-preference ${grid ? 'active' : ''}`}
                    aria-pressed={grid}
                    onClick={() => setView(true)}
                  >
                    <LayoutGrid size={21} />
                    <span>
                      Grid view<small>Your collection at a glance</small>
                    </span>
                    {grid && <Check size={16} />}
                  </button>
                </div>
              </section>
              <section className="settings-section">
                <div className="settings-section-title">
                  <Download size={18} />
                  <h2>Keep a copy</h2>
                </div>
                <p>
                  Download your complete library, including summaries, links, and dates, as a JSON
                  file.
                </p>
                <a className="button" href="/api/export" download>
                  <Download size={14} />
                  Export library
                </a>
              </section>
              <section className="settings-section">
                <div className="settings-section-title">
                  <Keyboard size={18} />
                  <h2>A few useful shortcuts</h2>
                </div>
                <div className="shortcut-list">
                  <span>Search your library</span>
                  <kbd>⌘ / Ctrl + K</kbd>
                  <span>Create an entry</span>
                  <kbd>⌘ / Ctrl + N</kbd>
                  <span>Save an entry</span>
                  <kbd>⌘ / Ctrl + Enter</kbd>
                  <span>Close a panel</span>
                  <kbd>Esc</kbd>
                </div>
              </section>
              <div className="settings-note">
                <ShieldCheck size={20} />
                <p>
                  Your ideas, kept simply.
                  <span>Lattice is a personal space for the knowledge you choose to keep.</span>
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
      {panel?.mode === 'new' && (
        <EntryForm
          key="new"
          sources={sources.map((s) => s.sourceTag)}
          onClose={closePanel}
          onSaved={saved}
        />
      )}
      {panel?.mode === 'edit' && (
        <EntryForm
          key={panel.entry.id}
          entry={panel.entry}
          sources={sources.map((s) => s.sourceTag)}
          onClose={closePanel}
          onSaved={saved}
        />
      )}
      {panel?.mode === 'view' && (
        <EntryDetail
          entry={panel.entry}
          onClose={closePanel}
          onEdit={() => setPanel({ mode: 'edit', entry: panel.entry })}
          onDelete={() => confirmDelete(panel.entry)}
        />
      )}
      {remove && (
        <ConfirmDialog
          title="Delete this entry?"
          confirm="Delete entry"
          onCancel={() => {
            if (!deleting) setRemove(null);
          }}
          onConfirm={() => void deleteEntry()}
          busy={deleting}
          error={deleteError}
        >
          <strong>{remove.title}</strong>
          <p>This action cannot be undone.</p>
        </ConfirmDialog>
      )}
      {toast && (
        <div role="status" className="toast">
          <Check size={16} />
          {toast}
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
