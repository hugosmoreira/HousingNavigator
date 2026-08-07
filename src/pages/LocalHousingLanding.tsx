import { ArrowRight, CheckCircle2, MapPin, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import DirectoryCard from '../components/DirectoryCard';
import {
  countyLandingPage,
  findLocalLandingPage,
  localLandingPrograms,
  serviceLandingPages,
} from '../data/localLandingPages';
import { STATIC_PROGRAMS } from '../services/data/staticDataService';

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function LocalHousingLanding() {
  const { pathname } = useLocation();
  const page = findLocalLandingPage(pathname);

  if (!page) {
    return (
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h1 className="text-3xl font-headline font-bold text-on-surface mb-3">
          Local housing page not found
        </h1>
        <p className="text-on-surface-variant mb-6">
          Browse the complete directory to find housing resources in your area.
        </p>
        <Link to="/resources/" className="text-primary font-semibold hover:underline">
          Browse all housing resources
        </Link>
      </section>
    );
  }

  const programs = localLandingPrograms(page, STATIC_PROGRAMS);
  const countyPage = countyLandingPage(page.county);
  const servicePages = serviceLandingPages(page.county);
  const latestVerified = programs
    .map((program) => program.last_verified)
    .filter(Boolean)
    .sort()
    .slice(-1)[0];

  return (
    <div className="bg-surface min-h-[calc(100vh-80px)]">
      <section className="bg-surface-container-low border-b border-surface-container-highest">
        <div className="max-w-6xl mx-auto px-6 lg:px-12 py-10 lg:py-14">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-on-surface-variant mb-6">
            <Link to="/" className="hover:text-primary">Home</Link>
            <span aria-hidden>/</span>
            <Link to="/resources/" className="hover:text-primary">Housing resources</Link>
            {page.service && (
              <>
                <span aria-hidden>/</span>
                <Link to={`${countyPage.path}/`} className="hover:text-primary">
                  {page.county} County
                </Link>
              </>
            )}
          </nav>

          <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.18em] uppercase text-primary mb-3">
            <MapPin className="w-4 h-4" aria-hidden />
            {page.county} County · {page.stateName}
          </p>
          <h1 className="text-3xl lg:text-5xl font-headline font-bold text-on-surface tracking-tight max-w-4xl mb-5">
            {page.heading}
          </h1>
          <p className="text-base lg:text-lg text-on-surface-variant leading-relaxed max-w-3xl">
            {page.introduction}
          </p>

          <div className="flex flex-wrap gap-3 mt-7 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary font-semibold px-4 py-2">
              <ShieldCheck className="w-4 h-4" aria-hidden />
              {programs.length} verified {programs.length === 1 ? 'listing' : 'listings'}
            </span>
            {latestVerified && (
              <span className="rounded-full bg-surface-container-lowest border border-surface-container-highest text-on-surface-variant px-4 py-2">
                Latest review {formatDate(latestVerified)}
              </span>
            )}
          </div>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-6 lg:px-12 py-10 lg:py-14">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-8 lg:gap-10 mb-12">
          <section aria-labelledby="how-to-use-heading" className="bg-surface-container-lowest rounded-2xl border border-surface-container-highest p-6 lg:p-8">
            <h2 id="how-to-use-heading" className="text-2xl font-headline font-bold text-on-surface mb-5">
              How to use this page
            </h2>
            <ol className="grid sm:grid-cols-3 gap-5">
              {[
                ['Compare', 'Read the eligibility, contact, and application details for each program.'],
                ['Confirm', 'Contact the provider to confirm current availability and requirements.'],
                ['Follow up', 'Keep notes about who you contacted and the next step they gave you.'],
              ].map(([label, copy], index) => (
                <li key={label} className="text-sm text-on-surface-variant leading-relaxed">
                  <span className="w-7 h-7 rounded-full bg-primary text-on-primary inline-flex items-center justify-center font-bold mb-3">
                    {index + 1}
                  </span>
                  <strong className="block text-on-surface mb-1">{label}</strong>
                  {copy}
                </li>
              ))}
            </ol>
          </section>

          <aside className="bg-primary/5 rounded-2xl border border-primary/20 p-6">
            <h2 className="text-lg font-headline font-bold text-on-surface mb-4">
              Before you contact a program
            </h2>
            <ul className="space-y-3">
              {page.checklist.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-on-surface-variant leading-relaxed">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <section aria-labelledby="local-listings-heading">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] uppercase text-primary mb-2">
                Local directory
              </p>
              <h2 id="local-listings-heading" className="text-2xl lg:text-3xl font-headline font-bold text-on-surface">
                {page.serviceLabel ?? 'Housing resources'} in {page.county} County
              </h2>
            </div>
            <Link to="/resources/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-dim">
              Search the full directory <ArrowRight className="w-4 h-4" aria-hidden />
            </Link>
          </div>

          <div role="note" className="mb-6 px-4 py-3 rounded-xl border border-surface-container-highest bg-surface-container-low text-sm text-on-surface-variant">
            Availability can change. Housing Navigator provides verified contact information but does not determine eligibility or guarantee funding, openings, or placement.
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {programs.map((program) => (
              <DirectoryCard key={program.id} program={program} />
            ))}
          </div>
        </section>

        <section aria-labelledby="more-local-help-heading" className="mt-14 pt-10 border-t border-surface-container-highest">
          <h2 id="more-local-help-heading" className="text-2xl font-headline font-bold text-on-surface mb-5">
            More help in {page.county} County
          </h2>
          <div className="flex flex-wrap gap-3">
            {page.service && (
              <Link to={`${countyPage.path}/`} className="rounded-full border border-surface-container-highest bg-surface-container-lowest px-4 py-2 text-sm font-semibold text-on-surface-variant hover:border-primary/40 hover:text-primary">
                All {page.county} County resources
              </Link>
            )}
            {servicePages
              .filter((candidate) => candidate.path !== page.path)
              .map((candidate) => (
                <Link key={candidate.path} to={`${candidate.path}/`} className="rounded-full border border-surface-container-highest bg-surface-container-lowest px-4 py-2 text-sm font-semibold text-on-surface-variant hover:border-primary/40 hover:text-primary">
                  {candidate.serviceLabel}
                </Link>
              ))}
          </div>
        </section>
      </main>
    </div>
  );
}
