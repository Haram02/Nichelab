# Niche Lab development and release checklist

## Current production

- Platform: existing shared custom-access Sites app; hosted secrets contain Etsy credentials.
- Database: D1 shared watchlists and daily snapshots, not per-user data.
- Extension: 1.3.2, authenticated through a signed-in portal tab.
- API budget: existing global 4,500-request safety limit; no per-user quota.
- Estimator: explicit heuristic, not a trained model or validated against actual sales.

## Every change

1. Keep source and configuration under version control; exclude secrets, runtime data, sessions and customer data.
2. Install locked dependencies; package extension; build; run tests. GitHub checks.yml performs these once pushed to a connected GitHub repository.
3. Review behavioral and authorization changes. For account work, run the staging API tests and real-account RLS tests after a project exists.
4. Build a staged release from an exact commit. Test search/listing equality, account boundaries, missing data, quota failures and provider outages.
5. Publish a versioned production artifact only after staging passes. Record prior version/commit for rollback. Install the matching extension; refresh old Etsy tabs.

## Backups and cutover

Before schema or ownership migration, export the current database through its host-supported tooling. Restrict access to exports; keep them outside Git. Restore to staging and verify row counts, watchlist associations and snapshot dates. Backups are not configured merely by this document.

For a future Supabase backend, enable a suitable backup policy, test restoration, and explicitly map the current owner's data. Do not silently share every user's watchlists. Keep existing Sites collection enabled until the replacement collector passes monitored daily runs; prevent both from writing duplicate records during cutover.

## Observability requirements

Report timestamp, route, error class, provider status and request ID. Do not log API keys, authorization headers, sessions, email/password bodies or buyer data. Alert on repeated collection failures, missing daily snapshots, auth failures and quota exhaustion. Current hosting logs are available; no external alerting service has been configured.

## Sales evaluation

Collect listing-specific review/favorite observations and actual total/7-day/30-day units for matching reporting dates from consenting sellers. Hold out entire shops/listings for evaluation; avoid testing on the examples used to choose weights. Report coverage, signed bias, MAE and WAPE separately per period. Record missing/zero-review cases. EHunt agreement is a separate comparison metric, not ground truth.

The single owner example (one review, ten favorites, seven actual sales) is insufficient to calibrate a model. Daily snapshot collection does not automatically retrain anything. Store truth data outside Git; the evaluator accepts authorized aggregate JSON without buyer identities.
