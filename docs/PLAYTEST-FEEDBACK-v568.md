# Tom's live feedback on v568, captured 2026-09-11

Captured verbatim from his testing of the shipped seven-screen UI kit. Nothing
here is done until it is live and I have checked it.

Status key: OPEN, IN A LANE, DONE (live and verified).

## Bugs

| # | What he hit | Status |
|---|---|---|
| B1 | "leaving a fight saves your progress is super glitched and almost crashed the app trying to start the fight again and then didnt work" | **IN v570 SPEC.** Reproduced on live: the app dies mid-fight, keeps the charge, then the Pit says "You left your fight ... so it goes down as a loss" for a crash he did not cause. The boot toast promises the fight is "still open" and nothing in the codebase can resume it. Three defects, spec written |

## Screen feedback

| # | Screen | What he said | Status |
|---|---|---|---|
| F1 | Today | "STOP MAKING BONEHEAD FLOAT AND MOVE SO MUCH SAME WITH PET. MOTION ONLY, POSITION IS FINE" | OPEN |
| F2 | Today | identity footer "CAN BE A BIT BIGGER" | OPEN |
| F3 | Today | remove the Laboratory block at the bottom with its "hide this" button | **IN v570 SPEC** |
| F4 | Today | remove the disclaimer that nothing grown or cooked counts as food eaten. "obviously our players arent 2 years old" | **IN v570 SPEC** |
| F5 | Wardrobe | "REMOVE FIT COUNT NO ONE CARES" | OPEN |
| F6 | Wardrobe | "MOVE STUDIO SO FIT ACTIVITIES ARE TOGETHER" | OPEN |
| F7 | Wardrobe | "TEXT CLIPPING AT TOP?" | OPEN, needs a render to confirm |
| F8 | Wardrobe | "WHY IS THE HELMET TRY ON IN TWO PLACES ... needs a declutter and simplify, like items need to be stacked for similar cosmetics, it is becoming a mess" | OPEN, the biggest one |
| F9 | Backpack | "GIVE BIGGER BOX FOR PET" | OPEN |
| F10 | Backpack | "SUPPOSED TO BE COOL BANNER WITH GIF?" over the explainer wall | **IN v569**, banner built from the real v5 spritesheet, wall moved into the Laboratory |
| F11 | The Pit | header colour "UGLY + BORING COLOUR" | OPEN |
| F12 | The Pit | "COMBINE PILL" | OPEN |
| F13 | The Pit | remote den card "MAKE TALLER + BIGGER IT IS ONE PER DAY! RETENTION" | OPEN |
| F14 | Fight | "the text all fucked up and squished ... should be a full match job" | **IN v569.** I under-implemented 1A: the board's own note says "Move grid follows the approved design" and I did only the header, ITEMS and the pet name. Three-line move cards, TURN pill, caps names now built |
| F15 | Crew | favouriting is not obvious. The big star filters; he expected it to favourite. "maybe on their card or something" | OPEN |
| F16 | Crew | "remove the 'missing sync info' shit ... just show online or not, that's too much inside baseball" | OPEN, see decision D1 |

## Decisions he has made

| # | Decision |
|---|---|
| D1 | Sync labels: asked whether the app can really tell if someone is online. **It cannot.** `last_seen` is written by `PUT /profile`, on sync, not by a heartbeat, so someone who closed the app 20 minutes ago is indistinguishable from someone playing. His instruction: "if that doesnt actually work then just remove any mention of online or sync from the game except on the leader board for 'last online'". This REVERSES the documented leaderboard-honesty decision, knowingly |
| D2 | Wardrobe paperdoll: "if you need to move something to make the paperdoll work do it". Paperdoll is back at y374.9 in v569 |
| D3 | Melt: multi-select is closest, move it into the Wardrobe, gear needs recognisable art, mass melt can exist alongside piece-by-piece |
| D4 | Wardrobe tiles: drop `Free` and `Free: no stats`, keep `Wearing`. **DONE in v561, live** |

## Still owed to him, not from these screenshots

- The 28 real browser-audit reds and their causes.
- The melt-in-wardrobe mockups, redone with real cropped art instead of placeholders.
- `weekSteps` clamp: unblocked now that `npx wrangler@4` works.
- Haptics: still not installed, nothing buzzes on native, needs a store upload.
- Onboarding restore-button trap: on a fresh save the primary green button is
  "Restore an account or backup file" and "I am new" is the grey secondary.
