/* THE STATIC SWEEP SAYS THESE CLASSES CANNOT EXIST. THIS ONE GOES AND LOOKS.
 *
 * tests/dead-weight-audit.mjs decides, from source alone, that a CSS rule can
 * never match. Acting on that means DELETING working UI if it is ever wrong,
 * and it was wrong six separate times while it was being written: a sentinel
 * that read as a class, a lexer that lost every string inside a ${...}, a
 * static class head read as a bare fragment, a skip pattern that swallowed
 * js/icons-pack.js, an unmodelled regex literal at js/app.js:88 that mis-lexed
 * the remaining 16,500 lines, and vendor/maplibre's own classes counted as
 * unemitted. Every one produced a clean, confident, WRONG list. Source
 * analysis cannot audit itself.
 *
 * And acting on it broke app.css once, in a way no static check saw: a cut that
 * ate an `@media (...) {` opener left a stray brace, and a browser answers a
 * stray brace by dropping the rest of the stylesheet. That is why the PARSE
 * check below counts rules in the browser's own CSSOM and not in the file.
 *
 * So this is the other witness. It boots the real app, walks every screen it
 * can reach, and records every class and id that ever touches the live DOM,
 * through a MutationObserver installed before the app renders anything, so a
 * class that exists for 200ms during a crate reveal is caught the same as one
 * that sits on the Today screen all day.
 *
 * DIRECTION AND BOUND, because "we looked and it seemed fine" is not a check:
 *   FAILURE is a token the static sweep called DEAD appearing in the live DOM.
 *   The bound is ZERO, not "few". One is a false positive, and one false
 *   positive is a deleted feature.
 *   The reverse is NOT a failure: a token never seen here is not thereby dead,
 *   because no drive reaches every sheet in this app.
 *
 * THE CONTROL, so this cannot pass vacuously. After a deletion lands, the DEAD
 * list is empty and "no dead token appeared" is true of any page including a
 * blank one, which is exactly the shape of the crate-reveal check this repo
 * already got burned by. So the run also takes a sample of tokens the sweep
 * calls ALIVE and requires them to be OBSERVED. If the observer is broken, or
 * the app never rendered, or the drive never left the first screen, the control
 * fails and nothing else in the run is worth reading.
 *
 * WHAT IT CANNOT REACH is printed on every run rather than implied away. The
 * ?demo seed does not open every sheet: anything behind a purchase, a real
 * fight outcome, a signed-in Crew account, a camera or a geolocation permission
 * is not on this route, and the unreached list names them.
 *
 * Usage: node tests/dead-weight-live-audit.mjs      (URL=... to drive a build)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveTree, loadPuppeteer, sleep, settle, fightRung, finishFight } from './godmode.js';
import { lex, lexHtml, sweepCss } from './dead-weight-audit.mjs';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (n, p, d = '') => { results.push({ name: n, pass: p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

/* ---- the static verdicts, recomputed here so the two halves cannot drift --- */
const SKIP_DIR = /[/\\](node_modules|\.git|assets|icons|vendor|_feedback_shots)([/\\]|$)/;
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (SKIP_DIR.test(full)) continue;
    if (e.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
};
const sources = new Map();
for (const d of ['js', 'data', 'native', 'server', 'scripts', 'help', 'gwart', 'tests', 'docs']) {
  for (const f of walk(path.join(ROOT, d))) {
    if (!/\.(js|mjs|cjs|html?|json|webmanifest)$/.test(f)) continue;
    const rel = path.relative(ROOT, f);
    const src = readFileSync(f, 'utf8');
    sources.set(rel, /\.html?$/.test(rel) ? lexHtml(src) : lex(src));
  }
}
for (const f of readdirSync(ROOT)) {
  const full = path.join(ROOT, f);
  if (statSync(full).isFile() && /\.(js|mjs|html?|json|webmanifest)$/.test(f) && !sources.has(f)) {
    sources.set(f, /\.html?$/.test(f) ? lexHtml(readFileSync(full, 'utf8')) : lex(readFileSync(full, 'utf8')));
  }
}
const cssText = readFileSync(path.join(ROOT, 'app.css'), 'utf8');
/* vendor/ read RAW and handed to the sweep exactly as the static half does it.
   Omitting it here made this audit judge SIX more tokens than the static one,
   including .maplibregl-canvas, which the map really does render: the two
   halves must be asking the same question or the live one starts reporting
   false positives against findings that were never made. */
const walkRaw = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walkRaw(f, out); else out.push(f);
  }
  return out;
};
const vendorText = walkRaw(path.join(ROOT, 'vendor')).filter(f => /\.(js|mjs|css)$/.test(f)).map(f => readFileSync(f, 'utf8')).join('\n');
if (vendorText.length < 100000) throw new Error('vendor/ not read: this run would judge classes the map emits');
const CSS = sweepCss(cssText, sources, vendorText);
const tokensOf = verdict => new Set(CSS.findings.filter(f => f.verdict === verdict)
  .flatMap(f => f.perSel.flatMap(p => p.why.map(w => w.tok))));
const DEAD = tokensOf('dead');
const KEPT = new Set([...tokensOf('dynamic'), ...tokensOf('mentioned')]);
/* The control sample: classes the sweep calls ALIVE, taken off the rules that
   style the screens this drive actually visits, so "observed" is a fair ask. */
const CONTROL = ['screen', 'tabbar', 'card', 'btn', 'chip', 'sheet', 'hero-act', 'bhi'];

ok('SETUP the static verdicts were recomputed here (an empty verdict set is a FAILURE)',
  CSS.rules.length > 500 && CONTROL.length > 4, `${CSS.rules.length} rules, ${DEAD.size} dead tokens, ${KEPT.size} kept-but-unproven tokens`);

/* --------------------------------------------------------------- the drive */
const puppeteer = await loadPuppeteer();
const argUrl = process.env.URL || process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = (argUrl || srv.url).replace(/\/?$/, '/');

const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'new',
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    ...(process.getuid?.() === 0 ? ['--no-sandbox', '--disable-setuid-sandbox'] : [])],
});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message.slice(0, 160)));

/* Installed on EVERY document before any app script runs. Sampling the DOM at
   the end of each screen would miss every class that lives inside an
   animation, a toast or a reveal, and those are exactly the ones a static
   sweep is least sure about. */
await page.evaluateOnNewDocument(() => {
  window.__seen = new Set();
  const take = el => {
    if (!el || el.nodeType !== 1) return;
    if (el.classList) for (const c of el.classList) window.__seen.add('.' + c);
    if (el.id) window.__seen.add('#' + el.id);
    if (el.children) for (const k of el.children) take(k);
  };
  const obs = new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'attributes') take(m.target);
      for (const n of m.addedNodes) take(n);
    }
  });
  const start = () => {
    take(document.documentElement);
    obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'id'] });
  };
  if (document.documentElement) start(); else document.addEventListener('readystatechange', start, { once: true });
});

const visited = [], unreached = [];
/* Counted from the BROWSER's own parse, not from the file. Deleting rules by
   byte range is how this sweep's findings get acted on, and a cut that eats an
   `@media (...) {` opener leaves a stray brace that a browser recovers from by
   DROPPING everything after it. app.css went brace-unbalanced exactly that way
   during this work and nothing static noticed. If the CSSOM holds far fewer
   rules than the file does, the stylesheet was truncated by a syntax error. */
const fileRuleCount = (readFileSync(path.join(ROOT, 'app.css'), 'utf8').match(/\{/g) || []).length;
const snap = async label => {
  await settle(page, 120);
  const n = await page.evaluate(() => window.__seen.size);
  visited.push(`${label}(${n})`);
};

await page.goto(base + '?demo', { waitUntil: 'networkidle2' });
await sleep(3500);
/* clear the opening ceremony, and every dialog it queues behind it */
for (let i = 0; i < 12; i++) {
  const hit = await page.evaluate(() => {
    const rx = /^(spin|nice|done|collect|claim|continue|ok|got it|next|skip|close|let me at them|start)$/i;
    const b = [...document.querySelectorAll('button')].find(x => rx.test((x.textContent || '').trim()) && x.getBoundingClientRect().width);
    if (!b) return false; b.click(); return true;
  });
  if (!hit) break;
  await sleep(900);
}
await snap('boot');

const ROUTES = ['today', 'bonehead', 'boneyard', 'shop', 'progress', 'trends', 'friends', 'settings', 'quests', 'pit'];
for (const r of ROUTES) {
  await page.evaluate(h => { location.hash = '#/' + h; }, r);
  await sleep(1800);
  const alive = await page.evaluate(() => (document.querySelector('#screen')?.textContent || '').trim().length);
  if (alive > 20) await snap('#/' + r); else unreached.push(`#/${r} (rendered ${alive} chars)`);
}

/* the hub's own tab strip, which is a different render path from the router */
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(1800);
const tabs = await page.evaluate(() => [...document.querySelectorAll('.chip.ch-tab')].map(t => (t.textContent || '').trim()));
for (const label of tabs) {
  await page.evaluate(l => { const t = [...document.querySelectorAll('.chip.ch-tab')].find(x => (x.textContent || '').trim() === l); t?.click(); }, label);
  await sleep(1400);
  await snap('hub:' + label);
}

/* Every sheet this seed can open, driven by clicking real controls rather than
   by calling the open* functions, because calling the function proves the sheet
   renders and proves nothing about whether the app can get you there. Then one
   level DEEPER, because the classes a static sweep is least sure about (the
   cauldron, the beds, the breeding grid, a loot card) live inside a sheet that
   another sheet opened, and a one-level drive never sees them. */
for (const r of ['today', 'progress', 'bonehead', 'shop', 'boneyard', 'settings']) {
  await page.evaluate(h => { location.hash = '#/' + h; }, r);
  await sleep(1600);
  const outer = await page.evaluate(() => [...document.querySelectorAll('#screen button, #screen [role=button], #screen [data-act], #screen .hero-act')]
    .map((b, i) => ({ i, t: (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22) })).slice(0, 18));
  for (const b of outer) {
    const clicked = await page.evaluate(i => {
      const list = [...document.querySelectorAll('#screen button, #screen [role=button], #screen [data-act], #screen .hero-act')];
      const el = list[i]; if (!el || !el.getBoundingClientRect().width) return false;
      el.click(); return true;
    }, b.i);
    if (!clicked) continue;
    await sleep(1100);
    await snap(`${r}>${b.t || '?'}`);
    /* inside whatever opened: tap its own controls, then come back out */
    const inner = await page.evaluate(() => [...document.querySelectorAll('#sheets .sheet button, #sheets .sheet [data-act]')]
      .map((x, i) => ({ i, t: (x.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18) })).slice(0, 8));
    for (const c of inner) {
      const hit = await page.evaluate(i => {
        const list = [...document.querySelectorAll('#sheets .sheet button, #sheets .sheet [data-act]')];
        const el = list[i];
        if (!el || !el.getBoundingClientRect().width || /^(erase|delete|sign out|reset)/i.test(el.textContent || '')) return false;
        el.click(); return true;
      }, c.i);
      if (!hit) continue;
      await sleep(800);
      await snap(`${r}>${b.t}>${c.t || '?'}`);
    }
    await page.evaluate(() => { let n = 0; while (document.querySelector('#sheets .sheet') && n++ < 4) history.back(); });
    await sleep(800);
  }
}

/* A REAL fight, resolved through the game's own engine, because the fight
   stage, the loot cards and the level-up sheet are a third of the classes a
   static sweep has the least corroboration for, and no amount of clicking
   around the Today screen reaches them. Reported either way: a fight this
   harness could not start is an UNREACHED screen, not a silent gap. */
try {
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1600);
  const started = await fightRung(page, 1);
  if (started) {
    await snap('pit:fight-stage');
    const res = await finishFight(page, 'p');
    await sleep(2200);
    await snap('pit:fight-result' + (res ? '' : '-unresolved'));
    for (let i = 0; i < 6; i++) {
      const hit = await page.evaluate(() => {
        const rx = /^(done|collect|claim|continue|ok|next|take|keep)$/i;
        const b = [...document.querySelectorAll('button')].find(x => rx.test((x.textContent || '').trim()) && x.getBoundingClientRect().width);
        if (!b) return false; b.click(); return true;
      });
      if (!hit) break;
      await sleep(1200);
      await snap('pit:after-fight-' + i);
    }
  } else unreached.push('the Pit ladder (rung 1 would not start on this seed)');
} catch (e) { unreached.push(`a real fight (${String(e.message).slice(0, 60)})`); }

const cssom = await page.evaluate(() => {
  const sheet = [...document.styleSheets].find(s => (s.href || '').includes('app.css'));
  if (!sheet) return { err: 'app.css is not among the loaded stylesheets' };
  let n = 0;
  const walk = list => { for (const r of list) { n++; if (r.cssRules) walk(r.cssRules); } };
  try { walk(sheet.cssRules); } catch (e) { return { err: String(e.message).slice(0, 80) }; }
  return { n };
});
const seen = new Set(await page.evaluate(() => [...window.__seen]));
await browser.close();
if (srv) srv.close();

/* --------------------------------------------------------------- the verdict */
ok('PARSE the browser parsed app.css whole (a stray brace makes it drop the rest silently)',
  !cssom.err && cssom.n > fileRuleCount * 0.9,
  cssom.err ? cssom.err : `${cssom.n} rules in the CSSOM against ${fileRuleCount} opening braces in the file`);

const classCount = [...seen].filter(s => s.startsWith('.')).length;
ok('CONTROL the observer actually saw the app (an empty observation set is a FAILURE)',
  classCount > 300, `${classCount} distinct classes and ${seen.size - classCount} ids observed across ${visited.length} stops`);

const controlMissing = CONTROL.filter(c => !seen.has('.' + c));
ok('CONTROL classes the sweep calls ALIVE were observed live, so a clean run is not vacuous',
  controlMissing.length === 0, controlMissing.length ? `NOT observed: ${controlMissing.join(', ')}` : `all ${CONTROL.length} observed`);

const contradicted = [...DEAD].filter(t => seen.has('.' + t) || seen.has('#' + t)).sort();
for (const t of contradicted) console.log(`LIVE  ${t}  the static sweep called this DEAD and the app rendered it`);
ok('no token the static sweep called DEAD appeared in the live DOM',
  contradicted.length === 0,
  contradicted.length ? `${contradicted.length} FALSE POSITIVES: ${contradicted.join(', ')}` : `${DEAD.size} dead tokens, none observed`);

/* Corroboration, not a gate. These are the tokens the sweep refused to judge;
   seeing them live is the conservatism earning its keep, and NOT seeing them is
   the shortlist for the next pass, not a licence to delete. */
const keptSeen = [...KEPT].filter(t => seen.has('.' + t) || seen.has('#' + t));
console.log(`\nCORROBORATION  ${keptSeen.length} of ${KEPT.size} DYNAMIC/MENTIONED tokens were rendered live, so the sweep was right not to delete them.`);
console.log(`               ${KEPT.size - keptSeen.length} were not rendered on this route: candidates for eyes, never for a script.`);
console.log(`\nREACHED (${visited.length}): ${visited.join(' ')}`);
console.log(`UNREACHED (${unreached.length}): ${unreached.join(' ') || 'every route in the list rendered'}`);
console.log('NOT ON THIS ROUTE BY CONSTRUCTION: anything behind a purchase, a real fight result, a signed-in Crew account, camera or geolocation permission, or a server that this harness does not run.');
if (pageErrors.length) console.log(`page errors during the drive (not graded here): ${pageErrors.slice(0, 3).join(' | ')}`);

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
