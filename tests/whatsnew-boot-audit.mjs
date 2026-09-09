/* Frozen What's New restoration: production gate, sheet opener and onboarding
 * seed in a VM with a deterministic clock/storage and a small DOM double.
 * Boot scheduling is source-checked, not a full browser boot. Browser proof is
 * owed for an updated returning player and a virgin onboarding session, with
 * webdriver masked, including an occupied sheet at the 1700ms boundary.
 * Mutation controls exercise every row without changing files on disk.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import * as changelog from '../js/changelog.js';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const app = read('../js/app.js');
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
function fn(source, name) {
  const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'));
  assert.ok(match, `production function ${name} exists`);
  return match[0];
}
const imports = s => s.replaceAll("import('./changelog.js')", 'Promise.resolve(changelog)');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

function harness(source, { store = new Map(), calm = false, webdriver = false,
  settings = {}, occupied = false, claimed = false } = {}) {
  let now = 0, opens = 0;
  const timers = [], sheets = { children: occupied ? [{}] : [] };
  const context = vm.createContext({
    changelog, S: { settings, calm }, navigator: { webdriver }, window: {},
    kvGet: async (key, fallback) => store.has(key) ? store.get(key) : fallback,
    kvSet: async (key, value) => { store.set(key, value); },
    setTimeout: (run, ms) => { timers.push({ run, at: now + ms }); },
    $: selector => selector === '#sheets' ? sheets : null, $$: () => [],
    esc: s => s, richLine: s => s, isNative: () => false,
    equipped: async () => ({}), newsHtml: () => '',
    openSheet: html => {
      assert.match(html, /<h2>What's New<\/h2>/);
      opens++; const wrap = {}; sheets.children.push(wrap); return wrap;
    },
  });
  const calmSource = source.match(/^const CALM_BOOT = .*;$/m)?.[0];
  assert.ok(calmSource, 'production calm guard exists');
  vm.runInContext(imports(`${calmSource}\nlet bootSheetClaimed = ${claimed};\n`
    + fn(source, 'claimBootSheet') + '\n' + fn(source, 'openWhatsNew')
    + '\n' + fn(source, 'maybeShowWhatsNew')), context);
  return {
    store, sheets, get opens() { return opens; },
    async boot() {
      const calls = stripComments(fn(source, 'boot')).match(/^  maybeShowWhatsNew\(\);$/gm) || [];
      assert.equal(calls.length, 1, 'boot schedules What\'s New exactly once');
      vm.runInContext(calls.join('\n'), context);
      await flush();
    },
    async tick(ms) {
      now += ms;
      for (const timer of timers.splice(0)) {
        if (timer.at <= now) timer.run(); else timers.push(timer);
      }
      await flush();
    },
    async seed() {
      const initial = fn(source, 'saveInitialSettings');
      const seed = initial.slice(initial.indexOf("  await kvSet('game-init'"),
        initial.indexOf("  await kvSet('newsSeen'"));
      assert.ok(seed, 'production onboarding seed block exists');
      await vm.runInContext(imports(`(async () => { ${seed} })()`), context);
    },
  };
}

export const rows = {
  async QUIET(source) {
    const h = harness(source);
    await h.boot(); await h.tick(1699);
    assert.equal(h.opens, 0, 'settle delay precedes opening');
    await h.tick(1);
    assert.equal(h.opens, 1, 'unseen entries open once at 1700ms');
    h.sheets.children.length = 0;
    await h.tick(10000);
    assert.equal(h.opens, 1, 'no timer nags after dismissal');
  },
  async SEEN(source) {
    const h = harness(source);
    await h.boot(); await h.tick(1700);
    assert.equal(h.opens, 1, 'first boot opens');
    assert.equal(h.store.get('changelogSeen'), changelog.changelogLatest(), 'opening marks latest seen');
    const next = harness(source, { store: h.store });
    await next.boot(); await next.tick(20000);
    assert.equal(next.opens, 0, 'second boot does not open');
  },
  async NEW(source) {
    const h = harness(source);
    await h.seed();
    await h.boot(); await h.tick(20000);
    assert.equal(h.opens, 0, 'new player never gets the backlog');
    assert.equal(h.store.get('changelogSeen'), changelog.changelogLatest());
  },
  async BUSY(source) {
    const h = harness(source);
    await h.boot();
    h.sheets.children.push({}); // another sheet arrives during the settle delay
    await h.tick(1700);
    assert.equal(h.opens, 0, 'never open over an existing sheet');
    assert.equal(h.store.has('changelogSeen'), false, 'busy boot consumes nothing');
    h.sheets.children.length = 0;
    await h.tick(20000);
    assert.equal(h.opens, 0, 'retry is next boot, not after dismissing this sheet');
    const next = harness(source, { store: h.store });
    await next.boot(); await next.tick(1700);
    assert.equal(next.opens, 1, 'next quiet boot retries');
    assert.match(fn(source, 'openSheet'), /\$\('#sheets'\)\.appendChild\(wrap\)/,
      'the current sheet implementation populates the guarded container');
  },
  async CALM(source) {
    for (const options of [{ calm: true }, { webdriver: true }]) {
      const h = harness(source, options);
      await h.boot(); await h.tick(20000);
      assert.equal(h.opens, 0, 'calm/webdriver boot suppresses patch notes');
      assert.equal(h.store.has('changelogSeen'), false);
    }
  },
  async SETTINGS(source) {
    const h = harness(source, { settings: null });
    await h.boot(); await h.tick(20000);
    assert.equal(h.opens, 0, 'no settings means no popup');
  },
  async CLAIM(source) {
    const h = harness(source, { claimed: true });
    await h.boot(); await h.tick(20000);
    assert.equal(h.opens, 0, 'existing boot claim suppresses patch notes');
    assert.equal(h.store.has('changelogSeen'), false);
  },
  async ONLY(source) {
    const boot = stripComments(fn(source, 'boot'));
    const scheduled = [...boot.matchAll(/\b(maybe(?:Show|Prompt|Request|Nudge)\w+)\s*\(/g)]
      .map(m => m[1]).sort();
    assert.deepEqual(scheduled, ['maybeNudgeRecovery', 'maybeShowDailyWheel',
      'maybeShowRenameNotice', 'maybeShowWhatsNew'],
    'only patch notes are restored; existing wheel, rename and recovery toast stay');
    // Also catch a removed takeover reintroduced through a helper on boot.
    const calls = [...stripComments(source).matchAll(/\b(maybe(?:Show|Prompt|Request)\w+)\s*\(/g)]
      .map(m => m[1]);
    assert.deepEqual([...new Set(calls)].sort(), ['maybeShowDailyWheel', 'maybeShowGardenPopup',
      'maybeShowRenameNotice', 'maybeShowWhatsNew']);
    assert.equal(calls.filter(n => n === 'maybeShowGardenPopup').length, 1,
      'the dormant garden function has no caller');
  },
};

export async function proveRed(source) {
  const mutations = {
    QUIET: s => s.replace(/^  maybeShowWhatsNew\(\);\n/m, ''),
    SEEN: s => s.replace("  await kvSet('changelogSeen', changelogLatest());", ''),
    NEW: s => s.replace(/^  await kvSet\('changelogSeen', \(await import\('\.\/changelog.js'\)\)[^\n]*\n/m, ''),
    BUSY: s => s.replace("if ($('#sheets')?.children.length) return;", ''),
    CALM: s => s.replace('if (CALM_BOOT() || !S.settings) return;', 'if (!S.settings) return;'),
    SETTINGS: s => s.replace('if (CALM_BOOT() || !S.settings) return;', 'if (CALM_BOOT()) return;'),
    CLAIM: s => s.replace('if (!claimBootSheet(window.__whatsNewForce)) return;', ''),
    ONLY: s => s.replace('  maybeShowWhatsNew();', '  maybeShowWhatsNew();\n  maybeShowCosmeticTeaser();'),
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const broken = mutate(source);
    assert.notEqual(broken, source, `${name} mutation applied`);
    await assert.rejects(() => rows[name](broken), error => {
      assert.equal(error.name, 'AssertionError');
      console.log(`RED CONTROL ${name}: ${error.message.split('\n')[0]}`);
      return true;
    }, `${name} must go red`);
  }
}

export async function checkWhatsNew(source = app) {
  let failed = 0;
  for (const [name, check] of Object.entries(rows)) {
    try { await check(source); console.log(`PASS ${name}`); }
    catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
  }
  console.log(`${Object.keys(rows).length - failed} passed, ${failed} failed`);
  assert.equal(failed, 0, 'all patch-note boot rows pass');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await checkWhatsNew();
  await proveRed(app);
}
