# The dust loop

**One loop: gear in, dust out, looks back.**

The sentence a player should be able to say back after using it once:

> **"The stuff I don't wear pays for how I look."**

Nothing in the game says that today. Not on the bench where the dust is made,
not on the panel where it is spent, not in the two reveal cards that mention
dust by name, and not in Gwart's Guide entry the "What is this?" link actually
opens. The loop is not missing and it is not broken. It has never been stated.

This is a plan, not a build. Nothing below is implemented. Every number is
measured, and the method is given so it can be re-run.

---

## Part 1. What I measured

Everything in Part 1 was read out of `origin/main` at `23de102b`, or rendered
at 390x844 dpr2 and looked at. The six shots cited by name are in
`docs/shots/dust-loop/`, so every claim below can be checked against the picture
it came from. The mockups in Part 3 are in `docs/mockups/` and were rendered by
`docs/mockups/shoot-dust-loop.mjs`.

Nothing in this PR is app code and nothing under `assets/` is touched.

### 1.1 Tom used the wrong name, and that is the finding

The brief opens: *"the transmute area still isn't clear how to use"*.

There is no transmute area for looks. `transmute` is in the Kitchen
(`js/cooking.js`, `TRANSMUTE`, `doTransmute`) and it turns six common
ingredients into one Ectoplasm. The thing that changes how gear looks is
`transmog` (`js/loot.js`, `applyTransmog`, `transmogPrice`).

The person who designed the game reached for the wrong word. That is not
carelessness, it is a measurement. Here is why it happened:

| System | The noun a player can say |
|---|---|
| Cooking | the Kitchen |
| Fighting | the Pit |
| Pets | the Stable |
| Map | the Boneyard |
| Melting | the Salvage Bench |
| Weekly cosmetics | the Rack |
| **Changing how gear looks** | **none** |

Measured in the running app, the panel's heading renders as
`"Hat · change how it looks"` (shot `07-mid-wardrobe-mog.png`, `.mog-h`
textContent). It is a verb phrase, per slot. There is no proper noun anywhere in
the app for the surface, so there is no phrase to reach for, so the nearest
named thing gets borrowed.

The word "transmog" is already almost gone from the player's screen. Searching
`js/app.js` for player-visible strings finds exactly two, and both are wrong for
other reasons (1.5). The Guide entry is titled "Changing how gear looks", not
"Transmog". So the collision is not really Transmute-versus-Transmog. It is
**Transmute versus nothing**.

### 1.2 The loop already closes in one place, 76 pixels apart

Measured on the Wardrobe tab at 390x844 with a seeded mid-game account
(level 16, 20 gear pieces, 10 hat looks, 120 dust). Offsets are from the top of
the scroller, viewport height 844:

| Element | top | height |
|---|---|---|
| paper doll | 256 | 418 |
| "Hat · pick your fit" grid | 838 | |
| gear inspect panel | 1237 | 160 |
| **`Melt · +N dust` button** | **1335** | 50 |
| **the look panel (`.mog-panel`)** | **1411** | 629 |
| the price bar (`.mog-bar`) | 1909 | 75 |
| page height | 2159 | |

The melt control and the look picker are **76px apart on the same screen**, and
they were already adjacent before anyone planned it that way. Neither one
mentions the other. The Melt button says `Melt · +8 dust` and stops. The look
tiles say `6`, `12`, `25`, `60` with a dust crystal and stop.

That is the whole problem in one measurement. Two halves of an exchange, one
thumb-width apart, and no exchange rate on screen.

### 1.3 The taps

From "I have gear I do not want" to "I am wearing a look I paid for":

**Path A, the one the Backpack tab implies (10 taps, 2 tab switches):**
Bonehead → Backpack tab → scroll 864px → tick a row → `Melt N pieces` (arms) →
`Tap again to melt N` (confirms) → Wardrobe tab → tap a doll slot → scroll
1411px → tap a look tile → `Wear it` (arms) → `Spend N dust?` (confirms).

**Path B, the one that already exists in the Wardrobe (8 taps, no tab switch):**
Bonehead → tap a doll slot → tap a piece to inspect → `Melt · +N dust` (arms) →
`Tap again to melt` (confirms) → tap a look tile → `Wear it` → `Spend N dust?`.

Path B is shorter, needs no tab switch, and nothing in the app points at it.

**From a cold open to understanding that melting funds looks: 3 taps, and the
link lands on the wrong entry.** The only place in the game that states the
connection is Gwart's Guide, entry 6 of 10, `id: 'dust'`:

> "Melting gear you are never going to wear is where most of it comes from. A
> piece he has outgrown is not waste, it is dust."
> "It pays for transmog, which is wearing one thing and showing another, and it
> pays to breed two pets into one."

The look panel carries `guideLinkHtml('transmog')`, which opens entry 7,
`id: 'transmog'`. That entry is good and it never mentions melting:

> "Wearing one thing and showing another. The numbers are whatever the piece
> really is; only the picture changes."
> "It costs dust, and only the first time. That look in that slot is free
> forever after, so try things."

`openGwartGuide(topic)` opens exactly one `<details>` and scrolls it to the top
of the sheet, so the `dust` entry is above the fold, shut, and scrolled past.
**The one affordance the app has for explaining the loop deliberately skips the
one paragraph that explains it.**

### 1.4 What a new player sees: both ends, both empty, one of them lying

Booted with no seed at all (shots `01`, `03`). Probes:

- Wardrobe header pills: `340` coins, **`0` dust**, `14 found`, `14/368 looks`.
- Gear cells in the slot grid: **0**. Look tiles in the panel: **2** (its own
  look, and Hide). So the look panel renders, correctly, with nothing to buy.
- Backpack tab: the `Salvage Bench · nothing wasted` heading is present, the
  wallet reads `0`, and the fold does not exist. Rows: **0**.

And under that heading, verbatim from the shipped copy:

> "Melt gear you don't wear straight from the list below. Manage, breed, and
> destroy pets in the **Stable**. Bad drops and dupe eggs still pay off."

There is no list below. The only control the sentence resolves to is
`Open the Stable (1 pet)`. **On a fresh account the only reachable dust source
under the Salvage Bench heading is destroying the one pet you own.**

That is worth stating plainly given Tom's note about pet salvage. The game's
first and loudest instruction about dust points a brand new player at their pet.

### 1.5 The game says three different things about what dust is for

Three shipped strings, three surfaces, and one is backwards:

| Where | String | Verdict |
|---|---|---|
| `js/app.js:2806` crate reveal | "Spend it on transmog and eggs" | **stale.** The 60-dust Mystery Egg went with the Bone Dust shop on 2026-08-25. And "transmog" is a word the player never sees anywhere else. |
| `js/app.js:20217` mini-win reveal | "Spend it at the Salvage Bench" | **backwards.** The Salvage Bench is where dust is *made*. Nothing there takes dust. |
| `js/app.js:8602` failed rack buy | "Melt gear at the Salvage Bench." | correct |

### 1.6 The look panel itself is fine. Do not redesign it.

Shot `07-mid-wardrobe-mog.png`, looked at. It carries a Now/After figure pair
above the tiles, a price on every unpaid tile in the wallet's own dust art, a
three-line commit bar (`You keep` / `You get` / `You pay` with the balance), and
a closing line: "Nothing is destroyed. The piece stays on, keeps its stats and
stays in your Backpack."

That is a well-made screen. It was reworked on 2026-08-23 against a new-player
grill and graduated on 2026-08-24. `tests/transmog-clarity-audit.mjs` guards it.

**It is missing exactly two things: a name, and where the dust came from.**

One smaller observation from the same shot: the panel's closing paragraph is
followed, outside the panel, by the sentence *"Melting a piece keeps its look
forever."* in 11.5px grey. That is the single sentence that makes the whole loop
safe to use, and it is a footnote under a footnote.

**And one real defect, measured in the running app, not guessed.** Selecting a
look that costs dust and reading the commit bar's three `<b>` elements
(shot `14-mid-mog-priced.png`):

| line | text | clientWidth | scrollWidth | clipped |
|---|---|---|---|---|
| You keep | `+2 HYP · +1 POW` | 102 | 102 | no |
| You get | `Rising Sun Band` | 97 | 97 | no |
| **You pay** | **`12 Bone Dust`** | **66** | **79** | **yes** |

It renders as `12 Bone ...`. When the look is free the line reads "nothing" and
fits, so **the price line truncates precisely and only when there is a price**,
because that is the case where the balance chip (`you have 120`) shares the row.
One line, one fix, and it is on the panel's most important row.

### 1.7 The Salvage Bench is also fine

Shot `09-mid-backpack-bench.png`. Measured lede on the seeded account:

> "**19 spare pieces** you are not wearing, worth **857** in Bone Dust."

Bench at y=864 on a 2,729px page, 20 rows, tools read
`Select all 19 unworn` / `Only the 5 Uncommon` / `Clear`. This is a good screen
too. It says exactly what the pile is **worth** and never once what it is
**for**.

### 1.8 On the Rack, dust is the second currency

Shot `12-mid-shop-rack.png`, same seeded account (4,200 coins, 120 dust).
Measured off the render:

- Banner: `HEATWAVE · RACK 4 OF 4`, right side `New rack in 6d`.
- The wallet row reads **`4,200 buys 9 of 9`** for coins and
  **`120 buys 5 of 9 ›`** for dust.
- Every tile carries both prices with the word `OR` between them:
  `3,000` coins **or** `200` dust, `2,400` **or** `175`, `2,000` **or** `160`.
  Nine dust prices on the screen, four of them out of reach at 120 dust.
- Reroll: `Another nine from Heatwave · 7 left this week · FREE`.

Two things follow. The implied rate is **15 coins to 1 dust** at the top rung.
And because every Rack item is buyable with either currency, **the game's only
renewing dust sink can be paid for entirely in the abundant currency.** A player
who never melts anything still clears the Rack on coins.

There is also a small honesty problem sitting on the banner: `RACK 4 OF 4`
inside a named theme promises a rotation the data does not have. `RACK_THEME` is
a single constant and `RACK_POOLS` is a single array of 24 ids.

---

## Part 2. The economy, now that dust is meant to be paywalled

Tom, this session: *"these things should all factor into the economy and how
easy it is for players to get the dust that will a mainly paywalled resource"*.

That inverts the problem. Below is every faucet and every sink, measured.

### 2.1 Every dust sink that exists

There are exactly four calls to `boneDustAdd` with a negative argument in the
whole tree:

| Sink | File | Price |
|---|---|---|
| Buy a Rack piece | `js/loot.js:288` | 35 to 200, or 110 for the aura |
| Breed two pets | `js/loot.js:829` | `30 + 30 * newLineage`: 60, 90, 120, 150, 180, ... |
| Change a look | `js/loot.js:1658` | 6 / 12 / 25 / 60 / 60 by the look's rarity |
| Wear a saved fit | `js/loot.js:1730` | the sum of the above, from the same paid-once pool |

Three of the four are cosmetic. The fourth is breeding, and breeding is the
problem in 2.6.

### 2.2 Every dust faucet, with its gate

| Faucet | Pays | Gate | Where |
|---|---|---|---|
| Melt gear | uncommon **9.0**, rare **19.5**, legendary **92.4**; all-catalogue avg **40.3** | one per spare piece owned, so the real rate is the crate rate | `gearDustValue`, 388 items |
| Salvage a pet | base **10 / 15 / 30 / 60 / 120** by rarity, **+15** shiny, **+8** per lineage | one per spare pet, so the real rate is the egg rate | `salvagePet`, `js/loot.js:573` |
| Daily quest, protein target | 15 | 1/day | `js/quests.js:119` |
| Daily quest, 11k steps | 20 | 1/day | `js/quests.js:163` |
| Weekly quest, 2 bosses | 60 | 1/week | `js/quests.js:180` |
| Monthly quest, 8 bosses | 150 | 1/month | `js/quests.js:218` |
| Level milestone | 75 at every 10th level, 150 at every 25th | levelling, so it decays | `js/game.js:303` |
| A logged yoga/pilates/stretch session | 20 | 1/day, per discipline | `DISCIPLINE_REWARD.flex`, `js/game.js:601` |
| Clear a den | 6 or 12 | per den | `js/poi.js:503` |
| Glutton kill, **when you already own every piece of gear it could drop** | 40 | per kill, endgame only | `js/poi.js:684` |
| Step-race podium | variable | per race | `js/social.js:739` |

Two things stand out.

**The gear faucet is the whole economy and it is not gated by anything.** Every
other row is a small fixed number on a clock. Melting is uncapped and pays 40.3
on average per piece, and gear keeps arriving from crates forever.

**`js/poi.js:684` is an unbounded endgame faucet by design.** A player who owns
all 388 gear pieces is paid 40 dust every Glutton kill as a consolation. Under a
paywall this is the exact player you are trying to sell to, being handed the
currency for free at the highest rate in the game.

### 2.3 The pet faucet, and the printer check

Tom flagged this. Measured.

The pet roster is **7 species**: 3 legendary, 1 epic, 1 uncommon, 2 common. So
salvage payouts are:

| Rarity | plain, L0 | shiny, L0 | shiny, L3 | shiny, L5 |
|---|---|---|---|---|
| common | 10 | 25 | 49 | 65 |
| uncommon | 15 | 30 | 54 | 70 |
| epic | 60 | 75 | 99 | 115 |
| legendary | 120 | 135 | 159 | 175 |

**Is there a breed-then-salvage printer? No.** Breed cost is quadratic in
lineage, salvage payout is linear. Best case for the player, a shiny legendary
keeper:

| Lineage L | `breedCost(L)` | cumulative spend 0 to L | salvage payout at L | **net vs just salvaging at L0** | pets destroyed |
|---|---|---|---|---|---|
| 1 | 60 | 60 | 143 | **-52** | 1 |
| 2 | 90 | 150 | 151 | **-134** | 2 |
| 3 | 120 | 270 | 159 | **-246** | 3 |
| 4 | 150 | 420 | 167 | **-388** | 4 |
| 5 | 180 | 600 | 175 | **-560** | 5 |
| 8 | 270 | 1320 | 199 | **-1256** | 8 |

Cumulative cost is `15L² + 45L`; payout is `base + 15 + 8L`. The gap widens
without limit, at every rarity, shiny or not, at every depth. The single-step
case is already -52 before you count the fed pet, which was itself worth 10 to
135 dust unsalvaged. **No cycle at any depth returns what it cost.**

The design already carries three independent guards and they should be credited
rather than re-derived: `removeWorstInstance` always sacrifices your *lowest*
lineage non-shiny copy, so you can only farm dupes; lineage is earned per
feeding and never transferred, so feeding in a good pet is waste; and the cost
curve is quadratic.

**What is a real faucet is eggs.** `EGG_GOAL_STEPS` is 8,000 and eggs incubate
in parallel (each snapshots `stepsAtStart` at grant time). Eggs come from level
milestones, big step days, monthly quests and dens, and cost nothing. So a pet
is a free object that salvages for 10 dust (the realistic dupe common) up to 135
(a shiny legendary dupe). The realistic rate is a trickle. The tail is not.

### 2.4 The sink has a hard lifetime ceiling, and it is small

This is the number that matters most under a paywall.

**Transmog is pay-once per (slot, look) and there are 194 such pairs.**

| Gear slot | looks | dust to buy every one |
|---|---|---|
| Hat | 57 | 1,319 |
| Off-hand | 38 | 933 |
| Chest | 24 | 735 |
| Weapon | 24 | 428 |
| Kicks | 19 | 424 |
| Pants | 13 | 379 |
| Socks | 12 | 223 |
| Undies | 7 | 162 |
| **total** | **194** | **4,603** |

**The Rack's pool never grows.** `RACK_POOLS` is one theme, eight rungs, three
items per rung, plus one aura. Twenty-five items, forever. A weekly reroll
changes *which* of a rung's three appears, never what the twenty-five are, and
`buyRackItem` writes `rackbuy:<artId>` through `addIfAbsent` so a piece can be
bought exactly once. Lifetime Rack dust sink: `sum(RACK_DUST) * 3 + 110` =
**2,990**.

| | dust |
|---|---|
| every transmog pair that exists | 4,603 |
| every Rack item that exists | 2,990 |
| **total cosmetic dust sink, ever** | **7,593** |
| the gear catalogue melted in full | **15,619** |

**The gear you can own is worth 2.06x every cosmetic thing dust will ever buy.**
Melting **189 of 388** pieces funds the entire cosmetic economy permanently.

And the Rack half of that 7,593 is optional. Measured on the shipped screen
(1.8), every Rack piece is priced in coins *or* dust at about 15 coins to the
dust, and the seeded wallet reads `4,200 buys 9 of 9` in coins against
`120 buys 5 of 9` in dust. **A coin-rich player never spends a grain of dust on
the Rack.** So the realistic lifetime dust sink is closer to the 4,603 transmog
figure alone, and 4,603 is 114 average gear melts.

### 2.5 The number that decides whether dust can be sold

The lifetime ceiling above is the theoretical case. Here is the realistic one.

A player does not buy 194 looks. They settle on one look per slot. Summing the
median-priced look in each of the 8 gear slots:

| outfit | dust |
|---|---|
| cheapest possible head to toe | 48 |
| **median priced head to toe** | **103** |
| dearest possible head to toe | 480 |

Against melt yields:

- **One legendary gear melt (92.4 dust) very nearly pays for a complete
  head-to-toe restyle (103).**
- The seeded mid-game account measured in 1.7 holds **857 dust of spare gear**,
  which is **8.3 complete restyles**, sitting unmelted in the Backpack.
- 2.6 average melts fund a full restyle. Or 1.1 legendary melts.

**A pay-once sink whose flagship purchase costs one spare hat cannot support a
purchasable currency.** This is not a tuning problem that a price rise fixes: at
any price, a sink you finish is a sink that stops needing purchases.

Under a paywall, saturation is partly the point. What a paying player keeps
buying after they own every look they want has to be a thing that renews.

**The one thing in the game already shaped that way is the Rack**: weekly,
themed, dust-priced, one purchase per item, with a countdown. Its shape is
right. Its stock is not: it sells **25 of the game's 368 cosmetics, 6.8%**.
Three hundred and forty three pieces of Cam's art have never had a dust price
on them.

So the honest answer to "does this need a new cosmetic sink" is **no**. It needs
the existing renewing sink to be stocked, and how much of the art goes behind a
price is a content decision only Tom can make. See Q4.

One related honesty problem while the Rack is open: the banner renders
`HEATWAVE · RACK 4 OF 4` with `New rack in Nd`, which promises a theme rotation
the data does not have. `RACK_THEME` is a single constant.

### 2.6 The contradiction that has to be resolved before anything is sold

Two decisions Tom has made now conflict:

1. **Cosmetic-only IAP, 2026-08-07.** Money never buys power.
2. **Dust is mainly a paywalled resource**, this session.

Dust buys transmog (cosmetic), the Rack (cosmetic), and **breeding**. Breeding
grants lineage, and lineage is `PET_LINEAGE_STEP = 0.05`, a permanent +5% per
tier to a pet's battle stats (`js/pets.js:163`).

**The moment dust is purchasable, breeding is pay-to-win.**

This is not news to the codebase. `js/loot.js:600` already says so, written when
the Bone Dust shop closed:

> "ONE EXCEPTION SURVIVES AND IT IS WRITTEN DOWN, NOT GLOSSED OVER: breedPets
> below charges dust and the offspring carries a permanent stat bump. [...] "dust
> is cosmetic-only" is not literally true while it stands, and it is the first
> thing to look at if dust is ever sold for money."

It is now that time. Options are in Q1.

### 2.7 One prior figure I could not verify

`docs/DECISIONS-OPEN.md:49` states *"dust income is ~150/day against coins at
~20,000/day"*. No method is recorded with it and I could not reproduce it. It
should not be leaned on for a price decision. Every number in Part 2 is derived
from the constants in the tree and can be re-run.

---

## Part 3. The plan

Cheapest and most certain first. Every step ships on its own and is verifiable
on its own. Steps 1 to 3 do not depend on any decision from Tom. Steps 4 to 6 do.

### Step 1. Two shipped defects on the loop's own surfaces.

**1a. The game says one thing about dust.** Fix the three strings in 1.5 so they
agree. `js/app.js:20217` currently tells players to spend dust at the place that
makes it; `js/app.js:2806` still sells eggs that were removed on 2026-08-25.

**1b. The price stops truncating.** `You pay: 12 Bone ...` (1.6), measured at 66
against 79 in the running app. It is the one row on the panel that must be
readable and it is the only one that clips.

- **Cost:** under two hours for both. Three string edits and one layout fix.
- **Proves:** for 1a, a lint that asserts no player-visible dust string names a
  sink that is not in the 2.1 list. Red today on two strings. For 1b, a row in
  `transmog-clarity-audit` that selects a **priced** look and asserts
  `scrollWidth <= clientWidth` on every line of `.mog-lines`. Red today.
- **Risk:** none.

### Step 2. The bench stops promising a list that is not there.

The new-player empty state (1.4) says "melt gear straight from the list below"
over no list, and leaves `Open the Stable` as the only resolvable control.

Mockup: `docs/mockups/mock-b-bench-new.png`, rendered at 390x844 dpr2 and
inspected. Two short lines replace the paragraph, they say what will fill the
bench and when, and the Stable button stays where it is instead of standing in
as the answer.

- **Cost:** an hour. Copy plus one conditional.
- **Proves:** extend `tests/melt-ui-audit.mjs` with a row that boots an **empty**
  account and asserts every noun in the bench's copy resolves to something on
  screen. Prove red by restoring today's string.
- **Risk:** none.

### Step 3. The surface gets a name.

Recommend **the Mirror**. One word, lives in a wardrobe, says exactly what the
thing does, sits in Gwart's register, and pairs with the Salvage Bench in a
sentence a player can actually say: *"melt it at the Bench, spend it at the
Mirror."*

The heading becomes `The Mirror · Hat` instead of `Hat · change how it looks`.
The Guide entry is retitled from "Changing how gear looks" to "The Mirror". The
last two "transmog" strings go with Step 1.

**The Kitchen's Transmute is not renamed.** Renaming it would touch cooking's
vocabulary, its own tested Guide entry, the `transmuteAt` kv key and copy that
was written against confused testers on 2026-08-22. The collision resolves
either way, and naming the unnamed thing is the smaller change. See Q3 for the
one adjacency to be aware of.

Mockup: `docs/mockups/mock-a-mirror.png`. The panel is otherwise untouched.

- **Cost:** an hour, plus the Guide copy line in `docs/GWARTS-GUIDE-COPY.md`.
- **Proves:** the existing `transmog-clarity-audit` STRUCTURE row already reads
  `.mog-h`; pin the name there.
- **Risk:** low. It is a heading and a Guide title.

### Step 4. The exchange rate appears at both ends, and each end names the other.

This is the actual fix for "it isn't clear how to use". Two lines, one at each
end of a loop whose halves are 76px apart:

- **At the Mirror**, under the commit bar: how much dust the player's spare gear
  is worth, and a route to the bench. `mock-a-mirror.png` shows the line:
  *"Dust comes from melting gear. You have 19 spare pieces worth 857 at the
  Salvage Bench."*
- **At the bench**, under the existing lede: what the pile buys, in restyles
  rather than in dust. `mock-c-bench-rate.png`: *"That is about eight
  head-to-toe restyles at the Mirror. Melting a piece keeps its look forever."*

That second half also promotes the sentence buried in 11.5px grey in 1.6 to the
place it belongs.

And the Guide link on the panel should open an entry that carries both halves,
rather than entry 7, which skips the melting.

**This step is gated on Q2.** The copy is not the same if dust is meant to be
scarce. Telling a player their spare gear is worth eight restyles is the right
sentence today and the wrong sentence the day dust is sold. Writing the abundant
version and reversing it later is the worst of the three outcomes.

- **Cost:** half a day.
- **Proves:** a row that reads the number off both surfaces at once and asserts
  they are computed from the same source, so they cannot drift.
- **Risk:** low mechanically, high in sequencing. Do not ship before Q2.

### Step 5. The give-away rate itself. Gated on Q2.

No numbers proposed here. Whatever Tom decides, the levers are known and small:
`DUST_VALUE.gear`, `TRANSMOG_COST`, `RACK_DUST`, the `js/poi.js:684`
consolation, and the per-quest amounts in 2.2. Each is one constant.

### Step 6. Stock the Rack. Gated on Q4, and it is content, not code.

The mechanism is built and correct. Adding a theme is adding a `RACK_POOLS`
array and 24 art ids. The question is how much of the 368-piece catalogue goes
behind a dust price, which is Tom's call about his brother's art, not a
scheduling decision.

---

## Part 4. What I would not do, and why

- **Not redesign the look panel.** It was measured, reworked and graded on
  2026-08-23. Shot 07 shows a clear screen. Redesigning it would burn a week to
  arrive back where it is.
- **Not move melting into the Wardrobe, or the Wardrobe into the Backpack.** Two
  entrances is correct: one where the gear is, one where the pile is. The
  Wardrobe path already closes the loop in 8 taps and needs pointing at, not
  rebuilding.
- **Not rename the Kitchen's Transmute.** Different system, tested copy, and the
  collision resolves without it.
- **Not touch the `data-tab` values.** `data-tab="crates"` under a chip labelled
  "Backpack" and `data-tab="talents"` under "Build" are internal identifiers the
  player never sees. Renaming them would touch every selector in every audit
  that keys off them for zero player benefit. The real problem the drift points
  at is that nothing in the tab row hints that melting lives under Backpack, and
  Step 4 answers that with a sentence rather than a rename.
- **Not invent a new cosmetic sink.** The renewing sink exists and is 6.8%
  stocked.
- **Not add an animation, a loop diagram, an onboarding card or a "did you
  know".** The fix is two sentences on two surfaces that already exist.
- **Not change a single dust yield or price in this plan.** Every one of them is
  a decision, not a side effect of a copy pass.
- **Not touch `assets/`.** Verified below.

One unrelated observation, mentioned rather than fixed: the 27px row thumbnails
in the bench render Cam's full-canvas PNGs, most of which is transparent padding,
so a slipper reads as a speck (shots 09 and 10, and it is faithfully reproduced
in `mock-c-bench-rate.png` because the mockup links the shipped CSS). There is
already an `art/crop-wardrobe-thumbs` worktree. Not this plan's job.

---

## Part 5. Open questions only Tom can answer

### Q1. Breeding costs dust, and lineage is power. Pick one. (highest priority)

The moment dust is sold, breeding sells power (2.6). Three shapes:

**(a) Breeding stops costing dust and the step gate carries it alone.**
`BREED_COOLDOWN_STEPS` is already 6,000 and already the real constraint.
- *For:* it is a deletion. `breedCost` goes, the `boneDustAdd(-cost)` goes, the
  `reason: 'dust'` branch goes. "Dust is cosmetic-only" becomes literally true
  with no asterisk. Smallest diff of the three.
- *Against:* free lineage is a faster power ramp than paid lineage. Mitigation is
  one constant (raise the cooldown), and `tests/fight-sim.mjs` can measure
  whether it needs raising rather than anyone guessing.
- *Also against:* it removes a 60-to-180 dust sink, but 2.4 shows that sink was
  never load-bearing.

**(b) Lineage becomes cosmetic. The glow stays, the +5% per tier goes.**
- *For:* keeps the sink, and makes every dust spend cosmetic by definition.
- *Against:* guts a progression system players may already be invested in,
  touches `petBattleStats` and every Pit balance number downstream of it, and
  needs a full fight-sim re-measure. Much the biggest change of the three.

**(c) Split dust into earned dust and bought dust with different spend rights.**
- *For:* strictly correct. Bought dust simply cannot reach `breedPets`.
- *Against:* two currencies that look identical and behave differently is the
  most confusing option on the screen, and `docs/IAP-SCOPING.md` already warns
  that "two currencies reads as monetised in a way one does not". It also doubles
  every balance display in the app.

**Recommendation: (a).** It is the only one that makes the rule true by deleting
code rather than by adding a concept, and its single risk is measurable with a
tool that already exists.

### Q2. How generous is the free faucet meant to be?

Concretely, with 2.5's numbers in front of you: today one spare legendary hat
(92 dust) funds a complete head-to-toe restyle (103). A mid-game Backpack holds
eight restyles' worth of unmelted gear. Melting under half the gear catalogue
funds every cosmetic purchase in the game, permanently.

- **Leave it.** Dust stays a generous free loop, and it is never sold. Coins
  become the paid currency instead, which is what `docs/IAP-SCOPING.md` was
  already scoped for. *For:* nothing to reprice, and the loop stays a gift.
  *Against:* contradicts what Tom said this session.
- **Tighten it.** Cut melt yields and/or raise look prices so the free loop is a
  trickle and the shop is the tap. *For:* makes dust worth buying. *Against:*
  the "nothing wasted" promise on the bench becomes untrue, and it makes the
  loop meaner exactly as Step 4 makes it visible.
- **Leave the rate, deepen the sink.** Keep melting generous and put enough
  cosmetics behind a dust price that the free rate cannot cover them. *For:*
  nothing existing changes value, and it is the only option that adds rather than
  subtracts. *Against:* it is a content bill, and it is Q4.

**Recommendation: the third, with the second held in reserve.** Taking value away
from a currency players already hold is the change that generates complaints, and
Apple 3.1.1 means it cannot be undone once packs ship.

**Step 4 is blocked on this.** Not Steps 1 to 3.

### Q3. Is "the Mirror" the right name?

One adjacency to know about before deciding: the Pit's hard difficulty is
already called **"Mean Mirror"** (`js/app.js:18682`). Different noun class, a
different screen, and I do not think it collides in use, but this project has
been bitten by exactly this before.

- **the Mirror.** *For:* one word, obvious, belongs in a wardrobe, pairs with the
  Bench. *Against:* Mean Mirror.
- **the Glass.** *For:* no collision at all, and it is in Gwart's register.
  *Against:* less immediately obvious to a new player.
- **Leave it nameless.** *Against:* this is what produced the brief's first
  sentence.

**Recommendation: the Mirror.** The Pit's use is an opponent's name, not a place.

### Q4. How much of Cam's art goes behind a dust price?

The Rack sells 25 of 368 cosmetics. That is the size of the renewing sink, and
it is the only lever that makes a paid dust currency coherent (2.5).

- **Leave it at one theme.** *For:* nothing to do. *Against:* the sink is
  finished in a few weeks and the banner's "RACK 4 OF 4" is already a promise the
  data does not keep.
- **Add themes from the existing catalogue.** *For:* the art exists, no new work
  from Cam, and each theme is one array. *Against:* pieces currently free from
  crates would move behind a price, and which ones is a taste call.
- **Reserve new art for the Rack.** *For:* cleanest separation. *Against:* it
  makes the sink's depth a function of Cam's throughput.

**No recommendation.** This is a decision about someone else's work and about
what the game is willing to charge for.

A sub-question that comes with it, and it is cheap either way: **should every
Rack piece keep both a coin price and a dust price?** Today they do, at about 15
coins to the dust (1.8), which means the only renewing dust sink can be cleared
without ever touching dust. Making some rungs dust-only would give dust a
purchase it is the sole currency for. Making them all dust-only would strand the
coin economy, which S0 just spent three to five days cleaning up. This is a
smaller decision than the stock question and it only matters once Q2 is answered.

### Q5. Did Tom mean Transmog, or did he really mean the Kitchen's Transmute?

The rest of the brief ("the melt-into-dust loop", "transmog, melting and the
Rack") makes Transmog overwhelmingly likely, and this plan is written on that
reading. But the Kitchen's Transmute has its own history of confusing testers
and its own Guide entry written because of it. If the Kitchen was actually meant,
almost none of this plan applies and it should be said now rather than after
Step 3.

---

## Appendix: how to re-run the numbers

- Melt yields, transmog costs, the saturation ceiling and the printer table were
  computed by importing `js/loot.js`, `js/gear.js` and `data/boneheadz.js`
  directly and summing. No simulation, no sampling, no estimates.
- The screenshots and geometry came from `tests/godmode.js` (`boot`, `seed`,
  `serveTree`) at 390x844 dpr2 against this tree, on a `?demo` database.
- The mockups are `docs/mockups/dust-loop.html`, rendered by
  `docs/mockups/shoot-dust-loop.mjs`. They **link the shipped `app.css`** rather
  than reproducing it, and every image is a real file under `assets/` at its real
  path, so what they show is the shipped component with the shipped tokens and
  the only invented pixels are the copy this plan proposes.
- Nothing under `assets/` was added, removed or modified.

**One typography decision worth recording.** The mockups' new type comes off the
app's own ramp (`--fs-0` 11 / `--fs-1` 12 / `--fs-2` 13 / `--fs-3` 15), never off
a size invented for the mockup. Two consequences:

- The empty bench (board B) uses a real 1.25 step, `--fs-3` for the one sentence
  a new player must read and `--fs-1` for the supporting line.
- The Mirror's funding line and the bench's rate line are **deliberately close in
  size to the copy around them**, at `--fs-2` and `--fs-1` respectively. That is
  not a missing hierarchy, it is the shipped relationship between `.melt-lede`
  (13px) and `.note` (12.5px), which every surface in the app already uses for
  "statement, then the clause that qualifies it". Both lines are subordinate
  prose under a heading and a figure that already carry the hierarchy. Setting
  them larger to satisfy a ratio would make the mockup dishonest about what the
  built version looks like, which is the whole reason it links `app.css` instead
  of reproducing it.
