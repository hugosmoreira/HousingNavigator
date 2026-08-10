import { describe, expect, it } from 'vitest';
import {
  buildResourceCurationPlan,
  resourceHtmlToText,
  resourceNeedsCuration,
  resourceSourceUrl,
  type CuratableResource,
  type ResourceExtraction,
} from '../../supabase/functions/_shared/resourceCuration.ts';

function resource(overrides: Partial<CuratableResource> = {}): CuratableResource {
  return {
    id: 'resource-1',
    name: 'Community Housing Program',
    description: null,
    who_qualifies: null,
    who_it_helps: [],
    website: 'https://agency.example/housing',
    source_url: null,
    source_type: null,
    last_verified: null,
    published: true,
    ...overrides,
  };
}

const pageText = [
  'Community Housing Program provides affordable apartments for low-income households.',
  'Applicants must meet the income limits listed for each property.',
  'Housing is available for individuals, families, seniors, and people with disabilities.',
].join('\n');

function extraction(overrides: Partial<ResourceExtraction> = {}): ResourceExtraction {
  return {
    identity_match: true,
    confidence: 0.92,
    identity_evidence: 'Community Housing Program',
    description: {
      value: 'Provides affordable apartments for households with low incomes.',
      evidence:
        'Community Housing Program provides affordable apartments for low-income households.',
    },
    who_qualifies: {
      value: 'Applicants must meet the income limits for the property.',
      evidence: 'Applicants must meet the income limits listed for each property.',
    },
    who_it_helps: {
      value: ['single_adult', 'family', 'senior', 'disability'],
      evidence:
        'Housing is available for individuals, families, seniors, and people with disabilities.',
    },
    ...overrides,
  };
}

describe('resource curation safety contract', () => {
  it('selects only published resources with missing core information', () => {
    expect(resourceNeedsCuration(resource())).toBe(true);
    expect(resourceNeedsCuration(resource({ published: false }))).toBe(false);
    expect(
      resourceNeedsCuration(
        resource({
          description: 'Existing description',
          who_qualifies: 'Existing eligibility',
          who_it_helps: ['family'],
          source_url: 'https://agency.example/housing',
          last_verified: '2026-08-10',
        }),
      ),
    ).toBe(false);
  });

  it('fills blank fields from evidence without replacing curator-written copy', () => {
    const plan = buildResourceCurationPlan(
      resource({ description: 'Keep this description.' }),
      extraction(),
      pageText,
      'https://agency.example/housing',
      '2026-08-10',
    );

    expect(plan.patch).toMatchObject({
      who_qualifies: 'Applicants must meet the income limits for the property.',
      who_it_helps: ['single_adult', 'family', 'senior', 'disability'],
      source_url: 'https://agency.example/housing',
      source_type: 'agency_website',
      last_verified: '2026-08-10',
    });
    expect(plan.patch).not.toHaveProperty('description');
    expect(plan.proposedFields).toHaveProperty('description');
  });

  it('rejects low confidence or invented evidence', () => {
    const lowConfidence = buildResourceCurationPlan(
      resource(),
      extraction({ confidence: 0.5 }),
      pageText,
      'https://agency.example/housing',
      '2026-08-10',
    );
    expect(lowConfidence.patch).toEqual({});

    const inventedEvidence = buildResourceCurationPlan(
      resource(),
      extraction({ identity_evidence: 'A sentence not present on the page' }),
      pageText,
      'https://agency.example/housing',
      '2026-08-10',
    );
    expect(inventedEvidence.patch).toEqual({});
  });

  it('drops unsupported household tags and requires evidence for each generated field', () => {
    const plan = buildResourceCurationPlan(
      resource(),
      extraction({
        description: { value: 'An unsupported description.', evidence: 'not on page' },
        who_it_helps: {
          value: ['family', 'student'],
          evidence: 'Housing is available for individuals, families, seniors, and people with disabilities.',
        },
      }),
      pageText,
      'https://agency.example/housing',
      '2026-08-10',
    );
    expect(plan.patch).not.toHaveProperty('description');
    expect(plan.patch.who_it_helps).toEqual(['family']);
  });

  it('uses the stored source first and removes scripts from fetched HTML', () => {
    expect(
      resourceSourceUrl(
        resource({
          source_url: 'https://official.example/program',
          website: 'https://agency.example',
        }),
      ),
    ).toBe('https://official.example/program');
    expect(resourceHtmlToText('<script>ignore me</script><h1>Useful</h1><p>Housing help</p>'))
      .toBe('Useful\nHousing help');
  });
});
