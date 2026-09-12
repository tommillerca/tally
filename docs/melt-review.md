# Melt review, investigation only

Reviewed 2026-09-11 in this checkout. Frozen plan SHA256 verified:
`88484acdbfd18d9b2d6c8e9f3d0c62eac708fd70ca0f6d801d979165e4c86f3a`.
All references below are checkout-relative source line numbers. No application, art, test, or version files were changed.

## Findings and evidence limits

**The bench is not gated on gear ownership in the source, and all four melt completion paths already request sound.** The bench is emitted at the end of the Backpack, after the Kitchen. Its advertised shortcuts open the Backpack rather than target the bench. Actual reachability on a normal save remains unproven: a rendering or scrolling defect could still explain the report.

The requested 375x812 browser measurements could not run. The Browser skill's required Node browser tool is not available in this session. A fallback attempt using this checkout's existing `serveTree(process.cwd())` and `boot(s.url)` helpers failed before browser launch:

```text
Error: listen EPERM: operation not permitted 127.0.0.1
code: 'EPERM', syscall: 'listen', address: '127.0.0.1'
AUDIT END audit: FAILED; INCOMPLETE; rows=0/undeclared; failed=0; unproven=0; exit=1
```

This is an environment denial, not an app failure or a passing UI check. No demo or normal save was driven. No completed tap count, target-size census, viewport confirmation measurement, or duplicate-node determination is claimed. Proposed deviation: deliver the source investigation now, with those measurements explicitly outstanding for independent review in an environment that can serve this checkout. No substitute redesign or new audit was implemented.

## 1. Routes and availability

### Gear

The common destination is `openCharacter('crates')`, which sets `pendingHubTab`, routes to `#/bonehead`, and renders the selected hub tab (`js/app.js:16399`). The bottom Bonehead route defaults to Wardrobe (`js/app.js:16414`), whose Backpack chip uses the shared tab handler (`js/app.js:16828`).

Source entry inventory:

| Entry | Handler and destination |
| --- | --- |
| Today character artwork | `#bhStage`, `js/app.js:5144`, opens Backpack |
| Today Backpack action | `#charBtn`, `js/app.js:5158`, opens Backpack |
| Today dust and crate wallet controls | `#dustBtn` and `#cratesBtn`, `js/app.js:5192` and `5194`, open Backpack |
| Bonehead > Backpack | Hub tab dispatch, `js/app.js:16828` |
| Shop > Melt gear for Bone Dust / Salvage Bench | Label `js/app.js:10934`; `#shopSalvage` handler `11076`, opens Backpack |
| Shop weekly Rack dust balance | `#rackDust`, label `10845`, handler `11198`, opens Backpack |
| Rack purchase review when both currencies are short | `#tonSalvage`, condition `10709`, handler `10724`, backs out and opens Backpack |
| Laboratory > Eggs | Shared `data-lab-nav="eggs"` dispatch, `21749`, opens Backpack, from which the bench is downstream |
| Wardrobe look-source link when its destination is crates | Generic `data-look-source` dispatch, `17413`, opens its declared hub tab |

These are entry routes to the same bench, not separate bench screens. The insufficient-dust messages at `10957` and `11094` name the Salvage Bench but are not themselves new clickable doors.

The Backpack branch starts at `18067`; its bench section is unconditionally emitted at `18181`. Only its gear list depends on valid owned gear inventory rows (`18192`, `18197`). No gear produces explicit empty copy (`18194`), not a hidden bench. The Stable button in that section is conditional on a positive pet count (`18195`). Worn pieces have separate melt buttons; unworn pieces use checkbox labels (`18236`). The list opens automatically if there are unworn pieces (`18222`), otherwise its summary needs a tap. There is no rarity gate in `disenchantGear` (`js/loot.js:991`).

The bench follows Laboratory, pending loot, crates, eggs, potions, Kitchen, and ingredients (`js/app.js:18081` to `18181`). No listed shortcut scrolls to `.bp-salvage`. Only clicking the gear-list summary initiates `scrollIntoView` (`18263`), after the player has already found it. This explains a source-level discoverability gap. It does **not** establish the headline stronger claim that a documented feature has no reachable door on a normal save.

There is also a gear melt route outside the bench: Today > Bonehead > Wardrobe > gear inspection > Melt. The selected or worn piece is resolved at `17248`; the inspection prints name, stats, talent, loss copy and payout (`17252` to `17264`). Its two-stage melt handler is at `17942`. This route must be included in any later gear redesign.

### Pets

Every Stable entry found in `js/app.js`:

| Entry | Reference |
| --- | --- |
| Today > Stable | Rendered at `4832`, bound at `5159` |
| Backpack bench > Open the Stable, when pets exist | `18195`, `18332` |
| Day One survey reward > See it in my Stable | `14229`, `14231` |
| Pet level-up > Pick my talent | `19923`, `19937`; focuses that pet and opens its talents |
| Laboratory > More pet actions > Melt spares | Links at `21536`, enclosing details at `21660`, dispatch at `21750`; enters melt mode directly |
| Laboratory > Breed | Same dispatch, enters Stable with a breed instruction, then ordinary melt toggle remains available |
| Laboratory result > view pet | `21864`; focuses result pet |

Inside Stable, ordinary arrival defaults talents closed (`20348`, `20378`). The focused pet exposes “Melt a spare for Bone Dust” only when no talent panel is open (`20524`). Toggling it reveals “Permanent changes,” Breed, and “Destroy [pet] for [dust]” (`20525` to `20529`, handler `21172`). A level-up/result arrival with an open talent panel needs Hide talents first. `labAction: 'melt'` starts with melt mode enabled and talents closed (`20348`).

The carousel groups by species and initially chooses the selected, equipped, or highest-ranked copy, not necessarily an expendable spare (`20448` to `20478`). Individual copies are selected with `data-kin` chips (`20469`). The word “spare” on the entry does not enforce a spare-only filter: the destruction handler reviews the focused instance (`21330`).

## 2. Sound

| Completed action | Existing audio hook |
| --- | --- |
| Wardrobe gear melt | `popSound(S.sounds)` at `js/app.js:17949`, after successful `disenchantGear` |
| Bench bulk gear melt | `popSound(S.sounds)` at `18382`, after the loop; also runs when zero melts succeed |
| Bench worn gear melt | `popSound(S.sounds)` at `18392`, after success |
| Stable pet melt, quick or typed review | Shared `doSalvage`, `popSound(S.sounds)` at `21345`, after success |

The engine wrappers do not play sound; the UI owns it. `js/fx.js:149` requests two sine oscillator notes: 880 Hz for 0.09 seconds at gain 0.05, and 1320 Hz starting 0.05 seconds later for 0.08 seconds at gain 0.04. The helper returns when disabled and catches synchronous errors silently. The shared AudioContext helper calls `resume()` for a suspended context without awaiting completion (`js/fx.js:133` to `147`). Sound defaults on but reads a persisted preference (`js/app.js:1588`); Settings toggles it at `15382` and `15385`.

Gear equip also calls this same `popSound` (`js/app.js:17913`). Rewarded garden harvest uses `levelSound` (`8299`), and quest claims choose `questSound` or `levelSound` (`5424`). Thus melting already uses the app's oscillator feedback convention, albeit its short pop rather than a larger reward cue.

Tom's observed silence is not disproved by a call site. What is disproved is the proposed diagnosis that these completion handlers lack an audio hook. Device audibility, persisted sound state, context state after asynchronous writes, and silent errors need measurement on the affected phone. No exact missing-hook patch is proposed because no hook is missing; adding one would duplicate the existing call. No independently established one-line, zero-risk sound fix was found.

## 3. Interface, counts and commitment

### Tap paths, source-derived only

These are control-action lower bounds, not operated measurements. Scrolling/swipes and typing characters are not counted as taps; selecting another slot, species or copy adds actions. Counts assume an eligible item and successful save.

| Path from Today | Source-derived count |
| --- | --- |
| Backpack action > select one unworn gear row > Melt > confirm | 4 taps, plus scrolling; 5 via Bonehead > Backpack |
| Backpack > worn row > arm > confirm | 3 taps if list already open; 4 if summary must open; add 1 via Bonehead > Backpack |
| Bonehead > inspected worn gear > Melt > confirm | 3 taps if the intended worn piece is initially inspected; add slot/gear selection taps otherwise |
| Stable > Melt a spare > Destroy > confirm, focused ordinary uninvested duplicate | 4 taps; another copy/species selection adds taps |
| Stable > Melt a spare > Destroy > type acknowledgement > Destroy it | 4 action-button taps plus input focus/typing, for invested/equipped/last-colour pets; selection adds taps |

Quick pet confirmation lasts 4.6 seconds (`21366` to `21375`). Bench bulk confirmation expires after 3 seconds (`18371` to `18372`); worn bench confirmation expires after 2.6 seconds (`18389`). Slow reading or navigation can require re-arming.

### 375x812 geometry

| Required measurement | Gear | Pets |
| --- | --- | --- |
| Number of controls below 44x44 effective target floor | Unmeasured | Unmeasured |
| Confirm reachable without scrolling | Unmeasured | Unmeasured, including keyboard-open typed review |
| Completed real tap count from Today | Not driven | Not driven |

Source facts cannot replace these measurements. Gear checkbox boxes are explicitly 20x20 (`app.css:6418`), but each sits in a clickable label row, so counting every checkbox as a sub-44px target would be wrong. Gear sweep links have zero padding (`6416`); their actual dimensions need measurement. Small buttons receive a minimum 44x44 pseudo-element hit area (`11695` to `11701`), which also requires overlap/hit testing. Stable action buttons specify `min-height:44px`, not a measured width (`9187`).

The bulk confirm appears above its list and is not a sticky bottom dock (`js/app.js:18223`, `app.css:6439`). Selecting a row far down the list does not scroll back to it (`js/app.js:18344`). The typed pet review puts its action in `.t1-foot` outside the scrolling body (`21712`). Neither fact proves viewport visibility. Independent review should measure initial arrival, post-selection, armed confirmation, and keyboard-open review, including `elementFromPoint` and effective label/pseudo-element targets. Zero inspected controls must not be reported as zero failures.

### Loss and reward disclosed before commitment

- **Gear bench:** section copy states that gear and stats are consumed but the look remains (`18183`). Each row names the item and its stats/talent or absence of stats (`18239` to `18243`), with a dust value. Bulk selection shows count and total dust (`18341`), but the armed label replaces that with only “Tap again to melt N” (`18371`), without selected names or total payout. The worn row's armed label is only “Tap to confirm” (`18389`), without explicitly saying it takes the worn piece off.
- **Wardrobe gear:** inspection states name, stats, talent, loss and reward (`17252` to `17264`). The worn-piece confirmation explicitly says it melts the named piece and takes it off while retaining the look (`17945`). This is stronger than the bench confirmation for the same loss.
- **Pets:** the expanded action names the pet and payout and says it does not come back (`20528`). The quick path repeats name and dust and supplies irreversible-loss copy in a 4.6-second toast (`21366` to `21368`). Last-colour, last-cell, trained, shiny, lineage, named, bonded, talented or equipped pets take the typed review (`21360`). That review discloses collection loss, steps, lineage, nickname, bond, talents, replacement equipment and exact dust (`21684` to `21704`). It accepts DESTROY or the pet's name (`21337`). A stale quote forces another review (`21343`). Disclosure exists; full visibility and comprehension on the phone are unproven.

## 4. Reported duplicate controls

**Unresolved, not a confirmed duplicate-render defect.** The supplied y=519, 1145, 1364 and 1582 observations are historical report inputs, not measurements reproduced here.

The crate template emits one OPEN button per crate kind (`js/app.js:18096` to `18103`). The potion template emits one VIEW IN KITCHEN button per potion (`18166`). These are plain text inside buttons, so a nested text span in these templates is not an evident cause of counting the same button twice. Multiple crate kinds and potion recipes legitimately reuse labels; equal y alone also permits separate columns with different x positions.

A second source-based possibility is the route transition: `holdOutgoing` moves outgoing nodes into `.screen-held` while the replacement screen renders, and removes that container on completion or after a 1200ms cap (`3543` to `3574`). A document-wide query during a same-screen refresh can therefore encounter old and new controls. This is a hypothesis about the reported query, not confirmation of its cause.

To distinguish these cases, the independent measurement must record distinct element identities, x/y/width/height, parent ancestry, `#screen` versus `.screen-held`, visibility and hit targets both during transition and after settlement. Without that DOM sample, neither “duplicated nodes” nor “nested query artifact” is established. No separate bug was fixed in this lane.

## 5. Ranked concerns and proposals for Tom

This is a provisional source-backed ranking, not a measured usability verdict. Unconfirmed geometry and duplicate reports are not promoted to established defects.

1. **Permanent loss conflicts with the governing lock.** Pet removal deletes the instance and investment maps (`js/loot.js:2024` to `2033`, `2065` to `2081`); gear removal retains the look but consumes the gear/stats (`991` to `1008`). Proposal: commission an explicitly approved recoverable melt design before expanding these mechanics.
2. **Advertised gear destinations do not take players to the bench.** All named shortcuts open the Backpack, and the bench follows multiple unrelated sections (section 1). Proposal: give the existing bench a direct, visibly named destination after runtime reachability is verified.
3. **“Melt a spare” can act on the equipped or best copy.** Focus selection is not spare-only, although a stronger confirmation protects invested pets (sections 1 and 3). Proposal: distinguish expendable-copy selection from keeper management without removing the stronger review.
4. **Gear confirmation loses useful context and sits away from later rows.** Bulk arming drops the dust total, worn bench arming omits the unequip warning, and the bulk button precedes the list (section 3). Proposal: retain selected identities, loss and payout together in the final confirmation and verify its phone visibility.
5. **Sound feedback remains a device-level unresolved complaint.** Four hooks exist, with a short shared pop and silent error handling (section 2). Proposal: reproduce on the affected phone with sound enabled and inspect context state before selecting an audio fix.
6. **Target sizing and duplicate reports need verification before a remedy.** Small CSS boxes have larger label/pseudo-element targets, and repeated labels have several plausible causes (sections 3 and 4). Proposal: finish the requested 375x812 measurements, then rank confirmed issues; any persistent duplicate-node bug belongs in a separate lane.

## Locks for any later redesign

- Nothing a player earned is ever permanently lost. Preserving only gear appearance does not prove compliance for earned stats or pets.
- Cam's art is never redrawn, recoloured, rescaled or hue-rotated on disk.
- `docs/CLAIMS.md:5395` (v573, deviations at `5400`) already records permanent pet and investment consumption as conflicting with the no-permanent-loss lock, and requires a separate recovery work order. This review does not resolve that conflict.
- This checkout's `CLAUDE.md:124` rewarded-action SOP requires a real state transition, authority before reward, no-op handling and repeat-payment protection. Its anti-regression rules (`16`, especially `65`) require measurement before diagnosis. The file does not contain a separately headed destructive-action section; the frozen order and v573 deviation supply the explicit no-loss constraint here. Confirmations were inspected, not weakened.

## Proof and handoff status

Only `docs/melt-review.md` is the intended changed file. No commit, push, publication, behaviour change, new audit, version bump or art modification was performed. All source reads and the attempted local server targeted this checkout, never an original checkout named by another plan.

Agreed proof: `node tests/unit.test.js`, exit 0. Final output:

```text
391 passed, 0 failed
```

Full stdout/stderr from this run is available locally at `/private/tmp/l-melt-unit-output.txt` (temporary evidence, not an additional checkout deliverable). Passing unit tests does not establish the blocked browser findings. The investigation is incomplete for the runtime requirements listed above; independent review must not treat them as passed.
