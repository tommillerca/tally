# Ship ledger

Written 2026-08-20 after Tom asked "what have you missed that ive asked you? for
isntance the boneyard pixel art icons still arent live".

## Why this file exists

Three things Tom asked for were built, pushed to a branch, reported to him as
"ready", and then sat unmerged for hours or days while he reasonably believed
they were done:

- the pixel-art icon batch (main had 14 icon sites, the branch had 41, so the
  whole Boneyard was still vector on live)
- the typing dialogue / talk box (`js/talkbox.js` was not on main at all)
- the overscroll wordmark (he asked directly: "i dont see it live?")

And two more shipped only because he asked a second time:

- the app icon on iOS (build 18 was cut 2026-07-28, thirteen days before the art
  landed; TestFlight served the old icon the whole time)
- the app icon on Android (versionCode 9, built 2026-08-07, same story)

## The rule

**A branch is not a deliverable. "Pushed" is not "shipped".** The only states
that count are:

| state | how it is proven |
|---|---|
| ASKED | Tom's own words, quoted |
| BUILT | a branch exists and its guards are green |
| MERGED | the change is on `origin/main` **by content**, not by ancestry |
| LIVE | read back off the authoritative remote |

Ancestry is not proof of MERGED: this repo squash-merges, so
`git merge-base --is-ancestor` reports shipped work as unmerged and
`git apply --check --reverse` fails on context drift. Both gave wrong answers on
2026-08-20. **Grep main for a symbol the change introduces.**

LIVE means, per surface:

- **web**: `curl` the live `sw.js` for its `VERSION`, AND `curl` the changed
  module and grep for a symbol the change introduced. A merge alone reaches
  nobody when the module is in `sw.js` PRECACHE and `VERSION` has not moved.
  This happened to the quest fix: PR #65 merged and could not reach one player
  until v413 bumped the stamp.
- **iOS**: `python3 native/asc.py check`. Uploading is not distributing, and a
  build in no beta group is invisible.
- **Android**: `python3 native/play.py check`. Same failure, twice already.
- **an icon or any asset inside a native build**: read the bytes OUT of the
  `.ipa`/`.aab`, not out of the repo. Cam's skull was committed and correct in
  the tree while both stores served the old icon.

## Never merge a stale branch

Every branch cut before today's train tried to revert shipped work:

- `feat/overscroll-wordmark` would have reverted Cam's app icon and deleted
  `tests/quest-pick-audit.mjs`.
- `feat/talk-box`'s diff shows `AppIcon-512@2x.png` going 217767 -> 295622
  bytes, which IS the icon revert.
- `gwart/questpick` read as **15,945 deletions** against current main.

Cherry-pick or rebase forward, then assert the survivors explicitly. The five
worth checking every time: the AppIcon sha, `tests/quest-pick-audit.mjs`,
`POOL_IDS` in `js/quests.js`, `clamp(283px` twice plus the `.fight-hud` overlay
rule in `app.css`, and exactly ONE `const PURE = [` in `tests/release-gate.mjs`.

That last one is not hypothetical. Resolving a conflict by concatenating both
sides left two `const PURE` declarations: a SyntaxError that made the release
gate run ZERO suites while also silently dropping five audits. It looked green.
