/* c1, 2026-09-08: authored cadence, not browser performance evidence.
 * Execute the real pointer/render path with a minimal DOM and clock. The old serial path
 * is a positive control: 330 + 40 + 420 = 790ms must fail the same grader.
 * TAIL in crate-reveal-audit watches OPENING, so its 60ms measured floor and
 * playCrateSeq's 100ms authored HOLD remain unchanged.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const app = read('../js/app.js'), css = read('../app.css');
let passed = 0, failed = 0;
function check(label, fn) {
  try { fn(); passed++; console.log(`PASS ${label}`); }
  catch (error) { failed++; console.log(`FAIL ${label}: ${error.message}`); }
}
function between(source, start, end) {
  assert.equal(source.split(start).length, 2, `unique anchor ${start}`);
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(to > from, `end anchor ${end}`);
  return source.slice(from, to);
}
function node() {
  return {
    style: { setProperty(k, v) { this[k] = v; } }, dataset: {}, children: [],
    appendChild(child) {
      child.remove(); this.children.push(child); child.parentNode = this;
    },
    remove() {
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(n => n !== this);
      this.parentNode = null;
    },
    get offsetWidth() { return 240; },
    setAttribute(k, v) { this[k] = v; },
  };
}
function drive(source, { last = false, reduced = false, dir = -1 } = {}) {
  const scene = node(), deck = node(), tilt = node(), rise = node(), sway = node(), reveal = node();
  scene.appendChild(deck); deck.appendChild(tilt); tilt.appendChild(rise); rise.appendChild(sway);
  reveal.dataset.landed = '1';
  const tasks = [], advances = [], closes = [];
  let now = 0, pauses = 0;
  const context = {
    tilt, sway, reveal, deck, reduced, innerWidth: 400,
    i: last ? 1 : 0, cards: [{}, {}],
    burst: { pause() { pauses++; } },
    document: { createElement: node },
    getComputedStyle(el) { return { transform: el === rise ? 'matrix(rise)' : 'matrix(sway)', opacity: '1',
      getPropertyValue: k => k === '--rar' ? '#gold' : '255, 200, 0' }; },
    $: selector => selector === '.pc-rise' ? rise : null,
    at(ms, fn) { tasks.push({ t: now + ms, fn }); },
    advance() { advances.push(now); deck.children.slice().forEach(n => n.remove()); deck.appendChild(node()); },
    done() { closes.push(now); },
  };
  vm.createContext(context);
  vm.runInContext(`let flung = false; ${between(source, '      const fling = dir => {', "      tilt.addEventListener('pointerdown'")}\nthis.fling = fling;`, context);
  context.fling(dir); context.fling(dir); // duplicate click must not deal twice
  const outgoing = scene.children.find(n => n !== deck);
  const tick = t => {
    while (tasks.some(x => x.t <= t)) {
      tasks.sort((a, b) => a.t - b.t);
      const task = tasks.shift(); now = task.t; task.fn();
    }
    now = t;
  };
  return { tick, advances, closes, tilt, rise, sway, reveal, deck, scene, outgoing, pauses, tasks };
}
function numbers(source, styles) {
  const run = drive(source); run.tick(1000);
  const browse = between(styles, '.pack-reveal.browsing {', '\n}');
  const delay = Number(browse.match(/--b-card:\s*([.\d]+)s/)[1]) * 1000;
  const rise = Number(styles.match(/animation: crNext ([.\d]+)s/)[1]) * 1000;
  return { advance: run.advances[0], delay, rise, settled: run.advances[0] + delay + rise };
}
function grade(n) {
  assert.deepEqual(n, { advance: 0, delay: 20, rise: 380, settled: 400 });
}

// Drive the real renderCard, advance and pointer listeners, not a stub advance.
// DOM/layout, art readiness and frame delivery are doubles, never pixel proof.
async function driveRender(source, { artDelay = 0, frames = true, dx = -100, opening = true } = {}) {
  let now = 0, artCalls = 0;
  const tasks = [], entrances = [], captures = [], renders = [], reads = [];
  const later = (fn, ms = 0) => tasks.push({ t: now + ms, fn });
  const make = () => {
    const el = node(), classes = new Set(), listeners = {};
    el.isConnected = true;
    el.style.removeProperty = key => delete el.style[key];
    el.classList = {
      add(name) {
        if (el === deck && name === 'go' && !classes.has(name)) entrances.push({ i: ctx.i, t: now });
        classes.add(name);
      },
      remove: name => classes.delete(name),
    };
    Object.defineProperty(el, 'offsetWidth', { get() { reads.push({ el, t: now }); return 240; } });
    el.addEventListener = (type, fn) => (listeners[type] ||= []).push(fn);
    el.dispatchEvent = event => { for (const fn of listeners[event.type] || []) fn(event); };
    el.setPointerCapture = id => captures.push(id);
    el.closest = () => null;
    return el;
  };
  const scene = make(), deck = make(), reveal = make();
  scene.appendChild(deck);
  Object.defineProperty(deck, 'innerHTML', { set() {
    deck.children.slice().forEach(child => child.remove());
    const tilt = make(), rise = make(), sway = make();
    tilt.kind = '.pack-tilt'; rise.kind = '.pc-rise'; sway.kind = '.pc-sway';
    deck.appendChild(tilt); tilt.appendChild(rise); rise.appendChild(sway);
    renders.push({ i: ctx.i, t: now });
  } });
  const query = (selector, scope = deck) => {
    for (const child of scope.children || []) {
      if (child.kind === selector) return child;
      const nested = query(selector, child); if (nested) return nested;
    }
    return null;
  };
  const ctx = {
    i: 0, cards: Array.from({ length: 3 }, () => ({ rarity: 'common' })),
    opening, reduced: false, crate: null, CRATE_SEQ: {}, RAR_ORDER: ['common'], BURST: { common: {} },
    deck, reveal, wrap: scene, countEl: null, hintEl: null, dotsEl: null,
    burstTried: true, burst: null, burstEl: null,
    innerWidth: 400, document: { createElement: make }, $: query,
    packCardHtml: () => '', wirePackArtFallback() {},
    hydratePackArt() {
      artCalls++;
      return new Promise(resolve => later(resolve, artCalls === 1 ? 0 : artDelay));
    },
    getComputedStyle: () => ({ transform: 'none', getPropertyValue: () => '' }),
    at: (ms, fn) => later(fn, ms), setTimeout: later,
    requestAnimationFrame: fn => { if (frames) later(fn, 16); },
    beat: () => 300, landed: () => { reveal.dataset.landed = '1'; },
    dropSound() {}, sparkleSound() {}, S: {}, haptic: { tap() {} },
    done() { throw new Error('unexpected close'); },
  };
  const render = between(source, '    function renderCard() {', '\n    // a coins-only payout');
  const advance = between(source, '    const advance = () => {', '\n    // No confetti');
  vm.createContext(ctx);
  vm.runInContext(`${advance}\n${render}\nrenderCard();`, ctx);
  const tick = async t => {
    // Flush native Promise.race/then jobs between authored timer callbacks.
    for (;;) {
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      tasks.sort((a, b) => a.t - b.t);
      if (!tasks.length || tasks[0].t > t) break;
      const task = tasks.shift(); now = task.t; task.fn();
    }
    now = t;
  };
  await tick(1000);
  assert.equal(reveal.dataset.landed, '1', 'first card actually reaches its input gate');
  now = 0; tasks.length = 0; entrances.length = 0; renders.length = 0; reads.length = 0;
  const tilt = query('.pack-tilt');
  for (const [type, clientX] of [['pointerdown', 200], ['pointermove', 200 + dx], ['pointerup', 200 + dx]]) {
    tilt.dispatchEvent({ type, clientX, pointerId: 7, target: tilt });
  }
  assert.deepEqual(captures, [7], 'pointerdown must capture the real gesture');
  await tick(0);
  const outgoing = scene.children.find(el => el !== deck);
  assert.ok(outgoing, 'pointerup must actually fling, not just record pointerdown');
  assert.equal(outgoing.children[0], tilt);
  assert.equal(ctx.i, 1, 'real advance increments exactly once');
  tilt.dispatchEvent({ type: 'click', target: tilt });
  await tick(339); assert.equal(outgoing.parentNode, scene);
  await tick(340); assert.equal(outgoing.parentNode, null);
  await tick(2000);
  assert.deepEqual(renders, [{ i: 1, t: 0 }]);
  assert.equal(artCalls, 2, 'both cards still hydrate their actual art');
  assert.equal(entrances.length, 1, 'late callbacks cannot restart the next entrance');
  return { start: entrances[0].t, layoutCommitted: reads.some(r => r.el === deck && r.t === 0) };
}

async function checkAsync(label, fn) {
  try { await fn(); passed++; console.log(`PASS ${label}`); }
  catch (error) { failed++; console.log(`FAIL ${label}: ${error.stack}`); }
}

check('CADENCE exact authored 0 + 20 + 380 = 400ms', () => grade(numbers(app, css)));
check('ENTRY shipped page loads the audited JS and scoped browsing animation', () => {
  const entry = read('../index.html');
  assert.match(entry, /<script type="module" src="js\/app\.js"><\/script>/);
  assert.match(entry, /<link rel="stylesheet" href="app\.css">/);
  assert.match(css, /\.pack-reveal\.browsing \.pack-deck\.go \.pc-rise \{ animation: crNext \.38s cubic-bezier\(\.2,\.9,\.3,1\) var\(--b-card\) both; \}/);
});
await checkAsync('POINTER-RENDER real advance starts the next entrance at 0ms despite cold art or stalled frames', async () => {
  for (const options of [
    { artDelay: 0 }, { artDelay: 500, dx: 100 },
    { artDelay: 5000, frames: false }, { opening: false, artDelay: 5000, dx: 0 },
  ]) {
    const run = await driveRender(app, options);
    assert.equal(run.start, 0);
    assert.equal(run.layoutCommitted, true);
    const n = numbers(app, css);
    grade({ ...n, settled: run.start + n.delay + n.rise });
  }
});
await checkAsync('CONTROL hidden art/frame gates add 1000ms and fail the end-to-end grader', async () => {
  const legacy = app.replace('const next = i > 0 && !reduced;', 'const next = false;');
  assert.notEqual(legacy, app, 'control mutation must apply');
  const run = await driveRender(legacy, { artDelay: 5000, frames: false });
  assert.equal(run.start, 1000, '700ms art race plus 300ms frame fallback');
  const n = numbers(legacy, css);
  assert.throws(() => grade({ ...n, settled: run.start + n.delay + n.rise }), assert.AssertionError);
});
check('CONTROL old serial 330 + 40 + 420 = 790ms is rejected', () => {
  const legacyApp = app.replace('at(0, advance)', 'at(330, advance)');
  const legacyCss = css.replace('--b-card: .02s;', '--b-card: .04s;').replace('crNext .38s', 'crNext .42s');
  const old = numbers(legacyApp, legacyCss);
  assert.equal(old.settled, 790);
  assert.throws(() => grade(old), assert.AssertionError);
});
check('OVERLAP both throw directions retain the old art through the full 340ms flight', () => {
  for (const dir of [-1, 1]) {
    const r = drive(app, { dir });
    assert.ok(r.outgoing, 'outgoing layer must exist');
    assert.equal(r.outgoing.children[0], r.tilt, 'retain the real art subtree');
    assert.equal(r.rise.style.transform, 'matrix(rise)');
    assert.equal(r.sway.style.transform, 'matrix(sway)');
    assert.equal(r.rise.style.animation, 'none');
    assert.equal(r.outgoing.style['--rar'], '#gold');
    assert.equal(r.outgoing['aria-hidden'], 'true');
    assert.equal(r.reveal.dataset.landed, undefined);
    assert.equal(r.pauses, 1);
    assert.match(r.tilt.style.transition, /transform \.34s/);
    assert.equal(r.tilt.style.transform, `translateX(${dir * 480}px) rotate(${dir * 15}deg)`);
    r.tick(0); assert.deepEqual(r.advances, [0]);
    assert.equal(r.tilt.parentNode, r.outgoing, 'deck rebuild cannot delete outgoing card');
    r.tick(339); assert.equal(r.outgoing.parentNode, r.scene);
    r.tick(340); assert.equal(r.outgoing.parentNode, null);
    assert.deepEqual(r.advances, [0]); assert.deepEqual(r.closes, []);
  }
});
check('LAST and REDUCED keep their existing 330ms dispatch and create no outgoing layer', () => {
  for (const opts of [{ last: true }, { reduced: true }, { last: true, reduced: true }]) {
    const r = drive(app, opts);
    assert.equal(r.outgoing, undefined);
    r.tick(329); assert.equal(r.advances.length + r.closes.length, 0);
    r.tick(330);
    assert.deepEqual(opts.last ? r.closes : r.advances, [330]);
  }
});
check('LIFECYCLE stale entrances cannot restart the next deck or a closed reveal', () => {
  const reveal = between(app, 'function openPackReveal(', '\n// Normalize a crate result');
  const go = between(reveal, '      const go = () => {', '\n      if (first)');
  for (const state of ['live', 'flung', 'closed']) {
    const callbacks = [], added = [];
    const c = { flung: false, reveal: { isConnected: true },
      deck: { classList: { add: name => added.push(name) } },
      requestAnimationFrame: fn => callbacks.push(fn), setTimeout: fn => callbacks.push(fn) };
    vm.runInNewContext(`${go}\ngo();`, c);
    if (state === 'flung') c.flung = true;
    if (state === 'closed') c.reveal.isConnected = false;
    while (callbacks.length) callbacks.shift()();
    assert.equal(added.length, state === 'live' ? 2 : 0);
  }
});
check('FLIGHT pointerleave cannot settle a departing card back to centre', () => {
  const settle = between(app, '      const settle = () => {', '\n      /* The card FLIES OFF');
  const tilt = node(), sway = node();
  tilt.style.transform = 'outgoing';
  vm.runInNewContext(`${settle}\nsettle();`, { flung: true, tilt, sway, glare: null });
  assert.equal(tilt.style.transform, 'outgoing');
  assert.match(css, /\.pack-deck\.pack-outgoing \{ z-index: 2; pointer-events: none; \}/);
});
check('BROWSING clears delayed opening overrides only after the first card', () => {
  const release = between(app, '      if (!first && opening) {', '\n      // .opening runs');
  for (const first of [true, false]) {
    const removed = [];
    vm.runInNewContext(release, { first, opening: true, wrap: {}, $: () => null,
      reveal: { style: { removeProperty: key => removed.push(key) } } });
    assert.deepEqual(removed, first ? [] : ['--b-sink', '--b-card', '--b-count', '--b-title', '--b-foot', '--b-sway', '--b-spark']);
  }
});
check('TAIL opening still authors 100ms and retains the measured 60ms floor', () => {
  assert.match(app, /const HOLD = 100;/);
  assert.match(read('crate-reveal-audit.mjs'), /hold >= 60/);
  assert.match(css, /--b-sink: 1\.64s; --b-card: 1\.82s;/);
});
check('GUARD is registered in PURE', () => {
  const pure = between(read('release-gate.mjs'), 'const PURE =', 'const BROWSER =');
  assert.ok(pure.includes("'crate-cadence-audit.mjs'"));
});
console.log(`\n${passed}/${passed + failed} passed`);
process.exitCode = failed ? 1 : 0;
