import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  HelpCircle,
  History,
  Info,
  Lock,
  MinusCircle,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWaitlists } from '../hooks/useWaitlists';
import { useUserData } from '../auth/UserDataContext';
import { WAITLIST_TYPE_LABELS, WAITLIST_TYPES } from '../data/affordableHousing';
import { waitlistPath } from '../lib/entityRoutes';
import type { WaitlistStatus, WaitlistType } from '../types';

interface StatusPresentation {
  label: string;
  className: string;
  Icon: LucideIcon;
}

const STATUS_PRESENTATION: Record<WaitlistStatus, StatusPresentation> = {
  open: { label: 'OPEN', className: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  limited: { label: 'LIMITED', className: 'bg-amber-50 text-amber-700', Icon: MinusCircle },
  closed: {
    label: 'CLOSED',
    className: 'bg-surface-container-highest text-on-surface-variant',
    Icon: Lock,
  },
  unknown: { label: 'UNKNOWN', className: 'bg-surface-container-high text-on-surface-variant', Icon: HelpCircle },
};

// Sort priority: most actionable first. Used for the default ordering since
// the data layer does not guarantee a stable order.
const STATUS_ORDER: Record<WaitlistStatus, number> = {
  open: 0,
  limited: 1,
  unknown: 2,
  closed: 3,
};

type StatusFilter = WaitlistStatus | 'all';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'limited', label: 'Limited' },
  { key: 'closed', label: 'Closed' },
  { key: 'unknown', label: 'Unknown' },
];

function presentationFor(status: WaitlistStatus): StatusPresentation {
  return STATUS_PRESENTATION[status] ?? STATUS_PRESENTATION.unknown;
}

// "Last opened Apr 2026" — month granularity is honest for a signal that
// says "this list does reopen sometimes", without implying day precision.
function formatLastOpened(iso: string | undefined): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function formatLastChecked(iso: string): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  // Date-only strings (e.g. "2026-04-18") parse as UTC midnight. Format in
  // UTC too, otherwise US-timezone users see the day before.
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function Waitlist() {
  const { waitlists, loading, error } = useWaitlists();
  const { isWaitlistFollowed, toggleWaitlistAlert } = useUserData();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [county, setCounty] = useState<string | 'all'>('all');
  const [waitlistType, setWaitlistType] = useState<WaitlistType | 'all'>('all');

  const counties = useMemo(() => {
    const set = new Set<string>();
    waitlists.forEach((wl) => set.add(wl.county));
    return Array.from(set).sort();
  }, [waitlists]);

  const visible = useMemo(() => {
    const filtered = waitlists.filter((wl) => {
      if (statusFilter !== 'all' && wl.status !== statusFilter) return false;
      if (county !== 'all' && wl.county !== county) return false;
      if (waitlistType !== 'all' && wl.waitlist_type !== waitlistType) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const order = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (order !== 0) return order;
      return a.agency.localeCompare(b.agency);
    });
  }, [waitlists, statusFilter, county, waitlistType]);

  const openCount = useMemo(
    () => waitlists.filter((wl) => wl.status === 'open').length,
    [waitlists],
  );

  async function handleToggleNotify(id: string) {
    setToggleError(null);
    setPendingId(id);
    try {
      await toggleWaitlistAlert(id);
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : 'Could not update alert.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="bg-surface-container-low min-h-[calc(100vh-80px)] py-12">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="mb-8 max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary mb-2">
            Waitlist tracker
          </p>
          <h1 className="text-3xl lg:text-4xl font-headline font-bold text-on-surface mb-3 tracking-tight">
            Track housing waitlists in one place.
          </h1>
          <p className="text-on-surface-variant text-base leading-relaxed">
            Monitor open waitlists across local housing authorities and turn on alerts so
            you never miss an application window.
            {!loading && !error && waitlists.length > 0 && (
              <>
                {' '}
                <span className="font-semibold text-on-surface">
                  {openCount} {openCount === 1 ? 'waitlist is' : 'waitlists are'} open right now.
                </span>
              </>
            )}
          </p>
        </div>

        {/* Filters */}
        {!loading && !error && waitlists.length > 0 && (
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center mb-6">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {STATUS_FILTERS.map((f) => {
                const active = statusFilter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setStatusFilter(f.key)}
                    aria-pressed={active}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      active
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container-lowest text-on-surface-variant border-surface-container-highest hover:border-primary/40 hover:text-on-surface'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-on-surface-variant sm:ml-auto">
              <span className="sr-only">Filter by waitlist type</span>
              <select
                value={waitlistType}
                onChange={(e) => setWaitlistType(e.target.value as WaitlistType | 'all')}
                className="bg-surface-container-lowest border border-surface-container-highest rounded-full px-3 py-1.5 text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="all">All waitlist types</option>
                {WAITLIST_TYPES.map((type) => (
                  <option key={type} value={type}>{WAITLIST_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </label>
            {counties.length > 1 && (
              <label className="inline-flex items-center gap-2 text-sm text-on-surface-variant">
                <span className="sr-only">Filter by county</span>
                <select
                  value={county}
                  onChange={(e) => setCounty(e.target.value)}
                  className="bg-surface-container-lowest border border-surface-container-highest rounded-full px-3 py-1.5 text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="all">All counties</option>
                  {counties.map((c) => (
                    <option key={c} value={c}>
                      {c} County
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {error && (
          <div className="bg-surface-container-lowest border border-error/30 rounded-2xl p-6 mb-8">
            <p className="text-error font-medium">Couldn't load waitlists right now.</p>
            <p className="text-on-surface-variant text-sm mt-1">{error.message}</p>
          </div>
        )}

        {loading && !error && (
          <p className="text-on-surface-variant text-sm mb-6">Loading waitlists…</p>
        )}

        {toggleError && (
          <div className="mb-6 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
            {toggleError}
          </div>
        )}

        {/* Disclaimer */}
        {!loading && !error && waitlists.length > 0 && (
          <div
            role="note"
            className="flex items-start gap-2 mb-6 px-3 py-2 rounded-lg border border-surface-container-highest bg-surface-container-lowest text-on-surface-variant text-xs"
          >
            <Info className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" aria-hidden="true" />
            <p>Statuses can change without notice. Always confirm directly with the housing authority before applying.</p>
          </div>
        )}

        {!loading && !error && visible.length === 0 && waitlists.length > 0 && (
          <div className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-8 text-center">
            <p className="text-on-surface font-headline font-bold text-lg mb-2">No waitlists match these filters.</p>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setCounty('all');
                setWaitlistType('all');
              }}
              className="text-primary font-semibold text-sm hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map((wl) => {
            const presentation = presentationFor(wl.status);
            const StatusIcon = presentation.Icon;
            const isNotifying = isWaitlistFollowed(wl.id);
            const isPending = pendingId === wl.id;
            const lastChecked = formatLastChecked(wl.last_checked);
            // Only meaningful on lists that are NOT currently open: "it does
            // reopen — most recently <month>".
            const lastOpened = wl.status !== 'open' ? formatLastOpened(wl.last_opened_at) : null;
            const hasLink = Boolean(wl.website);
            return (
              <div
                key={wl.id}
                className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-surface-container-highest flex flex-col hover:border-outline-variant/30 transition-colors"
              >
                <div className="flex justify-between items-start mb-4 gap-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-headline font-bold text-on-surface leading-tight">
                      <Link to={waitlistPath(wl)} className="hover:text-primary transition-colors">
                        {wl.agency}
                      </Link>
                    </h2>
                    {wl.program_name && (
                      <p className="text-sm text-on-surface-variant mt-0.5">{wl.program_name}</p>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold shrink-0 ${presentation.className}`}
                  >
                    <StatusIcon className="w-3.5 h-3.5" aria-hidden="true" />
                    {presentation.label}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium border border-surface-container-highest text-on-surface-variant">
                    {wl.county} County
                  </span>
                  {lastChecked && (
                    <span className="inline-flex items-center gap-1.5 bg-surface-container-low text-on-surface-variant text-xs px-2.5 py-1 rounded-full font-medium">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      Checked {lastChecked}
                    </span>
                  )}
                  {wl.waitlist_type && (
                    <span className="bg-primary/5 text-primary text-xs px-2.5 py-1 rounded-full font-medium">
                      {WAITLIST_TYPE_LABELS[wl.waitlist_type]}
                    </span>
                  )}
                  {lastOpened && (
                    <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded-full font-medium">
                      <History className="w-3.5 h-3.5" aria-hidden="true" />
                      Last opened {lastOpened}
                    </span>
                  )}
                </div>

                {wl.notes && (
                  <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">{wl.notes}</p>
                )}

                <div className="flex flex-wrap justify-between items-center gap-4 mt-auto pt-4 border-t border-surface-container-highest/60">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      to={waitlistPath(wl)}
                      className="text-primary font-semibold text-sm hover:text-primary-dim"
                    >
                      View details
                    </Link>
                    {hasLink && (
                      <a
                        href={wl.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary font-semibold text-sm hover:text-primary-dim flex items-center gap-1 transition-colors"
                      >
                        Official source <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-medium text-on-surface-variant">Notify me</span>
                    <button
                      type="button"
                      aria-pressed={isNotifying}
                      aria-label={
                        isNotifying
                          ? `Stop alerts for ${wl.agency}`
                          : `Email me when ${wl.agency} opens`
                      }
                      disabled={isPending}
                      onClick={() => handleToggleNotify(wl.id)}
                      className={`w-11 h-6 rounded-full relative transition-colors disabled:opacity-60 ${
                        isNotifying ? 'bg-primary' : 'bg-surface-container-highest'
                      }`}
                    >
                      <div
                        className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                          isNotifying ? 'translate-x-5' : ''
                        }`}
                      ></div>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
