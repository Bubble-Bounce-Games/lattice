'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bold, Italic, List, ListOrdered, Link2, Check, ArrowUpRight } from 'lucide-react';
import { KNOWLEDGE_TYPES, type KnowledgeEntry, type KnowledgeEntryInput } from '../types';
import { entryInputSchema } from '../schemas/entry';
import { knowledgeApi } from '../services/client';
import { formatSelection, type FormatAction } from '../services/markdown';
import { CloseButton, ConfirmDialog, Dialog, Markdown, typeDetails } from './shared';
const blank: KnowledgeEntryInput = { title: '', types: [], sourceTag: '', summary: '', link: '' };
export function EntryForm({
  entry,
  sources,
  onClose,
  onSaved,
}: {
  entry?: KnowledgeEntry;
  sources: string[];
  onClose: () => void;
  onSaved: (entry: KnowledgeEntry) => void;
}) {
  const [values, setValues] = useState<KnowledgeEntryInput>(() =>
    entry
      ? {
          title: entry.title,
          types: entry.types,
          sourceTag: entry.sourceTag,
          summary: entry.summary,
          link: entry.link,
        }
      : { ...blank },
  );
  const [initial] = useState(() => JSON.stringify(values));
  const dirty = JSON.stringify(values) !== initial;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [preview, setPreview] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const saving = useRef(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const change = <K extends keyof KnowledgeEntryInput>(key: K, value: KnowledgeEntryInput[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };
  const close = () => {
    if (saving.current) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    const parsed = entryInputSchema.safeParse(values);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message;
      if (fields.summary) setPreview(false);
      setErrors(fields);
      setError('');
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = entry
        ? await knowledgeApi.update(entry, parsed.data)
        : await knowledgeApi.create(parsed.data);
      onSaved(saved);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save this entry. Please try again.',
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function format(action: FormatAction) {
    const area = textarea.current;
    if (!area) return;
    const result = formatSelection(values.summary, area.selectionStart, area.selectionEnd, action);
    change('summary', result.value);
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(result.start, result.end);
    });
  }
  const toolbar = [
    { action: 'bold', label: 'Bold', Icon: Bold },
    { action: 'italic', label: 'Italic', Icon: Italic },
    { action: 'bullet', label: 'Bullet list', Icon: List },
    { action: 'ordered', label: 'Numbered list', Icon: ListOrdered },
    { action: 'link', label: 'Insert link', Icon: Link2 },
  ] as const;
  const fieldError = (key: string) =>
    errors[key] ? (
      <span className="field-error" id={`${key}-error`}>
        {errors[key]}
      </span>
    ) : null;
  return (
    <>
      <Dialog
        title={entry ? 'Edit Entry' : 'New Entry'}
        onClose={close}
        className="drawer"
        busy={busy}
      >
        <div className="drawer-header">
          <div>
            <div className="dialog-eyebrow">CAPTURE SOMETHING WORTH KEEPING</div>
            <h2>{entry ? 'Edit Entry' : 'New Entry'}</h2>
          </div>
          <CloseButton onClick={close} disabled={busy} />
        </div>
        <form
          ref={form}
          className="entry-form"
          onSubmit={submit}
          noValidate
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              form.current?.requestSubmit();
            }
          }}
        >
          <div className="form-scroll">
            <div className="field">
              <label htmlFor="entry-title">
                Title <span>*</span>
              </label>
              <input
                autoFocus
                id="entry-title"
                placeholder="e.g. The Power of Small Wins"
                value={values.title}
                onChange={(e) => change('title', e.target.value)}
                maxLength={300}
                disabled={busy}
                aria-invalid={!!errors.title}
                aria-describedby={errors.title ? 'title-error' : undefined}
              />
              {fieldError('title')}
            </div>
            <fieldset className="field">
              <legend>
                Type <span>*</span>
                <small>Choose one or more</small>
              </legend>
              <div className="type-options">
                {KNOWLEDGE_TYPES.map((type) => {
                  const selected = values.types.includes(type);
                  return (
                    <label
                      key={type}
                      className={`type-option ${typeDetails[type].className} ${selected ? 'selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={busy}
                        onChange={() =>
                          change(
                            'types',
                            selected
                              ? values.types.filter((t) => t !== type)
                              : [...values.types, type],
                          )
                        }
                        aria-invalid={!!errors.types}
                        aria-describedby={errors.types ? 'types-error' : undefined}
                      />
                      <span className="check-box">
                        {selected && <Check size={11} strokeWidth={3} />}
                      </span>
                      {typeDetails[type].label}
                    </label>
                  );
                })}
              </div>
              {fieldError('types')}
            </fieldset>
            <div className="field">
              <label htmlFor="entry-source">
                Source Tag <span>*</span>
              </label>
              <input
                id="entry-source"
                list="known-sources"
                placeholder="e.g. HBR, McKinsey, YouTube, Spotify"
                value={values.sourceTag}
                onChange={(e) => change('sourceTag', e.target.value)}
                maxLength={120}
                disabled={busy}
                aria-invalid={!!errors.sourceTag}
                aria-describedby={errors.sourceTag ? 'sourceTag-error' : undefined}
              />
              <datalist id="known-sources">
                {sources.map((source) => (
                  <option value={source} key={source} />
                ))}
              </datalist>
              {fieldError('sourceTag')}
            </div>
            <div className="field summary-field">
              <div className="label-row">
                <label htmlFor="entry-summary">
                  Summary <span>*</span>
                </label>
                <div className="editor-tabs">
                  <button
                    type="button"
                    className={!preview ? 'active' : ''}
                    onClick={() => setPreview(false)}
                    aria-pressed={!preview}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    className={preview ? 'active' : ''}
                    onClick={() => setPreview(true)}
                    aria-pressed={preview}
                  >
                    Preview
                  </button>
                </div>
              </div>
              <div className={`editor ${errors.summary ? 'invalid' : ''}`}>
                {preview ? (
                  <div className="summary-preview" tabIndex={0}>
                    {values.summary ? (
                      <Markdown>{values.summary}</Markdown>
                    ) : (
                      <span>Your summary preview will appear here.</span>
                    )}
                  </div>
                ) : (
                  <textarea
                    ref={textarea}
                    id="entry-summary"
                    placeholder="Write your summary here..."
                    value={values.summary}
                    onChange={(e) => change('summary', e.target.value)}
                    maxLength={50000}
                    disabled={busy}
                    aria-invalid={!!errors.summary}
                    aria-describedby={errors.summary ? 'summary-error' : 'markdown-hint'}
                  />
                )}
                <div className="editor-toolbar">
                  <div>
                    {toolbar.map(({ action, label, Icon }) => (
                      <button
                        key={action}
                        type="button"
                        aria-label={label}
                        title={label}
                        onClick={() => format(action)}
                        disabled={busy || preview}
                      >
                        <Icon size={16} />
                      </button>
                    ))}
                  </div>
                  <span id="markdown-hint">Markdown supported</span>
                </div>
              </div>
              {fieldError('summary')}
            </div>
            <div className="field">
              <label htmlFor="entry-link">
                Link <span className="optional">(optional)</span>
              </label>
              <div className="link-input">
                <Link2 size={17} />
                <input
                  id="entry-link"
                  placeholder="https://..."
                  type="url"
                  value={values.link}
                  onChange={(e) => change('link', e.target.value)}
                  disabled={busy}
                  aria-invalid={!!errors.link}
                  aria-describedby={errors.link ? 'link-error' : undefined}
                />
              </div>
              {fieldError('link')}
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
          </div>
          <div className="form-footer">
            <span className="shortcut-note">⌘ / Ctrl + ↵ to save</span>
            <button type="button" className="button" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? 'Saving…' : entry ? 'Save Changes' : 'Save Entry'}
              {!busy && <ArrowUpRight size={15} />}
            </button>
          </div>
        </form>
      </Dialog>
      {discard && (
        <ConfirmDialog
          title="Discard your changes?"
          confirm="Discard changes"
          onConfirm={onClose}
          onCancel={() => setDiscard(false)}
        >
          Your unsaved changes will be lost. Keep editing to save them to your library.
        </ConfirmDialog>
      )}
    </>
  );
}
