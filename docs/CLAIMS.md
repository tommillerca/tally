# What each patch note claims, and what backs it

Written 2026-08-24 after four notes in twenty-four hours told players things that
were not true for them. `tests/claim-evidence-lint.mjs` reds the gate if the
newest changelog entry has an item that is not answered here.

Two fields per claim, both required:

- **PROOF** the audit that grades it. It must exist and be registered in the gate,
  or citing it is citing a check nobody runs. `NONE <reason>` is allowed and
  honest; a claim with no audit at all is not.
- **REACH** how a PLAYER gets to it, written the way you would tell them. Or one
  of three honest not-yet states, any of which fails the gate on a shipped entry:
  - `GATED <flag>` the code is there and switched off for players
  - `PENDING-DEPLOY <what>` the client is out, the server half is not
  - `NEEDS-PEER <what>` it only fills in once somebody else updates

The three states exist so the author writes down the thing that makes a false note
obvious. Every one of the four bad notes would have been caught at the moment
somebody typed `GATED ?mogv2` next to it and had to look at that.

## v432 (not cut yet: the claim is written before the note, which is the point)

1. PROOF: overscroll-wordmark-audit.mjs | REACH: On Today, pull down past the top. The strip you open up is the same colour as the art above your Bonehead instead of turning into the dark page behind the app, so pulling reveals the wordmark and not the edge of the screen. It follows whichever backdrop you have equipped.

## v431

1. PROOF: transmog-clarity-audit.mjs | REACH: Open your Bonehead, tap a gear slot, and the look panel shows your Bonehead before and after right above the tiles. On for everyone; ?mogv2=0 returns the old screen if a bisect ever needs it.
2. PROOF: today-peek-audit.mjs, today-container-audit.mjs | REACH: Open Today on a phone with a notch or an island. The art runs to the very top instead of stopping at a line, and nothing below it moved.
3. PROOF: overscroll-wordmark-audit.mjs | REACH: On Today, pull down past the top. The wordmark slides in over the art. It draws on top now because behind it would be invisible once the art reaches the top.

## v430

1. PROOF: crew-fan-audit.mjs | REACH: Open Crew. A friend with a long title or nickname keeps their pet visible instead of it being cropped by the name plate.
2. PROOF: crew-fan-audit.mjs | REACH: Open Crew and look at the "thanks for being early" banner: the icon sits in the middle of its slot, not the corner.
3. PROOF: overscroll-wordmark-audit.mjs | REACH: On Today, pull down past the top. The wordmark slides in smoothly instead of stuttering.
4. PROOF: pet-hold-audit.mjs | REACH: Press and hold a pet, on Today or in the Stable, and what it is wearing lights up.
5. PROOF: badge-centre-audit.mjs | REACH: Walk fast enough on the Boneyard to see "Too fast to loot": the bolt is centred in its circle.

## Retired claims, kept because the mistakes are the point

- v429 "Changing how gear looks got a clearer screen" was `GATED ?mogv2`. It went
  out to players who could not reach it, and was removed on 2026-08-23.
- v429 "Test accounts no longer clutter the leaderboard" was
  `PENDING-DEPLOY the D1 migrations`. `is_test` still does not exist in
  production, so nothing changed for anybody. Removed the same day.
- v427 "Tap a friend and see their paddock" was `NEEDS-PEER the friend's upload`
  and, on the second pass, still missing the route: the crew deck is a carousel
  and one tap only centres the card. Now written as two taps, with the empty state
  named.
