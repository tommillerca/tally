---
target: Football Kit poster in the shop
total_score: 25
max_score: 36
na_heuristics: 10
p0_count: 0
p1_count: 1
timestamp: 2026-09-05T05-20-46Z
slug: js-app-js-footballshelfhtml
---
Method: dual-agent (A: design review · B: detector + harness evidence). Target: the Football Kit / Locker Room poster in Gwart's Emporium (footballShelfHtml). Rendered state judged from dpr2 captures on integ/day2 775604d8+.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | "3 of 5 yours" lives in the eyebrow; the bundle tile carries none of it |
| 2 | Match System / Real World | 4 | Locker room, cleats, team names, dry-fond copy |
| 3 | User Control and Freedom | 3 | two-tap arm resets silently after 2.6s |
| 4 | Consistency and Standards | 2 | football buy buttons grey out when unaffordable; the rack on the same screen keeps its price pill pressable by documented design |
| 5 | Error Prevention | 1 | the bundle charges 16,800 for only the missing pieces; nothing warns a partial owner |
| 6 | Recognition Rather Than Recall | 3 | 32-option select, preview only |
| 7 | Flexibility and Efficiency | 3 | no path from the closed poster straight to the bundle |
| 8 | Aesthetic and Minimalist Design | 3 | "32 teams" is said five ways on one card |
| 9 | Error Recovery | 3 | shortfall toast is exemplary; the disabled state removes the pre-tap cue |
| 10 | Help and Documentation | n/a | a shop shelf; the copy carries it |
| Total | | 25/36 | Solid, one real trap |

## Design Specificity Verdict
Authored for this game: Cam's art leads at full height, the lizard gag, the 32 fictional teams, the ownership promise stated in the eyebrow, copy, price line and disc strip. Detector (static-HTML engine, after its missing parser dependencies were installed): 2 tiny-text (11px eyebrow, kit-line and save-line: the app's own --fs-0 idiom), 3 clipped-overflow (all the deliberate corner crop of the lizard, false positives). Contrast: six text elements measured 7.2:1 to 13.1:1, all pass. Geometry at 390 and 375: price chip one line, 32 discs fit with 0px overflow, hero 150px wide full height.

## Priority Issues
- [P1] Bundle overcharges partial owners. js/loot.js buyFootballBundle spends FOOTBALL_BUNDLE_PRICE_PLACEHOLDER (16,800) and grants only the missing ids; a player who bought 3 pieces (12,600) pays 16,800 for the last 2 (worth 8,400) and the tile still prints "you save 4,200". Fix: charge min(16,800, missing x 4,200), or hide the bundle once any piece is owned and show "Buy the rest: N x 4,200". Command: /impeccable harden.
- [P2] Buy buttons 35.5px tall (measured), under the app's own 40px tap floor (DESIGN.md scar #3); the team select is 36px. Fix: min-height 40px on .drop-buy and .fb-pick select. Command: /impeccable adapt.
- [P2] Disabled grey-out contradicts the rack's documented "stays pressable and answers" rule on the same screen. Fix: the rack's hollow out-of-reach pill for .drop-buy[data-buyfb]:disabled. Command: /impeccable polish.
- [P3] KIT / FULL KIT tags inherit legendary gold from .drop-item::before; football is epic and the tag is a category, not a rarity. Fix: neutral colour. Command: /impeccable colorize.
- [P3] Completing the whole kit gets the same confetti as one helmet. Command: /impeccable delight.

## Persona Red Flags
- Non-gamer first-timer: tile name "Helmet" outweighs "All 32 colourways" beneath it; may think they buy one team's helmet.
- Collector: the most likely to buy pieces then the bundle, exactly the P1 path.
- Low-vision: 35.5px buttons; 8px discs are decorative and covered by the text, contained.

## Minor Observations
- Eyebrow at 11px is the system-wide --fs-0 idiom, not poster-specific; revisit at the system level.
- Decorative swatch next to the select lacks aria-hidden.
- The buy handler re-implements the two-tap arm inline instead of armToConfirm.
- The detector's static-HTML engine was silently returning [] before its parser deps were installed: earlier empty runs in this environment proved nothing.

## Questions
- Should the bundle exist at all once a piece is owned, or become "buy the rest"?
- Does finishing the kit deserve a bigger beat than any single buy?
- Is saying "32" five times generosity or persuasion the voice rule forbids?
