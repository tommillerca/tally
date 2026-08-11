/* The FAQ has to be reachable, readable and TRUE. The failure that matters is not a
 * crash: it is copy that drifts from what the engine does, or a fold nobody can open. */
import { boot, sleep } from './godmode.js';
const DIR = '/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/a40abded-9d02-469c-8111-2200136500f1/scratchpad/shots';
const base = process.argv[2] || process.env.URL;
const { browser, page } = await boot(base);
let bad = 0;
/* DYING IS WORSE THAN FAILING. This suite crashed inside an evaluate on a selector
   that had been renamed away, so it produced a stack and NOT ONE assertion: the gate
   printed a blank blocker and it read like a flake. Everything below runs inside a
   guard that turns any throw into a named failure plus a crash tail, and the exit is
   non-zero either way. */
const crash = (where, e) => {
  bad++;
  console.log(`FAIL ${where} DIED: ${String(e && e.message || e).split('\n')[0]}`);
  console.log('     (a selector this suite depends on is probably gone; re-anchor it rather than deleting the check)');
};
const guard = async (where, fn, fallback = null) => {
  try { return await fn(); } catch (e) { crash(where, e); return fallback; }
};
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(1800);
await guard('opening the Build tab', () => page.evaluate(() => {
  const t = document.querySelector('#chTabs .ch-tab[data-tab="talents"]');
  if (!t) throw new Error('no #chTabs .ch-tab[data-tab="talents"]');
  t.click();
}));
await sleep(2000);

const card = await guard('reading the FAQ card', () => page.evaluate(() => {
  const c = document.querySelector('.faq-card');
  if (!c) return null;
  return {
    open: c.open,
    heading: c.querySelector('summary')?.textContent.trim(),
    styles: [...c.querySelectorAll('.faq-style > div > b:first-child')].map(b => b.textContent.trim()),
    folds: [...c.querySelectorAll('.faq-deep > summary')].map(s => s.textContent.trim()),
    /* RE-ANCHORED. This read `[data-bsect="fighter"]`, which no longer exists: the
       fighter section stopped being a <details class="bsect"> and became a plain
       `.t3-fighter` header line, with buildFaqHtml() rendering after it and the armour
       and stat controls after that. compareDocumentPosition(null) THREW, which is why
       the suite died before asserting anything.
       The intent was "the FAQ is above the controls", and that intent still holds, so
       the anchor is now the controls themselves (.t3-armor, the first control block
       after the FAQ) instead of a wrapper that has been renamed away. */
    aboveTheControls: (() => {
      const ctrls = document.querySelector('.t3-armor') || document.querySelector('.t3-stat');
      if (!ctrls) return null;   // null, not false: "could not tell" is not "it is wrong"
      return !!(c.compareDocumentPosition(ctrls) & Node.DOCUMENT_POSITION_FOLLOWING);
    })(),
  };
}));
console.log('faq card:', JSON.stringify(card));
check('the FAQ exists in the Build tab', !!card);
check('it is collapsed by default, so it never blocks the controls', card && card.open === false, String(card?.open));
check('it sits ABOVE the stat controls it explains', !!card?.aboveTheControls);
check('it offers a plain-language playstyle for each way to play', card?.styles.length === 4, JSON.stringify(card?.styles));
check('the deeper detail is folded, not missing', card?.folds.length === 2, JSON.stringify(card?.folds));

// open it the way a player would, then prove the copy matches the ENGINE
await page.evaluate(() => { const c = document.querySelector('.faq-card'); c.open = true; c.querySelectorAll('.faq-deep').forEach(d => d.open = true); });
await sleep(700);
const truth = await page.evaluate(async () => {
  const { STAT_META, TRAIN_STEP, TRAIN_CAP } = await import('./js/pit.js');
  const txt = document.querySelector('.faq-card').textContent;
  return {
    everyStatNamed: STAT_META.every(m => txt.includes(m.label)),
    everyCombatLineShown: STAT_META.every(m => txt.includes(m.combat)),
    stepStated: txt.includes('+' + TRAIN_STEP),
    capStated: txt.includes('+' + TRAIN_CAP),
    saysItIsOptional: /No\./.test(txt) && /plays perfectly well/.test(txt),
    saysItIsReversible: /refunds every point|hands back every point/i.test(txt),
    statNames: STAT_META.map(m => m.label),
  };
});
console.log('copy vs engine:', JSON.stringify(truth));
check("every stat is named, using the engine's own labels", truth.everyStatNamed, JSON.stringify(truth.statNames));
check("every stat's real combat effect is shown, not paraphrased", truth.everyCombatLineShown);
check('the real per-point and cap numbers are stated', truth.stepStated && truth.capStated);
check('it tells a non-gamer they can ignore the whole system', truth.saysItIsOptional);
check('and that nothing is permanent', truth.saysItIsReversible);

// the playstyle advice must point at stats that actually exist
const advice = await page.evaluate(async () => {
  const { STAT_META } = await import('./js/pit.js');
  const labels = STAT_META.map(m => m.label);
  return [...document.querySelectorAll('.faq-put b')].map(b => b.textContent.trim())
    .filter(t => !labels.includes(t));
});
check('no playstyle points at a stat that does not exist', advice.length === 0, JSON.stringify(advice));

// weapons interact with stats, and a player could buy a caster weapon for a Power
// build. The FAQ has to say so, and it has to name the vendor they buy from.
const weapons = await page.evaluate(() => {
  const t = document.querySelector('.faq-card').textContent;
  return { mentionsWeapons: /weapon/i.test(t), namesVendor: /Bone Merchant/.test(t), saysMatch: /matches the stat you are stacking/i.test(t), reassures: /never a wrong answer/i.test(t) };
});
console.log('weapon guidance:', JSON.stringify(weapons));
check('the FAQ covers which weapon to buy', weapons.mentionsWeapons && weapons.saysMatch, JSON.stringify(weapons));
check('and names the vendor it comes from', weapons.namesVendor);
check('and reassures that the plain weapon is always fine', weapons.reassures);

await guard('shooting the FAQ card', async () => {
  const el = await page.$('.faq-card');
  if (!el) throw new Error('no .faq-card to shoot');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(DIR, { recursive: true });   // the dir belongs to another session's scratchpad
  await el.screenshot({ path: `${DIR}/build-faq.png` });
  console.log('shot build-faq');
});
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nBUILD FAQ VERIFIED');
process.exit(bad ? 1 : 0);
