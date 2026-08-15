/* PROBE, not an audit. Measures whether .arena moves or resizes when the action
   tray below it changes button count. Run: node tests/arena-static-probe.mjs [url] */
import { boot, sleep, settle, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv[2] || process.env.URL;
const srv = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srv.url;
const { browser, page } = await boot(base);

const WIDTHS = [[375, 667], [390, 844], [430, 932]];

async function closeAll() {
  await page.evaluate(() => document.querySelectorAll('.sheet-close').forEach(b => b.click()));
  await sleep(400);
}

async function stockPotions(all) {
  await page.evaluate(async all => {
    const { kvSet } = await import('./js/db.js');
    const { POTIONS } = await import('./js/cooking.js');
    await kvSet('potions', all ? Object.fromEntries(POTIONS.map(p => [p.id, 3])) : {});
  }, all);
}

async function openFight() {
  await page.evaluate(async () => { await window.__denFight(1.6, 0); });
  const w = await page.waitForFunction(() => {
    const f = document.getElementById('factions');
    if (!f || /is acting/i.test(f.textContent || '')) return false;
    return f.querySelectorAll('.fight-act').length >= 3;
  }, { timeout: 9000, polling: 50 }).then(() => 'ready').catch(() => 'timed-out');
  await sleep(500); await settle(page);
  return w;
}

const measure = () => page.evaluate(() => {
  const r = s => { const e = typeof s === 'string' ? document.querySelector(s) : s; if (!e) return null;
    const b = e.getBoundingClientRect(); return { top: Math.round(b.top), h: Math.round(b.height), bottom: Math.round(b.bottom) }; };
  const f = document.getElementById('factions');
  const arena = document.querySelector('.arena');
  const foeImg = document.querySelector('#foeStage img, #foeStage .bh-layer, #foeStage');
  return {
    vh: innerHeight,
    arena: r('.arena'), foeStage: r('#foeStage'), youStage: r('#youStage'),
    factions: r('#factions'), endrow: r('#fendrow'), endTurn: r('#endTurn'),
    btns: f ? f.querySelectorAll('.fight-act').length : 0,
    trayScrollH: f ? f.scrollHeight : 0,
    foeArt: foeImg ? r(foeImg) : null,
    arenaClip: arena && foeImg ? Math.round(arena.getBoundingClientRect().top - foeImg.getBoundingClientRect().top) : null,
  };
});

/* hit test every potion button centre */
const potionHits = () => page.evaluate(() => [...document.querySelectorAll('.fight-act.potion')].map(b => {
  const r = b.getBoundingClientRect(), cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  return { label: (b.querySelector('b') || {}).textContent || '?', ok: !!hit && (hit === b || b.contains(hit)), at: `${cx},${cy}`,
           got: hit ? (hit.className || hit.tagName).toString().slice(0, 40) : 'null' };
}));

const STATES = [
  { id: 'A-bare', desc: 'empty kitchen, player turn (no ITEMS door)', potions: false, open: false },
  { id: 'B-items-closed', desc: 'six potions stocked, ITEMS door CLOSED', potions: true, open: false },
  { id: 'C-items-open', desc: 'six potions stocked, ITEMS door OPEN', potions: true, open: true },
  { id: 'D-foe-turn', desc: "foe acting: one placeholder line (fewest)", potions: true, open: false, foeTurn: true },
];

const out = {};
for (const [w, h] of WIDTHS) {
  out[`${w}x${h}`] = {};
  for (const st of STATES) {
    await closeAll();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await sleep(300);
    await stockPotions(st.potions);
    const ready = await openFight();
    if (st.open) { await page.evaluate(() => document.getElementById('itemsOpen')?.click()); await sleep(600); await settle(page); }
    if (st.foeTurn) {
      await page.evaluate(() => document.getElementById('endTurn')?.click());
      await page.waitForFunction(() => /is acting/i.test(document.getElementById('factions')?.textContent || ''), { timeout: 5000, polling: 30 }).catch(() => {});
      await sleep(120);
    }
    /* toasts float over the bottom of the phone and are pure noise for a hit
       test; wait them out rather than grading the app on a banner. */
    await page.waitForFunction(() => ![...document.querySelectorAll('.toast')]
      .some(t => t.getBoundingClientRect().height > 0), { timeout: 8000, polling: 100 }).catch(() => {});
    const m = await measure();
    const hits = st.open ? await potionHits() : null;
    out[`${w}x${h}`][st.id] = { ready, ...m, hits };
  }
}

console.log(JSON.stringify(out, null, 1));

/* the table */
for (const [size, states] of Object.entries(out)) {
  console.log(`\n## ${size}`);
  console.log('state           | btns | arena.top | arena.h | arena.bottom | tray.top | tray.h | endTurn.bottom');
  for (const [id, m] of Object.entries(states)) {
    const a = m.arena || {}, f = m.factions || {}, e = m.endTurn || {};
    console.log(`${id.padEnd(15)} | ${String(m.btns).padStart(4)} | ${String(a.top).padStart(9)} | ${String(a.h).padStart(7)} | ${String(a.bottom).padStart(12)} | ${String(f.top).padStart(8)} | ${String(f.h).padStart(6)} | ${String(e.bottom).padStart(14)}`);
  }
  const hs = Object.values(states).map(m => (m.arena || {}).h).filter(x => x != null);
  const ts = Object.values(states).map(m => (m.arena || {}).top).filter(x => x != null);
  console.log(`ARENA DELTA: height spread ${Math.max(...hs) - Math.min(...hs)}px, top spread ${Math.max(...ts) - Math.min(...ts)}px`);
  const c = states['C-items-open'];
  if (c && c.hits) console.log(`potion hits: ${c.hits.filter(x => x.ok).length}/${c.hits.length}  ${JSON.stringify(c.hits.filter(x => !x.ok))}`);
  const bs = Object.values(states).map(m => m.arenaClip).filter(x => x != null);
  if (bs.length) console.log(`boss art top vs arena top (positive = art starts above arena, clipped): ${bs.join(', ')}`);
}

await browser.close();
if (srv) await srv.close();
