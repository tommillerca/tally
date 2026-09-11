# v573 advisory implementation report

Frozen plan SHA256 verified: `a5032b42b10a21f253208bba8ceda186d2049ef8594fdad25c10ee1140cfdcac`.
All source paths resolve inside this checkout. No original checkout was edited.

## Files changed

- `js/app.js`: deliberate Stable salvage mode, excluded while talents are open; Backpack banner and card details; Backpack-only identity and navigation classes; specific Laboratory pair warnings; v573 build stamp.
- `app.css`: appended Backpack-only selected-tab, 120px identity container and item-details styles. The existing figure renderer and its shiny, morph and wear arguments are unchanged.
- `js/changelog.js`, `sw.js`, `version.json`: remaining three v573 stamps and release note.
- `docs/CLAIMS.md`: matching v573 changelog item and numbered proof/reach row.
- `tests/backpack-lab-polish-audit.mjs`: new production-template guard, pair warnings, retained risk gates and collapsed card details.
- `tests/breed-lock-audit.mjs`: supplies salvage mode in the existing loss/payout fixture. Its confirmation, named-loss, focus-repaint and payout assertions remain.
- `tests/lab-banner-audit.mjs`: requires the requested two-line banner, rejects restoration of Recipes, and verifies the recipe path remains inside the Laboratory.
- `tests/release-gate.mjs`: registers the new guard in PURE.
- `docs/v573/`: proof transcripts, enumeration, direct process exit records, reproducible PURE runner and this report.

## Proof

The talents guard was run before product edits and failed with exit 1 against the original destruction placement (`guard-red.txt`). It passes after relocation. The first explicit unit run returned exit 1 with `390 passed, 1 failed`, exposing the stale Stable fixture. The fixture was corrected without removing its loss protections.

The final explicit `node tests/unit.test.js` run returned exit 0: `391 passed, 0 failed` (`unit-final.txt`). The final full PURE run returned exit 0: `178/178 passed; 0 failed or blocked`. Enumeration: 81 literal entries plus 97 push/unshift sites, 178 suites total. Every suite returned exit 0 in `pure-results.json`; complete output is in `pure/` and `pure-summary.txt`. This was the last test run. The earlier full pass returned 174/178 while exposing the corrected claims format, control marker, old Recipes expectation and a source-fixture initialization boundary. Its original output is retained in `first-pass/`. The PURE runner enumerates both the literal and every push/unshift site using the same extraction as `tests/r6-guards-audit.mjs`. It reads child process exit codes directly and uses no pipeline.

## Reach and preserved behavior

Backpack > Laboratory still opens the Laboratory. Recipes remain in its visible colour recipe path and in How the recipes work. Stable > Melt a spare for Bone Dust deliberately opens salvage; Laboratory > More pet actions > Melt spares enters the same mode. Opening talents suppresses the destruction control and salvage entry. Existing destruction confirmation, payout and mutations are unchanged.

Crate support copy is inside Details & odds. Battle-item and potion explanations use closed details elements. Counts, zero slots, disabled empty-crate actions, ingredient coverage and per-egg progress logic remain intact. Potion View in Kitchen remains a navigation action, not an inventory-consuming action.

## Deviations and unresolved constraints

1. Typed confirmation remains broader than shiny, as item 6 explicitly directs when the gate protects other earned value. It protects training, names, lineage, bonds, talents, equipped pets and lost collection cells. The engine already rejects shiny Laboratory inputs. A shiny-only gate would remove existing protection while applying to no currently eligible input.
2. Base (plain) and Toxic are valid ingredients individually. Their combination has no recipe. The warning explains Base + Base and Toxic + Rose, without changing recipes or eligibility.
3. The no-permanent-loss lock conflicts with existing destruction and Laboratory mechanics, which permanently consume pets and investment. Those mechanics and their confirmations are preserved as requested. Adding restoration requires a separately specified recovery design.
4. Browser-only locks remain unproven in this environment: pit figures, readiness, the six pre-existing figure sites, Today gap 261.203 and Wardrobe paperdoll y 374.9. No browser audits or screenshots were run. The inherited Wardrobe CSS prefix and paperdoll/lower-handler source hashes pass the pure Wardrobe audit. No figure-renderer call site, Today layout or Wardrobe paperdoll was changed.

## Denied or blocked actions

No tool action was denied. Browser verification is blocked by the work order's socket restriction and was not attempted. No commit, push, merge, publish or native submission-file edit was attempted.
