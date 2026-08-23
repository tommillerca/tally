/* THE CHEERS INBOX: a cheer is somebody talking to you, so it has to say who,
 * say what they actually said, and let you answer.
 *
 * WHY THIS EXISTS. Tom, 2026-08-22: "there needs to be a better interface in
 * crew where you can see the cheers that friends have sent you, right now it's
 * very easy to pass them by."
 *
 * What he was passing by was real, and the cause was one hop upstream of the UI.
 * /cheer sends { from, cheer, cheerFrom, note }: the INDEX of the phrase and the
 * SENDER's player id. js/social.js applyPayload called
 * `awardOnce(key, type, xp, note)` and that signature had nowhere to put either
 * of them, so both were dropped at the one line that turns a grant into a ledger
 * row. Downstream, the only surviving field was the server's sentence, which is
 * why every cheer in DELIVERIES read "somebody cheered you" whichever of the
 * twelve was sent, and why there was no id to address a reply to. The list was
 * also filed under a card about gifts, below the leaderboard, the race and the
 * add-a-friend box.
 *
 * SO THE CHAIN IS WHAT IS GRADED, through the real path, end to end:
 * a signed grant payload -> applyGrant -> the ledger -> the Crew tab -> the
 * reply sheet, addressed to the player who sent it.
 *
 * THE GRANTS ARE APPLIED THROUGH social.__testApplyGrant, WHICH IS THE REAL
 * applyGrant. Hand-writing ledger rows would prove the panel can render rows
 * this file wrote and would be green with the transport bug still in place,
 * which is the whole bug. The Crew tab itself needs an account, so __testMe /
 * __testFriends are seeded exactly as tests/crew-fan-audit.mjs does.
 *
 * WHAT EACH ROW FAILS ON, separately and on purpose:
 *
 *   SAMPLE    setup. The preset list has entries, three distinct cheers landed
 *             in the ledger, and the card is on screen with rows in it. An empty
 *             sample is a FAILURE, never a pass: exits 2.
 *   CARRIED   the transport. Every applied cheer row carries the INDEX and the
 *             SENDER id, and the index is the one that was sent. This is the row
 *             that goes red on the shipped bug.
 *   WHAT      the render. Each row shows the emoji AND the phrase the sender
 *             actually picked, and three different cheers read as three
 *             different things. A renderer that printed the server's sentence
 *             passes nothing here.
 *   WHO       each row names its sender.
 *   UNREAD    the card counts what is new, and the tab badge is non-zero while
 *             cheers are waiting.
 *   BACK      tapping "Cheer back" opens the send sheet aimed at THAT player.
 *             Driven by a real mouse click at the control's centre.
 *   KEPT      nothing expires unseen. After a full reload, every cheer is still
 *             listed, and it is no longer counted as new.
 *   SPLIT     cheers are not listed twice on one screen: DELIVERIES no longer
 *             carries them, and the gift it does carry is untouched.
 *   LEGACY    a row written before the fix (label only, no index, no sender)
 *             still LISTS, with the server's sentence, and simply offers no
 *             reply button. A cheer you cannot answer beats a cheer you were
 *             never shown.
 *
 * PROVE-RED: see the block at the end of this file.
 *
 * Run: node tests/crew-cheers-audit.mjs [baseUrl] [--shots DIR]
 * Self-serving: with no URL it serves this checkout, so it can never grade
 * production.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, settle, serveTree } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};
const setup = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'SETUP'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) { console.log('\n  This audit GRADED NOTHING.'); process.exit(2); }
};

const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (page, name) => {
  if (!SHOTS) return;
  await settle(page);
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`      shot: ${file}`);
};

const argUrl = process.argv.slice(2).find(a => !a.startsWith('--') && /^https?:/.test(a));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || process.env.URL || srv.url;
const { browser, page } = await boot(base);

/* Three friends, three DIFFERENT cheers, so "it shows the phrase" cannot pass by
   printing the same string three times. The indices are picked apart in the
   preset list for the same reason. */
const SENT = [
  { id: 'cheer-fixture-0', name: 'BONE JOVI', cheer: 0 },
  { id: 'cheer-fixture-1', name: 'MARROW MAX', cheer: 6 },
  { id: 'cheer-fixture-2', name: 'GRAVE MINT', cheer: 11 },
];

try {
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await seed(page, { level: 14, coins: 5000 });

  /* THE READ WATERMARK IS SET BEFORE THE CHEERS ARRIVE, because that is the only
     order it ever happens in on a real device: refreshCrewBadge runs at boot and
     initialises it, and the cheers land afterwards. Applying grants first and
     THEN letting the watermark initialise stamps it at the newest row already in
     the ledger (js/app.js deliverySeenTs: "history is not news"), so every
     fixture would arrive pre-read and UNREAD would grade a state no player is
     ever in. */
  await page.evaluate(() => window.__unseenDeliveries());

  /* THE REAL GRANT PATH. This is the same applyGrant pullGrants calls, handed
     exactly the payload the Worker's /cheer route builds (see server/src/index.js:
     `payload: JSON.stringify({ from: fromName, cheer, cheerFrom, note })`), plus
     one gift so SPLIT has something to check DELIVERIES still holds, and one
     LEGACY cheer carrying only what a pre-fix row carried. */
  const applied = await page.evaluate(async sent => {
    const social = await import('/js/social.js');
    const out = [];
    /* THE OLDEST ROW IS APPLIED FIRST, because awardOnce stamps the ledger row
       at AWARD time and ignores the grant's own ts, so "when it arrived on this
       device" is the order things are applied in and nothing else. Applying the
       legacy row last made it the NEWEST row in the list, which is the opposite
       of what it is meant to be, and pushed a live fixture off the end. */
    out.push(await social.__testApplyGrant({
      key: 'cheer-legacy-row', type: 'cheer',
      payload: { note: 'DUSTY LULU cheered you' },   // a row as it was written BEFORE the fix
    }));
    out.push(await social.__testApplyGrant({
      key: 'social-gift-fixture', type: 'social',
      payload: { coins: 120, note: 'RIB TICKLER sent you 120 coins!' },
    }));
    for (const s of sent) {
      out.push(await social.__testApplyGrant({
        key: `cheer-${s.id}-20260823-1`, type: 'cheer',
        payload: { from: s.name, cheer: s.cheer, cheerFrom: s.id, note: `${s.name} cheered you` },
      }));
    }
    return out;
  }, SENT);
  setup('SAMPLE every fixture grant was applied through the real applyGrant',
    applied.length === 5 && applied.every(Boolean), `applied ${applied.filter(Boolean).length} of 5`);

  const presets = await page.evaluate(() => (window.__cheerPresets ? window.__cheerPresets() : []).length);
  setup('SAMPLE the preset cheer list has entries, so an index means something',
    presets > SENT.reduce((m, s) => Math.max(m, s.cheer), 0), `${presets} presets`);

  /* ---- CARRIED: the transport hop that used to drop both fields ---- */
  const stored = await page.evaluate(() => window.__crewCheers());
  const byId = Object.fromEntries(stored.filter(r => r.cheerFrom).map(r => [r.cheerFrom, r]));
  const carriedBad = SENT.filter(s => !byId[s.id] || byId[s.id].cheer !== s.cheer);
  ok('CARRIED an applied cheer keeps the phrase INDEX and the SENDER id on its ledger row',
    carriedBad.length === 0 && Object.keys(byId).length === SENT.length,
    carriedBad.length
      ? carriedBad.map(s => `${s.name} sent ${s.cheer}, row has ${byId[s.id] ? byId[s.id].cheer : 'NO ROW'} (from ${byId[s.id] ? byId[s.id].cheerFrom : '-'})`).join('; ')
      : SENT.map(s => `${s.name}:${byId[s.id].cheer}`).join(' '));

  /* ---- render the Crew tab, the same way tests/crew-fan-audit.mjs does ---- */
  await page.evaluate(fx => {
    window.__testMe = { name: 'Cheer Audit', handle: 'cheer', friendCode: 'BONE-0000-0000' };
    window.__testFriends = { friends: fx, incoming: [], outgoing: [] };
    location.hash = '#/today';
  }, SENT.map((s, i) => ({
    playerId: s.id, name: s.name, alias: null, lastSeen: Date.now() - i * 3600e3,
    profile: { level: 20 + i, levelName: 'Bonehead', badges: i + 2, gearCount: 4, outfit: { B: 'B0-1', SK: 'SK0-1', BG: 'BG1' }, pet: null },
  })));
  await sleep(400);
  await page.evaluate(() => { location.hash = '#/friends'; });
  await sleep(2400);

  const readCard = () => page.evaluate(() => {
    const card = document.getElementById('cheersCard');
    if (!card || card.hidden) return null;
    const r = card.getBoundingClientRect();
    return {
      top: Math.round(r.top), newTag: (document.getElementById('cheersNew') || {}).hidden === false
        ? document.getElementById('cheersNew').textContent.trim() : null,
      rows: [...card.querySelectorAll('.cheer-row')].map(row => ({
        face: (row.querySelector('.cheer-face') || {}).textContent || '',
        who: (row.querySelector('.cheer-tx b') || {}).textContent || '',
        said: (row.querySelector('.cheer-said') || {}).textContent || '',
        when: (row.querySelector('.cheer-tx small') || {}).textContent || '',
        back: (row.querySelector('[data-cheerback]') || {}).dataset?.cheerback || null,
        unread: row.classList.contains('unread'),
      })),
    };
  });
  const card = await readCard();
  setup('SAMPLE the Cheers card is on screen with rows in it',
    !!card && card.rows.length >= SENT.length, card ? `${card.rows.length} rows` : 'no cheers card rendered');
  await shot(page, '00-cheers-inbox');
  /* The card sits under the fan, which is where it belongs and is also below the
     fold on a 393x852 phone, so the full-screen shot above frames its position
     and not its contents. This one frames the rows. */
  await page.evaluate(() => document.getElementById('cheersCard')?.scrollIntoView({ block: 'center' }));
  await sleep(400);
  await shot(page, '00b-cheers-rows');

  /* ---- WHAT: the phrase they actually picked, not the server's sentence ---- */
  const presetsList = await page.evaluate(() => window.__cheerPresets());
  const whatBad = [];
  for (const s of SENT) {
    const row = card.rows.find(r => r.back === s.id);
    const want = presetsList[s.cheer];
    if (!row) { whatBad.push(`${s.name}: no row`); continue; }
    if (row.said.trim() !== want.txt) whatBad.push(`${s.name}: said "${row.said.trim()}", sent "${want.txt}"`);
    if (!row.face.includes(want.emo)) whatBad.push(`${s.name}: face "${row.face.trim()}", sent "${want.emo}"`);
  }
  const distinct = new Set(card.rows.filter(r => r.back).map(r => r.said.trim()));
  ok('WHAT each row shows the emoji and the phrase the sender actually chose, and three cheers read as three different things',
    whatBad.length === 0 && distinct.size === SENT.length,
    whatBad.length ? whatBad.join('; ') : `${[...distinct].map(t => `"${t}"`).join(' ')}`);

  /* ---- WHO ---- */
  const whoBad = SENT.filter(s => {
    const row = card.rows.find(r => r.back === s.id);
    return !row || !row.who.includes(s.name);
  });
  ok('WHO each row names the friend who sent it',
    whoBad.length === 0, whoBad.length ? whoBad.map(s => s.name).join(', ') : card.rows.map(r => r.who.trim()).join(' | '));

  /* ---- UNREAD: the card counts what is new and the tab badge is up ---- */
  const badge = await page.evaluate(() => {
    const b = document.getElementById('crewBadge');
    return { hidden: !b || b.hidden, text: b ? b.textContent.trim() : null };
  });
  ok('UNREAD the card marks what is new and the Crew tab badge is showing',
    !!card.newTag && card.rows.some(r => r.unread) && !badge.hidden && badge.text !== '0',
    `card tag ${card.newTag || 'none'}, ${card.rows.filter(r => r.unread).length} unread rows, tab badge "${badge.text}" hidden=${badge.hidden}`);

  /* ---- BACK: a real click, and the sheet has to be aimed at that player ---- */
  const target = SENT[1];
  const hit = await page.evaluate(id => {
    const b = document.querySelector(`[data-cheerback="${id}"]`);
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, target.id);
  setup('SAMPLE the Cheer back control is on screen and hittable', !!hit, hit ? `at ${Math.round(hit.x)},${Math.round(hit.y)}` : 'no control');
  /* elementFromPoint before the click: an absolutely positioned neighbour over
     the control would swallow the tap and the sheet would open for the wrong
     row, or not at all (anti-regression rule 6). */
  const onTop = await page.evaluate(p => {
    const el = document.elementFromPoint(p.x, p.y);
    return el ? (el.closest('[data-cheerback]') || {}).dataset?.cheerback || el.className : null;
  }, hit);
  await page.mouse.click(hit.x, hit.y);
  await sleep(900);
  const sheet = await page.evaluate(() => {
    const s = document.querySelector('.sheet-cheer');
    if (!s) return null;
    return { head: (s.querySelector('.sheet-head h2') || {}).textContent || '', body: s.textContent.slice(0, 300), chips: s.querySelectorAll('[data-cheer]').length };
  });
  ok('BACK tapping Cheer back opens the send sheet aimed at that player',
    onTop === target.id && !!sheet && sheet.chips > 0 && sheet.body.includes(target.name),
    `hit-test ${onTop}; sheet ${sheet ? `"${sheet.head}" ${sheet.chips} chips, names target=${sheet.body.includes(target.name)}` : 'never opened'}`);
  await shot(page, '01-cheer-back-sheet');
  await page.evaluate(() => { if (document.querySelector('.sheet')) history.back(); });
  await sleep(600);

  /* ---- SPLIT: not listed twice on one screen ---- */
  const split = await page.evaluate(() => {
    const d = document.getElementById('deliveriesCard');
    return {
      dlvHidden: !d || d.hidden,
      dlvRows: d ? [...d.querySelectorAll('.t3-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()) : [],
    };
  });
  const dlvCheers = split.dlvRows.filter(t => /cheered you/i.test(t));
  ok('SPLIT DELIVERIES no longer lists cheers, and still lists the gift it is for',
    dlvCheers.length === 0 && split.dlvRows.some(t => /120 coins/.test(t)),
    `deliveries rows: ${split.dlvRows.length ? split.dlvRows.join(' / ') : 'none'}`);

  /* ---- LEGACY: an older row still shows up, it just cannot be answered ---- */
  const legacy = card.rows.find(r => /DUSTY LULU/.test(r.who));
  ok('LEGACY a cheer stored before the fix still lists, with the server sentence and no reply button',
    !!legacy && legacy.back === null && /cheered you/i.test(legacy.said),
    legacy ? `who "${legacy.who.trim()}" said "${legacy.said.trim()}" back=${legacy.back}` : 'the legacy row was dropped from the list');

  /* ---- KEPT: nothing expires unseen ---- */
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2600);
  /* BOUNCE THROUGH #/today FIRST. The hash survives a reload, so the page comes
     back up already ON #/crew and has ALREADY rendered it, with no fixtures set:
     renderFriends found no account and drew the signed-out screen. Assigning the
     same hash again is a no-op and never re-renders, so the card really was
     gone, and for a reason that had nothing to do with what this row grades. */
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(500);
  await page.evaluate(fx => {
    window.__testMe = { name: 'Cheer Audit', handle: 'cheer', friendCode: 'BONE-0000-0000' };
    window.__testFriends = { friends: fx, incoming: [], outgoing: [] };
    location.hash = '#/friends';
  }, SENT.map(s => ({ playerId: s.id, name: s.name, alias: null, lastSeen: Date.now(),
    profile: { level: 20, levelName: 'Bonehead', badges: 2, gearCount: 4, outfit: { B: 'B0-1', SK: 'SK0-1', BG: 'BG1' }, pet: null } })));
  await sleep(2400);
  const collapsed = await readCard();
  /* ONCE READ, THE CARD COLLAPSES TO THE LAST FEW and the rest goes behind one
     tap, which is the rule DELIVERIES settled on after Tom, 2026-08-08 ("the
     deliveries history ... just spams the top of the crew tab"). So the promise
     being graded is REACHABLE, not RENDERED: expand it with the real control and
     every cheer ever received has to still be there. Counting the collapsed list
     would grade the cap, and would go red on correct behaviour. */
  const expanded = await page.evaluate(() => {
    const b = document.getElementById('cheersMore');
    if (!b) return null;
    b.click();
    return true;
  });
  setup('SAMPLE the read card collapses and offers a way back into the archive',
    !!collapsed && collapsed.rows.length < card.rows.length && expanded === true,
    collapsed ? `${collapsed.rows.length} of ${card.rows.length} shown, Show-all control ${expanded ? 'present' : 'MISSING'}` : 'no card');
  await sleep(500);
  const after = await readCard();
  ok('KEPT every cheer is still reachable after a full reload, and none of them is counted as new any more',
    !!after && after.rows.length === card.rows.length && !after.newTag && !after.rows.some(r => r.unread),
    after ? `${after.rows.length} rows expanded (received ${card.rows.length}), new tag ${after.newTag || 'none'}, ${after.rows.filter(r => r.unread).length} unread`
          : 'the Cheers card vanished after a reload');
  await shot(page, '02-after-reload');
} finally {
  await browser.close();
  if (srv) srv.close();
}

process.exit(fails);

/* PROVE-RED. Each mutation was written DIRECTLY INTO A COPY of this tree that is
 * not a git worktree (a `cp -R` of a worktree keeps a .git file pointing back at
 * the original, so a `git checkout -- path` inside the copy writes to the
 * ORIGINAL and the mutation never lands), then grepped in the copy to confirm it
 * was there before the run. Run on 2026-08-23:
 *
 *   js/social.js applyPayload: `extra` forced to null, which IS the shipped bug
 *     -> CARRIED  "BONE JOVI sent 0, row has undefined (from -)" for all three
 *        WHAT     every row falls back to the server's sentence: three rows,
 *                 one distinct string
 *        BACK     no reply control exists at all, so SAMPLE exits 2 before it
 *   js/app.js paintCheers: `r.cheerFrom` reply button dropped
 *     -> BACK ONLY. The list still reads correctly, which is the point: WHAT and
 *        WHO stay green and only the answer half goes red
 *   js/app.js: the cheer filter left out of paintDeliveries
 *     -> SPLIT ONLY  "deliveries rows: ... GRAVE MINT cheered you ...": listed
 *        twice on one screen, and nothing else notices
 *   js/app.js: the shared seenAtOpen watermark replaced by a per-painter read
 *        and a per-painter stamp, which is the race the shared read exists for
 *     -> UNREAD  "card tag none, 0 unread rows": paintDeliveries stamped the
 *        watermark first and moved the line out from under the Cheers card
 *   js/app.js paintCheers: legacy rows filtered out with `.filter(r => r.cheer != null)`
 *     -> LEGACY ONLY  "the legacy row was dropped from the list"
 */
