import { useCallback, useEffect, useRef, useState } from 'react';
import { checkResourcePublication } from '../resourcePublication';
import type { PublicationStatus } from '../../lib/resourcePublication';

export const PUBLICATION_LABELS = {
  live: 'Live', publishing: 'Publishing', needs_attention: 'Needs attention',
};
export default function ResourcePublicationPanel({ revision, onStatus }: {
  revision: unknown; onStatus: (value: PublicationStatus | null) => void;
}) {
  const [status, setStatus] = useState<PublicationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const queuedCheck = useRef(false);
  const check = useCallback(async (action: 'status' | 'refresh' = 'status') => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await checkResourcePublication(action);
      if (mounted.current) { setStatus(result); onStatus(result); }
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : 'Could not check publication.');
        setStatus(null); onStatus(null);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        if (queuedCheck.current) {
          queuedCheck.current = false;
          void check();
        }
      }
    }
  }, [onStatus]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    // A save/approval can reload rows during a status request. Never lose that
    // later check or keep presenting the pre-edit result as the latest state.
    if (inFlight.current) queuedCheck.current = true;
    else void check();
  }, [check, revision]);
  // Bounded read-only progress while this page is open; never starts a build.
  useEffect(() => {
    if (status?.state !== 'publishing') return;
    const timer = window.setTimeout(() => { void check(); }, 15_000);
    return () => window.clearTimeout(timer);
  }, [status, check]);
  return (
    <section className="mb-6 rounded-2xl border border-surface-container-highest bg-surface-container-lowest p-5" aria-label="Public website publication">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Public website</h2>
          <p className="mt-1 text-sm text-on-surface-variant" role="status">
            {error ? 'Needs attention: ' + error : status
              ? PUBLICATION_LABELS[status.state] + ' — ' + status.message
              : 'Checking deployed resource pages…'}
          </p>
          {!!status && status.state !== 'live' && (
            <p className="mt-2 text-xs text-on-surface-variant">
              {status.changed_count} resource pages awaiting confirmation
              {status.removed_count ? '; ' + status.removed_count + ' old pages awaiting removal' : ''}.
              This does not verify provider information or publish hidden drafts.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void check()}
            className="rounded-full border border-outline-variant px-4 py-2 text-sm font-semibold disabled:opacity-50">
            Check status
          </button>
          <button type="button" disabled={busy || status?.state === 'publishing' || status?.configured === false}
            onClick={() => void check('refresh')}
            className="rounded-full bg-primary text-on-primary px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {busy ? 'Checking…' : error || status?.state === 'needs_attention' ? 'Retry website refresh' : 'Refresh public pages'}
          </button>
        </div>
      </div>
      {status?.configured === false && <p className="mt-2 text-xs text-error">Refresh is unavailable here. Use the production admin site, or check the server build-hook configuration.</p>}
    </section>
  );
}
