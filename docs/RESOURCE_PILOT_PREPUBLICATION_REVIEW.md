# Six-resource pilot: pre-publication review

Reviewed September 4, 2026 (Pacific), September 5 UTC.
The initial review made no database writes. On subsequent user approval, the
four field corrections were applied and all six pilot resources were published.

## Publication outcome

- Exactly four content fields changed across TA-DVS, DCA and Operation Warm
  Heart. The other three programs retained their reviewed wording.
- All six publication flags changed to true. The directory now has 58 published
  resources; the remaining 13 drafts stay hidden.
- A fresh pre-write backup and updated_at guards protected concurrent edits.
  Post-write comparison confirmed every non-pilot row unchanged, including
  existing resources, service areas, properties and waitlists. All other pilot
  fields, including last_verified, were preserved.
- Anonymous reads verified all six resources and 17 associated service areas,
  the four corrected values, hidden remaining drafts and no internal_notes.
- The live directory displayed all six cards and all four corrections.
- Direct-link testing identified the existing static-publication requirement:
  newly published detail routes return 404 until a build refreshes the public
  snapshot and prerendered pages. The publication release includes that rebuild.
- TypeScript and all 203 tests passed. The refreshed build generated 110 routes,
  including six new resource detail pages and their sitemap entries; all four
  bundle budgets passed. Existing resource snapshot entries were unchanged.
- The refreshed waitlist snapshot also reflects KCHA's already-existing
  September 5 UTC check date; the publication made no waitlist database write.

The one-off operation and recovery backup are in ignored local
tmp/source-check-tests storage, not public source or application code. Recovery
must target only the six recorded IDs and avoid overwriting later edits.

## Original review decision

All six programs are suitable for the housing-support directory. Community
Warehouse, NW Furniture Bank and PGE are ready as written. Before publishing
the other three, apply the eligibility/benefit-period clarifications below.
The changes below were recommended while all six records were unpublished,
then applied after the user approved proceeding.

Scope is the six pilot IDs below, not the other existing unpublished resources.
No Home Forward program, affordable property or waitlist is being added.

## Findings

| Draft | Result | Evidence and important limits |
| --- | --- | --- |
| Community Warehouse | Ready | The [current intake page](https://www.communitywarehouse.org/get-furniture/) loaded in a normal browser. It confirms self-referral or agency referral, Portland/Tigard/Gresham appointments, $150 furniture and an additional $250 delivery fee. Agency help with fees is possible, not guaranteed. Existing address/delivery caveats should stay. County filters are not a promise of delivery to every address. |
| NW Furniture Bank | Ready | [Intake and fees](https://www.nwfurniturebank.org/need-furniture/) support the required agency referral, stable housing, $100 processing fee, $150 delivery fee and separate bed-related charges. [Provider coverage](https://www.nwfurniturebank.org/about/) specifies Pierce, South King, Clark and Cowlitz counties. Existing South King and no-Oregon-delivery limits are important. |
| Oregon TA-DVS | Clarify eligibility | The [ODHS program page](https://www.oregon.gov/odhs/dv/Pages/tadvs.aspx) includes people at risk of domestic violence now or in the future, and specifies pregnancy or being a parent/relative caring for a minor child. The draft's narrower wording could discourage eligible people. The existing $3,200/90-day maximum and provider-payment explanation are supported. |
| Washington DCA | Clarify eligibility and period | [DSHS emergency resources](https://www.dshs.wa.gov/esa/community-services-offices/emergency-resources) excludes people currently receiving TANF/SFA. The [program manual](https://www.dshs.wa.gov/book/export/html/1836) specifies one 30-day period every 12 months, not a calendar-year reset. The $2,000 maximum and conditional repayment are supported. Direct retrieval returned 403; indexed official material was used. |
| PGE bill discount | Ready | The [PGE program page](https://portlandgeneral.com/income-qualified-bill-discount) supports the 15%-80% discount, residential customer/income conditions and telephone intake. It applies to future eligible energy charges, not past bills or a deposit grant. Retain the [utility-territory](https://portlandgeneral.com/about/info/service-area) caveat: county residence alone does not qualify someone. |
| Operation Warm Heart | Source verified manually; clarify intended audience | The [official page](https://www.clarkpublicutilities.com/residential-customers/financial-assistance/operation-warm-heart-financial-assistance/) loaded in a normal browser after its automatic security check. It supports income-based electric heating assistance and 360-992-3000. It particularly directs households in financial difficulty who cannot receive other energy assistance to ask about the program. No award amount or numerical income cutoff is published there. |

## Approved field replacements (applied)

Only these content fields and the six publication flags were changed.
Other fields, service areas and existing review history were preserved.

### TA-DVS

Resource ID: `66060904-0003-4000-8000-000000000003`

Replace `who_qualifies`:

> Oregon residents who are pregnant, or are a parent or relative caring for a minor child, and face domestic violence now or a risk of it in the future. Household income must meet the program's limits; ODHS determines eligibility.

Keep intake through a local ODHS office. A general crisis-line number is not
a substitute for the program's intake contact.

### Washington DCA

Resource ID: `66060904-0004-4000-8000-000000000004`

Replace `who_qualifies`:

> Washington families who meet TANF or State Family Assistance eligibility but are not currently receiving either benefit, and expect to meet ongoing needs without monthly cash assistance. DSHS determines eligibility.

Replace `cost_details`:

> Up to $2,000 during one 30-day period, no more than once every 12 months. A prorated amount must be repaid if the family starts TANF within the following 12 months.

### Operation Warm Heart

Resource ID: `66060904-0006-4000-8000-000000000006`

Replace `who_qualifies`:

> Clark Public Utilities customers struggling to pay electric heating bills, particularly households that do not qualify for other energy assistance. Eligibility is income-based; call the utility for screening.

Do not invent an income threshold, guaranteed award, application turnaround or
general utility-deposit benefit.

## Source-access outcome

The Operation Warm Heart manual verification is complete. This does not mean
the backend's HTTP 403 problem is fixed: browser access and the restricted
server-side fetcher are different paths. Do not relabel a blocked crawler
attempt as an automated success or infer program closure.

No security challenge was bypassed, and no CAPTCHA was solved. Community
Warehouse also loaded in the browser despite direct research-tool timeouts.
No new checker run, finding resolution or verification-date write was made.
The content/publication changes above do not alter the recorded crawler failure.

## Initial pre-publication database preservation and privacy

Read-only production comparison found:

- 71 resources, 98 service-area rows, 13 affordable properties and 21 waitlists.
- All 65 pre-pilot resources, 81 pre-pilot service areas and 13 properties
  unchanged relative to the saved release baseline.
- All six pilot records still unpublished with their original update timestamp.
  Anonymous queries return zero pilot resources and zero pilot service areas.
- The strict release audit stopped on two waitlist timestamp differences.
  A field-by-field follow-up found only updated_at / last_auto_check_at for
  Bienestar Armonia, and those plus last_checked for KCHA subsidized housing.
  No waitlist status, description or other fields differed. These are
  consistent with independent waitlist checks; this review made no writes.
  The original baseline was not modified.

This was a content and data-preservation review, not another application-code
test run. No software code changed.

## Publication procedure

Apply the four proposed field replacements on the three specified drafts,
review their saved previews, and publish only the six pilot IDs on explicit
approval. Keep the service-area restrictions and fees visible. Refresh the
public snapshot and redeploy the static build, then check each direct detail
URL and the sitemap; directory visibility alone is not a complete release test.

Website evidence confirms advertised program rules, not live funding,
appointment availability or an individual's eligibility. No provider calls
were made. None of these listings should promise immediate assistance.
