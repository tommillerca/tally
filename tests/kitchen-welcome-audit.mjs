/* R38-21: THE KITCHEN'S WELCOME INSTRUCTION NEVER FIRED.
 *
 * HANDOFFr3820260906.md: "3 starter ingredients in your Kitchen: exactly one
 * Bone Broth. Cook it." sat behind `const pouch = kit ? null :
 * backfillStarterSeedsIfNeeded()` (js/app.js), and `kit` (initLootIfNeeded's
 * return) is truthy on every fresh install. New players got only "...and 3
 * ingredients in the Kitchen", with no instruction telling them what those
 * ingredients are for or that they should cook.
 *
 * A real new player never reaches boot()'s copy of that toast at all in their
 * first session: onboarding finishes through saveInitialSettings, which grants
 * the SAME welcome kit through its own call to initLootIfNeeded and shows its
 * OWN copy of the toast (js/app.js, enterAppFromOnboarding's caller). Both
 * copies had the same gap, so both were fixed the same way: the "Cook it"
 * instruction is now appended to the welcome-kit toast itself, the one message
 * every new player actually receives, rather than living only on the
 * pre-existing-install backfill path that a fresh install never reaches.
 *
 * THIS DRIVES THE REAL PATH: a fresh install (no ?demo, which seeds settings
 * and skips onboarding entirely), the real onboarding screens, the real
 * buttons -- same technique as tests/first-session-lifecycle-audit.mjs.
 * #toast is a queue (js/app.js) so this polls it repeatedly rather than
 * reading it once, the same discipline every toast-reading audit in this repo
 * uses (see the "DO NOT read #toast once and hope" note in tests/notif-audit.mjs).
 *
 * PROVE-RED: revert the copy in the two toast() calls to drop the "exactly one
 * Bone Broth. Cook it." clause and this goes red; nothing else in the suite
 * moves, because the toast fires either way, only the instruction is missing.
 *
 * Usage: node tests/kitchen-welcome-audit.mjs [baseUrl]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveTree, loadPuppeteer, chromePath, sandboxArgs, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'new',
  defaultViewport: { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  executablePath: chromePath(),
  args: [...sandboxArgs()],
});

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  // fresh install: no ?demo, no seeded kv, no reload before onboarding.
  await page.goto(base.replace(/\/?$/, '/'), { waitUntil: 'networkidle2' });
  await sleep(900);

  await page.waitForSelector('#saveNew', { visible: true });
  await page.click('#saveNew');
  await page.waitForSelector('#onbGo', { visible: true });
  const step0 = await page.evaluate(() => !!document.querySelector('#onbGo'));
  ok('ONBOARD step 0 renders for a fresh install', step0);
  if (step0) { await page.click('#onbGo'); await sleep(500); }

  const step1 = await page.evaluate(() => !!document.querySelector('#onbMe'));
  ok('ONBOARD step 1 renders', step1);
  if (step1) { await page.click('#onbMe'); await sleep(500); }

  const step2 = await page.evaluate(() => !!document.querySelector('#onbSkip'));
  ok('ONBOARD step 2 renders', step2);
  if (step2) { await page.click('#onbSkip'); await sleep(1600); }

  const landed = await page.evaluate(() => location.hash);
  ok('ONBOARD finishes into Today (no reload)', landed === '#/today', landed);

  /* Poll #toast repeatedly across the welcome-kit toast's own delay (fires at
     +1200ms in the onboarding path) plus its full 4200ms display window,
     rather than reading it once. A single read races the queue and a miss
     here would be a false red, which anti-regression rule 1 forbids. */
  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    const txt = await page.evaluate(() => {
      const t = document.querySelector('#toast');
      return t && !t.hidden ? (t.textContent || '').trim() : '';
    });
    if (txt) seen.add(txt);
    await sleep(300);
  }
  /* POSITIVE CONTROL: the polling loop above must be capable of seeing SOME
     toast, or a broken selector / a poll that always reads '' would make
     every check below pass on empty air. Proven against a toast this build
     definitely fires regardless of R38-21 (any onboarding completion shows
     something), so a genuinely blind poll goes red here first. */
  ok('SAMPLE the #toast poll captured at least one non-empty message', seen.size > 0, seen.size ? `${seen.size} distinct` : '(nothing ever read)');
  const kitToast = [...seen].find(t => /welcome kit/i.test(t));
  ok('KIT the welcome-kit toast fired at all (an empty sample is a FAILURE)', !!kitToast, kitToast || `saw: ${[...seen].join(' || ')}`);
  ok('INSTRUCTION the welcome-kit toast names the recipe and tells the player to cook it',
    !!kitToast && /bone broth/i.test(kitToast) && /cook it/i.test(kitToast),
    kitToast || '(no kit toast seen)');

  ok('NOERR no page error across onboarding', errors.length === 0, errors.join(' | ').slice(0, 300));
} finally {
  await browser.close();
  if (srv) srv.close();
}

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(failed ? 'KITCHEN WELCOME AUDIT FAILED' : 'KITCHEN WELCOME AUDIT VERIFIED');
process.exit(failed ? 1 : 0);
