import { useEffect, useId, useRef, useState } from 'react';
import { Eye, X } from 'lucide-react';
import DirectoryCardView from '../../components/DirectoryCardView';
import ResourceDetailView from '../../components/ResourceDetailView';
import { programFromResourceRow } from '../../services/data/mappers';
import type { ResourceRow } from '../../services/data/dbTypes';

/** Editor-only, in-memory preview. Never save, publish, cache or fetch a draft. */
export default function ResourcePreview({ resource, disabled = false }: {
  resource: ResourceRow;
  disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [view, setView] = useState<'card' | 'detail'>('card');
  const program = programFromResourceRow(resource);

  // Keep outbound actions inert, but preserve their real hrefs for inspection.
  useEffect(() => {
    dialog.current?.querySelectorAll('a').forEach((link) => {
      link.setAttribute('aria-disabled', 'true');
      link.tabIndex = -1;
    });
  }, [view, resource]);

  function open() {
    setView('card');
    dialog.current?.showModal();
  }

  return <>
    <button type="button" onClick={open} disabled={disabled}
      className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50">
      <Eye className="h-4 w-4" aria-hidden="true" /> Preview resource
    </button>
    <dialog ref={dialog} aria-labelledby={headingId}
      className="m-auto w-full max-w-6xl max-h-[95dvh] rounded-2xl border border-surface-container-highest bg-surface p-0 text-on-surface shadow-xl backdrop:bg-black/50"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClickCapture={(event) => {
        if (event.target instanceof Element && event.target.closest('a')) event.preventDefault();
      }}
      onAuxClickCapture={(event) => {
        if (event.target instanceof Element && event.target.closest('a')) event.preventDefault();
      }}>
      <header className="sticky top-0 z-10 border-b border-surface-container-highest bg-surface px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={headingId} className="font-headline text-lg font-bold">Private resource preview</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Current editor values, including unsaved changes. Nothing is saved or published here.</p>
          </div>
          <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Close preview"
            className="shrink-0 rounded-full p-2 hover:bg-surface-container-high">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Preview view">
          {(['card', 'detail'] as const).map((value) => <button key={value} type="button"
            aria-pressed={view === value} onClick={() => setView(value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${view === value ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'}`}>
            {value === 'card' ? 'Directory card' : 'Detail page'}
          </button>)}
          <span className="text-xs text-on-surface-variant">Links and saving are disabled in preview.</span>
        </div>
      </header>
      {view === 'card' ? <div className="mx-auto max-w-lg p-4 sm:p-6">
        <DirectoryCardView program={program} onViewDetails={() => setView('detail')} />
        <p className="mt-4 text-sm text-on-surface-variant">The card shortens the description. Open Detail page to review all public notes.</p>
      </div> : <ResourceDetailView program={program} onBack={() => setView('card')} />}
    </dialog>
  </>;
}
