/* B1: execute the production Stable body template with Node DOM/art doubles.
 * Covers the cooldown before selection, with one pick, and with a pair.
 * READY is the positive CONTROL against an unconditional lock explanation.
 * No browser, sockets or pixel/layout claim.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BREED_COOLDOWN_STEPS } from '../js/loot.js';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const start = app.indexOf('    const breedLockNote =');
const end = app.indexOf('\n    body.scrollTop = bodyScroll;', start);
assert(start >= 0 && end > start, 'production Stable render block must exist');
const code = app.slice(start, end);
const keeper = { iid: 'keeper', sp: 'C1', lineage: 0 };
const spare = { iid: 'spare', sp: 'C2', lineage: 0 };
const emptyArt = () => '';

function render(cooldownLeft, picks, cfActs = '') {
  const pair = picks === 2;
  const body = { innerHTML: '', scrollTop: 0 };
  const scope = {
    opts: {}, // Existing Stable entry remains the default; Laboratory passes a navigation hint.
    body, st: { cooldownLeft, ready: cooldownLeft === 0, dust: 0 },
    pair, sel: [keeper.iid, spare.iid].slice(0, picks),
    insts: [keeper, spare], roster: [keeper, spare], keeper, spare,
    canBreedNow: pair && cooldownLeft === 0,
    bank: {}, offLineage: 1, spareIsPrecious: false, spChips: '',
    eqOwn: {}, doorSp: [], doorPx: 28, avatarLayersHtml: emptyArt,
    MORPHS: [], kennelMorphs: new Set(), kennelFound: 0, KENNEL_SPECIES: [],
    ICONS: { dust: emptyArt, chev: emptyArt },
    PET_STAT_MULT_CAP: 2, cfWasPanelled: false, openIid: null,
    cfCards: '', cfWear: '', cfCaption: '', cfActs,
    petPortraitHtml: emptyArt, esc: String,
    petInstanceName: pet => pet.iid, petLevel: () => 1,
    petBreedGainText: emptyArt, petStatBonusText: emptyArt,
  };
  new Function(...Object.keys(scope), code)(...Object.values(scope));
  assert(body.innerHTML.includes('id="stableToPaddock"'), 'CONTROL renders the Stable body');
  return body.innerHTML;
}

assert.equal(BREED_COOLDOWN_STEPS, 6000, 'cooldown balance must stay at 6,000 steps');
for (const picks of [0, 1, 2]) {
  for (const remaining of [6000, 2345, 1]) {
    const html = render(remaining, picks);
    const messages = [...html.matchAll(/<p\b[^>]*data-breed-lock[^>]*>(.*?)<\/p>/gs)];
    assert.equal(messages.length, 1, `one lock explanation with ${picks} picks`);
    assert.equal(messages[0][1], `Breeding is locked. Walk ${remaining.toLocaleString()} more ${remaining === 1 ? 'step' : 'steps'} to unlock it.`);
    if (picks === 2) assert.match(html, /id="doBreed" disabled/);
  }
  console.log(`PASS locked: ${picks} picks, 6,000 / 2,345 / 1 steps remaining and walking unlock condition`);
  const ready = render(0, picks);
  assert(!ready.includes('data-breed-lock'), 'READY must omit the lock message');
  assert(!ready.includes('Breeding is locked.'), 'READY must omit lock copy');
  assert(!ready.includes('to unlock it.'), 'READY must omit the walking unlock instruction');
  if (picks === 2) assert.match(ready, /id="doBreed"\s*>/);
  console.log(`PASS CONTROL READY: ${picks} picks, no lock message`);
}
// r56 Stable polish uses the same production template as the cooldown proof.
// CONTROL: populated and ready/locked renders, plus deliberately restored clutter.
const count = (html, pattern) => (html.match(pattern) || []).length;
const gradeRoom = html => {
  const help = html.match(/<details class="stable-help">[\s\S]*?<\/details>/)?.[0];
  assert(help, 'one closed help disclosure exists');
  assert.equal(count(html, /class="stable-help"/g), 1);
  for (const text of ['Only the active pet levels as you walk', 'Melting clears the pile.', 'feeds a spare pet into one you keep:', 'id="petsHelp"']) assert(help.includes(text), text);
  const outsideHelp = html.replace(help, '');
  assert(!/Only the active|lab-sinks|feeds a spare|id="petsHelp"/.test(outsideHelp), 'zero scattered explainers');
  assert.equal(count(html, /id="cfFrame"/g), 1, 'CONTROL one pet carousel remains');
  const pet = html.indexOf('id="cfFrame"');
  for (const door of ['id="stableToPaddock"', 'data-lab-open', 'id="kennelBtn"']) {
    assert.equal(html.split(door).length - 1, 1, `CONTROL ${door} remains reachable once`);
    assert(pet < html.indexOf(door), 'the pet precedes navigation');
  }
  assert.match(html, /class="pdk-door kdoor stable-collection" id="kennelBtn"/);
  assert.match(html, /class="wallet-line stable-wallet"><span>Bone Dust<\/span>/);
  assert.doesNotMatch(html, /class="chip">/);
};
for (const remaining of [0, 2345]) {
  const html = render(remaining, 0);
  gradeRoom(html);
  for (const faulty of [
    html + '<p>Only the active pet levels as you walk</p>',
    html.replace('class="stable-help"', 'class="old-help"'),
    html.replace('<details class="stable-help">', '<details class="stable-help" open>'),
    html.replace('id="cfFrame"', 'id="lost-carousel"'),
    html.replace('id="kennelBtn"', 'id="lost-kennel"'),
    html.replace('class="wallet-line stable-wallet"', 'class="chip"'),
    html.replace('data-lab-open', '') + '<button data-lab-open></button><button data-lab-open></button>',
  ]) assert.throws(() => gradeRoom(faulty), 'CONTROL restored clutter or missing capability must fail');
}
console.log('PASS CONTROL Stable: one collapsed explainer, labelled currency, retained doors after the pet');
console.log('BREED LOCK + STABLE UI: 7 passed, 0 failed (Node only; browser and sockets unrun)');

// Frozen redesign: execute the actual initial action template and focus repaint.
// Healthy CONTROL covers equipped, inactive and breeding-pair presentations.
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const slice = (from, to) => {
  const a = app.indexOf(from), b = app.indexOf(to, a + from.length);
  assert(a >= 0 && b > a, `CONTROL production block exists: ${from}`);
  return app.slice(a, b);
};
const actions = slice('    const cfActs =', '\n    /* HER WARDROBE');
const pet = { iid: 'frost', sp: 'C1', shiny: false, lineage: 0 };
function renderActions(equipped, pair = false) {
  const scope = { focused: pet, BH_BY_ID: { C1: {} }, eqIid: equipped ? pet.iid : null,
    sel: [], openIid: null, pair, nicks: {}, petDustValue: () => 60,
    petInstanceName: () => 'Frost Drizzle', esc: String };
  return new Function(...Object.keys(scope), actions + '\nreturn cfActs;')(...Object.values(scope));
}
const gradeLoss = html => {
  assert.match(html, /class="stable-danger">[\s\S]*data-breedsel=[\s\S]*data-destroy=/, 'permanent actions have their own section');
  assert.match(html, /data-destroy="frost"[^>]*>Destroy Frost Drizzle for 60 Bone Dust<\/button>/, 'destroy names the actual pet lost and the currency received');
  assert.match(html, /Breeding destroys the spare\.[\s\S]*That pet does not come back\./, 'permanent loss is disclosed before acting');
};
for (const equipped of [false, true]) {
  for (const pair of [false, true]) {
    const html = renderActions(equipped, pair);
    gradeLoss(html);
    assert.equal(count(html, /stable-primary/g), pair ? 0 : 1, 'one primary, delegated to the existing feed action with a pair');
    for (const name of ['data-eq', 'data-pettree', 'data-petnick', 'data-breedsel', 'data-destroy']) assert.equal(count(html, new RegExp(name + '=', 'g')), 1, `CONTROL capability ${name}`);
    for (const faulty of [html.replace('Destroy Frost Drizzle for 60 Bone Dust', 'Destroy 60'), html.replace('class="stable-danger"', 'class="ordinary"'), html.replace('That pet does not come back.', '')]) {
      assert.throws(() => gradeLoss(faulty), 'CONTROL anonymous loss or missing separation must fail');
    }
  }
}
// Switching pets must update the named loss and clear the previous armed IID.
const repaintActions = slice('      const isEq = inst.iid === eqIid, inSel =', '      // her wardrobe follows the ring:');
const destroy = { dataset: { armed: 'previous' }, textContent: '' };
new Function('inst', 'eqIid', 'sel', 'openIid', 'pair', 'it', 'petDustValue', 'petInstanceName', '$', 'body', repaintActions)(
  pet, null, [], null, false, {}, () => 60, () => 'Frost Drizzle', selector => selector === '[data-destroy]' ? destroy : null, {});
assert.equal(destroy.textContent, 'Destroy Frost Drizzle for 60 Bone Dust');
assert.equal(destroy.dataset.destroy, pet.iid);
assert.equal(destroy.dataset.armed, undefined);
console.log('PASS CONTROL Stable loss: named pet, permanent section, initial and switched focus, one next action');

const gradeType = source => {
  for (const selector of ['#stableBody .cf-acts .btn', '#stableBody .cf-kin .chip', '.stable-head h2']) {
    const rule = source.slice(source.indexOf(selector + ' {')).split('}')[0];
    assert(rule.startsWith(selector + ' {'), `CONTROL scoped rule exists: ${selector}`);
    assert.match(rule, /font(?:-family)?:\s*[^;]*(?:system-ui|inherit)/, 'controls use body type');
    assert.doesNotMatch(rule, /var\(--display\)|Bangers/i, 'display face is reserved for the creature name');
  }
  assert.match(source, /#stableBody \.cf-cap > b\s*\{[^}]*var\(--display\)/, 'CONTROL pet identity still earns display type');
};
gradeType(css);
for (const selector of ['#stableBody .cf-acts .btn', '#stableBody .cf-kin .chip', '.stable-head h2']) {
  const faulty = css.replace(selector + ' {', selector + ' { font-family: var(--display);');
  assert.notEqual(faulty, css, 'CONTROL mutation applied');
  assert.throws(() => gradeType(faulty), 'CONTROL display type restored to controls must fail');
}
console.log('PASS CONTROL Stable type: body controls and copy chips, display pet identity; three regressions rejected');

const gradeOrder = html => {
  for (const marker of ['data-destroy="frost"', 'class="stable-wallet"']) {
    // The wallet carries a shared class too, so match its stable class explicitly.
    assert(html.includes(marker === 'class="stable-wallet"' ? 'wallet-line stable-wallet' : marker), 'CONTROL pet actions and wallet are present');
  }
  const endOfActions = html.indexOf('That pet does not come back.');
  assert(endOfActions > html.indexOf('id="cfFrame"'), 'CONTROL actions follow the portrait');
  assert(html.indexOf('wallet-line stable-wallet') > endOfActions, 'wallet follows the pet content');
  for (const door of ['id="stableToPaddock"', 'data-lab-open', 'id="kennelBtn"']) {
    assert.equal(html.split(door).length - 1, 1, `CONTROL one ${door}`);
    assert(html.indexOf(door) > endOfActions, 'every door is below all pet actions');
  }
};
// Execute both production templates together, so order follows the shipped DOM.
const bodyWithActions = render(0, 0, renderActions(true));
gradeOrder(bodyWithActions);
for (const door of ['id="stableToPaddock"', 'data-lab-open', 'id="kennelBtn"']) {
  const faulty = `<button ${door}></button>` + bodyWithActions.replace(door, 'data-moved-door');
  assert.throws(() => gradeOrder(faulty), 'CONTROL a door above pet content must fail');
}
const movedWallet = bodyWithActions.match(/<div class="wallet-line stable-wallet">[\s\S]*?<\/div>/)[0];
assert.throws(() => gradeOrder(movedWallet + bodyWithActions.replace(movedWallet, '')), 'CONTROL currency leading the pet must fail');
console.log('PASS CONTROL Stable order: all three doors and currency follow pet content; four regressions rejected');

// Execute the production paint arithmetic, including the one-pet opacity case.
// This checks resting geometry only. Browser clipping and gestures remain unrun.
const paintCards = slice('        const CW = cards[0].offsetWidth;', '        const idx = indexAt(pos);');
const gradeCarousel = source => {
  for (const N of [1, 2, 6]) for (const pos of [0, N - 1]) for (const scale of [1, .62]) {
    const cards = Array.from({ length: N }, () => ({ offsetWidth: 280, style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }));
    new Function('cards', 'N', 'pos', 'GAP', 'indexAt', source)(cards, N, pos, .1, p => ((Math.round(p) % N) + N) % N);
    const viewport = 280 * scale + 12;
    let visible = 0;
    cards.forEach((card, i) => {
      const match = card.style.transform.match(/^translateX\(calc\(-50% \+ (-?[\d.]+)px\)\)$/);
      assert(match, 'flat translation, no tilted neighbour');
      const centre = viewport / 2 + Number(match[1]) * scale;
      if (centre + 140 * scale > 0 && centre - 140 * scale < viewport) visible++;
      if (i === pos) assert.equal(card.style.opacity, '1', 'CONTROL focused portrait is fully opaque even with one pet');
      assert.equal(card.attrs['aria-hidden'], String(i !== pos));
    });
    assert.equal(visible, 1, 'exactly one portrait intersects the resting viewport');
  }
};
gradeCarousel(paintCards);
for (const faulty of [paintCards.replace('CW * (1 + GAP)', 'CW * .5'), paintCards.replace("card.style.opacity = '1'", "card.style.opacity = '.5'")]) {
  assert.notEqual(faulty, paintCards);
  assert.throws(() => gradeCarousel(faulty), 'CONTROL slivers or dimmed single pet must fail');
}
console.log('PASS CONTROL Stable carousel: one full portrait at rest for 1/2/6 species in both panel sizes; two regressions rejected');
console.log('STABLE REDESIGN: 4 guard groups passed, 0 failed (Node only; scroll height and pixels unmeasured)');
