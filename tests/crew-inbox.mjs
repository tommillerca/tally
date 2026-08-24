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
import { boot, seed, sleep, serveTree} from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srv = null, srvHandle = null;
let base = process.env.URL;
if (!base) {
  /* serveTree: a free port from the OS, and a HARD ERROR if python never
     bound. The hard-coded port with stdio:'ignore' meant a stranded server
     already holding it made this audit talk to whatever was listening. */
  srvHandle = await serveTree(ROOT);
  srv = { kill: () => srvHandle.close() };
  base = srvHandle.url;
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

/* HISTORY IS NOT NEWS. v285. The watermark used to start at 0, so the first
   time anyone opened the inbox their entire gift history counted as unread and
   the tab badge screamed 9+. Tom, 2026-08-08: "showing new gifts for past gifts
   from whenever you started playing it's way too much."
   PROVE-RED: default crewSeenTs back to 0 in deliverySeenTs() and this fails. */
ok('BADGE your whole gift history does not count as unread', before.unseen === 0, `unseen=${before.unseen}`);

// ...but a gift that lands AFTER that watermark is genuinely new, and has to
// reach the actual pixel on the tab bar, not just the reader.
await page.evaluate(async () => {
  const { db } = await import('./js/db.js');
  await db.put('xp', { key: 'gift-new', type: 'gift', xp: 20, label: 'Brock sent you a NEW gift!', ts: Date.now() });
});
const arrived = await readInbox();
ok('BADGE a delivery that lands after you last looked IS unread', arrived.unseen === 1, `unseen=${arrived.unseen}`);
const badge = await page.evaluate(async () => {
  await window.__refreshCrewBadge();
  const el = document.querySelector('#crewBadge');
  return { hidden: el?.hidden, text: el?.textContent };
});
ok('BADGE the Crew tab actually shows the number', badge.hidden === false && badge.text === '1', JSON.stringify(badge));

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
    more: !!document.querySelector('#deliveriesMore'),
  };
});
// offline (no account) the Crew tab shows the Go Online prompt, so the inbox
// card only exists once online. Report that honestly instead of passing on a
// card that was never rendered.
if (!shown.visible) {
  ok('INBOX the deliveries card renders in the Crew tab', false,
    'card not rendered (Crew tab is in its offline state; the inbox needs an account)');
} else {
  /* The card leads with what is NEW and keeps the archive behind one tap. Tom,
     2026-08-08: "the deliveries history of your gifts just spams the top of the
     crew tab it shouldn't be taking over the whole page it defeats the tab
     itself." One unread here, so exactly one row plus a Show all button.
     PROVE-RED: render `rows` instead of `shown` in paintDeliveries and the row
     count becomes 4. */
  ok('INBOX the card shows what is new, not the whole archive', shown.rows === 1, JSON.stringify(shown));
  ok('INBOX the rest is still reachable', shown.more === true, `show-all button present: ${shown.more}`);
  ok('INBOX unread deliveries are flagged NEW', shown.unreadMarked === 1, `${shown.unreadMarked} marked`);
  ok('INBOX newest first', /NEW gift/.test(shown.firstLabel || ''), String(shown.firstLabel));
  const all = await page.evaluate(async () => {
    document.querySelector('#deliveriesMore')?.click();
    await new Promise(r => setTimeout(r, 200));
    return document.querySelectorAll('#deliveriesList .t3-row').length;
  });
  /* THREE, NOT FOUR, SINCE v425. The fourth seeded delivery is a CHEER, and
     cheers moved to their own card in the Crew tab: a gift is a thing you now
     own ("Nothing to claim: it is already yours", which is this card's own copy)
     and a cheer is somebody talking to you. Tom, 2026-08-22: "there needs to be
     a better interface in crew where you can see the cheers". So this number
     went down by exactly the number of cheers seeded, and the row below proves
     the cheer moved rather than vanished, which is the half a bare count change
     would have hidden. */
  ok('INBOX tapping Show all reveals the full history', all === 3, `${all} rows after expanding`);
  const split = await page.evaluate(() => {
    const inCheers = [...document.querySelectorAll('#cheersList .cheer-row')]
      .map(r => (r.querySelector('.cheer-tx b') || {}).textContent || '');
    const inDeliveries = [...document.querySelectorAll('#deliveriesList .t3-row')]
      .map(r => r.textContent.replace(/\s+/g, ' ').trim());
    return { inCheers, cheersInDeliveries: inDeliveries.filter(t => /cheered you/i.test(t)) };
  });
  ok('INBOX the seeded cheer moved to the Cheers card rather than being dropped',
    split.inCheers.length === 1 && split.cheersInDeliveries.length === 0,
    `cheers card [${split.inCheers.join(', ')}], cheers still in deliveries [${split.cheersInDeliveries.join(' / ') || 'none'}]`);
  const after = await readInbox();
  ok('BADGE opening the tab clears the unread count', after.unseen === 0, `unseen=${after.unseen}`);

  /* REACH: EXPANDING MUST NOT STRAND THE CONTROL THAT COLLAPSES IT.
     Tom, 2026-08-07: "the deliveries section when expanded becomes huge. it
     should only open and show less of past delivered gifts and or have a scroll
     feature. the issue is the button to close it becomes too far down to reach
     and collapse again." Show all used to replace the list with every row AND
     delete its own button, so a long history ran off the bottom of the phone with
     no way back. Thirty rows is a real history and 852px is a real iPhone.
     PROVE-RED (confirmed 2026-08-07): put back
     `list.innerHTML = rows.map(rowHtml).join('')` and REACH fails on both counts,
     the button gone and the box unbounded. */
  await page.evaluate(async () => {
    const { db } = await import('./js/db.js');
    for (let i = 0; i < 30; i++) {
      await db.put('xp', { key: `gift-bulk-${i}`, type: 'gift', xp: 5, label: `Brock sent you gift ${i}`, ts: Date.now() - (i + 2) * 86400e3 });
    }
    location.hash = '#/today';
  });
  await sleep(500);
  await page.evaluate(() => { location.hash = '#/friends'; });
  await sleep(2200);
  const reach = await page.evaluate(async () => {
    const btn0 = document.querySelector('#deliveriesMore');
    if (!btn0) return { ran: false };
    btn0.click();
    await new Promise(r => setTimeout(r, 900));   // the card scrolls itself into view
    const btn = document.querySelector('#deliveriesMore');
    const box = document.querySelector('#deliveriesList .dlv-rows');
    const vh = window.innerHeight;
    const r = btn ? btn.getBoundingClientRect() : null;
    return {
      ran: true, vh,
      rows: box ? box.querySelectorAll('.t3-row').length : 0,
      boxH: box ? Math.round(box.getBoundingClientRect().height) : null,
      scrolls: box ? box.scrollHeight > box.clientHeight + 4 : false,
      btnText: btn ? btn.textContent.trim() : null,
      btnBottom: r ? Math.round(r.bottom) : null,
    };
  });
  ok('REACH the expanded archive actually holds the history (an empty list is a FAILURE)',
    reach.ran && reach.rows >= 30, JSON.stringify({ rows: reach.rows }));
  ok('REACH it is capped and scrolls inside its own box rather than growing the page',
    reach.ran && reach.boxH < reach.vh * 0.55 && reach.scrolls === true,
    JSON.stringify({ boxH: reach.boxH, vh: reach.vh, scrolls: reach.scrolls }));
  ok('REACH the collapse control survives expanding and stays on screen',
    reach.ran && /show less/i.test(reach.btnText || '') && reach.btnBottom > 0 && reach.btnBottom <= reach.vh,
    JSON.stringify({ btnText: reach.btnText, btnBottom: reach.btnBottom, vh: reach.vh }));
  const collapsed = await page.evaluate(async () => {
    document.querySelector('#deliveriesMore')?.click();
    await new Promise(r => setTimeout(r, 250));
    const box = document.querySelector('#deliveriesList .dlv-rows');
    return { rows: box ? box.querySelectorAll('.t3-row').length : -1, btn: document.querySelector('#deliveriesMore')?.textContent.trim() };
  });
  ok('REACH and tapping it again really does collapse the list',
    collapsed.rows > 0 && collapsed.rows <= 3 && /show all/i.test(collapsed.btn || ''), JSON.stringify(collapsed));
}

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
