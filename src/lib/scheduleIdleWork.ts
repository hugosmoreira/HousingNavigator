export interface IdleWorkOptions {
  timeout?: number;
  fallbackDelay?: number;
}

/**
 * Defer non-critical network/module work until the browser is idle, with a
 * bounded fallback for browsers that do not implement requestIdleCallback.
 */
export function scheduleIdleWork(
  callback: () => void,
  { timeout = 1_500, fallbackDelay = 400 }: IdleWorkOptions = {},
): () => void {
  if (typeof window === 'undefined') return () => {};

  const idleWindow = window as Window & {
    requestIdleCallback?: (
      idleCallback: () => void,
      options?: { timeout: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, fallbackDelay);
  return () => window.clearTimeout(handle);
}
