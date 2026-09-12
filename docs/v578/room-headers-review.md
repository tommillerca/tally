# Room headers advisory review

Implemented the frozen header branch without committing, pushing or publishing. Browser acceptance remains unproven because this sandbox denies local server binding.

## Source and merge

Plan SHA256 verified: `7a87eb915fbfd52c5fccdbd9f56e03bda6a5166531f64b74ca941072aeffa2a0`.
Checkout HEAD and main: `bdf7325da4f05c8d08290037c6d0ba337deb2f10`.
Header branch: `4767f7f1286384e3267fa51771814fc9cb63d803`.
Merge base: `b13e7fd290b2b2f5c3d0f11c6aa8b033af559ada`.

`git merge --no-commit --no-ff origin/ui/room-headers` was denied when Git tried to create ORIG_HEAD.lock in the original repository's external worktree metadata. No approval escalation was available. A shared temporary clone at `/private/tmp/roomheaders-merge` was checked out at the exact HEAD and a real `git merge --no-commit --no-ff 4767f7f1286384e3267fa51771814fc9cb63d803` was performed there. It conflicted only in app.css. The manual resolution retained the entire main CSS and appended the exact branch header rules. Reviewed results were copied into this checkout. This checkout has working-file changes, not a pending Git merge. No original checkout source was edited.

Every one of the 11 merge-touched files was compared against main. The app.js net deletion is the old Kitchen SVG scene being replaced by the selected header. Its other changes are the shared header helper and the Laboratory call site. No unrelated app.js changes were present. CSS is byte-for-byte main followed by the branch's header rules. All eight PNGs match the branch byte-for-byte. The service worker only adds those assets to PRECACHE, with no VERSION change. APP_BUILD, version.json and js/changelog.js are unchanged. native/ASC-SUBMISSION.md does not exist in this checkout and was not created or edited.

## Files changed and purpose

This inventory substitutes for the requested commit-message inventory because the user prohibited commits.

| File | Change |
| --- | --- |
| app.css | Append the original dark A header styling, 144px minimum height, art positions and inward chef CSS transform. Preserve the complete inherited prefix. |
| js/app.js | Add roomHeaderHtml; replace old Kitchen scene; place Laboratory header outside its redraw target. Retain all other main code. |
| sw.js | Precache eight header PNGs. No build/version bump. |
| assets/room-headers/chamber.png | Original Laboratory art, copied unchanged. |
| assets/room-headers/slime.png | Original Laboratory art, copied unchanged. |
| assets/room-headers/lab.png | Original Laboratory art, copied unchanged. |
| assets/room-headers/slime-puddle.png | Original Laboratory art, copied unchanged. |
| assets/room-headers/cute_monster_chef.png | Original Kitchen art, copied unchanged. |
| assets/room-headers/ghost_chef_cute.png | Original Kitchen art, copied unchanged. |
| assets/room-headers/ghost_chef_fat.png | Original pot-holding chef, copied unchanged; existing branch CSS flips it inward at render time. |
| assets/room-headers/donut_that_s_alive.png | Original Kitchen art, copied unchanged. |
| tests/room-headers-audit.mjs | New self-serving browser guard with CONTROL, HEADER, ART, SCALE and three static NO-REVERT checks. Explicit 11-row lifecycle and non-green blocked exit. Accepts argv[2] or URL. |
| tests/release-gate.mjs | Register the new audit as DECLARED full. |
| docs/v578/guard-red.txt | Append blocked removal-control attempt; preserve existing evidence. |
| docs/v578/room-headers-audit.txt | Exact final browser-audit output. |
| docs/v578/room-headers-proof.txt | Full agreed unit proof output. |
| docs/v578/room-headers-review.md | This advisory inventory, findings and deviations. |

A separate browser audit was chosen because lab-room2-audit and stable-rooms-top-audit run Node models and cannot prove rendered geometry or decoded images. NO-REVERT checks preserve recoverInterruptedPitFight (v570, d29682d1), leaderboardLastOnline (v571, 7dcd8c18), and fanPaintRevision (v571, 6041ef56), selected by reading the post-base history.

## Proof and limitations

- `node tests/unit.test.js`: **391 passed, 0 failed**. Full output in room-headers-proof.txt.
- `node tests/wardrobe-ui-1f-audit.mjs`: exit 0. Inherited CSS hash, equipment and wardrobe source guards passed.
- `git diff --check`: passed.
- `node tests/room-headers-audit.mjs`: exit 97. Three NO-REVERT rows passed. All eight browser rows were UNPROVEN because `listen EPERM: operation not permitted 127.0.0.1` prevented serving this checkout.
- Throwaway removal control: removed both header call sites, retained helper/CSS/art, and ran the same audit from that copy. Exit 97 for the same server denial. HEADER and ART red proof is still outstanding, not satisfied by a setup failure. Exact attempt is appended to guard-red.txt.

The design and illustrations are unchanged. No measured claim is made about their browser appearance.

## Deviations requiring reviewer attention

1. The real merge ran in a temporary clone because this worktree's external Git metadata is not writable. The resulting files were transferred here; no merge commit or merge state was created here.
2. The requested commit-message inventory is provided in this document instead, respecting the explicit no-commit instruction.
3. This checkout follows device text size through `font: -apple-system-body` and defines no maximum supported text size. SCALE uses an explicitly labelled 53px root stress case. This is a proposed substitute, not proof of the undefined largest-supported setting or native Dynamic Type behavior. The reviewer should define the target and rerun on a capable host.
4. Browser acceptance and mutation proof are blocked by the sandbox. Rerun both before accepting the feature. No redesign was made to conceal a failing or unmeasured requirement.
