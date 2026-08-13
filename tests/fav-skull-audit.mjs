/* A CANVAS THAT FAILS TO LOAD MUST NOT BE INVISIBLE.
 *
 * Tom, 2026-08-13: "the faves skull icons one loads but the other doesnt."
 *
 * Every fave chip on the Crew tab is an 80x80 <canvas> filled by
 * drawTrimmedArt. Its error handler was `img.onerror = () => res()`, so an
 * image that failed to arrive resolved the promise and left the canvas EMPTY,
 * with no retry, no fallback and nothing logged. One chip drew, its neighbour
 * did not, and the console was clean. That is anti-regression rule 8: what
 * hides content owns un-hiding it, and a missed async result must degrade to
 * ugly rather than to invisible.
 *
 * The check has to be PIXELS. The <canvas> element exists either way, so any
 * presence-based assertion passes on the bug. This reads the alpha channel.
 *
 * PROVE-RED: restore `img.onerror = () => res();` in drawTrimmedArt and the
 * BLOCKED row fails with ink=0 while the healthy chip beside it still draws.
 *
 * Usage: node tests/fav-skull-audit.mjs
 */
import { boot, seed, sleep, serveTree } from './godmode.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

async function run(blockPattern) {
  const srv = await serveTree(process.cwd());
  const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
  const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await seed(page, { level: 12 });
  if (blockPattern) {
    await page.setRequestInterception(true);
    page.on('request', r => (r.url().includes(blockPattern) ? r.abort('failed') : r.continue()));
  }
  await page.evaluate(async () => {
    window.__testMe = { playerId: 'me', name: 'Me', friendCode: 'BONE-ME', handle: 'me' };
    const mk = (id, sk) => ({ playerId: id, name: 'Pal ' + id, friendCode: 'BONE-' + id,
      lastSeen: Date.now(), profile: { outfit: { B: 'B0-1', SK: sk }, level: 10, badges: 0 } });
    window.__testFriends = { friends: [mk('f1', 'SK0-1'), mk('f2', 'SK3-1')], incoming: [], outgoing: [] };
    const db = await import('./js/db.js');
    await db.kvSet('crewFaves', ['f1', 'f2']);
    location.hash = '#/friends';
  });
  await sleep(4000);
  const chips = await page.evaluate(() => [...document.querySelectorAll('.cfan-fv canvas')].map(c => {
    let ink = 0;
    try {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 14) ink++;
    } catch { return { art: c.dataset.art, ink: -1 }; }
    return { art: (c.dataset.art || '').split('/').pop(), ink };
  }));
  await browser.close(); srv.close?.();
  return { chips, errs };
}

/* 1. HEALTHY: both chips draw. If this ever reports zero chips the run proved
      nothing, so the count is asserted first. */
const good = await run(null);
ok('SETUP the faves row rendered chips at all (zero is a FAILURE)', good.chips.length === 2, `${good.chips.length} chips`);
ok('HEALTHY every fave chip draws its skull', good.chips.length === 2 && good.chips.every(c => c.ink > 0),
  JSON.stringify(good.chips));

/* 2. BLOCKED: one skull never arrives. The chip must still show SOMETHING. */
const bad = await run('SK3-1.png');
ok('BLOCKED the chip whose art never arrived is still not empty',
  bad.chips.length === 2 && bad.chips.every(c => c.ink > 0), JSON.stringify(bad.chips));
ok('BLOCKED its healthy neighbour is untouched',
  bad.chips[0] && bad.chips[0].ink === good.chips[0].ink, `${bad.chips[0]?.ink} vs ${good.chips[0]?.ink}`);
ok('BLOCKED the fallback is a fallback, not the real art by luck',
  bad.chips[1] && good.chips[1] && bad.chips[1].ink !== good.chips[1].ink,
  `blocked=${bad.chips[1]?.ink} real=${good.chips[1]?.ink}`);
ok('NO page errors in either run', good.errs.length === 0 && bad.errs.length === 0,
  [...good.errs, ...bad.errs].slice(0, 2).join(' ; '));

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nfave skulls clean');
process.exit(fails.length ? 1 : 0);
