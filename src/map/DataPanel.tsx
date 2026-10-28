import { useState } from 'react';
import { X } from 'lucide-react';
import type { Breakdown, CityBreakdowns, FocusKind } from './mapData';
import type { FocusRef } from './mapUrlState';
import { useCountUp } from './motion';
import type { RegulatedStats } from './regulatedHousing';

const COLLAPSED_ROWS = 8;

function Total({ value, label }: { value: number; label: string }) {
  const shown = useCountUp(value);
  return (
    <div className="min-w-0">
      <dt className="text-xs leading-snug text-on-surface-variant">{label}</dt>
      <dd className="font-headline text-2xl font-bold tracking-tight text-on-surface tabular-nums">
        {shown.toLocaleString('en-US')}
      </dd>
    </div>
  );
}

/**
 * A sorted horizontal bar list. Every bar is a button that highlights its
 * buildings on the map, and every value is printed, so nothing depends on
 * reading bar length or color alone.
 */
function BarList({
  title,
  description,
  kind,
  rows,
  focus,
  onFocus,
  sortedByValue = true,
  footnote,
}: {
  title: string;
  description: string;
  kind: FocusKind;
  rows: Breakdown[];
  focus: FocusRef | null;
  onFocus: (focus: FocusRef | null, rows: Breakdown | null) => void;
  sortedByValue?: boolean;
  footnote?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const max = Math.max(1, ...rows.map((row) => row.homes));
  const visible = expanded || !sortedByValue ? rows : rows.slice(0, COLLAPSED_ROWS);
  const focusedHere = focus?.kind === kind ? focus.value : null;

  return (
    <section aria-labelledby={`data-${kind}`} className="space-y-2">
      <div>
        <h3 id={`data-${kind}`} className="font-headline text-base font-bold tracking-tight text-on-surface">
          {title}
        </h3>
        <p className="text-xs leading-relaxed text-on-surface-variant">{description}</p>
      </div>
      <ul className="space-y-0.5">
        {visible.map((row) => {
          const active = focusedHere === row.value;
          const dimmed = focusedHere !== null && !active;
          return (
            <li key={row.value}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onFocus(active ? null : { kind, value: row.value }, active ? null : row)}
                className={`group w-full rounded-xl px-2.5 py-2 text-left transition-colors ${
                  active ? 'bg-primary/10' : 'hover:bg-surface-container-low'
                }`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className={`min-w-0 truncate text-sm ${active ? 'font-semibold text-on-surface' : 'text-on-surface'}`}>
                    {row.label}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-on-surface-variant tabular-nums">
                    {row.homes.toLocaleString('en-US')} homes · {row.buildings}
                    {row.buildings === 1 ? ' bldg' : ' bldgs'}
                  </span>
                </span>
                <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                  <span
                    className={`block h-full rounded-full transition-[width,background-color] duration-500 ${
                      dimmed ? 'bg-outline-variant' : 'bg-primary'
                    }`}
                    style={{ width: `${Math.max(2, (row.homes / max) * 100)}%` }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {sortedByValue && rows.length > COLLAPSED_ROWS && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="px-2.5 text-sm font-semibold text-primary hover:text-primary-dim"
        >
          {expanded ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
      {footnote && <p className="px-2.5 text-xs leading-relaxed text-on-surface-variant">{footnote}</p>}
    </section>
  );
}

export default function DataPanel({
  breakdowns,
  totals,
  focus,
  focused,
  onFocus,
}: {
  breakdowns: CityBreakdowns;
  totals: RegulatedStats & { totalHomes: number };
  focus: FocusRef | null;
  focused: Breakdown | null;
  onFocus: (focus: FocusRef | null, row: Breakdown | null) => void;
}) {
  return (
    <div className="space-y-6">
      <section aria-label="City-financed housing in Portland" className="space-y-3">
        <p className="text-sm leading-relaxed text-on-surface-variant">
          Rental buildings the Portland Housing Bureau has helped finance. Darker neighborhoods on the map have more
          income-restricted homes. Pick a bar, or a neighborhood on the map, to light up those buildings.
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-surface-container-highest bg-surface-container-low p-4">
          <Total value={totals.properties} label="Buildings" />
          <Total value={totals.totalHomes} label="Homes" />
          <Total value={totals.regulatedHomes} label="Income-restricted homes" />
          <Total value={totals.deeplyAffordable} label="Homes at 30% AMI or less" />
        </dl>
      </section>

      {focus && focused && (
        <div className="hn-map-rise flex items-start justify-between gap-3 rounded-2xl bg-primary px-4 py-3 text-on-primary" role="status">
          <p className="text-sm">
            <span className="block font-semibold">{focused.label}</span>
            {focused.buildings} {focused.buildings === 1 ? 'building' : 'buildings'} · {focused.homes.toLocaleString('en-US')} homes highlighted
          </p>
          <button
            type="button"
            onClick={() => onFocus(null, null)}
            aria-label="Clear highlight"
            className="-m-1 rounded-full p-1.5 hover:bg-white/15"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <BarList
        title="By neighborhood"
        description="Income-restricted homes in each City of Portland neighborhood."
        kind="neighborhood"
        rows={breakdowns.neighborhoods}
        focus={focus}
        onFocus={onFocus}
      />
      <BarList
        title="By income level"
        description="Homes set aside for households earning up to each share of area median income (AMI). Some buildings have several levels."
        kind="tier"
        rows={breakdowns.tiers}
        focus={focus}
        onFocus={onFocus}
        sortedByValue={false}
      />
      <BarList
        title="By organization"
        description="The project sponsor the City records on its financing. A sponsor leads the project; it is not always the legal owner."
        kind="sponsor"
        rows={breakdowns.sponsors}
        focus={focus}
        onFocus={onFocus}
        footnote={
          breakdowns.unnamedSponsorBuildings
            ? `${breakdowns.unnamedSponsorBuildings} buildings have no sponsor listed here: the City record is blank or names a private individual.`
            : undefined
        }
      />
    </div>
  );
}
