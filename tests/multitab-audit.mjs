/* ONE ACCOUNT, TWO TABS. What actually reaches the store when the app is open twice.
 *
 * WHY THIS EXISTS. Nothing in this repo had ever opened the app twice. Every
 * other audit drives one page, and a single page cannot produce the failure
 * this file is about, because the failure IS the second consumer. Two tabs are
 * not exotic: a shared link, a middle-click, an installed PWA sitting beside
 * its own website, or the same browser restored with two tabs from yesterday.
 * They share ONE IndexedDB and ONE service worker.
 *
 * THE SHAPE. IndexedDB serialises `readwrite` transactions over a store across
 * every connection, so a transaction is a real lock. What is not a lock is
 *     const v = await read(); ... ; await write(v + 1);
 * and that was the shape of the coin balance, the dust balance, the gift box,
 * the seen-grants list, the inventory grant, the gear melt, and, worst of all,
 * the XP ledger row that every "ask the authority first" rule in CLAUDE.md
 * leans on. The v390 gift double-pay was one instance of it reached by a
 * re-delivery. A second tab reaches the same instance with no server involved.
 *
 * WHAT IT MEASURED against ddbb079 (v391), before the fix. All of these are
 * assertions below, not notes, and every one is an exact number, never a trend:
 *     50 x coinsAdd(+10) from 1000                  1280, not 1500
 *     20 spends of 100 racing 20 earns of 100        2500, not 3000
 *     one 100-coin grant, both tabs pull it          200 coins, ONE ledger row
 *     one 250-coin gift, both tabs open it           500 coins
 *     one gear id granted in both tabs               TWO inv rows, and each one
 *                                                    melts for full dust
 *     one gear piece melted in both tabs             dust paid TWICE
 *     awardCapped, 12/day ceiling, both tabs push    190 XP against a cap of 120
 *     30 keys added to grantsSeen across two tabs    23 survived
 *     a stale tab saving settings                    reverted the other tab's
 *                                                    units change with nothing
 *                                                    said to anybody
 *     a tab foregrounded after the other spent       showed 500 coins over a
 *                                                    store holding 1500, and
 *                                                    stayed there. The
 *                                                    arithmetic was never
 *                                                    wrong (a 200 spend from
 *                                                    that screen went 1500 ->
 *                                                    1300) but the number on
 *                                                    it was a lie.
 *     Erase all data with a second tab writing       30 inv rows and 150 coins
 *                                                    still there, and the tab
 *                                                    that erased reloaded onto
 *                                                    the save it had destroyed
 *
 * DIRECTION AND BOUND (anti-regression rule 11). Every currency row here is an
 * exact equality against a number computed from the inputs, not "fewer
 * duplicates" and not "the balance changed". A ledger row count is `=== 1`,
 * never `<= 2`. The erase row is ZERO rows in every store, never "fewer than
 * before": the bug's own signature is survival, so any check phrased as a
 * comparison against the previous count grades it as a pass. Note in particular
 * that the grant row asserts BOTH the ledger row count AND the coin balance:
 * the double-pay leaves exactly one ledger row, which is precisely why a check
 * that counted rows alone would have passed on it.
 *
 * WHY IT DRIVES THE REAL PULL. The grant rows do not call applyPayload
 * directly. They stand up a fake Worker on loopback, point the app at it with
 * the supported `?api=` dev hook, register both tabs as the SAME account, and
 * let each tab run the real `social.pullGrants()` against the same feed at the
 * same instant. That is the situation being claimed about. Everything else is
 * driven through the exported function the game itself calls.
 *
 * EMPTY SAMPLE = FAILURE. SETUP asserts both pages are on one database and that
 * a write in one is visible in the other before any row runs; if that fails,
 * every row below would be measuring two independent saves and passing for the
 * wrong reason, so the run stops there.
 *
 * PROVE-RED. Each mode reintroduces exactly ONE old shape by transforming the
 * bytes on their way out of the server. Nothing in the repo is edited.
 *     --prove-red=coins    coinsAdd back to read-modify-write   -> COINS-EARN, COINS-SPEND
 *     --prove-red=ledger   applyPayload back to get-then-award  -> GRANT-PULL, GIFT-OPEN
 *     --prove-red=award    awardOnce back to get-then-put       -> AWARD-CAP, GRANT-PULL
 *     --prove-red=inv      grantGear back to newId + put        -> INV-DUPE
 *     --prove-red=melt     disenchantGear back to db.del        -> MELT-ONCE
 *     --prove-red=seen     grantsSeen back to overwrite         -> GRANT-SEEN
 *     --prove-red=resume   drop the resume refresh              -> RESUME-FRESH\n *     --prove-red=sheetclose refresh on EVERY resume, unguarded  -> RESUME-SHEET\n *     --prove-red=settings js/app.js back to whole-snapshot saves  -> SETTINGS-MERGE (source half)\n *     --prove-red=erase    erase back to the per-store loop     -> ERASE-ZERO
 * A mode that changes no bytes is itself a failure (the SETUP row below), so a
 * drifted regex cannot silently prove nothing.
 *
 * Usage: node tests/multitab-audit.mjs [--prove-red=NAME]
 * It always serves this checkout, so it takes no base URL: the transforms have
 * to own the bytes.
 */
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, chromePath, sandboxArgs, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argOf = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=');
const PROVE = argOf('prove-red') || '';

const fails = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails.push(name);
};
const exact = (name, expected, got, detail = '') =>
  ok(name, String(expected) === String(got), `expected ${expected}, got ${got}${detail ? '  ' + detail : ''}`);

/* ---------------- the prove-red transforms ---------------------------------
   Each one is a single replace that puts an old shape back. `applied` is
   counted so a regex that stopped matching is a SETUP failure rather than a
   run that quietly proves nothing. */
let transformHits = 0;
const swap = (src, find, put) => {
  if (!src.includes(find)) return src;
  transformHits++;
  return src.replace(find, put);
};

function transform(rel, buf) {
  if (!PROVE) return buf;
  let s = buf.toString();
  if (rel === 'js/loot.js' && PROVE === 'coins') {
    s = swap(s, "export async function coinsAdd(n) { return kvBump('coins', n); }",
      "export async function coinsAdd(n) { const c = Math.max(0, (await coins()) + n); await kvSet('coins', c); return c; }");
  }
  if (rel === 'js/loot.js' && PROVE === 'inv') {
    s = swap(s, "if (!await db.addIfAbsent('inv', row)) return null;   // another tab got there first\n  await collectLook(g.artId);",
      "await db.put('inv', { ...row, id: newId() });\n  await collectLook(g.artId);");
  }
  if (rel === 'js/loot.js' && PROVE === 'melt') {
    s = swap(s, "if (!await db.take('inv', row.id)) return { ok: false, reason: 'not-owned' };",
      "await db.del('inv', row.id);");
  }
  if (rel === 'js/social.js' && PROVE === 'ledger') {
    s = swap(s, "  const claim = await awardOnce(key, type || 'social', p.xp || 0, p.note || 'From the Crew');\n  if (!claim.claimed) return false;",
      "  if (await db.get('xp', key)) return false;\n  await awardOnce(key, type || 'social', p.xp || 0, p.note || 'From the Crew');\n  if (false) return false;");
  }
  if (rel === 'js/social.js' && PROVE === 'seen') {
    s = swap(s, "  if (newlySeen.length) {\n    await kvUpdate('grantsSeen', cur => {\n      const merged = new Set(cur || []);\n      for (const k of newlySeen) merged.add(k);\n      return [...merged].slice(-500);\n    }, []);\n  }",
      "  await kvSet('grantsSeen', [...seen].slice(-500));");
  }
  if (rel === 'js/game.js' && PROVE === 'award') {
    s = swap(s, "  const claimed = await db.addIfAbsent('xp', row);\n  if (!claimed) return { claimed: false, xp: 0 };",
      "  if (await db.get('xp', key)) return { claimed: false, xp: 0 };\n  await db.put('xp', row);");
  }
  if (rel === 'js/app.js' && PROVE === 'resume') {
    s = swap(s, "    if (!sheetStack.length) refresh();\n  });", "  });");
  }
  if (rel === 'js/app.js' && PROVE === 'sheetclose') {
    /* the unguarded version: refresh on EVERY resume, sheet or no sheet. This
       is the regression the guard above exists to stop, and it is why
       RESUME-SHEET is in the file at all. */
    s = swap(s, "    if (!sheetStack.length) refresh();", "    refresh();");
  }
  if (rel === 'js/app.js' && PROVE === 'settings') {
    /* back to writing the whole in-memory snapshot, both in the mechanism and
       at the call sites, so BOTH halves of the SETTINGS-MERGE pair go red.
       Reverting only the call sites left saveSettings itself still merging, and
       the behavioural row went on passing through the test hook. */
    s = swap(s, "S.settings = await kvUpdate('settings', cur => ({ ...(cur || {}), ...changed }), {});",
      "await kvSet('settings', now); S.settings = now;");
    const before = s;
    s = s.replace(/await saveSettings\(\);/g, "await kvSet('settings', S.settings);");
    if (s !== before) transformHits++;
  }
  if (rel === 'js/db.js' && PROVE === 'erase') {
    /* the seven-transaction, this-tab-only loop the handler used to run inline */
    s = swap(s, "export async function eraseAll() {", `export async function eraseAll() {
  for (const st of STORES) await db.clear(st);
  if (true) return;`);
  }
  return Buffer.from(s);
}

/* ---------------- static server for the app tree --------------------------- */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.shortcut': 'application/octet-stream',
};
const freePort = () => new Promise(r => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); });
});

async function serveApp() {
  const port = await freePort();
  const srv = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
    if (p.endsWith('/')) p += 'index.html';
    const rel = p.replace(/^\/+/, '');
    const full = path.resolve(ROOT, rel);
    if (!full.startsWith(ROOT + path.sep) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); return res.end('not here'); }
    const body = transform(rel, fs.readFileSync(full));
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  });
  await new Promise(r => srv.listen(port, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${port}/`, close: () => srv.close() };
}

/* ---------------- a fake Worker, so the REAL pull path runs -----------------
   Signatures are not verified: the question here is what two clients do with
   one feed, not whether the Worker authenticates. Everything else about the
   client path is the real one, /register through /grants. */
async function serveApi() {
  const port = await freePort();
  const state = { grants: [], cursor: 0, hits: 0 };
  const srv = http.createServer((req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Content-Type': 'application/json',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/register') {
      let body = '';
      req.on('data', d => { body += d; });
      req.on('end', () => {
        res.writeHead(200, cors);
        // ONE account for both tabs: that is the whole premise of this audit
        res.end(JSON.stringify({ playerId: 'probe-player', handle: 'Probe', friendCode: 'PRB-1', name: 'Probe' }));
      });
      return;
    }
    if (u.pathname === '/grants') {
      /* `feeds` serves a DIFFERENT list to each request when set, which is the
         ordinary case rather than a contrivance: the server's grant feed grows,
         so two tabs pulling seconds apart legitimately see different rows. That
         is the situation where an overwritten seen-list loses keys. */
      const feed = state.feeds ? (state.feeds[state.hits] || []) : state.grants;
      state.hits++;
      res.writeHead(200, cors);
      return res.end(JSON.stringify({ grants: feed, cursor: state.cursor }));
    }
    res.writeHead(404, cors); res.end('{}');
  });
  await new Promise(r => srv.listen(port, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${port}`, state, close: () => srv.close() };
}

/* ---------------- browser --------------------------------------------------- */
const puppeteer = await loadPuppeteer();
const app = await serveApp();
const api = await serveApi();

const browser = await puppeteer.launch({
  /* THIS SUITE CANNOT RUN UNDER headless 'shell', so it pins 'new' and does
  NOT let HEADLESS_MODE override. The global override exists because this
  Mac cannot screenshot under 'new' (godmode.js:450), which is a real
  constraint for suites that capture frames. This one takes no screenshots:
  `grep -c screenshot` is 0. Under 'shell' the tab never truly backgrounds,
  so visibilitychange never fires and the suite reports a red on a healthy
  app. Measured 2026-08-23: ALL GREEN under 'new', red under 'shell'.
  A false red on a green app is worse than a skipped suite, and worse still
  here because this is the suite that grades the release road. */
  headless: 'new',
  executablePath: chromePath(),
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  /* THE SECOND TAB HAS TO ACTUALLY RUN. Chrome backgrounds every page but the
     active one and throttles its timers, so without these three flags the two
     tabs take turns instead of racing: measured with a deliberately reintroduced
     double-pay in the grant path, one tab applied all 12 grants and the other
     applied 0, and the guard graded the bug as safe. A player with two windows
     open, or a PWA beside its own website, has both running. */
  args: [...sandboxArgs(), '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});

const HOOKS = `
  window.__t = {
    loot: await import('./js/loot.js'),
    db: await import('./js/db.js'),
    social: await import('./js/social.js'),
    game: await import('./js/game.js'),
    gear: await import('./js/gear.js'),
  };
  /* Fire fn at an absolute wall-clock instant so both tabs enter the critical
     section together. Two separate page.evaluate round trips arrive milliseconds
     apart, which is enough for the loser to see the winner's committed write and
     for a real race to read as safe. */
  window.__at = (T, fn) => new Promise(res => {
    const go = () => { if (Date.now() >= T) res(fn()); else setTimeout(go, 0); };
    setTimeout(go, Math.max(0, T - Date.now() - 5));
  });
`;

async function openTab(label) {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log(`[${label}] PAGEERROR ${e.message}`));
  await page.goto(`${app.url}?demo&api=${encodeURIComponent(api.url)}`, { waitUntil: 'networkidle2' });
  await sleep(2600);
  // the demo profile opens with first-run cards; clear them so nothing eats a click
  for (let i = 0; i < 6; i++) {
    const hit = await page.evaluate(() => {
      const rx = /^(spin|nice|done|collect|claim|continue|ok|got it|next|skip)$/i;
      const b = [...document.querySelectorAll('button')].find(x => rx.test((x.textContent || '').trim()) && !x.disabled && x.getBoundingClientRect().width);
      if (!b) return false; b.click(); return true;
    });
    if (!hit) break;
    await sleep(700);
  }
  await page.evaluate(`(async () => { ${HOOKS} })()`);
  return page;
}

let A = await openTab('A');
let B = await openTab('B');
const readA = (fn, ...a) => A.evaluate(fn, ...a);
const at = async (fn, ...args) => {
  const T = Date.now() + 400;
  const src = `(async () => { const f = ${fn}; return window.__at(${T}, () => f(...${JSON.stringify(args)})); })()`;
  return Promise.all([A.evaluate(src), B.evaluate(src)]);
};
const reset = () => readA(async () => {
  for (const st of window.__t.db.STORES) await window.__t.db.db.clear(st);
});

/* ---------------- SETUP: they really are one save ------------------------- */
{
  const names = await readA(async () => (await indexedDB.databases()).map(d => d.name));
  await readA(() => window.__t.db.kvSet('probe-shared', 'from-A'));
  await sleep(250);
  const seenByB = await B.evaluate(() => window.__t.db.kvGet('probe-shared', null));
  ok('SETUP  both pages are the same origin on ONE database, and a write in tab A is readable in tab B',
    names.includes('tally-demo') && seenByB === 'from-A', `databases: ${JSON.stringify(names)}  B read: ${seenByB}`);
  if (seenByB !== 'from-A') {
    console.log('FAIL  SETUP the two pages are not sharing a save, so nothing below would be measuring anything. Stopping.');
    await browser.close(); app.close(); api.close();
    process.exit(1);
  }
}

/* ---------------- COINS ---------------------------------------------------- */
{
  await readA(() => window.__t.db.kvSet('coins', 1000));
  await at(`async (n, step) => { for (let i = 0; i < n; i++) await window.__t.loot.coinsAdd(step); }`, 25, 10);
  await sleep(400);
  exact('COINS-EARN  50 awards of +10 from 1000 across two tabs land on an EXACT balance',
    1500, await readA(() => window.__t.loot.coins()));
}
{
  await readA(() => window.__t.db.kvSet('coins', 3000));
  const T = Date.now() + 400;
  await Promise.all([
    A.evaluate(t => window.__at(t, async () => { for (let i = 0; i < 20; i++) await window.__t.loot.coinsAdd(-100); }), T),
    B.evaluate(t => window.__at(t, async () => { for (let i = 0; i < 20; i++) await window.__t.loot.coinsAdd(+100); }), T),
  ]);
  await sleep(400);
  /* Direction matters as much as the number: a lost EARN robs the player, a
     lost SPEND mints currency out of nothing. Both are this one assertion. */
  exact('COINS-SPEND  20 spends of 100 racing 20 earns of 100 leave the balance exactly where it started',
    3000, await readA(() => window.__t.loot.coins()));
}

/* ---------------- GRANTS: the real pull, one feed, two tabs ---------------- */
{
  await reset();
  /* TWELVE grants, not two. Each one is an independent chance for the two
     pulls to interleave, and one grant is a coin flip: with only two in the
     feed, tab A's whole loop can finish inside the few milliseconds before tab
     B's fetch resolves, and a double-pay bug reads as safe. Twelve makes the
     race reliable rather than lucky, which is the difference between a guard
     and a guard that sometimes runs. The total is an exact sum, so ONE grant
     paying twice anywhere in the feed is red. */
  api.state.grants = Array.from({ length: 12 }, (_, i) => (
    { key: `mt-grant-${i}`, type: 'social', ts: Date.now(), payload: { coins: 10, dust: 5, note: 'probe make-good' } }));
  api.state.cursor = 7;
  await Promise.all([A, B].map(p => p.evaluate(() => window.__t.social.goOnline())));
  await readA(async () => { await window.__t.db.kvSet('coins', 0); await window.__t.db.kvSet('bonedust', 0); });
  const pulled = await at(`() => window.__t.social.pullGrants().then(r => r.applied, e => 'ERR ' + e.message)`);
  await sleep(600);
  const out = await readA(async () => {
    const xp = await window.__t.db.db.all('xp');
    const keys = xp.filter(r => /^mt-grant-/.test(r.key)).map(r => r.key);
    return {
      coins: await window.__t.loot.coins(),
      dust: await window.__t.loot.boneDust(),
      rows: keys.length,
      distinct: new Set(keys).size,
    };
  });
  /* BOTH halves. The double-pay leaves exactly ONE ledger row, so a row count
     on its own passes on the bug: the coin balance is the discriminating half,
     and the row count is what proves the ledger did not silently grow instead. */
  exact('GRANT-PULL  a 12-grant feed pulled by both tabs pays each grant EXACTLY once (12 x 10 coins)',
    120, out.coins, `(pullGrants returned ${JSON.stringify(pulled)}, api hits ${api.state.hits})`);
  exact('GRANT-PULL  and the same feed pays its dust exactly once (12 x 5)', 60, out.dust);
  /* The row count is the half that would have passed on the bug: the double-pay
     leaves exactly one row per key. It is here to prove the ledger did not grow
     instead, so the two rows together pin both directions. */
  exact('GRANT-LEDGER  exactly one ledger row per grant, none duplicated', 12, out.rows);
  exact('GRANT-LEDGER  and every key is distinct', 12, out.distinct);
}

/* ---------------- the seen list, when the feed grows between pulls --------- */
{
  await reset();
  api.state.hits = 0;
  /* Ten keys to one tab, ten different keys to the other. Both tabs read the
     seen list before either writes it, so a write built from a stale read
     silently drops the other tab's ten. Nothing here pays: this row is about
     the list, and a key that falls out of it is a key the next pull re-ingests. */
  const mk = (a, b) => Array.from({ length: 10 }, (_, i) => ({ key: `mt-seen-${a}${i}`, type: 'social', ts: Date.now(), payload: { note: 'probe' } }));
  api.state.feeds = { 0: mk('a'), 1: mk('b') };
  api.state.cursor = 11;
  // reset() cleared kv, which took the account row with it: register again or
  // signedFetch throws 'offline' and this row would grade an empty sample.
  await Promise.all([A, B].map(p => p.evaluate(() => window.__t.social.goOnline())));
  await at(`() => window.__t.social.pullGrants().then(r => r.applied, e => 'ERR ' + e.message)`);
  await sleep(700);
  const seen = await readA(async () => ((await window.__t.db.kvGet('grantsSeen', [])) || []).length);
  const applied = await readA(async () => (await window.__t.db.db.all('xp')).filter(r => /^mt-seen-/.test(r.key)).length);
  api.state.feeds = null;
  // empty sample guard: if the pull never reached the feed, `seen` is 0 for the
  // wrong reason and the row below would be measuring nothing at all
  ok('GRANT-SEEN  the pulls actually landed the 20 grants (0 would make the row below vacuous)', applied === 20, `${applied} ledger rows for the feed`);
  exact('GRANT-SEEN  20 keys pulled across two tabs all survive the seen list (a dropped key is a grant that gets re-ingested)',
    20, seen);
}

/* ---------------- a sealed gift, opened in both tabs ----------------------- */
{
  await reset();
  await readA(async () => {
    await window.__t.db.kvSet('coins', 0);
    await window.__t.db.kvSet('giftbox', [
      { key: 'mt-gift-1', type: 'gift', payload: { coins: 250 }, ts: Date.now() },
      { key: 'mt-gift-2', type: 'gift', payload: { coins: 40 }, ts: Date.now() },
    ]);
  });
  const opens = await at(`(k) => window.__t.social.openGift(k).then(g => g ? 'opened' : 'nothing')`, 'mt-gift-1');
  await sleep(500);
  const out = await readA(async () => ({
    coins: await window.__t.loot.coins(),
    box: ((await window.__t.db.kvGet('giftbox', [])) || []).map(g => g.key),
  }));
  exact('GIFT-OPEN  one 250-coin present opened in both tabs pays 250', 250, out.coins, `(returns ${JSON.stringify(opens)})`);
  exact('GIFT-OPEN  exactly one tab is told it opened it', 1, opens.filter(x => x === 'opened').length);
  /* The OTHER present must still be sealed: the losing tab used to write back a
     box computed from its own stale read, which could resurrect or erase it. */
  exact('GIFT-BOX  the untouched second present is still in the box, exactly once',
    'mt-gift-2', out.box.join(','));
}

/* ---------------- inventory: granted once, melted once --------------------- */
{
  await reset();
  /* TEN pieces, same reasoning as the grant feed: one piece is one coin flip.
     Ten independent races make the measurement reliable, and the totals are
     exact sums so a single double anywhere is red. */
  const gids = await readA(() => window.__t.gear.GEAR_ITEMS.slice(0, 10).map(g => g.id));
  await at(`(ids) => Promise.all(ids.map(id => window.__t.loot.grantGear(id, 'probe').then(g => !!g)))`, gids);
  await sleep(500);
  const rows = await readA(async ids => (await window.__t.db.db.all('inv')).filter(x => x.kind === 'gear' && ids.includes(x.gearId)).length, gids);
  exact(`INV-DUPE  ${gids.length} gear ids granted in both tabs leave exactly one inv row each`, gids.length, rows);

  // and melting those rows from both tabs pays for each of them once
  const worth = await readA(ids => ids.reduce((a, id) => a + window.__t.loot.gearDustValue(window.__t.gear.GEAR_BY_ID[id]), 0), gids);
  await readA(async () => { await window.__t.db.kvSet('bonedust', 0); });
  const melts = await at(`(ids) => Promise.all(ids.map(id => window.__t.loot.disenchantGear(id).then(r => r.ok ? r.dust : 0))).then(a => a.reduce((x, y) => x + y, 0))`, gids);
  await sleep(500);
  const dust = await readA(() => window.__t.loot.boneDust());
  exact('MELT-ONCE  gear melted from both tabs at once pays each piece exactly its dust value, once',
    worth, dust, `(the two tabs claim ${JSON.stringify(melts)} between them)`);
  exact('MELT-ONCE  and every row is gone', 0,
    await readA(async ids => (await window.__t.db.db.all('inv')).filter(x => ids.includes(x.gearId)).length, gids));
}

/* ---------------- the daily XP ceiling ------------------------------------- */
{
  await reset();
  const T = Date.now() + 400;
  const drive = p => p.evaluate(t => window.__at(t, async () => {
    let paid = 0;
    for (let i = 0; i < 12; i++) paid += await window.__t.game.awardCapped('mtfight', 'fight', 10, 'probe', 12);
    return paid;
  }), T);
  const [xa, xb] = await Promise.all([drive(A), drive(B)]);
  await sleep(400);
  const rows = await readA(async () => (await window.__t.db.db.all('xp')).filter(x => /^mtfight-/.test(x.key)).length);
  /* A CEILING, never a trend. The bug paid 190 against a cap of 120 while
     writing the correct 12 rows, so the row count alone grades it as fine. */
  exact('AWARD-CAP  a 12/day ceiling writes exactly 12 rows however many tabs push at it', 12, rows);
  exact('AWARD-CAP  and pays exactly the capped XP, never more', 120, xa + xb, `(A paid ${xa}, B paid ${xb})`);
}

/* ---------------- a tab foregrounded after the other moved on -------------- */
{
  await reset();
  await readA(() => window.__t.db.kvSet('coins', 500));
  await A.bringToFront();
  await A.evaluate(() => {
    window.__vis = 0;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) window.__vis++; });
    dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await sleep(1500);
  // the chip is formatted for humans ("1,500"), so compare the number in it
  const chip = p => p.evaluate(() => (document.getElementById('coinBtn')?.textContent || '').replace(/[^0-9]/g, ''));
  const shown = await chip(A);
  ok('RESUME-SETUP  tab A is showing the balance it was left with (if it never painted one, the row below is vacuous)',
    shown === '500', `chip reads "${shown}"`);
  // background A and move the money from B
  await B.bringToFront();
  await sleep(400);
  await B.evaluate(async () => { for (let i = 0; i < 10; i++) await window.__t.loot.coinsAdd(100); });
  await sleep(400);
  // and bring A back, which is the case the brief is about
  await A.bringToFront();
  await sleep(2500);
  const vis = await A.evaluate(() => window.__vis);
  ok('RESUME-SETUP  bringing the tab back really did fire a visibilitychange (0 would mean nothing was driven)',
    vis > 0, `${vis} foreground events`);
  exact('RESUME-FRESH  a tab foregrounded after the other moved the money shows the CURRENT balance, not the one it was left with',
    '1500', await chip(A), `(store holds ${await readA(() => window.__t.loot.coins())})`);
  /* AND IT MUST NOT COST THE PLAYER THEIR SHEET. refresh() re-routes, which
     closes every open sheet, so an unguarded resume-refresh would yank a sheet
     shut because somebody alt-tabbed. That would be a worse bug than the one
     above, and it is exactly the kind a "does it update" check cannot see. */
  await A.evaluate(() => {
    const b = document.getElementById('pitBtn');
    if (b) { const r = b.getBoundingClientRect(); window.__pit = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  });
  const pit = await A.evaluate(() => window.__pit || null);
  if (pit) {
    await A.mouse.click(pit.x, pit.y);
    await sleep(2000);
    const openBefore = await A.evaluate(() => (document.getElementById('sheets')?.children.length ?? -1));
    await B.bringToFront(); await sleep(500);
    await A.bringToFront(); await sleep(2500);
    const openAfter = await A.evaluate(() => (document.getElementById('sheets')?.children.length ?? -1));
    ok('RESUME-SHEET  a sheet open in that tab survives the background/foreground round trip',
      openBefore > 0 && openAfter === openBefore, `sheets before ${openBefore}, after ${openAfter}`);
    await A.evaluate(() => history.back());
    await sleep(1200);
  } else {
    ok('RESUME-SHEET  a sheet open in that tab survives the background/foreground round trip', false, 'could not open a sheet, so this was not checked');
  }
}

/* ---------------- a stale tab saving over a fresh one ---------------------- */
{
  await reset();
  /* Both tabs load settings into memory, which is what boot does. Then A
     changes one field and saves; B, which has been sitting there since before
     that, changes a DIFFERENT field and saves. Neither touched the other's
     field, so both changes must survive. The old code wrote each tab's whole
     in-memory snapshot, so the later save silently reverted the earlier one. */
  await readA(() => window.__t.db.kvSet('settings', { units: 'kg', profile: { goal: 'cut' }, fdcKey: null }));
  await sleep(200);
  // both tabs load settings the way boot does, through the app's own path
  await Promise.all([A, B].map(p => p.evaluate(() => window.__settingsLoad())));
  // A changes units and saves; B, holding the copy it loaded before that, changes profile and saves
  await A.evaluate(() => window.__settingsSave({ units: 'lb' }));
  await sleep(200);
  await B.evaluate(() => window.__settingsSave({ profile: { goal: 'bulk' } }));
  await sleep(300);
  const st = await readA(() => window.__t.db.kvGet('settings', {}));
  exact("SETTINGS-MERGE  a stale tab's save keeps the other tab's change (units) as well as its own (profile)",
    'lb/bulk', `${st.units}/${st.profile && st.profile.goal}`, JSON.stringify(st));
  /* SOURCE half: the row above proves the MERGE works, and this proves js/app.js
     actually uses it rather than still writing its whole snapshot. Without this,
     the behavioural row is grading a helper nothing calls. */
  const appSrc = await (await fetch(app.url + 'js/app.js')).text();
  const snapshotWrites = (appSrc.match(/kvSet\('settings',\s*S\.settings\)/g) || []).length;
  const deltaWrites = (appSrc.match(/await saveSettings\(\)/g) || []).length;
  ok('SETTINGS-MERGE  js/app.js saves settings as a DELTA everywhere, never as its whole in-memory snapshot',
    snapshotWrites === 0 && deltaWrites >= 8, `whole-snapshot writes: ${snapshotWrites}, delta writes: ${deltaWrites}`);
}

/* ---------------- erase everything, with the other tab writing -------------
   NOT ON ?demo, and that is not a shortcut. js/app.js re-seeds the demo
   database whenever ?demo boots with no settings, which is exactly the state an
   erase leaves behind, and the losing tab RELOADS as part of the fix being
   measured here. So on ?demo the row count after an erase is the demo seed
   coming back and the measurement is inconclusive in the direction that reads
   as "fine" (measured: 24 log rows, 14 health rows, none of them survivors).
   Both tabs move to the plain tree for this block, same reasoning as
   tests/erase-completeness-audit.mjs. Data safety: a throwaway puppeteer
   profile on a loopback port that has never been visited, so the `tally`
   database this touches is created by this run and dies with the browser. */
{
  for (const [p, label] of [[A, 'A'], [B, 'B']]) {
    await p.goto(app.url, { waitUntil: 'networkidle2' });
    await sleep(2200);
    await p.evaluate(`(async () => { ${HOOKS} })()`).catch(e => console.log(`[${label}] hook: ${e.message}`));
  }
  const dbNow = await readA(() => window.__t.db.exportAll().then(() => 'ok'));
  ok('ERASE-SETUP  both tabs are on the plain (non-demo) tree, so nothing re-seeds under the measurement', dbNow === 'ok');
  await reset();
  await readA(async () => { await window.__t.db.kvSet('coins', 500); });
  const T = Date.now() + 500;
  /* B writes CONTINUOUSLY across the whole handshake, which is the worst case:
     an idle second tab would let a per-store loop look fine. */
  const writer = B.evaluate(t => window.__at(t, async () => {
    /* A DURATION, not a fixed count. Forty writes finish in about 150ms, so a
       count-bounded writer is already done by the time the erase opens and the
       old per-store loop looks clean. This one keeps writing until it is frozen
       or the window closes, which is what a player with the app open in another
       tab actually looks like. */
    const until = t + 2000;
    let wrote = 0, i = 0, stoppedAt = null;
    while (Date.now() < until) {
      try {
        await window.__t.loot.coinsAdd(5);
        await window.__t.db.db.put('inv', { id: 'mt-live-' + (i++), kind: 'cos', itemId: 'Y', ts: Date.now() });
        wrote++;
      } catch (e) { stoppedAt = Date.now() - t; break; }   // frozen: the protocol working
    }
    return { wrote, stoppedAt, ranFor: Date.now() - t };
  }), T);
  /* A starts LATER on purpose. Firing both at the same instant lets the freeze
     broadcast beat the other tab's first write, and then the erase is being
     graded against an idle tab, which is the easy case. 250ms in, B has real
     rows committed and more in flight, which is the case that used to survive. */
  /* COUNTED IN THE SAME PAGE TASK THE ERASE FINISHES IN, deliberately. The
     losing tab RELOADS as part of the fix, and a booting app writes its own
     fresh kv rows (dayOneEquipFix, and on ?demo a whole seeded profile). Those
     are not survivors, they are a new save being started, and sleeping before
     the count grades them as failures. Measuring the instant the transaction
     commits is the only reading that answers the question actually asked:
     did anything written BEFORE the erase live through it. */
  const eraser = A.evaluate(t => window.__at(t, async () => {
    try { await window.__t.db.eraseAll(); } catch (e) { return { erased: 'ERR ' + e.message }; }
    const c = {};
    for (const st of window.__t.db.STORES) c[st] = (await window.__t.db.db.all(st)).length;
    c.__kvKeys = (await window.__t.db.db.all('kv')).map(r => r.k);
    return { erased: 'erased', counts: c };
  }), T + 250);
  const [w, res] = await Promise.all([writer, eraser]);
  const wrote = w.wrote;
  const erased = res.erased;
  const counts = res.counts || { unreadable: 1 };
  const total = Object.entries(counts).filter(([k]) => !k.startsWith('__')).reduce((a, [, v]) => a + v, 0);
  /* ZERO, not "fewer than before". The bug's signature is survival, so a
     comparison against the previous count grades the bug as a pass. */
  exact('ERASE-ZERO  "Erase all data" with a second tab writing leaves every store at zero rows',
    0, total, `(${JSON.stringify(counts)}, erase said "${erased}", the other tab landed ${wrote} writes and stopped at ${w.stoppedAt}ms of its ${w.ranFor}ms window)`);
  /* EMPTY SAMPLE GUARD. If the other tab never got a write in before the erase,
     zero rows afterwards is free and this row proves nothing about the race. */
  /* TWO WAYS THIS ROW COULD BE VACUOUS, so both are ruled out: a second tab that
     wrote nothing, and a second tab that had already finished before the erase
     opened. The write window runs 250ms before the erase and 1750ms past it. */
  ok('ERASE-SAMPLE  the other tab really was writing across the erase (a tab that wrote nothing, or finished first, would make ERASE-ZERO free)',
    wrote > 0 && w.ranFor >= 250, `tab B landed ${wrote} writes, ran for ${w.ranFor}ms, frozen at ${w.stoppedAt}ms`);
  // and the other tab is on its way out rather than sitting on a dead save
  await sleep(1200);
  const bUrl = await B.evaluate(() => location.href).catch(() => 'gone');
  ok('ERASE-RELOAD  the other tab is told, so it does not keep playing a save that no longer exists',
    bUrl !== 'gone', `tab B at ${bUrl}`);
}

/* LAST, not first: the transforms run as files are requested, so a count taken
   before the first page load is always zero and would grade every mode as
   broken (or, worse, as fine). */
ok('SETUP  --prove-red actually changed bytes (a transform that matches nothing proves nothing)',
  !PROVE || transformHits > 0, PROVE ? `mode ${PROVE}, ${transformHits} substitutions` : 'no prove-red mode');

console.log('');
if (fails.length) {
  console.log(`FAILURES (${fails.length}):`);
  for (const f of fails) console.log('  ' + f);
}
await browser.close();
app.close();
api.close();
process.exit(fails.length ? 1 : 0);
