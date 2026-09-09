C6 beta correction, advisory review, 2026-09-09.

The frozen plan file's SHA256 matched `e1db93518608c1cac2a6758c665083bf9deaf43f6fe45fd22ceb06e7e53a535a`. All source paths were resolved within this checkout. The starting working tree was clean.

C6 costs 5,000 coins going forward. On boot, a local `petbuy:C6` receipt whose numeric `price` is exactly `50000` authorizes a 45,000-coin correction. The receipt proves a purchased entitlement; current ownership by itself does not. A free hatch has no purchase receipt and gets nothing. The eligibility rule has no analytics lookup, device allowlist, purchase-date cutoff or five-player cap. Offline purchases carrying this receipt qualify equally.

The correction uses the existing `payAtomic` transaction. The credit and its permanent operation ID, `beta-c6-50000-to-5000`, enter `coinsHistory` together, with the corresponding `coinsRev` increment. That same operation ID is checked inside the transaction before paying. An abort rolls everything back; repeated calls return zero. Existing currency-history merging unions the operation once when two copies of the same save both settle offline. No new refund framework, database schema or general price-drop policy was added.

The refund writes no pet, inventory, equipment or progress rows. A historical paid entitlement still qualifies if the player later consumed the pet, or if an old interrupted purchase still owes delivery. It does not mint another pet or alter the existing purchase recovery path. The boot notice states the new price, returned difference, retained progress, and that this is a one-off beta correction with no future price-drop refunds.

**Cosmetic-only conflict remains:** C6 still has `PET_STATS.mult = 1.15` and its existing power/marrow tilts. This repricing continues an existing sale of combat power at a lower price. This is the frozen plan's explicit disclosure option, not retirement of combat-pet sales or a separate decorative product. No stats were changed, and the misleading “prestige, not power” comment was corrected.

**Evidence limit:** a missing, unpriced or damaged purchase receipt cannot prove what was paid. Ownership and the production analytics count cannot resolve that ambiguity. Such saves are not automatically credited. If historical purchases without priced receipts exist, complete coverage is impossible from this local evidence alone. Proposed handling is a separately reviewed recovery based on actual payment evidence, rather than guessing or refunding free hatches. No such recovery or heuristic was implemented in this lane. Unrelated incompatible currency histories retain the existing merge refusal; this correction does not redesign save recovery. A deliberate full save rollback removes both the refund and its credit history, so reapplying the correction restores the same net balance instead of accumulating credits.

Files changed:

| File | Change |
| --- | --- |
| `data/boneheadz.js` | C6 price and ordinary-egg acquisition copy; explicit combat-power conflict comment. |
| `js/loot.js` | Narrow atomic C6 correction and updated C6 shelf comment. |
| `js/app.js` | Boot invocation and player notice. |
| `js/pets.js` | C6 comments corrected; combat values unchanged. |
| `js/paddock-cards.js` | Locked C6 card names both acquisition routes and the new price. |
| `tests/c6-price-audit.mjs` | Real production purchase, hatch, refund, merge and restore paths over the existing in-memory IndexedDB harness; executes the shipped boot block with UI doubles. |
| `tests/unit.test.js` | Runs the C6 audit from the agreed proof command. |
| `tests/release-gate.mjs` | Registers the audit in `PURE`. |
| `docs/reviews/fix-c6-price.md` | This advisory report and shop audit. |

Proof and red evidence:

The four required behavior checks were added before production changes. After correcting the test's RNG setup to control the production `crypto.getRandomValues` source, the initial run exited 1 with `C6 price audit: 0 passed, 9 failed`. PAID, REPLAY and HATCH failed because the refund path did not exist; NEW failed with `50000 !== 5000`. The free-hatch setup itself verified a real C6 hatch before reaching its missing-refund failure.

After implementation, isolated temporary copies were deliberately broken to show each required assertion catches its specific defect. Mutations never edited this checkout's implementation:

| Mutation | Required row that failed | Output, exit 1 |
| --- | --- | --- |
| Credit 40,000 instead of 45,000 | PAID | `4 passed, 7 failed` |
| Remove the settlement check and named currency receipt | REPLAY | `4 passed, 7 failed` |
| Remove the paid-price eligibility condition | HATCH | `8 passed, 3 failed` |
| Restore the 50,000 catalogue price | NEW | `10 passed, 1 failed` |

Final targeted command: `node tests/c6-price-audit.mjs`, exit 0:

```text
PASS PAID: real 50,000 purchase returns exactly 45,000 and preserves all progress
PASS REPLAY: ten retries and a reopened database grant nothing
PASS HATCH: a real free C6 hatch has no paid entitlement
PASS NEW: real purchase charges 5,000 and receives no correction
PASS RACE: three simultaneous corrections pay once
PASS ABORT: failed credit burns no entitlement and can retry
PASS MERGE: two offline copies settle the same refund without adding it twice
PASS EVIDENCE: missing, unpriced and other-price receipts cannot authorize a refund
PASS LEGACY: priced receipts predating currency history settle without changing the pet
PASS RESTORE: a full rollback restores the old balance and cannot accumulate refunds
PASS BOOT: shipped boot call pays and discloses the one-off correction

C6 price audit: 11 passed, 0 failed
```

Agreed command: `node tests/unit.test.js`, exit 0:

```text
379 passed, 0 failed
```

`git diff --check` passed. The Node proofs use the real game and transaction modules with the repository's IndexedDB harness. The full browser release gate and visual review were not run; this is not a claim of browser, native-device or production validation.

Shop audit, source-based findings only. Other prices and rewards were left unchanged:

| Offering | Current price | Reward or Laboratory overlap and finding |
| --- | --- | --- |
| C6 | 5,000 coins after this correction | An ordinary species in the even egg pool. Ready welcome eggs, monthly quest eggs and den egg rewards can deliver her without a shop purchase. Laboratory recipes operate on existing same-species parents, including C6, to produce its other colours. The shop no longer represents rare or exclusive access. |
| Themed rack | 300 to 6,000 coins; 35 to 400 dust | All 24 possible item IDs pass `crateEligible`. Quest and den crates can award the same cosmetics. Buying guarantees the stocked look, not exclusive ownership. Prices alone do not prove whether that certainty is worth the premium. |
| Rotating rarity rack | 300 to 4,000 coins; 35 to 320 dust | All 355 pool IDs pass `crateEligible`. Same reward overlap and certainty premium as the themed rack. Both ladders were explicitly repriced on September 4, so these are not simply untouched historical prices. |
| Puffer Pack | Jackets 3,000; fish 1,500 coins | All 10 pieces are crate eligible; the shelf already discloses crate acquisition. Three fish IDs also appear in the themed rack's 6,000-coin rung, while their rotating legendary price is 4,000. This is an additional same-item cross-shelf price inconsistency for later review. |
| Five C6 accessories | CE1 8,000; CB1 6,000; CB2 9,000; CG1 12,000; CM1 3,500 coins | None is crate eligible. Egg rolls select species, and Laboratory output is a pet colour, not an accessory. No matching quest or den accessory grant was found in the inspected reward paths. Several accessories now cost more than C6 herself; value deserves review, but they are not newly free through these systems. |
| Football kit | 4,200 per garment; 16,800 full bundle | All 256 delivered colourway/visor IDs are excluded from crate rewards. Pet pieces require their matching companion. No matching egg, Laboratory, quest or den kit grant was found. |
| Vigor Draught / Battle Charm | 90 / 100 coins | Vigor is also a welcome, daily/weekly quest and cardio reward. Strength rewards grant charms. These are extra consumable charges rather than unique goods. Vigor purchases also buy additional Pit activity, which deserves review against any strict cosmetic-only rule. |
| Weekly Mystery Egg | 60 dust, once per ISO week | The same ordinary pet pool is available from free earned eggs. The August 31 return of this purchase route is documented as intentional. With the Laboratory, new eggs provide Base parents and colours come from experiments. Review its current value, but its existence is not an accidental C6-style exclusive claim. |
| Tidewater Aura / rack rerolls | Aura 2,400 coins or 220 dust; rerolls free first, then 1,000 to 16,000 coins | The aura is not an egg, Laboratory or crate item. Rerolls purchase a different shelf selection, not a unique reward. No corresponding free grant was identified in the inspected quest and den paths. |
| Adjacent Laboratory and Kitchen capacity | Incubators 20,000 / 40,000; pots 1,000 / 3,000 coins | Buy extra capacity beyond the free initial slot. No quest or den grant of these purchased capacity slots was identified. Laboratory capacity accelerates pet-colour production; it does not directly sell a unique C6 colour. |

Audit sources: `data/boneheadz.js`, `data/football-teams.js`, and `js/loot.js`, `js/laboratory.js`, `js/quests.js`, `js/poi.js`, `js/game.js`, `js/cooking.js`, and the Emporium rendering in `js/app.js`. Pool counts were computed by importing the shipped catalogues and evaluating `crateEligible`. `scripts/build-cosmetics.py` preserves the handwritten `PET_SHOP` section, so rebuilding its generated arrays does not restore the old price. Some historical comments still refer to the former 50,000 price and 1% egg premise; they are not active pricing logic.

The plan's “8,000 purse” description does not match this checkout's catalogue: CE1 is Bug-Eye Shades at 8,000, while CB1 is Courier Purse at 6,000. CB2 is Charmed Courier at 9,000. No analytics labels, item identities or accessory prices were changed to reconcile that wording.

Denied or blocked actions: none. No commit, push, PR, publication, Worker deployment, remote Wrangler command, production D1 write or secret change was attempted. `native/ASC-SUBMISSION.md` was not touched. No other checkout was edited. Deviations: none from the selected repricing/disclosure option; historical refund completeness is limited by the missing-evidence case stated above. This report is advisory and the final diff remains available for independent review.
