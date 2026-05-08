/**
 * Build the unified resource catalog from JSON + CSV sources.
 *
 * Inputs:
 *   - src/data/programs.json   (legacy seed; recommendation-engine source of truth)
 *   - src/data/csv/*.csv       (curator-maintained bulk imports)
 *
 * Output:
 *   - src/data/catalog.json    (consumed at runtime by `staticDataService`)
 *
 * Run with: `npm run catalog:build`
 *
 * Merge rules
 * -----------
 *   1. Stable id per row:
 *      - JSON rows keep their existing `id`.
 *      - CSV rows derive `csv-<base36 hash of name|website|county>` so
 *        re-imports do not churn ids.
 *   2. Dedupe key (computed in this order, first match wins):
 *        a. normalized website (host + path, no protocol/trailing slash)
 *        b. normalized `name|county`
 *      When two rows collide we keep the one with the more recent
 *      `last_verified` (ties → CSV wins, on the assumption that fresh
 *      CSV uploads are the curator's intent).
 *   3. `directory_category` is set on every row via `categoryMap.ts`.
 *      Legacy rows go through `legacyToDirectoryCategory`; CSV rows go
 *      through `csvToDirectoryCategory`.
 *
 * Compatibility note
 * ------------------
 * The deterministic engine still reads `program.category` (legacy
 * `ProgramCategory`). For CSV-only rows we synthesize a best-fit legacy
 * value via `directoryToLegacyCategory` so engine-driven UIs do not
 * break while we phase intake out.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  csvToDirectoryCategory,
  legacyToDirectoryCategory,
} from '../src/data/categoryMap.ts';
import type {
  ApplicationMethod,
  County,
  DirectoryCategory,
  HouseholdType,
  Program,
  ProgramCategory,
  ProgramStatus,
  StatusConfidence,
} from '../src/types/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

// ---------------------------------------------------------------------------
// CSV parsing — RFC 4180-ish: handles quoted fields with embedded commas
// and escaped quotes ("").  Good enough for the curator-maintained files
// in this repo; we are not trying to be a general-purpose parser.
// ---------------------------------------------------------------------------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.length > 0)) rows.push(row);
  }
  return rows;
}

function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? '').trim();
    });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Field normalisers
// ---------------------------------------------------------------------------

const COUNTIES: ReadonlyArray<County> = [
  'Multnomah',
  'Clark',
  'Washington',
  'Clackamas',
  'Other',
];

function normalizeCounty(raw: string): County {
  const found = COUNTIES.find((c) => c.toLowerCase() === raw.trim().toLowerCase());
  return found ?? 'Other';
}

function normalizeStatus(raw: string): ProgramStatus {
  const v = raw.trim().toLowerCase();
  if (v === 'open') return 'open';
  if (v === 'limited' || v === 'limited space') return 'limited';
  if (v === 'waitlist' || v === 'waitlist open') return 'waitlist';
  if (v === 'closed') return 'closed';
  return 'unknown';
}

function normalizeConfidence(raw: string): StatusConfidence {
  const v = raw.trim().toLowerCase();
  if (v === 'high') return 'high';
  if (v === 'medium' || v === 'med') return 'medium';
  return 'low';
}

function normalizeBool(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === 'yes' || v === 'true' || v === '1' || v === 'y';
}

function normalizeApplicationMethod(raw: string): ApplicationMethod {
  const v = raw.trim().toLowerCase();
  if (v.includes('walk')) return 'walk_in';
  if (v.includes('online') || v.includes('website') || v.includes('apply')) return 'online';
  if (v.includes('referral')) return 'referral';
  return 'phone';
}

const HOUSEHOLD_KEYWORDS: Array<[RegExp, HouseholdType]> = [
  [/\b(family|families|children|kids|parent)\b/i, 'family'],
  [/\b(senior|elder|aging|60\+|62\+)\b/i, 'senior'],
  [/\b(veteran|military|ssvf|hud-vash)\b/i, 'veteran'],
  [/\b(disab|adaap|ada\b)/i, 'disability'],
  [/\b(single adult|individual|adults)\b/i, 'single_adult'],
];

function inferHouseholdTypes(text: string): HouseholdType[] {
  const matches = new Set<HouseholdType>();
  for (const [re, household] of HOUSEHOLD_KEYWORDS) {
    if (re.test(text)) matches.add(household);
  }
  if (matches.size === 0) {
    matches.add('single_adult');
    matches.add('family');
  }
  return [...matches];
}

const DIRECTORY_TO_LEGACY: Record<DirectoryCategory, ProgramCategory> = {
  rent_assistance: 'rental_assistance',
  eviction_prevention: 'eviction_prevention',
  emergency_shelter: 'emergency_shelter',
  outreach: 'comprehensive_support',
  rapid_rehousing: 'transitional_housing',
  public_housing: 'long_term_housing_waitlist',
  section8_waitlist: 'long_term_housing_waitlist',
  legal_aid: 'legal_aid',
  supportive_services: 'comprehensive_support',
};

function directoryToLegacyCategory(d: DirectoryCategory): ProgramCategory {
  return DIRECTORY_TO_LEGACY[d];
}

// ---------------------------------------------------------------------------
// ID + dedupe helpers
// ---------------------------------------------------------------------------

function hash36(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function normalizeWebsite(url: string | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

function nameCountyKey(name: string, county: string): string {
  return `${name.trim().toLowerCase().replace(/\s+/g, ' ')}|${county.trim().toLowerCase()}`;
}

function dedupeKeyFor(p: Program): string {
  const websiteKey = normalizeWebsite(p.website);
  if (websiteKey) return `w:${websiteKey}`;
  return `n:${nameCountyKey(p.program_name, p.county)}`;
}

function pickFresher(a: Program, b: Program): Program {
  if (a.last_verified && b.last_verified) {
    return a.last_verified >= b.last_verified ? a : b;
  }
  if (a.last_verified) return a;
  if (b.last_verified) return b;
  return a;
}

// ---------------------------------------------------------------------------
// Source loaders
// ---------------------------------------------------------------------------

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8')) as T;
}

function loadJsonPrograms(): Program[] {
  const programs = readJson<Program[]>('src/data/programs.json');
  return programs.map((p) => ({
    ...p,
    directory_category: p.directory_category ?? legacyToDirectoryCategory(p.category),
    raw_category: p.raw_category ?? p.category,
  }));
}

function loadCsvPrograms(): Program[] {
  const csvDir = join(repoRoot, 'src/data/csv');
  let entries: string[];
  try {
    entries = readdirSync(csvDir).filter((f) => f.toLowerCase().endsWith('.csv'));
  } catch {
    return [];
  }
  const rows: Program[] = [];
  for (const file of entries) {
    const path = join(csvDir, file);
    const objects = csvToObjects(readFileSync(path, 'utf8'));
    for (const obj of objects) {
      const name = obj.name || '';
      if (!name) continue;
      const county = normalizeCounty(obj.county || '');
      const directoryCategory = csvToDirectoryCategory(obj.category || '');
      const legacyCategory = directoryToLegacyCategory(directoryCategory);
      const websiteKey = normalizeWebsite(obj.website);
      const idSeed = `${name.toLowerCase()}|${websiteKey ?? ''}|${county}`;
      const id = `csv-${hash36(idSeed)}`;
      const description = obj.description || '';
      const eligibility = obj.eligibility_summary || '';
      const whoText = `${obj.who_it_helps || ''} ${eligibility} ${description}`;

      rows.push({
        id,
        program_name: name,
        county,
        category: legacyCategory,
        who_it_helps: inferHouseholdTypes(whoText),
        application_method: normalizeApplicationMethod(obj.application_method || ''),
        referral_required: normalizeBool(obj.referral_required || ''),
        phone: obj.phone || '',
        website: obj.website || '',
        status: normalizeStatus(obj.status || ''),
        status_confidence: normalizeConfidence(obj.status_confidence || ''),
        priority_score: Number(obj.priority_score) || 0,
        notes: obj.notes || '',
        last_verified: obj.last_verified || '',
        description: description || undefined,
        eligibility_summary: eligibility || undefined,
        city: obj.city || undefined,
        state: obj.state || undefined,
        address: obj.address || undefined,
        source_url: obj.source_url || undefined,
        source_type: obj.source_type || undefined,
        directory_category: directoryCategory,
        raw_category: obj.category || undefined,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Merge + write
// ---------------------------------------------------------------------------

function mergePrograms(jsonPrograms: Program[], csvPrograms: Program[]): Program[] {
  const byKey = new Map<string, Program>();
  // JSON first so CSV overrides win on collision when fresher.
  for (const p of jsonPrograms) {
    byKey.set(dedupeKeyFor(p), p);
  }
  for (const p of csvPrograms) {
    const key = dedupeKeyFor(p);
    const existing = byKey.get(key);
    byKey.set(key, existing ? pickFresher(existing, p) : p);
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.county !== b.county) return a.county.localeCompare(b.county);
    return a.program_name.localeCompare(b.program_name);
  });
}

const jsonPrograms = loadJsonPrograms();
const csvPrograms = loadCsvPrograms();
const merged = mergePrograms(jsonPrograms, csvPrograms);

const outPath = join(repoRoot, 'src/data/catalog.json');
writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

const csvCount = csvPrograms.length;
const jsonCount = jsonPrograms.length;
const collapsed = jsonCount + csvCount - merged.length;
console.log(
  `Wrote ${outPath} — ${merged.length} programs (${jsonCount} json + ${csvCount} csv, ${collapsed} duplicates merged).`,
);
