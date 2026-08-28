# Boneyard density: the measurement behind the floor

Measured 2026-08-28. **Nothing in `tests/boneyard-density-audit.mjs` was changed by
this document.** It exists so the `VISIBLE` floor becomes a decision with numbers
under it instead of a threshold nudge.

---

## 1. What was measured, and how

The audit's two red rows are:

```
FAIL VISIBLE  6.75 spawn markers on screen              floor 10
FAIL VISIBLE  the emptiest location still shows 3       floor 5 (= ceil(10/2))
```

The audit samples **4 fixed Vancouver locations on whatever day it runs**, takes the
mean, and grades it against 10 and the worst-of-4 against 5.

**Method of this sweep, deliberately identical to the audit's per-cell procedure**, so
the numbers are directly comparable:

- Same viewport: 440x956 @2x, `isMobile`, `hasTouch` (iPhone 17 Pro Max).
- Same browser flags: `--use-gl=angle --use-angle=swiftshader`, `HEADLESS_MODE=shell`.
- Same per-cell sequence: `setGeolocation` -> `#/today` -> `reload` -> 1.5 s ->
  `#/boneyard` -> 1.5 s -> click `#mapStart` -> **12 s settle** -> count.
- Same counting expression, copied verbatim: `.map-spawn.maplibregl-marker`, `far`
  markers excluded, marker centre inside the map **canvas** rect, `opacity > 0.01`.
- Same tree served locally (`serveTree`), never production.

**What was added:** the date seed was moved. The page clock was shifted forward by whole
days (`Date` swapped at document-start, `Date.now` offset by `N * 86400000`). Whole days
only, so the time-of-day (and therefore the 45-minute spawn instance) is unchanged and
`dateKey()` is the only thing that moves.

**Grid actually measured: 50 of 50 cells. 10 locations x 5 consecutive dates. Complete,
no cells dropped.** Every cell passed the audit's own CONTROL conditions (canvas present,
markers drawn, header parsing as a spawn count) and the header agreed with the visible
count within 1 in **50 of 50** cells, so the sample is real and not a blank screen.

A second, pure measurement (no browser, no tiles, no renderer) counted spawns from
`js/hunt.js` within a fixed 300 m band over **600 cells (10 locations x 60 consecutive
dates)**, purely to check that the 5 dates in the browser grid are not a lucky window.

---

## 2. The grid: spawn markers on screen

Rows are locations, columns are date seeds. Cells are markers drawn inside the map canvas.

| location | 2026-08-28 | 2026-08-29 | 2026-08-30 | 2026-08-31 | 2026-09-01 | min | mean | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| downtown waterfront (49.2827, -123.1207) *(audit spot 1)* | 12 | 3 | 6 | 7 | 12 | 3 | 8.00 | 12 |
| kitsilano grid (49.2650, -123.1560) *(audit spot 2)* | 5 | 10 | 12 | 8 | 10 | 5 | 9.00 | 12 |
| main/kingsway (49.2490, -123.1000) *(audit spot 3)* | 9 | 4 | 8 | 7 | 6 | 4 | 6.80 | 9 |
| east side grid (49.2790, -123.0680) *(audit spot 4)* | 4 | 5 | 11 | 7 | 10 | 4 | 7.40 | 11 |
| sunset/south van (49.2260, -123.1010) | 5 | 7 | 3 | 9 | 11 | 3 | 7.00 | 11 |
| trout lake (49.2450, -123.0700) | 8 | 16 | 9 | 3 | 11 | 3 | 9.40 | 16 |
| commercial drive (49.2680, -123.0980) | 4 | 16 | 10 | 4 | 10 | 4 | 8.80 | 16 |
| dunbar (49.2320, -123.1560) | 10 | 10 | 13 | 5 | 13 | 5 | 10.20 | 13 |
| cambie/city hall (49.2570, -123.1250) | 11 | 11 | 7 | 12 | 12 | 7 | 10.60 | 12 |
| killarney (49.2210, -123.0680) | 13 | 3 | 7 | 9 | 12 | 3 | 8.80 | 13 |
| **mean of all 10 locations** | **8.10** | **8.50** | **8.60** | **7.10** | **10.70** | | **8.60** | |
| **emptiest of all 10 locations** | **4** | **3** | **3** | **3** | **6** | | | |

### Distribution over all 50 cells

```
min 3   p10 4   p25 6   median 9   p75 11   p90 13   max 16   mean 8.60
histogram  3:4  4:4  5:4  6:2  7:6  8:3  9:4  10:7  11:5  12:6  13:3  16:2
```

Marker budget, free from the same sample: the busiest cell held **68** live DOM markers,
well inside the audit's ceiling of 100.

---

## 3. Date versus location: how much of the swing is which

Two-way balanced variance decomposition on the 50 rendered counts:

| source | share of total sum of squares |
|---|---:|
| LOCATION (which place you stand) | **13.1%** |
| DATE (which day the run happens) | **12.1%** |
| residual / interaction (this place, on this day) | **74.8%** |

- Location means span **6.80 to 10.60** (1.56x).
- Date means span **7.10 to 10.70** (1.51x).

The pure generator over 600 cells agrees on the direction and is even more lopsided:
LOCATION 1.3%, DATE 10.0%, residual 88.8%; per-date mean swing 1.42x, per-location mean
swing 1.12x.

**The headline is not "it is the date".** Date and location contribute roughly equally,
and together they account for about a quarter of the variation. **Three quarters of it is
the cell roll**: the specific interaction of one place with one day. The spawn field
re-rolls every slot's position per date, so a location has no persistent character worth
calibrating against. Downtown waterfront, the spot the 2026-08-22 note said "draws 3 to 4
every single run", drew 12, 3, 6, 7, 12 across five consecutive days.

That is why a 4-location sample cannot hold a tight floor: it is a 4-draw mean from a
distribution with a standard deviation near 3, so its own standard error is about 1.5
markers before the app is even involved.

### Are these 5 dates a lucky window?

No, and slightly on the low side if anything. Against the 60-date pure distribution, the
per-date field means of the five dates sampled sit at the **73rd, 73rd, 13th, 43rd and
68th percentile**. One of the five (2026-08-30) is near the bottom of a two-month range.

---

## 4. What the current floor actually does

Simulating a run by drawing 4 locations from the 10 and grading them exactly as the audit
does (**mean >= FLOOR and worst >= ceil(FLOOR/2), both must pass**), over every 4-of-10
choice x 5 dates = **1050 simulated runs**:

| floor | worst-row floor | mean row passes | worst row passes | **BOTH pass** |
|---:|---:|---:|---:|---:|
| 4 | 2 | 99.9% | 100.0% | **99.9%** |
| 5 | 3 | 99.1% | 100.0% | **99.1%** |
| 6 | 3 | 94.5% | 100.0% | **94.5%** |
| 7 | 4 | 82.2% | 70.7% | **64.0%** |
| 8 | 4 | 62.9% | 70.7% | **52.8%** |
| 9 | 5 | 43.5% | 48.7% | **35.6%** |
| **10 (current)** | **5** | **26.0%** | **48.7%** | **23.0%** |
| 11 | 6 | 12.6% | 38.2% | **11.3%** |
| 12 | 6 | 1.3% | 38.2% | **1.2%** |

**The floor of 10 passes 23% of the time on healthy code.** Three runs in four go red for
no reason but the dice. That matches the row's recorded history exactly: 13.75 when
written, 9.25 on 2026-08-22, 7.75 in a release gate this week, 15.4 on 2026-08-27, all on
code that never regressed.

The audit's own four spots, per date in this sweep, would have produced:

| date | mean of the 4 audit spots | worst of the 4 |
|---|---:|---:|
| 2026-08-28 | 7.50 | 4 |
| 2026-08-29 | 5.50 | 3 |
| 2026-08-30 | 9.25 | 6 |
| 2026-08-31 | 7.25 | 7 |
| 2026-09-01 | 9.50 | 6 |

Five consecutive days, same code, and the mean row lands anywhere from 5.50 to 9.50.

### Sampling all 10 locations does not rescue the floor of 10

| floor | worst-row floor | mean row passes | worst row passes | **BOTH pass** |
|---:|---:|---:|---:|---:|
| 6 | 3 | 100.0% | 100.0% | **100.0%** |
| 7 | 4 | 100.0% | 40.0% | **40.0%** |
| 8 | 4 | 80.0% | 40.0% | **40.0%** |
| 9 | 5 | 20.0% | 20.0% | **20.0%** |
| **10 (current)** | **5** | **20.0%** | **20.0%** | **20.0%** |

(5 simulated runs, one per date, so these percentages are coarse. They are here to show
the direction, not to be read to the decimal.)

A bigger location sample makes the **mean** row far more stable, which is the fix the
2026-08-22 note asked for. But it makes the **worst-of-N** row *harsher*, because the more
locations you sample the more certain you are to hit the low tail. That is the trade the
decision below turns on.

---

## 5. What the emptiest realistic screen actually looks like

- **The floor of the whole 50-cell sample is 3 markers.** Never 0, never 1, never 2.
- 3 markers occurred in **4 of 50 cells (8%)**. 4 markers in another 4 (8%). 5 in another 4.
- **p10 is 4 markers. p25 is 6.**
- Counted per date across all 10 locations, the number of locations drawing fewer than
  4 markers was **0, 2, 1, 1, 0** (never more than 2 of 10). Fewer than 3: **0, 0, 0, 0, 0**.

So the honest statement of the emptiest realistic screen is: **a player somewhere in the
city sees 3 markers on roughly one screen in twelve, and no realistic screen in this
sample went below 3.** That is a real floor of the shipped generator, not a regression.

For reference, the parent branch this whole audit was built to catch (`econ/boneyard-supply`,
bfacd28) drew **mean 4.00, worst 3** per the audit's own docstring. Note carefully: **its
worst location was also 3.** Any worst-row floor of 3 or below cannot distinguish the
current branch from the bug the row exists to catch. Only the mean row can.

---

## 6. Floor options

Each option states the pass rate measured on the grid above, and what it gives up. Pick
one; none of these have been applied.

### Option A — floor 6, worst-row 3, keep 4 locations

- **Pass rate on healthy code: 94.5%** (1050 simulated runs). ~1 red in 18.
- Still red on the bug: parent branch mean 4.00 < 6.
- **Gives up: the worst-row prove-red.** The parent's worst location was 3, and
  `ceil(6/2) = 3`, so the worst row would stay green on the parent branch. That row becomes
  decorative and should be deleted rather than kept as a check that cannot fail.
- Cheapest option: two constants, no change to the audit's runtime.

### Option B — floor 7, worst-row 4, keep 4 locations

- **Pass rate on healthy code: 64.0%.** ~1 red in 3. Too flaky to gate on.
- Keeps both prove-reds: parent mean 4.00 < 7 red, parent worst 3 < 4 red.
- **Gives up: usability.** This is roughly the highest floor that still preserves both
  prove-reds, and the measurement says preserving both at n=4 costs more false reds than
  the row is worth.

### Option C — floor 6 on a 10-location mean, and replace worst-of-N with a tail count

- Sample all 10 locations. Grade `mean >= 6` **and** `at most 2 of 10 locations below 4`.
- **Pass rate on healthy code: 100%** on the measured grid (mean row 8.10/8.50/8.60/7.10/10.70,
  all >= 6; below-4 counts 0/2/1/1/0, all <= 2).
- Keeps both prove-reds: the parent's mean of 4.00 is red, and a branch where the map goes
  genuinely sparse pushes the below-4 count past 2 while a single unlucky location cannot.
- **Gives up: runtime.** 10 locations x ~16 s per location is about 2.7 minutes of settle
  per run instead of ~1.1, in a gate that already runs long. It also needs a real code
  change to the audit, not a constant edit.
- This is the option that answers the 2026-08-22 note's actual complaint ("a bigger
  location sample, which invalidates the floor calibrated against these four") rather than
  working around it.

---

## 7. Reproducing this

The two throwaway harnesses used here (`tests/scratch-density-sweep.mjs`,
`tests/scratch-density-pure.mjs`, `tests/scratch-density-report.mjs`) were deleted after
the run, as scratch instruments should be. To reproduce: copy the audit's per-cell block,
add the whole-day `Date` shift described in section 1, and widen `SPOTS`. The raw 50 rows
are reproduced in section 2 in full, so nothing here depends on those files surviving.
