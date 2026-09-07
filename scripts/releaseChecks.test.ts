import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const workflow = read('.github/workflows/quality-checks.yml');
const netlify = read('netlify.toml');

describe('release-check configuration', () => {
  it('runs every verification stage before the build and stops on failure', () => {
    expect(pkg.scripts.check.split(' && ')).toEqual([
      'npm run lint', 'npm test', 'npm run test:database', 'npm run build',
    ]);
    expect(pkg.scripts['test:database'].split(' && ')).toEqual([
      'node scripts/testResourceSourceDatabase.mjs',
      'node scripts/testResourcePublicationDatabase.mjs',
    ]);
  });

  it('runs the same gate in PR checks and Netlify builds', () => {
    expect(workflow).toContain('run: npm run check');
    expect(netlify).toMatch(/command\s*=\s*"npm run check"/);
    expect(workflow).toContain('run: npm ci --no-audit --no-fund');
  });

  it('keeps supported Node versions aligned', () => {
    const major = read('.nvmrc').trim();
    expect(major).toBe('22');
    expect(pkg.engines.node).toBe(major + '.x');
    expect(netlify).toContain('NODE_VERSION = "' + major + '"');
    expect(workflow).toContain('node-version-file: .nvmrc');
    expect(read('.github/workflows/indexnow.yml')).toContain('node-version-file: .nvmrc');
  });

  it('uses a pinned root development dependency for both database suites', () => {
    const version = pkg.devDependencies['@electric-sql/pglite'];
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies).not.toHaveProperty('@electric-sql/pglite');
    expect(lock.packages['node_modules/@electric-sql/pglite'].version).toBe(version);
    expect(lock.packages['node_modules/@electric-sql/pglite'].dev).toBe(true);
    for (const file of ['testResourceSourceDatabase.mjs', 'testResourcePublicationDatabase.mjs']) {
      const source = read('scripts/' + file);
      expect(source).toContain("from '@electric-sql/pglite'");
      expect(source).not.toContain('tmp/source-check-tests/node_modules');
    }
  });

  it('keeps PR checks read-only and separate from live credentials and refreshes', () => {
    expect(workflow).toMatch(/^  pull_request:$/m);
    expect(workflow).toMatch(/^  merge_group:$/m);
    expect(workflow).toMatch(/^  contents: read$/m);
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).not.toMatch(/pull_request_target|secrets\.|SUPABASE_SERVICE_ROLE_KEY|BUILD_HOOK/);
    expect(workflow).toContain("VITE_USE_SUPABASE: 'false'");
    expect(workflow).toContain("VITE_SUPABASE_URL: ''");
    expect(workflow).toContain("VITE_SUPABASE_ANON_KEY: ''");
    expect(workflow).toContain('timeout-minutes: 15');
    const actions = [...workflow.matchAll(/uses: ([^\s]+)@([^\s]+)/g)];
    expect(actions).toHaveLength(2);
    for (const [, , revision] of actions) expect(revision).toMatch(/^[a-f0-9]{40}$/);
  });
});
