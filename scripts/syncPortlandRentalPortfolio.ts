/**
 * Snapshot City of Portland open data for the /map page.
 *
 * Sources (PortlandMaps open data):
 *   - Portland Housing Bureau "Rental Portfolio"
 *     COP_OpenData_PlanningDevelopment/MapServer/221: rental properties of 5+
 *     homes that received direct or indirect PHB financing, with regulated
 *     unit counts by income tier.
 *   - "Neighborhood Boundaries" COP_OpenData_Boundary/MapServer/3: the mapped
 *     by-law boundaries of Portland neighborhood associations.
 *
 * Output (fetched only by /map):
 *   - public/data/portland-rental-portfolio.json
 *   - public/data/portland-neighborhoods.json (simplified GeoJSON)
 *
 * Run with: `npm run map-data:sync`
 *
 * This is a manual, reviewable step on purpose: builds never call the City's
 * servers, and a curator can diff each refresh before it ships. The layers'
 * metadata says they are provided "as is"; the page credits the source.
 *
 * Privacy and naming rules:
 *   - Each building's neighborhood comes from the City's boundaries, not from
 *     the PHB "analysis area" field, which is blank for about a quarter of
 *     records.
 *   - Sponsor names are published only when they appear in the hand-reviewed
 *     list in scripts/data/phbSponsors.json. Individuals are never published,
 *     and an unreviewed name is withheld and printed for review.
 *   - Loan borrower names are not copied at all.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PortlandRentalPortfolioFile, RegulatedProperty } from '../src/map/regulatedHousing';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const portfolioPath = join(repoRoot, 'public', 'data', 'portland-rental-portfolio.json');
const neighborhoodsPath = join(repoRoot, 'public', 'data', 'portland-neighborhoods.json');
const sponsorReviewPath = join(repoRoot, 'scripts', 'data', 'phbSponsors.json');

const LAYER_URL =
  'https://www.portlandmaps.com/od/rest/services/COP_OpenData_PlanningDevelopment/MapServer/221';
const METADATA_URL =
  'https://www.portlandmaps.com/metadata/index.cfm?&action=DisplayLayer&LayerID=54551';
const NEIGHBORHOODS_URL =
  'https://www.portlandmaps.com/od/rest/services/COP_OpenData_Boundary/MapServer/3';
const PAGE_SIZE = 200;
// F81 is the City's tier above 80% AMI; it is published as "81".
const TIERS = ['30', '40', '45', '50', '55', '60', '65', '80', '81', '100'] as const;
// About 15 m: enough detail for neighborhood shading at city zoom levels.
const BOUNDARY_SIMPLIFY_DEGREES = 0.00015;

interface ArcGisFeature {
  attributes: Record<string, string | number | null>;
  geometry?: { x?: number; y?: number; rings?: number[][][] };
}

interface SponsorReview {
  aliases: Record<string, string>;
  individuals: string[];
  organizations: string[];
}

interface Neighborhood {
  name: string;
  shared: boolean;
  unclaimed: boolean;
  rings: number[][][];
}

function text(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const trimmed = String(value).trim();
  return trimmed && trimmed !== '0' && trimmed.toLowerCase() !== 'null' ? trimmed : null;
}

function count(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function year(value: unknown): number | null {
  const parsed = count(value);
  return parsed && parsed >= 1850 && parsed <= 2100 ? parsed : null;
}

async function query(layerUrl: string, params: Record<string, string>): Promise<ArcGisFeature[]> {
  const url = new URL(`${layerUrl}/query`);
  url.searchParams.set('where', '1=1');
  url.searchParams.set('outFields', '*');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('f', 'json');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`PortlandMaps returned ${response.status}.`);
    const body = (await response.json()) as { features?: ArcGisFeature[]; error?: unknown };
    if (body.error || !Array.isArray(body.features)) {
      throw new Error(`PortlandMaps query failed: ${JSON.stringify(body.error ?? 'no features')}`);
    }
    return body.features;
  } finally {
    clearTimeout(timeout);
  }
}

function insideRings(lng: number, lat: number, rings: number[][][]): boolean {
  // Even-odd over every ring handles holes in ArcGIS polygons.
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** Prefer a neighborhood's own area over a shared or unclaimed overlap. */
function neighborhoodAt(lng: number, lat: number, neighborhoods: Neighborhood[]): string | null {
  const hits = neighborhoods.filter((hood) => insideRings(lng, lat, hood.rings));
  const own = hits.find((hood) => !hood.shared && !hood.unclaimed);
  const shared = hits.find((hood) => hood.shared && !hood.unclaimed);
  return own?.name ?? shared?.name ?? null;
}

function cleanName(value: string): string {
  // The City field sometimes carries notes, e.g. "SAWASH (Ceel has 3 units)".
  return value.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function reviewedSponsor(raw: string | null, review: SponsorReview, unreviewed: Set<string>): string | null {
  if (!raw) return null;
  const cleaned = cleanName(raw);
  const name = review.aliases[cleaned] ?? cleaned;
  if (review.individuals.includes(cleaned) || review.individuals.includes(name)) return null;
  if (review.organizations.includes(name)) return name;
  unreviewed.add(cleaned);
  return null;
}

function toRecord(
  feature: ArcGisFeature,
  neighborhoods: Neighborhood[],
  review: SponsorReview,
  unreviewed: Set<string>,
): RegulatedProperty | null {
  const a = feature.attributes;
  const lng = feature.geometry?.x;
  const lat = feature.geometry?.y;
  const name = text(a.Project_Name);
  if (!name || typeof lng !== 'number' || typeof lat !== 'number') return null;

  const tiers: Record<string, number> = {};
  for (const tier of TIERS) {
    const units = count(a[`F${tier}`]);
    if (units) tiers[tier] = units;
  }

  return {
    id: text(a.R_Number) ?? `phb-${a.OBJECTID}`,
    name: cleanName(name),
    address: text(a.Property_Address),
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    total_units: count(a.Total_Unit),
    regulated_units: count(a.Regulated_Units),
    ami_units: tiers,
    sponsor: reviewedSponsor(text(a.Sponsor_Name), review, unreviewed),
    building_type: text(a.Building_Type),
    year_built: year(a.Year_Built),
    year_completed: year(a.Year_Complet),
    neighborhood: neighborhoodAt(lng, lat, neighborhoods),
  };
}

async function loadNeighborhoods(): Promise<Neighborhood[]> {
  const features = await query(NEIGHBORHOODS_URL, {
    returnGeometry: 'true',
    maxAllowableOffset: String(BOUNDARY_SIMPLIFY_DEGREES),
    geometryPrecision: '5',
    resultRecordCount: '500',
  });
  const neighborhoods = features
    .filter((feature) => feature.geometry?.rings?.length)
    .map((feature) => ({
      name: text(feature.attributes.MAPLABEL) ?? text(feature.attributes.NAME) ?? 'Unnamed',
      shared: feature.attributes.SHARED === 'Y',
      unclaimed: String(feature.attributes.COALIT ?? '').toUpperCase() === 'UNCLAIMED',
      rings: feature.geometry!.rings!,
    }));
  if (neighborhoods.length < 90) {
    throw new Error(`Refusing to use a suspiciously small boundary set (${neighborhoods.length}).`);
  }
  return neighborhoods;
}

async function main(): Promise<void> {
  const review = JSON.parse(readFileSync(sponsorReviewPath, 'utf8')) as SponsorReview;
  const neighborhoods = await loadNeighborhoods();

  const features: ArcGisFeature[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await query(LAYER_URL, {
      orderByFields: 'OBJECTID',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
    });
    features.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const unreviewed = new Set<string>();
  const records = features
    .map((feature) => toRecord(feature, neighborhoods, review, unreviewed))
    .filter((record): record is RegulatedProperty => record !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  // One tax account can hold several PHB projects. Keep the R-number as the id
  // when it is unique; otherwise add the project name so links stay stable.
  const idCounts = new Map<string, number>();
  for (const record of records) idCounts.set(record.id, (idCounts.get(record.id) ?? 0) + 1);
  for (const record of records) {
    if ((idCounts.get(record.id) ?? 0) > 1) {
      const nameSlug = record.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      record.id = `${record.id}-${nameSlug}`;
    }
  }
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) throw new Error(`Duplicate record id after disambiguation: ${record.id}`);
    seen.add(record.id);
  }
  if (records.length < 100) {
    throw new Error(`Refusing to write a suspiciously small snapshot (${records.length} records).`);
  }

  const retrievedOn = new Date().toISOString().slice(0, 10);
  const file: PortlandRentalPortfolioFile = {
    source: 'Portland Housing Bureau, Rental Portfolio (City of Portland open data)',
    source_url: LAYER_URL,
    metadata_url: METADATA_URL,
    neighborhoods_url: NEIGHBORHOODS_URL,
    terms:
      'Distributed under the City of Portland Data Distribution Policy and provided as is; the City accepts no responsibility for errors, omissions or positional accuracy.',
    retrieved_on: retrievedOn,
    records,
  };

  const boundaries = {
    type: 'FeatureCollection',
    source: 'City of Portland, Neighborhood Boundaries (PortlandMaps open data)',
    source_url: NEIGHBORHOODS_URL,
    retrieved_on: retrievedOn,
    features: neighborhoods
      .filter((hood) => !hood.unclaimed)
      .map((hood) => ({
        type: 'Feature',
        properties: { name: hood.name, shared: hood.shared },
        geometry: { type: 'Polygon', coordinates: hood.rings },
      })),
  };

  mkdirSync(dirname(portfolioPath), { recursive: true });
  writeFileSync(portfolioPath, `${JSON.stringify(file)}\n`, 'utf8');
  writeFileSync(neighborhoodsPath, `${JSON.stringify(boundaries)}\n`, 'utf8');

  const homes = records.reduce((total, record) => total + (record.total_units ?? 0), 0);
  const placed = records.filter((record) => record.neighborhood).length;
  console.log(`Saved ${records.length} City-financed properties (${homes} homes).`);
  console.log(`${placed} are inside a Portland neighborhood; ${records.length - placed} are outside.`);
  console.log(`Saved ${boundaries.features.length} neighborhood boundaries.`);
  console.log(`Skipped ${features.length - records.length} records without a name or location.`);
  if (unreviewed.size) {
    console.warn(
      `! Withheld ${unreviewed.size} unreviewed sponsor names. Add each to organizations or individuals in scripts/data/phbSponsors.json:\n  ${[...unreviewed].sort().join('\n  ')}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
