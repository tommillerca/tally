# VERIFY: fix/den-double-pay branch (browser pass, post-gate)

1. REMOTE-PAYS-NOTHING prove-red: in a throwaway copy, re-add
   `if (r.coins) await coinsAdd(r.coins);` to claimDenWin's remote branch and
   run tests/den-ceiling-audit.mjs: the new row must FAIL with delta 48.
   On the real tree it must PASS with carried 48, delta 0.
2. End-to-end banner==bank: win a remote den fight through the real Pit door,
   read coins before and after: delta must equal the banner amount exactly
   (with a Battle Charm equipped, delta equals the multiplied banner).
3. Wallet pill: with the hub open behind the Pit sheet, win any fight; the
   pill's coin number must change without navigating. Same on a loss (+5).
4. Playtest P1-5 second half: the outcome screen's TOTAL (if one renders)
   must match the post-payout balance; measure, and fix separately if stale.
