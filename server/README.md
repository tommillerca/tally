# Server Tests

## Local Runner Setup

Nine of the ten test suites require a running Cloudflare Worker on localhost:8788 and a local D1 database. Schema-plan.test.mjs runs standalone.

### Before running tests

1. Initialize the D1 database:
   ```bash
   npx wrangler d1 execute bonez --local --file=schema.sql
   ```

2. Start the local Worker:
   ```bash
   npx wrangler dev --local --port 8788 --var DEV:1 --var ADMIN_TOKEN:devtoken
   ```
   This runs in a separate terminal and stays up for the duration of testing.

### Test suites that require the Worker (9 of 10)

- admin-grant.test.mjs
- concurrency.test.mjs
- future-dates.test.mjs
- grants-retention.test.mjs
- recovery.test.mjs
- retention.test.mjs
- security.test.mjs
- spires.test.mjs
- stale-retention.test.mjs

### Test suite that runs standalone (1 of 10)

- schema-plan.test.mjs (verifies migration ordering and constraints; no Worker needed)

### Behavior without the Worker

Tests that depend on the Worker will fail with clear error messages if it is not running:
- Future-dates.test.mjs specifically fails closed: it verifies that future-dated rows are excluded from stats aggregates, and without the Worker it cannot run the query to prove it, so it exits with a failure rather than a false pass.

All Worker-dependent tests use the same pattern: they assert HTTP status 200 from the Worker, so connection failures are reported as test failures.
