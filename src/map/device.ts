/** Browser capability checks that must not load the map engine. */

/** MapLibre 6 requires WebGL2. */
export function supportsWebGL2(): boolean {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

/**
 * Phones and small laptops with little memory, few cores or Data Saver on get
 * a lighter map: no intro flight, no antialiasing and a lower pixel ratio.
 */
export function isLowPowerDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  if (nav.connection?.saveData) return true;
  const memory = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  return memory <= 2 || cores <= 2 || (memory <= 4 && cores <= 4);
}
