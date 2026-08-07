import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { collectInitialAssets, type ViteManifest } from './bundleBudget';

const distDir = resolve('dist');
const manifestPath = join(distDir, '.vite', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ViteManifest;
const initial = collectInitialAssets(manifest);

const budgets = {
  // Roughly half the former 706 KiB / 185 KiB entry, with enough headroom
  // for minor minifier/hash variance while keeping regressions visible.
  initialJavascriptRaw: 280 * 1024,
  initialJavascriptGzip: 90 * 1024,
  initialCssGzip: 12 * 1024,
  largestDeferredJavascriptRaw: 225 * 1024,
} as const;

function bytesFor(file: string): number {
  return statSync(join(distDir, file)).size;
}

function gzipBytesFor(file: string): number {
  return gzipSync(readFileSync(join(distDir, file))).byteLength;
}

function sum(files: string[], measure: (file: string) => number): number {
  return files.reduce((total, file) => total + measure(file), 0);
}

function kib(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

const initialJavascriptRaw = sum(initial.javascript, bytesFor);
const initialJavascriptGzip = sum(initial.javascript, gzipBytesFor);
const initialCssGzip = sum(initial.css, gzipBytesFor);
const initialSet = new Set(initial.javascript);
const deferredJavascript = [
  ...new Set(
    Object.values(manifest)
      .map((chunk) => chunk.file)
      .filter((file) => file.endsWith('.js') && !initialSet.has(file)),
  ),
];
const largestDeferredJavascriptRaw = deferredJavascript.reduce(
  (largest, file) => Math.max(largest, bytesFor(file)),
  0,
);

const checks = [
  {
    label: 'Initial JavaScript (raw)',
    actual: initialJavascriptRaw,
    budget: budgets.initialJavascriptRaw,
  },
  {
    label: 'Initial JavaScript (gzip)',
    actual: initialJavascriptGzip,
    budget: budgets.initialJavascriptGzip,
  },
  {
    label: 'Initial CSS (gzip)',
    actual: initialCssGzip,
    budget: budgets.initialCssGzip,
  },
  {
    label: 'Largest deferred JavaScript chunk (raw)',
    actual: largestDeferredJavascriptRaw,
    budget: budgets.largestDeferredJavascriptRaw,
  },
];

for (const check of checks) {
  const status = check.actual <= check.budget ? 'PASS' : 'FAIL';
  console.log(
    `${status} ${check.label}: ${kib(check.actual)} / ${kib(check.budget)}`,
  );
}

const failures = checks.filter((check) => check.actual > check.budget);
if (failures.length > 0) {
  throw new Error(
    `Bundle budget exceeded: ${failures.map((failure) => failure.label).join(', ')}`,
  );
}
