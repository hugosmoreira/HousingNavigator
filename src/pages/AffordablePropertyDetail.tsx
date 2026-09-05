import {
  ArrowLeft,
  ArrowUpRight,
  BedDouble,
  Building2,
  CalendarCheck,
  CheckCircle2,
  HelpCircle,
  Lock,
  MapPin,
  MinusCircle,
  Phone,
  ShieldCheck,
  Users,
  Accessibility,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import PhoneLink from '../components/PhoneLink';
import {
  AFFORDABLE_PROPERTY_TYPE_LABELS,
  BEDROOM_LABELS,
  PROPERTY_AUDIENCE_LABELS,
} from '../data/affordableHousing';
import { useAffordableProperties } from '../hooks/useAffordableProperties';
import { useWaitlists } from '../hooks/useWaitlists';
import {
  findAffordablePropertyBySlug,
  waitlistPath,
} from '../lib/entityRoutes';
import type { WaitlistStatus } from '../types';
import NotFound from './NotFound';

const STATUS: Record<WaitlistStatus, { label: string; className: string; Icon: LucideIcon }> = {
  open: { label: 'Accepting applications', className: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  limited: { label: 'Limited availability', className: 'bg-amber-50 text-amber-800', Icon: MinusCircle },
  closed: { label: 'Waitlist closed', className: 'bg-surface-container-high text-on-surface-variant', Icon: Lock },
  unknown: { label: 'Status unknown', className: 'bg-surface-container-high text-on-surface-variant', Icon: HelpCircle },
};

function formatDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

export default function AffordablePropertyDetail() {
  const { slug = '' } = useParams();
  const { properties, loading, error } = useAffordableProperties();
  const { waitlists } = useWaitlists();
  const property = findAffordablePropertyBySlug(properties, slug);

  if (!property && loading) {
    return <p className="mx-auto max-w-6xl px-6 py-16 text-on-surface-variant">Loading property…</p>;
  }
  if (!property) return <NotFound />;

  const linkedWaitlist = property.waitlist_id
    ? waitlists.find((waitlist) => waitlist.id === property.waitlist_id)
    : undefined;
  const status = property.waitlist_status ? STATUS[property.waitlist_status] : null;
  const StatusIcon = status?.Icon;
  const verified = formatDate(property.last_verified);
  const checked = formatDate(property.waitlist_last_checked);
  const applicationUrl =
    property.waitlist_application_link || property.application_url || property.website;
  const address = [property.address, property.city, property.state, property.postal_code]
    .filter(Boolean)
    .join(', ');
  const mapUrl = property.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-surface">
      <section className="border-b border-surface-container-highest bg-surface-container-low">
        <div className="mx-auto max-w-6xl px-6 py-10 lg:px-12 lg:py-14">
          <Link to="/affordable-housing/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-dim">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to affordable housing
          </Link>
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {AFFORDABLE_PROPERTY_TYPE_LABELS[property.property_type]}
            </span>
            {status && StatusIcon && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>
                <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" /> {status.label}
              </span>
            )}
          </div>
          <h1 className="max-w-4xl font-headline text-3xl font-bold tracking-tight text-on-surface lg:text-5xl">{property.name}</h1>
          <p className="mt-3 flex items-center gap-2 text-base font-medium text-on-surface-variant">
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
            {property.city}, {property.state} · {property.county} County
          </p>
          {property.description && <p className="mt-5 max-w-3xl text-lg leading-relaxed text-on-surface-variant">{property.description}</p>}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-12 lg:py-14">
        <main className="min-w-0 space-y-8">
          <section>
            <h2 className="mb-4 font-headline text-xl font-bold text-on-surface">Property overview</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact icon={<BedDouble className="h-5 w-5" />} label="Apartment sizes" value={property.bedroom_types.length ? property.bedroom_types.map((type) => BEDROOM_LABELS[type]).join(', ') : 'Not listed'} />
              <Fact icon={<Building2 className="h-5 w-5" />} label="Total homes" value={property.total_units ? property.total_units.toLocaleString() : 'Not listed'} />
              <Fact icon={<Users className="h-5 w-5" />} label="Income limits" value={property.ami_levels.length ? `${property.ami_levels.join('%, ')}% AMI` : 'Contact the property'} />
              <Fact icon={<MapPin className="h-5 w-5" />} label="Location" value={address || `${property.city}, ${property.state}`} />
            </dl>
          </section>

          {property.eligibility_summary && (
            <section className="rounded-2xl border border-surface-container-highest bg-surface-container-lowest p-6">
              <h2 className="font-headline text-xl font-bold text-on-surface">Who may qualify</h2>
              <p className="mt-3 leading-relaxed text-on-surface-variant">{property.eligibility_summary}</p>
              {property.audiences.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {property.audiences.map((audience) => (
                    <span key={audience} className="rounded-full border border-surface-container-highest bg-surface-container-low px-3 py-1 text-xs font-medium text-on-surface-variant">
                      {PROPERTY_AUDIENCE_LABELS[audience]}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {property.accessibility_notes && (
            <section>
              <div className="mb-3 flex items-center gap-3">
                <Accessibility className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 className="font-headline text-xl font-bold text-on-surface">Accessibility</h2>
              </div>
              <p className="leading-relaxed text-on-surface-variant">{property.accessibility_notes}</p>
            </section>
          )}

          {property.public_notes && (
            <section>
              <h2 className="mb-3 font-headline text-xl font-bold text-on-surface">Before you apply</h2>
              <p className="leading-relaxed text-on-surface-variant">{property.public_notes}</p>
            </section>
          )}

          <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
            Housing Navigator does not manage this property or guarantee a vacancy. Confirm rent, income limits, screening requirements, accessibility, and application status directly with the property.
          </div>

          {error && <p className="text-sm text-on-surface-variant">Live updates are temporarily unavailable; this page is showing the latest verified snapshot.</p>}
        </main>

        <aside className="h-fit rounded-2xl border border-surface-container-highest bg-surface-container-lowest p-6 shadow-sm">
          <h2 className="font-headline text-lg font-bold text-on-surface">Application and contact</h2>

          {status && StatusIcon && (
            <div className={`mt-5 rounded-xl px-4 py-3 ${status.className}`}>
              <p className="flex items-center gap-2 text-sm font-bold"><StatusIcon className="h-4 w-4" /> {status.label}</p>
              {checked && <p className="mt-1 text-xs">Status checked {checked}</p>}
            </div>
          )}

          <div className="mt-5 space-y-4 text-sm">
            {property.phone && <PhoneLink phone={property.phone} className="flex items-start gap-3 font-semibold text-primary hover:text-primary-dim"><Phone className="mt-0.5 h-4 w-4" /> {property.phone}</PhoneLink>}
            {mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer noopener" className="flex items-start gap-3 text-on-surface-variant hover:text-primary"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {address}</a>}
            {(property.management_company || property.owner_organization) && <p className="flex items-start gap-3 text-on-surface-variant"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Managed by {property.management_company || property.owner_organization}</p>}
            <p className="flex items-start gap-3 text-on-surface-variant"><CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {verified ? `Property verified ${verified}` : 'Verification pending'}</p>
          </div>

          {applicationUrl && (
            <a href={applicationUrl} target="_blank" rel="noreferrer noopener" className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-on-primary hover:bg-primary-dim">
              {property.waitlist_status === 'open' ? 'Open application information' : 'Check current availability'} <ArrowUpRight className="h-4 w-4" />
            </a>
          )}

          {linkedWaitlist && (
            <Link to={waitlistPath(linkedWaitlist)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-primary/30 px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5">
              View and follow waitlist
            </Link>
          )}

          <section className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 className="font-semibold text-on-surface">Verified source</h3>
                <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">Property facts and application details were checked against the listed owner or manager source.</p>
              </div>
            </div>
            {(property.source_url || property.website) && <a href={property.source_url || property.website} target="_blank" rel="noreferrer noopener" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-dim">Review official source <ArrowUpRight className="h-4 w-4" /></a>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-4">
      <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant"><span className="text-primary">{icon}</span>{label}</dt>
      <dd className="mt-2 font-medium leading-relaxed text-on-surface">{value}</dd>
    </div>
  );
}
