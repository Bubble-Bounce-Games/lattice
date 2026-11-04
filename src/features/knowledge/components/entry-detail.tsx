'use client';
import { ArrowUpRight, Pencil, Trash2, CalendarDays, Clock3 } from 'lucide-react';
import type { KnowledgeEntry } from '../types';
import { CloseButton, Dialog, Markdown, TypeBadges, TypeIcon, shortDate } from './shared';
export function EntryDetail({
  entry,
  onClose,
  onEdit,
  onDelete,
}: {
  entry: KnowledgeEntry;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Dialog className="drawer detail-drawer" title={entry.title} onClose={onClose}>
      <div className="drawer-header">
        <div className="dialog-eyebrow">FROM YOUR LIBRARY</div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="detail-scroll">
        <TypeIcon type={entry.types[0]} />
        <h2 className="detail-title">{entry.title}</h2>
        <div className="entry-meta">
          <span className="source-tag">{entry.sourceTag}</span>
          <TypeBadges types={entry.types} />
        </div>
        <div className="detail-dates">
          <span>
            <CalendarDays size={13} />
            Added {shortDate(entry.createdAt)}
          </span>
          {entry.updatedAt !== entry.createdAt && (
            <span>
              <Clock3 size={13} />
              Updated {shortDate(entry.updatedAt)}
            </span>
          )}
        </div>
        <div className="detail-divider" />
        <span className="dialog-eyebrow">YOUR TAKEAWAYS</span>
        <Markdown>{entry.summary}</Markdown>
        {entry.link && (
          <a className="original-link" href={entry.link} target="_blank" rel="noopener noreferrer">
            <div>
              <span>Explore the original</span>
              <small>{new URL(entry.link).hostname}</small>
            </div>
            <ArrowUpRight size={19} />
          </a>
        )}
      </div>
      <div className="form-footer">
        <button className="icon-button delete-action" aria-label="Delete entry" onClick={onDelete}>
          <Trash2 size={17} />
        </button>
        <div className="filter-spacer" />
        <button className="button primary" onClick={onEdit}>
          <Pencil size={15} />
          Edit Entry
        </button>
      </div>
    </Dialog>
  );
}
