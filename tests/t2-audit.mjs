/* Tier 2 audit: the six payoff moments, plus the breeding explanation.
 *
 * These are celebration beats, not routes, so each is PROVOKED for real (a crate
 * granted and opened, a den fought and won, an XP threshold crossed by logging a
 * food, 30 days of steps banked so an egg is genuinely ready, three pets bred).
 * Anything it cannot reach is a FAIL, never a skip.
 *
 * WHAT EACH CHECK IS FOR, and how to prove it red:
 *   TAKEOVER      every reveal must own the screen. Live, all six were bottom
 *                 sheets over a busy screen (the hatch opened over the words
 *                 "BOSS LOOT · TAP TO COMPARE, KEEP ONE PER DROP").
 *                 RED: drop `cls: 'takeover'` from openPackReveal.
 *   CARD-PLATE    the card's name/rarity sit on a plate, and the rarity CHIP is
 *                 tinted by the card's own .r-<rarity> class, so frame and label
 *                 can never disagree. RED: put the old inline style back.
 *   NO-TAILWIND   rarity frames must be deck colours. RED: set .pack-card.r-epic
 *                 back to rgba(192,132,252,.8) and this fails naming it.
 *   ART-DECODED   naturalWidth/canvas pixels, not a CSS box: a bordered panel
 *                 measures perfectly over art that never drew.
 *   CHOICE-FIRST  on a boss win the gear choice must sit ABOVE the loot that was
 *                 already banked. RED: move the chooser back below rewardHtml.
 *   NO-FLEE       "Flee" must be gone once the fight is decided.
 *   BREED-CLARITY the Stable must say both pets are destroyed BEFORE you commit,
 *                 and the button must arm. RED: revert to the old one-line note.
 *   ICONS-RESOLVE every ICONS.<name>( call must exist. This found ICONS.chev
 *                 (thrown, took the Stable down) and ICONS.quest (guarded, so it
 *                 had silently rendered a 📜 emoji since 2026-07-21).
 *
 * Usage: node tests/t2-audit.mjs   (SHOTS=dir keeps screenshots)
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { boot, sleep, seed, finishFight } = await import(path.join(ROOT, 'tests/godmode.js'));
const sh = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;

const results = [];
const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

/* ---- static checks first: cheap, and they fail before a browser starts ---- */
{
  const src = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const i = src.indexOf('const ICONS = {');
  const lit = new Set([...src.slice(i, i + 9000).matchAll(/^\s{2}([a-zA-Z][A-Za-z0-9_]*):/gm)].map(m => m[1]));
  const asg = new Set([...src.matchAll(/^ICONS\.([A-Za-z0-9_]+)\s*=/gm)].map(m => m[1]));
  const used = new Set([...src.matchAll(/ICONS\.([A-Za-z0-9_]+)\s*\(/g)].map(m => m[1]));
  const missing = [...used].filter(u => !lit.has(u) && !asg.has(u));
  ok('ICONS-RESOLVE every icon call is defined', used.size > 10 && missing.length === 0,
     `${used.size} used, missing: ${missing.join(', ') || 'none'}`);

  const css = readFileSync(path.join(ROOT, 'app.css'), 'utf8');
  /* Only RARITY rules. The same purple is also the shadow-magic damage colour
     (.float.dmg.magic, .proj.shadow, hexglow, summonrise) and that is a
     different semantic, so a whole-file scan fails on correct code. */
  const TAILWIND = /#c084fc|rgba\(\s*192,\s*132,\s*252|rgba\(\s*74,\s*222,\s*128|rgba\(\s*111,\s*208,\s*255/;
  const FX = /float|proj|burst|minionaura|hexglow|summonrise|wpn-glow/;
  const offenders = css.split('\n')
    .filter(l => /\.r-(uncommon|rare|epic|legendary)\b/.test(l) && TAILWIND.test(l) && !FX.test(l))
    .map(l => l.trim().slice(0, 70));
  const rarityLines = css.split('\n').filter(l => /\.r-(uncommon|rare|epic|legendary)\b/.test(l)).length;
  // an empty sample means the selectors moved and this checked nothing
  ok('NO-TAILWIND one deck colour per rarity', rarityLines > 10 && offenders.length === 0,
     `${rarityLines} rarity rules; ${offenders.length ? offenders.join(' | ') : 'all on deck tokens'}`);
}

const srv = spawn('python3', ['-m', 'http.server', '8136', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await sleep(900);
const base = process.env.URL || 'http://127.0.0.1:8136/';
const { browser, page } = await boot(base, {
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(new URL(base).origin, ['geolocation']);
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207, accuracy: 8 });

const shot = async n => { if (sh) await page.screenshot({ path: path.join(sh, `t2-${n}.png`) }); };
const closeAll = async () => { await page.evaluate(() => { const n = document.querySelectorAll('.sheet').length; if (n) history.go(-n); }); await sleep(800); };

/* a reveal owns the screen: full-height sheet, its own painted ground, and no
   element of the screen underneath visible inside its bounds */
const takeover = () => page.evaluate(() => {
  const s = document.querySelector('.sheet.takeover');
  const t = document.querySelector('.reveal-take');
  if (!s || !t) return { ok: false, why: !s ? 'no .sheet.takeover' : 'no .reveal-take' };
  const r = s.getBoundingClientRect();
  return { ok: r.top <= 1 && r.height >= innerHeight - 2, top: Math.round(r.top), h: Math.round(r.height), vh: innerHeight };
});

/* ---- 1. crate reveal (also the shared card) ---- */
await page.evaluate(async () => {
  const l = await import('./js/loot.js');
  await l.grantCrate('golden', 'audit-' + Date.now());
  await l.grantCrate('daily', 'audit2-' + Date.now());
});
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(2400);
await page.evaluate(() => { const t = [...document.querySelectorAll('.chip.ch-tab')].find(x => /backpack/i.test(x.textContent || '')); if (t) t.click(); });
await sleep(1700);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^open/i.test((x.textContent || '').trim()) && x.getBoundingClientRect().width); if (b) b.click(); });
await sleep(3000);

const tk = await takeover();
ok('TAKEOVER crate reveal owns the screen', tk.ok, JSON.stringify(tk));
const card = await page.evaluate(() => {
  const c = document.querySelector('.pack-card');
  if (!c) return { why: 'no .pack-card' };
  const rar = c.querySelector('.pc-rar'), plate = c.querySelector('.pc-plate'), art = c.querySelector('.pc-art');
  const cv = c.querySelector('.pc-canvas');
  let drew = null;
  if (cv) {                     // canvas pixels, not a CSS box
    try {
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 8) n++;
      drew = n;
    } catch { drew = -1; }
  }
  const cs = rar ? getComputedStyle(rar) : null;
  return {
    plate: !!plate, inPlate: !!(plate && rar && plate.contains(rar)),
    art: !!art, artBorder: art ? getComputedStyle(art).borderTopWidth : null,
    rarText: (rar?.textContent || '').trim(),
    rarTinted: cs ? cs.backgroundColor : null,
    inlineColour: rar?.getAttribute('style') || '',
    drew,
  };
});
ok('CARD-PLATE name and rarity sit on a plate', !!card.plate && card.inPlate, JSON.stringify({ plate: card.plate, inPlate: card.inPlate }));
ok('CARD-PLATE rarity chip is class-tinted, not inline', !!card.rarText && !/color:/.test(card.inlineColour), `"${card.rarText}" style="${card.inlineColour}"`);
ok('CARD art panel is a real bordered panel', card.art && !/^0px/.test(card.artBorder || '0px'), String(card.artBorder));
if (card.drew !== null) ok('ART-DECODED card art actually drew pixels', card.drew > 0, `${card.drew} sampled opaque px`);
await shot('crate');
await closeAll();

/* ---- 2. level up ---- */
const lv = await page.evaluate(async () => {
  const g = await import('./js/game.js');
  const db = (await import('./js/db.js')).db;
  const total = await g.totalXp();
  const gap = g.levelFor(total).nextAt - total;
  if (gap > 1) await db.put('xp', { key: 'audit-top-' + Date.now(), type: 'audit', xp: gap - 1, label: 'audit', date: new Date().toISOString().slice(0, 10), ts: Date.now() });
  return gap;
});
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1700);
await page.evaluate(() => document.getElementById('fab')?.click());
await sleep(1400);
await page.evaluate(() => { document.querySelector('.t1-frow')?.click(); });
await sleep(1300);
await page.evaluate(() => document.getElementById('addBtn')?.click());
await sleep(4200);
const lvTk = await takeover();
ok('TAKEOVER level up owns the screen', lvTk.ok, `gap was ${lv}; ` + JSON.stringify(lvTk));
await shot('levelup');
await closeAll();

/* ---- 3. fight victory: the CHOICE has to come first ---- */
await seed(page, { level: 12, coins: 2000 });
const den = await page.evaluate(async () => {
  const m = await import('./js/poi.js');
  const { dateKey } = await import('./js/nutrition.js');
  const d = m.densNear(m.isoWeekKey(), 49.2827, -123.1207, dateKey())[0];
  return d ? { lat: d.lat, lng: d.lng, name: d.name } : null;
});
if (!den) ok('VICTORY reachable', false, 'densNear returned nothing');
else {
  await page.setGeolocation({ latitude: den.lat, longitude: den.lng, accuracy: 8 });
  await page.evaluate(() => { location.hash = '#/boneyard'; });
  await sleep(2200);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /open the map/i.test(x.textContent || '')); if (b) b.click(); });
  await sleep(10000);
  const started = await page.evaluate(async () => {
    const b = document.querySelector('#mapDen');
    if (!b || b.hidden) return false;
    b.click(); await new Promise(r => setTimeout(r, 2600));
    return !!document.querySelector('#youStage');
  });
  ok('VICTORY a den fight started', started, den.name);
  if (started) {
    await finishFight(page, 'p').catch(() => {});
    await sleep(3400);
    const v = await page.evaluate(() => {
      const over = document.querySelector('.fight-over');
      if (!over) return { why: 'no .fight-over' };
      const choice = over.querySelector('.loot-choice');
      const rewards = over.querySelector('.reward-row');
      const flee = [...document.querySelectorAll('button')].find(b => /flee/i.test(b.textContent || '') && !b.hidden && b.getBoundingClientRect().height);
      const rows = over.querySelectorAll('.got-row').length;
      const cards = over.querySelectorAll('.loot-cards .pack-card').length;
      let order = null;
      if (choice && rewards) order = choice.compareDocumentPosition(rewards) & Node.DOCUMENT_POSITION_FOLLOWING ? 'choice-first' : 'rewards-first';
      return { hasChoice: !!choice, order, rows, cards, fleeVisible: !!flee, choiceTop: choice ? Math.round(choice.getBoundingClientRect().top) : null };
    });
    ok('CHOICE-FIRST the gear choice precedes the banked loot', v.order === 'choice-first', JSON.stringify({ order: v.order, top: v.choiceTop }));
    ok('CHOICE banked loot is rows, not full cards', v.hasChoice && v.rows > 0, `${v.rows} rows, ${v.cards} cards`);
    ok('NO-FLEE Flee is gone once the fight is decided', !v.fleeVisible, String(v.fleeVisible));
    await shot('victory');
  }
}
await closeAll();

/* ---- 4. pet hatch ---- */
const eggs = await page.evaluate(async () => {
  const l = await import('./js/loot.js');
  const db = (await import('./js/db.js')).db;
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
    const prev = (await db.get('health', d)) || { date: d };
    await db.put('health', { ...prev, date: d, steps: Math.max(prev.steps || 0, 13000) });
  }
  await l.grantCrate('egg', 'audit-egg-' + Date.now());
  return (await l.inventory()).filter(r => r.kind === 'egg').length;
});
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(2300);
await page.evaluate(() => { const t = [...document.querySelectorAll('.chip.ch-tab')].find(x => /backpack/i.test(x.textContent || '')); if (t) t.click(); });
await sleep(1700);
await page.evaluate(() => document.querySelector('[data-hatch]')?.click());
await sleep(4000);
const hTk = await takeover();
ok('TAKEOVER pet hatch owns the screen', hTk.ok, `${eggs} egg(s); ` + JSON.stringify(hTk));
await shot('hatch');
await closeAll();

/* ---- 5 + 6. the breeding explanation, then the result ---- */
const bset = await page.evaluate(async () => {
  const l = await import('./js/loot.js');
  await l.grantPet('random', 'audit'); await l.grantPet('random', 'audit'); await l.grantPet('random', 'audit');
  await l.boneDustAdd(900);
  return (await l.breedStatus());
});
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1700);
await page.evaluate(() => document.getElementById('stableBtn')?.click());
await sleep(2300);
/* v317: the Stable is a coverflow, so there is exactly ONE breed button at a
   time (the pet in front). Flagging two pets means what a player actually does:
   flag the pet you are looking at, spin the ring, flag the next one. Driving it
   the old way (click two buttons that both exist) would silently test nothing,
   because only one such button is ever in the DOM now. */
const flagged = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const flag = () => document.querySelector('[data-breedsel]')?.click();
  const spin = () => {
    const dots = [...document.querySelectorAll('.cf-dots i')];
    const on = dots.findIndex(d => d.classList.contains('on'));
    const next = dots[(on + 1) % Math.max(1, dots.length)];
    if (next) next.click();
  };
  if (document.querySelectorAll('.cf-card').length < 2) return 0;
  flag(); await wait(800);
  spin(); await wait(900);
  flag(); await wait(1100);
  return document.querySelectorAll('.cf-card.picked').length;
});
ok('BREED two pets can be flagged', flagged === 2, `${flagged} flagged, ready=${bset.ready}`);

const clarity = await page.evaluate(() => {
  const bar = document.querySelector('.breed-bar');
  if (!bar) return { why: 'no .breed-bar' };
  const t = bar.innerText;
  const btn = bar.querySelector('#doBreed');
  return {
    heading: !!bar.querySelector('.breed-h'),
    trade: !!bar.querySelector('.breed-trade'),
    keptLabel: /kept/i.test(t),
    fedLabel: /fed in/i.test(t),
    saysDestroyed: /is destroyed/i.test(t),
    saysSameLevel: /same level and look/i.test(t),
    picker: /which one are you keeping/i.test(t),
    facts: bar.querySelectorAll('.breed-facts li').length,
    btn: (btn?.textContent || '').trim(),
  };
});
/* The FEED model (Tom 2026-08-07): a spare goes into a pet you keep. The panel
   must say which pet survives, that it keeps its level and look, and that the
   spare is destroyed, all BEFORE the tap. */
ok('BREED-CLARITY the panel states the trade up front',
   clarity.heading && clarity.trade && clarity.keptLabel && clarity.fedLabel
   && clarity.saysDestroyed && clarity.saysSameLevel && clarity.picker && clarity.facts >= 3,
   JSON.stringify(clarity));
ok('BREED-CLARITY the button names the pet being destroyed', /^Feed .+ in$/.test(clarity.btn), `"${clarity.btn}"`);
await shot('breed-panel');

// and it must ARM: breeding permanently destroys two pets
const armed = await page.evaluate(async () => {
  const b = document.querySelector('#doBreed');
  if (!b || b.disabled) return { why: b ? 'button disabled' : 'no button' };
  const before = (b.textContent || '').trim();
  b.click(); await new Promise(r => setTimeout(r, 900));
  const after = (document.querySelector('#doBreed')?.textContent || '').trim();
  const sheets = document.querySelectorAll('.sheet').length;
  return { before, after, armedNotBred: after !== before, sheets };
});
ok('BREED-CLARITY one tap arms, it does not breed', armed.armedNotBred === true, JSON.stringify(armed));

const bred = await page.evaluate(async () => {
  document.querySelector('#doBreed')?.click();   // second tap confirms
  await new Promise(r => setTimeout(r, 2600));
  const t = document.querySelector('.sheet.takeover');
  const fused = document.querySelector('.fused');
  return { takeover: !!t, showsParents: !!fused, note: (document.querySelector('.fused-note')?.textContent || '').trim() };
});
ok('TAKEOVER breed result owns the screen', bred.takeover, JSON.stringify(bred));
ok('BREED result shows the pet it consumed', bred.showsParents && /was fed in/i.test(bred.note), JSON.stringify(bred));
await shot('breed-result');

ok('NO page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
srv.kill();
const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join(', ')); process.exit(1); }
console.log('t2-audit clean');
