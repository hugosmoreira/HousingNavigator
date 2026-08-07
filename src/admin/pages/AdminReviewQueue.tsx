import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, XCircle } from 'lucide-react';
import { requireSupabase } from '../../lib/supabaseClient';
import { WAITLIST_STATUS_LABEL } from '../notifyWaitlistAlert';
import type { WaitlistStatus } from '../../types';

/**
 * Review queue for the automated status checker (migration 0012).
 *
 * The checker never publishes anything on its own: every detected status
 * change lands here as a PENDING suggestion. Approving calls the
 * `review_waitlist_suggestion` RPC, which applies the change to the
 * waitlist — firing the existing subscriber-alert pipeline exactly as a
 * manual edit would. Rejecting just dismisses the suggestion.
 */

interface SuggestionRow {
  id: string;
  waitlist_id: string;
  previous_status: WaitlistStatus;
  suggested_status: WaitlistStatus;
  confidence: number | null;
  evidence: string | null;
  checked_url: string | null;
  created_at: string;
  updated_at: string;
}

interface ProblemCheck {
  id: number;
  waitlist_id: string;
  checked_at: string;
  action: string;
  error: string | null;
}

interface WaitlistName {
  housing_authority: string;
  program_name: string | null;
}

const PROBLEM_LABEL: Record<string, string> = {
  fetch_failed: 'URL unreachable',
  insufficient_content: 'Page needs JavaScript — check manually',
  classify_failed: 'Classifier error',
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AdminReviewQueue() {
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [problems, setProblems] = useState<ProblemCheck[]>([]);
  const [names, setNames] = useState<Record<string, WaitlistName>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runningCheck, setRunningCheck] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const client = await requireSupabase();
      const [sugRes, probRes] = await Promise.all([
        client
          .from('waitlist_status_suggestions')
          .select('*')
          .eq('status', 'pending')
          .order('updated_at', { ascending: false }),
        client
          .from('waitlist_status_checks')
          .select('id, waitlist_id, checked_at, action, error')
          .in('action', ['fetch_failed', 'insufficient_content', 'classify_failed'])
          .order('checked_at', { ascending: false })
          .limit(12),
      ]);
      if (sugRes.error) throw sugRes.error;
      if (probRes.error) throw probRes.error;
      const sugs = (sugRes.data ?? []) as SuggestionRow[];
      const probs = (probRes.data ?? []) as ProblemCheck[];

      const ids = [
        ...new Set([...sugs.map((s) => s.waitlist_id), ...probs.map((p) => p.waitlist_id)]),
      ];
      let nameMap: Record<string, WaitlistName> = {};
      if (ids.length > 0) {
        // waitlists_admin (0010) is the admin read surface; the base table's
        // SELECT grant for authenticated is column-restricted.
        const { data: wlData, error: wlErr } = await client
          .from('waitlists_admin')
          .select('id, housing_authority, program_name')
          .in('id', ids);
        if (wlErr) throw wlErr;
        nameMap = Object.fromEntries(
          (wlData ?? []).map((w: WaitlistName & { id: string }) => [
            w.id,
            { housing_authority: w.housing_authority, program_name: w.program_name },
          ]),
        );
      }

      setSuggestions(sugs);
      setProblems(probs);
      setNames(nameMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleReview(id: string, approve: boolean) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const client = await requireSupabase();
      const { error: rpcErr } = await client.rpc('review_waitlist_suggestion', {
        p_suggestion_id: id,
        p_approve: approve,
      });
      if (rpcErr) throw rpcErr;
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      setNotice(
        approve
          ? 'Status updated. Subscribers with matching alert preferences are emailed automatically.'
          : 'Suggestion dismissed. The checker will only re-suggest if it sees the change again.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRunNow() {
    setRunningCheck(true);
    setError(null);
    setNotice(null);
    try {
      const client = await requireSupabase();
      const { data, error: fnErr } = await client.functions.invoke('check-waitlist-status', {
        body: {},
      });
      if (fnErr) throw fnErr;
      const d = (data ?? {}) as { checked?: number; suggested?: number; message?: string };
      setNotice(
        d.checked
          ? `Checked ${d.checked} waitlist${d.checked === 1 ? '' : 's'} — ${d.suggested ?? 0} new suggestion${(d.suggested ?? 0) === 1 ? '' : 's'}.`
          : 'Nothing was due for a check. Each waitlist is re-checked about once a day.',
      );
      await load();
    } catch (err) {
      // supabase-js wraps a non-2xx response in FunctionsHttpError with the
      // generic message "Edge Function returned a non-2xx status code" and
      // the actual Response on `.context` — unwrap it so the admin sees the
      // real status and the function's own error text.
      let detail = err instanceof Error ? err.message : 'unknown error';
      const ctx = (err as { context?: unknown }).context;
      if (ctx instanceof Response) {
        detail = `HTTP ${ctx.status}`;
        try {
          const body = (await ctx.clone().json()) as { error?: string };
          if (body?.error) detail += ` — ${body.error}`;
        } catch {
          // non-JSON body; the status alone is still more useful
        }
      }
      setError(`Could not run the checker: ${detail}`);
    } finally {
      setRunningCheck(false);
    }
  }

  function waitlistLabel(id: string): string {
    const n = names[id];
    if (!n) return id;
    return [n.housing_authority, n.program_name].filter(Boolean).join(' — ');
  }

  return (
    <div className="max-w-4xl mx-auto px-6 lg:px-10 py-10">
      <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
        <h1 className="text-2xl font-headline font-bold tracking-tight">Review queue</h1>
        <button
          type="button"
          onClick={handleRunNow}
          disabled={runningCheck}
          className="inline-flex items-center gap-1.5 rounded-full border border-surface-container-highest px-4 py-1.5 text-sm font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${runningCheck ? 'animate-spin' : ''}`} />
          {runningCheck ? 'Checking…' : 'Run checker now'}
        </button>
      </div>
      <p className="text-sm text-on-surface-variant mb-6 max-w-2xl">
        The automated checker reads each waitlist&apos;s source page about once a day.
        Detected status changes wait here — nothing goes public and no subscriber is
        emailed until you approve it.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : suggestions.length === 0 ? (
        <div className="rounded-2xl border border-surface-container-highest bg-surface-container-lowest px-5 py-8 text-center text-sm text-on-surface-variant">
          No pending suggestions. The checker runs every 15 minutes and will queue
          anything that looks different from the recorded status.
        </div>
      ) : (
        <ul className="space-y-4">
          {suggestions.map((s) => {
            const confidencePct =
              s.confidence != null ? `${Math.round(s.confidence * 100)}%` : '—';
            return (
              <li
                key={s.id}
                className="rounded-2xl border border-surface-container-highest bg-surface-container-lowest p-5"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold text-on-surface">
                      {waitlistLabel(s.waitlist_id)}
                    </div>
                    <div className="mt-1 text-sm text-on-surface-variant">
                      {WAITLIST_STATUS_LABEL[s.previous_status]}{' '}
                      <span aria-hidden="true">→</span>{' '}
                      <span className="font-semibold text-on-surface">
                        {WAITLIST_STATUS_LABEL[s.suggested_status]}
                      </span>{' '}
                      · confidence {confidencePct} · seen {formatWhen(s.updated_at)}
                    </div>
                  </div>
                  {s.checked_url && (
                    <a
                      href={s.checked_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-dim shrink-0"
                    >
                      View page <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                {s.evidence && (
                  <blockquote className="mt-3 border-l-2 border-primary/40 pl-3 text-sm italic text-on-surface-variant">
                    “{s.evidence}”
                  </blockquote>
                )}

                <div className="mt-4 flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleReview(s.id, true)}
                    disabled={busyId !== null}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary text-on-primary font-semibold text-sm px-4 py-2 hover:bg-primary-dim disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {busyId === s.id ? 'Working…' : 'Approve & notify'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReview(s.id, false)}
                    disabled={busyId !== null}
                    className="inline-flex items-center gap-1.5 rounded-full border border-surface-container-highest text-on-surface font-semibold text-sm px-4 py-2 hover:bg-surface-container-low disabled:opacity-60"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-headline font-bold tracking-tight mb-1 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" /> Check health
        </h2>
        <p className="text-sm text-on-surface-variant mb-4">
          Recent checks that could not verify a page. These waitlists still need the
          occasional manual look.
        </p>
        {problems.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            No failed checks recently. All monitored pages are readable.
          </p>
        ) : (
          <ul className="divide-y divide-surface-container-highest rounded-2xl border border-surface-container-highest bg-surface-container-lowest">
            {problems.map((p) => (
              <li key={p.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="font-medium text-on-surface">
                    {waitlistLabel(p.waitlist_id)}
                  </span>
                  <span className="text-xs text-on-surface-variant whitespace-nowrap">
                    {formatWhen(p.checked_at)}
                  </span>
                </div>
                <div className="mt-0.5 text-on-surface-variant">
                  {PROBLEM_LABEL[p.action] ?? p.action}
                  {p.error ? ` · ${p.error}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
