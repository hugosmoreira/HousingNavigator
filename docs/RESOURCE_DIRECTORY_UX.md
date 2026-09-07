# Resource directory UX correction

September 7, 2026. Scope: repair the resource-finding journey, not expand the
catalog or redesign other sections. Production release requires the user's
review of the preview. Do not merge or trigger a production build automatically.

## User-facing behavior

- One directory: Search, Help needed, and Area together, with matching cards
  directly below. Controls stack on small screens so county names stay readable.
- Remove the Browse by area navigation strip, horizontal category scroller,
  separate area sidebar, apartment banner, and generic county guide panels.
  Affordable housing and waitlists remain in their existing navigation sections.
- Every existing category and service tag is available in Help needed. This is
  one primary selection, replacing the previous category/tag multiselect split.
  Switching needs cannot leave a hidden category/tag combination active.
- Household selection is optional. A selected household remains named in the
  collapsed control. Clear all resets search, need, area, household, and sorting.
- Existing county/service URLs render this SAME Resources component, initially
  filtered to their county/service. There are no separate guide pages. Existing
  shared URLs, metadata, sitemap entries, and resource detail URLs still work.
- Resource details offer Back to results when opened from the directory. Both
  this link and browser Back restore the filters and search words. A direct
  detail-page visit still offers Back to all resources.

## Implementation boundaries

`resourceDirectoryState.ts` owns parsing, validation, category/tag mapping and
URL serialization. Filters use existing taxonomy and service-area eligibility,
not provider office locations. Unknown named filters fail closed with a reset
option. Return destinations are restricted to valid directory URLs.

Explicit filters can be shared as URL parameters. Free-form search words stay
in browser history state, not URL parameters. Opening a copied link in a new
session therefore restores explicit filters but not the search words. Browser
history is local state, not a claim of zero local retention.

`useClientReady` matches static prerendered HTML during hydration and then applies
URL/history filters. Old county URLs retain their correct filtered static HTML.
Location clarification only occupies visible space for an unresolved location
or a conflict with the selected area; ordinary coverage status remains available
to screen readers alongside the visible Area control.

Removed unused LocalHousingLanding and ResourceMoreFilters components and the
county instruction copy. Git history retains the removed UI. The remaining
localLandingPages data preserves stable URL metadata and structured-data lists;
it does not provide another interface or create any resources.

Card descriptions, costs, eligibility, intake, contact options, saved-resource
behavior, and verification dates are unchanged. The small card/detail changes
only pass validated navigation state for the return journey. No database,
migration, API, crawler, scheduling, admin, or publication behavior is changed.

## Verification before review

Fresh temporary checkout, locked `npm ci`, Node 22.20.0:

- `npm run check`: TypeScript, **434 tests across 33 files**, 14 source-review
  PostgreSQL checks, 8 publication PostgreSQL checks, client/SSR builds,
  prerendering, and all four bundle budgets passed.
- Public-only build read **67 resources, 13 properties, and 21 waitlists** and
  produced **119 indexable routes**. No build-generated catalog files were
  copied back into the development branch.
- Existing install audit reports 7 dependency advisories (2 moderate, 5 high).
  Package files were not changed. Dependency remediation is outside this patch.
- UI checks used the actual production-profile application, not mock cards:
  - Moving help + Multnomah -> NeighborLink PDX, no Seattle-only provider.
  - Moving help + King -> Mary's Place / Adam's after clearing a narrower word.
  - Internet assistance + King -> statewide T-Mobile Project 10Million.
  - Detail / Back to results and browser Back/Forward preserve state.
  - Benton County asks Oregon or Washington once; confirmation clears the prompt.
  - Old Multnomah URL opens the shared controls and 33 existing resources; changing
    need stays in the directory. Furniture returns the existing tagged programs.
  - Optional household selection stays visible when collapsed. Clear all restores
    67 resources. Keyboard Tab from Search reaches Help needed.
  - 320px and 390px mobile widths have no horizontal overflow; controls are full
    width. The first card begins at 560px on the default directory. Desktop at
    1440px has controls in one row and results directly underneath.

Tests check all nine legacy county/service routes, every existing need, all
supported counties, invalid links, statewide eligibility, safe return URLs,
cached data on fetch errors, and hydration's initial static render.

A read-only pre/post comparison passed: all fields of 73 total resources
(67 public, six hidden), 100 service-area rows, 13 properties, and 21 waitlists
were unchanged. The local build's manifest exactly matches the current public
catalog. All 67 resource pages/sitemap entries and the directory plus nine old
county/service routes were checked. These checks do not re-verify providers or
refresh source dates. A directly opened filtered URL also restored its need
and county after hydration, without inheriting private search words.

## Release boundary

Implementation branch: `codex/resource-directory-ux`. After the initial local
review, the user explicitly approved pushing this branch to the existing public
GitHub repository and creating a shareable preview. This approval does NOT
authorize merging or deploying to production. The draft pull request will hold
the remote CI, preview, and data-preservation receipt when those checks finish.

Preview only until the user approves the visual result. Keep the six drafts
hidden and preserve unrelated local research files. A subsequent approved
release should use the existing required CI/Netlify checks and repeat the
public-catalog preservation check. Do not combine it with new resources,
taxonomy changes, admin features, or a framework/hosting migration.
