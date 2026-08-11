/* Level milestones + the Boneyard purpose strip.
 *
 * THE ASK (Tom, 2026-08-06): "Do all level ups give the same reward? I feel like
 * this is a very boring strategy if true." They did. And: "how many are nearby or
 * collected is a stat no one will care about. It might be more useful to see how
 * many steps are left on a hatching egg or something."
 *
 * PROVE-RED: make levelMilestone() return null for every level and the tiering
 * checks fail; delete the eggStrip branch from the map readout and STRIP fails.
 *
 * An empty sample set is a FAILURE.
 *
 * Usage: node tests/milestones.mjs
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree} from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srv = null, srvHandle = null;
let base = process.env.URL;
if (!base) {
  /* serveTree: a free port from the OS, and a HARD ERROR if python never
     bound. The hard-coded port with stdio:'ignore' meant a stranded server
     already holding it made this audit talk to whatever was listening. */
  srvHandle = await serveTree(ROOT);
  srv = { kill: () => srvHandle.close() };
  base = srvHandle.url;
}

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207, accuracy: 8 });
await seed(page, { level: 8, coins: 500 });

/* ---- the ladder of levels is no longer flat ---- */
const tiers = await page.evaluate(async () => {
  const g = await import('./js/game.js');
  const out = {};
  for (const L of [1, 4, 5, 9, 10, 24, 25, 50, 75, 100]) out[L] = g.levelMilestone(L)?.tier ?? null;
  return out;
});
ok('MILESTONE most levels stay ordinary', tiers[1] === null && tiers[4] === null && tiers[9] === null && tiers[24] === null, JSON.stringify(tiers));
ok('MILESTONE every 5th pays a bonus crate', tiers[5] === 'small', `L5=${tiers[5]}`);
ok('MILESTONE every 10th is bigger still', tiers[10] === 'big', `L10=${tiers[10]}`);
ok('MILESTONE every 25th is an event', tiers[25] === 'marquee' && tiers[50] === 'marquee' && tiers[100] === 'marquee', JSON.stringify(tiers));
ok('MILESTONE it keeps paying past the named levels', tiers[75] === 'marquee', `L75=${tiers[75]}`);

/* ---- and a milestone actually PAYS, exactly once ---- */
const paid = await page.evaluate(async () => {
  const g = await import('./js/game.js');
  const l = await import('./js/loot.js');
  const before = { dust: await l.boneDust(), crates: (await l.unopenedCrates()).length, eggs: (await l.inventory()).filter(r => r.kind === 'egg').length };
  const first = await g.grantLevelRewards(24, 25);      // crosses one marquee
  const mid = { dust: await l.boneDust(), crates: (await l.unopenedCrates()).length, eggs: (await l.inventory()).filter(r => r.kind === 'egg').length };
  const again = await g.grantLevelRewards(24, 25);      // a retry must pay NOTHING
  const after = { dust: await l.boneDust(), crates: (await l.unopenedCrates()).length, eggs: (await l.inventory()).filter(r => r.kind === 'egg').length };
  return { before, mid, after, first, again };
});
ok('MILESTONE crossing level 25 pays dust, an egg and extra crates',
  paid.mid.dust - paid.before.dust === 150 && paid.mid.eggs - paid.before.eggs === 1 && paid.mid.crates - paid.before.crates === 3,
  JSON.stringify({ dust: paid.mid.dust - paid.before.dust, eggs: paid.mid.eggs - paid.before.eggs, crates: paid.mid.crates - paid.before.crates }));
ok('MILESTONE the celebration is told which one it was', paid.first.milestone?.tier === 'marquee' && paid.first.milestone?.level === 25, JSON.stringify(paid.first.milestone));
ok('MILESTONE a repeat grant pays nothing (idempotent ledger)',
  paid.after.dust === paid.mid.dust && paid.after.eggs === paid.mid.eggs && paid.after.crates === paid.mid.crates,
  JSON.stringify({ mid: paid.mid, after: paid.after }));

/* ---- the Boneyard's line is about the egg, not the compass ---- */
await page.evaluate(() => { document.documentElement.style.setProperty('--sat', '59px'); location.hash = '#/boneyard'; });
await sleep(2000);
await page.evaluate(() => document.querySelector('#mapStart')?.click());
await sleep(5000);
const strip = await page.evaluate(() => ({
  count: document.querySelector('#mapCount')?.textContent?.trim() || '',
  readout: document.querySelector('#mapReadout')?.textContent?.trim() || '',
}));
ok('STRIP the map rendered its chrome (sample check)', strip.count.length > 0, JSON.stringify(strip));
// the egg granted by the milestone above is incubating, so it must own the line
ok('STRIP the topbar counts steps to hatch, not spawns nearby',
  /steps to hatch/i.test(strip.count), `"${strip.count}"`);
ok('STRIP the compass readout is gone',
  !/[↑↗→↘↓↙←↖]/.test(strip.readout) && !/getting (closer|farther)/i.test(strip.readout), `"${strip.readout}"`);

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
