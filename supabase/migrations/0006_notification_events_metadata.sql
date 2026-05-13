-- Housing Navigator — notification_events metadata column
--
-- Adds a `metadata jsonb` column to `public.notification_events` so the
-- `send-waitlist-alert` Edge Function can encode the originating
-- waitlist + status transition on each row, and dedupe re-triggers
-- within a short window without scanning text fields.
--
-- Append-only migration. Existing rows get the default empty object so
-- the NOT NULL constraint never trips on backfill.

alter table public.notification_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Partial index supports the dedupe lookup:
--   select 1 from notification_events
--   where event_type = 'waitlist_status_change'
--     and metadata->>'waitlist_id' = $1
--     and metadata->>'new_status'  = $2
--     and created_at > now() - interval '24 hours'
create index if not exists notification_events_waitlist_alert_idx
  on public.notification_events ((metadata->>'waitlist_id'), (metadata->>'new_status'), created_at desc)
  where event_type = 'waitlist_status_change';
