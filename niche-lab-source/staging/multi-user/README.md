# Account staging starter — not a completed migration

This is a separate, unconnected staging component. The production Sites app and its hosting allowlist remain unchanged. It implements account lookup, owner-only invitations/list/suspend/restore, and per-user listing watchlists. It does not yet include the research dashboard, extension sign-in migration, data migration, quotas, or a collector.

## Inputs needed

1. Supabase project xkivkdoxetsktejfvout is identified and its public Auth endpoint was verified on November 19, 2026. No administrative Supabase connection is available here. The memberships table was absent and public sign-ups were enabled at inspection.
2. Target repository: https://github.com/Haram02/Nichelab. The connected GitHub tool currently has pull=true, push=false. The source has NOT been uploaded there. Enable write access or upload the source package contents manually. CI is not active until those files are in GitHub.
3. A separate staging hosting account/domain. Do not make the existing Sites URL public to deploy this component. Existing Sites authentication must be preserved until an independently tested replacement is ready.
4. Authorized aggregate actual-sales records for real estimation validation. Do not include buyer identities.
5. Chrome Web Store developer access, privacy-policy disclosures, and authorization for store submission later.

## Configure staging

1. Open the provided Supabase project SQL editor and execute schema.sql after reviewing it. Its account tables have not been created. These statements are for the new account database, not production D1.
2. Disable public sign-ups. Configure the Auth Site URL/redirect allowlist to the exact staging origin, password policy, invitation templates and production-capable SMTP. Default email delivery limits are unsuitable for assuming general invitations will work.
3. Create and verify your owner account through Supabase. Run the final bootstrap INSERT in schema.sql with that actual user's UUID; do not use an email provided by a browser as an owner claim.
4. Copy public/public-config.example.js to public/public-config.js. The supplied public project URL/key are already in that example. No administrator key is included.
5. Copy wrangler.example.json to wrangler.json with your exact staging origin. Set SUPABASE_SERVICE_ROLE_KEY using the hosting secret manager; never commit it or put it in the browser. Production should use a bundled/pinned auth SDK rather than relying on the prototype CDN import.
6. Run `node --test access.test.mjs`, then deploy to a new staging Worker with its assets binding. No commands here provision or modify production automatically.
7. Sign in as owner and invite a consenting tester. They accept the invitation and set a password. Confirm email delivery, redirect handling, refresh/expiry, suspension and restoration using real accounts. None of these live-provider flows has been tested yet.

## Required before production

- Test RLS directly against Supabase with two real users, not just the mocked HTTP API tests. Confirm one cannot read/update another's records or self-promote. Verify revoked access is checked for every research/extension request, not just account endpoints.
- Make invitation operations idempotent/rate-limited and reconcile partial failures: an auth invitation can succeed before membership or audit insertion fails. Do not blindly retry invitation emails. Use transactional database functions for membership/audit changes before production.
- Add per-user quotas, account deletion/data export, pagination beyond this prototype's bounded lists, email delivery monitoring, and an audit view. Coordinate the global Etsy quota across all users.
- Migrate cloud watchlist ownership explicitly. Do not assign the existing shared watchlist to every new user. Keep shared market snapshots separate from user watchlist associations.
- Port market-research routes behind the same verified identity and active-membership boundary. API caller-supplied user IDs/emails must never select private data.
- Migrate extension authentication through a supported browser auth flow; use short-lived sessions and never package service-role or Etsy secrets. The existing 1.3.2 extension still authenticates through the current Sites portal and does not use this starter.
- Implement collection job credentials/leases/retries and backups on the NEW backend. Existing production collection still uses Sites service authorization and cannot be copied as an anonymous public endpoint.
- Restore a backup in staging. Run smoke tests, canary the new backend with a few invited users, and rehearse rollback before cutover. Keep old app/account gate until the cutover is verified.

## Honest verification status

Eight mocked-provider API tests cover fail-closed configuration, verified membership, owner checks, cross-origin writes, server-enforced ownership and input validation. SQL/RLS has not been executed against a real PostgreSQL instance. Browser auth, invitation acceptance, SMTP and deployment have not been tested. This starter is not ready for public users.
