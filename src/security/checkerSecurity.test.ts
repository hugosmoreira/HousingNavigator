import { describe, expect, it, vi } from 'vitest';
import {
  buildAdminNudgePayloads,
  fetchPublicHttpText,
  verifyEvidenceQuote,
} from '../../supabase/functions/_shared/checkerSecurity.ts';

const publicDns = vi.fn(async (_hostname: string, type: 'A' | 'AAAA') =>
  type === 'A' ? ['8.8.8.8'] : [],
);

describe('checker outbound HTTP policy', () => {
  it('blocks direct private and loopback URLs before fetch', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchPublicHttpText('http://127.0.0.1/admin', { fetchImpl, resolveDns: publicDns }))
      .rejects.toThrow('private or local');
    await expect(fetchPublicHttpText('http://169.254.169.254/latest/meta-data', { fetchImpl, resolveDns: publicDns }))
      .rejects.toThrow('private or local');
    await expect(fetchPublicHttpText('http://[::ffff:127.0.0.1]/admin', { fetchImpl, resolveDns: publicDns }))
      .rejects.toThrow('private or local');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('blocks hostnames that resolve to a private address before fetch', async () => {
    const fetchImpl = vi.fn();
    const privateDns = vi.fn(async (_hostname: string, type: 'A' | 'AAAA') =>
      type === 'A' ? ['10.20.30.40'] : [],
    );
    await expect(fetchPublicHttpText('https://internal.example/status', {
      fetchImpl,
      resolveDns: privateDns,
    })).rejects.toThrow('resolves to a private or local address');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('revalidates every redirect before the next fetch', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://10.0.0.4/private' } }),
    );
    await expect(fetchPublicHttpText('https://example.com/start', { fetchImpl, resolveDns: publicDns }))
      .rejects.toThrow('private or local');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('allows a normal public response and caps chunked bodies while streaming', async () => {
    const okFetch = vi.fn().mockResolvedValue(new Response('public page'));
    await expect(fetchPublicHttpText('https://example.com/status', {
      fetchImpl: okFetch,
      resolveDns: publicDns,
      maxBytes: 32,
    })).resolves.toMatchObject({ text: 'public page' });

    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(20));
        controller.enqueue(new Uint8Array(20));
        controller.close();
      },
    });
    const largeFetch = vi.fn().mockResolvedValue(new Response(oversized));
    await expect(fetchPublicHttpText('https://example.com/large', {
      fetchImpl: largeFetch,
      resolveDns: publicDns,
      maxBytes: 32,
    })).rejects.toThrow('page too large');
  });

  it('rejects declared oversize responses before reading and bounds concurrent bodies', async () => {
    const declaredFetch = vi.fn().mockResolvedValue(
      new Response('small', { headers: { 'content-length': '999' } }),
    );
    await expect(fetchPublicHttpText('https://example.com/declared', {
      fetchImpl: declaredFetch,
      resolveDns: publicDns,
      maxBytes: 32,
    })).rejects.toThrow('page too large');

    const makeOversizedResponse = () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(20));
        controller.enqueue(new Uint8Array(20));
        controller.close();
      },
    }));
    const concurrentFetch = vi.fn(async () => makeOversizedResponse());
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () => fetchPublicHttpText('https://example.com/large', {
        fetchImpl: concurrentFetch,
        resolveDns: publicDns,
        maxBytes: 32,
      })),
    );
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
  });

  it('stops an excessive redirect chain', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: '/again' } }),
    );
    await expect(fetchPublicHttpText('https://example.com/start', {
      fetchImpl,
      resolveDns: publicDns,
      maxRedirects: 2,
    })).rejects.toThrow('too many redirects');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('checker evidence and admin mail policy', () => {
  it('accepts only normalized quotes present in page text', () => {
    expect(verifyEvidenceQuote('Applications are NOW   OPEN through Friday.', 'applications are now open'))
      .toBe('applications are now open');
    expect(verifyEvidenceQuote('Applications are closed.', 'Applications are open.')).toBeNull();
  });

  it('creates one visible recipient per admin message', () => {
    const payloads = buildAdminNudgePayloads(['a@example.com', 'b@example.com'], { subject: 'Review' });
    expect(payloads).toEqual([
      { subject: 'Review', to: 'a@example.com' },
      { subject: 'Review', to: 'b@example.com' },
    ]);
  });
});
