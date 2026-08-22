/* MOCKUP capture for the Option B Today rework (branch x425/mockup-today-b).
 * Serves THIS tree, boots ?demo, seeds a level, and captures three shots per
 * variant at iPhone dimensions: top of Today, the strip + sections mid-scroll,
 * and the condensed pinned strip deep in the scroll. Asserts the page really is
 * the variant it claims (body class, strip present, nudge gone, cond state)
 * before every capture, so a stale draft cannot pose as a variant. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveTree, boot, seed, dismissOverlays, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_feedback_shots', 'today-b');
fs.mkdirSync(OUT, { recursive: true });

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

const srv = await serveTree(ROOT);
const { browser, page, errors } = await boot(srv.url);
await seed(page, { level: 8 });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

for (const v of ['1', '2', '3']) {
  await page.goto(`${srv.url}?demo&mockb=${v}`, { waitUntil: 'networkidle2' });
  await sleep(2200);
  /* The overlay sweep can click a quest Claim and ride its reward flow off
     Today; a second load arrives with the overlays already claimed and lands
     clean on Today. */
  await dismissOverlays(page);
  await page.goto(`${srv.url}?demo&mockb=${v}`, { waitUntil: 'networkidle2' });
  await sleep(2200);

  const st = await page.evaluate(() => ({
    body: document.body.className,
    strip: !!document.querySelector('#tsum'),
    thirds: !!document.querySelector('.tsum.thirds'),
    nudge: !!document.querySelector('#unlockNudge'),
    quests: !!document.querySelector('.q-collapse'),
    tsecs: document.querySelectorAll('.tsec').length,
    ringCard: !!document.querySelector('.ring-card'),
  }));
  check(st.body.includes('mockb' + v), `b${v}: body carries mockb${v} (got "${st.body}")`);
  check(st.strip, `b${v}: summary strip present`);
  check(st.thirds === (v === '2'), `b${v}: strip density matches variant (thirds=${st.thirds})`);
  check(!st.nudge, `b${v}: unlock nudge gone`);
  check(st.quests, `b${v}: quests present`);
  check(st.tsecs >= 3, `b${v}: ${st.tsecs} uniform sections rendered`);
  check(!st.ringCard, `b${v}: old ring-card gone`);

  // (a) top of Today
  await page.evaluate(() => { document.querySelector('.screen').scrollTop = 0; });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, `b${v}-1-top.png`) });

  // (b) the strip expanded with the sections arriving under it
  const pinTop = await page.evaluate(() => document.querySelector('#tsumPin').offsetTop);
  await page.evaluate(t => { document.querySelector('.screen').scrollTop = t; }, Math.max(0, pinTop - 200));
  await sleep(700);
  const condB = await page.evaluate(() => document.querySelector('#tsum').classList.contains('cond'));
  check(!condB, `b${v}: strip EXPANDED in mid-scroll shot`);
  await page.screenshot({ path: path.join(OUT, `b${v}-2-sections.png`) });

  // (c) deep scroll: the strip pinned + condensed over the meals
  await page.evaluate(t => { document.querySelector('.screen').scrollTop = t + 700; }, pinTop);
  await sleep(700);
  const condC = await page.evaluate(() => document.querySelector('#tsum').classList.contains('cond'));
  check(condC, `b${v}: strip CONDENSED while scrolled`);
  await page.screenshot({ path: path.join(OUT, `b${v}-3-condensed.png`) });
}

check(errors.length === 0, `no page errors (${errors.length ? errors.join(' | ') : 'clean'})`);
await browser.close();
srv.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
