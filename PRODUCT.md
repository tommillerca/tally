# Boneheadz Gym

## What it is

A calorie and habit tracker that is really a collectible-character RPG. You log
food, walk, and sleep; those real habits become the stats of a skeleton you own,
dress, level, and fight with. Ships as a PWA at `tommillerca.github.io/tally`,
wrapped with Capacitor for iOS (TestFlight) and Android (Play internal track).

## Platform

`web`. The Capacitor wrappers are distribution, not a design language: the same
web UI runs in all three places and must not adopt native iOS or Android idioms.

## Primary user

Tom's own circle today (himself, his brother Cam who draws the art, and a small
crew of friends; roughly a hundred accounts exist), **built so a stranger could
pick it up**. Design for that stranger: onboarding, plain language, and clarity
are mandatory, but do not design for a mass audience that does not exist yet.

The circle is a genuine mix of gamers and non-gamers. That mix is a design
constraint, not a demographic note.

## The job

Track what you eat and how you move without dreading the app. The tracking is the
game's fuel; the game is the reason you come back to the tracking.

## What makes it different

**The art and the world.** Cam's illustration and the Boneheadz universe are the
reason to stay. It is a collectible-character game that happens to track calories,
not a tracker with a mascot bolted on. Every design decision serves that: the
characters, their gear, their pets, the Boneyard, the Pit, the Dark Spires.

Supporting mechanisms, in descending order of importance:
- Real habits are the stat sheet: protein hits raise Power, streaks raise Marrow,
  steps raise Stamina. There is no grind that is not a real-life action.
- It gets you outside. The Boneyard map, Dark Spires and step-fed rewards make
  walking the core loop.
- It never shames you.

## Durable constraints (binding on all future work)

1. **Cam's art is never redrawn.** His illustration is the visual authority.
   Recolours must be palette-faithful (use colours present in the original piece);
   effects must never degrade, obscure, or wash out his linework. When an effect
   overlays art, prefer modulation (blend modes) over painting on top, and mask to
   the artwork's own silhouette.
2. **Wellbeing-safe, always.** Nothing shames eating. Nothing rewards eating less.
   Nothing a player earned is ever permanently lost: a missed day, a missed siege,
   an untended tower all degrade to "dormant and recoverable", never destroyed.
3. **Non-gamers must never be lost.** Every advanced system stays optional and is
   explained in plain language. A player can ignore the RPG entirely and the app
   still works. Where a system is deep, it gets a plain-language entry point
   before it gets a numbers table.
4. **Player data is sacred.** Additive-only changes; no destructive migrations; no
   silent data loss. An account has been wiped twice in this project's history and
   it must not happen again.

## Voice

Dry, fond, a bit stupid in a good way. The Bonehead is delighted you showed up; he
is not a coach and never nags. Controls name their action. Errors name the problem
and the recovery. No ad-speak, no hype, no shame.

## Operating context

Solo developer (Tom) with his brother providing art. Ships small and often, many
releases a day, each verified against the live URL before it is called done. There
is a hard rule that nothing is pushed without Tom's explicit approval.

## Known undecided

- Whether this becomes a serious public consumer product later. Today the answer
  is "build so it could, but do not pretend it already is."
- Monetisation: none exists and none is planned.
