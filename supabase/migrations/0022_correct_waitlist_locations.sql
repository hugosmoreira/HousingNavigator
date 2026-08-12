-- Replace legacy "Other" counties and fill missing OR/WA locations for the
-- existing curated waitlists. This migration only corrects metadata; it does
-- not add or remove waitlists or change their status.

begin;

update public.waitlists
set county = 'King', state = 'WA', city = null
where housing_authority = 'King County Housing Authority';

update public.waitlists
set county = 'King', state = 'WA', city = 'Seattle'
where housing_authority = 'Seattle Housing Authority';

update public.waitlists
set state = 'OR'
where housing_authority = 'Housing Authority of Clackamas County (HACC)';

update public.waitlists
set state = 'WA', city = 'Vancouver'
where housing_authority = 'Vancouver Housing Authority';

update public.waitlists
set state = 'OR', city = 'Portland'
where housing_authority in ('Cascadia Health', 'Central City Concern');

update public.waitlists
set state = 'OR', city = 'Hillsboro'
where housing_authority in ('Hacienda CDC', 'Housing Authority of Washington County');

commit;
