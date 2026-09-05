-- Six source-researched move-in support programs. Insert-only; includes hidden-record duplicate checks.
-- Pilot records start as drafts for source-check and public-preview testing; no existing records change.
begin;

do $batch$
declare
  candidates jsonb := $resources$
[
  {
    "name": "Community Warehouse - Furniture and Household Goods",
    "description": "Furniture and household essentials for people setting up a home. Request an appointment yourself or through a partner agency at the Portland, Tigard or Gresham furniture bank.",
    "who_qualifies": "People who lack essential furniture. A partner agency may help arrange access and cover fees. Self-referrals are also accepted; contact Community Warehouse to confirm your address and delivery options.",
    "cost_details": "Self-referral: $150 for furniture, plus $250 if delivery is needed. Agency support may cover fees; do not assume the service is free.",
    "who_it_helps": [
      "single_adult",
      "family",
      "senior",
      "veteran",
      "disability"
    ],
    "phone": "503-235-8786 ext. 1008",
    "website": "https://www.communitywarehouse.org/get-furniture/",
    "city": "Portland",
    "state": "OR",
    "county": "Multnomah",
    "public_notes": "Furniture depends on donated inventory. Delivery of furniture is not a service for moving your existing household. Call or use the provider's contact page to arrange an appointment. Confirm service and delivery boundaries directly.",
    "service_tags": [
      "furniture"
    ],
    "service_areas": [
      {
        "state": "OR",
        "county": "Multnomah"
      },
      {
        "state": "OR",
        "county": "Washington"
      },
      {
        "state": "OR",
        "county": "Clackamas"
      }
    ],
    "application_method": "phone",
    "referral_required": false,
    "id": "66060904-0001-4000-8000-000000000001",
    "source_url": "https://www.communitywarehouse.org/get-furniture/"
  },
  {
    "name": "NW Furniture Bank - Furniture Assistance",
    "description": "Furniture for people who have stable housing but lack essential furnishings. An approved community partner must refer you to the Tacoma or Vancouver furniture bank.",
    "who_qualifies": "People in stable housing who need basic furniture and have an approved agency referral. Serves Pierce, South King, Clark and Cowlitz counties; not all of King County. Delivery eligibility depends on the address.",
    "cost_details": "$100 nonrefundable processing fee. Delivery costs an additional $150; beds, mattresses and box springs have separate charges.",
    "who_it_helps": [
      "single_adult",
      "family",
      "senior",
      "veteran",
      "disability"
    ],
    "phone": "360-787-7144",
    "website": "https://www.nwfurniturebank.org/need-furniture/",
    "city": "Vancouver",
    "state": "WA",
    "county": "Clark",
    "public_notes": "The bank does not provide help paying its fees. Delivery is generally limited to about 20 miles from its locations and cannot cross into Oregon. Tacoma: 253-302-3868. If collecting furniture, arrange a suitable vehicle and confirm pickup requirements.",
    "service_tags": [
      "furniture"
    ],
    "service_areas": [
      {
        "state": "WA",
        "county": "Clark"
      },
      {
        "state": "WA",
        "county": "Cowlitz"
      },
      {
        "state": "WA",
        "county": "Pierce"
      },
      {
        "state": "WA",
        "county": "King"
      }
    ],
    "application_method": "referral",
    "referral_required": true,
    "id": "66060904-0002-4000-8000-000000000002",
    "source_url": "https://www.nwfurniturebank.org/need-furniture/"
  },
  {
    "name": "Oregon ODHS - Domestic Violence Relocation Assistance (TA-DVS)",
    "description": "Safety-related financial help for eligible domestic violence survivors. Assistance can cover housing or utility deposits, a moving truck, storage and essential replacement belongings.",
    "who_qualifies": "Oregon residents experiencing domestic violence who are pregnant or caring for a minor child, subject to ODHS income and other eligibility rules. Work with an ODHS office on a safety plan.",
    "cost_details": "Up to $3,200 over a 90-day assistance period, based on eligibility and needs. Payments go to approved providers or landlords, not unrestricted cash.",
    "who_it_helps": [
      "family"
    ],
    "phone": null,
    "website": "https://www.oregon.gov/odhs/dv/Pages/tadvs.aspx",
    "city": null,
    "state": "OR",
    "county": "Other",
    "public_notes": "Contact a local ODHS office by phone or in person to apply. This is a specialized safety program, not general moving assistance for every low-income household. Approval and payment timing must be confirmed with ODHS.",
    "service_tags": [
      "move_in_costs",
      "utility_help"
    ],
    "service_areas": [
      {
        "state": "OR",
        "county": null
      }
    ],
    "application_method": "phone",
    "referral_required": false,
    "id": "66060904-0003-4000-8000-000000000003",
    "source_url": "https://www.oregon.gov/odhs/dv/Pages/tadvs.aspx"
  },
  {
    "name": "Washington DSHS - Diversion Cash Assistance",
    "description": "Short-term financial assistance for eligible families who need help with housing, transportation or other essential expenses and do not need ongoing monthly TANF assistance.",
    "who_qualifies": "Washington families meeting TANF or State Family Assistance eligibility who can demonstrate resources or expected income to meet their longer-term needs. DSHS determines eligibility.",
    "cost_details": "Up to $2,000 during one 30-day period per year. A prorated amount must be repaid if the family starts TANF within the following year.",
    "who_it_helps": [
      "family"
    ],
    "phone": "877-501-2233",
    "website": "https://www.dshs.wa.gov/esa/diversion-cash-assistance-dca",
    "city": null,
    "state": "WA",
    "county": "Other",
    "public_notes": "Apply through Washington Connection, a local DSHS office, or by phone. This is not a guaranteed moving-company benefit; discuss the specific expense with DSHS before making arrangements.",
    "service_tags": [
      "move_in_costs"
    ],
    "service_areas": [
      {
        "state": "WA",
        "county": null
      }
    ],
    "application_method": "online",
    "referral_required": false,
    "id": "66060904-0004-4000-8000-000000000004",
    "source_url": "https://www.dshs.wa.gov/esa/diversion-cash-assistance-dca"
  },
  {
    "name": "PGE - Income-Qualified Bill Discount",
    "description": "A discount on eligible electricity charges for qualifying Portland General Electric residential customers. Apply directly through PGE to reduce future energy charges.",
    "who_qualifies": "Residential PGE customers who meet household income requirements. Your address must be served by PGE; living in a listed county alone does not qualify you.",
    "cost_details": "Discount of 15% to 80% on eligible energy charges. This is not cash assistance, payment of earlier charges or a utility-deposit grant.",
    "who_it_helps": [
      "single_adult",
      "family",
      "senior",
      "veteran",
      "disability"
    ],
    "phone": "503-228-6322",
    "website": "https://portlandgeneral.com/income-qualified-bill-discount",
    "city": null,
    "state": "OR",
    "county": "Multnomah",
    "public_notes": "Apply online or call PGE for help. PGE serves parts of seven Oregon counties, not every address in those counties. Other energy assistance may also be available; confirm options with the utility.",
    "service_tags": [
      "utility_help"
    ],
    "service_areas": [
      {
        "state": "OR",
        "county": "Multnomah"
      },
      {
        "state": "OR",
        "county": "Washington"
      },
      {
        "state": "OR",
        "county": "Clackamas"
      },
      {
        "state": "OR",
        "county": "Columbia"
      },
      {
        "state": "OR",
        "county": "Marion"
      },
      {
        "state": "OR",
        "county": "Polk"
      },
      {
        "state": "OR",
        "county": "Yamhill"
      }
    ],
    "application_method": "online",
    "referral_required": false,
    "id": "66060904-0005-4000-8000-000000000005",
    "source_url": "https://portlandgeneral.com/income-qualified-bill-discount"
  },
  {
    "name": "Clark Public Utilities - Operation Warm Heart",
    "description": "Electric heating bill assistance for qualifying Clark Public Utilities customers facing financial hardship. Contact the utility to ask about eligibility and available help.",
    "who_qualifies": "Qualifying Clark Public Utilities customers with financial need. Assistance is income-based; Clark County residency alone does not establish eligibility.",
    "cost_details": "Financial assistance depends on eligibility and available funds. Contact the utility for the amount and conditions; no benefit is guaranteed.",
    "who_it_helps": [
      "single_adult",
      "family",
      "senior",
      "veteran",
      "disability"
    ],
    "phone": "360-992-3000",
    "website": "https://www.clarkpublicutilities.com/residential-customers/financial-assistance/operation-warm-heart-financial-assistance/",
    "city": null,
    "state": "WA",
    "county": "Clark",
    "public_notes": "Call 360-992-3000 to request help. This program addresses electric heating bills; the source does not establish a general utility setup or deposit benefit.",
    "service_tags": [
      "utility_help"
    ],
    "service_areas": [
      {
        "state": "WA",
        "county": "Clark"
      }
    ],
    "application_method": "phone",
    "referral_required": false,
    "id": "66060904-0006-4000-8000-000000000006",
    "source_url": "https://www.clarkpublicutilities.com/residential-customers/financial-assistance/operation-warm-heart-financial-assistance/"
  }
]
$resources$::jsonb;
  candidate jsonb;
  inserted_id uuid;
begin
  -- Hidden records count as duplicates too. Stop for review rather than
  -- merging with another program from the same organization or resurrecting it.
  for candidate in select value from jsonb_array_elements(candidates) loop
    if exists (
      select 1 from public.resources r
      where r.id <> (candidate->>'id')::uuid and (
        regexp_replace(lower(r.name), '[^a-z0-9]', '', 'g') =
          regexp_replace(lower(candidate->>'name'), '[^a-z0-9]', '', 'g')
        or lower(rtrim(r.website, '/')) = lower(rtrim(candidate->>'website', '/'))
        or lower(rtrim(r.source_url, '/')) = lower(rtrim(candidate->>'source_url', '/'))
      )
    ) then
      raise exception 'Existing resource matches %. Review before adding.', candidate->>'name';
    end if;
  end loop;

  for candidate in select value from jsonb_array_elements(candidates) loop
    inserted_id := null;
    insert into public.resources (
      id, name, category, county, city, state, description, who_qualifies,
      who_it_helps, application_method, referral_required, phone, website,
      source_url, source_type, last_verified, public_notes, priority_score,
      published, service_tags, cost_details
    ) values (
      (candidate->>'id')::uuid, candidate->>'name', 'supportive_services',
      candidate->>'county', candidate->>'city', candidate->>'state',
      candidate->>'description', candidate->>'who_qualifies',
      array(select jsonb_array_elements_text(candidate->'who_it_helps')),
      candidate->>'application_method', (candidate->>'referral_required')::boolean, candidate->>'phone', candidate->>'website',
      candidate->>'source_url', 'Provider website', date '2026-09-04',
      candidate->>'public_notes', 3, false,
      array(select jsonb_array_elements_text(candidate->'service_tags')), candidate->>'cost_details'
    ) on conflict (id) do nothing returning id into inserted_id;

    if inserted_id is not null then
      insert into public.resource_service_areas (resource_id, state, county, sort_order)
      select inserted_id, a.value->>'state', a.value->>'county', (a.position - 1)::smallint
      from jsonb_array_elements(candidate->'service_areas')
        with ordinality as a(value, position)
      on conflict do nothing;
    end if;
  end loop;
end;
$batch$;

commit;
