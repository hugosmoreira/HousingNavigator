import type { MapItem } from './mapData';
import { PORTLAND_OVERVIEW } from './places';
import { regulatedStats } from './regulatedHousing';

export interface TourStep {
  title: string;
  body: string;
  /** Fit the camera to these points, or fly to a single target. */
  fit?: Array<{ lng: number; lat: number }>;
  fly?: { lng: number; lat: number; zoom: number };
  select?: string;
}

const MAX_LISTING_STOPS = 4;

/**
 * A short guided tour built only from loaded data, so every number it shows
 * can be traced to a source.
 */
export function buildTour(items: readonly MapItem[], includeCity = true): TourStep[] {
  const city = includeCity ? items.filter((item) => item.city).map((item) => item.city!) : [];
  const totals = regulatedStats(city);
  const steps: TourStep[] = [];

  steps.push({
    title: 'Portland’s regulated affordable housing',
    body: city.length
      ? `The Portland Housing Bureau has helped finance ${totals.properties.toLocaleString('en-US')} rental buildings in and around the city, with ${totals.regulatedHomes.toLocaleString('en-US')} income-restricted homes. Column height shows how many homes each building has.`
      : 'Each column is a property. Its height shows how many homes it has.',
    fly: { ...PORTLAND_OVERVIEW, zoom: PORTLAND_OVERVIEW.zoom + 0.3 },
  });

  // Neighborhoods come from the City's boundaries, so every building is counted.
  const byNeighborhood = new Map<string, MapItem[]>();
  for (const item of includeCity ? items : []) {
    const name = item.city?.neighborhood;
    if (name) byNeighborhood.set(name, [...(byNeighborhood.get(name) ?? []), item]);
  }
  const homesIn = (group: MapItem[]) => regulatedStats(group.map((item) => item.city!)).regulatedHomes;
  const neighborhoods = [...byNeighborhood.entries()]
    .sort((a, b) => homesIn(b[1]) - homesIn(a[1]))
    .slice(0, 2);
  for (const [name, hoodItems] of neighborhoods) {
    const stats = regulatedStats(hoodItems.map((item) => item.city!));
    steps.push({
      title: name,
      body: `${stats.properties} City-financed buildings with ${stats.regulatedHomes.toLocaleString('en-US')} income-restricted homes${
        stats.deeplyAffordable ? `, ${stats.deeplyAffordable.toLocaleString('en-US')} of them for households at or below 30% of area median income` : ''
      }.`,
      fit: hoodItems,
    });
  }

  const listings = items
    .filter((item) => item.listing && item.listing.property.city === 'Portland')
    .sort((a, b) => Number(b.open) - Number(a.open) || b.units - a.units)
    .slice(0, MAX_LISTING_STOPS);
  for (const item of listings) {
    const property = item.listing!.property;
    const facts = [
      item.units ? `${item.units} homes` : null,
      property.ami_levels.length ? `income limits at ${property.ami_levels.join('% and ')}% AMI` : null,
      item.open ? 'accepting applications now' : null,
    ].filter(Boolean);
    steps.push({
      title: item.name,
      body: `A Housing Navigator listing${facts.length ? ` with ${facts.join(', ')}` : ''}. Open it to see eligibility and how to apply.`,
      fly: { lng: item.lng, lat: item.lat, zoom: 16.4 },
      select: item.key,
    });
  }

  steps.push({
    title: 'Explore on your own',
    body: 'Search an address or neighborhood, filter by unit size or income limit, or open “Explore the data” to compare neighborhoods, income levels and the organizations behind each building.',
    fly: { ...PORTLAND_OVERVIEW },
  });
  return steps;
}
