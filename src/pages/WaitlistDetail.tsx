import {
  ArrowLeft,
  ArrowUpRight,
  CalendarCheck,
  CheckCircle2,
  HelpCircle,
  Lock,
  MapPin,
  MinusCircle,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useWaitlists } from '../hooks/useWaitlists';
import { useAffordableProperties } from '../hooks/useAffordableProperties';
import { WAITLIST_TYPE_LABELS } from '../data/affordableHousing';
import { affordablePropertyPath, findWaitlistBySlug } from '../lib/entityRoutes';
import type { WaitlistStatus } from '../types';
import NotFound from './NotFound';

const STATUS_PRESENTATION: Record<WaitlistStatus, { label: string; className: string; Icon: LucideIcon }> = {
  open: { label: 'Open', className: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  limited: { label: 'Limited', className: 'bg-amber-50 text-amber-700', Icon: MinusCircle },
  closed: { label: 'Closed', className: 'bg-surface-container-highest text-on-surface-variant', Icon: Lock },
  unknown: { label: 'Unknown', className: 'bg-surface-container-high text-on-surface-variant', Icon: HelpCircle },
};

function formatDate(iso: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function WaitlistDetail() {
  const { slug = '' } = useParams();
  const { waitlists, loading, error } = useWaitlists();
  const { properties } = useAffordableProperties();
  const waitlist = findWaitlistBySlug(waitlists, slug);

  if (!waitlist && loading) {
    return <p className="mx-auto max-w-6xl px-6 py-16 text-on-surface-variant">Loading waitlist…</p>;
  }

  if (!waitlist) return <NotFound />;

  const presentation = STATUS_PRESENTATION[waitlist.status];
  const StatusIcon = presentation.Icon;
  const checked = formatDate(waitlist.last_checked);
  const verificationSourceUrl =
    waitlist.source_url || waitlist.application_link || waitlist.website;
  const linkedProperty = waitlist.affordable_property_id
    ? properties.find((property) => property.id === waitlist.affordable_property_id)
    : undefined;

  return (
    <div className="bg-surface min-h-[calc(100vh-80px)]">
      <section className="border-b border-surface-container-highest bg-surface-container-low">
        <div className="mx-auto max-w-5xl px-6 py-10 lg:px-12 lg:py-14">
          <Link
            to="/waitlist/"
            className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-dim"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to waitlist tracker
          </Link>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-bold ${presentation.className}`}>
              <StatusIcon className="h-4 w-4" aria-hidden="true" /> {presentation.label}
            </span>
            <span className="rounded-full border border-surface-container-highest px-3 py-1 text-xs font-medium text-on-surface-variant">
              {waitlist.county} County
            </span>
            {waitlist.waitlist_type && (
              <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                {WAITLIST_TYPE_LABELS[waitlist.waitlist_type]}
              </span>
            )}
          </div>
          <h1 className="max-w-4xl text-3xl font-headline font-bold tracking-tight text-on-surface lg:text-5xl">
            {waitlist.agency}
          </h1>
          <p className="mt-4 text-lg text-on-surface-variant">
            {waitlist.waitlist_type ? WAITLIST_TYPE_LABELS[waitlist.waitlist_type] : 'Housing'} waitlist status and official application information.
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-12 lg:py-14">
        <main className="min-w-0 space-y-8">
          <section className="rounded-2xl border border-surface-container-highest bg-surface-container-lowest p-6">
            <h2 className="mb-4 text-xl font-headline font-bold text-on-surface">Current information</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-surface-container-low p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Reported status</dt>
                <dd className="mt-1 font-semibold text-on-surface">{presentation.label}</dd>
              </div>
              <div className="rounded-xl bg-surface-container-low p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Last checked</dt>
                <dd className="mt-1 font-semibold text-on-surface">{checked || 'Verification pending'}</dd>
              </div>
            </dl>
            {waitlist.notes && <p className="mt-5 leading-relaxed text-on-surface-variant">{waitlist.notes}</p>}
          </section>

          <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
            Waitlist status can change without notice. Always confirm directly with the housing authority before preparing or submitting an application.
          </div>

          {linkedProperty && (
            <section className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
              <h2 className="font-headline text-lg font-bold text-on-surface">About this apartment property</h2>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                See bedroom sizes, income limits, eligibility, accessibility, address, and contact information.
              </p>
              <Link to={affordablePropertyPath(linkedProperty)} className="mt-4 inline-flex text-sm font-semibold text-primary hover:text-primary-dim">
                View {linkedProperty.name}
              </Link>
            </section>
          )}

          {error && (
            <p className="text-sm text-on-surface-variant">Live updates are temporarily unavailable; this page is showing the last bundled status.</p>
          )}
        </main>

        <aside className="h-fit rounded-2xl border border-surface-container-highest bg-surface-container-lowest p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-headline font-bold text-on-surface">Official information</h2>
          <p className="flex items-start gap-3 text-sm text-on-surface-variant">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> {waitlist.county} County
          </p>
          <p className="mt-4 flex items-start gap-3 text-sm text-on-surface-variant">
            <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            {checked ? `Checked ${checked}` : 'Verification date pending'}
          </p>

          <section
            aria-labelledby="waitlist-verification-heading"
            className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4"
          >
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 id="waitlist-verification-heading" className="font-semibold text-on-surface">
                  How this status was checked
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
                  Housing Navigator reviewed the listed agency or provider source
                  {checked ? ` on ${checked}` : ''}. Waitlist status can change without notice.
                </p>
              </div>
            </div>
            <dl className="mt-4 border-t border-primary/15 pt-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-on-surface-variant">Latest review</dt>
                <dd className="text-right font-semibold text-on-surface">{checked || 'Pending'}</dd>
              </div>
            </dl>
            {verificationSourceUrl && (
              <a
                href={verificationSourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-dim"
              >
                Review the listed source <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
          </section>

          {waitlist.website && (
            <a
              href={waitlist.website}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-on-primary hover:bg-primary-dim"
            >
              Open official source <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
        </aside>
      </div>
    </div>
  );
}
