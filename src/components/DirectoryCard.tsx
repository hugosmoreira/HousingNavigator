import { useState } from 'react';
import { ArrowUpRight, Bookmark, BookmarkCheck, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  DIRECTORY_CATEGORY_LABELS,
  legacyToDirectoryCategory,
} from '../data/categoryMap';
import { useUserData } from '../auth/UserDataContext';
import { resourcePath } from '../lib/entityRoutes';
import { serviceAreaSummary, serviceAreasForProgram } from '../data/serviceAreas';
import type { ApplicationMethod, Program } from '../types';

interface DirectoryCardProps {
  program: Program;
}

// NOTE: `program.status` is intentionally not rendered here. The public
// directory cannot reliably confirm whether each program is currently
// open or funded; status remains on the data model for internal use
// (waitlist tracker, admin tools, analytics).

const APPLICATION_METHOD_LABEL: Record<ApplicationMethod, string> = {
  walk_in: 'Walk-in',
  phone: 'Phone',
  online: 'Online',
  referral: 'Referral required',
};

function formatLastVerified(iso: string): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatLocation(program: Program): string {
  // County now lives in its own pill in the card header; only show
  // city/state here to avoid duplicating "Multnomah County · Multnomah County".
  const cityState = [program.city, program.state].filter(Boolean).join(', ');
  if (cityState) return cityState;
  return serviceAreaSummary(serviceAreasForProgram(program));
}

export default function DirectoryCard({ program }: DirectoryCardProps) {
  const directoryCategory =
    program.directory_category ?? legacyToDirectoryCategory(program.category);
  const categoryLabel = DIRECTORY_CATEGORY_LABELS[directoryCategory];
  const summary = program.description || program.notes || '';
  const areaSummary = serviceAreaSummary(serviceAreasForProgram(program));
  const verified = formatLastVerified(program.last_verified);
  const phoneHref = program.phone
    ? `tel:${program.phone.replace(/[^0-9+]/g, '')}`
    : null;

  const { isResourceSaved, toggleResource } = useUserData();
  const saved = isResourceSaved(program.id);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingPending, setSavingPending] = useState(false);

  async function handleSave() {
    setSaveError(null);
    setSavingPending(true);
    try {
      await toggleResource(program.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this resource.');
    } finally {
      setSavingPending(false);
    }
  }

  return (
    <article className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-surface-container-highest hover:border-primary/40 hover:shadow-md transition-all flex flex-col">
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
            {categoryLabel}
          </span>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium border border-surface-container-highest text-on-surface-variant">
            {areaSummary}
          </span>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={savingPending}
          aria-pressed={saved}
          aria-label={saved ? 'Remove from saved resources' : 'Save resource'}
          title={saved ? 'Saved · click to remove' : 'Save for later'}
          className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors disabled:opacity-50 ${
            saved
              ? 'text-primary bg-primary/10 hover:bg-primary/15'
              : 'text-on-surface-variant hover:text-primary hover:bg-primary/5'
          }`}
        >
          {saved ? (
            <BookmarkCheck className="w-4 h-4" />
          ) : (
            <Bookmark className="w-4 h-4" />
          )}
        </button>
      </header>

      <h3 className="text-lg font-headline font-bold text-on-surface mb-2 tracking-tight">
        <Link to={resourcePath(program)} className="hover:text-primary transition-colors">
          {program.program_name}
        </Link>
      </h3>

      {summary && (
        <p className="text-sm text-on-surface-variant leading-relaxed mb-4 line-clamp-3">
          {summary}
        </p>
      )}

      {program.eligibility_summary && (
        <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
          <span className="font-semibold text-on-surface">Who qualifies: </span>
          {program.eligibility_summary}
        </p>
      )}

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-sm mb-5">
        <div className="flex items-start gap-2 text-on-surface-variant">
          <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
          <span>{formatLocation(program)}</span>
        </div>
        {phoneHref && (
          <div className="flex items-start gap-2 text-on-surface-variant">
            <Phone className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <a href={phoneHref} className="hover:text-primary font-medium">
              {program.phone}
            </a>
          </div>
        )}
        <div className="flex items-start gap-2 text-on-surface-variant">
          <ShieldCheck className="w-4 h-4 mt-0.5 text-primary shrink-0" />
          <span>
            Apply: {APPLICATION_METHOD_LABEL[program.application_method]}
            {program.referral_required && (
              <span className="ml-1 text-on-surface-variant">· Referral required</span>
            )}
          </span>
        </div>
      </dl>

      <footer className="mt-auto pt-4 border-t border-surface-container-highest/60 flex flex-wrap items-center justify-between gap-4">
        <span className="text-xs text-on-surface-variant">
          {verified ? `Last verified ${verified}` : 'Verification pending'}
        </span>
        <div className="flex items-center gap-3">
          <Link
            to={resourcePath(program)}
            className="text-sm font-semibold text-primary hover:text-primary-dim"
          >
            View details
          </Link>
          {program.website && (
            <a
              href={program.website}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-dim"
            >
              Visit site <ArrowUpRight className="w-4 h-4" />
            </a>
          )}
        </div>
      </footer>

      {saveError && (
        <div className="mt-3 text-xs text-error bg-error/5 border border-error/30 rounded-lg px-3 py-2">
          {saveError}
        </div>
      )}
    </article>
  );
}
