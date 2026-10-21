import { describe, expect, it } from 'vitest';
import { sourceTypeLabel } from './ResourceDetailView';

describe('sourceTypeLabel', () => {
  it('turns internal source-type codes into public wording', () => {
    expect(sourceTypeLabel('agency_website')).toBe('Provider website');
    expect(sourceTypeLabel('manual_entry')).toBe('Entered by Housing Navigator');
  });

  it('keeps readable labels that curated records already use', () => {
    expect(sourceTypeLabel('Official nonprofit website')).toBe('Official nonprofit website');
  });

  it('falls back to "Provider website" when no source type is stored', () => {
    expect(sourceTypeLabel(null)).toBe('Provider website');
    expect(sourceTypeLabel('   ')).toBe('Provider website');
  });
});
