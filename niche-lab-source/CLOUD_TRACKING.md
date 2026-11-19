# Cloud tracking operations

Site: project_id from `.openai/hosting.json`. Source and schema remain in this repository. Persistent data is in the Sites-provisioned D1 binding `DB`. The dashboard's Watchlist tab reads that same database across signed-in devices. The deployment must retain its restricted owner-and-invited-viewer allowlist; the personal shared workspace and unattended writer rely on Sites dispatch authentication.

## Supported unattended access

1. Call the native Sites `get_site` tool for the linked project. Verify the existing restricted access policy; do not broaden it. Obtain the fresh `current_live_url` and `siwc_bypass_bearer_token` from this response. Never store, print, or place the token in a task prompt. Send it only to this exact Site via `OAI-Sites-Authorization: Bearer <token>`.
2. `POST /api/collector/start` with JSON `{}`. It seeds today's resumable discovery and listing work from the cloud watchlist. Repeating it is safe. It also retries failed items up to three total attempts per UTC day.
3. While the returned `pending` is positive, `POST /api/collector/step` with JSON `{"day":"<returned-day>"}`. A step discovers one keyword or collects up to three listings. A server-side lease prevents simultaneous collectors. When `busy: true`, retry after two seconds. Stop after 450 steps or on an authorization error.
4. `GET /api/collector/status?day=<returned-day>` and `GET /api/watchlist` verify persisted results. The status shows completion, partial failures, counts and errors. Do not report success for pending or failed work. Current Etsy access credentials are already hosted secrets; the updater must not fetch or expose them.

The same operation is implemented in `scripts/collect.py`; pass the fresh Site URL and token via stdin only. For network or HTTP 429/5xx errors, use a short bounded retry. Never retry 401/403 blindly or weaken sharing. A future run resumes incomplete work. Etsy API limits and the persisted local 4,500-request safety budget are authoritative. No deployment is needed for normal daily collection.

## Data and calculations

- Up to 50 keywords and 1,000 stored product IDs. Each keyword discovers up to 20 relevance-ranked active listings per daily run. Discovered products stay associated with their saved keyword and keep collecting even when they leave the top results.
- A product saved directly is fetched from Etsy immediately. It gets its first daily snapshot without waiting for a schedule.
- One immutable snapshot per product per UTC date. Repeated collection never doubles counts or creates synthetic historical observations. A saved product already observed that day is skipped by the batch collector.
- Prices/favorites/quantity/views come from Etsy listing responses; total shop sales come from Etsy shop responses. Shop data can be cached for up to 15 minutes. Missing shop fields remain null and produce a warning.
- Weekly deltas compare the latest snapshot with exactly seven calendar dates earlier. Stock restocks stay negative. Favorite breakout: current-day observation and seven-day growth of at least 10 and at least 25%. Stale data is flagged and cannot generate a fresh breakout.
- Removing a keyword stops its discovery. Explicitly saved products continue. Removing a product deletes its snapshots and memberships; a still-saved keyword can rediscover it.
- Imports merge keys and numeric listing IDs, preserving cloud observations. Browser-supplied metrics and fictional demo IDs are never accepted as real observations. Capacity can limit discovery/import.
- Collection date is UTC; the daily schedule is 08:00 Asia/Karachi (03:00 UTC). Automatic collection runs without an open browser. The exact first seven-day comparison is available only after a snapshot exists seven dates earlier.

## Changes and validation

Generate new schema changes with `npm run db:generate`, inspect generated SQL/metadata, and publish them with the Worker through Sites. Never edit an applied migration. No schema mutation occurs in request handling. `node --test tests.mjs cloud.test.mjs` exercises server routes and the exact generated schema using SQLite.

Saved competitor shops participate in the same collector: up to 50 shops, with shop_daily_snapshots tracking favorites, total sales, active listings and review counts. The existing schedule does not need replacement.
