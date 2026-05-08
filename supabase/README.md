# Housing Navigator — Supabase backend

This folder holds the schema, seed data, and migration history for the
Housing Navigator backend. It is **scaffolding only**: nothing in `src/`
talks to Supabase yet (the live data adapter is `staticDataService`).

## Layout

```
supabase/
├── migrations/
│   └── 0001_init.sql      # programs, decision_rules, waitlists, resource_submissions
├── seed.sql               # generated from src/data/*.json (do not hand-edit)
└── README.md
```

## Bringing up a project

1. Create a Supabase project, grab the URL + anon key.
2. Apply the schema:

   ```bash
   supabase link --project-ref <ref>
   supabase db push          # runs migrations/
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```

3. Add the credentials to `.env.local`:

   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```

4. Install the client and switch the adapter:

   ```bash
   npm install @supabase/supabase-js
   ```

   Then in `src/services/data/index.ts`:

   ```ts
   import { supabaseDataService } from './supabaseDataService';
   export const dataService = supabaseDataService;
   ```

   Uncomment the implementation in
   [`src/services/data/supabaseDataService.ts`](../src/services/data/supabaseDataService.ts).
   The mappers in `mappers.ts` already translate DB row shapes into the
   UI-facing `Program` / `WaitlistEntry` types, so nothing in `src/pages`
   needs to change.

## Regenerating the seed

Whenever `src/data/*.json` changes, regenerate:

```bash
npm run seed:generate
```

The `ON CONFLICT` clauses in `seed.sql` make it safe to run repeatedly
against an existing database.

## Row level security

`programs`, `decision_rules`, and `waitlists` are world-readable through
the `anon` role — the public site needs no authentication for MVP.
`resource_submissions` is service-role only; admin tooling will use the
service key from a backend, not the browser.
