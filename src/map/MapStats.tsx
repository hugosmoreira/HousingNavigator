import { useCountUp } from './motion';
import type { ViewportStats } from './mapData';
import type { RegulatedStats } from './regulatedHousing';

function Stat({
  value,
  label,
  suffix = '',
  unknown = false,
}: {
  value: number;
  label: string;
  suffix?: string;
  /** True when nothing in view publishes the figure, so 0 would be a false claim. */
  unknown?: boolean;
}) {
  const shown = useCountUp(value);
  // The number reads first, but the term comes first in the markup.
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="mt-0.5 text-xs leading-snug text-on-surface-variant">{label}</dt>
      <dd className="font-headline text-2xl font-bold tracking-tight text-on-surface tabular-nums">
        {unknown ? (
          <span title="Not published">–</span>
        ) : (
          `${shown.toLocaleString('en-US')}${suffix}`
        )}
      </dd>
    </div>
  );
}

export default function MapStats({
  listings,
  city,
}: {
  listings: ViewportStats;
  city: RegulatedStats | null;
}) {
  return (
    <section aria-label="Totals for the area in view" className="space-y-4">
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
          Housing Navigator listings in view
        </h2>
        <dl className="grid grid-cols-3 gap-3">
          <Stat value={listings.properties} label={listings.properties === 1 ? 'Property' : 'Properties'} />
          <Stat
            value={listings.homes}
            label="Homes"
            suffix={listings.homesPartial ? '+' : ''}
            unknown={listings.homes === 0 && listings.homesPartial}
          />
          <Stat value={listings.accepting} label="Accepting applications" />
        </dl>
      </div>
      {city && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            <span className="h-2.5 w-2.5 rounded-full bg-[#7486b0]" aria-hidden="true" />
            City-financed buildings in view
          </h2>
          <dl className="grid grid-cols-3 gap-3">
            <Stat value={city.properties} label="Buildings" />
            <Stat value={city.regulatedHomes} label="Income-restricted homes" />
            <Stat value={city.deeplyAffordable} label="Homes at 30% AMI" />
          </dl>
        </div>
      )}
    </section>
  );
}
