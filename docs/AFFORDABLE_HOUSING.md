# Affordable housing property directory

Housing Navigator treats three kinds of records separately:

- **Resources** are services such as rent assistance, legal help, shelters, and housing navigation.
- **Affordable properties** are physical income-restricted apartment communities.
- **Waitlists** are time-sensitive application lists. A property-specific waitlist can be linked to one property, while voucher, public-housing, and mixed-program lists remain independent.

This separation prevents a service from appearing as an apartment and prevents an apartment description from becoming the source of truth for a changing waitlist status.

## Public experience

`/affordable-housing/` provides a compact property search with location, bedroom, and accepting-applications filters. Each detail page can show:

- property and management identity;
- address, unit count, and apartment sizes;
- supported AMI levels and plain-language eligibility;
- intended audiences and accessibility notes;
- phone, property website, application link, and official source;
- the last verification date; and
- a linked waitlist status and alert page when available.

Unknown information stays blank or is labeled as not published. It must not be inferred from unrelated sources.

## Admin workflow

Use **Admin → Affordable housing** to create or edit properties. New records default to drafts. Before publishing:

1. Confirm the record represents a physical apartment property.
2. Use the official owner, manager, government, or housing-authority page as the source.
3. Fill only facts supported by that source.
4. Record the verification date.
5. Link an existing waitlist only when it clearly represents that one property.
6. Preview the public detail page and then publish.

Property availability should not be copied into descriptive notes. If an existing waitlist tracks it, update the waitlist and allow the linked status to appear on the property. If no waitlist exists, the property page directs people to confirm availability with the manager.

## Database and snapshots

- `affordable_properties` stores canonical property records.
- `affordable_properties_public` exposes published, non-internal fields plus one linked published waitlist.
- `affordable_properties_admin` exposes complete records to administrators.
- `waitlists.waitlist_type` distinguishes property, voucher, public-housing, mixed, and other lists.
- `waitlists.affordable_property_id` creates the optional link.

Production builds run `npm run public-data:sync`, which writes the latest published property snapshot to `src/data/affordableProperties.json` for prerendering and resilient fallback.

## Adding more properties

Add properties manually in reviewed batches. Prefer depth over a large unverified scrape: correct addresses, source URLs, bedrooms, eligibility, and application pathways are more valuable than a high record count. A later assisted-intake tool can extract candidates, but publishing should remain an administrator decision.
