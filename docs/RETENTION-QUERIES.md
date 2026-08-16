# Retention: the cohorted return curve, with an activity floor

_Written 2026-08-16, alongside the two events it reads. Companion to
`docs/MORNING-REPORT-HANDOFF.md`, which owns the D1 access recipe (wrangler auth,
the `--json` banner trap, the millisecond timestamps). Everything about the
CLIENT half below was read out of the source and measured by
`tests/retention-audit.mjs`. Everything about the SERVER half is marked as
assumed, because `server/` was out of scope for this branch and nothing here was
run against production. Do not present any number from this file as measured
until the queries have actually been executed._

---

## 1. The question

Of the installs first seen in week W:

- what fraction come back on day 1, day 7 and day 30, and
- of those returners, what fraction actually **finished** a day (the activity
  floor: coming back and doing the thing are different, and only one of them is
  a habit).

---

## 2. The two rows this reads

Both are queued by `track()` in `js/analytics.js` and ride the existing anonymous
events pipe. No new endpoint, no new data class, no personal data.

| event | props | fired from |
|---|---|---|
| `day_first_open` | `{ d, g, s }` | `js/app.js` boot (after `initAnalytics`) and `js/app.js` `rollDayIfNeeded` |
| `day_closed` | `{ r, d }` | `js/game.js` `awardDayCloseIfDue`, on the branch that returns non-null |

- `d` install age in days, `-1` when unknown.
- `g` days since the last active day, `-1` when there is no previous active day
  on record (a fresh install, or the first open after this shipped).
- `s` the logging streak as the Today screen shows it.
- `r` `'close'` (yesterday landed on budget) or `'effort'` (yesterday was logged
  but off budget). Both mean the day was finished; only the reward differs.

**`d` is on both rows on purpose, and the whole query depends on it.** The client
queue is capped at `QCAP = 300` and evicts the OLDEST rows first, and flushes are
best effort, so a device's history here is lossy by construction. If age had to
be reconstructed by finding a device's first row and counting forward, one
evicted row would take the whole install with it. Carrying the age on every row
means **one surviving `day_first_open` from day 14 proves that install is 14 days
old on its own**, and the curve is recoverable from an arbitrary subset of rows.
`d` on `day_closed` does the same job for the join: it ties the close to the open
of the same local day BY VALUE, instead of through a server-side day column that
is derived from arrival time and disagrees with the client's local day for anyone
logging in the evening west of Greenwich.

Note the offset when reading `day_closed`: it settles YESTERDAY. A `day_closed`
with `d = 7` means "on day 7 they came back, and day 6 was a completed day". That
is what makes it an activity floor rather than a second open counter.

---

## 3. Assumed schema

**Verified from the client** (`js/analytics.js` `flush()`): the app POSTs
`{ device, appV, plat, label, events: [ { name, props, ts } ] }` to `<api>/events`,
where `ts` is client `Date.now()` in milliseconds.

**Assumed for the Worker's table**, from the shapes already used elsewhere in the
repo (`tests/error-telemetry-audit.mjs` documents
`SELECT name, count(*) FROM events WHERE name='err'` and
`json_extract(props,'$.m')`, and `js/analytics.js` documents the server doing
`JSON.stringify(e.props).slice(0, 300)`):

```
events(device TEXT, name TEXT, props TEXT /* JSON */, ts INTEGER /* ms */, ...)
```

**Check these three things before trusting a result** (one `PRAGMA table_info(events)`
answers all of them): the device column name, whether `ts` is the client's
millisecond value or a server-side arrival time, and whether a `day` column
already exists. If `ts` turns out to be server arrival time, everything below
still works, because the local day is recovered from `d`, not from `ts`.

---

## 4. The query

```sql
WITH opens AS (
  SELECT device,
         CAST(json_extract(props,'$.d') AS INTEGER) AS d,
         CAST(json_extract(props,'$.g') AS INTEGER) AS g,
         date(ts/1000,'unixepoch')                  AS row_day
  FROM events
  WHERE name = 'day_first_open'
),
-- the install day, reconstructed from ANY single surviving row: the row's own
-- day minus the age it carries. MIN() only to collapse rows that disagree by a
-- day across a timezone move.
anchor AS (
  SELECT device, MIN(date(row_day, '-' || d || ' days')) AS install_day
  FROM opens
  WHERE d >= 0
  GROUP BY device
),
-- the DENOMINATOR has to include installs that never came back, and those have
-- no day_first_open at all (see the caveat about onboarding below), so it falls
-- back to the first event of any kind from that device.
first_seen AS (
  SELECT device, MIN(date(ts/1000,'unixepoch')) AS first_day
  FROM events
  GROUP BY device
),
cohort AS (
  SELECT f.device,
         COALESCE(a.install_day, f.first_day) AS install_day,
         a.install_day IS NULL                AS anchor_missing
  FROM first_seen f
  LEFT JOIN anchor a ON a.device = f.device
),
closes AS (
  SELECT DISTINCT device, CAST(json_extract(props,'$.d') AS INTEGER) AS d
  FROM events
  WHERE name = 'day_closed'
)
SELECT strftime('%Y-W%W', c.install_day)                                   AS cohort_week,
       COUNT(DISTINCT c.device)                                            AS installs,
       SUM(c.anchor_missing)                                               AS no_anchor,
       COUNT(DISTINCT CASE WHEN o.d >= 1  THEN c.device END)               AS ret_d1,
       COUNT(DISTINCT CASE WHEN o.d >= 7  THEN c.device END)               AS ret_d7,
       COUNT(DISTINCT CASE WHEN o.d >= 30 THEN c.device END)               AS ret_d30,
       COUNT(DISTINCT CASE WHEN o.d >= 1  AND x.device IS NOT NULL THEN c.device END) AS ret_d1_closed,
       COUNT(DISTINCT CASE WHEN o.d >= 7  AND x.device IS NOT NULL THEN c.device END) AS ret_d7_closed,
       COUNT(DISTINCT CASE WHEN o.d >= 30 AND x.device IS NOT NULL THEN c.device END) AS ret_d30_closed
FROM cohort c
LEFT JOIN opens  o ON o.device = c.device
LEFT JOIN closes x ON x.device = o.device AND x.d = o.d
GROUP BY 1
ORDER BY 1;
```

Read it as: `ret_d7 / installs` is the day-7 return rate for that week's cohort,
and `ret_d7_closed / ret_d7` is the activity floor under it, the share of those
returners who also finished a day on the same day they returned.

`no_anchor` is not decoration. It is the number of devices in that cohort whose
week came from server arrival time rather than from the client's own local day,
and it is the error bar on the row. If it is a large share of `installs`, say so
instead of quoting the rate to three digits.

### Sanity companion, run it every time

```sql
SELECT name,
       COUNT(*)                                         AS rows,
       COUNT(DISTINCT device)                           AS devices,
       SUM(CASE WHEN json_extract(props,'$.d') IS NULL THEN 1 ELSE 0 END) AS null_d,
       SUM(CASE WHEN CAST(json_extract(props,'$.d') AS INTEGER) < 0 THEN 1 ELSE 0 END) AS unknown_d,
       MIN(date(ts/1000,'unixepoch')), MAX(date(ts/1000,'unixepoch'))
FROM events
WHERE name IN ('day_first_open','day_closed')
GROUP BY name;
```

`null_d` must be 0. A non-zero `null_d` means props arrived clipped or malformed,
not that the age is unknown, and the curve above is then reading a broken column.
`unknown_d` counts the honest `-1` rows (see the next section). Zero rows for
either event name means **the pipeline is not delivering**, which is a different
finding from "nobody came back" and must never be reported as the second one.

---

## 5. Caveats, each of which changes how a number should be said out loud

1. **Every rate here is a LOWER BOUND on return.** The queue is capped and
   evicts oldest first, flushes need a network, and a device that never opens the
   app again never flushes what it queued. Missing rows therefore look like
   churn. The error runs one way only: the real curve is at or above what this
   query prints. Never describe a drop as "confirmed churn" from this data alone.
2. **The install day itself is under-counted.** `boot()` returns early at
   `if (!S.settings)` for anyone still in onboarding, so the FIRST
   `day_first_open` a device emits is normally on its second open, not its first.
   That is why the denominator falls back to `first_seen` (the `app_open` /
   `session_start` rows that `initAnalytics` fires on the onboarding path too)
   and why cohort week is not taken from `day_first_open`.
3. **`d = -1` means the install predates `settings.createdAt`.** Those rows are
   old installs, not new ones. They are excluded from `anchor` by the `d >= 0`
   filter and show up in `no_anchor`. Do not let them fall into the current week:
   that would invent a cohort out of the oldest users in the base.
4. **Cohort week can smear by a day at a week boundary** for the `no_anchor`
   devices, because their day comes from UTC arrival rather than the device's
   local day. Anchored devices do not have this problem, which is the point of
   carrying `d`.
5. **Demo and webdriver sessions are already excluded at the source**, by the BOT
   gate in `js/analytics.js`. Nothing needs filtering out here, and
   `tests/retention-audit.mjs` proves both halves of that gate behaviourally.
   Tom's own device is NOT excluded, same as in the morning report, so decide
   and say which.
6. **A device is not a person.** Reinstall on a wiped device mints a new
   `analyticsId`, so it joins a new cohort. A cloud restore brings
   `settings.createdAt` back, so `d` stays honest and the new device row reports
   its real age from the start, which is the closest this data gets to stitching
   the two together.
7. **Props are clipped at 300 chars server-side**, mid-string and not JSON aware.
   Both payloads here are tiny (longest observed 28 chars, worst synthetic case
   28), so this is slack rather than a risk, but it is the reason the payload
   size is an assertion in the guard rather than a comment.

---

## 6. What cannot be answered without `server/`

Listed so nobody mistakes these for open questions about the client.

- **The real column names and types of the `events` table**, and whether the
  Worker stores the client `ts` or its own arrival time. Section 3 is inference
  from other files in this repo, not a schema read.
- **Whether a `day` or `geo` column already exists** that would make the week
  bucket cheaper. The MORNING-REPORT handoff shows `geo` on the leads table, so
  it plausibly exists on `events` too.
- **Whether the Worker rejects or truncates unknown event names.** If new names
  need registering server-side, `day_first_open` and `day_closed` will be
  dropped on arrival, and the sanity query above is what detects it: zero rows
  for both names with a live install base is that failure, not churn.
- **Retention for the period before this shipped.** It cannot be backfilled.
  `d` is computed on the device at emit time, so the first honest cohort is the
  week these events go live.
