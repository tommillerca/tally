# A1 font-scale work order

Frozen plan SHA256: `a69aa396db963df98a548d4d42e7c075a8c0fee5b624d9e1631fc390bb0cb892`.
All paths below are relative to this checkout. Stage 1 only is implemented.

## 1. Census before implementation

The exhaustive [inventory](a1-fontscale-census.json) records every px-valued
declaration and media condition in `app.css`, the stylesheet linked by
`index.html`, with source line, selector context, property, value and group.
Its SHA256 identifies the exact pre-change stylesheet. Counts are source
occurrences, including overridden rules, duplicate properties and px fallbacks
inside functions. A shorthand containing several px lengths counts once.
Comments do not count. Media conditions count once per rule, separately from
declarations. These are static source counts, not rendered element counts.

| Controls | Ordinary px declarations | Px custom-property declarations | Px media conditions |
| --- | ---: | ---: | ---: |
| Type size | 684 | 11 | 0 |
| Spacing | 1,532 | 9 | 0 |
| Borders and hairlines | 855 | 3 | 0 |
| Fixed geometry | 1,229 | 22 | 0 |
| Effects | 356 | 2 | 0 |
| Media-query breakpoints | 0 | 0 | 10 |
| Total | 4,656 | 47 | 10 |

Spacing includes margin, padding, gaps, letter spacing, line height and vertical
alignment. Borders include radii, outlines and text strokes. Fixed geometry
includes UI box dimensions and positions as well as art, sprites, transforms,
masks and background geometry. This deliberately retains all that geometry in
px for Stage 1. Effects are reported separately rather than mislabeling shadows
and blur radii as borders. No group is a blanket conversion recommendation.

Scope: this census measures the main application stylesheet underlying the
plan's 683 and 57 figures. It does not claim a repository-wide inventory of
inline styles, injected styles, vendor CSS, standalone pages, documentation
mockups or animation assets. The token-definition scan also covers `js/*.js`
and `index.html`, and found one additional px type-token declaration:
`js/mimic.js:169`, `--tb-size: 14px`, in the injected encounter stylesheet.
That definition is included in Stage 1 and its guard, but not in the app.css
table. The other style sources are separate surfaces for later review.

The frozen plan's aggregate description cannot be reproduced as written:
683 is precisely the number of px `font-size` declarations. There are also
one px `font` shorthand, 47 px custom-property declarations (not 137), and
57 directly rem-valued `font-size` declarations. The main sheet contains 66
rem-valued declarations overall, including eight local `.pet-a11y` tokens.
This report corrects the counting labels rather than inventing matching totals.

Reproduce the current census without changing the frozen inventory:
`node scripts/fontscale-census.mjs > /tmp/fontscale-current.json`.

## 2. The seam

| Root token | Existing font-size consumers | Stage 1 value | At a 16px root | At a 32px root |
| --- | ---: | --- | ---: | ---: |
| `--fs-0` | 27 | .6875rem | 11px | 22px |
| `--fs-1` | 39 | .75rem | 12px | 24px |
| `--fs-2` | 26 | .8125rem | 13px | 26px |
| `--fs-3` | 17 | .9375rem | 15px | 30px |
| `--fs-4` | 9 | 1.0625rem | 17px | 34px |
| `--fs-5` | 12 | 1.3125rem | 21px | 42px |
| `--fs-6` | 4 | 1.75rem | 28px | 56px |
| `--fs-7` | 2 | 2.5rem | 40px | 80px |
| Total | 136 | | | |

Of 884 `font-size` declarations, 683 are direct px (77.26%), 136 use `--fs-*`
(15.38%), two use `--tb-size`, 57 use rem directly and six use other values.
None of those 683 direct px declarations flows through `--fs-*`. The handful
of tokens is a useful seam, but cannot fix most text on its own. Selector
overrides mean 136 consumers do not imply 136 newly scaling visible elements.

The smallest existing type-token seam is nine names: the eight root `--fs-*`
tokens and `--tb-size`. Convert all 12 px declarations of those names across
the main sheet and mimic injection, including the three talk-box sizes in
app.css. Talk-box values become 1rem, .8125rem, .6875rem and .875rem (mimic).
Its two font-size consumers and eight non-font declarations already share the
token. Consequently its padding, name margin, next-arrow offsets and SVG
dimensions scale too. This is existing coupling, with no independent geometry
rewrite. Its border remains 2px. Local `.pet-a11y` rem overrides stay intact.

Also change the body's 16px base to 1rem so inherited text can respond.
Do not impose a fixed root font size. All changed values preserve their
previous size at a 16px root. The table's arithmetic is static proof, not a
claim that every OS font preference changes the WKWebView root size.

## 3. Independently verifiable stages

1. **Implemented: existing type-token seam and inherited base.** Change only
   the eight root type tokens, four talk-box token definitions and body base.
   Add a Node-only guard in `tests/`, register it in `PURE` and invoke it from
   the agreed unit proof. Require rem resolution, zero px type tokens, a
   doubling response at 16px to 32px, preserved base-size values and px
   border/sprite controls. Mutation controls must reject regressions.
2. **Unimplemented: migrate direct type one surface at a time.** Start with
   ordinary labels, fields and settings. Match existing sizes exactly with
   rem or reviewed type tokens. Do not round every legacy size onto eight
   steps. Before each independently shippable surface change, verify narrow
   layouts at 320, 375 and 393 CSS px, default text and 200% text, long labels,
   wrapping, scrolling and reachable actions. Include its injected/inline
   styles and font shorthands. Keep untouched surfaces in the inventory.
3. **Unimplemented: constrained text and layout accommodation.** Review art
   plaques, combat labels, fixed-height controls and dense grids individually.
   Pair each local type migration with measured wrapping/overflow fixes and
   the same narrow-screen proofs. Change spacing only where evidence requires
   it. Preserve sprite coordinates, hairlines and breakpoint units.
4. **Unimplemented: platform validation and remaining surfaces.** Measure
   standalone PWA and target WKWebView at browser/OS settings 24, 32 and 48px,
   plus explicit root doubling. Record computed text and usability, including
   shared/injected styles and standalone pages. If OS settings do not reach
   the root, propose a separate native/text-preference mechanism based on
   evidence. Pinch zoom remains a separate decision, outside every stage here.

## 4. Proof and limits

Agreed proof, `node tests/unit.test.js`, exited 0:

```text
366 passed, 0 failed
```

The new guard, `node tests/fontscale-audit.mjs`, exited 0:

```text
PASS 20 type-token definitions resolve through rem and double at 16px to 32px; px TYPE tokens: 0
PASS body base, default sizes, token consumers and px border/sprite controls
PASS 9 regression mutations rejected; viewport zoom policy preserved
```

An additional static comparison confirmed that all app.css declarations
outside the type seam and body base, including media conditions, are unchanged.
All 4,713 frozen census records match the pre-change stylesheet. `git diff
--check` passed. While developing the guard, an initial mutation targeted an
unrelated earlier border; the control was corrected to test the specific
talk-box and sprite rules and their overrides before the final passing proof.

After Stage 1, app.css has 4,655 ordinary px declarations, 36 px-valued custom
property declarations and 10 px media conditions. The type group has 683
ordinary px declarations and zero px custom properties. Every other group's
counts are unchanged.

Browser, screenshots, live layout, PWA and WKWebView/OS preference checks are
**unrun**, as required by the frozen work order. Increased text may expose
wrapping or clipping in existing fixed layouts; this lane cannot establish
visual shippability. No commit, push, publish, network or original-checkout
edits are authorized or needed. `user-scalable=no` remains unchanged.

Denied/blocked actions: none. Prohibited browser/socket checks, commit, push
and publish were not attempted. The full release gate was not run because it
starts a server and browser suites; the new PURE guard ran directly and via
the agreed unit command.

Deviation: the census corrects the plan's inconsistent aggregate labels and
explicitly bounds its inventory to the main stylesheet. There is no redesign
of the requested Stage 1. The remaining 682 px font-size declarations and one
px font shorthand in app.css are intentionally deferred.

Files changed:

- `app.css`: root type tokens, talk-box tokens and inherited body base.
- `js/mimic.js`: injected talk-box type-token override.
- `tests/fontscale-audit.mjs`: rem resolution, root doubling and mutation guard.
- `tests/lib/css-declarations.mjs`: static CSS declaration reader.
- `tests/release-gate.mjs`: PURE registration.
- `tests/unit.test.js`: includes the new guard in the agreed proof.
- `scripts/fontscale-census.mjs`: read-only, repeatable census generator.
- `docs/a1-fontscale-census.json`: complete pre-change app.css px inventory.
- `docs/a1-fontscale.md`: census, seam, staged plan and advisory proof report.
