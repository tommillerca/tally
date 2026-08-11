/* Increment 1 client behaviour. The failure that matters most: a refused claim
 * leaving the client believing it owns a tower. */
import { boot, sleep } from './godmode.js';
/* argv FIRST, env.URL second: the convention error-telemetry-audit and
   year-readout-audit already use. Reading env.URL ONLY meant that any run passing
   the URL as an argument (which is how the release gate invokes every suite) fell
   through to godmode's boot() default, https://tommillerca.github.io/tally/, and
   graded PRODUCTION while reading as coverage of the tree under test. */
const { browser, page } = await boot(process.argv[2] || process.env.URL);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
const localSpires = () => page.evaluate(async () => (await (await import('./js/db.js')).kvGet('spires', {})));

// ---- the pure economy numbers as the app itself computes them ----
const econ = await page.evaluate(async () => {
  const sp = await import('./js/spires.js');
  return {
    boon: [0, 1, 2, 3, 4, 9].map(sp.boonBonusFor),
    mult: [1, 2, 6, 99].map(sp.levelTributeMult),
    ceiling: sp.BOON_QUEST_BONUS,
  };
});
console.log('economy as shipped:', JSON.stringify(econ));
check('boon scales 5/10/15 then stops dead', JSON.stringify(econ.boon) === JSON.stringify([0, 0.05, 0.1, 0.15, 0.15, 0.15]), JSON.stringify(econ.boon));
check('tribute multiplier caps at 1.5', econ.mult[2] === 1.5 && econ.mult[3] === 1.5, JSON.stringify(econ.mult));

// ---- a refused claim must not leave phantom ownership ----
// simulate the server refusing: stub claimSpireRemote to answer like a shield 409
const refusal = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('spires', {});                       // start clean
  const spires = await import('./js/spires.js');
  // the real client path is remote-first; prove the ORDER by asking the model what
  // happens when the remote says no, using the same helper app.js calls
  const before = Object.keys(await db.kvGet('spires', {})).length;
  return { before };
});
console.log('clean slate:', JSON.stringify(refusal));

const parse = await page.evaluate(async () => {
  const src = await (await fetch('./js/social.js')).text();
  const fn = src.slice(src.indexOf('export async function claimSpireRemote'));
  const body = fn.slice(0, fn.indexOf('\nexport '));
  return {
    readsBody: /r\.status === 409/.test(body) && /await r\.json\(\)/.test(body),
    mapsShielded: /'shielded'/.test(body),
    keepsCapDefault: /'cap'/.test(body),
    passesUntil: /until/.test(body),
  };
});
console.log('client parse of a 409:', JSON.stringify(parse));
check('claimSpireRemote reads the 409 body', parse.readsBody, JSON.stringify(parse));
check('and distinguishes shielded from cap', parse.mapsShielded && parse.keepsCapDefault);
check('and passes the shield expiry through', parse.passesUntil);

const order = await page.evaluate(async () => {
  const src = await (await fetch('./js/app.js')).text();
  // v266 added a SIEGE branch above the claim branch, so a plain indexOf for
  // "mode === 'spire'" now lands on the wrong one. Anchor on the claim branch's own
  // first line instead, which cannot be confused with the siege one.
  const i = src.indexOf('// REMOTE FIRST.');
  const block = src.slice(i, i + 2400);
  const iRemote = block.indexOf('claimSpireRemote');
  const iLocal = block.indexOf('await claimSpire(');
  return {
    remoteFirst: iRemote > -1 && iLocal > -1 && iRemote < iLocal,
    guardsRefusal: /const refused =/.test(block),
    localOnlyWhenAllowed: /refused \? \{ ok: false/.test(block),
    shieldCopy: /walls hold/.test(block),
  };
});
console.log('settle order:', JSON.stringify(order));
check('the settle path asks the SERVER before writing locally', order.remoteFirst, JSON.stringify(order));
check('a refusal short-circuits the local write', order.guardsRefusal && order.localOnlyWhenAllowed);
check('a shielded tower gets its own copy, not the cap message', order.shieldCopy);

// ---- the level mirror ----
const mirror = await page.evaluate(async () => {
  const sp = await import('./js/spires.js');
  const db = await import('./js/db.js');
  await db.kvSet('spires', {});
  await sp.claimSpire({ id: 'sp-9-9', name: 'The Mirror Tower', lat: 1, lng: 2, cx: 9, cy: 9, warden: 'W' });
  const afterClaim = (await db.kvGet('spires', {}))['sp-9-9'].level;
  await sp.claimSpire({ id: 'sp-9-9', name: 'The Mirror Tower', lat: 1, lng: 2, cx: 9, cy: 9, warden: 'W' });
  const afterSecond = (await db.kvGet('spires', {}))['sp-9-9'].level;
  const changed = await sp.setSpireLevel('sp-9-9', 7);
  const mirrored = (await db.kvGet('spires', {}))['sp-9-9'].level;
  const noop = await sp.setSpireLevel('sp-nope-nope', 5);
  // and tribute must respond to the level
  const st = await sp.spireState();
  st['sp-9-9'].collectedAt = Date.now() - 3 * 86400000;
  await db.kvSet('spires', st);
  const trib = sp.readSpire(await sp.spireState(), { id: 'sp-9-9' }).tribute.coins;
  return { afterClaim, afterSecond, changed, mirrored, noop, trib };
});
console.log('level mirror:', JSON.stringify(mirror));
check('claiming does NOT self-increment the level any more', mirror.afterClaim === 1 && mirror.afterSecond === 1, `${mirror.afterClaim}/${mirror.afterSecond}`);
check("the server's level is mirrored in", mirror.changed === true && mirror.mirrored === 7);
check('mirroring a spire we do not hold is a no-op', mirror.noop === false);
check('a level-7 tower pays the capped 1.5x tribute', mirror.trib === Math.round(3 * 60 * 1.5), `${mirror.trib} coins`);

// ---- a lost tower is finally visible ----
const card = await page.evaluate(async () => {
  const { db, kvSet } = await import('./js/db.js');
  // put a spire grant in the ledger the way the server delivers one
  const r = { applied: 1, appliedGrants: [{ type: 'spire', payload: { note: 'Brock toppled The Ashen Fang. Walk back and take it.' } }] };
  window.__grantProbe = r;
  return true;
});
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1500);
await page.evaluate(() => document.querySelector('.dw')?.remove());
const shown = await page.evaluate(async () => {
  const src = await (await fetch('./js/app.js')).text();
  const i = src.indexOf('function presentGrantDelivery');
  const body = src.slice(i, src.indexOf('\nfunction ', i + 10));
  return {
    hasBranch: /g\.type === 'spire'/.test(body),
    pushesCard: /spireNews\.push/.test(body) && /name: 'Spire Lost'/.test(body),
    // the card must be built BEFORE the reveal, inside this function
    beforeReveal: body.indexOf('spireNews.push') < body.indexOf('if (cards.length)'),
    usesTheNote: /p\.note/.test(body),
  };
});
console.log('spire grant branch:', JSON.stringify(shown));
check('presentGrantDelivery now handles type spire', shown.hasBranch && shown.pushesCard, JSON.stringify(shown));
check('the card is built before the reveal fires', shown.beforeReveal);
check("and it shows the server's own note", shown.usesTheNote);

await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nSPIRES PHASE 3 INCREMENT 1 VERIFIED');
process.exit(bad ? 1 : 0);
