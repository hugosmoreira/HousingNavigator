# Resource source-change checks and compact filters

Deployed September 4, 2026 (Pacific). Migrations 0026/0027, the admin-only
check-resource-sources function and the frontend are live. The frontend release
is [PR 34](https://github.com/hugosmoreira/HousingNavigator/pull/34), production
commit 9a58d0e173edd61ab9eade596f65e66c559c44ec. The six pilot resources were
initially unpublished. Following manual review and explicit user approval,
four content corrections were applied and all six were published. No other
resource, property or waitlist was changed by the publication operation.
See the [publication review and outcome](RESOURCE_PILOT_PREPUBLICATION_REVIEW.md).

## Live pilot outcome

- The first run exposed a prompt-contract defect: the model joined separate
  identity excerpts with ellipses; the exact-quote guard correctly rejected them.
  The extractor now explicitly requests one short consecutive identity excerpt.
  Comparison policy version 2 invalidates prior cached analyses. The guard was
  not weakened, and regression tests cover stitched versus exact identity quotes.
- Corrected live run: Community Warehouse, TA-DVS, DCA and PGE returned unchanged.
  Old identity warnings were superseded automatically, not manually deleted.
- NW Furniture Bank proposed a wording-only eligibility change. Its official
  [service steps and FAQ](https://www.nwfurniturebank.org/need-furniture/) still
  support needing furniture, being housed and arranging service through a
  community partner. The unnecessary proposal was dismissed in the live admin
  UI; its summary's suggestion that referrals were unnecessary was not accepted.
- Operation Warm Heart returned HTTP 403 to the restricted checker. Its existing
  information stays intact, retry delay is honored, and no closure is inferred.
  Separately retrieved indexed official content supports the program/contact;
  this does not count as a successful direct crawler verification.
- Repeat live run: **4 unchanged, 1 already reviewed, 1 deferred; 0 pending
  source-change findings**. The dismissed proposal did not reopen.
- Production UI tests confirmed the compact filters, hidden draft results,
  approval confirmation/cancellation and authenticated dismissal. No live
  approval write was made; field-write behavior remains covered by isolated
  PostgreSQL tests. No browser errors/warnings were recorded.
- Final preservation audit again passed for all original catalog records and
  anonymous access restrictions. The local baseline is intentionally untracked.

## Scope

- Existing Resources page and housing categories remain intact.
- More filters opens a bounded panel instead of appending every choice to the
  horizontal row. Its button stays outside that scrolling row. Selected
  additional filters remain visible when collapsed.
- New tags: moving_help, move_in_costs, furniture, utility_help. Existing
  OR-within-group/AND-across-group filtering and ordinary keyword search apply.
- Optional cost_details is visible on cards/detail pages and editable in the
  existing admin form. Unknown cost never means free.
- No existing resource descriptions, categories, properties or waitlists change.

## Six-resource pilot

Migration 0027 inserts six researched programs **as unpublished drafts**:
Community Warehouse, NW Furniture Bank, Oregon TA-DVS, Washington DCA, PGE's
income-qualified bill discount, and Operation Warm Heart. Fixed IDs match
SOURCE_CHECK_PILOT_IDS. No withdrawn resources are restored.

Published AND unpublished records are checked for duplicate normalized names or
provider/source URLs. A collision aborts the transaction. Replaying preserves
existing IDs and human edits; service areas are created only for new records.
Partial-county/provider-territory restrictions remain explicit in eligibility.

Sources rechecked September 4:

- [Community Warehouse](https://www.communitywarehouse.org/get-furniture/):
  current indexed official page supports self-referral, a $150 fee and $250
  delivery fee. Direct retrieval timed out. Confirm address/delivery eligibility;
  metro county filters do not guarantee delivery or an appointment.
- [NW Furniture Bank](https://www.nwfurniturebank.org/need-furniture/):
  agency referral, $100 processing/$150 delivery plus bed charges. No Oregon
  delivery; King coverage is South King only.
- [ODHS TA-DVS](https://www.oregon.gov/odhs/dv/Pages/tadvs.aspx):
  specialized safety assistance, not a general moving grant.
- [DSHS DCA](https://www.dshs.wa.gov/esa/diversion-cash-assistance-dca):
  official indexed page confirms conditional assistance and potential prorated
  repayment. Direct retrieval failed.
- [PGE discount](https://portlandgeneral.com/income-qualified-bill-discount) and
  [territory](https://portlandgeneral.com/about/info/service-area):
  customer/territory eligibility, not statewide or deposit assistance.
- [Operation Warm Heart](https://www.clarkpublicutilities.com/residential-customers/financial-assistance/operation-warm-heart-financial-assistance/):
  customer-specific heating bill assistance.

No provider calls, live funding or appointments were confirmed. No direct mover
is added; TA-DVS is tagged as move-in funding, not moving labor.

## Admin workflows

**Check for updates** compares existing records, including completed records.
Default selection is the six pilot IDs; admins can choose another loaded record.
One bounded request is sent per ID. Stop/leaving prevents further requests while
the current request may finish. No schedule, discovery or automatic publication.

**Fill missing resource information** contains the earlier fill-only curator
inside a disclosure. Its existing behavior is unchanged.

## Architecture

- _shared/resourceSourceChecks.ts: pure validation, normalization, fingerprints
  and retry policy; no database writes.
- _shared/resourceSourceExtractor.ts: structured factual comparison, not stylistic
  rewrites. Uses the existing Anthropic setup and ignores source-embedded
  instructions. Only allowlisted public program fields are sent, not accounts
  or internal notes. [API contract](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).
- check-resource-sources: explicit admin JWT/member check, stored resource ID
  lookup, shared SSRF-resistant fetcher, lease, comparison and audited result.
  Callers cannot submit arbitrary URLs, prompts or public patches.
- Migration 0026: private states/findings/attempts, atomic completion and human
  resolution RPC, plus additive costs/tag schema.
- ResourceSourceCheckPanel: old/new values, quotes, source link, approval,
  dismissal/manual resolution and separate source-access history.

The checker never edits public content. Approved replacements are restricted to
description, who_qualifies, cost_details, public_notes, phone, application_method
and referral_required. Geography and closure findings require manual editing.
Publication, deletion, tags and waitlists cannot be changed by proposal approval.
Concurrent edits and changed displayed proposals block approval.

Unchanged normalized source AND unchanged stored facts reuse analysis without
another model call. Menu/footer/script noise is removed; body/header notices
remain. Semantic comparison is still required when content changes. Source quotes
and affected old field values identify findings, not generated wording.
Accepted/dismissed identical evidence stays resolved; new evidence can create a
finding. Pending findings rebase only after another validated comparison.

Failures preserve records. Retry delays increase from 15 minutes to at most
24 hours and require another button click. Successful checks have a one-minute
cooldown. Per-resource leases expire after three minutes; stale tokens cannot
finish another request.

Identity, quotes and confidence >=0.85 are conservative gates, **not measured
accuracy guarantees**. Blocked, oversized, JavaScript-only or ambiguous pages can
still require manual review. A readable provider page does not prove funding.

## Dates

Private metadata separates last attempt, last readable comparison and last human
confirmation of a finding. Neither fetch success nor partial-field approval
refreshes resources.last_verified. That full-record date remains admin-owned for
this workflow. The older curator retains its separately documented date behavior.

## Tests and limitations

- TypeScript passed; 203 application tests across 24 files passed.
- 14 isolated PostgreSQL checks passed using PGlite with real migrations
  0024/0026/0027 and representative prior schema/roles. Covers view order, leases,
  RLS, resolved deduplication, approval, concurrent edits, forbidden fields,
  closures, retry delay, date preservation, seed replay and hidden duplicates.
- Client/SSR builds, local-snapshot prerendering and all four bundle budgets
  passed. Existing SSR import warnings are non-blocking. The production snapshot
  refresh contains 52 published resources, 13 properties and 21 waitlists;
  prerendering generated 104 routes. All four live-data bundle budgets passed.
- Browser fixtures confirmed expanded filters, collapsed selections, old/new
  evidence display, and a 390px layout without horizontal overflow.
- The first native-dialog test stalled in the browser controller. The new workflow
  now uses inline confirmation; recovered fixture tests passed approval,
  cancellation, dismissal, closure restrictions and an unchanged six-record rerun.
  No browser errors/warnings were recorded in that recovered test tab.
- Supabase dry run listed only 0026 and 0027; both were then applied successfully.
- Production preservation audit confirmed all 65 original resources, 81 original
  service-area rows, 13 properties and 21 waitlists unchanged. Exactly six hidden
  drafts and their 17 service-area rows were added. Anonymous reads cannot access
  those drafts or private source-check data.

Run npm run lint and npm test. For isolated database tests, install
@electric-sql/pglite with npm install --prefix tmp/source-check-tests --no-save
--package-lock=false, then run node scripts/testResourceSourceDatabase.mjs.
No Supabase credentials or network database are used by that test.

Release preservation audit: scripts/auditResourceSourceRelease.mjs accepts
before, after or results plus explicit local env/baseline paths. The generated
baseline contains resource records and must remain in ignored local storage.
The script does not write to the database. Do not commit credentials or baselines.

## Deployment procedure

1. Re-run tests, inspect the diff, and snapshot existing resources/service areas
   read-only for preservation comparison.
2. Confirm db push --dry-run lists only 0026/0027; apply in that order.
3. Deploy check-resource-sources with --no-verify-jwt: the function independently
   verifies user JWT/admin membership. Do not remove the internal auth gate.
4. Reuse server-side Supabase and Anthropic secrets/model settings.
   RESOURCE_SOURCE_MODEL can override the established curation model.
5. Refresh public data after migration (its query now includes costs), rebuild,
   and release the frontend through the normal deployment workflow.
6. Run checks on pilot drafts and calibrate real extraction/blocked-source behavior.
   Finish authenticated approval/dismissal UI tests on designated test records.
7. Verify old records are unchanged except the null cost column and anonymous
   access cannot read drafts or private check metadata.
8. Review draft preview, fees, geography and intake, then publish only the six
   intended records once satisfactory. Do not bulk publish unrelated drafts.

Do not deploy frontend before 0026. No scheduler is required.

## Before publishing the pilot

The [September 4 pre-publication review](RESOURCE_PILOT_PREPUBLICATION_REVIEW.md)
completed manual browser verification of Operation Warm Heart and reviewed all
six drafts. Three were ready as written; the documented eligibility/benefit-period
clarifications on the other three were applied on subsequent user approval.
All six are now published. The backend HTTP 403 remains a separate limitation.

Review final intake/fees and address-specific coverage, especially delivery and
utility territories. Resolve or manually verify the HTTP 403 source. These
checks do not establish live funding, appointment availability or full-record
verification. Keep draft publication an explicit admin decision.

Recovery: disable the new checker/revert the frontend if needed; retain additive
schema/audit history. Pilot drafts remain hidden. If later published, unpublish
only their six IDs. Original content changes only after explicit admin approval.
