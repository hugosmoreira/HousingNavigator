/**
 * One download per basemap tile URL at a time.
 *
 * MapLibre loads a tile from the source's top zoom once for every overscaled
 * zoom it is drawn at, and again for each fallback parent while a sharper copy
 * loads. At a steep pitch the same downtown tile was requested up to a dozen
 * times at once, and the browser downloaded every copy: about a third of the
 * bytes in the desktop intro. Tile URLs are rewritten to a custom protocol so
 * requests for a URL already in flight share its download. Later repeats go
 * out as normal requests and are answered by the HTTP cache.
 */

export const SHARED_TILE_PROTOCOL = 'hn-tile';
const PREFIX = `${SHARED_TILE_PROTOCOL}://`;

/** Rewrite an https tile URL so MapLibre routes it through the shared loader. */
export function toSharedTileUrl(url: string): string {
  return url.startsWith('https://') ? PREFIX + url.slice('https://'.length) : url;
}

/** The fields of MapLibre's GetResourceResponse that a tile load fills in. */
export interface TileResponse {
  data: ArrayBuffer;
  cacheControl?: string | null;
  expires?: string | null;
  etag?: string;
}

interface Download {
  result: Promise<TileResponse>;
  controller: AbortController;
  waiters: number;
}

/**
 * Build a MapLibre protocol handler. `httpError` turns a failed response into
 * the error MapLibre expects (an AJAXError, whose status lets it treat a 404
 * as an empty tile rather than a failure).
 */
export function createSharedTileLoader(
  fetchTile: (url: string, signal: AbortSignal) => Promise<Response>,
  httpError: (response: Response, url: string, body: Blob) => Error,
) {
  const downloads = new Map<string, Download>();

  function start(url: string): Download {
    const controller = new AbortController();
    const download: Download = {
      controller,
      waiters: 0,
      result: fetchTile(url, controller.signal).then(async (response) => {
        if (!response.ok) throw httpError(response, url, await response.blob());
        return {
          data: await response.arrayBuffer(),
          cacheControl: response.headers.get('Cache-Control'),
          expires: response.headers.get('Expires'),
          etag: response.headers.get('ETag') ?? undefined,
        };
      }),
    };
    downloads.set(url, download);
    const forget = () => {
      if (downloads.get(url) === download) downloads.delete(url);
    };
    download.result.then(forget, forget);
    return download;
  }

  return function loadSharedTile(
    request: { url: string },
    abortController: AbortController,
  ): Promise<TileResponse> {
    const url = `https://${request.url.slice(PREFIX.length)}`;
    const download = downloads.get(url) ?? start(url);
    download.waiters += 1;
    const signal = abortController.signal;

    return new Promise((resolve, reject) => {
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        download.waiters -= 1;
        // Stop the download only when no other copy of the tile still wants it.
        if (download.waiters === 0 && downloads.get(url) === download) {
          downloads.delete(url);
          download.controller.abort();
        }
        reject(new DOMException('Tile request aborted', 'AbortError'));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      download.result.then(
        (tile) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          // MapLibre transfers the buffer to its worker, which detaches it, so
          // every waiter gets a copy of its own.
          resolve({ ...tile, data: tile.data.slice(0) });
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  };
}
