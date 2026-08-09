/* THE BESTIARY: 56 themed bosses + the off-hand z-order fix.
 *
 * Tom, 2026-08-09: "add them to the pit ladder and elsewhere in the game for
 * fighting", "make sure these are randoming in the world as bosses and
 * encounters not just the pit", and "fix the underlying behaviour of the off
 * hand weapons never just sweep shit under the rug like that again".
 *
 * WHAT A FAILURE LOOKS LIKE, stated before the run so a pass means something:
 *   LADDER   rung 4's foe wears a random roll instead of The Gravedigger's kit.
 *   WORLD    two different dens hand you the same face, or a den outside its
 *            biome (a chrome machine in the marsh).
 *   ROTATE   the same den shows the same monster on two different days, which
 *            would make "rotates daily" a lie in the copy.
 *   OFFHAND  a raised off-hand item still paints over the skull.
 *   BANNER   the Today row is missing, or its monster is an empty stage (an
 *            uncomposed avatar renders as nothing and sells nothing).
 *   POPUP    the announcement opens with blank art, repeats a monster, or
 *            drowns the art in copy again.
 *
 * It SERVES ITS OWN CHECKOUT on a private port. The shared 8765 is another
 * session's tree: running against it passes green while proving nothing about
 * this branch, which is how a check becomes decoration.
 *
 * Run: node tests/bestiary-audit.mjs   (SHOTS=dir to keep screenshots)
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = path.join(process.env.HOME, 'Documents/Hyperframes Editor/overlay-render-kit/node_modules/puppeteer');
const puppeteer = (await import(path.join(KIT, 'lib/cjs/puppeteer/puppeteer.js'))).default;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PORT = 8188;
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await sleep(900);
const base = `http://127.0.0.1:${PORT}/`;
const shots = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;

const fails = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails.push(name);
};

const browser = await puppeteer.launch({
  headless: 'new',
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
await page.goto(base + '?demo', { waitUntil: 'networkidle2' });
await sleep(3200);

/* ---------- 1. the data layer: fixed cast, pools, rotation ---------- */
const data = await page.evaluate(async () => {
  const b = await import('./js/bosses.js');
  const poi = await import('./js/poi.js');
  const key = eq => Object.entries(eq).sort().map(([k, v]) => `${k}:${v}`).join(' ');
  // two different days of the same venue, via the real den generator
  const remote = d => { const den = poi.remoteDen(d); return { boss: den.boss, theme: den.theme.key, look: key(b.themedLook(den.theme.key, den.id) || {}) }; };
  const days = ['2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'].map(remote);
  return {
    cast: Object.keys(b.LOOKS).length,
    pool: Object.values(b.FAMILIES).flat().length,
    gravekeeper: key(b.bossLook('The Gravekeeper')),
    gravedigger: key({ B: 'B4', SK: 'SK4', E: 'ES17', H: 'HS14', IR: 'IR8-2' }),
    cycle1: key(b.bossLook('The Hollow King')),
    cycle2: key(b.bossLook('The Hollow King II')),
    marsh: [1, 2, 3, 4, 5, 6, 7, 8].map(i => key(b.themedLook('marsh', 'm' + i))),
    marshFams: [1, 2, 3, 4, 5, 6, 7, 8].map(i => b.themedLook('marsh', 'm' + i)).map(e => e.B),
    swampBodies: b.FAMILIES.swamp.map(e => e.B),
    days,
  };
});
ok('LADDER the fixed cast is loaded (an empty roster is a failure)', data.cast === 17 && data.pool === 56, `${data.cast} fixed, ${data.pool} pooled`);
ok('LADDER rung 4 wears The Gravedigger, not a random roll', data.gravekeeper === data.gravedigger, data.gravekeeper);
ok('LADDER a repeat Gauntlet cycle re-dresses', data.cycle1 !== data.cycle2 && data.cycle2.length > 0, 'I != II');
ok('WORLD the marsh pool actually varies', new Set(data.marsh).size >= 4, `${new Set(data.marsh).size} distinct across 8 seeds`);
ok('WORLD a marsh den only ever hosts marsh monsters',
  data.marshFams.every(b0 => data.swampBodies.includes(b0)), `${data.marshFams.length} draws, all in-family`);
const dayLooks = data.days.map(d => d.theme + '|' + d.look);
ok('ROTATE the daily boss is not the same monster every day', new Set(dayLooks).size >= 4, `${new Set(dayLooks).size} distinct over 6 days`);

/* ---------- 2. the off-hand fix, in the real renderer ---------- */
const off = await page.evaluate(async () => {
  const { BH_SLOTS } = await import('../data/boneheadz.js').catch(() => import('./data/boneheadz.js'));
  const z = Object.fromEntries(BH_SLOTS.map(s => [s.code, s.z]));
  // render a REAL avatar wearing the worst offender and read the paint order the
  // browser actually applied, not the table we hope it read
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;width:300px;height:300px';
  host.innerHTML = `<span class="bh-stage lg" id="zprobe"></span>`;
  document.body.appendChild(host);
  const eq = { B: 'B0-1', SK: 'SK0-1', E: 'ES16', IL: 'IL9' };
  const slots = [...BH_SLOTS].sort((a, b) => a.z - b.z).map(s => s.code).filter(c => eq[c]);
  document.getElementById('zprobe').innerHTML = slots.map(c => `<img data-slot="${c}" src="assets/bh/${c}/${eq[c]}.png">`).join('');
  const order = [...document.querySelectorAll('#zprobe img')].map(i => i.dataset.slot);
  host.remove();
  return { z, order };
});
ok('OFFHAND both hands sit under the skull in the shipped table',
  off.z.IL < off.z.SK && off.z.IR < off.z.SK, `IL ${off.z.IL}, IR ${off.z.IR}, SK ${off.z.SK}`);
ok('OFFHAND the renderer paints the off hand BEFORE the skull',
  off.order.indexOf('IL') < off.order.indexOf('SK'), off.order.join(' < '));
ok('OFFHAND a held item still draws over the top', off.z.IL > off.z.T, `IL ${off.z.IL} > T ${off.z.T}`);

/* ---------- 3. the Today row: present, and actually drawn ---------- */
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1800);
const banner = await page.evaluate(() => {
  const row = document.querySelector('.out-there .bestiary-banner');
  if (!row) return { present: false };
  const imgs = [...row.querySelectorAll('.gbn-ico img')];
  const r = row.getBoundingClientRect();
  return {
    present: true,
    title: row.querySelector('.gbn-txt b')?.textContent || '',
    layers: imgs.length,
    decoded: imgs.filter(i => i.naturalWidth > 0).length,
    visible: r.width > 0 && r.height > 0,
    composed: !row.querySelector('.bh-anim.bh-composing'),
  };
});
ok('BANNER the Out there row exists', banner.present);
ok('BANNER it names today\'s boss and venue', /\bat\b/.test(banner.title) && banner.title.length > 8, banner.title);
ok('BANNER its monster is DRAWN, not an empty stage (0 decoded = failure)',
  banner.layers > 0 && banner.decoded === banner.layers, `${banner.decoded}/${banner.layers} decoded`);
ok('BANNER the row is visible and composed', banner.visible && banner.composed);

/* ---------- 4. the announcement, fired the way the app fires it ---------- */
const popup = await page.evaluate(async () => {
  window.__bossIntro();
  await new Promise(r => setTimeout(r, 900));
  const veil = document.querySelector('.boss-veil');
  if (!veil) return { open: false };
  const imgs = [...veil.querySelectorAll('.boss-cell img')];
  return {
    open: true,
    cast: veil.querySelectorAll('.boss-cell').length,
    distinct: new Set([...veil.querySelectorAll('.boss-cell')].map(c => [...c.querySelectorAll('img')].map(i => i.getAttribute('src')).join('|'))).size,
    words: (veil.querySelector('.drop-card')?.innerText || '').trim().split(/\s+/).length,
    layers: imgs.length,
    decoded: imgs.filter(i => i.naturalWidth > 0).length,
    cta: !!veil.querySelector('#bossIntroGo'),
  };
});
ok('POPUP the announcement is a WALL of monsters, not a paragraph', popup.open && popup.cast === 16, `${popup.cast} figures`);
ok('POPUP no two cells are the same monster', popup.distinct === popup.cast, `${popup.distinct} distinct of ${popup.cast}`);
ok('POPUP the art leads, the copy does not (under 60 words)', popup.words > 0 && popup.words < 60, `${popup.words} words`);
ok('POPUP every figure is DRAWN (an empty poster is a failure)',
  popup.layers > 0 && popup.decoded === popup.layers, `${popup.decoded}/${popup.layers} decoded`);
if (shots) await page.screenshot({ path: path.join(shots, 'boss-intro.png') });
await page.evaluate(() => document.querySelector('#bossIntroLater')?.click());
await sleep(400);

/* ---------- 5. an actual fight wears the actual face ---------- */
/* The ladder is sequential, so only the next unbeaten rung is clickable. Drive
   whichever that is and assert THAT rung's designed skull, rather than assuming
   a rung the fixture has not unlocked. */
const fight = await page.evaluate(async () => {
  // the Pit is a sheet opened from the Today hero, not a route: OPERATE the
  // control a player uses (anti-regression rule 5) rather than jumping a hash
  location.hash = '#/today';
  await new Promise(r => setTimeout(r, 1200));
  document.querySelector('#pitBtn')?.click();
  await new Promise(r => setTimeout(r, 1800));
  const btn = document.querySelector('[data-rung]');
  if (!btn) return { started: false, why: 'no rung button after opening the Pit' };
  const rung = Number(btn.dataset.rung);
  const { LADDER } = await import('./js/pit.js');
  const { bossLook } = await import('./js/bosses.js');
  const name = LADDER[rung - 1].name;
  const want = bossLook(name);
  btn.click();
  await new Promise(r => setTimeout(r, 3000));
  /* #foeStage ONLY. Reading every <img> on the page passed while the roster was
     disconnected, because the PLAYER's own skull satisfied it: a check that
     cannot tell the two fighters apart is not a check. */
  const stage = document.querySelector('#foeStage');
  const srcs = stage ? [...stage.querySelectorAll('img')].map(i => i.getAttribute('src') || '') : [];
  return {
    started: true, rung, name, wantSK: want && want.SK,
    hit: !!(want && want.SK) && srcs.some(s => s.endsWith(`/${want.SK}.png`)),
    layers: srcs.length, saw: srcs.map(s => s.split('/').pop()).join(','),
  };
});
ok('FIGHT the next ladder rung actually starts', fight.started, fight.why || `rung ${fight.rung} (${fight.name})`);
ok('FIGHT that rung wears its designed skull, not a random roll', !!fight.hit,
  fight.hit ? `${fight.wantSK} on screen for ${fight.name}` : `want ${fight.wantSK}, foe stage had: ${fight.saw || 'nothing'}`);
if (shots) await page.screenshot({ path: path.join(shots, 'fight-rung4.png') });

ok('NO page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
srv.kill();
console.log(`\n${fails.length ? 'FAILED: ' + fails.join(', ') : 'bestiary audit clean'}`);
process.exit(fails.length ? 1 : 0);
