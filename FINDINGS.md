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
