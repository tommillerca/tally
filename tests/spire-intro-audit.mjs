/* THE SPIRE ANNOUNCEMENT MUST ACTUALLY FIRE, FROM BOOT, ON ITS OWN.
 *
 * This exact failure has already shipped once on a sibling card, which is why
 * tests/teaser-fire-audit.mjs exists: an announcement is built inside a
 * setTimeout on the boot path, so an undeclared binding or a thrown promise in
 * there dies where nothing catches it, and the feature simply never announces
 * itself. Nothing errors on screen. Nobody finds out.
 *
 * maybeShowSpireIntro is the same shape: a try/catch that swallows everything
 * ("never block boot"), a kv one-shot, and a tick that waits for the screen to
 * be free. A coverage census on 2026-08-12 found no test pointed at it.
 * CORRECTION to that census, worth recording: it reported "no seam" and there
 * is one, `window.__spireForce`, the same override every other announcement
 * carries. So this is drivable without touching app code.
 *
 * WHAT THIS PINS:
 *   FIRES    the poster appears from the REAL boot path, nobody calling it
 *   CONTENT  it says what the feature is, rather than rendering an empty card
 *   ONCE     a second boot with the force flag still set shows nothing, so the
 *            one-shot is the thing stopping it and not luck
 *   CTA      the button goes to the Boneyard, which is the whole point of it
 *   USABLE   dismissing it gives the app back, hit-tested
 *
 * PROVE-RED: throw inside the tick and FIRES fails; drop the kvSet and ONCE
 * fails with the poster back on the second boot.
 *
 * Usage: node tests/spire-intro-audit.mjs [baseUrl]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const { browser, page } = await boot(base);

/* Registered before the reload so it exists when maybeShowSpireIntro runs on
   the boot path. Setting it afterwards would be too late: the gate has already
   returned. */
await page.evaluateOnNewDocument(() => { window.__spireForce = true; });
await page.reload({ waitUntil: 'networkidle2' });

/* Poll rather than sleeping a fixed time: the tick waits for the splash, any
   wheel and any other announcement to clear first, so the delay is not a
   constant and a fixed wait would make this flaky in one direction and slow in
   the other. */
const waitVeil = async (ms = 25000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await page.evaluate(() => !!document.querySelector('.spire-veil'))) return true;
    /* clear anything else that took the slot first, otherwise the spire card
       never gets its turn and this reads as "never fired" */
    await page.evaluate(() => {
      const other = [...document.querySelectorAll('.drop-veil')].find(v => !v.classList.contains('spire-veil'));
      if (other) other.remove();
    });
    await sleep(700);
  }
  return false;
};

const fired = await waitVeil();
ok('FIRES the announcement appears from the boot path, with nobody calling it', fired,
  fired ? '' : 'no .spire-veil within 25s: the tick died, or the gate refused');

const card = await page.evaluate(() => {
  const v = document.querySelector('.spire-veil');
  if (!v) return null;
  return {
    text: v.innerText.replace(/\s+/g, ' ').trim(),
    chars: v.innerText.replace(/\s+/g, ' ').trim().length,
    cta: v.querySelector('#spireIntroGo')?.textContent.trim() || null,
    buttons: [...v.querySelectorAll('button')].length,
  };
});
ok('CONTENT the card carries real copy, not an empty shell', !!card && card.chars > 60, card ? `${card.chars} chars` : 'no card');
ok('CONTENT it names what the feature is', !!card && /spire|tower|town/i.test(card.text), card ? card.text.slice(0, 70) : '');
ok('CONTENT it offers a way in', !!card && !!card.cta, card ? `cta="${card.cta}"` : '');

/* The CTA is the point of the whole card: it exists to put a player in front
   of the feature. A card that announces something and then goes nowhere is a
   worse outcome than not announcing it. */
const before = await page.evaluate(() => location.hash);
await page.evaluate(() => document.getElementById('spireIntroGo')?.click());
await sleep(1600);
const afterCta = await page.evaluate(() => ({ hash: location.hash, veil: !!document.querySelector('.spire-veil') }));
ok('CTA it takes you to the Boneyard and closes behind itself',
  /boneyard/i.test(afterCta.hash) && !afterCta.veil, `${before} -> ${JSON.stringify(afterCta)}`);

/* And the app must be usable afterwards: a veil that leaves its backdrop
   behind is the bug that made day-navigation impossible for a whole release. */
const usable = await page.evaluate(() => {
  const tab = document.querySelector('nav .tab, .tabbar button');
  const r = tab && tab.getBoundingClientRect();
  const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { tabFound: !!tab, owned: !!(hit && tab && (hit === tab || tab.contains(hit))) };
});
ok('USABLE the tab bar owns its own pixels again (hit-tested)', usable.tabFound && usable.owned, JSON.stringify(usable));

/* ONCE: the force flag is STILL SET on this reload, so if the poster stays
   away it is the kv one-shot doing it and nothing else. That is what makes
   this check mean something rather than just observing an absence. */
await page.reload({ waitUntil: 'networkidle2' });
const again = await waitVeil(12000);
ok('ONCE a second boot shows nothing, with the force flag still set', !again,
  again ? 'the poster fired twice: the one-shot is not holding' : 'stayed away for 12s');
/* CONTROL. ONCE asserts an ABSENCE, and an app that failed to boot at all shows
   exactly the same absence: a bad reload, a 404, a module that throws on the way
   up, and ONCE reports the one-shot holding on a page that never ran a line of
   the code it is grading. The absence only means something over a live app, so
   prove the app is live in the same breath. */
const alive = await page.evaluate(() => {
  const sc = document.getElementById('screen');
  return { kids: sc ? sc.children.length : -1, chars: (sc?.innerText || '').replace(/\s+/g, ' ').trim().length };
});
ok('CONTROL the second boot really ran the app, so that absence is the one-shot and not a dead page',
  alive.kids > 0 && alive.chars > 100, JSON.stringify(alive));

console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`);
await browser.close();
srv?.close();
process.exit(fails.length ? 1 : 0);
