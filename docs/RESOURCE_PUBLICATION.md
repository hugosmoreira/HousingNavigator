# Resource publication

The Resources editor now requests a public website rebuild after saving a
published resource, publishing a draft, unpublishing, or deleting a published
resource. Creating/editing an unpublished draft does not request a build.
No source crawling, scheduled task, automated discovery or publication decision
was added. Existing published resources are rebuilt; unrelated drafts remain hidden.

## Admin workflow

Before saving/publishing, **Preview resource** in the resource editor opens an
admin-only dialog with **Directory card** and **Detail page** views. It uses the
same `DirectoryCardView` and `ResourceDetailView` components as the public site,
with the current editor values (including unsaved changes). Preview is not a
save or publication action. Links and the bookmark action are disabled; closing
the preview or pressing Escape returns to the editor without discarding edits.

The preview lives inside the existing protected editor, not a public draft URL.
It performs no additional data request, writes nothing to browser storage or the
database, and maps the record through `programFromResourceRow`, which excludes
internal notes. Public notes appear on the detail page; cards use them only as a
fallback when the description is blank. Existing public data loading, RLS,
publication checks, sitemap and refresh workflow are unchanged.

**Preview release (September 6):** this is a frontend-only change. No new
migration, backend function or scheduled task is required. The control ships
through the existing website release workflow; deploying it does not publish
draft records. Verify both preview views in the signed-in editor after release,
and keep publication approval separate from the preview check.

1. Review information and save the intended resource with Published selected.
2. The resource is saved in Supabase. The editor requests a website refresh and
   returns to Resources. If the request fails, it reports **saved**, not Save failed.
3. The Public website panel and resource status show **Publishing** until the
   current public content is confirmed in the deployed build, then **Live**.
4. **Needs attention** offers **Retry website refresh**. Do not recreate the
   resource. Refreshing does not modify any resource data or verification dates.

The directory uses live database data; static detail pages and the sitemap need
the rebuild to complete. New detail links may be unavailable and old pages may
remain visible during that interval. Wait for Live before sharing a new detail
URL. This is not an atomic database/CDN transaction, and Live is not a provider
availability or factual-verification claim.

The panel checks progress every 15 seconds only while it is open and Publishing.
An unconfirmed build becomes Needs attention after 15 minutes; failed hook
requests report failure immediately. There is no background retry or scheduler.
After source-proposal approvals, bulk curation or changes outside this editor,
use Refresh public pages to update the static site.

## Small integration, existing build

- `netlify/functions/resource-publication.ts`: verifies the caller's Supabase
  identity and admin membership; reads only the anonymous published-resource
  view for content; claims a refresh and POSTs the secret Netlify build hook.
  The browser never receives the hook or a service-role credential.
- Migration `0028`: one private request row, admin-only reads and guarded RPCs.
  Serialized claims prevent double-clicks; a one-minute cross-admin cooldown
  limits builds. Identical pending requests are reused for 15 minutes.
  Later edits during the cooldown are explicitly not assumed to be in the
  earlier build: save succeeds and the admin is asked to retry after one minute.
- Existing build snapshot sync, SSR and sitemap generation are reused.
  Prerendering emits `/.well-known/resource-publication.json` from the exact
  rendered catalog and asserts each listed resource has a rendered route.
  Public-only IDs, paths and SHA-256 content digests are included; no drafts or
  internal notes. The manifest is uncached and excluded from indexing.
- Live requires matching public content hashes and removal of unpublished/deleted
  entries, not just hook acceptance, timestamps, or a Git commit. Data-only
  rebuilds can share the same Git commit without producing false success.
- Anonymous visitors and non-admin users cannot trigger builds. Preview/local
  deployments cannot request production refreshes. Errors never expose the hook.

## Configuration and release

Apply migration 0028 before deploying the UI/function. Create one Netlify build
hook for this project, default branch `main`. Store the URL as the secret
`RESOURCE_PUBLISH_BUILD_HOOK`, production context only, with Functions scope
(the project's plan can also include Builds/Runtime). Never use a VITE_ prefix.
Existing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must include Functions scope.
Netlify's CONTEXT is not a runtime function variable; production-only secret
configuration and allowed production request origins enforce the deployment boundary.

Official references: [Netlify build hooks](https://docs.netlify.com/build/configure-builds/build-hooks/)
and [function environment variables](https://docs.netlify.com/build/functions/environment-variables/).

Tests: `npm test`, `npm run lint`, `npm run build`, and
`node scripts/testResourcePublicationDatabase.mjs` (uses the existing isolated
PGlite dependency under ignored tmp/source-check-tests).
Use `scripts/auditPublicationRelease.mjs` before/after with an explicit local
env and new ignored snapshot path; it performs no database writes.
Run `scripts/verifyResourcePublication.ts` with the explicit local public
Supabase environment to compare the deployed manifest, every resource detail
page, sitemap and unauthenticated refresh rejection against current public data.

Recovery: revert the UI/function integration if needed, retain the additive
request table, and use the existing Netlify manual deployment workflow. Never
restore deleted listings from an old snapshot to repair publication.

## Verification

- TypeScript passed; 269 tests across 27 files passed, including 20 publication
  checks (authentication, safe hooks, duplicate/cooldown handling, failed builds,
  removals, same-commit content changes and evidence-backed Live state).
- Eight isolated PostgreSQL checks passed against migration 0028: RLS, admin
  authorization, claim throttling, stale receipts, failure retry and timeout.
- Browser fixtures verified draft save without refresh, publish/save ordering,
  Publishing to Live, failed refresh with saved-data messaging and retry, and
  a 390px panel without horizontal overflow. No production records were used.
- Full public-data client/SSR build rendered 110 routes and passed all four
  bundle budgets. The build includes 58 public resources, 13 properties and
  21 waitlists. The release preservation baseline has 71 resources total and
  13 hidden drafts.
