/* Football kit, 2026-09-04. Thirty-two invented teams, five garments drawn once
 * by Cam and tinted per team at runtime, and the three switches Tom flips.
 *
 * NO IMPORTS ON PURPOSE. data/boneheadz.js spreads FOOTBALL_ITEMS into its
 * catalogue, so this file cannot reach back into it without a cycle. Everything
 * here is plain data plus pure functions over an outfit object.
 *
 * THE MODEL, and why it is the smaller one. One master PNG per garment
 * (assets/bh/football/<garment>.png, written by scripts/football-masks.py) plus
 * two alpha masks; a team is two hex colours; an ITEM is team x garment with a
 * stable id `fb-<team>-<garment>`. The renderer draws the master and then two
 * multiply layers, one per mask, filled with the team's colours (the .wpn-sheen
 * mechanism in app.css, alpha mask over the stack). So 32 teams cost eight PNG
 * triplets, not 256 PNGs, and a new team is one row below.
 *
 * VISORS ARE FOUR ITEMS, NOT ONE ITEM WITH AN OPTION. Cam delivered the helmet
 * open-faced plus three visor darknesses. A "visor sub-option" would need a new
 * saved preference, a control in the wardrobe and a branch in every renderer; four
 * items in slot H need none of that, because picking among items in a slot is
 * what the wardrobe already does. The data is generated, so 128 helmet rows cost
 * nothing to maintain. Buying the helmet grants all four (footballGrantIds), so
 * the player never pays four times for one hat.
 *
 * THE FLAGS. FOOTBALL_KIT_LIVE=false marks every item `unreleased`, which is the
 * catalogue's existing gate: BH_ITEMS (the rack's rotating pool, the crate pool,
 * gear derivation, the Looks tab, random splash outfits) never sees them, while
 * BH_BY_ID still resolves them so an owned piece renders and previews. The shop
 * shelf is gated on the same flag directly. FOOTBALL_KIT_PRICE_PLACEHOLDER is
 * null until Tom names a number: tests/football-kit-audit.mjs refuses a live kit
 * with no price, and buyFootballItem refuses a non-finite one, the same way
 * buyRackItem does. */
export const FOOTBALL_KIT_LIVE = false;                 // Tom flips this to sell the kit
export const FOOTBALL_KIT_PRICE_PLACEHOLDER = null;     // coins per garment tile; Tom decides the number

/* THE VISOR AND THE EYES. The visor helmets keep the E slot drawn and pickable:
 * measured over all 36 eye items composited under the darkest visor, 33 sit
 * entirely inside the helmet-plus-glass silhouette and read through the tint.
 * Three project past it and would poke through the glass:
 *   E11-1 Red Lasers   2068 px escape at 640    E11-2 Blue Lasers  2089 px
 *   ES22  Rainbow Band  479 px escape
 * 'hide'   (default) draw the helmet, skip the E layer for those three
 * 'refuse' equip() refuses the eyes while a visor helmet is worn, and the
 *          visor while those eyes are worn, with reason 'visor'
 * Tom flips the one word. Both branches are guarded in tests/football-kit-audit.mjs. */
export const VISOR_EYES_POLICY = 'hide';
export const VISOR_BLOCKED_EYES = new Set(['E11-1', 'E11-2', 'ES22']);

/* THIRTY-TWO TEAMS. Invented places and mascots in the Boneheadz register, no
 * real league's cities or names. `a` is the primary (the helmet shell, the
 * jersey numbers, the cleats), `b` the secondary (the helmet stripe and badge,
 * the jersey trim). Checked, not asserted: primaries pairwise CIE76 dE >= 12
 * (min 12.5) so two shells read apart at 24px, and a/b WCAG contrast >= 3:1
 * (min 3.02). Eight alternates live in docs/FOOTBALL-KIT.md. */
export const FOOTBALL_TEAMS = [
  { id: 'boneyard-bruisers',      name: 'Boneyard Bruisers',      a: '#14213D', b: '#F2C14E' },
  { id: 'hollow-howlers',         name: 'Hollow Howlers',         a: '#4B2C83', b: '#9BE564' },
  { id: 'marrow-mammoths',        name: 'Marrow Mammoths',        a: '#7A2E2E', b: '#F1E3C6' },
  { id: 'gravel-gulls',           name: 'Gravel Gulls',           a: '#9AA3AB', b: '#2B2F33' },
  { id: 'ember-coast-kilns',      name: 'Ember Coast Kilns',      a: '#C8401F', b: '#FFD27F' },
  { id: 'rustwater-rats',         name: 'Rustwater Rats',         a: '#8C4A1E', b: '#B9E2F5' },
  { id: 'cinderfall-crows',       name: 'Cinderfall Crows',       a: '#1B1B1F', b: '#E84C3D' },
  { id: 'saltmarsh-serpents',     name: 'Saltmarsh Serpents',     a: '#1E6B4E', b: '#F7E27A' },
  { id: 'ironhaven-anvils',       name: 'Ironhaven Anvils',       a: '#5B6B7F', b: '#F4F4F4' },
  { id: 'frostbite-foxes',        name: 'Frostbite Foxes',        a: '#FF7F3F', b: '#1B2A3A' },
  { id: 'thornback-toads',        name: 'Thornback Toads',        a: '#5B7A1E', b: '#FFB7C5' },
  { id: 'duskmoor-moths',         name: 'Duskmoor Moths',         a: '#7D6BA0', b: '#F4E9D8' },
  { id: 'copperhill-cobras',      name: 'Copperhill Cobras',      a: '#B5651D', b: '#1E2D2B' },
  { id: 'peatbog-pikes',          name: 'Peatbog Pikes',          a: '#3E4A1F', b: '#E7D98A' },
  { id: 'lanternlight-lynx',      name: 'Lanternlight Lynx',      a: '#E0912A', b: '#2B2118' },
  { id: 'stormgate-stags',        name: 'Stormgate Stags',        a: '#2C5D8F', b: '#F0F0F0' },
  { id: 'sootvale-salamanders',   name: 'Sootvale Salamanders',   a: '#4D4D4D', b: '#FF8A3D' },
  { id: 'brightwater-barracudas', name: 'Brightwater Barracudas', a: '#007C80', b: '#FFE066' },
  { id: 'nettlewood-nightjars',   name: 'Nettlewood Nightjars',   a: '#2E4A3F', b: '#D9B8FF' },
  { id: 'quarry-hill-quakes',     name: 'Quarry Hill Quakes',     a: '#4E3A52', b: '#FFD166' },
  { id: 'mudflat-minotaurs',      name: 'Mudflat Minotaurs',      a: '#8B5E3C', b: '#F5D6A8' },
  { id: 'windrow-wasps',          name: 'Windrow Wasps',          a: '#F9DC1A', b: '#1C1C1C' },
  { id: 'shalebank-skates',       name: 'Shalebank Skates',       a: '#2F6F7E', b: '#8FE3CF' },
  { id: 'tallow-creek-tusks',     name: 'Tallow Creek Tusks',     a: '#3B2A20', b: '#EADBC8' },
  { id: 'gallows-reach-ghouls',   name: 'Gallows Reach Ghouls',   a: '#D8CFA8', b: '#1E5A3A' },
  { id: 'hexley-hexes',           name: 'Hexley Hexes',           a: '#8E2A6B', b: '#FFD9EC' },
  { id: 'old-kiln-kestrels',      name: 'Old Kiln Kestrels',      a: '#A33A2A', b: '#F7C59F' },
  { id: 'pinebarrow-badgers',     name: 'Pinebarrow Badgers',     a: '#F4F4F0', b: '#222222' },
  { id: 'rimefall-rooks',         name: 'Rimefall Rooks',         a: '#7FB3D5', b: '#15243B' },
  { id: 'bramblegate-bison',      name: 'Bramblegate Bison',      a: '#5E3517', b: '#E4A34A' },
  { id: 'lowmarsh-lurkers',       name: 'Lowmarsh Lurkers',       a: '#7FA07A', b: '#1F3A2A' },
  { id: 'glasswater-gannets',     name: 'Glasswater Gannets',     a: '#3A8FC7', b: '#FFFFFF' },
];
export const FOOTBALL_TEAM_BY_ID = Object.fromEntries(FOOTBALL_TEAMS.map(t => [t.id, t]));

/* THE GARMENTS. `file` is the master's stem under assets/bh/football/ and must
 * match scripts/football-masks.py GARMENTS. `sold` marks the shop tiles: the
 * three visors ride along with the helmet (see footballGrantIds). `pets` is the
 * species a pet garment is drawn for: Cam positioned the lizard pieces on the
 * C4 Beardie, and CX (Day One Lizard) is C4 recoloured at the same bbox
 * (data/boneheadz.js PET_CROP), so both wear them. CH/CT are pet slots declared
 * in PET_SLOTS beside CE/CB/CG/CM; they are NOT in BH_SLOTS, so the player's
 * stack never paints them (tests/pet-accessory-lint.mjs row BH-SLOTS). */
export const FOOTBALL_PETS = ['C4', 'CX'];
export const FOOTBALL_GARMENTS = [
  { key: 'helmet',     slot: 'H',  label: 'Helmet',        sold: true },
  { key: 'visor25',    slot: 'H',  label: 'Light Visor' },
  { key: 'visor60',    slot: 'H',  label: 'Smoke Visor' },
  { key: 'visor90',    slot: 'H',  label: 'Dark Visor' },
  { key: 'jersey',     slot: 'T',  label: 'Jersey',        sold: true },
  { key: 'cleats',     slot: 'FW', label: 'Cleats',        sold: true },
  { key: 'pet-helmet', slot: 'CH', label: 'Lizard Helmet', sold: true, pets: FOOTBALL_PETS },
  { key: 'pet-jersey', slot: 'CT', label: 'Lizard Jersey', sold: true, pets: FOOTBALL_PETS },
];
export const FOOTBALL_ART = 'assets/bh/football/';
export const footballItemId = (teamId, key) => `fb-${teamId}-${key}`;

/* Rarity is a label here (tile border, Looks ordering): kits sell at one flat
 * price and never derive gear (js/gear.js skips `football`), so it buys nothing. */
export const FOOTBALL_RARITY = 'epic';
export const FOOTBALL_ITEMS = FOOTBALL_TEAMS.flatMap(t => FOOTBALL_GARMENTS.map(g => ({
  id: footballItemId(t.id, g.key),
  slot: g.slot,
  rarity: FOOTBALL_RARITY,
  name: `${t.name} ${g.label}`,
  file: `${FOOTBALL_ART}${g.key}.png`,
  football: { team: t.id, garment: g.key },
  ...(g.pets ? { pets: g.pets } : {}),
  ...(FOOTBALL_KIT_LIVE ? {} : { unreleased: true }),
})));

/* The two multiply layers a football item needs on top of its master, or null
 * for anything else. Order matters only in that both sit above the master. */
export function footballTints(item) {
  if (!item || !item.football) return null;
  const t = FOOTBALL_TEAM_BY_ID[item.football.team];
  const stem = `${FOOTBALL_ART}${item.football.garment}`;
  return [{ mask: `${stem}.mask-a.png`, hex: t.a }, { mask: `${stem}.mask-b.png`, hex: t.b }];
}

/* What a shop tile hands over: the helmet tile grants its three visors too. */
export function footballGrantIds(itemId) {
  const it = FOOTBALL_ITEMS.find(i => i.id === itemId);
  if (!it) return [];
  if (it.football.garment !== 'helmet') return [itemId];
  return ['helmet', 'visor25', 'visor60', 'visor90'].map(k => footballItemId(it.football.team, k));
}

const isVisor = id => typeof id === 'string' && /^fb-.+-visor\d+$/.test(id);
/* The eye item an outfit's visor would clash with, or null. Pure over the
 * outfit so both policies below test without a store. */
export function visorEyeConflict(eq) {
  return eq && isVisor(eq.H) && VISOR_BLOCKED_EYES.has(eq.E) ? eq.E : null;
}
export const visorHidesEyes = (eq, policy = VISOR_EYES_POLICY) => policy === 'hide' && !!visorEyeConflict(eq);
export const visorRefusesEquip = (eq, policy = VISOR_EYES_POLICY) => policy === 'refuse' && !!visorEyeConflict(eq);
