/* THE PET NICKNAME IS PRIVATE, AND THIS FILE IS WHERE THAT CLAIM IS PAID FOR.
 *
 * Tom, 2026-08-19: "can we add the ability to give your pet a nickname only you
 * can see?" ONLY YOU is the whole feature, and it is the half that can go wrong
 * SILENTLY: a nickname that reaches the Crew still renders correctly, still
 * survives a reload, still clears. Nothing in the app would look broken. So the
 * load-bearing row here is WIRE, and it is measured off the actual bytes the
 * app puts on the network, never off a grep of the source.
 *
 * HOW THE CAPTURE WORKS, because "I checked the payloads" is worthless without
 * saying which ones and how:
 *   - the app is served from this tree and pointed at a FAKE API with ?api=,
 *     which is js/social.js's own documented dev/e2e hook (initFromQuery).
 *     Nothing here can touch the production worker, and NO-ESCAPE below proves
 *     it by asserting no request left 127.0.0.1.
 *   - every single outbound request is recorded by page.on('request'), so the
 *     net is the browser's, not the server's: a payload sent to a host we
 *     forgot to stub, or by sendBeacon, is still counted.
 *   - the fake API answers /register, so the app really does go online and
 *     really does build and PUT its profile snapshot. Without that step every
 *     WIRE assertion would pass on an app that sent nothing at all.
 *
 * DIRECTION AND BOUND, both stated (anti-regression rule 11). "The nickname is
 * in no payload" is trivially true of a broken capture, an offline app, or an
 * empty request log, and all three of those are the likely failure of THIS
 * file rather than of the feature. So:
 *   - CONTROL: a bounded MINIMUM of captured requests, and PUT /profile among
 *     them by name. Zero is a FAILURE, never a pass.
 *   - POSITIVE CONTROL: the pet fields that are SUPPOSED to be uploaded (the
 *     species id and the pet level) must be findable in the captured /profile
 *     body. If they are not, the capture is blind and every negative row below
 *     it is meaningless, so this row going red invalidates the file rather
 *     than the feature.
 *   - LOCAL: the nickname must be present in kv 'petNick' at the moment of
 *     capture. A nickname that was never saved is absent from the wire for the
 *     boring reason.
 *   - only then: WIRE, the nickname string in ZERO request bodies and ZERO URLs.
 *
 * PROVE-RED. Two mutations, both of them the real bug:
 *   1. LEAK: in js/app.js socialSnapshot(), add `nick: (await petNicks())[...]`
 *      to the `pet:` block (or write the nickname into kv 'equipped', which
 *      uploads wholesale via `outfit: eq`). WIRE goes red naming the request.
 *   2. XSS: drop the esc() from nickTag() in openStable. HOSTILE goes red.
 *      Same for esc(m.name) in js/paddock-cards.js cardHtml: PADDOCK-HOSTILE
 *      goes red, including the row that watches for the handler executing.
 *   Proven red on a throwaway worktree off origin/main, 2026-08-19.
 *
 * Run: node tests/nickname-private-audit.mjs [baseUrl]
 */
import http from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree, setWidth } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* process.argv literally, and serveTree when nothing is named: boot() defaults
   to the LIVE production site and this file writes to stores and goes online. */
const argvBase = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
const srvHandle = argvBase ? null : await serveTree(ROOT);
const base = argvBase || srvHandle.url;

const results = [];
const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); return pass; };

/* The nickname strings. Deliberately unlikely to occur anywhere else in the
   app, its data files or a signature, so a hit in a payload is the nickname
   and nothing else. Checked against the captured bytes AND against the
   percent/base64 forms a transport could have wrapped them in. */
const SENTINEL = 'ZqxNickPrivate7';
const HOSTILE = '<img src=x onerror=z()>';   // 23 chars, inside NICK_MAX 24, and it really would fire
const QUOTES = `">'&<b>`;

/* ---------------------------------------------------------- the fake API */
const wire = [];              // what the browser SENT (the authority for WIRE)
const served = [];            // what a server actually RECEIVED (proves the sends were real)
const api = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    served.push({ method: req.method, url: req.url, body });
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,OPTIONS');
    res.setHeader('content-type', 'application/json');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.url.startsWith('/register')) {
      res.end(JSON.stringify({ playerId: 'p-audit', handle: 'AUDIT BONES', friendCode: 'AUDIT1', name: null }));
      return;
    }
    if (req.url.startsWith('/friends')) { res.end(JSON.stringify({ friends: [], incoming: [], outgoing: [] })); return; }
    if (req.url.startsWith('/grants')) { res.end(JSON.stringify({ grants: [], cursor: 0 })); return; }
    if (req.url.startsWith('/leaderboard')) { res.end(JSON.stringify({ rows: [] })); return; }
    if (req.url.startsWith('/backup')) { res.end(JSON.stringify({ ok: true })); return; }
    res.end(JSON.stringify({ ok: true }));
  });
});
await new Promise(r => api.listen(0, '127.0.0.1', r));
const apiUrl = `http://127.0.0.1:${api.address().port}`;
const shutdown = async () => { await new Promise(r => api.close(r)); if (srvHandle) srvHandle.close(); };

/* ------------------------------------------------------------------ boot */
const { browser, page, errors } = await boot(base, { headless: process.env.HEADLESS_MODE || 'shell' });
/* Record EVERY request the page makes, before the api hook is installed, so
   nothing that fires during the reload below is missed. */
page.on('request', r => wire.push({ url: r.url(), method: r.method(), body: r.postData() || '' }));

await page.goto(`${base.replace(/\/?$/, '/')}?demo&api=${encodeURIComponent(apiUrl)}`, { waitUntil: 'networkidle2' });
await sleep(2400);
await setWidth(page, 393, 852);
await sleep(300);

await page.evaluate(async () => {
  const l = await import('./js/loot.js');
  for (const sp of ['C4', 'C5']) await l.addPetInstance(sp, {});
});

/* --------------------------------------------------------------- helpers */
const openStable = async () => {
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(900);
  await page.evaluate(() => document.getElementById('stableBtn')?.click());
  await sleep(1800);
};
/* A FLOOR UNDER THE HISTORY TRAVERSALS BELOW, 2026-09-03.
   closeSheets is a history TRAVERSAL, not a "close every open sheet" loop, and
   the rest of this file leans on exactly that: a go(-3) over three .sheet nodes
   deliberately lands with the Stable still up, which is the screen HOSTILE and
   REFUSE then type into. (Replacing it with a close-until-no-sheets loop was
   tried: nine rows go red. The traversal semantics are load-bearing.)
   What sits UNDER the app's entries is this file's own two documents: godmode
   boot goes to ?demo, then this file goes to ?demo&api=..., which pushes. So a
   traversal one step deeper than the app's stack does not close a sheet, it
   LOADS ?demo -- a different document, with no api parameter and no seeded pets
   -- and the next page.evaluate dies with "Execution context was destroyed,
   most likely because of a navigation". That is how this suite stopped
   reporting at all: it threw instead of failing a row.
   THE STEP THAT WENT MISSING. app.js now does
   `if (!location.hash) history.replaceState(null,'','#/today')` at the end of
   boot, to kill a double-render on the first tab tap. replaceState pushes
   NOTHING, so the '' -> '#/today' entry that openStable's
   `location.hash = '#/today'` used to push is gone, and the app's stack is
   exactly ONE entry shorter than every traversal here was written against.
   Measured at the four closes, origin/main vs this tree: history.length
   8/7, 6/5, 6/4, 8/7. Main's deepest go(-4) lands ON its spare entry; this
   tree's lands one past it, in the other document.
   SO THE TRAVERSAL NEEDS A FLOOR OF ITS OWN, which armDepth below supplies by
   counting the entries the app owns. Three cheaper things were tried first and
   all three still crossed, which is why the counter is worth its lines:
   history.length (counts forward entries the app has not pruned, and the
   current index is unreadable), the app's own history.state.sheet depth (not in
   step with the .sheet nodes: on main a go(-3) over three sheets closes ONE),
   and pushing spare entries to stand on (a traversal deeper than the app's
   stack stands on the spare, and the next one crosses anyway).
   The SHEETS row at the bottom is the control on all of it: it counts real
   document loads inside every close window, and goes red if a traversal ever
   reaches the bottom and keeps going. */
/* COUNT THE APP'S OWN PUSHES; THAT COUNT IS THE FLOOR.
   Nothing readable in the page answers "how deep am I": history.length counts
   forward entries the app has not pruned and there is no API for the current
   index, and the app's `history.state.sheet` depth is not in step with the
   .sheet nodes (on main a go(-3) over three sheets closes ONE, because a single
   traversal fires ONE popstate however many entries it spans -- which is also
   why this has to stay a single jump and cannot become a loop of back()s).
   Spare floor ENTRIES do not work either: a traversal deeper than the app's
   stack stands on the spare and the next one crosses anyway (measured, twice).
   So count. js/app.js pushes exactly one entry per sheet, through
   history.pushState, and this audit writes location.hash only in openStable,
   where the hash is already '#/today' and the assignment is a no-op. Wrapping
   pushState therefore counts every entry the app owns. A hash push this file
   does not do yet would be MISSED, and that is the safe direction: an
   under-count traverses less, never past the bottom.
   Installed after the last page.goto, so it survives to the end of the run --
   except across the deliberate page.reload() below, which re-arms it. */
const armDepth = () => page.evaluate(() => {
  window.__appDepth = 0;
  window.__ourJump = 0;
  const push = history.pushState.bind(history);
  history.pushState = (...a) => { window.__appDepth++; return push(...a); };
  /* AND THE APP POPS ENTRIES ITSELF, so counting only pushes over-counts and
     the traversal crosses anyway. Every sheet close button, the backdrop tap,
     Escape and openTextSheet's own Save all call history.back(), and the
     nickname Save is on that path, so this file spends app-owned entries
     constantly without going through closeSheets. An app back() is always ONE
     entry; the only multi-entry traversal is closeSheets' own jump, and that
     one is already subtracted when it is issued, so it announces itself here
     rather than being counted twice. */
  addEventListener('popstate', () => {
    if (window.__ourJump > 0) { window.__ourJump--; return; }
    window.__appDepth = Math.max(0, window.__appDepth - 1);
  });
});
await armDepth();
/* A DOCUMENT LOAD IS THE THING TO COUNT, not framenavigated: sheets and routes
   are same-document navigations and fire that event constantly, so only `load`
   tells "went back a sheet" from "went back a document". Same instrument the
   sibling dead-shell audit moved to on 2026-09-03. */
let docLoads = 0, sheetCloses = 0, sheetReloads = 0;
page.on('load', () => { docLoads++; });
/* BOUNDED. n comes from counting .sheet nodes, and a mutation that corrupts the
   caption's markup can corrupt that count too; an unbounded history.go(-n) then
   navigates out of the app entirely and every later row dies on a destroyed
   execution context instead of reporting. Four is deeper than this audit ever
   stacks sheets. */
const closeSheets = async () => {
  const at = docLoads;
  sheetCloses++;
  await page.evaluate(() => {
    const n = Math.min(4, document.querySelectorAll('.sheet').length, window.__appDepth || 0);
    if (n > 0) { window.__appDepth -= n; window.__ourJump++; history.go(-n); }
  });
  await sleep(700);
  if (docLoads !== at) sheetReloads++;
};
/* Drive the REAL control: tap NICKNAME, type into the real field, tap Save.
   Never call setPetNick directly, or this proves nothing about the screen. */
async function setNickViaUi(text) {
  await page.evaluate(() => document.querySelector('[data-petnick]')?.click());
  await sleep(900);
  const has = await page.evaluate(() => !!document.querySelector('#txIn'));
  if (!has) return { opened: false };
  await page.evaluate(() => { const i = document.querySelector('#txIn'); i.focus(); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
  if (text) await page.keyboard.type(text, { delay: 4 });
  const typed = await page.evaluate(() => document.querySelector('#txIn').value);
  await page.evaluate(() => document.querySelector('#txGo')?.click());
  await sleep(1400);
  return { opened: true, typed };
}
const capState = () => page.evaluate(() => {
  const cap = document.querySelector('.cf-cap b');
  const tag = cap && cap.querySelector('.alias-tag');
  const btn = document.querySelector('[data-petnick]');
  return {
    capHtml: cap ? cap.innerHTML : null,
    tagText: tag ? tag.textContent : null,
    tagKids: tag ? tag.children.length : null,
    tagDir: tag ? tag.getAttribute('dir') : null,
    btnLabel: btn ? btn.textContent.trim() : null,
    btnIid: btn ? btn.dataset.petnick : null,
  };
});
const stored = () => page.evaluate(async () => {
  const { kvGet } = await import('./js/db.js');
  return (await kvGet('petNick', {})) || {};
});
const toastText = () => page.evaluate(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? t.textContent.trim() : ''; });
const rosterNow = () => page.evaluate(() => [...document.querySelectorAll('.cf-card')]
  .map(c => ({ iid: c.dataset.petsel, sp: c.dataset.sp, i: Number(c.dataset.cfi) })));
/* BRING ONE PET TO THE FRONT, and confirm it arrived. A card tap is a drag
   candidate on this carousel, so the dots are the reliable control. Every
   caller asserts the return: silently measuring the wrong pet is exactly how a
   privacy row would pass while pointing at an animal with no nickname. */
async function focusPet(iid) {
  for (let i = 0; i < 8; i++) {
    if (await page.evaluate(() => document.querySelector('[data-petnick]')?.dataset.petnick) === iid) return true;
    const moved = await page.evaluate(id => {
      const card = document.querySelector(`.cf-card[data-petsel="${id}"]`);
      const dot = card && document.querySelectorAll('.cf-dots i')[Number(card.dataset.cfi)];
      if (!dot) return false;
      dot.click();
      return true;
    }, iid);
    if (!moved) return false;
    await sleep(900);
  }
  return false;
}
const speciesName = sp => page.evaluate(async id => {
  const { BH_ITEMS } = await import('./data/boneheadz.js');
  return (BH_ITEMS.find(x => x.id === id) || {}).name || id;
}, sp);

/* ============================ SET ============================ */
console.log('\n--- SET ---');
await openStable();
const cards = await page.evaluate(() => document.querySelectorAll('.cf-card').length);
ok('SAMPLE the Stable opened with pets in it (an empty sample is a FAILURE, every row below would measure nothing)',
  cards >= 2, `${cards} cards`);
if (cards < 2) { await browser.close(); await shutdown(); console.log('\nFAIL: no sample'); process.exit(1); }

const beforeSet = await capState();
ok('CONTROL before naming, the caption carries no nickname tag and the control offers one',
  beforeSet.tagText === null && beforeSet.btnLabel === 'NICKNAME', JSON.stringify(beforeSet));

const roster = await rosterNow();
const namedIid = beforeSet.btnIid;
const namedSp = (roster.find(r => r.iid === namedIid) || {}).sp;
const namedSpecies = await speciesName(namedSp);
const otherIid = (roster.find(r => r.iid !== namedIid) || {}).iid;
ok('CONTROL two distinct pets are available, so "the tag does not follow the carousel" can be tested at all',
  !!namedIid && !!otherIid && namedIid !== otherIid, JSON.stringify({ namedIid, otherIid, namedSpecies }));

const setRes = await setNickViaUi(SENTINEL);
ok('SET the NICKNAME control opens a text field', setRes.opened === true, JSON.stringify(setRes));
const afterSet = await capState();
ok('SET the nickname renders in the caption', afterSet.tagText === SENTINEL, JSON.stringify(afterSet.capHtml));
/* The species name is derived from the app's own item table, not typed here: a
   nickname that REPLACED the identity would still pass a hardcoded string. */
ok('SET and the real species name is still beside it, because breed is what this screen is for',
  (afterSet.capHtml || '').includes(namedSpecies), `species "${namedSpecies}" in ${JSON.stringify(afterSet.capHtml)}`);
ok('SET the control now offers a rename rather than a first naming',
  afterSet.btnLabel === 'RENAME', afterSet.btnLabel);
ok('SET the tag is direction-agnostic, so a right-to-left nickname cannot drag the line around it',
  afterSet.tagDir === 'auto', String(afterSet.tagDir));
ok('SET it is stored against the pet INSTANCE id, not the species',
  (await stored())[namedIid] === SENTINEL, JSON.stringify(await stored()));

/* ============================ SPIN ============================ */
/* Spinning the ring calls repaintFocus(), which does NOT re-run render(). A tag
   left behind there would show one pet's nickname on another pet, and a stale
   data-petnick would rename the wrong animal. FAILING RESULT: pet two shows
   pet one's nickname, or the button still points at pet one's iid. */
console.log('\n--- SPIN ---');
ok('SPIN the ring moved to the other pet (empty sample guard for the two rows below)', await focusPet(otherIid));
const spun = await capState();
ok('SPIN the unnamed pet shows NO nickname, so the tag does not follow the carousel',
  spun.tagText === null && spun.btnIid === otherIid, JSON.stringify(spun));
ok('SPIN and its control offers a first naming, pointed at its own instance',
  spun.btnLabel === 'NICKNAME', spun.btnLabel);
ok('SPIN back to the named pet', await focusPet(namedIid));
ok('SPIN and its nickname is there again',
  (await capState()).tagText === SENTINEL, JSON.stringify(await capState()));

/* ============================ RELOAD ============================ */
console.log('\n--- RELOAD ---');
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2400);
// a reload is a fresh window: the pushState wrapper and its counter are gone,
// and the app's stack starts again from this entry. See armDepth.
await armDepth();
await openStable();
ok('RELOAD the Stable came back with the named pet reachable', await focusPet(namedIid));
const afterReload = await capState();
ok('RELOAD the nickname survives a full reload of the app',
  afterReload.tagText === SENTINEL, JSON.stringify(afterReload));

/* ============================ PADDOCK ============================ */
/* Tom, on the second pass: "yes it should replace the name". The Paddock used
   to derive a name for every copy from a hash of its instance id (TANK,
   MEATBALL, GILDA), because there was no naming UI. There is one now, so
   paddockRoster() prefers the player's nickname and falls back to the derived
   pool for copies nobody has named.
   BOTH DIRECTIONS ARE GRADED. "The nickname shows up" would pass on a build
   that threw the derived pool away and left every other pet blank, which is a
   worse bug than the one being fixed: it is silent, it hits pets the player
   never touched, and it looks like data loss. So a named pet must show the
   nickname AND an unnamed one must still show a real derived name. */
console.log('\n--- PADDOCK ---');
const openPaddock = async sp => {
  await page.evaluate(() => document.getElementById('stableToPaddock')?.click());
  await sleep(2200);
  const opened = await page.evaluate(() => !!document.getElementById('pdkScene'));
  if (!opened) return false;
  await page.evaluate(id => document.querySelector(`#pdkPanel .pdk-tile[data-sp="${id}"]`)?.click(), sp);
  await sleep(1400);
  return true;
};
const pdkNames = () => page.evaluate(() => [...document.querySelectorAll('#pdkCards .pdk-card')].map(c => {
  const b = c.querySelector('.pdk-name');
  return { iid: c.dataset.iid, name: b ? b.textContent : null, kids: b ? b.children.length : null };
}));
/* The derived pool, read out of the module rather than copied here, so this
   still discriminates if the word list is ever appended to. */
const derivedPool = await page.evaluate(async () => (await import('./js/paddock.js')).PADDOCK_NAMES);
ok('CONTROL the derived name pool was readable (an empty pool would make every row below vacuous)',
  Array.isArray(derivedPool) && derivedPool.length > 8, `${derivedPool && derivedPool.length} names`);

await openStable();
ok('PADDOCK the Paddock opened from the Stable and mounted the named pet\'s cards', await openPaddock(namedSp));
const pdkRows = await pdkNames();
const pdkNamed = pdkRows.find(r => r.iid === namedIid);
ok('PADDOCK a card for the named pet is mounted (an empty card set is a FAILURE)',
  !!pdkNamed, JSON.stringify(pdkRows));
ok('PADDOCK the nickname REPLACES the derived one, it does not sit beside it',
  pdkNamed && pdkNamed.name === SENTINEL, JSON.stringify(pdkNamed));

/* The other direction, and the bound: every OTHER copy still gets a real name
   out of the pool. Zero named-from-the-pool rows would mean the fallback died. */
await page.evaluate(() => window.__pdkClose && window.__pdkClose());
await sleep(500);
const otherSp = (roster.find(r => r.iid === otherIid) || {}).sp;
await page.evaluate(id => document.querySelector(`#pdkPanel .pdk-tile[data-sp="${id}"]`)?.click(), otherSp);
await sleep(1400);
const pdkOther = (await pdkNames()).find(r => r.iid === otherIid);
ok('PADDOCK an UNNAMED copy still gets its derived name, so the fallback was not thrown away',
  !!pdkOther && derivedPool.includes(pdkOther.name), JSON.stringify(pdkOther));

/* And the escaping, at what is now the THIRD render site. The control itself is
   driven in the Stable sections; this drives the RENDER, which is the half that
   can be unescaped. paddock-cards.js has its own local esc() and this asserts
   it is really applied rather than assuming it. */
await page.evaluate(async (iid, payload) => {
  const l = await import('./js/loot.js');
  await l.setPetNick(iid, payload);
}, namedIid, HOSTILE);
await page.evaluate(() => { window.__pwn = false; window.z = () => { window.__pwn = true; }; });
await page.evaluate(() => window.__pdkClose && window.__pdkClose());
await sleep(400);
await page.evaluate(id => document.querySelector(`#pdkPanel .pdk-tile[data-sp="${id}"]`)?.click(), namedSp);
await sleep(1400);
const pdkHostile = (await pdkNames()).find(r => r.iid === namedIid);
ok('PADDOCK-HOSTILE the Paddock card holds the payload as TEXT, character for character',
  pdkHostile && pdkHostile.name === HOSTILE, JSON.stringify(pdkHostile));
ok('PADDOCK-HOSTILE no element was built from it there either',
  pdkHostile && pdkHostile.kids === 0, JSON.stringify(pdkHostile && pdkHostile.kids));
ok('PADDOCK-HOSTILE and the handler never fired', await page.evaluate(() => window.__pwn === false));
await page.evaluate(async (iid, n) => (await import('./js/loot.js')).setPetNick(iid, n), namedIid, SENTINEL);
await closeSheets();
await sleep(600);

/* ============================ HOSTILE ============================ */
/* A nickname is the only player-typed string that reaches this screen's
   innerHTML, so an unescaped one is a self-XSS. FAILING RESULT: an <img>
   element exists inside the tag, or window.__pwn is true because onerror ran. */
console.log('\n--- HOSTILE ---');
await page.evaluate(() => { window.__pwn = false; window.z = () => { window.__pwn = true; }; });
await setNickViaUi(HOSTILE);
await sleep(1200);
const hostileCap = await capState();
ok('HOSTILE the tag holds the payload as TEXT, character for character',
  hostileCap.tagText === HOSTILE, JSON.stringify(hostileCap.tagText));
ok('HOSTILE no element was built from it: the tag has zero element children',
  hostileCap.tagKids === 0, String(hostileCap.tagKids));
const injected = await page.evaluate(() => document.querySelectorAll('.cf-cap img, .cf-cap script, .cf-cap iframe').length);
ok('HOSTILE and nothing it names was injected anywhere in the caption', injected === 0, `${injected} injected nodes`);
ok('HOSTILE the handler never fired', (await page.evaluate(() => window.__pwn === false)));
ok('HOSTILE the escaped markup is really escaped in the HTML, not merely absent',
  /&lt;img/.test(hostileCap.capHtml || ''), (hostileCap.capHtml || '').slice(-70));
/* Spin away and back: repaintFocus writes the SAME string through a second
   innerHTML path, and that one has been forgotten before. */
ok('HOSTILE the ring spun away from the payload pet', await focusPet(otherIid));
ok('HOSTILE and back onto it', await focusPet(namedIid));
const hostileSpun = await capState();
ok('HOSTILE the carousel repaint path escapes it too (a second innerHTML site)',
  hostileSpun.tagText === HOSTILE && hostileSpun.tagKids === 0, JSON.stringify(hostileSpun.tagText));

await setNickViaUi(QUOTES);
await sleep(900);
const quoteCap = await capState();
ok('HOSTILE quotes, ampersands and angle brackets round-trip exactly',
  quoteCap.tagText === QUOTES, JSON.stringify(quoteCap.tagText));
ok('HOSTILE and the value goes back into the input attribute intact when you reopen it',
  await (async () => {
    await page.evaluate(() => document.querySelector('[data-petnick]')?.click());
    await sleep(800);
    const v = await page.evaluate(() => { const i = document.querySelector('#txIn'); return i ? i.value : null; });
    await closeSheets();
    await sleep(400);
    return v === QUOTES;
  })());

/* ============================ REFUSE ============================ */
/* Words, not silent coercion. The v387 sweep found eleven numeric surfaces
   quietly storing a coerced value; a truncated name is the same defect.
   FAILING RESULT, and the BOUND: the store holds anything other than EXACTLY
   the previous nickname, or the toast is empty. */
console.log('\n--- REFUSE ---');
await openStable();
ok('REFUSE the named pet is in front, so every row below reads its store row', await focusPet(namedIid));
const beforeRefuse = (await stored())[namedIid];
ok('CONTROL a nickname is stored before the refusals, so "unchanged" means something',
  beforeRefuse === QUOTES, JSON.stringify(beforeRefuse));

const TOO_LONG = 'W'.repeat(30);
await setNickViaUi(TOO_LONG);
const longToast = await toastText();
const afterLong = (await stored())[namedIid];
ok('REFUSE an over-length nickname is refused IN WORDS', /\b24\b/.test(longToast), `toast="${longToast}"`);
ok('REFUSE and the stored nickname is EXACTLY what it was, not a truncation',
  afterLong === beforeRefuse, JSON.stringify(afterLong));
ok('REFUSE the player gets their text back to fix rather than losing it',
  await page.evaluate(() => { const i = document.querySelector('#txIn'); return !!i && i.value.length > 24; }));
await closeSheets();
await sleep(500);

await openStable();
await focusPet(namedIid);
const bidi = await page.evaluate(async iid => {
  const l = await import('./js/loot.js');
  return l.setPetNick(iid, 'BOB\u202Egnp.exe');
}, namedIid);
ok('REFUSE a bidi override is refused by name, not stored (it reorders everything drawn after it)',
  bidi.ok === false && bidi.reason === 'invalid' && !!bidi.message, JSON.stringify(bidi));
const emoji = await page.evaluate(async iid => {
  const l = await import('./js/loot.js');
  return l.setPetNick(iid, '🐶‍🦴 Bones');
}, namedIid);
ok('ACCEPT emoji, including a zero-width-joiner sequence, are allowed (the refusal is not a blanket ban)',
  emoji.ok === true && emoji.nick.includes('Bones'), JSON.stringify(emoji));
const rtl = await page.evaluate(async iid => {
  const l = await import('./js/loot.js');
  return l.setPetNick(iid, 'عظمة');
}, namedIid);
ok('ACCEPT right-to-left text is allowed: the refusal is of control characters, not of a language',
  rtl.ok === true, JSON.stringify(rtl));
const ghost = await page.evaluate(async () => {
  const l = await import('./js/loot.js');
  return l.setPetNick('no-such-iid', 'GHOST');
});
ok('REFUSE a nickname cannot be banked against a pet that does not exist',
  ghost.ok === false && ghost.reason === 'unknown', JSON.stringify(ghost));

/* ============================ CLEAR ============================ */
console.log('\n--- CLEAR ---');
await openStable();
ok('CLEAR the named pet is in front', await focusPet(namedIid));
ok('CONTROL there is a nickname to clear', !!(await stored())[namedIid], JSON.stringify(await stored()));
await setNickViaUi('');
await sleep(900);
const cleared = await capState();
ok('CLEAR emptying the field removes the nickname from the caption',
  cleared.tagText === null, JSON.stringify(cleared));
ok('CLEAR and the key is gone from the store, not left as an empty string',
  !((await stored())[namedIid] != null), JSON.stringify(await stored()));
ok('CLEAR the control goes back to offering a first naming',
  cleared.btnLabel === 'NICKNAME', cleared.btnLabel);

/* ============================ WIRE ============================ */
/* THE ROW THIS FILE EXISTS FOR. Set the sentinel, go online against the fake
   API, then drive every outbound path the app has that could plausibly carry
   pet data, and read the bytes. */
console.log('\n--- WIRE ---');
/* EVERY pet in the save carries the sentinel, so a leak on any pet path hits
   it, not just the one that happens to be in front. The one on the pet about
   to be equipped is set through the REAL control, because that is the pet the
   profile snapshot uploads. */
await page.evaluate(async n => {
  const l = await import('./js/loot.js');
  for (const x of await l.petInstances()) await l.setPetNick(x.iid, n);
}, SENTINEL);
await openStable();
ok('WIRE-SETUP the pet whose profile will be uploaded is in front', await focusPet(namedIid));
await setNickViaUi(SENTINEL);
await sleep(800);
const storedAtCapture = await stored();
ok('LOCAL every pet carries the nickname at the moment of capture (otherwise the wire is clean for the boring reason)',
  Object.values(storedAtCapture).length >= 2 && Object.values(storedAtCapture).every(v => v === SENTINEL),
  JSON.stringify(storedAtCapture));

const online = await page.evaluate(async () => {
  const s = await import('./js/social.js');
  const r = await s.goOnline();
  return { r, online: await s.isOnline() };
});
ok('CONTROL the app really went online, so its outbound paths are live',
  online.online === true, JSON.stringify(online.r));

/* EQUIP through the REAL button: the equip handler calls pushProfileSoon(),
   the app's own 1.2s-debounced profile upload, and that is the path a player's
   pet actually travels to their Crew, the leaderboard and the step race.
   Equipping something already equipped pays nothing, so the audit equips
   whichever pet is not currently out (the button is disabled otherwise). */
const equipped = await page.evaluate(async () => (await import('./js/loot.js')).equippedPetIid());
const toEquip = equipped === namedIid ? otherIid : namedIid;
ok('WIRE-SETUP a pet that is not currently out is in front, so EQUIP is live', await focusPet(toEquip));
const wireMark = wire.length;
const equipClicked = await page.evaluate(() => {
  const b = document.querySelector('[data-eq]');
  if (!b || b.disabled) return false;
  b.click();
  return true;
});
ok('WIRE-SETUP the real EQUIP button was pressed (this is what triggers the profile upload)', equipClicked);
await sleep(3000);
await closeSheets();
/* And every other sender, driven directly so no path is left untested.
   autoSync takes the snapshot BUILDER as its first argument; passing anything
   else silently returns null, so this hands it a real one. */
const drove = await page.evaluate(async () => {
  const s = await import('./js/social.js');
  const a = await import('./js/analytics.js');
  const out = {};
  const go = async (k, fn) => { try { out[k] = String(await fn()); } catch (e) { out[k] = 'threw ' + e.message; } };
  await go('backup', () => s.pushBackup(''));
  await go('friends', () => s.listFriends());
  await go('leaderboard', () => s.leaderboard());
  await go('gift', () => s.sendGift('p-friend', 'free', 0));
  await go('cheer', () => s.sendCheer('p-friend', 1));
  await go('friendReq', () => s.friendRequest('AUDIT1'));
  await go('spireClaim', () => s.claimSpireRemote({ id: 'sp1', name: 'Tower', lat: 49.2, lng: -123.1 }));
  await go('spireDefend', () => s.defendSpireRemote('sp1'));
  await go('spireTend', () => s.tendSpireRemote('sp1'));
  await go('steps', () => s.fetchStepRace());
  await go('grants', () => s.pullGrants());
  await go('spires', () => s.fetchSpires(['sp1']));
  await go('name', () => s.setName(1, 2, 3));
  await go('track', () => { a.track('fight_start', { mode: 'pit', pet: true }); return a.flush(); });
  await go('report', () => a.sendReport('den', { lat: 49.2, lng: -123.1, note: 'audit' }));
  return out;
});
await sleep(2500);
console.log('  drove:', JSON.stringify(drove));

const sent = wire.slice(wireMark).concat(wire.filter(r => r.url.startsWith(apiUrl)));
const apiSent = sent.filter(r => r.url.startsWith(apiUrl));
const profileReqs = apiSent.filter(r => r.method === 'PUT' && /\/profile/.test(r.url));
const backupReqs = apiSent.filter(r => r.method === 'PUT' && /\/backup/.test(r.url));

ok('CONTROL the capture recorded a real body of outbound API traffic (zero requests is a FAILURE, not a clean bill)',
  apiSent.length >= 8, `${apiSent.length} API requests captured, ${served.length} received server-side`);
ok('CONTROL the server actually received them, so these are real sends and not queued intentions',
  served.length >= 8, `${served.length} received`);
ok('CONTROL the profile snapshot, the one payload that carries pet data to other players, was among them',
  profileReqs.length >= 1, `${profileReqs.length} PUT /profile`);
ok('CONTROL the encrypted backup was pushed too', backupReqs.length >= 1, `${backupReqs.length} PUT /backup`);

/* POSITIVE CONTROL. If a grep of these bytes cannot find the pet data that is
   SUPPOSED to be uploaded, it could not have found the nickname either, and
   every negative row below is vacuous. This row failing means the CAPTURE is
   broken, not the feature. */
const profileBody = profileReqs.map(r => r.body).join('\n');
const petFields = ['"pet"', '"shiny"', '"lineage"', '"outfit"'].filter(k => profileBody.includes(k));
ok('POSITIVE CONTROL the captured profile body really does contain the pet block (a blind capture would find nothing to leak)',
  petFields.length === 4, `found ${petFields.join(' ')} in ${profileBody.length} bytes`);

/* THE ASSERTION. Every form the string could take on a wire. */
const forms = [SENTINEL, encodeURIComponent(SENTINEL), JSON.stringify(SENTINEL).slice(1, -1), Buffer.from(SENTINEL).toString('base64')];
const hits = [];
for (const r of wire) {
  for (const f of forms) {
    if (r.url.includes(f) || (r.body || '').includes(f)) hits.push(`${r.method} ${r.url.replace(apiUrl, '{api}')} (${f === SENTINEL ? 'plain' : 'encoded'})`);
  }
}
ok('WIRE the nickname appears in ZERO outbound request bodies and ZERO URLs, in any encoding',
  hits.length === 0, hits.slice(0, 5).join(' | '));

const servedHits = served.filter(r => forms.some(f => r.url.includes(f) || r.body.includes(f)));
ok('WIRE and no server ever received it either',
  servedHits.length === 0, servedHits.slice(0, 3).map(r => `${r.method} ${r.url}`).join(' | '));

/* The backup DOES contain the nickname, by design: it is the player's own save.
   It must be ciphertext, so the server holds bytes it cannot read. */
const backupBody = backupReqs.map(r => r.body).join('\n');
ok('BACKUP the nickname rides the personal backup only as ciphertext, never as readable text',
  backupBody.length > 0 && !forms.some(f => backupBody.includes(f)) && !backupBody.includes('petNick'),
  `${backupBody.length} bytes of blob`);

/* NO ESCAPE: nothing may have gone to the real world. This also proves the ?api
   hook held, which is what keeps this audit off the production worker. */
const offBox = wire.filter(r => !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(r.url) && !/^(data|blob|about):/.test(r.url));
ok('NO-ESCAPE every request in this run stayed on 127.0.0.1, so the capture saw all of them',
  offBox.length === 0, offBox.slice(0, 3).map(r => r.url).join(' | '));

/* ======================= COVERAGE ======================= */
/* A second render site for the nickname that nobody drove would ship
   unescaped. Derived from the source so a new one FAILS here rather than
   quietly shipping. */
console.log('\n--- COVERAGE ---');
const appSrc = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const nickSites = [...appSrc.matchAll(/nickTag\(/g)].length;
ok('COVERAGE the nickname render helper is used at all (an empty scan is a FAILURE)', nickSites >= 2, `${nickSites} nickTag() call sites`);
ok('COVERAGE every nickTag() call site is one of the two this file drives (the caption and the carousel repaint)',
  nickSites === 2, `${nickSites} call sites, expected exactly 2 (the cf-cap caption and repaintFocus). A third render site must be DRIVEN above before this number moves.`);
const rawNick = [...appSrc.matchAll(/\$\{\s*nicks\[[^\]]+\]\s*\}/g)].length;
ok('COVERAGE no nickname is interpolated into HTML outside nickTag(), which is the only place esc() is applied',
  rawNick === 0, `${rawNick} raw interpolations`);

/* THE GAP IN THE WIRE CAPTURE, NAMED RATHER THAN PAPERED OVER.
   js/analytics.js is BOT-gated: `const BOT = navigator.webdriver === true` and
   every sender returns early, so an automated browser transmits no analytics at
   all. Measured on this run below. That means page.on('request') CANNOT see a
   leak on that transport, and the honest complement is to grade it from source
   instead of pretending the wire proved it. */
const anaSrc = readFileSync(path.join(ROOT, 'js/analytics.js'), 'utf8');
const eventsSent = wire.filter(r => /\/events\b/.test(r.url)).length;
ok('ANALYTICS the analytics transport really is silent under automation, which is WHY the row below is static and not measured',
  eventsSent === 0, `${eventsSent} POST /events captured; BOT gate at js/analytics.js line ~22`);
ok('ANALYTICS-STATIC and the analytics module never reads the nickname store, so there is nothing for it to send',
  !/petNick|nickProblem/.test(anaSrc), /petNick|nickProblem/.test(anaSrc) ? 'js/analytics.js now references the nickname store' : '');

/* And the snapshot builder itself, belt and braces beside the WIRE row: this
   one is static, so it fails even on a build where nobody managed to go online. */
const snapFrom = appSrc.indexOf('async function socialSnapshot');
const snapTo = appSrc.indexOf('\n}', appSrc.indexOf('badges:', snapFrom));
ok('SNAPSHOT the profile-snapshot builder was found to inspect (an empty slice is a FAILURE)',
  snapFrom > 0 && snapTo > snapFrom && snapTo - snapFrom > 200, `slice ${snapTo - snapFrom} bytes`);
ok('SNAPSHOT and it does not mention the nickname anywhere: the pet block stays an allow-list of id, level, shiny and lineage',
  !/nick/i.test(appSrc.slice(snapFrom, snapTo)), appSrc.slice(snapFrom, snapTo).split('\n').filter(l => /nick/i.test(l)).join(' | '));

/* Which modules may touch the store at all. A third one appearing is not
   automatically a leak, but it is a thing nobody drove, so it stops the build. */
const jsDir = path.join(ROOT, 'js');
const touchers = readdirSync(jsDir).filter(f => f.endsWith('.js') && /petNick|setPetNick|petNicks/.test(readFileSync(path.join(jsDir, f), 'utf8'))).sort();
ok('COVERAGE the nickname store is reachable from exactly three modules: loot.js owns it, app.js and paddock.js feed renders',
  touchers.join(',') === 'app.js,loot.js,paddock.js', `touched by: ${touchers.join(', ') || 'nothing (an empty scan is a FAILURE)'}`);

/* THE THIRD RENDER SITE. js/paddock-cards.js has its own local esc(), so the
   nickname reaching it is only safe if pdk-name really goes through it. Driven
   above as well; this row is what fails if a future edit drops the call. */
const pdkSrc = readFileSync(path.join(ROOT, 'js/paddock-cards.js'), 'utf8');
ok('COVERAGE the Paddock card name is interpolated through esc(), the only thing standing between it and innerHTML',
  /<b class="pdk-name">\$\{esc\(m\.name\)\}<\/b>/.test(pdkSrc), 'pdk-name is no longer esc()-wrapped');
ok('COVERAGE the Paddock card still takes its name from the roster row, so the nickname reaches it at all',
  /name:\s*row\.name\s*\|\|\s*sp\.name/.test(pdkSrc), 'cardModel no longer prefers row.name');
const pdkRosterSrc = readFileSync(path.join(ROOT, 'js/paddock.js'), 'utf8');
ok('COVERAGE and paddockRoster prefers the private nickname over the derived pool',
  /name:\s*nicks\[x\.iid\]\s*\|\|\s*names\[x\.iid\]/.test(pdkRosterSrc), 'paddockRoster no longer prefers the nickname');

/* THE SHEET STACK NEVER TOOK THE DOCUMENT WITH IT. See the floor above: this is
   the row that would have NAMED the failure this file died on instead of
   throwing it, and it is what keeps the floor honest. `sheetCloses > 0` is the
   positive control -- a run that never reached a close would report "0 reloads"
   for the boring reason and grade nothing. The audit's own deliberate
   page.reload() is not counted: it is not inside a closeSheets window. */
ok('SHEETS every sheet close stayed inside this document (one traversal too deep reloads the app out from under the run)',
  sheetCloses > 0 && sheetReloads === 0, `${sheetReloads} unintended document loads across ${sheetCloses} closes`);

ok('NO PAGE ERRORS during the whole run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
await shutdown();

const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('\n         ')); process.exit(1); }
console.log('NICKNAME PRIVACY VERIFIED');
process.exit(0);
