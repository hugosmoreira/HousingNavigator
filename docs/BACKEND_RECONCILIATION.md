# Backend source reconciliation — September 19, 2026

## Scope

Restore the already-deployed waitlist backend into the repository, based on
production Git `28e281edaebd479ad18e56ed822db3674fab6355`. No public interface,
catalog content, schedules, secrets or database migrations change. No live
function invocation, email send or deployment is part of this change.

Production downloads and a subsequent read-only function-list check identified:

| Function | Deployed version | Gateway JWT verification |
|---|---:|---|
| check-waitlist-status | 4 | false; handler validates internal secret or admin JWT |
| send-waitlist-alert | 9 | false; handler validates internal secret or admin JWT |
| unsubscribe-alerts | 3 | false; narrowly scoped token authorizes POST |

These sources were ahead of Git. Reconcile them before deploying from Git so
an ordinary release cannot accidentally restore the older implementations.

## Preserved behavior

- Checker uses the existing shared public-destination policy on initial fetches
  and every redirect, with a streamed response-byte limit and timeout.
- Known-status classifications require a matching normalized source quote.
  Evidence provenance is stored in both check logs and suggestions. An unknown
  prediction may still confirm an already-unknown record under existing rules.
- Status changes remain suggestions for human approval. The checker itself
  changes only scheduling/freshness/health fields, not published status.
- Null source URL falls back to the application URL. A non-null invalid source
  fails closed instead of silently checking a different destination.
- Admin nudges have one visible recipient per request; one failed delivery does
  not prevent attempts to the remaining recipients.
- Real administrator-triggered sends claim quota atomically. Internal calls and
  dry runs retain their existing exemption; actual delivery still uses dedupe,
  published-record filtering and subscriber preferences.
- Unsubscribe GET is read-only. POST combines opt-out with token replacement in
  one update matched by the old token. Known, unknown and consumed tokens have
  the same response. The deployed human confirmation POST returns an empty 200;
  changing that experience is outside this source-parity change.

Migration `0023_security_fix_handoff.sql` already supplies evidence columns,
the service-role-only quota RPC and re-enable token rotation. There is no new
migration. Shared `checkerSecurity.ts` and `waitlistTransitions.ts` already
matched production and must not be replaced with older copies.

## Source receipt

SHA-256 of UTF-8 source after CRLF-to-LF normalization; no other whitespace is
removed. These are source hashes, not the Supabase deployment bundle hashes.

| Repository path | SHA-256 |
|---|---|
| supabase/functions/check-waitlist-status/index.ts | e102bfbf1571bd206c031600c47eaf1d8cb22eb75cd7828b0291b7f7d26d1eef |
| supabase/functions/send-waitlist-alert/index.ts | dbab2a847ed37f2945bcc98c9204623f3c602be90325a61e623aba8764d54ce5 |
| supabase/functions/unsubscribe-alerts/index.ts | 1a0a07811bd85334a6cc2017a3bc4cb2685194a1529a46608536c8fed5535535 |
| supabase/functions/_shared/unsubscribePolicy.ts | 1d90f74e80220d5bae567c3e844a5fadcdd09c2bdec90ae4e235017276e2db9f |
| supabase/functions/_shared/checkerSecurity.ts | ea8430f4732df08fcc87956457aa892804bc1b99701d517f6a229b3a83dc4b0a |
| supabase/functions/_shared/waitlistTransitions.ts | 21099dbd1fcc9367cac2bc9917c3352da664689c46f892bedff7bacccb0673a4 |

## Verification and future releases

Completed local verification:

- Before reconciliation, the first 49 handler cases produced 28 failures and
  21 passes against the old Git implementations. Failures included direct and
  redirected private fetches, streamed oversize handling, fabricated evidence,
  atomic quota use, read-only unsubscribe GET and token replay.
- After reconciliation, all 51 handler cases and 8 existing helper tests passed.
- `npm run check` passed: TypeScript, 485 tests in 34 files, all 37 isolated
  PostgreSQL checks (including 15 new checks of migration 0023), client/SSR
  builds, prerender and all four bundle budgets.
- All six source-receipt hashes match the downloaded deployment after newline
  normalization. The two existing shared helpers remain unchanged.
- `git diff --check` passed. The credential-free build generated its local
  fixture catalog; that generated change was removed from the patch. Catalog
  content and the dependency lockfile are unchanged.
- One fresh, read-only bypass/regression review found no actionable issues in
  the candidate change. It covered relevant callers and migration boundaries;
  the reviewer did not execute tests or contact production.

Run `npm run check` without live credentials. Handler regression tests execute
the actual entrypoint source and shared helpers with isolated SDK, DNS, HTTP and
database boundaries. They do not contact providers, Anthropic, Resend or
Supabase. Separate isolated PostgreSQL tests exercise the actual migration.

Before a future backend deployment:

1. Confirm the intended project and read the live function versions.
2. Download live source into a separate temporary directory, never over the
   working tree. Compare handlers **and** their shared imports with Git.
3. Resolve any unexplained difference; never assume Git is newer.
4. Run the full checks, inspect the diff and verify prerequisite migrations.
5. Deploy only the reviewed functions, preserving their handler-authenticated
   gateway settings, when deployment is explicitly authorized. Record the Git
   revision and resulting function versions. Do not run the checker or send
   endpoint merely to smoke-test a release against production.

Limitations: mocked handler execution is not hosted Deno integration testing.
Single-instance PGlite is not proof of concurrent hosted PostgreSQL behavior.
The shared DNS validation-to-connection gap and legacy seed SQL quoting finding
remain separate audit items; this reconciliation does not claim to fix them.
