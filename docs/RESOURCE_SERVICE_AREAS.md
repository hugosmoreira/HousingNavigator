# Resource service areas

Housing resources can serve one county, several counties, or an entire state.
The provider's office address is not used to decide who the resource serves.

## Data model

Migration `0019_resource_service_areas.sql` adds
`public.resource_service_areas`:

| Column | Meaning |
| --- | --- |
| `resource_id` | The canonical resource. Deleting it cascades to its areas. |
| `state` | `OR` or `WA`. |
| `county` | Official county name, or `NULL` for statewide coverage. |
| `sort_order` | Preserves the admin-selected primary/display order. |

`resources.state` and `resources.county` remain compatibility fields. The
first selected service area is copied into them by the admin RPC. Public and
admin resource views expose an aggregated `service_areas` JSON array.

The migration backfills existing records. Blank legacy states are inferred as
Washington for Clark County and Oregon for the existing Oregon counties.

## Admin workflow

1. Open **Admin → Resources → New resource**.
2. Add every county confirmed by the official program page.
3. Use **All counties (statewide)** only when the source explicitly describes
   statewide service.
4. Enter the provider's city/address separately when it helps someone reach an
   intake location.
5. Save as a draft, review the public detail page, then publish.

The editor calls `replace_resource_service_areas`, which validates the complete
list before replacing the previous areas. Invalid or incomplete requests cannot
partially erase a resource's coverage.

## Public behavior

- The directory first filters by state, then by counties that actually appear
  in published resources.
- A statewide resource appears for every county in its state.
- Multi-county resources remain one canonical record.
- Search, cards, detail pages, saved resources, local landing pages, and
  structured data all use the same service-area helpers.

## Deployment order

1. Apply migration `0019_resource_service_areas.sql`.
2. Deploy the frontend containing the service-area-aware admin form and public
   directory.
3. Add new resources as drafts and publish only after manual review.

The migration is backward compatible, so applying it before the frontend is
safe. The old `county` and `state` fields continue to work during rollout.
