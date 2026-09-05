// Pure source-comparison policy, shared with regression tests. No database writes.
import { resourceHtmlToText, verifiedCurationEvidence } from './resourceCuration.ts';

export const SOURCE_FIELDS = [
  'description', 'who_qualifies', 'cost_details', 'public_notes',
  'phone', 'application_method', 'referral_required', 'service_area',
] as const;
export type SourceField = typeof SOURCE_FIELDS[number];
export interface SourceChange {
  field: SourceField;
  value: string | boolean;
  evidence: string;
  reason: string;
}
export interface SourceAssessment {
  identity_match: boolean;
  identity_evidence: string;
  confidence: number;
  outcome: 'unchanged' | 'changed' | 'uncertain';
  closure_notice: string;
  changes: SourceChange[];
  summary: string;
}
export interface SourcePlan {
  status: 'unchanged' | 'changed' | 'uncertain';
  kind: 'changes' | 'closure' | 'uncertain';
  patch: Record<string, string | boolean>;
  evidence: Record<string, string>;
  summary: string;
  reviewOnly: boolean;
}

export function normalizeSourceText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/** Remove page furniture, but retain body notices even when outside <main>. */
export function sourcePageText(html: string): string {
  return normalizeSourceText(resourceHtmlToText(html
    .replace(/<(nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[^]*?-->/g, ' ')));
}

export async function sourceDigest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function validSourceField(field: string, value: unknown): boolean {
  if (!(SOURCE_FIELDS as readonly string[]).includes(field)) return false;
  if (field === 'referral_required') return typeof value === 'boolean';
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) return false;
  if (field === 'application_method') return ['walk_in', 'phone', 'online', 'referral'].includes(value);
  if (field === 'phone') return value.length <= 100 && !/[<>]/.test(value);
  return !/[<>]/.test(value);
}

function supportedQuote(page: string, value: unknown): value is string {
  return typeof value === 'string' && value.replace(/[^\p{L}\p{N}]/gu, '').length >= 6 &&
    verifiedCurationEvidence(page, value) !== null;
}

export function buildSourcePlan(
  current: Record<string, unknown>, assessment: SourceAssessment, page: string,
): SourcePlan {
  const uncertain = (summary: string): SourcePlan => ({
    status: 'uncertain', kind: 'uncertain', patch: {}, evidence: {},
    summary, reviewOnly: true,
  });
  if (!assessment || !Array.isArray(assessment.changes) ||
      !['unchanged', 'changed', 'uncertain'].includes(assessment.outcome) ||
      !assessment.identity_match || !Number.isFinite(assessment.confidence) ||
      assessment.confidence < 0.85 || assessment.confidence > 1 ||
      !supportedQuote(page, assessment.identity_evidence)) {
    return uncertain('The source could not be confidently matched to this program. Review the official page.');
  }
  const patch: SourcePlan['patch'] = {};
  const evidence: SourcePlan['evidence'] = { identity: assessment.identity_evidence };
  let reviewOnly = false;
  for (const change of assessment.changes) {
    if (!change || !validSourceField(change.field, change.value) ||
        !supportedQuote(page, change.evidence) || patch[change.field] !== undefined) {
      return uncertain('A proposed change did not have valid supporting evidence. Nothing was applied.');
    }
    const value = typeof change.value === 'string' ? normalizeSourceText(change.value) : change.value;
    const previous = current[change.field];
    if (typeof previous === 'string' && typeof value === 'string' &&
        normalizeSourceText(previous) === value || previous === value) continue;
    patch[change.field] = value;
    evidence[change.field] = change.evidence;
    if (change.field === 'service_area') reviewOnly = true;
  }
  const closure = typeof assessment.closure_notice === 'string' ? assessment.closure_notice.trim() : '';
  if (closure && !supportedQuote(page, closure)) {
    return uncertain('The reported closure could not be supported by a source quote.');
  }
  if (closure) evidence.closure = closure;
  if (assessment.outcome === 'uncertain') return uncertain('The page does not clearly establish current program details. Review the official source.');
  if (assessment.outcome === 'unchanged' && (Object.keys(patch).length || closure)) {
    return uncertain('The comparison was inconsistent. No automatic edits were made.');
  }
  if (assessment.outcome === 'changed' && !Object.keys(patch).length && !closure) {
    return uncertain('A change was reported without a supported replacement.');
  }
  return {
    status: assessment.outcome, kind: closure ? 'closure' : 'changes',
    patch, evidence, reviewOnly: reviewOnly || Boolean(closure),
    summary: typeof assessment.summary === 'string' ? assessment.summary.slice(0, 800) : 'Review source changes.',
  };
}

/** Source quotes, not generated prose, define the finding's identity. */
export async function findingFingerprint(url: string, plan: SourcePlan, current: Record<string, unknown> = {}, sourceHash = ''): Promise<string> {
  const entries = Object.entries(plan.evidence).filter(([key]) => key !== 'identity')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, normalizeSourceText(value).toLowerCase(), current[key] ?? null]);
  return sourceDigest(JSON.stringify([url, plan.kind, entries, plan.kind === 'uncertain' ? sourceHash : '']));
}

export function retryDelayMs(failures: number): number {
  return Math.min(24 * 60 * 60_000, 15 * 60_000 * 2 ** Math.min(Math.max(failures - 1, 0), 7));
}

export function canReuseSourceAnalysis(
  previous: { source_hash?: string; resource_signature?: string; last_status?: string } | null,
  hash: string, signature: string,
): boolean {
  return Boolean(previous && previous.source_hash === hash && previous.resource_signature === signature &&
    ['unchanged', 'changed', 'uncertain'].includes(previous.last_status ?? ''));
}
