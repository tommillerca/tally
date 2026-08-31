# FINDINGS — Boneyard: one name for the Mystery Egg, and the Herb patch's missing pixel art

Base: origin/main @ c3b7bc9 (v420). Written as I went.

## Fix 1 — every place the egg is named

Re-derived with `grep -rni mystery` plus a `Step Egg` sweep. Tom's four locations are all real.
The sweep found a FIFTH name, and it changes the shape of the fix.

### The two surfaces Tom is looking at

| where | origin/main | now |
|---|---|---|
| js/app.js:650 map key row (mapLegendHtml, the `?` legend) | 'Mystery egg' + 'Rare: walk to hatch a pet' | MYSTERY_EGG.name + MYSTERY_EGG.desc -> Mystery Egg / Rare: walk to hatch a pet |
| js/app.js:14320 Boneyard intro card ("OUT THERE TODAY") | `<b>Mystery Egg</b> · rare spawn · walk to hatch a pet` | `<b>${MYSTERY_EGG.name}</b> · ${MYSTERY_EGG.desc}` -> Mystery Egg · Rare: walk to hatch a pet |

Two different surfaces: `#mapIntro`'s OUT THERE TODAY card is what you see BEFORE tapping
"Open the map" (coloured .blip-dots, 4 rows); mapLegendHtml() is the `?` map key you see AFTER
(real markers, 9 rows). The intro card is destroyed when the map starts, so a player only ever
sees one at a time and the drift was invisible in any single screenshot.

### Third mention, folded into the same constant (no text change)

js/app.js:9342 giftRewardLabel: 'a Mystery Egg' -> `a ${MYSTERY_EGG.name}`.

### Not touched, and why

- js/app.js:518 `// Mystery Egg spawn` — a comment; still correct.
- js/loot.js:414 DUST_SHOP 'Mystery Egg' — already canonical. A cross-module import to share one
  word is more churn than the drift it prevents.
- js/changelog.js:13,714 — shipped changelog entries, historical record, never edited.
- tests/boneyard-icon-audit.mjs:79 — UPDATED to 'Mystery Egg' or its MATCH row goes red on the fix.

### The fifth name: CRATES.egg.label is 'Step Egg'

js/loot.js:23 — `egg: { label: 'Step Egg', ... }`. A genuinely different concept on the same crate
id, and NOT a drift to fix:

- Step Egg = the backpack item you earn from walking. Named that in README.md (x2), js/game.js
  ('Big-day Step Egg'), js/pit.js, sw.js (15 hatch frames), js/poi.js:332, js/app.js:489/4346/
  10710/15577, three shipped changelog entries, assets/icons-proposal/manifest.json.
- Mystery Egg = the map's rare spawn marker, and the Bone Dust shop row.

So the reveal cards (js/app.js:3395, 15577, 15881, 17608) all say "Step Egg" while the Bone Dust
shop says "Mystery Egg" for the same grant. Real product question, out of scope for a copy fix;
renaming CRATES.egg.label ripples into the README, quest copy and shipped changelog voice.
Flagged, not changed. This is also why the fix does NOT source the name from CRATES.egg.label
(my first instinct, and it would have silently renamed the map key to "Step Egg").

### The shared constant

js/app.js, immediately above spawnIcon:

    const MYSTERY_EGG = { name: 'Mystery Egg', desc: 'Rare: walk to hatch a pet' };

## Do other spawn types have the same split-brain? YES

Three of the four intro-card rows drift from the map key, and the intro card omits five of the
nine marker types. Reported, not fixed (copy decisions, not the same one-line change).

| row | intro card (14317-14320) | map key (646-656) | drift |
|---|---|---|---|
| Bone cache | XP for your bonehead | XP for your bonehead | none |
| Coin pile | spend in the crate shop | Coins to spend in the shop | wording; "crate shop" vs "shop" |
| Buried crate | a wearable inside | A common crate of loot | wording AND a stronger promise |
| Mystery Egg | rare spawn · walk to hatch a pet | Rare: walk to hatch a pet | FIXED |
| Herb patch | absent | Two cooking ingredients | intro card omits the most numerous marker |
| Mini-boss | absent | A quick fight for coins + XP | absent |
| Boss / Roaming / Secret den | absent | 3 rows | absent |

Buried crate is the worst: "a wearable inside" is a stronger promise than "A common crate of
loot", and CRATES.daily has consumableChance 0.12, so it is not always a wearable.

## Fix 2 — the Herb patch marker

js/app.js:519 `if (type === 'herbs') return bhIcon('garden-seed', s);` is the last vector marker.

### The search (option 1)

| searched | result |
|---|---|
| assets/icons-pix/ (47 files) | no herb/food/leaf/sprout/plant/mushroom. Confirmed. |
| tally-refs/pixellab/ | one file, egg-simple-48.png. |
| gwart/pixellab-library/ (53 files + _index.tsv) | eggs, chests, coins only. grep for herb/plant/leaf/sprout/mushroom/berry/forage/basket/greens on the index: ZERO hits. |
| ~/Downloads (ASSETS, SOL ASSETS, patches, design_handoff_*, Heckle) | one hit, crop-ember-pepper-sprout.svg, a Hollow vector. |
| gwart/farm-art/ (70 PNGs, all 48x48 PixelLab, Tom's own) | the only real candidates; measured and rejected below. |

### farm-art candidates, measured (rendered 8x, inspected)

| file | colours | ink % | why not |
|---|---|---|---|
| a-small-cluster-of-glowing-gre__base.png | 19 | 12.5 | glowing green spores. Ectoplasm Spore is one of the seven ingredients and is the green glowing one. Exactly the trap the constraint names. |
| a-tuft-of-dry-grass__base.png | 22 | 37.4 | grass, not food; 1px vertical strands alias into a brown smear at 24px. |
| a-young-seedling-two-small-le__base.png | 29 | 22.0 | a seedling in soil = something you PLANTED. Same wrong metaphor as garden-seed. ~6 green pixels on a dirt mound; a brown lump at 24px. |
| a-patch-of-dark-wet-soil-fres__base.png | 29 | 42.5 | soil, no food. |
| a-scatter-of-loose-dirt-and-sm__base.png | - | - | dirt, no food. |
| a-burlap-seed-sack-open-at-th__base.png | 37 | 38.7 | seeds again, reads as a shop bag. |

### Call: OPTION 2. Leave the vector, Tom draws one.

Nothing on disk reads as "a patch of something to forage" at 24px, and every near-miss either
promises one of the seven ingredients or repeats the seed metaphor the Bone Garden left behind.
The audit's VECTOR row already goes red the day the file lands. No code change.

### Art brief for Tom (paste into PixelLab)

Filename: assets/icons-pix/herbs.png  (spawnIcon passes type 'herbs', so PIX_CUR.herbs in
js/icons-pix.js must point at it)

Canvas: 48 x 48, transparent, ~2px padding max. Must survive nearest-neighbour halve to 24 and
quarter to 16: chunky silhouette, no 1px strands, no detail below 2x2. Aim ~20-30% ink, under
~24 colours, which is where the other icons-pix markers sit.

Prompt:

  A small foraging patch of dark leafy herbs, top-down three-quarter view, a low
  clump of four or five broad rounded leaves in muted graveyard green with one
  pale bone-cream sprig, sitting on a shallow mound of dark brown soil. Chunky
  readable silhouette, heavy dark outline, no thin stems. Not a single plant, not
  a sprout, not a seed, not a mushroom. 48x48 pixel art, transparent background,
  limited palette.

Why those words: it must not look like any of the seven ingredients (Marrow, Graveroot, Bog
Mushroom, Sinew Vine, Grave Salt, Ectoplasm Spore, Ember), because the spawn does not know which
one it carries until you collect it. A generic clump of leaves says "food here" without naming
which.

### The "Two cooking ingredients" copy

CONFIRMED shipped on origin/main: js/app.js:645 `[spawn('herbs'), 'Herb patch', 'Two cooking
ingredients']`, with the comment recording the correction away from "Seeds for the Bone Garden".

It matches the payout with one nuance: js/cooking.js:41 SPAWN_FOOD.herbs = 2 and spawnIngredient
does `n = food >= 1 ? food : (rng() < food ? 1 : 0)`, so herbs always yields n=2 — but it returns
a SINGLE id with n:2, i.e. two units of ONE randomly-picked ingredient, never one of each of two.
Accurate as a count, loose as a description of variety. Not changed; flagged.

## Version stamps

origin/main sw.js at start: tally-v420 (c3b7bc9). Renumbering to v421. Three stamps per
tests/version-stamp-audit.mjs: sw.js VERSION, js/app.js APP_BUILD, js/changelog.js newest n:.

## In-flight conflict warning

Another agent is implementing the Mimic in js/app.js, js/poi.js, js/pit.js, app.css. My js/app.js
hunks are at ~514, ~650, ~9342, ~14320 and are localised; expect an additive conflict on
js/changelog.js and the version stamps for whoever merges second.


---

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

## players.app_v reads "v68" for everyone, and that is by construction (2026-08-30)

Anyone eyeballing the production players table will conclude every player runs
build 68. They do not. The profile push sends APP_SOCIAL_V, the frozen social
PROTOCOL version, not APP_BUILD: the server stores it in players.app_v and
echoes it back in friend rows, and no client code reads it back at all. The 32
NULL rows are players who have never pushed a profile since the column landed.

Not a bug and not worth a write path change mid-sprint: the field is inert,
and if compat gating ever wants a protocol version, this is exactly the value
it would want. The real running build is tagged on every analytics event
instead (the analytics init comment in the app source calls out the same
distinction). If we ever want ops-grade "who is on which build", add a second
column rather than repurposing this one; friend rows already ship app_v to
clients, so changing its meaning is a silent protocol change.

## The onboarding reroll changes the name, and only the name (2026-08-31)

Playtest TRIAGE said rerolling the starter skeleton shows no visible change.
Driven tonight: the reroll works, the name moves (Golden Molar #83 appeared on
one press), but the art cannot move because every new player starts with the
one default body and skull; there is nothing else for the die to land on. So
the button quietly promises more than the game has. Two honest options, both
Tom's call: label it as what it is (a name reroll), or leave it until starter
looks exist. No code change made.
