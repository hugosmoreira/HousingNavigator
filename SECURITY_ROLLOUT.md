# Housing Navigator security rollout

Use this order to avoid locking users out of authentication or coupling site
availability to analytics.

## 1. Apply the database advisor fix

Take/confirm a Supabase backup, then apply migrations through `0013` in a
staging project first:

```bash
supabase link --project-ref <project-ref>
supabase db push
npm run verify:rls
```

Migration `0013_security_invoker_admin_views.sql` converts all three flagged
admin views to `security_invoker=true`. It preserves their existing browser
contracts through locked-down, admin-gated row providers in the non-exposed
`app_private` schema. After applying it, rerun Supabase Database Advisor and
confirm these findings are gone:

- `public.resources_admin`
- `public.waitlists_admin`
- `public.alert_send_log_admin`

## 2. Create a dedicated Turnstile widget

The widgets visible in the supplied screenshot belong to other applications.
Create one named **Housing Navigator** in Managed mode with no pre-clearance.
Restrict it to `housingnavigator.us` and `www.housingnavigator.us`.

Add only its public site key to local/Netlify build variables:

```text
VITE_TURNSTILE_SITE_KEY=<public site key>
```

Never put the Turnstile secret in source, a `VITE_` variable, or Netlify's
browser bundle.

## 3. Deploy the frontend before enabling CAPTCHA

Deploy this frontend while Supabase CAPTCHA is still disabled. Verify that the
widget loads and each of these requests succeeds:

- public sign in
- public signup
- forgot-password email
- admin sign in

The reset-password page itself uses the recovery session created by the email
link and does not need a second challenge.

## 4. Enable Turnstile in Supabase

In Supabase Dashboard, open **Authentication → Bot and Abuse Protection**,
choose Cloudflare Turnstile, enter the secret key there, and enable protection.
Immediately repeat all four authentication smoke tests. If any flow fails,
disable CAPTCHA in Supabase first; that is the fastest rollback and does not
require a site redeploy.

Turnstile tokens are short-lived and single-use. The app clears and recreates
the widget after every attempted auth request.

## 5. Finish PostHog configuration

Use a public `phc_` project token, never a `phx_` personal API key. The current
legacy names are supported, but the preferred Netlify variables are:

```text
VITE_POSTHOG_KEY=<public phc_ project token>
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

In PostHog project settings:

- enable Cookieless Server Hash mode;
- disable IP/geolocation capture at the project level as defense in depth;
- require MFA for administrators;
- use the shortest retention period that still answers product questions.

The app sends only an approved public page label. Autocapture, user profiles,
session replay, surveys, heatmaps, performance capture, automatic exceptions,
feature flags, full URLs, searches, account routes, dashboard activity, and
admin activity are disabled. PostHog loads asynchronously and failures are
ignored, so an analytics outage cannot block the application.

## 6. Operational hardening after rollout

Recommended next controls, in priority order:

1. Enable MFA on Supabase, Netlify, Cloudflare, PostHog, GitHub, and the domain
   registrar; keep at least two owners with recovery codes stored offline.
2. Turn on Supabase backups/PITR appropriate to the project tier and test a
   restore. A backup that has never been restored is only a theory.
3. Add an external uptime check for `/` and a synthetic check for a public
   Supabase read; alert two people, not one.
4. Enable GitHub secret scanning, Dependabot, protected branches, required CI,
   and review production environment-variable access quarterly.
5. Add privacy-filtered error monitoring (for example Sentry) with request
   bodies, emails, auth tokens, and housing selections scrubbed before sending.
6. Review Supabase Auth rate limits, password policy, leaked-password
   protection, allowed redirect URLs, and session lifetime. Remove localhost
   and preview URLs from production allowlists when they are no longer needed.
7. Run `npm audit`, the unit suite, the RLS suite, and a production build in CI
   on every dependency update and before every deployment.

Do not turn Cloudflare's full-site proxy or aggressive WAF challenges on
without a staged test. Housing Navigator is already served by Netlify's CDN;
double-proxying can introduce caching, TLS, redirect, and availability issues.
