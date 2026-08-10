# Existing resource curation

Status: admin-triggered, idempotent workflow
Last updated: 2026-08-10

## Purpose

The resource curation workflow strengthens records already published in Housing
Navigator. It is intentionally separate from resource discovery and from the
waitlist status checker.

An administrator starts it from **Admin → Resources → Curate resources**. The
workflow checks resources that are missing required public information:

- description;
- who qualifies for categories where eligibility controls access, such as rent
  assistance, shelters, public housing, waitlists, and legal aid; or
- a usable official page in either `source_url` or `website`.

Internal household tags (`who_it_helps`) and verification dates are enrichment
fields. The workflow may fill them while it is already checking a resource, but
their absence alone never causes a completed record to be processed again.

It does not search for or create new resources.

## Product decisions

- **No schedule or background daemon.** Work begins only after an admin clicks
  the button. The page requests batches of three. If the page is closed, the
  current server request can finish, but no later batch is requested.
- **Existing writing wins.** Curation fills blank fields; it does not replace a
  description or eligibility text already written by an administrator.
- **Reruns are idempotent.** A completed resource is not targeted because an
  optional tag is blank, because the official page is stored in `website`
  instead of `source_url`, or because its verification date is blank. A
  same-day verification date is not written or counted twice.
- **Official pages only.** A record's `source_url` is used first, with its
  existing `website` as a fallback. The first version does not crawl the web for
  new organizations.
- **Evidence before edits.** Generated descriptions, eligibility, and household
  tags require a verbatim supporting quote from the fetched page. Resource
  identity must also be supported and model confidence must be at least 0.75.
- **Plain language.** The extraction prompt asks for short, user-facing copy and
  excludes website-platform jargon such as RentCafe.
- **Failures are visible.** Blocked, JavaScript-only, ambiguous, low-confidence,
  concurrently edited, and internal-error records appear under “Unresolved
  items from the last run.” A partial update that still lacks required
  information appears only in the unresolved section and is counted as needing
  review, while its applied fields remain visible. The panel does not truncate
  the unresolved list. A no-progress guard stops the browser from repeating a
  broken batch indefinitely.
- **Auditability.** Each run keeps its original target IDs, progress totals,
  proposed values, evidence, applied field names, and errors.

## Architecture

1. `ResourceCurationPanel.tsx` displays the button and calls one bounded batch at
   a time. It contains no extraction or update rules. Afterward it shows the
   fields filled for recent records and a separate list of exceptions.
2. `curateResources.ts` is the browser's typed Edge Function client.
3. `curate-resources/index.ts` validates the signed-in user against
   `admin_users`, safely fetches the stored public URL, asks Claude for structured
   extraction, and writes the audit result.
4. `_shared/resourceCuration.ts` owns the fill-only and evidence-validation
   rules. Keeping this logic independent makes it testable and prevents a second
   importer or UI from implementing different rules.
5. Migration `0017_resource_curation.sql` creates the two admin-readable audit
   tables. It deliberately creates no cron job or trigger.

The existing SSRF-resistant fetch implementation in
`_shared/checkerSecurity.ts` validates public HTTP(S) destinations, DNS results,
redirects, and response-size limits before curation reads a page.

## Fields the first version may change

| Field | Rule |
| --- | --- |
| `description` | Fill only when blank and supported by page evidence. |
| `who_qualifies` | Fill only when blank and explicitly stated. |
| `who_it_helps` | Fill only when empty; values are restricted to the existing taxonomy. |
| `source_url` | Fill only when blank, after page identity is verified. |
| `source_type` | Fill only when blank; value is `agency_website`. |
| `last_verified` | Set when the official page supports a resource claim and the stored date is not already today's date. |

It never changes the resource name, category, county, phone, application method,
referral setting, publication status, public notes, or internal notes.

Updates include an `updated_at` optimistic lock. If an administrator changes a
record during a run, the generated patch is not applied and the record is marked
as an edit conflict. The resource patch and its evidence audit row are written by
one database function in a single transaction, so they cannot diverge.

## Database records

- `resource_curation_runs`: one row per button-started run and its progress.
- `resource_curation_checks`: one row per targeted resource, including proposed
  fields, applied fields, evidence, notes, and any error.

Authenticated administrators may read these tables through RLS. Only the Edge
Function's service role can insert or update the audit rows.

## Deployment

Apply migrations through `0017_resource_curation.sql`, then deploy the function:

```powershell
supabase db push
supabase functions deploy curate-resources --no-verify-jwt
```

Required Supabase Edge Function secrets:

```text
ANTHROPIC_API_KEY=...
APP_URL=https://housingnavigator.us
```

Optional:

```text
RESOURCE_CURATION_MODEL=...
```

If `RESOURCE_CURATION_MODEL` is absent, the function uses `CLAUDE_MODEL`, then
the same default model used by the current waitlist checker.

## Verification checklist

1. Sign in as an administrator and open **Resources**.
2. Click **Curate resources** and confirm the prompt.
3. Confirm the progress count advances and the final summary appears.
4. Open two or three updated resources and compare the filled fields with the
   official source URL.
5. Review every item shown under “Unresolved items from the last run.”
6. Confirm existing nonblank descriptions were not rewritten.
7. Run curation again without editing any resources. Confirm it reports no
   duplicate updates and does not re-list manually completed records.
8. Re-run the unit tests and production build before deployment.

## Deliberately deferred

- discovering or inserting new resources;
- scheduled re-verification or stale-record monitoring;
- following arbitrary links to find deeper program pages;
- automatically replacing existing curated text;
- broad Oregon/Washington expansion logic.

Those decisions should be evaluated only after the existing-resource run has
been tested against the live catalog and its exceptions are understood.
