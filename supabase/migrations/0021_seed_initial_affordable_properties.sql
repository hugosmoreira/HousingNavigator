-- Housing Navigator -- first verified affordable-property records
--
-- These properties already appeared elsewhere in the catalog or waitlist
-- tracker. Moving them into the dedicated property model removes ambiguity
-- between a physical apartment building and a housing-navigation service.

begin;

insert into public.affordable_properties (
  id, name, owner_organization, management_company, property_type,
  address, city, county, state, postal_code, description,
  eligibility_summary, ami_levels, bedroom_types, audiences, total_units,
  accessibility_notes, phone, website, application_url, source_url,
  source_type, last_verified, public_notes, priority_score, published
) values
  (
    'dd2cd8f6-6bd1-46be-b3ad-a20c3725f155',
    'Dolores Apartments',
    'Hacienda Community Development Corporation',
    'Northwest Real Estate Capital Corp.',
    'affordable_apartments',
    '9965 NE Walker Road', 'Hillsboro', 'Washington', 'OR', null,
    'A 67-home affordable apartment community in Hillsboro with family-sized apartments, resident gathering spaces, a community garden, play area, and on-site supportive services.',
    'Households must meet the property income and occupancy requirements. Apartments serve households earning approximately 30% to 60% of area median income; ten homes are supportive housing for people transitioning out of homelessness.',
    array[30, 60]::smallint[], array['1', '2', '3', '4_plus'],
    array['general', 'families', 'formerly_homeless'], 67,
    'The three-story community is elevator-served. Contact management for unit-specific accessibility information.',
    '971-515-8137',
    'https://www.haciendacdc.org/properties/dolores',
    'https://www.haciendacdc.org/properties/dolores',
    'https://www.haciendacdc.org/properties/dolores',
    'Official owner website', '2026-08-11',
    'Contact the property manager to confirm current availability, rents, and required documentation.',
    100, true
  ),
  (
    '5c852f4a-8127-4928-aacf-74d7db60235f',
    'Centennial Place Apartments',
    'Cascadia Health',
    'Cascadia Health',
    'affordable_apartments',
    '3750 SE 164th Avenue', 'Portland', 'Multnomah', 'OR', null,
    'A 71-unit affordable apartment community in the Centennial School District with studios, one-bedroom, and two-bedroom homes plus community rooms and a courtyard.',
    'Households must meet the property income, occupancy, and minimum-income requirements. The property serves households within approximately 30% to 60% of median family income; the current application page may identify a narrower range for a particular opening.',
    array[30, 50, 60]::smallint[], array['studio', '1', '2'],
    array['general', 'families'], 71,
    null, '503-674-7777',
    'https://cascadiahealth.org/centennial-application/',
    'https://cascadiahealth.org/centennial-application/',
    'https://cascadiahealth.org/centennial-application/',
    'Official owner website', '2026-08-11',
    'Review the linked waitlist status before starting an application. Unit availability is not guaranteed.',
    95, true
  ),
  (
    '31fb31fe-3f97-42a0-b61e-a387ef89eb27',
    'Blackburn Center Apartments',
    'Central City Concern',
    'Central City Concern',
    'supportive_housing',
    '12015 E Burnside Street', 'Portland', 'Multnomah', 'OR', '97216',
    'A 124-unit affordable and supportive housing community combining 90 single-room occupancy homes, 34 studios, an on-site health clinic, and resident services near the E 122nd Avenue MAX station.',
    'Eligibility depends on the unit and waitlist. Some homes prioritize or require participation in substance-use recovery, while other units do not have a recovery requirement. Review the current building criteria before applying.',
    array[]::smallint[], array['sro', 'studio'],
    array['general', 'formerly_homeless', 'recovery'], 124,
    'The official property page lists the building as wheelchair accessible. Contact the housing office about a specific unit or reasonable accommodation.',
    '503-525-8483',
    'https://centralcityconcern.org/housing-location/blackburn/',
    'https://centralcityconcern.org/housing-location/blackburn/',
    'https://centralcityconcern.org/housing-location/blackburn/',
    'Official owner website', '2026-08-11',
    'Blackburn has different unit types with different eligibility rules. Confirm which list is accepting applications.',
    95, true
  ),
  (
    'c637a33c-3023-4d30-98d8-37fafcc76944',
    'Dartmouth Crossing North',
    'REACH Community Development',
    'REACH Community Development',
    'tax_credit',
    '6835 SW Clinton Street', 'Tigard', 'Washington', 'OR', '97223',
    'An 85-unit family-oriented affordable housing community in the Tigard Triangle with studios and one-, two-, and three-bedroom apartments, community space, outdoor play areas, and energy-efficient design.',
    'Units are income-restricted for households generally earning no more than 50% or 60% of area median income. Household size, rental history, credit, criminal screening, and student-status rules may also apply.',
    array[50, 60]::smallint[], array['studio', '1', '2', '3'],
    array['general', 'families', 'disabilities'], 85,
    'Contact property management for accessible-unit availability and reasonable accommodations.',
    '971-402-1785',
    'https://reachproperties.org/properties/beaverton/dartmouth-crossing/304',
    'https://reachproperties.org/properties/beaverton/dartmouth-crossing/304',
    'https://reachproperties.org/properties/beaverton/dartmouth-crossing/304',
    'Official property manager website', '2026-08-11',
    'The property website is the source of truth for current vacancies and application availability.',
    95, true
  ),
  (
    '56e55df3-96bc-46c9-8e6c-686949bda46c',
    'Armonía Apartments',
    'Bienestar',
    'Bienestar',
    'affordable_apartments',
    null, 'McMinnville', 'Yamhill', 'OR', null,
    'A planned 72-home affordable apartment community in McMinnville with studios and one-, two-, and three-bedroom homes, a community room, laundry, bike storage, and a garden terrace.',
    'Income requirements have not yet been published. A portion of the apartments is planned for farmworker households. Confirm final eligibility with Bienestar when leasing information becomes available.',
    array[]::smallint[], array['studio', '1', '2', '3'],
    array['general', 'families', 'farmworkers'], 72,
    'The plans include two elevators. Contact Bienestar for unit-specific accessibility details when leasing begins.',
    null,
    'https://bienestar-or.org/armonia-apartments/',
    'https://bienestar-or.org/armonia-apartments/',
    'https://bienestar-or.org/armonia-apartments/',
    'Official owner website', '2026-08-11',
    'Construction is expected to begin in fall 2026, with leasing currently projected for winter 2027.',
    70, true
  )
on conflict (id) do update set
  name = excluded.name,
  owner_organization = excluded.owner_organization,
  management_company = excluded.management_company,
  property_type = excluded.property_type,
  address = excluded.address,
  city = excluded.city,
  county = excluded.county,
  state = excluded.state,
  postal_code = excluded.postal_code,
  description = excluded.description,
  eligibility_summary = excluded.eligibility_summary,
  ami_levels = excluded.ami_levels,
  bedroom_types = excluded.bedroom_types,
  audiences = excluded.audiences,
  total_units = excluded.total_units,
  accessibility_notes = excluded.accessibility_notes,
  phone = excluded.phone,
  website = excluded.website,
  application_url = excluded.application_url,
  source_url = excluded.source_url,
  source_type = excluded.source_type,
  last_verified = excluded.last_verified,
  public_notes = excluded.public_notes,
  priority_score = excluded.priority_score,
  published = excluded.published;

-- Classify all existing waitlists without adding new waitlist records.
update public.waitlists
   set waitlist_type = case
     when lower(coalesce(program_name, '')) like '%housing choice voucher%'
       or lower(coalesce(program_name, '')) like '%section 8%'
       then 'housing_choice_voucher'
     when lower(coalesce(program_name, '')) like '%property waitlist%'
       then 'public_housing'
     when lower(coalesce(program_name, '')) like '%affordable housing%'
       and lower(coalesce(program_name, '')) not like '%rental assistance%'
       then 'affordable_property'
     when lower(coalesce(program_name, '')) like '%affordable housing%'
       then 'mixed'
     else waitlist_type
   end;

update public.waitlists
   set affordable_property_id = 'dd2cd8f6-6bd1-46be-b3ad-a20c3725f155',
       waitlist_type = 'affordable_property'
 where housing_authority = 'Hacienda CDC'
   and lower(coalesce(program_name, '')) like '%dolores%';

update public.waitlists
   set affordable_property_id = '5c852f4a-8127-4928-aacf-74d7db60235f',
       waitlist_type = 'affordable_property'
 where housing_authority = 'Cascadia Health'
   and lower(coalesce(program_name, '')) like '%centennial%';

update public.waitlists
   set affordable_property_id = '31fb31fe-3f97-42a0-b61e-a387ef89eb27',
       waitlist_type = 'affordable_property'
 where housing_authority = 'Central City Concern'
   and lower(coalesce(program_name, '')) like '%blackburn%';

update public.waitlists
   set affordable_property_id = '56e55df3-96bc-46c9-8e6c-686949bda46c',
       waitlist_type = 'affordable_property',
       county = 'Yamhill',
       city = 'McMinnville',
       state = 'OR'
 where housing_authority = 'Bienestar Oregon'
   and lower(coalesce(program_name, '')) like '%armon%';

-- These two physical properties now live in the property directory. Keep the
-- organization-level housing resources, but hide the duplicate building rows.
update public.resources
   set published = false,
       internal_notes = concat_ws(
         E'\n',
         nullif(internal_notes, ''),
         'Moved to affordable_properties by migration 0021.'
       )
 where name in (
   'Hacienda CDC - Dolores Apartments',
   'REACH – Dartmouth Crossing North Affordable Apartments'
 );

commit;
