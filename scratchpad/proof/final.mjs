/* FINAL proof set: every surface of the football kit, live DOM, dsf2, for Tom.
 * Extends capture.mjs (same boot/seed/goShop pattern from tests/godmode.js,
 * same equip-via-import('/js/loot.js') trick). NOT a test, no exit-code
 * contract: it captures real screenshots and prints a report. Run with:
 *   HEADLESS_MODE=shell node scratchpad/proof/final.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, settle, setWidth, serveTree, sleep } from '../../tests/godmode.js';
import { FOOTBALL_TEAMS, footballItemId } from '../../data/football-teams.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(HERE, 'final');
fs.mkdirSync(OUT, { recursive: true });

let fails = 0;
const fail = msg => { console.error(`MISSING/FAIL: ${msg}`); fails++; };
const shots = [];

const pngSize = p => {
  const buf = fs.readFileSync(p);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
};

const TEAM_A = FOOTBALL_TEAMS[0].id;        // boneyard-bruisers
const TEAM_B = 'windrow-wasps';
const TEAM_LOCKED = 'glasswater-gannets';   // never granted a single id: stays locked for the rail shot
const SOLD_KEYS = ['helmet', 'jersey', 'cleats', 'pet-helmet', 'pet-jersey'];

async function main() {
  const srv = await serveTree(ROOT);
  const { browser, page } = await boot(srv.url);
  page.on('pageerror', e => console.error('PAGEERROR', e.stack || e.message));

  try {
    await seed(page, { level: 20, coins: 400000 });
    await setWidth(page, 430, 932); // dsf2, every surface

    /* HIDE, NEVER REMOVE. #toast is a single static element in index.html
       (never recreated), toggled via .hidden by app.js's own toast()/nextToast().
       capture.mjs's clean() called .remove() on it, which is harmless there
       (no later shot needs a toast) but permanently kills the element for the
       rest of the page session: the shop-broke shot below needs a REAL toast to
       render after this runs, and app.js's nextToast() does `$('#toast').hidden
       = false` with no re-creation path, so a removed #toast throws null on
       every toast for the rest of the run (measured: TypeError inside
       nextToast the first time this script called toast() after a clean()). */
    const clean = () => page.evaluate(() => {
      const t = document.querySelector('#toast');
      if (t) { t.hidden = true; t.classList.remove('out'); t.textContent = ''; }
    });
    const freeze = () => page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });

    const rectOf = sel => page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el || !document.contains(el)) return null;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return null;
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, sel);

    const shootEl = async (sel, file, label, { skipClean = false } = {}) => {
      if (!skipClean) await clean();
      await freeze(); await settle(page);
      const r = await rectOf(sel);
      if (!r) { fail(`${label}: selector not found / zero-rect: ${sel}`); return null; }
      const h = await page.$(sel);
      await h.evaluate(n => n.scrollIntoView({ block: 'center' }));
      await settle(page);
      const r2 = await rectOf(sel);
      console.log(`RECT ${label} ${sel} -> ${JSON.stringify(r2)}`);
      const fp = path.join(OUT, file);
      await h.screenshot({ path: fp });
      const sz = pngSize(fp);
      shots.push({ label, file: fp, ...sz });
      console.log(`WROTE ${label} -> ${fp} (${sz.w}x${sz.h})`);
      return fp;
    };

    const shootClip = async (rect, file, label) => {
      await clean(); await freeze(); await settle(page);
      const fp = path.join(OUT, file);
      await page.screenshot({ path: fp, clip: rect });
      const sz = pngSize(fp);
      shots.push({ label, file: fp, ...sz });
      console.log(`WROTE ${label} -> ${fp} (${sz.w}x${sz.h})`);
      return fp;
    };

    // Full-viewport shot, no clip, used once for the toast (no clean(): the
    // toast IS the point of this one shot).
    const shootView = async (file, label) => {
      await freeze(); await settle(page);
      const fp = path.join(OUT, file);
      await page.screenshot({ path: fp });
      const sz = pngSize(fp);
      shots.push({ label, file: fp, ...sz });
      console.log(`WROTE ${label} -> ${fp} (${sz.w}x${sz.h})`);
      return fp;
    };

    const setFbTeam = async teamId => {
      const ok = await page.evaluate(t => {
        const el = document.querySelector('#fbTeam');
        if (!el) return false;
        el.value = t;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, teamId);
      if (!ok) fail('#fbTeam select not found (setFbTeam)');
      await sleep(1500);
      await settle(page);
    };

    const gotoHash = async h => {
      const cur = await page.evaluate(() => location.hash);
      if (cur === h) { await page.evaluate(() => { location.hash = '#/today'; }); await sleep(400); }
      await page.evaluate(hh => { location.hash = hh; }, h);
      await sleep(h === '#/shop' ? 3200 : 2600);
      await settle(page);
      await clean();
    };

    const grantOne = id => page.evaluate(async i => {
      const loot = await import('/js/loot.js');
      await loot.grantCosmetic(i, 'football');
    }, id);

    const grantAllTeams = garmentKey => page.evaluate(async (team, key) => {
      const loot = await import('/js/loot.js');
      const fb = await import('/data/football-teams.js');
      const ids = fb.footballGrantIds(fb.footballItemId(team, key));
      for (const gid of ids) await loot.grantCosmetic(gid, 'football');
      return ids.length;
    }, TEAM_A, garmentKey);

    const equipOnly = (slot, id) => page.evaluate(async ([s, i]) => {
      const loot = await import('/js/loot.js');
      await loot.equip(s, i);
    }, [slot, id]);

    const petWearSet = async (slot, id) => page.evaluate(async ([s, i]) => {
      const loot = await import('/js/loot.js');
      const w = await loot.petWear();
      if (w[s] !== i) await loot.togglePetWear(i);
    }, [slot, id]);

    const openKitRoom = async () => {
      const isOpen = await page.evaluate(() => !!document.querySelector('#fbSect')?.open);
      if (!isOpen) {
        const summary = await page.$('#fbSect > summary.t3-drop.fb-drop');
        if (!summary) { fail('kit room: summary selector missing'); return; }
        await summary.click();
        await sleep(600);
      }
    };

    // ============================== SHOT 1: POSTERS ==============================
    await gotoHash('#/shop');
    for (const team of [TEAM_A, TEAM_B]) {
      if (team === TEAM_B) await setFbTeam(TEAM_B);
      const bannerSel = '#fbSect > summary.t3-drop.fb-drop';
      const r = await rectOf(bannerSel);
      if (!r) { fail(`shop-poster-${team}: selector missing: ${bannerSel}`); continue; }
      console.log(`RECT shop-poster-${team} ${JSON.stringify(r)}`);
      const pad = 40;
      await shootClip({ x: Math.max(0, r.x), y: Math.max(0, r.y - pad), width: r.width, height: r.height + pad * 2 },
        `shop-poster-${team}.png`, `shop-poster-${team}`);
    }
    await setFbTeam(TEAM_A);

    // ============================== SHOT 2: KIT ROOM 0 / 3 OWNED ==============================
    await openKitRoom();
    await shootEl('.drop-grid', 'shop-kitroom-open.png', 'shop-kitroom-open (0 owned)');

    const helmetA = footballItemId(TEAM_A, 'helmet');
    const jerseyA = footballItemId(TEAM_A, 'jersey');
    const cleatsA = footballItemId(TEAM_A, 'cleats');
    await grantOne(helmetA); await grantOne(jerseyA); await grantOne(cleatsA);

    await gotoHash('#/shop');
    await setFbTeam(TEAM_A);
    await openKitRoom();
    const bundleInfo = await page.evaluate(() => {
      const b = document.querySelector('.drop-item.fb-bundle .drop-buy');
      const owned = [...document.querySelectorAll('.drop-item.fb:not(.fb-bundle)')]
        .map(t => ({ label: t.querySelector('b')?.textContent.trim(), owned: t.classList.contains('owned'), btn: t.querySelector('.drop-buy')?.textContent.trim() }));
      return { bundleAmt: b?.dataset.amt || null, bundleText: b?.textContent.trim() || null, owned };
    });
    console.log(`KIT ROOM 3-OWNED: bundle data-amt=${bundleInfo.bundleAmt}, bundle text="${bundleInfo.bundleText}"`);
    console.log(`  tiles: ${JSON.stringify(bundleInfo.owned)}`);
    if (bundleInfo.bundleAmt !== '8400') fail(`bundle should quote 8400 with 3 of 5 owned, saw ${bundleInfo.bundleAmt}`);
    await shootEl('.drop-grid', 'shop-kitroom-3owned.png', 'shop-kitroom-3owned (3 owned)');

    // ============================== SHOT 3: BROKE ==============================
    await seed(page, { coins: 1000, reload: true });
    await gotoHash('#/shop');
    await setFbTeam(TEAM_A);
    await openKitRoom();
    const cantRect = await rectOf('.drop-buy.cant');
    console.log(`RECT shop-broke .drop-buy.cant -> ${JSON.stringify(cantRect)}`);
    const cantBtn = cantRect ? await page.$('.drop-buy.cant') : null;
    if (!cantBtn) fail('shop-broke: no .drop-buy.cant button found / zero-rect (wallet not below every remaining price?)');
    else {
      await cantBtn.click();
      await sleep(500);
      const toastRect = await rectOf('#toast');
      const toastText = await page.evaluate(() => document.querySelector('#toast')?.textContent.trim() || null);
      console.log(`RECT shop-broke #toast -> ${JSON.stringify(toastRect)}`);
      console.log(`TOAST TEXT: "${toastText}"`);
      if (!toastRect) fail('shop-broke: #toast has no visible rect after tapping a cant button');
      await shootView('shop-broke.png', 'shop-broke (cant pills + shortfall toast)');
    }

    // ============================== SHOT 4: WARDROBE RAIL (locked team) ==============================
    await equipOnly('H', helmetA);
    await gotoHash('#/bonehead'); // lands on Wardrobe tab (renderBonehead defaults pendingHubTab -> 'wardrobe')
    const slid = await page.evaluate(t => {
      const rail = document.querySelector('.fb-rail');
      if (!rail) return false;
      const cell = [...rail.querySelectorAll('[data-fbteam]')].find(c => c.dataset.fbteam === t);
      if (!cell) return false;
      const cr = cell.getBoundingClientRect(), rr = rail.getBoundingClientRect();
      rail.scrollLeft = rail.scrollLeft + (cr.left - rr.left) - (rail.clientWidth - cr.width) / 2;
      return true;
    }, TEAM_LOCKED);
    if (!slid) fail('wardrobe-rail: .fb-rail (or its locked-team tile) not found');
    else {
      await page.evaluate(async () => {
        const rail = document.querySelector('.fb-rail');
        let last = NaN, same = 0;
        for (let i = 0; i < 90 && same < 3; i++) {
          await new Promise(r => requestAnimationFrame(r));
          if (rail.scrollLeft === last) same++; else { same = 0; last = rail.scrollLeft; }
        }
      });
      await settle(page);
      const barText = (await page.evaluate(() => document.querySelector('.fb-bar')?.textContent || '')).replace(/\s+/g, ' ').trim();
      const lockedTiles = await page.evaluate(() => [...document.querySelectorAll('.fb-rail .pw-item.locked small')].map(n => n.textContent.trim()));
      console.log(`fb-bar text: "${barText}"`);
      console.log(`locked tile tags (first 6): ${JSON.stringify(lockedTiles.slice(0, 6))}`);
      if (!/4,200/.test(barText) || !/32 teams/.test(barText)) fail(`wardrobe-rail: bar text does not read "4,200 · all 32 teams" (saw "${barText}")`);
      await shootEl('.fb-rail-wrap', 'wardrobe-rail.png', 'wardrobe-rail (locked team centred)');
    }

    // ============================== GRANT THE FULL KIT, ALL 32 TEAMS ==============================
    // Real footballGrantIds semantics for every sold garment, so the hat family
    // badge reads 32 and both teams' full kits (H/T/FW) plus the lizard's CH/CT
    // are equippable below. Idempotent over the single ids already granted above.
    for (const key of SOLD_KEYS) {
      const n = await grantAllTeams(key);
      console.log(`GRANTED ${key}: ${n} ids across all teams (footballGrantIds)`);
    }

    // ============================== SHOT 5: WARDROBE HAT FAMILY (32 badge) ==============================
    await gotoHash('#/bonehead'); // still lands on Wardrobe, slot defaults to 'H'
    const famSel = 'H:file:assets/bh/football/helmet.png';
    const famBtnSel = await page.evaluate(k => {
      const b = [...document.querySelectorAll('.ward-cell.fam[data-family]')].find(x => x.dataset.family === k);
      if (!b) return null;
      if (!b.id) b.id = 'proofHelmetFam';
      return '#' + b.id;
    }, famSel);
    if (!famBtnSel) fail(`wardrobe-hat-families: no .ward-cell.fam[data-family="${famSel}"] tile found`);
    else {
      const badge = await page.evaluate(s => document.querySelector(s)?.querySelector('.ward-fam-n')?.textContent.trim(), famBtnSel);
      console.log(`hat family badge reads: "${badge}"`);
      if (badge !== '32') fail(`wardrobe-hat-families: badge should read 32, saw "${badge}"`);
      await shootEl(famBtnSel, 'wardrobe-hat-families.png', 'wardrobe-hat-families (helmet family, 32 badge)');
    }

    // ============================== SHOT 6: DOLL FULL KIT x2 TEAMS + LIZARD ==============================
    await page.evaluate(async () => { const loot = await import('/js/loot.js'); await loot.grantPet('C4'); await loot.equip('C', 'C4'); });
    const wearTeamOnDoll = async (team, label, file) => {
      await equipOnly('H', footballItemId(team, 'helmet'));
      await equipOnly('T', footballItemId(team, 'jersey'));
      await equipOnly('FW', footballItemId(team, 'cleats'));
      await petWearSet('CH', footballItemId(team, 'pet-helmet'));
      await petWearSet('CT', footballItemId(team, 'pet-jersey'));
      /* PET WEAR NEEDS A RELOAD, EQUIP DOES NOT. equipped() is a fresh IndexedDB
         read on every render, but petWornLayers reads S.petWear, a client-side
         cache populated by refreshPetWear() (js/app.js), and togglePetWear()
         above only wrote the kv row -- nothing refreshes the cache without a
         reload. Measured: without this, the lizard rendered bare on both team
         shots despite CH/CT being owned and toggled on in storage. Same fix
         football-render-audit.mjs's wearTeam() already uses. */
      await page.reload({ waitUntil: 'networkidle2' });
      await sleep(2400);
      // force a re-render on the hub's non-wardrobe tab: .bh-stage.lg there does
      // NOT skip the companion pet ('C'), unlike the wardrobe dressing room's own.
      const chip = await page.$('#chTabs [data-tab="talents"]');
      if (!chip) { fail(`${label}: #chTabs [data-tab="talents"] chip not found`); return; }
      await chip.click();
      await sleep(700);
      await settle(page);
      const dbg = await page.evaluate(async ([hId, jId, cId, chId, ctId]) => {
        const loot = await import('/js/loot.js');
        const eq = await loot.equipped();
        const owned = await loot.ownedCosmeticIds();
        return {
          eqC: eq.C, eqH: eq.H, eqT: eq.T, eqFW: eq.FW,
          petWearNow: await loot.petWear(),
          ownsCH: owned.has(chId), ownsCT: owned.has(ctId),
        };
      }, [footballItemId(team, 'helmet'), footballItemId(team, 'jersey'), footballItemId(team, 'cleats'), footballItemId(team, 'pet-helmet'), footballItemId(team, 'pet-jersey')]);
      console.log(`DEBUG ${label}: ${JSON.stringify(dbg)}`);
      await shootEl('.bh-stage.lg', file, label);
    };
    await wearTeamOnDoll(TEAM_A, 'doll-fullkit-teamA (H/T/FW + lizard CH/CT)', `doll-fullkit-${TEAM_A}.png`);
    await wearTeamOnDoll(TEAM_B, 'doll-fullkit-teamB (H/T/FW + lizard CH/CT)', `doll-fullkit-${TEAM_B}.png`);

    /* BONUS, NOT ONE OF THE 10 REQUESTED FILES. `.bh-stage.lg`'s companion layer
       (avatarLayersHtml, s.code==='C') draws ONLY the bare species PNG for a pet
       that petStacksOnBody() -- C4 and CX included -- with no accessory
       compositing at all; CH/CT only ever paint through the separate
       petWornLayers stack (js/app.js), which is what #bhStage's own
       .hero-companion (the Today screen) and the Stable's .cf-card .cf-art use.
       So doll-fullkit-*.png above are correct AS SHOT (full kit + a bare
       lizard on .bh-stage.lg, exactly what that selector ever shows) but
       cannot depict the lizard's own kit. This extra shot is the real proof
       that CH/CT actually render, on the one surface that draws them. */
    await gotoHash('#/today');
    await shootEl('#bhStage .hero-companion', 'BONUS-pet-companion-today.png',
      'BONUS: lizard wearing CH/CT on #bhStage .hero-companion (not requested; .bh-stage.lg cannot show this)');

    // ============================== SHOT 7: STABLE PET-WEAR PANEL ==============================
    const c4Iid = await page.evaluate(async () => {
      const loot = await import('/js/loot.js');
      const insts = await loot.petInstances();
      return (insts.find(x => x.sp === 'C4') || {}).iid || null;
    });
    if (!c4Iid) fail('stable-petwear: no C4 pet instance found');
    else {
      await page.evaluate(async iid => { const loot = await import('/js/loot.js'); await loot.setEquippedPet(iid); }, c4Iid);
      await page.reload({ waitUntil: 'networkidle2' });
      await sleep(2400);
      await page.evaluate(() => { location.hash = '#/pets'; });
      await sleep(900);
      await page.evaluate(() => document.getElementById('stableBtn')?.click());
      await sleep(1700);
      await settle(page);
      await shootEl('.pet-wear:not([hidden])', 'stable-petwear.png', 'stable-petwear (collapsed lizard family tiles)');
    }

    // ============================== REPORT ==============================
    console.log('\n=== SHOTS ===');
    for (const s of shots) console.log(`${s.label}: ${s.file} (${s.w}x${s.h})`);

  } finally {
    await browser.close().catch(() => {});
    srv.close();
  }
  console.log(fails ? `\n${fails} step(s) missing, see MISSING/FAIL above.` : '\nAll shots captured, nothing missing.');
  process.exit(fails ? 1 : 0);
}

main().catch(e => { console.error('SCRIPT ERROR', e); process.exit(1); });
