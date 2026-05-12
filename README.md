# Housing Navigator

Housing Navigator is a web application focused on the **Portland–Vancouver metro**: a searchable directory of housing-related programs (rent help, shelter, legal aid, vouchers, and more), plus tools to **track waitlists** and **save** programs for later.

The goal is to make it easier for people to find relevant resources without wading through static PDFs or generic 211-style menus—plain-language search, structured program data, and a short **intake-style assessment** that leads to tailored **results** recommendations.

## What you can do in the app

| Area | Description |
|------|-------------|
| **Public directory** | Browse `/resources`, search and filter programs, read details and eligibility-style information. |
| **Waitlists** | Explore published waitlists at `/waitlist` and follow ones that matter to you (when signed in). |
| **Assessment → results** | Complete `/assessment` (situation, household, county) and view suggested matches on `/results`. |
| **Account dashboard** | After sign-up/login (`/signup`, `/login`), use `/dashboard` for **saved resources**, **waitlist alerts** (openings and status changes), and **email notification** preferences. |
| **Admin CMS** | Staff with access use `/admin` (separate Supabase-backed login) to create and edit **resources** and **waitlists** in the catalog. |

Static content pages include mission, help, privacy, terms, accessibility, and a staff-oriented area (`/staff`).

## How data is loaded

- **Default:** The app can run from a **bundled catalog** (JSON built into the repo via `npm run catalog:build`).
- **Production-style:** Set `VITE_USE_SUPABASE=true` with Supabase URL and anon key to read published `resources` and `waitlists` from Postgres with **row-level security**. See [supabase/README.md](supabase/README.md) for schema, migrations, importing the catalog, and creating the first admin user.

## Tech stack

- **Frontend:** React 19, Vite 6, React Router 7, Tailwind CSS 4  
- **Backend (optional):** Supabase (Auth, Postgres, RLS) for users, saved items, waitlist follows, and admin content  
- **Optional AI:** Google Gemini API (`GEMINI_API_KEY`) where the codebase uses generative features  

## Scripts

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run dev` | Dev server (port **3000**; runs `catalog:build` first) |
| `npm run build` | Production build |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm test` | Run Vitest unit tests |
| `npm run catalog:build` | Merge `src/data` JSON into the bundled catalog |
| `npm run import:supabase` | Import catalog into Supabase (requires service role key; see `supabase/README.md`) |

## Run locally

**Prerequisites:** Node.js

1. `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and set at least:
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` if you use Supabase for auth or live data  
   - `VITE_USE_SUPABASE=true` only when pointing at a configured Supabase project  
   - `GEMINI_API_KEY` only if you use Gemini-powered features  
3. `npm run dev`

For a full Supabase setup (migrations, seed, first admin), follow **[supabase/README.md](supabase/README.md)**.
