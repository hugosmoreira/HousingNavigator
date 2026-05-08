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

## Re-running the static seed (optional)

The legacy `programs` table still exists. If you want to keep it in
sync with the bundled JSON for ad-hoc queries:

```bash
npm run seed:generate
psql "$DATABASE_URL" -f supabase/seed.sql
```

The application no longer reads this table — `supabaseDataService`
points at `resources`.
