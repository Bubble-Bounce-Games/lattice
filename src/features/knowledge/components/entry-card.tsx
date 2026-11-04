'use client';
import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Eye, Pencil, Copy, Trash2 } from 'lucide-react';
import type { KnowledgeEntry } from '../types';
import { TypeBadges, TypeIcon, shortDate } from './shared';
import { summaryPreview } from '../services/markdown';
export function EntryCard({
  entry,
  onView,
  onEdit,
  onDelete,
  onCopy,
}: {
  entry: KnowledgeEntry;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    wrapper.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const close = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);
  function action(callback: () => void) {
    setMenu(false);
    callback();
  }
  return (
    <article className="entry-card">
      <button className="entry-open" onClick={onView} aria-label={`View ${entry.title}`}>
        <TypeIcon type={entry.types[0]} />
        <div className="entry-content">
          <h2>{entry.title}</h2>
          <div className="entry-meta">
            <span className="source-tag">{entry.sourceTag}</span>
            <span className="meta-divider" />
            <TypeBadges types={entry.types} />
          </div>
          <p className="entry-preview">{summaryPreview(entry.summary)}</p>
        </div>
        <time className="entry-date" dateTime={entry.createdAt}>
          {shortDate(entry.createdAt)}
        </time>
      </button>
      <div
        ref={wrapper}
        className="entry-menu"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setMenu(false);
            trigger.current?.focus();
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && menu) {
            event.preventDefault();
            const buttons = Array.from(
              wrapper.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
            );
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                    buttons.length;
            buttons[next]?.focus();
          }
        }}
      >
        <button
          ref={trigger}
          className="icon-button"
          aria-label={`Actions for ${entry.title}`}
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <MoreHorizontal size={19} />
        </button>
        {menu && (
          <div className="dropdown-menu" role="menu" aria-label="Entry actions">
            <button role="menuitem" onClick={() => action(onView)}>
              <Eye size={15} />
              View
            </button>
            <button role="menuitem" onClick={() => action(onEdit)}>
              <Pencil size={15} />
              Edit
            </button>
            {entry.link && (
              <button role="menuitem" onClick={() => action(onCopy)}>
                <Copy size={15} />
                Copy link
              </button>
            )}
            <button role="menuitem" className="delete-action" onClick={() => action(onDelete)}>
              <Trash2 size={15} />
              Delete
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
