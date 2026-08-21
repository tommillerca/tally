# Open board, 2026-08-21

Every unresolved thing from the day, in the order it can be acted on. One line
each. If a decision has a DEFAULT, that is what I build if nobody answers.

## A. DECISIONS ONLY TOM CAN MAKE

| # | Decision | Default if unanswered |
|---|---|---|
| A1 | Bumbleseal's accessory **rarities** (epic/rare/epic/legendary/uncommon) and **names** (Bug-Eye Shades, Courier Purse, Charmed Courier, Live Wire Stinger, Pimple Patches). Rarity sets salvage value. | keep mine |
| A2 | Does the Boneyard Wanderer **drop the Step Egg** on a win? One line to remove. | keep the drop |
| A3 | The **hype banner copy**: "Two want to eat you. One wants your coins." Ten words, one frame, left half taps to the Boneyard, right half to the Shop. | ship as written |
| A4 | The banner prints **no price** for Bumbleseal, because she has no rack listing. Once the pet shop lands, a coin chip is two lines. | add the chip when the shop lands |
| A5 | The **Kickstarter banner** register: a clean lineup (what I built) or the reference's tighter overlapping cluster. Field colour `#73547D` measured off your reference, or the deck's charcoal. | keep the lineup and `#73547D` |
| A6 | **Today hero height.** At today's 688 the next card misses the fold by 4px so nothing peeks. At 620, 64px peeks and figure ink goes UP to 102.5%. | move to 620 |
| A7 | The R3 Today mockup carries `gwFloat`, `zEnterCine`, `zOrbitSoft`, `zTw*` that exist **nowhere in the app**. Port them, or mark the mockup unbuilt. | mark unbuilt until asked |
| A8 | The drop reel rests on its **first beat** under Reduce Motion, which is an accident not a designed still. Give reduce-motion players a chosen frame? | leave as is |
| A9 | The wheel's **GOLD** wedge draws a bone chest, consistent with the Shop and gift reveals, but the label and the drawing disagree. | leave, flag only |
| A10 | The **badge wall**: 7 of 23 badges have art. Wiring it now puts 7 pixel sprites in a grid of 16 vectors. | wait for the 16 drawings |
| A11 | **Emporium PNG weight**: 456KB precached for the pair. A 74% cut exists (256-colour quantise, 121KB) but it edits Cam's art, max delta 30/255 on 0.94% of pixels. | do not edit the art |
| A12 | `gwart/v420-dbprune` (#77) excludes rate-limiter rows from `byName`, costing ~17%. It can come out once production drains the old rows. | leave until drained |

## B. NEEDS TOM'S EYES, ALREADY BUILT

- **Kickstarter banner**, wide + tall, 13 characters.
- **Tab bar Poster Stickers**, live on `ext/tabbar-poster-stickers`.
- **Today mockup**, currencies up top, Gwart's plate at `#d5c8b0`, gradient pulled back to 28%, bonehead shifted 58px left, Bumbleseal at 169px, card peeking.
- **Hype banner** on `ext/today-hype-banner`, replacing the four-banner stack.
- **Wanderer patrol**, walking, cone of light, 0.42 m/s, 90m/60deg.

## C. NOT BUILT, MY QUEUE IN ORDER

1. **Wire Bumbleseal into the shop.** In progress. Data, purchase and exclusions done; the hero banner and shelf UI are next, then the guard.
2. **Port the Today mockup into the app.** Everything in section B for Today is a mockup file, not app code. This is the biggest gap between what Tom has seen and what the app does.
3. **The herb marker.** Blocked: the two PixelLab PNGs are not on disk. `rescue/wt/cur` carries an unclaimed `herb-sprigs.png` worth checking first.
4. **The Emporium's remaining assertions.** Only the band and centring rows exist; the crop, face size, sparkle contrast and seam rows from the original brief were never re-run in the shipped screen.
5. **`rescue/wt/recov`**, a real fix nobody claimed: a published friend code can fetch an encrypted recovery bundle. Exposed set is currently ZERO because every account has a recovery id, so it is defence in depth, not an incident.

## D. TWO CHECKS ONLY A PHONE CAN ANSWER

1. **Settings > Accessibility > Motion > Reduce Motion.** If on, it explains every "the banner never moved" report. Measured: 29 to 50% of pixels move with motion allowed, exactly 0.000% under reduce.
2. **Pull down on Today and watch whether the Bonehead card moves at all.** If it does not, the nested scroller does not rubber-band in WKWebView and the overscroll wordmark is dead regardless of geometry. If it does, the one-line `bottom: calc(100% - var(--sat))` is the fix.

## E. ANSWERED TODAY, RECORDED SO THEY ARE NOT REOPENED

- Accessories are **locked to Bumbleseal**, cash shop only, never from chests or found in game. Both leaks were open and are now closed: C6 was hatchable from a 60-dust egg, and all five accessories were crate-droppable because their slots are not `C`.
- Buying her **equips her**.
- Accessories are **unbuyable until you own her**.
- **Coins only**, no dust: one currency gives one clean read on appetite, and dust income is ~150/day against coins at ~20,000/day, so any dust price is either trivial or absurd.
- The Wanderer **does not** raise the Pit ceiling.
- Tab bar direction: **Poster Stickers**.
- Gwart's plate: **`#d5c8b0`**, the A/B split on luminance.
