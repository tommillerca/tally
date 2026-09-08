# R47 advisory report, 2026-09-07

Frozen plan SHA256 verified: `0bb19375d723fdbb2143ac1c9be22275e20809c7e76e4e87979c76b7fc2ae2f0`.
All source paths resolved in this checkout. No original checkout was edited. This report is advisory, pending independent review.

## Files changed

- `js/spires.js`: session-only ownership authority, full snapshot reconciliation, pending local claims, online verification before tribute/Boon, server clock, and zero income at siege expiry.
- `js/social.js`: ownership snapshot parsing and clock error reporting; atomic grant receipt, currencies, inventory, pet instance, rename and presentation queue; retained-note recovery; sealed gifts remain recoverable through an interrupted application; tend checks the response body.
- `js/app.js`: changes confined to spire/siege/grant imports, lifecycle call, sheets, map controls, fight settlement and delivery. Pending claims pay zero takeover coins. Active siege banner, in-session polling and loss notices are reachable. Presentation waits for boot, splash, wheel and sheets.
- `server/src/index.js`: adds `serverNow` to `/spires/mine`. No migration is needed.
- `server/r47-economy.test.mjs`: Node guards using the existing transactional memory IndexedDB harness, plus extracted presentation logic and source wiring assertions.
- `server/r47-browser.test.mjs`: unrun browser guard for four-tab banner visibility, real control hit tests, navigation and presentation after a simulated cold splash.
- `server/R47-REPORT.md`: this report.

## Retention and implementation decisions

`GET /grants` retains rows. It reads after the local cursor and records a server acknowledgement watermark; it does not consume the grant. Pruning has a 90-day condition. The local XP ledger retains the note. The old cold-open failure is unpresented delivery, not destruction of that note.

The separate receipt and reward writes were a real permanent-loss seam. Rewards now ride in `awardOnce`'s existing `claimAndPay` transaction. The presentation queue joins that transaction, so cursor movement cannot discard an unpresented new delivery. Previously retained spire notes are recovered once from the ledger.

R47-4 decision, reported before implementation: re-reach `spireBannerHtml` from the active siege check. The banner sits in the app's flex flow outside routed content, so all four tabs retain it. The retired `outThereHtml` remains untouched because restoring the entire section would extend beyond the owned app sites. Siege priority in map actions remains intact.

An offline device cannot know that a rival has taken a shared tower. Tribute and Boon therefore require a successful ownership snapshot. Offline fight claims are pending and receive no takeover payout, ownership, tribute or Boon. Reconnect reads ownership; it does not replay a claim mutation against a rival. A restored kv row cannot supply the session authority required to pay.

## Proof

Agreed command: `node tests/unit.test.js`.

Observed output:

```text
FAIL serveTree does not hold the event loop open after the script ends
  serveTree kept node alive, so a self-serving audit can never exit: Command failed: /Users/tommiller/.nvm/versions/node/v22.22.2/bin/node --input-type=module -e import { serveTree } from "/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/ad578513-d00a-4ff9-bdb3-c31e94189b3d/scratchpad/wave-r47/tests/godmode.js";
    const own = await serveTree("/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/ad578513-d00a-4ff9-bdb3-c31e94189b3d/scratchpad/wave-r47");
    process.once('exit', () => own.close());

362 passed, 1 failed
```

Exit status: `1`.

Additional command: `node server/r47-economy.test.mjs`.

The same guard was copied into a temporary throwaway tree containing this checkout's modules. `js/spires.js`, `js/social.js`, `js/app.js` and `server/src/index.js` were replaced there with their original `git show HEAD:<path>` contents. The working checkout was never reverted. Exit statuses were written directly to files, not read through pipes.

| Guard | Original-source red output | Fixed-source green output |
| --- | --- | --- |
| Takeover | `FAIL ... lost tower still pays 90 coins`, `90 !== 0` | `PASS takeover removes measured 90 coins / 12 Bone Dust and Boon` |
| Offline re-fight | `FAIL ... offline re-fight recreated ownership`, `true !== false` | `PASS offline re-fight stays pending, reconnect cannot mint a rival tower` |
| Restore | `FAIL ... restored loser pays 90`, `90 !== 0` | `PASS stale file restore and advanced grant cursor cannot resurrect 90 / 12 income` |
| Offline/clock distinction | `FAIL ... Cannot read properties of null (reading 'reason')` | `PASS empty successful snapshot differs from offline and skew is reported` |
| Tend no-op | `FAIL ... HTTP 200 with no changed tower is not a successful tend` | `PASS tending a tower requires a real owner transition` |
| Deadline | `FAIL ... no server clock` | `PASS 48 hour siege uses server clock and stops paying at zero` |
| Interrupted grant | `FAIL ... receipt survived interrupted application; reward is permanently skipped` | `PASS grant transaction abort leaves neither receipt nor unpaid reward` |
| Concurrent grant and queue | `FAIL ... paid grant has no durable presentation` | `PASS concurrent delivery pays all payload shapes exactly once and retains presentation` |
| Cold presentation gate | `FAIL ... cold boot has no presentation readiness gate` | `PASS cold delivery waits for visible app, then acknowledges presentation` |
| UI wiring | `FAIL ... /banner\.innerHTML = html/` | `PASS reachable siege banner and offline fight payout gates remain wired` |

Red total: `0 passed, 10 failed`, exit 1. Green total: `10 passed, 0 failed`, exit 0. The concurrency assertion confirms one payout; the original source's failure in that combined guard is its missing durable presentation, not a reproduced concurrent overpayment. The interruption guard separately reproduces the retained unpaid receipt.

`node --check` passed for the changed JavaScript files and the browser guard. `git diff --check` passed.

## Blocked, denied and unproven

- No commit, push, PR, publication, version stamp, deployment or production D1 write was performed. No App Store Connect action was attempted.
- No browser or Worker proof was run. Socket binding is unavailable in this sandbox. The agreed unit command itself contains a socket-using `serveTree` test; its failure is reported rather than bypassed.
- The browser guard is syntax-checked only, with no red/green runtime claim. Run `node server/r47-browser.test.mjs <locally-served-checkout-URL>` externally. Intended output: four tab passes, a CTA pass, a retained-notice pass, then `6 passed, 0 failed`. That is an expectation, not observed output.
- Node UI guards exercise the readiness function and wiring, not browser pixels. The new browser guard simulates the poll and splash. Real cold launches, actual map-button offline fights, native notifications, safe-area geometry, real two-page IndexedDB races and server endpoint behavior still need independent proof. Run the applicable UI, reward and multitab audits externally. Existing spire audits that seed a local claim and assume it pays without confirmation need fixtures updated to the new contract.
- Strict ownership prevents editing `tests/release-gate.mjs` and `docs/CLAIMS.md`, despite the plan also requesting those edits. Proposed registration: `../server/r47-economy.test.mjs` in PURE only, described as ownership reconciliation, pending claims and atomic grant delivery; `../server/r47-browser.test.mjs` in BROWSER only, described as four-tab siege controls and deferred grant presentation. Neither is registered in this checkout.
- `CLAUDE.md` was read. `tally/CLAUDE.md` does not exist in this checkout.

## Deviations and follow-ups

- All shared-tower income is unavailable without fresh ownership verification. This is the necessary fail-closed consequence of the offline takeover requirement. Stored legacy local claims become pending until checked. A successful empty snapshot rejects them.
- Server-time correction depends on Tom deploying the accompanying Worker response change. No deployment was performed here.
- The active banner is re-reached through the owned siege site rather than through Today or the retired entire Out There section. It uses existing banner styling with a bounded, scrollable flex container. Browser layout is unproven.
- The one-time legacy note recovery can show a spire note that was presented by an earlier build. Those builds retained no reliable presentation acknowledgement. No rewards are re-paid.
- `petInstancePay` is private in lane D's `js/loot.js`, which this lane cannot edit. The grant transaction composes the same instance/bank/ownership shape using public migration readers and `isKnownPet`. Proposed later cleanup: export a reusable grant payment builder from the owning lane to avoid duplicate shape maintenance. The required pet helpers already exist in this checkout.
- R47-3 remains deferred. `/spires` still returns the full stored defender snapshot, including `yard`, `gear` and `plat`. Proposed fix: explicitly project only the public appearance and combat fields consumed by the spire sheet and rival fighter, with an allowlist guard that rejects every extra field. Preserve any fields combat actually needs; do not simply copy the leaderboard projection without tracing those consumers.
- R47-7 through R47-11 have no defect descriptions in the frozen order. Their proposed fixes cannot be specified without the underlying findings. None was implemented.
- The existing tribute collector still separates its collection cursor from the map handler's currency writes. This work closes unauthorized tribute and the explicitly ordered grant atomicity defect. It does not claim to close that separate pre-existing tribute crash seam.

Proposed single dated `docs/CLAIMS.md` section for its owner to add:

```text
2026-09-07: R47 economy and siege
Shared ownership is reconciled before income. Offline shared claims remain pending.
Grant receipts and rewards commit atomically; presentation survives cursor movement.
PROOF: r47-economy.test.mjs
PENDING PROOF: r47-browser.test.mjs
Browser, native and Worker behavior remains subject to independent review.
```
