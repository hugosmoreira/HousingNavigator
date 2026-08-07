export interface ViteManifestChunk {
  file: string;
  src?: string;
  isEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
}

export type ViteManifest = Record<string, ViteManifestChunk>;

export interface InitialAssets {
  entryKey: string;
  javascript: string[];
  css: string[];
}

/**
 * Return only the entry and its synchronous imports. Dynamic imports are
 * intentionally excluded because they do not block the first public render.
 */
export function collectInitialAssets(manifest: ViteManifest): InitialAssets {
  const entry = Object.entries(manifest).find(([, chunk]) => chunk.isEntry);
  if (!entry) throw new Error('Vite manifest does not contain an entry chunk.');

  const [entryKey] = entry;
  const visited = new Set<string>();
  const javascript = new Set<string>();
  const css = new Set<string>();

  function visit(key: string) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Vite manifest references a missing chunk: ${key}`);
    if (chunk.file.endsWith('.js')) javascript.add(chunk.file);
    for (const stylesheet of chunk.css ?? []) css.add(stylesheet);
    for (const imported of chunk.imports ?? []) visit(imported);
  }

  visit(entryKey);
  return {
    entryKey,
    javascript: [...javascript].sort(),
    css: [...css].sort(),
  };
}
