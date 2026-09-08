/* N1 Node proof. Execute the shipped boot and grading code with page doubles.
 * Browser emulation and rotateLock pixels require orientation-audit separately.
 * CONTROL fixtures include wrong amounts, empty toasts and local month rollover.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const godmode = read('godmode.js');
function between(source, start, end) {
  assert.equal(source.split(start).length, 2, `SETUP unique ${start}`);
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(b > a, `SETUP end ${end}`);
  return source.slice(a, b);
}
const functionSource = name => between(godmode, `export async function ${name}(`, '\n}\n').replace('export ', '') + '\n}';
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
async function drive(opts = {}, env = {}) {
  const trace = [];
  let viewport;
  const page = {
    setViewport: async v => { viewport = v; trace.push(['viewport', v]); },
    emulateTimezone: async v => trace.push(['timezone', v]),
    createCDPSession: async () => ({ send: async (...a) => trace.push(['cdp', ...a]) }),
    on: e => trace.push(['on', e]), goto: async (...a) => trace.push(['goto', ...a]),
    evaluate: async () => viewport.deviceScaleFactor,
  };
  const browser = { newPage: async () => { trace.push(['newPage']); return page; }, close: async () => trace.push(['close']) };
  const c = { process: { env }, opts, page,
    reapStrandedBrowsers: () => trace.push(['reap']), _trackBrowser: () => trace.push(['track']),
    loadPuppeteer: async () => ({ launch: async o => { viewport = o.defaultViewport; trace.push(['launch', o]); return browser; } }),
    sandboxArgs: () => [], chromePath: () => '/unused',
    sleep: async ms => trace.push(['sleep', ms]), dismissOverlays: async () => trace.push(['dismiss']),
    console: { log: (...a) => trace.push(['log', ...a]) },
  };
  /* n2's dependency observer is called from inside boot(). This context executes
     boot's SOURCE, so the import is not present; stub it as a no-op recorder.
     Added 2026-09-08 when the n1 and n2 lanes met. */
  c.observeDependencies = (...a) => { (c.__observed ||= []).push(a); };
  c.requireDependencyHosts = () => {};
  c.observePuppeteer = () => {};
  const functions = ['boot', 'emulateEnvironment', 'setOrientation'].map(functionSource).join('\n');
  await vm.runInNewContext(`${functions}\nboot('https://example.invalid', opts)`, c);
  return { trace: JSON.parse(JSON.stringify(trace)), c, page, viewport: () => viewport };
}
await check('CONTROL default boot call bytes match the frozen v512 trace', async () => {
  const { trace } = await drive();
  assert.equal(JSON.stringify(trace), JSON.stringify([
    ['reap'], ['launch', { headless: 'new', defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, executablePath: '/unused', args: [] }],
    ['track'], ['newPage'], ['on', 'pageerror'], ['goto', 'https://example.invalid/?demo', { waitUntil: 'networkidle2' }], ['sleep', 2400], ['dismiss'],
  ]));
  const custom = { headless: 'shell', defaultViewport: null, args: ['--custom'] };
  const a = await drive(custom), b = await drive(custom, { GODMODE_TIMEZONE: 'Pacific/Kiritimati', GODMODE_LOCALE: 'de-DE', GODMODE_ORIENTATION: 'landscape' });
  assert.deepEqual(a.trace, b.trace, 'no implicit suite-wide environment changes');
  assert.deepEqual(a.trace.find(t => t[0] === 'launch')[1], { headless: 'shell', defaultViewport: null, executablePath: '/unused', args: ['--custom'] });
});
await check('timezone and Intl locale reach Chrome before navigation, never launch options', async () => {
  const { trace } = await drive({ timezone: 'Pacific/Kiritimati', locale: 'de-DE' });
  const goto = trace.findIndex(t => t[0] === 'goto');
  assert.ok(trace.findIndex(t => t[0] === 'timezone' && t[1] === 'Pacific/Kiritimati') > 0);
  assert.ok(trace.findIndex(t => t[0] === 'timezone') < goto);
  assert.deepEqual(trace.filter(t => t[0] === 'cdp'), [['cdp', 'Emulation.setLocaleOverride', { locale: 'de-DE' }]]);
  assert.ok(trace.findIndex(t => t[0] === 'cdp') < goto);
  const launch = trace.find(t => t[0] === 'launch')[1];
  assert.ok(!('timezone' in launch) && !('locale' in launch));
});
await check('phone orientation swaps CSS dimensions and preserves touch plus DPR override', async () => {
  const { c, viewport } = await drive({ orientation: 'landscape', deviceScaleFactor: 3 });
  assert.equal(viewport().width, 852); assert.equal(viewport().height, 393);
  assert.equal(viewport().isLandscape, true); assert.equal(viewport().deviceScaleFactor, 3);
  await vm.runInNewContext("setOrientation(page, 'portrait')", c);
  assert.equal(viewport().width, 393); assert.equal(viewport().height, 852);
  assert.equal(viewport().isLandscape, false); assert.equal(viewport().deviceScaleFactor, 3);
  assert.ok(viewport().isMobile && viewport().hasTouch);
  await assert.rejects(vm.runInNewContext("setOrientation(page, 'sideways')", c), /orientation must/);
});
await check('SCROLL expected day stays local at UTC+14, UTC and DST boundaries', async () => {
  const source = read('today-container-audit.mjs');
  assert.match(source, /boot\(base, \{ timezone: 'Pacific\/Kiritimati' \}\)/);
  const block = between(source, '  const yesterday = await page.evaluate(', '\n  const wentBack');
  const old = process.env.TZ;
  try {
    for (const timezone of ['Pacific/Kiritimati', 'UTC', 'America/New_York']) {
      process.env.TZ = timezone;
      for (const [today, expected] of [['2026-09-07', '2026-09-06'], ['2026-03-01', '2026-02-28'], ['2026-03-09', '2026-03-08'], ['2026-11-02', '2026-11-01']]) {
        const c = { Date, document: { querySelector: () => ({ dataset: { date: today } }) } };
        c.page = { evaluate: async fn => fn() };
        const result = await vm.runInNewContext(`(async () => { ${block}\nreturn yesterday; })()`, c);
        assert.equal(result, expected, `${timezone} ${today}: wanted ${expected}, got ${result}`);
      }
    }
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
});
await check('two-tap grades the exact browser-formatted price, with wrong-price controls', async () => {
  const source = read('two-tap-audit.mjs');
  assert.match(source, /locale: 'de-DE'/);
  const block = between(source, 'const expectedPrice =', "\ncheck('and it goes gold");
  for (const locale of ['de-DE', 'en-US']) {
    const expected = (1000).toLocaleString(locale);
    for (const [text, armed, want] of [[`Spend ${expected}?`, '1', true], ['Spend 999?', '1', false], ['', '1', false], [`Spend ${expected}?`, '0', false]]) {
      let pass;
      await vm.runInNewContext(`(async () => { ${block} })()`, { armed: { text, armed }, page: { evaluate: async () => expected }, check: (n, p) => { pass = p; } });
      assert.equal(pass, want, `${locale} ${text}`);
    }
  }
});
await check('wallet grades the exact balance in both locales and rejects raw, wrong and empty samples', () => {
  const source = read('honest-surfaces-audit.mjs');
  assert.match(source, /locale: 'de-DE'/);
  const block = between(source, "ok('WALLET SAMPLE", '\n/* =================== 3.');
  for (const locale of ['de-DE', 'en-US']) {
    const wallet = coins => ({ balance: { coins, formatted: coins.toLocaleString(locale) }, best: { text: `Bought. ${coins.toLocaleString(locale)} left.` } });
    const grade = walletBig => {
      const rows = [];
      vm.runInNewContext(block, { walletBig, walletSmall: wallet(410), ok: (n, p) => rows.push({ n, p: !!p }) });
      return rows;
    };
    assert.ok(grade(wallet(1234477)).every(r => r.p), `${locale} healthy wallet`);
    for (const text of ['Bought. 1234477 left.', 'Bought. 1,234,999 left.', '']) {
      const w = wallet(1234477); w.best.text = text;
      assert.ok(grade(w).some(r => !r.p), `must reject ${text}`);
    }
    const w = wallet(1234477); w.best = null;
    assert.ok(grade(w).some(r => !r.p));
  }
});
await check('orientation grading rejects a missing landscape cover and a stuck portrait cover', async () => {
  const source = read('orientation-audit.mjs');
  const block = between(source, '  const portrait = await lock();', "  const settings = await page.$");
  const hidden = { present: true, visible: false, hits: [false, false, false] };
  const shown = { present: true, visible: true, covers: true, message: true, hits: [true, true, true] };
  for (const [samples, want] of [[[hidden, shown, hidden], true], [[hidden, hidden, hidden], false], [[hidden, shown, shown], false], [[hidden, { present: false }, hidden], false]]) {
    const rows = []; let orientation = 'portrait';
    await vm.runInNewContext(`(async () => { ${block} })()`, {
      lock: async () => samples.shift(), page: { evaluate: async () => {} }, sleep: async () => {},
      setOrientation: async (p, o) => { orientation = o; },
      environment: async () => ({ width: orientation === 'landscape' ? 852 : 393, height: orientation === 'landscape' ? 393 : 852, coarse: true }),
      ok: (n, p) => rows.push(!!p),
    });
    assert.equal(rows.length, 4);
    assert.equal(rows.every(Boolean), want);
  }
});
console.log(`harness-environment: ${failed ? failed + ' FAILED' : 'clean'}`);
process.exitCode = failed ? 1 : 0;
