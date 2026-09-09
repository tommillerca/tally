// R4-7/R4-9: real Settings commit and db.js over mem-idb and quota storage.
// --refused-import runs the R4-10 acceptance guard separately. It remains RED:
// the frozen order forbids editing app.js, which writes before import can refuse.
// CONTROL covers durable snapshots, exact undo, database isolation and failures.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../js/db.js';

globalThis.BroadcastChannel = undefined;
const local = new Map();
let limit = 5242880, writes = 0, seq = 0;
const used = () => [...local].reduce((n, [k, v]) => n + Buffer.byteLength(k + v), 0);
globalThis.localStorage = {
  get length() { return local.size; },
  key: i => [...local.keys()][i] ?? null,
  getItem: k => local.get(k) ?? null,
  setItem(k, v) {
    writes++;
    const old = local.has(k) ? Buffer.byteLength(k + local.get(k)) : 0;
    if (used() - old + Buffer.byteLength(k + v) > limit) throw new DOMException('full', 'QuotaExceededError');
    local.set(k, String(v));
  },
  removeItem: k => local.delete(k),
};
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const start = app.indexOf('function openFileReplacementReview(');
const end = app.indexOf('async function openFileRestorePoints(', start);
assert(start >= 0 && end > start, 'CONTROL actual Settings handler found');
async function commit(data, current, undo = false) {
  let review, finished = false;
  const deps = { ...D, openPetDestructionReview: r => { review = r; },
    fileReplacementHtml: () => '', fileImportFailure: e => e.message, toast() {},
    finishFileImport: async () => { finished = true; }, location: { reload() { finished = true; } } };
  const openReview = new Function(...Object.keys(deps), app.slice(start, end) + '\nreturn openFileReplacementReview;')(...Object.values(deps));
  openReview(data, current, data, undo);
  const result = await review.commit();
  return { ...result, finished };
}
const fields = v => v && typeof v === 'object' ? Object.values(v).reduce((n, x) => n + fields(x), 0) : 1;
const storeData = data => Object.fromEntries(D.STORES.map(s => [s, data[s]]));
function yearSave() {
  const data = { app: 'tally', version: D.DB_VERSION, exportedAt: '2026-09-09T00:00:00.000Z',
    ...Object.fromEntries(D.STORES.map(s => [s, []])) };
  for (let day = 0; day < 365; day++) {
    const date = new Date(Date.UTC(2025, 8, 10 + day)).toISOString().slice(0, 10);
    for (let meal = 0; meal < 6; meal++) data.log.push({ id: `${date}-${meal}`, date, meal, ts: day,
      foodId: null, name: 'Meal', portionLabel: 'one serving', kcal: 250, p: 20, c: 30, f: 10, opaque: { earned: true } });
    data.weights.push({ date, kg: 80, opaque: 'weight' });
    data.health.push({ date, steps: 10000, sleep: 8, opaque: 'health' });
    data.xp.push({ key: date, amount: 20, opaque: 'xp' });
  }
  data.foods.push({ id: 'food', name: 'Home meal', kcal: 250 });
  data.inv.push({ id: 'earned', kind: 'crate', opaque: { future: 'retained' } });
  data.kv.push({ k: 'opaque-year-fixture', v: { earnedFields: [], padding: '' } });
  const extra = data.kv[0].v;
  extra.earnedFields = Array.from({ length: 35491 - fields(storeData(data)) }, (_, i) => i);
  const size = () => Buffer.byteLength(JSON.stringify({ createdAt: '2026-09-09T00:00:00.000Z', data }));
  assert(size() < 589788);
  extra.padding = 'x'.repeat(589788 - size());
  assert.equal(fields(storeData(data)), 35491);
  assert.equal(size(), 589788);
  return data;
}
async function seed(data) { await D.restoreFileSave(data, await D.readFileSave()); }
let passed = 0, failed = 0;
async function check(name, fn) {
  local.clear(); limit = 5242880; writes = 0; D.useDbName(`r4-restore-${++seq}`);
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}

if (process.argv.includes('--refused-import')) {
  await check('R4-10 refused Settings import writes no restore point', async () => {
    await D.kvSet('earned', 1);
    const reviewed = await D.readFileSave();
    await D.kvSet('earned', 2); // Real payout after review forces refusal under the lock.
    const before = await D.readFileSave();
    const result = await commit(reviewed, reviewed);
    assert.equal(result.finished, false, 'CONTROL import was refused');
    assert.match(result.message, /save changed after the review/);
    assert.deepEqual(storeData(await D.readFileSave()), storeData(before), 'CONTROL no earnings changed');
    assert.equal(writes, 0, `refused import made ${writes} restore-point write(s), ${D.fileRestorePoints().length} retained`);
  });
} else {
  await check('R4-7 ninth year-sized import succeeds with exactly two newest points', async () => {
    const original = yearSave(); await seed(original);
    const expected = [];
    for (let i = 1; i <= 9; i++) {
      const current = await D.readFileSave(); expected.push(storeData(current));
      const next = structuredClone(current); next.log[0].name = `Meal ${i}`;
      const result = await commit(next, current);
      assert.equal(result.finished, true, `import ${i} refused: ${result.message}`);
    }
    const points = D.fileRestorePoints();
    assert.equal(points.length, 2);
    assert.deepEqual(points.map(p => storeData(p.data)), expected.slice(-2).reverse());
    console.log(`WITNESS imports=9, points=${points.length}, quota=${limit}, used=${used()}`);
    for (const point of points) {
      const result = await commit(point.data, await D.readFileSave(), true);
      assert.equal(result.finished, true, result.message);
      const actual = storeData(await D.readFileSave());
      assert.deepEqual(actual, storeData(point.data));
      assert.equal(fields(actual), 35491);
    }
    console.log('WITNESS undo: 0 of 35,491 synthetic fixture fields missing or changed, both retained points');
  });
  await check('R4-9 truncated entry is reported while good restore points still list', async () => {
    const data = await D.readFileSave();
    const first = D.saveFileRestorePoint(data), second = D.saveFileRestorePoint(data);
    const badKey = first.key + '-truncated'; local.set(badKey, '{"createdAt":');
    const warnings = [], warn = console.warn; console.warn = (...args) => warnings.push(args.join(' '));
    let points;
    try { points = D.fileRestorePoints(); } finally { console.warn = warn; }
    assert.deepEqual(new Set(points.map(p => p.key)), new Set([first.key, second.key]));
    assert(warnings.some(w => w.includes(badKey)), 'must identify the damaged entry');
    assert.equal(local.get(badKey), '{"createdAt":', 'unreadable bytes remain available for recovery');
  });
  await check('CONTROL legacy quota-full history prunes only this database', async () => {
    const data = yearSave();
    const p = D.saveFileRestorePoint(data), prefix = p.key.slice(0, p.key.lastIndexOf(':') + 1);
    local.clear(); local.set('other-app', 'keep');
    const foreign = 'tally-file-restore:other:point'; local.set(foreign, 'keep');
    for (let i = 0; i < 8; i++) localStorage.setItem(prefix + i, JSON.stringify({ createdAt: `2026-09-0${i + 1}T00:00:00.000Z`, data }));
    const saved = D.saveFileRestorePoint(data);
    assert.deepEqual(D.fileRestorePoints().map(p => p.key), [saved.key, prefix + '7']);
    assert.equal(local.get('other-app'), 'keep'); assert.equal(local.get(foreign), 'keep');
  });
  await check('CONTROL quota refusal preserves the last recoverable point and live earnings', async () => {
    const data = yearSave(); await seed(data);
    const first = D.saveFileRestorePoint(data); limit = used();
    const before = await D.readFileSave();
    const result = await commit(before, before);
    assert.equal(result.finished, false); assert.match(result.message, /storage is full or unavailable/);
    assert.deepEqual(storeData(await D.readFileSave()), storeData(before));
    assert.equal(D.fileRestorePoints()[0].key, first.key);
  });
  await check('CONTROL two-slot rotation fits without a third snapshot and a failed write keeps both', async () => {
    const data = yearSave();
    D.saveFileRestorePoint(data);
    const second = D.saveFileRestorePoint(data);
    limit = used();
    const third = D.saveFileRestorePoint(data);
    assert.deepEqual(D.fileRestorePoints().map(p => p.key), [third.key, second.key]);
    assert(used() <= limit, 'no third snapshot allocation');
    const before = [...local];
    const larger = structuredClone(data); larger.kv[0].v.padding += 'larger';
    assert.throws(() => D.saveFileRestorePoint(larger), /storage is full or unavailable/);
    assert.deepEqual([...local], before, 'failed atomic replacement must keep both prior snapshots');
  });
  await check('CONTROL malformed metadata and containers cannot break sorting or hide good data', async () => {
    const data = await D.readFileSave(), good = D.saveFileRestorePoint(data);
    for (const [i, value] of [null, { data }, { createdAt: 123, data },
      { createdAt: 'invalid', data }, { createdAt: good.createdAt, data: { log: [] } }].entries()) {
      local.set(good.key + '-' + i, JSON.stringify(value));
    }
    const warn = console.warn, warnings = []; console.warn = s => warnings.push(s);
    try { assert.deepEqual(D.fileRestorePoints().map(p => p.key), [good.key]); }
    finally { console.warn = warn; }
    assert.equal(warnings.length, 5);
    assert.equal(local.size, 6, 'bad entries are retained for recovery');
  });
  await check('CONTROL verification failure restores the overwritten older slot', async () => {
    const data = await D.readFileSave(); D.saveFileRestorePoint(data); D.saveFileRestorePoint(data);
    const before = [...local], { getItem, setItem } = localStorage;
    let failRead = false;
    localStorage.setItem = (k, v) => { setItem(k, v); failRead = true; };
    localStorage.getItem = k => { if (failRead) { failRead = false; return null; } return getItem(k); };
    try { assert.throws(() => D.saveFileRestorePoint(data), /Could not save a restore point/); }
    finally { Object.assign(localStorage, { getItem, setItem }); }
    assert.deepEqual([...local], before);
  });
  await check('CONTROL rapid writes and a reversed clock retain the last two saves', async () => {
    const data = await D.readFileSave(), now = Date.now;
    Date.now = () => 1800000000000;
    try {
      D.saveFileRestorePoint(data);
      const second = D.saveFileRestorePoint(data);
      Date.now = () => 1700000000000;
      const third = D.saveFileRestorePoint(data);
      assert.deepEqual(D.fileRestorePoints().map(p => p.key), [third.key, second.key]);
      assert(Date.parse(third.createdAt) > Date.parse(second.createdAt));
    } finally { Date.now = now; }
  });
}
console.log(`r4-restore: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
