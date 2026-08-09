/* THE BOSS ROSTER — 56 themed monsters, all assembled from cosmetics that
 * already ship. Tom, 2026-08-09: "when you fight enemies in the world of the pit
 * they are just random skeletons. I want this to change... make sure these are
 * randoming in the world as bosses and encounters not just the pit."
 *
 * Two different jobs, so two different mechanisms:
 *
 *   FIXED (this file's LOOKS): the Pit ladder, the Champion and the Gauntlet's
 *   eight names. A ladder you climb should have faces you learn, so rung 4 is
 *   The Gravedigger every time.
 *
 *   POOLED (themedLook): every world encounter. Dens already roll a seeded theme
 *   (landmark per week, roaming per map cell per day, remote per day, all off
 *   DEN_THEMES), so the look rides the roll that is already happening. The Sour
 *   Marsh is Gatormaw on Tuesday and Sporeback on Friday: same name, same biome,
 *   different monster, and stable for everyone in your Crew on the same day.
 *
 * Every outfit here is an existing catalogue id worn by an NPC. No new art, no
 * new ids, nothing added to the crate pool, no player inventory touched.
 *
 * Regenerated from market-quality-mockups/pit-bosses/final56.json. */

// The fixed cast: enemy name -> outfit.
export const LOOKS = {
  'Rattles': { B: 'B0-7', SK: 'SK1', E: 'ES20', M: 'MS2' },   // Frostbitten
  'Knuckles': { B: 'B11-2', SK: 'SK11-2', H: 'H5-1', E: 'ES8', G: 'G2' },   // The Pit Beast
  'Big Femur': { B: 'B0-2', SK: 'SK0-2', H: 'H7-1', E: 'ES11', G: 'G4' },   // The Bone-Horned
  'The Gravekeeper': { B: 'B4', SK: 'SK4', E: 'ES17', H: 'HS14', IR: 'IR8-2' },   // The Gravedigger
  'Two-Ton Tibia': { B: 'B10', SK: 'SK10', T: 'T6-2', H: 'HS16', E: 'E4' },   // Cinderskull
  'Skullcracker': { B: 'B0-1', SK: 'SK19', T: 'T3', IR: 'IR7-3', E: 'E4' },   // The Rune Knight
  'The Bonecollector': { B: 'B14', SK: 'SK14', IL: 'IL2', E: 'ES16', M: 'MS11' },   // Marshmaul
  'Ribcage Ricky': { B: 'B0-2', SK: 'SK2', T: 'T1', E: 'ES13' },   // The Flayed
  'The Marrow King': { B: 'B6-3', SK: 'SK6-3', T: 'T1', E: 'ES12', G: 'G2' },   // Blood Moon
  'The Hollow King': { B: 'B0-1', SK: 'SK0-1', E: 'E4', IL: 'IL11-3', IR: 'IR10-3' },   // The Reaper
  'Gravemaw': { B: 'B14', SK: 'SK14', H: 'H2-1', E: 'ES8', M: 'MS11' },   // Gatormaw
  'The Tallboy': { B: 'B13', SK: 'SK13', E: 'ES23', IL: 'IL14', IR: 'IR1' },   // The Storm-Chained
  'Ossuary Prime': { B: 'B8', SK: 'SK8', T: 'T3', P: 'P3', E: 'ES20' },   // The Iron Husk
  'Rattle Lord': { B: 'B12', SK: 'SK12', E: 'ES11', M: 'MS8', IR: 'IR10-3' },   // The Rot Ghoul
  'The Marrowmancer': { B: 'B10', SK: 'SK10', H: 'HS16', E: 'E4', M: 'M7' },   // Emberbraid
  'Bonefather': { B: 'B0-1', SK: 'SK0-1', H: 'H7-2', E: 'E4', G: 'G1' },   // The Horned One
  'Calcite the Cruel': { B: 'B6-2', SK: 'SK6-2', P: 'P1', T: 'T2', E: 'ES8' },   // The Deep One
};

/* The pools every world encounter draws from, grouped the way the roster is:
 * a marsh den can only ever hand you something the marsh would keep. */
export const FAMILIES = {
  swamp: [
    { B: 'B14', SK: 'SK14', E: 'ES15', M: 'MS11', H: 'HS15', IR: 'IR8-2' },   // The Bog Wraith
    { B: 'B14', SK: 'SK14', H: 'H2-1', E: 'ES8', M: 'MS11' },   // Gatormaw
    { B: 'B4', SK: 'SK4', H: 'H2-2', E: 'ES8', M: 'MS11' },   // The Croc Prince
    { B: 'B14', SK: 'SK14', H: 'H5-3', E: 'ES15', M: 'MS11' },   // Mossback
    { B: 'B14', SK: 'SK14', M: 'MS10', E: 'ES11', H: 'HS15' },   // The Reedpiper
    { B: 'B6-1', SK: 'SK6-1', E: 'ES15', M: 'MS11', H: 'HS15' },   // Sporeback
    { B: 'B12', SK: 'SK12', E: 'ES11', M: 'MS8', IR: 'IR10-3' },   // The Rot Ghoul
    { B: 'B0-7', SK: 'SK1', E: 'ES14', M: 'MS11' },   // The Drowned
    { B: 'B14', SK: 'SK14', H: 'H6-1', E: 'ES15', M: 'MS12' },   // The Verdant
  ],
  fire: [
    { B: 'B10', SK: 'SK10', T: 'T6-2', H: 'HS16', E: 'E4' },   // Cinderskull
    { B: 'B10', SK: 'SK10', H: 'HS16', E: 'E4', M: 'M7' },   // Emberbraid
    { B: 'B10', SK: 'SK10', G: 'G10', E: 'E9' },   // Molten Maw
    { B: 'B11-2', SK: 'SK11-2', M: 'MS9', E: 'E4' },   // The Firecracker
    { B: 'B13', SK: 'SK13', E: 'ES23', IL: 'IL14', IR: 'IR1' },   // The Storm-Chained
    { B: 'B13', SK: 'SK13', H: 'HS18', IL: 'IL14', E: 'E7' },   // Stormcaller
    { B: 'B0-1', SK: 'SK15', M: 'M11', E: 'E4', H: 'HS14' },   // Ashfall
    { B: 'B10', SK: 'SK10', T: 'T3', IR: 'IR7-3', E: 'E4' },   // The Molten Knight
  ],
  crypt: [
    { B: 'B9', SK: 'SK9', E: 'ES11' },   // The Pale Wraith
    { B: 'B9', SK: 'SK9', M: 'MS3', E: 'ES11' },   // Gravefog
    { B: 'B16', SK: 'SK16', P: 'P2', E: 'ES11' },   // The Bound One
    { B: 'B16', SK: 'SK16', H: 'HS8', E: 'ES21', M: 'MS5' },   // The Bloom
    { B: 'B4', SK: 'SK4', E: 'ES17', H: 'HS14', IR: 'IR8-2' },   // The Gravedigger
    { B: 'B0-1', SK: 'SK0-1', E: 'E4', IL: 'IL11-3', IR: 'IR10-3' },   // The Reaper
    { B: 'B0-1', SK: 'SK0-1', H: 'HS13', E: 'E4', IR: 'IR7-3' },   // The Fallen
    { B: 'B0-2', SK: 'SK2', P: 'P2', E: 'ES11', M: 'MS5' },   // The Stitched Priest
    { B: 'B12', SK: 'SK12', G: 'G9', E: 'E4', IR: 'IR8-1' },   // The Gilded Ghoul
  ],
  demon: [
    { B: 'B0-1', SK: 'SK0-1', H: 'H7-2', E: 'E4', G: 'G1' },   // The Horned One
    { B: 'B0-2', SK: 'SK0-2', H: 'H7-1', E: 'ES11', G: 'G4' },   // The Bone-Horned
    { B: 'B0-1', SK: 'SK20', G: 'G9', E: 'E4', H: 'H7-2' },   // Goldjaw
    { B: 'B3-1', SK: 'SK3-1', H: 'H11-3', IR: 'IR7-3' },   // The Fox Oni
    { B: 'B0-1', SK: 'SK0-1', H: 'H11-1', E: 'E4', IR: 'IR10-3' },   // The Red Oni
    { B: 'B0-2', SK: 'SK0-2', H: 'H11-2', IL: 'IL11-3' },   // The White Fox
  ],
  flesh: [
    { B: 'B6-3', SK: 'SK6-3', T: 'T1', E: 'ES12', G: 'G2' },   // Blood Moon
    { B: 'B0-2', SK: 'SK2', T: 'T1', E: 'ES13' },   // The Flayed
    { B: 'B6-1', SK: 'SK6-1', T: 'T1', E: 'ES13' },   // The Green Mind
    { B: 'B6-2', SK: 'SK6-2', T: 'T1', E: 'ES20' },   // The Cold Mind
    { B: 'B6-3', SK: 'SK6-3', M: 'MS8', G: 'G2', IR: 'IR9-2' },   // Meatgrinder
  ],
  deep: [
    { B: 'B6-2', SK: 'SK6-2', P: 'P1', T: 'T2', E: 'ES8' },   // The Deep One
    { B: 'B3-2', SK: 'SK3-2', P: 'P1', T: 'T2', E: 'ES8' },   // The Tide Priest
    { B: 'B0-7', SK: 'SK1', E: 'ES20', M: 'MS2' },   // Frostbitten
    { B: 'B11-3', SK: 'SK11-3', E: 'ES9', M: 'MS2', G: 'GS3' },   // The Frost Fur
    { B: 'B0-7', SK: 'SK0-7', H: 'HS12', E: 'ES20', M: 'MS2' },   // The Frozen Saint
    { B: 'B18', SK: 'SK18', H: 'HS24', E: 'ES18' },   // The Sleeper
    { B: 'B6-2', SK: 'SK6-2', T: 'T3', P: 'P1', E: 'ES8' },   // The Sunken Knight
  ],
  iron: [
    { B: 'B8', SK: 'SK8', T: 'T3', P: 'P3', E: 'ES20' },   // The Iron Husk
    { B: 'B7', SK: 'SK7', T: 'T3', E: 'ES20', IR: 'IR7-1' },   // The Chrome Half
    { B: 'B0-1', SK: 'SK19', T: 'T3', IR: 'IR7-3', E: 'E4' },   // The Rune Knight
    { B: 'B19', SK: 'SK19', T: 'T3', IR: 'IR9-2', E: 'E4' },   // The Bonecrusher
    { B: 'B0-1', SK: 'SK0-1', H: 'HS2', IR: 'IR7-3', E: 'E4' },   // The Ronin
    { B: 'B12', SK: 'SK12', H: 'HS18', E: 'ES11', IR: 'IR10-2' },   // The Quiver
    { B: 'B19', SK: 'SK19', H: 'H8-2', E: 'E4', IR: 'IR9-2' },   // The Night Visor
  ],
  odd: [
    { B: 'B12', SK: 'SK12', H: 'H9', M: 'M8', E: 'ES21' },   // The Scarecrow
    { B: 'B11-2', SK: 'SK11-2', H: 'H5-1', E: 'ES8', G: 'G2' },   // The Pit Beast
    { B: 'B11-1', SK: 'SK11-1', H: 'H5-1', E: 'ES11', G: 'G4' },   // The Pelt Stalker
    { B: 'B14', SK: 'SK14', IL: 'IL2', E: 'ES16', M: 'MS11' },   // Marshmaul
    { B: 'B0-1', SK: 'SK0-1', H: 'HS6', E: 'ES12', IR: 'IR10-3' },   // The Crowned
  ],
};

// Den theme key (js/poi.js DEN_THEMES) -> the families that venue can host.
export const THEME_POOL = {
  marsh: ['swamp'],
  crypt: ['crypt'],
  chapel: ['crypt'],
  gate: ['iron'],
  catacomb: ['demon'],
  colosseum: ['odd', 'flesh'],
  spire: ['crypt', 'deep'],      // the five tower wardens
};

// Small stable hash. Same shape as poi.js's, kept local rather than imported so
// the roster has no dependencies and can be regenerated on its own.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* Gauntlet names repeat forever as "The Hollow King II, III...". Cycle 1 keeps
 * its fixed face; later cycles re-dress from the pools so rank 40 does not look
 * like rank 8. Returns { base, cycle }. */
const ROMAN = { II: 2, III: 3, IV: 4, V: 5, VI: 6 };
export function splitCycle(name) {
  const m = /^(.*) (II|III|IV|V|VI)$/.exec(String(name || ''));
  return m ? { base: m[1], cycle: ROMAN[m[2]] } : { base: String(name || ''), cycle: 1 };
}

// One outfit from the named families, chosen deterministically from `seed`.
export function themedLook(themeKey, seed) {
  const keys = THEME_POOL[themeKey];
  if (!keys) return null;
  const pool = keys.flatMap(k => FAMILIES[k] || []);
  return pool.length ? pool[hash(seed) % pool.length] : null;
}

/* The one entry point. A fixed-cast name wins; a repeat cycle re-dresses from
 * everything; anything else is left to the caller's own fallback. */
export function bossLook(name) {
  const { base, cycle } = splitCycle(name);
  if (cycle === 1) return LOOKS[base] || null;
  if (!LOOKS[base]) return null;
  const all = Object.values(FAMILIES).flat();
  return all[hash(`${base}:${cycle}`) % all.length];
}
