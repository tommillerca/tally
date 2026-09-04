/* v279 bug-batch audit. One check per Tom-reported bug, each designed to go RED
 * on the bug it guards (prove-red notes inline). Empty sample sets FAIL.
 *
 *  1. rendered-template sweep    a literal "${" in any screen's text is a bug
 *                                (Protein row shipped "${ICONS.check(11)}")
 *  2. protein glow renders       the glow branch must actually run (hit-dot svg)
 *  3. fight HUD stays on screen  long foe name must not push the foe HUD past
 *                                the arena edge (min-width:0 fix). NOTE: the
 *                                original overflow is WEBKIT-only (min-width:auto
 *                                floors beat percentage max-width in Safari's
 *                                intrinsic sizing; Blink caps the nowrap name by
 *                                its max-width). This check is a Chromium
 *                                regression floor and did NOT go red pre-fix;
 *                                the real proof is the iOS-simulator screenshot
 *                                against live (done for v279).
 *  4. arming contrast            .btn.arming must not be gold-on-lime
 *  5. paperdoll bottom row       art box fits inside the tile (aspect clip fix)
 *  6. skull slot pad             SK slot art renders with extra pad
 *  7. map single safe-area       .screen--map pads 0; only the topbar takes --sat
 *  8. shiny on the board         __lbAvatar renders a shiny row's pet shiny
 *  9. shiny in the profile       __openFriendProfile renders p.pet.shiny shiny
 *
 * Usage: node tests/v279-audit.mjs   (URL=https://... to run against live)
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, openPit, fightRung, serveTree} from './godmode.js';

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
await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207, accuracy: 8 });

/* ---- seed: a level, a beaten-rung path to a fight, and a protein-smashing log */
await seed(page, { level: 12, coins: 500, reload: false });
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  // LOCAL date, the way the app keys days: toISOString is UTC and lands the
  // log on tomorrow every evening in Vancouver
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await new Promise((res, rej) => {
    const tx = db.transaction('log', 'readwrite');
    tx.objectStore('log').put({
      id: 'v279-protein', date, meal: 'lunch', ts: Date.now(), foodId: null,
      name: 'Audit Protein Slab', brand: null, portionLabel: '1 slab', sel: {},
      /* 150, not 250. The demo day already logs ~94 g and the target is 185 g;
         since QA r24 L8 the hit dot holds only to 1.5x target (277 g) and past
         that the row reads over, so 250 (344 g, 1.86x) would drop the very dot
         this check wants. 150 lands at ~244 g: hit, with margin either way. */
      kcal: 900, p: 150, c: 10, f: 10, fiber: 0, sugar: 0, sodium: 0,
    });
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
});
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2600);

/* ---- 1+2: Today renders the glow branch, and NO screen text contains "${" */
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1800);
const today = await page.evaluate(() => ({
  macros: document.querySelectorAll('.macro').length,
  hitDots: document.querySelectorAll('.macro .hit-dot svg').length,
  literals: (document.body.innerText.match(/\$\{/g) || []).length,
  firstMacro: (document.querySelector('.macro') || {}).outerHTML?.slice(0, 220) || null,
}));
ok('protein glow branch renders a drawn check', today.macros >= 3 && today.hitDots >= 1,
  `macros=${today.macros} hitDots=${today.hitDots}${today.hitDots ? '' : ' first=' + today.firstMacro}`);
ok('Today: no literal ${ in rendered text', today.macros >= 3 && today.literals === 0, `found ${today.literals}`);

const SWEEP = ['#/friends', '#/bonehead', '#/trends', '#/foods'];
for (const h of SWEEP) {
  await page.evaluate(hh => { location.hash = hh; }, h);
  await sleep(1600);
  const r = await page.evaluate(() => ({
    text: document.body.innerText.length,
    literals: (document.body.innerText.match(/\$\{/g) || []).length,
  }));
  ok(`${h}: no literal \${ in rendered text`, r.text > 200 && r.literals === 0,
    `text=${r.text} literals=${r.literals}`);
}

/* ---- 4: arming contrast (create the state; a flow isn't needed to test CSS) */
const arm = await page.evaluate(() => {
  const b = document.createElement('button');
  b.className = 'btn arming'; b.textContent = 'Spend 60 dust?';
  document.body.appendChild(b);
  const cs = getComputedStyle(b);
  const bg = cs.backgroundColor, fg = cs.color;
  b.remove();
  const lum = c => {
    const [r, g, bl] = (c.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(x => {
      const v = x / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const l1 = lum(fg), l2 = lum(bg);
  return { bg, fg, ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) };
});
ok('.btn.arming text/fill contrast >= 3:1', arm.ratio >= 3, `ratio=${arm.ratio.toFixed(2)} bg=${arm.bg} fg=${arm.fg}`);

/* ---- 5+6: paperdoll (Wardrobe hub tab) */
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(2200);
const pd = await page.evaluate(() => {
  const slots = document.querySelectorAll('.pd-slot').length;
  let clipped = 0, bottomArts = 0;
  for (const cv of document.querySelectorAll('.pd-bottom .pd-art')) {
    bottomArts++;
    const s = cv.closest('.pd-slot').getBoundingClientRect();
    const a = cv.getBoundingClientRect();
    if (a.bottom > s.bottom + 1 || a.right > s.right + 1) clipped++;
  }
  const sk = document.querySelector('[data-pd="SK"] .pd-art');
  return { slots, bottomArts, clipped, skPad: sk ? sk.getAttribute('data-pad') : null, skExists: !!sk };
});
ok('paperdoll rendered (sample check)', pd.slots >= 8, `slots=${pd.slots}`);
ok('bottom-row art fits its tile', pd.bottomArts >= 1 && pd.clipped === 0, `arts=${pd.bottomArts} clipped=${pd.clipped}`);
ok('skull slot renders with extra pad', pd.skExists && pd.skPad === '0.2', `data-pad=${pd.skPad}`);

/* ---- 7: map safe-area counted ONCE (simulated notch; desktop has none) */
await page.evaluate(() => { document.documentElement.style.setProperty('--sat', '59px'); location.hash = '#/boneyard'; });
await sleep(2000);
// first run shows the location-consent intro; the chrome only exists once the
// map starts, so start it (this is also the only path real players take)
await page.evaluate(() => { document.querySelector('#mapStart')?.click(); });
await sleep(4500);
const sat = await page.evaluate(() => {
  const scr = document.querySelector('.screen--map');
  const bar = document.querySelector('.map-topbar');
  if (!scr || !bar) return null;
  return { scrPad: getComputedStyle(scr).paddingTop, barPad: getComputedStyle(bar).paddingTop };
});
ok('map screen exists for the safe-area check', !!sat, JSON.stringify(sat));
ok('safe-area counted once (screen 0, topbar 70px)', !!sat && sat.scrPad === '0px' && sat.barPad === '70px',
  sat ? `screen=${sat.scrPad} topbar=${sat.barPad}` : 'no map');
await page.evaluate(() => { document.documentElement.style.removeProperty('--sat'); });

/* ---- 3: fight HUD with a hostile-length foe name */
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1200);
await openPit(page);
await fightRung(page, 1);
await sleep(1800);
const hud = await page.evaluate(() => {
  const arena = document.querySelector('.arena');
  const foe = document.querySelector('.hud-side.foe');
  const fname = foe && foe.querySelector('.fname');
  if (!arena || !foe || !fname) return null;
  fname.textContent = 'EXTREMELY LONG RATTLE BONE LORD OF THE DEEP MARROW III';
  const a = arena.getBoundingClientRect();
  const f = foe.getBoundingClientRect();
  const you = document.querySelector('.hud-side:not(.foe)').getBoundingClientRect();
  return { arenaR: a.right, foeR: f.right, youL: you.left, arenaL: a.left, foeW: f.width, aw: a.width };
});
ok('fight HUD rendered (sample check)', !!hud, hud ? '' : 'no .fight-hud in a live fight');
ok('foe HUD stays inside the arena under a long name',
  !!hud && hud.foeR <= hud.arenaR + 1 && hud.youL >= hud.arenaL - 1,
  hud ? `foeRight=${Math.round(hud.foeR)} arenaRight=${Math.round(hud.arenaR)}` : '');

/* ---- 8+9: another player's shiny pet renders SHINY everywhere */
const shiny = await page.evaluate(() => {
  if (!window.__lbAvatar) return null;
  const withShiny = window.__lbAvatar({ outfit: { B: 'B0-1', SK: 'SK0-1', C: 'C1' }, pet: { id: 'C1', shiny: true } });
  const without = window.__lbAvatar({ outfit: { B: 'B0-1', SK: 'SK0-1', C: 'C1' }, pet: { id: 'C1', shiny: false } });
  return { shinySrc: withShiny.includes('shiny/C1.png'), baseSrc: !without.includes('shiny/C1.png') };
});
ok('leaderboard row renders a shiny pet shiny', !!shiny && shiny.shinySrc && shiny.baseSrc, JSON.stringify(shiny));

const prof = await page.evaluate(async () => {
  if (!window.__openFriendProfile) return null;
  const read = () => {
    const pet = document.querySelector('.fp-pet');
    const out = { present: !!pet, shiny: !!document.querySelector('.fp-pet .pet-shiny-wrap') };
    document.querySelector('.sheet-close')?.click();
    return out;
  };
  window.__openFriendProfile({ playerId: 'x', name: 'Audit Friend', profile: { level: 9, outfit: { B: 'B0-1', SK: 'SK0-1' }, pet: { id: 'C1', level: 5, shiny: true } } });
  await new Promise(r => setTimeout(r, 900));
  const s = read();
  await new Promise(r => setTimeout(r, 700));
  window.__openFriendProfile({ playerId: 'x', name: 'Audit Friend', profile: { level: 9, outfit: { B: 'B0-1', SK: 'SK0-1' }, pet: { id: 'C1', level: 5, shiny: false } } });
  await new Promise(r => setTimeout(r, 900));
  const n = read();
  return { shinyCase: s, baseCase: n };
});
ok('friend profile renders THEIR shiny flag, not my collection',
  !!prof && prof.shinyCase.present && prof.shinyCase.shiny && prof.baseCase.present && !prof.baseCase.shiny,
  JSON.stringify(prof));

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
