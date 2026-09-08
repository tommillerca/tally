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

function render(cooldownLeft, picks) {
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
    cfCards: '', cfWear: '', cfCaption: '', cfActs: '',
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
console.log('BREED LOCK: 6 passed, 0 failed (Node only; browser and sockets unrun)');
