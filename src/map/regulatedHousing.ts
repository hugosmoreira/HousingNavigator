import type { MapBounds, MapProperty } from './mapData';

/**
 * City-financed rental housing from the Portland Housing Bureau's open
 * "Rental Portfolio" layer. These are reference records, not Housing
 * Navigator listings: they carry no verified application or waitlist details.
 */
export interface RegulatedProperty {
  /** County property id (R-number) when the City publishes one. */
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  total_units: number | null;
  regulated_units: number | null;
  /** Regulated homes by income tier, keyed by % of area median income. */
  ami_units: Record<string, number>;
  /**
   * Sponsor recorded on the PHB financing, when it is a hand-reviewed
   * organization name (scripts/data/phbSponsors.json). Not necessarily the
   * owner. Individuals are never included.
   */
  sponsor: string | null;
  building_type: string | null;
  year_built: number | null;
  year_completed: number | null;
  /** City of Portland neighborhood containing the point; null outside them. */
  neighborhood: string | null;
}

export interface PortlandRentalPortfolioFile {
  source: string;
  source_url: string;
  metadata_url: string;
  neighborhoods_url: string;
  terms: string;
  retrieved_on: string;
  records: RegulatedProperty[];
}

export const RENTAL_PORTFOLIO_URL = '/data/portland-rental-portfolio.json';

export async function loadRentalPortfolio(signal?: AbortSignal): Promise<PortlandRentalPortfolioFile> {
  const response = await fetch(RENTAL_PORTFOLIO_URL, { signal });
  if (!response.ok) throw new Error(`City housing layer unavailable (${response.status}).`);
  const file = (await response.json()) as PortlandRentalPortfolioFile;
  if (!Array.isArray(file.records)) throw new Error('City housing layer is malformed.');
  return file;
}

function streetKey(address: string | null | undefined): string | null {
  if (!address) return null;
  const match = address
    .toUpperCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\s+/g, ' ')
    .trim()
    .match(/^(\d+)(?:-\d+)?\s+(.*)$/);
  if (!match) return null;
  // House number plus the first two street words ("SE FOSTER") is specific
  // enough to pair records without tripping over suffix spellings.
  return `${match[1]} ${match[2].split(' ').slice(0, 2).join(' ')}`;
}

// Words too common in building names to pair two records on their own.
const GENERIC_NAME_WORDS = new Set([
  'apartments', 'apts', 'center', 'place', 'commons', 'court', 'village', 'house',
  'homes', 'plaza', 'building', 'housing', 'station', 'square', 'gardens', 'terrace',
  'north', 'south', 'east', 'west', 'portland',
]);

function distinctiveWords(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !GENERIC_NAME_WORDS.has(word));
}

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (a.lat - b.lat) * 111_320;
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * Pair City records with Housing Navigator listings for the same building so
 * the map shows one point per building. A pair needs the same house number
 * and street, or two points within 60 m whose names share a distinctive word.
 */
export function matchListings(
  records: readonly RegulatedProperty[],
  listings: readonly MapProperty[],
): Map<string, RegulatedProperty> {
  const bySlug = new Map<string, RegulatedProperty>();
  const used = new Set<string>();
  for (const listing of listings) {
    if (!listing.location) continue;
    const key = streetKey(listing.property.address);
    const words = new Set(distinctiveWords(listing.property.name));
    const match = records.find((record) => {
      if (used.has(record.id)) return false;
      if (key && streetKey(record.address) === key) return true;
      if (metersBetween(record, listing.location!) > 60) return false;
      return distinctiveWords(record.name).some((word) => words.has(word));
    });
    if (match) {
      bySlug.set(listing.slug, match);
      used.add(match.id);
    }
  }
  return bySlug;
}

export function regulatedInBounds(
  records: readonly RegulatedProperty[],
  bounds: MapBounds,
): RegulatedProperty[] {
  return records.filter(
    (record) =>
      record.lat >= bounds.south &&
      record.lat <= bounds.north &&
      record.lng >= bounds.west &&
      record.lng <= bounds.east,
  );
}

export interface RegulatedStats {
  properties: number;
  homes: number;
  regulatedHomes: number;
  deeplyAffordable: number;
}

/** Totals for City records; "deeply affordable" means 30% AMI or below. */
export function regulatedStats(records: readonly RegulatedProperty[]): RegulatedStats {
  let homes = 0;
  let regulatedHomes = 0;
  let deeplyAffordable = 0;
  for (const record of records) {
    homes += record.total_units ?? 0;
    regulatedHomes += record.regulated_units ?? 0;
    deeplyAffordable += record.ami_units['30'] ?? 0;
  }
  return { properties: records.length, homes, regulatedHomes, deeplyAffordable };
}

export function amiSummary(record: RegulatedProperty): string | null {
  const tiers = Object.entries(record.ami_units)
    .map(([tier, units]) => [Number(tier), units] as const)
    .sort((a, b) => a[0] - b[0]);
  if (!tiers.length) return null;
  // Tier 81 is the City's band above 80% AMI.
  return tiers.map(([tier, units]) => (tier === 81 ? `${units} above 80%` : `${units} at ${tier}%`)).join(' · ');
}
