// What's New: a player-facing changelog so friends can follow the game as it
// changes. Newest first. Written in plain language (no build numbers in the copy
// itself) — the version is metadata for the "new since you last looked" dot.
// Append new entries to the TOP. `n` is the build number used only for the dot.
export const CHANGES = [
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
