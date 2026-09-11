# UI implementation proof: the seven approved screens

Baseline `cb2ef0fb` (v561), the exact commit the kit was cut against. Screens
land as v562 to v568 on seven stacked branches. **Nothing is merged and nothing
is deployed**: the kit authorizes implementation and verification only.

Codex wrote the code. Every number below is mine, from a real render, because
Codex cannot bind a socket (`listen EPERM`) and therefore cannot run a browser
audit or take a screenshot. Where Codex predicted a number it could not measure,
that is called out.

## Branches

| screen | build | branch |
|---|---|---|
| 1A Fight | v562 | `ui/1a-fight` |
| 1B The Pit | v563 | `ui/1b-pit` |
| 1C Crew | v564 | `ui/1c-crew` |
| 1D Readiness | v565 | `ui/1d-readiness` |
| 1E Today | v566 | `ui/1e-today` |
| 1F Wardrobe | v567 | `ui/1f-wardrobe` |
| 1G Backpack | v568 | `ui/1g-backpack` |

Each branch is cut from the previous verified one, so `ui/1g-backpack` contains
all seven.

## Locked geometry, measured before and after

All at 375px unless stated. Captured on `cb2ef0fb` BEFORE any change, re-run
after every screen.

### Fight arena (`pit-figures-audit`, painted pixels)

    @393x852  Wanderer ink x125..369.5 · player x45..102.5 · 22.5px daylight
              210 vs 77 = 2.7x · painted 244.5x210 in a 361x330 arena
              Bumbleseal ink 72.5x60.5 · 0 gold px outside · Live Wire 154x202
    @320x568  Wanderer ink x103.5..298 · player x33..86.5 · 17px daylight

25 of 25 rows, exit 0, unchanged across all seven screens. Two fields vary and
BOTH were shown to oscillate on identical code across repeated runs: the
painted-pixel counts, and `PET-MASS` ink height (60.5 / 60.5 / 61.5 on one
tree), which samples a bobbing pet at an arbitrary animation frame.

### Today figures (1E, the approved 16px lift)

    hero char y   177.463 -> 161.463   = 16.000px
    char height   380.7   -> 380.7     art scale unchanged
    pet height    106.5   -> 106.5     art scale unchanged
    char-to-pet   261.203 -> 261.203   IDENTICAL to three decimals

The gap is the check that matters: it proves the figures were lifted TOGETHER
rather than re-spaced or rescaled to fake a tighter gap. Still 261.203 on 1F and
1G.

### Wardrobe paperdoll (1F)

    paperdoll  343 x 418   identical
    pd-art     62 x 62     identical
    slots      14          identical, first 66x78, last 80.5x69.5
    y          374.9 -> 391.3   +16.4px  (see Deviations)

All 14 slots hit-tested with `elementFromPoint` at each centre after
`scrollIntoView`: **14 of 14 reachable, zero blockers.**

### Readiness scoring (1D), which the kit says not to change

    score=72  better=96  flat=72  worse=47  spread=49  withNap=72

7 of 7 rows, exit 0, identical before and after. `readinessScore` has zero diff
lines.

### Figure contract

`figure-audit` exits 1 on clean `cb2ef0fb` before any change, with ONE row
listing **SIX** pre-existing unregistered pet call sites: `kinChips` plus five
Laboratory sites. All seven screens were compared by **site content**, not row
count, because the row count stays 1 however many sites appear and would have
hidden a seventh being added. Six identical snippets on every screen.

## Controls exercised, not simulated

Real controls were clicked and the resulting state read; handlers were never
called directly.

- **1A** Flee 50x44 at 375/390/430. ITEMS closed reads exactly `ITEMS` with no
  subtitle; potions granted, the real button clicked, tray shows both with
  counts and `1 AP to drink`.
- **1B** 13 opponent portraits, **13 distinct art sets, none shared**. The
  Bouncer Below carries real layered art and **0 Build icons**. Build entry
  retained. 0 broken images.
- **1C** star 46x46 tap target with a 48x48 image; Cheer and Gift 175x45 side by
  side; **0 actions under 44px**; star bottom 652 clear of actions top 659, so
  identity and actions genuinely do not overlap; podium, race and standings
  present.
- **1D** three tiles **all exactly 148px**; 3 of 3 carry icons; real units
  58bpm / 60ms / 7h11; a deliberately stale sleep row renders
  `09-04 · not last night`, with a negative control confirming the page never
  claims "last night" in any other form.
- **1E** News and Quests measured like-for-like (summary vs summary, not summary
  vs the details wrapper): both `x17 w341 h48`, padding `9px 13px`, 24x24 icons.
  Exactly one `Lv N` on the page. Hero fade is a `radial-gradient` with **zero**
  opaque black bars.
- **1F** fit toolbar and switcher present; 14 of 14 slots reachable.
- **1G** all **7 ingredient tiles** with zeros visible (`2,0,0,0,0,1,0`), grid
  `109px x3`; bulk-open row **gone**; three eggs seeded to 1200 / 4000 / 7500 of
  8000 render **three distinct bars** (15% / 50% / 94%, `aria-valuenow`
  1200 / 4000 / 7500).

## Test tier

`PURE` grew 168 -> 175 as each screen registered its guard. Enumerated the way
`r6-guards-audit` itself does it: the `const PURE = [...]` literal in
`release-gate.mjs` PLUS its `PURE.push`/`unshift` sites.

    1A 169/169   1B 170/170   1C 171/171   1D 172/172
    1E 173/173   1F 174/174   1G 175/175      all green, 0 red, 0 unproven

On 1F, Codex reported 1 red and 1 unproven. Both pass with exit 0 when run here,
on that tree and the previous one, with `acorn` resolving: artifacts of its run
environment, not real failures.

## Deviations

1. **1F paperdoll +16.4px.** Section 1F mandates "one compact fit toolbar above
   the paperdoll" AND hard-locks the paperdoll. A required 52px element cannot
   be inserted above something without moving it unless 52px is deleted
   elsewhere. Three rounds recovered ~40px of 56px by collapsing the wallet and
   collection pills into one shared flow. Closing the last 16.4px means deleting
   pills the kit says to preserve. Everything the lock NAMES is unchanged and
   all 14 slots are reachable. **Tom's call to overrule.**

2. **1G Laboratory entrance.** The kit says to preserve "the existing
   illustrated full-width entrance" with "the host asset and animation". No such
   entrance exists in this codebase: `js/app.js:16481` is a plain
   `<button class="btn ghost">Open Laboratory</button>` and the only lab asset is
   `assets/icons-pix/lab.png`. The real text entrance was preserved rather than
   art invented.

3. **1C "Crew since" line omitted.** No reliable friendship-created date exists,
   and the kit forbids substituting account-created, last-sync or last-seen.
   Omission is the kit's own specified fallback.

4. **1C pre-existing Crew failures.** `crew-fan-audit` fails two rows on the
   BASELINE (`PLATE` 72.3px over a 62px limit, and an `ONLINE` wording
   mismatch). Both are byte-identical after 1C: untouched, not weakened.
   `crew-layout-audit`'s GIFT row was ALSO failing on the baseline (gift bottom
   859 against an 844 screen) and now **passes**, so 1C ends better than it
   started.

## Not proven

- No native device. iOS and Android shells are untested; every measurement is
  desktop Chrome at emulated phone widths.
- `ui-audit.js` control rows added by 1F and 1G were written but not executed;
  that audit is a console-paste harness and is separately known to drift.
- Real purchase, real haptics and VoiceOver order remain person-only checks.
