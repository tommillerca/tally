/* The client half of sieges. Driven through the real model functions with a stubbed
 * server payload, because the demo profile has no online identity. */
import { boot, sleep } from './godmode.js';
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

const r = await page.evaluate(async () => {
  const sp = await import('./js/spires.js');
  const db = await import('./js/db.js');
  const now = Date.now();
  await db.kvSet('spires', {});
  const mk = (id, name) => ({ id, name, lat: 1, lng: 2, cx: 1, cy: 2, warden: 'W' });
  await sp.claimSpire(mk('sp-1-1', 'The Ashen Fang'));
  await sp.claimSpire(mk('sp-2-2', 'The Pale Gate'));

  // the server reports a siege on one of them
  const rows = [
    { id: 'sp-1-1', name: 'The Ashen Fang', level: 3, claimedAt: now - 40 * 86400000, tendedAt: now - 3600000, siegeUntil: now + 40 * 3600000, siegeName: 'Marrowjaw' },
    { id: 'sp-2-2', name: 'The Pale Gate', level: 1, claimedAt: now - 86400000, tendedAt: now - 3600000, siegeUntil: null, siegeName: null },
  ];
  const fresh1 = await sp.syncSieges(rows);
  const fresh2 = await sp.syncSieges(rows);          // a second poll must be quiet
  const live = await sp.besiegedSpires();
  const st = await sp.spireState();

  // reading it back through readSpire
  const view = sp.readSpire(st, { id: 'sp-1-1' });
  const other = sp.readSpire(st, { id: 'sp-2-2' });

  // winning the defense
  const broke = await sp.breakSiege('sp-1-1');
  const afterBreak = sp.readSpire(await sp.spireState(), { id: 'sp-1-1' });

  // and the server clearing it remotely
  await sp.syncSieges([{ ...rows[0], siegeUntil: now + 40 * 3600000 }]);
  const reArmed = !!sp.readSpire(await sp.spireState(), { id: 'sp-1-1' }).siege;
  await sp.syncSieges([{ ...rows[0], siegeUntil: null, siegeName: null }]);
  const clearedRemotely = !sp.readSpire(await sp.spireState(), { id: 'sp-1-1' }).siege;

  // an expired siege must not read as live
  await sp.syncSieges([{ ...rows[0], siegeUntil: now - 1000 }]);
  const expiredIsIgnored = !sp.readSpire(await sp.spireState(), { id: 'sp-1-1' }).siege;

  return {
    fresh1: fresh1.length, fresh2: fresh2.length, live: live.length,
    liveId: live[0]?.id, siegeName: view.siege?.name, msLeft: view.siege?.msLeft,
    otherHasNoSiege: !other.siege,
    levelMirrored: st['sp-1-1'].level,
    claimDateRestored: st['sp-1-1'].claimedAt === now - 40 * 86400000,
    broke, afterBreakHasSiege: !!afterBreak.siege,
    reArmed, clearedRemotely, expiredIsIgnored,
    unknownIgnored: (await sp.syncSieges([{ id: 'sp-nope-nope', siegeUntil: now + 1000 }])).length,
  };
});
console.log(JSON.stringify(r, null, 1));
check('a new siege is reported exactly once', r.fresh1 === 1 && r.fresh2 === 0, `${r.fresh1} then ${r.fresh2}`);
check('only the besieged tower is besieged', r.live === 1 && r.liveId === 'sp-1-1' && r.otherHasNoSiege);
check('the besieger is named and the clock is live', r.siegeName === 'Marrowjaw' && r.msLeft > 0, `${r.siegeName} / ${r.msLeft}`);
check("the server's level is mirrored in", r.levelMirrored === 3, String(r.levelMirrored));
check('a reinstall gets its true claim date back', r.claimDateRestored);
check('winning the defense clears the siege locally', r.broke === true && r.afterBreakHasSiege === false);
check('the server can re-arm and clear a siege', r.reArmed && r.clearedRemotely);
check('an EXPIRED siege never reads as live', r.expiredIsIgnored);
check('a siege for a tower we do not hold is ignored', r.unknownIgnored === 0);

// the banner must LEAD with the siege, not bury it. Real DOM, not source grep:
// seed a siege on sp-1-1 AND stale coins on sp-2-2, route to Today, then read
// what the player actually sees in the rendered .spire-banner. Assert the
// visible headline is the siege line (contains the besieger's name and a live
// clock in h/m format), NOT the "N coins waiting" line. The old check was
// `body.indexOf('sieged.length ?') < body.indexOf('owed ?')` on source text;
// -1 for either would satisfy the inequality vacuously, so deleting the
// siege branch entirely would still pass. This one fails when the banner is
// not on screen, when it does not carry .under-siege, when the siege-tag row
// is missing, or when the headline names coins instead of the besieger.
await page.evaluate(async () => {
  const sp = await import('./js/spires.js');
  const db = await import('./js/db.js');
  const now = Date.now();
  const st = await sp.spireState();
  st['sp-1-1'].siege = { until: now + 30 * 3600000, name: 'Marrowjaw' };
  st['sp-2-2'].collectedAt = now - 5 * 86400000;      // lots of coins owed elsewhere
  await db.kvSet('spires', st);
  location.hash = '#/today';
});
/* wait for the banner: the spire card is one of several banners on Today and
   arrives with the screen's reveal, not before it. Cap at 15s, and treat a
   never-appearing banner as a FAIL below (an empty sample is a failure). */
const bannerReady = await page.waitForFunction(
  () => !!document.querySelector('.spire-banner'),
  { timeout: 15000, polling: 100 }
).then(() => true).catch(() => false);
const banner = await page.evaluate(() => {
  const el = document.querySelector('.spire-banner');
  if (!el) return { rendered: false };
  const summary = el.querySelector('summary') || el;
  const headline = summary.innerText.replace(/\s+/g, ' ').trim();
  const rows = [...el.querySelectorAll('.spire-row')];
  const rowNames = rows.map(r => (r.querySelector('b')?.textContent || '').trim());
  const iSiege = rowNames.findIndex(n => /Ashen Fang/i.test(n));
  const iOwed  = rowNames.findIndex(n => /Pale Gate/i.test(n));
  return {
    rendered: true,
    underSiege: el.classList.contains('under-siege'),
    siegeTagInDom: !!el.querySelector('.spire-siege-tag'),
    headline,
    namesBesieger: /Marrowjaw/.test(headline),
    hasClockUnits: /\d+\s*[hm]/.test(headline),
    mentionsCoins: /\bcoins?\b/i.test(headline),
    rowNames, iSiege, iOwed,
    siegedRowFirst: iSiege !== -1 && iOwed !== -1 && iSiege < iOwed,
  };
});
console.log('banner:', JSON.stringify(banner));
check('the spire banner RENDERS on Today (an empty banner is a FAILURE)',
  bannerReady && banner.rendered, JSON.stringify(banner).slice(0, 200));
check('the banner headline LEADS with the siege, not coins owed',
  banner.rendered && banner.namesBesieger && banner.hasClockUnits && !banner.mentionsCoins,
  banner.headline);
check('the sieged spire row appears before the coins-owed row',
  banner.rendered && banner.siegedRowFirst,
  `Ashen Fang at ${banner.iSiege}, Pale Gate at ${banner.iOwed}: ${JSON.stringify(banner.rowNames)}`);
check('the banner marks itself under siege and shows the siege tag on the row',
  banner.rendered && banner.underSiege && banner.siegeTagInDom);

// the map button must offer DEFEND before tend/collect. HARDENED, not fully
// rewritten: fully driving the #mapSpire click requires the map screen to
// populate `spireInRange` (app.js:11696), which is a closure local in the
// render scope with no test hook; setting it from outside means either
// simulating geolocation + POI generation for a spire in range, or exposing
// a hook on window. Both are app-side plumbing that belongs on a separate
// branch. In the meantime, this block previously used two unguarded
// indexOf<indexOf pairs, either of which passed at -1 (delete either token
// and the check went green anyway). Guards below assert both tokens EXIST
// in the handler body before comparing order, so deletion goes red instead
// of silent-pass. Full runtime rewrite filed with the same test-hook
// follow-up as the spire-phase3 refused-claim block.
const btn = await page.evaluate(async () => {
  const src = await (await fetch('./js/app.js')).text();
  const i = src.indexOf("$('#mapSpire', body).addEventListener");
  const body = src.slice(i, i + 1200);
  const iSiege = body.indexOf('openSiegeSheet');
  const iSheet = body.indexOf('openSpireSheet');
  const iColl  = body.indexOf('collectTribute');
  return {
    handlerFound: i > -1,
    hasSiegeCall:  iSiege > -1,
    hasSheetCall:  iSheet > -1,
    hasCollectCall: iColl > -1,
    defendBeforeCollect: iSiege > -1 && iColl  > -1 && iSiege < iColl,
    defendBeforeRival:   iSiege > -1 && iSheet > -1 && iSiege < iSheet,
  };
});
console.log('map button:', JSON.stringify(btn));
check('the mapSpire click handler was located', btn.handlerFound);
check('the handler calls all three branches (siege, rival-sheet, collect)', btn.hasSiegeCall && btn.hasSheetCall && btn.hasCollectCall,
      `siege=${btn.hasSiegeCall} sheet=${btn.hasSheetCall} collect=${btn.hasCollectCall}`);
check('a besieged tower offers DEFEND before collect', btn.defendBeforeCollect, JSON.stringify(btn));
check('a besieged tower offers DEFEND before opening the rival sheet', btn.defendBeforeRival, JSON.stringify(btn));

await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nSIEGE CLIENT VERIFIED');
process.exit(bad ? 1 : 0);
