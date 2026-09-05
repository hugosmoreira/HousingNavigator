# Provider phone links

Resource cards, resource detail pages, saved resources and affordable-property
detail pages use the shared PhoneLink component and phoneHref formatter.
Stored phone text and other catalog fields are not changed.

Previously, removing every non-digit character appended an extension to the
main number: 503-235-8786 ext. 1008 became tel:50323587861008.
It now becomes tel:+15032358786;ext=1008, following the extension parameter in
[RFC 3966](https://www.rfc-editor.org/rfc/rfc3966).

Supported input includes ext, ext., extension, x, # and ;ext= suffixes,
formatted North American numbers and explicit international country codes.
Three-digit local service numbers such as 211 and 988 retain their local form.
Multiple phone numbers, descriptive text and unsupported dial strings remain
visible as plain text rather than becoming a guessed destination.

Extension processing depends on the phone application. The original number
and extension remain visible for manual entry when needed; no timed pause or
automatic IVR navigation is assumed. Verification inspects generated links
without placing calls, including to emergency or resource providers.

Regression tests cover the Community Warehouse example, ordinary numbers,
short codes, alternate extension formats, ambiguous values, the shared
component and every phone in the current public resource/property snapshot.
Production verification must check both the directory and direct detail HTML.

Validation: TypeScript, 249 tests across 26 files, the 110-route production
build and all four bundle budgets passed. Generated directory/detail HTML
contains the correct extension link and unchanged label. Ordinary-number and
211 link regressions also passed. No database migrations or record writes
are part of this change.
