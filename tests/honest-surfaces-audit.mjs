/* FOUR SURFACES THAT WERE LYING OR SILENT. MEASURED OFF THE RENDER, NEVER PARSED.
 *
 * Every row here compares TWO RENDERED STATES and requires both sample sets to
 * be non-empty, because this repo has shipped guards that only checked markup
 * existed (the bond meter). "There is a streak pill" and "the streak pill says
 * the right number" are different claims, and only the second one is a check.
 *
 * What it covers, and what a FAILING result looks like for each:
 *
 *  1. STREAK      The Progress pill counted inside the 56-day heatmap window, so
 *                 every streak of 56 or more rendered as exactly "56 day streak"
 *                 forever. Seeds 400 consecutive logged days and 9, renders the
 *                 pill for both, and requires the two to DIFFER and the long one
 *                 to read 400. Red on the pre-fix tree: both windows saturate,
 *                 the long one reads 56.
 *
 *  2. WALLET      The shop toast printed the balance raw ("1234477 left") against
 *                 the app's own toLocaleString convention. Buys the same item at
 *                 a seven-digit and at a three-digit wallet and reads the real
 *                 toast both times. Red pre-fix: the seven-digit string has no
 *                 group separator in it.
 *
 *  3. DAY GUARD   The Claim button's refusal keyed only on 'unwitnessed', so
 *                 'backwards' and 'too-fast' shared one line that named no cause.
 *                 Forces all three rules through kv, fires the REAL Claim button
 *                 and reads the toast. Red pre-fix: two of the three toasts are
 *                 byte-identical.
 *
 *  4. CLOUD       pushBackup ended in a blanket `return false`, so a 413
 *                 ('too-large', the save has outgrown its D1 row) and a 401
 *                 ('stale timestamp', the device clock is out and every signed
 *                 call is dark) both landed as silence: no toast, and a Settings
 *                 row that went on quoting an age that never moved. Stubs the
 *                 three answers, boots the app for real, and reads BOTH the boot
 *                 toast and the Settings row. Red pre-fix: nothing is said and
 *                 all three Settings rows are identical.
 *
 * PHASE 4 IS NOT A ?demo PAGE, for the same reason cloud-restore-silent-audit is
 * not: app.js sets NOSOCIAL = S.demo || navigator.webdriver === true, so under a
 * normal godmode boot autoSync is NEVER CALLED and a check of it would be
 * vacuous. It boots without ?demo, spoofs navigator.webdriver to false, and
 * emulates reduced motion so the splash does not paint over the toast being
 * measured. Data safety: a throwaway puppeteer profile on a random loopback port
 * that has never been visited, plus an assertion that the `tally` database it
 * touches was created by this run.
 *
 * PROVE-RED: cp -R this tree, restore js/app.js, js/db.js and js/social.js from
 * origin/main inside the COPY (never `git checkout` a working tree), and run this
 * file there.
 *
 * Usage: node tests/honest-surfaces-audit.mjs
 */
import { boot, seed, serveTree, sleep, dismissOverlays } from './godmode.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const srv = await serveTree(process.cwd());
const HEADLESS = process.env.HEADLESS_MODE || 'shell';
const { browser, page } = await boot(srv.url, { headless: HEADLESS });

/* ---- shared readers ---- */
/* VISIBILITY, not presence: the effective opacity product up the whole ancestor
   chain plus a hit test at the toast's own centre, which is what catches a
   message painted UNDER a splash. Lifted from cloud-restore-silent-audit. */
const toastLook = p => p.evaluate(() => {
  const t = document.getElementById('toast');
  if (!t) return { exists: false, text: '' };
  const r = t.getBoundingClientRect();
  let o = 1, n = t;
  while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
  const cs = getComputedStyle(t);
  /* ASK WHETHER ANYTHING IS PAINTED OVER THE TOAST, NOT WHETHER THE TOAST TAKES
     TAPS. This read `document.elementFromPoint(centre) === t` until 2026-09-01,
     and the accessibility pass then gave .toast `pointer-events: none` on
     purpose, because for the 2.2 to 3.6s a message is up it was eating the taps
     meant for the Bonehead, Stable and Kitchen doors underneath it. A
     tap-transparent element is never the answer elementFromPoint gives, so this
     read false on every toast the app has ever shown and graded four correct
     surfaces as silent. It asks the same question by making the toast
     hit-testable for the length of one synchronous probe and putting the
     property straight back: a splash painted over it still answers the splash. */
  const pe = t.style.pointerEvents;
  t.style.pointerEvents = 'auto';
  const hit = r.width && r.height ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
  t.style.pointerEvents = pe;
  return {
    exists: true, hidden: t.hidden, text: (t.textContent || '').trim(), eff: +o.toFixed(3),
    w: Math.round(r.width), h: Math.round(r.height), vis: cs.visibility, disp: cs.display,
    onTop: !!hit && (hit === t || t.contains(hit)),
  };
});
const seenBy = s => s.exists && !s.hidden && !!s.text && s.eff > 0.9 && s.w > 0 && s.h > 0
  && s.vis === 'visible' && s.disp !== 'none' && s.onTop;

/* Blank the toast so the NEXT reading cannot be the PREVIOUS scenario's message
   still sitting there. Measured while writing this: with a 4.2s toast and a 1s
   wait, all three day-guard readings came back one scenario stale, which would
   have graded the fix by reading the wrong line three times. */
const clearToast = p => p.evaluate(() => {
  const t = document.getElementById('toast');
  if (t) { t.textContent = ''; t.hidden = true; }
});
/* Watch a window rather than sampling once: these fire on timers after a boot
   that itself takes seconds, and "nothing appeared" is only honest if nothing
   appeared at any point. */
async function watchToast(p, ms = 11000, step = 200) {
  let best = null, sightings = 0;
  for (let t = 0; t < ms; t += step) {
    const s = await toastLook(p);
    if (seenBy(s)) { sightings++; if (!best || s.text.length > best.text.length) best = s; }
    await sleep(step);
  }
  return { best, sightings };
}

const demoKvPut = put => page.evaluate(async rows => {
  const db = await new Promise(r => { const q = indexedDB.open('tally-demo'); q.onsuccess = () => r(q.result); });
  await new Promise(res => {
    const tx = db.transaction('kv', 'readwrite');
    for (const [k, v] of rows) tx.objectStore('kv').put({ k, v });
    tx.oncomplete = res;
  });
  db.close();
}, put);

const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (k, n) => { const [y, m, d] = k.split('-').map(Number); return dkey(new Date(y, m - 1, d + n)); };

/* =================== 1. THE STREAK PILL =================== */
/* Two seeds, two renders. The short one is the control: if the pill were simply
   broken the long row could pass for the wrong reason, so the short one must
   read its own true number too. */
/* Both stores are CLEARED first, so the seed alone decides the streak. The demo
   profile ships health rows of its own, and leaving them in made a "9 logged
   days" control render 14: a control whose true answer nobody knows is not a
   control. `walk` seeds days that are walked but never logged, immediately
   behind the logged run, because a day over 3000 steps has always counted here
   and this pill must keep counting it. */
const seedStreak = (days, walk = 0) => page.evaluate(async o => {
  const db = await new Promise(r => { const q = indexedDB.open('tally-demo'); q.onsuccess = () => r(q.result); });
  const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const back = n => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };
  await new Promise(res => {
    const tx = db.transaction(['log', 'health'], 'readwrite');
    tx.objectStore('log').clear();
    tx.objectStore('health').clear();
    for (let i = 0; i < o.days; i++) {
      tx.objectStore('log').put({ id: 'hs-' + i, date: back(i), name: 'audit', kcal: 500, p: 30, c: 10, f: 5, qty: 1, unit: 'serving', meal: 'lunch', ts: Date.now() });
    }
    for (let i = o.days; i < o.days + o.walk; i++) tx.objectStore('health').put({ date: back(i), steps: 5000 });
    tx.oncomplete = res;
  });
  db.close();
}, { days, walk });

const streakPill = async () => {
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(600);
  await page.evaluate(() => { location.hash = '#/trends'; });
  await sleep(2400);
  return page.evaluate(() => {
    const p = [...document.querySelectorAll('.recap-pill')].find(x => /day streak/i.test(x.textContent || ''));
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { text: (p.textContent || '').replace(/\s+/g, ' ').trim(), v: (p.querySelector('.rp-v') || {}).textContent, w: Math.round(r.width), h: Math.round(r.height) };
  });
};

await seed(page, { coins: 1234567, reload: false });
await seedStreak(400);
await page.reload({ waitUntil: 'networkidle2' }); await sleep(2600); await dismissOverlays(page);
const pillLong = await streakPill();

await seedStreak(9, 3);       // 9 logged + 3 walked-but-unlogged behind them = 12
await page.reload({ waitUntil: 'networkidle2' }); await sleep(2600); await dismissOverlays(page);
const pillShort = await streakPill();

ok('STREAK SAMPLE both renders produced a visible streak pill (an empty sample set is a failure, never a pass)',
  !!pillLong && !!pillShort && pillLong.w > 0 && pillLong.h > 0 && pillShort.w > 0 && pillShort.h > 0,
  `long=${JSON.stringify(pillLong)} short=${JSON.stringify(pillShort)}`);
ok('STREAK the two states RENDER DIFFERENT numbers (a pill that saturates reads the same for both)',
  !!pillLong && !!pillShort && pillLong.text !== pillShort.text,
  `long "${pillLong && pillLong.text}" vs short "${pillShort && pillShort.text}"`);
ok('STREAK 400 consecutive logged days renders 400, not the 56-day heatmap window',
  !!pillLong && String(pillLong.v).replace(/\D/g, '') === '400',
  `rendered "${pillLong && pillLong.text}"`);
ok('STREAK CONTROL 9 logged + 3 walked days renders 12 (the pill is not broken, and a walked day still counts)',
  !!pillShort && String(pillShort.v).replace(/\D/g, '') === '12',
  `rendered "${pillShort && pillShort.text}"`);

/* =================== 2. THE WALLET TOAST =================== */
/* The SAME purchase at two balances. A grouped seven-digit number is the claim;
   the three-digit control proves the toast is being read at all and that a small
   balance is not mangled by the formatting. */
async function buyAndReadToast(coins) {
  await demoKvPut([['coins', coins]]);
  await page.reload({ waitUntil: 'networkidle2' }); await sleep(2400); await dismissOverlays(page);
  await page.evaluate(() => { location.hash = '#/shop'; }); await sleep(2200);
  await clearToast(page);
  // armToConfirm: the first tap arms the cell, the second commits it
  const item = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-buy]')].find(x => !x.disabled); if (!b) return null; b.click(); return b.dataset.buy; });
  await sleep(500);
  await page.evaluate(id => { const b = document.querySelector(`[data-buy="${id}"]`); b && b.click(); }, item);
  const t = await watchToast(page, 3000);
  return { item, ...t };
}
const walletBig = await buyAndReadToast(1234567);
const walletSmall = await buyAndReadToast(500);

ok('WALLET SAMPLE both purchases produced a visible toast (zero toasts means this measured nothing)',
  !!walletBig.best && !!walletSmall.best,
  `big=${walletBig.best ? `"${walletBig.best.text}"` : 'none'} small=${walletSmall.best ? `"${walletSmall.best.text}"` : 'none'}`);
ok('WALLET a seven-digit balance renders GROUPED, matching the app\'s toLocaleString convention',
  !!walletBig.best && /1,234,\d{3}/.test(walletBig.best.text),
  walletBig.best ? `"${walletBig.best.text}"` : 'no toast');
ok('WALLET the raw seven-digit run is gone from the rendered string',
  !!walletBig.best && !/\b\d{7}\b/.test(walletBig.best.text),
  walletBig.best ? `"${walletBig.best.text}"` : 'no toast');
ok('WALLET CONTROL a small balance still renders its own honest number',
  !!walletSmall.best && /\d/.test(walletSmall.best.text) && walletSmall.best.text !== (walletBig.best && walletBig.best.text),
  walletSmall.best ? `"${walletSmall.best.text}"` : 'no toast');

/* =================== 3. THE DAY GUARD'S THREE REFUSALS =================== */
/* claimDay (js/db.js) has three rules and each is a different situation. The
   button is FIRED for real; the toast is read off the screen. The kv below is
   reverse-engineered from claimDay itself, and each scenario asserts the reason
   the guard actually returned, so a seed that stops reaching its rule shows up
   as a mis-seeded row rather than as a silently weaker check. */
await seedStreak(400);
await page.reload({ waitUntil: 'networkidle2' }); await sleep(2600); await dismissOverlays(page);
const today = await page.evaluate(async () => (await import('/js/nutrition.js')).dateKey());
const ord = Math.floor(Date.parse(today + 'T00:00:00Z') / 86400000);

const guardScenarios = {
  // RULE 1: a mark strictly ahead of today, so today is not a new day
  backwards: [['dayHighWater', addD(today, 5)], ['dayPaceKey', today], ['dayPaceAt', Date.now()], ['dayWitnessOrd', ord]],
  // RULE 2: 100 days claimed since an anchor set 0 days ago
  'too-fast': [['dayHighWater', addD(today, -1)], ['dayPaceKey', addD(today, -100)], ['dayPaceAt', Date.now()], ['dayWitnessOrd', ord]],
  // RULE 3: the server was last seen 20 days ago, well past WITNESS_GRACE
  unwitnessed: [['dayHighWater', addD(today, -1)], ['dayPaceKey', today], ['dayPaceAt', Date.now()], ['dayWitnessOrd', ord - 20]],
};
const guardSeen = {};
for (const [want, put] of Object.entries(guardScenarios)) {
  await demoKvPut(put);
  await page.evaluate(() => { location.hash = '#/trends'; }); await sleep(400);
  await page.evaluate(() => { location.hash = '#/today'; }); await sleep(1800);
  const reason = await page.evaluate(async () => {
    const [db, nut] = await Promise.all([import('/js/db.js'), import('/js/nutrition.js')]);
    return db.claimDay(nut.dateKey());
  });
  await clearToast(page);
  const fired = await page.evaluate(() => { const b = document.querySelector('[data-claim]'); if (!b) return false; b.click(); return true; });
  const t = await watchToast(page, 3000);
  guardSeen[want] = { reason: reason && reason.reason, fired, text: t.best ? t.best.text : '' };
}
ok('DAYGUARD SAMPLE all three rules were actually reached and a real Claim button was fired each time',
  Object.entries(guardSeen).every(([want, s]) => s.reason === want && s.fired && s.text),
  JSON.stringify(guardSeen));
const guardTexts = Object.values(guardSeen).map(s => s.text);
ok('DAYGUARD each refusal renders its OWN line (three reasons, three distinct messages)',
  new Set(guardTexts).size === 3, JSON.stringify(guardSeen, null, 1));
/* Deliberately NOT /date/: the generic pre-fix line was "paused while the DATE
   settles", so a regex that loose passed on the very bug this row is for. */
ok('DAYGUARD the clock-backwards refusal NAMES the clock rather than saying only "paused"',
  /earlier day|gone back|behind/i.test(guardSeen.backwards.text), `"${guardSeen.backwards.text}"`);
ok('DAYGUARD the too-fast refusal NAMES the jump rather than saying only "paused"',
  /jump|ahead|further/i.test(guardSeen['too-fast'].text), `"${guardSeen['too-fast'].text}"`);
ok('DAYGUARD the lapsed-witness refusal still names the server check',
  /server/i.test(guardSeen.unwitnessed.text), `"${guardSeen.unwitnessed.text}"`);

await page.close();

/* =================== 4. A CLOUD BACKUP THAT FAILS =================== */
const API = srv.url.replace(/\/$/, '') + '/api';
const cloud = await browser.newPage();
await cloud.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
});
await cloud.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

let push = { status: 200, body: '{"ok":true,"updatedAt":1}' };
let healthTs = () => Date.now();          // a server whose clock agrees with ours
let pushHits = 0;
/* The GET is bootSync's RESTORE pull, and phase 5 grades what the boot toast
   says about it, so it needs a scenario of its own. 404 is the quiet default
   every push scenario above relies on. */
let pull = { status: 404, body: '{}' };
let pullHits = 0;
await cloud.setRequestInterception(true);
cloud.on('request', req => {
  const u = req.url();
  if (/\/api\/health(\?|$)/.test(u)) {
    req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ts: healthTs() }) }).catch(() => {});
    return;
  }
  if (/\/api\/backup(\?|$)/.test(u)) {
    /* Only the PUT carries the scenario. The GET is bootSync's restore pull and
       a 413 there would fire the cloud-restore toast instead, which would land
       in the very sample this phase is measuring. 404 is the quiet answer. */
    if (req.method() !== 'PUT') { pullHits++; req.respond({ status: pull.status, contentType: 'application/json', body: pull.body }).catch(() => {}); return; }
    pushHits++;
    req.respond({ status: push.status, contentType: 'application/json', body: push.body }).catch(() => {});
    return;
  }
  req.continue().catch(() => {});
});

/* ?calm IS THE APP'S OWN SWITCH, not a harness hack (js/app.js CALM_BOOT). The
   first version of this phase measured the toast as INVISIBLE for a real reason:
   the daily wheel auto-opens on a fresh install and the hit test at the toast's
   centre landed on `DIV.dw`. That is a first-run artifact of the harness, not
   what a mature player with a failing backup sees, so the boot is put in the
   no-interruptions state the app already knows how to be in. It suppresses
   forced boot SHEETS only; autoSync, pushBackup and the toast are untouched. */
const goCloud = () => cloud.goto(`${srv.url}?calm=1&api=${encodeURIComponent(API)}`, { waitUntil: 'networkidle2' })
  .catch(e => { if (!/net::ERR_ABORTED/.test(String(e))) throw e; });

await goCloud();
await sleep(2600);

/* SAFETY, and it is an assertion, not a comment: refuse to run against anything
   that already looks like a save. A fresh loopback origin has none of these. */
const pre = await cloud.evaluate(async () => {
  const db = await new Promise(r => { const q = indexedDB.open('tally'); q.onsuccess = () => r(q.result); });
  const counts = await Promise.all(['log', 'foods', 'weights', 'xp'].map(s =>
    new Promise(res => { const q = db.transaction(s, 'readonly').objectStore(s).count(); q.onsuccess = () => res(q.result); q.onerror = () => res(-1); })));
  db.close();
  return counts;
});
if (pre.some(n => n > 0)) throw new Error(`refusing to run: the tally database on ${srv.url} already holds rows (${pre}).`);

/* WALK ONBOARDING FOR REAL. boot() returns at `if (!S.settings)` on a fresh
   install and renders the onboarding gate instead, so without this the whole
   phase measures an empty screen: the first draft of this file reported "no
   Settings row" and "zero pushes" and was measuring NOTHING. Driven through the
   app's own controls (Meet your Bonehead -> That's me -> Skip for now) rather
   than by hand-seeding a kv `settings` object, so the state under test is one
   the app actually produces. It throws rather than degrading, because a phase
   that silently stops reaching the code is worse than a red row. */
for (let i = 0; i < 6; i++) {
  const step = await cloud.evaluate(() => {
    const skip = document.getElementById('onbSkip');
    if (skip) { skip.click(); return 'skipped'; }
    const next = [...document.querySelectorAll('#screen .btn')].pop();
    if (next) { next.click(); return 'next'; }
    return 'none';
  });
  if (step !== 'next') { if (step === 'none') throw new Error('onboarding: no control to advance'); break; }
  await sleep(1500);
}
await sleep(2600);
const settled = await cloud.evaluate(async () => !!(await (await import('/js/db.js')).kvGet('settings', null)));
if (!settled) throw new Error('onboarding did not complete: the cloud phase would measure an empty screen');

// an identity + an account, so signedFetch reaches the network instead of
// throwing 'offline' and turning every scenario below into the same generic row
await cloud.evaluate(async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const id = { privJwk: await crypto.subtle.exportKey('jwk', kp.privateKey), pubJwk: await crypto.subtle.exportKey('jwk', kp.publicKey), createdAt: Date.now() };
  const db = await new Promise(r => { const q = indexedDB.open('tally'); q.onsuccess = () => r(q.result); });
  await new Promise(res => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put({ k: 'identity', v: id });
    tx.objectStore('kv').put({ k: 'social', v: { playerId: 'hs-player', handle: 'Audit Bone', friendCode: 'BONE-0001', name: 'Audit' } });
    tx.oncomplete = res;
  });
  db.close();
});

const cloudKvPut = (put, del = []) => cloud.evaluate(async a => {
  const db = await new Promise(r => { const q = indexedDB.open('tally'); q.onsuccess = () => r(q.result); });
  await new Promise(res => {
    const tx = db.transaction('kv', 'readwrite');
    for (const [k, v] of a.put) tx.objectStore('kv').put({ k, v });
    for (const k of a.del) tx.objectStore('kv').delete(k);
    tx.oncomplete = res;
  });
  db.close();
}, { put, del });

// the Cloud backup row's own sub-label, read off the rendered Settings screen
const cloudRow = () => cloud.evaluate(() => {
  const row = [...document.querySelectorAll('.settings-row')].find(r => /cloud backup/i.test((r.querySelector('b') || {}).textContent || ''));
  if (!row) return null;
  const span = row.querySelector('.lab span');
  const r = row.getBoundingClientRect();
  return { text: (span ? span.textContent : '').replace(/\s+/g, ' ').trim(), w: Math.round(r.width), h: Math.round(r.height) };
});

async function cloudScenario(mode, ts) {
  push = mode; healthTs = ts;
  pushHits = 0;
  // clear the marks so each scenario is judged on its own push, not a leftover
  await cloudKvPut([], ['backupFail', 'cloudNudgeAt', 'backupAt', 'clockSkewMs', 'socialSyncAt']);
  await goCloud();
  const t = await watchToast(cloud);
  await cloud.evaluate(() => { location.hash = '#/settings'; });
  await sleep(2600);
  return { hits: pushHits, toast: t.best ? t.best.text : '', row: await cloudRow() };
}

/* One warm-up boot before the measured ones, so the fresh-install one-shots
   (the welcome kit, the starter ingredients) fire against nothing instead of
   landing in the first scenario's sample. */
await goCloud(); await sleep(9000);

const healthy = await cloudScenario({ status: 200, body: '{"ok":true,"updatedAt":1}' }, () => Date.now());
const tooBig = await cloudScenario({ status: 413, body: '{"error":"backup too large for the database","code":"too-large","bytes":2300000}' }, () => Date.now());
// the device clock is three days ahead: the server's own instant is three days behind ours
const skewed = await cloudScenario({ status: 401, body: '{"error":"stale timestamp"}' }, () => Date.now() - 3 * 86400e3);

ok('CLOUD SAMPLE all three scenarios actually pushed (zero intercepted PUTs means this measured NOTHING)',
  healthy.hits > 0 && tooBig.hits > 0 && skewed.hits > 0,
  `healthy=${healthy.hits} too-large=${tooBig.hits} clock=${skewed.hits}`);
ok('CLOUD SAMPLE the Settings row rendered and is visible in all three states',
  [healthy, tooBig, skewed].every(s => s.row && s.row.w > 0 && s.row.h > 0 && s.row.text),
  JSON.stringify([healthy.row, tooBig.row, skewed.row]));

/* Scoped to the CLASS under test rather than to "any toast at all": this page is
   a fresh install and the app legitimately has its own first-run things to say.
   The claim is that a working backup produces no BACKUP message, which is what
   would go wrong if the notice fired on the healthy path. */
ok('CLOUD HEALTHY a good push says nothing about the backup',
  !/backup|blocked|clock/i.test(healthy.toast || ''),
  healthy.toast ? `toasted "${healthy.toast}"` : 'silent');
ok('CLOUD HEALTHY the Settings row reports an ON, working backup',
  !!healthy.row && /^on\b/i.test(healthy.row.text) && !/fail|blocked/i.test(healthy.row.text),
  `"${healthy.row && healthy.row.text}"`);

ok('CLOUD TOO-LARGE the failure SPEAKS (a 413 used to be a silent `return false`)',
  !!tooBig.toast, tooBig.toast ? `"${tooBig.toast}"` : 'no visible toast in 11s');
ok('CLOUD TOO-LARGE the words name the SIZE, because the player cannot fix it by waiting',
  /outgrown|too (big|large)|size|slot/i.test(tooBig.toast), `"${tooBig.toast}"`);
/* DIFFERING is not enough on its own: pre-fix these two rows also differed, for
   the wrong reason (a failed push never moved `backupAt`, so the row fell back
   to "backing up automatically" while the healthy one quoted an age). It has to
   NAME the failure. */
ok('CLOUD TOO-LARGE the Settings row DIFFERS from the healthy one and names the failure',
  !!tooBig.row && !!healthy.row && tooBig.row.text !== healthy.row.text
    && /outgrown|too (big|large)|size|slot/i.test(tooBig.row.text),
  `"${tooBig.row && tooBig.row.text}"`);

ok('CLOUD CLOCK a device whose clock is out is TOLD (every signed call 401s and the app used to say nothing)',
  !!skewed.toast, skewed.toast ? `"${skewed.toast}"` : 'no visible toast in 11s');
ok('CLOUD CLOCK the words name the CLOCK and the measured gap',
  /clock/i.test(skewed.toast) && /3 days/.test(skewed.toast), `"${skewed.toast}"`);
ok('CLOUD CLOCK the Settings row DIFFERS from both the healthy and the too-large one and names the clock',
  !!skewed.row && !!healthy.row && !!tooBig.row
    && skewed.row.text !== healthy.row.text && skewed.row.text !== tooBig.row.text
    && /clock/i.test(skewed.row.text),
  `"${skewed.row && skewed.row.text}"`);
ok('CLOUD HONEST no message claims the player has lost data',
  ![tooBig.toast, skewed.toast, tooBig.row && tooBig.row.text, skewed.row && skewed.row.text]
    .some(s => /lost your|data (was )?lost|deleted|gone/i.test(s || '')),
  'checked both toasts and both rows');

/* ========== 5. THE BOOT TOAST STAYS QUIET WHEN NOTHING FAILED ==========
 *
 * bootSync returns a REASON, and three of them are not failures at all:
 * 'new-player' (a first launch, before an identity is ever minted),
 * 'opted-out' (the player turned cloud backup off) and 'no-api' (no backend
 * configured). Each of those greeted somebody with "could not reach your cloud
 * backup" for a backup that could not exist or that they had declined. They are
 * collected in js/app.js as CLOUD_QUIET_REASONS.
 *
 * WHY THE THIRD ROW IS NOT OPTIONAL. "No toast appeared" is satisfied just as
 * well by a toast that is broken, by a boot that never happened and by an app
 * that says nothing ever, so two silent rows on their own prove only that the
 * app CAN be quiet. The http- row is the control: the same page, the same
 * watcher, one boot where the restore really did fail, and it must speak.
 *
 * REACHED, NOT ASSUMED. Both quiet reasons return BEFORE pullBackup, so a
 * scenario that hit its branch makes ZERO /backup GETs and the failing one makes
 * at least one. That number is asserted, so a seed that stops reaching its rule
 * shows up as a mis-seeded row rather than as a silently weaker check, the same
 * shape as the day guard above. */
async function bootReason({ pullAnswer = { status: 404, body: '{}' }, put = [], del = [] }) {
  /* PUT THE PUSH SIDE BACK TO HEALTHY FIRST. Phase 4 leaves the fake server's
     clock three days behind and its PUT answering 401, and pushBackup's own
     "this device's clock is 3 days ahead" toast then fires on these boots and
     wins the watcher, which reads the longest sighting. Measured: the control
     row came back holding the CLOCK message instead of the restore one, so it
     would have graded the wrong toast on every row in this phase. The only
     thing allowed to speak here is the restore. */
  push = { status: 200, body: '{"ok":true,"updatedAt":1}' };
  healthTs = () => Date.now();
  pull = pullAnswer;
  pullHits = 0;
  /* bootRestored would short-circuit to 'already' and grade nothing; the rest
     are the same marks every scenario above clears. */
  await cloudKvPut(put, ['bootRestored', 'backupFail', 'cloudNudgeAt', 'backupAt', 'clockSkewMs', 'socialSyncAt', ...del]);
  await goCloud();
  const t = await watchToast(cloud);
  const booted = await cloud.evaluate(() => (document.getElementById('screen') || {}).childElementCount || 0);
  return { toast: t.best ? t.best.text : '', pulls: pullHits, booted };
}

/* ORDER MATTERS, so it is deliberate rather than incidental: the control runs
   FIRST, while the account seeded further up is still intact, and the new-player
   scenario runs LAST because reaching that branch means destroying that account.
   Seeding it back would mean re-minting a key here and grading a state this file
   built rather than one the app produced. */
// a restore that genuinely failed: a real account and a server that 500s
const httpFail = await bootReason({ pullAnswer: { status: 500, body: '{"error":"boom"}' }, del: ['cloudOff'] });
// the player turned cloud backup off: bootSync returns before it asks the server
const optedOut = await bootReason({ put: [['cloudOff', true]] });
// a first launch: no identity anywhere, the state bootSync refuses to mint one in
const newPlayer = await bootReason({ del: ['cloudOff', 'identity', 'social'] });

ok('QUIET SAMPLE all three boots ran and each reached its own branch (a boot that never happened is silent too)',
  [optedOut, newPlayer, httpFail].every(s => s.booted > 0)
    && optedOut.pulls === 0 && newPlayer.pulls === 0 && httpFail.pulls > 0,
  JSON.stringify({ optedOut, newPlayer, httpFail }));
ok('QUIET a brand-new install is not told its nonexistent backup could not be reached',
  !/backup|could not reach/i.test(newPlayer.toast || ''),
  newPlayer.toast ? `said "${newPlayer.toast}"` : 'silent');
ok('QUIET a player who turned cloud backup OFF is not told we could not reach it',
  !/backup|could not reach/i.test(optedOut.toast || ''),
  optedOut.toast ? `said "${optedOut.toast}"` : 'silent');
ok('QUIET CONTROL a restore that really failed still SPEAKS (two silent rows alone would pass on a broken toast)',
  /could not reach your cloud backup/i.test(httpFail.toast || ''),
  httpFail.toast ? `"${httpFail.toast}"` : 'no visible toast in 11s');

/* COVERAGE, off the SHIPPED list rather than a copy of it. The rows above drive
   two of the six quiet reasons by hand, so a seventh added to js/app.js with no
   row here would be guarded by nothing and nobody would know. Reading the array
   the app actually ships means this goes red when the list grows instead. */
const shippedQuiet = await cloud.evaluate(async u => {
  const src = await (await fetch(u)).text();
  const m = src.match(/const CLOUD_QUIET_REASONS = \[([^\]]*)\]/);
  return m ? m[1].split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : null;
}, srv.url.replace(/\/$/, '') + '/js/app.js');
/* THE QUIET REASONS, SPLIT BY WHO GRADES THEM. Both halves are read back
   against the shipped CLOUD_QUIET_REASONS list below rather than restated, so
   this pin cannot drift from the app: it names only WHICH of the shipped
   reasons this file is responsible for driving.
   Provenance: PR #342, 2026-08-31, closing round 7's R7-P3. bootSync returns
   'new-player' before it will mint an identity, 'opted-out' when the player
   turned cloud backup off, and 'no-api' when no backend is configured; none of
   the three is a failure, and all three used to render "could not reach your
   cloud backup" to somebody who has no cloud backup. */
const DRIVEN_QUIET = ['new-player', 'opted-out'];
/* Provenance: PR #339, 2026-08-31. These three are the ORIGINAL quiet reasons,
   shipped long before the trio above and graded in cloud-restore-silent-audit,
   which owns the pull path. They are listed here only so the completeness check
   against the shipped list can account for every reason it finds; this file
   drives DRIVEN_QUIET and defers these. */
const PULL_QUIET = ['none', 'empty', 'already'];
ok('QUIET COVERAGE every reason js/app.js keeps quiet is driven by a row somewhere (a new one fails this until it is)',
  !!shippedQuiet && shippedQuiet.length > 0
    && shippedQuiet.every(r => DRIVEN_QUIET.includes(r) || PULL_QUIET.includes(r) || r === 'no-api'),
  `shipped ${JSON.stringify(shippedQuiet)}; driven here ${JSON.stringify(DRIVEN_QUIET)}, ` +
  `in cloud-restore-silent ${JSON.stringify(PULL_QUIET)}, no-api is un-drivable here (this page HAS an api)`);

await browser.close(); srv.close?.();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nfive surfaces measured off the render: streak, wallet, day guard, cloud backup, boot quiet');
process.exit(fails.length ? 1 : 0);
