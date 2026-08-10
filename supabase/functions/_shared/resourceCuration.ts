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

function normalizeEvidence(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');
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
  return (
    resource.published &&
    (isBlank(resource.description) ||
      isBlank(resource.who_qualifies) ||
      !Array.isArray(resource.who_it_helps) ||
      resource.who_it_helps.length === 0 ||
      isBlank(resource.source_url) ||
      isBlank(resource.last_verified))
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
  } else if (isBlank(resource.who_qualifies)) {
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
  } else if (!resource.who_it_helps || resource.who_it_helps.length === 0) {
    reasons.push('the page did not support a household-type classification');
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
  if (supportedClaims > 0) {
    patch.last_verified = verifiedOn;
    proposedFields.last_verified = verifiedOn;
  } else {
    reasons.push('no evidence-backed resource details were found');
  }

  return { patch, proposedFields, evidence, reasons, confidence };
}

/** Dependency-free HTML-to-text conversion for the edge runtime. */
export function resourceHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}
