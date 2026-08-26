/* TOM'S 48px PIXEL CURRENCY, SNAPPED TO WHOLE STEPS.
   48 divides clean to 24, 16 and 12 and nothing else, so a request for 13 or 14
   gets served the nearest step DOWN that is still whole rather than resampled.
   12 is excluded on purpose: shown the render, Tom's verdict was "the 12 pixels
   look fucked but the others are decent", so 16 is the floor and anything below
   it keeps the vector, which still reads at 11px beside a line of text.

   IT LIVES HERE, NOT IN app.js, because app.js exports nothing and the daily
   wheel needed it too (Tom, 2026-08-17: "you missed changing the coins and
   currency icons in a lot of places ... like on the spinning daily wheel").
   icons-pack.js would have been the obvious home except it is generated from
   assets/icons-proposal by gen_icons.mjs, so anything hand-written in there is
   one regen away from gone.

   HELD, NOT MISSING: assets/icons-pix/boot.png is on disk and deliberately has
   no key in the table below, so nothing can ask for it yet. It sits OUTSIDE the
   literal because the inventory and precache audits scrape keys straight out of
   that block with a regex that also reads its comments, so a note written in
   there mints a phantom key and makes both guards demand a PRECACHE line for it.

   The boot was drawn to replace badge-signpost on the two `.den-walk` distance
   rows (openSpireInfoSheet / openDenSheet), where the signpost is both the wrong
   metaphor ("this way" on a row that means "you are this far off") and too dark
   to read. Measured off the RENDERED spire sheet at 440x956, against that row's
   real background of luminance 29:
     badge-signpost  peak 133, contrast 4.58:1,  5% of its ink above L100
     boot            peak 153, contrast 5.94:1, 11% of its ink above L100
     tombstone and badge-crown, the two icons in the SAME sheet: 12.7:1, 14.2:1
   So the boot is a third brighter than the signpost and still the second darkest
   of the 46 drawings, ~90 luminance points under the set's median peak, at under
   half the contrast of its own sheet-mates. The row is near-black and the boot is
   dark leather: swapping one smudge for a slightly better smudge is not the fix.
   Waiting on a highlight pass (leather and buckle metal into the 220s, same queue
   as potion-wind reading thin). When that art lands the swap is three lines: a
   `boot` key in the table, one PRECACHE line in sw.js, and the two
   `badgePixHtml('badge-signpost', 20)` calls in js/app.js.
   FOR WHOEVER WIRES IT: those rows ask 20 and pixCur snaps 20 DOWN to 16, so 16
   is the size that has to read, not 20. And boot has no vector twin in
   icons-pack, so a site below 16 renders nothing at all. */
const PIX_CUR = {
  coin: 'coin', dust: 'bone-dust', egg: 'egg', crate: 'crate',
  /* THE BASIC EGG, for the steps the egg STACK cannot survive. Tom, on the
     Boneyard's 24px rare marker: "egg stack looks bad scale that small use a
     basic one ive made from pixel lab", then "try this egg for the boneyard".
     It is his own PixelLab object "simple egg", copied byte for byte from
     tally-refs/pixellab/egg-simple-48.png. A SINGLE egg where `egg` is three
     stacked lobes. Only crateIcon's small steps ask for it; every site 48px and
     up still takes the stack, which Tom already signed off ("i feel like the
     step egg looks worse for the icon maybe we keep the egg icon").

     CHOSEN ON THE NUMBERS AT THE SIZE THAT RENDERS, not at 48. At 48 it has MORE
     colours than the stack (15 vs 11) which looks like the wrong direction, and
     that was the open question when it arrived. At 24, which is what the map
     asks for, it wins on both measures that decide legibility on a near-black
     basemap:
                            cols  ink  c/100ink  medianL  single-egg body
       simple egg    @24     12    199    6.0      234       14x17
       egg stack     @24      9    174    5.2      194       13x21
     Median luminance 234 against 194 is 21% brighter, and 14x17 is the biggest
     single egg of the candidates (the stack is only taller because it is three
     lobes, not because the subject is bigger). The 3 extra colours describe ONE
     ovoid instead of three overlapping ones, and it is the competing silhouettes
     inside 21px, not the colour count, that turned the stack to porridge. Same
     result at 16 (9 cols, medianL 234, body 11x12).
     A third candidate, PixelLab `egg-with-glow`, measured worse than both on
     brightness (medianL 176) and body (11x15) and was dropped. */
  'egg-basic': 'egg-basic',
  pit: 'pit', wardrobe: 'wardrobe', shop: 'shop', build: 'build',
  xp2: 'battle-charm', vigor: 'vigor-draught',
  stable: 'stable', kitchen: 'kitchen',
  /* keyed by the INGREDIENTS id so ingIconHtml can look it up directly. All
     seven now have drawn art; sites that ask under 16px still take the vector. */
  ectoplasm: 'ectoplasm',
  marrow: 'marrow', graveroot: 'graveroot', ember: 'ember',
  bog: 'bog', sinew: 'sinew', salt: 'salt',
  /* keyed by the SPAWN TYPE, not by an ingredient id, so spawnIcon('herbs')
     looks it up directly. A bundle of sprigs on purpose: the Herb patch is the
     food find and it does not know which of the seven it carries until you
     collect it, so it names the category and promises no particular one. */
  herbs: 'herbs',
  /* keyed by the RECIPES iconId so recipeIconHtml can look it up directly. */
  'dish-broth': 'dish-broth', 'dish-hash': 'dish-hash', 'dish-stew': 'dish-stew',
  'dish-skewer': 'dish-skewer', 'dish-fajita': 'dish-fajita',
  'dish-feast': 'dish-feast', 'dish-kibble': 'dish-kibble',
  /* THE POTIONS ARE KEYED BY POTION ID, not by one shared 'potion' key, so this
     table IS the record of which ones still share a drawing. Four have their own
     vial; the two ECTOPLASM potions do not and point at the shared one, which is
     visible here rather than hidden in a fallback branch. */
  'vital-tonic': 'potion-vital',      // heal        -> red
  'fury-flask': 'potion-fury',        // damage      -> orange
  stoneskin: 'potion-stone',          // shield      -> blue
  'second-wind': 'potion-wind',       // stamina     -> yellow
  'revenant-draught': 'potion',       // STILL DOUBLED with spectral-fury
  'spectral-fury': 'potion',          // STILL DOUBLED with revenant-draught
  /* the generic cookbook, for the empty pot's "pick a recipe" slot */
  recipe: 'recipe',
  /* the empty pot itself, which is what that slot actually shows. Tom, 2026-08-22:
     "swap the cookbook icon to a cauldron in the kitchen it doesnt currently read"
     as one. He picked the cold pot on 2026-08-24, and cold is the right one for
     that slot: the card next to it says "Empty pot". */
  cauldron: 'cauldron',
  tombstone: 'tombstone',
  /* keyed by the icons-pack id, so badgePixHtml can look it up directly. */
  'badge-skull': 'badge-skull', 'badge-trophy': 'badge-trophy',
  'badge-crown': 'badge-crown', 'badge-signpost': 'badge-signpost',
  'badge-footprint': 'badge-footprint',
  /* the general marks. `bolt` serves BOTH ICONS.boltIco and ICONS.boltStroke,
     which were two drawings of one idea. */
  star: 'star', bone: 'bone', paw: 'paw', bolt: 'bolt', sparkle: 'sparkle',
  /* THE WELLNESS SET, 2026-08-26. Water and the bed are the two Daily wellness
     rows, the moon is the sleep row, the scroll is the QUESTS header and the
     dumbbell is anything fitness: the Apple Health workout row and the Trends
     door on Today. Every site asks 24, which is a whole step, so none of them
     falls through to the vector it replaced. */
  water: 'water', bed: 'bed', moon: 'moon', scroll: 'scroll', dumbbell: 'dumbbell',
};
export function pixCur(kind, s) {
  const f = PIX_CUR[kind];
  if (!f) return null;
  const px = s >= 48 ? Math.floor(s / 48) * 48 : s >= 24 ? 24 : s >= 16 ? 16 : 0;
  if (!px) return null;   // under 16: the vector is genuinely better
  return `<img src="assets/icons-pix/${f}.png" alt="" class="ico pix-cur" width="${px}" height="${px}"`
    + ` style="width:${px}px;height:${px}px" decoding="sync">`;
}
