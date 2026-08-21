/* THE WANDERER, OUT IN THE BONEYARD.
 *
 * He already exists in the Gauntlet (js/pit.js, WANDERER_EVERY = 13) as the
 * rarest and hardest rung on the ladder. Nothing put him on the walking map.
 * This module is the whole of his map presence, and it is deliberately tiny:
 * app.js already draws `foeCfg.wanderer` from Cam's plate in the arena, so
 * bringing him outside costs a spawn rule and a fight config, no new art, no
 * new CSS and no new marker.
 *
 * WHICH THING ON THE MAP IS HIM. The Mimic hijacks a buried crate. The Wanderer
 * hijacks the RARE spawn: the Step Egg, the scarcest find in the Boneyard and
 * the front of the pet pipeline. That pairing is the design in one line: the
 * rarest boss guards the rarest thing, and the reward for beating him is the egg
 * he was standing on. Measured off the real generator: a rare surfaces on 8% of
 * cell-instances and one rare in four is him, so he lands on 2% of them against
 * the Mimic's 11.9%, i.e. about six times rarer than the Mimic. He stays the
 * rarest thing a player meets, exactly as he is on the ladder.
 *
 * Cam's art is not altered anywhere in here. He is the plate, as drawn.
 */

/* Small stable hash, kept local rather than imported, for the same reason
   js/mimic.js keeps one: this runs on the Boneyard's hot path and has no
   business importing hunt.js (game.js, loot.js, nutrition.js behind it) to
   reach nine lines. */
function hash(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// one RARE spawn in every WANDERER_SHARE has somebody standing over it
export const WANDERER_SHARE = 4;

/* IS SOMEBODY STANDING ON THIS EGG? DERIVED, NEVER ROLLED.
 *
 * Same rule as isMimicSpawn, and for the same reason: this is a money path, so
 * the property that matters is not "one in four", it is that THE ANSWER NEVER
 * CHANGES. A `Math.random()` at tap time gives a perfect share and an egg that
 * is guarded, then free, then guarded again across three of the map's 5-second
 * refreshWorld passes. So it is a pure function of the spawn's own id, which
 * js/hunt.js builds as `${cx}_${cy}_rare_i${inst}`: every device computes the
 * same answer for the same egg, offline, forever, with nothing stored and
 * nothing to desync.
 *
 * The id also buys the re-roll for free. When the rare slot rolls to its next
 * 45-minute instance the id changes, so the spot decides again on its own.
 *
 * Only `rare`, never `crate`: a chest that bites is the Mimic's, and the two
 * predicates are disjoint by spawn type rather than by luck. Asserted in
 * tests/wanderer-boneyard-audit.mjs (EXCLUSIVE).
 */
export function isWandererSpawn(spawn) {
  return !!spawn && spawn.type === 'rare' && hash(`wanderer:${spawn.id}`) % WANDERER_SHARE === 0;
}

/* WHAT HE IS WORTH, AND WHAT HE COSTS, BOTH MEASURED.
 *
 * The multiplier is not read off his Gauntlet line. On the ladder his 1.45x is
 * a RELATIVE step over the ordinary curve; on the map the multiplier is
 * absolute, so the same number means a different fight and had to be measured
 * as one. Driven through the real engine (tests/fight-sim.mjs's policy, 120
 * seeds, elemental tree, aiLevel 5) at the map's own scale:
 *
 *   the Mimic, shipped, 1.15x flat        50.8% player win
 *   the Wanderer at 1.25x                 30.0%
 *   the Wanderer at 1.45x                 14.2%   <- shipped
 *   the Wanderer at 1.6x                   8.3%
 *   the Glutton, shipped, 1.3x + slab      5.0%
 *   top landmark den, 1.32x + slab         5.0%
 *
 * So he is by a distance the hardest ambush on the map and still short of the
 * day's world boss. That last gap is a product call, not an accident: the
 * Glutton is a scheduled destination you choose, while this is a fight that
 * jumps a player who walked over for an egg, and a 5% wall on an egg is a
 * mugging. If Tom wants him at Glutton parity it is one number: 1.7.
 *
 * THE TREE IS THE IDENTITY, exactly as on the ladder: he always brings the
 * elemental set, because the lantern is the whole drawing. You learn that the
 * Wanderer burns you, and you can come back dressed for it. It is spelled out
 * here rather than imported because pit.js does not export ENDLESS_TREES.
 */
export const WANDERER_FIGHT = {
  mult: 1.45,
  aiLevel: 5,
  talents: ['frostbolt', 'firebolt', 'totemic', 'frostbite', 'wildfire', 'tempest'],
  xp: 150,
  coins: 200,
};
