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

## v448

1. PROOF: first-session-audit.mjs (launches the app with navigator.webdriver MASKED, which is the only way any suite in this repo has ever rendered one of these: every launch gate self-suppresses under webdriver, which is why the first session had no test on it for months. COLD polls 40 seconds of an untouched launch and requires ZERO sheets, veils or teaser posts, dismissing the daily wheel each poll so a card behind it cannot hide. MASKED is a graded row because an unmasked page reports a quiet boot on a tree that still interrupts. CONTROL opens a real sheet through a real control on the same masked page, so the zero cannot be a blind detector. QUEUE reads boot()'s tail statically and fails by name on any maybeShow*/maybePrompt* outside a four-entry allowlist. Measured on origin/main at 23de102b: COLD 2, the recovery sheet then What's New. On this tree: COLD 0. Proven red by restoring maybeShowWhatsNew's call and function: QUEUE and COLD went red together, exit 1) plus community-audit.mjs and beta-thanks-audit.mjs (each carries its own MASKED + NEVER-FROM-BOOT pair for its own card) | REACH: Open the app. It goes to Today. Nothing opens over it, on the first launch after installing or on any launch after that, except the daily wheel, which is your free spin and is unchanged.

2. PROOF: notif-audit.mjs (BOOT-ASKER, four rows, behavioural: Notification.requestPermission is spied on before the page loads with navigator.webdriver masked, and a launch must call it ZERO times. The opposite direction is graded in the same run, because a zero is also what a build that can no longer ask would report: pressing "Everything (power user)" in Settings must call it, and it does, 1 ask against 0 on boot. A fourth row is static and fails if maybeRequestNotifPermission is ever declared again) | REACH: Open the app: iOS does not ask about notifications. Go to Settings, tap "Everything (power user)" or "Just essentials", and iOS asks then.

3. PROOF: race-results-audit.mjs (retargeted from the deleted poster to the Today banner it always had: PAID grades the podium name by name, place by place and step count by step count against the real production result, and a companion row fails if any name off the live /steps/week board appears, which is the read that would announce the wrong winners. VISIBLE grades effective opacity up the ancestor chain, REAL counts the drawn layers before requiring them decoded, and EMPTY requires no card at all rather than an empty frame when there is no settled podium) | REACH: Open Today. The gold "THE STEP RACE - SETTLED" card is there, and tapping it opens every place with its full purse. It no longer opens itself over the app when you launch.

4. PROOF: news-tab-audit.mjs (opens every announcement through its real News row and requires a real decoded box for each) plus community-audit.mjs and beta-thanks-audit.mjs (each drives its Crew strip, its News row and, for the Discord card, its Settings row, and asserts the real invite link at the end of each) | REACH: Open What's New from Settings or from the Crew tab and tap the News tab: every announcement the game has shown is listed there and opens as it did the first time. The Discord and TestFlight links are also on the Crew tab, and the Discord link is in Settings.

5. PROOF: recovery-audit.mjs (drives the Settings recovery and restore controls for real: SETUP asserts the restore sheet opens from its real Settings control, and the rest pin that a FAILED restore never destroys the save it was meant to replace) | REACH: Settings, "Recovery code". The row says NOT SET in plain words if you have not set one, and the app says so in a passing message about once a week. Nothing blocks the screen.

## v446


1. PROOF: freeze-refund-audit.mjs (drives refundStreakFreezes against a real IndexedDB: PAYS asserts +300 on three seeded freezes before anything else is graded, so the no-op rows cannot be vacuous; ONCE, ten repeats and a real page reload each move the balance by 0; RACE fires three concurrent callers and requires exactly one receipt; MIGRATION seeds the OLD kvSet flag alongside three unpaid freezes and requires +0, which is what stops an already-settled install being paid a second time; NOTHING pins that an empty save still burns the flag. Proved red twice: against the shipped v445 code, where three concurrent callers each took a 300-coin receipt and the balance moved +900 for 300 owed, and again on a throwaway worktree with the db.addIfAbsent claim swapped back for kvGet/kvSet, which passes ONCE, BOOT and MIGRATION and still prints +900. Both reds were the same two rows) plus unit.test.js "the freeze payout claims atomically BEFORE it pays, and pays before it deletes" (a static lint requiring the claim to be addIfAbsent on the ORIGINAL key and to precede coinsAdd; proved red on the same mutation) | REACH: Open the app. If you were owed the old Streak Freeze payout it arrives by itself, once, and it can no longer arrive twice if the app happens to start twice at the same moment. If you were already paid, nothing happens and you keep the coins: the existing marker on your save reads as already-settled, which the MIGRATION rows above are there to prove.

1. PROOF: unit.test.js "S0: dust buys looks, and every dust spend in the tree is declared" (a static lint over the loot module and the app module in three rows: DUST_SHOP and buyWithDust are absent from both files rather than merely unrendered; EVERY negative boneDustAdd in the loot module is attributed to its enclosing function and must appear in a declaration table, so a shop cannot return under a new name; and no declared dust spend's body reaches grantEgg / grantCrate / grantConsumable / grantGear / grantPet / addPetInstance. It carries a CONTROL that fires each of the three patterns against a forgery, and each row was proved red on its own throwaway tree: one DUST_SHOP entry restored with buyWithDust -> "DUST_SHOP is back in the tree"; a renamed `bonePouchRedeem` that spends 60 dust and grants an egg -> "an undeclared dust spend: buyRackItem, bonePouchRedeem, breedPets, applyTransmog"; a grantConsumable added inside applyTransmog -> "applyTransmog spends dust and grants an item". The unmutated copy was green first, exit 0) | REACH: Open the Shop. The Bone Dust shop section is gone, and the only dust control left on that screen is the route to the Salvage Bench, which is where you EARN dust. There is nothing priced in dust to buy there any more.

2. PROOF: the declaration table in the same lint is what backs the "what dust is for" half: it names all three surviving dust spends (buyRackItem, applyTransmog, breedPets) and fails if a fourth appears, so the list in this note cannot silently go stale. purchase-firewall.mjs grades the Rack leg for real (a live dust purchase against a real IndexedDB: the balance falls by exactly the price, no coins move, and the purchase path statically cannot reach grantGear or grantCrate) | REACH: Melt gear at the Salvage Bench, then spend the dust on a transmog in your Wardrobe or on a piece from the weekly Rack. Breeding two pets in the Stable still charges dust, which is what the note says.

3. PROOF: NONE for the sentence itself, which is a statement of intent, not a mechanic, and saying otherwise would be the dishonest move. What IS graded is the mechanic it describes: row 3 of the lint above fails on any dust spend that hands out an egg, a crate, a consumable, gear or a pet, and purchase-firewall.mjs holds the same line for coins | REACH: Nothing to do. It explains why the three items were withdrawn.

4. PROOF: reward-sop-audit.mjs (it derives every paying call site in js/ from the source and fails on one that is not declared in its registry; after this change the grantCrate and grantEgg sites in the quests, game, hunt, poi, social, wheel and app modules are all still present and still registered, and the run is green at exit 0). NONE end to end for any single drop: no audit walks a player from 14,000 steps to an egg in their bag | REACH: Walk 14,000 steps in a day for a Step Egg. Cross any level for a Bone Crate, and every tenth level also hands you an egg. Finish a quest, spin the daily wheel, close a day inside your budget, burn a workout's worth of calories, or beat a den boss, the Mimic, the Wanderer or a Gauntlet rung. None of those changed.


## v445

1. PROOF: unit.test.js "S0: no coin-priced sink grants a crate, gear or a weapon row" (a static lint over js/loot.js: the coin shop's parsed stock carries no `crate-` id, buyShopItem's own body reaches no grantCrate / grantGear / db.put('inv'), and the four weapon-shop exports are absent from the file rather than merely unreferenced. It carries a CONTROL that fires each pattern against a forged violation, and was proved red on a cp -R copy with a crate reachable from buyShopItem) plus two-tap-audit.mjs (the shop screen really renders, and carries zero [data-buyweapon] and zero [data-weapon]; proved red against LIVE v443, which answers 12 and 1) | REACH: Open the Shop. The Bone Merchant section is gone and there are no weapons to buy anywhere in the game.

2. PROOF: merchant-retire-audit.mjs (drives retireMerchantIfNeeded against a real IndexedDB: PAYS asserts +33,300 coins and +1,030 dust on a full rack before anything else is graded, so the no-op rows cannot be vacuous; ONCE, ten repeats and a real page reload each move both balances by 0; RACE fires three concurrent callers and requires exactly one receipt; PARTIAL pays two weapons as two and a duplicated row once; PRIZE pays nothing for a Bonecrusher won from the Champion; ROWS pins that no inventory row is deleted. Proved red by swapping the db.addIfAbsent claim for a kvGet/kvSet pair, which passes ONCE and BOOT and still prints 99,900 coins and 3,090 dust to three concurrent callers) plus unit.test.js "S0: the merchant refund knows what every withdrawn weapon cost" (pins all twelve prices against what the merchant charged on origin/main; proved red on a single price changed from 500 to 250) | REACH: Open the app. If you bought weapons, the coins and Bone Dust come back by themselves on that first open, at the price you paid, and a line on screen tells you it happened. You do not have to do anything, you cannot claim it twice, and the weapons stay in your inventory.

3. PROOF: pit.test.js (the four enemy-power contract numbers, 94 damage and 46 Stamina on the worked example plus the 65 and 122 guardrails, measured on origin/main BEFORE the removal and asserted unchanged after) plus gauntlet-sim.mjs and balance-audit.js, both run on origin/main and on this tree and byte-identical across 40 rungs x 120 seeds and across the whole build-by-foe table including the CHAMP column. All three proved red on a throwaway with the heavy Haymaker scaling flattened: 4 assertions red, 37 changed sim rows, every heavy-carrying rung measurably easier | REACH: Fight anything. The Champion, the Glutton, the Mimic and every third rung of the Gauntlet used to fight you holding Bonecrusher; that weapon's damage curve moved into their own stat block unchanged, so the ladder is exactly as hard as it was yesterday.

4. PROOF: unit.test.js "S0: no coin-priced sink grants a crate, gear or a weapon row" (its first half parses the coin shop's stock out of the loot module and fails on any id starting `crate-`, proved red on a cp -R copy with the 150-coin Common Crate put back) | REACH: Open the Shop. Crates are not sold for coins any more, because a crate can roll a statted piece of gear and coins are not allowed to buy power. They still arrive from quests, level-ups, day closes and the Champion, all unchanged. (The clause that stood here, "and the Bone Dust shop still sells a Common Crate for 40 dust", was true when v445 shipped and stopped being true later the same day: see v446 above. Corrected rather than left standing, because this file is read to check whether a note is true NOW.)

5. PROOF: NONE for the Champion prize end to end, and that is the honest state: no audit drives a full Champion win and reads the grant back. What IS graded is that the prize cannot be got any other way (the loot module's crateEligible now excludes `exclusive`, and unit.test.js already fails if an exclusive is reachable from a pool) and that the title is derived from the `pit-champ` badge rather than stored beside it, so it cannot drift from the achievement or be lost in a restore | REACH: Beat The Marrow King. You get the Moonlit Skull, which no crate in the game can roll, and the Marrow King title under your name on your own hub header and on your crew's plates. Players who already pulled that skull from a crate keep it.

## v441

1. PROOF: today-peek-audit.mjs (the SEAM row, re-premised on the RENDERED strip instead of on the filtered source: the old row compared two reads of the same image file, so it was green through the whole of the defect Tom reported twice. Proved red on pristine v440 at 393x852, delta 4.5 against a bound of 1.5, and green on this tree at 0.5. Its CONTROL partner suppresses `.hero-scene::after` and requires the strip to move, so the comparison cannot pass on a page that composites nothing) | REACH: Pull down past the top of Today. The strip that opens is the colour of your equipped backdrop, and it is now the colour that backdrop is actually PAINTED, not the colour of the file it comes from: measured rgb(111,125,65) against a rendered strip of 110.8/125.4/65.5, where the shipped build sat 2.8/2.4/4.5 away and left a visible line. Every backdrop is sampled the same way, so this is not one cosmetic.

2. PROOF: overscroll-wordmark-audit.mjs (the LEAD row: the fade must be given strictly less time than the travel. Proved red on pristine v440, which has both at 130ms, and green here at 60 against 130. The pixel measurement behind it is in the row's header and is NOT what the row grades, deliberately, because it is frame-timing) | REACH: Pull down on Today until the wordmark shows, then let go. The mark fades out ahead of the screen instead of alongside it: measured off compositor frames on a driven release, the last frame with any wordmark ink moved from 326-353ms to 280-282ms against a release that ends at ~360ms, so the lead went from 8-33ms to 74-82ms. The mark is still at full strength for the deep part of a pull, which is what makes it visible at all; what changed is the exit.

## v439

1. PROOF: memory-census.mjs (the Stable, Paddock and Shop CEILING rows plus the new decoded-width SHOT/TILE rows; seven mutations proved red on the tree by the branch author, including the trap that parking the cut sheet restores the SAME numbers byte-for-byte because the onerror fallback brings the art AND the memory back, so only a width row notices) | REACH: Open the Stable, a paddock, or the Shop. The pets are drawn from art cut to the animal instead of the full-size sheet, so the screen decodes a fraction of the picture data: Stable 215.1 -> 52.7 MB, Paddock 322.8 -> 78.1 MB, Shop 192.3 -> 38.1 MB, against a 90 MB census ceiling all three used to blow through. Nothing about how the pets LOOK changes.

CARRIED OVER FROM #158, NOT FIXED, AND UNOWNED: the Shop rack's mannequin tiles
draw a 384px thumbnail at up to 653 device px, a 1.70x upscale against
art-resolution-audit's 1.40 ceiling. Real, and the same class of problem, but it
is not pet art and it needs its own memory-versus-resolution call rather than
being smuggled into a memory fix. art-resolution-audit never sweeps the Shop,
which is why nobody had seen it. Tom has a task chip for it (task_43f67ed6).

## v438

1. PROOF: friend-paddock-audit.mjs (VISITOR: left-not-mirrored, right-mirrored, and a SPLIT row, each proved red alone on its own tree) | REACH: Open a friend's paddock from their profile. You and your friend face each other across the field. The flip is on the figure's container via the `scale` property, not on its layers and not on `transform`: `transform` is animated on that element so a mirror written there is discarded every frame (which is why v435 did nothing at all), and flipping the layers alone leaves the weapon's charge sweeping the wrong side of the body, because that glint is a masked span rather than an image.
2. PROOF: today-peek-audit.mjs (BOUNCE + four PLATE rows + the existing magenta BLEED row; contrast-audit.mjs also reds on the same defect) | REACH: On Today the page behind and between your cards is the app's own backdrop, grain and all, and pulling down past the top opens a strip in your Bonehead's backdrop colour. Measured in one run at three scroll depths: forcing the backdrop colour to magenta changes NOTHING on the page (zero bleed), the means match the pre-v434 page exactly at every sample point, and the grain survives (luminance variance 2.72/1.70/2.91 against the old page's 2.53/1.54/3.10).

THE BOUNCE HALF OF 2 IS NOT VERIFIED IN THIS SESSION, AND SAYING SO IS THE POINT.
The scroller's background is now byte-for-byte the v434 configuration, a
background-COLOR and no image, which is the state Tom confirmed looked "very
good" and the only state this repo has ever measured filling the rubber band (see
the on-device note at the top of app.css: a 126pt held bounce on a booted iPhone
17 Pro showed the scroller's colour edge to edge and zero pixels of four other
forms). What is new is only that the page no longer relies on that colour being
hidden. I tried to re-measure the bounce on the simulator and could not: a drag in
mobile Safari triggers Safari's own pull-to-refresh rather than the app's inner
scroller, and the service worker may serve cached CSS on top of that. So this
rests on the earlier device measurement plus Tom's own report of v434, not on
anything I ran today.

## v437

1. PROOF: unit.test.js ("every cosmetic any tier can be asked for is on disk", proved red by hiding assets/bh/thumb/192/C/C6.png), thumb-freshness-lint.mjs (FRESH + the MISSING half of both CONTROL rows) | REACH: Own Bumbleseal, open your Bonehead and tap Collection. Her tile draws her instead of a broken-image icon with "Bumblesea" spilling over it. Measured in the running app on e2cb252d with 363 cells on screen: 404 on assets/bh/thumb/192/C/C6.png, naturalWidth 0, and that tile is a bare <img> with no onerror to fall back with. 200 and naturalWidth 192 after. Anyone who does not own her never saw this and sees no change.
2. PROOF: thumb-freshness-lint.mjs (FRESH, proved red with the sixteen files restored to their pre-fix bytes: 18 drifted), memory-census.mjs (the four TIER rows, so the fix cannot have been bought by serving bigger art) | REACH: Open Collection, the Crew cards, the leaderboard or the melt bench and look at the banner, either torch, either shovel or any of the three grillz. They are the drawing Cam has had on the big screens since 2026-08-16 rather than the one before it. Measured off the render at deviceScaleFactor 3 across 16 surfaces: the eight items change, every other pixel on every surface is identical, and nothing is drawn at a different size or from a smaller source than before.

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
