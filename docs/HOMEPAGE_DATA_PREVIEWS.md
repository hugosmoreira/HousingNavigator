# Homepage catalog previews

The homepage no longer maintains example housing records, verification dates,
waitlist statuses, or a simulated saved-resource state in JSX.

## Data and selection

- `Home.tsx` uses the existing `usePrograms` and `useWaitlists` hooks, just like
  the resource directory and waitlist tracker. No extra endpoint or job was added.
- Those hooks initially render the bundled public snapshot for prerendering and
  hydration, then request the configured data adapter during browser idle time.
  With Supabase enabled, the adapter reads only published rows from public views.
  Static mode continues to use the bundled catalog; it is not a live source check.
- `homePreviews.ts` selects one resource and up to three waitlists by their
  recorded review/check dates, newest first, with a stable ID tie-breaker.
  There is no provider-name or provider-ID allowlist. Input arrays are not mutated.
- Names, descriptions, service areas, categories, program types, dates, and routes
  come from those records and existing presentation helpers. The hero waitlist
  and first tracker-preview row use the same record and status formatter.
- The resource action opens its actual detail page. It does not claim that the
  visitor has saved the resource.

## Meaning of the display

Statuses are recorded information, not a guarantee of current applications.
Mixed-program records marked open say **Some lists open**, not that all voucher
or property programs at an authority are open. The detail link supplies context.
Unknown/unrecognized statuses remain unknown. Missing or malformed dates display
an unavailable-date message, never today's date or an invented last-check date.

If a refresh fails, previously loaded information may remain, with a refresh
warning. Empty results show directory/tracker links rather than fabricated cards.
The two hero cards remain visually separate even with longer real provider names.

The Help and Terms copy describes Oregon/Washington coverage and manual or
automated recorded checks without promising a fixed review cadence. Waitlist
counts say **listed as open**. Alert wording describes recorded openings or
expanded access, not instant notification of every status transition.

## Updating and checking

Use the existing admin records to edit information. The normal publication/build
snapshot and browser refresh paths feed these previews; no homepage edit is needed
for a provider name, date, or status change. This patch does not change records,
publish drafts, rerun source verification, or create background automation.

`src/pages/Home.test.tsx` and `src/lib/homePreviews.test.ts` cover record-driven
rendering, routes, status consistency, dates, ordering, and failure/empty states.
Run the repository's `npm run check` before release. Also check the homepage at
desktop and narrow widths and open both a resource and a waitlist preview.

Important follow-up: accurate rendering does not make an old source current.
Continue verifying stale or uncertain records through the existing curation
workflow; do not infer closures from a failed fetch or overwrite stored statuses
as part of a presentation change.

## Verification (September 19, 2026)

- TypeScript and all 537 tests passed, including 52 new preview/copy tests.
- All 37 isolated PostgreSQL checks passed without an external database.
- Client/SSR builds, prerendering, and all four existing bundle budgets passed.
- Browser checks covered desktop, the 1024px breakpoint, and a 390px narrow
  viewport. Resource and waitlist previews opened their matching detail pages.
  Real provider names required removing the old overlapping card positioning;
  waitlist titles wrap rather than hiding the specific property/program name.
- Catalog generation during the isolated build was reverted to the existing
  bundled catalog; no catalog-data change is part of this patch.
