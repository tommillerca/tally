/* P1: execute the art audit's own grading blocks, not a copied predicate.
 * CONTROL: restore the original art audit on a throwaway copy. Its four-screen
 * floor accepts the reported 158-layer sweep without Crew. Restore either
 * Hollow probe to remove its runtime disclosure and DISCLOSURE fails.
 * No browser, sockets, or rendered-pixel claim.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
let failed = 0, passed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}: ${error.message}`); }
}
function between(source, start, end) {
  assert.equal(source.split(start).length, 2, `unique anchor required: ${start}`);
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(b > a, `missing end: ${end}`);
  return source.slice(a, b);
}
const art = read('art-resolution-audit.mjs');
const surfaces = vm.runInNewContext(between(art, 'const SURFACES =', '\nawait page.setViewport') + '\nSURFACES;');
const labels = Array.from(surfaces, s => s[2]);
assert.equal(labels.length, 6);
assert.equal(new Set(labels).size, 6);
// Both anchors deliberately accept the pre-fix audit so red tests reach its
// actual predicate instead of failing because a new declaration is absent.
const setup = between(art, art.includes('const contributions =') ? 'const contributions =' : "ok('SETUP the sweep", '\nconst over =');
const grades = between(art, 'const over =', '\nconsole.log(');
function grade(empty = [], total = 158, missed = []) {
  const active = labels.filter(label => !empty.includes(label));
  const seen = active.length ? Array.from({ length: total }, (_, i) => ({
    screen: active[i % active.length], nat: 640, phys: 640, pixelated: false,
  })) : [];
  const rows = [];
  vm.runInNewContext(setup + grades, {
    SURFACES: surfaces, seen, missed, MAX_UP: 1.40,
    ok: (label, pass, detail) => rows.push({ label, pass, detail }),
  });
  assert.equal(rows.length, 3, 'SETUP, RESOLUTION and SMOOTH must all execute');
  return rows;
}
await check('ART all six populated surfaces pass', () => {
  assert.ok(grade().every(r => r.pass));
});
for (const empty of [['crew'], ['crew', 'build'], labels]) {
  await check(`ART refuses empty ${empty.join(',')}`, () => {
    const rows = grade(empty);
    assert.ok(rows.every(r => !r.pass), `incomplete sweep certified: ${JSON.stringify(rows)}`);
    for (const label of empty) assert.ok(rows[0].detail.includes(label), `missing surface not named: ${label}`);
    assert.ok(rows.slice(1).every(r => /UNPROVEN/.test(r.detail)));
  });
}
await check('ART every individual surface is mandatory', () => {
  for (const label of labels) assert.ok(grade([label]).every(r => !r.pass), label);
});
await check('ART missing route and undersampled sweep cannot certify art', () => {
  assert.ok(grade([], 158, ['crew']).every(r => !r.pass));
  assert.ok(grade([], 6).every(r => !r.pass));
});
await check('ART Crew fixture contains a renderable friend outfit', async () => {
  const block = between(art, 'await page.setViewport', 'const reached =');
  const window = {};
  await vm.runInNewContext(`(async () => { ${block} })()`, {
    window, page: { setViewport: async () => {}, evaluate: async fn => fn() },
  });
  const friends = window.__testFriends?.friends || [];
  assert.ok(friends.length > 0, 'Crew fixture has no friends');
  assert.ok(friends.every(f => f.playerId && f.profile?.outfit?.B && f.profile?.outfit?.SK));
});
await check('ART Crew samples its fan, not unrelated images elsewhere on the page', async () => {
  const window = { devicePixelRatio: 2 };
  let selector;
  const image = { decode: async () => {}, naturalWidth: 640,
    getAttribute: () => 'assets/bh/B/B0-1.png', getBoundingClientRect: () => ({ width: 50 }) };
  const context = { ...window, seen: [],
    document: { querySelectorAll: s => { selector = s; return [image]; } },
    getComputedStyle: () => ({ imageRendering: 'auto' }),
    page: { evaluate: async (fn, arg) => fn(arg) },
  };
  await vm.runInNewContext(between(art, 'async function sweep(label)', '\n/* THE SWEEP LIST') + '\nsweep("crew");', context);
  assert.equal(selector, '#cfanDeck img');
  assert.equal(context.seen.length, 1);
  assert.equal(context.seen[0].screen, 'crew');
});
for (const file of ['hollow-beds-audit.mjs', 'hollow-backdrop-audit.mjs']) {
  await check(`DISCLOSURE ${file} prints zero player coverage before boot`, () => {
    const source = read(file), logs = [];
    const calls = source.slice(0, source.indexOf('const ROOT =')).match(/^console\.log\([^\n]+\);/gm) || [];
    for (const call of calls) vm.runInNewContext(call, { console: { log: s => logs.push(s) } });
    assert.ok(logs.some(s => /UNREACHABLE Hollow/.test(s) && /zero player coverage/.test(s)),
      'module probe emits no player-coverage disclosure');
  });
}
await check('REWARD landed rows disclose unreachable Hollow and deleted GROW door', () => {
  const source = read('reward-sop-audit.mjs');
  for (const name of ['openHollow', 'openGardenSheet']) {
    const row = source.split('\n').find(line => line.includes(`id: 'js/app.js:${name}'`));
    assert.ok(row, `missing payout register row: ${name}`);
    const value = vm.runInNewContext(`(${row.trim().replace(/,$/, '')})`);
    assert.ok(/unreachable/i.test(value.undriven), value.undriven);
    if (name === 'openGardenSheet') assert.ok(/GROW door was deleted on 2026-08-18/.test(value.undriven));
    assert.ok(!/GROW door opens/.test(value.undriven));
  }
});
await check('RACE landed ANNOUNCE row uses masked reload and real News controls', () => {
  const block = between(read('race-audit.mjs'), '/* ANNOUNCE grades', '/* ---------- NEVER DEFAULT');
  const mask = block.indexOf('await maskWebdriver(page)'), reload = block.indexOf('await page.reload(');
  assert.ok(mask >= 0 && reload > mask, 'masked reload is missing or out of order');
  assert.ok(block.includes("typeof window.__raceIntro === 'undefined'"));
  assert.ok(block.includes("await page.click('#newsBanner [data-news=\"race\"]')"));
  assert.ok(!/window\.__raceIntro\s*\(/.test(block), 'ANNOUNCE calls the seam');
  assert.ok(block.includes('drawn.length === expected.length') && block.includes('i.decode()'));
});
console.log(`p1-r48-rest: ${passed}/${passed + failed} passed (Node audit semantics only)`);
process.exitCode = failed ? 1 : 0;
