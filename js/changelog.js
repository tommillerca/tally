// What's New: a player-facing changelog so friends can follow the game as it
// changes. Newest first. Written in plain language (no build numbers in the copy
// itself) — the version is metadata for the "new since you last looked" dot.
// Append new entries to the TOP. `n` is the build number used only for the dot.
export const CHANGES = [

  { n: 464, date: '2026-08-27', title: 'The Paddock is a fifth lighter', items: [
    'Standing in the Paddock had your phone holding about 110 MB of pictures, which is the kind of number that gets a browser tab thrown away in the background and makes you lose your place. It is under 90 MB now. Two things were behind it: the little pet lurking at the edge of the Paddock was being drawn from an image twenty times bigger than the space it appears in, and the small pictures on the news rows were full-size art painted at the size of a fingernail.',
    'Nothing looks any different. The same art, at sizes that make sense for where it is shown.',
  ] },

  { n: 463, date: '2026-08-27', title: 'Sharper shop tiles, and the golden chest is pixel art everywhere', items: [
    'The new shelf added yesterday was stretching its artwork slightly to fill each tile, which softened it. The tiles are smaller and there are four across now instead of three, so the art is drawn at less than its real size rather than more. You also see more of the shelf at once, which is the point of it.',
    'The golden chest was still drawing as the old flat icon anywhere it appeared small: the Kitchen, the Stable, Today, and both the prize wheel and its result. It is the pixel chest with a gold glow in all of those places now, the same one the Backpack has always used.',
  ] },

  { n: 462, date: '2026-08-27', title: 'A lot more to buy, and it changes every day', items: [
    'The Shop sold nine pieces a week. The game has 370 cosmetics, so 361 of them could not be bought at all, which is the real reason there was nowhere for your coins to go. There is a second shelf under the themed nine now, and it is drawn from the whole collection: twelve more pieces, priced by how rare they are, twenty one on the screen instead of nine.',
    'That shelf is new every single day. The themed nine above it still last the week, and your rerolls are still weekly, so nothing you were saving up for moves. Worth a look each morning: with twelve out of hundreds, what is on it today will not be there tomorrow.',
    'What will never turn up on it: pets, Bumbleseal and her pieces, the Day One Lizard and anything else handed out by name, and the body and skull you already start with.',
  ] },

  { n: 461, date: '2026-08-27', title: 'The chest finishes opening before it leaves', items: [
    'The very first chest you opened in a session clipped the end of its own animation: the last drawn frame of the lid coming off was cut short because the chest had already started leaving. Later chests looked right, which is what made it odd. The reason is that the first one pays to load its artwork, and when that took long enough there was no room left in the window for the ending. The chest now waits for its own animation to finish instead of talking over it. Chests that were already loading quickly look exactly as they did.',
  ] },

  { n: 460, date: '2026-08-27', title: 'Breeding works again', items: [
    'Breeding looked like it did nothing. You picked two pets, confirmed, and the screen just sat there: no reveal, no baby, the pair still selected as though you had not tapped. It had been that way since the release two days ago that made breeding free: removing the Bone Dust price left behind a mention of the price that no longer existed, and it fell over at the very last step.',
    'It was not doing nothing, which is the part worth knowing. The breed had already happened by the time it fell over: the fed pet really was gone, your keeper really did gain its lineage rank, and the cooldown really did start. Only the announcement was missing. If you bred pets in the last two days and thought it failed, it did not, and reopening the Stable would have shown you a pet missing. Nothing was taken twice and nothing needs putting right.',
  ] },

  { n: 459, date: '2026-08-27', title: 'The app works with no signal again, and stops reloading itself', items: [
    'If you opened the app with no signal, you got a blank screen. Not a slow one, not a partial one: nothing. That has been true since the backdrop-colour release two days ago, because one small file the app cannot start without was left out of the list of things kept on your phone. On a plane, on the subway, anywhere with no bars, the app was dead. Open it once with signal after this update and it will work offline from then on.',
    'The app could reload itself out from under you while you were using it. There is a safety net that reloads a screen that failed to draw; it was checking once, at one instant, and a normal tap between screens looks identical to a broken one for about a hundredth of a second. It now watches for a full second before deciding anything is wrong.',
    'The one news row that takes you to the Boneyard says so on the row. The other eight open a card and leave you where you were, so the odd one out read as the app throwing you somewhere with no explanation.',
    'Tapping the word TODAY no longer opens the phone\u2019s date picker. It was an invisible control laid over the title with nothing to say it was there, and hunting down an exact day is not something anyone was doing. The arrows still walk you back a day at a time.',
  ] },

  { n: 458, date: '2026-08-27', title: 'Today stops working when you are not looking at it', items: [
    'Today was quietly doing about a hundred and twenty pieces of layout work every second while you just sat there reading it. The news shelf added yesterday keeps a few animated things behind it, and a closed drawer gets no help from the graphics chip, so the whole page was being recalculated over and over for animations nobody could see. It does nothing now until you touch it. If Today felt warm or your battery went faster since yesterday, that was this.',
    'Breeding two pets no longer costs Bone Dust. Walking is the only thing it asks for, the same 6,000 steps between breeds as before. Dust is for how things LOOK now, and nothing you buy with it can make you stronger.',
    'The place where you change how a piece of gear looks has a name at last: the Dressing Room. It is the only room in the game that never had one, which is why it was hard to talk about.',
    'The Salvage Bench stops telling new players to melt gear from a list that is not there yet, and a few lines that still promised to sell you eggs and crates have been corrected.',
  ] },

  { n: 457, date: '2026-08-27', title: 'Today fits on one screen, and news stops hiding', items: [
    'Today used to be a long scroll: the meal list alone ran nine hundred pixels and your wellness rows started well below the fold. The whole day now sits behind one banner showing your calorie wheel and your macros, and everything else \u2014 meals, wellness, the Kitchen, activity \u2014 is one tap underneath it. Nothing was removed. The page is less than half as tall.',
    'It remembers whether you left it open, so flicking between days no longer moves the page out from under you.',
    'News has a collapsed banner at the top of Today. It is one line when there is nothing, it shows a count when there is, and tapping it drops down every announcement the game has ever made with its own art. It never opens itself.',
    'Gwart\u2019s Guide is grouped now, into what your Bonehead wears, what is out there, and what comes to you each day. It also opens with Gwart telling you that you can tap him on Today whenever you are stuck, which is the one thing the app never actually said.',
  ] },

  { n: 456, date: '2026-08-26', title: 'The seam is gone, and the calorie ring makes sense', items: [
    'The faint line where the top of the page met your Bonehead\u2019s backdrop is gone. It was never the colour, which is what four attempts at it kept adjusting: a grain texture sat over the whole hero, and a flat fill can never match a textured surface however well the colour is computed. The texture is off the hero now and the two meet with no step at all.',
    'The calorie ring and the number in it used to disagree. The ring filled up as you ate while the number counted down, two opposite readings in one dial. The number is now what you have eaten, so it climbs with the ring, and how much you have left sits underneath it.',
    'That same calorie card is on the Progress tab now, under \u201cToday\u201d, so the health hub carries it too.',
    'The herb patches on the Boneyard are green. They were drawn in the same browns as the dirt they sit on and read as dead sticks.',
    'Five new pixel icons across wellness, sleep, quests and workouts, and Trends has a proper door in the row under your Bonehead instead of a small dot in the corner.',
    'Double-tapping the Crew tab scrolls back to the top instead of rebuilding the screen under you, which is what Today already did.',
  ] },

  { n: 455, date: '2026-08-26', title: 'The wordmark is gone, and the wallpaper runs off the top', items: [
    'The BONEHEADZ mark that slid in when you pulled down on Today has been removed. Pulling past the top now just shows more of your backdrop colour, running straight up off the screen with no line and nothing printed on it.',
    'That colour is decided from your equipped backdrop art itself rather than measured while the app runs, so it is the same on every phone. If you have no backdrop equipped it matches the scene your Bonehead stands in.',
  ] },

  { n: 454, date: '2026-08-26', title: 'No more black band above your Bonehead', items: [
    'If you have no backdrop equipped, pulling down on Today used to show a black band sitting on top of your hero art. It now carries the same colour the scene behind your Bonehead already uses, so the top of the page runs into the art with nothing between them. If you do have a backdrop equipped, nothing changes: that case was always sampled from your art.',
    'The wordmark also gets home quicker. It still travels up and fades out with the screen, but it now leads it rather than being dragged along, so it is most of the way gone by the time the screen is half way back.',
  ] },

  { n: 453, date: '2026-08-26', title: 'The wordmark rides the screen back up', items: [
    'Pull down past the top of Today and let go. The BONEHEADZ mark now travels back up with the screen and fades as it goes, so the two land together. The last build had it clearing out early, which left it disappearing while the screen was still visibly moving.',
  ] },

  { n: 452, date: '2026-08-26', title: 'The wordmark gets out of the way', items: [
    'Pull down past the top of Today and the BONEHEADZ mark still slides in over the art. What changed is the way out. It now starts clearing the moment you lift your thumb, rather than staying solid until the screen has almost finished springing back, so it is gone before your cards arrive underneath it.',
  ] },

  { n: 451, date: '2026-08-25', title: 'One body got its name back', items: [
    'The body piece called Odd Socks is now Sprinkle Bones. It was the only body in the game named after a different slot.',
  ] },

  { n: 450, date: '2026-08-25', title: 'Small things that were quietly wrong', items: [
    'The Boneyard intro card draws the real pixel art now, the same art the map uses, instead of plain coloured dots.',
    'It also stopped telling you to spend coins in a shop that closed two builds ago.',
    'Ingredient and crate chips in the Kitchen were asking for 13px art, which is under the floor, so they were silently falling back to the old line art.',
    'The pixel typeface loads with the first screen again, so Gwart no longer types in a fallback font for a beat.',
  ] },

  { n: 449, date: '2026-08-25', title: 'Something is walking the Boneyard', items: [
    'The Wanderer has a News entry now. He walks his own patch of the map, sweeps a light ahead of him, and comes for you if you step into it.',
    'It takes you to the Boneyard rather than opening another card.',
  ] },

  { n: 448, date: '2026-08-25', title: 'The pop-ups are gone', items: [
    'Opening the app no longer puts anything in front of you. The recovery-code sheet, the early-tester thank-you, the Day One survey, the "63 new cosmetics" post, the Puffer Pack card, the Dark Spires, Bestiary, Live Wire and step-race announcements, the settled step-race poster, the Discord invite and the What\'s New sheet all used to open themselves on launch, one after another. None of them do now. The app opens on Today.',
    'iOS will no longer ask to send you notifications when you open the app. It asks when you turn notifications on in Settings, and not before.',
    'The step race result is now only the gold card on Today, which it always was underneath. That card carries more than the poster did: every place\'s full purse, not just the winner\'s. Prizes are paid the same way, on time, whether or not you ever look at it.',
    'Nothing else was deleted, only the interruption. Every one of those cards is still there to read: <b>What\'s New</b> has a <b>News</b> tab listing all of them, the <b>Crew</b> tab still carries the Discord and invite links, and Settings still has What\'s New, the Discord invite and the Day One survey.',
    'Your recovery code now lives in <b>Settings</b> only. It is the one thing on that list that matters if you lose your phone, so if you have not set one, the app will still say so from time to time, in a message that does not block anything. Setting it is worth a minute.',
  ] },

  { n: 447, date: '2026-08-25', title: 'The Bone Dust shop has closed', items: [
    'The Bone Dust shop is gone, and so are the three things it sold: the Mystery Egg at 60 dust, the Common Crate at 40 and the Battle Charm at 25. You cannot buy any of them any more. This is a removal, there is nothing in its place, and there is no refund, because every scrap of dust you have earned is still in your pocket and still spends.',
    'Dust is for looks now. It pays for transmog, which is wearing one thing and showing another, and it buys pieces off the weekly Rack. Breeding two pets into one still costs dust as well, and that is the one thing dust buys that is not purely a picture. We would rather write that down than let you find it.',
    'The reason is the same one that closed the Bone Merchant yesterday. An egg is a pet that fights beside you, a crate rolls a statted piece of gear, and a charm pays you more coins for a Pit win. All three are power, and no balance in this game is allowed to buy power.',
    'Eggs and crates still come from playing, exactly as before: big step days, level-ups, quests, the daily wheel, day closes, a real workout, the Boneyard and the bosses. The shortcut is gone. The supply is not.',
  ] },
  { n: 446, date: '2026-08-25', title: 'A refund that could pay twice now pays once', items: [
    'The old Streak Freeze payout could pay you more than once if the app happened to start twice at the same moment, such as two tabs opening together. It now settles once and only once. If you were already paid, nothing changes and you keep the coins.',
  ] },
  { n: 445, date: '2026-08-25', title: 'The Bone Merchant has closed, and your weapons are refunded', items: [
    'Weapons are gone from the game. They changed how hard you hit without changing anything you could see on your Bonehead, and that made them the one part of your fighter you could not look at and understand. Your strength is your stats, your talents and the gear you are wearing now, and all three are visible.',
    'Everything you spent at the Bone Merchant has come back in full: the coins you paid, at the price you paid, plus the Bone Dust for the prestige pieces. It lands by itself the next time you open the app, and you keep the weapons in your inventory. Nothing was deleted.',
    'Fights have not got easier. The bosses who fought you holding a weapon still swing exactly as hard: their weapon moved into their own stats, and every rung of the ladder was re-measured to prove the numbers did not budge.',
    'Crates are no longer for sale for coins. They are still handed out by quests, level-ups, day closes, the Champion and the Bone Dust shop, and Bone Dust still buys a Common Crate. Coins buy looks.',
    'Beating The Marrow King now gives you the Moonlit Skull, which no crate in the game can roll, and the Marrow King title under your name where your crew can see it. It used to give a weapon nobody could see.',
  ] },
  /* DELIBERATELY NOT CLAIMING A RESTORE. The archive is stored and can be read
     back, but nothing in the app offers it to you yet, so saying "you can go
     back to yesterday" would be a patch note for a button that does not exist. */
  { n: 444, date: '2026-08-25', title: 'Your cloud backup keeps an older copy now', items: [
    'Your save is backed up to the cloud every few minutes, and until now each backup replaced the last one. There is now a second copy kept alongside it, from at least a day earlier, so a bad save cannot immediately overwrite every good one. Nothing changes on your phone: it is a safety net on our side.',
  ] },
  { n: 443, date: '2026-08-25', title: 'The seam is gone', items: [
    'The line where the pull-down colour met your Bonehead backdrop is finally gone. It was never a colour mismatch: the art carried a fine grain and the fill above it could not, so the eye read the change in texture. The grain now stops before the edge, and the two are pixel-identical.',
  ] },
  { n: 442, date: '2026-08-25', title: 'The Shop’s art is sharp now', items: [
    'Every tile on the weekly rack zooms right into the piece it is selling, and it was doing that to a small copy of the artwork instead of the full-size one. The briefs, socks and hats were the worst of it. The rack now draws from the full-size art, so the outlines, the teeth and the stitching are crisp instead of blurred.',
  ] },
  { n: 441, date: '2026-08-25', title: 'The colour behind the wordmark, and how it leaves', items: [
    'When you pull down past the top of Today, the strip that opens is now exactly the colour of your Bonehead\u2019s backdrop. It was three shades off, because the fill was copied from the picture file while the screen shows that picture under a layer of grain. The fill carries the grain now, so there is no line where one stops and the other starts.',
    'The wordmark also clears out of the way faster when you let go, so it is gone before the rest of the screen comes back up under it.',
  ] },
  { n: 440, date: '2026-08-25', title: 'The Glutton waits his turn', items: [
    'The Glutton\'s marker used to appear on the Boneyard about a second and a half before every other marker, alone on an empty map. He now fades up with the rest of them.',
  ] },
  { n: 439, date: '2026-08-25', title: 'The Stable, the Paddock and the Shop got a lot lighter', items: [
    'The screens that show your pets were loading the full-size drawing of every animal at once, which is why they could stutter or blank out on a phone that was already busy. They now load a version cut to the animal. The Stable went from 215 MB of picture data to 53, the Paddock from 323 to 78, and the Shop from 192 to 38.',
  ] },
  { n: 438, date: '2026-08-24', title: 'The two of you face each other, and Today\'s background is right', items: [
    'In a friend\'s paddock you and your friend now actually look at each other. Yesterday\'s update turned the wrong one around and left you back to back.',
    'The background on Today is the app\'s own again, and the colour behind the Boneheadz wordmark is back when you pull down past the top.',
  ] },
  { n: 437, date: '2026-08-24', title: 'Bumbleseal has a picture again', items: [
    'If you own Bumbleseal, her tile in your Collection was a broken image with her name spilling out over it. She is drawn in there properly now.',
    'Eight pieces of gear were showing an older drawing in the small tiles: the banner, both torches, both shovels and the three grillz. The big screens have shown the current art since Cam redrew it, so the same item looked like two different things depending on where you saw it. They match again.',
  ] },
  { n: 436, date: '2026-08-24', title: 'Your friend\'s paddock, the Wardrobe, and the colour behind Today', items: [
    'When you visit a friend\'s paddock the two of you face each other now, instead of standing back to back at opposite ends of the field.',
    'The colour behind Today is the app\'s own again. Yesterday it went flat black and the colour stopped appearing when you pulled down past the top. Both fixed.',
    'Every piece of gear is drawn on a full-body square so it lines up when eight layers stack on your Bonehead, and the Wardrobe was showing you those squares: a hat tile was mostly empty space with a small hat in it, blown up to fill the cell. The tiles now use a copy cut down to the item itself, so a hat is drawn from about three times as many of Cam\'s pixels as before and the screen loads about a third of the picture data it used to.',
  ] },
  { n: 435, date: '2026-08-24', title: 'Stand in your friend\'s paddock with them', items: [
    'When you visit a friend\'s paddock you are in it now. Your Bonehead stands across the field from theirs, the same size, facing them, so it reads as the two of you in one place rather than you looking at a picture of theirs.',
    'The colour behind Today went back to normal. Yesterday\'s update let your Bonehead\'s backdrop colour leak down the whole screen, tinting the gaps around your quests and your day. That was a mistake on our side and it is fixed.',
  ] },
  { n: 434, date: '2026-08-24', title: 'Pulling down no longer shows the edge of the app', items: [
    'When you pull down past the top of Today to see the wordmark, the background colour now carries all the way up with it instead of stopping and showing the dark page behind the app.',
  ] },
  { n: 433, date: '2026-08-24', title: 'Walk into a friend\'s paddock', items: [
    'A friend\'s paddock is a place you can walk into now, not a row of thumbnails. Open their profile from Crew and tap "Visit their paddock": you come out in their field, their pets grazing in it, wearing whatever your friend has put on them, with their Bonehead standing at the gate. It is the same field you see your own herd in. A friend who has not updated yet has no field to visit, and no button offering one.',
  ] },
  { n: 432, date: '2026-08-24', title: 'The Kitchen has a cauldron in it', items: [
    'The empty pot in the Kitchen is a cauldron now instead of a cookbook. It sits under a heading that says Cauldrons on a card that says Empty pot, so a book was the one thing in that corner not telling you where you were.',
    'The currencies on Today sit properly under the top of the screen again, instead of floating with a gap above them.',
  ] },
  { n: 431, date: '2026-08-24', title: 'Dressing up makes sense now, and the art runs to the top of the phone', items: [
    'Changing how a piece looks is a different screen. Your Bonehead is right there above the choices showing before and after, so you can see what you are buying instead of scrolling up to check. It says what you keep, what you get and what you pay, in that order, and nothing is taken until you confirm.',
    'The game art now runs all the way to the top of the phone, behind the clock and the camera, instead of stopping in a line and leaving a dead strip.',
    'The Boneheadz wordmark still appears when you pull down past the top, and now draws over the art rather than behind it, so it is not hidden by the change above.',
  ] },
  { n: 430, date: '2026-08-23', title: 'Crew cards stop eating pets, and the wheel and wordmark behave', items: [
    'On the Crew tab, a friend with a long title or nickname used to have their pet cropped by the name plate. The plate grew instead of the text getting shorter. Names now trail off with a "..." and the plate stays put, which gives the art back the space it was losing.',
    'The icon on the "thanks for being early" banner sat in its top-left corner instead of the middle. Centred, and fixed on the shared piece so every banner icon is centred rather than just that one.',
    'The Boneheadz wordmark, revealed when you pull down past the top of Today, moves smoothly now instead of stuttering.',
    'Press and hold a pet to highlight what it is wearing.',
    'The "too fast to loot" lightning bolt is centred in its circle.',
  ] },
  { n: 429, date: '2026-08-23', title: 'Gwart explains himself, and the day stops being a box of boxes', items: [
    'Tap Gwart, anywhere he is standing, and he will actually tell you things. Ectoplasm, transmute, crates, eggs, the Wanderer, dust, saved fits, the wheel, streaks, and how changing a piece\'s look works. There is a "What is this?" on the confusing bits too, which opens him straight to the answer.',
    'The Kitchen said transmute was once a day. It is once every twenty hours, and it says so now.',
    'Transmuting says what it actually costs: six commons in, one Ectoplasm out, no roll and nothing else taken.',
    'Today reads as one day now rather than a stack of separate boxes. Same information, one container.',
  ] },
  { n: 428, date: '2026-08-23', title: 'The app opens fast on a bad connection, and stops reloading itself', items: [
    'This is the big one. On a poor connection the app used to wait on the network for every single file before it could show you anything, every time you opened it. It now keeps a complete copy of itself on your phone and opens from that immediately, then quietly checks for a new version in the background. On a slow connection that is the difference between waiting and not waiting.',
    'It no longer reloads itself out from under you. If you left the app for a minute and came back to find it starting over, sometimes losing what you had open, that was the app swapping to a new version while you were standing in the old one. New versions now download in the background and only take over the next time you open it, so nothing is yanked away mid-tap.',
    'A new version arrives all at once or not at all. It can no longer end up half updated, with some parts new and some old, which is the kind of thing that causes strange one-off bugs that nobody can reproduce.',
    'Switching between Today, the Boneyard and the rest is quicker: the old screen used to sit there for a moment before the new one appeared.',
  ] },
  { n: 427, date: '2026-08-23', title: 'You can add friends again, and the Wanderer learned to swim less', items: [
    'Fixed, and this one was bad: adding a friend from the Crew board did not work at all. Not slowly, not sometimes. The "+ Add" button on the leaderboard, the "Worth adding" card and the button on someone\'s profile all sent the wrong thing to the wrong place, and the app told you nothing. If you tried to add someone in the last while and they never showed up, that is why, and it was not you. Try again.',
    'The Wanderer no longer stands in the middle of lakes and rivers. He is bound to land now, and if the only place he could walk that lap is water, he simply does not appear rather than wading.',
    'Your pets keep their outfits when they are not the one you have out. Bumbleseal stays dressed on her card and in the paddock, not just in the scene.',
    'Tap a friend\'s card in Crew twice, once to bring it to the front and once to open them, and you can see their paddock: their pets, what those pets are wearing, and how many they have. Their side has to open the app on this version once before their paddock has anything in it, so until your crew updates it will look empty.',
    'Cheers have somewhere to live. There is a Cheers panel in Crew with an unread badge, so nothing anyone sends you disappears before you see it, and you can cheer them back from the same place.',
    'The prize wheel\'s labels are the right way up. Five of the seven wedges could land upside down before, which was most spins.',
    'Levelling from the Gauntlet slows down the deeper you go. Nothing is capped and no fight pays less than it did at the start: the early runs are untouched and pay slightly more, while the twentieth lap stops being most of a level on its own.',
  ] },
  { n: 426, date: '2026-08-23', title: 'If a save fails, you hear about it', items: [
    'Until now, if the app failed to write something to your phone, it went quietly. The meal, the weigh-in, the crate, the coins: gone, with nothing on screen to tell you. The app speaks up now.',
    'It only speaks up for things you did or earned. Bookkeeping the app can work out again by itself stays silent, so this is not a new stream of warnings.',
    'And if the reason is that your phone is out of storage, it says that specifically, because that one you can actually do something about.',
    'The Wanderer was drawn so large in the Pit that he sat on top of your Bonehead. He is sized to the arena now, and you can see who you are hitting.',
    'Beating the Wanderer used to leave him standing out on the map as if nothing had happened. He clears off now, until the next one comes wandering by.',
    'Pets were oversized in a fight, and some of them fought with their back to the enemy. They are scaled to each other, turned the right way round, and no longer glowing in the Pit.',
    'Saving a fit, then taking everything off, then putting the fit back on used to return a couple of pieces and forget the rest. A saved fit now remembers the whole look, gear included, and puts all of it back.',
    'Gwart would talk about nothing but an unopened crate until you opened it. He mentions it once now, then finds something else to say.',
    'New: double tap Today to jump back to the top of it, and double tap the Boneyard while you are in it to snap the map back to where you are standing.',
  ] },
  { n: 425, date: '2026-08-23', title: 'Backup off means off, and the Shop stops working overtime', items: [
    'Fixed, and it is the one in here that matters: turning Cloud backup OFF in Settings did not actually stop your save being uploaded. The switch stopped the app pulling a backup DOWN, and left it still sending one up on every launch. Your save is encrypted on your phone before it leaves, with a key that never goes anywhere, so what was being sent could not be read, by us or by anyone else. But off should mean off, and now it does.',
    'Gwart\'s Emporium was quietly working flat out for as long as you had it open, which costs battery and warms the phone. Nothing about it looks any different; it just rests now.',
    'The privacy policy now says exactly what the map does and does not send. The short version: your GPS position never leaves your phone, and everything you find out there is worked out on the phone itself. The one exception is the spires, because other players can hold them too, so the app asks about towers near you on a grid a couple of kilometres wide, and claiming one tells us which tower it was.',
  ] },
  { n: 424, date: '2026-08-22', title: 'A mirror to try things on in, and Gwart finds his voice', items: [
    'You can see Bumbleseal while you dress her now. Her wardrobe sits right under her instead of below the fold, so you watch a piece go on instead of scrolling up to check.',
    'On a small phone she was off the bottom of the screen entirely while you tapped. Not any more.',
    'Gwart was saying the same two lines over and over. He has eighty-nine now, and he works through all of them before any comes round again.',
    'His lines also know what you are up to: an unopened crate, a pot that is done, a garden that is ready, a day you have not written anything down for.',
    'The Wanderer\'s lantern light was snapping to a stub every time you moved the map and then springing back. It holds steady now.',
    'His light also comes out of the lamp properly: a bright pool at the flame that the beam grows out of, and soft edges instead of a hard wedge.',
    'Switching tabs no longer leaves a ghost of the screen you just left sitting on top of the new one. It cuts cleanly.',
    'The Shop used to take most of a second to appear because it was waiting on ten thumbnails that were never going to load. It opens in about a fifth of that.',
    'New in the Wardrobe: take it all off. One control strips everything back to a bare Bonehead so you can build a look from scratch. It only takes things off, you keep everything.',
    'Gwart will tell you when you are wearing nothing statted, because you will be softer in a fight and he would rather you knew.',
    'Fixed: the Not right now button under the first-meal card was sitting closer to the banner below it than to the card it belongs to.',
    'We can now hand a specific player back something they lost to a mistake or a bug, without touching their phone.',
  ] },
  { n: 423, date: '2026-08-22', title: 'Dress your seal, and the Wanderer walks like a person', items: [
    'You can finally put Bumbleseal\'s accessories on her. Stable, under her card: tap a piece to wear it, tap it again to take it off. She wears them everywhere, on Today, out in the Paddock, and into a fight.',
    'She can wear all four at once: stinger, bag, patches and shades.',
    'Two Wanderers on the map used to walk in step and swing their lanterns the same way, which looked like a glitch. They each have their own beat now.',
    'His lantern light stayed put while you pinched the map, so he looked like he was sliding around loose. It sticks to the ground now.',
    'He was sometimes drawn facing one way with his light pointing the other. He turns to face the way he is walking.',
    'Fixed: on bigger phones your Bonehead was shoved to the left with his weapon hanging off the edge, and he and his pet drifted apart. They stand together in the middle again, at every screen size.',
    'Your pet now scales with your Bonehead instead of being a fixed size, so the pair reads right on a small phone too.',
    'Gwart was talking in the smallest type in the app. His lines are readable now.',
    'Gwart replayed his whole entrance every single time you opened Today. He does it once now, then he is just there.',
    'The Boneyard was quietly working flat out even when you were not touching it, which costs battery and makes the phone warm. It rests now.',
  ] },
  { n: 422, date: '2026-08-21', title: 'The pet you paid for, and a faster app', items: [
    'Fixed, and this one cost real coins: a pet bought from Gwart never showed up in your Stable or your Paddock. She was yours the whole time, the game just filed her in one place instead of two. Open the app and she will be there, with no update needed after this one.',
    'The Paddock was showing her as a locked silhouette with somebody else\'s description. That was the same bug wearing a different hat.',
    'Bumbleseal also had no battle stats at all, so equipping her took a pet into the Pit and gave you nothing. She fights now.',
    'The shop tiles for her purse and her patches were framed on the wrong part of the art. They are centred on the thing you are buying.',
    'Moving between tabs is faster. The app was re-reading every piece of your Bonehead\'s art from scratch on every single visit to that screen, about 2.8 million pixels of it, and now it remembers.',
    'The Wanderer was too big on the map. He is 40% smaller and still the biggest thing out there.',
    'The Herb patch on the map finally has its pixel art. It had been drawn and then left on a branch nobody was building from.',
    'The Golden Crate is the Bone Crate now, because that is what it has looked like for a while.',
    'Pull down on Today and the wordmark eases in properly instead of jerking with your finger.',
    'Fixed: tapping Bonehead in the bottom bar did nothing if you were already in the Shop or the Backpack. Every tab always takes you somewhere now.',
    'Your Bonehead was standing well off to one side on Today, with his barbell clipped off the edge. He is centred with his pet again.',
    'The card frame around him is gone. The art runs to the edges and fades into the page, the way it was meant to.',
    'Gwart talks. Tap him for a line, and he will offer one on his own now and then about what is worth doing.',
    'Fixed: on a few screens the new seal was drawing across your Bonehead\'s chest at four times her size. Her art is on a bigger canvas than every other pet and nothing knew.',
  ] },
  { n: 421, date: '2026-08-21', title: 'The Wanderer, and Gwart has a pet for sale', items: [
    'Someone else is out in the Boneyard now. The Wanderer walks a slow beat around the map with a lantern, and the light in front of him is a cone you can see on the ground. Step into it and he comes for you.',
    'He gives you a moment first. The screen goes dark, you hear heavy footsteps, and he walks in out of it carrying the lamp. Then you choose: fight him or back out of the light. Backing out costs you nothing but the moment.',
    'He is the hardest thing out there. Fighting him is meant to be a decision.',
    'Buried crates on the map are not always crates. Some of them have teeth.',
    'The chest that had teeth gets its own moment too, a smaller one: one line, and then the fight.',
    'Gwart is selling a Bumbleseal, and a wardrobe to go with her. Shades, two different purses, a live wire stinger and a set of patches, all sold separately so you can dress her how you want. She is legendary, and she turns up in about one egg in a hundred, so most people will be buying her.',
    'Today leads with your coins and dust at the top, Gwart underneath them, and the next card peeking up from the bottom edge so you can tell there is more down there.',
    'Fixed: pull down on Today and the Boneheadz wordmark actually appears now. It never could before. It was parked in a part of the screen that iPhones do not draw into, so no amount of pulling was ever going to show it.',
    'The Shop tab is Gwart\'s Emporium now: he stands behind the counter instead of the usual character header, and he was leaning three pixels to the right, which he is not any more.',
    'The tab bar carries a colour for each place it goes, and the one you are on reads like a sticker.',
    'The daily wheel had three prizes still drawn as line art next to four drawn in pixels. All seven match now.',
    'Fixed: the tray flashed on its way between the Boneyard and Today.',
    'Fixed: the Mystery Egg was called two different things on two screens that sit one tap apart.',
  ] },
  { n: 420, date: '2026-08-20', title: 'The wordmark, loud this time', items: [
    'Pull down on Today and the Boneheadz wordmark is bigger, brighter, and starts showing on the very first pixel of the tug instead of after a hard yank.',
    'It fades up as you pull, so how far you pull is what decides how much of it you see.',
    'Fixed: on a phone or a desktop with no notch, the wordmark was stuck to the top of Today all the time instead of only when you pull.',
  ] },
  { n: 419, date: '2026-08-20', title: 'The Boneyard reads properly now', items: [
    'The buried crate out on the map was a dark smudge at that size. It is the plain chest from your Backpack now, which is brighter and actually looks like a chest.',
    'The Mystery egg is one clean egg instead of a stack of three, because three eggs fighting for the same twenty pixels turned to porridge.',
    'Distant crates and eggs used to fall back to the old line drawings once they were far enough away. They keep their art now, all the way out.',
    'Mini-boss markers were smaller than a coin pile, which is backwards. They are the same size as the rest of the map furniture now, and the skull on them is half again bigger.',
    'The map key was showing old line drawings for the crate and the egg while the map beside it showed the new art. Every row in the key is now the exact marker you will find out there.',
    'The key also claimed the Herb patch gave you seeds for the Bone Garden. That garden is gone; it gives you two cooking ingredients, and now it says so.',
  ] },
  { n: 418, date: '2026-08-20', title: 'Your Bonehead has gone quiet', items: [
    'The line above your Bonehead on the home screen is gone for now. This is a step back on purpose: the talking is coming back as a proper character who floats in the scene and coaches you, rather than your Bonehead narrating himself.',
    'Tapping your pet still gets you a wiggle and a noise. It just has nothing to say for the moment.',
  ] },
  { n: 417, date: '2026-08-20', title: 'Your Bonehead talks now', items: [
    'The line on your home screen types itself out, one letter at a time, in a chunky pixel face. Tap it if you already know what it says and it jumps to the end.',
    'Tap your Bonehead and it answers you by name, and waits for you to tap before it goes.',
  ] },
  { n: 416, date: '2026-08-20', title: 'The Boneyard is drawn, not diagrammed', items: [
    'The map furniture out in the Boneyard is pixel art now: the skull on a mini den, the signpost on a distance row, the tombstone on a spire card, and the bolt that tells you you are moving too fast to loot.',
    'The coin on a spire you hold was too small to read, so the coin and the number beside it are both bigger. The pickups out on the map are bigger too.',
    'Every dish in the Kitchen has its own drawing, and so does every potion with its own effect, so you can tell one vial from another in your satchel mid-fight.',
    'Badges, trophies, bones, paws, stars and the Step Race footprint are drawn too, everywhere they show up big enough to read. Where they do not, they stay as they were rather than turn to mush.',
  ] },
  { n: 415, date: '2026-08-20', title: 'The wordmark, actually visible', items: [
    'v414 put the Boneheadz wordmark above the Today screen but parked it so high you needed a 73px pull to see any of it. A normal tug shows it now.',
  ] },
  { n: 414, date: '2026-08-20', title: 'Pull down on Today', items: [
    'Tug the Today screen past the top and the Boneheadz wordmark is printed up there, above the world.',
  ] },
  { n: 413, date: '2026-08-20', title: 'Quests rotate properly', items: [
    'Your three daily quests are the same three all day now, whatever else you unlock. They used to shuffle when a gate opened, which quietly handed out extra rewards.',
    'Fixed: claiming your dailies on a Monday could lock you out of every weekly quest for the rest of the week.',
  ] },
  { n: 412, date: '2026-08-20', title: 'The fight is bigger', items: [
    'The health bars now float on top of the arena instead of sitting in a card above it, so the fight scene is 100px taller on every phone.',
    'The bosses are bigger too, not smaller: the arena grew underneath them.',
  ] },
  { n: 411, date: '2026-08-20', title: 'A new face on your home screen', items: [
    'Cam drew the app a proper icon: the skull, with the lime eyes.',
  ] },
  { n: 410, date: '2026-08-19', title: 'The Shop is open', items: [
    'Nine cosmetics a week, shown on your own Bonehead. Tap the magnifier on any tile to try it on for free before you spend anything.',
    'Pay in coins, or pay in Bone Dust if you would rather have that exact piece. Anything you buy is free to wear afterwards.',
    'Do not like this week is nine? Reroll the rack. The first one each day is free.',
    'Weapon auras go on any weapon you carry, and you can take one off and put it back on whenever you like.',
  ] },
  { n: 409, date: '2026-08-19', title: 'The app no longer flashes an empty screen while it opens', items: [
    'Opening the app used to show a bare tab bar over nothing for a moment before the loading screen appeared. It waits now.',
  ] },
  { n: 408, date: '2026-08-19', title: 'Small items look like themselves again', items: [
    'Grillz, earrings and other small pieces were being drawn from a half-size copy and then blocked up. They now use the full-resolution art, so you can actually see what they are.',
  ] },
  { n: 407, date: '2026-08-19', title: 'The selected tab is easier to read', items: [
    'The tab you are on no longer sits under a solid red block, so its label is legible instead of washed out, and it reads as "you are here" rather than as a warning.',
  ] },
  { n: 406, date: '2026-08-19', title: 'Name your pets, and see the whole card in the Stable', items: [
    'Give any pet a nickname only you can see. It shows in the Stable and out in the Paddock, and it never leaves your phone.',
    'The pet card in the Stable was having its bottom cut off, which hid its lower edge and the OUT WITH YOU ribbon on the pet you have equipped. You can see the whole card now.',
  ] },
  { n: 405, date: '2026-08-19', title: 'Closing a crate reveal no longer slides off sideways', items: [
    'Leaving a crate, a level-up or any full-screen moment now drops straight down instead of sliding down and to the left across whatever is behind it.',
  ] },
  { n: 404, date: '2026-08-18', title: 'The Bone Garden closes, and the Boneyard feeds the Kitchen instead', items: [
    'Ingredients now come off the map. There are far more things to find out there, each worth a little less, so a walk turns up more without handing you more coins.',
    'The Boneyard looks the way it should: about three times as many finds on screen at once.',
    'The Kitchen stands on its own. It tells you where ingredients come from and takes you straight there.',
    'If you bought garden beds you get every coin back, and your seeds and half-grown crops convert into ingredients you can actually cook with.',
    'Crates hand out a little less gear and a few more colourways, so the good stuff stays worth finding.',
  ] },
  { n: 403, date: '2026-08-18', title: 'Holding down anywhere in the app no longer highlights text', items: [
    'Press and hold on any label, button or card and you get nothing, instead of the iPhone magnifier and a blue highlight.',
    'Your recovery code and every text box still work exactly as before, so you can still copy the code that restores your save.',
  ] },
  { n: 402, date: '2026-08-18', title: 'Holding a Pit move no longer brings up the iPhone magnifier', items: [
    'Press and hold a move and you get the move detail, not the text-selection loupe and highlight.',
  ] },
  { n: 401, date: '2026-08-18', title: 'Press and hold a move in the Pit to read what it really does', items: [
    'Hold any move for a moment and the full description opens, instead of the short line that had to fit on the button.',
    'Screen readers now read the same description straight after the move name, with no gesture at all.',
  ] },
  { n: 400, date: '2026-08-18', title: 'More of your moves fit on screen in the Pit, and the rewards are drawn', items: [
    "<b>The move buttons in the Pit say the same thing in fewer words, so more of them fit.</b> Every move hint used to run long enough to wrap onto a second and sometimes a third line, which made each button tall and pushed the rest of the tray off the bottom. The hints are shorter now and sit on one line, so the buttons are shorter and you see more of your moves without scrolling. On a normal phone the tray goes from six moves visible to eight, and three rows fit where two did. <b>The smallest phones are not changed by this.</b> On a 320 wide screen the labels still wrap and you still scroll to reach every move; there is not enough width to fix it there without making the text too small to read. Every button is still comfortably above the size a thumb needs.",
    "<b>The level-up screen shows the real artwork for what you earned.</b> Your coins, bone dust and crate were still being drawn as flat shapes on that one screen while the rest of the game had moved to the drawn set, so the moment you level up was the moment the game looked oldest. They are the drawn artwork now, and a rare crate gets a glow behind it that matches its rarity.",
    "<b>All six common cooking ingredients are drawn.</b> Marrow, Graveroot, Ember Pepper, Bog Mushroom, Sinew and Grave Salt each have their own drawn artwork now instead of a generic symbol, so your ingredient list reads at a glance. Ectoplasm already had its own. Where the game lists ingredients very small, next to a line of text, it still uses the simple shape, because the drawn art does not stay readable at that size.",
  ] },
  { n: 399, date: '2026-08-18', title: 'More room for your moves in the Pit, and more drawn artwork', items: [
    "<b>The fight picture is shorter so the move buttons get more room.</b> Picking a move meant scrolling a cramped strip at the bottom of the screen, especially once you had talents and brewed potions to choose from. The arena now gives up 48 pixels and the move tray takes them: on a taller phone the tray goes from about 160 to about 208 pixels, which is two more buttons visible before you have to scroll. <b>Small phones are unchanged.</b> On a 320 or 375 wide screen the fight picture is already at its minimum height and cannot shrink further, so there is nothing to hand over and those screens look exactly as they did.",
    "<b>Four more drawn icons.</b> The Battle Charm is gold now instead of silver, and the Stable and Kitchen doors on Today are drawn artwork instead of flat shapes. Ectoplasm, the rare cooking ingredient, is drawn too, so it looks like the rare thing it is wherever your ingredients are listed.",
  ] },
  { n: 398, date: '2026-08-18', title: 'Winding the clock forward no longer farms daily rewards', items: [
    "<b>Setting your phone's clock forward used to hand you a fresh day's rewards every time, over and over.</b> The wheel, the day-close crate, the daily quests and your free Pit fights all read the device clock, so jumping a day ahead paid out a full day, and you could keep doing it. The game now remembers the furthest date it has ever seen from our servers and will not open a day more than a week past it. Wind the clock forward and you get a week at most, once, and then it stops: the reward days you skipped are spent, not banked.",
    "<b>Playing offline is untouched.</b> A week away with no signal still plays normally, and going back further only pauses the daily rewards. Logging food, the shop and the Pit keep working the whole time, and everything comes back the moment you next open the app with a connection.",
  ] },
  { n: 397, date: '2026-08-17', title: 'The daily wheel gets the drawn coins, and Backpack is called Backpack', items: [
    "<b>The daily spin wheel is showing the drawn coins and Battle Charm now.</b> It had its own set of icons and never got the new artwork, so the wheel was the last screen still paying you in flat vector shapes. The prize you win is drawn bigger on the reveal too. The two crate wedges keep their old icons on purpose: the wheel tells the Common Crate and the Golden Crate apart by colour, and there is only one drawn crate.",
    "<b>The Character tile on Today is called Backpack, and it opens your Backpack.</b> Tapping your Bonehead already went there; this tile went to the Wardrobe instead, so the same screen opened on two different tabs depending on where you pressed. Both go to the Backpack now, and the tile shows a crate with your unopened count on it.",
  ] },
  { n: 396, date: '2026-08-17', title: 'Your Looks collection is reachable again', items: [
    "<b>The Looks collection was briefly unreachable, and it is back.</b> The last update tidied the Bonehead screen down to four tabs and took the Looks card off it. That card was the only way in, so for a few hours there was no way to open your collection at all. Nothing in it was lost or changed while it was hidden.",
    "<b>It opens from the Wardrobe now.</b> There is a pill at the top of the Wardrobe showing how many looks you have collected out of how many exist. Tap it for the full collection, the same one as before, with the locked pieces still kept a surprise.",
  ] },
  { n: 395, date: '2026-08-17', title: 'Hand-drawn icons, and a tidier Bonehead screen', items: [
    "<b>The coins, bone dust, crates, eggs, charms and draughts are hand-drawn pixel art now.</b> They used to be flat vector shapes. Same things, properly drawn, and they hold their crisp edges at every size the game uses them at.",
    "<b>The Bonehead tabs got the same treatment.</b> Wardrobe, Backpack, Shop and Build each have their own drawn icon instead of a generic symbol, so you can find the one you want without reading.",
    "<b>The Bonehead screen has four tabs instead of six.</b> Level and Looks were taking up space for things you rarely went looking for. Your collection lives in the Wardrobe, next to transmog, which is where you were already going to find it. Nothing was removed from the game, only from that row.",
  ] },
  { n: 394, date: '2026-08-17', title: 'Two tabs can no longer be paid twice for the same reward', items: [
    "<b>With the game open in two places at once, the same reward could be handed over twice.</b> Both copies asked whether it was still waiting, both were told yes, and both paid it out. Claiming a reward is now a single step instead of a look followed by a grab, so exactly one of them wins it and the other gets nothing. Crates, eggs, codes, tributes, harvests, dishes, level rewards, badges and streaks all go through it.",
    "<b>Opening the app is quick again if you have been logging for a long time.</b> The first open after an update worked through your entire history before it would show you anything, and on a slow phone it could give up part way and start again from the beginning. It puts the app on screen first now and catches up in the background, remembering how far it got, so closing the app mid-way no longer throws that work away.",
  ] },
  { n: 393, date: '2026-08-17', title: 'The Hollow music no longer restarts every time you tap', items: [
    "<b>The garden music started over from the beginning every time you touched anything.</b> Planting, watering, harvesting, all of it reset the track. It plays straight through now, and stops when you leave the Hollow.",
    "<b>It is also quieter.</b> The volume was never set, so it played at full blast. It sits under the game now instead of on top of it.",
  ] },
  { n: 392, date: '2026-08-17', title: 'The Hollow has music', items: [
    "<b>The Hollow has a soundtrack now, and it starts muted.</b> There is a speaker button in the top corner of the garden; the first time you visit it gently pulses to tell you it is there. Tap it and the music plays and keeps playing on every visit after. Leave it alone and you will never hear a thing.",
  ] },
  { n: 391, date: '2026-08-17', title: 'One missing file can no longer take the app down', items: [
    "<b>If a single file went missing while an update was being published, the app could open to nothing at all, but only if you were online.</b> Offline it was fine, which is the odd part: the app asked for the file, got an error back, and handed that error to the page instead of using the good copy already saved on your device. It falls back to the saved copy now, so one bad file during a release cannot take everything down.",
    "<b>\"Update ready. Leave this screen to apply\" now actually applies it.</b> Closing the screen did nothing, so you kept running the old version until something else happened to reload it.",
  ] },
  { n: 390, date: '2026-08-17', title: 'The crate finishes opening before it leaves', items: [
    "<b>The last frame of the crate opening was being cut off, worst on the first crate you opened.</b> The frames were timed from the moment their artwork finished loading, while the crate's exit was timed from the moment the reveal opened. Two different clocks, and the gap between them came out of the ending. On a phone loading nine frames that was enough to start the crate disappearing while it was still opening. Both crates now hold on their final frame before they go.",
    "<b>Opening the Boneyard with no signal threw an error behind the polite message.</b> You got the \"needs a network signal\" screen and a broken page underneath it. Now you just get the message and a Retry button.",
    "<b>On a short phone the End Turn button is pinned instead of the fighters being shrunk.</b> The Pit was squeezing the characters to make room for the buttons; now the button stays put and the tray scrolls.",
    "<b>Notifications actually obey the setting you chose,</b> instead of only recording it.",
    "<b>On some browsers the tab bar could end up far below the bottom of the screen.</b> A newer sizing unit was used with no fallback, so a browser that does not understand it dropped the rule entirely and the page grew instead of fitting.",
    "<b>Erase all data now clears your gear too.</b> It was leaving the inventory behind, so a wipe was not a full wipe.",
  ] },
  { n: 389, date: '2026-08-17', title: 'The Golden Crate is real artwork too', items: [
    "<b>The Golden Crate opens as a hand-drawn bone chest with a green flame.</b> Closed, then open with the gold, then open with the gems inside. The same treatment the Common Crate got, on the rarer one.",
    "<b>The old crate icons are gone from your Backpack.</b> Both chest tiles and the Backpack tab itself show the real artwork now instead of the flat placeholder icons. The Step Egg keeps its old icon on purpose: the drawing loses its speckle at that size and just reads as a grey pebble.",
    "<b>A correction to the last update.</b> v388 said the crate clears the screen before your card arrives. It did not. One line of styling was quietly cancelling another, so the chest was still dissolving for most of a second after the card was already in front of it. That is genuinely fixed now, on both crates.",
    "<b>Gifts and prizes could pay out more than once.</b> If a gift, a step-race prize or a make-good reached your device a second time, after a restore, a reinstall or an interrupted sync, it paid again. Anything already in your ledger is recognised now and never pays twice.",
    "<b>The Step Egg's hatch frames are stored on your device up front,</b> so the animation no longer fetches them off the network while it is playing.",
  ] },
  { n: 388, date: '2026-08-16', title: 'The Step Egg actually hatches now', items: [
    "<b>The Step Egg hatch was drawing all fifteen of its frames at once, stacked down the screen.</b> It should crack in place, one frame at a time, and end on the shell pieces and the smoke. It does now. The egg is also about twice the size it was and sits where your new pet appears, instead of small and high up and then jumping.",
    "<b>The Common Crate opens as real artwork instead of a cut-in-half icon.</b> Nine hand-drawn frames of the lid cracking and the ghost climbing out, timed to what each frame actually shows rather than spread evenly, and the crate now clears the screen before your card arrives instead of dissolving behind it.",
    'Its sound effects were more than a second out of step with the picture and have been since August. The thud, the lid and the card all land on the right moment now.',
  ] },
  { n: 387, date: '2026-08-16', title: 'Daily limits on the things you can repeat', items: [
    "<b>Pit wins, harvests, cooking and breaking a siege now have a daily limit.</b> They had none, so those four kept paying out however many times you did them, which made the ladder something to grind rather than climb. Twelve Pit wins, ten harvests, eight cooks and five siege breaks a day, sized so a long session is still well worth playing. Levels themselves are not capped and never will be.",
  ] },
  { n: 386, date: '2026-08-16', title: 'The health bars were sitting on the boss', items: [
    "<b>The health bars were drawn ON TOP of the fighters, not beside them.</b> On a smaller phone that meant the boss lost his head and hood behind them, and on the smallest phones he was rendering outside the fight area altogether. The bars have their own row now, so the arena is all scene. Measured on five phone sizes: nothing is covered on any of them.",
    "<b>\"Just essentials\" notifications did nothing.</b> It wrote exactly the same settings as \"Everything\", so the two buttons were the same button with different labels. Essentials now means what it says.",
    "<b>Redeeming a pet code for a pet you already own</b> used to show the same message as a brand new one, so you could not tell what had happened. It stacks a second copy and tells you plainly.",
    "<b>Backing up and restoring could duplicate your things.</b> A restore put your old save back on top of the current one instead of replacing it, so anything you bought after the backup stayed while the coins that paid for it came back. Restoring now replaces, and a damaged backup file still leaves your existing save untouched.",
    'A fight-screen check and a strike-animation check were both passing when they should not have been. One of them was grading the live site instead of the build being tested.',
  ] },
  { n: 385, date: '2026-08-16', title: 'Boss dens raise your ceiling again', items: [
    "<b>Beating a boss den raises your Gauntlet ceiling again, and this time it is actually fixed.</b> The boss standing in a den changes every week, but the game was remembering the SPOT you had beaten rather than the boss you beat there. So once you had cleared the dens near you, every new boss that turned up in those same spots counted for nothing, no matter how many you killed. If you fight close to home, you were frozen. That is the whole reason this kept coming back after being called fixed: the roaming and remote bosses were sorted a while ago and the ordinary map dens, the ones almost everyone fights, were not.",
    "<b>Every clear it swallowed has been given back.</b> The app can still see which dens you beat and when, so it recounts them the next time you open it and tells you how many ranks it restored. You do not need to go and re-fight anything.",
    "<b>Five held items sat on your Bonehead's face.</b> One banner covered nearly three quarters of it, so anyone who equipped it lost their head behind it. All five have moved, and every held item in the game is now checked automatically so this cannot happen again.",
    "<b>You can line up a second cook.</b> The Kitchen only ever allowed one start per pot per visit, which meant most of what you grew had nowhere to go. Composting is sorted by what your recipes are short of now.",
    'New players start with a few seeds, and everyone already playing gets the same handful.',
    'Some quiet work in the Bone Garden. It is still being worked on.',
  ] },
  { n: 384, date: '2026-08-16', title: 'The fight buttons hold their own words again', items: [
    "<b>Move buttons were cutting their own text off.</b> A button with two lines of description was being squashed to one line's height, so the rest of the sentence fell out the bottom and landed on the row below. It came in with yesterday's change that stopped the fighters resizing, and it hit four of the nine buttons on most phones and six of nine on a small one.",
    "<b>The ITEMS button could not be tapped at all.</b> It was sitting below the bottom of the button area, and nothing on screen said that area could scroll. There is a soft fade at the bottom edge now whenever there is more below, so you can see there is somewhere to go.",
    'The fighters still hold their size. That part was the point of the original change and it has not moved.',
    "<b>A bad link can no longer leave you on a blank screen.</b> A stray % in the address could stop the app starting at all, and because the address stuck around, reloading did not help. It now shrugs it off.",
    "<b>Saving a new name no longer freezes the button</b> if your connection drops halfway. It tells you it failed and lets you try again.",
  ] },
  { n: 383, date: '2026-08-16', title: 'Beating a spire takes you to the spire', items: [
    "<b>Winning a tower used to hand you back the button that starts the fight.</b> You beat the warden, tapped Done, and landed on a sheet still offering you the warden, because that sheet was drawn before you won. The same thing had already been fixed once for the Glutton and only for the Glutton. It is fixed for every kind of fight now, in the one place they all pass through, and a new kind of fight cannot be added without saying where a win puts you.",
    'The button after a spire fight also said "Back to The Pit" when you had come from the map.',
    "A dormant spire stops telling you it has never been taken when you are the one who took it.",
    "The Boneyard only opens the map when you actually asked for it, instead of starting it up behind you.",
    'A news story stops re-opening itself on top of wherever it just sent you.',
    'The fighters stay put when the buttons under them change size.',
    'If the app ever opens to a blank screen it now waits a little longer before deciding it is stuck, and it still only ever reloads itself once.',
  ] },
  { n: 382, date: '2026-08-15', title: 'Logging your food no longer earns you fights', items: [
    "<b>Logging a meal used to give you Pit energy.</b> It shouldn't have. It put a reward on what your food diary looks like rather than on what you actually ate, and this app should never have an opinion about that. Energy now comes from walking, from Vigor Draughts, and from the three free fights everyone gets every day.",
    'New players now find a Vigor Draught in their welcome kit, so a first day without a walk is still a first day with fights.',
    'Any Vigor you have already banked is untouched.',
  ] },
  { n: 381, date: '2026-08-15', title: 'A door into the Paddock, and eight things you told us about', items: [
    "<b>The Stable now opens with a window onto the Paddock.</b> Your own Bonehead is standing at the fence with your two rarest pets, and tapping it takes you out to the field. This was picked, built and then quietly lost in the queue for twelve builds.",
    "<b>Sending coins takes two taps now.</b> One tap used to send up to 500 coins to another player with no undo and no confirmation.",
    'The Bonehead tab is headed with your name, which you have had since the start and never saw anywhere.',
    'Gauntlet fights past rank 50 use the real monster art. Above rank 50 it was drawing none of it.',
    'Beating the Glutton raises the ceiling in The Pit, the same as any other win.',
    "The mage's creature stops hanging off the edge of the arena on a small phone, and the fighters stop resizing when the buttons change.",
    'The Discord row in News draws its art instead of an emoji, and there is a thank-you card for everyone playing early, with the invite link to pass on.',
  ] },
  { n: 380, date: '2026-08-15', title: 'The step race result really does show twice now', items: [
    "The last update said the results card would appear on your first two opens. It shipped showing once, which is the thing it was meant to fix. It shows twice now.",
  ] },
  { n: 379, date: '2026-08-15', title: 'The Crew tab stops running your phone out of memory', items: [
    "<b>Opening Crew with a lot of friends could kill the app outright.</b> Every friend's Bonehead was being drawn at full size, so a big crew was asking your phone for well over a gigabyte of image data before you had even scrolled. Everything now uses art sized for the space it is drawn in. Nothing looks different; it just survives.",
    'The same fix reaches the Collection shelf, the melt bench, the wardrobe, the leaderboard and Today.',
    "<b>Breeding is reachable again.</b> The breed button sat under a bar you could not scroll past, and swiping the panel did nothing. That was our own doing: a fix for a different problem put the extra room on the wrong side of the bar.",
    'Three mouth items were drawn against the wrong part of the skull, so they sat off the teeth. Re-registered against Cam\'s originals.',
  ] },
  { n: 378, date: '2026-08-14', title: 'A failed cloud restore no longer costs you the restore', items: [
    "<b>If restoring your save from the cloud failed, the app said nothing and never tried again.</b> One bad moment on the network was enough to use up your only automatic restore while a perfectly good backup sat on the server. It now tells you when a restore fails, and it will try again next time you open the app.",
  ] },
  { n: 377, date: '2026-08-14', title: 'The results card, where you can actually see it', items: [
    'The step race result now shows on your first two opens instead of one, because it was easy to miss it entirely behind the other cards.',
    'It also stops saying a new race starts next week. The next race is already running and you are already in it.',
  ] },
  { n: 376, date: '2026-08-14', title: 'The first step race has a winner', items: [
    "<b>Bony Wrecker took the first step race with 115,084 steps.</b> The full result is on Today: all five places, what each of them walked, and exactly what they were paid. Nobody got within eleven thousand steps of first.",
    'Every prize was already in your Deliveries the day it settled. This is the announcement, not the payout.',
    'The rank bars now get quieter as you go down the podium, so the winner reads as the winner.',
  ] },
  { n: 375, date: '2026-08-14', title: 'The leaderboard crash, properly this time', items: [
    "<b>Scrolling the leaderboard still crashed the Crew tab, and the fix two days ago was only half of one.</b> Heads loaded as you reached them but never unloaded, so opening the board looked fine and scrolling to the bottom ended up drawing every player at once, which is the thing that was killing the page. The board now only ever holds the handful of heads you can actually see.",
  ] },
  { n: 374, date: '2026-08-13', title: 'Restoring a backup can no longer half-work', items: [
    "<b>This is the important one.</b> Restoring a backup wrote your save one row at a time, so if it was interrupted partway (a reload, the app going to the background, a full phone) you were left with a mix of the old save and the new one, and nothing said so. A restore now either completes entirely or changes nothing at all, and it tells you which.",
    '<b>The app no longer opens to a blank screen</b> if you left it in the background while it was starting. The reveal was waiting for a frame that never came.',
    'Your first fight cannot be lost. It is the one that teaches you how fighting works, and some players were losing it and never coming back.',
    'Beating a roaming boss raises the ceiling in The Pit, the same as any other win. It used to count for nothing.',
    'The first session says more: what to log first, how many fights are waiting, and a word of confirmation when a meal lands.',
  ] },
  { n: 373, date: '2026-08-13', title: 'The leaderboard stops killing the Crew tab', items: [
    "<b>Opening the leaderboard used to blank the Crew tab and bounce you back.</b> Every row was drawing a full-size Bonehead, a hundred of them at once, and your phone was running out of memory and killing the page. Heads now load as you scroll to them. Nothing about the board looks different, it just survives being opened.",
    'A Crew FAVES skull that failed to load stayed blank forever. It retries now, and draws a plain plate if it still cannot.',
    '<b>The Bone Boiz strip sits at the top of Crew</b>, so the Discord is there whenever you want it, not only in the card that pops up.',
    'The Boneyard is quick off the mark again. Yesterday it waited for the whole map before showing you anything.',
    "<b>You can see the boss you are fighting.</b> Potions were one button each, so a player who cooks had ten buttons and a third of a screen. They live behind one ITEMS door now.",
  ] },
  { n: 372, date: '2026-08-13', title: 'Four things that were quietly annoying', items: [
    '<b>The Backpack opens at the top again.</b> It had been jumping straight down to the Salvage Bench every time you opened it, and again after every crate.',
    '<b>You can see what you are transmogging.</b> Wardrobe tiles drew the raw artwork, most of which is empty space, so the item itself was a speck in the corner. Your crew FAVES chips had the same problem.',
    'Beating The Glutton and tapping Done puts you back on the Boneyard. You used to land under his card and have to close it by hand.',
    'The result of a den fight now rises into place with the arena closing, instead of appearing at the bottom of the screen and lurching upward.',
  ] },
  { n: 371, date: '2026-08-12', title: 'The Boneyard settles before you look at it', items: [
    "<b>Dens no longer appear after the map has already settled.</b> A placement pass ran before the map's tiles had loaded, so anything that needed real ground to stand on was placed late and popped in on top of a map you were already reading. The reveal now waits for ground it can actually place against.",
    'The Bone Boiz card shows the Discord app icon with your own Bonehead leaning on it, so you can tell at a glance what you are being invited to.',
  ] },
  { n: 370, date: '2026-08-12', title: 'The first screen was invisible', items: [
    "<b>If you were brand new and the app opened blank, this was why.</b> The welcome screen was being built correctly and then drawn at zero opacity, so there was nothing to tap and no way past it. It is visible now.",
    'The app could also open blank on a weak connection, for anyone. Three files it needs to start were missing from the list it saves for offline use, and one of them failing to arrive stopped everything. All of them are saved now, and a check refuses to let the list fall behind again.',
  ] },
  /* The v367 entry originally claimed the shared-pet-names-and-hearts bug was
     fixed. Telemetry says the repair we shipped has never once run on any device,
     so it addresses something nobody actually has, and the real cause is still
     open. The claim has been removed from that entry rather than left to be
     discovered as untrue, and it is stated plainly here. */
  { n: 369, date: '2026-08-11', title: 'The archway shows the right monster', items: [
    'The boss that rises from the archway before a fight is now the boss you actually fight. It used to be whatever the ladder felt like showing.',
    "<b>Still chasing:</b> pets sharing names and hearts. We shipped a repair for it yesterday and the telemetry proves that repair has never run on a single device, which means the cause is something other than what we thought. It is not fixed, and we would rather say so than let you find out.",
  ] },
  { n: 368, date: '2026-08-11', title: 'The Pit keeps up with you', items: [
    "<b>Beat a boss and The Pit now notices.</b> Your win and your raised ceiling were always recorded, but the screen behind the fight never re-read them, so a boss you had just beaten still offered you the fight. Nothing was lost: it was the view that was stale.",
    'Bonding with a pet gives it <b>hearts</b>. They were five red dots, which is not the same thing.',
    'A pet card closes whichever way you reach for it: the × on the card, a tap on the field behind it, or tapping the same pet again. And it still works on your second visit.',
    'Your pets fill their frames, on the card and in the collection shelf. They were drawn small and tucked into the corner of every box.',
  ] },
  { n: 367, date: '2026-08-11', title: 'Ducks fly on their own schedule', items: [
    'Ducks no longer fly in lockstep: they set off at their own moment and at their own pace.',
    "<b>The keeper in the Paddock is you.</b> Your own bonehead, wearing what you are wearing, standing at the gate.",
    'And something in the bushes now hints at a shiny you have never seen, instead of one already in your Stable.',
  ] },
  { n: 366, date: '2026-08-11', title: 'Melting, out in the open', items: [
    "<b>The Salvage Bench tells you what you're sitting on.</b> How many spare pieces you own and what they're worth in Bone Dust, before you tap anything. It used to be a closed panel three screens deep.",
    "It opens itself when you actually have spares, and the pieces you're not wearing now read as the live controls they always were. The one you're wearing still asks twice.",
    "<b>Every gear slot offers a look now</b>, including one holding a plain cosmetic. There are no stats to protect in that case, so switching there is <b>free</b>.",
    "Nothing about melting changed: every piece in the game always paid real dust, and it keeps its look forever either way.",
  ] },
  { n: 364, date: '2026-08-11', title: "Today's herd", items: [
    'The Paddock keeps its distance from the graveyard: pets standing behind the tombstone no longer walk through it.',
    "If you own more pets than the field can hold, they take turns. Eight are out there on any given day and the herd changes over with the rest of your day, so a big collection is something to come back to rather than a crowd.",
  ] },
  { n: 362, date: '2026-08-11', title: 'The Paddock', items: [
    'Every pet you own, out in one haunted field together, wandering. Not a list: a place. Reach it from the Stable.',
    'Tap any of them for its own card: level, bond, lineage, where it came from.',
    'Your spares are out there too, so the ones sitting in the Stable finally have somewhere to be.',
  ] },
  { n: 361, date: '2026-08-10', title: 'The new-cosmetics popup actually shows up', items: [
    "The <b>63 new cosmetics</b> announcement was supposed to appear on your first ten app opens and never did: it crashed before it could draw, silently, every time. It works now, and your ten openings start from here.",
  ] },
  { n: 360, date: '2026-08-10', title: 'The Stable explains itself', items: [
    'A <b>How pets work</b> sheet in the Stable: levelling, talents, what breeding actually does, when it stops being worth it, and what a shiny is. Short.',
    'Picking a pet to breed now tells you what to do next, from the top of the screen instead of from a panel sitting over the button it is telling you to press.',
    "Today's card: every row is the same size with the same dividers.",
  ] },
  { n: 359, date: '2026-08-10', title: 'A dozen fixes', items: [
    "<b>The Live Wire fights with his own lightning.</b> Cam drew the bolts as separate layers and none of them were being used. They are his moves now: the fork he throws at you, the arc he tears across the floor, the strike he calls up, and the sparks when his amulet breaks.",
    "<b>Two enemies now read as two enemies.</b> His creature is drawn solid instead of washed out and stands clear of him, anything you have already beaten drops on the spot instead of standing there looking alive, and whichever one is left flares so you know the fight is not over.",
    "<b>The screen after a fight.</b> No more empty half-screen above your winnings.",
    "<b>Chests.</b> Tap anywhere to move to the next card, not just on the card itself, and the deck behind it no longer looks like a card that failed to load.",
    "<b>Eggs hatch where you left them</b> instead of shooting off the bottom of the screen.",
    "<b>Tap any bar in your history</b> for that day's number. Every metric, every window, not just steps on the Trends page.",
    "<b>Today counts toward your step averages now</b>, weighted by how much of a normal day's walking has actually happened, so a big morning shows up straight away without pretending the day is over.",
    "<b>Steps update while you watch</b> instead of only when you reopen the screen.",
    "<b>The Stable</b> tells you what to do after you pick the first pet to breed, closes a pet's talents when you swipe to another one, and scrolls without stuttering.",
    "<b>Today's hunt</b> is the same size as everything else on the card, and tapping it opens the Bestiary again.",
  ] },
  { n: 358, date: '2026-08-10', title: 'The Live Wire can be beaten again', items: [
    '<b>Fixed:</b> the Live Wire was unkillable in the Pit. What he raised out of the floor had no body you could hit, so once his health hit zero the fight had nothing left to end it and ran on until it timed out as a draw. He raises a bone minion now, the same way the Necromancer does, and the fight ends when he drops.',
    'Bosses past rung 50 have faces again. The Gauntlet ran out of names at the sixth cycle and everything after it turned into a random skeleton in random clothes. There is a whole second cast down there now.',
    'Half the boss dens on your map are the Live Wire while he is the new thing. Nothing marks them: you find out when you get there.',
  ] },
  { n: 357, date: '2026-08-10', title: 'The map stops spoiling the surprise', items: [
    'Boss dens all look like boss dens again. One of them belongs to the Live Wire and nothing on the map will tell you which: you find out when you walk up to it.',
    "The daily remote den now says when you have beaten it, instead of offering you a pointless re-fight. It always counted toward the Gauntlet's ceiling, it just never said so.",
  ] },
  { n: 356, date: '2026-08-10', title: 'The roaming monsters look like monsters', items: [
    'The mini-bosses you walk to on the Boneyard never had faces. A Marsh Ghoul and a Cinder Shade were the same starter skeleton with random cosmetics thrown on. Each one is drawn from its own bloodline now, so what the name promises is what steps out.',
  ] },
  { n: 355, date: '2026-08-09', title: 'Everything has a name now', items: [
    'The last 258 cosmetics were still called things like "Tidy Backdrop #1". They all have real names, read off each one worn on an actual Bonehead rather than guessed from the icon.',
  ] },
  { n: 354, date: '2026-08-09', title: 'The Live Wire fights like himself', items: [
    'He is nearly twice your size now and he floats, which is what a boss should look like. He was the same size as you, which was a mistake.',
    'He has his own moves: a bolt that goes straight through armour, a wail that stops your wounds closing, something he calls up out of the floor, and a reap that hits harder the more stamina you are sitting on.',
    '<b>The amulet on his chest is the way in.</b> Land a crit and it shatters, and he can never wail or raise the dead again for the rest of that fight.',
  ] },
  { n: 353, date: '2026-08-09', title: 'The Live Wire', items: [
    'A new boss, drawn by hand rather than dressed up out of cosmetics. A quarter of the boss dens on your map are his, and they stay his: go back next week and he is still standing there.',
    'He holds every seventh rung of the Gauntlet too, and some days he is the remote den.',
    "Today's hunt shows the monster properly now, instead of a thumbnail next to a paragraph you had to open.",
  ] },
  { n: 352, date: '2026-08-09', title: 'The fight screen holds still', items: [
    'The buttons no longer slide up and down between turns. End Turn is pinned in one place and stays there for the whole fight.',
    'The Bestiary is a teaser again, not a list. Meeting something new in the Pit should be a surprise, so there is no page that shows you the whole cast in advance.',
  ] },
  { n: 351, date: '2026-08-09', title: 'Catching up on News', items: [
    'Reading an announcement in <b>News</b> puts you back on the News list when you close it, so you can go through them one after another.',
  ] },
  { n: 350, date: '2026-08-09', title: 'There is an actual Bestiary now', items: [
    "Open <b>Out hunting today</b> and tap <b>See the whole Bestiary</b>: every monster the Boneyard can put in front of you, grouped by bloodline, with today's marked.",
    'The Pit ladder, the Champion and the Gauntlet are in there by name. The rest are grouped by where the ground keeps them.',
  ] },
  { n: 349, date: '2026-08-09', title: 'Fixes', items: [
    "The <b>News</b> list no longer breaks when you open something from it. Tapping an announcement used to leave the list stranded underneath, and everything after it did nothing.",
    'Every News row shows the <b>right artwork</b> now. Two of them were rendering as empty boxes.',
    "<b>Today's monster</b> is actually visible on the hunting row instead of a 30px speck.",
  ] },
  { n: 348, date: '2026-08-09', title: 'Everything out there has a face now', items: [
    'The things you fight are not nameless skeletons any more. <b>56 monsters</b> across eight bloodlines: bog, cinder, crypt, demon, flesh, deep, iron and worse.',
    'Every <b>den, tower and Pit rung</b> now shows a real monster, and the ground decides which one. The marsh keeps drowned things; the crypt keeps buried ones.',
    'World bosses <b>rotate daily</b>, and your whole Crew meets the same one you do.',
    'Fixed: anything you held in your <b>off hand</b> could draw across your own face. Raised shovels, banners and toothbrushes now sit behind your head where they belong.',
  ] },
  { n: 347, date: '2026-08-09', title: 'Catch up on anything you missed', items: [
    "What's New has a <b>News</b> tab now. Every announcement the game has ever popped up lives there, artwork and all, so if you swiped one away mid-walk you can go back and read it.",
  ] },
  { n: 345, date: '2026-08-09', title: 'The Pit uses your whole screen', items: [
    'The <b>arena is more than twice as tall</b>. It was a letterbox with 388px of dead screen under the buttons; now it takes the room, and bosses have somewhere to stand.',
    '<b>Boneheadz are bigger</b> in a fight, so a normal-sized foe no longer leaves the frame feeling empty.',
    'Drinking a potion mid-fight takes <b>two taps</b>. One arms it, the second drinks it, so a stray thumb no longer costs you a brew and an action point.',
    "Your <b>pet's health bar</b> was rendering at zero pixels tall, which is why it always looked empty. It was never empty.",
  ] },
  { n: 344, date: '2026-08-09', title: 'The podium is back', items: [
    'The <b>top three</b> are on the Crew tab again, full bodies on a podium, biggest in the middle. Tap the card for the full list.',
  ] },
  { n: 343, date: '2026-08-09', title: '32 new things to hold and wear', items: [
    '<b>25 new hands</b>: katanas, daggers, hockey sticks, shovels, banners, bouquets, a fishing rod, a flail, and a couple of things you should probably not be holding.',
    'Blades now come in <b>both hands</b>. Katanas in the raised hand, daggers in the low one.',
    '<b>7 new headbands</b>, including two in the team colours.',
    'Every one of them has a real name, not a number.',
  ] },
  { n: 342, date: '2026-08-09', title: 'Out there today, tidied', items: [
    'The <b>new cosmetics</b> are back on Today. A ripe crop in the Bone Garden used to take their place, so if you were growing anything you never saw the drop at all.',
    'The <b>Puffer Pack</b> and <b>Glutton</b> banners are gone from Today. The Glutton is out on the map where you find him, not on a card advertising himself every morning.',
  ] },
  { n: 341, date: '2026-08-08', title: '63 new cosmetics, live now', items: [
    'The new cosmetics have <b>real names</b> now, so you can tell a Gold Halo from a Party Cone in your wardrobe.',
    'Boss dens with <b>two enemies</b> show a proper health bar for the second one. It was rendering at zero height, so there was nothing to see.',
    'Opening a crate: <b>tap actually works</b> now. A tap that drifted a few pixels used to do nothing at all.',
    '<b>63 new cosmetics</b> just landed: 24 lids, 23 pairs of eyes, 13 mouths and 3 grillz. Every crate can drop them.',
    'The <b>leaderboard</b> shows your Bonehead properly now, with the rank up front, and everyone sits in one list.',
    '<b>The Glutton</b> has come to the Gauntlet. He turns up every 10 rungs as a proper gear check, and losing to him costs nothing more than any other loss.',
    'The Stable stopped stuttering when you first open it and scroll.',
  ] },
  /* ONE ENTRY FOR THE WHOLE DAY. Tom, 2026-08-08: "condense all patch notes over
     the last 24 hours because we've pushed a lot of updates, TLDR the users."
     Thirty-nine separate entries shipped in a day, which is a build log, not a
     what's-new: nobody reads it and the unseen badge screams 39. Collapsed to one
     entry grouped by what a player would actually notice. The build numbers those
     entries carried only ever fed the "new since you last looked" dot, so nothing
     is lost by folding them into the highest one. */
  { n: 333, date: '2026-08-08', title: 'A big day: new Stable, new Crew, better crates', items: [
    '<b>The Stable is a carousel.</b> Your pets sit on a turning ring, one in front with its stats and buttons underneath. Flick or tap to move between them. The cloud and both lizards are animated, and every card is tinted by how rare the pet is.',
    '<b>The Crew tab is a hand of cards.</b> Your friends fan out as trading cards. Star your favourites to pull them to the front, online friends come next, and you can search by name or by a nickname you gave them.',
    '<b>Crates actually crack open.</b> The crate lands, the lid blows off, light climbs out and your card rises out of the box. The rarest thing you got now comes out <b>first</b>. Tap or swipe each card away to see the next.',
    '<b>Levelling up is a moment.</b> A burst blooms behind your bonehead, the level steps up, and the XP bar races to full and lands on what you carried into the new level.',
    '<b>Boss dens move every week</b>, and the Boneyard keeps loading as you look around instead of only showing what is near your feet. Dens, spires and the Glutton also got the roomier 80m reach.',
    '<b>Ectoplasm is worth something.</b> Two new potions that are the strongest things you can drink, and the Necromancer\'s Feast is no longer a worse deal than just cooking two ordinary dishes.',
    '<b>Names are one-of-a-kind now</b>, and boss and Glutton loot is rolled for <b>you</b> rather than everyone getting the same drop. Map pickups no longer hand out the same few ingredients forever.',
    '<b>The catfish is animated.</b> He swims, and the bead on his whisker moves with him. <b>Shiny pets now animate too</b> instead of standing still while their ordinary twin moves.',
    '<b>The Glutton has come to the Gauntlet.</b> He turns up every 10 rungs of the endless ladder as a proper gear check. Losing to him costs nothing more than any other loss.',
    '<b>Every screen loads before it appears</b>, so tabs arrive in one piece instead of assembling themselves in front of you.',
    'Plus a long list of fixes: eggs that would not hatch, the step race showing wrong totals, boss dens you could beat twice, the Today card, and a lot of small ones.',
  ] },

  { n: 279, date: '2026-08-07', title: 'Squashing day', items: [
    '<b>The Boneyard behaves.</b> Spawns no longer flash over water while you pan, Dark Spires stand on reachable ground like everything else, and the dead space at the top of the map on newer iPhones is gone.',
    '<b>Fights look right.</b> A slow connection can no longer leave a broken-image box sitting on top of a fighter, and the health bars hold their place no matter how long an enemy\'s name is.',
    '<b>Friends look right.</b> A crewmate\'s shiny pet now shows off its colours everywhere: their card, their profile, and the leaderboard.',
    'The leaderboard now lists <b>real players only</b>: installs that never finished setup no longer pad it out as level-1 ghosts.',
    'Small fixes: the confirm step when spending dust is readable now, the protein goal check draws properly, and the skull in the Wardrobe knows its place.',
  ] },
  { n: 278, date: '2026-08-07', title: 'It feels like a game now', items: [
    '<b>Haptics.</b> Collecting on the map, landing a hit in the Pit, confirming a spend, levelling up and pulling something legendary all give a little thump on phones that can. There is an on/off switch in Settings next to Sounds.',
    '<b>Sheets close like they opened.</b> Every panel in the game used to vanish in a single frame on the way out. They slide away now, and screens fade in when you switch tabs instead of hard-cutting.',
    '<b>No more browser popups.</b> Naming a saved fit gets a proper panel instead of the grey system box, switching to another save asks the two-tap way everything else does, and erasing all your data now requires typing the word ERASE rather than tapping OK twice on reflex.',
    'Messages at the bottom of the screen now <b>wait their turn</b> instead of overwriting each other mid-read.',
  ] },
  { n: 277, date: '2026-08-07', title: 'A proper welcome', items: [
    'The <b>first-run experience is new</b>. Instead of a feature list and a form, the game introduces itself: meet your Bonehead, name it (or keep rerolling until one makes you laugh), see how logging, walking and fighting feed each other, then set your plan.',
    'The name you pick carries into the <b>Crew</b> when you go online later.',
    '<b>Switching phones?</b> Restore a backup is now right on the first screen instead of hiding in Settings.',
    'Skipping setup now <b>tells you the default plan it is using</b> instead of quietly assuming one.',
  ] },
  { n: 276, date: '2026-08-07', title: 'The Wardrobe, the Pit and the Kitchen', items: [
    'The <b>Wardrobe</b> is rebuilt. Your Bonehead stands in a framed panel that fills the space instead of floating in the middle of it, the equipment slots are bigger so you can actually see what you are wearing, and everything fits on one screen without scrolling.',
    'The <b>Pit</b> no longer floats health bars over the fighters. Both sides now have a proper plate above the arena holding names, health, stamina, your pet and any effects running, so the art underneath is never covered. End Turn reads like the main action it is.',
    'The <b>Kitchen</b> opens on the kitchen itself: a pot bubbling over a fire at night, steam, spores drifting through the dark and a bone stirring the brew. It used to be a title on an empty card.',
    'A long-standing alignment bug: the bottom row of equipment slots was laid out for five slots when there are four, so it always sat off to one side.',
  ] },
  { n: 275, date: '2026-08-07', title: 'The home screen, and breeding that makes sense', items: [
    '<b>Today looks like the rest of the game now.</b> Your Bonehead sits in a framed poster with a hand-inked edge, your level and rank read as one plate, and the shortcut buttons match the panels everywhere else. This was designed a while back and I simply never built it: the update before this changed the Boneyard and the logging screens but left the home screen alone.',
    '<b>Breeding works differently, and it should make sense now.</b> You pick the pet you are KEEPING and a spare to feed into it. Your pet stays itself: same name, same level, same look, one rank of lineage stronger (+5% to every stat). The spare is destroyed. Before, both pets were deleted and a third was created, which is why it kept asking which species you wanted.',
    'Because of that, a <b>shiny keeps its own look</b> and can no longer be moved onto another pet. If you try to feed a shiny, a bred bloodline or a levelled pet into something else, the game says so plainly first and makes you confirm twice.',
    'The <b>Build tab</b> stopped showing an unspent talent point after you had already spent it. It updates as you spend now, without leaving the tab.',
    'You can <b>grab things on the map from further away</b>: the collect range went from 55 m to 75 m, and the ring around you on the map grew with it.',
  ] },
  { n: 274, date: '2026-08-07', title: 'Drawn, not typed', items: [
    'The game was drawing a lot of its interface with <b>text characters</b> sitting next to Cam\'s artwork: ticks, stars, arrows, close crosses, energy bolts and dots. They are drawn art now, in the game\'s own style.',
    '<b>Bone Dust finally has an icon.</b> It is a core currency and it has been a plain diamond character in two dozen places since launch. It is a violet gem now, drawn like the coin.',
    'The <b>Quests</b> header had been rendering a scroll emoji this whole time because its icon was never actually wired up. Fixed, along with a couple of other icons that were silently falling back or ignoring the size they were asked for.',
    'Emoji stay where they belong: in the things your Bonehead says.',
  ] },
  { n: 273, date: '2026-08-07', title: 'The good bits look like the good bits', items: [
    'The <b>payoff screens</b> are rebuilt: opening a crate, levelling up, winning a boss fight, hatching a pet, cracking a drop pack and breeding. Every one of them used to slide up as a small panel over whatever you were already looking at. They take the whole screen now.',
    'Crate and drop cards are proper <b>trading cards</b>, with the item big, its name on a plate, and a rarity you can read at a glance. Rarity colours are the game\'s own everywhere now, instead of two different purples depending on the screen.',
    '<b>Breeding explains itself before you commit.</b> The Stable now shows the two pets going in, the one coming out, and says plainly that both parents are destroyed, and it takes two taps like every other permanent spend.',
    'The breed result shows <b>which two pets it cost you</b>, which the old one never did.',
    'After a boss fight, the <b>gear you have to choose between comes first</b>. It used to sit below two full-size cards of loot that had already been added automatically, so the only thing needing a decision was the only thing off the bottom of the screen. The game also stopped offering to <b>Flee</b> a fight you had already won.',
  ] },
  { n: 272, date: '2026-08-07', title: 'A fresh coat, starting with the daily loop', items: [
    'The first big <b>design refresh</b>. Every screen in the add-food flow has been rebuilt: the picker, portions, quick add, the barcode scanner, the label scan and the food form. It is the thing you do every day and it looked the least like the rest of the game.',
    'Logging is <b>fewer taps and less scrolling</b>. Your recent foods are on screen straight away, and the picker shows what is left in your day so you are choosing against a number instead of guessing.',
    '<b>The game always paid you XP for logging and never told you.</b> Now the portion screen shows what the food in front of you is worth before you add it.',
    'The <b>Boneyard</b> got the same treatment: a proper header, one clear card for whatever is nearest, your collect range drawn on the map, and loot markers that look like they belong in this game. Tapping a boss den now tells you who is holding it and what it pays, so you can decide if it is worth the walk.',
    'Two fixes worth naming. A <b>Dark Spire</b> could be beaten and then fought again immediately, over and over, for coins it should not have paid. And taking a tower off another player was supposed to cost a Pit fight, which it never did.',
    'More screens get this treatment over the next few releases.',
  ] },
  { n: 270, date: '2026-08-05', title: 'One tap never spends', items: [
    'A player bought a <b>1,000-coin cauldron by accident</b> on a single tap. Every purchase in the game now takes <b>two</b>: the first tap asks, the second buys, and it forgets after a few seconds so a stray tap later cannot trigger it.',
    'That was already true of the coin shop and the drop. It was <b>not</b> true of the extra cauldron, the extra garden bed, foraging, changing a look, or the <b>Bone Merchant</b>, which is the most expensive tap in the game at up to 6,000 coins and 350 dust.',
    'Anything that costs nothing stays one tap. Reverting a look, or hiding a slot, is free and instant: a confirmation on something free is just friction.',
  ] },
  { n: 269, date: '2026-08-05', title: 'Your weapon holds its charge everywhere', items: [
    'The charge that runs an <b>epic or legendary weapon</b> now follows your Bonehead through the whole game: the home screen, the arena, your Crew row and the map, not just the Wardrobe. A cosmetic that only worked in one room read like a bug.',
    'It is still masked to the weapon\'s own artwork, so the light never spills onto your Bonehead, and it still follows the <b>Gear glow</b> switch in Settings.',
  ] },
  { n: 268, date: '2026-08-04', title: 'Today, tidied', items: [
    'The Glutton, Dark Spires, the Puffer Pack and the Bone Garden used to be four identical cards stacked down the screen, all shouting equally. They are now one <b>Out there today</b> card, and it puts whatever is actually waiting on you at the top: a siege first, then a ready crop or unclaimed tribute, then everything else.',
    'Only the row that needs you gets the green highlight now. Previously everything was green, which meant none of it stood out.',
    'Your <b>meals, and the calorie ring</b>, are written in the game\'s own lettering. The log always looked like a different app bolted onto the bottom of this one.',
    'An empty meal <b>says something</b> instead of sitting there blank, and the day ends with a word from your Bonehead rather than a line of fibre and sodium numbers.',
    '<b>Small grey text is readable now.</b> Twenty-one places on this screen sat below the accessibility contrast floor, and every one of them was the smallest type on the page.',
    'Equipped <b>ember eyes now glow</b>, on your character everywhere they appear: the wardrobe, the home screen, the arena, your Crew row and the map.',
  ] },
  { n: 267, date: '2026-08-04', title: 'Towers that wear their age', items: [
    'The Dark Spires card now <b>explains itself</b>: four numbered steps showing how a tower is taken, what it pays, how you keep it, and what can come for it, with the real numbers instead of four lines of prose.',
    'A spire you have held a long time now <b>looks like it</b>. At 7, 30 and 100 days it changes on the map, and the hundred-day version wears a crown of embers. Rival towers show their age too, which is the point: an old tower should look like a prize worth taking.',
    'Four new badges you <b>cannot get any other way</b>: hold a spire for 7, 30 and 100 days, and break a siege. Every other badge in the game can be earned indoors. These cannot.',
  ] },
  { n: 266, date: '2026-08-04', title: 'Sieges: something is coming for your tower', items: [
    'About once a week, a named horror lays <b>siege</b> to one of your spires. You get <b>48 hours</b> to walk out there and break it. Beat them and the tower <b>levels up</b> and pays more tribute.',
    'Miss the window and the tower goes <b>dormant, never lost</b>. Walk back any time and it is yours again. Nothing you earned can be taken by a clock.',
    'Only one of your towers can be besieged at a time, it targets the one you have <b>neglected longest</b>, and it can only happen once a week. It is a reason to do the rounds, not a chore.',
    'This is the <b>only new notification</b> in the game: one when it starts, and one 12 hours before the window shuts. You can switch it off in Settings.',
    'A besieged tower is impossible to miss: it burns red on the map with a countdown, and it takes over the top of your Dark Spires card.',
    'Unrelated, and just for the look of it: your <b>epic and legendary weapons now hold a charge</b> in the Wardrobe. A slow pulse of light runs the blade every few seconds. It is masked to the weapon\'s own artwork so it never spills onto your Bonehead, and it follows the Gear glow switch in Settings.',
  ] },
  { n: 265, date: '2026-08-04', title: 'Dark Spires: towers with a history', items: [
    'A spire now shows its <b>level</b> on the map. It goes up every time the tower changes hands, and a higher-level tower <b>pays more tribute</b> (up to half again), so an old contested tower is worth taking.',
    'The <b>Keeper\'s Boon</b> now scales: <b>+5% quest coins per spire you hold</b>, so the second and third tower are worth the walk. Capped at three, deliberately.',
    'When someone takes your tower you <b>finally get told</b>. The game has always recorded it and never showed you, which made losing a spire feel like a glitch.',
    'A tower that just changed hands <b>holds its walls for an hour</b>, and taking one off another player now costs <b>one Pit fight</b>. Two friends on the same corner could previously flip a spire back and forth for coins all afternoon.',
    'Your towers are now defended by your <b>current</b> Bonehead. The defender was frozen at the moment you claimed it, so rivals were fighting a months-old version of you.',
    'The leaderboard shows <b>how many spires</b> each player is holding.',
  ] },
  { n: 264, date: '2026-08-04', title: 'The Pit tells you when you have hit the ceiling', items: [
    'The Gauntlet has always had a cap that only lifts when you beat a <b>world boss</b> out on the map, but it was one sentence of small print, so hitting it felt like the game had quietly stopped. Now the section header says <b>AT THE CAP</b>, and a card tells you the rank you are stuck on, that each world boss raises the ceiling by <b>3 ranks</b>, how many you have beaten, and gives you a button straight to the map.',
    'The fight below it now says <b>rematch only</b> instead of looking like a fresh rank.',
    'New in Settings: <b>Gear glow</b>. Turn off the coloured halo on epic weapons and slimed pieces for a clean look. It is purely cosmetic and touches no stats.',
    'The <b>Founder\'s Lizard can no longer turn up by chance</b>. Random pet grants were rolling from the full roster including pets that are only ever awarded by name.',
  ] },
  { n: 263, date: '2026-08-04', title: 'The dressing room stops flickering', items: [
    'Trying on a garment used to <b>flash the whole screen</b>. Every tap rebuilt the entire Character page, throwing away and re-creating every image in every row for the sake of one hat. Now only two things move: your Bonehead and the ring around the item you picked. The new piece is loaded before the swap, so there is no blink either.',
    'The <b>gear you win from a fight shows its art again</b>. The reward card was drawing its name and rarity over a completely blank panel, because that screen built the card but never filled in the picture.',
    'Your <b>chosen background no longer sways</b> with you. It was sitting inside the part of the stage that carries the idle animation, so it drifted with every breath and you could see its edges sliding against the frame. It is a backdrop now, and it holds still while your Bonehead moves.',
  ] },
  { n: 262, date: '2026-08-04', title: 'How do I build my fighter?', items: [
    'The Build tab opens with a <b>plain-language guide</b>. Pick how you want to fight (hit hard, survive anything, move fast, cast spells) and it tells you exactly which two stats to put your points in. No jargon, no numbers.',
    'Under that, folded away for anyone who wants it: <b>what every stat actually does</b> in a fight, who it suits, what habit grows it, and the real per-point numbers.',
    'It also says the two things nobody was being told: you can <b>ignore the whole system</b> and the game still plays fine, and <b>nothing is permanent</b>, because Reset training hands every point back whenever you want.',
    'Stacking one or two stats beats spreading five thin. That is now written down instead of being something you had to work out.',
    'It also answers <b>which weapon to buy</b>. Every weapon at the Bone Merchant rewards a particular stat, so a Power build wants a Power weapon. A mismatch is not wasted, it just does less, and the plain Taped Pipe is never a wrong answer.',
  ] },
  { n: 261, date: '2026-08-04', title: 'The Glutton stays cleansed. For real this time.', items: [
    'Beating him left the <b>FACE THE GLUTTON</b> button sitting there, still working, so he was farmable. Twice before I fixed the wrong thing: the map marker, then the way the screens closed. Neither touched the card itself, which was written once when it opened and never updated. It now <b>rewrites itself</b> the moment he goes down, re-checks whenever you come back to it, and re-checks the record again on the tap. Any one of the three stops it on its own.',
    'A win that landed after his feeding window closed was being filed against the wrong appearance, which also made him read as unbeaten. The appearance is now carried through the fight.',
    'He also <b>shows up for the start of his own fight</b>. The arena art was never being cached, so on the first fight of a session he loaded over the network and you swung at an empty space for the opening moves.',
    'The <b>melt confirm bar</b> was being drawn straight across a gear row, and where it landed the floating + button was sitting on top of it. It now sits at the top of the list where it cannot collide with anything, and the list scrolls up to meet it.',
    'Every row at the bench now <b>prints its stats</b>, so you can see at a glance what you are about to destroy, and there is an <b>Only the junk</b> shortcut that ticks your commons and uncommons and never touches a rare or legendary.',
    'Melting now pays for <b>stat points as well as rarity</b>, so a strong roll is worth more dust than a weak one of the same tier.',
    'The <b>Quests</b> header on Today is in the game\'s own lettering now instead of looking like a control borrowed from another app.',
    'The <b>Bone Dust shop</b> no longer spends on one tap. Each item says what it does, and buying now asks you to confirm.',
    'You can <b>tap a debuff</b> in a fight and actually hit it. The explanations were always there and the chips were 18 pixels tall, so on a phone you missed them every time.',
    '<b>Reset training</b> in the Build tab now asks before it refunds. It wiped your whole build on one tap, and since your Dark Spire defender is built from those stats, a stray tap could have cost you a tower.',
  ] },
  { n: 260, date: '2026-08-04', title: 'The garden gets its own door', items: [
    'The garden was sitting at the top of the Kitchen, so opening the Kitchen meant walking into a row of empty beds before you could reach a cauldron. Wrong way round. <b>The Kitchen opens on the Cauldrons again</b>, and the garden is one row below them that opens its own screen.',
    'New players get an <b>intro card</b> on their next few opens, and a pinned <b>Bone Garden</b> dropdown on Today after that, same as the Puffer Pack.',
  ] },
  { n: 259, date: '2026-08-04', title: 'The Bone Garden', items: [
    'There is a <b>garden in the Kitchen</b>. Plant a seed in a bed, water it once while it grows, and come back to more of that ingredient than you started with.',
    '<b>Seeds come off walks.</b> Roughly one in three Boneyard spawns now drops a seed of whatever it gave you, and the rare Ectoplasm <b>Spore</b> only ever comes from out there.',
    'Short on seeds? The <b>compost heap</b> turns one spare ingredient into 1 to 3 seeds of the same kind. It takes three a day, on purpose: the garden is a way to grow what you found, not a way to print food.',
    'Three beds free, up to five for coins. Commons take 3 hours and pay 2, or 3 if you watered them, or 4 on a <b>bumper crop</b>. A Spore takes 12 and pays 1 or 2.',
    'Miss the watering window and the crop still comes in, just lean. <b>Nothing in the garden ever dies.</b>',
    'Two new quests: bring in a crop today, and harvest 8 in a week.',
    'Also fixed: <b>tapping a reward card never advanced it</b>. Every crate reveal said "tap or swipe" while only swiping worked, because the tap was being delivered to the wrong element.',
  ] },
  { n: 258, date: '2026-08-04', title: 'Your Bonehead has more to say', items: [
    'He had nine things to say and picked one <b>per calendar day</b>, so he repeated himself all day long. Now every time you open the app he says something different, and there are roughly <b>90 lines</b> instead of thirty.',
    'He also notices more: a big step day, a dish finishing in the pot, a Dark Spire flying your name, a full tank of Pit fights.',
    'And a streak no longer gags him. Once you were three days in, the streak lines were <b>all</b> he was allowed to say.',
  ] },
  { n: 257, date: '2026-08-04', title: 'Melt a pile at once', items: [
    'The Salvage Bench now has <b>tick boxes</b>. Select the spare pieces you want gone (or "select all unworn"), and melt the lot in one confirm instead of one popup per item. Gear you are wearing cannot be bulk-selected, so nothing you rely on goes in by accident.',
    'Slimed gear now <b>glows on your Bonehead</b>, not just in the equip box.',
    'Beating the Glutton shows the actual piece of gear you won. It was showing a generic tombstone icon.',
    'Fixed a pet getting sliced in half when you open a Crew member\'s profile.',
  ] },
  { n: 256, date: '2026-08-02', title: 'Your name on your towers', items: [
    'A Dark Spire you hold now flies <b>your Crew name</b> instead of the word "Yours". It is a territory marker: the whole point is reading your own Bonehead on it from across the map.',
    'A tower with nothing owed no longer reads "to collect" under it. The coin figure only appears when there is actually tribute waiting.',
  ] },
  { n: 254, date: '2026-08-02', title: 'The coin shop works again', items: [
    'Buying crates, Vigor and Battle Charms was dead: the Puffer Pack card above it was left unclosed in the code, so the whole coin shop ended up trapped inside it. The buttons looked completely normal and did nothing. Sorry.',
  ] },
  { n: 253, date: '2026-08-02', title: 'Streak Freezes are retired', items: [
    'Nobody used them, and an item that quietly forgives a missed day muddied what a streak even means. They are gone from the shop, the dust shop, crates, the daily wheel and the welcome kit.',
    'If you were holding any, they have been <b>cashed out at 100 coins each</b>, added the next time you open the app.',
    'Days a Freeze already protected still count toward your streak. Retiring an item should not rewrite a streak you actually kept.',
    'Also: <b>tap any bar</b> on your steps or sleep chart to see that exact day\'s number.',
  ] },
  { n: 252, date: '2026-08-02', title: 'Dark Spires: take the town', items: [
    'Towers have risen across your town. Walk to one, beat the warden holding it, and the <b>spire flies your name</b>.',
    'A held spire pays <b>tribute</b> every day, up to three days\' worth, and you collect it in person. That is the whole idea: your walk now has a destination.',
    'Visit within <b>7 days</b> to keep it. Miss that and it goes dormant, never lost, and you can always take it back.',
    'Hold any spire and you earn the <b>Keeper\'s Boon</b>: +10% coins from every quest.',
    'You can hold <b>three</b> at once, so pick the towers you actually walk past.',
    'Spires are <b>shared</b>. Your Crew sees who holds what, and a tower held by someone else is defended by their real Bonehead. Beat it and it changes hands, and they get told who took it.',
    'Also: equipping gear no longer throws you back to the top of the page, the <b>Puffer Pack</b> in the Shop is tucked into a collapsed card so it stays out of the way, and rare-spawn notifications are gone. They were scheduled from wherever you happened to be when you last opened the app, so by the time one arrived it was pointing at somewhere you had already left.',
  ] },
  { n: 250, date: '2026-08-02', title: 'Patch notes read like patch notes', items: [
    'These notes were printing the raw markup around emphasised words instead of just <b>bolding</b> them. Fixed, going back through every past entry.',
  ] },
  { n: 249, date: '2026-08-02', title: 'The Glutton stays dead', items: [
    'Beat the Glutton and he actually leaves. The <b>Face The Glutton</b> button and his marker used to stay on the map after you had already cleansed him, so he looked farmable, and since fighting him costs no Vigor while every win still pays fight XP, he was.',
    'The map now double-checks the record rather than trusting what it knew when you opened it, so a Glutton cleared anywhere is gone everywhere.',
  ] },
  { n: 247, date: '2026-08-02', title: 'The Puffer Pack has dropped', items: [
    'Ten <b>legendary</b> pieces just hit: five new colourways of the puffer jacket, each with a matching <b>blowfish hat</b>. Bloodrush, Slime, Gravemint, Grape and Bubblegum. Puffer on puffer.',
    'Every colour is pulled from Cam\'s original art, nothing invented. Wear the fish or fear the fish.',
    'Get them from any crate (legendary odds, same as ever) or buy them outright in the <b>Shop</b>: jackets 3,000 coins, fish 1,500.',
    'The drop card on Today has the whole set, and stays pinned there so you can find your way back to it.',
  ] },
  { n: 246, date: '2026-08-01', title: 'Jab and swing have fists now', items: [
    'Your <b>jab</b> and <b>swing</b> are drawn animations instead of a flash of light, and they land on the fighter you are hitting rather than somewhere near them.',
    'They also actually show up. The frames were arriving a fraction of a second after the punch had already finished, so the first fight after an update looked exactly like nothing had changed.',
    'The <b>Ladder</b> tells the truth about a rematch. Once you had beaten a rung it still advertised the first-win payout, so a rematch looked like it owed you coins and XP it was never going to pay. Beaten rungs and the Champion now show what a rematch is actually worth.',
  ] },
  { n: 235, date: '2026-07-28', title: 'Everything where you would look for it', items: [
    'New <b>Bonehead</b> tab at the bottom: your Wardrobe, Backpack, Shop, Build and Level, all in one place. Settings moved to the gear in the top corner, because you open it about once a month and it was taking a quarter of the bar.',
    'The <b>Shop</b> finally has a home. It was a real screen you could only reach from two buttons buried inside other pop-ups, and once you were there nothing pointed the way out. It is a tab now.',
    'The <b>Boneyard</b> is a proper screen instead of a pop-up, so the back gesture behaves the way it does everywhere else and there is no Done button to hunt for.',
    'Your Bonehead and the loot on the map now appear as finished art instead of assembling themselves piece by piece while you watch.',
    'Settings is sorted: your account and your data sit together at the top, and everything about the app itself is grouped below.',
    'Your saved foods moved out of Settings and into the <b>+</b> button, next to the rest of the food logging.',
  ] },
  { n: 231, date: '2026-07-28', title: 'Recovery, finished properly', needsBuild: true, items: [
    'Your recovery code now has two halves: a Recovery ID you pick (a name, like a username) and your phrase. Type both on any phone and your Bonehead comes back. Before this you also needed your friend code, which nobody has after wiping the phone that was showing it.',
    'The ID is checked as you type, so you know straight away whether the name you want is free.',
    'Because an ID is easy for someone else to guess, the phrase now does the protecting: twelve characters, and more than one word. Codes you have already saved keep working exactly as they are.',
    'Android now keeps your account key in the phone\'s secure store, the same trick the iPhone version uses, so deleting and reinstalling brings your Bonehead back on its own.',
    'Settings tells you the truth about that: it now shows whether your key is really saved on this phone, and says so plainly when it is not, instead of promising something it cannot deliver.',
    'And if the app ever finds a different Bonehead already saved on your phone, it leaves it alone and offers it to you rather than writing over it.',
  ] },
  { n: 230, date: '2026-07-27', title: '\u{1F480} Claude destroyed my account \u{1F480}',
    hero: { img: 'assets/bh/memorial/wretched-goblin.png', alt: 'Wretched Goblin, level 27',
            tag: 'In memoriam', name: 'WRETCHED GOBLIN', rank: 'LV 27 \u00b7 Bone Grandmaster', tally: '14 BADGES \u00b7 47 GEAR' },
    items: [
    'Tom deleted the app to troubleshoot a bug. His level 27 Bonehead did not come back. The cloud backup was there the whole time, but the key that unlocks it lived only on that phone, and it went with the app. \u{1F480}',
    'The good news: this will not happen to you. Boneheadz now has a recovery code. You pick a phrase you will actually remember, and it can restore your account onto any phone, even if you delete the app, lose the device or get a new one.',
    'You will be asked to set one the next time you open the app. It takes about ten seconds. Until you do, the app will keep asking, because the alternative is what happened above.',
    'Tom is starting over from scratch as Chiseled Goblin. Find him on the leaderboard and add him, and say hello when you see him crawling around the Boneyard at level 1. \u{1F480}',
  ] },
  { n: 229, date: '2026-07-27', title: 'Sleep from your watch, done properly', needsBuild: true, items: [
    'Last night\'s sleep reads itself from Apple Health and lands on Today and in your daily readiness, with the deep / REM / core breakdown when your watch tracked stages.',
    'Tap the Sleep tile on Progress for the whole night. It always names the night it is showing, so a night that has not come in yet reads as missing instead of quietly showing you an older one.',
  ] },
  { n: 225, date: '2026-07-27', title: 'Clearer targets, clearer warnings', items: [
    'When you face two enemies at once, the one you are about to hit is now marked with red corner brackets and its name, so there is no guessing which one your swing lands on. In a straight one-on-one there is nothing to choose, so the arena stays clean.',
    'The "too fast to loot" warning is readable now: it no longer gets cut off mid-sentence on the map, and the pop-up uses the full width instead of squeezing into a tiny block.',
  ] },
  { n: 224, date: '2026-07-27', title: 'A new day actually starts a new day', items: [
    'The app now notices when the date changes while it is sitting in your pocket. Open it the next morning and you get a fresh day properly: new quests, your streak checked, yesterday closed out and its crate handed over, and a new spin on the wheel.',
  ] },
  { n: 223, date: '2026-07-26', title: 'Saved fits and the Looks collection', items: [
    'Save up to six fits and put a whole outfit back on in one tap, at the top of the Wardrobe. Long-press a fit to rename or bin it.',
    'New Looks page under the Character tabs, tracking every piece in the game. Yours show their art; the rest stay blank until you find them, so an unlock is still a surprise. The counts tell you what is out there, never what it looks like.',
    'Tap anything in your collection to see it and wear it straight away.',
    'You now pay for a look once. After that, wearing it again in that slot is free forever, which is what makes swapping fits cost nothing.',
  ] },
  { n: 221, date: '2026-07-26', title: 'Wear the stats, keep the look', items: [
    'Your gear no longer decides how you look. Open any gear slot in the Wardrobe and there is a new "pick your look" row: put the stats you want under whatever piece you actually like.',
    'Every piece you have ever found unlocks its look forever, even after you melt it. Melting is now pure profit: you keep the dust and the look.',
    'Trying a look on is free and shows on your Bonehead straight away. You only spend Bone Dust when you commit, and going back to your gear\'s own look, or hiding a slot entirely, costs nothing.',
    'Your look sticks to the slot, so upgrading the gear underneath it does not undo your outfit. Friends see it on your Crew card, and so does everyone you meet in the Pit.',
  ] },
  { n: 220, date: '2026-07-26', title: 'The Glutton hunts twice a day', items: [
    'The Glutton now surfaces on the Boneyard twice every day, mornings (8am to noon) and evenings (5pm to 9pm), anywhere in the world. Miss him and he is back tonight.',
    'His blight is far bigger: a 400m dead zone that strangles every loot spawn inside it until he goes down. The map card tells you when his next sighting is.',
    'Beat him and his hoard can come out SLIMED: a rare green-glowing version of a piece, marked in your wardrobe.',
    'Hats and pants can now roll real stats and talents, same as weapons and chest. Two more slots to hunt, and armour stays balanced.',
  ] },
  { n: 218, date: '2026-07-24', title: 'The Glutton has arrived', items: [
    'A monstrous new world boss is loose on the Boneyard. The Glutton squats on the map and spreads a blight that chokes off every loot spawn around him until someone deals with him.',
    'Track him down out in the world, face him, and win to cleanse the blight and claim his jellified hoard.',
  ] },
  { n: 214, date: '2026-07-24', title: 'Readiness polish + tap a debuff to read it', items: [
    'Tightened the daily readiness dial: no more dead gap between the ring and the status.',
    'In a fight, tap any status icon (yours or the enemy\'s) for a quick tooltip on exactly what it does, like the Boneyard map.',
    'Dropped the consistency grid from Progress, it wasn\'t pulling its weight.',
  ] },
  { n: 213, date: '2026-07-24', title: 'Your sleep, read automatically', needsBuild: true, items: [
    'Your watch\'s sleep now logs itself, no more tapping in hours. It shows up on Today and feeds your daily readiness.',
    'New sleep score (0 to 100): tap it on the Progress tab for last night\'s deep / REM / core / awake breakdown.',
    'No watch? The manual hours picker is still there whenever you want it.',
  ] },
  { n: 212, date: '2026-07-24', title: 'A futuristic readiness dashboard', items: [
    'Your daily readiness score now leads the Progress tab as a glowing gauge, with the read (Primed, Ready, Ease in) and your resting HR, HRV and sleep laid out cleanly beneath it.',
    'Steps got smarter: today, your 7-day average and your 30-day average at a glance, and the average no longer counts today\'s half-finished total against you.',
    'Tap any metric for the full Day / Week / Month / Year history, now fully scrollable instead of cut off. Retired the daily tile grid.',
  ] },
  { n: 211, date: '2026-07-24', title: 'Fight boss dens daily', items: [
    'Landmark boss dens now refresh every day, walk out and fight them daily if you want, instead of once a week.',
    'To keep it fair, top-tier gear from dens is now rarer (a great drop stays a lucky event), and daily re-clears don\'t fast-forward the endless Pit, only beating a new den does.',
  ] },
  { n: 209, date: '2026-07-23', title: 'Melt a stack + see your salvage', items: [
    'Melting gear no longer jumps you back to the top, melt as many spare pieces as you like in one go.',
    'Destroying a pet now shows how much Bone Dust you\'ll get before you confirm.',
  ] },
  { n: 208, date: '2026-07-23', title: 'Cleaner combat status icons', items: [
    'The status effects on each fighter are now tidy little icons on their own line (no more cluttered text crowding the names). Tap any icon to read what it does.',
  ] },
  { n: 207, date: '2026-07-23', title: 'Pet talents inline + custom serving sizes', items: [
    'In the Stable, tap any pet to expand its talent tree right below it, no more scrolling to the bottom to find them.',
    'When adding food, tap the servings number to type any amount (like 1.33), on top of the +/- quarter steps.',
  ] },
  { n: 206, date: '2026-07-23', title: 'See what your debuffs are doing', items: [
    'Each fighter\'s active status effects now show as chips on their plate (burn, bleed, poison, blind, weaken, sunder, guard and more) with turns or stacks left, so you can tell at a glance whether it\'s worth re-applying.',
    'Tap any status chip to read exactly what it does.',
  ] },
  { n: 205, date: '2026-07-23', title: 'Heckle jeers in the enemy\'s face', items: [
    'The Heckle skulls now flank the rattled enemy\'s head, one jeering over each shoulder, instead of floating across the whole screen. Cleaner art, too.',
  ] },
  { n: 204, date: '2026-07-23', title: 'Scroll fix + a way out of the Shop', items: [
    'Fixed the screen jumping back to the top on its own: background health syncs no longer re-render and yank you up while you\'re scrolled down reading.',
    'The Shop now has a Back button, no more getting stuck in there.',
  ] },
  { n: 203, date: '2026-07-23', title: 'Shop is easy to reach again', items: [
    'The Shop now sits right at the top of your Backpack instead of buried under everything.',
    'The "melt gear" list is tucked into a tidy collapsible section so the Backpack isn\'t a mile long.',
  ] },
  { n: 202, date: '2026-07-23', title: 'Heckle rattles with a jeer', items: [
    'The Heckle talent now plays an animation when your Bone Guard rattles the enemy: two skulls bob and jeer with green shout-bursts (Cam\'s art) as the foe is weakened.',
  ] },
  { n: 201, date: '2026-07-23', title: 'Counterstep hits back with a flurry', items: [
    'The Counterstep talent now lands with a proper animation: a rapid three-fist jab flurry (Cam\'s art) that stacks in and connects when you snap back after an enemy whiffs.',
  ] },
  { n: 192, date: '2026-07-23', title: 'Activity & recovery trends', items: [
    'Your Progress screen now has an Activity & recovery section for anyone with a watch: a gentle recovery read from your resting heart rate, plus cards for resting HR, HRV, active energy and move minutes.',
    'Tap any card, or the History link on Steps and Weight, to drill in the way Apple Health does: Day, Week, Month and Year, with your average, range, best day and a plain-language read on where the trend is heading.',
    'A "Your activities" breakdown shows your real workout mix from the last 8 weeks, and new activity types appear on their own.',
    'Don\'t track any of this? Nothing changes, the section simply stays hidden.',
  ] },
  { n: 188, date: '2026-07-23', title: 'Tidier home, Boneyard in the nav', items: [
    'The home screen is simpler: four clear buttons (Character, Stable, Kitchen, The Pit). Wardrobe and your Backpack now live together under Character.',
    'The Boneyard moved down to the bottom bar, so the map is always one tap away. The Shop lives in your Backpack now.',
  ] },
  { n: 187, date: '2026-07-22', title: 'Tap a marker to inspect it', items: [
    'Tap any pin on the Boneyard, a cache, crate, mini-boss or den, and a little tooltip tells you what it is, what it drops, and how far away it is.',
    'The map key button is now brighter and easier to spot.',
  ] },
  { n: 186, date: '2026-07-22', title: 'A Boneyard map key', items: [
    'Tap the ? on the map for a key that explains every marker: bone caches, coin piles, crates, mystery eggs, mini-bosses, and all the den types (landmark, the daily roaming dens, and the rare hidden ones).',
    'The key uses the exact same art the map draws, so there\'s no guessing what a pin is anymore.',
  ] },
  { n: 185, date: '2026-07-22', title: 'Workouts, by type', items: [
    'Now the KIND of workout matters: each session your watch logs (bike, run, strength, yoga, and more) drops a themed reward, cardio hands you a Vigor Draught, strength a Battle Charm, flexibility some Bone Dust.',
    'Completed workouts and exercise minutes earn XP and coins on top of your steps and calories.',
    'Update to the latest build to sync workouts (iPhone workout sync lands in the next TestFlight update).',
  ] },
  { n: 183, date: '2026-07-22', title: 'Your workouts count now', items: [
    'Active calories pay off: a bike ride, a gym session, a run, anything your Apple Watch tracks as active energy now earns XP and coins, not just steps.',
    'Break 500 active calories in a day and you\'ll bag a Workout Crate.',
    'New goals to match: a daily "Break a sweat" and a weekly training streak.',
  ] },
  { n: 180, date: '2026-07-22', title: 'A fresh look + the Day One Lizard', items: [
    'Fresh coat of paint: a darker, moodier backdrop with a hand-drawn, grainy finish, chunkier hand-inked panels, and sticker-style buttons, so the whole app feels more like Cam\'s artwork.',
    'A quick survey for early players has landed: tell us what you think and what would make you play more, and you\'ll keep the exclusive amethyst Day One Lizard, an animated pet no one can hatch or buy. It only goes to the players who were here at the start.',
    'Find the survey any time under Settings, and once you\'ve claimed it, the lizard lives in your Stable to equip whenever you like.',
  ] },
  { n: 164, date: '2026-07-20', title: 'Tell us what you think', items: [
    'New Send feedback button in Settings. Got a thought on the game, something confusing, an idea? It goes straight to the developer.',
  ] },
  { n: 179, date: '2026-07-21', title: 'Crew presence + quest polish', items: [
    'See who\'s around: the Crew tab and leaderboard now show an "online now" dot and "last seen" for every player.',
    'Quests on the home screen are easier to spot, with a clear "N ready" cue when something\'s claimable.',
    'Shiny pets now warn you before you destroy or breed them (they\'re ultra-rare), and a shiny\'s colour carries down to its offspring.',
    'Fixed a "point to spend" reminder that lingered after you\'d already spent it.',
  ] },
  { n: 178, date: '2026-07-21', title: 'Something stirs...', items: [
    'Walkers in certain places have reported a faint drumming from beneath the ground. Probably nothing. 🥁',
    'Also: a new ??? tile in your badges.',
  ] },
  { n: 176, date: '2026-07-21', title: 'Portrait only, properly', items: [
    'Playing in the browser? Tipping your phone sideways now shows a friendly "turn me back" screen instead of a stretched mess. The installed apps were already locked.',
  ] },
  { n: 175, date: '2026-07-21', title: 'Leaderboard glow-up', items: [
    'The top three players now stand on a podium right on the Crew tab, showing off their actual Boneheadz.',
    'Inside the leaderboard, everyone\'s Bonehead appears next to their rank. Dress to impress.',
  ] },
  { n: 174, date: '2026-07-21', title: 'The Leaderboard', items: [
    'New in the Crew tab: every Bonehead in the game, ranked by level. See where you stand, and add anyone as a friend straight from the board.',
    'New players now get a nudge toward their first Pit fight, and the map shares its press-and-hold tip once.',
  ] },
  { n: 172, date: '2026-07-20', title: 'No more scroll jumps', items: [
    'Logging water, a made bed, or sleep no longer snaps the home screen back to the top. You stay right where you were.',
  ] },
  { n: 171, date: '2026-07-20', title: 'Patch notes in order', items: [
    'Fixed the What\'s New list so the newest updates always show at the top (an older note had slipped above them).',
  ] },
  { n: 170, date: '2026-07-20', title: 'Clearer boss loot', items: [
    'After a boss den, the gear piece you keep now lights up with a "KEPT" badge and the one you leave behind greys out, so it\'s obvious which you chose (this was backwards before).',
    'Your chest and Ectoplasm are now clearly marked as earned automatically. They\'re both yours, not a choice. The only pick is which gear piece to keep.',
  ] },
  { n: 169, date: '2026-07-20', title: 'Better food search', items: [
    'Added flat whites, cortados, mochas, cold brew, iced lattes, chai + matcha lattes and more common café drinks to the built-in library.',
    'Online search now covers Open Food Facts too (millions of named and branded products), not just USDA, so far more foods turn up by name.',
  ] },
  { n: 168, date: '2026-07-20', title: 'Show off your gear instantly', items: [
    'When you equip a new weapon, outfit, gear piece or pet, your Crew sees it on your profile right away instead of after the next background sync.',
  ] },
  { n: 167, date: '2026-07-20', title: 'Cleaner map, clearer Crew', items: [
    'Loot no longer strays into water or backyards, even as you pan around. Coins, dens and bosses only show where you can actually reach them.',
    'The Crew tab now shows a badge when someone wants to be your friend, so you know to head there and accept.',
  ] },
  { n: 163, date: '2026-07-20', title: 'Loot you can actually reach', items: [
    'Boss dens and mini-bosses now snap to real paths, roads and parks like the bone piles already did, so they stop landing in backyards.',
    'Anything with nowhere reachable nearby (out in the water) is now hidden instead of stranded in the sea.',
  ] },
  { n: 162, date: '2026-07-20', title: 'Tidier map reporting', items: [
    'Fixed the press-and-hold report so it opens just one dialogue at a time (no more stacking several at once).',
  ] },
  { n: 160, date: '2026-07-20', title: 'Help shape the map', items: [
    'Press and hold anywhere on the Boneyard map to nominate that spot as a boss den. Know a landmark that would be perfect? Tell us why.',
    'Press and hold a coin, boss, or pile you can\'t actually reach (private property, locked gate) to flag it for review.',
  ] },
  { n: 159, date: '2026-07-20', title: 'Boss dens on the move', items: [
    'Roaming boss dens now appear around the map and refresh every day, so there is always somewhere new to fight. They sit alongside the permanent landmark dens.',
  ] },
  { n: 153, date: '2026-07-20', title: 'Better quests + a new draught', items: [
    'Quests now pay more than coins: some drop Bone Dust, ingredients, or items. Win 3 Pit fights for a Vigor Draught, scavenge the map for rare Ectoplasm, and more.',
    'New Vigor Draught (⚡): drink it to instantly bank Pit energy. Streak Freeze drops less often now to make room for it.',
  ] },
  { n: 152, date: '2026-07-20', title: 'The Pantry', items: [
    'Cooked dishes no longer activate the second you collect them. They wait in your new Pantry until you Eat one, so you can save a buff for the fight or day you want it.',
  ] },
  { n: 151, date: '2026-07-20', title: 'Patch notes find you now', items: [
    'What\'s New now pops up the first time you open the game after an update, so you never miss what changed. Find it any time in Settings or the Crew tab too.',
    'Cleaned up weapon suggestions (no more nudging you toward a weaker weapon), and Bone Dust now shows the same ◆ everywhere.',
  ] },
  { n: 150, date: '2026-07-20', title: 'A proper Shop', items: [
    'New Shop tab in the bottom bar: the Bone Merchant (weapons), crates, and the Bone Dust shop, all in one place. No more digging for the merchant.',
    'Your charts, streak and badges now live in Progress. Tap your level up top to see them.',
  ] },
  { n: 148, date: '2026-07-20', title: 'This screen', items: [
    'Added What\'s New, right here, so you and your Crew can keep up with changes. The game updates a lot.',
    'Find it any time in Settings or on the Crew tab.',
  ] },
  { n: 147, date: '2026-07-20', title: 'Never miss a new unlock', items: [
    'The home screen now nudges you when there is something to do: points to spend, gear to equip, or a weapon you can finally afford.',
    'Tap the nudge and it takes you straight to the right screen. The Build and Wardrobe buttons light up too.',
  ] },
  { n: 145, date: '2026-07-20', title: 'Prestige weapons', items: [
    'The Bone Merchant now stocks a top-tier weapon for each fighting style: the Ossuary Warmaul, the Voidstar Focus, and the Eternal Reliquary.',
    'These are the strongest weapons in the game. They cost both coins and Bone Dust, so melting spare gear finally pays off at the high end.',
  ] },
  { n: 144, date: '2026-07-20', title: 'Turn scraps into treasure', items: [
    'Once a day at the cauldron you can merge a handful of common ingredients into a rare one. Nothing goes to waste.',
  ] },
  { n: 143, date: '2026-07-20', title: 'A bigger kitchen', items: [
    'You can now buy a second and third cooking pot, so more dishes can simmer at once.',
    'New once-a-day Transmute: turn six common ingredients into one rare one.',
  ] },
  { n: 142, date: '2026-07-19', title: 'Pets grow deeper', items: [
    'Every pet species now earns a signature power once it hits max level, unique to that pet.',
    'The pet screen shows the next talent your pet is working toward, so leveling feels less mysterious.',
  ] },
  { n: 141, date: '2026-07-19', title: 'Boss fights hit harder', items: [
    'A boss\'s second skeleton is now its own beast, with its own name and look, mirroring how you fight alongside your pet.',
    'Enemies target your pet more clearly, and heavy sweeps that hit you both now show what is happening.',
  ] },
  { n: 137, date: '2026-07-18', title: 'Walking builds your fighter', items: [
    'Every 25,000 steps now earns a training point, so walkers grow their Bonehead too. Your past steps counted retroactively.',
    'Claiming a quest no longer jumps you back to the top of the screen.',
    'Melting gear for Bone Dust now has a clear spot at the Salvage Bench.',
    'Boneheadz now warns you if Apple Health stops sending steps, so your walking never quietly goes uncounted.',
  ] },
  { n: 136, date: '2026-07-17', title: 'Battle your friends', items: [
    'You can now fight a friend\'s Bonehead in the Pit. Their build fights back on its own.',
    'New quests reward taking on your crew.',
  ] },
  { n: 133, date: '2026-07-16', title: 'A tidier home screen', items: [
    'Fixed the currency sitting over your Bonehead\'s face and gave your character room to be the star again.',
    'Cleaned up the crew and pet screens.',
  ] },
  { n: 130, date: '2026-07-15', title: 'The Stable', items: [
    'Pets now have their own home, the Stable, instead of sharing the armor screen.',
    'Level, breed, or retire each pet you own from one place.',
  ] },
  { n: 128, date: '2026-07-14', title: 'Pet breeding', items: [
    'Combine two pets to breed a new one with a lineage tier and a stronger glow.',
    'Duplicate pets now stack, so you can pick which copy to raise and which to breed.',
  ] },
  { n: 124, date: '2026-07-13', title: 'Pets get personal', items: [
    'Each pet species now has its own base stats, and rare shiny colourways give a small edge.',
    'Pet levels go all the way to 10, with a clearer moment when they level up.',
  ] },
  { n: 123, date: '2026-07-12', title: 'Tougher world bosses', items: [
    'Boss dens out on the map now scale with your progression, so they stay a real fight instead of falling behind you.',
  ] },
  { n: 118, date: '2026-07-11', title: 'Cleaner combat', items: [
    'Retired the old move-and-range system. Fights are now about reading the enemy: one solid defensive move (Bone Guard) and heavy hits you can brace for.',
  ] },
  { n: 103, date: '2026-07-09', title: 'Gifts and cheers', items: [
    'Send a friend a gift or a quick cheer straight from the Crew tab.',
    'Friend cards and profiles got a lot richer.',
  ] },
  { n: 102, date: '2026-07-08', title: 'The Crew tab', items: [
    'Your friends list now has its own tab. Add friends by code and get a nudge when someone adds you.',
    'Eggs can now drop as rewards.',
  ] },
  { n: 100, date: '2026-07-07', title: 'Play with friends', items: [
    'Boneheadz is social now: pick a Crew name from a curated list, add friends by their code, and set your own private nicknames for them.',
  ] },
  { n: 92, date: '2026-07-05', title: 'Loot feels like loot', items: [
    'Crates, boss drops, and new pets now open with a premium card-reveal, styled to match the game art.',
  ] },
  { n: 87, date: '2026-07-04', title: 'Sleep and trends', items: [
    'Log your sleep hours, and see your habits over time in a reworked trends view.',
  ] },
  { n: 86, date: '2026-07-04', title: 'Shiny pets', items: [
    'Ultra-rare shiny versions of pets can now turn up when you hatch an egg. Keep an eye out.',
  ] },
  { n: 85, date: '2026-07-03', title: 'Richer rewards', items: [
    'Mini-bosses drop better loot, wellness wins give clearer XP feedback, and the whole game got a fuller sound palette.',
  ] },
  { n: 84, date: '2026-07-03', title: 'Never lose your progress', items: [
    'Your save is now backed up to the cloud, end-to-end encrypted, so it survives a reinstall or a new phone. Only your device can read it.',
  ] },
  { n: 73, date: '2026-07-01', title: 'Boneyard mini-bosses', items: [
    'Smaller roaming foes now appear on the map between the big boss dens for quick fights on the go.',
  ] },
  { n: 72, date: '2026-06-30', title: 'The Alchemist', items: [
    'A new class that brews potions to swing a fight.',
  ] },
  { n: 71, date: '2026-06-30', title: 'The Bone Merchant', items: [
    'A weapon vendor came to town. Spend your coins on real upgrades to your fighting style.',
  ] },
];

// Always display newest-first, regardless of the order entries were authored in
// (a mis-placed insert once floated an old entry to the top, making the list
// look stale). This keeps the What's New screen correct by construction.
CHANGES.sort((a, b) => b.n - a.n);

// versions the player has NOT seen since last opening the What's New screen
export function changelogUnseen(lastSeen) {
  const seen = Number(lastSeen) || 0;
  return CHANGES.filter(c => c.n > seen).length;
}

// the newest build number in the log (what we mark as "seen" when the screen opens)
export function changelogLatest() {
  return CHANGES.reduce((m, c) => Math.max(m, c.n), 0);
}
