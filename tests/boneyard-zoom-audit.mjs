// Frozen ruling, 2026-09-09: zoom belongs to the Boneyard camera only.
// Node-only policy proof. Execute the real router, view boot and teardown with
// DOM/GPS/MapLibre stand-ins. Stop at the first map.on boundary, before world
// simulation. This does not simulate a browser or prove physical gestures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { cssDeclarations } from './lib/css-declarations.mjs';
import { MAP_MIN_ZOOM, MAP_MAX_ZOOM, MAP_START_ZOOM } from '../js/map.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../js/app.js');
const mapSource = read('../js/map.js');
const css = read('../app.css');
function fn(source, name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `real function ${name} must exist`);
  return match[0];
}
function replace(source, from, to) {
  assert.equal(source.split(from).length, 2, `unique mutation anchor: ${from}`);
  return source.replace(from, to);
}

async function verify(styles, cameraSource) {
  const declarations = cssDeclarations(styles);
  const value = (selector, property) => declarations.filter(row =>
    row.context.split(',').map(s => s.trim()).includes(selector) && row.property === property).at(-1)?.value;
  // Read CSS, not viewport meta. Include the root so sheets, controls and
  // nested scrollers have the same page policy as the active view.
  const pageZoom = ['html', 'body'].every(selector =>
    /^(auto|manipulation)$|\bpinch-zoom\b/.test(value(selector, 'touch-action') || 'auto'));
  assert.equal(value('.screen-held', 'pointer-events'), 'none', 'held outgoing map cannot accept new gestures');

  let tab = 'today', startMap, pendingFix = null;
  const maps = [], nodes = new Map(), timers = new Map();
  let timerId = 0;
  const boundary = new Error('audit reached world-simulation boundary');
  function node() {
    const classes = new Set();
    const el = {
      style: {}, children: [], listeners: {}, scrollTop: 0, offsetTop: 0, offsetHeight: 800,
      classList: {
        add: (...names) => names.forEach(n => classes.add(n)),
        remove: (...names) => names.forEach(n => classes.delete(n)),
        contains: n => classes.has(n),
        toggle(n, on) { if (on) classes.add(n); else classes.delete(n); },
      },
      set className(s) { classes.clear(); s.split(/\s+/).forEach(n => classes.add(n)); },
      get className() { return [...classes].join(' '); },
      set innerHTML(html) {
        this.children = [node()];
        for (const [, id] of html.matchAll(/id="([^"]+)"/g)) nodes.set(`#${id}`, node());
      },
      get firstChild() { return this.children[0]; },
      get firstElementChild() { return this.firstChild; },
      get childNodes() { return this.children; },
      append(...children) { this.children.push(...children); },
      after(other) { other.parentNode = this.parentNode; this.parentNode.children.push(other); },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(n => n !== this); },
      querySelectorAll() { return this.children.filter(n => n.classList.contains('screen-held')); },
      addEventListener(type, cb) { this.listeners[type] = cb; },
      setAttribute(name, val) { this[name] = val; },
    };
    return el;
  }
  const screen = node(), parent = node();
  screen.parentNode = parent; parent.children.push(screen); nodes.set('#screen', screen);
  const noop = () => {};
  const renderOther = el => { el.innerHTML = '<p>Other view</p>'; };
  class MapStandIn {
    constructor(options) {
      this.options = options;
      this.zoom = options.zoom;
      this.removed = false;
      this.touchZoomRotate = {
        enabled: options.touchZoomRotate !== false,
        rotation: true,
        disableRotation() { this.rotation = false; },
        isEnabled() { return this.enabled; },
      };
      maps.push(this);
    }
    on() { throw boundary; } // map assigned to the real view before stopping
    remove() { this.removed = true; this.touchZoomRotate.enabled = false; }
  }
  const context = vm.createContext({
    MAP_MIN_ZOOM, MAP_MAX_ZOOM, MAP_START_ZOOM,
    captureStart: fn => { startMap = fn; },
    navigator: { webdriver: false, geolocation: {
      getCurrentPosition(resolve) {
        const finish = () => resolve({ coords: { latitude: 49.28, longitude: -123.12 } });
        if (pendingFix) pendingFix.resolve = finish; else finish();
      }, clearWatch: noop,
    } },
    document: { createElement: node },
    $: selector => nodes.get(selector) || null, $$: () => [],
    currentTab: () => tab, S: {}, saveRecoveryActive: false, sheetStack: [],
    screenCleanup: null, dropHeld: null, _dayRefreshPending: false,
    huntWatchId: null, huntStopOrient: null, mapWanted: false,
    COLLECT_RADIUS_M: 75, warmMapArt: noop, equipped: async () => ({}),
    mapLegendHtml: () => '', bhIcon: () => '', ICONS: { crosshair: () => '' },
    loadMaplibre: async () => ({ Map: MapStandIn }),
    kvGet: async () => false, kvSet: async () => {}, scheduleRares: noop,
    removeEventListener: noop, addEventListener: noop,
    setTimeout: cb => { timers.set(++timerId, cb); return timerId; },
    clearTimeout: id => timers.delete(id), requestAnimationFrame: cb => cb(),
    closeAllSheets: noop, trackScreen: noop, refreshCrateBadge: noop,
    maybeCelebrate: noop, composeAvatars: noop, markBooted: noop, startTalkBoxes: noop,
    revealWhenReady: async el => el.classList.add('screen-in'),
    renderToday: renderOther, renderBonehead: renderOther, renderTrends: renderOther,
    renderFoods: renderOther, renderFriends: renderOther, renderSettings: renderOther,
  });
  // Expose the existing start/retry closure; its body and the renderer are real.
  const render = replace(fn(app, 'renderBoneyard'), "  $('#mapStart', wrap).addEventListener",
    "  captureStart(startMap);\n  $('#mapStart', wrap).addEventListener");
  vm.runInContext([
    fn(cameraSource, 'createBoneyardMap'), fn(app, 'stopHuntWatch'),
    fn(app, 'boneyardFloorMsg'), render, fn(app, 'holdOutgoing'), fn(app, 'route'),
  ].join('\n'), context);

  const boot = async () => {
    await assert.rejects(startMap(), error => error === boundary, 'real boot must reach the map event boundary');
    const map = maps.at(-1);
    assert.equal(map.options.container, nodes.get('#mapCanvas'), 'camera must attach to Boneyard canvas');
    assert.equal(map.touchZoomRotate.isEnabled(), true, 'Boneyard zoom must be permitted');
    assert.equal(map.touchZoomRotate.rotation, false, 'existing north-up gesture policy preserved');
    assert.equal(map.options.touchPitch, false);
    assert.equal(map.options.dragRotate, false);
    assert.equal(map.zoom, MAP_START_ZOOM, 'fresh visit starts at default camera scale');
    return map;
  };
  const route = async next => { tab = next; await context.route(); };
  // Positive CONTROL: every non-map route is reached through the real router.
  for (const next of ['today', 'bonehead', 'shop', 'progress', 'trends', 'foods', 'friends', 'settings', 'unknown']) {
    await route(next);
    assert.equal(pageZoom, false, `${next}: page zoom must be refused`);
    assert.equal(maps.filter(m => !m.removed).length, 0, `${next}: no active map camera`);
    for (const axis of ['pan-x', 'pan-y']) {
      assert.ok(value('html', 'touch-action').split(' ').includes(axis), `${next}: retain ${axis} scrolling`);
    }
  }
  await route('boneyard');
  assert.ok(screen.classList.contains('screen--map'), 'real Boneyard route selected');
  const first = await boot();
  assert.equal(pageZoom, false, 'Boneyard chrome and sheets cannot page-zoom');
  // Existing key tap and canvas pointer handler must survive unchanged.
  const key = nodes.get('#mapKeyBtn'), legend = nodes.get('#mapLegend');
  legend.hidden = true;
  key.listeners.click({ stopPropagation: noop });
  assert.equal(legend.hidden, false, 'map key tap opens legend');
  nodes.get('#mapCanvas').listeners.pointerdown();
  assert.equal(legend.hidden, true, 'map pointer closes legend');
  first.zoom = MAP_MAX_ZOOM;
  await route('today');
  assert.equal(first.removed, true, 'real route and held-view teardown remove the camera');
  assert.equal(first.touchZoomRotate.isEnabled(), false, 'departed camera stops handling zoom');
  await route('boneyard');
  const second = await boot();
  assert.notEqual(second, first, 'return creates a fresh camera');
  await boot(); // same real Retry path
  assert.equal(second.removed, true, 'retry tears down previous camera');
  await route('settings');
  assert.equal(maps.filter(m => !m.removed).length, 0, 'no camera survives leaving');
  // Navigation while GPS is pending must not resurrect zoom on another tab.
  await route('boneyard');
  pendingFix = {};
  const before = maps.length, lateBoot = startMap();
  await route('friends');
  pendingFix.resolve();
  await lateBoot;
  assert.equal(maps.length, before, 'late GPS cannot create a camera after navigation');
}

const appWide = () => replace(css, 'html, body { touch-action: pan-x pan-y; }',
  'html, body { touch-action: manipulation; }');
const everywhereOff = () => replace(mapSource, 'touchZoomRotate: true,', 'touchZoomRotate: false,');
const control = process.argv.find(arg => arg.startsWith('--control='))?.split('=')[1];
if (control) {
  assert.ok(['app-wide', 'everywhere-off'].includes(control), 'known control');
  await verify(control === 'app-wide' ? appWide() : css, control === 'everywhere-off' ? everywhereOff() : mapSource);
} else {
  await verify(css, mapSource);
  console.log('PASS real routes, Boneyard camera boot, key taps, retry, exit/re-entry and late GPS teardown');
  await assert.rejects(verify(appWide(), mapSource), /today: page zoom must be refused/);
  console.log('PASS CONTROL app-wide zoom rejected by the same guard');
  await assert.rejects(verify(css, everywhereOff()), /Boneyard zoom must be permitted/);
  console.log('PASS CONTROL zoom disabled everywhere rejected by the same guard');
  console.log('DEVICE VERIFICATION OWED: physical pinch, scrolling and taps on iOS/Android were not tested');
}
