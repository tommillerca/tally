# Round 2 advisory report

Plan SHA256 verified: 8256be563b7434370299c950f5381bd827a5882c31880d7ab7f61de1fbf4c4ec.

The revert question is answered in room-headers-commit-message.txt, with raw history, per-line blame and the full two-hunk diff in room-headers-provenance.txt. The merge deleted 48 lines and added 15, net -33. Every changed app.js line matches branch 4767f7f1. Both replacements are intentional header work. No unrelated revert was found.

## Files changed this round

- tests/room-headers-audit.mjs: clarify verified history interval and individual symbol/version provenance in NO-REVERT comments.
- docs/v578/room-headers-commit-message.txt: proposed commit message with complete hunk inventory and explicit exceptions.
- docs/v578/room-headers-provenance.txt: raw provenance commands, results, blame and full removed hunks.
- docs/v578/room-headers-round2-proof.txt: agreed unit command output.
- docs/v578/room-headers-round2-audit.txt: current checkout browser attempt and exit code.
- docs/v578/guard-red.txt: append the round 2 throwaway header-removal attempt, preserving prior records.
- docs/v578/room-headers-round2-review.md: this advisory report.

Application source, CSS, art, sw.js, version.json, APP_BUILD and js/changelog.js are unchanged this round. No original checkout was edited. No commit, push or publication was attempted.

## Validation and blocked actions

- node tests/unit.test.js: exit 0; 391 passed, 0 failed. Full output in room-headers-round2-proof.txt.
- git diff --check: passed.
- Browser audit: exit 97. All three NO-REVERT checks pass. CONTROL, HEADER, ART and SCALE for both rooms are UNPROVEN because local server binding is denied with listen EPERM on 127.0.0.1.
- Throwaway copy: both header call sites removed from an independent app.js; helper, CSS and art retained. Same audit exits 97. This is a blocked attempt, not demonstrated HEADER/ART red. Exact output and copy path are appended to guard-red.txt.
- Process inspection with ps was also denied by the sandbox. No escalation was attempted.

## Deviations and unresolved requirements

The instruction to restore every removal originating outside the branch conflicts with the approved header replacement: the superseded Kitchen scene and Laboratory opening markup predate the branch. Proposed exception: preserve these two deliberate replacements while restoring any unrelated regression. None was found. No redesign was made.

The requested commit-message record is supplied as a file because the user explicitly prohibited commits.

The app defines no largest text size. The inherited audit labels its 53px root setting as a stress case. This does not establish a native largest-supported-size claim. Define that target before acceptance.

Browser measurements, decoded-image acceptance and mutation red proof remain outstanding. This report does not recommend shipping while those requirements are unproven.
