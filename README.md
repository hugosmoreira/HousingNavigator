<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Housing Navigator

Housing Navigator is a React + Vite web app that helps people discover housing programs and community resources. Users can sign in, save resources, follow waitlists, and manage notification preferences. An authenticated **admin** area (Supabase-backed) is used to curate the resource catalog.

**Stack:** React 19, Vite 6, Tailwind CSS 4, Supabase (auth, Postgres, RLS), and optional Gemini features for AI-assisted workflows.

## Run locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and set:
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for auth and user data
   - `GEMINI_API_KEY` if you use Gemini-powered features
3. Run the dev server: `npm run dev` (serves on port 3000 by default)

Optional: apply Supabase migrations from `supabase/migrations/` to your project when wiring a new backend.

**Original AI Studio reference:** https://ai.studio/apps/c3bc2668-0cdc-4946-8498-e44a4628bd4a
