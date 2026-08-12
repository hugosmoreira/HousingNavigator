# Housing Navigator admin dashboard

The administration area is organized as an operational workspace rather than
a collection of unrelated list pages.

## Navigation

- **Overview** — totals, current operational problems, and common actions.
- **Resources** — resource directory editing and manual curation.
- **Affordable housing** — physical income-restricted apartment property editing.
- **Waitlists** — waitlist editing and monitoring configuration.
- **Review queue** — proposed waitlist status changes and failed source checks.
- **Alert history** — subscriber notification delivery history.
- **Users** — account visibility, invitations, blocking, and deletion.

The vertical navigation leaves room for future modules such as resource intake,
data quality, analytics, and AI-search evaluation without crowding the page
header.

## User-management architecture

Supabase Auth user records are not exposed through PostgREST and the browser
never receives the service-role key. The React admin page invokes the
`admin-users` Edge Function with the signed-in administrator's JWT. The
function then:

1. validates the JWT with Supabase Auth;
2. checks that the caller exists in `public.admin_users`;
3. performs one allowlisted Auth Admin operation; and
4. records successful mutations in `public.admin_user_actions`.

The list response contains only the fields needed by the dashboard: account
email, confirmation and block state, creation and last-sign-in timestamps,
profile name/county, administrator status, and saved-resource/alert counts.

## Supported actions

- **Invite** sends a Supabase invitation so the user chooses their own password.
- **Block** is reversible and keeps the profile, bookmarks, and waitlist alerts.
- **Unblock** restores sign-in access.
- **Delete permanently** removes the Auth user. Existing foreign keys cascade
  deletion to the public profile, saved resources, waitlist alerts, and
  notification records.

Administrator accounts—including the currently signed-in account—are visible
but cannot be blocked or deleted from this screen. Administrator access remains
a separate, intentionally protected operation.

Auth uses short-lived access tokens. A block or deletion prevents future sign-in
and refreshes, but a token already issued to a user can remain valid until its
configured JWT expiration. Application RLS and cascading account data deletion
still limit what that token can access.

## Deployment

Apply migration `0018_admin_user_management.sql`, then deploy the function:

```bash
supabase db push
supabase functions deploy admin-users --no-verify-jwt
```

Deploy the frontend after the migration and function are live. The Overview and
Users pages depend on the Edge Function for account totals and directory data.

## Product sequence after this foundation

1. Curate and standardize the existing resources.
2. Add a manual resource-intake workflow with duplicate detection and review.
3. Expand Oregon and Washington coverage using the same structured fields and
   verification rules.
4. Build the AI-search/RAG layer only after the catalog has enough accurate,
   consistently structured records to produce useful grounded answers.
