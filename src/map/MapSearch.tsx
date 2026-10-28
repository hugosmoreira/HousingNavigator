import { useId, useMemo, useState } from 'react';
import { Building2, ListFilter, MapPin, Search, X } from 'lucide-react';
import { EMPTY_FILTERS, filterItems, type MapItem } from './mapData';
import { matchPlaces, type MapPlace } from './places';

export type SearchResult =
  | { type: 'all'; query: string; count: number }
  | { type: 'item'; item: MapItem }
  | { type: 'place'; place: MapPlace }
  | { type: 'neighborhood'; name: string; items: MapItem[] };

const ITEM_LIMIT = 6;

export function searchResults(query: string, items: readonly MapItem[], showCity: boolean): SearchResult[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const matches = filterItems(items, { ...EMPTY_FILTERS, query: trimmed }, showCity).sort(
    (a, b) => Number(b.kind === 'listing') - Number(a.kind === 'listing') || b.units - a.units,
  );
  const needle = trimmed.toLowerCase();
  const neighborhoods = new Map<string, MapItem[]>();
  for (const item of items) {
    const name = item.city?.neighborhood;
    if (name && name.toLowerCase().includes(needle)) {
      neighborhoods.set(name, [...(neighborhoods.get(name) ?? []), item]);
    }
  }
  const neighborhoodNames = new Set([...neighborhoods.keys()].map((name) => name.toLowerCase()));
  const results: SearchResult[] = [];
  if (matches.length > 1) results.push({ type: 'all', query: trimmed, count: matches.length });
  results.push(...matches.slice(0, ITEM_LIMIT).map((item): SearchResult => ({ type: 'item', item })));
  for (const [name, hoodItems] of [...neighborhoods.entries()].slice(0, 3)) {
    results.push({ type: 'neighborhood', name, items: hoodItems });
  }
  // Camera-only places cover neighborhoods with no City-financed buildings.
  results.push(
    ...matchPlaces(trimmed)
      .filter((place) => !neighborhoodNames.has(place.name.toLowerCase()))
      .map((place): SearchResult => ({ type: 'place', place })),
  );
  return results;
}

function resultLabel(result: SearchResult): { title: string; detail: string; Icon: typeof Search } {
  switch (result.type) {
    case 'all':
      return { title: `Show all ${result.count} matches on the map`, detail: `“${result.query}”`, Icon: ListFilter };
    case 'item': {
      const { item } = result;
      const address = item.listing?.property.address ?? item.city?.address ?? '';
      const zip = item.listing?.property.postal_code ?? '';
      return {
        title: item.name,
        detail: [item.kind === 'listing' ? 'Listing' : 'City-financed', address, zip].filter(Boolean).join(' · '),
        Icon: Building2,
      };
    }
    case 'place':
      return { title: result.place.name, detail: 'Neighborhood · Portland', Icon: MapPin };
    case 'neighborhood':
      return {
        title: result.name,
        detail: `Neighborhood · ${result.items.length} City-financed ${result.items.length === 1 ? 'building' : 'buildings'}`,
        Icon: MapPin,
      };
  }
}

export default function MapSearch({
  items,
  showCity,
  activeQuery,
  onPick,
  onClearQuery,
  className = '',
}: {
  items: readonly MapItem[];
  showCity: boolean;
  activeQuery: string;
  onPick: (result: SearchResult) => void;
  onClearQuery: () => void;
  className?: string;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = useMemo(() => searchResults(text, items, showCity), [text, items, showCity]);
  const expanded = open && results.length > 0;

  function pick(result: SearchResult) {
    onPick(result);
    setOpen(false);
    if (result.type !== 'all') setText('');
  }

  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-on-surface-variant" aria-hidden="true" />
      <input
        type="search"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `${listId}-${active}` : undefined}
        aria-label="Search by property, address, ZIP code, neighborhood or organization"
        placeholder="Search property, address, ZIP or neighborhood"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!expanded) {
              setOpen(true);
              setActive(0);
              return;
            }
            setActive((index) => Math.min(index + 1, results.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && expanded) {
            event.preventDefault();
            pick(results[active]);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="w-full rounded-2xl border border-surface-container-highest bg-surface-container-lowest py-3 pl-11 pr-10 text-base shadow-sm lg:text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {text && (
        <button
          type="button"
          onClick={() => setText('')}
          aria-label="Clear search text"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {expanded && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-surface-container-highest bg-surface-container-lowest p-1.5 shadow-xl"
        >
          {results.map((result, index) => {
            const { title, detail, Icon } = resultLabel(result);
            return (
              <li
                key={`${result.type}-${title}-${index}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(result)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${index === active ? 'bg-surface-container-low' : ''}`}
              >
                <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-on-surface">{title}</span>
                  <span className="block truncate text-xs text-on-surface-variant">{detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {activeQuery && (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-surface-container-lowest/95 px-3 py-1.5 text-xs text-on-surface-variant shadow-sm">
          <span className="truncate">
            Showing matches for <span className="font-semibold text-on-surface">“{activeQuery}”</span>
          </span>
          <button type="button" onClick={onClearQuery} className="shrink-0 font-semibold text-primary hover:text-primary-dim">
            Show everything
          </button>
        </div>
      )}
    </div>
  );
}
