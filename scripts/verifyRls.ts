/**
 * RLS / grant regression runner — `npm run verify:rls`
 *
 * Executes scripts/verifyRls.sql against the hosted Supabase project via
 * the Management API (the SQL needs the `postgres` role to simulate the
 * `anon`/`authenticated` PostgREST roles; the anon/service API keys can't
 * do that). Exits non-zero if any check FAILs, so it can gate CI later.
 *
 * Auth: set SUPABASE_ACCESS_TOKEN to a personal access token
 * (https://supabase.com/dashboard/account/tokens — same token the CLI
 * stores after `supabase login`). Never commit it; it is read from the
 * environment only.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx npm run verify:rls
 *
 * Optional: SUPABASE_PROJECT_REF overrides the default project.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'tlazsywswoapcrzxbqnu';

async function main(): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error(
      'SUPABASE_ACCESS_TOKEN is not set.\n' +
        'Create a personal access token at https://supabase.com/dashboard/account/tokens\n' +
        'then run:  SUPABASE_ACCESS_TOKEN=sbp_... npm run verify:rls',
    );
    process.exit(2);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(here, 'verifyRls.sql'), 'utf8');

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ query: sql }),
    },
  );

  if (!res.ok) {
    console.error(`Management API error ${res.status}: ${await res.text()}`);
    process.exit(2);
  }

  const rows = (await res.json()) as Array<{ test: string; outcome: string }>;
  let failures = 0;
  for (const row of rows) {
    const ok = row.outcome.startsWith('PASS');
    if (!ok) failures += 1;
    console.log(`${ok ? '  ok ' : 'FAIL '} ${row.test.padEnd(48)} ${row.outcome}`);
  }

  console.log(`\n${rows.length - failures}/${rows.length} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
