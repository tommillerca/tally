# v572 advisory review

Partial implementation. The frozen plan hash matched 55842d70a1a00297d4ca3d5f99c7996c02f07c6b003d1e4b0c0e7d02d37f49e3.

Fit counts are removed from the header and saved-fit switcher. Save fit still renders at six, is aria-disabled, and explains the cap when tapped. Studio already shares the toolbar with Save fit and Take off, with its camera and route intact. Four stamps advance to v572: app.js, sw.js, version.json, changelog.js.

Selectors affected: `.ward-fits` markup removed in the header; `.ward-fit-switcher small` count markup removed in the toolbar. Neither reaches below the toolbar. No CSS changed. No paperdoll markup or lower handlers changed. Inherited CSS and lower-region hash guards remain intact. Removing content can affect flow; unchanged source hashes are not geometry proof.

Blocked requirements and proposed deviations:

1. Gear still renders with `gearItems.map`, separately from cosmetic `bhFamilies(items)`. The executable pending guard `node docs/v572/duplicate-look-red.mjs` reports one tile for one piece and two tiles for two same-family pieces, then exits 1. It remains RED, outside PURE, because stacking is not implemented. Proposed exception: permit changes to the lower grid and handlers, add a combined family variant picker with visible stats, and explicitly revise the corresponding hash locks after independent review.
2. Football has a dedicated `fbRailHtml()` try-on alongside the Dressing Room look picker. These are separate render paths within the frozen lower markup. Deduplication is not implemented. Proposed exception: consolidate these paths under one family picker while preserving owned equip, paid transmog and shop routes.
3. `wirePd` currently scrolls to `.mog-panel`, not the item grid, and has no return position. It is within the frozen lower-handler hash. Proposed exception: permit this handler and a return control to change, preserving scroll coordinates and reduced-motion behavior.
4. Clipping cannot be measured without rendering. No padding was guessed. Paperdoll x16 y374.9 w343 h418, art 62x62, 14 reachable slots, first 66x78, last 80.5x69.5, and Today gap 261.203 are supplied targets, not measurements from this run. Proposed exception: allow an independent browser measurement before acceptance.

No commits, pushes, merges, publication, socket binding, browser audits or screenshots were attempted. The sandbox denied a read-only `ps -axo pid,ppid,etime,command` process-status inspection (exit 127). No approval escalation was attempted. Backpack, Laboratory and native/ASC-SUBMISSION.md were not edited.

Proof logs and direct process exit codes are in `proof-summary.json` and `pure/`. The runner enumerates the PURE literal and every anchored PURE.push/unshift statement, matching r6-guards-audit. The agreed unit command is run explicitly before the full PURE tier. Full PURE is the last verification operation. Failures are reported without weakening their guards.

Agreed proof: `node tests/unit.test.js` returned `391 passed, 0 failed`, exit 0.

Files changed: js/app.js, js/changelog.js, sw.js, version.json, tests/unit.test.js, tests/wardrobe-ui-1f-audit.mjs, docs/CLAIMS.md. Added docs/v572/REVIEW.md, duplicate-look-red.mjs, run-proof.mjs, unit.test.txt, proof-summary.json and per-suite pure/*.txt evidence.
