import { Link } from 'react-router-dom';
import {
  Search,
  SlidersHorizontal,
  ShieldCheck,
  BellRing,
  MapPin,
  ListChecks,
  ArrowRight,
  CheckCircle2,
  Clock,
  Building2,
} from 'lucide-react';
import { usePrograms } from '../hooks/usePrograms';
import { useWaitlists } from '../hooks/useWaitlists';
import { DIRECTORY_CATEGORY_LABELS, legacyToDirectoryCategory } from '../data/categoryMap';
import { serviceAreaSummary, serviceAreasForProgram } from '../data/serviceAreas';
import { resourceServiceLabels } from '../data/resourceServiceTags';
import { WAITLIST_TYPE_LABELS } from '../data/affordableHousing';
import { resourcePath, waitlistPath } from '../lib/entityRoutes';
import { formatPreviewDate, homeResourcePreview, homeWaitlistPreviews, previewStatus } from '../lib/homePreviews';
import type { WaitlistEntry, WaitlistStatus } from '../types';

export default function Home() {
  const { programs, error: programsError, loading: programsLoading } = usePrograms();
  const { waitlists, error: waitlistsError, loading: waitlistsLoading } = useWaitlists();
  const resource = homeResourcePreview(programs);
  const resourceDate = resource && formatPreviewDate(resource.last_verified);
  const previews = homeWaitlistPreviews(waitlists);
  const featuredWaitlist = previews[0];

  return (
    <>
      {/* Hero Section */}
      <section className="relative pt-16 lg:pt-20 pb-24 lg:pb-28 overflow-hidden bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="max-w-2xl min-w-0">
            <h1 className="text-[2.5rem] lg:text-[2.75rem] leading-[1.1] font-headline font-bold text-on-surface mb-6 tracking-tight">
              Housing help, finally easy to search.
            </h1>
            <p className="text-lg text-on-surface-variant font-body mb-8 leading-relaxed max-w-xl">
              Search a verified directory of rent assistance, shelter, and legal aid —
              and follow housing waitlist application updates.
              Expanding across Oregon and Washington, without the 211 runaround.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/resources/" className="inline-flex items-center justify-center gap-2 bg-primary text-on-primary px-8 py-4 rounded-full font-semibold text-base shadow-[0px_8px_24px_rgba(0,83,221,0.15)] hover:bg-primary-dim hover:shadow-[0px_12px_32px_rgba(0,83,221,0.25)] transition-all duration-300 transform hover:-translate-y-0.5 text-center">
                <Search className="w-5 h-5" aria-hidden="true" /> Find resources
              </Link>
              <Link to="/waitlist/" className="inline-flex items-center justify-center gap-2 bg-surface-container-highest text-surface-tint px-8 py-4 rounded-full font-semibold text-base hover:bg-surface-variant transition-colors text-center">
                <ListChecks className="w-5 h-5" aria-hidden="true" /> Track waitlists
              </Link>
            </div>

            {/* Trust microline */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-8 text-sm text-on-surface-variant">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-primary" aria-hidden="true" /> Recorded review dates
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-primary" aria-hidden="true" /> Oregon &amp; Washington
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary" aria-hidden="true" /> No account needed to search
              </span>
            </div>
          </div>

          {/* Previews use the same published records as the directory and tracker. */}
          <div className="relative min-h-[460px] w-full lg:flex hidden flex-col justify-center gap-4 p-8">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-surface-container-low to-surface-container-high border border-surface-container-highest shadow-[0px_12px_40px_rgba(45,51,55,0.08)]" />

            {/* Primary resource card */}
            <div className="relative mr-8 bg-surface-container-lowest rounded-2xl shadow-[0px_12px_32px_rgba(45,51,55,0.10)] border border-surface-container-highest p-6 [overflow-wrap:anywhere]">
              {resource ? <>
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">{resourceServiceLabels(resource.service_tags).slice(0, 2).join(' · ') || DIRECTORY_CATEGORY_LABELS[resource.directory_category ?? legacyToDirectoryCategory(resource.category)]}</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium border border-surface-container-highest text-on-surface-variant line-clamp-1">{serviceAreaSummary(serviceAreasForProgram(resource))}</span>
              </div>
              <h3 className="font-headline font-bold text-on-surface text-lg mb-1 line-clamp-2">{resource.program_name}</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed mb-4 line-clamp-3">
                {resource.description || resource.notes}
              </p>
              <div className="flex flex-wrap gap-2 items-center justify-between pt-3 border-t border-surface-container-highest/60">
                <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
                  <Clock className="w-3.5 h-3.5 text-primary" aria-hidden="true" /> {resourceDate ? `Last verified ${resourceDate}` : 'Verification date unavailable'}
                </span>
                <Link to={resourcePath(resource)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                  View resource <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
              </> : <Link to="/resources/" className="font-semibold text-primary hover:underline">{programsLoading ? 'Loading resources…' : 'Find housing resources'}</Link>}
              {programsError && <p className="mt-2 text-xs text-on-surface-variant">Could not refresh resources.{resource ? ' Showing previously loaded information.' : ' Please try the directory again later.'}</p>}
            </div>

            {/* Recorded status, not a simulated notification or a promise of availability. */}
            <div className="relative self-end bg-surface-container-lowest rounded-2xl shadow-[0px_12px_32px_rgba(45,51,55,0.12)] border border-surface-container-highest p-4 max-w-[15rem] [overflow-wrap:anywhere]">
              {featuredWaitlist ? <Link to={waitlistPath(featuredWaitlist)} className="block hover:underline">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <ListChecks className="w-4 h-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant leading-tight">Recorded waitlist status</p>
                  <p className="font-headline font-bold text-on-surface text-sm leading-tight">{featuredWaitlist.agency}</p>
                </div>
              </div>
              <WaitlistPreviewStatus waitlist={featuredWaitlist} />
              <p className="mt-2 text-xs text-on-surface-variant">{checkedLabel(featuredWaitlist)}</p>
              <p className="mt-1 text-xs text-on-surface-variant">{waitlistsError ? 'Could not refresh. Confirm with provider.' : 'Confirm with provider.'}</p>
              </Link> : <Link to="/waitlist/" className="font-semibold text-primary hover:underline">{waitlistsLoading ? 'Loading waitlists…' : 'Browse housing waitlists'}</Link>}
            </div>
          </div>
        </div>

        {/* Soft background decorative element */}
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
      </section>

      <section className="border-y border-surface-container-highest bg-surface-container-low">
        <div className="mx-auto max-w-7xl px-6 py-6 lg:px-12">
          <Link
            to="/affordable-housing/"
            className="group flex flex-col gap-4 rounded-2xl border border-surface-container-highest bg-surface-container-lowest p-5 shadow-sm transition-all hover:border-primary/35 hover:shadow-md sm:flex-row sm:items-center"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-headline text-lg font-bold text-on-surface">
                Browse affordable apartment properties
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-on-surface-variant">
                Compare locations, apartment sizes, income limits, eligibility, and linked application status.
              </span>
            </span>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Find apartments <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </span>
          </Link>
        </div>
      </section>

      {/* How it works (Bento Grid Style) */}
      <section className="py-24 bg-surface-container-low">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="text-3xl font-headline font-bold text-on-surface mb-4 tracking-tight">Built to help people search, not navigate forms.</h2>
            <p className="text-on-surface-variant text-lg">A modern directory and waitlist tracker for Oregon and Washington.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-[0px_8px_24px_rgba(45,51,55,0.04)]">
              <div className="w-14 h-14 bg-surface-container-low rounded-xl flex items-center justify-center text-primary mb-6">
                <Search className="w-7 h-7" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-headline font-bold text-on-surface mb-3">Search that understands housing</h3>
              <p className="text-on-surface-variant leading-relaxed text-sm">
                Type the way you talk — "section 8", "voucher", "eviction notice" — and find the right programs without picking from a giant menu.
              </p>
            </div>

            <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-[0px_8px_24px_rgba(45,51,55,0.04)] md:-translate-y-4">
              <div className="w-14 h-14 bg-surface-container-low rounded-xl flex items-center justify-center text-primary mb-6">
                <SlidersHorizontal className="w-7 h-7" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-headline font-bold text-on-surface mb-3">Filter by what actually matters</h3>
              <p className="text-on-surface-variant leading-relaxed text-sm">
                Category, county, and who a program helps — quick filters and situation chips, no questionnaire and no account required.
              </p>
            </div>

            <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-[0px_8px_24px_rgba(45,51,55,0.04)]">
              <div className="w-14 h-14 bg-surface-container-low rounded-xl flex items-center justify-center text-primary mb-6">
                <ShieldCheck className="w-7 h-7" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-headline font-bold text-on-surface mb-3">Verified, not vibes</h3>
              <p className="text-on-surface-variant leading-relaxed text-sm">
                See each listing’s source and recorded review date. Confirm current availability with the provider.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Waitlist tracker + notifications — the differentiator */}
      <section className="py-24 bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="order-2 lg:order-1 min-w-0">
            {/* Self-contained waitlist preview list */}
            <div className="bg-surface-container-lowest rounded-3xl border border-surface-container-highest shadow-[0px_12px_40px_rgba(45,51,55,0.06)] p-6 lg:p-8 space-y-3">
              {previews.map(waitlist => <WaitlistPreviewRow key={waitlist.id} waitlist={waitlist} />)}
              {previews.length === 0 && <p className="text-sm text-on-surface-variant">{waitlistsLoading ? 'Loading waitlist information…' : 'No waitlist information to preview. Check the tracker for updates.'}</p>}
              <p className="text-xs text-on-surface-variant">{waitlistsError ? 'Could not refresh waitlists. Confirm any previously loaded information with the provider.' : 'Recorded statuses — confirm current applications with the provider.'}</p>
            </div>
          </div>

          <div className="order-1 lg:order-2 max-w-xl min-w-0">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary mb-3">Waitlist tracker</p>
            <h2 className="text-3xl font-headline font-bold text-on-surface mb-4 tracking-tight">
              Track housing waitlists before you miss an opening.
            </h2>
            <p className="text-on-surface-variant text-lg leading-relaxed mb-6">
              Section 8, public housing, and affordable housing waitlists open and close
              with little warning. Follow the ones that matter to you and receive email
              alerts when we record an opening or expanded application access.
            </p>
            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <BellRing className="w-5 h-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span className="text-on-surface-variant"><span className="font-semibold text-on-surface">Get notified</span> about recorded openings on waitlists you follow.</span>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span className="text-on-surface-variant"><span className="font-semibold text-on-surface">See when it was last checked</span>, with a link to the official source.</span>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span className="text-on-surface-variant"><span className="font-semibold text-on-surface">Housing authorities</span> across Oregon and Washington.</span>
              </li>
            </ul>
            <Link
              to="/waitlist/"
              className="inline-flex items-center gap-2 bg-primary text-on-primary px-7 py-3.5 rounded-full font-semibold text-base shadow-sm hover:bg-primary-dim transition-colors"
            >
              Open the waitlist tracker <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-24 bg-surface-container-low">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="bg-surface-container-lowest rounded-3xl p-10 lg:p-16 shadow-[0px_12px_40px_rgba(45,51,55,0.05)] border border-surface-container-highest/50 flex flex-col md:flex-row items-center gap-12">
            <div className="w-full md:w-[55%] flex flex-col gap-8">
              <div className="flex items-start gap-4">
                <div className="text-tertiary-dim mt-1">
                  <MapPin className="w-7 h-7" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-headline font-bold text-on-surface text-lg">Built for local communities</h3>
                  <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">Expanding across Oregon and Washington while keeping local listings clear, sourced, and useful—not a shallow national list.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="text-tertiary-dim mt-1">
                  <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-headline font-bold text-on-surface text-lg">Clear and practical guidance</h3>
                  <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">Jargon-free listings that tell you what a program does, who it helps, and how to apply.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="text-tertiary-dim mt-1">
                  <ShieldCheck className="w-7 h-7" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-headline font-bold text-on-surface text-lg">Verified resources</h3>
                  <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">Check recorded review dates and official sources before relying on a listing. Availability can change between reviews.</p>
                </div>
              </div>
            </div>

            {/* Self-contained gradient panel (no external image) */}
            <div className="w-full md:w-[45%] h-72 md:h-96 min-h-[300px] rounded-2xl overflow-hidden relative bg-gradient-to-br from-primary to-primary-dim flex items-end p-8">
              <div className="absolute inset-0 opacity-20" aria-hidden="true">
                <div className="absolute top-8 right-10 w-40 h-40 rounded-full bg-white/30 blur-2xl" />
                <div className="absolute bottom-6 left-6 w-32 h-32 rounded-full bg-white/20 blur-2xl" />
              </div>
              <div className="relative text-on-primary">
                <p className="font-medium tracking-wide text-xs uppercase opacity-90 mb-1">Serving the community</p>
                <p className="font-headline font-bold text-3xl">Oregon &amp; Washington</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

const PREVIEW_STATUS_CLASS: Record<WaitlistStatus, string> = {
  open: 'bg-emerald-50 text-emerald-700',
  limited: 'bg-amber-50 text-amber-700',
  closed: 'bg-surface-container-highest text-on-surface-variant',
  unknown: 'bg-surface-container-high text-on-surface-variant',
};

function checkedLabel(waitlist: WaitlistEntry): string {
  const checked = formatPreviewDate(waitlist.last_checked);
  return checked ? `Last checked ${checked}` : 'Check date unavailable';
}

function WaitlistPreviewStatus({ waitlist }: { waitlist: WaitlistEntry }) {
  const { status, label } = previewStatus(waitlist);
  return <span className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-bold ${PREVIEW_STATUS_CLASS[status]}`}>{label}</span>;
}

function WaitlistPreviewRow({ waitlist }: { waitlist: WaitlistEntry }) {
  return (
    <Link to={waitlistPath(waitlist)} className="flex flex-wrap items-center justify-between gap-4 bg-surface-container-low rounded-xl px-4 py-3 border border-surface-container-highest/60 hover:border-primary/40">
      <div className="min-w-0">
        <p className="font-headline font-bold text-on-surface text-sm [overflow-wrap:anywhere]">{waitlist.agency}</p>
        <p className="text-xs text-on-surface-variant line-clamp-2">{waitlist.program_name && !waitlist.agency.includes(waitlist.program_name) ? waitlist.program_name : (waitlist.waitlist_type && WAITLIST_TYPE_LABELS[waitlist.waitlist_type])}</p>
        <p className="text-xs text-on-surface-variant inline-flex items-center gap-1 mt-0.5">
          <Clock className="w-3 h-3" aria-hidden="true" /> {checkedLabel(waitlist)}
        </p>
      </div>
      <WaitlistPreviewStatus waitlist={waitlist} />
    </Link>
  );
}
