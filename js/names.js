// Curated name builder word lists. KEEP IN SYNC (identical order) with
// server/src/index.js ADJ/NOUN: the client sends INDICES, the server rebuilds
// the string from its matching lists, so no free text ever leaves the device
// and there is nothing to moderate.

// APPEND-ONLY: never reorder or remove (indices are the wire format; a saved
// name is just a string, but keeping order stable keeps the builder's parse
// back to chips correct). Add new words at the end only.
export const NAME_ADJ = ['Rattling', 'Grim', 'Dusty', 'Creaky', 'Hollow', 'Marrow', 'Midnight', 'Restless', 'Crooked', 'Sturdy', 'Swift', 'Lucky', 'Feral', 'Ancient', 'Jolly', 'Sneaky', 'Iron', 'Cursed', 'Phantom', 'Rowdy', 'Chrome', 'Vicious', 'Gnarly', 'Wicked', 'Bony', 'Rugged', 'Shadow', 'Fresh', 'Savage', 'Brutal', 'Twisted', 'Jagged', 'Ragged', 'Grisly', 'Ghastly', 'Ghoulish', 'Spectral', 'Sinister', 'Vile', 'Rotten', 'Withered', 'Charred', 'Frozen', 'Blazing', 'Molten', 'Rusty', 'Frostbit', 'Toxic', 'Venomous', 'Rabid', 'Feisty', 'Reckless', 'Hungry', 'Ironclad', 'Swole', 'Ripped', 'Chiseled', 'Massive', 'Mighty', 'Beastly', 'Prowling', 'Nocturnal', 'Eerie', 'Murky', 'Gloomy', 'Silent', 'Menacing', 'Lurking', 'Snarling', 'Howling', 'Grinning', 'Neon', 'Golden', 'Obsidian', 'Cracked', 'Grave', 'Wretched', 'Thunderous', 'Stormy', 'Electric'];
export const NAME_NOUN = ['Rex', 'Femur', 'Knuckles', 'Molar', 'Sternum', 'Tibia', 'Scapula', 'Phalange', 'Vertebrae', 'Clavicle', 'Patella', 'Mandible', 'Rib', 'Talus', 'Hyoid', 'Coccyx', 'Skull', 'Spine', 'Reaper', 'Ripper', 'Jawbone', 'Cranium', 'Gains', 'Crypt', 'Ghoul', 'Wraith', 'Fang', 'Hustle', 'Bruiser', 'Brawler', 'Slugger', 'Crusher', 'Basher', 'Smasher', 'Chomper', 'Gnasher', 'Stomper', 'Wrecker', 'Mauler', 'Ravager', 'Menace', 'Terror', 'Nightmare', 'Specter', 'Wight', 'Lich', 'Revenant', 'Banshee', 'Gargoyle', 'Golem', 'Titan', 'Brute', 'Fiend', 'Demon', 'Gremlin', 'Goblin', 'Warlock', 'Bonesaw', 'Skeleton', 'Bonehead', 'Ossuary', 'Casket', 'Coffin', 'Tombstone', 'Boneyard', 'Ribcage', 'Kneecap', 'Backbone', 'Humerus', 'Ulna', 'Pelvis', 'Sacrum', 'Fibula', 'Tusk', 'Claw', 'Talon', 'Horn', 'Spike', 'Deadlift', 'Pump'];

// Build the display string from indices (num null/undefined = no number suffix).
export function buildName(adj, noun, num) {
  const a = NAME_ADJ[adj], n = NAME_NOUN[noun];
  if (!a || !n) return '';
  return `${a} ${n}${Number.isInteger(num) && num >= 0 && num <= 999 ? ` #${num}` : ''}`;
}

// A random {adj, noun, num} selection for the reroll button.
export function randomName() {
  const r = (max) => Math.floor(Math.random() * max);
  return { adj: r(NAME_ADJ.length), noun: r(NAME_NOUN.length), num: Math.random() < 0.5 ? r(100) : null };
}
