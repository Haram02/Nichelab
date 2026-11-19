# Niche Lab for Etsy — Chrome / Edge extension

Version 1.3.2 displays public metrics automatically inside visible Etsy product cards and beneath the title on listing pages. A detail panel and daily-tracking buttons remain available. It uses your existing Niche Lab website and its hosted Etsy connection. No Etsy API key, shared secret, password, or Site service token is packaged in the extension.

## Install (desktop Chrome or Microsoft Edge)

1. Download the ZIP from the Browser extension section of your Niche Lab website.
2. Extract the ZIP to a folder. That folder must contain `manifest.json` directly inside it.
3. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the extracted folder.
6. Open https://etsy-niche-lab-personal.jovialghost256.chatgpt.site and sign in with the account granted access (currently darharam24@gmail.com or the owner account).
7. Refresh both your Niche Lab tab and Etsy tabs. Numbers load automatically beneath visible products and near the title on listing pages. Use Details for the expanded panel.

This is a private, unpacked extension, not a Chrome Web Store listing. Keep the extracted folder in place. It is intended for desktop Chromium browsers; it is not an iPhone, Android Chrome, Firefox, or Safari extension.

## Update from version 1.0.0

1. Download and extract the latest ZIP into the **same extension folder**, replacing its previous files.
2. Open `chrome://extensions` or `edge://extensions` and click the extension's **Reload** button. Enable it if the browser requests permission for saving the automatic-display preference.
3. Refresh both your Niche Lab tab and Etsy tabs.

Use **Show metrics automatically** in the extension popup to turn inline display off or on. It defaults to on. Its preference is stored locally using the storage permission; no credentials are saved.

## Automatic loading

- Product cards load when they enter the visible viewport. The main listing loads automatically near its title.
- Up to 20 unique products load automatically per Etsy page. More products offer a manual Load button.
- Repeated IDs share a five-minute extension cache; duplicate in-flight requests share one result. At most two metric lookups are active through the background queue.
- Automatic work pauses in hidden Etsy tabs and on sign-in or quota errors. Sign in to Niche Lab and retry if needed.
- Browsing alone does not save products to the cloud watchlist; use Track daily for that.

## Metrics

- Current public listing favorites, price, age, remaining quantity and lifetime favorites/day.
- Public total shop sales where Etsy returns that field. This is never presented as sales of one product.
- Exact product units sold and exact weekly product sales show **Not disclosed by Etsy**. Logging in to an Etsy buyer account or installing an extension cannot unlock a competitor's private transaction history.
- **Track daily activity** saves the selected product in your existing cloud watchlist and starts daily observations. After seven calendar dates, the panel can show favorite growth and net stock change when the baseline exists. Stock changes remain uncertain activity signals, not sales estimates.
- The collector runs through your existing daily website automation, not a browser timer, so it can continue while Etsy or the extension is closed.

## Connection and privacy

The extension uses an open Niche Lab tab as a same-origin bridge. It opens one if needed. Keep that tab available while using the extension. If prompted, sign in there, then return to Etsy and retry. There is no API key setup inside the extension.

Etsy content scripts extract listing IDs from public listing links. No orders, checkout pages, Etsy passwords, seller-account cookies, or private account data are read. Requests happen automatically for visible public listing cards while enabled, or when you choose Details, Refresh or Track. Off-screen products are not automatically fetched. The per-page cap, local cache, queue and server-side budget limit API use. Niche Lab's existing allowlist, hosted credentials, cache and request budgets still apply. Its connection may fail if browser sign-in, extension permissions, the service, or Etsy API access is unavailable.

## Verification and limitations

Manifest, JavaScript syntax, backend metric routes, URL parsing, null sales fields and persistence are covered by automated checks. Live backend requests are checked after publication. Interactive installation and Etsy-page rendering still need checking in your browser because extension browser controls are unavailable in the authoring session. Etsy may change search-result markup; the toolbar action and listing-page analysis button provide alternative entry points.


## Experimental sales model (1.3.2)

The default is now listing reviews × 4 + listing favorites ÷ 4. The review component assumes 25% review participation. This assumption is not fitted or validated. The review-only formula remains selectable. For 22 reviews and 349 favorites, these give 88 and 175.25 (displayed as 175), respectively. Favorites may overlap with reviewed purchases or never result in purchases, so neither formula is a guaranteed lower bound.

The old shop-ratio formula is retained only as an inactive diagnostic in website Evidence. A low shop review rate could inflate individual-listing predictions; it no longer controls estimates. Known shop totals cap displayed scenarios. Missing or zero listing-review evidence returns unknown. Small samples are marked thin; shop reviews are optional diagnostics.

Seven-/30-day scenarios multiply reviews published during that period by four. They do not add lifetime favorites. Review dates can lag purchases, so these are not measured weekly/monthly sales. The 2–8 purchases-per-review sensitivity range is not a confidence interval. No accuracy against actual seller orders has been established. No paid provider is connected.

The website formula selector and extension popup can switch lifetime formulas. Download extension 1.3.2, replace the installed folder, reload it in chrome://extensions, and refresh Etsy tabs.

Run npm test for arithmetic, missing data and route checks. Run npm run model:evaluate -- --synthetic for simulated assumption tests only, or pass an authorized aggregate-truth JSON file to evaluate-sales-model.mjs for MAE, WAPE and bias against actual orders. Never include customer identities.

### 1.3.2 consistency fix

Search cards bind to the closest listing ID rather than a surrounding list item's first link. All display surfaces select the same model comparison after preferences load. Successful loads synchronize other open Etsy tabs that have requested metrics, and stale visible cards refresh when returning to a tab after five minutes. Inline estimates show their review/favorite inputs and review cutoff. Responses with a mismatched listing ID are rejected. This fixes display consistency; it does not establish sales accuracy or resolve differences between Etsy API and website review counts.
