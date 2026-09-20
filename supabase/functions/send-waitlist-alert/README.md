# send-waitlist-alert

Supabase Edge Function that fans out waitlist status-change emails to
subscribers via [Resend](https://resend.com).

Accepts either a validated administrator JWT or the internal shared secret
used by the database status-change trigger. Only meaningful status upgrades
(e.g. `closed → open`) on published waitlists are eligible. The frontend
wrapper, when used, is `src/admin/notifyWaitlistAlert.ts`.

## Prerequisites

- Supabase CLI installed (`npm i -g supabase`).
- Logged in: `supabase login`.
- Linked: `supabase link --project-ref <your-project-ref>`.

## Database

Apply the repository migrations in order before deploying. In particular:

- `0010_codex_scan_fixes.sql`: atomic per-waitlist/status send claim.
- `0011_alert_ops_improvements.sql`: unsubscribe tokens and invocation ledger.
- `0016_edge_function_service_role_grants.sql`: service-role table grants.
- `0023_security_fix_handoff.sql`: atomic admin quota RPC and unsubscribe
  token rotation on re-enable.

`notification_events.metadata` remains audit/history data, not the dedupe lock.
Review the target project and migration plan before running:

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
- `INTERNAL_TRIGGER_SECRET` — must match the database trigger's Vault secret.
  Required for internal trigger requests; never put it in browser configuration.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the
Supabase runtime; do not set them yourself.

## Deploy

```
supabase functions deploy send-waitlist-alert --no-verify-jwt
```

The handler performs authentication itself; the internal trigger has no user
JWT. Run tests and compare deployed source before an explicitly approved
deployment. This reconciliation does not require redeploying an unchanged
live handler. See [backend reconciliation](../../../docs/BACKEND_RECONCILIATION.md).

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
| Edge Function — AuthN | Constant-time internal-secret comparison, or `auth.getUser(token)` with explicit JWT validation. |
| Edge Function — AuthZ | Looks up the caller in `public.admin_users` via the service-role client. Rejects 403 for non-admins. |
| Subscriber data | Loaded with the service-role client AFTER the internal/admin gate. Subscribers' RLS is preserved for every other caller. |
| Master opt-out | `profiles.email_notifications_enabled = false` → recipient skipped. |
| Per-alert prefs | `notify_on_open` and `notify_on_status_change` honored. |
| Admin quota | Atomic `claim_admin_alert_invocation`: ten real endpoint invocations per administrator per rolling hour; fails closed. Dry runs and internal calls are exempt. This is not a global cap on all admin-caused status-change notifications. |
| Dedupe | Atomic `claim_waitlist_alert_send`: 24h window per `(waitlist_id, new_status)` before delivery; fails closed. |
| Unsubscribe | GET displays confirmation only; POST atomically opts out and replaces the token. Re-enable rotates it again via migration 0023. |

## Request / response shape

```jsonc
// POST /functions/v1/send-waitlist-alert
// Authorization: Bearer <admin user's JWT>
{
  "waitlist_id": "vancouver-housing-authority",
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
