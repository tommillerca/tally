/* Pre-push sweep of every screen the Tier 1 work did NOT target.
 *
 * WHY. v272 changes two things globally: `--ink` moved from #100c14 to the deck's
 * #2a2d28 (every hand-inked border in the app), and the token block gained
 * colours/sizes/shadows. Tier 1's own audit covers the eight surfaces I rebuilt.
 * Anti-regression rule 7 says touching shared plumbing means sweeping every
 * consumer KIND, not the one you were looking at. This is that sweep.
 *
 * It is deliberately shallow and broad: open each screen, assert it rendered
 * something, and collect console/page errors. It is a smoke test, not a design
 * review. An empty DOM or a thrown error fails the push.
 *
 * Usage: node tests/screen-sweep.mjs   (SHOTS=dir to keep screenshots)
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serveTree } from './godmode.js';

/* This harness never advances CSS animations: an element reports playState
   'running' with currentTime stuck at 0, so anything that fades in paints at its
   FROM keyframe forever. Finish them before measuring opacity. */
const settle = async (page, ms = 250) => {
  await page.evaluate(() => document.getAnimations().forEach(a => { try { a.finish(); } catch {} }));
  await new Promise(r => setTimeout(r, ms));
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = path.join(process.env.HOME, 'Documents/Hyperframes Editor/overlay-render-kit/node_modules/puppeteer');
const puppeteer = (await import(path.join(KIT, 'lib/cjs/puppeteer/puppeteer.js'))).default;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
base = base.replace(/\/?$/, '/');
const shots = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const browser = await puppeteer.launch({
  headless: 'new',
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

await page.goto(base + '?demo', { waitUntil: 'networkidle2' });
await sleep(3000);
for (let i = 0; i < 8; i++) {
  const hit = await page.evaluate(() => {
    const rx = /^(spin|nice|done|collect|claim|continue|ok|got it|next|skip)$/i;
    const b = [...document.querySelectorAll('button')].find(x => rx.test((x.textContent || '').trim()) && x.getBoundingClientRect().width);
    if (!b) return false; b.click(); return true;
  });
  if (!hit) break;
  await sleep(1100);
}

/* routes */
const ROUTES = ['today', 'bonehead', 'shop', 'progress', 'trends', 'friends', 'settings'];
for (const r of ROUTES) {
  await page.evaluate(h => { location.hash = '#/' + h; }, r);
  await sleep(2200);
  const info = await page.evaluate(() => {
    const s = document.querySelector('.screen');
    if (!s) return { missing: true };
    const h = s.querySelector('h1, h2, .page-h1, .day-title');
    return {
      text: (s.innerText || '').trim().length,
      nodes: s.querySelectorAll('*').length,
      heading: (h?.innerText || '').trim().slice(0, 40),
    };
  });
  /* An empty screen is a failure, never a pass. But node count is the wrong
     proxy for "rendered": the Crew screen signed out is a heading, one card and
     a CTA (11 nodes) and it is completely correct. Assert the screen put up its
     own heading and some real text. */
  ok(`route #/${r} rendered`, !info.missing && !!info.heading && info.text > 40,
     info.missing ? 'no .screen at all' : `"${info.heading}" · ${info.text} chars, ${info.nodes} nodes`);
  if (shots) await page.screenshot({ path: path.join(shots, `sweep-${r}.png`) });
}

/* the six hub tabs share one shell; each has its own content */
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(2200);
const tabs = await page.evaluate(() => [...document.querySelectorAll('.chip.ch-tab')].map(t => (t.textContent || '').trim()));
ok('hub exposes its tabs', tabs.length >= 4, tabs.join(' | '));
for (const label of tabs) {
  const clicked = await page.evaluate(l => {
    const t = [...document.querySelectorAll('.chip.ch-tab')].find(x => (x.textContent || '').trim() === l);
    if (!t) return false; t.click(); return true;
  }, label);
  await sleep(1700);
  const nodes = await page.evaluate(() => document.querySelectorAll('.screen *').length);
  ok(`hub tab ${label} rendered`, clicked && nodes > 20, `${nodes} nodes`);
  if (shots) await page.screenshot({ path: path.join(shots, `sweep-hub-${label.replace(/\W+/g, '')}.png`) });
}

/* a couple of sheets that use the LEGACY .field / .chips recipes, which Tier 1
   deliberately did not migrate. If the token change broke them it shows here. */
await page.evaluate(() => { location.hash = '#/progress'; });
await sleep(2200);
const legacy = await page.evaluate(async () => {
  const b = document.querySelector('#logWeight');
  if (!b) return { reason: 'no #logWeight on Progress' };
  b.click();
  await new Promise(r => setTimeout(r, 1400));
  const sheet = document.querySelector('.sheet');
  if (!sheet) return { reason: 'tapping Log weight opened no sheet' };
  const f = sheet.querySelector('.field input');
  const cs = f ? getComputedStyle(f) : null;
  return {
    opened: true,
    fields: sheet.querySelectorAll('.field').length,
    // the token change must not have blanked a legacy input's own border
    border: cs ? cs.borderTopWidth + ' ' + cs.borderTopColor : null,
  };
});
ok('legacy .field sheet still opens and is styled',
   !legacy.reason && legacy.opened && legacy.fields >= 2 && !/^0px/.test(legacy.border || '0px'),
   JSON.stringify(legacy));
if (shots) await page.screenshot({ path: path.join(shots, 'sweep-legacy-sheet.png') });

ok('NO page or console errors', errors.length === 0, errors.slice(0, 4).join(' | '));


/* ---- ARRIVAL: every screen becomes visible, and does so WHOLE ---------------
   Tom, 2026-08-08: "I want these tabs fully loaded before anyone is interacting."
   Screens are now hidden until their art has decoded (revealWhenReady in the
   router and in openSheet). That is a pattern with one catastrophic failure mode:
   if the reveal never fires, the tab is BLANK and the app looks broken. This is
   anti-regression rule 8 in a test -- anything that hides content pending an
   async result must own un-hiding it.
   PROVE-RED: delete the revealWhenReady call in route() and every tab below
   fails at opacity 0 with content present. */
for (const t of ['today', 'boneyard', 'friends', 'bonehead', 'progress']) {
  await page.evaluate(tab => { location.hash = '#/' + tab; }, t);
  await sleep(2200);
  /* This harness never advances CSS animations (playState 'running', currentTime
     stuck at 0), so routeIn paints at its FROM keyframe and every screen reads
     opacity 0 no matter how healthy it is. Finish them, then measure. The red
     case survives: if revealWhenReady never fires, route-in is never added and
     there is no animation to finish, so opacity stays 0 and this still fails. */
  await settle(page);
  const arrival = await page.evaluate(() => {
    const child = document.querySelector('#screen > *');
    if (!child) return { err: 'nothing rendered' };
    const cs = getComputedStyle(child);
    return {
      revealed: cs.opacity !== '0',
      hasRouteIn: child.classList.contains('route-in'),
      // the WHOLE screen, not just the first child: some screens render a thin
      // wrapper first and the content beside it, so a first-child-only count
      // reports 0 on a perfectly full page
      textLen: (document.querySelector('#screen')?.textContent || '').trim().length,
    };
  });
  ok(`ARRIVAL #/${t} becomes visible (a hidden screen is worse than an ugly one)`,
    !arrival.err && arrival.revealed && arrival.hasRouteIn, `${t}: ${JSON.stringify(arrival)}`);
  ok(`ARRIVAL #/${t} actually has content (an empty screen must not pass as revealed)`,
    !arrival.err && arrival.textLen > 20, `${t}: ${arrival.textLen} chars`);
}

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join(', ')); process.exit(1); }
console.log('screen-sweep clean');
