# v572 unlock advisory review

Plan SHA256 verified: 26b8648754838d96af26484d5c12b25bb30a56fab99a9f7c1da7cddd1a9d38d3.

Changed files: js/app.js, tests/unit.test.js, tests/wardrobe-ui-1f-audit.mjs, tests/release-gate.mjs. Added tests/wardrobe-unlock-audit.mjs, docs/v572/run-unlock-proof.mjs, this report and docs/v572/unlock-proof/ receipts.

Owned statted gear is grouped through bhFamilies. A family tile opens gear variants with their stat labels, talent names, level locks and slime status. Selecting a variant retains the existing inspect and equip handlers. Plain cosmetics sharing that family are reachable in the same rail. The existing wardrobeLookCounts header remains in use. The unchanged duplicate-look guard reports before one=1, duplicate=2 (exit 1), after one=1, duplicate=1 (exit 0). The added guard checks 388 gear variants across 105 family tiles, with each variant and its stats present (exit 0).

The dedicated football rail and Dressing Room were separate simultaneous try-on paths. Pieces and Dressing Room now have mutually exclusive views below the paperdoll. Both transmog modes share the existing family renderer. The unreleased-but-owned cosmetics rail now uses the same catalogue as its parent grid.

Slot taps save the scroll offset, render the slot's pieces, then scroll to the chooser. Back to slots restores the saved offset. Slot and variant scrolling use the existing reduced-motion preference. The refresh/route scroll contract is unchanged.

Hash changes: dollMarkup and lowerHandlers were renewed for the authorized lower markup and navigation changes. The CSS prefix length and hash were retained because app.css did not change. An additional exact hash protects pdSlot and slot-array definitions. The existing paperdoll mutation control remains intact.

Current locks: `{"dollMarkup": "50d29535de11128bf518696e2a89f94c169bff60fe6f932760b23d4d56de90f3", "lowerHandlers": "9be74654fd35895beb325aa43b55b4a9b01b861e98991bf136f047763af0db2e", "cssPrefixLength": 812158, "cssPrefixHash": "31e2702ba835e59fbea471754b76ba4381f678564bd5f371ac83e2df1209bed8"}`

The paperdoll slot definitions and paperdoll markup compare byte-for-byte with HEAD. No CSS or content above it changed. Expected y delta is 0 px; this is a source-based expectation, not a rendered measurement. Geometry, all 14 hit targets, and Today gap 261.203 remain for the independent browser review.

Denied/blocked actions: pit-figures-audit, readiness-audit and figure-audit hit listen EPERM at 127.0.0.1. No browser measurements were obtained. Figure audit also reported its retained coverage failure before binding; the six-site browser baseline could not be verified. A process-list-based attempt to stop a superseded proof run was denied by the environment; the run was then interrupted through its existing session. Three superseded PURE runs were interrupted (exit 130), and the final complete run is recorded separately in the final receipts.

Deviations: the unit test's old requirement to scroll slots to transmog conflicts with this plan's items-first requirement. Its assertion now checks the item chooser, and its price assertion checks the shared renderer in both modes. The original duplicate-look guard was not edited. No product requirement was intentionally deferred except the explicitly external browser measurements. No commits, pushes, merges or publication. Version remains v572. No edits outside this checkout or to native/ASC-SUBMISSION.md.

The agreed unit command produced `391 passed, 0 failed`, exit 0. Guard hygiene and submission preflight initially failed because the new audit lacked a mutation control and registration. Both were added before restarting the full tier. Final PURE results: 178 passed, 0 failed, all 178 direct child exit codes 0; runner exit 0. The final unit log again ends with `391 passed, 0 failed`, exit 0. Census and per-command direct exit codes are in unlock-proof/census.json and unlock-proof/results.json. PURE is enumerated from both the literal and all anchored push/unshift sites, using the r6-guards-audit method: 82 literal entries + 96 addition sites = 178 commands. The final verification tier is PURE.
