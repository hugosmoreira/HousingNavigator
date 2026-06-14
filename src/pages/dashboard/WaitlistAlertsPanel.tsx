import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ArrowUpRight, Trash2 } from 'lucide-react';
import { useUserData } from '../../auth/UserDataContext';
import { fetchWaitlistsByIds } from '../../services/userData';
import type { WaitlistRow } from '../../services/data/dbTypes';

const STATUS_LABEL: Record<string, { label: string; className: string; dot: string }> = {
  open: {
    label: 'Open',
    className: 'bg-green-50 text-green-800 border-green-200',
    dot: 'bg-green-500',
  },
  limited: {
    label: 'Limited',
    className: 'bg-amber-50 text-amber-900 border-amber-200',
    dot: 'bg-amber-500',
  },
  closed: {
    label: 'Closed',
    className: 'bg-surface-container-high text-on-surface-variant border-outline-variant/30',
    dot: 'bg-on-surface-variant',
  },
  unknown: {
    label: 'Unknown',
    className: 'bg-yellow-50 text-yellow-900 border-yellow-200',
    dot: 'bg-yellow-500',
  },
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function WaitlistAlertsPanel() {
  const {
    alertsByWaitlistId,
    toggleWaitlistAlert,
    setAlertPrefs,
    loading: userDataLoading,
  } = useUserData();
  const [rows, setRows] = useState<WaitlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const ids = useMemo(() => Array.from(alertsByWaitlistId.keys()), [alertsByWaitlistId]);

  useEffect(() => {
    let active = true;
    (async () => {
      setError(null);
      setLoading(true);
      try {
        const fetched = await fetchWaitlistsByIds(ids);
        if (active) setRows(fetched);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load alerts');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [ids]);

  async function handleUnfollow(id: string) {
    setPendingId(id);
    try {
      await toggleWaitlistAlert(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unfollow');
    } finally {
      setPendingId(null);
    }
  }

  async function handlePrefChange(
    id: string,
    field: 'notify_on_open' | 'notify_on_status_change',
    next: boolean,
  ) {
    setPendingId(id);
    try {
      await setAlertPrefs(id, { [field]: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update preferences');
    } finally {
      setPendingId(null);
    }
  }

  const isInitialLoad = (loading || userDataLoading) && rows.length === 0;

  return (
    <section className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-6 lg:p-8">
      <header className="flex items-center gap-3 mb-5">
        <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Bell className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-lg font-headline font-bold text-on-surface tracking-tight">
            My waitlist alerts
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {ids.length} followed
          </p>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          {error}
        </div>
      )}

      {isInitialLoad ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : ids.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-on-surface-variant mb-3">
            You're not following any waitlists yet.
          </p>
          <Link
            to="/waitlist"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-dim"
          >
            Browse waitlists
          </Link>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          The waitlists you were following are no longer published.
        </p>
      ) : (
        <>
          {rows.length < ids.length && (
            <p className="mb-4 text-xs text-on-surface-variant">
              {ids.length - rows.length}{' '}
              {ids.length - rows.length === 1 ? 'waitlist is' : 'waitlists are'} no
              longer published and not shown here.
            </p>
          )}
          <ul className="space-y-4">
          {rows.map((row) => {
            const alert = alertsByWaitlistId.get(row.id);
            const status = STATUS_LABEL[row.status] ?? STATUS_LABEL.unknown;
            const sourceUrl = row.application_link ?? row.source_url ?? null;
            return (
              <li
                key={row.id}
                className="border border-surface-container-highest rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-headline font-bold text-on-surface tracking-tight">
                      {row.housing_authority}
                    </h3>
                    {row.program_name && (
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {row.program_name}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnfollow(row.id)}
                    disabled={pendingId === row.id}
                    aria-label={`Unfollow ${row.housing_authority}`}
                    title="Unfollow"
                    className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-on-surface-variant hover:text-error hover:bg-error/5 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3 text-xs text-on-surface-variant mb-3 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold border ${status.className}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                  </span>
                  <span>Last checked {formatDate(row.last_checked)}</span>
                  {sourceUrl && (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-dim"
                    >
                      Source <ArrowUpRight className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {alert && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 border-t border-surface-container-highest/60">
                    <PrefRow
                      label="Notify when it opens"
                      checked={alert.notify_on_open}
                      disabled={pendingId === row.id}
                      onChange={(v) => handlePrefChange(row.id, 'notify_on_open', v)}
                    />
                    <PrefRow
                      label="Notify on any status change"
                      checked={alert.notify_on_status_change}
                      disabled={pendingId === row.id}
                      onChange={(v) =>
                        handlePrefChange(row.id, 'notify_on_status_change', v)
                      }
                    />
                  </div>
                )}
              </li>
            );
          })}
          </ul>
        </>
      )}

      {/* TODO(notifications): when the Edge Function dispatch worker is wired
          up via Resend, the prefs above will start firing real emails.
          Until then, these toggles only persist preferences. */}
    </section>
  );
}

function PrefRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-surface-container-low/60 cursor-pointer hover:bg-surface-container-low transition-colors">
      <span className="text-xs text-on-surface">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full relative transition-colors disabled:opacity-50 ${
          checked ? 'bg-primary' : 'bg-surface-container-highest'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </button>
    </label>
  );
}
