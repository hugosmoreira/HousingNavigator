import {
  ArrowLeft,
  ArrowUpRight,
  CalendarCheck,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  DIRECTORY_CATEGORY_LABELS,
  legacyToDirectoryCategory,
} from '../data/categoryMap';
import { usePrograms } from '../hooks/usePrograms';
import { findResourceBySlug } from '../lib/entityRoutes';
import { serviceAreaSummary, serviceAreasForProgram } from '../data/serviceAreas';
import type { ApplicationMethod, Program } from '../types';
import NotFound from './NotFound';

const APPLICATION_METHOD_LABEL: Record<ApplicationMethod, string> = {
  walk_in: 'Walk in',
  phone: 'Call the provider',
  online: 'Apply online',
  referral: 'Ask for a referral',
};

const HOUSEHOLD_LABEL: Record<Program['who_it_helps'][number], string> = {
  single_adult: 'Single adults',
  family: 'Families',
  senior: 'Seniors',
  veteran: 'Veterans',
  disability: 'People with disabilities',
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

export default function ResourceDetail() {
  const { slug = '' } = useParams();
  const { programs, loading, error } = usePrograms();
  const program = findResourceBySlug(programs, slug);

  if (!program && loading) {
    return <p className="mx-auto max-w-6xl px-6 py-16 text-on-surface-variant">Loading resource…</p>;
  }

  if (!program) return <NotFound />;

  const directoryCategory =
    program.directory_category ?? legacyToDirectoryCategory(program.category);
  const categoryLabel = DIRECTORY_CATEGORY_LABELS[directoryCategory];
  const verified = formatDate(program.last_verified);
  const phoneHref = program.phone
    ? `tel:${program.phone.replace(/[^0-9+]/g, '')}`
    : null;
  const verificationSourceUrl = program.source_url || program.website;
  const verificationSourceType = program.source_type || 'Provider website';
  const serviceAreas = serviceAreasForProgram(program);
  const areaSummary = serviceAreaSummary(serviceAreas);
  const location = [program.address, program.city, program.state]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' · ');

  return (
    <div className="bg-surface min-h-[calc(100vh-80px)]">
      <section className="border-b border-surface-container-highest bg-surface-container-low">
        <div className="mx-auto max-w-6xl px-6 py-10 lg:px-12 lg:py-14">
          <Link
            to="/resources/"
            className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-dim"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to all resources
          </Link>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {categoryLabel}
            </span>
            <span className="rounded-full border border-surface-container-highest px-3 py-1 text-xs font-medium text-on-surface-variant">
              {areaSummary}
            </span>
          </div>
          <h1 className="max-w-4xl text-3xl font-headline font-bold tracking-tight text-on-surface lg:text-5xl">
            {program.program_name}
          </h1>
          {(program.description || program.notes) && (
            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-on-surface-variant">
              {program.description || program.notes}
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-12 lg:py-14">
        <main className="min-w-0 space-y-8">
          {program.eligibility_summary && (
            <section className="rounded-2xl border border-surface-container-highest bg-surface-container-lowest p-6">
              <div className="mb-3 flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 className="text-xl font-headline font-bold text-on-surface">Who may qualify</h2>
              </div>
              <p className="leading-relaxed text-on-surface-variant">{program.eligibility_summary}</p>
            </section>
          )}

          <section>
            <h2 className="mb-4 text-xl font-headline font-bold text-on-surface">Program details</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="How to apply" value={APPLICATION_METHOD_LABEL[program.application_method]} />
              <Detail label="Referral" value={program.referral_required ? 'Required' : 'Not listed as required'} />
              <Detail label="Areas served" value={areaSummary} />
              {location && <Detail label="Provider location" value={location} />}
              <Detail
                label="People served"
                value={program.who_it_helps.map((group) => HOUSEHOLD_LABEL[group]).join(', ')}
              />
            </dl>
          </section>

          {program.notes && program.notes !== program.description && (
            <section>
              <h2 className="mb-3 text-xl font-headline font-bold text-on-surface">Additional information</h2>
              <p className="leading-relaxed text-on-surface-variant">{program.notes}</p>
            </section>
          )}

          <div role="note" className="rounded-xl border border-surface-container-highest bg-surface-container-low px-4 py-3 text-sm leading-relaxed text-on-surface-variant">
            Availability and eligibility can change. Confirm the current requirements directly with the provider before applying.
          </div>

          {error && (
            <p className="text-sm text-on-surface-variant">Live updates are temporarily unavailable; this page is showing the last bundled listing.</p>
          )}
        </main>

        <aside className="h-fit rounded-2xl border border-surface-container-highest bg-surface-container-lowest p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-headline font-bold text-on-surface">Contact and verification</h2>
          <div className="space-y-4 text-sm">
            {phoneHref && (
              <a href={phoneHref} className="flex items-start gap-3 font-semibold text-primary hover:text-primary-dim">
                <Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {program.phone}
              </a>
            )}
            {location && (
              <p className="flex items-start gap-3 text-on-surface-variant">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> {location}
              </p>
            )}
            <p className="flex items-start gap-3 text-on-surface-variant">
              <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              {verified ? `Last verified ${verified}` : 'Verification date pending'}
            </p>
          </div>

          <section
            aria-labelledby="resource-verification-heading"
            className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4"
          >
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 id="resource-verification-heading" className="font-semibold text-on-surface">
                  How this listing was checked
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
                  Housing Navigator reviewed the listed source
                  {verified ? ` on ${verified}` : ''}. Availability can change, so confirm directly before applying.
                </p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-primary/15 pt-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-on-surface-variant">Source type</dt>
                <dd className="text-right font-semibold text-on-surface">{verificationSourceType}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-on-surface-variant">Latest review</dt>
                <dd className="text-right font-semibold text-on-surface">{verified || 'Pending'}</dd>
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

          {program.website && (
            <a
              href={program.website}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-on-primary hover:bg-primary-dim"
            >
              Visit provider website <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-4">
      <dt className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{label}</dt>
      <dd className="mt-1 font-medium leading-relaxed text-on-surface">{value}</dd>
    </div>
  );
}
