import { ArrowUpRight, MapPin, Phone, ShieldCheck } from 'lucide-react';
import {
  DIRECTORY_CATEGORY_LABELS,
  legacyToDirectoryCategory,
} from '../data/categoryMap';
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
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatLocation(program: Program): string {
  const cityState = [program.city, program.state].filter(Boolean).join(', ');
  if (cityState) return `${cityState} · ${program.county} County`;
  return `${program.county} County`;
}

export default function DirectoryCard({ program }: DirectoryCardProps) {
  const directoryCategory =
    program.directory_category ?? legacyToDirectoryCategory(program.category);
  const categoryLabel = DIRECTORY_CATEGORY_LABELS[directoryCategory];
  const summary = program.description || program.notes || '';
  const verified = formatLastVerified(program.last_verified);
  const phoneHref = program.phone
    ? `tel:${program.phone.replace(/[^0-9+]/g, '')}`
    : null;

  return (
    <article className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-surface-container-highest hover:border-primary/40 hover:shadow-md transition-all flex flex-col">
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
            {categoryLabel}
          </span>
        </div>
      </header>

      <h3 className="text-lg font-headline font-bold text-on-surface mb-2 tracking-tight">
        {program.program_name}
      </h3>

      {summary && (
        <p className="text-sm text-on-surface-variant leading-relaxed mb-4">{summary}</p>
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

      <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
        Availability can change. Contact the provider to confirm current access.
      </p>

      <footer className="mt-auto pt-4 border-t border-surface-container-highest/60 flex items-center justify-between gap-4">
        <span className="text-xs text-on-surface-variant">
          {verified ? `Last verified ${verified}` : 'Verification pending'}
        </span>
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
      </footer>
    </article>
  );
}
