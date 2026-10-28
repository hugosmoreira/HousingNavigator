import { ChevronRight } from 'lucide-react';
import type { MapItem } from './mapData';

const CITY_ROW_LIMIT = 40;

function subtitle(item: MapItem): string {
  const parts: string[] = [];
  const address = item.listing?.property.address ?? item.city?.address;
  if (address) parts.push(address);
  if (item.units) parts.push(`${item.units.toLocaleString('en-US')} homes`);
  return parts.join(' · ');
}

export default function PlaceList({
  items,
  colorFor,
  selectedKey,
  onSelect,
}: {
  items: MapItem[];
  colorFor: (item: MapItem) => string;
  selectedKey: string | null;
  onSelect: (item: MapItem) => void;
}) {
  const listings = items
    .filter((item) => item.kind === 'listing')
    .sort((a, b) => Number(b.open) - Number(a.open) || a.name.localeCompare(b.name));
  const city = items
    .filter((item) => item.kind === 'city')
    .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));
  const hiddenCity = Math.max(0, city.length - CITY_ROW_LIMIT);

  const row = (item: MapItem) => (
    <li key={item.key}>
      <button
        type="button"
        onClick={() => onSelect(item)}
        aria-current={selectedKey === item.key ? 'true' : undefined}
        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
          selectedKey === item.key ? 'bg-primary/10' : 'hover:bg-surface-container-low'
        }`}
      >
        <span
          className={`shrink-0 rounded-full ring-2 ring-surface-container-lowest ${item.kind === 'city' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'}`}
          style={{ backgroundColor: colorFor(item) }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-on-surface">{item.name}</span>
          <span className="block truncate text-xs text-on-surface-variant">{subtitle(item) || 'Details not published'}</span>
        </span>
        {item.open && (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Open</span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      </button>
    </li>
  );

  if (items.length === 0) {
    return (
      <p className="rounded-xl bg-surface-container-low px-4 py-6 text-center text-sm text-on-surface-variant">
        Nothing in this part of the map matches. Zoom out or clear a filter.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {listings.length > 0 && (
        <section aria-label="Housing Navigator listings in view">
          <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Housing Navigator listings · {listings.length}
          </h3>
          <ul className="space-y-0.5">{listings.map(row)}</ul>
        </section>
      )}
      {city.length > 0 && (
        <section aria-label="City-financed buildings in view">
          <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            City-financed buildings · {city.length}
          </h3>
          <ul className="space-y-0.5">{city.slice(0, CITY_ROW_LIMIT).map(row)}</ul>
          {hiddenCity > 0 && (
            <p className="px-3 pt-2 text-xs text-on-surface-variant">
              {hiddenCity} smaller buildings are not listed here. Zoom in to see them all.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
