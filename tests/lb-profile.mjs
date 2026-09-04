/* Opening a stranger's profile from the leaderboard.
 *
 * Tom, 2026-08-08: "in the crew tab when i go into the leaderboard why cant i
 * then click who's on it and see more about their profile".
 *
 * The profile sheet existed but was only ever reachable from your own Crew list,
 * and every action in it needs a friendship: gift and cheer are friends-only on
 * the server (they would 403), and "Remove friend" / nicknames are meaningless
 * for someone you have never met. So the leaderboard opens the same sheet in
 * STRANGER mode: their bonehead, level, class, badges and pet, plus the one
 * action actually available, Add.
 *
 * PROVE-RED: drop the `stranger` guard around the .fp-actions block and STRANGER
 * fails with the gift button present; drop `data-lbview` from the row markup and
 * ROW fails.
 *
 * Usage: node tests/lb-profile.mjs
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
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
await seed(page, { level: 12 });

// exactly the shape the leaderboard hands over
/* addToken ADDED 2026-09-03. This fixture carried only a friendCode, which is a
   payload shape the app stopped sending: the leaderboard mints an opaque
   expiring addToken instead (js/app.js:11194 passes `addToken: p.addToken`, and
   the route comment records that publishing friend codes was a takeover vector).
   So the fixture was modelling a row the server has not produced in a long time.
   Nothing noticed until the profile sheet learned to withhold Add when there is
   no token — a guard that is right, and that this fixture then failed. */
const STRANGER = {
  name: 'Vile Nightmare #8', playerId: 'pl-stranger', friendCode: 'BONE-AAAA-BBBB',
  addToken: 'tok-audit-stranger', lastSeen: Date.now(),
  profile: { outfit: { B: 'B0-1', SK: 'SK0-1' }, pet: null, level: 31, levelName: 'Macro Wizard', badges: 7 },
};
/* ...and the other half of that guard, which nothing covered: a row WITHOUT a
   token must offer no button at all, rather than one that can only ever say
   "Could not send that request". */
const TOKENLESS = { ...STRANGER, addToken: undefined, name: 'No Token #9', playerId: 'pl-notoken' };

const open = async (opts, who = STRANGER) => {
  await page.evaluate((f, o) => {
    document.querySelectorAll('.sheet-fp').forEach(s => s.remove());
    window.__openFriendProfile(f, o);
  }, who, opts);
  await sleep(700);
  return page.evaluate(() => {
    const w = document.querySelector('.sheet-fp');
    return {
      open: !!w,
      title: w?.querySelector('#fpTitle')?.textContent || null,
      level: w?.querySelector('.fp-lvlbadge')?.textContent || null,
      cls: w?.querySelector('.fp-class')?.textContent || null,
      badges: w?.querySelector('.fp-fact b')?.textContent || null,
      hasArt: !!w?.querySelector('.bh-stage img'),
      gift: !!w?.querySelector('#fpGift'),
      cheer: !!w?.querySelector('#fpCheer'),
      remove: !!w?.querySelector('#fpRemove'),
      alias: !!w?.querySelector('#fpAlias'),
      add: !!w?.querySelector('#fpAdd'),
      body: w?.innerText || '',
    };
  });
};

const s = await open({ stranger: true });
const noTok = await open({ stranger: true }, TOKENLESS);
ok('STRANGER the profile opens at all', s.open, JSON.stringify({ title: s.title }));
ok('STRANGER you can see more about them', s.level === 'Lv 31' && /Macro Wizard/.test(s.cls || '') && s.badges === '7',
  JSON.stringify({ level: s.level, cls: s.cls, badges: s.badges }));
ok('STRANGER their bonehead is drawn', s.hasArt, `art layers: ${s.hasArt}`);
ok('STRANGER no friends-only actions are offered', !s.gift && !s.cheer && !s.remove && !s.alias,
  JSON.stringify({ gift: s.gift, cheer: s.cheer, remove: s.remove, alias: s.alias }));
ok('STRANGER the one action you DO have is Add', s.add, `add button: ${s.add}`);
/* The guard's other half. A row with no addToken must offer NO button, not one
   that can only ever answer "Could not send that request". Without this row the
   fixture fix above would hide the guard rather than cover it. */
ok('STRANGER a row with no addToken offers no Add button at all',
  noTok.open && !noTok.add, `opened: ${noTok.open}, add button: ${noTok.add}`);

const crew = await open({ stranger: true, isCrew: true });
ok('STRANGER someone already in your Crew is not offered again', !crew.add && /Already in your Crew/.test(crew.body), JSON.stringify({ add: crew.add }));
const sent = await open({ stranger: true, sent: true });
ok('STRANGER a pending request says so instead of re-asking', !sent.add && /Request sent/.test(sent.body), JSON.stringify({ add: sent.add }));

// and a real friend keeps everything
const friend = await open({});
ok('FRIEND the full profile is unchanged for actual Crew', friend.gift && friend.cheer && friend.remove && friend.alias && !friend.add,
  JSON.stringify({ gift: friend.gift, cheer: friend.cheer, remove: friend.remove, alias: friend.alias }));

// the row itself has to be openable: the sheet is useless if nothing opens it
const APP = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
ok('ROW leaderboard rows carry the open handle', /data-lbview="\$\{esc\(p\.playerId\)\}"/.test(APP), 'data-lbview on lb-row');
ok('ROW something listens for it', /data-lbview\]'\)/.test(APP) && /stranger: true/.test(APP), 'click handler opens stranger profile');

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
