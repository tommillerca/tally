# Tom's list, planned and grilled

Written 2026-08-23. He asked for this on 2026-08-22: "plan all of this out, then
grill your plan before we get going on any of it... the most efficient way that
gives us an incredible product but also isn't sloppy code that leads to bugs
everywhere." He did not get a plan. He got work on some items and silence on the
rest, which is why he asked what had actually been accomplished.

## Already shipped, so nobody re-does them

| item | where |
|---|---|
| "start with breakfast" button removed | v426 (#99) |
| quests always under the four doors | v426 (#99) |
| a past day keeps every section | v426 (#99) |
| double-tap Today -> top, Boneyard -> recentre | #98 |
| saved fit survives "take it all off" | #97 |
| unopened-crate nagging capped | #98 |
| the Wanderer stops swallowing the arena | #96 |

## The rest, in the order I would do them

Sequenced by **cost to the player per hour of work**, not by how interesting it is.

### Tier 1: small, visible, no design needed (a day)

1. **"Too fast to loot" bolt off-centre in its circle.** Same defect class as the
   crew banner icon below. Both are art-alignment, both are cheap, and he has
   flagged this shape of thing twice now with "stop doing that shit".
2. **"Thanks for being early" icon top-left, should be centred.** He notes the
   first-step foot had the identical bug, so fix the shared thing, not two rules.
3. **Wheel text upside down / unreadable** at some rotations.
4. **Press and hold on Bumbleseal highlights her sunglasses** (a stray
   `user-select` / long-press target, almost certainly one CSS line).
5. **Cookbook icon -> cauldron.** Icon swap only. The banner rework is Tier 3.
6. **Wanderer walks on water.** He is placed without a walkability check while
   spawns already snap to land. Reuse the existing snap, do not write a new one.

### Tier 2: bugs with real diagnosis behind them (two to three days)

7. **Crew album cards deform on long titles/nicknames.** A long "Bone Grand
   Master 113" grows the banner and crops the pet. Needs a real fix (clamp the
   title box, not the card), plus a guard, because it is a layout regression that
   will come back.
8. **Watermark exits jolty on the scroll reveal.** Measure first: this is either
   a non-composited property or a layout thrash. Do not guess, and do not
   "smooth" it with a longer transition.
9. **Sluggish on a bad connection, and a full reload after a minute away.** The
   biggest player-experience item on the list and the least specified. Needs
   measurement before any code: what is actually re-fetched on resume.
10. **Dead level-1 bot testers cluttering the game.** He is fine with test data
    existing, not with it living in the real world. Needs a real answer (a flag
    that excludes them from boards and the crew), not a delete script.

### Tier 3: design work, needs his eye before code (mocks first)

11. **Today's macros / wellness rework.** "a bunch of widgets floating with no
    anchor or purpose". #99 gave the day a container, which is the skeleton, but
    the *contents* are unchanged. He explicitly asked for OPTIONS, so this is
    mockups, not a branch.
12. **Haunted kitchen banner, cooler, with pixel art.** Mock up.
13. **Transmog interface.** He asked for it grilled "as a new player". That means
    a walkthrough of the current flow naming each confusing step, before design.
14. **Ectoplasm / transmute explainer, and Gwart as Navi.** Tapping Gwart opens an
    FAQ. This is the anchor for a whole class of "my friends were confused"
    problems and it is the highest-value Tier 3 item.

### Tier 4: new mechanics, biggest and least defined

15. **The walk potion.** Cook a potion, collect coins and herbs for 15 minutes
    while the app is closed, no boss farming. He named Pokemon Go's autocatcher
    as prior art. Needs: an offline-time model that cannot be gamed by clock
    changes, a hard exclusion list, and a story for what a player sees when they
    come back.
16. **Cheers: a real inbox, plus paid cheers.** Two halves. The inbox is a fix
    (they are missable today). Paid cheers with frames, glow, pixel art and
    animation is monetisation and touches the IAP decision.
17. **Visit a friend's paddock.** Show off pets. Also: keep a pet's outfit on
    while it is unequipped and idle in the paddock.

## Grilling my own plan

**The sequencing is defensible; the Tier 3 estimate is not.** Items 11 to 14 are
"mock it up" which sounds cheap and is not: each needs a round with him, and past
rounds have taken a day each. Four of them in one tier is optimistic to the point
of being wrong.

**Item 9 is misplaced.** "Sluggish on a bad connection" is in Tier 2 because it
looks like a bug, but it is probably the largest job on this list: it touches the
service worker, the resume path and every fetch. It is in Tier 2 because of its
value, not its size, and if it turns out to be a week it should be split.

**Items 1 to 4 will feel like nothing.** Four one-line fixes is a poor answer to
"what did you get done", even though they are exactly the things he keeps
flagging. They should ship as one batch on day one so the list visibly shortens,
not be spread out.

**The riskiest item is 15, and not for the reason it looks.** Offline
accumulation means trusting the clock, and this app already had a coin-printer
risk in the garden refund that was only avoided by a one-shot ledger key. A walk
potion that pays on elapsed time is a coin printer if a player moves their clock.
That has to be designed against from the first line, not audited in later.

**What I have not costed at all:** every one of these needs a guard, and this
repo's guards have proven expensive to write correctly. The last 24 hours were
mostly guard repair. If each item carries a guard, Tier 1 is not a day.

**The plan assumes he wants all of it.** Some of these may be worth dropping. 16b
(paid cheers) in particular is monetisation work sitting next to a pile of
unresolved UX confusion, and shipping paid cosmetics before the transmog screen
is legible is the wrong order.

## What I need from him

1. **Tier 3 order.** Four design items, one at a time. Which first? My vote is 14
   (Gwart as Navi), because it absorbs the confusion the others create.
2. **Does 16b (paid cheers) happen before the UX cleanup, or after?**
3. **Is the bot-tester cleanup (10) urgent**, or cosmetic until launch?
