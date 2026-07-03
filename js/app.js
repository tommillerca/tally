// Tally: app orchestrator. Screens, sheets, and flows.
import { db, kvGet, kvSet, newId, exportAll, importAll, useDbName } from './db.js';
import {
  computeTargets, nutrientsFor, portionLabel, dayTotals, dateKey, addDays,
  mealForHour, MEALS, fmtKcal, fmtG, fmtQty, streakFrom, weightTrend, trendRatePerWeek,
  lbToKg, kgToLb, ftInToCm, cmToFtIn, ACTIVITY_LEVELS, GOALS, kcalConsistent,
} from './nutrition.js';
import { GENERIC_FOODS, searchFoods } from '../data/generic-foods.js';
import { fetchOffProduct, fetchFdcByBarcode, searchFdc } from './sources.js';
import { parseNutritionText } from './labelparse.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };

const S = {
  settings: null,
  userFoods: [],
  date: dateKey(),
  demo: new URLSearchParams(location.search).has('demo'),
  onlineCache: new Map(),
};

const ICONS = {
  barcode: '<svg viewBox="0 0 24 24"><path d="M3 6v12M7 6v12M10 6v8M13 6v12M16 6v8M19 6v12M21 6v12"/></svg>',
  label: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2L4.5 13.5H11L9.5 22 19 10h-6.5z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  star: (on) => `<svg viewBox="0 0 24 24" style="width:21px;height:21px;${on ? 'fill:var(--carbs);stroke:var(--carbs)' : 'fill:none;stroke:var(--text-3)'};stroke-width:1.8"><path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.9 6.4 20l1.3-6.2L3 9.5l6.3-.7z"/></svg>`,
};

/* ================= boot ================= */

async function boot() {
  if (S.demo) { useDbName('tally-demo'); document.body.insertAdjacentHTML('beforeend', '<div class="demo-badge">DEMO</div>'); }
  S.settings = await kvGet('settings');
  if (S.demo && !S.settings) { await seedDemo(); S.settings = await kvGet('settings'); }
  S.userFoods = await db.all('foods');

  if ('serviceWorker' in navigator && !S.demo && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  if (!S.settings) { renderOnboarding(); return; }
  window.addEventListener('hashchange', route);
  bindTabs();
  route();
}

function bindTabs() {
  $$('#tabbar .tab').forEach(b => b.addEventListener('click', () => { location.hash = '#/' + b.dataset.tab; }));
  $('#fab').addEventListener('click', () => {
    if (currentTab() !== 'today') location.hash = '#/today';
    const now = new Date();
    openAdd(mealForHour(now.getHours() + now.getMinutes() / 60));
  });
}

function currentTab() {
  const m = location.hash.match(/^#\/(\w+)/);
  return m ? m[1] : 'today';
}

function route() {
  closeAllSheets();
  const tab = currentTab();
  $$('#tabbar .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const el = $('#screen');
  if (tab === 'trends') renderTrends(el);
  else if (tab === 'foods') renderFoods(el);
  else if (tab === 'settings') renderSettings(el);
  else renderToday(el);
  el.scrollTop = 0;
}

function refresh() { route(); }

/* ================= shared ui ================= */

let toastTimer = 0;
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

const sheetStack = [];
function openSheet(html, { cls = '', onClose = null } = {}) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet ${cls}" role="dialog"><div class="sheet-grab"></div>${html}</div>`;
  $('#sheets').appendChild(wrap);
  const rec = { wrap, onClose };
  sheetStack.push(rec);
  history.pushState({ sheet: sheetStack.length }, '');
  $('.sheet-backdrop', wrap).addEventListener('click', () => history.back());
  $$('.sheet-close', wrap).forEach(b => b.addEventListener('click', () => history.back()));
  return wrap;
}
function closeTopSheet() {
  const rec = sheetStack.pop();
  if (!rec) return;
  try { rec.onClose?.(); } catch { /* noop */ }
  rec.wrap.remove();
}
function closeAllSheets() {
  while (sheetStack.length) closeTopSheet();
}
window.addEventListener('popstate', () => { if (sheetStack.length) closeTopSheet(); });

function audioTick() {
  try {
    const ctx = audioTick.ctx || (audioTick.ctx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 1150; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.07);
  } catch { /* no audio */ }
}

/* ================= data helpers ================= */

function allSearchableFoods() {
  return [...S.userFoods, ...GENERIC_FOODS];
}

function findFood(id) {
  return S.userFoods.find(f => f.id === id) || GENERIC_FOODS.find(f => f.id === id) || null;
}

async function persistFoodUse(food) {
  if (food.source === 'generic') return; // generics ship with the app
  food.useCount = (food.useCount || 0) + 1;
  food.lastUsedAt = Date.now();
  await db.put('foods', food);
  const i = S.userFoods.findIndex(f => f.id === food.id);
  if (i >= 0) S.userFoods[i] = food; else S.userFoods.push(food);
}

async function entriesFor(date) {
  const rows = await db.byIndex('log', 'date', date);
  return rows.sort((a, b) => a.ts - b.ts);
}

async function recentFoods(limit = 8) {
  const rows = await db.all('log');
  rows.sort((a, b) => b.ts - a.ts);
  const seen = new Set(); const out = [];
  for (const r of rows) {
    const key = r.foodId || r.name;
    if (seen.has(key)) continue;
    seen.add(key);
    const food = r.foodId ? findFood(r.foodId) : null;
    out.push({ entry: r, food });
    if (out.length >= limit) break;
  }
  return out;
}

function defaultSel(food) {
  if (food.lastPortion) return { ...food.lastPortion };
  return { mode: 'serving', idx: 0, qty: 1 };
}

function foodSubtitle(food) {
  const bits = [];
  if (food.brand) bits.push(food.brand);
  const s = food.servings && food.servings[0];
  if (s) bits.push(s.label);
  return bits.join(' · ');
}

function foodDefaultKcal(food) {
  const n = nutrientsFor(food, { mode: 'serving', idx: 0, qty: 1 });
  return n ? Math.round(n.kcal) : null;
}

/* ================= today ================= */

async function renderToday(el) {
  const t = S.settings.targets;
  const entries = await entriesFor(S.date);
  const yEntries = await entriesFor(addDays(S.date, -1));
  const allLog = await db.all('log');
  const streak = streakFrom([...new Set(allLog.map(e => e.date))], dateKey());
  const tot = dayTotals(entries);
  const remaining = Math.round(t.kcal - tot.kcal);
  const pct = Math.min(1, tot.kcal / t.kcal);
  const over = tot.kcal > t.kcal;
  const isToday = S.date === dateKey();
  const [y, m, d] = S.date.split('-').map(Number);
  const dObj = new Date(y, m - 1, d);
  const title = isToday ? 'Today' : dObj.toLocaleDateString(undefined, { weekday: 'long' });
  const sub = dObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: y === new Date().getFullYear() ? undefined : 'numeric' });

  const C = 2 * Math.PI * 66;
  el.innerHTML = `
  <div class="day-head">
    <button class="icon-btn" id="prevDay" aria-label="Previous day"><svg viewBox="0 0 24 24"><path d="M14.5 5l-7 7 7 7"/></svg></button>
    <div class="day-title">
      <h1>${title}</h1><div class="sub">${sub}${streak >= 2 ? ` · <b style="color:var(--accent)">${streak} day streak</b>` : ''}</div>
      <input type="date" id="datePick" value="${S.date}" aria-label="Pick date">
    </div>
    <button class="icon-btn" id="nextDay" aria-label="Next day"><svg viewBox="0 0 24 24"><path d="M9.5 5l7 7-7 7"/></svg></button>
  </div>

  <div class="card ring-card">
    <div class="ring-wrap">
      <svg viewBox="0 0 158 158">
        <circle class="ring-track" cx="79" cy="79" r="66" fill="none" stroke-width="13"/>
        <circle class="ring-fill ${over ? 'over' : ''}" cx="79" cy="79" r="66" fill="none" stroke-width="13" stroke-linecap="round"
          stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/>
      </svg>
      <div class="ring-center">
        <div class="big">${Math.abs(remaining).toLocaleString()}</div>
        <div class="lbl">${over ? 'kcal over' : 'kcal left'}</div>
      </div>
    </div>
    <div class="ring-side">
      <div class="kv"><span>Eaten</span><b>${Math.round(tot.kcal).toLocaleString()}</b></div>
      <div class="kv"><span>Target</span><b>${t.kcal.toLocaleString()}</b></div>
      <div class="divider" style="margin:2px 0"></div>
      ${macroRow('Protein', tot.p, t.p, 'protein')}
      ${macroRow('Carbs', tot.c, t.c, 'carbs')}
      ${macroRow('Fat', tot.f, t.f, 'fat')}
    </div>
  </div>

  ${MEALS.map((name, i) => mealBlock(name, i, entries.filter(e => e.meal === i), yEntries.filter(e => e.meal === i))).join('')}

  ${tot.kcal > 0 ? `<div class="micro-line">Fiber ${fmtG(tot.fiber)} g · Sugar ${fmtG(tot.sugar)} g · Sodium ${Math.round(tot.sodium).toLocaleString()} mg</div>` : ''}
  `;

  $('#prevDay').addEventListener('click', () => { S.date = addDays(S.date, -1); refresh(); });
  $('#nextDay').addEventListener('click', () => { S.date = addDays(S.date, 1); refresh(); });
  $('#datePick').addEventListener('change', e => { if (e.target.value) { S.date = e.target.value; refresh(); } });
  $$('[data-addmeal]').forEach(b => b.addEventListener('click', () => openAdd(Number(b.dataset.addmeal))));
  $$('[data-entry]').forEach(b => b.addEventListener('click', () => openEntryEdit(b.dataset.entry)));
  $$('[data-copymeal]').forEach(b => b.addEventListener('click', async () => {
    const meal = Number(b.dataset.copymeal);
    const src = yEntries.filter(e => e.meal === meal);
    for (const e of src) {
      await db.put('log', { ...e, id: newId(), date: S.date, ts: Date.now() });
    }
    toast(`Copied ${src.length} item${src.length === 1 ? '' : 's'} from yesterday`);
    refresh();
  }));
}

function macroRow(label, val, target, cls) {
  const pct = Math.min(100, target ? (val / target) * 100 : 0);
  return `<div class="macro">
    <div class="row"><span>${label}</span><span class="val">${fmtG(val)} / ${target} g</span></div>
    <div class="bar ${cls}"><i style="width:${pct}%"></i></div>
  </div>`;
}

function mealBlock(name, i, entries, yEntries) {
  const kcal = Math.round(dayTotals(entries).kcal);
  return `<section class="meal">
    <div class="meal-head">
      <h2>${name}</h2>
      ${kcal ? `<span class="kcal">${kcal.toLocaleString()} kcal</span>` : '<span class="kcal"></span>'}
      <button class="meal-add" data-addmeal="${i}" aria-label="Add to ${name}"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
    </div>
    ${entries.map(e => `
      <button class="entry" data-entry="${e.id}">
        <div class="n"><div class="name">${esc(e.name)}</div><div class="sub">${esc(e.portionLabel || '')}</div></div>
        <span class="kc">${Math.round(e.kcal)}</span>
      </button>`).join('')}
    ${!entries.length && yEntries.length ? `<button class="chip-btn" data-copymeal="${i}">↺ Copy yesterday's ${name} (${Math.round(dayTotals(yEntries).kcal)} kcal)</button>` : ''}
  </section>`;
}

/* ================= add flow ================= */

function openAdd(meal = 0) {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Add food</h2><button class="sheet-close">Done</button></div>
    <div class="sheet-body">
      <div class="chips" id="mealChips" style="margin-bottom:12px">
        ${MEALS.map((m, i) => `<button class="chip ${i === meal ? 'on' : ''}" data-meal="${i}">${m}</button>`).join('')}
      </div>
      <div class="action-tiles">
        <button class="action-tile" id="actScan">${ICONS.barcode}Scan barcode</button>
        <button class="action-tile" id="actLabel">${ICONS.label}Scan label</button>
        <button class="action-tile" id="actQuick">${ICONS.bolt}Quick add</button>
      </div>
      <div class="search-wrap">${ICONS.search}<input id="q" class="input" type="search" placeholder="Search foods" autocomplete="off" enterkeyhint="search"></div>
      <div id="results"></div>
    </div>`, { cls: 'full' });

  let curMeal = meal;
  $$('#mealChips .chip', wrap).forEach(c => c.addEventListener('click', () => {
    curMeal = Number(c.dataset.meal);
    $$('#mealChips .chip', wrap).forEach(x => x.classList.toggle('on', x === c));
  }));
  $('#actScan', wrap).addEventListener('click', () => openScanner(() => curMeal));
  $('#actLabel', wrap).addEventListener('click', () => openLabelFlow(() => curMeal));
  $('#actQuick', wrap).addEventListener('click', () => openQuickAdd(() => curMeal));

  const results = $('#results', wrap);
  const input = $('#q', wrap);

  async function showDefault() {
    const recents = await recentFoods(8);
    const favs = allSearchableFoods().filter(f => f.favorite).slice(0, 6);
    let html = '';
    if (recents.length) {
      html += '<div class="sect-h">Recent</div>' + recents.map(r => {
        if (r.food) return foodRowHtml(r.food);
        return `<button class="food-row" data-relog="${r.entry.id}">
          <div class="n"><div class="name">${esc(r.entry.name)}</div><div class="sub">${esc(r.entry.portionLabel || 'quick add')}</div></div>
          <span class="kc">${Math.round(r.entry.kcal)}<small>kcal</small></span></button>`;
      }).join('');
    }
    if (favs.length) html += '<div class="sect-h">Favorites</div>' + favs.map(foodRowHtml).join('');
    if (!html) html = `<p class="note" style="text-align:center;padding:26px 20px">Search ${GENERIC_FOODS.length}+ built-in foods, or scan a barcode to add packaged food in seconds.</p>`;
    results.innerHTML = html;
    bindRows();
  }

  function bindRows() {
    $$('[data-food]', results).forEach(b => b.addEventListener('click', () => {
      const f = findFood(b.dataset.food) || onlineById(b.dataset.food);
      if (f) openPortion(f, { meal: curMeal });
    }));
    $$('[data-relog]', results).forEach(b => b.addEventListener('click', async () => {
      const rows = await db.all('log');
      const src = rows.find(r => r.id === b.dataset.relog);
      if (!src) return;
      await db.put('log', { ...src, id: newId(), date: S.date, meal: curMeal, ts: Date.now() });
      toast(`Added ${src.name}`);
      history.back();
      setTimeout(refresh, 60);
    }));
    $$('[data-online]', results).forEach(b => b.addEventListener('click', () => runOnlineSearch(input.value.trim())));
  }

  function onlineById(id) {
    for (const list of S.onlineCache.values()) {
      const f = list.find(x => x.id === id);
      if (f) return f;
    }
    return null;
  }

  async function runOnlineSearch(q) {
    if (!q) return;
    const holder = $('#onlineSect', results);
    if (holder) holder.innerHTML = '<div class="sect-h">Online results <span class="spin"></span></div>';
    try {
      let foods = S.onlineCache.get(q.toLowerCase());
      if (!foods) {
        foods = await searchFdc(q, S.settings.fdcKey || 'DEMO_KEY');
        S.onlineCache.set(q.toLowerCase(), foods);
      }
      if (input.value.trim() !== q) return;
      const sect = $('#onlineSect', results);
      if (!sect) return;
      sect.innerHTML = '<div class="sect-h">Online results</div>' +
        (foods.length ? foods.map(foodRowHtml).join('') : '<p class="note" style="padding:8px 2px">Nothing found online. Try the barcode or label scanner.</p>');
      bindRows();
    } catch (e) {
      const sect = $('#onlineSect', results);
      if (sect) sect.innerHTML = `<p class="note" style="padding:8px 2px">${e.message === 'rate_limit'
        ? 'Online search limit reached for now. Add a free USDA key in Settings for 1,000 searches/hour.'
        : 'Online search unavailable right now.'}</p>`;
    }
  }

  let debounce = 0;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (!q) { showDefault(); return; }
    debounce = setTimeout(() => {
      const local = searchFoods(allSearchableFoods(), q, 25);
      results.innerHTML =
        (local.length ? local.map(foodRowHtml).join('') : '<p class="note" style="padding:14px 2px 6px;text-align:center">Nothing local matches.</p>') +
        `<div id="onlineSect">${q.length >= 3 ? `<button class="food-row" data-online><div class="n"><div class="name" style="color:var(--accent)">Search online for "${esc(q)}"</div><div class="sub">USDA branded + generic database</div></div></button>` : ''}</div>`;
      bindRows();
    }, 120);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runOnlineSearch(input.value.trim()); } });

  showDefault();
}

function foodRowHtml(f) {
  const kcal = foodDefaultKcal(f);
  return `<button class="food-row" data-food="${esc(f.id)}">
    <div class="n"><div class="name">${esc(f.name)}</div><div class="sub">${esc(foodSubtitle(f))}</div></div>
    <span class="kc">${kcal != null ? kcal : '·'}<small>kcal</small></span>
  </button>`;
}

/* ================= portion sheet ================= */

function openPortion(food, { meal = 0, entry = null } = {}) {
  const sel = entry ? (entry.sel ? { ...entry.sel } : { mode: 'serving', idx: 0, qty: entry.qty || 1 }) : defaultSel(food);
  if (sel.mode === 'serving' && (!food.servings || !food.servings[sel.idx])) { sel.idx = 0; }
  let curMeal = entry ? entry.meal : meal;
  const editing = !!entry;
  const srcLabel = { generic: 'Built-in', off: 'Open Food Facts', fdc: 'USDA', custom: 'My food' }[food.source] || '';

  const wrap = openSheet(`
    <div class="sheet-head">
      <div style="min-width:0">
        <h2 style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(food.name)}</h2>
        <div class="note" style="margin-top:2px">${esc(food.brand || '')}${food.brand ? ' · ' : ''}<span class="src-badge">${srcLabel}</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        <button id="favBtn" aria-label="Favorite">${ICONS.star(!!food.favorite)}</button>
        <button class="sheet-close">Cancel</button>
      </div>
    </div>
    <div class="sheet-body">
      <div class="preview">
        <div class="kcal"><span id="pvKcal">0</span><small>kcal</small></div>
        <div class="pcf">
          <span><i class="dot p"></i><span id="pvP">0</span>P</span>
          <span><i class="dot c"></i><span id="pvC">0</span>C</span>
          <span><i class="dot f"></i><span id="pvF">0</span>F</span>
        </div>
      </div>
      <div class="chips scroll" id="servChips">
        ${(food.servings || []).map((s, i) => `<button class="chip" data-serv="${i}">${esc(s.label)}</button>`).join('')}
        ${food.per100 ? '<button class="chip" data-grams>grams</button>' : ''}
      </div>
      <div style="height:12px"></div>
      <div id="qtyArea"></div>
      <div style="height:14px"></div>
      <div class="chips" id="pMealChips">
        ${MEALS.map((m, i) => `<button class="chip ${i === curMeal ? 'on' : ''}" data-meal="${i}">${m}</button>`).join('')}
      </div>
      <div style="height:16px"></div>
      <button class="btn" id="addBtn">${editing ? 'Save changes' : 'Add'}</button>
      ${editing ? '<div style="height:8px"></div><button class="btn danger" id="delBtn">Delete entry</button>' : ''}
      ${food.source === 'custom' ? '<div style="height:8px"></div><button class="btn ghost" id="editFoodBtn">Edit food details</button>' : ''}
    </div>`);

  const qtyArea = $('#qtyArea', wrap);

  function renderQty() {
    if (sel.mode === 'grams') {
      qtyArea.innerHTML = `
        <div class="stepper">
          <button data-d="-10">-</button>
          <input id="gramsIn" type="text" inputmode="decimal" value="${fmtQty(sel.grams)}" aria-label="grams">
          <button data-d="10">+</button>
        </div>
        <div class="note" style="text-align:center;margin-top:8px">grams</div>`;
      $('#gramsIn', wrap).addEventListener('input', e => { sel.grams = num(e.target.value) || 0; preview(); });
      $$('.stepper button', qtyArea).forEach(b => b.addEventListener('click', () => {
        sel.grams = Math.max(1, (sel.grams || 0) + Number(b.dataset.d));
        $('#gramsIn', wrap).value = fmtQty(sel.grams);
        preview();
      }));
    } else {
      qtyArea.innerHTML = `
        <div class="stepper">
          <button data-d="-0.25">-</button>
          <div class="val" id="qtyVal">${fmtQty(sel.qty)}</div>
          <button data-d="0.25">+</button>
        </div>
        <div class="note" style="text-align:center;margin-top:8px">servings</div>`;
      $$('.stepper button', qtyArea).forEach(b => b.addEventListener('click', () => {
        sel.qty = Math.max(0.25, Math.round(((sel.qty || 1) + Number(b.dataset.d)) * 100) / 100);
        $('#qtyVal', wrap).textContent = fmtQty(sel.qty);
        preview();
      }));
    }
    markChips();
  }

  function markChips() {
    $$('#servChips .chip', wrap).forEach(c => {
      const on = c.hasAttribute('data-grams') ? sel.mode === 'grams' : (sel.mode === 'serving' && Number(c.dataset.serv) === sel.idx);
      c.classList.toggle('on', on);
    });
  }

  function preview() {
    const n = nutrientsFor(food, sel) || { kcal: 0, p: 0, c: 0, f: 0 };
    $('#pvKcal', wrap).textContent = Math.round(n.kcal).toLocaleString();
    $('#pvP', wrap).textContent = fmtG(n.p) + 'g ';
    $('#pvC', wrap).textContent = fmtG(n.c) + 'g ';
    $('#pvF', wrap).textContent = fmtG(n.f) + 'g ';
  }

  $$('#servChips .chip', wrap).forEach(c => c.addEventListener('click', () => {
    if (c.hasAttribute('data-grams')) {
      const cur = nutrientsFor(food, sel);
      sel.mode = 'grams';
      sel.grams = sel.grams || (cur && food.per100 ? Math.round((cur.kcal / food.per100.kcal) * 100) : 100);
    } else {
      sel.mode = 'serving'; sel.idx = Number(c.dataset.serv); sel.qty = sel.qty && sel.mode === 'serving' ? sel.qty : 1;
    }
    renderQty(); preview();
  }));

  $$('#pMealChips .chip', wrap).forEach(c => c.addEventListener('click', () => {
    curMeal = Number(c.dataset.meal);
    $$('#pMealChips .chip', wrap).forEach(x => x.classList.toggle('on', x === c));
  }));

  $('#favBtn', wrap).addEventListener('click', async () => {
    food.favorite = !food.favorite;
    $('#favBtn', wrap).innerHTML = ICONS.star(!!food.favorite);
    if (food.source !== 'generic') await db.put('foods', food);
    else await kvSet('fav-' + food.id, food.favorite); // generic favs live in kv
  });

  $('#addBtn', wrap).addEventListener('click', async () => {
    const n = nutrientsFor(food, sel);
    if (!n || !isFinite(n.kcal)) { toast('Pick a portion first'); return; }
    const e = {
      id: editing ? entry.id : newId(),
      date: editing ? entry.date : S.date,
      meal: curMeal,
      ts: editing ? entry.ts : Date.now(),
      foodId: food.id,
      name: food.name, brand: food.brand || null,
      portionLabel: portionLabel(food, sel),
      sel: { ...sel },
      kcal: n.kcal, p: n.p || 0, c: n.c || 0, f: n.f || 0,
      fiber: n.fiber || 0, sugar: n.sugar || 0, sodium: n.sodium || 0,
    };
    await db.put('log', e);
    food.lastPortion = { ...sel };
    await persistFoodUse(food);
    toast(editing ? 'Saved' : `Added · ${Math.round(n.kcal)} kcal`);
    closeAllSheetsViaHistory();
    setTimeout(refresh, 80);
  });

  if (editing) $('#delBtn', wrap).addEventListener('click', async () => {
    await db.del('log', entry.id);
    toast('Deleted');
    closeAllSheetsViaHistory();
    setTimeout(refresh, 80);
  });
  if (food.source === 'custom') $('#editFoodBtn', wrap)?.addEventListener('click', () => openFoodForm({ existing: food, meal: curMeal }));

  // restore generic favorite state async
  if (food.source === 'generic') kvGet('fav-' + food.id).then(v => { if (v != null) { food.favorite = v; $('#favBtn', wrap).innerHTML = ICONS.star(!!v); } });

  renderQty();
  preview();
}

function closeAllSheetsViaHistory() {
  const n = sheetStack.length;
  if (n > 0) history.go(-n);
}

async function openEntryEdit(entryId) {
  const rows = await db.byIndex('log', 'date', S.date);
  const entry = rows.find(r => r.id === entryId);
  if (!entry) return;
  const food = entry.foodId ? findFood(entry.foodId) : null;
  if (food) { openPortion(food, { entry }); return; }
  // quick-add entry: numeric edit
  openQuickAdd(() => entry.meal, entry);
}

/* ================= quick add ================= */

function openQuickAdd(getMeal, entry = null) {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>${entry ? 'Edit quick add' : 'Quick add'}</h2><button class="sheet-close">Cancel</button></div>
    <div class="sheet-body">
      <div class="field"><label>Name (optional)</label><input id="qaName" placeholder="e.g. Dinner out" value="${esc(entry?.name === 'Quick add' ? '' : entry?.name || '')}"></div>
      <div class="field"><label>Calories</label><input id="qaKcal" type="text" inputmode="numeric" placeholder="0" value="${entry ? Math.round(entry.kcal) : ''}"></div>
      <div class="grid3">
        <div class="field"><label>Protein g</label><input id="qaP" type="text" inputmode="decimal" placeholder="·" value="${entry?.p ? fmtG(entry.p) : ''}"></div>
        <div class="field"><label>Carbs g</label><input id="qaC" type="text" inputmode="decimal" placeholder="·" value="${entry?.c ? fmtG(entry.c) : ''}"></div>
        <div class="field"><label>Fat g</label><input id="qaF" type="text" inputmode="decimal" placeholder="·" value="${entry?.f ? fmtG(entry.f) : ''}"></div>
      </div>
      <div style="height:8px"></div>
      <button class="btn" id="qaAdd">${entry ? 'Save' : 'Add'}</button>
      ${entry ? '<div style="height:8px"></div><button class="btn danger" id="qaDel">Delete entry</button>' : ''}
    </div>`);
  $('#qaKcal', wrap).focus();
  $('#qaAdd', wrap).addEventListener('click', async () => {
    const kcal = num($('#qaKcal', wrap).value);
    if (kcal == null) { toast('Calories required'); return; }
    const e = {
      id: entry ? entry.id : newId(),
      date: entry ? entry.date : S.date,
      meal: getMeal(),
      ts: entry ? entry.ts : Date.now(),
      foodId: null,
      name: $('#qaName', wrap).value.trim() || 'Quick add',
      portionLabel: '',
      kcal, p: num($('#qaP', wrap).value) || 0, c: num($('#qaC', wrap).value) || 0, f: num($('#qaF', wrap).value) || 0,
    };
    await db.put('log', e);
    toast(entry ? 'Saved' : `Added · ${Math.round(kcal)} kcal`);
    closeAllSheetsViaHistory();
    setTimeout(refresh, 80);
  });
  if (entry) $('#qaDel', wrap).addEventListener('click', async () => {
    await db.del('log', entry.id);
    toast('Deleted');
    closeAllSheetsViaHistory();
    setTimeout(refresh, 80);
  });
}

/* ================= barcode scanner ================= */

async function openScanner(getMeal) {
  const wrap = openSheet(`
    <div class="scan-stage">
      <video muted playsinline></video>
      <div class="reticle"></div>
      <div class="scan-status" id="scanStatus"></div>
      <div class="scan-hint">Center the barcode · hold 10-15 cm away</div>
      <div class="scan-tools">
        <button class="icon-btn" id="torchBtn" hidden aria-label="Flashlight"><svg viewBox="0 0 24 24"><path d="M8 2h8l-1 7h3l-9 13 2-9H7z"/></svg></button>
        <button class="icon-btn sheet-close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
    </div>
    <div class="scan-foot">
      <input class="input" id="manualCode" type="text" inputmode="numeric" placeholder="Type barcode digits" autocomplete="off">
      <button class="btn small" id="manualGo" style="flex:none">Look up</button>
    </div>`, { cls: 'scanner', onClose: () => scanner && scanner.stop() });

  const video = $('video', wrap);
  const status = $('#scanStatus', wrap);
  let scanner = null;

  const { createScanner } = await import('./scanner.js');
  scanner = createScanner(video, {
    onCode: code => { audioTick(); handleBarcode(code, getMeal); },
    onState: (st) => {
      if (st === 'denied') status.innerHTML = 'Camera access denied.<br><span style="font-weight:500;font-size:12.5px">Allow camera for this site in iOS Settings, or type the barcode below.</span>';
      else if (st === 'error') status.textContent = 'Camera unavailable. Type the barcode below.';
      else if (st === 'stalled') status.textContent = 'Camera is not sending frames. Close and reopen the scanner.';
      else if (st === 'running') { status.textContent = ''; if (scanner.hasTorch()) $('#torchBtn', wrap).hidden = false; }
      else status.textContent = 'Starting camera...';
    },
  });
  scanner.start();

  let torchOn = false;
  $('#torchBtn', wrap).addEventListener('click', () => { torchOn = !torchOn; scanner.setTorch(torchOn); });
  $('#manualGo', wrap).addEventListener('click', () => {
    const code = $('#manualCode', wrap).value.replace(/\D/g, '');
    if (code.length >= 8) handleBarcode(code, getMeal);
    else toast('Enter at least 8 digits');
  });

  async function handleBarcode(code, getMeal) {
    scanner.stop();
    status.innerHTML = '<span class="spin" style="display:inline-block;vertical-align:-3px"></span>  Looking up ' + code;
    // 1. local (previously scanned / created)
    let food = S.userFoods.find(f => f.barcode && barcodeMatch(f.barcode, code));
    // 2. Open Food Facts
    if (!food) { food = await fetchOffProduct(code); }
    // 3. USDA branded fallback
    if (!food) { status.textContent = 'Checking USDA...'; food = await fetchFdcByBarcode(code, S.settings.fdcKey || 'DEMO_KEY'); }
    if (food) {
      openPortion(food, { meal: getMeal() });
      return;
    }
    status.textContent = '';
    openSheet(`
      <div class="sheet-head"><h2>Not in database</h2><button class="sheet-close">Back</button></div>
      <div class="sheet-body">
        <p class="note" style="margin-bottom:14px">Barcode <b style="color:var(--text)">${esc(code)}</b> isn't in Open Food Facts or USDA yet. Add it once and it's yours forever:</p>
        <button class="btn" id="missLabel">Scan the nutrition label</button>
        <div style="height:8px"></div>
        <button class="btn ghost" id="missManual">Enter nutrition manually</button>
      </div>`);
    $('#missLabel').addEventListener('click', () => openLabelFlow(getMeal, code));
    $('#missManual').addEventListener('click', () => openFoodForm({ barcode: code, meal: getMeal() }));
  }
}

function barcodeMatch(a, b) {
  const x = String(a).replace(/^0+/, ''), y = String(b).replace(/^0+/, '');
  return x === y;
}

/* ================= label OCR flow ================= */

function openLabelFlow(getMeal, barcode = null) {
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Scan nutrition label</h2><button class="sheet-close">Cancel</button></div>
    <div class="sheet-body">
      <p class="note" style="margin-bottom:14px">Take a straight-on photo of the Nutrition Facts panel in good light. Tally reads it on-device; nothing is uploaded.</p>
      <input type="file" accept="image/*" capture="environment" id="labelFile" hidden>
      <input type="file" accept="image/*" id="labelPick" hidden>
      <button class="btn" id="takeBtn">Take photo</button>
      <div style="height:8px"></div>
      <button class="btn ghost" id="pickBtn">Choose from library</button>
      <div id="ocrArea" style="margin-top:16px"></div>
    </div>`);

  const area = $('#ocrArea', wrap);
  $('#takeBtn', wrap).addEventListener('click', () => $('#labelFile', wrap).click());
  $('#pickBtn', wrap).addEventListener('click', () => $('#labelPick', wrap).click());
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    area.innerHTML = `
      <img src="${url}" alt="label" style="width:100%;border-radius:14px;max-height:260px;object-fit:contain;background:var(--surface-2)">
      <div class="progress"><i id="ocrBar" style="width:4%"></i></div>
      <p class="note" style="text-align:center" id="ocrMsg">Reading label... first use downloads the reader (~10 MB)</p>`;
    try {
      const { ocrLabel } = await import('./ocr.js');
      const text = await ocrLabel(file, p => { const b = $('#ocrBar', wrap); if (b) b.style.width = Math.round(p * 100) + '%'; });
      const parsed = parseNutritionText(text);
      openLabelConfirm(parsed, { getMeal, barcode, photoUrl: url });
    } catch (err) {
      area.innerHTML = `<p class="warn">Could not read that photo (${esc(err.message || 'error')}). Try more light, less glare, and fill the frame with the label.</p>`;
    }
  };
  $('#labelFile', wrap).addEventListener('change', onFile);
  $('#labelPick', wrap).addEventListener('change', onFile);
}

function openLabelConfirm(parsed, { getMeal, barcode, photoUrl }) {
  openFoodForm({
    barcode,
    meal: getMeal(),
    photoUrl,
    prefill: {
      servingText: parsed.servingText || '1 serving',
      servingGrams: parsed.servingGrams,
      kcal: parsed.kcal, p: parsed.protein, c: parsed.carbs, f: parsed.fat,
      fiber: parsed.fiber, sugar: parsed.sugar, sodium: parsed.sodium,
    },
    warnings: parsed.warnings,
  });
}

/* ================= food form (create/edit custom) ================= */

function openFoodForm({ existing = null, barcode = null, meal = 0, prefill = null, warnings = [], photoUrl = null } = {}) {
  const f = existing;
  const pv = prefill || {};
  const perServ = f ? (f.perServing || (f.per100 && f.servings[0]?.g ? scalePer100(f.per100, f.servings[0].g) : f.per100)) : null;
  const servingLabel = f ? (f.servings[0]?.label || '1 serving') : (pv.servingText || '1 serving');
  const servingGrams = f ? f.servings[0]?.g : pv.servingGrams;
  const v = k => {
    if (pv[k] != null) return pv[k];
    if (perServ && perServ[k] != null) return Math.round(perServ[k] * 10) / 10;
    return '';
  };

  const wrap = openSheet(`
    <div class="sheet-head"><h2>${f ? 'Edit food' : 'New food'}</h2><button class="sheet-close">Cancel</button></div>
    <div class="sheet-body">
      ${photoUrl ? `<img src="${photoUrl}" alt="label" style="width:100%;border-radius:14px;max-height:190px;object-fit:contain;background:var(--surface-2);margin-bottom:12px">` : ''}
      ${warnings.length ? `<div class="warn">${warnings.map(esc).join('<br>')}</div>` : ''}
      <div class="field"><label>Name</label><input id="ffName" placeholder="e.g. Protein granola" value="${esc(f?.name || '')}"></div>
      <div class="field"><label>Brand (optional)</label><input id="ffBrand" value="${esc(f?.brand || '')}"></div>
      <div class="grid2">
        <div class="field"><label>Serving name</label><input id="ffServ" value="${esc(servingLabel)}"></div>
        <div class="field"><label>Serving grams (optional)</label><input id="ffGrams" type="text" inputmode="decimal" value="${servingGrams ?? ''}" placeholder="e.g. 55"></div>
      </div>
      <div class="sect-h" style="margin-top:6px">Per serving</div>
      <div class="grid2">
        <div class="field"><label>Calories</label><input id="ffKcal" type="text" inputmode="numeric" value="${v('kcal')}"></div>
        <div class="field"><label>Protein g</label><input id="ffP" type="text" inputmode="decimal" value="${v('p')}"></div>
        <div class="field"><label>Carbs g</label><input id="ffC" type="text" inputmode="decimal" value="${v('c')}"></div>
        <div class="field"><label>Fat g</label><input id="ffF" type="text" inputmode="decimal" value="${v('f')}"></div>
        <div class="field"><label>Fiber g</label><input id="ffFib" type="text" inputmode="decimal" value="${v('fiber')}"></div>
        <div class="field"><label>Sugar g</label><input id="ffSug" type="text" inputmode="decimal" value="${v('sugar')}"></div>
      </div>
      <div class="field"><label>Sodium mg</label><input id="ffNa" type="text" inputmode="numeric" value="${v('sodium')}"></div>
      ${barcode ? `<p class="note">Will be linked to barcode ${esc(barcode)} so scanning finds it instantly next time.</p>` : ''}
      <div style="height:10px"></div>
      <button class="btn" id="ffSave">${f ? 'Save changes' : 'Save food'}</button>
      ${f ? '<div style="height:8px"></div><button class="btn danger" id="ffDel">Delete food</button>' : ''}
    </div>`);

  $('#ffSave', wrap).addEventListener('click', async () => {
    const name = $('#ffName', wrap).value.trim();
    const kcal = num($('#ffKcal', wrap).value);
    if (!name) { toast('Name required'); return; }
    if (kcal == null) { toast('Calories required'); return; }
    const grams = num($('#ffGrams', wrap).value);
    const perServing = {
      kcal, p: num($('#ffP', wrap).value) || 0, c: num($('#ffC', wrap).value) || 0, f: num($('#ffF', wrap).value) || 0,
      fiber: num($('#ffFib', wrap).value), sugar: num($('#ffSug', wrap).value), sodium: num($('#ffNa', wrap).value),
    };
    const food = {
      id: f ? f.id : 'c-' + newId(),
      source: 'custom',
      barcode: (f && f.barcode) || barcode || undefined,
      name,
      brand: $('#ffBrand', wrap).value.trim() || null,
      perServing,
      per100: grams ? scaleToPer100(perServing, grams) : undefined,
      servings: [
        { label: $('#ffServ', wrap).value.trim() || '1 serving', g: grams || null },
        ...(grams ? [{ label: '100 g', g: 100 }] : []),
      ],
      favorite: f?.favorite || false,
      useCount: f?.useCount || 0,
      createdAt: f?.createdAt || Date.now(),
    };
    await db.put('foods', food);
    const i = S.userFoods.findIndex(x => x.id === food.id);
    if (i >= 0) S.userFoods[i] = food; else S.userFoods.push(food);
    toast('Food saved');
    if (!kcalConsistent(perServing)) toast('Heads up: calories and macros disagree, double-check the label', 3400);
    if (f) { closeAllSheetsViaHistory(); setTimeout(refresh, 80); }
    else openPortion(food, { meal });
  });

  if (f) $('#ffDel', wrap).addEventListener('click', async () => {
    await db.del('foods', f.id);
    S.userFoods = S.userFoods.filter(x => x.id !== f.id);
    toast('Food deleted');
    closeAllSheetsViaHistory();
    setTimeout(refresh, 80);
  });
}

function scaleToPer100(n, grams) {
  const k = 100 / grams; const out = {};
  for (const key of Object.keys(n)) if (n[key] != null) out[key] = Math.round(n[key] * k * 100) / 100;
  return out;
}
function scalePer100(per100, grams) {
  const k = grams / 100; const out = {};
  for (const key of Object.keys(per100)) if (per100[key] != null) out[key] = per100[key] * k;
  return out;
}

/* ================= trends ================= */

async function renderTrends(el) {
  const t = S.settings.targets;
  const weights = (await db.all('weights')).sort((a, b) => a.date.localeCompare(b.date));
  const trended = weightTrend(weights);
  const rate = trendRatePerWeek(trended, 14);
  const unit = S.settings.units === 'kg' ? 'kg' : 'lb';
  const toUnit = kg => S.settings.units === 'kg' ? kg : kgToLb(kg);
  const latest = trended[trended.length - 1];

  const log = await db.all('log');
  const byDate = {};
  for (const e of log) { (byDate[e.date] = byDate[e.date] || []).push(e); }
  const days14 = [];
  for (let i = 13; i >= 0; i--) {
    const dk = addDays(dateKey(), -i);
    days14.push({ date: dk, tot: dayTotals(byDate[dk] || []) });
  }
  const days7 = days14.slice(-7);
  const pAvg = days7.reduce((a, d) => a + d.tot.p, 0) / 7;
  const loggedDays7 = days7.filter(d => d.tot.kcal > 0).length;

  el.innerHTML = `
  <h1 class="page-h1">Trends<span class="sub">Weight and intake over time</span></h1>

  <div class="card">
    <div class="card-title">WEIGHT ${weights.length ? `<span class="note">${weights.length} entries</span>` : ''}</div>
    ${latest ? `
      <div class="big-stat">
        <span class="v">${toUnit(latest.trend).toFixed(1)} ${unit}</span>
        ${rate != null ? `<span class="trend-chip ${rate > 0.02 ? 'up' : ''}">${rate > 0 ? '+' : ''}${toUnit(rate).toFixed(1)} ${unit}/wk</span>` : ''}
      </div>
      <p class="note" style="margin-bottom:10px">Trend weight (smoothed). Last weigh-in: ${toUnit(latest.kg).toFixed(1)} ${unit}</p>
      <div class="chart">${weightChart(trended.slice(-45), toUnit)}</div>` :
      '<p class="note" style="padding:6px 0 12px">Log your weight a few times a week. The smoothed trend line cuts through daily water-weight noise so you can see if your plan is working.</p>'}
    <div style="height:10px"></div>
    <button class="btn ghost" id="logWeight">Log weight</button>
  </div>

  <div class="card">
    <div class="card-title">CALORIES · LAST 14 DAYS</div>
    <div class="chart">${kcalChart(days14, t.kcal)}</div>
    <p class="note" style="margin-top:8px">Line = your ${t.kcal.toLocaleString()} kcal target.</p>
  </div>

  <div class="card">
    <div class="card-title">PROTEIN · LAST 7 DAYS</div>
    <div class="big-stat"><span class="v">${Math.round(pAvg)} g</span><span class="d">avg / day · target ${t.p} g</span></div>
    <div class="chart">${proteinChart(days7, t.p)}</div>
    ${loggedDays7 < 5 ? '<p class="note" style="margin-top:8px">Log most days for a meaningful average.</p>' : ''}
  </div>`;

  $('#logWeight').addEventListener('click', openWeightSheet);
}

function weightChart(points, toUnit) {
  if (points.length < 2) return '<p class="note">Add more weigh-ins to see the trend.</p>';
  const W = 560, H = 150, P = 8;
  const vals = points.flatMap(p => [toUnit(p.kg), toUnit(p.trend)]);
  const min = Math.min(...vals) - 0.4, max = Math.max(...vals) + 0.4;
  const x = i => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = v => P + (1 - (v - min) / (max - min)) * (H - 2 * P);
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(toUnit(p.kg)).toFixed(1)}" r="2.6" fill="var(--text-3)"/>`).join('');
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(toUnit(p.trend)).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${W} ${H}">${dots}<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/></svg>`;
}

function kcalChart(days, target) {
  const W = 560, H = 150, P = 6, gap = 6;
  const bw = (W - 2 * P - gap * (days.length - 1)) / days.length;
  const max = Math.max(target * 1.25, ...days.map(d => d.tot.kcal)) || 1;
  const y = v => H - 18 - (v / max) * (H - 34);
  const bars = days.map((d, i) => {
    const bx = P + i * (bw + gap);
    const v = d.tot.kcal;
    const h = Math.max(2, (v / max) * (H - 34));
    const over = v > target;
    const dow = 'SMTWTFS'[new Date(d.date + 'T12:00').getDay()];
    return `<rect x="${bx.toFixed(1)}" y="${(H - 18 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3.5" fill="${v === 0 ? 'var(--surface-3)' : over ? 'var(--amber)' : 'var(--accent)'}" opacity="${v === 0 ? 0.6 : over ? 0.85 : 0.9}"/>
      <text x="${(bx + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="9.5" fill="var(--text-3)">${dow}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}">${bars}<line x1="${P}" x2="${W - P}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}" stroke="var(--line-strong)" stroke-width="1.5" stroke-dasharray="5 5"/></svg>`;
}

function proteinChart(days, target) {
  const W = 560, H = 110, P = 6, gap = 8;
  const bw = (W - 2 * P - gap * (days.length - 1)) / days.length;
  const max = Math.max(target * 1.2, ...days.map(d => d.tot.p)) || 1;
  const bars = days.map((d, i) => {
    const bx = P + i * (bw + gap);
    const h = Math.max(2, (d.tot.p / max) * (H - 30));
    const hit = d.tot.p >= target * 0.9;
    const dow = 'SMTWTFS'[new Date(d.date + 'T12:00').getDay()];
    return `<rect x="${bx.toFixed(1)}" y="${(H - 16 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3.5" fill="var(--protein)" opacity="${hit ? 0.95 : 0.35}"/>
      <text x="${(bx + bw / 2).toFixed(1)}" y="${H - 2}" text-anchor="middle" font-size="9.5" fill="var(--text-3)">${dow}</text>`;
  }).join('');
  const ty = H - 16 - (target / max) * (H - 30);
  return `<svg viewBox="0 0 ${W} ${H}">${bars}<line x1="${P}" x2="${W - P}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="var(--line-strong)" stroke-width="1.5" stroke-dasharray="5 5"/></svg>`;
}

function openWeightSheet() {
  const unit = S.settings.units === 'kg' ? 'kg' : 'lb';
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Log weight</h2><button class="sheet-close">Cancel</button></div>
    <div class="sheet-body">
      <div class="grid2">
        <div class="field"><label>Weight (${unit})</label><input id="wVal" type="text" inputmode="decimal" placeholder="0.0"></div>
        <div class="field"><label>Date</label><input id="wDate" type="date" value="${dateKey()}"></div>
      </div>
      <div style="height:8px"></div>
      <button class="btn" id="wSave">Save</button>
    </div>`);
  $('#wVal', wrap).focus();
  $('#wSave', wrap).addEventListener('click', async () => {
    const v = num($('#wVal', wrap).value);
    const d = $('#wDate', wrap).value;
    if (v == null || !d) { toast('Enter a weight'); return; }
    const kg = S.settings.units === 'kg' ? v : lbToKg(v);
    await db.put('weights', { date: d, kg });
    // keep profile weight fresh for future target recalcs
    S.settings.profile.weightKg = kg;
    await kvSet('settings', S.settings);
    toast('Weight logged');
    closeAllSheetsViaHistory();
    setTimeout(refresh, 80);
  });
}

/* ================= foods tab ================= */

async function renderFoods(el) {
  const customs = S.userFoods.filter(f => f.source === 'custom').sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
  const scanned = S.userFoods.filter(f => f.source !== 'custom').sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0)).slice(0, 12);
  const favIds = S.userFoods.filter(f => f.favorite).map(f => f.id);
  const kvRows = await db.all('kv');
  const genFavs = kvRows.filter(r => r.k.startsWith('fav-') && r.v).map(r => GENERIC_FOODS.find(g => g.id === r.k.slice(4))).filter(Boolean);
  const favs = [...S.userFoods.filter(f => f.favorite), ...genFavs];

  el.innerHTML = `
  <h1 class="page-h1">Foods<span class="sub">${GENERIC_FOODS.length} built-in · ${customs.length} custom · ${scanned.length ? scanned.length + ' scanned' : 'none scanned yet'}</span></h1>
  <div class="search-wrap">${ICONS.search}<input id="fq" class="input" type="search" placeholder="Search all foods" autocomplete="off"></div>
  <div id="fList"></div>`;

  const list = $('#fList', el);
  function base() {
    let html = '<button class="btn ghost" id="newFood" style="margin:4px 0 6px">+ Create a food</button>';
    if (favs.length) html += '<div class="sect-h">Favorites</div>' + favs.map(foodRowHtml).join('');
    if (customs.length) html += '<div class="sect-h">My foods</div>' + customs.map(foodRowHtml).join('');
    if (scanned.length) html += '<div class="sect-h">Recently scanned</div>' + scanned.map(foodRowHtml).join('');
    if (!favs.length && !customs.length && !scanned.length) html += '<p class="note" style="text-align:center;padding:20px">Foods you scan, create, or favorite collect here.</p>';
    list.innerHTML = html;
    bind();
  }
  function bind() {
    $$('[data-food]', list).forEach(b => b.addEventListener('click', () => {
      const f = findFood(b.dataset.food);
      if (f) openPortion(f, { meal: mealForHour(new Date().getHours()) });
    }));
    $('#newFood', list)?.addEventListener('click', () => openFoodForm({}));
  }
  $('#fq', el).addEventListener('input', e => {
    const q = e.target.value.trim();
    if (!q) { base(); return; }
    const res = searchFoods(allSearchableFoods(), q, 40);
    list.innerHTML = res.length ? res.map(foodRowHtml).join('') : '<p class="note" style="text-align:center;padding:20px">No matches.</p>';
    bind();
  });
  base();
}

/* ================= settings ================= */

function renderSettings(el) {
  const t = S.settings.targets;
  const p = S.settings.profile;
  const units = S.settings.units;
  el.innerHTML = `
  <h1 class="page-h1">Settings</h1>

  <div class="card">
    <div class="card-title">DAILY TARGETS <button class="link" id="recalc">Recalculate</button></div>
    <div class="grid4">
      <div class="field"><label>kcal</label><input id="tKcal" type="text" inputmode="numeric" value="${t.kcal}"></div>
      <div class="field"><label>Protein</label><input id="tP" type="text" inputmode="numeric" value="${t.p}"></div>
      <div class="field"><label>Carbs</label><input id="tC" type="text" inputmode="numeric" value="${t.c}"></div>
      <div class="field"><label>Fat</label><input id="tF" type="text" inputmode="numeric" value="${t.f}"></div>
    </div>
    <button class="btn small ghost" id="saveTargets">Save targets</button>
    <p class="note" style="margin-top:10px">Based on: ${p.sex === 'm' ? 'male' : 'female'}, ${p.age}, ${S.settings.units === 'kg' ? Math.round(p.heightCm) + ' cm' : cmToFtIn(p.heightCm).ft + "'" + cmToFtIn(p.heightCm).inch + '"'}, ${units === 'kg' ? p.weightKg.toFixed(1) + ' kg' : kgToLb(p.weightKg).toFixed(0) + ' lb'}, ${esc((ACTIVITY_LEVELS.find(a => a.id === p.activity) || {}).label || '')}, goal: ${esc((GOALS.find(g => g.id === p.goal) || {}).label || '')}.</p>
  </div>

  <div class="card">
    <div class="card-title">PREFERENCES</div>
    <div class="settings-row">
      <div class="lab"><b>Weight units</b><span>For logging and trends</span></div>
      <div class="seg" style="width:130px"><button id="uLb" class="${units === 'lb' ? 'on' : ''}">lb</button><button id="uKg" class="${units === 'kg' ? 'on' : ''}">kg</button></div>
    </div>
    <div class="settings-row">
      <div class="lab"><b>USDA API key</b><span>Optional: raises online search limit to 1,000/hr. <a href="https://fdc.nal.usda.gov/api-key-signup.html" target="_blank" rel="noopener">Get a free key</a></span></div>
    </div>
    <input class="input" id="fdcKey" placeholder="DEMO_KEY (default)" value="${esc(S.settings.fdcKey || '')}" style="margin-top:2px">
    <button class="btn small ghost" id="saveKey" style="margin-top:10px">Save key</button>
  </div>

  <div class="card">
    <div class="card-title">DATA</div>
    <div class="settings-row"><div class="lab"><b>Export backup</b><span>Everything as a JSON file</span></div><button class="btn small ghost" id="exportBtn">Export</button></div>
    <div class="settings-row"><div class="lab"><b>Import backup</b><span>Restore from a Tally export</span></div><button class="btn small ghost" id="importBtn">Import</button></div>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
    <div class="settings-row"><div class="lab"><b>Erase all data</b><span>Removes log, foods, weights</span></div><button class="btn small danger" id="eraseBtn">Erase</button></div>
  </div>

  <p class="note" style="text-align:center;margin-top:18px">
    Tally v1 · data lives only on this device<br>
    Food lookups: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> · <a href="https://fdc.nal.usda.gov" target="_blank" rel="noopener">USDA FoodData Central</a>
  </p>`;

  $('#saveTargets').addEventListener('click', async () => {
    const kcal = num($('#tKcal').value), p2 = num($('#tP').value), c = num($('#tC').value), f = num($('#tF').value);
    if (!kcal || kcal < 800) { toast('Calorie target looks too low'); return; }
    S.settings.targets = { ...S.settings.targets, kcal: Math.round(kcal), p: Math.round(p2 || 0), c: Math.round(c || 0), f: Math.round(f || 0) };
    await kvSet('settings', S.settings);
    toast('Targets saved');
  });
  $('#recalc').addEventListener('click', () => openProfileSheet());
  $('#uLb').addEventListener('click', async () => { S.settings.units = 'lb'; await kvSet('settings', S.settings); refresh(); });
  $('#uKg').addEventListener('click', async () => { S.settings.units = 'kg'; await kvSet('settings', S.settings); refresh(); });
  $('#saveKey').addEventListener('click', async () => {
    S.settings.fdcKey = $('#fdcKey').value.trim() || null;
    await kvSet('settings', S.settings);
    toast('Saved');
  });
  $('#exportBtn').addEventListener('click', async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tally-backup-${dateKey()}.json`;
    a.click();
    toast('Backup exported');
  });
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const counts = await importAll(JSON.parse(await file.text()));
      S.settings = await kvGet('settings') || S.settings;
      S.userFoods = await db.all('foods');
      toast(`Imported ${counts.log} log entries, ${counts.foods} foods`);
      refresh();
    } catch (err) { toast('Import failed: ' + err.message, 3200); }
  });
  $('#eraseBtn').addEventListener('click', async () => {
    if (!confirm('Erase ALL Tally data on this device? This cannot be undone.')) return;
    if (!confirm('Last check: your log, foods, and weights will be gone.')) return;
    for (const st of ['foods', 'log', 'weights', 'kv']) await db.clear(st);
    location.reload();
  });
}

/* ================= profile / onboarding ================= */

function profileFormHtml(p, units) {
  const imp = units !== 'kg';
  const { ft, inch } = cmToFtIn(p.heightCm || 178);
  return `
    <div class="field"><label>Units</label>
      <div class="seg"><button type="button" id="pfLb" class="${imp ? 'on' : ''}">lb / ft</button><button type="button" id="pfKg" class="${imp ? '' : 'on'}">kg / cm</button></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Sex (for BMR)</label>
        <div class="seg"><button type="button" id="pfM" class="${p.sex !== 'f' ? 'on' : ''}">Male</button><button type="button" id="pfF" class="${p.sex === 'f' ? 'on' : ''}">Female</button></div>
      </div>
      <div class="field"><label>Age</label><input id="pfAge" type="text" inputmode="numeric" value="${p.age || ''}" placeholder="30"></div>
    </div>
    <div class="grid2">
      <div class="field" id="hImp" ${imp ? '' : 'hidden'}><label>Height</label>
        <div class="grid2"><input id="pfFt" type="text" inputmode="numeric" value="${ft}" placeholder="ft"><input id="pfIn" type="text" inputmode="numeric" value="${inch}" placeholder="in"></div>
      </div>
      <div class="field" id="hMet" ${imp ? 'hidden' : ''}><label>Height (cm)</label><input id="pfCm" type="text" inputmode="numeric" value="${Math.round(p.heightCm || 178)}"></div>
      <div class="field"><label>Weight (<span id="wUnit">${imp ? 'lb' : 'kg'}</span>)</label><input id="pfW" type="text" inputmode="decimal" value="${p.weightKg ? (imp ? kgToLb(p.weightKg).toFixed(0) : p.weightKg.toFixed(1)) : ''}" placeholder="${imp ? '180' : '82'}"></div>
    </div>
    <div class="field"><label>Activity</label>
      <div id="pfAct">${ACTIVITY_LEVELS.map(a => `<button type="button" class="chip ${p.activity === a.id ? 'on' : ''}" data-act="${a.id}" style="margin:0 6px 7px 0">${a.label}</button>`).join('')}</div>
    </div>
    <div class="field"><label>Goal</label>
      <div id="pfGoal">${GOALS.map(g => `<button type="button" class="chip ${p.goal === g.id ? 'on' : ''}" data-goal="${g.id}" style="margin:0 6px 7px 0">${g.label}</button>`).join('')}</div>
      <p class="note" id="goalHint"></p>
    </div>
    <div class="card" style="background:var(--surface-2);margin:4px 0 12px">
      <div class="card-title">YOUR PLAN</div>
      <div id="pfPreview" class="note">Fill in the fields above.</div>
    </div>`;
}

function bindProfileForm(wrap, initial, onChange) {
  const state = { units: initial.units || 'lb', sex: initial.sex || 'm', activity: initial.activity || 'moderate', goal: initial.goal || 'recomp' };
  const get = () => {
    const imp = state.units === 'lb';
    const age = num($('#pfAge', wrap).value);
    const heightCm = imp ? ftInToCm(num($('#pfFt', wrap).value) || 0, num($('#pfIn', wrap).value) || 0) : (num($('#pfCm', wrap).value) || 0);
    const w = num($('#pfW', wrap).value);
    const weightKg = w == null ? null : (imp ? lbToKg(w) : w);
    return { sex: state.sex, age, heightCm, weightKg, activity: state.activity, goal: state.goal, units: state.units };
  };
  const upd = () => {
    const p = get();
    const hint = GOALS.find(g => g.id === state.goal);
    $('#goalHint', wrap).textContent = hint ? hint.hint : '';
    if (p.age && p.heightCm > 90 && p.weightKg) {
      const t = computeTargets(p);
      $('#pfPreview', wrap).innerHTML = `<div class="big-stat" style="margin:0"><span class="v" style="font-size:26px">${t.kcal.toLocaleString()} kcal</span><span class="d">/ day</span></div>
        <div style="margin-top:6px;font-weight:600;color:var(--text)">Protein ${t.p} g · Carbs ${t.c} g · Fat ${t.f} g</div>
        <div style="margin-top:4px">Maintenance ~${t.tdee.toLocaleString()} kcal</div>`;
      onChange?.(p, t);
    }
  };
  const setSeg = (sel, on) => { $$(sel, wrap).forEach(x => x.classList.remove('on')); on.classList.add('on'); };
  $('#pfLb', wrap).addEventListener('click', e => { state.units = 'lb'; setSeg('#pfLb,#pfKg', e.target); switchUnits(); });
  $('#pfKg', wrap).addEventListener('click', e => { state.units = 'kg'; setSeg('#pfLb,#pfKg', e.target); switchUnits(); });
  function switchUnits() {
    const imp = state.units === 'lb';
    $('#hImp', wrap).hidden = !imp; $('#hMet', wrap).hidden = imp;
    $('#wUnit', wrap).textContent = imp ? 'lb' : 'kg';
    const w = num($('#pfW', wrap).value);
    if (w != null) $('#pfW', wrap).value = imp ? kgToLb(w).toFixed(0) : lbToKg(w).toFixed(1);
    upd();
  }
  $('#pfM', wrap).addEventListener('click', e => { state.sex = 'm'; setSeg('#pfM,#pfF', e.target); upd(); });
  $('#pfF', wrap).addEventListener('click', e => { state.sex = 'f'; setSeg('#pfM,#pfF', e.target); upd(); });
  $$('#pfAct .chip', wrap).forEach(c => c.addEventListener('click', () => { state.activity = c.dataset.act; $$('#pfAct .chip', wrap).forEach(x => x.classList.toggle('on', x === c)); upd(); }));
  $$('#pfGoal .chip', wrap).forEach(c => c.addEventListener('click', () => { state.goal = c.dataset.goal; $$('#pfGoal .chip', wrap).forEach(x => x.classList.toggle('on', x === c)); upd(); }));
  ['#pfAge', '#pfFt', '#pfIn', '#pfCm', '#pfW'].forEach(sel => $(sel, wrap)?.addEventListener('input', upd));
  upd();
  return get;
}

function openProfileSheet() {
  const p = { ...S.settings.profile, units: S.settings.units, goal: S.settings.profile.goal, };
  const wrap = openSheet(`
    <div class="sheet-head"><h2>Your plan</h2><button class="sheet-close">Cancel</button></div>
    <div class="sheet-body">
      ${profileFormHtml(p, S.settings.units)}
      <button class="btn" id="pfSave">Update targets</button>
    </div>`, { cls: 'full' });
  const get = bindProfileForm(wrap, p);
  $('#pfSave', wrap).addEventListener('click', async () => {
    const np = get();
    if (!np.age || !np.weightKg || np.heightCm < 90) { toast('Fill in age, height, weight'); return; }
    S.settings.profile = { sex: np.sex, age: np.age, heightCm: np.heightCm, weightKg: np.weightKg, activity: np.activity, goal: np.goal };
    S.settings.units = np.units;
    S.settings.targets = computeTargets(S.settings.profile);
    await kvSet('settings', S.settings);
    toast('Plan updated');
    closeAllSheetsViaHistory();
    setTimeout(refresh, 80);
  });
}

function renderOnboarding() {
  const el = $('#screen');
  $('#tabbar').style.display = 'none';
  el.innerHTML = `
  <div class="onb">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h1>Count what counts.</h1>
    <p class="tag">Tally is a fast, private calorie and macro tracker. Scan barcodes, photograph nutrition labels, and log meals in seconds. Your data never leaves this device.</p>
    <div class="feature">${ICONS.barcode.replace('<svg', '<svg class="fi"')}<div><b>Instant barcode scanning</b><span>Millions of packaged foods via Open Food Facts + USDA</span></div></div>
    <div class="feature">${ICONS.label.replace('<svg', '<svg class="fi"')}<div><b>Label camera</b><span>Photograph any Nutrition Facts panel, Tally reads it on-device</span></div></div>
    <div class="feature">${ICONS.bolt.replace('<svg', '<svg class="fi"')}<div><b>Built for consistency</b><span>Recents, favorites, copy-yesterday, streaks</span></div></div>
    <div class="spacer"></div>
    <button class="btn" id="onbGo">Set up my plan</button>
    <div style="height:9px"></div>
    <button class="btn ghost" id="onbSkip">Skip, use defaults</button>
  </div>`;
  $('#onbGo').addEventListener('click', () => {
    el.innerHTML = `<div class="onb" style="padding-top:calc(var(--sat) + 18px)">
      <h1 style="font-size:26px;margin-bottom:14px">Your plan</h1>
      <div id="pfHost">${profileFormHtml({ }, 'lb')}</div>
      <button class="btn" id="onbSave">Start tracking</button>
      <div style="height:30px"></div>
    </div>`;
    const get = bindProfileForm(el, { units: 'lb' });
    $('#onbSave').addEventListener('click', async () => {
      const np = get();
      if (!np.age || !np.weightKg || np.heightCm < 90) { toast('Fill in age, height, weight'); return; }
      await saveInitialSettings(np);
    });
  });
  $('#onbSkip').addEventListener('click', async () => {
    await saveInitialSettings({ sex: 'm', age: 30, heightCm: 178, weightKg: lbToKg(180), activity: 'moderate', goal: 'recomp', units: 'lb' });
    toast('Using defaults. Tune them in Settings.', 3000);
  });
}

async function saveInitialSettings(np) {
  const profile = { sex: np.sex, age: np.age, heightCm: np.heightCm, weightKg: np.weightKg, activity: np.activity, goal: np.goal };
  S.settings = {
    profile,
    targets: computeTargets(profile),
    units: np.units,
    fdcKey: null,
    createdAt: Date.now(),
  };
  await kvSet('settings', S.settings);
  $('#tabbar').style.display = '';
  window.addEventListener('hashchange', route);
  bindTabs();
  location.hash = '#/today';
  route();
}

/* ================= demo seed ================= */

async function seedDemo() {
  const profile = { sex: 'm', age: 33, heightCm: 180, weightKg: 84, activity: 'moderate', goal: 'recomp' };
  const settings = { profile, targets: computeTargets(profile), units: 'lb', fdcKey: null, createdAt: Date.now() };
  await kvSet('settings', settings);
  const g = id => GENERIC_FOODS.find(f => f.id === id);
  const put = async (date, meal, foodId, idx, qty, hourTs) => {
    const food = g(foodId);
    const sel = { mode: 'serving', idx, qty };
    const n = nutrientsFor(food, sel);
    await db.put('log', {
      id: newId(), date, meal, ts: new Date(date + 'T12:00').getTime() + hourTs * 3600e3,
      foodId, name: food.name, brand: null, portionLabel: portionLabel(food, sel), sel,
      kcal: n.kcal, p: n.p || 0, c: n.c || 0, f: n.f || 0, fiber: n.fiber || 0, sugar: n.sugar || 0, sodium: n.sodium || 0,
    });
  };
  const today = dateKey();
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const skipDinner = i === 0;
    await put(d, 0, 'g-oats-dry-rolled', 1, 1, -4);
    await put(d, 0, 'g-banana', 0, 1, -4);
    await put(d, 0, 'g-greek-yogurt-plain-2', 0, 1, -3.8);
    await put(d, 0, 'g-coffee-black', 0, 1, -4.2);
    await put(d, 1, 'g-chicken-breast-cooked', 1, 1, 0.5);
    await put(d, 1, 'g-white-rice-cooked', 1, i % 2 ? 1 : 1.5, 0.5);
    await put(d, 1, 'g-broccoli-cooked', 0, 1, 0.5);
    if (i % 3 === 0) await put(d, 3, 'g-almonds', 0, 1, 3);
    if (i % 2 === 0) await put(d, 3, 'g-apple', 0, 1, 3.2);
    if (!skipDinner) {
      await put(d, 2, 'g-salmon-cooked', 0, 1, 7);
      await put(d, 2, 'g-potato-baked-with-skin', 0, 1, 7);
      await put(d, 2, 'g-mixed-salad-greens', 0, 1, 7);
      await put(d, 2, 'g-olive-oil', 1, 1, 7);
      if (i % 4 === 1) await put(d, 2, 'g-dark-chocolate-70-85', 1, 1, 8.5);
    }
  }
  for (let i = 30; i >= 0; i -= 1) {
    if (i % 7 === 2 || i % 7 === 5) continue; // not every day
    const kg = 87.4 - (30 - i) * 0.045 + ((i * 7) % 3) * 0.14 - 0.1;
    await db.put('weights', { date: addDays(today, -i), kg: Math.round(kg * 10) / 10 });
  }
}

/* ================= go ================= */

boot();
