# Location-aware resource search

Implemented and locally verified September 6, 2026 (Pacific), on
`codex/location-aware-resource-search`. Release checks, preview verification,
and the final production audit are tracked in
[PR 41](https://github.com/hugosmoreira/HousingNavigator/pull/41).

## Problem and scope

A read-only probe of the 67 published resources reproduced three failures:
`rent help in Spokane` ranked ACCESS (Jackson County, Oregon) first;
`moving truck in Bend` ranked NeighborLink PDX (Multnomah County) first;
`utility help in Jackson County` ranked Clark Public Utilities first.
Location previously contributed only a small keyword score.

This change makes recognized location a coverage constraint before keyword
ranking. It does not change provider information, dates, publishing flags,
waitlists, affordable properties, the database schema, or background jobs.
No AI service, geocoder, location permission, or new dependency was added.

## Behavior

- Explicit `in`, `near`, and `around` clauses are separated from service words.
  `near` means county service coverage, not a distance/radius search.
- A known place by itself browses its area. Common need phrases also work with
  a leading/trailing place, e.g. `Spokane rent help` and `rent help Spokane`.
  Arbitrary words in organization names are not treated as location filters.
- Every Oregon/Washington county is recognized, including state-qualified
  county names. County selectors show all 36 Oregon and 39 Washington counties,
  even when the catalog has no county-specific providers.
- Statewide resources are included for counties in that state. Explicit
  `service_areas` take precedence over a provider's office location. Existing
  legacy county/state fallback behavior in `serviceAreasForProgram` is retained;
  this release does not reclassify legacy data or infer geography from addresses.
- Shared county names such as Benton require a state. Washington by itself can
  mean Washington State or Washington County, Oregon; the user chooses.
  Redmond requires a state; Portland/PDX requires a county because the city
  spans Multnomah, Clackamas, and Washington counties.
- A likely one-character location typo offers a confirmation button instead of
  silently changing the location. Unsupported/unknown explicit locations and
  multiple requested locations prompt a manual selection. Their results remain
  empty until clarified; they are not presented as a lack of available help.
- The active area is shown below the search field and reflected in the existing
  state/county controls. Manual selections persist while typing and explicitly
  override a conflicting query location. **Use location from search** resumes
  automatic recognition. **Oregon and Washington** explicitly removes the area
  constraint and displays that override; results are not silently broadened.
- Keyword synonyms, category/service/household filters and sorting remain in
  place. Empty-state search suggestions retain the selected area. Reset all
  filters clears both the query and the manual location choice.
- A zero-result message says there are no matching directory listings, not
  that no assistance exists. Outside-area alternatives are not mixed into
  scoped results; the visitor must explicitly change/remove the area filter.

## Modules

- `src/data/searchLocations.ts`: reviewed city aliases and county/state lookup.
- `src/utils/resourceSearchLocation.ts`: pure recognition, clarification and
  manual-override context, independent of React or provider data.
- `src/utils/resourceSearch.ts`: applies coverage, then existing keyword ranking.
- `src/components/ResourceLocationNotice.tsx`: accessible status and choices.
- `src/pages/Resources.tsx`: wires existing controls to the same search context.

The third `searchPrograms` argument is optional: omitted/undefined location
follows the query, a `ServiceArea` explicitly selects coverage, and `null`
explicitly searches all areas. Callers that need location feedback should use
`resourceSearchContext` rather than treating every empty result as a catalog gap.

## City mapping evidence and expansion

The initial city list is deliberately explicit, not generated from office
addresses. Checked official sources:

- [Deschutes County](https://www.deschutescounty.gov/administration/page/about-deschutes-county):
  Bend, La Pine, Redmond and Sisters.
- [King County city list](https://kingcounty.gov/en/dept/dph/about-king-county/about-public-health/jurisdictions/king-county-cities-towns):
  Seattle and Redmond, Washington.
- [Spokane's civic guide](https://static.spokanecity.org/documents/about/government/civic-zine/a-civic-guide-for-neighbors-zine-english-spreads.pdf)
  and [county city list](https://www.spokanecounty.gov/5610/Cities-Towns):
  Spokane and Spokane Valley.
- [Pierce County city list](https://www.piercecountywa.gov/3815/Cities-and-Towns): Tacoma.
- [Clark County community health assessment](https://clark.wa.gov/sites/default/files/media/document/2024-05/final_clark-county-cha_feb-24.pdf): Vancouver.
- [Portland voter resources](https://www.portland.gov/vote/resources): the city's
  three counties; PDX is a convenience alias and does not imply airport proximity.

To add another city: verify its county or counties from official sources, check
for a same-name place in the other supported state, add every applicable mapping,
document the source, and test disambiguation. An unlisted city can still be
searched using its county selector. ZIP codes, arbitrary addresses, complete
natural-language understanding and all US cities are outside this release.

## Verification

- Regression tests first reproduced the old failures; the new suite passes
  **362 tests across 31 files**, including 64 additional cases over the release
  baseline. All county/state combinations are exercised inside the geography test.
- Fresh `npm ci` and `npm run check` passed on Node 22.20.0 in an isolated
  temporary checkout. TypeScript, 14 source-review SQL checks, eight publication
  SQL checks, offline build (95 routes), and all bundle budgets passed.
- A second full gate with public/anonymous production reads passed with
  **67 resources, 13 affordable properties, 21 waitlists and 119 routes**.
  Production-profile budgets: initial JS 273.9 KiB raw / 86.8 KiB gzip, CSS
  9.8 KiB gzip, largest deferred JS 202.8 KiB. Existing SSR import warnings remain.
- Browser checks used the actual Resources page, an ignored snapshot of public
  data, and mocked save/auth hooks: Spokane, Bend, Jackson County, ambiguous
  Benton County, spelling confirmation, manual override persistence, resuming
  query location, sorting, reset, clearing text, and empty-state recovery passed.
- All 67 published provider names were checked against the parser: none were
  treated as locations. Browser searches for Outside In and Just in Case Oregon
  still ranked the named provider first.
- At a 390-by-844 viewport, keyboard Tab/Enter selected the spelling suggestion,
  controls remained usable, and there was no page-level horizontal overflow.
  A 1280-by-900 desktop check also passed without page-level overflow.
  The duplicate native/custom clear icon found in this check was removed.
  No browser console errors were observed. This is responsive desktop-browser
  testing, not a physical iOS/Android or screen-reader certification.
- Generated catalogs and local harnesses stay outside the change. No provider
  records were edited and no live verification timestamps were refreshed.

On the sampled catalog, Spokane's rent query now returns only geographically
eligible statewide tenant-help results, not Jackson/Clark County providers;
Bend's moving query returns the statewide TA-DVS listing, not Portland-only
NeighborLink; Jackson's utility query ranks ACCESS first. These observations
test geographic correctness, not fresh provider verification or guaranteed
eligibility. The existing broad keyword matcher can still return related
tenant-rights help for rent queries; service-intent precision is separate work.

## Release handoff

Release checklist for PR 41: run the required GitHub and Netlify preview checks,
repeat the browser cases on that preview, and merge without bypassing main's
required check. Match the production marker to the merge commit, compare the
public publication manifest, and compare every resource, service-area,
affordable-property and waitlist row against the private pre-release baseline.
The baseline contains 67 published resources and six hidden drafts; it is never
committed. Record the final deployment and preservation results on PR 41.

After that production receipt is complete, follow with the admin review-workflow
step in `IMPROVEMENT_PLAN.md`; do not combine it into this search change.
