import {
  ArrowLeft,
  ArrowUpRight,
  BedDouble,
  Building2,
  CalendarCheck,
  CheckCircle2,
  HandHeart,
  Info,
  Landmark,
  MapPin,
  Phone,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AFFORDABLE_PROPERTY_TYPE_LABELS, BEDROOM_LABELS } from '../data/affordableHousing';
import { affordablePropertyPath } from '../lib/entityRoutes';
import { phoneHref } from '../lib/phoneLinks';
import { OUTSIDE_NEIGHBORHOODS, type MapItem } from './mapData';
import { amiSummary } from './regulatedHousing';

export interface CitySourceInfo {
  metadataUrl: string;
  retrievedOn: string;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function Fact({ icon: Icon, children }: { icon: typeof MapPin; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-on-surface-variant">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export default function PropertyDetails({
  item,
  citySource,
  onBack,
}: {
  item: MapItem;
  citySource: CitySourceInfo | null;
  onBack: () => void;
}) {
  const property = item.listing?.property;
  const city = item.city;
  const cityAmi = city ? amiSummary(city) : null;
  const homes = property ? property.total_units : city?.total_units;
  const applyUrl = property?.waitlist_application_link || property?.application_url;
  const phone = property?.phone ? phoneHref(property.phone) : null;

  return (
    <article aria-labelledby="map-detail-title" className="hn-map-rise space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-dim"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All properties
      </button>

      <header>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {property ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {AFFORDABLE_PROPERTY_TYPE_LABELS[property.property_type]}
            </span>
          ) : (
            <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
              City-financed building
            </span>
          )}
          {item.open && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Accepting applications
            </span>
          )}
          {property?.waitlist_status === 'closed' && (
            <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-semibold text-on-surface-variant">Waitlist closed</span>
          )}
        </div>
        <h2 id="map-detail-title" className="font-headline text-2xl font-bold tracking-tight text-on-surface">
          {item.name}
        </h2>
        <p className="mt-1 text-sm font-medium text-on-surface-variant">
          {property
            ? [property.address, property.city, property.state].filter(Boolean).join(', ')
            : city?.address ?? 'Address not published'}
        </p>
      </header>

      <div className="grid gap-2.5">
        {property && (
          <Fact icon={BedDouble}>
            {property.bedroom_types.map((type) => BEDROOM_LABELS[type]).join(', ') || 'Unit sizes not listed'}
          </Fact>
        )}
        <Fact icon={Building2}>
          {/* A listing's City figures appear in their own sourced note below. */}
          {homes ? `${homes.toLocaleString('en-US')} homes` : 'Number of homes not published'}
          {!property && city?.regulated_units && city.regulated_units !== homes
            ? ` · ${city.regulated_units.toLocaleString('en-US')} income-restricted`
            : ''}
        </Fact>
        {property && (
          <Fact icon={Landmark}>
            {property.ami_levels.length ? `Income limits: ${property.ami_levels.join('% / ')}% AMI` : 'Ask the property about income limits'}
          </Fact>
        )}
        {!property && cityAmi && <Fact icon={Landmark}>Income-restricted homes: {cityAmi} AMI</Fact>}
        {!property && (city?.year_completed || city?.year_built) && (
          <Fact icon={CalendarCheck}>
            {city.year_built ? `Built ${city.year_built}` : ''}
            {city.year_built && city.year_completed && city.year_completed !== city.year_built ? ' · ' : ''}
            {city.year_completed && city.year_completed !== city.year_built ? `Financing completed ${city.year_completed}` : ''}
          </Fact>
        )}
        {city && (
          <Fact icon={MapPin}>
            {city.neighborhood ? `${city.neighborhood} neighborhood` : OUTSIDE_NEIGHBORHOODS}
          </Fact>
        )}
        {!property && city?.sponsor && (
          <Fact icon={HandHeart}>Project sponsor on City financing: {city.sponsor}</Fact>
        )}
        {property && (
          <Fact icon={CalendarCheck}>
            {formatDate(property.waitlist_last_checked || property.last_verified)
              ? `Checked ${formatDate(property.waitlist_last_checked || property.last_verified)}`
              : 'Verification pending'}
          </Fact>
        )}
      </div>

      {property?.eligibility_summary && (
        <p className="line-clamp-5 text-sm leading-relaxed text-on-surface-variant">{property.eligibility_summary}</p>
      )}

      {property && (
        <div className="flex flex-wrap gap-2">
          <Link
            to={affordablePropertyPath(property)}
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-dim"
          >
            View full details
          </Link>
          {applyUrl && (
            <a
              href={applyUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-full border border-surface-container-highest px-4 py-2.5 text-sm font-semibold text-primary hover:border-primary/40"
            >
              Check availability <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
          {phone && property.phone && (
            <a
              href={phone}
              className="inline-flex items-center gap-1.5 rounded-full border border-surface-container-highest px-4 py-2.5 text-sm font-semibold text-on-surface hover:border-primary/40"
            >
              <Phone className="h-4 w-4" aria-hidden="true" /> {property.phone}
            </a>
          )}
        </div>
      )}

      {property && city && (
        <p className="rounded-xl bg-surface-container-low px-3 py-2.5 text-xs leading-relaxed text-on-surface-variant">
          This building also appears in the City’s financing records
          {city.regulated_units ? ` with ${city.regulated_units.toLocaleString('en-US')} income-restricted homes` : ''}
          {cityAmi ? ` (${cityAmi} AMI)` : ''}.
        </p>
      )}

      {!property && (
        <div role="note" className="flex items-start gap-2 rounded-xl border border-surface-container-highest bg-surface-container-low px-3 py-3 text-xs leading-relaxed text-on-surface-variant">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Housing Navigator hasn’t verified application details for this building yet. The figures come from the Portland Housing Bureau
            {citySource ? ` (retrieved ${formatDate(citySource.retrievedOn)})` : ''}. Contact the property or{' '}
            <Link to="/resources/" className="font-semibold text-primary hover:text-primary-dim">find housing help</Link> before you apply.
          </span>
        </div>
      )}

    </article>
  );
}
