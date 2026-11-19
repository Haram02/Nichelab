# Connect the research dashboard to member accounts

This upload package is prepared for the existing repository layout `Haram02/Nichelab/niche-lab-source`. It does not contain passwords, Etsy keys or the Supabase service-role key. It is not yet deployed to your Cloudflare Worker.

## 1. Apply the additive database migration

In the existing Supabase project's SQL Editor, run `staging/multi-user/integration/migration.sql`. Do NOT rerun the original `schema.sql`, delete your users, or bootstrap another owner. This migration preserves your existing memberships and adds private watchlists, observations, collection leases and request budgets. The corrected full migration and its rerun, service functions, per-user RLS and suspended-user visibility were verified in a local PGlite PostgreSQL runtime. Live Supabase/browser tests with real accounts remain required.

## 2. Upload the source folder

Extract the integration ZIP on your computer. Drag its `niche-lab-source` folder into the root GitHub Upload files area for `Haram02/Nichelab`, preserving that folder name and all nested files, and commit. Do not upload the ZIP as a file. Existing root-level duplicate app files are not used by this staging deployment.

Uploading may trigger the OLD account-only build; that is harmless. The integrated backend becomes active only after changing the Cloudflare commands below. GitHub write access for the assistant is still unavailable, so this upload must be done by you.

## 3. Configure Cloudflare

Use the SAME Worker `niche-lab-account-staging`; preserve its existing `SUPABASE_SERVICE_ROLE_KEY` secret. Set its build settings to:

- Root directory: `niche-lab-source/staging/multi-user`
- Build command: `node build-integrated.mjs`
- Deploy command: `npx wrangler deploy --config wrangler.integrated.json`
- Preview builds: off

Add the existing Etsy app credentials as runtime Secrets (not Build variables and never GitHub files):

- `ETSY_KEYSTRING`
- `ETSY_SHARED_SECRET`

The app requires both. Do not paste them in chat. They do not automatically transfer from the old Sites app. Keep `SUPABASE_SERVICE_ROLE_KEY` as a Secret. Its legacy service-role JWT currently works; the original admin helper still expects that legacy form. A later migration of that helper is required before legacy API keys retire.

The new config fixes the portal origin to `https://niche-lab-account-staging.darharam24.workers.dev`, disables preview URLs and adds a five-minute collection trigger. Do not change the original Sites audience, collector or database during this rollout.

## 4. Confirm Supabase email settings

Keep public sign-ups disabled. Keep the Site URL and allowed redirect origin set to the same workers.dev portal. Use configured SMTP for reliable invitations and check delivery with the recipient. Existing invited users and owner role remain valid. Invitation delivery itself is not validated by the unit tests.

## 5. Test before sharing

1. Owner signs in at `/`, then lands at `/dashboard`. `/account` has the owner-only Manage users screen.
2. Research a keyword and open one listing; confirm live Etsy data and the selected formula. No credentials in browser requests or downloaded extension.
3. Invite a consenting test user. They accept their email, set a password and open `/dashboard`.
4. Save a different product/keyword in each account. In separate browser profiles, verify the watchlists differ. Try another account's user ID in a query: it must not change the data returned.
5. Suspend the test user; their next research, watchlist, download and extension API requests must fail. Restore access and sign in again.
6. Run Collect now on a small watchlist. Confirm a dated observation appears, then verify a scheduled run. Collection processes pending items in small batches; large watchlists can take multiple runs or days under the shared budget. Failures leave items pending. Existing shared historical snapshots are not silently assigned to new users.
7. Test SQL RLS directly using two real authenticated users; these SQL policies have not been executed in the author's local test environment.

## 6. Install the MEMBER extension

While signed into the new portal, download `/downloads/niche-lab-etsy-extension.zip`. It is version 1.4.0 named `Niche Lab · Members`. Disable/remove the old 1.3.x extension first to avoid competing overlays. Extract the ZIP, load the extracted folder through chrome://extensions in developer mode, and refresh all Etsy and portal tabs. Each person uses their own browser profile and signs in to the new portal. Keep a portal tab available as the session bridge.

The extension uses server-set HttpOnly session cookies through same-origin requests. It packages no API or service-role secrets. In-memory result TTL caching is disabled to avoid reusing a different member's private tracking data. Re-login and refresh tabs if another person's old overlay remains visible.

## Data and limits

The full research UI and current heuristic formulas are reused. This does not improve sales accuracy or resolve API/site review-count differences. Users have separate watchlist associations and daily histories. There is a shared safety budget of 4,500 actual upstream Etsy calls/day and 2,000/member/day; cached market data may be reused. Etsy's account-wide 5,000/day and 5 requests/second still apply across your old and new apps. During testing both apps use the same upstream key: their local budgets are separate, so do not run two large collectors at once. Keep the test watchlist small until cutover; Etsy remains authoritative across deployments.

Automatic collection uses one user's pending batch per cron invocation and per-user leases. It prioritizes outstanding daily work; it is not a promise to scan 1,000 products for every member every day. Partial provider failures are not fabricated as zero sales.

## Verification and rollback

Automated tests cover session cookies, suspension, private filters, owner checks, origin rejection, shared formula arithmetic, quota ordering and collector lease release. Mocked responses do not prove SMTP delivery, PostgreSQL/RLS correctness or real browser extension behavior. Complete the checks above before broad rollout.

Rollback: restore Cloudflare build command `cp public/public-config.example.js public/public-config.js` and deploy command `npx wrangler deploy --config wrangler.example.json`, then redeploy the previous account-only version. Disable the new collection cron if it remains configured. Additive Supabase tables may stay in place. The original Sites dashboard and original extension remain available under their prior hosting allowlist; no production user history is deleted by this package.
