# Explore map (`/map`)

An interactive 2D/3D map of affordable housing in Portland, with a second
"Explore the data" view. It is a client-only route inside the existing app
and layout, linked from the main navigation as **Explore map** ("Map" between
the `lg` and `xl` breakpoints so the bar stays on one line).

**Status: preview.** `/map` is served from `spa.html` and marked `noindex`
while it is evaluated. Page views are counted under the analytics page name
`map`, so usage can be compared with the rest of the site.

## What visitors can do

- Switch between a flat 2D map and a pitched 3D city view. The camera eases
  between them, and 3D columns grow out of the ground.
- See every published Housing Navigator listing with a geocoded address
  (blue; green when the linked waitlist is open) and every City-financed
  rental building from the Portland Housing Bureau (muted). In 3D, each
  property is a column whose height is its number of homes. Closer in, the
  OpenStreetMap building under each property is highlighted.
- Click a point, a highlighted building or a list row to fly to it and open a
  details card. Listing cards link to the existing property page and the
  official application link. City records say plainly that Housing Navigator
  has not verified application details.
- Search by property name, street address, ZIP code, sponsor organization or
  Portland neighborhood. "Show all matches" filters the map to the search.
- Filter by unit size, income limit (AMI), property type and "accepting
  applications", and turn the City layer on or off.
- Read totals for the area in view (properties, homes, homes accepting
  applications; City buildings, income-restricted homes, homes at 30% AMI).
  Numbers animate as the map moves.
- Take a guided tour built only from loaded data.
- Switch between a day and a night basemap (remembered per browser).
- Share the exact view: mode, 2D/3D, selection, highlighted group, filters,
  layer and camera are kept in the URL.

### Explore the data

A data view over the City-financed buildings, from City records only:

- Totals: buildings, homes, income-restricted homes, homes at 30% AMI or less.
- Bar charts of income-restricted homes by neighborhood, by income level (AMI
  tier), and by the organization the City records as project sponsor. Every
  value is printed next to its bar.
- The map shades each neighborhood from light to dark by its
  income-restricted homes. Picking a bar, or clicking a neighborhood on the
  map, lights up those buildings, greys out the rest and moves the camera.

This replaced an earlier "Who owns Portland?" view. Ownership records
(county assessor, corporate filings) are not loaded yet, so a view built
around ownership could only show roles with caveats. The sponsor chart is
labeled as a sponsor, not an owner. Ownership remains a planned layer; see
"Proposed database changes" below.

Privacy and naming rules (enforced in `scripts/syncPortlandRentalPortfolio.ts`):

- Sponsor names are published only when they appear in the hand-reviewed list
  `scripts/data/phbSponsors.json`. Names of private individuals are never
  published, and a new, unreviewed name is withheld and printed by the sync
  script so a curator can add it to the right list.
- Aliases in that file merge only spellings of the same organization (for
  example "REACH CDC" and "Reach CDC").
- Loan borrower names are not copied at all.

## Data

| Layer | Source | How it gets here |
| --- | --- | --- |
| Housing Navigator listings | Existing `affordable_properties` data (`useAffordableProperties`, snapshot first, live Supabase when configured) | Unchanged data path |
| Listing coordinates | U.S. Census Bureau geocoder (public domain) | `npm run geocode:properties` writes `src/data/affordablePropertyLocations.json`, keyed by property id |
| City-financed buildings | Portland Housing Bureau "Rental Portfolio", City of Portland open data (379 records with a location, 26,140 homes) | `npm run map-data:sync` writes `public/data/portland-rental-portfolio.json`, fetched only by `/map` |
| Neighborhoods | City of Portland "Neighborhood Boundaries" (by-law boundaries of neighborhood associations) | The same sync script assigns each City building to the neighborhood that contains it and writes simplified shapes to `public/data/portland-neighborhoods.json` (fetched only by the data view). 366 of 379 buildings fall inside a Portland neighborhood; the rest (Gresham, Milwaukie and similar) are grouped as "Outside Portland neighborhoods". |
| Neighborhood search targets | Approximate centers of Portland neighborhoods, checked against OpenStreetMap, for neighborhoods with no City-financed buildings | `src/map/places.ts` |
| Basemap and 3D buildings | OpenStreetMap via OpenFreeMap (OpenMapTiles schema, `render_height`) | Fetched at runtime from `tiles.openfreemap.org` |

Neither script runs during the build. Run them by hand, review the diff, and
commit. The geocoder only looks up properties that are new or whose address
changed, and prints a warning when the Census match differs from the
published address.

Listings and City records for the same building (same house number and
street, or within 60 m with a shared distinctive name word) are shown as one
point. The listing's own facts are always used; the City figures appear in a
separate, sourced note.

**Records to check** (found by the geocoder, not changed):

- Dolores Apartments is published as "9965 NE Walker Road … 97223". The Census
  match is "9965 NW Walker Rd, Hillsboro, OR 97006".
- Jim and Salle's Place is published on "SE Steele Avenue". The Census match
  and the City record say "SE Steele St".
- Armonía Apartments has no street address, so it is not on the map.

## Architecture

- **Engine:** MapLibre GL JS 6 (BSD-3), used directly through a small
  imperative controller (`src/map/housingMap.ts`) instead of a React wrapper,
  so camera flights, tours and highlights stay simple. No Mapbox token,
  deck.gl, Three.js or animation library: MapLibre's camera, GeoJSON circle,
  symbol and fill-extrusion layers cover everything here, and CSS handles
  panel motion. Visual approach inspired by BUILD416 (MIT,
  Copyright (c) 2026 Nelson Lee); no code or assets were copied.
- **Loading:** `/map` is a lazy route. The page chunk is ~24 KB gzip; the map
  engine (~296 KB gzip) and its worker (~146 KB gzip) load only when the map
  mounts. Other pages never download them.
- **Basemap styling:** OpenFreeMap's `liberty` style is recolored at runtime
  from a palette (`src/map/mapStyle.ts`), so upstream style fixes keep flowing.
- **Building highlights:** building ids in the tiles are not unique (the
  tiles merge neighbors), so the footprint under each property is copied into
  its own slightly larger extrusion rather than recolored by feature-state.
  Each footprint is found with a rendered-features query, which takes about
  8 ms on a desktop at a steep pitch and about four times that on a mid-range
  phone. Matches are remembered per property and zoom level, queries wait
  until the map is still and its tiles are loaded, and a pass yields to the
  page after 8 ms. Before this, settling at street level downtown froze a
  mid-range phone for 1.2 s and again for 1.0 s, because every refresh
  repeated all 60 queries.
- **Tile requests:** MapLibre loads a basemap tile from the top zoom (14)
  once for every overscaled zoom it is drawn at, and again for each fallback
  parent while a sharper copy loads. The browser downloaded every copy: the
  desktop intro received 8.9 MB from the tile host for 5.3 MB of distinct
  tiles. Basemap tile URLs are rewritten to an `hn-tile://` protocol
  (`src/map/tileRequests.ts`), so copies requested while one is in flight
  share its download. Repeats after that are answered by the HTTP cache.
- **Fallbacks:** WebGL2 is checked before loading the engine. MapLibre's
  `GPUInitializationError` and repeated tile failures show a message while
  the panel and list keep working. A lost WebGL context (common when a phone
  backgrounds the page) is only treated as an error if MapLibre does not
  restore it within 8 seconds; after a restore, theme and data layers are
  re-applied. A local error boundary keeps a map crash from blanking the site.
- **Idle cost:** building highlights refresh when the map settles, but only
  push new data when the matched footprints change, so an untouched map does
  not keep redrawing.
- **Motion and devices:** honors `prefers-reduced-motion` (camera jumps
  instead of flying, no intro, no tour autoplay, no pulse). Devices with
  little memory or Data Saver start in 2D without the intro, antialiasing or
  high pixel ratios. Screens narrower than 1024 px open on the overview
  without the intro: its street-level start needs the heaviest downtown
  tiles before anything draws. Measured on a mid-range phone over slow 4G,
  skipping the intro brought the first complete map from about 15 s to 8 s and
  the download from 2.8 MB to 1.2 MB.
- **Accessibility:** every map point is also reachable from the panel list;
  controls are labeled buttons; search is a combobox with arrow-key support;
  the map canvas has keyboard pan/zoom.

### Files

```
src/pages/MapExplorer.tsx          page: data, URL state, layout, tour
src/map/housingMap.ts              MapLibre controller (dynamic import)
src/map/MapCanvas.tsx              React host + error boundary
src/map/mapStyle.ts                palettes and basemap recoloring
src/map/mapData.ts                 items, filters, stats, data-view breakdowns
src/map/regulatedHousing.ts        City layer types, loading, matching
src/map/mapUrlState.ts             shareable URL state
src/map/DataPanel.tsx              "Explore the data" charts
src/map/MapSearch.tsx, MapFilters.tsx, MapStats.tsx, PlaceList.tsx,
  PropertyDetails.tsx, MapControls.tsx, BottomSheet.tsx
src/map/tileRequests.ts            one download per basemap tile URL in flight
src/map/tour.ts, places.ts, motion.ts, device.ts, map.css, map-ui.css
src/data/affordablePropertyLocations.{ts,json}
public/data/portland-rental-portfolio.json, portland-neighborhoods.json
scripts/geocodeAffordableProperties.ts, scripts/syncPortlandRentalPortfolio.ts
scripts/data/phbSponsors.json      reviewed sponsor names (privacy list)
```

Changed existing files: `AppRoutes.tsx` (lazy route), `Layout.tsx` (nav item,
full-height main without footer on `/map`), `pageMetadata.ts` (noindex
metadata), `analytics.ts` (page view name), `netlify.toml` (redirect and CSP),
`vite.config.ts` (named `maplibre` chunk, worker emitted as `.js`),
`scripts/checkBundleBudget.ts` and `bundleBudget.ts` (own budget for the map
engine), `package.json` (dependency and two scripts).

## Production notes

- **CSP:** `connect-src` adds `https://tiles.openfreemap.org` (style, tiles,
  fonts, sprites). `img-src` adds `blob:` for MapLibre's image fallback. The
  worker is a same-origin file, so `script-src 'self'` already covers it.
  Tested against the live policy with zero violations.
- **Worker file type:** the worker is emitted as `assets/maplibre-gl-worker-*.js`
  rather than `.mjs`, so Netlify serves it as JavaScript under `nosniff`.
- **Bundle budget:** initial JS and CSS budgets are unchanged and pass. The
  map engine has its own ceiling (1,700 KiB raw / 470 KiB gzip) and is
  asserted never to load with the first page.
- **OpenFreeMap:** free, no key, commercial use allowed, no request limits,
  but no SLA. If it ever goes away, the fallback is a self-hosted Protomaps
  PMTiles extract of the Portland area in Supabase Storage (already allowed by
  `connect-src`). Keep the map attribution visible.
- **City data terms:** the layer metadata says it is distributed under the
  City of Portland Data Distribution Policy and provided as is; the City's
  open data terms apply the Public Domain Dedication and License, while the
  City's ArcGIS hub lists CC-BY-SA. The page credits the source either way.
  Confirming with the City's GIS team (CGIS) before launch is recommended.

## To launch publicly

1. Move the `/map` entry from `PRIVATE_PAGE_METADATA` to
   `INDEXABLE_PAGE_METADATA`, add `'/map'` to `PAGE_LABELS` in
   `structuredData.ts`, and add the URL to `public/sitemap.xml`.
2. Add `MapExplorer` to `PublicPageComponents` (lazy in `App.tsx`, eager in
   `AppServer.tsx`) so a static shell is prerendered, and remove the `/map`
   redirect from `netlify.toml` and `netlifyRouting.test.ts`. The page picks
   its opening camera and the intro from the screen width on its first
   render, and a hydrated shell reports a narrow screen on that render, so
   read the width after hydration first.
3. Store coordinates in the database (below) so new listings appear on the
   map without running the geocoder by hand.

## Proposed database changes (not applied)

Nothing below has been run. All of it is additive.

**Listing coordinates** — replaces the JSON sidecar once the admin form can
set or geocode a location:

```sql
alter table public.affordable_properties
  add column if not exists latitude double precision
    check (latitude is null or latitude between -90 and 90),
  add column if not exists longitude double precision
    check (longitude is null or longitude between -180 and 180),
  add column if not exists location_source text,
  add column if not exists location_checked_on date;
-- Then add the four columns to the affordable_properties_public view, the
-- anon column grants, AFFORDABLE_PROPERTY_COLUMNS, AffordablePropertyRow and
-- affordablePropertyFromRow.
```

**Ownership** — sourced claims with confidence, in a separate schema area so
no existing table changes:

```sql
create extension if not exists postgis with schema extensions;

create table public.source_datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  publisher text not null,
  url text not null,
  license text,
  attribution_text text,
  update_cadence text,
  created_at timestamptz not null default now()
);

create table public.source_records (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.source_datasets (id),
  external_id text not null,          -- e.g. county PROPID, SOS registry number
  as_of date,                          -- roll year or dataset date
  fetched_at timestamptz not null default now(),
  raw jsonb not null,
  unique (dataset_id, external_id, as_of)
);

create table public.parcels (
  id uuid primary key default gen_random_uuid(),
  county text not null,                -- M, C or W
  propid text not null,                -- county R-number
  map_taxlot text,
  situs_address text,
  prop_class text,
  units_band text,
  footprint extensions.geometry(MultiPolygon, 4326),
  source_record_id uuid references public.source_records (id),
  unique (county, propid)
);
create index parcels_footprint_gix on public.parcels using gist (footprint);

create table public.ownership_entities (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  normalized_name text not null,
  entity_kind text not null default 'unknown'
    check (entity_kind in ('person', 'llc', 'corporation', 'lp', 'nonprofit',
      'trust', 'housing_authority', 'government', 'unknown')),
  sos_registry_number text,
  is_natural_person boolean not null default false,
  display_policy text not null default 'show' check (display_policy in ('show', 'mask', 'hide'))
);

create table public.property_owner_relationships (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid references public.parcels (id),
  affordable_property_id uuid references public.affordable_properties (id),
  entity_id uuid not null references public.ownership_entities (id),
  relationship_type text not null check (relationship_type in
    ('recorded_owner', 'property_manager', 'parent_company', 'sponsor', 'borrower')),
  source_record_id uuid not null references public.source_records (id),
  observed_at date not null,
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  confidence_basis text not null check (confidence_basis in
    ('direct_record', 'exact_address', 'name_variant', 'program_record', 'manual_research')),
  verification_status text not null default 'unverified' check (verification_status in
    ('unverified', 'auto_matched', 'human_verified', 'disputed', 'retracted')),
  public_note text,
  check (parcel_id is not null or affordable_property_id is not null)
);
```

Row-level security: enable it on every table, grant anon `select` only on
views that expose `display_policy = 'show'` entities and non-retracted
relationships, and keep writes admin-only through `is_admin()`, following
`0020_affordable_properties.sql`.

PostGIS earns its place once parcels and footprints are loaded: joining City
and state points to parcels (`ST_DWithin`), neighborhood roll-ups
(`ST_Intersects`), and serving viewport tiles from an RPC (`ST_AsMVT`). The
current 400 points do not need it.

### Ownership sources researched

| Source | Owner data | Access | Verdict |
| --- | --- | --- | --- |
| Multnomah County Tax Parcels (county open data) | Owner name and mailing address, property class, deeds | ArcGIS FeatureServer, no key | Best source for recorded owners. Confirm license (hub lists CC-BY-SA; layer has only a disclaimer). |
| Metro RLIS Taxlots (Public) | None (public/private flag only) | FeatureServer, quarterly | Geometry and attributes; RLIS open license with attribution. |
| PortlandMaps API | Owner per property | Requires a key | Per-property verification, not bulk. |
| Oregon SOS Active Businesses | Registered agent, authorized rep, addresses; no members or managers | Socrata, weekly | Entity identity only. Never link portfolios through commercial registered agents. |
| OHCS Oregon Affordable Housing Inventory | Self-reported owner and manager names, AMI counts, expirations | Socrata, annual | Useful second source; many blanks. |
| Portland rental registration | — | Confidential (DA order 25-66) | Not usable. |

Before publishing owner names: show non-person owners only, mask natural
persons, show source, date, confidence and verification on every claim, and
offer a correction channel. Have counsel review.
