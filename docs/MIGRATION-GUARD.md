# Migration guard and release runbook

Run all paths from the checkout being released. Requires Node 22+ and the locked dependencies from `npm ci --prefix server`. No command below depends on the original checkout used to write the work order.

The guard derives 114 explicitly written columns across 12 tables from SQL in `server/src/`. It includes INSERT columns, UPDATE targets and UPSERT-only targets such as `backups.daily_blob`. `schema.sql` and migration files are not the required-column list. `server/src/write-contract.generated.js` is a generated runtime artifact. Both the PURE audit and Wrangler's build hook reject stale generated output.

The extractor parses JavaScript with Acorn, combines concatenated SQL literals, and handles template expressions in values, quoted identifiers and nested SQL expressions. SQL table names and write-column names must be literal. Unsupported dynamic targets, INSERT without a column list, CTE writes and multiple statements fail closed. Keep SQL writes in source string literals or templates. Arbitrary code that manufactures SQL keywords or column names at runtime, external SQL files and SQL-changing helper calls are outside this analyzer's supported convention; extend the analyzer and its controls before introducing those patterns. This is a write-column compatibility check, not proof of indexes, constraints, backfills or read-only SQL coverage.

`GET /health` and `GET /health/deep` now execute a zero-row UPDATE for each table through the deployed Worker's D1 binding. Both return 503 on failure and 200 on success, with `Cache-Control: no-store`. Missing-column errors name the column. No auth secrets are needed. Each check executes 12 bounded statements with `WHERE 0`; no player rows are visited or changed, no canary accounts are created and no response cache can conceal subsequent drift. The probe checks schema resolution and D1 execution, not authentication, row constraints or successful durable storage of a real player's profile.

## Local proof

From the checkout root:

```sh
npm ci --prefix server
node tests/unit.test.js
node tests/migration-guard-audit.mjs
node server/test/migration-guard-local.mjs
```

The PURE audit runs the actual Worker handler against SQLite, including a populated sentinel row, RED without the week-freeze pair, GREEN after the unchanged migration, repeated-call non-mutation, loss of a column after GREEN, database failure and release-script refusal controls. The local D1 proof uses a fresh temporary persistence directory, the real Wrangler/Worker runtime and no secrets. It initializes the current schema with only the two week-freeze columns omitted, verifies drift exit 1 and health 503 naming `last_week_key`, applies `2026-09-05-week-freeze.sql`, then requires drift exit 0 and both health routes 200. It removes only its own temporary fixture afterward. It never accepts a remote target or URL.

To check an existing local D1, from the checkout root:

```sh
node server/scripts/schema-guard.mjs --local
# Or select the same persistence directory as your local Worker:
node server/scripts/schema-guard.mjs --local --persist-to /absolute/path/to/local-state
```

The local D1 proof requires loopback sockets. A denied socket is a failed proof, not a skipped pass. PURE uses SQLite because this gate's PURE tier must also run in environments that deny sockets.

## Tom's remote check and release

These remote commands are for Tom to run with his existing Cloudflare login. The implementation session did not execute them, set secrets or deploy anything. The selected target is the default `server/wrangler.toml`: Worker `bonez-api`, D1 `bonez`, database ID `703a4e46-7643-490c-8d3f-26bc4e277eba`. The guard intentionally rejects alternate environment/config arguments rather than checking a different database from the release script.

From the checkout root:

```sh
cd server
npm ci
# Only when changing SQL write columns; review the resulting generated diff.
npm run schema:generate
# Read-only remote PRAGMA queries. Nonzero means stop before deployment.
node scripts/schema-guard.mjs --remote
```

If it reports the week-freeze pair missing, apply this migration before releasing:

```sh
npx wrangler d1 execute bonez --config wrangler.toml --remote --file=migrations/2026-09-05-week-freeze.sql
node scripts/schema-guard.mjs --remote
```

For other missing names, locate the migration adding that table or column and apply it first. Do not blindly replay the migration directory: some files perform backfills and some ADD COLUMN operations are not idempotent. If only one of the week-freeze columns exists, inspect the schema and complete only the missing ALTER after reviewing the partial application. Do not treat a duplicate-column error as proof the whole migration completed.

After the local proofs and target-schema check pass:

```sh
npm run deploy
curl --fail-with-body https://bonez-api.boneheadz.workers.dev/health/deep
```

`npm run deploy` validates the generated artifact, retains existing secret and local-test checks, then performs the read-only remote drift check immediately before `wrangler deploy`. Missing columns, stale generation, authentication failure, malformed responses and D1 failures all stop deployment. After deploying it checks the deep health response as well as route reachability. Point the uptime monitor at `/health` or `/health/deep`, require HTTP 200, and alert on any other status. No monitor was configured in this session.

Always use `npm run deploy` for this repository's release path. Direct `wrangler deploy` or dashboard publishing can bypass the remote preflight; the build hook only checks contract freshness. Preventing credential holders from bypassing the script requires a separately controlled CI deployment identity. There is also a check-to-deploy window if another operator changes the schema concurrently. Coordinate schema changes; the live health check detects subsequent loss of required columns.

The deployed D1 schema, remote PRAGMA response shape, production write-probe behavior and live monitoring remain unverified until Tom runs these checks. Cloudflare references: [prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/) and [Wrangler D1 commands](https://developers.cloudflare.com/workers/wrangler/commands/d1/). CLI flags were also checked against this checkout's locked Wrangler 3.114.17.
