# T2 round 2 advisory, 2026-09-08

**The tuning board meets both bands. Held-out validation fails the peak band.** The final tuning distribution is 3.5% minimum, 47.5% median, 88.5% peak. Fresh held-out seeds give 4.75% minimum, 47.0% median, 93.5% peak. All matched no-pet controls are unchanged. This candidate is ready for independent review, but it does not establish the requested peak on unseen seeds.

## Provenance and method

Verified the supplied plan SHA256 `cbe3519a4fbaac733c314e0798931a8cfcbf4b76167f9e41752c53a5ea8eebce`. Every edited path resolves inside this checkout. The incoming checkout was clean at `8dce49f9`. No original checkout was edited.

“Before” retains the original pre-round-1 measurements from the incoming JSON, with a 61.0% median and 99.5% peak. “Round 1” is the incoming flat-multiplier production, with a 27.0% median and 89.0% peak. Those historical arms are retained evidence, not claimed as newly rerun full boards. “After” is final production on seeds s=1..200. “Held-out” is final production on fresh s=601..1000. Every seed is s*7919. Each of the 105 cells retains a no-pet control, wins, draws, 95% Wilson intervals and winning-turn intervals in [the measurement artifact](t2-balance-measurements.json).

The same seven species, three builds, five real encounter configurations, owner stats 55, level 10, shiny and lineage 20 remain in use. C1 retains Jinx/Double Hex/Mark/Deep Hex/Havoc; other species retain the first legal path. Each cell has equal weight. The median is the middle of 105 cell rates, not the pooled fight rate.

The first candidate was frozen before checking s=201..600: tuning 47.5% median/90.0% peak, validation 48.25% median/93.25% peak. That failed validation is preserved separately and informed the opening-bite diagnostic. It is not reused as final held-out evidence. After selecting the final soft-cap candidate using the original tuning seeds, s=601..1000 was checked once. No production parameters changed after that check.

## Selected shape and measured tradeoff

Let L = max(0, owner remaining-health fraction - foe remaining-health fraction - 0.15). Pet special damage, poison and burn use multiplier 1/(1+64L), rounded once after scaling. Damage is unchanged when behind or within the 15 percentage point lead allowance. A 25-point lead gives a factor about 0.135; a 50-point lead gives about 0.043. At large leads small special intents can round to zero. Existing poison/burn durations and stacks, crit resolution, basic attacks, support effects and cooldown rules remain intact. Missing HP in legacy pure-effect callers means no measured lead, so the multiplier is 1.

Before applying that factor, a bite up to 16 damage is unchanged. Above 16, use 16 + 8*(damage-16)/(8+damage-16), approaching 24 before engine crits. This limits large opening bites before a lead exists. It is not an absolute cap on total crit, multi-bite or poison damage.

Enemy targeting uses the same L: base + (0.8-base)*min(1,3L), where base is 18% for a healthy pet and 45% below or at 40% pet health. This restores pre-round-1 pressure while behind and increases it toward 80% as the owner pulls ahead. It is evaluated only with a living pet and does not consume any extra RNG draws. No encounter IDs, species-specific win odds or random win/loss overrides are used.

**Scope extension reported during implementation:** damage-only restoration with round-1 targeting measured a 41.5% median and 98.0% peak. It offered no observed room to reach the median band using damage reductions. The candidate therefore shapes the existing round-1 targeting intervention as well as damage. This extends the requested replacement of the flat multiplier; it is explicitly proposed for review. No claim is made that every possible damage-only design is mathematically impossible.

## Full distributions

All entries are minimum / median / peak win%, with complete per-cell vectors below.

| Group | Before | Round 1 | After | Held-out |
|---|---|---|---|---|
| all | 8.5/61/99.5 | 2/27/89 | 3.5/47.5/88.5 | 4.75/47/93.5 |
| dailyGlutton | 82.5/93.5/99.5 | 47.5/75/89 | 55/84.5/88.5 | 49.5/84.5/93.5 |
| champion | 34.5/62.5/83.5 | 15.5/31.5/47 | 24.5/52/67 | 21.25/53.25/69.25 |
| endless1 | 32.5/58.5/87 | 11.5/25.5/50.5 | 18.5/43.5/61.5 | 16.25/46/59.5 |
| glutton10 | 8.5/30/69.5 | 2/9/27 | 3.5/24/48.5 | 4.75/26/43.25 |
| wanderer13 | 14.5/51.5/85 | 5/25/52 | 10.5/43/64.5 | 11.25/39/64 |
| C1 | 21.5/61/96 | 8.5/40.5/89 | 17/49.5/87 | 15.75/51.5/93.5 |
| C2 | 9/44/85.5 | 2/22.5/62 | 7/41/76 | 4.75/35.25/75 |
| C3 | 11/54/98 | 3/20.5/78.5 | 4.5/45/87.5 | 4.75/43.5/86.25 |
| C4 | 43.5/70/99.5 | 6.5/27.5/88.5 | 15/50.5/87 | 16.75/49.5/91 |
| C5 | 16/58.5/92 | 7/29.5/78.5 | 16/51/88.5 | 10.75/52/85.25 |
| CX | 11.5/57/98 | 4/27.5/84 | 4/43.5/85.5 | 4.75/42.25/85.25 |
| C6 | 8.5/54/98 | 3/25/81 | 3.5/43/85.5 | 4.75/41.25/84.75 |
| Skewer | 8.5/39.5/93.5 | 2/15.5/89 | 3.5/29/88.5 | 4.75/26.25/86.25 |
| Crow Lord | 25/57.5/96.5 | 6/27.5/80.5 | 19.5/47.5/87.5 | 20/50/91 |
| Crow Lord + Skewer | 30/72/99.5 | 9/34/88.5 | 25/56.5/86.5 | 28/56.75/93.5 |

The 6 cells originally at or below 20% change by a median -4.5 percentage points, ranging from -7.5 to 0. This is smaller absolute movement than the peak reduction, but individual weak cells can still lose a substantial share of their wins. The live health-lead proxy does not guarantee protection of every low-win build.

Each vector below follows dailyGlutton / champion / endless1 / glutton10 / wanderer13.

| Pet/build | Before | Round 1 | After | Held-out |
|---|---|---|---|---|
| C1 Skewer | 90/62.5/61/21.5/37.5 | 89/44.5/38.5/8.5/17.5 | 87/52/47.5/17/35 | 86.25/45.5/46/15.75/33.25 |
| C1 Crow Lord | 94.5/59/61/31/57.5 | 80.5/40.5/39.5/12.5/33 | 84.5/49/47.5/24/49.5 | 90.5/52.75/50/26/51.5 |
| C1 Crow Lord + Skewer | 96/77/78.5/50/72 | 86/47/50.5/27/52 | 86.5/59.5/61.5/42.5/64 | 93.5/63.75/59.5/43.25/64 |
| C2 Skewer | 82.5/44/39.5/9/14.5 | 57/22.5/11.5/2/5 | 74/41.5/32/7/10.5 | 70.25/35.25/29.75/4.75/11.25 |
| C2 Crow Lord | 84/56/50/28.5/32.5 | 60.5/23/23.5/7.5/13.5 | 73/45/41/25.5/30.5 | 71.5/52/43.5/27.25/32.75 |
| C2 Crow Lord + Skewer | 85.5/60.5/53/30/35.5 | 62/28.5/27/9/14.5 | 76/49.5/43.5/26/33 | 75/56.25/46.5/28/33.5 |
| C3 Skewer | 83.5/34.5/37/11/31.5 | 47.5/15.5/12.5/3/10.5 | 55.5/24.5/18.5/4.5/18 | 51/21.75/16.25/4.75/15.25 |
| C3 Crow Lord | 96.5/62/54/27.5/53 | 73/28/20/6/20.5 | 87.5/52/41.5/19.5/45 | 86.25/50.75/43.5/21.75/43.5 |
| C3 Crow Lord + Skewer | 98/73.5/68.5/35.5/68 | 78.5/31.5/26/9.5/26.5 | 84.5/58/47.5/25/50 | 84.75/56.75/48.5/28.25/52.25 |
| C4 Skewer | 93.5/64.5/65.5/48.5/65.5 | 59.5/25/20.5/6.5/15.5 | 55/36/30/15/32 | 49.5/35/31.5/16.75/28.25 |
| C4 Crow Lord | 96.5/75/70/43.5/66 | 79.5/34.5/25.5/11.5/27.5 | 87/62/49.5/30.5/50.5 | 91/56.25/49/29.25/55 |
| C4 Crow Lord + Skewer | 99.5/83.5/87/69.5/85 | 88.5/40/40.5/21.5/39.5 | 85/62/56.5/48.5/64.5 | 89.75/60/58.5/41.75/64 |
| C5 Skewer | 92/61/45/16/29 | 78.5/39.5/25.5/7/15 | 88.5/56/39/16/25 | 85.25/53.5/38/10.75/26.25 |
| C5 Crow Lord | 86/70.5/58.5/31.5/48 | 69/35/29.5/10/25 | 78.5/59/47.5/27/40 | 79.25/63/52/31.5/42 |
| C5 Crow Lord + Skewer | 89/77.5/68/42/56 | 72/43/37.5/13.5/29 | 82/67/56.5/33/51 | 84.5/69.25/58/34.5/49.5 |
| CX Skewer | 85.5/40.5/39.5/11.5/33 | 55/18/13.5/4/12.5 | 60/28/19.5/4/15.5 | 53.5/22.75/17.75/4.75/14.5 |
| CX Crow Lord | 95.5/65/57/27.5/51.5 | 76/31/25/11.5/27.5 | 85.5/50/43.5/22.5/43 | 85.25/53.25/42.25/20/39 |
| CX Crow Lord + Skewer | 98/75.5/72.5/39.5/68 | 84/38.5/31/14/34 | 84.5/57.5/48.5/26/49.5 | 83.5/59/47.5/29.25/50.25 |
| C6 Skewer | 82.5/38/32.5/8.5/27.5 | 52.5/17.5/12.5/3/12 | 59.5/29/19.5/3.5/16 | 53/21.25/16.75/4.75/14 |
| C6 Crow Lord | 95/62/54/25/49 | 75/30.5/24/8.5/25 | 85.5/49/42/22.5/43 | 84.75/52/41.25/20.5/39 |
| C6 Crow Lord + Skewer | 98/74/69/37/64 | 81/34.5/30/14/32 | 85.5/57.5/45.5/27/46.5 | 83/57.25/47/29/48.25 |

## Controls and binding constraint

Tuning no-pet controls match the incoming production artifact in all 105 cells. Incoming production was also rerun against s=601..1000 through the same sim, using saved source modules in memory. All 105 held-out controls match final production exactly, including serialized uncertainty and turn data. Tuning control maxima stay 11.0%; held-out maxima stay 10.5%. Different seed populations can give different control rates; the comparison is exact within each paired seed population.

| Build | Tuning no-pet vector | Held-out no-pet vector |
|---|---|---|
| Skewer | 1.5/0.5/0.5/0/0.5 | 4/0.75/0.75/0/0 |
| Crow Lord | 11/1/0.5/0.5/1.5 | 10.5/2/0.75/0.25/1.75 |
| Crow Lord + Skewer | 11/1/0.5/0.5/1.5 | 10.5/2/0.75/0.25/1.75 |

**Unmet target:** held-out peak is 93.5%, 3.5 percentage points above 90%, at C1 Crow Lord + Skewer/dailyGlutton. Its 95% Wilson interval is 90.65% to 95.53%. Three held-out cells exceed 90%. The median remains inside 45-55%. The binding observed constraint is the upper tail on unseen seeds, especially Imp/Crow Lord/Skewer; a tuning-only pass is insufficient.

The tested shapes did not establish simultaneous tuning and held-out compliance. This is a measured limitation of this candidate and search, not proof that the requested balance is impossible. No band was widened and the validation miss was not concealed. Further tuning needs a new independent validation sample.

## Tuning history

All exploratory trials used only the original 200 tuning seeds. Full per-group summaries and exact factor expressions are retained in JSON. Repeated parameter combinations are retained as executed.

| Trial | Min / median / peak win% |
|---|---|
| full-damage | 2/41.5/98 |
| lead4 | 2/35/93.5 |
| lead8 | 2/32.5/92 |
| adaptive4 | 5/43.5/95.5 |
| adaptive8 | 5/43/92.5 |
| adaptive16 | 4/40.5/90 |
| baseline8 | 4.5/53.5/96.5 |
| baseline16 | 4/52/96 |
| threshold0.2-16 | 6.5/51/95.5 |
| threshold0.2-32 | 6.5/51/93 |
| threshold0.35-16 | 8.5/57.5/99.5 |
| threshold0.35-32 | 8.5/57.5/98 |
| refine0.1-32 | 5/42/89.5 |
| refine0.1-64 | 4/41/89.5 |
| refine0.15-32 | 5/47/91.5 |
| refine0.15-64 | 5/47/91 |
| refine0.2-32 | 6.5/51/93 |
| refine0.2-64 | 6/51/91 |
| final96-4-0.8 | 6/51/91 |
| final64-6-0.8 | 6/47/91.5 |
| final64-4-0.95 | 6/48/91 |
| final96-4-0.95 | 6/48.5/91 |
| band0.125 | 4.5/46/89 |
| band0.15 | 5.5/47.5/90 |
| band0.175 | 6/50/91 |
| band2-0.1-2 | 4/45/89.5 |
| band2-0.1-1 | 4.5/48/92.5 |
| band2-0.125-2 | 5/48.5/90 |
| softcap12-6 | 2/43.5/88.5 |
| softcap10-4 | 2/41.5/88.5 |
| softcap8-4 | 1.5/40.5/88.5 |
| softcap6-4 | 1.5/39/88.5 |
| softcap2-0.2-12-6 | 4/48/91 |
| softcap2-0.2-16-8 | 5.5/51/91 |
| softcap2-0.25-12-6 | 4/50/94 |
| softcap2-0.25-16-8 | 6/54.5/93.5 |
| softcap3-0.15-16-8 | 3.5/47.5/88.5 |
| softcap3-0.175-12-6 | 3/46.5/89.5 |
| softcap3-0.175-16-8 | 4.5/49/89.5 |

## Proof output

Agreed command, run in this checkout against final production:

```text
node tests/unit.test.js
369 passed, 0 failed
exit 0
```

Additional Node-only proof:

```text
node tests/pet-stress-guard.mjs
all: min/median/max 3.5/47.5/88.5%
dailyGlutton: min/median/max 55.0/84.5/88.5%
champion: min/median/max 24.5/52.0/67.0%
endless1: min/median/max 18.5/43.5/61.5%
glutton10: min/median/max 3.5/24.0/48.5%
wanderer13: min/median/max 10.5/43.0/64.5%
pet-stress: 105 cells x 200 paired fights, 85-90% peak, 45-55% median, daily +5pp floor and unchanged no-pet controls PASS
CONTROL empty, duplicate, zero-seed, NaN, saturated, no-advantage, median and moved-control samples rejected; shaped effects and capped copy PASS
exit 0

node tests/balance.mjs
128/128 passed
exit 0

node tests/pit.test.js
101 passed, 0 failed
exit 0

node tests/pet-family-audit.mjs
pet-family-audit: 14 passed, 0 failed
exit 0

node tests/dish-worth-audit.mjs
dish-worth: all rows green
exit 0

node tests/pet-stress-guard.mjs --control-empty
AssertionError: stress sample must contain all 105 cells
exit 1 (expected red)

after: all 105 no-pet controls identical, including wins, draws, rates, Wilson intervals and serialized winning-turn intervals
heldOut: all 105 no-pet controls identical, including wins, draws, rates, Wilson intervals and serialized winning-turn intervals
CONTROL round-1 engine rejected: stress median 27.0% outside 45-55% band
```

The stress guard remains directly registered in `tests/release-gate.mjs` PURE. Its empty-sample CONTROL is retained. New negative controls reject both low and high medians and any moved no-pet win count. The unchanged round-1 engine is rejected by the new guard for a 27.0% median. The guard checks the fixed tuning population; it does not turn the failed held-out result into a pass.

The existing 560,000-fight ordinary mixed-path envelope runs inside `balance.mjs`; all its unchanged outcome ceilings and reward floors pass. This round did not rerun the full 78-row representative/75-row decomposition board. Prior envelope and ablation data remain explicitly labelled historical in JSON.

Reproduction of final distributions:

```sh
node tests/fight-sim.mjs --stress-only --seeds 200
node tests/fight-sim.mjs --stress-only --seeds 400 --seed-start 601
```

`git diff --check` passes. Node-only raw transcripts and exploratory scripts are in `/private/tmp/t2b-proof`. This report and JSON are the persistent checkout-local advisory evidence.

## Files changed

- `js/pets.js`: health-lead factor, shaped targeting helper and opening-bite soft cap.
- `js/pit.js`: apply the targeting helper only for living pets.
- `tests/fight-sim.mjs`: validated seed-range support and `--seed-start` for reproducible held-out stress runs.
- `tests/pet-stress-guard.mjs`: median and lower-peak bands, frozen per-cell control counts, shape checks and negative controls.
- `tests/balance.mjs`: unscaled no-lead effect expectations; ensure the pet-kill lifecycle fixture uses a lethal basic action.
- `tests/pet-family-audit.mjs`: deliberate effect-only hash update; build hashes, counts and original fixture unchanged.
- `docs/t2-balance-measurements.json`: full distributions, cell results, uncertainty, failed validation, tuning history and source hashes.
- `docs/t2-balance-report.md`: this advisory report.

## Denied/blocked actions, deviations and unrun work

No permission denial, automatic approval rejection or sandbox-blocked action occurred. No sockets, browser, commit, push or publish was attempted. Browser checks, rendered UI, native checks and the full release gate are explicitly unrun.

Deviations are the disclosed targeting-shape extension and the unresolved held-out peak miss. The first held-out seed range was retired from validation after diagnosis; the final range is disjoint and fully disclosed. The v275 copy correction and deleted Skewer “Measured:” claim remain intact; no player-facing copy changed.

Intermediate verification issues were resolved without widening balance limits: the pet-kill fixture previously assumed a special remained lethal at a large health lead, and an in-memory comparison initially compared Infinity to its JSON null representation. The fixture now uses an unchanged basic attack and the comparison uses identical serialization on both sides. Preliminary failures are not reported as final green results.

Independent review should assess the zero-damage special behavior at large leads and whether the pressure extension is acceptable. The current candidate does not satisfy the peak target on held-out seeds and should not be represented as fully balanced.
