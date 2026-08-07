/* NO DEAD TEMPLATE PLACEHOLDERS. Nothing may ever print a literal ${...}.
 *
 * THE BUG, twice. Tom shipped v279 with `${ICONS.check(11)}` printed on the
 * protein row. I fixed that ONE line and never grepped for its siblings. On
 * 2026-08-08 he sent Android screenshots of `${ICONS.check(12)}` on the Activity
 * card and `${ICONS.check(13)}` twice on the Quests card: "you got more of these
 * weird ass things showing up in the text... cut it with the sloppy work bro".
 * He was right. The shape is always the same: a template placeholder written
 * inside a SINGLE-quoted string that is nested in a template literal, so it
 * never interpolates and prints as text.
 *
 * TWO CHECKS, because either alone is escapable:
 *   STATIC   scan the source for a quoted string that builds markup AND holds a
 *            ${...}. Catches it before it can render, including on screens no
 *            test drives.
 *   RENDERED walk real screens and sheets in a real browser and fail on a
 *            literal "${" in anything the player can read. Catches shapes the
 *            static rule cannot see (concatenation, data from a store).
 *
 * PROVE-RED (confirmed 2026-08-08): change any `${ICONS.check(13)}` back to
 * single quotes and STATIC names the file and line; the RENDERED pass then names
 * the screen.
 *
 * Usage: node tests/placeholder-audit.mjs        (add URL=... for live)
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'js');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

/* ---------------- STATIC ---------------- */
// A quoted run that contains BOTH a placeholder and a tag is building UI in a
// string that cannot interpolate. Runs with a backtick inside are template
// literals doing legitimate nesting and are left alone.
const dead = [];
for (const f of readdirSync(JS).filter(n => n.endsWith('.js'))) {
  const src = readFileSync(path.join(JS, f), 'utf8').split('\n');
  src.forEach((line, i) => {
    for (const q of ["'", '"']) {
      const re = new RegExp(`${q}([^${q}\\n]*)${q}`, 'g');
      let m;
      while ((m = re.exec(line))) {
        const seg = m[1];
        if (!seg.includes('${') || !/<\/?[a-z]/i.test(seg) || seg.includes('`')) continue;
        // An apostrophe inside prose ("the device's store") looks exactly like an
        // opening quote to a regex. A string literal only ever OPENS after an
        // operator, a delimiter or the start of the line, never after a letter.
        const before = line.slice(0, m.index).trimEnd().slice(-1);
        if (before && /[A-Za-z0-9_$]/.test(before)) continue;
        dead.push(`js/${f}:${i + 1}  ${seg.trim().slice(0, 90)}`);
      }
    }
  });
}
ok('STATIC no markup string carries an uninterpolated ${...}', dead.length === 0,
  dead.length ? '\n      ' + dead.join('\n      ') : `${readdirSync(JS).filter(n => n.endsWith('.js')).length} files clean`);

/* ---------------- RENDERED ---------------- */
let srv = null;
let base = process.env.URL;
if (!base) {
  srv = spawn('python3', ['-m', 'http.server', '8153', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(900);
  base = 'http://127.0.0.1:8153/';
}
const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
// rich state: quests in every claim state and a native-style health sync are the
// two screens that were actually broken, so the seed has to reach both
await seed(page, { level: 22, coins: 900, steps: 8400 });
/* Reach the states that were ACTUALLY broken, or this half of the audit passes
   on a sample that cannot contain the bug. Both live glyphs were in conditional
   branches: the Activity card's "Auto" chip needs a native health sync, and the
   quest tick needs a CLAIMED quest (a ledger row keyed quest-<period>-<id>). */
await page.evaluate(async () => {
  const { kvSet, kvGet, db } = await import('./js/db.js');
  const settings = (await kvGet('settings', {})) || {};
  await kvSet('settings', { ...settings, hkNative: true, hkConnected: true });
  const q = await import('./js/quests.js');
  const date = new Date().toISOString().slice(0, 10);
  const tiers = [
    ['day', q.dailyQuests(date)],
    ['week', q.weeklyQuests(date)],
    ['month', q.monthlyQuests(date)],
  ];
  for (const [period, list] of tiers) {
    const pk = q.periodKeyOf(period, date);
    for (const item of list.slice(0, 2)) {
      await db.put('xp', { key: `quest-${pk}-${item.id}`, type: 'quest', xp: 10, label: `Claimed ${item.id}`, ts: Date.now() });
    }
  }
});

const scan = () => page.evaluate(() => {
  const bad = [];
  const walk = root => {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = it.nextNode())) {
      const t = (n.nodeValue || '');
      if (t.includes('${')) {
        const el = n.parentElement;
        if (el && el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue; // not visible
        bad.push(t.trim().slice(0, 80));
      }
    }
  };
  walk(document.body);
  return bad;
});

const SCREENS = ['#/today', '#/map', '#/friends', '#/me', '#/trends'];
const found = [];
let visited = 0;
for (const h of SCREENS) {
  await page.evaluate(hash => { location.hash = hash; }, h);
  await sleep(1800);
  visited++;
  for (const t of await scan()) found.push(`${h}  ${t}`);
}
// and the sheets that live behind taps on Today
for (const sel of ['#questsCard', '#stableBtn', '#kitchenBtn']) {
  await page.evaluate(hash => { location.hash = hash; }, '#/today');
  await sleep(1200);
  const clicked = await page.evaluate(s => { const b = document.querySelector(s); if (!b) return false; b.click(); return true; }, sel);
  if (!clicked) continue;
  await sleep(1500);
  visited++;
  for (const t of await scan()) found.push(`${sel}  ${t}`);
  await page.evaluate(() => history.back());
  await sleep(600);
}

ok('RENDERED the audit actually visited screens (an empty sample is a FAILURE)', visited >= 5, `${visited} surfaces`);
ok('RENDERED nothing on screen prints a literal ${...}', found.length === 0,
  found.length ? '\n      ' + found.join('\n      ') : `${visited} surfaces clean`);

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
