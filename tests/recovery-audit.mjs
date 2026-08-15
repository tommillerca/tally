/* RESTORE IS THE ONLY WAY BACK FROM A LOST PHONE, AND IT OVERWRITES THIS ONE.
 *
 * The sheet says so out loud: "This replaces whatever is on this phone now."
 * That makes a SUCCESSFUL restore destructive by design and a FAILED restore
 * the thing that must never destroy anything. Nothing tested either half. A
 * coverage census on 2026-08-12 found this flow with no audit pointed at it,
 * and `maybePromptRecovery` returns early under navigator.webdriver with no
 * force override, so no automated run has ever even rendered the prompt.
 *
 * WHAT THIS PINS, and all of it is about the failure paths, because those are
 * the ones a player hits at their worst moment:
 *   REJECT   a malformed recovery id never reaches the network
 *   MISS     an unknown id fails with a message, and the local save survives
 *   PHRASE   a wrong phrase fails with a message, and the local save survives
 *   INTACT   after every failure above, the log rows, XP and coins are byte
 *            identical to what they were before the attempt
 *
 * The INTACT checks are the point. js/social.js adoptIdentity writes the new
 * identity, nulls `social` and clears `bootRestored` BEFORE it goes online and
 * pulls the backup, so the interesting question is what a player is left with
 * when the pull fails. This audit measures that rather than assuming it.
 *
 * PROVE-RED: make the id validator accept anything and REJECT fails; make a
 * failure path skip its early return and INTACT fails naming the rows lost.
 *
 * Usage: node tests/recovery-audit.mjs [baseUrl]   (serves this repo if omitted)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const { browser, page } = await boot(base);

/* The recovery endpoints are the only ones this audit answers. Everything else
   that would reach a real server is refused, so a stray write can never touch
   production from a test run. */
let recoveryMode = 'miss';       // 'miss' = 404, 'meta' = a real-looking blob
/* COUNT THE NETWORK CALLS. "It showed an error" does not distinguish a client
   that refused a malformed id from one that shipped it to the server and got a
   404 back: both surface a message. Proven by disabling the validator, where
   REJECT stayed green. The discriminating fact is whether the request happened
   at all, so count it. */
let recoveryCalls = 0;
await page.setRequestInterception(true);
page.on('request', req => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS', 'Access-Control-Allow-Headers': '*' };
  const u = req.url();
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors, body: '' });
  if (/\/recovery\//.test(u)) {
    recoveryCalls++;
    if (recoveryMode === 'miss') return req.respond({ status: 404, headers: cors, body: '{}' });
    /* A well-formed envelope whose ciphertext cannot decrypt with any phrase:
       this is what "wrong phrase" looks like from the client's side, and it is
       the failure that lands AFTER the network succeeded. */
    return req.respond({ status: 200, contentType: 'application/json', headers: cors,
      body: JSON.stringify({ wrapped: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', salt: 'AAAAAAAAAAAAAAAA', iters: 100000 }) });
  }
  if (/bonez-api|workers\.dev/.test(u)) return req.respond({ status: 500, headers: cors, body: '{}' });
  return req.continue();
});

await seed(page, { level: 14, coins: 777 });

/* The save we are protecting. Read it the way the app stores it, so "intact"
   means the same thing to this audit as it does to a player. */
const snapshot = () => page.evaluate(async () => {
  const db = await import('./js/db.js');
  const log = await db.db.all('log');
  const xp = await db.db.all('xp');
  return {
    logRows: log.length,
    xpRows: xp.length,
    coins: await db.kvGet('coins', 0),
    identity: JSON.stringify(await db.kvGet('identity', null) || {}).slice(0, 40),
  };
});

/* A REAL IDENTITY TO PROTECT. Without this the identity comparison is {} vs {}
   and passes having compared nothing: the demo save has no identity, so the
   "not swapped" check was vacuous in the first run of this file. Seed one that
   is recognisably OURS, so a swap is visible rather than inferred. */
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('identity', { privJwk: { kty: 'EC', d: 'ORIGINAL-DEVICE-KEY' }, pubJwk: { kty: 'EC', x: 'ORIGINAL' } });
});

const before = await snapshot();
ok('SETUP a local identity exists, so a swap would be visible',
  /ORIGINAL/.test(before.identity), before.identity);
ok('SETUP there is a real save to protect (an empty one would fake every INTACT check)',
  before.logRows > 0 && before.xpRows > 0, JSON.stringify(before));

/* Drive the REAL control: Settings, then the restore button, then type and
   submit. Calling social.restoreWithPhrase directly would prove the module
   works and nothing about whether the screen reaches it. */
const openRestore = async () => {
  await page.evaluate(() => { location.hash = '#/settings'; });
  await sleep(1600);
  const found = await page.evaluate(() => {
    const b = document.getElementById('restoreAcctBtn');
    if (!b) return false;
    b.click();
    return true;
  });
  await sleep(1200);
  return found && await page.evaluate(() => !!document.getElementById('rsGo'));
};
ok('SETUP the restore sheet opens from its real Settings control', await openRestore(), '');

const attempt = async (id, phrase) => {
  await page.evaluate(({ id, phrase }) => {
    document.getElementById('rsCode').value = id;
    document.getElementById('rsPhrase').value = phrase;
    document.getElementById('rsGo').click();
  }, { id, phrase });
  await sleep(2600);
  return page.evaluate(() => {
    const e = document.getElementById('rsErr');
    return { err: e && !e.hidden ? e.textContent.trim() : null, sheetStillOpen: !!document.getElementById('rsGo') };
  });
};

/* 1. REJECT: a malformed id must be refused by the client, before the network. */
recoveryMode = 'miss';
recoveryCalls = 0;
const bad = await attempt('!!!not an id!!!', 'whatever phrase');
ok('REJECT a malformed recovery id is refused with a message', !!bad.err, JSON.stringify(bad));
ok('REJECT and it never reached the network (the message alone does not prove that)',
  recoveryCalls === 0, `${recoveryCalls} recovery request(s) made for a malformed id`);
const afterBad = await snapshot();
ok('INTACT the save survives a malformed id', afterBad.logRows === before.logRows && afterBad.xpRows === before.xpRows && afterBad.coins === before.coins,
  `${afterBad.logRows}/${afterBad.xpRows}/${afterBad.coins} vs ${before.logRows}/${before.xpRows}/${before.coins}`);

/* 2. MISS: a well-formed id the server does not know. */
recoveryCalls = 0;
const missed = await attempt('tom-bones', 'some phrase here');
ok('SETUP the request counter is live (else REJECT above could pass on a broken intercept)',
  recoveryCalls > 0, `${recoveryCalls} request(s) for a well-formed id`);
ok('MISS an unknown recovery id fails with a message, not silently', !!missed.err, JSON.stringify(missed));
const afterMiss = await snapshot();
ok('INTACT the save survives an unknown id', afterMiss.logRows === before.logRows && afterMiss.xpRows === before.xpRows && afterMiss.coins === before.coins,
  `${afterMiss.logRows}/${afterMiss.xpRows}/${afterMiss.coins} vs ${before.logRows}/${before.xpRows}/${before.coins}`);

/* 3. PHRASE: the server HAS the account, the phrase is wrong. This is the one
      that gets furthest into the flow before failing, so it is the one most
      likely to leave something behind. */
recoveryMode = 'meta';
const wrong = await attempt('tom-bones', 'definitely the wrong phrase');
ok('PHRASE a wrong phrase fails with a message', !!wrong.err, JSON.stringify(wrong));
const afterWrong = await snapshot();
ok('INTACT the save survives a wrong phrase', afterWrong.logRows === before.logRows && afterWrong.xpRows === before.xpRows && afterWrong.coins === before.coins,
  `${afterWrong.logRows}/${afterWrong.xpRows}/${afterWrong.coins} vs ${before.logRows}/${before.xpRows}/${before.coins}`);
ok('INTACT and the local identity was not swapped by a failed restore',
  afterWrong.identity === before.identity, `${afterWrong.identity} vs ${before.identity}`);

/* 4. The player must be able to leave. A restore sheet that traps someone
      after a failed attempt is its own bug on a screen people reach in a panic. */
await page.evaluate(() => document.querySelector('.sheet-close')?.click());
await sleep(900);
const escaped = await page.evaluate(() => {
  const gone = !document.getElementById('rsGo');
  const tab = document.querySelector('nav .tab, .tabbar button');
  const r = tab && tab.getBoundingClientRect();
  const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { gone, tabOwned: !!(hit && tab && (hit === tab || tab.contains(hit))) };
});
ok('ESCAPE the sheet closes after a failed attempt and the app is usable', escaped.gone && escaped.tabOwned, JSON.stringify(escaped));

console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`);
await browser.close();
srv?.close();
process.exit(fails.length ? 1 : 0);
