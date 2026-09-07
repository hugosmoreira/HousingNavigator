# Housing Navigator improvement plan

Started September 6, 2026. This plan follows the code assessment and the user's
approval to begin improvements. It is ordered by completion criteria, not
speculative weekly estimates. Preserve the existing framework, public layout,
resource records, six excluded drafts, affordable properties, and waitlists.

## 1. Reproducible release checks — remote checks verified; main protection enabled

- [x] Declare the tested PGlite version as a locked development dependency;
  remove database-test imports from ignored temporary storage.
- [x] Add `npm run test:database` and one fail-fast `npm run check` command.
- [x] Add a read-only, secret-free PR/main workflow with the stable check name
  **Quality checks**; include merge-group and manual triggers.
- [x] Configure Netlify to run the same checks before building/publishing.
- [x] Align local version guidance, CI, IndexNow and Netlify on supported Node 22.
- [x] Replace the local-landing-page test's changing provider-count quota with
  controlled coverage/category/ranking fixtures and an empty-catalog test.
- [x] Verify a fresh locked install, all tests, typechecking and the full build.
- [x] Confirm a failed check prevents later build steps.
- [x] Obtain a successful remote **Quality checks** run and Netlify preview,
  then make **Quality checks** required for `main`. Existing protection and
  rules were read before applying the new required check; none existed.

Acceptance: a fresh checkout needs no private credentials or temporary package
folder to run the complete gate; failed checks stop release; required-check
enforcement is verified separately after rollout.

## 2. Location-aware resource search — next

- [ ] Add regression cases from the published catalog: “rent help in Spokane,”
  “moving truck in Bend,” and “utility help in Jackson County.”
- [ ] Recognize supported, unambiguous locations and apply the existing
  service-area model; show an editable location filter rather than silently
  guessing. Handle ambiguous place names explicitly.
- [ ] Keep service-area eligibility distinct from a provider office address.
- [ ] Separate out-of-area alternatives; correctly report missing coverage.
- [ ] Test statewide services, cross-state counties, manual filter precedence,
  typos, ordinary keyword searches and mobile keyboard/filter behavior.

Acceptance: a requested location cannot rank an out-of-area-only provider as a
local match. No availability or household-eligibility guarantee is invented.
Use these cases as an initial benchmark for later private AI-search evaluation.

## 3. Connect existing admin review workflows

- [ ] Count current pending source findings in the dashboard, not only totals
  from the older fill-only curator's last run.
- [ ] Link each count to the correct review surface; distinguish source access
  failures from evidence-backed content changes.
- [ ] Replace the fixed pilot-only batch with explicit selections of existing
  resources, a bounded queue, progress and Stop behavior.
- [ ] Preserve concurrency checks, resolved-finding deduplication, source
  evidence, manual approval and six excluded draft publication states.

Acceptance: dashboard counts reconcile with pending records, reviewed findings
stay resolved, and no schedule, auto-publication or new-resource discovery is
introduced.

## 4. Complete-catalog loading before substantial expansion

- [ ] Paginate both live public reads and build snapshot reads, using a stable
  order and explicit completeness checks.
- [ ] Test more than one API page, exact page boundaries, empty catalogs,
  failures partway through, hidden records and duplicate/missing rows.
- [ ] Confirm the public manifest, rendered detail pages and sitemap include
  the same approved catalog after publication.

Acceptance: exceeding the API row limit cannot silently drop published records;
a failed partial fetch must not be published as a successful complete snapshot.

## Follow-on work, not part of this first change

Introduce stricter TypeScript settings incrementally; use focused refactors only
where they reduce duplication or complexity. Standardize the active development
checkout without deleting unreviewed worktrees or local changes. An AI-search
prototype can follow the retrieval benchmark; it does not need a large catalog
or a framework rewrite. This plan does not schedule background work.

## Release-check procedure

Use the latest Node 22.x patch (`.nvmrc` pins the supported major), then:

```sh
npm ci
npm run check
```

The command runs `lint` (currently TypeScript), Vitest, the two in-memory PGlite
suites, and the existing client/SSR/prerender/bundle-budget build in order. A
nonzero exit stops the chain. The database suites have no Supabase connection,
credentials or external writes. PGlite is a development-only dependency and is
not imported by the browser application.

CI explicitly uses the bundled catalog with no Supabase credentials. The
production Netlify build retains its existing public snapshot sync using the
configured public/anonymous credentials; this reads published records but does
not edit them. `npm run build` can regenerate tracked catalog snapshot files,
so review build-generated changes and never restore them over human edits.

The PR job uses `pull_request`, not `pull_request_target`, has read-only contents
permission and does not persist Git credentials. GitHub Action revisions are
pinned. No production build hook, service-role key or admin session is supplied.

Limits: this gate does not replace browser end-to-end checks, a full security
audit, or separate Deno Edge Function type/deployment checks. Existing shared
backend policies and selected real SQL migrations are tested. It does not
perform a fresh provider verification or change public verification dates.

## First-change verification and rollout

Verified on Node **22.20.0** in a separate fresh temporary checkout:

- `npm ci` succeeded with no inherited `node_modules`, private environment file,
  or former temporary PGlite installation. Existing locked package versions
  were preserved; PGlite 0.5.8 is the added development dependency.
- TypeScript and **298 application/configuration tests across 29 files** passed.
- **14 source-review SQL checks and 8 publication SQL checks** passed against
  isolated in-memory PostgreSQL. No production SQL was executed.
- The offline/secret-free gate passed, producing **95 indexable routes**, and
  the tests passed again after the offline build regenerated its legacy catalog.
- The production-profile gate also passed, reading only anonymous public data:
  **67 resources, 13 affordable properties, 21 waitlists, 119 indexable routes**.
  All four bundle budgets passed in both modes. Existing SSR dynamic/static
  import warnings remain non-blocking; this change does not modify those modules.
- An intentional failing test in the temporary checkout returned nonzero and
  stopped the database/build stages; the prior manifest remained unchanged. The
  intentional failure file was then removed from that test checkout.
- The first repeated-build test exposed a provider-count assertion tied to a
  mutable catalog. Controlled fixtures now assert exact service-area/category
  matching, statewide inclusion, priority/alphabetical ordering and empty
  results. Provider-count quotas are not a software unit-test substitute for a
  content audit, and this change restores no retired or unpublished records.
- Generated catalog/build artifacts stayed in the isolated checkout. No app
  runtime source, production records, live publication flags, waitlists,
  scheduled jobs or provider communications were changed by this step.

### Remote release checkpoint — September 6, 2026 (Pacific)

[PR 40](https://github.com/hugosmoreira/HousingNavigator/pull/40) tracks the
release and its final production verification. The initial remote GitHub
**Quality checks** run and Netlify deploy preview passed. The preview manifest
matched all **67** current published resource records; every detail page and
sitemap path passed verification, and anonymous refresh requests were rejected.

The `main` protection settings were applied and read back: **Quality checks**
must come from GitHub Actions (app 15368), branches must be up to date, and the
requirement applies to administrators. Force pushes and branch deletion are
disabled. No additional approving-review requirement was introduced.

The release must merge without an administrator bypass. Before marking the
rollout finished, match the production deployment marker to the merge commit,
repeat the 67-resource public audit, and compare all resource, service-area,
affordable-property and waitlist rows to the private pre-release snapshot.
Record those final results on PR 40; do not commit the snapshot. Continue with
Step 2 only after that release handoff.
