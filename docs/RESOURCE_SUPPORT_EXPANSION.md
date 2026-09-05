# Additional resource support (2026-09-04)

## Scope

Four source-verified ongoing programs: Save First free live financial classes,
Community Action financial education, T-Mobile Project 10Million, and Just in
Case Oregon. No employer vacancies, dated event entries, waitlists, affordable
properties, Home Forward-operated services, or automated resource discovery.

## Model and UI

- `resources.service_tags` is an optional-on-the-client, empty-by-default array
  of `financial_education`, `internet_assistance`, and `health_support`.
- Existing directory categories are unchanged. All four new records use
  `supportive_services` and priority 3. One record may have multiple service tags.
- The public directory exposes the three filters under **More**. A selected tag
  remains visible when More is collapsed. All/Reset clears tags along with the
  existing taxonomy filters. Filters use OR within a group and AND across groups.
- Tags are searchable, editable in the existing admin resource form, and shown
  in place of the generic category pill when present. Existing untagged cards
  retain their category labels. No navigation links or dashboards are added.
- Mappers tolerate missing tags in older data. Snapshot sync includes tags so
  server-rendered and live data use the same labels. Provider locations remain
  distinct from service areas.
- Automated curation does not infer, change, or erase these admin-owned tags.

## Sources and curation decisions

Reviewed provider pages on September 4, 2026:

| Program | Evidence | Material limitations |
| --- | --- | --- |
| Save First | https://www.savefirstfinancial.org/calendar | Live community classes are free; coaching and on-demand courses may cost money. Link to current calendar, not a dated session. Online access across OR/WA; Vancouver is an office location. |
| Community Action | https://caowash.org/economic-empowerment/financial-education | Washington County, **Oregon**, residents only even though classes are online. Spanish interpreters. This service is education, not cash assistance. |
| Project 10Million | https://www.t-mobile.com/brand/project-10-million | Eligible K-12 households with documentation; one hotspot per household; **200GB/year** for five years, not unlimited; optional extra data is paid; coverage/availability limits. OR and WA statewide coverage within this site's geographic model, not a claim that the national program is limited to those states. |
| Just in Case Oregon | https://justincaseoregon.org/ | Oregon mailing address; no prescription, ID check or insurance; separate bulk ordering for organizations. Advance supplies, not an emergency-response service. |

## Deployment and preservation

1. Run typecheck and tests, including `resourceServiceTags.test.ts`.
2. Inspect `supabase db push --dry-run`: only migrations 0024 and 0025 should be new.
3. Apply 0024 (additive schema and public/admin view extension), then 0025 (four
   insert-only records plus service areas in a transaction). Duplicate checks
   include unpublished records. Fixed IDs and `ON CONFLICT DO NOTHING` protect
   previously inserted or manually edited records on replay.
4. Sync the public snapshot from production using public read credentials, build
   the client/SSR pages and run the bundle budget. Do not bundle service credentials.
5. Test secondary filters, reset/collapse behavior, state/county restrictions,
   synonyms, resource detail links, and unchanged housing/waitlist navigation.
6. Release through the existing GitHub/Netlify workflow and verify the live site.

To withdraw these additions, unpublish only the four seed IDs in migration 0025;
do not delete other resources. The optional tag column can remain. No original
record needs restoring because the migrations do not overwrite original content.

## Verification results

- TypeScript passed; all 170 tests passed across 22 test files. Coverage includes
  legacy category filters, combined filters, reset semantics, tag normalization,
  provider coverage, search synonyms, and the insert-only migration contract.
- Production migrations 0024 and 0025 applied successfully after a dry run.
  A before/after comparison found all 61 existing resource rows, all 75 existing
  service-area rows, 13 properties, and 21 waitlists unchanged. Four resources
  and six service-area rows were added; 52 resources are published and 13 remain
  unpublished. Existing resource rows gained only the default empty tag array.
- Anonymous public reads returned exactly the 52 published resources, including
  four tagged additions. Direct internal-note and admin-view reads were denied.
- Client and SSR builds, 104 prerendered routes, and all four bundle-budget
  checks passed. Existing SSR chunking warnings remain non-blocking.
- Browser checks passed for two financial-education results, Washington-state
  exclusion of Community Action, Washington County OR versus Multnomah coverage,
  Oregon-only health support, internet assistance, collapsed selected tags,
  full reset, `wi-fi`/`narcan` searches, health detail content, six existing
  rent-assistance results, and affordable-housing/waitlist navigation. No browser
  error or warning logs were recorded during these checks.
- The resource JSON snapshot was refreshed from the already-curated public
  database, preserving public route IDs. This is a read-only build artifact
  refresh, not a change to existing database content. Generated property and
  waitlist snapshot changes are excluded from this source patch; the normal
  production prebuild continues to refresh all public snapshots.
- No admin save was submitted merely to test the form; existing records and
  subscriber notifications were left untouched.
- The live snapshot exposed an outdated landing-page test threshold: the
  established Multnomah rent-assistance route now has two published providers
  after manual curation. That one route is explicitly allowed two; the original
  three-provider threshold remains for other county/service pages. No retired
  records were republished and no existing public route was removed.

## Follow-up (not part of this release)

Research moving labor/trucks, deposits, furniture, and utility setup as separate
needs. Do not infer that a rent/deposit program pays for moving labor. Await the
remaining colleague feedback before adding an events or employment-posting model.
