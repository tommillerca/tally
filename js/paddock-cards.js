/* THE PADDOCK, Lane W: the pet card slider and the collection panel.
 *
 * Everything here is PURE: it takes a roster (from paddock.js paddockRoster) and an
 * egg summary (paddockEggs) and returns view models and markup strings. No db, no
 * DOM, no timers. That is deliberate: the parts that decide WHAT a player reads can
 * then be unit-tested in node with no browser, and the browser audit is left to
 * check the things only a browser can answer (scroll, pops, decoded art, the reload
 * round trip).
 *
 * NAMESPACE IS `.pdk-`, NOT `.pd-`. `.pd-*` is the wardrobe PAPERDOLL
 * (app.css "wardrobe: paperdoll", `.pd-slot/.pd-art/.pd-center/.pd-gear/.pd-stat`,
 * live in renderCharacter). `pd` there means paperdoll. Putting the Paddock in the
 * same namespace would collide on exactly the generic names a card wants, and this
 * project has already shipped that bug once: the reveal rule scoped to `.sheet-body`
 * which the Boneyard reused as a SCREEN class, tied on specificity, and left the map
 * blank (tally/CLAUDE.md, "Scope reveal CSS to the surface it means").
 */
import { BH_ITEMS, bhAsset } from '../data/boneheadz.js';
import { bhIcon } from './icons-pack.js';

export const PET_SPECIES = BH_ITEMS.filter(i => i.slot === 'C');
const SPECIES_BY_ID = Object.fromEntries(PET_SPECIES.map(p => [p.id, p]));

/* The Paddock's rarity colours are the app.css GLOW family (epic rgb 155,146,232,
   legendary 255,201,97), not `RARITIES[r].color` from js/loot.js, which is a second
   and different rarity palette used for text chips elsewhere (#c084fc epic,
   #4ade80 uncommon). The handoff specifies this family and it is what the pet cards
   already glow with, so the screen agrees with itself. If the two palettes are ever
   unified, this map is one of the places to change. */
export const PDK_RARITY = {
  common:    '#8f8578',
  uncommon:  '#a5e847',
  rare:      '#6fd0ff',
  epic:      '#9b92e8',
  legendary: '#ffc961',
};

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Number(n || 0).toLocaleString();

/* ---- models ------------------------------------------------------------- */

/* One card = one OWNED COPY, keyed by iid. Never species+index: the bond is banked
   against the instance, so an index would move the affection to a different animal
   the first time the roster sorts differently. */
export function cardModel(row) {
  const sp = SPECIES_BY_ID[row.sp] || { name: row.sp, rarity: 'common' };
  return {
    iid: row.iid,
    name: row.name || sp.name,
    species: sp.name,
    rarity: sp.rarity,
    rarityColor: PDK_RARITY[sp.rarity] || PDK_RARITY.common,
    shiny: !!row.shiny,
    level: Math.max(1, 1 + Math.floor((row.levelSteps | 0) / 20000)),
    bond: Math.max(0, Math.min(5, row.bond | 0)),
    maxed: (row.bond | 0) >= 5,
    flavor: row.flavor || '',
    art: bhAsset(sp.id ? sp : { slot: 'C', id: row.sp }),
  };
}

/* The slider: every copy of ONE species, in roster order, plus the dots model. Dots
   only exist above one copy, per the handoff. */
export function sliderModel(roster, sp) {
  const copies = (roster || []).filter(r => r.sp === sp).map(cardModel);
  return { sp, copies, dots: copies.length > 1 ? copies.length : 0 };
}

/* The species grid: one tile per OWNED species, plus every unowned species as a
   locked tile, so the shelf shows what is missing rather than hiding it. */
export function gridModel(roster) {
  const owned = new Map();
  for (const r of roster || []) {
    const t = owned.get(r.sp) || { sp: r.sp, count: 0, anyShiny: false };
    t.count++; t.anyShiny = t.anyShiny || !!r.shiny;
    owned.set(r.sp, t);
  }
  return PET_SPECIES.map(s => {
    const t = owned.get(s.id);
    return {
      sp: s.id, name: s.name, rarity: s.rarity, rarityColor: PDK_RARITY[s.rarity] || PDK_RARITY.common,
      art: bhAsset(s), owned: !!t, count: t ? t.count : 0,
      showCount: !!t && t.count > 1, anyShiny: !!(t && t.anyShiny),
      glow: s.rarity === 'legendary' || s.rarity === 'epic',
    };
  });
}

/* "14 PETS · 5 OF 6 KINDS". Counts COPIES for pets and distinct owned species for
   kinds, which is what the handoff's demo numbers mean (14 copies, 5 of 6 species). */
export function footerLabel(roster) {
  const rows = roster || [];
  const kinds = new Set(rows.map(r => r.sp)).size;
  return `${rows.length} PET${rows.length === 1 ? '' : 'S'} · ${kinds} OF ${PET_SPECIES.length} KINDS`;
}

/* The egg card's second line carries a REAL step count. `paddockEggs()` returns
   nearest:null when nothing is incubating, and ready when the walk is done, so all
   three states say something true rather than printing a placeholder. */
export function eggCardModel(eggs) {
  const count = (eggs && eggs.count) | 0;
  const near = eggs && eggs.nearest;
  let line;
  if (!count) line = 'Nothing in the nest yet.';
  else if (!near) line = `${count} in the nest.`;
  else if (near.ready) line = `${count} in the nest. One is ready to hatch.`;
  else line = `${count} in the nest. Nearest hatch: ${num(near.togo)} steps to go.`;
  return { count, line, pct: near ? Math.max(0, Math.min(1, near.pct || 0)) : 0, ready: !!(near && near.ready) };
}

/* ---- markup ------------------------------------------------------------- */

/* REAL HEARTS. Tom: "tapping the give hearts thing gives red dots not hearts". They
   were CSS circles (and the burst glyphs were rotated rounded squares), which at 17px
   read as dots because that is what they were. This is game-icons.net's heart (Skoll,
   CC-BY 3.0), added through assets/icons-proposal + the manifest and regenerated with
   gen_icons.mjs rather than pasted into the generated file, so a future regen keeps it.
   Icon-system rules: flat fill, no rim, tint from the manifest (#fd6857 coral), and
   the soft drop-shadow lives in CSS. An empty pip is the SAME shape dimmed, so five
   hearts read as five hearts whether or not they are filled. */
const heartsHtml = n => Array.from({ length: 5 }, (_, i) =>
  `<i class="pdk-heart${i < n ? ' on' : ''}" aria-hidden="true">${bhIcon('heart', 17)}</i>`).join('');

export function cardHtml(m) {
  return `<article class="pdk-card" data-iid="${esc(m.iid)}">
    <button class="pdk-x-btn" data-act="close" aria-label="Close">×</button>
    <div class="pdk-head">
      <span class="pdk-thumb"><img src="${esc(m.art)}" alt="" loading="eager"></span>
      <div class="pdk-id">
        <b class="pdk-name">${esc(m.name)}</b>
        <span class="pdk-chips">
          <span class="pdk-chip pdk-rar" style="background:${m.rarityColor}">${esc(m.rarity)}</span>
          ${m.shiny ? '<span class="pdk-chip pdk-shiny">SHINY</span>' : ''}
          <span class="pdk-chip pdk-lv">LV ${m.level}</span>
        </span>
      </div>
    </div>
    <p class="pdk-flavor">${esc(m.flavor)}</p>
    <div class="pdk-bond" data-bond="${m.bond}">${heartsHtml(m.bond)}</div>
    ${m.maxed ? '<span class="pdk-bff">BEST FRIEND</span>' : ''}
    <div class="pdk-acts">
      <button class="pdk-btn pdk-btn-pet" data-act="pet" data-iid="${esc(m.iid)}">Pet</button>
      <button class="pdk-btn pdk-btn-feed" data-act="feed" data-iid="${esc(m.iid)}">Feed</button>
    </div>
  </article>`;
}

/* Locked and egg cards carry NO hearts and NO buttons: there is nothing to bond
   with, and offering a control that cannot work is worse than not offering it. */
export function lockedCardHtml(sp) {
  const s = SPECIES_BY_ID[sp] || { name: sp };
  return `<article class="pdk-card pdk-locked" data-sp="${esc(sp)}">
    <button class="pdk-x-btn" data-act="close" aria-label="Close">×</button>
    <div class="pdk-head"><span class="pdk-thumb pdk-sil"><img src="${esc(bhAsset(s.id ? s : { slot: 'C', id: sp }))}" alt=""></span>
      <div class="pdk-id"><b class="pdk-name">${esc(s.name)}</b></div></div>
    <p class="pdk-flavor">Day-one Boneheadz only. Check your inbox, bony buddy.</p>
  </article>`;
}

export function eggCardHtml(eggs) {
  const m = eggCardModel(eggs);
  return `<article class="pdk-card pdk-egg">
    <button class="pdk-x-btn" data-act="close" aria-label="Close">×</button>
    <div class="pdk-head"><span class="pdk-thumb pdk-eggico" aria-hidden="true"></span>
      <div class="pdk-id"><b class="pdk-name">SOUL EGGS ×${m.count}</b></div></div>
    <p class="pdk-flavor">${esc(m.line)}</p>
    <div class="pdk-eggbar"><i style="width:${Math.round(m.pct * 100)}%"></i></div>
  </article>`;
}

export function sliderHtml(roster, sp) {
  const { copies, dots } = sliderModel(roster, sp);
  if (!copies.length) return lockedCardHtml(sp);
  return `<div class="pdk-slider" data-sp="${esc(sp)}">
    <div class="pdk-rail">${copies.map(cardHtml).join('')}</div>
    ${dots ? `<div class="pdk-dots">${copies.map((c, i) =>
      `<i class="pdk-dot${i === 0 ? ' on' : ''}" data-i="${i}"></i>`).join('')}</div>` : ''}
  </div>`;
}

export function panelHtml(roster, eggs) {
  const tiles = gridModel(roster);
  const egg = eggCardModel(eggs);
  return `<div class="pdk-inner">
    <button class="pdk-teaser" data-sp="CX">
      <span class="pdk-thumb pdk-sil"><img src="${esc(bhAsset(SPECIES_BY_ID.CX || { slot: 'C', id: 'CX' }))}" alt=""></span>
      <span class="pdk-teaser-tx"><small>SOMETHING'S IN THE BUSHES</small>
        <b>Riding since day one? Check your inbox, bony buddy.</b></span>
    </button>
    <div class="pdk-grid">
      <button class="pdk-tile pdk-eggtile" data-egg="1">
        <span class="pdk-eggico" aria-hidden="true"></span>
        <span class="pdk-eggbar"><i style="width:${Math.round(egg.pct * 100)}%"></i></span>
      </button>
      ${tiles.map(t => `<button class="pdk-tile${t.owned ? '' : ' pdk-lockt'}${t.glow ? ' r-' + t.rarity : ''}" data-sp="${esc(t.sp)}">
        <img src="${esc(t.art)}" alt="${esc(t.name)}">
        ${t.showCount ? `<span class="pdk-x">×${t.count}</span>` : ''}
        ${t.anyShiny ? '<span class="pdk-star" aria-hidden="true"></span>' : ''}
        ${t.owned ? '' : '<span class="pdk-q">?</span>'}
      </button>`).join('')}
    </div>
    <div class="pdk-foot">
      <button class="pdk-seg" data-seg="pedia" disabled>BONEPEDIA</button>
      <button class="pdk-seg on" data-seg="count">${esc(footerLabel(roster))}</button>
    </div>
  </div>`;
}

/* ---- live half: state, mount, handlers ---------------------------------- *
 * The slider owns its OWN state (Reggie's call, so neither half waits on the
 * other): the scene calls open on a pet tap and close on a scene tap, and asks
 * isPaddockCardOpen() for the coach mark. Nothing else crosses the seam.
 */
import { bondUp } from './loot.js';
import { haptic } from './haptics.js';

let sel = null;        // species id whose slider is open, or null
let host = null;       // the element the cards are mounted into
let rosterRef = [];    // the roster the open slider was built from

export function isPaddockCardOpen() { return sel !== null; }
export function paddockSel() { return sel; }

export function closePaddockCards() {
  sel = null;
  if (host) host.innerHTML = '';
  host?.classList.remove('pdk-open');
  if (outsideTap) { document.getElementById('pdkScene')?.removeEventListener('click', outsideTap, true); outsideTap = null; }
}

/* EVERY WAY OUT LIVES HERE, TOGETHER. Tom: "it's kinda hard to get out of the paddock
 * feed/affection for pet dialogue". There were two exits and both were guessable only
 * if you already knew them: tap the same pet again, or leave the sheet. Now there are
 * four, and they are declared in one place so the rules cannot drift apart:
 *   1. tap the same species again        (openPaddockCards, below)
 *   2. the × on the card                 (wired in wire())
 *   3. tap anywhere in the scene that is not the card
 *   4. leave the sheet                   (unchanged, the sheet owns that)
 * The outside-tap listener is CAPTURING and checks the target itself rather than
 * relying on stopPropagation inside the card: a capturing listener sees the tap first,
 * so a card control can never be swallowed by the dismisser, and the pets underneath
 * stay tappable because a tap on another pet closes this card and the scene's own
 * handler then opens that one. */
let outsideTap = null;
function armOutsideTap() {
  const scene = document.getElementById('pdkScene');
  if (!scene || outsideTap) return;
  outsideTap = e => {
    if (!sel) return;
    if (host && host.contains(e.target)) return;          // inside the card: not a dismissal
    closePaddockCards();
  };
  scene.addEventListener('click', outsideTap, true);
}

/* Re-tap dismiss lives HERE rather than in the scene, so the rule is one line and
   cannot disagree with itself: opening the species already open closes it. */
export async function openPaddockCards(sp) {
  /* THE SCENE CALLS THIS WITH ONE ARGUMENT (js/app.js: the #pdkScene tap handler and
     the nest), so the module fetches its own data and owns its own host rather than
     making the scene carry state for it. Re-tap dismiss lives here too, so the rule
     is one line and cannot disagree with itself. */
  if (sel === sp) { closePaddockCards(); return false; }
  const scene = document.getElementById('pdkScene');
  if (!scene) return false;
  host = document.getElementById('pdkCards');
  if (!host) {
    host = document.createElement('div');
    host.id = 'pdkCards';
    host.className = 'pdk-host';
    scene.appendChild(host);
  }
  const { paddockRoster, paddockEggs } = await import('./paddock.js');
  const [roster, eggs] = await Promise.all([paddockRoster(), paddockEggs()]);
  sel = sp;
  rosterRef = roster;
  host.innerHTML = sp === 'egg' ? eggCardHtml(eggs) : sliderHtml(rosterRef, sp);
  host.classList.add('pdk-open');
  wire();
  armOutsideTap();
  return true;
}

/* The collection panel is not tap-driven: it is the screen's lower half and must be
   there the moment the Paddock opens. The scene leaves `#pdkPanel` empty for me. */
export async function mountPaddockPanel() {
  const el = document.getElementById('pdkPanel');
  if (!el) return false;
  const { paddockRoster, paddockEggs } = await import('./paddock.js');
  const [roster, eggs] = await Promise.all([paddockRoster(), paddockEggs()]);
  el.innerHTML = panelHtml(roster, eggs);
  el.querySelectorAll('[data-sp]').forEach(b => b.addEventListener('click', () => openPaddockCards(b.dataset.sp)));
  el.querySelector('[data-egg]')?.addEventListener('click', () => openPaddockCards('egg'));
  return true;
}

function wire() {
  const rail = host.querySelector('.pdk-rail');
  /* DOTS FOLLOW THE REAL SCROLL. Not a click counter and not an index we increment
     ourselves: the carousel is scroll-snap, so a swipe moves it without telling us,
     and any state we kept in parallel would drift from what the player sees. */
  if (rail) rail.addEventListener('scroll', () => {
    const cards = [...rail.querySelectorAll('.pdk-card')];
    if (!cards.length) return;
    const mid = rail.scrollLeft + rail.clientWidth / 2;
    let best = 0, bestD = Infinity;
    cards.forEach((c, i) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bestD) { bestD = d; best = i; } });
    host.querySelectorAll('.pdk-dot').forEach((d, i) => d.classList.toggle('on', i === best));
  }, { passive: true });

  host.querySelectorAll('.pdk-x-btn').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    closePaddockCards();
  }));
  host.querySelectorAll('.pdk-btn').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    const iid = b.dataset.iid, kind = b.dataset.act;
    const card = host.querySelector(`.pdk-card[data-iid="${CSS.escape(iid)}"]`);
    if (!card || b.disabled) return;
    b.disabled = true;
    /* ASK THE AUTHORITY, THEN PAINT. bondUp is the persisted write and it refuses a
       ghost iid by name, so rendering from its RETURN means a refusal can never
       paint a heart that was not banked. Incrementing a local copy would. */
    const res = await bondUp(iid).catch(() => ({ ok: false, reason: 'threw' }));
    b.disabled = false;
    if (!res || !res.ok) return;
    paintBond(card, res.bond, res.maxed);
    /* AND THE ANIMATION MUST NOT LIE. changed:false means the cap refused the
       press, so there is nothing to celebrate: no burst. That is the invisible
       punch lesson inverted, an FX that plays over a write that never happened. */
    if (res.changed) { burst(card, kind); try { haptic.success(); } catch { /* haptics optional */ } }
  }));
}

export function paintBond(card, bond, maxed) {
  const hearts = [...card.querySelectorAll('.pdk-heart')];
  hearts.forEach((h, i) => h.classList.toggle('on', i < bond));
  card.querySelector('.pdk-bond')?.setAttribute('data-bond', String(bond));
  if (maxed && !card.querySelector('.pdk-bff')) {
    const b = document.createElement('span');
    b.className = 'pdk-bff pdk-pop';
    b.textContent = 'BEST FRIEND';
    card.querySelector('.pdk-bond')?.after(b);
  }
}

/* Three glyphs, staggered, drifting up and fading. Hearts for Pet, bones for Feed. */
export function burst(card, kind) {
  const head = card.querySelector('.pdk-head') || card;
  const wrap = document.createElement('span');
  wrap.className = 'pdk-burst';
  for (let i = 0; i < 3; i++) {
    const g = document.createElement('i');
    g.className = `pdk-glyph pdk-${kind === 'feed' ? 'bone' : 'heart'}g`;
    /* the floating glyphs are the same real heart, so the burst matches the meter it
       fills; Feed keeps its bone shape, which was never a dot */
    if (kind !== 'feed') g.innerHTML = bhIcon('heart', 13);
    g.style.animationDelay = `${i * 100}ms`;
    g.style.setProperty('--dx', `${(i - 1) * 14}px`);
    wrap.appendChild(g);
  }
  head.appendChild(wrap);
  setTimeout(() => wrap.remove(), 950);
}

/* THE SEAM. Webdriver-only, and it stays after the scene shell lands: it mounts the
   REAL builders with a REAL roster and wires the REAL handlers, so the audit drives
   what ships instead of hand-calling functions. Deleting a seam that earns its keep
   is how audits drift back to proving nothing. */
export function installPaddockSeam() {
  if (typeof window === 'undefined' || navigator.webdriver !== true) return;
  window.__pdkMountCards = async (sp) => {
    const { paddockRoster } = await import('./paddock.js');
    const roster = await paddockRoster();
    const opened = await openPaddockCards(sp);
    return { opened, copies: roster.filter(r => r.sp === sp).length, open: isPaddockCardOpen() };
  };
  window.__pdkClose = () => { closePaddockCards(); return isPaddockCardOpen(); };
}
