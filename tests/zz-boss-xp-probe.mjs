/* THROWAWAY DIAGNOSTIC, not a guard. Measures what one boss kill actually pays,
   driven through the real award()/awardCapped()/claimDenWin() against a real
   IndexedDB in a real browser. Read-only on balance: it changes no constant. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srv = await serveTree(ROOT);
console.log(`URL UNDER TEST: ${srv.url}`);
const { browser, page } = await boot(srv.url);
await sleep(1500);

const res = await page.evaluate(async () => {
  const g = await import('/js/game.js');
  const poi = await import('/js/poi.js');
  const pit = await import('/js/pit.js');
  const db = (await import('/js/db.js')).db;

  const rowsOf = async () => await db.all('xp');
  const sumByType = rows => rows.reduce((a, r) => { a[r.type] = (a[r.type] || 0) + (r.xp || 0); return a; }, {});

  const DAY = '2099-03-01';
  const WEEK = '2099-W09';
  const out = { caps: g.XP_DAILY_CAP };

  /* ---- 1. ONE LANDMARK DEN BOSS, the exact settle sequence app.js runs ---- */
  const mkDen = (tier, i) => ({
    id: `probe-${tier}-${i}`, lat: 0, lng: 0, tier,
    theme: { key: 'slab', name: 'The Slab', boss: 'Bonecrusher', arch: 'slab' },
    name: 'The Slab', boss: 'Bonecrusher',
    ...poi.DEN_TIERS[tier],
  });

  const before0 = (await rowsOf()).reduce((a, r) => a + (r.xp || 0), 0);
  const perTier = [];
  for (let tier = 0; tier <= 6; tier++) {
    const b = (await rowsOf()).reduce((a, r) => a + (r.xp || 0), 0);
    // app.js: awardCapped('fight','fight',10,'Pit win',XP_DAILY_CAP.fight) then claimDenWin
    const fightXp = await g.awardCapped('fight', 'fight', 10, 'Pit win', g.XP_DAILY_CAP.fight, DAY);
    const r = await poi.claimDenWin(mkDen(tier, 'a'), DAY, WEEK);
    const a = (await rowsOf()).reduce((x, y) => x + (y.xp || 0), 0);
    perTier.push({ tier, fightXp, denXp: r ? r.xp : 0, total: a - b, mult: poi.DEN_TIERS[tier].mult });
  }

  /* ---- 2. FOUR BOSSES IN A DAY, fresh ledger, realistic weighted tier mix ---- */
  await db.clear('xp');
  const D2 = '2099-03-02';
  const four = [];
  const mix = [1, 2, 3, 5]; // one of each of the commoner tiers plus a hard one
  for (let i = 0; i < mix.length; i++) {
    const b = (await rowsOf()).reduce((a, r) => a + (r.xp || 0), 0);
    const f = await g.awardCapped('fight', 'fight', 10, 'Pit win', g.XP_DAILY_CAP.fight, D2);
    const r = await poi.claimDenWin(mkDen(mix[i], `four${i}`), D2, '2099-W10');
    const a = (await rowsOf()).reduce((x, y) => x + (y.xp || 0), 0);
    four.push({ tier: mix[i], fightXp: f, denXp: r ? r.xp : 0, step: a - b });
  }
  const fourTotal = (await rowsOf()).reduce((a, r) => a + (r.xp || 0), 0);
  const fourByType = sumByType(await rowsOf());

  /* ---- 3. DOES THE FIGHT CAP BIND BOSS XP? hammer 40 distinct dens in one day ---- */
  await db.clear('xp');
  const D3 = '2099-03-03';
  for (let i = 0; i < 40; i++) {
    await g.awardCapped('fight', 'fight', 10, 'Pit win', g.XP_DAILY_CAP.fight, D3);
    await poi.claimDenWin(mkDen(3, `hammer${i}`), D3, '2099-W11');
  }
  const hammerRows = await rowsOf();
  const hammer = { total: hammerRows.reduce((a, r) => a + (r.xp || 0), 0), byType: sumByType(hammerRows) };

  /* ---- 4. LADDER RUNGS + GAUNTLET, the other "pit boss" ---- */
  await db.clear('xp');
  const D4 = '2099-03-04';
  const ladder = [];
  for (const L of pit.LADDER) {
    const f = await g.awardCapped('fight', 'fight', 10, 'Pit win', g.XP_DAILY_CAP.fight, D4);
    const x = await g.award(`pitrung-${L.rung}`, 'pitrung', L.xp, `Ladder: ${L.name}`, D4);
    ladder.push({ rung: L.rung, name: L.name, mult: L.mult, fightXp: f, rungXp: x, total: f + x });
  }
  const champF = await g.awardCapped('fight', 'fight', 10, 'Pit win', g.XP_DAILY_CAP.fight, D4);
  const champX = await g.award('pitchamp', 'pitchamp', pit.CHAMPION.xp, 'Champion', D4);
  const ladderTotal = (await rowsOf()).reduce((a, r) => a + (r.xp || 0), 0);

  await db.clear('xp');
  const D5 = '2099-03-05';
  const endless = [];
  for (const rank of [1, 2, 3, 4, 5, 7, 10, 14, 20, 30]) {
    const foe = pit.endlessFoe(rank);
    const f = await g.awardCapped('fight', 'fight', 10, 'Pit win', g.XP_DAILY_CAP.fight, D5);
    const x = await g.award(`endless-${rank}`, 'endless', foe.xp, `Gauntlet ${rank}`, D5);
    endless.push({ rank, name: foe.name, mult: foe.mult, fightXp: f, rankXp: x, total: f + x });
  }

  /* ---- 5. ROAMING + REMOTE + SECRET + GLUTTON ---- */
  await db.clear('xp');
  const D6 = '2099-03-06';
  const roam = [];
  for (let t = 0; t < 3; t++) {
    const den = { id: `roamprobe-${t}`, roaming: true, day: D6, tier: t, name: 'Roamer', boss: 'Roamer',
      theme: { key: 'slab', name: 'The Slab', boss: 'B', arch: 'slab' },
      reward: [{ coins: 45, xp: 45 }, { crate: 'daily', coins: 40, xp: 60 }, { crate: 'golden', coins: 70, xp: 90 }][t] };
    const f = await g.awardCapped('fight', 'fight', 10, 'Pit win', g.XP_DAILY_CAP.fight, D6);
    const r = await poi.claimDenWin(den, D6, '2099-W12');
    roam.push({ tier: t, fightXp: f, denXp: r ? r.xp : 0, total: f + (r ? r.xp : 0) });
  }

  await db.clear('xp');
  return { ...out, perTier, four, fourTotal, fourByType, hammer, ladder,
    champ: { fightXp: champF, xp: champX, total: champF + champX }, ladderTotal, endless, roam };
});

await browser.close();
srv.close();
console.log(JSON.stringify(res, null, 2));
