# send-waitlist-alert

Supabase Edge Function that fans out waitlist status-change emails to
subscribers via [Resend](https://resend.com).

Called only from `src/admin/notifyWaitlistAlert.ts`, which is only
reachable from the admin waitlist editor after a meaningful status
upgrade (e.g. `closed → open`).

## Prerequisites

- Supabase CLI installed (`npm i -g supabase`).
- Logged in: `supabase login`.
- Linked: `supabase link --project-ref <your-project-ref>`.

## Database

Apply migration `0006_notification_events_metadata.sql` first — the
function needs `notification_events.metadata` for the 24h dedupe lookup:

```
supabase db push
```

## Secrets

Set on the Supabase Edge runtime (NOT in `.env`, NOT `VITE_`-prefixed):

```
supabase secrets set RESEND_API_KEY="re_..."
supabase secrets set RESEND_FROM="Housing Navigator <alerts@your-verified-domain>"
supabase secrets set APP_URL="https://your-production-url"
```

- `RESEND_API_KEY` — get from the Resend dashboard. Required for sending;
  if absent the function returns a clean `reason: 'resend_not_configured'`
  so the admin sees a clear error toast.
- `RESEND_FROM` — must be a verified Resend sender. Default falls back to
  the Resend playground `onboarding@resend.dev` for local testing.
- `APP_URL` — used to build the "manage alerts" link in email bodies.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the
Supabase runtime; do not set them yourself.

## Deploy

```
supabase functions deploy send-waitlist-alert
```

Re-run after any change to `index.ts`.

## Local development (optional)

```
supabase functions serve send-waitlist-alert --env-file ./supabase/.env
```

`./supabase/.env` (gitignored) should contain the same three secrets
above plus `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the local
dev path.

## Security model

| Layer | Guarantee |
|---|---|
| Frontend bundle | Has the anon key only. Cannot call Resend directly. Cannot insert into `notification_events`. |
| Edge Function — AuthN | Reads `Authorization: Bearer <jwt>`, calls `auth.getUser()`. Rejects 401 without a valid user. |
| Edge Function — AuthZ | Looks up the caller in `public.admin_users` via the service-role client. Rejects 403 for non-admins. |
| Subscriber data | Loaded with the service-role client AFTER the admin gate. Subscribers' RLS is preserved for every other caller. |
| Master opt-out | `profiles.email_notifications_enabled = false` → recipient skipped. |
| Per-alert prefs | `notify_on_open` and `notify_on_status_change` honored. |
| Dedupe | 24h window per `(waitlist_id, new_status)` via `notification_events.metadata`. |

## Request / response shape

```jsonc
// POST /functions/v1/send-waitlist-alert
// Authorization: Bearer <admin user's JWT>
{
  "waitlist_id": "home-forward-section-8",
  "previous_status": "closed",
  "new_status": "open",
  "dry_run": false
}
```

Successful send:
```json
{ "subscriber_count": 12, "sent_count": 12, "failed_count": 0, "skipped": false }
```

Dry run (count subscribers without sending):
```json
{ "subscriber_count": 12, "would_send": 12 }
```

Dedupe hit:
```json
{ "skipped": true, "reason": "duplicate within 24h" }
```

Resend not configured:
```json
{ "subscriber_count": 12, "sent_count": 0, "failed_count": 12, "reason": "resend_not_configured" }
```

Errors: `400 transition not eligible`, `401 missing bearer`,
`403 not admin`, `404 waitlist not found`.
