/* The FAQ has to be reachable, readable and TRUE. The failure that matters is not a
 * crash: it is copy that drifts from what the engine does, or a fold nobody can open. */
import { boot, sleep, shotDir } from './godmode.js';
const DIR = shotDir('tally-shots');  // machine-local, see godmode shotDir
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

/* WEAPONS ARE GONE (S0, 2026-08-25) and the FAQ has to SAY SO rather than fall
   silent. This card used to answer "which weapon should I buy"; a returning
   player whose Bone Merchant has vanished needs the question answered, not
   deleted, or the missing screen reads as a bug and the refund reads as a glitch
   in their coin balance. So the row inverted: it now fails if the FAQ still
   sells weapons, and fails just as hard if it says nothing about them at all. */
const weapons = await page.evaluate(() => {
  const t = document.querySelector('.faq-card').textContent;
  return {
    explainsRemoval: /weapons?/i.test(t) && /gone|closed/i.test(t),
    saysRefunded: /came back in full|refunded/i.test(t),
    pointsAtWhatIsLeft: /stats, your talents and the gear/i.test(t),
    stillSelling: /which weapon should i buy/i.test(t),
  };
});
console.log('weapon guidance:', JSON.stringify(weapons));
check('the FAQ explains that weapons and the merchant are gone', weapons.explainsRemoval, JSON.stringify(weapons));
check('and tells the player their coins came back', weapons.saysRefunded);
check('and points at what carries their strength now', weapons.pointsAtWhatIsLeft);
check('and does NOT still tell them to go buy one', !weapons.stillSelling);

await guard('shooting the FAQ card', async () => {
  const el = await page.$('.faq-card');
  if (!el) throw new Error('no .faq-card to shoot');
  await el.screenshot({ path: `${DIR}/build-faq.png` });
  console.log('shot build-faq');
});
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nBUILD FAQ VERIFIED');
process.exit(bad ? 1 : 0);
