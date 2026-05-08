import { BookmarkPlus } from 'lucide-react';
import type {
  ApplicationMethod,
  Program,
  ProgramCategory,
  ProgramStatus,
} from '../types';

interface ResultCardProps {
  program: Program;
}

const CATEGORY_LABELS: Record<ProgramCategory, string> = {
  emergency_shelter: 'Emergency Shelter',
  transitional_housing: 'Transitional Housing',
  rental_assistance: 'Rental Assistance',
  legal_aid: 'Legal Aid',
  long_term_housing_waitlist: 'Long-Term Housing Waitlist',
  eviction_prevention: 'Eviction Prevention',
  comprehensive_support: 'Comprehensive Support',
};

const CATEGORY_BADGE_COLORS: Record<ProgramCategory, string> = {
  emergency_shelter: 'bg-blue-100 text-blue-700',
  transitional_housing: 'bg-purple-100 text-purple-700',
  rental_assistance: 'bg-secondary-container/50 text-secondary-dim',
  legal_aid: 'bg-tertiary-container/50 text-tertiary-dim',
  long_term_housing_waitlist: 'bg-indigo-100 text-indigo-700',
  eviction_prevention: 'bg-orange-100 text-orange-700',
  comprehensive_support: 'bg-pink-100 text-pink-700',
};

interface StatusPresentation {
  label: string;
  icon: string;
  className: string;
}

const STATUS_PRESENTATION: Record<ProgramStatus, StatusPresentation> = {
  open: {
    label: 'Open Now',
    icon: 'check_circle',
    className: 'bg-green-100 text-green-700',
  },
  limited: {
    label: 'Limited Space',
    icon: 'hourglass_empty',
    className: 'bg-orange-100 text-orange-700',
  },
  waitlist: {
    label: 'Waitlist Open',
    icon: 'schedule',
    className: 'bg-yellow-100 text-yellow-800',
  },
  closed: {
    label: 'Closed',
    icon: 'lock',
    className: 'bg-surface-container-highest text-on-surface-variant',
  },
  unknown: {
    label: 'Status Unknown',
    icon: 'help',
    className: 'bg-purple-100 text-purple-700',
  },
};

const APPLICATION_METHOD_PRESENTATION: Record<
  ApplicationMethod,
  { label: string; icon: string }
> = {
  walk_in: { label: 'Walk-in', icon: 'person_add' },
  phone: { label: 'Phone', icon: 'call' },
  online: { label: 'Online Application', icon: 'computer' },
  referral: { label: 'Referral Required', icon: 'assignment_turned_in' },
};

const CONFIDENCE_LABEL: Record<Program['status_confidence'], string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

function formatLastVerified(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ResultCard({ program }: ResultCardProps) {
  const statusInfo = STATUS_PRESENTATION[program.status];
  const methodInfo = APPLICATION_METHOD_PRESENTATION[program.application_method];
  const categoryClass = CATEGORY_BADGE_COLORS[program.category];
  const isPrimaryCta = program.status === 'open' || program.status === 'limited';

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-surface-container-highest">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${categoryClass}`}
          >
            {CATEGORY_LABELS[program.category]}
          </span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${statusInfo.className}`}
          >
            <span className="material-symbols-outlined text-[14px]">{statusInfo.icon}</span>
            {statusInfo.label}
          </span>
        </div>
        <button
          type="button"
          aria-label="Save program"
          className="text-on-surface-variant hover:text-primary transition-colors"
        >
          <BookmarkPlus className="w-5 h-5" />
        </button>
      </div>

      <h3 className="text-2xl font-headline font-bold text-on-surface mb-6 tracking-tight">
        {program.program_name}
      </h3>

      {program.notes && (
        <div className="bg-surface-container-low rounded-xl p-4 flex gap-3 mb-6 border border-surface-container-highest/50">
          <span
            className="material-symbols-outlined text-primary shrink-0 mt-0.5"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            lightbulb
          </span>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            <strong className="text-on-surface">Why it may fit you:</strong> {program.notes}
          </p>
        </div>
      )}

      {program.eligibility_summary && (
        <div className="bg-surface-container-low rounded-xl p-4 flex gap-3 mb-6 border border-surface-container-highest/50">
          <span className="material-symbols-outlined text-primary shrink-0 mt-0.5">
            rule
          </span>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            <strong className="text-on-surface">Who qualifies:</strong> {program.eligibility_summary}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
            How to apply
          </span>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="material-symbols-outlined text-[16px]">{methodInfo.icon}</span>
            {methodInfo.label}
          </div>
        </div>
        <div>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
            Phone
          </span>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="material-symbols-outlined text-[16px]">call</span>
            {program.phone ? (
              <a href={`tel:${program.phone.replace(/[^0-9+]/g, '')}`} className="hover:text-primary">
                {program.phone}
              </a>
            ) : (
              <span className="text-on-surface-variant">Not listed</span>
            )}
          </div>
        </div>
        <div>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
            Who it helps
          </span>
          <div className="flex items-center gap-2 text-sm font-medium capitalize">
            <span className="material-symbols-outlined text-[16px]">groups</span>
            {program.who_it_helps.map((h) => h.replace('_', ' ')).join(', ')}
          </div>
        </div>
        <div>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
            Status confidence
          </span>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="material-symbols-outlined text-[16px]">verified</span>
            {CONFIDENCE_LABEL[program.status_confidence]}
          </div>
        </div>
        <div className="col-span-2">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-2">
            Requirements
          </span>
          <div className="flex flex-wrap gap-2">
            {program.referral_required ? (
              <span className="px-2.5 py-1 bg-surface-container-highest text-on-surface-variant text-xs font-medium rounded-md flex items-center gap-1.5 border border-outline-variant/20">
                <span className="material-symbols-outlined text-[14px]">assignment_turned_in</span>
                Referral required
              </span>
            ) : (
              <span className="px-2.5 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-md flex items-center gap-1.5 border border-green-200">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                No referral required
              </span>
            )}
            <span className="px-2.5 py-1 bg-surface-container-highest text-on-surface-variant text-xs font-medium rounded-md flex items-center gap-1.5 border border-outline-variant/20">
              <span className="material-symbols-outlined text-[14px]">location_on</span>
              {program.county} County
            </span>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-surface-container-highest flex items-center justify-between gap-4 flex-wrap">
        <span className="text-xs text-on-surface-variant flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px]">history</span>
          Last verified: {formatLastVerified(program.last_verified)}
        </span>
        {program.website && (
          <a
            href={program.website}
            target="_blank"
            rel="noreferrer noopener"
            className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors shadow-sm ${
              isPrimaryCta
                ? 'bg-primary text-on-primary hover:bg-primary-dim'
                : 'bg-surface-container-highest text-primary hover:bg-surface-variant'
            }`}
          >
            Visit Website
          </a>
        )}
      </div>
    </div>
  );
}

export { CATEGORY_LABELS };
