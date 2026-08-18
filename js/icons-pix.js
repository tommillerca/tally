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
   one regen away from gone. */
const PIX_CUR = {
  coin: 'coin', dust: 'bone-dust', egg: 'egg', crate: 'crate',
  pit: 'pit', wardrobe: 'wardrobe', shop: 'shop', build: 'build',
  xp2: 'battle-charm', vigor: 'vigor-draught',
};
export function pixCur(kind, s) {
  const f = PIX_CUR[kind];
  if (!f) return null;
  const px = s >= 48 ? Math.floor(s / 48) * 48 : s >= 24 ? 24 : s >= 16 ? 16 : 0;
  if (!px) return null;   // under 16: the vector is genuinely better
  return `<img src="assets/icons-pix/${f}.png" alt="" class="ico pix-cur" width="${px}" height="${px}"`
    + ` style="width:${px}px;height:${px}px" decoding="sync">`;
}
