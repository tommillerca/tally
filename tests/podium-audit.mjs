/* The Crew tab must SHOW the top three, and tapping the card must still open the
   full list. Tom, 2026-08-09: "I don't like that the leaderboard is fully
   collapsed now and we lost the podium art. You should still see that and then
   also click to open and see the full list."
   Proven red against the collapsed version: podium hidden, 0 figures. */
import { boot, sleep } from './godmode.js';
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const { browser, page } = await boot(process.argv[2] || 'http://localhost:8765/');
await page.evaluate(() => {
  // the Crew tab gates on being online; __testMe / __testFriends are the existing
  // webdriver fixtures for exactly that
  window.__testMe = { playerId: 'me', name: 'Hollow Shovel', friendCode: 'BONE-4K7Q', handle: 'hollow' };
  window.__testFriends = { friends: [], incoming: [], outgoing: [] };
  window.__testLb = Array.from({ length: 9 }, (_, i) => ({
    playerId: 'p' + i, name: ['Grim Femur', 'Rowdy Kneecap', 'Feral Molar', 'Chrome Casket', 'Hollow Shovel',
      'Wicked Tibia', 'Jolly Coffin', 'Damp Molar', 'Bony Shovel'][i],
    level: 60 - i * 5, levelName: 'Bonehead', badges: 3, friendCode: 'BONE-' + i,
    outfit: { B: 'B0-1', SK: 'SK0-1', H: i % 2 ? 'H10-5' : 'H10-3', T: 'T9-5' },
    pet: i === 0 ? { id: 'C3', shiny: true } : null, you: i === 4, lastSeen: Date.now(),
  }));
  location.hash = '#/friends';
});
await sleep(2600);
const p = await page.evaluate(() => {
  const pod = document.getElementById('lbPodium');
  const figs = [...document.querySelectorAll('#lbPodium .pod-av')];
  const imgs = [...document.querySelectorAll('#lbPodium .pod-av img')];
  const plinths = [...document.querySelectorAll('#lbPodium .pod-plinth')].map(x => Math.round(x.getBoundingClientRect().height));
  return {
    hidden: !pod || pod.hidden,
    figures: figs.length,
    sizes: figs.map(f => Math.round(f.getBoundingClientRect().width)),
    order: [...document.querySelectorAll('#lbPodium .pod-name')].map(n => n.textContent),
    plinths,
    imgs: imgs.length, decoded: imgs.filter(i => i.naturalWidth > 0).length,
  };
});
ok('the podium is visible on the Crew tab', !p.hidden);
ok('three Boneheadz on it', p.figures === 3, JSON.stringify(p.order));
// an empty sample set is a failure, not a pass
ok('their art actually decodes', p.imgs > 0 && p.decoded === p.imgs, `${p.decoded}/${p.imgs}`);
ok('first place is the biggest figure', p.sizes[1] > p.sizes[0] && p.sizes[1] > p.sizes[2], JSON.stringify(p.sizes));
ok('first place stands highest', p.plinths[1] > p.plinths[0] && p.plinths[1] > p.plinths[2], JSON.stringify(p.plinths));
ok('the winner is in the middle', p.order[1] === 'Grim Femur', JSON.stringify(p.order));
// ...and the card still opens the full list
await page.evaluate(() => document.getElementById('crewLeaderboard').click());
await sleep(1400);
const sheet = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#lbBody .lb-row')];
  return { rows: rows.length, podiumInSheet: !!document.querySelector('#lbBody .lb-podium') };
});
ok('tapping the card opens the full list', sheet.rows === 9, `${sheet.rows} rows`);
ok('the sheet stays ONE flat list (no podium in it)', !sheet.podiumInSheet);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall green');
process.exit(fails.length ? 1 : 0);
