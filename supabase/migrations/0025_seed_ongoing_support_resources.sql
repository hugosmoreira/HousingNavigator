-- Four approved ongoing services, verified against provider pages 2026-09-04.
-- No vacancies, dated events, Home Forward records, or existing-row updates.
-- All inserts and service areas commit together. Replaying preserves edits.
begin;

do $batch$
declare
  candidates jsonb := $resources$
[
  {
    "id": "c30e6eae-94eb-4cee-b3fa-ff9b30d3cbd1",
    "name": "Save First - Free Financial Education",
    "description": "Free classes on budgeting, saving, credit, banking, and managing debt. Online sessions and some in-person classes are available; visit the provider's calendar to choose a class and register.",
    "who_qualifies": "Community members interested in financial education. The provider lists its live classes as free and open to the community; check each class for its format and registration instructions.",
    "who_it_helps": ["single_adult", "family", "senior", "veteran", "disability"],
    "phone": "866-996-0334",
    "website": "https://www.savefirstfinancial.org/calendar",
    "source_url": "https://www.savefirstfinancial.org/calendar",
    "city": "Vancouver",
    "state": "WA",
    "county": "Other",
    "public_notes": "Register through the current class calendar. Separate one-to-one coaching and on-demand courses may have fees; this listing is for the free live classes. Online classes provide access beyond the provider's Vancouver office.",
    "service_tags": ["financial_education"],
    "service_areas": [{"state":"WA","county":null},{"state":"OR","county":null}]
  },
  {
    "id": "9e606cc9-6f5b-48b2-99a4-a288c69d1e77",
    "name": "Community Action - Financial Education",
    "description": "Free online classes on budgeting, saving, banking, credit, and retirement. Choose a session on the provider's website and register to receive the class link by email.",
    "who_qualifies": "Residents of Washington County, Oregon. Classes are held online, and Spanish interpreters are available in every class.",
    "who_it_helps": ["single_adult", "family", "senior", "veteran", "disability"],
    "phone": "971-226-9066",
    "website": "https://caowash.org/economic-empowerment/financial-education",
    "source_url": "https://caowash.org/economic-empowerment/financial-education",
    "city": null,
    "state": "OR",
    "county": "Washington",
    "public_notes": "Register for one or more classes using the provider's current schedule. For questions or help registering, call 971-226-9066 or email IDA@caowash.org. This is financial education, not a cash-assistance program.",
    "service_tags": ["financial_education"],
    "service_areas": [{"state":"OR","county":"Washington"}]
  },
  {
    "id": "8bd71117-b862-4d65-b9b4-064a40a1b447",
    "name": "T-Mobile Project 10Million - Student Internet Assistance",
    "description": "A free mobile hotspot and 200GB of internet data per year for five years for eligible K-12 student households. A parent or guardian can apply directly through T-Mobile; this is not unlimited home internet.",
    "who_qualifies": "Households with an eligible K-12 student. A parent or guardian must provide proof of eligibility through a qualifying program such as the National School Lunch Program, SNAP, Medicaid, Community Eligibility Provision, or Food Distribution Program on Indian Reservations. Check T-Mobile's current documentation and coverage requirements.",
    "who_it_helps": ["family"],
    "phone": null,
    "website": "https://www.t-mobile.com/brand/project-10-million",
    "source_url": "https://www.t-mobile.com/brand/project-10-million",
    "city": null,
    "state": "OR",
    "county": "Other",
    "public_notes": "One hotspot per household. The free data allowance is 200GB per year, not per month; optional extra data costs money. Availability is limited and mobile coverage varies. The program serves eligible households beyond Oregon and Washington as well.",
    "service_tags": ["internet_assistance"],
    "service_areas": [{"state":"OR","county":null},{"state":"WA","county":null}]
  },
  {
    "id": "ac168c7b-4155-4f72-8b8a-c741d2d12bf8",
    "name": "Just in Case Oregon - Free Mailed Naloxone",
    "description": "Request free nasal naloxone, a medicine that can reverse an opioid overdose, to be mailed in plain packaging. Use the program's online request form; instructions are included with the order.",
    "who_qualifies": "People in Oregon with access to a mailing address that can receive the order. No prescription, ID check, or insurance is required. Agencies, organizations, and schools should use the separate bulk-ordering program linked on the provider's website.",
    "who_it_helps": ["single_adult", "family", "senior", "veteran", "disability"],
    "phone": null,
    "website": "https://justincaseoregon.org/",
    "source_url": "https://justincaseoregon.org/",
    "city": null,
    "state": "OR",
    "county": "Other",
    "public_notes": "Request supplies in advance; mailed orders are not an emergency response service. For an emergency, call 911. Contact info@justincaseoregon.org for order questions. Follow the instructions supplied with the medicine.",
    "service_tags": ["health_support"],
    "service_areas": [{"state":"OR","county":null}]
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
      published, service_tags
    ) values (
      (candidate->>'id')::uuid, candidate->>'name', 'supportive_services',
      candidate->>'county', candidate->>'city', candidate->>'state',
      candidate->>'description', candidate->>'who_qualifies',
      array(select jsonb_array_elements_text(candidate->'who_it_helps')),
      'online', false, candidate->>'phone', candidate->>'website',
      candidate->>'source_url', 'Provider website', date '2026-09-04',
      candidate->>'public_notes', 3, true,
      array(select jsonb_array_elements_text(candidate->'service_tags'))
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
