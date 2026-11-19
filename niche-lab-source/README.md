# Etsy Niche Lab — hosted dashboard

Private Sites Worker application. `node build.mjs` embeds the HTML, frontend JavaScript and downloadable Python starter into `dist/server/index.js`. No package installation required.

ETSY_KEYSTRING and ETSY_SHARED_SECRET are hosted runtime secrets; redeploy after changing them. Without secrets the interface uses conspicuously labeled fictional examples. No secrets are accepted or stored in browser code.

Web watchlists, daily observations and collection state persist in the Sites D1 database. The Watchlist tab supports daily collection, weekly deltas, breakout flags, history and import of the former browser watchlist. See CLOUD_TRACKING.md for unattended operation and scheduling. The Python download remains available as a separate local alternative.

The published dashboard is protected by the private Sites access boundary. Preserve that boundary. Run `npm test` for server route and normalization checks.

Etsy app quota: 5 QPS / 5,000 QPD. Worker requests use 300ms pacing within each isolate, short in-memory caches, and Etsy-enforced shared quotas. Shops are cached up to 15 minutes and listings up to 5 minutes. Each search caps uncached upstream requests at 40 to bound work; larger samples can have explicitly missing shop metrics. A 20-listing sample offers complete shop enrichment when Etsy permits access. The web UI supports numeric listing-ID lookup.


## Research workspace

The dashboard adds a watchlist-based overview, a filtered product sample, comparisons of up to four products, up to five keyword samples side by side, public shop analysis and daily competitor-shop tracking, and a listing-content checklist/tag extractor. The source of inspiration is EHunt's publicly accessible dashboard and product/keyword/shop/SEO feature pages. This application does not claim EHunt's proprietary dataset or feature parity.

- Product filters apply to the fetched sample, not Etsy's entire inventory. Tag counts refer to the full sample. Price comparisons retain currency.
- Keyword match counts are Etsy-reported matching active listings; never search volume, demand, CPC or conversion. Keyword prices are summarized by currency.
- Shop lookups accept an exact shop name, ID or Etsy shop URL, and sample up to 20 recently created active listings. Shop totals are never attributed to those products.
- SEO checks assess content completeness only. They do not predict ranking or modify Etsy listings.
- Up to 50 shops can be saved independently for daily snapshots. The existing collector includes shop tasks automatically, with one snapshot per shop per UTC day and exact seven-day comparisons.
- The personal workspace is shared with explicitly invited viewers under the current Sites allowlist. Keep that access boundary; never publish its data endpoints anonymously.

`npm test` runs the route, data-summary, SQLite migration, quota, collection and content-check tests. Browser visual QA was unavailable in the managed runtime, so only syntax, server/SQLite tests and hosted endpoint checks were performed.


## Browser extension

The `extension/` folder contains a private Manifest V3 Chrome/Edge extension. `python scripts/package-extension.py` creates its downloadable ZIP, which the Worker embeds during `node build.mjs`. Repackage after extension source changes, then rebuild and publish.

The extension extracts public listing IDs on Etsy, then communicates with an isolated content script in a signed-in Niche Lab tab. That script makes same-origin requests to the existing access-controlled website. API keys and Site service credentials are never packaged or relayed to the extension. The metrics route is `/api/extension/metrics?id=<listing_id>`. It deliberately returns null for exact competitor total and weekly units sold. Daily favorite and stock changes are separate fields, available only with recorded history.

Install instructions and download are published under Browser extension in the website. Automated coverage includes URL parsing, manifest restrictions, extension-to-site message routing, login failure handling, public metric preservation, and unknown competitor sales fields. Interactive installation/Etsy layout remain unverified because extension browser controls are unavailable.

Extension v1.1.0 adds automatic inline metrics for visible Etsy cards and listing pages, a locally saved enable/disable preference, a 40-unique-product automatic cap per page, a shared five-minute cache with in-flight deduplication and a two-request background queue. Reload the unpacked extension and refresh both website/Etsy tabs after updating.


## Experimental sales model (1.3.2)

The default is now listing reviews × 4 + listing favorites ÷ 4. The review component assumes 25% review participation. This assumption is not fitted or validated. The review-only formula remains selectable. For 22 reviews and 349 favorites, these give 88 and 175.25 (displayed as 175), respectively. Favorites may overlap with reviewed purchases or never result in purchases, so neither formula is a guaranteed lower bound.

The old shop-ratio formula is retained only as an inactive diagnostic in website Evidence. A low shop review rate could inflate individual-listing predictions; it no longer controls estimates. Known shop totals cap displayed scenarios. Missing or zero listing-review evidence returns unknown. Small samples are marked thin; shop reviews are optional diagnostics.

Seven-/30-day scenarios multiply reviews published during that period by four. They do not add lifetime favorites. Review dates can lag purchases, so these are not measured weekly/monthly sales. The 2–8 purchases-per-review sensitivity range is not a confidence interval. No accuracy against actual seller orders has been established. No paid provider is connected.

The website formula selector and extension popup can switch lifetime formulas. Download extension 1.3.2, replace the installed folder, reload it in chrome://extensions, and refresh Etsy tabs.

Run npm test for arithmetic, missing data and route checks. Run npm run model:evaluate -- --synthetic for simulated assumption tests only, or pass an authorized aggregate-truth JSON file to evaluate-sales-model.mjs for MAE, WAPE and bias against actual orders. Never include customer identities.
