# Housing Navigator — Supabase backend

Schema, seed data, migrations, and operational notes for the Supabase
project that powers Housing Navigator.

## Layout

```
supabase/
├── migrations/
│   ├── 0001_init.sql                    # programs (legacy), decision_rules, waitlists, resource_submissions
│   ├── 0002_admin_catalog.sql           # resources, waitlists extensions, admin_users, RLS
│   └── 0003_admin_users_policy_fix.sql # only needed if DB ran an older 0002 (recursive policy)
├── seed.sql                   # generated from src/data/*.json (do not hand-edit)
└── README.md
```

## First-time setup

1. Create a Supabase project, grab the URL + anon key + service-role key.
2. Apply schema migrations **in order** (`0001` → `0002`, then `0003` only if applicable):

   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```

   From the Dashboard **SQL** tab: run the full **`0001_init.sql`**, then the full **`0002_admin_catalog.sql`**.
   If Supabase reports `relation "public.admin_users" does not exist` when you run `0003`,
   **`0002` was skipped** — run `0002` first (that file creates `admin_users`).

3. Add the public-side env vars to `.env`:

   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   VITE_USE_SUPABASE=true
   ```

4. Import the bundled catalog into Supabase using the service-role key.
   The key must NOT use a `VITE_` prefix — it stays server-side:

   ```bash
   SUPABASE_URL=https://<project>.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
   npm run import:supabase
   ```

   Pass `--dry` to preview without writing, or `--reset` to clear the
   `resources` table first.

## Creating the first admin

The admin CMS at `/admin` is gated by `public.admin_users`. Add your
account once it exists in Supabase Auth:

1. In the Supabase dashboard, go to **Authentication → Users → Add user**
   and create the admin email + password.
2. Copy the new user's UUID (visible on the user detail page).
3. Promote the user in the SQL editor:

   ```sql
   insert into public.admin_users (user_id) values ('<paste uuid>');
   ```

4. Visit `/admin/login` and sign in with the email + password.

To revoke admin access, `delete from public.admin_users where user_id = '<uuid>';`
(the auth user remains and can be removed separately).

## Admin dashboard user management

Migration `0018_admin_user_management.sql` and the `admin-users` Edge Function
power `/admin/users`. The browser sends the signed-in administrator JWT; the
function verifies both the token and `admin_users` membership before using the
server-only Auth Admin API. Never put the service-role or secret key in a
`VITE_` environment variable.

```bash
supabase db push
supabase functions deploy admin-users --no-verify-jwt
```

Successful invitations, blocks, unblocks, and deletions are recorded in
`admin_user_actions`. Administrator accounts are protected from block/delete
operations in this interface.

## Row level security

Policies live in `migrations/0002_admin_catalog.sql`:

- `resources` and `waitlists`: `anon` and `authenticated` can `SELECT`
  rows where `published = true`. Admins (rows in `admin_users`) get full
  read/write across all rows.
- `admin_users`: each authenticated user may `SELECT` only their own row
  (`user_id = auth.uid()`). Promote admins by inserting UUIDs via SQL /
  Dashboard.
- `decision_rules`: world-readable per `0001_init.sql` (rules feed the
  recommendation engine and are not editable from the CMS yet).
- `resource_submissions`: service-role only. Reserved for future AI
  ingestion.

`is_admin()` is a `security definer` helper used by every admin policy
so RLS checks against `admin_users` cannot recurse.

## Statewide resource service areas

Migration `0019_resource_service_areas.sql` adds normalized, multi-county
coverage for Oregon and Washington resources. It backfills the existing
catalog, keeps the legacy primary `state`/`county` fields compatible, and adds
the aggregated `service_areas` field to `resources_public` and
`resources_admin`.

Administrators replace a resource's complete area list through the validated
`replace_resource_service_areas` RPC. Public callers can read areas only for
published resources; all area mutations remain admin-only. See
[`docs/RESOURCE_SERVICE_AREAS.md`](../docs/RESOURCE_SERVICE_AREAS.md).

## Re-running the static seed (optional)

The legacy `programs` table still exists. If you want to keep it in
sync with the bundled JSON for ad-hoc queries:

```bash
npm run seed:generate
psql "$DATABASE_URL" -f supabase/seed.sql
```

The application no longer reads this table — `supabaseDataService`
points at `resources`.

## Automated waitlist status checking (migration 0012)

Migration `0012_auto_status_checks.sql` + the `check-waitlist-status`
Edge Function re-verify each published waitlist against its own
`source_url` about once a day, in **suggest mode**: detected status
changes wait in `/admin/review` and nothing is published (and no
subscriber is emailed) until an admin approves. Approval reuses the
existing alert pipeline from `0009`/`0010` unchanged.

One-time setup after applying the migration:

```bash
# 1. Deploy the checker (no JWT verify: cron authenticates via shared secret)
supabase functions deploy check-waitlist-status --no-verify-jwt

# 2. Function secrets. INTERNAL_TRIGGER_SECRET must equal the Vault value
#    created for 0009. CLAUDE_MODEL is optional (default claude-opus-4-8;
#    claude-haiku-4-5 is a ~5x cheaper option for this classification task).
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set CLAUDE_MODEL=claude-opus-4-8

# 3. Vault: tell the cron function where the checker lives (SQL editor):
#    select vault.create_secret(
#      'https://<project-ref>.supabase.co/functions/v1/check-waitlist-status',
#      'internal_check_fn_url',
#      'destination for the scheduled waitlist status checker');
```

Operational notes:

- The cron job (`check-waitlist-status`, every 15 min) only processes
  rows whose last attempt is older than ~20 h, oldest first, in batches
  of `CHECK_BATCH_SIZE` (default 10) — so a tick with nothing due is a
  single cheap SELECT.
- `waitlists.auto_check_enabled` opts a row out; `check_failures >= 3`
  shows an "URL check failing" hint in the admin list.
- Pages that render client-side (RentCafe-style portals) log
  `insufficient_content` and appear under "Check health" on
  `/admin/review` — those still need a manual look.
- "Run checker now" on `/admin/review` invokes the function with the
  admin's JWT for an immediate batch — handy for testing end to end.
