# Stable redesign advisory report

Implemented only in this checkout. The frozen plan's SHA256 was verified as
`5bc19cd8ded084738822a38f022a77301a5f289746f882d59143e2a2a51dc48f`.
This report is advisory. Browser appearance and interaction await independent review.

## Files changed

- `js/app.js`: larger pet portrait, flat carousel with named previous/next buttons and accessible species selectors, labelled progress rows, one primary action, separate permanent actions, currency below pet content, compact Paddock preview. All existing action bindings remain.
- `app.css`: Stable-scoped portrait, typography, action hierarchy, stats, navigation, safe-area padding and reduced-motion rules using the shipped tokens.
- `tests/breed-lock-audit.mjs`: extends existing Stable/UI guards with executed action templates, focus repaint, body order, typography and resting carousel arithmetic. Healthy controls and rejected regression mutations accompany each group.
- `tests/unit.test.js`: runs the extended Stable guards from the agreed proof command.
- `docs/redesign/stable-redesign-report.md`: this report and pending browser verification.

No art assets, stat calculations, economy code, persistence or transaction functions changed.
A direct comparison with HEAD found the entire Destroy handler, Breed handler,
breeding facts and precious-pet warning byte-for-byte unchanged, including typed
confirmation, two-tap confirmation, timeouts, loss language and escalation.

## Proof

```text
$ node tests/unit.test.js
372 passed, 0 failed

$ node /tmp/stable-redesign-proof/run-pure.mjs
PURE: 101/101 passed, 0 failed

$ node tests/breed-lock-audit.mjs
BREED LOCK + STABLE UI: 7 passed, 0 failed
STABLE REDESIGN: 4 guard groups passed, 0 failed
```

All commands exited 0. `node --check js/app.js` and `git diff --check` also
passed. The existing `kennel-copy-audit.mjs` passed all 16 checks, including
real persisted duplicate salvage and the typed/two-tap confirmation paths.

The full PURE runner reads the actual `PURE` declaration and its push/unshift
entries from `tests/release-gate.mjs`, stopping before `const BROWSER`. It runs all
101 unique entries sequentially, preserving isolation and serial-suite constraints.
It does not invoke the browser/release runner or start its server.
Runner, manifest, per-suite output and results are in `/tmp/stable-redesign-proof/`.
The runner is `/tmp/stable-redesign-proof/run-pure.mjs`.

The first PURE run was 97/101. Missing `esprima` caused four failures:
`store-copy-lint.mjs`, `store-runtime-audit.mjs`, `submission-build-audit.mjs` and
`submission-preflight-audit.mjs`. Version 4.0.1 was restored into ignored
`node_modules/esprima` from the local npm cache after its SHA512 was checked
against `package-lock.json`. No network access, manifest edit or lockfile edit
was needed. The final results above supersede that initial run.

## Denied or blocked actions

No permission denials. No commit, push, publish, deployment or external checkout
edit was attempted. Browser execution is intentionally unrun under the work order.
The initial missing dependency was resolved locally.

## Deviations and limits

- **Scroll height achieved: unmeasured.** A real DOM layout is required to report
  `scrollHeight`; the work order also specifies browser unrun. Proposed proof
  deviation: the operator measures it during rendering. No estimated height is
  represented as an achieved result.
- **Shiny idle animation:** the pre-existing shared animation renderer hue-rotates
  shiny art. The Stable now uses the existing shipped shiny portrait assets for
  shiny pets to meet the no-hue-rotation constraint. Those portraits are still;
  ordinary pet animations and the shared renderer remain unchanged. No artwork
  was redrawn or recoloured by this change.
- Resting carousel arithmetic in Node is not proof of rendered clipping, decoded
  pixels, touch interaction, animation smoothness or accessible focus order.

## Operator verification, browser unrun

Every visual claim below is a design intention, not a verified render result.
Use the current 393x852 anti-reference for comparison. Also inspect 320x568,
375x667, landscape, 200% text, and simulated top/bottom safe-area insets.

1. **Hierarchy:** the creature and its name dominate. Currency and ordinary
   cooldown guidance no longer lead the screen. Bangers is reserved for pet
   identity; sheet chrome, main controls, level/count badges and copy chips use
   body type. Long species names and private nicknames wrap without clipping.
2. **Portrait and printed surfaces:** the larger illustration remains decoded,
   uncropped and unobscured by rarity, level, count or active badges. Check every
   species shape, every rarity, base/morph/shiny art, and worn accessories. Verify
   the ink borders, hard shadows, 16-20px portrait/action corners, grain and text
   contrast against the shipped brand. Shiny portraits must match their shipped
   assets without a hue filter. Base animations must still play normally.
3. **Switching:** exactly one full portrait at rest, no neighbouring card slivers
   or clipped hard shadow, and a legible position count. Check one, two and many
   species, wrap in both directions, fast swipes, slow drags, vertical scrolling,
   frame-side taps, previous/next buttons, arrow keys and species buttons.
   Selected identity, rarity, stats, action IID, current selector, copy rail and
   wardrobe must all follow the same pet. Switching away from an open talent tree
   must close the old tree. A previously armed destroy must not follow the switch.
4. **Copies and wardrobe:** copy chips remain at least 44px tall, show their art,
   colour, level, nickname and states, and preserve their per-species horizontal
   scroll on a pick. Confirm controls are fully reachable and focused controls
   scroll into view. Clothing and team selections still work, and the portrait
   remains a useful visible mirror while trying clothes on.
5. **Stats:** Level sits on its own line, Power/Health/Reflex form one aligned
   group, and steps-to-next-level and lineage use full-width labelled rows.
   Check level cap, long lineage bonus text and expanded talent/breeding states.
   No numbers disappear, overlap or imply a changed formula.
6. **Actions and safety:** one lime action at a time: Bring along for an inactive
   pet, Talents for the active one, or the existing Feed action when a pair is
   under review. Nickname and supporting controls recede. Permanent actions have
   visible separation and loss copy; Destroy names the pet and Bone Dust payout.
   Operate equip, nickname, talents, breed pick/cancel/keeper choice, and both
   destruction confirmation paths on disposable data. Check last-colour,
   trained, shiny and lineage cases. Existing warnings and escalations must be
   fully readable and reachable. Hit-test every action, especially with the
   sticky breeding panel present, at every relevant scroll position.
7. **Navigation:** Bone Dust appears below the pet's content. Paddock, Laboratory
   and Kennel remain reachable below it with correct counts and destinations.
   The smaller Paddock preview must be intact. Kennel swatches and collected count
   stay readable without competing with the creature. Help starts collapsed and
   expands correctly. Also test the no-pets state and Laboratory entry hints.
8. **Accessibility and motion:** verify at least 44px tap targets, visible focus,
   sensible keyboard order, current species announcements, full vertical scroll
   reachability, safe-area clearance, and no unexpected horizontal page overflow.
   Reduced motion must stop Stable animation and animated settling. Run the
   existing `tests/ui-audit.js` console audit before calling the UI verified.
9. **Actual height:** after fonts and images settle, record viewport, collection,
   focused pet, wardrobe/panel state, `#stableBody.clientHeight`, `scrollHeight`
   and maximum scroll. Measure the normal 393x852 state, empty/single-pet state,
   a wardrobe pet, expanded talents, and a precious breeding pair. Include the
   measured values and screenshots in the independent review.

Example console measurement in the rendered Stable:

```js
await document.fonts.ready;
const stable = document.querySelector('#stableBody');
({ viewport: [innerWidth, innerHeight], clientHeight: stable.clientHeight,
   scrollHeight: stable.scrollHeight,
   maxScroll: stable.scrollHeight - stable.clientHeight });
```
