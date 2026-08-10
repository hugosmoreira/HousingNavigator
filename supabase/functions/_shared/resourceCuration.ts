export const CURATION_HOUSEHOLD_TYPES = [
  'single_adult',
  'family',
  'senior',
  'veteran',
  'disability',
] as const;

export type CurationHouseholdType = (typeof CURATION_HOUSEHOLD_TYPES)[number];

export interface CuratableResource {
  id: string;
  name: string;
  category: string;
  description: string | null;
  who_qualifies: string | null;
  who_it_helps: string[] | null;
  website: string | null;
  source_url: string | null;
  source_type: string | null;
  last_verified: string | null;
  published: boolean;
}

export interface ExtractedClaim<T> {
  value: T | null;
  evidence: string;
}

export interface ResourceExtraction {
  identity_match: boolean;
  confidence: number;
  identity_evidence: string;
  description: ExtractedClaim<string>;
  who_qualifies: ExtractedClaim<string>;
  who_it_helps: ExtractedClaim<string[]>;
}

export interface CurationPlan {
  patch: Record<string, unknown>;
  proposedFields: Record<string, unknown>;
  evidence: Record<string, string>;
  reasons: string[];
  confidence: number;
}

const MIN_CONFIDENCE = 0.75;

const ELIGIBILITY_REQUIRED_CATEGORIES = new Set([
  'rent_assistance',
  'eviction_prevention',
  'emergency_shelter',
  'rapid_rehousing',
  'public_housing',
  'section8_waitlist',
  'legal_aid',
]);

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

function cleanGeneratedText(value: string, maxLength: number): string {
  return value
    .replace(/[*_#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    hellip: '...',
    laquo: '«',
    ldquo: '"',
    lsquo: "'",
    mdash: '—',
    nbsp: ' ',
    ndash: '–',
    quot: '"',
    raquo: '»',
    rdquo: '"',
    rsquo: "'",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, key: string) => {
    const normalized = key.toLowerCase();
    if (normalized.startsWith('#')) {
      const hexadecimal = normalized.startsWith('#x');
      const codePoint = Number.parseInt(normalized.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
        return String.fromCodePoint(codePoint);
      }
      return entity;
    }
    return namedEntities[normalized] ?? entity;
  });
}

function normalizeEvidence(value: string): string {
  return decodeHtmlEntities(value)
    .normalize('NFKC')
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

/** Return the original quote only when its normalized text is present in the page. */
export function verifiedCurationEvidence(pageText: string, candidate: string): string | null {
  const trimmed = candidate.trim();
  if (!trimmed || !normalizeEvidence(pageText).includes(normalizeEvidence(trimmed))) {
    return null;
  }
  return trimmed.slice(0, 1000);
}

export function resourceNeedsCuration(resource: CuratableResource): boolean {
  const hasUsableSource = !isBlank(resource.source_url) || !isBlank(resource.website);
  const eligibilityRequired = ELIGIBILITY_REQUIRED_CATEGORIES.has(resource.category);

  return (
    resource.published &&
    (isBlank(resource.description) ||
      (eligibilityRequired && isBlank(resource.who_qualifies)) ||
      !hasUsableSource)
  );
}

export function resourceSourceUrl(resource: CuratableResource): string | null {
  const value = resource.source_url?.trim() || resource.website?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Convert an evidence-backed model extraction into a fill-only database patch.
 * Existing curator-written values are never replaced here.
 */
export function buildResourceCurationPlan(
  resource: CuratableResource,
  extraction: ResourceExtraction,
  pageText: string,
  finalUrl: string,
  verifiedOn: string,
): CurationPlan {
  const patch: Record<string, unknown> = {};
  const proposedFields: Record<string, unknown> = {};
  const evidence: Record<string, string> = {};
  const reasons: string[] = [];
  const confidence = Math.min(1, Math.max(0, Number(extraction.confidence) || 0));
  const identityEvidence = verifiedCurationEvidence(pageText, extraction.identity_evidence);

  if (!extraction.identity_match) reasons.push('official page did not clearly match this resource');
  if (confidence < MIN_CONFIDENCE) reasons.push(`confidence ${confidence.toFixed(2)} is below ${MIN_CONFIDENCE}`);
  if (!identityEvidence) reasons.push('resource identity evidence was not found verbatim on the page');

  if (!extraction.identity_match || confidence < MIN_CONFIDENCE || !identityEvidence) {
    return { patch, proposedFields, evidence, reasons, confidence };
  }
  evidence.identity = identityEvidence;

  let supportedClaims = 0;

  const description = extraction.description.value
    ? cleanGeneratedText(extraction.description.value, 700)
    : '';
  const descriptionEvidence = verifiedCurationEvidence(
    pageText,
    extraction.description.evidence,
  );
  if (description && descriptionEvidence) {
    proposedFields.description = description;
    evidence.description = descriptionEvidence;
    supportedClaims += 1;
    if (isBlank(resource.description)) patch.description = description;
  } else if (isBlank(resource.description)) {
    reasons.push('the page did not support a useful description');
  }

  const eligibility = extraction.who_qualifies.value
    ? cleanGeneratedText(extraction.who_qualifies.value, 700)
    : '';
  const eligibilityEvidence = verifiedCurationEvidence(
    pageText,
    extraction.who_qualifies.evidence,
  );
  if (eligibility && eligibilityEvidence) {
    proposedFields.who_qualifies = eligibility;
    evidence.who_qualifies = eligibilityEvidence;
    supportedClaims += 1;
    if (isBlank(resource.who_qualifies)) patch.who_qualifies = eligibility;
  } else if (
    isBlank(resource.who_qualifies) &&
    ELIGIBILITY_REQUIRED_CATEGORIES.has(resource.category)
  ) {
    reasons.push('the page did not state who qualifies');
  }

  const allowedHouseholds = new Set<string>(CURATION_HOUSEHOLD_TYPES);
  const householdValues = Array.isArray(extraction.who_it_helps.value)
    ? [...new Set(extraction.who_it_helps.value.filter((value) => allowedHouseholds.has(value)))]
    : [];
  const householdEvidence = verifiedCurationEvidence(
    pageText,
    extraction.who_it_helps.evidence,
  );
  if (householdValues.length > 0 && householdEvidence) {
    proposedFields.who_it_helps = householdValues;
    evidence.who_it_helps = householdEvidence;
    supportedClaims += 1;
    if (!resource.who_it_helps || resource.who_it_helps.length === 0) {
      patch.who_it_helps = householdValues;
    }
  }

  // The fetched URL has already passed the outbound HTTP safety checks and
  // the page identity was verified above. It is therefore safe provenance.
  if (isBlank(resource.source_url)) {
    patch.source_url = finalUrl;
    proposedFields.source_url = finalUrl;
  }
  if (isBlank(resource.source_type)) patch.source_type = 'agency_website';

  // Freshness means the official page actually supported at least one useful
  // claim. Successfully downloading a generic homepage is not verification.
  if (supportedClaims > 0 && resource.last_verified !== verifiedOn) {
    patch.last_verified = verifiedOn;
    proposedFields.last_verified = verifiedOn;
  } else if (supportedClaims === 0) {
    reasons.push('no evidence-backed resource details were found');
  }

  return { patch, proposedFields, evidence, reasons, confidence };
}

/** Dependency-free HTML-to-text conversion for the edge runtime. */
export function resourceHtmlToText(html: string): string {
  return decodeHtmlEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>'))
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}
