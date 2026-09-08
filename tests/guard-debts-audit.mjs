/* R45 node-only tests of the actual audit grading blocks and harness plumbing.
 * These execute source from this checkout, not copies of the predicates.
 * Browser capture, timing and rendered DPR remain separate, unrun proofs.
 * Extraction anchors are asserted unique so source drift fails loudly.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = file => readFileSync(new URL(file, import.meta.url), 'utf8');
function between(source, start, end) {
  assert.equal(source.split(start).length, 2, `SETUP unique start: ${start}`);
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin);
  assert.ok(finish > begin, `SETUP end: ${end}`);
  return source.slice(begin, finish);
}
let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (error) { failures++; console.log(`FAIL  ${name}: ${error.message}`); }
}
function recorder(extra = {}) {
  const rows = [], logs = [];
  return {
    rows, logs, fails: 0, unprovenRows: 0,
    console: { log: (...args) => logs.push(args.join(' ')) },
    ok(label, pass, detail) { rows.push({ label, pass: !!pass, detail }); },
    unproven(label, detail) { rows.push({ label, unproven: true, detail }); },
    ...extra,
  };
}
const mimic = src('mimic-audit.mjs');
const revealBlock = between(mimic, '  const coverShot =', '  /* TAP TO SKIP,');
async function reveal(trace, ground = { mean: 80, std: 30 }) {
  const c = recorder({ trace, ground, dom: { boxes: 1, cls: 'mimic-enc-box', txt: 'The chest', label: 'The chest was never a chest.', covers: true, gif: 'mimic-loop.gif', gifDecoded: true, buttons: 0 },
    rev: { line: 'The chest was never a chest.', floor: 1800 },
    atResolve: { ms: 2000, overlay: true, dismissable: true, opacity: 1 },
    page: { evaluate: async () => 10000 },
    src: 'isMimicSpawn(rec.spawn) showMimicReveal( openFight( dismiss();',
  });
  await vm.runInNewContext(`(async () => { ${revealBlock} })()`, c);
  return c;
}
const litTrace = Array.from({ length: 22 }, (_, i) => ({ ms: i * 100, full: 5, mean: 5, std: i === 21 ? 0 : 1 }));
await check('CONTROL lit Mimic trace grades pixels and reaches HANDOVER', async () => {
  const c = await reveal(litTrace);
  assert.ok(c.rows.length >= 9);
  assert.ok(c.rows.every(r => r.pass), JSON.stringify(c.rows.filter(r => !r.pass)));
  assert.ok(c.rows.some(r => r.label.startsWith('HANDOVER')));
});
await check('MIMIC zero frames: named failure, three UNPROVEN pixel rows, later HANDOVER runs', async () => {
  const c = await reveal([]);
  assert.ok(c.rows.some(r => !r.pass && /ZERO-FRAME TRACE/.test(r.detail)));
  assert.equal(c.rows.filter(r => r.unproven).length, 3);
  assert.ok(c.rows.some(r => r.label.startsWith('HANDOVER') && r.pass));
});
await check('MIMIC missing ground and undersampled trace cannot pass pixel rows', async () => {
  for (const [trace, ground] of [[litTrace, null], [litTrace.slice(0, 1), { mean: 80, std: 30 }]]) {
    const c = await reveal(trace, ground);
    assert.equal(c.rows.filter(r => r.unproven).length, 3);
  }
});
await check('MIMIC verdict preserves failure precedence and names UNPROVEN', () => {
  const verdict = mimic.slice(mimic.lastIndexOf('\nconsole.log('));
  for (const [fails, unprovenRows, expected] of [[1, 3, 1], [0, 3, 97], [0, 0, 0]]) {
    let exit;
    const c = recorder({ fails, unprovenRows, process: { exit: code => { exit = code; } } });
    vm.runInNewContext(verdict, c);
    assert.equal(exit, expected);
    assert.ok(c.logs.some(l => l.includes('MIMIC AUDIT')));
    if (unprovenRows) assert.ok(c.logs.some(l => l.includes('UNPROVEN')));
  }
});
const boneyard = src('boneyard-audit.mjs');
const slowBlock = between(boneyard, 'if (slowMapDrewNothing ||', '\n/* ');
const sampleFloor = Number(boneyard.match(/const MIN_PLAUSIBLE_MARKERS = (\d+);/)[1]);
function slowReveal(count, settled = count, decoys = 0) {
  const c = recorder({ slowMapDrewNothing: false, slowSeen: 43, BEAT_MIN_SAMPLE: 10, MIN_PLAUSIBLE_MARKERS: sampleFloor,
    slow: { revealDom: count, revealSettled: settled, revealDecoys: decoys, revealCount: count } });
  vm.runInNewContext(slowBlock, c);
  return c.rows[0];
}
await check('ARRIVAL-SLOW one-marker R45 sample is UNPROVEN, never PASS', () => {
  assert.ok(slowReveal(1).unproven, `one-marker outcome: ${JSON.stringify(slowReveal(1))}`);
  assert.ok(slowReveal(0).unproven);
  assert.ok(slowReveal(sampleFloor - 1).unproven);
});
await check('CONTROL ARRIVAL-SLOW ten visible markers pass; withheld marker and decoys fail', () => {
  assert.equal(sampleFloor, 10);
  assert.ok(slowReveal(10).pass);
  assert.equal(slowReveal(10, 9).pass, false);
  assert.equal(slowReveal(10, 10, 9).pass, false);
});
await check('LATENCY SwiftShader R45 260/362ms pass; 1200ms hold and missing visibility fail', () => {
  const budgets = [...boneyard.matchAll(/const STRAGGLER_LATENCY_MS = (\d+);/g)];
  assert.equal(budgets.length, 1);
  const budget = Number(budgets[0][1]);
  for (const [prefix, dataName] of [['badFastLatencies', 'arr'], ['badLatencies', 'slow']]) {
    const line = boneyard.split('\n').find(l => l.startsWith(`const ${prefix} =`));
    assert.ok(line, `SETUP ${prefix}`);
    const bad = vm.runInNewContext(`${line}\n${prefix};`, {
      STRAGGLER_LATENCY_MS: budget, [dataName]: { stragglers: [260, 362, 1200, null].map(latency => ({ latency })) },
    });
    assert.deepEqual(Array.from(bad, r => r.latency), [1200, null]);
  }
});
const crate = src('crate-reveal-audit.mjs');
const movesBlock = between(crate, '  moves.forEach((t0, n) => {', '  /* WINDOWED.');
function gradeMoves(firstGaps, secondGaps, burstDraws = []) {
  const c = recorder({ moves: [1000, 2000], gaps: [...firstGaps, ...secondGaps], flick: { burstDraws } });
  vm.runInNewContext(movesBlock, c);
  return c.rows;
}
const full = start => Array.from({ length: 31 }, (_, i) => ({ t: start + (i + 1) * 1000 / 60, d: 1000 / 60 }));
await check('CONTROL both full-rate flicks pass independent cadence and burst rows', () => {
  const rows = gradeMoves(full(1000), full(2000));
  assert.ok(rows.length >= 2);
  assert.ok(rows.every(r => r.pass));
});
await check('FIRST FLICK stalls cannot hide behind the healthy second flick', () => {
  // One 220ms stall then 18 short gaps: old over20 <=6 passes this 19-frame window.
  const stalled = [{ t: 1220, d: 220 }, ...Array.from({ length: 18 }, (_, i) => ({ t: 1236 + i * 16, d: 16 }))];
  const rows = gradeMoves(stalled, full(2000));
  assert.equal(rows[0].pass, false, `first flick must fail independently: ${JSON.stringify(rows[0])}`);
  assert.ok(rows.some(r => /SECOND FLICK.*cadence/.test(r.label) && r.pass));
  const half = Array.from({ length: 15 }, (_, i) => ({ t: 1000 + (i + 1) * 33, d: 33 }));
  assert.ok(gradeMoves(half, full(2000)).some(r => /FIRST FLICK.*cadence/.test(r.label) && !r.pass));
});
await check('FLICK empty samples and an active burst fail', () => {
  assert.ok(gradeMoves([], full(2000)).some(r => /FIRST FLICK.*cadence/.test(r.label) && !r.pass));
  const rows = gradeMoves(full(1000), full(2000), [1100]);
  assert.ok(rows.some(r => /FIRST FLICK.*burst pauses/.test(r.label) && !r.pass));
  assert.ok(rows.some(r => /SECOND FLICK.*burst pauses/.test(r.label) && r.pass));
});
const godmode = src('godmode.js');
const bootSource = between(godmode, 'export async function boot(', '\n}\n').replace('export ', '') + '\n}';
const widthSource = between(godmode, 'export async function setWidth(', '\n}\n').replace('export ', '') + '\n}';
async function fakeBoot(env = {}, opts = {}, actualDpr) {
  let launch;
  let viewport;
  const page = { viewport: () => viewport, setViewport: async v => { viewport = v; }, on() {}, goto: async () => {}, evaluate: async () => actualDpr ?? viewport.deviceScaleFactor };
  const browser = { newPage: async () => page, close: async () => {} };
  const c = recorder({ process: { env }, reapStrandedBrowsers() {}, _trackBrowser() {},
    loadPuppeteer: async () => ({ launch: async o => { launch = o; viewport = o.defaultViewport; return browser; } }),
    sandboxArgs: () => [], chromePath: () => '/unused', sleep: async () => {}, dismissOverlays: async () => {}, opts,
  });
  await vm.runInNewContext(`${bootSource}\n${widthSource}\nboot('https://example.invalid', opts);`, c);
  return { c, page, launch };
}
await check('CONTROL DPR default remains 2; ordinary explicit viewport settings still work', async () => {
  const { page, launch } = await fakeBoot();
  assert.equal(launch.defaultViewport.deviceScaleFactor, 2);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  assert.equal(page.viewport().deviceScaleFactor, 1);
});
await check('DPR 3 reaches launch, legacy setViewport and setWidth; option overrides env', async () => {
  for (const [env, opts] of [[{ GODMODE_DPR: '3' }, {}], [{ GODMODE_DPR: '2' }, { deviceScaleFactor: 3 }]]) {
    const { c, page, launch } = await fakeBoot(env, opts);
    assert.equal(launch.defaultViewport.deviceScaleFactor, 3);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    assert.equal(page.viewport().deviceScaleFactor, 3);
    c.page = page;
    await vm.runInNewContext('setWidth(page, 375);', c);
    assert.equal(page.viewport().deviceScaleFactor, 3);
    assert.equal(page.viewport().width, 375);
    assert.ok(page.viewport().isMobile && page.viewport().hasTouch);
  }
});
await check('DPR refuses a page that reports the wrong physical scale', async () => {
  await assert.rejects(fakeBoot({ GODMODE_DPR: '3' }, {}, 2), /requested 3, page reports 2/);
});
await check('DPR override preserves mobile flags and deliberate desktop flags', async () => {
  for (const mobile of [true, false]) {
    const { page } = await fakeBoot({}, { deviceScaleFactor: 3,
      defaultViewport: { width: 430, height: 932, isMobile: mobile, hasTouch: mobile } });
    assert.equal(page.viewport().isMobile, mobile, 'boot preserves the chosen layout');
    assert.equal(page.viewport().hasTouch, mobile, 'boot preserves the chosen input');
    await page.setViewport({ width: 402, height: 874, isMobile: undefined, hasTouch: undefined });
    assert.equal(page.viewport().isMobile, mobile, 'unspecified flags retain the current layout');
    assert.equal(page.viewport().hasTouch, mobile, 'unspecified flags retain the current input');
    assert.equal(page.viewport().deviceScaleFactor, 3);
    await page.setViewport({ width: 430, height: 932, isMobile: !mobile, hasTouch: !mobile });
    assert.equal(page.viewport().isMobile, !mobile, 'explicit layout changes remain possible');
    assert.equal(page.viewport().hasTouch, !mobile, 'explicit input changes remain possible');
  }
});
await check('DPR invalid values fail before launching', async () => {
  for (const value of ['', '0', '-1', 'NaN', 'Infinity'])
    await assert.rejects(fakeBoot({ GODMODE_DPR: value }), /positive finite/);
});
console.log(`guard-debts: ${failures ? failures + ' FAILED' : 'clean'}`);
process.exitCode = failures ? 1 : 0;
