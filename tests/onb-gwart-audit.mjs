/* GWART MEETS THE NEW PLAYER, AND THIS PROVES A NEW PLAYER ACTUALLY SEES HIM.
 *
 * Tom, 2026-08-20: "Gwart's animation in the onboarding". Landed 2026-08-30.
 * Two traps this file exists to hold shut:
 *   1. renderOnboarding does not route: it latches the shell itself. The v370
 *      TestFlight blank-screen bug lives on this exact path, so every row here
 *      runs on a FRESH boot of the PLAIN url. boot()'s default url carries
 *      ?demo, and ?demo seeds settings, which SKIPS onboarding entirely: an
 *      earlier probe of this feature read "fresh boot" state off a seeded demo
 *      for a full round because of that default.
 *   2. Today's .gw-row is position:absolute against the hero island. The first
 *      cut of this feature inherited that pin and parked the talk box on top
 *      of the headline while the wizard collapsed to 0x0 offscreen, and the
 *      DOM-presence probe said gwart:true the whole time. So the rows below
 *      measure RECTS, not presence.
 */
import { boot, sleep } from './godmode.js';

let fails = 0;
const ok = (n, pass, d = '') => { console.log(`${pass ? 'PASS ' : 'FAIL '} ${n}${d ? '  | ' + d : ''}`); if (!pass) fails++; };

/* the gate's URL contract: grade THE GATE'S served tree, never a default
   (a bare boot is how melt-ui graded production once). The plain origin is
   still derived from it, because ?demo seeds settings and skips onboarding. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
try {
  const origin = await page.evaluate(() => location.origin);
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });   // PLAIN url: the real empty db
  await sleep(3200);

  const g = await page.evaluate(() => {
    const r = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const img = document.querySelector('.onb-gwrow .wz-body img');
    const box = document.querySelector('.onb-gwrow .talkbox');
    const h1 = document.querySelector('.onb h1');
    const ov = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    return { onb: !!document.querySelector('.onb'),
      img: img ? r(img) : null, box: box ? r(box) : null,
      overlap: img && box && h1 ? ov(r(box), r(h1)) : null,
      inView: img ? (r(img).w > 20 && r(img).y > 0 && r(img).y + r(img).h < innerHeight) : false };
  });
  ok('FRESH a plain-url boot with an empty db lands on onboarding', g.onb, JSON.stringify({ onb: g.onb }));
  ok('GWART his portrait is drawn at size, on screen (a 0x0 img is absence wearing a truthy selector)',
    g.inView, JSON.stringify(g.img));
  ok('CLEAR his talk box does not sit on the headline (the inherited hero pin did exactly that)',
    g.overlap === false, `overlap=${g.overlap}`);

  await sleep(2000);
  const typed = await page.evaluate(() => document.querySelector('.onb-gwrow .tb-txt')?.textContent || '');
  ok('SPEAKS the box typed a real line through the app talkbox', typed.length > 20 && /Gwart/i.test(typed), JSON.stringify(typed));

  // the funnel still works with him in it, and step 2 gets his coaching line
  await page.evaluate(() => document.querySelector('#onbGo')?.click()); await sleep(700);
  const s1 = await page.evaluate(() => ({ h1: document.querySelector('.onb h1')?.textContent || '', gw: !!document.querySelector('.onb-gwrow') }));
  ok('REVEAL step 1 stays his moment, not Gwart\'s (the fuller Gwart reveal is the parked Raising)', /YOURS/.test(s1.h1) && !s1.gw, JSON.stringify(s1));
  await page.evaluate(() => document.querySelector('#onbMe')?.click()); await sleep(2600);
  const s2 = await page.evaluate(() => ({ gw: !!document.querySelector('.onb-gwrow .wz-body img'), typed: document.querySelector('.onb-gwrow .tb-txt')?.textContent || '', form: !!document.querySelector('#pfHost') }));
  ok('COACH step 2 has him beside the form, speaking', s2.gw && s2.form && s2.typed.length > 20, JSON.stringify({ ...s2, typed: s2.typed.slice(0, 30) }));
  await page.evaluate(() => document.querySelector('#onbSkip')?.click()); await sleep(2400);
  const done = await page.evaluate(() => ({ today: !!document.querySelector('#dayRest'), tab: getComputedStyle(document.querySelector('#tabbar')).display }));
  ok('LATCH the funnel completes to Today with the tab bar back (the shell latch survived him)', done.today && done.tab !== 'none', JSON.stringify(done));
} finally {
  await browser.close();
}
console.log(fails ? `\nonb-gwart: ${fails} FAILED` : '\nonb-gwart: clean');
process.exit(fails ? 1 : 0);
