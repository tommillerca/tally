# F1/F2 advisory review

Frozen plan verified: `9ae9109c0fa2f0a238a13844006018c75b44b0f649c7ffee711834333d80849d`.

## Changes

- `app.css`: appended six lines. Centre content in every Backpack `.bp-card`, including crates, charms, draughts and potions. Keep quantity badges in the top-right corner. This matches the existing ingredient tiles' `justify-items: center` convention. The existing full-width two-column grid needs no row alignment change. Egg progress rows, Kitchen status rows and salvage lists retain their existing row layouts.
- `js/app.js`: move The Studio after Take off in the rail's DOM order.
- `tests/backpack-wardrobe-f1-f2-audit.mjs`: real-browser audit at 375x812 and 430x932. Prints nonempty controls, measured card/art/title/summary centres, rail order and every Take off control's geometry and visibility. Accepts the positional URL or URL environment variable; otherwise serves the checkout located relative to its own file.
- `tests/studio-audit.mjs`: update the inherited old-order assertion to require the requested Save fit, Take off, The Studio sequence.
- `tests/release-gate.mjs`: register the audit in DECLARED at full tier.
- `docs/v579/guard-red.txt`: append both browser attempts, preserving previous evidence.
- `docs/v579/f1-f2-unit.txt`: full agreed proof output.
- `docs/v579/f1-f2-review.md`: this advisory report.

## Duplicate finding and proposed deviation

There are two distinct source controls, not nested text matches: the rail's `[data-fit-reset]` removes everything, and `.ward-cell.none[data-equip=""]` removes the current slot's piece. The second is rendered when a non-default slot has items and displays Take off when that slot is equipped. Its ancestor `[data-ward-pieces]` is hidden in Dressing Room mode and shown in Choose pieces mode. The audit seeds an equipped H cosmetic and inventories both nodes across the entire Wardrobe content, rather than narrowing the count to the rail.

The browser was unavailable, so the reported live overlap and actual visibility remain unverified. The exactly-one requirement conflicts with retaining both labels whenever Choose pieces exposes the equipped slot control. Proposed deviation: label the slot control "Remove piece" in both its initial template and its restaging update, preserving its action. This was NOT applied because it exceeds a reorder and changes frozen lower markup. The audit retains the strict ONE-TAKE-OFF requirement, so it will expose the conflict when rendered. Independent review must resolve this before claiming completion.

## Proof and blocks

Both requested browser commands exited 1 during setup, with 0/10 rows. Local serving was denied with `listen EPERM: operation not permitted 127.0.0.1`. Live browser launch failed with Chromium's sandbox initialization error; `/bin/ps` was also denied. These failures are not evidence of CENTRED/ORDER red or local green. Exact output is appended to `guard-red.txt`.

`node tests/wardrobe-ui-1f-audit.mjs` passed, including the inherited CSS prefix and lower markup/handler hash locks. `node --check tests/backpack-wardrobe-f1-f2-audit.mjs` and `git diff --check` passed.

No commit, push or publish was attempted. No original checkout source was edited. The existing dependency resolver reads Puppeteer from the checkout's installed dependency path, which resolves outside this checkout; no dependency files were edited. No protected submission or version files were changed.

Agreed proof: `node tests/unit.test.js` exited 0 with `391 passed, 0 failed`. The first run reported `390 passed, 1 failed` because the inherited Studio assertion required the old order. That assertion was updated to the frozen F2 order before the final run. Both full outputs are in `f1-f2-unit.txt`.
