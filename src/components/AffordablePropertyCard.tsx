import {
  ArrowUpRight,
  BedDouble,
  Building2,
  CheckCircle2,
  Clock,
  HelpCircle,
  Lock,
  MapPin,
  MinusCircle,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  AFFORDABLE_PROPERTY_TYPE_LABELS,
  BEDROOM_LABELS,
} from '../data/affordableHousing';
import { affordablePropertyPath } from '../lib/entityRoutes';
import type { AffordableProperty, WaitlistStatus } from '../types';

const STATUS: Record<WaitlistStatus, { label: string; className: string; Icon: LucideIcon }> = {
  open: { label: 'Accepting applications', className: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  limited: { label: 'Limited availability', className: 'bg-amber-50 text-amber-800', Icon: MinusCircle },
  closed: { label: 'Waitlist closed', className: 'bg-surface-container-high text-on-surface-variant', Icon: Lock },
  unknown: { label: 'Check availability', className: 'bg-surface-container-high text-on-surface-variant', Icon: HelpCircle },
};

function formatDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function AffordablePropertyCard({ property }: { property: AffordableProperty }) {
  const status = property.waitlist_status ? STATUS[property.waitlist_status] : null;
  const StatusIcon = status?.Icon;
  const bedrooms = property.bedroom_types.map((type) => BEDROOM_LABELS[type]).join(', ');
  const income = property.ami_levels.length
    ? `${property.ami_levels.join('% / ')}% AMI`
    : 'Ask about income limits';
  const checked = formatDate(property.waitlist_last_checked || property.last_verified);

  return (
    <article className="flex h-full flex-col rounded-2xl border border-surface-container-highest bg-surface-container-lowest p-5 shadow-sm transition-all hover:border-primary/35 hover:shadow-md sm:p-6">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {AFFORDABLE_PROPERTY_TYPE_LABELS[property.property_type]}
        </span>
        {status && StatusIcon ? (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>
            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" /> {status.label}
          </span>
        ) : (
          <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface-variant">
            Contact property
          </span>
        )}
      </header>

      <h2 className="font-headline text-xl font-bold tracking-tight text-on-surface">
        <Link to={affordablePropertyPath(property)} className="hover:text-primary">
          {property.name}
        </Link>
      </h2>
      <p className="mt-1 text-sm font-medium text-on-surface-variant">
        {[property.city, `${property.county} County`, property.state].join(' · ')}
      </p>

      {property.description && (
        <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-on-surface-variant">
          {property.description}
        </p>
      )}

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex items-start gap-2 text-on-surface-variant">
          <BedDouble className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{bedrooms || 'Unit sizes not listed'}</span>
        </div>
        <div className="flex items-start gap-2 text-on-surface-variant">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{property.total_units ? `${property.total_units} homes` : income}</span>
        </div>
        <div className="flex items-start gap-2 text-on-surface-variant">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{property.address || 'Address not yet published'}</span>
        </div>
        <div className="flex items-start gap-2 text-on-surface-variant">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{checked ? `Checked ${checked}` : 'Verification pending'}</span>
        </div>
      </dl>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-surface-container-highest/70 pt-5">
        <span className="text-xs font-medium text-on-surface-variant">{income}</span>
        <div className="flex items-center gap-3">
          <Link
            to={affordablePropertyPath(property)}
            className="text-sm font-semibold text-primary hover:text-primary-dim"
          >
            View details
          </Link>
          {(property.waitlist_application_link || property.application_url) && (
            <a
              href={property.waitlist_application_link || property.application_url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-dim"
            >
              Check availability <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
        </div>
      </footer>
    </article>
  );
}
