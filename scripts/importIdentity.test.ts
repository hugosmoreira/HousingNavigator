import { describe, expect, it } from 'vitest';
import {
  assertApplyTarget,
  assertCompatibleIdentity,
  canonicalUrlIdentity,
  cliOption,
  deterministicWaitlistId,
  exactResourceIdentity,
  exactWaitlistIdentity,
  lossyResourceKey,
} from './importIdentity';

describe('import CLI helpers', () => {
  it('reads --flag value and --flag=value', () => {
    expect(cliOption(['--confirm', 'APPLY:ref'], '--confirm')).toBe('APPLY:ref');
    expect(cliOption(['--confirm=APPLY:ref'], '--confirm')).toBe('APPLY:ref');
    expect(cliOption(['--apply'], '--confirm')).toBeUndefined();
  });

  it('does not treat the next flag as a value', () => {
    expect(cliOption(['--expected-project-ref', '--apply'], '--expected-project-ref')).toBeUndefined();
  });

  it('names the offending row when an identity URL is invalid', () => {
    expect(() => canonicalUrlIdentity('not a url', 'waitlists.csv: "VHA"'))
      .toThrow('Invalid identity URL for waitlists.csv: "VHA": not a url');
    expect(() => exactWaitlistIdentity('VHA', null, 'ftp://x.example', 'row 3'))
      .toThrow('http(s) for row 3');
  });
});

describe('privileged import identity guards', () => {
  it('detects dot, slash, and hyphen collisions hidden by resource slugs', () => {
    const firstUrl = 'https://foo-bar.com/a-b';
    const secondUrl = 'https://foo.bar.com/a/b';
    const key = lossyResourceKey('Housing Help', firstUrl);
    expect(lossyResourceKey('Housing Help', secondUrl)).toBe(key);
    expect(() => assertCompatibleIdentity(
      key,
      exactResourceIdentity('Housing Help', firstUrl),
      exactResourceIdentity('Housing Help', secondUrl),
      'first.csv:1',
      'second.csv:1',
    )).toThrow('Ambiguous normalized key');
  });

  it('allows the exact same known resource identity', () => {
    const identity = exactResourceIdentity('Housing Help', 'https://example.com/path');
    expect(() => assertCompatibleIdentity('key', identity, identity, 'live', 'import')).not.toThrow();
  });

  it('detects waitlist URL and truncation collisions', () => {
    const first = deterministicWaitlistId('Authority', 'Program', 'https://foo-bar.com/a-b');
    const second = deterministicWaitlistId('Authority', 'Program', 'https://foo.bar.com/a/b');
    expect(second).toBe(first);
    expect(exactWaitlistIdentity('Authority', 'Program', 'https://foo-bar.com/a-b'))
      .not.toBe(exactWaitlistIdentity('Authority', 'Program', 'https://foo.bar.com/a/b'));

    const longPrefix = 'x'.repeat(230);
    expect(deterministicWaitlistId(longPrefix, 'one', 'https://a.example'))
      .toBe(deterministicWaitlistId(longPrefix, 'two', 'https://b.example'));
  });

  it('requires target-bound confirmation for service-role writes', () => {
    expect(() => assertApplyTarget(
      'https://actual-ref.supabase.co',
      'other-ref',
      'APPLY:other-ref',
    )).toThrow('Target project mismatch');
    expect(() => assertApplyTarget(
      'https://actual-ref.supabase.co',
      'actual-ref',
      undefined,
    )).toThrow('--confirm');
    expect(assertApplyTarget(
      'https://actual-ref.supabase.co',
      'actual-ref',
      'APPLY:actual-ref',
    )).toBe('actual-ref');
  });
});
