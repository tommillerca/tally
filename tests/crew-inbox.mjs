/* The Crew inbox: a gift you never saw must still be findable, and the tab must
 * say so before you go looking.
 *
 * THE BUG (Tom, 2026-08-06): "if you miss the pop up from a gift then you don't
 * know your friend sent it or how many friends sent one."
 *
 * pullGrants marks a grant consumed BEFORE presentGrantDelivery shows it, so a
 * stomped toast lost the gift from the UI forever. The sender's name was in the
 * xp ledger the whole time (applyGrant writes the server note as the label);
 * nothing read it back.
 *
 * PROVE-RED (confirmed 2026-08-08): delete the paintDeliveries() call from
 * paint(), and INBOX fails with 0 rows. Point setCrewBadgeFrom back at the
 * incoming count only, and BADGE fails with 0.
 *
 * Runs offline: the Crew tab needs an account, so this seeds the LEDGER (which
 * is what the inbox reads) rather than talking to the real server, and asserts
 * on the reader. An empty sample set is a FAILURE.
 *
 * Usage: node tests/crew-inbox.mjs
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srv = null;
let base = process.env.URL;
if (!base) {
  srv = spawn('python3', ['-m', 'http.server', '8146', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(900);
  base = 'http://127.0.0.1:8146/';
}

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const { browser, page } = await boot(base);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

// Three deliveries land in the ledger exactly as applyGrant writes them, and
// NOBODY ever showed them: this is the "missed the popup" state.
await seed(page, {
  level: 10,
  xp: [
    { key: 'gift-a', type: 'gift', xp: 0, label: 'Vile Nightmare #8 sent you 120 coins!', ts: Date.now() - 3600e3 },
    { key: 'gift-b', type: 'gift', xp: 15, label: 'Brock sent you a gift!', ts: Date.now() - 600e3 },
    { key: 'cheer-a', type: 'cheer', xp: 0, label: 'Brock cheered you on', ts: Date.now() - 120e3 },
  ],
});

const readInbox = () => page.evaluate(async () => {
  const rows = await window.__crewDeliveries();
  const unseen = await window.__unseenDeliveries();
  return { rows: rows.map(r => r.label), unseen };
});

// The Crew tab shows a Go Online prompt without an account, and the inbox lives
// on the online screen. Give the page a local account row (no network: every
// server call fails soft to an empty friends list, which is exactly the flaky
// -signal case the inbox has to survive).
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('social', { playerId: 'audit-player', handle: 'Audit Bones', friendCode: 'BONE-TEST-TEST', name: null, onlineAt: Date.now() });
});

const before = await readInbox();
ok('the ledger already holds every missed delivery', before.rows.length === 3,
  `${before.rows.length} rows: ${JSON.stringify(before.rows)}`);
ok('senders survive: the note names who sent it',
  before.rows.some(l => /Brock/.test(l)) && before.rows.some(l => /Vile Nightmare/.test(l)), JSON.stringify(before.rows));
ok('BADGE unread deliveries are counted before you open the tab', before.unseen === 3, `unseen=${before.unseen}`);
// and the count has to reach the actual pixel on the tab bar, not just the reader
const badge = await page.evaluate(async () => {
  await window.__refreshCrewBadge();
  const el = document.querySelector('#crewBadge');
  return { hidden: el?.hidden, text: el?.textContent };
});
ok('BADGE the Crew tab actually shows the number', badge.hidden === false && badge.text === '3', JSON.stringify(badge));

// Opening the Crew tab is the read receipt.
await page.evaluate(() => { location.hash = '#/friends'; });
await sleep(2200);
const shown = await page.evaluate(() => {
  const card = document.querySelector('#deliveriesCard');
  const rows = [...document.querySelectorAll('#deliveriesList .t3-row')];
  return {
    visible: !!card && !card.hidden,
    rows: rows.length,
    unreadMarked: rows.filter(r => r.classList.contains('unread')).length,
    firstLabel: rows[0]?.querySelector('b')?.textContent || null,
  };
});
// offline (no account) the Crew tab shows the Go Online prompt, so the inbox
// card only exists once online. Report that honestly instead of passing on a
// card that was never rendered.
if (!shown.visible) {
  ok('INBOX the deliveries card renders in the Crew tab', false,
    'card not rendered (Crew tab is in its offline state; the inbox needs an account)');
} else {
  ok('INBOX the deliveries card renders in the Crew tab', shown.rows === 3, JSON.stringify(shown));
  ok('INBOX unread deliveries are flagged NEW', shown.unreadMarked === 3, `${shown.unreadMarked} marked`);
  ok('INBOX newest first', /cheered you on/.test(shown.firstLabel || ''), String(shown.firstLabel));
  const after = await readInbox();
  ok('BADGE opening the tab clears the unread count', after.unseen === 0, `unseen=${after.unseen}`);
}

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
