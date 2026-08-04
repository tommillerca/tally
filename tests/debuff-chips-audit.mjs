/* Tapping a debuff chip must explain it. Failure = a chip that swallows the tap. */
import { boot, sleep, click } from './godmode.js';
const { browser, page } = await boot(process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

// open any fight, then put real statuses on both fighters through the engine
await page.evaluate(() => { window.__openGlutton && window.__openGlutton(); });
await sleep(1500);
await page.evaluate(() => document.getElementById('gluttonFight')?.click());
await sleep(2500);
const live = await page.evaluate(() => !!window.__bhFight);
check('a fight is open', live);
const chips = await page.evaluate(async () => {
  // Bone Guard gives the player a ward chip through a REAL action, no poking at
  // internals: ward is the one status you can always self-apply.
  const btn = [...document.querySelectorAll('button')].find(b => /bone guard/i.test(b.textContent));
  if (btn) btn.click();
  await new Promise(r => setTimeout(r, 900));
  return [...document.querySelectorAll('.fchip')].map(c => ({
    tag: c.tagName, det: (c.dataset.det || '').slice(0, 40), cls: c.className,
  }));
});
console.log('chips on the plates:', JSON.stringify(chips));
// Apple's minimum is 44pt. A chip smaller than that is not "unclickable code",
// it is a target you keep missing with a thumb, which is what a player reports as
// "I can't click it".
const size = await page.evaluate(() => {
  const c = document.querySelector('.fchip');
  const r = c.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  // probe outward from the centre: how far can a thumb land and still hit it?
  let up = 0, down = 0;
  for (let d = 1; d < 40; d++) { if (document.elementFromPoint(cx, cy - d)?.closest('.fchip') === c) up = d; else break; }
  for (let d = 1; d < 40; d++) { if (document.elementFromPoint(cx, cy + d)?.closest('.fchip') === c) down = d; else break; }
  return { visualW: Math.round(r.width), visualH: Math.round(r.height), hitH: up + down + 1 };
});
console.log('chip tap target:', JSON.stringify(size));
check('the chip HIT AREA is big enough for a thumb (>=36px tall)', size.hitH >= 36, JSON.stringify(size));
check('at least one status chip is showing', chips.length > 0, `${chips.length} chips`);
check('every chip carries an explanation', chips.length > 0 && chips.every(c => c.det.length > 5), JSON.stringify(chips));

const res = await page.evaluate(async () => {
  const c = document.querySelector('.fchip');
  const r = c.getBoundingClientRect();
  // a REAL tap at the chip's centre, and then look for the tooltip the app builds
  c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  await new Promise(r2 => setTimeout(r2, 500));
  const tip = document.querySelector('.fchip-tip');
  if (!tip) return { tip: null, why: 'no .fchip-tip element exists' };
  const cs = getComputedStyle(tip), tr = tip.getBoundingClientRect();
  return {
    tip: tip.textContent.trim().slice(0, 70),
    hidden: tip.hidden,
    visible: !tip.hidden && cs.visibility !== 'hidden' && +cs.opacity > 0.01 && tr.width > 0 && tr.height > 0,
    onScreen: tr.top >= 0 && tr.bottom <= innerHeight && tr.left >= 0 && tr.right <= innerWidth,
    rect: { t: Math.round(tr.top), l: Math.round(tr.left), w: Math.round(tr.width), h: Math.round(tr.height) },
    expected: (c.dataset.det || '').slice(0, 40),
  };
});
console.log('after tapping a chip:', JSON.stringify(res));
check('tapping a chip opens its explanation', !!res.tip, JSON.stringify(res));
check('and that explanation is actually VISIBLE', !!res.visible, JSON.stringify(res));
check('and it is on screen, not off the edge', !!res.onScreen, JSON.stringify(res.rect));
check('and it says the right thing', !!res.tip && res.tip.includes(res.expected.split(':')[0]), `${res.tip} vs ${res.expected}`);
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nDEBUFF CHIPS EXPLAIN THEMSELVES');
process.exit(bad ? 1 : 0);
