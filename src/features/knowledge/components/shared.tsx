'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { FileText, Mic, BookOpen, Video, Bookmark, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { KnowledgeType } from '../types';
export const typeDetails = {
  ARTICLE: { label: 'Article', Icon: FileText, className: 'article' },
  PODCAST: { label: 'Podcast', Icon: Mic, className: 'podcast' },
  BOOK: { label: 'Book', Icon: BookOpen, className: 'book' },
  VIDEO: { label: 'Video', Icon: Video, className: 'video' },
  OTHER: { label: 'Other', Icon: Bookmark, className: 'other' },
};
export function TypeIcon({ type, small = false }: { type: KnowledgeType; small?: boolean }) {
  const { Icon, className } = typeDetails[type];
  return (
    <span className={`type-icon ${className} ${small ? 'small' : ''}`}>
      <Icon size={small ? 19 : 24} strokeWidth={1.65} />
    </span>
  );
}
export function TypeBadges({ types }: { types: KnowledgeType[] }) {
  return types.map((type) => (
    <span key={type} className={`badge ${typeDetails[type].className}`}>
      {typeDetails[type].label}
    </span>
  ));
}
export function shortDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(value),
  );
}
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        disallowedElements={['img']}
        components={{
          a: ({ href, children: content }) =>
            href && /^https?:\/\//i.test(href) ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {content}
              </a>
            ) : (
              <span>{content}</span>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
export function Dialog({
  children,
  title,
  onClose,
  className = '',
  busy = false,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
  className?: string;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
export function CloseButton({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label="Close panel"
      onClick={onClick}
      disabled={disabled}
    >
      <X size={20} />
    </button>
  );
}
export function ConfirmDialog({
  title,
  children,
  confirm,
  onConfirm,
  onCancel,
  busy = false,
  error,
}: {
  title: string;
  children: ReactNode;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
}) {
  return (
    <Dialog title={title} onClose={onCancel} className="confirm-dialog" busy={busy}>
      <div className="confirm-content">
        <span className="dialog-eyebrow">LATTICE LIBRARY</span>
        <h2>{title}</h2>
        <div className="confirm-description">{children}</div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="confirm-actions">
          <button className="button" onClick={onCancel} disabled={busy} autoFocus>
            Cancel
          </button>
          <button className="button danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Please wait…' : confirm}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
