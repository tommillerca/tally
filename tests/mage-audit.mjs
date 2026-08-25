/* THE LIVE WIRE. Tom, 2026-08-09: "we need a popup for the new boss art. i want
   some dens to always be the new mage."
   Three things have to be true, and each has a way of quietly not being:
   the dens must be HIS PERMANENTLY (a weekly reroll would look identical on any
   one day), the fight must draw the illustration and never mirror it (mirroring
   flips his chain, his pointing hand and his lightning), and the poster art has
   to actually decode (a broken <img> measures perfectly).
   Proven red against v352: no mage theme existed at all. */
import { MAGE_CELL_SHARE } from '../js/poi.js';
import { boot, sleep, settle, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srvHandle.url;
const { browser, page } = await boot(base, { seed: true });
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

/* ---- his dens are his, and they do not rotate ---- */
const dens = await page.evaluate(async () => {
  const m = await import('./js/poi.js');
  const weeks = ['2026-W32', '2026-W33', '2026-W40', '2027-W01'];
  /* test the stability claim somewhere that HAS one of his dens. Vancouver has
     none, and a neighbourhood of nine dots looks perfectly stable while proving
     nothing: an empty sample is a failure, not a pass. */
  let at = null;
  for (let la = -50; la <= 50 && !at; la += 3.7) for (let ln = -175; ln <= 175 && !at; ln += 6.3) {
    if (m.densNear('2026-W32', la, ln).some(d => !d.roaming && d.theme.key === 'mage')) at = [la, ln];
  }
  const byWeek = at ? weeks.map(w => m.densNear(w, at[0], at[1])
    .filter(d => !d.roaming).map(d => `${d.id}:${d.theme.key === 'mage' ? 'M' : '.'}`).sort().join(',')) : [];
  const mageInSample = at ? byWeek[0].split(',').filter(x => x.endsWith(':M')).length : 0;
  // and the share across a wide sweep, so "some dens" is not "almost none"
  let mage = 0, tot = 0, empty = 0, spots = 0;
  for (let la = -55; la <= 55; la += 6.5) for (let ln = -175; ln <= 175; ln += 9.5) {
    const all = m.densNear('2026-W32', la, ln).filter(d => !d.roaming);
    if (!all.length) continue;
    spots++; tot += all.length;
    const k = all.filter(d => d.theme.key === 'mage').length;
    mage += k; if (!k) empty++;
  }
  return { stable: byWeek.length === weeks.length && new Set(byWeek).size === 1, sample: byWeek[0] || 'NO SAMPLE',
           mageInSample,
           share: +(mage / tot * 100).toFixed(1), noneNearby: +(empty / spots * 100).toFixed(1) };
});
ok('the sample actually contains one of his dens', dens.mageInSample > 0,
  `${dens.mageInSample} mage dens in the tested neighbourhood`);
ok('the same dens are his every week', dens.stable && dens.mageInSample > 0, dens.sample);
/* THE CHECK TRACKS THE SETTING, NOT A MAGIC NUMBER. Tom moved his share from a
   quarter to a half on 2026-08-10 ("because he's new eventually we can move to
   1/4") and this line failed on 51.1%, which is the gate working but also a
   check that has to be hand-edited every time a designer changes their mind.
   It now reads MAGE_CELL_SHARE and asserts the MAP AGREES WITH IT, within the
   spread you get from hashing cells. Moving back to 0.25 needs no edit here, and
   a share that silently stops matching the constant still fails. */
const wantShare = MAGE_CELL_SHARE * 100;
ok('the map matches the configured share', Math.abs(dens.share - wantShare) <= 8,
  `${dens.share}% against a configured ${wantShare}%`);
ok('almost nobody has none nearby', dens.noneNearby <= 15, `${dens.noneNearby}% of neighbourhoods have no mage den`);

/* ---- the fight draws HIM, facing the right way ---- */
await page.evaluate(async () => { await window.__denFight(1.4, 0, { mage: true }); });
await sleep(500); await settle(page); await sleep(1200);
const fight = await page.evaluate(async () => {
  const st = document.getElementById('foeStage');
  if (!st) return { none: true };
  const im = st.querySelector('.mage-plate');
  if (im) await im.decode().catch(() => {});
  const b = st.getBoundingClientRect();
  return {
    plate: !!im, drawn: im ? im.naturalWidth > 0 : false,
    mirrored: !!st.querySelector('.mirror-wrap'),
    flipped: im ? /matrix\(-|scaleX\(-/.test(getComputedStyle(im).transform) : false,
    w: Math.round(b.width), h: Math.round(b.height),
    /* .bh-anim is what avatarLayersHtml actually returns (js/app.js:2564).
       This counted '.bh-layer, .tz-layer', and NEITHER STRING EXISTS ANYWHERE
       in the app, so the count was always 0 and "it is not built from
       cosmetics" was always true: a check that could not fail, sitting in the
       FAST gate. Found by tests/selector-audit.mjs, which is the entire reason
       that sweep was written. */
    stack: st.querySelectorAll('.bh-anim').length,
    /* POSITIVE CONTROL, so this can never go vacuous again. If the selector
       stops matching anything anywhere, THIS goes to 0 and the run fails,
       instead of the absence quietly reading as success. The Bonehead on
       Today is drawn by the same helper. */
    controlStacks: document.querySelectorAll('.bh-anim').length,
  };
});
ok('the fight draws the illustration', fight.plate && fight.drawn, JSON.stringify(fight));
ok('CONTROL the avatar-stack selector still matches real avatars somewhere',
  fight.controlStacks > 0, `${fight.controlStacks} .bh-anim stacks in the document`);
ok('it is not built from cosmetics', fight.stack === 0, `${fight.stack} avatar layers in the foe stage`);
ok('it is never mirrored', !fight.mirrored && !fight.flipped, `mirror-wrap=${fight.mirrored} flipped=${fight.flipped}`);
ok('he is big enough to read', fight.w >= 120 && fight.h >= 120, `${fight.w}x${fight.h}`);

/* ---- the announcement ---- */
await page.evaluate(() => { document.querySelector('.sheet-close')?.click(); });
await sleep(700);
/* __mageForce went with maybeShowMageIntro on 2026-08-25: nothing reads it now
   that the card no longer shows itself. __mageIntro is the direct hook and is
   unchanged. */
await page.evaluate(() => { window.__mageIntro(); });
await sleep(900); await settle(page);
const pop = await page.evaluate(async () => {
  const v = document.querySelector('.mage-veil');
  if (!v) return { none: true };
  const im = v.querySelector('.mage-poster');
  if (im) await im.decode().catch(() => {});
  /* the INK, not the box: .drop-eyebrow is a full-width centred block, so its
     rect always reaches under the pill while the letters sit nowhere near it.
     A Range around the text node measures what a person actually sees. */
  const inkOf = el => { if (!el) return null; const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
  const eb = inkOf(v.querySelector('.drop-eyebrow'));
  const pill = v.querySelector('.drop-count')?.getBoundingClientRect();
  return {
    title: v.querySelector('.drop-title')?.textContent.trim() || '',
    drawn: im ? im.naturalWidth > 0 : false,
    w: Math.round(im?.getBoundingClientRect().width || 0),
    collides: !!(eb && pill && eb.right > pill.left && eb.top < pill.bottom && eb.bottom > pill.top),
    scrolls: v.scrollHeight > v.clientHeight + 4,
  };
});
ok('the announcement exists and names him', /live wire/i.test(pop.title), pop.title);
ok('his art actually decodes', pop.drawn && pop.w >= 200, JSON.stringify(pop));
ok('the eyebrow clears the NEW pill', !pop.collides, `collides=${pop.collides}`);
ok('it fits one screen', !pop.scrolls, `scrolls=${pop.scrolls}`);

/* ---- EVERY SURFACE. Tom, 2026-08-09: "before you push it live make sure that
   it is properly rolled out. the way itll be in boss dens, the way itll appear
   in the pit, the pop up, the banner ETC. adding to the news tab."
   So this drives each surface rather than trusting that I remembered it. ---- */
await page.evaluate(() => document.querySelector('.mage-veil')?.remove());

const surfaces = await page.evaluate(async () => {
  const poi = await import('./js/poi.js');
  const pit = await import('./js/pit.js');
  const out = {};

  // 1. THE PIT: he owns a repeating Gauntlet rung and carries his art
  const ranks = [...Array(30)].map((_, i) => pit.endlessFoe(i + 1));
  const mageRanks = ranks.filter(f => f.mage);
  out.pit = {
    ranks: mageRanks.map(f => f.rank),
    named: mageRanks.every(f => /live wire/i.test(f.name)),
    art: mageRanks.every(f => (f.art || '').includes('mage')),
    clashesWithGlutton: ranks.some(f => f.mage && f.glutton),
  };

  // 2. BOSS DENS: pinned, permanent, and the theme carries the art marker
  const den = poi.densNear('2026-W32', -50, -175).find(d => !d.roaming && d.theme.key === 'mage');
  out.den = { found: !!den, art: den && den.theme.art === 'mage', boss: den && den.boss, name: den && den.name };

  // 3. THE REMOTE DEN (what the Today row names) can be him
  const days = [...Array(60)].map((_, i) => `2026-08-${String((i % 28) + 1).padStart(2, '0')}`);
  const mageDays = days.filter(d => poi.remoteDen(d).theme.art === 'mage');
  out.remote = { share: +(mageDays.length / days.length * 100).toFixed(0), day: mageDays[0] || null };
  return out;
});
ok('the Pit gives him his own rungs', surfaces.pit.ranks.length >= 3, `ranks ${surfaces.pit.ranks.join(', ')}`);
ok('those rungs are named and drawn as him', surfaces.pit.named && surfaces.pit.art, JSON.stringify(surfaces.pit));
ok('he never lands on a Glutton rung', !surfaces.pit.clashesWithGlutton);
ok('boss dens carry his art marker', surfaces.den.found && surfaces.den.art, JSON.stringify(surfaces.den));
ok('the daily remote den can be him', surfaces.remote.share >= 8 && surfaces.remote.share <= 25,
  `${surfaces.remote.share}% of days`);

/* 4. THE MAP PIN and 5. THE DEN SHEET, built and opened for real. buildDenPin is
   the same function the map calls, so this cannot pass on a copy that has since
   drifted, and the sheet is really opened rather than reasoned about. */
const mapAndSheet = await page.evaluate(async () => {
  const mine = window.__denPinHtml('mage');
  /* ASK FOR A THEME THAT IS ACTUALLY ON THE MAP THIS WEEK, using the same week
     and spot __denPinHtml itself resolves against. Naming 'gate' was a calendar
     coin flip: non-mage den themes reroll weekly (js/poi.js wkRng is seeded on
     week+cell) while mage cells are seeded on the cell alone and never rotate,
     so this spot has a gate den in only 26 of 2026's 52 weeks. In the other 26
     __denPinHtml returned null, and /tombstone/.test(null || '') is false, so an
     EMPTY SAMPLE scored as "the pin changed". Written 2026-08-09 in week W32,
     which has a gate den; measured red 2026-08-18 in W34, which does not. It was
     a 50/50 the whole time and only surfaced when the release gate was unblocked
     and actually ran this suite. */
  const poi = await import('./js/poi.js');
  const otherKey = poi.densNear(poi.isoWeekKey(new Date()), -50, -175)
    .find(d => !d.roaming && d.theme.key !== 'mage')?.theme.key || null;
  const other = otherKey ? window.__denPinHtml(otherKey) : null;
  const opened = await window.__openDen('mage');
  await new Promise(r => setTimeout(r, 900));
  const hero = document.querySelector('.den-hero .art img');
  if (hero) await hero.decode().catch(() => {});
  return {
    otherKey,
    pinTellsNothing: /tombstone/.test(mine || '') && !/mage/.test(mine || ''),
    otherPinUnchanged: /tombstone/.test(other || '') && !/mage/.test(other || ''),
    pinsIdentical: (mine || '').replace(/mage/g, '') === (other || '').replace(/gate/g, '') || undefined,
    denName: opened && opened.name, denBoss: opened && opened.boss,
    heroSrc: hero ? hero.getAttribute('src') : null,
    heroDrawn: hero ? hero.naturalWidth > 0 : false,
    sub: document.querySelector('.sheet-head .sub')?.textContent.trim() || '',
  };
});
ok('his den is a real place with a name', !!mapAndSheet.denName && !!mapAndSheet.denBoss,
  `${mapAndSheet.denBoss} at ${mapAndSheet.denName}`);
/* THE PIN MUST NOT TELEGRAPH HIM. Tom, 2026-08-10: "You are supposed to go to a
   boss den and be surprised when it's the mage not telegraph it."
   This assertion used to demand the OPPOSITE (his art on his pin), which is the
   thing he objected to, so it is inverted rather than deleted: a future edit that
   puts a drawing back on the map fails here. */
ok('his pin gives nothing away', mapAndSheet.pinTellsNothing, JSON.stringify(mapAndSheet).slice(0, 140));
/* A MISSING SAMPLE FAILS AS A MISSING SAMPLE, not as a regression. Without the
   otherKey half, "no non-mage den was on the map" and "the pin changed" printed
   the identical message, which is what made this take a full gate run to read. */
ok('every other den pin is untouched', !!mapAndSheet.otherKey && mapAndSheet.otherPinUnchanged,
  `${mapAndSheet.otherKey || 'NO NON-MAGE DEN IN THE SAMPLE'}: a tombstone, as before`);
ok('the den sheet shows him, drawn', /mage\.png/.test(mapAndSheet.heroSrc || '') && mapAndSheet.heroDrawn,
  `${mapAndSheet.heroSrc} drawn=${mapAndSheet.heroDrawn}`);
/* his dens are permanent, so the sheet must not promise a Monday reroll */
ok('the sheet does not claim his den rerolls', !/reroll/i.test(mapAndSheet.sub || ''), mapAndSheet.sub);
await page.evaluate(() => document.querySelector('.sheet-close')?.click());
await sleep(700);

/* 6. THE NEWS TAB: he is a row in it, and the row opens his poster */
const news = await page.evaluate(async () => {
  location.hash = '#/friends';
  await new Promise(r => setTimeout(r, 1500));
  document.getElementById('crewWhatsNew')?.click();
  await new Promise(r => setTimeout(r, 1300));
  document.querySelector('[data-wntab="news"]')?.click();
  await new Promise(r => setTimeout(r, 500));
  const row = document.querySelector('[data-news="mage"]');
  if (!row) return { none: true, rows: document.querySelectorAll('[data-news]').length };
  const im = row.querySelector('img');
  if (im) await im.decode().catch(() => {});
  const b = im ? im.getBoundingClientRect() : null;
  row.click();
  await new Promise(r => setTimeout(r, 1400));
  return {
    none: false,
    thumbDrawn: im ? im.naturalWidth > 0 : false,
    thumbSize: b ? Math.round(Math.min(b.width, b.height)) : 0,
    opensPoster: !!document.querySelector('.mage-veil'),
  };
});
ok('he has a row in the News tab', !news.none, JSON.stringify(news));
ok('its thumbnail is drawn, at a size', news.thumbDrawn && news.thumbSize >= 24, JSON.stringify(news));
ok('the row opens his poster', news.opensPoster, JSON.stringify(news));

/* ---- 7. THE PIT FIGHT, through the app's own launch config, and 8. THE TODAY
   ROW on a day he holds the remote den. Both call the same functions the app
   calls, so neither can pass against a copy that has drifted. ---- */
const pitCfg = await page.evaluate(() => ({
  mage: window.__endlessCfg(7),
  glut: window.__endlessCfg(10),
  plain: window.__endlessCfg(3),
}));
ok('the Pit launch carries his flag', pitCfg.mage.mage === true && /live wire/i.test(pitCfg.mage.name),
  JSON.stringify({ name: pitCfg.mage.name, mage: pitCfg.mage.mage }));
ok('it does not leak onto other rungs', pitCfg.plain.mage === false && pitCfg.glut.mage === false,
  `rank3=${pitCfg.plain.mage} rank10=${pitCfg.glut.mage}`);

/* and the fight built from that exact config draws him */
const pitFight = await page.evaluate(async () => {
  document.querySelector('.sheet-close')?.click();
  await new Promise(r => setTimeout(r, 600));
  const cfg = window.__endlessCfg(7);
  await window.__denFight(cfg.mult, 0, { name: cfg.name, mage: cfg.mage, venue: cfg.venue, add: null });
  await new Promise(r => setTimeout(r, 1600));
  const st = document.getElementById('foeStage');
  const im = st?.querySelector('.mage-plate');
  if (im) await im.decode().catch(() => {});
  return { drawn: im ? im.naturalWidth > 0 : false, mirrored: !!st?.querySelector('.mirror-wrap'),
           title: document.querySelector('.sheet-head h2')?.textContent.trim() };
});
ok('a Gauntlet rung of his draws the illustration', pitFight.drawn && !pitFight.mirrored, JSON.stringify(pitFight));

const row = await page.evaluate(async () => {
  document.querySelector('.sheet-close')?.click();
  await new Promise(r => setTimeout(r, 600));
  const poi = await import('./js/poi.js');
  const days = [...Array(60)].map((_, i) => `2026-08-${String((i % 28) + 1).padStart(2, '0')}`);
  const day = days.find(d => poi.remoteDen(d).theme.art === 'mage');
  if (!day) return { none: true };
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:0;top:0;width:398px;z-index:9999';
  holder.innerHTML = window.__todayRow(day);
  document.body.appendChild(holder);
  const im = holder.querySelector('img');
  if (im) await im.decode().catch(() => {});
  const b = holder.querySelector('.bst-fig')?.getBoundingClientRect();
  const out = {
    day, title: holder.querySelector('.gbn-txt b')?.textContent.trim(),
    isPlate: !!holder.querySelector('.mage-plate'),
    drawn: im ? im.naturalWidth > 0 : false,
    size: b ? Math.round(Math.min(b.width, b.height)) : 0,
  };
  holder.remove();
  return out;
});
ok("the Today row is him on his days", !row.none && row.isPlate && /live wire/i.test(row.title || ''),
  JSON.stringify(row));
/* THE SIZE FLOOR MOVED, ON TOM'S INSTRUCTION, AND THIS RECORDS WHY.
   2026-08-09 he rejected a 52px head next to a paragraph and asked for the
   monster itself, so this asserted >= 72px and the row was built at 88.
   2026-08-10 he came back with "the 'out hunting today' banner is bigger than
   the rest": measured 110px against 50 and 51 for its two siblings, which reads
   as a layout fault rather than emphasis. Every row now shares a 72px minimum
   and the figure is 58px inside it, which is still a whole monster and still
   comfortably above the head-plus-paragraph he rejected.
   The floor is 54, not 58: it guards against a collapse back to a thumbnail, and
   pinning it to the exact current value would fail on any harmless tweak. */
// floor only; the SAME-SIZE-as-siblings rule lives in bestiary-audit, which has
// the whole card in view
ok('and it is drawn at a readable size', row.drawn && row.size >= 40, JSON.stringify(row));

/* ---- 9. HE FIGHTS LIKE HIMSELF, and his spells are on screen. The kit and the
   FX were designed with temp art on 2026-08-09 and then nearly shipped unused
   when the real art landed, so this drives a real fight to the end and watches
   what actually happens. ---- */
await page.evaluate(() => document.querySelector('.sheet-close')?.click());
await sleep(700);
await page.evaluate(async () => {
  await window.__denFight(1.2, 0, { name: 'The Live Wire', mage: true });
});
await sleep(600); await settle(page); await sleep(1200);
const combat = await page.evaluate(async () => {
  const lines = new Set();
  let fxMax = 0, amulet = false;
  for (let step = 0; step < 120; step++) {
    const pm = document.querySelector('.fight-act.petmove:not([disabled])');
    const atk = document.querySelector('.fight-act[data-act=swing]:not([disabled])');
    const et = document.getElementById('endTurn');
    if (pm) pm.click(); else if (atk) atk.click(); else if (et && !et.disabled) et.click();
    await new Promise(r => setTimeout(r, 260));
    fxMax = Math.max(fxMax, document.querySelectorAll('.wfx, [class*="wfx"]').length);
    const l = document.getElementById('flog')?.textContent || '';
    if (l) lines.add(l);
    if (/amulet/i.test(l)) amulet = true;
  }
  const casts = [...lines].filter(x => /hollow bolt|wails|reaps|takes the wind|claws its way|amulet/i.test(x));
  return { casts, distinct: casts.length, fxMax, amulet, lines: lines.size };
});
ok('he casts his own moves in a real fight', combat.distinct >= 2,
  `${combat.distinct} of his moves seen: ${combat.casts.join(' / ').slice(0, 160)}`);
ok('his spells are drawn on screen', combat.fxMax > 0, `${combat.fxMax} FX layers at peak`);
ok('the log names what each move did', combat.lines >= 4, `${combat.lines} distinct log lines`);

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nthe Live Wire is live');
await browser.close();
if (srvHandle) srvHandle.close();
process.exit(fails.length ? 1 : 0);
