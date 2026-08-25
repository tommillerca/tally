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

## v436

1. PROOF: today-peek-audit.mjs (AMBIENT + FILL, each proved red alone: a background put back on the scroller, and the strip's colour removed) | REACH: On Today, the page behind your quests and your day is the app's own dark purple again rather than flat black, and pulling down past the top opens a strip in your Bonehead's backdrop colour under the wordmark. Measured A/B in one run: byte-identical to the pre-v434 page at all four sample points, where the v435 build read rgb(13,12,18) at every one.
2. PROOF: friend-paddock-audit.mjs (VISITOR FACING, proved red on three separate trees: host flipped, guest flipped, neither) | REACH: Open a friend's paddock from their profile. You and your friend face each other across the field instead of standing back to back. Nothing about your friend has to change.
3. PROOF: memory-census.mjs (the OFF-DOM and TIER rows), unit.test.js ("every cosmetic the cropped tier can be asked for is on disk") | REACH: Open your Bonehead and tap Wardrobe. The hat tiles are drawn from art cut to the hat instead of a full-body square, so they are less soft. Measured per item on the rendered tiles rather than claimed: 51 of 57 hats land closer to the 640px master (RMS error 22.6 to 10.2), 52 are drawn from more source pixels, none from fewer, and no tile's art moved by more than 2px. The same screen decodes 39.8 MB of source bitmaps at once before and 10.8 MB after.

## v435

1. PROOF: friend-paddock-audit.mjs (CONTROL VISITOR / VISITOR x2, each proved red on its own defect: visitor absent, both figures on one side, visitor at half height) | REACH: Open Crew, tap a friend's card once to centre it and again to open their profile, then tap "Visit their paddock" under their pets. Your own Bonehead is standing in their field on the right, the same size as theirs on the left, turned to face them. Nothing about your friend has to change for this: it is your figure, drawn from your own equipment, on your own screen.
2. PROOF: today-peek-audit.mjs (CONTROL BLEED + BLEED, proved red by removing the fix: 3 of 4 gaps bleed) | REACH: On Today, the page behind and between your quests and your day is the normal dark page again, whatever backdrop your Bonehead is wearing. This is a fix for a regression shipped in v434, so a player on v434 is the one who saw it.

NOT CLAIMED IN v435, DELIBERATELY. The build also changes how the pull-down fill
colour is sampled: it now reads the backdrop through the same `saturate(0.92)`
the art is displayed with, which removes a five-unit blue step at the join
(tests/today-peek-audit.mjs SEAM, proved red at delta 5). It is a real fix and it
is in this build, but it is not in the player notes, because a smaller residual
survives that no flat colour can remove: .hero-scene composites a 7% grain and a
warm radial gradient over the art, lifting the rendered edge by a further
+3/+2/+4 with no hue shift. Whether that still reads as a line is a question for
Tom's eyes, not for a measurement, and "the seam is gone" is exactly the kind of
note this file exists to stop us writing before somebody has looked. It gets a
note in a later build if he confirms it, and more work if he does not.

## v434

1. PROOF: overscroll-wordmark-audit.mjs | REACH: On Today, pull down past the top. The strip you open up is the same colour as the art above your Bonehead instead of turning into the dark page behind the app, so pulling reveals the wordmark and not the edge of the screen. It follows whichever backdrop you have equipped.

## v433

1. PROOF: friend-paddock-audit.mjs | REACH: Open Crew, tap a friend's card once to centre it and again to open their profile, then tap "Visit their paddock" under their pets. You land in their field with their herd in it. A friend still on an older build has no paddock and no button offering one, which is the honest empty state rather than an empty field.

## v432

1. PROOF: kitchen-queue-audit.mjs | REACH: Open the Kitchen from Today. The empty pot card shows a cauldron, not a cookbook.
2. PROOF: today-peek-audit.mjs | REACH: Open Today on a phone with a notch or an island. The coins and chips sit just under the top edge instead of with a gap above them.

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
