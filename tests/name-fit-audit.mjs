/* Browser geometry only. No base ever means production: serve this file's tree.
   The inventory includes remote player identities because these are the same
   components that display our player to somebody else. See docs/v578/name-fit.md.
   Draft previews accept curated picks only, so they use the longest legal pick
   instead of pretending an arbitrary imported name can be built by that UI. */
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { boot, seed, serveTree, sleep } from './godmode.js';
import { NAME_ADJ, NAME_NOUN, buildName } from '../js/names.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const names = ['Bo', 'Bartholomew Bonecrusher', 'Bartholomew Bonecrusher ' + 'W'.repeat(128)];
const sizes = ['', '200%', '53px']; // No maximum is declared by the app. 53px is a stress case.
const viewports = [[375, 812], [430, 932]];
const longest = values => values.reduce((best, s, i) => s.length > values[best].length ? i : best, 0);
const pick = { adj: longest(NAME_ADJ), noun: longest(NAME_NOUN), num: 999 };
const draft = buildName(pick.adj, pick.noun, pick.num);
const phases = [
  ['battle-log', [['contextual battle log', '#flog']]],
  ['battle-result', [['repeat battle result', '.fight-over .note']]],
  ['tower-action', [['rival tower action', '#spireAct']]],
  ['delivery-label', [['archived delivery label', '#deliveriesList .t3-tx b']]],
  ['today', [['Today identity', '.hero-name'], ['settled winner', '#raceResultCard .race-h b'], ['settled lanes', '#raceResultCard .race-lane .nm b']]],
  ['bonehead', [['Wardrobe identity', '.hub-name']]],
  ['settings', [['Settings identity', '#crewName']]],
  ['friends', [['Crew greeting', '.crew-greeting b'], ['Crew fan', '.cfan-card.feat .cfan-plate b'], ['Crew selected name', '#cfanView .pname-iso'], ['incoming request', '#friendsList .fl-sect:first-child .pname-iso'], ['outgoing request', '#friendsList .fl-sect:last-child .pname-iso'], ['level podium', '.pod-name'], ['step lanes', '#raceCard .race-lane .nm b'], ['previous champion', '#raceCard .race-champ b'], ['newcomers', '#newcomersList .t3-tx b'], ['level standing', '#lbYouAre span'], ['step standing', '#raceCard .gbn-txt small'], ['step gap', '#raceCard .race-gap'], ['gift sender', '.gift-sealed .tx b'], ['cheer sender', '.cheer-tx b']]],
  ['leaderboard', [['level leaderboard', '#lbBody .lb-who b']]],
  ['profile', [['profile heading', '#fpTitle .pname-iso']]],
  ['tower', [['tower keeper', '.spp-plate b'], ['tower siege identity', '.sp-siege']]],
  ['garden', [['garden greeting', '#hlwSay']]],
  ['gift', [['gift recipient', '.gift-recipient']]],
  ['cheer', [['cheer recipient', '.gift-recipient']]],
  ['gift-reveal', [['gift reveal credit', '#packFoot > .pack-coins:first-child']]],
  ['toast', [['identity toast', '#toast']]],
  ['intro', [['Pit introduction name', '.vs-name.foe'], ['Pit introduction venue', '.vs-venue']]],
  ['rename', [['rename notice', '.sheet-rename .sheet-body > p:nth-child(2) b']]],
  ['fight', [['Pit opponent heading', '.fight-title h2'], ['Pit opponent HUD', '.fight-hud .foe .fname'], ['Pit venue', '.fight-venue']]],
  ['map', [['owned tower marker', '.map-spire.mine .spire-flag'], ['map race standing', '#mapCount']]],
  ['builder', [['name-builder draft', '#nbPreview', draft]]],
  ['onboarding', [['onboarding draft', '#onbName', draft]]],
];
let browser, server, page, failed = 0, unproven = 0, checked = 0;
const pending = new Set();
for (const name of names) for (const [w, h] of viewports) for (const size of sizes)
  for (const [, sites] of phases) for (const [site] of sites) pending.add(JSON.stringify([name, w, h, size, site]));

// Print the input-source census as well as the rendered controls. This is not a
// substitute for geometry, and a new source binding must be added to the inventory.
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
app.split('\n').forEach((line, i) => {
  if (/social\.(displayName|socialMe)\(|nameWithAlias\(|buildDisplayName\(|esc\((?:\w+\.)?(?:name|ownerName|oldName)\)/.test(line))
    console.log(`SOURCE js/app.js:${i + 1} ${line.trim()}`);
});

async function fixture(page, name) {
  await seed(page, { level: 12 });
  await page.evaluate(async ({ name, pick }) => {
    const db = await import('./js/db.js');
    await db.kvSet('social', { playerId: 'name-fit-self', name, handle: name, friendCode: 'BONE-FIT' });
    await db.kvSet('onbName', pick);
    await db.kvSet('giftbox', [{ key: 'name-fit-gift', payload: { coins: 25, note: `${name} sent you a gift!` } }]);
    await db.db.put('xp', { key: 'name-fit-delivery', type: 'social', xp: 0, label: `${name} sent you a gift`, ts: Date.now() - 86400000 });
    await db.db.put('xp', { key: 'name-fit-cheer', type: 'cheer', xp: 0, label: `${name} cheered you`, from: name, cheer: 0, cheerFrom: 'name-fit-friend', ts: Date.now() });
  }, { name, pick });
  await page.evaluate(({ name }) => {
    const now = Date.now(), outfit = { B: 'B0-1', SK: 'SK0-1', T: 'T2' };
    const member = id => ({ playerId: id, name, addToken: `token-${id}`, lastSeen: now,
      joinedAt: now - 86400000, profile: { level: 12, levelName: 'Bonehead', outfit } });
    window.__nameFitMember = member('name-fit-friend');
    window.__testMe = { playerId: 'name-fit-self', name, handle: name, friendCode: 'BONE-FIT' };
    window.__testFriends = { friends: [member('name-fit-friend')], incoming: [member('incoming')], outgoing: [member('outgoing')], reached: true };
    window.__testLb = ['newcomer', 'name-fit-self', 'another'].map((id, i) => ({ ...member(id), outfit, level: 12, you: i === 1 }));
    const players = window.__testLb.map((p, i) => ({ ...p, rank: i + 1, place: i + 1, steps: 24000 - 1000 * i, seenAt: now }));
    window.__testRace = { players, yourRank: 2, podium: players, champion: players[0] };
    window.__raceResults = () => players;
  }, { name });
  await page.evaluate(async () => { await window.__raceResultForgetCache?.(); });
}
async function route(page, name) {
  // Always leave the previous route, including sheets, so stale nodes cannot
  // satisfy CONTROL after a failed navigation.
  await page.evaluate(() => { location.hash = '#/log'; });
  await sleep(150);
  await page.evaluate(name => { location.hash = `#/${name}`; }, name);
  await page.waitForFunction(name => location.hash === `#/${name}` && document.querySelector('#screen.screen-in')?.childElementCount > 0, { timeout: 10000 }, name);
  await sleep(500);
}
async function prepare(page, phase, name) {
  await route(page, ['today', 'bonehead', 'settings', 'friends'].includes(phase) ? phase : 'friends');
  if (phase === 'leaderboard') await page.evaluate(() => document.querySelector('#crewLeaderboard').click());
  if (phase === 'profile') await page.evaluate(() => window.__openFriendProfile(window.__nameFitMember));
  if (phase === 'tower') await page.evaluate(name => window.__spireSheet({ besieged: true, siegeName: name, siegeUntil: Date.now() + 3600000, s: { id: 'name-fit-tower', name: 'Audit tower', dist: 0 }, view: { level: 1, tribute: { coins: 0 } }, held: true, lvl: 1, heldSince: Date.now() }), name);
  if (['garden', 'builder', 'onboarding', 'gift', 'cheer', 'tower-action'].includes(phase)) await page.evaluate(({ phase, pick }) => window.__nameFitSurface(phase, pick), { phase, pick });
  if (phase === 'rename') await page.evaluate(name => window.__renameNotice({ oldName: name }), name);
  if (phase === 'gift-reveal') await page.evaluate(name => window.__revealGift({ payload: { coins: 25, note: `${name} sent you a gift!` } }), name);
  if (phase === 'toast') await page.evaluate(name => window.__toast(`You're now ${name}!`, 10000, { action: true }), name);
  if (['fight', 'intro', 'battle-log', 'battle-result'].includes(phase)) await page.evaluate(({name, phase}) => { window.__giForce = phase === 'intro'; return window.__denFight(1, 0, { name, venue: `${name}'s turf`, mode: 'friend', friendId: 'name-fit-friend' }); }, {name, phase});
  if (phase === 'battle-log') {
    await page.evaluate(() => window.__bhFight.act('jab'));
    await page.waitForFunction(name => document.querySelector('#flog')?.textContent.includes(name), { timeout: 5000 }, name);
  }
  if (phase === 'battle-result') {
    await page.evaluate(async () => {
      const game = await import('./js/game.js');
      await game.claimFriendBattle('name-fit-friend', true);
      if (!await window.__bhFight.finish('p')) throw new Error('Fight did not finish');
    });
    await page.waitForSelector('.fight-over .note', { timeout: 5000 });
  }
  if (phase === 'map') {
    await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207, accuracy: 8 });
    const target = await page.evaluate(async () => {
      const sp = await import('./js/spires.js');
      const s = sp.spiresNear(49.2827, -123.1207)[0];
      if (!s) throw new Error('No tower fixture available');
      await sp.syncSieges([{ ...s, level: 1, claimedAt: Date.now(), tendedAt: Date.now() }]);
      return s;
    });
    await page.setGeolocation({ latitude: target.lat, longitude: target.lng, accuracy: 8 });
    await route(page, 'boneyard');
  }
  if (phase !== 'intro') await sleep(500);
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const id of ['newsBanner', 'raceCard', 'raceResultCard']) {
      const d = document.getElementById(id); if (d && !d.hidden && !d.open) d.querySelector('summary')?.click();
    }
    // Make request groups and results reachable through their native disclosure.
    for (const d of document.querySelectorAll('details:has(#friendsList)')) if (!d.open) d.querySelector('summary')?.click();
  });
}
async function measure(page, selector, name) {
  return page.evaluate(({ selector, name }) => {
    const elements = [...document.querySelectorAll(selector)];
    for (const e of elements) for (let a = e.parentElement; a; a = a.parentElement) {
      if (a.tagName === 'DETAILS' && !a.open) a.querySelector('summary')?.click();
    }
    const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
    return elements.filter(visible).map(e => {
      e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      let clipped = false, hidden = false;
      for (let a = e.parentElement; a; a = a.parentElement) {
        const ar = a.getBoundingClientRect(), cs = getComputedStyle(a);
        hidden ||= Number(cs.opacity) === 0 || cs.visibility === 'hidden';
        if (['hidden', 'clip'].includes(cs.overflowX)) clipped ||= r.left < ar.left - 1 || r.right > ar.right + 1;
        if (['hidden', 'clip'].includes(cs.overflowY)) clipped ||= r.top < ar.top - 1 || r.bottom > ar.bottom + 1;
      }
      return { element: `${e.tagName.toLowerCase()}#${e.id}.${e.className}`, rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, scrollHeight: e.scrollHeight, clientHeight: e.clientHeight,
        fontSize: parseFloat(s.fontSize), minimum: parseFloat(getComputedStyle(document.documentElement).fontSize) * .5625,
        intact: e.textContent.includes(name), rendered: r.width > 0 && r.height > 0 && !hidden && Number(s.opacity) !== 0,
        clipped: clipped || r.left < -1 || r.right > innerWidth + 1 };
    });
  }, { selector, name });
}
try {
  const supplied = process.argv[2] || process.env.URL;
  server = supplied ? null : await serveTree(root);
  const base = supplied || server.url;
  console.log(`TREE ${root} BASE ${base}`);
  ({ browser, page } = await boot(base));
  await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
  // Never send fixture identities to a real API. Read-only assets may still load.
  await page.setRequestInterception(true);
  page.on('request', async req => {
    if (req.isInterceptResolutionHandled()) return;
    const u = new URL(req.url());
    if (u.pathname === '/steps/week') {
      const headers = { 'access-control-allow-origin': new URL(base).origin,
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*' };
      if (req.method() === 'OPTIONS') return void req.respond({ status: 204, headers });
      if (req.method() === 'GET') {
        const players = await page.evaluate(() => window.__testRace?.players || []);
        return void req.respond({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({
          week: u.searchParams.get('week'), racers: players.length, yourRank: 2, players, prize: {}, podium: [], champion: null,
        }) });
      }
    }
    if (!['GET', 'HEAD'].includes(req.method())) return void req.respond({ status: 503, body: '{}' });
    return void req.continue();
  });
  for (const name of names) {
    await fixture(page, name);
    for (const [w, h] of viewports) for (const size of sizes) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await page.evaluate(size => { document.documentElement.style.fontSize = size; }, size);
      for (const [phase, sites] of phases) {
        let error;
        try { await prepare(page, phase, name); } catch (e) { error = e.message; }
        for (const [site, selector, expected = name] of sites) {
          const key = JSON.stringify([name, w, h, size, site]); pending.delete(key);
          const context = `${site} ${w}x${h} text=${size || 'default'} name=${JSON.stringify(expected)}`;
          if (error) { console.log(`UNPROVEN CONTROL ${context}: ${error}`); unproven++; continue; }
          let rows;
          try { rows = await measure(page, selector, expected); }
          catch (e) { console.log(`UNPROVEN CONTROL ${context}: ${e.message}`); unproven++; continue; }
          if (!rows.length || rows.some(r => !r.rendered)) { console.log(`UNPROVEN CONTROL ${context}: ${selector} absent or hidden`); unproven++; continue; }
          for (const row of rows) {
            checked++;
            console.log(`PASS CONTROL ${context} ${JSON.stringify(row)}`);
            for (const [guard, pass] of [['FITS', row.clientWidth > 0 && row.scrollWidth - row.clientWidth <= 1 && row.scrollHeight - row.clientHeight <= 1 && !row.clipped], ['LEGIBLE', row.fontSize >= row.minimum], ['INTACT', row.intact]]) {
              console.log(`${pass ? 'PASS' : 'FAIL'} ${guard} ${context} scrollWidth=${row.scrollWidth} clientWidth=${row.clientWidth} font=${row.fontSize} minimum=${row.minimum}`);
              if (!pass) failed++;
            }
          }
        }
      }
    }
  }
} catch (e) {
  console.error(`UNPROVEN environment: ${e.stack || e}`);
} finally {
  for (const key of pending) { console.log(`UNPROVEN CONTROL ${key}: audit did not reach this site`); unproven++; }
  await browser?.close(); server?.close();
  console.log(`NAME-FIT checked=${checked} failed=${failed} unproven=${unproven}`);
  process.exitCode = unproven ? 97 : failed ? 1 : 0;
}
