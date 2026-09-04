/* THE FULL DRIP BADGE COUNTS THE LOOK THE PLAYER WEARS, NOT A KV THE WARDROBE
 * STOPPED BEING THE ONLY WRITER OF.
 *
 * QA round 23 F4. `drip-6` ("Have 6 or more slots equipped at once") counted the
 * keys of kv `equipped` (js/game.js buildStats). The Dressing Room writes kv
 * `transmog`, and equipped() in js/loot.js is where the two are resolved into the
 * look every renderer draws. So a slot HIDDEN in the Dressing Room still counted
 * as drip, and transmogging every slot moved no counter the badge could see. The
 * fix has buildStats read equipped(), the same resolution as the doll.
 *
 * ROWS:
 *   CONTROL  six non-default slots worn, nothing transmogged: counter 8 (the six
 *            plus body and skull, which are always on), drip-6 true. Same on the
 *            old and the new path; this is the row that proves the seed is real.
 *   SWAP     one slot transmogged to another collected look: still 8. A swap
 *            changes the picture, not how many slots show something. Guards
 *            against an over-correction that counts transmog entries.
 *   HIDDEN   three slots hidden with TRANSMOG_HIDE: the counter reads 5 (three
 *            visible plus two always-on), matching equipped() exactly, and drip-6
 *            is no longer earned. THIS is the row that is red on the old path,
 *            which reads 8 whatever is hidden.
 *   AGREE    at every step the counter equals the number of slots equipped()
 *            returns, minus none: the badge and the doll cannot drift.
 *
 * PROVE-RED: on integ/playtest-round-a 4ae69081 (the tip before the fix) HIDDEN
 * reads 8 and AGREE reads 8 vs 5; both red. Green with the fix in js/game.js.
 *
 * PURE: node only, no browser, about 1s.   node tests/drip-badge-audit.mjs
 */
import './mem-idb.mjs';   // installs globalThis.indexedDB before js/db.js opens it

const { kvSet, useDbName } = await import('../js/db.js');
const g = await import('../js/game.js');
const loot = await import('../js/loot.js');
const { BH_ITEMS, BH_SLOTS } = await import('../data/boneheadz.js');
useDbName('drip-badge-audit');

const out = [];
let fails = 0;
const ok = (m, cond, detail = '') => {
  if (cond) out.push(`ok   ${m}${detail ? '  ' + detail : ''}`);
  else { fails++; out.push(`FAIL ${m}${detail ? '  ' + detail : ''}`); }
};

/* Six real non-default slots, each holding a real item for that slot, straight
   into the kv the way equip() writes it (no ownership needed for a read). Six
   because drip-6's threshold is six (QA round 23 F4, 2026-09-03: "transmogging
   all eight slots moves no counter"); the three hidden below take it under. */
const defaults = new Set(BH_SLOTS.filter(s => s.default).map(s => s.code));
const SLOTS = ['H', 'E', 'M', 'T', 'P', 'G'];
const firstFor = slot => BH_ITEMS.find(i => i.slot === slot && !i.default);
const worn = {};
for (const s of SLOTS) worn[s] = firstFor(s).id;
await kvSet('equipped', worn);
const alt = BH_ITEMS.find(i => i.slot === 'H' && !i.default && i.id !== worn.H);

const visible = async () => Object.keys(await loot.equipped()).filter(k => !defaults.has(k)).length + 2;
const counter = async () => (await g.buildStats()).equippedSlots;

ok('SETUP six non-default slots hold a real item each, and a second hat exists to swap to',
  Object.keys(worn).length === 6 && Object.values(worn).every(Boolean) && !!alt, JSON.stringify(worn));

let c = await counter();
ok('CONTROL six worn, nothing transmogged: counter 8, drip-6 earned', c === 8 && g.badgeCheck('drip-6', { equippedSlots: c }), `counter ${c}`);
ok('AGREE (control) counter equals the resolved look', c === await visible(), `${c} vs ${await visible()}`);

await kvSet('transmog', { H: alt.id });
c = await counter();
ok('SWAP a slot swapped to another look: still 8 (a swap changes the picture, not the count)', c === 8, `counter ${c} with H -> ${alt.id}`);
ok('AGREE (swap) counter equals the resolved look', c === await visible(), `${c} vs ${await visible()}`);

await kvSet('transmog', { H: loot.TRANSMOG_HIDE, E: loot.TRANSMOG_HIDE, M: loot.TRANSMOG_HIDE });
c = await counter();
const vis = await visible();
ok('HIDDEN three slots hidden in the Dressing Room: counter 5, drip-6 no longer earned', c === 5 && !g.badgeCheck('drip-6', { equippedSlots: c }),
  `counter ${c} (old path reads 8: it counted kv equipped, which transmog never touches)`);
ok('AGREE (hidden) counter equals the resolved look', c === vis, `${c} vs ${vis}`);

console.log(out.join('\n'));
console.log(fails ? `\n${fails} FAILED` : '\nthe Full drip badge counts what the player wears');
process.exit(fails ? 1 : 0);
