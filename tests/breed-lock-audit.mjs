/* B1: execute the production Stable body template with Node DOM/art doubles.
 * Covers the cooldown before selection, with one pick, and with a pair.
 * READY is the positive CONTROL against an unconditional lock explanation.
 * No browser, sockets or pixel/layout claim.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BREED_COOLDOWN_STEPS, petLastColourLoss, petColourName } from '../js/loot.js';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const start = app.indexOf('    const labWaiting =');
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
    labStock: null, pixCur: emptyArt, bhIcon: emptyArt, t1Stroke: emptyArt,
    MORPHS: [], kennelFound: 0, KENNEL_SPECIES: [],
    ICONS: { dust: emptyArt, chev: emptyArt, paw: emptyArt },
    PET_STAT_MULT_CAP: 2, cfWasPanelled: false, openIid: null,
    cfCards: '', cfWear: '', cfCaption: '', cfActs,
    petPortraitHtml: emptyArt, esc: String,
    petInstanceName: pet => pet.iid, petLevel: () => 1, petLastColourLoss, petColourName,
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
    assert(html.indexOf(door) < pet, 'navigation precedes the album');
  }
  assert.match(html, /class="stable-room" id="kennelBtn"/);
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
console.log('PASS CONTROL Stable: one collapsed explainer, labelled currency, retained doors before the album');
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
new Function('inst', 'eqIid', 'sel', 'openIid', 'pair', 'it', 'petDustValue', 'petInstanceName', '$', 'body', 'repaintLabIngredients', repaintActions)(
  pet, null, [], null, false, {}, () => 60, () => 'Frost Drizzle', selector => selector === '[data-destroy]' ? destroy : null, {}, () => {});
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
    assert(html.indexOf(door) < html.indexOf('id="cfFrame"'), 'every door is above the album');
  }
};
// Execute both production templates together, so order follows the shipped DOM.
const bodyWithActions = render(0, 0, renderActions(true));
gradeOrder(bodyWithActions);
for (const door of ['id="stableToPaddock"', 'data-lab-open', 'id="kennelBtn"']) {
  const faulty = bodyWithActions.replace(door, 'data-moved-door') + `<button ${door}></button>`;
  assert.throws(() => gradeOrder(faulty), 'CONTROL a door below pet content must fail');
}
const movedWallet = bodyWithActions.match(/<div class="wallet-line stable-wallet">[\s\S]*?<\/div>/)[0];
assert.throws(() => gradeOrder(movedWallet + bodyWithActions.replace(movedWallet, '')), 'CONTROL currency leading the pet must fail');
console.log('PASS CONTROL Stable order: all three doors precede the album; currency follows pet content; four regressions rejected');

// Execute the restored shipped paint and gesture code. This is arithmetic and
// event-double proof, not a rendered pixel or touch-device claim.
const gradeAlbum = (source, styles) => {
  const begin = source.indexOf('        const CW = cardPx();', source.indexOf('const cfFrame ='));
  const finish = source.indexOf('        const idx = indexAt(pos);', begin);
  assert(begin >= 0 && finish > begin, 'shipped album paint exists');
  const paintCards = source.slice(begin, finish);
  const constants = source.match(/const GAP = ([\d.]+), ROTATE = ([\d.]+), DEPTH = ([\d.]+), FADE = ([\d.]+), FALLOFF = ([\d.]+);/);
  assert(constants, 'shipped depth, rotation and fade constants exist');
  const values = constants.slice(1).map(Number);
  assert.match(styles, /\.cf-frame\s*\{[^}]*overflow: hidden[^}]*touch-action: pan-y[^}]*perspective: calc\(var\(--card\) \* 2\.1\)/);
  assert.match(styles, /\.cf-track\s*\{[^}]*transform-style: preserve-3d/);
  assert.doesNotMatch(styles, /perspective: none|transform-style: flat/);
  const frame = styles.match(/#stableBody \.cf-frame\s*\{([^}]+)\}/)?.[1];
  assert.match(frame || '', /width: 100%; max-width: calc\(var\(--card\) \* 1\.55 \* var\(--cf-scale\)\)/, 'frame reserves peeking edges in both panel sizes');
  assert.match(styles, /--card: min\(280px, calc\(\(100vw - 2 \* var\(--pad\)\) \* \.68\)\)/);
  assert.match(source, /const cardPx = \(\) => cards\[0\] \? cards\[0\]\.offsetWidth/, 'card pitch must not feed a transformed width back into itself');
  for (const N of [1, 2, 3, 4, 6]) for (const pos of [0, N - 1]) for (const scale of [1, .62]) {
    const CW = 240;
    const cards = Array.from({ length: N }, () => ({ style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }));
    new Function('cards', 'N', 'pos', 'cardPx', 'GAP', 'ROTATE', 'DEPTH', 'FADE', 'FALLOFF', 'indexAt', paintCards)(
      cards, N, pos, () => CW, ...values, p => ((Math.round(p) % N) + N) % N);
    for (const ratio of [1 / .68, 1.55]) {
      const width = CW * ratio * scale, perspective = CW * 2.1;
      let leftPeek = 0, rightPeek = 0;
      cards.forEach((card, i) => {
        const m = card.style.transform.match(/^translateX\(calc\(-50% \+ (-?[\d.]+)px\)\) translateZ\((-?[\d.]+)px\) rotateY\((-?[\d.]+)deg\)$/);
        assert(m, 'shipped 3D translation and rotation');
        const [, x, z, angle] = m.map(Number), theta = angle * Math.PI / 180;
        const corners = [-CW / 2, CW / 2].map(u => width / 2 + (x + u * Math.cos(theta)) * scale * perspective / (perspective - (z - u * Math.sin(theta))));
        const lo = Math.min(...corners), hi = Math.max(...corners);
        if (i === pos) {
          assert.equal(card.style.opacity, '1', 'focused pet is fully opaque, including a single pet');
          assert.equal(Number(card.style.zIndex), 100, 'active card is raised above its neighbours');
          assert(lo >= 0 && hi <= width, 'whole active card fits');
        } else if (Number(card.style.opacity) > 0) {
          if (lo < 0 && hi > 0) leftPeek++;
          if (lo < width && hi > width) rightPeek++;
          assert(Number(card.style.zIndex) < 100, 'neighbour is behind the active card');
        }
        assert.equal(card.attrs['aria-hidden'], String(i !== pos));
      });
      if (N >= 3) assert(leftPeek > 0 && rightPeek > 0, 'neighbours intersect both viewport edges');
      if (N === 2) assert.equal(leftPeek + rightPeek, 1, 'two pets have one visible neighbour, without cloned pets');
    }
  }
  assert.doesNotMatch(source, /data-cfstep|cf-position/, 'no redundant previous/next controls or count');
  assert.match(source, /Pets · Swipe to choose/);
  assert.match(source, />Colour \/ copy<\/div>/);
  assert.match(source, /aria-label="Colour and copy of/);
  assert.match(source, /kin\.setAttribute\('aria-label', `Colour and copy of/);
  assert.match(source, /colourLabel\.hidden = bySp\[inst.sp\]\.length < 2/);
  assert.match(source, /kin\.innerHTML = kinChips\(inst\)/);
  assert.match(source, /restoreKin\(body, inst.sp\)/);
};
gradeAlbum(app, css);
for (const [faultyApp, faultyCss] of [
  [app.replace('const GAP = 0.10, ROTATE = 46', 'const GAP = 1.10, ROTATE = 46'), css],
  [app.replace('N <= 2 ? 1 : Math.min', 'N <= 2 ? 0 : Math.min'), css],
  [app, css.replace('width: 100%; max-width: calc(var(--card) * 1.55 * var(--cf-scale))', 'width: calc(var(--card) * var(--cf-scale) + 12px); max-width: 100%')],
  [app, css.replace('transform-style: preserve-3d', 'transform-style: flat')],
]) {
  assert(faultyApp !== app || faultyCss !== css, 'CONTROL mutation applied');
  assert.throws(() => gradeAlbum(faultyApp, faultyCss), 'CONTROL missing peek, dim pet or flattened album must fail');
}
// Exercise production swipe, vertical axis lock, release snap, keys and dots.
const gesture = slice('      let vel = 0;', '      // (no per-card click handler:');
for (const reduced of [false, true]) {
  const handlers = {}, dots = [0, 1, 2, 3].map(i => ({ dataset: { cfdot: String(i) }, addEventListener(_, fn) { this.click = fn; } }));
  const frames = [];
  let now = 0;
  const frame = { addEventListener(k, fn) { handlers[k] = fn; }, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, width: 360 }) };
  const run = new Function('cfFrame', '$$', 'body', 'reduced', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', `
    let pos = 0, target = 0, raf = null;
    const N = 4, GAP = .1, cardPx = () => 240, indexAt = p => ((Math.round(p) % N) + N) % N;
    const setMoving = () => {}, paint = () => {}, render = () => {};
    ${gesture}
    return () => ({ pos, target });
  `)(frame, () => dots, {}, reduced, { now: () => now += 16 }, fn => { frames.push(fn); return frames.length; }, () => {});
  const flush = () => { let n = 0; while (frames.length) { assert(n++ < 2000, 'spring converges'); frames.shift()(); } };
  const event = (x, y = 0) => ({ pointerId: 1, clientX: x, clientY: y });
  handlers.pointerdown(event(180)); handlers.pointermove(event(-84)); handlers.pointerup(event(-84)); flush();
  assert.equal(run().pos, 1, 'horizontal swipe snaps to the next pet');
  handlers.pointerdown(event(180)); handlers.pointermove(event(175, 80)); handlers.pointerup(event(175, 80)); flush();
  assert.equal(run().pos, 1, 'vertical page scroll does not change pet');
  handlers.keydown({ key: 'ArrowLeft', preventDefault() {} }); flush();
  assert.equal(run().pos, 0, 'keyboard selects previous pet');
  dots[3].click(); flush();
  assert.equal(run().pos, -1, 'dot wraps by the shortest route');
  handlers.pointerdown(event(350)); handlers.pointerup(event(350)); flush();
  assert.equal(run().pos, 0, 'tap on neighbour advances the album');
}
// The existing copy rail still selects an instance and retains its colours.
const copyRows = ['Base', 'Frost', 'Ember'].map((colour, i) => ({ iid: colour.toLowerCase(), sp: 'C1', colour }));
const chipScope = { bySp: { C1: copyRows }, byBest: () => 0, nicks: {}, bank: {}, eqIid: 'base', sel: [],
  petPortraitHtml: () => '', esc: String, petColourName: x => x.colour, petLevel: () => 1 };
const chips = new Function(...Object.keys(chipScope), slice('    const kinChips =', '    const focusIdx =') + '\nreturn kinChips;')(...Object.values(chipScope));
const clickCopy = slice("    $('.cf-kin', body)?.addEventListener('click'", "    $$('[data-petnick]', body).forEach");
let onCopy, renders = 0;
const picked = new Function('$', 'body', 'popSound', 'S', 'render', 'let cfIid = null;\n' + clickCopy + '\nreturn () => cfIid;')(
  () => ({ addEventListener(_, fn) { onCopy = fn; } }), {}, () => {}, {}, () => renders++);
for (const copy of copyRows) {
  onCopy({ target: { closest: () => ({ dataset: { kin: copy.iid } }) } });
  assert.equal(picked(), copy.iid, 'copy tap selects the actual instance');
  const html = chips(copy);
  for (const row of copyRows) assert(html.includes(row.colour + ' · Lv 1'), 'all three colours remain visible in chips');
  assert.match(html, new RegExp('data-kin="' + copy.iid + '" role="option" aria-selected="true"'));
}
assert.equal(renders, 3, 'each copy pick repaints the portrait and actions');
console.log('PASS CONTROL Stable album: peeking edges, raised active card, swipe snap, axis lock, keys, dots and reduced motion; four regressions rejected');
console.log('STABLE REDESIGN: 4 guard groups passed, 0 failed (Node only; scroll height and pixels unmeasured)');
