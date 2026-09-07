// Lane C browser proof. Written for reviewer execution, not measured in this sandbox.
// Run: node tests/pet-C-browser-audit.mjs [localCheckoutUrl]
// No URL serves this checkout through godmode. Remote targets are refused.
// Prove red on separate copies: restore the /20000 card formula, remove only
// the EQUIP refresh, or restore bhTierFor(imgSize), one mutation per run.
// Expected: C1 LV 5 instead of 10; C2 stale base hero; C3 DPR 3 ratios above 1.4.
import assert from 'node:assert/strict';
import { boot, sleep, setWidth, dismissOverlays } from './godmode.js';
const url = process.argv[2];
if (url) assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'local checkout URL required');
const { browser, page, base, errors } = await boot(url);
let failures = 0;
async function row(name, run) {
  try { console.log(`PASS ${name} ${await run() || ''}`); }
  catch (e) { failures++; console.log(`FAIL ${name} ${e.message}`); }
}
const click = async sel => { await page.waitForSelector(sel, { visible: true }); await page.click(sel); await sleep(700); };
const route = async tab => {
  await page.evaluate(tab => { location.hash = '#/' + tab; }, tab);
  await sleep(1200);
};
const today = async () => { await route('friends'); await route('today'); };
async function paint(sel, morph = 'midnight', expected = 1) {
  await page.waitForFunction(sel => [...document.querySelectorAll(sel)].length > 0, {}, sel);
  await page.waitForFunction(sel => [...document.querySelectorAll(sel)].every(img => {
    if (!img.complete || !img.naturalWidth) return false;
    for (let el = img; el; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    return true;
  }), {}, sel);
  const imgs = await page.evaluate(async sel => {
    const out = [];
    for (const img of document.querySelectorAll(sel)) {
      try { await img.decode(); } catch {}
      img.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const r = img.getBoundingClientRect();
      let visible = r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
      for (let el = img; el; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) visible = false;
      }
      let ink = 0;
      if (img.naturalWidth) {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 10) ink++;
      }
      out.push({ src: img.currentSrc, width: img.naturalWidth, ink, visible });
    }
    return out;
  }, sel);
  assert.equal(imgs.length, expected, `${sel}: expected ${expected} images, got ${imgs.length}`);
  const match = morph === 'base' ? /\/C5\.png$/ : /\/C5__midnight\.png$/;
  assert(imgs.every(i => match.test(i.src) && i.width > 0 && i.ink > 0 && i.visible), JSON.stringify(imgs));
  return imgs.map(i => i.src.replace(/.*\/assets/, 'assets')).join(', ');
}
const equip = async iid => {
  await click(`#stableBody [data-kin="${iid}"]`);
  await click(`#stableBody [data-eq="${iid}"]`); // REAL production EQUIP control.
  await page.waitForFunction(async iid => (await import('/js/loot.js')).equippedPetIid().then(x => x === iid), {}, iid);
};
try {
  await page.evaluate(async () => {
    assertDemo();
    function assertDemo() { if (!new URLSearchParams(location.search).has('demo')) throw Error('demo required'); }
    const { kvSet } = await import('/js/db.js');
    await kvSet('petInst', [
      { iid: 'laneC-base', sp: 'C5', lineage: 0, shiny: false, morph: 'base', hatchedAtSteps: 0 },
      { iid: 'laneC-midnight', sp: 'C5', lineage: 0, shiny: false, morph: 'midnight', hatchedAtSteps: 0 },
    ]);
    await kvSet('petLvlV', 2);
    await kvSet('petLvlSteps', { 'laneC-base': 0, 'laneC-midnight': 82000 });
    await kvSet('petEquipped', 'laneC-base');
    const { equipped } = await import('/js/loot.js');
    await kvSet('equipped', { ...await equipped(), C: 'C5' });
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2500);
  await dismissOverlays(page);
  const documentId = await page.evaluate(() => (window.__laneCDocument = crypto.randomUUID()));
  // This is the only setup reload. All EQUIP return rows share this document.
  // Six explicit return paths, chosen because QA's six path names were not supplied.
  await row('CONTROL-BASE', () => paint('#heroPetBtn img:not(.pw)', 'base'));
  const returns = [
    ['Done', () => click('#sheets .sheet-close')],
    ['Escape', async () => { await page.keyboard.press('Escape'); await sleep(1000); }],
    ['history-back', async () => { await page.evaluate(() => history.back()); await sleep(1000); }],
    ['Today-tab', async () => { await page.evaluate(() => document.querySelector('[data-tab="today"]').click()); await sleep(1000); }],
    ['Crew-return', async () => { await route('friends'); await route('today'); }],
    ['Pit-return', async () => { await route('pit'); await route('today'); }],
  ];
  for (const [name, leave] of returns) await row(`C2-HERO-${name}`, async () => {
    await today();
    await click('#stableBtn');
    const current = await page.evaluate(async () => (await import('/js/loot.js')).equippedPetIid());
    if (current !== 'laneC-base') await equip('laneC-base');
    await click('#sheets .sheet-close');
    await paint('#heroPetBtn img:not(.pw)', 'base');
    await click('#stableBtn');
    await equip('laneC-midnight');
    await leave();
    assert.equal(await page.evaluate(() => window.__laneCDocument), documentId, 'EQUIP return must not reload the document');
    return paint('#heroPetBtn img:not(.pw)');
  });
  // Leave the chosen instance equipped even if a return-row driver failed.
  await today(); await click('#stableBtn');
  const chosen = await page.evaluate(async () => (await import('/js/loot.js')).equippedPetIid());
  if (chosen !== 'laneC-midnight') await equip('laneC-midnight');
  await row('C2-STABLE', () => paint('#stableBody .cf-card.active .cf-art img:not(.pw)'));
  await row('C2-PADDOCK-FIELD', async () => {
    await click('#stableToPaddock');
    return paint('#pdkScene [data-iid="laneC-midnight"] img:not(.pw)');
  });
  await row('C1-PADDOCK-CARD', async () => {
    await click('#pdkScene [data-iid="laneC-midnight"]');
    const text = await page.$eval('.pdk-card[data-iid="laneC-midnight"] .pdk-lv', e => e.textContent.trim());
    assert.equal(text, 'LV 10', `82000 steps: ${text}, expected LV 10`);
    return text;
  });
  await today();
  const profile = await page.evaluate(() => window.__socialSnapshot());
  assert.equal(profile.pet.morph, 'midnight', 'real profile snapshot must carry equipped morph');
  // The viewer now wears base. Foreign renderers must use the exported midnight
  // snapshot, never the viewer's current cache. No remote account is written.
  await click('#stableBtn'); await equip('laneC-base');
  await click('#sheets .sheet-close');
  await row('C2-FRIEND-PADDOCK', async () => {
    await page.evaluate(profile => window.__openFriendProfile({ playerId: 'laneC-friend', name: 'Lane C', lastSeen: Date.now(), profile }), profile);
    await paint('.fp-pet img:not(.pw)');
    await click('#fpYardGo');
    const index = profile.yard.pets.findIndex(p => p.sp === 'C5' && p.morph === 'midnight');
    assert(index >= 0);
    // Visitor pets are not tappable, but the scene retains the instance DOM key.
    return paint(`#pdkScene [data-iid="y${index}"] img:not(.pw)`);
  });
  await row('C2-CREW-HERO', async () => {
    await today();
    await page.evaluate(profile => {
      window.__testMe = { name: 'Lane C', friendCode: 'BONE-0000' };
      window.__testFriends = { incoming: [], outgoing: [], friends: [{ playerId: 'laneC-friend', name: 'Lane C', lastSeen: Date.now(), profile }] };
    }, profile);
    await route('friends');
    return paint('.cfan-pet img:not(.pw)');
  });
  await today(); await click('#stableBtn'); await equip('laneC-midnight');
  await click('#sheets .sheet-close');
  await row('C2-LEVEL-UP', async () => {
    await today();
    await page.evaluate(() => { window.__levelUpMoment({ levelUp: { level: 2, name: 'Bone Beginner', into: 0, need: 310 }, fromLevel: 1, levelRewards: { coins: 120, crates: 1, dust: 0 }, ms: null }); });
    return paint('.lu-avatar img[src*="C5"]');
  });
  await row('C2-PIT', async () => {
    await today();
    await page.evaluate(() => { window.__denFight(1.45, 0, { name: 'Lane C' }); });
    return paint('#petStage img:not(.pw)');
  });
  await row('C2-BONEYARD-MARKER', async () => {
    await today();
    await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
    await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207 });
    await route('boneyard');
    return paint('.map-you-av img[src*="C5"]');
  });
  // Splash only exists at boot. Persistence proof, not a same-session cache proof.
  await row('C2-SPLASH', async () => {
    await page.goto(base.replace(/\/?$/, '/') + '?demo&splash=1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#splash .splash-mark', { visible: true });
    return paint('#splash .splash-stage img[src*="C5"]');
  });
  await sleep(3500);
  await dismissOverlays(page);
  // Match QA's 31-image fixture: 30 grid cells and one owned species row.
  await page.evaluate(async () => {
    const { kvSet } = await import('/js/db.js');
    await kvSet('petInst', [{ iid: 'laneC-cloud', sp: 'C1', lineage: 0, shiny: false, morph: 'base', hatchedAtSteps: 0 }]);
    await kvSet('petEquipped', 'laneC-cloud');
    const { equipped } = await import('/js/loot.js');
    await kvSet('equipped', { ...await equipped(), C: 'C1' });
  });
  for (const dpr of [2, 3]) for (const [width, height] of [[393, 852], [320, 568], [402, 874], [430, 932], [440, 956]]) {
    await row(`C3-ART-${width}x${height}-DPR${dpr}`, async () => {
      await setWidth(page, width, height, dpr);
      assert.equal(await page.evaluate(() => devicePixelRatio), dpr, 'browser must use requested DPR');
      await today(); await click('#stableBtn'); await click('#kennelBtn');
      const rows = await page.evaluate(async () => {
        const out = [];
        for (const cell of document.querySelectorAll('.k-cell, .k-row .k-thumb')) {
          const img = cell.querySelector('img');
          try { await img?.decode(); } catch {}
          out.push({ source: img?.currentSrc, ratio: img?.naturalWidth ? img.getBoundingClientRect().width * devicePixelRatio / img.naturalWidth : null });
        }
        return out;
      });
      assert.equal(rows.length, 31, 'empty or incomplete ART sample');
      const over = rows.filter(r => r.ratio == null || r.ratio <= 0 || r.ratio > 1.4);
      const worst = Math.max(...rows.map(r => r.ratio || Infinity));
      assert.equal(over.length, 0, `worst ${worst.toFixed(3)}, ${over.length}/31 over 1.4`);
      return `worst ${worst.toFixed(3)}, 0/31 over 1.4`;
    });
  }
  await row('PAGEERRORS', async () => { assert.deepEqual(errors, []); return 'no uncaught application errors'; });
} finally {
  await browser.close();
}
process.exitCode = failures ? 1 : 0;
