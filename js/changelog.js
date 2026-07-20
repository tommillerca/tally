// What's New: a player-facing changelog so friends can follow the game as it
// changes. Newest first. Written in plain language (no build numbers in the copy
// itself) — the version is metadata for the "new since you last looked" dot.
// Append new entries to the TOP. `n` is the build number used only for the dot.
export const CHANGES = [
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
];

// versions the player has NOT seen since last opening the What's New screen
export function changelogUnseen(lastSeen) {
  const seen = Number(lastSeen) || 0;
  return CHANGES.filter(c => c.n > seen).length;
}

// the newest build number in the log (what we mark as "seen" when the screen opens)
export function changelogLatest() {
  return CHANGES.reduce((m, c) => Math.max(m, c.n), 0);
}
