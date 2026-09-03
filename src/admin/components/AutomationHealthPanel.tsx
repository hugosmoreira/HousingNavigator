import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  loadAutomationHealth,
  runWaitlistCheck,
  waitlistLabel,
  type AutomationAttentionItem,
  type AutomationHealthSnapshot,
  type AutomationWaitlist,
  type CheckerResponse,
} from '../automationHealth';

const EMPTY: AutomationHealthSnapshot = {
  waitlists: [],
  verifiedToday: 0,
  pendingSuggestions: 0,
  manualReview: 0,
  overdue: 0,
  lastActivityAt: null,
  attentionItems: [],
};

export default function AutomationHealthPanel() {
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadAutomationHealth();
      setSnapshot(next);
      setSelectedId((current) =>
        current && next.waitlists.some((row) => row.id === current)
          ? current
          : (next.waitlists[0]?.id ?? ''),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => snapshot.waitlists.find((row) => row.id === selectedId) ?? null,
    [selectedId, snapshot.waitlists],
  );

  async function checkNow(waitlist: AutomationWaitlist) {
    setRunningId(waitlist.id);
    setError(null);
    setNotice(null);
    try {
      const response = await runWaitlistCheck(waitlist.id);
      setNotice(checkerNotice(waitlist, response));
      await load();
    } catch (err) {
      setError(`Could not check ${waitlistLabel(waitlist)}: ${errorMessage(err)}`);
    } finally {
      setRunningId(null);
    }
  }

  return (
    <section className="mt-8 rounded-3xl border border-surface-container-highest bg-surface-container-lowest p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="font-headline text-lg font-bold tracking-tight">Automation health</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
            See what the waitlist checker verified, what is overdue, and which pages need a
            human look. A check never publishes a status change by itself.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full border border-surface-container-highest px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh health
        </button>
      </div>

      {error && (
        <div className="mt-5 rounded-2xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthMetric
          label="Verified today"
          value={snapshot.verifiedToday}
          detail="Evidence-backed confirmations"
          loading={loading}
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <HealthMetric
          label="Pending suggestions"
          value={snapshot.pendingSuggestions}
          detail="Waiting for administrator approval"
          loading={loading}
          tone={snapshot.pendingSuggestions ? 'warning' : 'success'}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <HealthMetric
          label="Manual review"
          value={snapshot.manualReview}
          detail="Unreadable or uncertain sources"
          loading={loading}
          tone={snapshot.manualReview ? 'warning' : 'success'}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <HealthMetric
          label="Overdue"
          value={snapshot.overdue}
          detail="No attempt in the last 24 hours"
          loading={loading}
          tone={snapshot.overdue ? 'warning' : 'success'}
          icon={<Clock3 className="h-4 w-4" />}
        />
      </div>

      <p className="mt-3 text-xs text-on-surface-variant">
        {snapshot.lastActivityAt
          ? `Latest checker activity ${formatDateTime(snapshot.lastActivityAt)}.`
          : loading
            ? 'Loading the latest checker activity…'
            : 'No checker activity has been recorded yet.'}
      </p>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <div>
          <h3 className="text-sm font-bold text-on-surface">Needs attention</h3>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            Latest problems only. Older failures disappear after a successful automated or
            manual verification.
          </p>
          {loading ? (
            <p className="mt-4 text-sm text-on-surface-variant">Loading checks…</p>
          ) : snapshot.attentionItems.length === 0 ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-green-50 px-4 py-4 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              No waitlists currently need automation attention.
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-surface-container-highest rounded-2xl border border-surface-container-highest">
              {snapshot.attentionItems.slice(0, 8).map((item) => (
                <AttentionRow
                  key={item.waitlist.id}
                  item={item}
                  running={runningId === item.waitlist.id}
                  disabled={runningId !== null}
                  onCheck={() => void checkNow(item.waitlist)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-surface-container-low p-4">
          <h3 className="text-sm font-bold text-on-surface">Check one waitlist now</h3>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            Choose any published waitlist. Results are logged; a possible status change goes
            to the review queue.
          </p>
          <label className="mt-4 block text-xs font-semibold text-on-surface" htmlFor="health-waitlist">
            Waitlist
          </label>
          <select
            id="health-waitlist"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            disabled={loading || runningId !== null}
            className="mt-1 w-full rounded-xl border border-surface-container-highest bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface disabled:opacity-60"
          >
            {snapshot.waitlists.map((row) => (
              <option key={row.id} value={row.id}>
                {waitlistLabel(row)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => selected && void checkNow(selected)}
            disabled={!selected || runningId !== null}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${runningId === selectedId ? 'animate-spin' : ''}`} />
            {runningId === selectedId ? 'Checking…' : 'Check now'}
          </button>
        </div>
      </div>
    </section>
  );
}

function HealthMetric({
  label,
  value,
  detail,
  loading,
  tone,
  icon,
}: {
  label: string;
  value: number;
  detail: string;
  loading: boolean;
  tone: 'success' | 'warning';
  icon: ReactNode;
}) {
  const className =
    tone === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800';
  return (
    <article className={`rounded-2xl px-4 py-4 ${className}`}>
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <p className="mt-2 font-headline text-2xl font-bold">{loading ? '—' : value}</p>
      <p className="mt-0.5 text-xs opacity-80">{detail}</p>
    </article>
  );
}

function AttentionRow({
  item,
  running,
  disabled,
  onCheck,
}: {
  item: AutomationAttentionItem;
  running: boolean;
  disabled: boolean;
  onCheck: () => void;
}) {
  const check = item.latestCheck;
  const detail =
    item.reason === 'overdue'
      ? item.waitlist.last_auto_check_at
        ? `Last attempt ${formatDateTime(item.waitlist.last_auto_check_at)}`
        : 'No automated attempt recorded'
      : `${problemLabel(check?.action)}${check?.error ? ` · ${check.error}` : ''}`;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-on-surface">
          {waitlistLabel(item.waitlist)}
        </p>
        <p className="mt-0.5 text-xs text-on-surface-variant">{detail}</p>
      </div>
      {item.waitlist.source_url && (
        <a
          href={item.waitlist.source_url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          Source <ExternalLink className="h-3 w-3" />
        </a>
      )}
      <button
        type="button"
        onClick={onCheck}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-full border border-surface-container-highest px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
        {running ? 'Checking…' : 'Check now'}
      </button>
    </li>
  );
}

function checkerNotice(waitlist: AutomationWaitlist, response: CheckerResponse): string {
  const label = waitlistLabel(waitlist);
  if (!response.checked) return `${label}: the checker did not process this record.`;
  if (response.suggested) {
    return `${label}: a possible status change was found and added to the review queue.`;
  }
  if (response.confirmed) return `${label}: the current status was confirmed and logged.`;
  if (response.insufficient_content) {
    return `${label}: the page could not be read completely and needs manual review.`;
  }
  if (response.failed) return `${label}: the check failed and was added to automation health.`;
  return `${label}: the check finished, but the result was uncertain and needs manual review.`;
}

function problemLabel(action: string | undefined): string {
  if (action === 'fetch_failed') return 'Source could not be reached';
  if (action === 'insufficient_content') return 'Page blocks or hides readable content';
  if (action === 'classify_failed') return 'Status analysis failed';
  return 'The result was uncertain';
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return 'Unknown error';
}
