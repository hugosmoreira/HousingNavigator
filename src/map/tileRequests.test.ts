import { describe, expect, it } from 'vitest';
import { createSharedTileLoader, toSharedTileUrl } from './tileRequests';

const TILE = 'https://tiles.example.org/planet/14/2608/5860.pbf';

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

/** A fetch whose responses the test releases by hand. */
function controlledFetch() {
  const calls: Array<{ url: string; signal: AbortSignal; respond: (response: Response) => void }> = [];
  const fetchTile = (url: string, signal: AbortSignal) =>
    new Promise<Response>((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      calls.push({ url, signal, respond: resolve });
    });
  return { calls, fetchTile };
}

function setup() {
  const network = controlledFetch();
  const load = createSharedTileLoader(network.fetchTile, (response) => new HttpError(response.status));
  return { ...network, load };
}

const request = () => ({ url: toSharedTileUrl(TILE) });

describe('shared tile loader', () => {
  it('routes only https tile URLs through the protocol', () => {
    expect(toSharedTileUrl(TILE)).toBe('hn-tile://tiles.example.org/planet/14/2608/5860.pbf');
    expect(toSharedTileUrl('http://localhost/tile.pbf')).toBe('http://localhost/tile.pbf');
  });

  it('downloads a tile once for every copy requested while it is in flight', async () => {
    const { calls, load } = setup();
    const copies = [load(request(), new AbortController()), load(request(), new AbortController())];
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(TILE);

    calls[0].respond(new Response(new Uint8Array([1, 2, 3]), { headers: { 'Cache-Control': 'max-age=60', ETag: 'v1' } }));
    const [first, second] = await Promise.all(copies);
    expect([...new Uint8Array(first.data)]).toEqual([1, 2, 3]);
    expect([...new Uint8Array(second.data)]).toEqual([1, 2, 3]);
    // Each copy gets its own buffer, because MapLibre transfers (detaches) it.
    expect(first.data).not.toBe(second.data);
    expect(first.cacheControl).toBe('max-age=60');
    expect(first.etag).toBe('v1');
  });

  it('starts a new request once the earlier download has finished', async () => {
    const { calls, load } = setup();
    const first = load(request(), new AbortController());
    calls[0].respond(new Response(new Uint8Array([1])));
    await first;
    void load(request(), new AbortController());
    expect(calls).toHaveLength(2);
  });

  it('keeps downloading while any copy still wants the tile', async () => {
    const { calls, load } = setup();
    const leaving = new AbortController();
    const left = load(request(), leaving);
    const staying = load(request(), new AbortController());
    leaving.abort();
    await expect(left).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls[0].signal.aborted).toBe(false);

    calls[0].respond(new Response(new Uint8Array([7])));
    expect([...new Uint8Array((await staying).data)]).toEqual([7]);
  });

  it('cancels the download when every copy is aborted', async () => {
    const { calls, load } = setup();
    const a = new AbortController();
    const b = new AbortController();
    const copies = [load(request(), a), load(request(), b)];
    a.abort();
    b.abort();
    await Promise.allSettled(copies);
    expect(calls[0].signal.aborted).toBe(true);
    // The cancelled download is forgotten; the next request starts afresh.
    void load(request(), new AbortController());
    expect(calls).toHaveLength(2);
  });

  it('passes HTTP failures to every copy with their status', async () => {
    const { calls, load } = setup();
    const copies = [load(request(), new AbortController()), load(request(), new AbortController())];
    calls[0].respond(new Response('missing', { status: 404 }));
    for (const copy of copies) await expect(copy).rejects.toMatchObject({ status: 404 });
  });
});
