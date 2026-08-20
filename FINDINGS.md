# The Mimic, and four bosses in the Gauntlet

Branch `feat/mimic-gauntlet`, rebased onto `origin/main` @ `c3b7bc9`. Ships as **v421**
(v420 landed while this was in flight, so the stamp was re-read at the end and moved).

Every number below was measured. The instruments are `tests/mimic-audit.mjs` and
`tests/gauntlet-sim.mjs`, both re-runnable.

---

## 1. The pixel GIF, measured

`mimic-pixel-loop.gif` is 48x48, palette mode, **9 frames but only 5 unique**.

| GIF frame | delay (ms) | unique plate | diff px vs frame 0 |
|---|---|---|---|
| 0 | 150 | A | 0 |
| 1 | 150 | B | 541 |
| 2 | 150 | C | 628 |
| 3 | 150 | D | 881 |
| 4 | **450** | E | 977 |
| 5 | 150 | D | 881 |
| 6 | 150 | C | 628 |
| 7 | 150 | B | 541 |
| 8 | **300** | A | 0 |

Cycle 1800 ms. It is a **palindrome ping-pong**: closed, opening, wide (held 450 ms),
closing, closed (held 300 ms). Frames 0==8, 1==7, 2==6, 3==5.

**Shipped as the authored file, byte-identical, 10,358 bytes** (sha256 verified against
the source). The browser already decodes and loops a GIF at its own per-frame delays.
Rebuilding 5 plates as a sprite sheet driven by `steps(9)` would be a larger asset AND
would flatten the two holds that make it read as a chest opening rather than a flicker.
This is the Wanderer judgement applied in the opposite direction: there, three 1.2 MB
plates to animate 4 pixels was rejected; here the authored file is already the smallest
correct thing.

## 2. The fight plates, and the 498 KB that did not ship

Cam's three 2048x2048 plates are identical apart from a 553x163 eye band (measured:
plate 2 differs in x 590-1132 / y 566-700, plate 3 in x 688-1142 / y 538-678).

Downscaling flat art with Lanczos **invents colour**: 3,028 colours in, 10,088 out at
1024 px, which is what bloated the naive export to 555 KB per plate. Quantising back
through a shared palette fixes it.

| what shipped | bytes |
|---|---|
| `assets/bh/mimic/mimic.png` (plate 1, cropped to its alpha box, 640x518, 128-colour) | 248,893 |
| `assets/bh/mimic/mimic-eyes-2.png` (eye band only) | 15,010 |
| `assets/bh/mimic/mimic-eyes-3.png` (eye band only) | 14,978 |
| `assets/bh/mimic/mimic-loop.gif` (unmodified) | 10,358 |

Three FULL plates at the same size would have been ~807 KB. **Two extra full plates to
change 0.2% of an image is the thing the Wanderer finding rejected**, so only the band
ships: 30 KB instead of 528 KB.

The usual killer of a crop-overlay is quantisation seams, so all three plates were
quantised through **one shared 128-colour palette** and the generator asserted the
result: outside the band the three quantised plates differ in **exactly 0 pixels**.
There is no edge to see. Cam's art is cropped, scaled and composited, never altered.

---

## 3. Part 1 - one chest in three is a Mimic

**Where it sits.** The trace in the brief pointed at `js/poi.js`; ground loot is actually
in **`js/hunt.js`**. `poi.js` owns the fight POIs (dens, minis, secrets, the Glutton),
`hunt.js` owns the spawn field. The spawn's kind field is `type`, not `kind`, and there
is no chest tap-sheet: tapping shows a tooltip, and collection happens through a separate
`#mapCollect` button in `js/app.js`.

**The mechanism: derived, never rolled.**

```js
isMimicSpawn(spawn) = spawn.type === 'crate' && hash(`mimic:${spawn.id}`) % 3 === 0
```

`spawn.id` is `${cx}_${cy}_s${k}_i${inst}`, already built by `spawnsForCell` from the
cell, the slot and the 45-minute instance. So the answer is a pure function of the chest
itself: identical on every device, offline, forever, with no state to store and nothing
to desync. It is the same shape the whole Boneyard already uses (`spawnsForCell`,
`gluttonSpot`, `denForCell` are all pure `(period, cell) -> content`).

That gives the properties the brief asked for, for free:

- closing the sheet and tapping again cannot change the answer;
- a re-render cannot turn a Mimic back into loot;
- and when the slot rolls to its next 45-minute instance the id changes, so the spot
  re-rolls mimic-or-not on its own, exactly as it already re-rolls its type.

Measured over 4,740 generated buried crates: **31.9% are Mimics** (target 33.3%), 0
non-crate spawns ever roll Mimic, and **0 flips across 1,464 re-derivation reads**.

**The money, one-shot.** The Mimic claims the chest's **own** ledger key,
`spawn-<date>-<id>`, the exact key `collectSpawn` would have claimed. So the Mimic and
the loot he replaced compete for one row that can only exist once, and `award` resolves
that through **`db.addIfAbsent`**, where the check and the insert are a single IndexedDB
request. Reusing the spawn key rather than minting a `mimicwin-` one is not a shortcut:
it makes "a Mimic must not also pay its loot" true by construction rather than by two
branches agreeing with each other.

Measured, against the real IndexedDB:

| order | result |
|---|---|
| fight wins, then the chest tries to pay | fight paid 70 xp, chest paid **nothing** |
| chest pays, then the fight tries to pay | chest paid, fight paid **0** |
| three simultaneous claims on one chest | **1 of 3** paid, **1** ledger row |

And the branch is **before** the payout: a Mimic chest never reaches `collectSpawn` at
all. A loss or a flee claims nothing on purpose, so the chest stays and can be fought
again; it cannot be re-rolled into a reward because `isMimicSpawn` is pure.

**The flow.** `#mapCollect` tap, then `isMimicSpawn`, then `showMimicReveal()` (the 48x48
GIF, full screen, one 1800 ms cycle, tap to skip) which is **awaited**, then
`openFight(..., { mode: 'mimic' })`. The reveal is awaited rather than fire-and-forget
like `showGateIntro`, because the whole point is that the chest becomes a monster BEFORE
the arena exists.

---

## 4. Part 2 - the Gauntlet, and the measured cost of four bosses

The Glutton (every 10) and the Live Wire (every 7) were already there. Added:
**the Wanderer every 13** and **the Mimic every 6**, with strict priority so no rung is
ever two bosses and **the Glutton and the Live Wire keep every rung they held before.**

### The Wanderer: added as a fighter, not as a map creature

He did not exist. A Gauntlet fighter needs a name, art, a multiplier, a kit and rewards,
and none of that needs the roam system, the blight, or a map marker. So he is in the
Gauntlet now and **still not in the world**, which is the honest half to ship: the roam
prototype is a separate piece of work. His fight identity is a **fixed** talent tree (the
elemental one), where ordinary climbers rotate theirs by rank. That is what makes him a
character rather than a picture: you learn that the Wanderer burns you.

Art: `assets/bh/wanderer/wanderer.png`, the already-downscaled 640 px hero plate, 190 KB.

### Balance, before and after

`node tests/gauntlet-sim.mjs --seeds 200 --max 78`, real `endlessFoe` configs through the
real pit engine, foe scaled by its multiplier **relative to the ordinary curve**.

| | before (origin/main) | after | change |
|---|---|---|---|
| named-boss rungs | 17 / 78 (21.8%) | **32 / 78 (41.0%)** | +19.2 pts |
| overall mean clear rate | 37.8% | **32.5%** | **-5.3 pts (-14% relative)** |
| total first-clear coins | 60,491 | **64,784** | **+7.1%** |
| total first-clear xp | 38,454 | 40,902 | +6.4% |
| expected coins (clear-weighted) | 23,369 | **20,555** | **-12.0%** |

Per boss, mean player win rate:

| | rungs | mean clear |
|---|---|---|
| Live Wire | 10 | 73.5% |
| ordinary | 46 | 28.8% |
| **Mimic** | 9 | **30.0%** |
| Glutton | 7 | 18.1% |
| **Wanderer** | 6 | **13.0%** |

**This is a material change and it is Tom's call, not mine.** The ladder is about 14%
harder to clear and the expected payout is DOWN 12%: you meet more bosses, so you clear
fewer rungs, so you bank less even though each first clear pays more. If that is not
wanted, the single knob is the Mimic's period. Moving him from every 6 to every 9 removes
a third of the added gates.

### Two things the sim found that were not the assignment

1. **The talent tree dominates the multiplier.** At an identical 1.05x the six
   `ENDLESS_TREES` range from **5.3% to 65.7%** player win. Rung-to-rung Gauntlet
   difficulty is mostly decided by which tree the rank lands on, not by the curve.
   This is why both new bosses were tuned from measurement rather than from a spec:
   - the Mimic at 1.05x with the slab tree measured **12.0%**, making the lightest boss
     the heaviest thing on the ladder. He now uses the warden tree and measures 30.0%.
   - the Wanderer at 1.22x measured **35.8%**, i.e. EASIER than the Glutton, because his
     thematic tree is the weakest of the six. He is 1.45x and measures 13.0%.
2. **The Live Wire is currently the easiest boss on the ladder** (73.5% against 28.8% for
   an ordinary rung). His nominal config measures 11.0%; the difference is
   `foe.wraith = true`, which swaps his action set for one this AI plays badly. That is
   pre-existing, untouched here, and worth a look.

### The constraint that capped both bosses

`app.js` derives the next Gauntlet rank from the **count** of endless wins
(`nextRank = endlessBeaten + 1`). There is no skip. **Every boss rung is a hard gate**,
so going from 2 boss families to 4 nearly doubles the number of places a player can stall
permanently. That is why the Wanderer is pinned just below the Glutton rather than made
into a new class of wall, and why the Mimic was deliberately kept near ordinary.

---

## 5. Part 3 - the blink, measured in pixels

Three plates alternated. Nothing tinted, scaled, re-timed or redrawn.

Ordering was measured off the ink in the eye band, not guessed: plate 1 is lightest
(25,097 dark px, eyes open), plate 3 intermediate (31,564), plate 2 darkest (33,278,
shut). So the cycle is **open, half, shut, half, open**, which is a blink. Running
1 to 2 to 3 to 1 would snap shut then half-open on the way out, which reads as a glitch.

Measured by screenshotting the eye band every 50 ms across a full cycle, in the **real
Gauntlet arena** (seeded to the Champion plus five endless wins so the next rank is 6, a
Mimic rung, then the real `#endlessBtn` clicked). The clock is driven by seeking WAAPI
`currentTime`, because headless Chrome does not advance a CSS animation for a screenshot.

```
blink timeline (period 5200ms, sampled every 50ms):
      0- 4850ms  plate#0  (eyes open)
   4850- 4900ms  plate#1
   4900- 4950ms  plate#2
   4950- 5050ms  plate#3
   5050- 5100ms  plate#4
   5100- 5150ms  plate#1
   5150- 5200ms  plate#0  (eyes open)
```

**300 ms of blink in a 5200 ms cycle (5.8%), 5 distinct renderings.** The eyes are open
for 93% of the time, so he is a still drawing that happens to be alive.

Reduced motion **disables** the animation (`animation-name: none`, 0 running animations,
1 distinct rendering across the cycle). It never collapses the duration to 0.001 s. The
audit grades that hazard correctly: `app.css:662` deliberately collapses every duration
under reduce AND caps `animation-iteration-count` at 1, which is what actually stops a
loop, so the assertion is "short duration **and** infinite count", not "short duration".
Grading the duration alone was a false red against healthy, intentional code, and it
fired on the first run.

### Two real defects the audit caught before the PR

1. **The reduced-motion rule did nothing.** `.mimic-plate .mimic-eye` (0,2,0) lost to
   `.mimic-plate .mimic-eye.e2` (0,3,0) inside the same stylesheet, because specificity
   beats source order across a media query. Measured `animation-name: mimicHalf` with
   reduce emulated. Fixed by matching the specificity.
2. **The first sampler measured the wrong thing.** It reported 2050 ms of "blink" in a
   5200 ms cycle. It was the arena's own entrance animation still playing under a fixed
   screen clip while each screenshot burned about 80 ms of wall clock. Pausing only the
   animation under test measures every other animation in real time and blames the one
   you are grading. The sampler now pauses `document.getAnimations()` wholesale first.

---

## 6. The guard, and the eight defects it is proven to catch

`tests/mimic-audit.mjs`, 24 checks. Proven RED in a throwaway worktree, with each
mutation **asserted applied** (grep confirms the new text is in the file) before the
audit runs, so a no-op sed can never be reported as a proven red.

| mutation | result |
|---|---|
| the roll becomes `Math.random()` at tap time | RED, `IDEMPOTENT` (46 flips). **`SHARE` stayed green at 31.9%**, which is exactly why idempotence is graded first |
| `endlessFightCfg` drops `mimic`/`wanderer` (the documented field-drop trap) | RED, `MAPPER` plus 9 downstream arena/blink checks |
| the Mimic branch deleted from the collect handler | RED, `ORDER` |
| the branch moved BELOW `collectSpawn` (pays loot AND fights) | RED, `ORDER` |
| blink period collapsed to 300 ms | RED, 4 `BLINK` checks |
| eye crops regenerated from plate 1 (the eyes never change) | RED, both `ART` checks |
| reduce rule out-specified by `.e2`/`.e3` | RED, `REDUCED` |
| reduce collapsed to an infinite 1 ms loop | RED, 2 `REDUCED` checks |

The last art mutation is why the audit has **both** an `ART` check and a motion check.
Compositing an RGBA overlay changes pixels at its antialiased edges even when the two
images are identical, so eye crops regenerated from plate 1 still produced 4 distinct
renderings and **passed every motion check**. The sampler proves the animation runs and
is timed like a blink; the `ART` check proves there is something to see. Neither is
sufficient alone.

The audit reaches the arena by playing the game, not by calling `mimicPlateHtml()`,
because the hop that has broken before is `endlessFightCfg` dropping a field on the way
past, and a harness that calls the drawer itself can never see that.
