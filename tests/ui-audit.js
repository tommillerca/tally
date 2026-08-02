/* Boneheadz UI audit. Paste into the app's console (or run via the Browser pane)
 * BEFORE claiming a UI change is verified.
 *
 *   await uiAudit()
 *
 * Exists because four regressions shipped in one day (2026-07-28) and every one
 * got past a check that could not have failed:
 *
 *   - avatars hidden by default, un-hidden only on the one path that was tested
 *   - the Trends chip opened the wrong screen; only "does the screen render" was
 *     checked, never "does the control go where it says"
 *   - the Settings gear sat on top of the next-day arrow and ate its taps; the
 *     overlap was assumed to be elsewhere and never hit-tested
 *   - the hero slid under the Dynamic Island; verified on a desktop browser,
 *     which reports no safe area, and "heroStartsAtTop: 0" was reported as proof
 *     of success when that number WAS the bug
 *
 * So this audit does the three things eyeballing cannot: it operates controls,
 * hit-tests what is on top of what, and fakes a notch. It fails loudly and
 * returns a non-empty problem list; an empty sample set counts as a failure, not
 * a pass.
 */
const SAFE_AREA_PX = 59;          // iPhone 14 Pro Dynamic Island

// Where each control must land. Add a row whenever you add a control.
const CONTROL_EXPECTATIONS = [
  { id: 'streakChip', on: 'today', expect: { hash: '#/progress' } },
  { id: 'coinBtn', on: 'today', expect: { hash: '#/bonehead', hubTab: 'crates' } },
  { id: 'dustBtn', on: 'today', expect: { hash: '#/bonehead', hubTab: 'crates' } },
  { id: 'cratesBtn', on: 'today', expect: { hash: '#/bonehead', hubTab: 'crates' } },
  { id: 'vigorBtn', on: 'today', expect: { sheet: 'The Pit' } },
  { id: 'charBtn', on: 'today', expect: { hash: '#/bonehead', hubTab: 'wardrobe' } },
  { id: 'todaySettings', on: 'today', expect: { hash: '#/settings' } },
  // the Puffer Pack drop: the pinned banner's CTA must land on the hub's Shop tab
  { id: 'dropToShop', on: 'today', expect: { hash: '#/bonehead', hubTab: 'shop' }, open: 'details.drop-banner' },
  { id: 'spireToMap', on: 'today', expect: { hash: '#/boneyard' }, open: 'details.spire-banner' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = s => document.querySelector(s);

async function goto(route, wait = 1800) {
  location.hash = '#/' + route;
  await sleep(wait);
  q('.dw')?.remove();                       // daily wheel steals the screen
  while (q('#sheets > div')) { history.back(); await sleep(300); }
}

/** Which button actually receives a tap at an element's centre.
 *  Scrolls it into view first, because that is what a user does: a control that
 *  merely sits behind the fixed tab bar at rest is reachable, while one that is
 *  still covered after scrolling to it is genuinely broken (the Settings gear over
 *  the next-day arrow was the latter). Without this the check flags every button
 *  that happens to sit low on a long page. */
function topmostAt(el) {
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return hit?.closest('button')?.id || hit?.tagName || 'none';
}

export async function uiAudit({ routes = ['today', 'bonehead', 'shop', 'friends', 'settings', 'progress'] } = {}) {
  const problems = [];
  const checked = { routes: 0, controls: 0, overlays: 0 };

  // 1. Every control goes where it claims. Rendering proves nothing.
  for (const c of CONTROL_EXPECTATIONS) {
    await goto(c.on);
    // controls that live inside a collapsed <details> (the pinned banners): expand
    // it first, the way a user would, so the click starts from a visible control
    if (c.open) { q(c.open)?.setAttribute('open', ''); await sleep(250); }
    const el = q('#' + c.id);
    if (!el) { problems.push(`control #${c.id} is MISSING on ${c.on}`); continue; }
    el.click();
    await sleep(1700);
    checked.controls++;
    if (c.expect.hash && location.hash !== c.expect.hash) {
      problems.push(`#${c.id} went to ${location.hash}, expected ${c.expect.hash}`);
    }
    if (c.expect.hubTab) {
      const tab = q('#chTabs .ch-tab.on')?.dataset.tab;
      if (tab !== c.expect.hubTab) problems.push(`#${c.id} opened hub tab ${tab}, expected ${c.expect.hubTab}`);
    }
    if (c.expect.sheet) {
      const title = q('#sheets .sheet h2')?.textContent?.trim();
      if (title !== c.expect.sheet) problems.push(`#${c.id} opened sheet "${title}", expected "${c.expect.sheet}"`);
    }
  }

  // 2. Nothing floating may swallow a button underneath it.
  for (const route of routes) {
    await goto(route);
    // offsetParent no longer proves visibility: Chrome hides closed-<details>
    // content via content-visibility, which KEEPS layout geometry, so a button in
    // a collapsed banner reports a full-size rect (behind the tab bar) while being
    // invisible and untappable. Filter those out or every pinned banner CTA reads
    // as a phantom overlay bug.
    for (const btn of [...document.querySelectorAll('button')].filter(b => b.offsetParent && !b.hidden && !b.closest('details:not([open])'))) {
      if (!btn.id) continue;
      checked.overlays++;
      const top = topmostAt(btn);
      if (top !== btn.id && top !== 'none') {
        problems.push(`${route}: #${btn.id} is covered by #${top}, so its taps go elsewhere`);
      }
    }
  }

  // 3. Fake a notch. A desktop browser reports no safe area, so every
  //    safe-area fault is invisible unless it is simulated.
  const root = document.documentElement;
  const prev = root.style.getPropertyValue('--sat');
  root.style.setProperty('--sat', SAFE_AREA_PX + 'px');
  await sleep(500);
  const mustClearNotch = '.hero-top button, .day-strip button, .page-h1, #gearBtn, .ch-tab, .bh-coin, .bh-crates, .streak-chip';
  for (const route of routes) {
    await goto(route);
    checked.routes++;
    for (const el of [...document.querySelectorAll(mustClearNotch)].filter(e => e.offsetParent && !e.hidden)) {
      const top = el.getBoundingClientRect().top;
      if (top < SAFE_AREA_PX && top > -400) {
        problems.push(`${route}: ${el.id || el.className.split(' ')[0]} sits at y=${Math.round(top)}, under the ${SAFE_AREA_PX}px notch`);
      }
    }
    const hero = q('#bhStage');
    if (hero && hero.getBoundingClientRect().top < SAFE_AREA_PX) {
      problems.push(`${route}: the Bonehead starts at y=${Math.round(hero.getBoundingClientRect().top)}, clipped by the notch`);
    }
  }
  if (prev) root.style.setProperty('--sat', prev); else root.style.removeProperty('--sat');

  // An audit that examined nothing is a FAILURE, not a pass. Two of the checks
  // this file exists to replace "passed" on empty sample sets.
  if (!checked.controls || !checked.overlays || !checked.routes) {
    problems.push(`audit examined nothing: ${JSON.stringify(checked)} — treat as FAILED`);
  }

  return { pass: problems.length === 0, checked, problems };
}

if (typeof window !== 'undefined') window.uiAudit = uiAudit;
