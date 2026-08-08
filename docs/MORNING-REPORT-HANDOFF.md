# Handoff: Boneheadz morning update routine

_Written 2026-08-08 for whoever builds the scheduled morning report. Every query
below was run against production D1 that day and the real output is included, so
nothing here is guessed. Where the data cannot answer the question as asked, it
says so rather than inventing a number._

---

## 1. What the routine has to produce

Tom's brief, verbatim:

> Generate a morning update on the boneheadz project.
> 1. Count new verified players (those who have progressed past level 1) since yesterday.
> 2. Check if anyone new has filled out the survey form since yesterday.
> 3. Count open bug reports and POI (point of interest) issues. Flag if the total exceeds 5.
> Present the counts clearly in a design that includes only boneheadz colours/fonts/vibes etc. If there are no new verified players and no new survey responses, note that briefly. If bug reports and POI issues are at or below 5, confirm the backlog is manageable. Also summarize a TLDR of what youve found and raise any red flags to me on things that are issues or new positive findings.

---

## 2. Where the data lives

Cloudflare D1, database **`bonez`**, on the **tom@nomad91.com** account (NOT
veritree). Account id `2f288476228e6b591c6f30e3bfec361d`. Worker is `bonez-api`
at `https://bonez-api.boneheadz.workers.dev`.

Run everything from `~/Documents/Hyperframes Editor/tally/server`.

**Auth is the first thing that will break this routine.** Wrangler's OAuth token
silently lost its D1 scope earlier on 2026-08-08 and every query failed with
`7403 not authorized`. The fix is `npx wrangler login`, which is interactive and
needs Tom. **A scheduled routine cannot recover from this on its own**, so it must
detect the failure and say "I could not reach the database, Tom needs to run
`npx wrangler login`" rather than reporting zeroes. Zeroes and "cannot read" look
identical in a summary and must never be conflated.

### Parsing wrangler output

`--json` output is NOT clean JSON: wrangler prints a banner and update notices
around it. `json.loads` on the whole thing fails. Use a raw decoder from the first
`[`:

```python
import json, subprocess
def q(sql):
    out = subprocess.run(
        ['npx', 'wrangler', 'd1', 'execute', 'bonez', '--remote', '--json', '--command', sql],
        cwd='/Users/tommiller/Documents/Hyperframes Editor/tally/server',
        capture_output=True, text=True)
    if '[' not in out.stdout:
        raise SystemExit('D1 unreachable — check `npx wrangler login`:\n' + out.stdout + out.stderr)
    data, _ = json.JSONDecoder().raw_decode(out.stdout[out.stdout.index('['):])
    return data[0]['results']
```

Also note: `--file=` returns only a summary. Only `--command` returns rows.
Temp tables are blocked (`SQLITE_AUTH`).

---

## 3. The three questions, as verified queries

### Q1 — new verified players since yesterday

"Verified" per Tom = **progressed past level 1**. Level lives in the JSON profile
blob, not a column, and a player who has never synced has `profile IS NULL`, which
must count as level 1, not as an error.

```sql
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN CAST(COALESCE(json_extract(profile,'$.level'),1) AS INTEGER) > 1
           THEN 1 ELSE 0 END) AS verified,
  SUM(CASE WHEN created_at > (strftime('%s','now','-1 day')*1000)
           THEN 1 ELSE 0 END) AS new_24h
FROM players
```

Real output, 2026-08-08: `{'total': 26, 'verified': 11, 'new_24h': 2}`

**A caveat the routine must not paper over.** `new_24h` counts accounts CREATED in
the last day; `verified` is a lifetime total. There is no timestamp for "the
moment they crossed level 2", so **"new verified players since yesterday" cannot
be answered exactly from the schema as it stands.**

Two honest options, pick one and say which in the report:

- **(a) Recommended, no schema change.** Persist yesterday's `verified` count in a
  small state file next to the routine and report the DELTA. First run has no
  baseline, so it says so.
- **(b) Cleaner, needs a migration.** Add `verified_at INTEGER` to `players`, set
  by the Worker the first time a synced profile reports level > 1. Then the
  question is a single exact `WHERE verified_at > ...`. Additive column, matches
  the project's additive-only data rule.

Do not silently report `new_24h` as if it were new verified players. It is not:
a new account is almost always still level 1.

### Q2 — new survey responses since yesterday

```sql
SELECT COUNT(*) AS total,
       SUM(CASE WHEN ts > (strftime('%s','now','-1 day')*1000) THEN 1 ELSE 0 END) AS new_24h
FROM leads
```

Real output, 2026-08-08: `{'total': 12, 'new_24h': 2}`

For the detail of any new ones (name, what they want, whether they left an email
and opted in):

```sql
SELECT id, label, name, email, email_optin, most_wanted, feedback, features, app_v, geo, ts
FROM leads WHERE ts > (strftime('%s','now','-1 day')*1000) ORDER BY ts DESC
```

There is already a working reader at `server/surveys.py` (`./surveys.py`, or
`--emails` for opted-in addresses only). Reuse it rather than rewriting the SQL.

**Privacy:** `email_optin` is a real consent flag. An address without the tick has
not agreed to be contacted. The morning report may say "1 new response, email
provided, opted in", but must not turn un-opted-in addresses into a mailing list.

### Q3 — open bug reports and POI issues

Everything lands in one `reports` table, distinguished by `kind`:

| kind | what it is | who sends it |
|---|---|---|
| `feedback` | free-text bug report / tester feedback | `openFeedbackSheet`, `js/app.js:6206` |
| `unreachable` | POI you cannot physically reach | map report sheet, `js/app.js:9918` |
| `den-nominate` | player nominating a landmark for a den | same sheet |

```sql
SELECT kind, COUNT(*) AS n, MAX(ts) AS newest FROM reports GROUP BY kind
```

Real output, 2026-08-08:
```
{'kind': 'den-nominate', 'n': 2, 'newest': 1785010481372}
{'kind': 'unreachable',  'n': 8, 'newest': 1786065924962}
```

So on that day: **POI issues = 10** (`unreachable` + `den-nominate`), **bug
reports = 0** (no `feedback` rows yet). Total 10, which is **over Tom's threshold
of 5 and should have been flagged.**

**The biggest gap in this whole routine: `reports` has no resolved/closed column.**
Verified against `server/schema.sql` — there is no `status`, `resolved`, `closed`
or `done` field. So "open bug reports" currently means "every report ever filed",
and the number can only ever grow. Left alone, this report will flag red every
morning forever and Tom will stop reading it, which is worse than not sending it.

Fix before this routine is worth running (additive, one column):

```sql
ALTER TABLE reports ADD COLUMN resolved_at INTEGER;
```

Then "open" is `WHERE resolved_at IS NULL`, and the admin dashboard gets a way to
tick items off. Until that exists, the report must say **"10 total reports ever
filed; there is no way to mark one resolved yet, so this is not a backlog count"**
rather than pretending it is an open-issue count.

---

## 4. Presentation

Tom asked for Boneheadz colours/fonts/vibes only. Do not invent a palette.

**Canonical source of truth:** `tally/app.css` `:root`, and the brand deck at
`tally/docs/brand/boneheadz-brand-deck.html` (read it before any Boneheadz visual
work).

| token | value | use |
|---|---|---|
| `--bg` | `#0d0c12` | page ground |
| `--surface` / `--surface-2` | `#16151d` / `#1e1c26` | cards |
| ink | `#17151d` | 2px borders, hard sticker shadows |
| `--text` / `--text-2` / `--text-3` | `#f2e9d7` / `#b9ac97` / `#8f8578` | bone-white type |
| `--accent` | `#a5e847` | lime: good news, "all clear" |
| `--coral` | `#fd6857` | the hero accent: red flags ONLY, sparingly |
| `--gold` | `#ffc961` | counts, level chips |
| `--violet` | `#9b92e8` | dust / secondary |
| `--display` | `Bangers` | headings only |

House style: 2px ink borders, hard offset shadows (`4px 5px 0 rgba(0,0,0,.55)`),
no glassmorphism, no gradients-as-decoration. Coral is the loudest thing on the
page and must stay rare or it stops meaning anything.

**If the output is an artifact/HTML page:** Bangers cannot be linked from a CDN
(CSP blocks it) — inline it as a data URI. There is a working precedent at
`tally/help/steps.html`, which inlines Bangers at 17KB.

---

## 5. Report structure

1. **TL;DR first**, two or three sentences. Tom reads this on a phone.
2. The three counts, big and scannable.
3. **Red flags** section, only if there is something in it. An empty red-flags
   section every morning trains him to skip the whole report.
4. **Positive findings** — a first-time verified player, a survey response with a
   real feature request. He asked for these explicitly and they are the reason to
   open it.

Language rules, from the project's standing instructions:
- **Never use em dashes.** Periods, commas, colons, parentheses. Hyphens or "to"
  for ranges. This applies to the report itself.
- Say "no new verified players and no new survey responses" plainly when that is
  the case. Do not pad.
- At or below 5 reports, say the backlog is manageable, in one line.

---

## 6. Traps, all hit for real on 2026-08-08

1. **Wrangler losing D1 scope.** Silent until every query 7403s. Detect and say so;
   never report zero when the real answer is "could not read".
2. **`--json` is not parseable JSON.** Banner and update notices wrap it. Use the
   raw decoder above.
3. **`json_extract` on a NULL profile returns NULL, not 1.** Without `COALESCE`,
   never-synced players silently drop out of the totals instead of counting as
   level 1.
4. **Timestamps are milliseconds**, so compare against `strftime('%s','now',...)*1000`.
   Forgetting the `*1000` makes every row look ancient and every "new since
   yesterday" count come back 0, which reads as a quiet day rather than a bug.
5. **Tom is in the data.** His own account (`Wretched Goblin`,
   device `fb31564c-22cc-49e8-836b-2da8fbf8531f`) is excluded from the `/stats`
   dashboard aggregates but NOT from these raw queries. Decide whether to exclude
   him and say which; his own survey response is in the leads table too.
6. **Junk accounts.** 17 were purged on 2026-08-08. Abandoned installs used to
   register a cloud player with a NULL profile, which is exactly why "verified"
   is defined as level > 1 rather than as a row existing.

---

## 7. Open questions for Tom

- **Which Q1 option**, (a) delta from a stored baseline, or (b) add `verified_at`
  and answer it exactly? (b) is a ten-minute Worker change and makes the number
  honest forever.
- **Add `resolved_at` to `reports`?** Without it the "open issues" count is
  really "issues ever filed" and the threshold flag is meaningless.
- **Exclude Tom's own account** from the counts?
- **Delivery:** where does this land? Slack was ruled out on 2026-08-08. The
  existing admin dashboard is at
  `https://tommillerca.github.io/tally/server/dashboard.html` (admin token in
  `~/.boneheadz-admin-token.txt`), so a morning artifact could either be a page he
  opens or something pushed to him.
