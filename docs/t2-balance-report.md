# T2 balance advisory, 2026-09-08

The fixed stress-board maximum fell from 99.5% to 89.0%. All 105 cells meet the 90% observed ceiling. A separate 400-seed held-out sample peaks at 89.75%, with no cell above 90%. This is advisory evidence for independent review, not release certification.

## Provenance and scope

Verified the supplied plan file against SHA256 `7fcef9d2f24ae1525284bfa70a901f71c67686caf8fdac67e1b64ab1c1555dab` before editing. All source edits resolve inside this checkout. Historical production for controls was read from this checkout's Git objects or saved before editing and placed in `/private/tmp/t2-proof`. No original checkout named in historical material was edited.

The historical findings in the work order are accepted, not re-derived. The before arm here is this checkout's incoming T1 production, including Skewer recovery and the existing 1.5x intrinsic stat cap.

## Target and method

Target: observed win rate between 0% and 90% in every fixed stress cell, plus at least a 5 percentage point advantage over a matched no-pet control for each daily-Glutton species/build cell. The upper bound reserves meaningful losses; the advantage floor prevents simply making pets useless. Hard rungs may legitimately approach zero. Existing ordinary-pet outcome ceilings and reward floors remain unchanged and pass.

Both full pet boards ran through `tests/fight-sim.mjs --pets-only --seeds 200`. Each includes 78 representative rows, 75 decomposition rows, the 560,000-fight mixed-path envelope and 105 stress cells with paired no-pet controls. Stress cells use all seven species, level 10, shiny, lineage 20, with Skewer, Crow Lord, or both. C1 uses Jinx/Double Hex/Mark/Deep Hex/Havoc; the others use the first legal path. Owner stats are 55, and all five opponents use the existing real encounter configurations. The ordinary envelope covers every legal mixed path at levels 6 and 10, ordinary and shiny/lineage20.

Tuning uses seed s*7919, s=1..200. The held-out check uses 400 unseen seeds, s=201..600, through the same exported `runFight`. Wilson intervals, winning-turn medians and paired controls are retained in [the measurement artifact](t2-balance-measurements.json). These are finite samples and fixed builds, not a guarantee about all builds or population probabilities. The held-out peak's 95% Wilson interval is 86.4% to 92.4%.

## Measured diagnosis and tuning

At C4/Crow Lord/Skewer, disabling pet actions while preserving the body and aura changes 99.5% to 46.5% on the daily Glutton. A fragile-body diagnostic (intrinsic HP and reflex zero, owner HP contribution still present) changes it to 84.5%. Ordinary intrinsic stats give 96.0%; removing the pet entirely gives 11.0%. At C1 with the same combination, the corresponding figures are 96.0%, 50.0%, 58.5%, 94.0% and 11.0%. Sustained pet actions dominate the measured edge, and body survival enables them. These ablations change interactions and RNG consumption, so they are not additive causal shares.

Trials, each re-measured over the same 105 stress cells:

| Trial | Damage factor | Enemy pet-target chance, healthy/low | Maximum win% |
|---|---:|---:|---:|
| Incoming | 1 | 18% / 45% | 99.5 |
| Less pet pressure | 1 | 8% / 25% | 100.0 |
| More pet pressure | 1 | 35% / 65% | 99.0 |
| High pet pressure | 1 | 65% / 75% | 97.0 |
| Damage alone | 0.5 | 18% / 45% | 96.0 |
| Combined first trial | 0.5 | 35% / 65% | 91.0 |
| Final | 0.5 | 50% / 65% | 89.0 |

Final production halves the rounded special bite damage, poison tick and imp Signature burn intents. Crits, stacks, durations, recovery, support effects and basics retain their existing rules. Enemy turns target a living pet at 50%, or 65% below 40% HP, limiting prolonged free actions and aura uptime. The intrinsic stat cap stays 1.5x because changing intrinsic stats alone did not address the action contribution. There is no random win/loss override.

## Stress distributions

Min / median / maximum across the 21 stress builds per opponent, win%:

| Opponent | Before | After |
|---|---|---|
| dailyGlutton | 82.5/93.5/99.5 | 47.5/75.0/89.0 |
| champion | 34.5/62.5/83.5 | 15.5/31.5/47.0 |
| endless1 | 32.5/58.5/87.0 | 11.5/25.5/50.5 |
| glutton10 | 8.5/30.0/69.5 | 2.0/9.0/27.0 |
| wanderer13 | 14.5/51.5/85.0 | 5.0/25.0/52.0 |

Cells at or above the historical 95% flag: 9 before, 0 after.

Complete stress distribution below. Each vector follows daily Glutton / Champion / Endless 1 / Glutton 10 / Wanderer 13; all numbers are win%.

| Pet/build | Before | After |
|---|---|---|
| C1 Skewer | 90.0/62.5/61.0/21.5/37.5 | 89.0/44.5/38.5/8.5/17.5 |
| C1 Crow Lord | 94.5/59.0/61.0/31.0/57.5 | 80.5/40.5/39.5/12.5/33.0 |
| C1 Crow Lord + Skewer | 96.0/77.0/78.5/50.0/72.0 | 86.0/47.0/50.5/27.0/52.0 |
| C2 Skewer | 82.5/44.0/39.5/9.0/14.5 | 57.0/22.5/11.5/2.0/5.0 |
| C2 Crow Lord | 84.0/56.0/50.0/28.5/32.5 | 60.5/23.0/23.5/7.5/13.5 |
| C2 Crow Lord + Skewer | 85.5/60.5/53.0/30.0/35.5 | 62.0/28.5/27.0/9.0/14.5 |
| C3 Skewer | 83.5/34.5/37.0/11.0/31.5 | 47.5/15.5/12.5/3.0/10.5 |
| C3 Crow Lord | 96.5/62.0/54.0/27.5/53.0 | 73.0/28.0/20.0/6.0/20.5 |
| C3 Crow Lord + Skewer | 98.0/73.5/68.5/35.5/68.0 | 78.5/31.5/26.0/9.5/26.5 |
| C4 Skewer | 93.5/64.5/65.5/48.5/65.5 | 59.5/25.0/20.5/6.5/15.5 |
| C4 Crow Lord | 96.5/75.0/70.0/43.5/66.0 | 79.5/34.5/25.5/11.5/27.5 |
| C4 Crow Lord + Skewer | 99.5/83.5/87.0/69.5/85.0 | 88.5/40.0/40.5/21.5/39.5 |
| C5 Skewer | 92.0/61.0/45.0/16.0/29.0 | 78.5/39.5/25.5/7.0/15.0 |
| C5 Crow Lord | 86.0/70.5/58.5/31.5/48.0 | 69.0/35.0/29.5/10.0/25.0 |
| C5 Crow Lord + Skewer | 89.0/77.5/68.0/42.0/56.0 | 72.0/43.0/37.5/13.5/29.0 |
| CX Skewer | 85.5/40.5/39.5/11.5/33.0 | 55.0/18.0/13.5/4.0/12.5 |
| CX Crow Lord | 95.5/65.0/57.0/27.5/51.5 | 76.0/31.0/25.0/11.5/27.5 |
| CX Crow Lord + Skewer | 98.0/75.5/72.5/39.5/68.0 | 84.0/38.5/31.0/14.0/34.0 |
| C6 Skewer | 82.5/38.0/32.5/8.5/27.5 | 52.5/17.5/12.5/3.0/12.0 |
| C6 Crow Lord | 95.0/62.0/54.0/25.0/49.0 | 75.0/30.5/24.0/8.5/25.0 |
| C6 Crow Lord + Skewer | 98.0/74.0/69.0/37.0/64.0 | 81.0/34.5/30.0/14.0/32.0 |

Matched no-pet controls stay identical: Skewer-only 1.5/0.5/0.5/0.0/0.5%; Crow Lord, with or without Skewer, 11.0/1.0/0.5/0.5/1.5%. Final daily-Glutton pet advantages range from 46.0 to 87.5 percentage points.

## Ordinary mixed-path envelope

Maxima across all legal level-10 paths and ordinary/high intrinsic profiles. Same five-opponent order, win%:

| Pet | Before | After |
|---|---|---|
| C1 | 87.0/55.5/49.0/14.0/22.0 | 83.5/48.5/34.5/6.5/16.5 |
| C2 | 88.5/54.0/45.5/10.0/26.5 | 73.5/30.5/19.0/4.0/13.0 |
| C3 | 87.0/39.0/35.0/12.5/33.0 | 50.0/24.5/16.0/6.5/13.0 |
| C4 | 88.5/48.5/46.0/25.0/46.0 | 53.0/18.5/16.5/3.0/11.5 |
| C5 | 89.5/57.5/46.0/14.5/30.5 | 77.0/35.0/22.5/5.5/15.0 |
| CX | 84.5/38.0/33.0/7.0/27.0 | 53.0/25.0/16.0/6.5/14.0 |
| C6 | 82.0/37.0/30.0/6.0/25.5 | 51.5/24.5/16.5/6.5/13.5 |

Before level-6 maxima across species: 69.0/18.5/14.0/3.5/5.5%.

After level-6 maxima across species: 64.0/21.0/13.0/1.5/4.5%.

## Copy and existing owners

Combat stats, level, earned lineage, shiny state, picks and serialized pet builds are unchanged. Owners experience lower offensive special damage and more enemy pressure on their pets. Family effect hashes were deliberately re-frozen after measurement; build hashes, counts, the original fixture and independent identity guard remain intact.

Stable help, pet cards, lineage details, the breeding preview and result now share the capped stat calculation. Breeding previews and receipts compute actual rounded stat gains at the keeper's level, including an explicit no-combat-gain result at the cap. The unconditional stronger celebration is removed. Shiny help discloses its multiplier before rounding and the shared cap. One historical player-facing changelog sentence was corrected to avoid continuing the uncapped promise; no release entry or version stamp was added.

The secondary 2,000-seed hound dish check found baseline 1716 wins and Skewer 1750, a difference interval of -0.4 to 3.8 percentage points. Skewer's unsupported measured-benefit sentence was removed. Its one-turn recovery description remains. The existing NOCLAIM path now requires that comparison to span zero, and will fail upward if the edge returns. No numerical confidence threshold was relaxed. Bonemeal Kibble and all other dish claims still pass.

## Proof output

Agreed command, executed in this checkout:

```text
node tests/unit.test.js
369 passed, 0 failed
exit 0
```

Additional Node-only checks:

```text
node tests/pet-stress-guard.mjs
pet-stress: 105 cells x 200 paired fights, 90% ceiling and daily +5pp floor PASS
CONTROL empty, duplicate, zero-seed, NaN, saturated and no-advantage samples rejected; capped copy PASS
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
```

`node --check js/app.js` and `git diff --check` passed. Before/after complete pet boards and the held-out stress run exited 0. The guard is registered directly in the release gate's PURE initializer. The browser/full release gate itself was not run.

Expected-red controls, all exit 1, with final production subsequently green:

- Old damage and targeting in a throwaway tree: `C1 Crow Lord/dailyGlutton: 94.5% exceeds 90% ceiling`.
- `--control-empty`: `stress sample must contain all 105 cells`.
- `--control-degenerate`: `stress cells must be unique and cover every species/build/foe`.
- Old damage against the updated frozen family guard: `NO-DRIFT ... C1 level 10`.
- Old app copy with final tuning: stale uncapped-lineage source assertion fails.
- Restored Skewer benefit claim with final tuning: PET confidence assertion fails, alongside claimed/unclaimed coverage assertions.

Raw board, proof and red-control transcripts remain in `/private/tmp/t2-proof`. The checkout-local measurement artifact retains all 105 before/after stress results, controls, intervals, both 14-row envelopes, the 105 held-out results and diagnostic ablations.

## Files changed

- `js/pets.js`: special damage budget and shared cap/breeding-copy helpers.
- `js/pit.js`: measured enemy targeting probabilities.
- `js/app.js`: capped lineage/shiny disclosure and exact breeding gains.
- `js/cooking.js`: remove unsupported Skewer worth claim.
- `js/changelog.js`: correct one historical uncapped-lineage sentence.
- `tests/fight-sim.mjs`: reusable stress builds/cells, paired controls, stress-only CLI and current report access.
- `tests/pet-stress-guard.mjs`: new sim-backed outcome, coverage, negative-control and copy guard.
- `tests/release-gate.mjs`: register the guard in PURE.
- `tests/balance.mjs`: update three exact effect assertions to 4 poison, 4 burn and 6 pre-crit bite; outcome bands unchanged.
- `tests/pet-family-audit.mjs`: deliberate effect-only hash update.
- `tests/dish-worth-audit.mjs`: measured Skewer NOCLAIM registration; thresholds unchanged.
- `docs/t2-balance-report.md`: this advisory report.
- `docs/t2-balance-measurements.json`: complete numerical evidence.

## Denied/blocked actions, deviations and limits

No denied action or approval rejection occurred. No sockets, browser, commit, push or publish was attempted. Browser operation, rendered copy, native environments and release-gate certification are explicitly unrun.

No frozen requirement proved impossible and no requirement was redesigned. The cap remained 1.5x by measurement; the tuning instead acts on damage and enemy targeting, within the authorized balance scope. Supporting scope expanded to the stale historical changelog sentence and the now-unsupported Skewer claim because the work order includes player-facing claims invalidated by the maths.

Intermediate failures were measured and resolved: three exact old effect assertions, the old family effect snapshot and Skewer's confidence claim. One initial search used an unmatched shell glob; a later orchestration call had a JavaScript syntax error before any command launched. Both were corrected. Abandoned numeric trials are listed above; their targeting values are absent from final production.

The stress guard covers the specified paths and combinations, not all possible food/player-talent combinations or every owner stat profile. Strong ordinary pets still offer large advantages. The 90% ceiling is an observed regression band, not a statistical assertion that the true rate is below 90%. Independent review should operate the changed copy surfaces and assess the more aggressive pet targeting in play.
