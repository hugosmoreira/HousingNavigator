/**
 * Lightweight, dependency-free search over the resource catalog.
 *
 * Goals (in priority order):
 *   1. Beat 211-style brittle keyword search by understanding common
 *      housing synonyms ("section 8" === "voucher" === "hud-vash").
 *   2. Match across all the user-facing fields a person might think of:
 *      title, description, eligibility, who-it-helps, location, raw
 *      category text.
 *   3. Tolerate a single typo per long token without bringing in fuse.js
 *      or a lunr index.
 *
 * Sort order when a query is present:
 *   relevance score desc → priority_score desc → name asc
 */

import { directoryCategoryLabel } from '../data/categoryMap';
import type { Program } from '../types';

// ---------------------------------------------------------------------------
// Synonyms
// ---------------------------------------------------------------------------

/**
 * Each row is a cluster of equivalent housing terms. Any token that
 * matches one entry expands the search to every token in the cluster.
 * Multi-word entries are matched as phrases against the haystack as well
 * (so "section 8" works even if a user types it with the space).
 */
const SYNONYM_CLUSTERS: string[][] = [
  ['section 8', 'section8', 'voucher', 'vouchers', 'hcv', 'hud-vash', 'hudvash'],
  ['shelter', 'bed', 'beds', 'shelters'],
  ['rent assistance', 'rental assistance', 'rent help', 'help with rent', 'back rent'],
  ['eviction', 'evicted', 'notice to vacate', 'unlawful detainer', 'ud'],
  ['legal', 'lawyer', 'attorney', 'tenant rights', 'tenant law'],
  ['dv', 'domestic violence', 'abuse', 'survivor'],
  ['rapid rehousing', 'rrh', 'rapid re-housing'],
  ['outreach', 'street outreach', 'mobile team'],
  ['veteran', 'vets', 'va', 'military'],
  ['youth', 'teen', 'teenager', 'young adult'],
  ['senior', 'seniors', 'elder', 'elderly', 'aging', 'older adult'],
  ['disability', 'disabled', 'ada', 'accessible'],
  ['family', 'families', 'kids', 'children', 'parent'],
  ['homeless', 'unhoused', 'unsheltered'],
  ['public housing', 'housing authority', 'home forward', 'vha'],
  ['211', 'two one one', 'coordinated entry', 'cea'],
  ['portland', 'pdx', 'multnomah', 'mult'],
  ['vancouver', 'clark county', 'clark'],
  ['deposit', 'move-in', 'security deposit', 'first month'],
];

const TOKEN_SYNONYMS = (() => {
  const map = new Map<string, Set<string>>();
  for (const cluster of SYNONYM_CLUSTERS) {
    const expanded = new Set(cluster);
    for (const term of cluster) {
      const existing = map.get(term);
      if (existing) {
        for (const e of expanded) existing.add(e);
      } else {
        map.set(term, new Set(expanded));
      }
    }
  }
  return map;
})();

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------

const PUNCT_RE = /[^\p{L}\p{N}\s]+/gu;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(PUNCT_RE, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function expandQueryTokens(raw: string): { tokens: string[]; phrases: string[] } {
  const lowered = raw.trim().toLowerCase();
  const baseTokens = tokenize(lowered);
  const expanded = new Set<string>(baseTokens);
  const phrases: string[] = [];

  for (const token of baseTokens) {
    const synonyms = TOKEN_SYNONYMS.get(token);
    if (synonyms) {
      for (const s of synonyms) {
        if (s.includes(' ')) phrases.push(s);
        else expanded.add(s);
      }
    }
  }
  // Also try whole-query phrase matches against multi-word synonyms.
  for (const cluster of SYNONYM_CLUSTERS) {
    for (const term of cluster) {
      if (term.includes(' ') && lowered.includes(term)) {
        for (const s of cluster) {
          if (s.includes(' ')) phrases.push(s);
          else expanded.add(s);
        }
      }
    }
  }
  return { tokens: [...expanded], phrases };
}

// ---------------------------------------------------------------------------
// Field weights
// ---------------------------------------------------------------------------

const FIELD_WEIGHTS = {
  name: 5,
  category: 3,
  description: 2,
  notes: 2,
  eligibility: 2,
  whoItHelps: 1.5,
  location: 1,
  rawCategory: 1.5,
} as const;

interface FieldBag {
  name: string;
  category: string;
  description: string;
  notes: string;
  eligibility: string;
  whoItHelps: string;
  location: string;
  rawCategory: string;
}

function buildFieldBag(program: Program): FieldBag {
  const directoryLabel = program.directory_category
    ? directoryCategoryLabel(program.directory_category)
    : '';
  return {
    name: program.program_name,
    category: `${directoryLabel} ${program.category.replace(/_/g, ' ')}`,
    description: program.description ?? '',
    notes: program.notes ?? '',
    eligibility: program.eligibility_summary ?? '',
    whoItHelps: program.who_it_helps.map((h) => h.replace(/_/g, ' ')).join(' '),
    location: [program.city, program.state, program.county, program.address]
      .filter(Boolean)
      .join(' '),
    rawCategory: program.raw_category ?? '',
  };
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function levenshtein1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1;
      j += 1;
    } else {
      edits += 1;
      if (edits > 1) return false;
      if (shorter.length === longer.length) {
        i += 1;
        j += 1;
      } else {
        j += 1;
      }
    }
  }
  if (j < longer.length) edits += longer.length - j;
  return edits <= 1;
}

function fieldHits(
  fieldText: string,
  fieldTokens: string[],
  queryTokens: string[],
  phrases: string[],
): number {
  if (!fieldText) return 0;
  let hits = 0;
  for (const phrase of phrases) {
    if (fieldText.includes(phrase)) hits += 2;
  }
  for (const qt of queryTokens) {
    if (qt.length === 0) continue;
    let matched = false;
    for (const ft of fieldTokens) {
      if (ft === qt) {
        hits += 1;
        matched = true;
        break;
      }
      if (qt.length >= 4 && ft.startsWith(qt)) {
        hits += 0.7;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    // Cheap fuzzy: only for tokens long enough to be meaningful.
    if (qt.length >= 4) {
      for (const ft of fieldTokens) {
        if (Math.abs(ft.length - qt.length) <= 1 && levenshtein1(ft, qt)) {
          hits += 0.5;
          break;
        }
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ScoredProgram {
  program: Program;
  score: number;
}

export function scoreProgram(program: Program, query: string): number {
  if (!query.trim()) return 0;
  const { tokens, phrases } = expandQueryTokens(query);
  const bag = buildFieldBag(program);

  let total = 0;
  (Object.keys(FIELD_WEIGHTS) as Array<keyof typeof FIELD_WEIGHTS>).forEach((field) => {
    const text = bag[field].toLowerCase();
    const fieldTokens = tokenize(text);
    const hits = fieldHits(text, fieldTokens, tokens, phrases);
    total += hits * FIELD_WEIGHTS[field];
  });
  return total;
}

export function searchPrograms(programs: Program[], query: string): ScoredProgram[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return programs.map((program) => ({ program, score: 0 }));
  }
  const scored: ScoredProgram[] = programs.map((program) => ({
    program,
    score: scoreProgram(program, trimmed),
  }));
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.program.priority_score !== a.program.priority_score) {
        return b.program.priority_score - a.program.priority_score;
      }
      return a.program.program_name.localeCompare(b.program.program_name);
    });
}
