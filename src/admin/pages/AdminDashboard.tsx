import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  ClipboardCheck,
  ListChecks,
  Plus,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react';
import { requireSupabase } from '../../lib/supabaseClient';
import { listAdminUsers } from '../adminUsers';

interface DashboardSnapshot {
  resources: number;
  resourceDrafts: number;
  waitlists: number;
  openWaitlists: number;
  users: number;
  pendingReviews: number;
  recentCheckFailures: number;
  curationNeedsReview: number;
  curationFailures: number;
  curationFinishedAt: string | null;
}

const EMPTY_SNAPSHOT: DashboardSnapshot = {
  resources: 0,
  resourceDrafts: 0,
  waitlists: 0,
  openWaitlists: 0,
  users: 0,
  pendingReviews: 0,
  recentCheckFailures: 0,
  curationNeedsReview: 0,
  curationFailures: 0,
  curationFinishedAt: null,
};

export default function AdminDashboard() {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = await requireSupabase();
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [
        resources,
        drafts,
        waitlists,
        openWaitlists,
        pendingReviews,
        recentFailures,
        curationRun,
        userPage,
      ] = await Promise.all([
        client.from('resources_admin').select('id', { count: 'exact', head: true }),
        client
          .from('resources_admin')
          .select('id', { count: 'exact', head: true })
          .eq('published', false),
        client.from('waitlists_admin').select('id', { count: 'exact', head: true }),
        client
          .from('waitlists_admin')
          .select('id', { count: 'exact', head: true })
          .eq('current_status', 'open'),
        client
          .from('waitlist_status_suggestions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        client
          .from('waitlist_status_checks')
          .select('id', { count: 'exact', head: true })
          .gte('checked_at', since)
          .in('action', ['fetch_failed', 'insufficient_content', 'classify_failed']),
        client
          .from('resource_curation_runs')
          .select('needs_review_count, failed_count, finished_at')
          .eq('status', 'completed')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        listAdminUsers(1, 1),
      ]);

      const queryError = [
        resources.error,
        drafts.error,
        waitlists.error,
        openWaitlists.error,
        pendingReviews.error,
        recentFailures.error,
        curationRun.error,
      ].find(Boolean);
      if (queryError) throw queryError;

      const run = curationRun.data as {
        needs_review_count: number;
        failed_count: number;
        finished_at: string | null;
      } | null;
      setSnapshot({
        resources: resources.count ?? 0,
        resourceDrafts: drafts.count ?? 0,
        waitlists: waitlists.count ?? 0,
        openWaitlists: openWaitlists.count ?? 0,
        users: userPage.total,
        pendingReviews: pendingReviews.count ?? 0,
        recentCheckFailures: recentFailures.count ?? 0,
        curationNeedsReview: run?.needs_review_count ?? 0,
        curationFailures: run?.failed_count ?? 0,
        curationFinishedAt: run?.finished_at ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const attentionCount =
    snapshot.pendingReviews +
    snapshot.recentCheckFailures +
    snapshot.curationNeedsReview +
    snapshot.curationFailures;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-10 lg:py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-primary">Administration overview</p>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-on-surface">
            Everything important, in one place
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
            Monitor the directory, review automated checks, and manage the people using
            Housing Navigator.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full border border-surface-container-highest bg-surface-container-lowest px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          Could not load all dashboard data: {error}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Platform totals">
        <MetricCard
          label="Resources"
          value={snapshot.resources}
          detail={`${snapshot.resourceDrafts} draft${snapshot.resourceDrafts === 1 ? '' : 's'}`}
          icon={<ListChecks className="h-5 w-5" />}
          loading={loading}
        />
        <MetricCard
          label="Waitlists"
          value={snapshot.waitlists}
          detail={`${snapshot.openWaitlists} currently open`}
          icon={<ClipboardCheck className="h-5 w-5" />}
          loading={loading}
        />
        <MetricCard
          label="Registered users"
          value={snapshot.users}
          detail="Public and administrator accounts"
          icon={<Users className="h-5 w-5" />}
          loading={loading}
        />
        <MetricCard
          label="Needs attention"
          value={attentionCount}
          detail="Across checks and review queues"
          icon={<AlertTriangle className="h-5 w-5" />}
          loading={loading}
          tone={attentionCount > 0 ? 'warning' : 'success'}
        />
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <section className="rounded-3xl border border-surface-container-highest bg-surface-container-lowest p-5 lg:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-headline text-lg font-bold tracking-tight">Operations</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                Items requiring an administrator decision or manual check.
              </p>
            </div>
            {attentionCount === 0 && <CheckCircle2 className="h-6 w-6 text-green-600" />}
          </div>

          <div className="divide-y divide-surface-container-highest">
            <OperationRow
              title="Waitlist status suggestions"
              detail="Status changes waiting for approval before becoming public."
              count={snapshot.pendingReviews}
              to="/admin/review"
            />
            <OperationRow
              title="Unreadable waitlist pages"
              detail="Checks that could not read or classify a source during the last 24 hours."
              count={snapshot.recentCheckFailures}
              to="/admin/review"
            />
            <OperationRow
              title="Resource curation review"
              detail={
                snapshot.curationFinishedAt
                  ? `From the run completed ${formatRelativeDate(snapshot.curationFinishedAt)}.`
                  : 'No completed resource-curation run yet.'
              }
              count={snapshot.curationNeedsReview + snapshot.curationFailures}
              to="/admin/resources"
            />
          </div>
        </section>

        <section className="rounded-3xl bg-inverse-surface p-5 text-inverse-on-surface lg:p-6">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-inverse-primary/20 text-inverse-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <h2 className="font-headline text-xl font-bold tracking-tight text-white">Quick actions</h2>
          <p className="mt-2 text-sm leading-relaxed text-inverse-on-surface">
            The most common administrative tasks, without hunting through menus.
          </p>
          <div className="mt-6 space-y-2">
            <QuickAction to="/admin/resources/new" icon={<Plus className="h-4 w-4" />}>
              Add a resource
            </QuickAction>
            <QuickAction to="/admin/waitlists/new" icon={<Plus className="h-4 w-4" />}>
              Add a waitlist
            </QuickAction>
            <QuickAction to="/admin/users?invite=1" icon={<Users className="h-4 w-4" />}>
              Invite a user
            </QuickAction>
            <QuickAction to="/admin/alerts" icon={<BellRing className="h-4 w-4" />}>
              Review alert history
            </QuickAction>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  loading,
  tone = 'default',
}: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  loading: boolean;
  tone?: 'default' | 'warning' | 'success';
}) {
  const toneClass =
    tone === 'warning'
      ? 'bg-amber-50 text-amber-700'
      : tone === 'success'
        ? 'bg-green-50 text-green-700'
        : 'bg-primary/10 text-primary';
  return (
    <article className="rounded-3xl border border-surface-container-highest bg-surface-container-lowest p-5">
      <div className={`mb-5 flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}>
        {icon}
      </div>
      <p className="text-sm font-semibold text-on-surface-variant">{label}</p>
      <p className="mt-1 font-headline text-3xl font-bold tracking-tight text-on-surface">
        {loading ? '—' : value.toLocaleString()}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{detail}</p>
    </article>
  );
}

function OperationRow({
  title,
  detail,
  count,
  to,
}: {
  title: string;
  detail: string;
  count: number;
  to: string;
}) {
  return (
    <Link to={to} className="group flex items-center gap-4 py-4 first:pt-0 last:pb-0">
      <span
        className={`flex h-9 min-w-9 items-center justify-center rounded-xl px-2 text-sm font-bold ${
          count > 0 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
        }`}
      >
        {count}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-on-surface">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-on-surface-variant">
          {detail}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 text-on-surface-variant transition-transform group-hover:translate-x-1" />
    </Link>
  );
}

function QuickAction({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-xl bg-white/8 px-3.5 py-3 text-sm font-semibold text-white hover:bg-white/14"
    >
      <span className="text-inverse-primary">{icon}</span>
      <span className="flex-1">{children}</span>
      <ArrowRight className="h-4 w-4 text-inverse-on-surface" />
    </Link>
  );
}

function formatRelativeDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'recently';
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
