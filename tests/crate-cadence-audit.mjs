/* c1, 2026-09-08: authored cadence, not browser performance evidence.
 * Execute the real fling with a minimal DOM and clock. The old serial path
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

check('CADENCE exact authored 0 + 20 + 380 = 400ms', () => grade(numbers(app, css)));
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
