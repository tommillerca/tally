/* The client half of sieges. Driven through the real model functions with a stubbed
 * server payload, because the demo profile has no online identity. */
import { boot, sleep } from './godmode.js';
const { browser, page } = await boot(process.env.URL);
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

// the banner must LEAD with the siege, not bury it
const banner = await page.evaluate(async () => {
  const sp = await import('./js/spires.js');
  const db = await import('./js/db.js');
  const now = Date.now();
  const st = await sp.spireState();
  st['sp-1-1'].siege = { until: now + 30 * 3600000, name: 'Marrowjaw' };
  st['sp-2-2'].collectedAt = now - 5 * 86400000;      // lots of coins owed elsewhere
  await db.kvSet('spires', st);
  const src = await (await fetch('./js/app.js')).text();
  const i = src.indexOf('function spireBannerHtml');
  const body = src.slice(i, src.indexOf('\nfunction ', i + 10));
  return {
    siegeFirst: body.indexOf('sieged.length ?') < body.indexOf('owed ?'),
    tagsBanner: /under-siege/.test(body),
    rowShowsSiege: /spire-siege-tag/.test(body),
  };
});
console.log('banner:', JSON.stringify(banner));
check('the banner leads with the siege, ahead of coins owed', banner.siegeFirst, JSON.stringify(banner));
check('and marks itself as under siege', banner.tagsBanner && banner.rowShowsSiege);

// the map button must offer DEFEND before tend/collect
const btn = await page.evaluate(async () => {
  const src = await (await fetch('./js/app.js')).text();
  const i = src.indexOf("$('#mapSpire', body).addEventListener");
  const body = src.slice(i, i + 1200);
  return {
    defendFirst: body.indexOf('openSiegeSheet') < body.indexOf('collectTribute'),
    beforeRival: body.indexOf('openSiegeSheet') < body.indexOf('openSpireSheet'),
  };
});
console.log('map button:', JSON.stringify(btn));
check('a besieged tower offers DEFEND before collect or tend', btn.defendFirst && btn.beforeRival, JSON.stringify(btn));

await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nSIEGE CLIENT VERIFIED');
process.exit(bad ? 1 : 0);
