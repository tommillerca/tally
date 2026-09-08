/* N3 Node regression: execute the real artifact path expressions and the News
 * callback through openRaceIntro to its renderer input. No browser or sockets.
 * CONTROL: restore each original path / the original News callback in a copy.
 * This proves path selection and data delivery, not screenshot or pixel output.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { shotDir } from './godmode.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function outside(file) {
  const rel = path.relative(root, file);
  assert.ok(path.isAbsolute(file) && (rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)),
    `artifact enters checkout: ${rel || '.'}`);
}

await test('CONTROL checkout artifacts are refused', () => {
  assert.throws(() => outside(path.join(root, '_feedback_shots/today-d2/probe.png')), /artifact enters checkout/);
});

const paths = [
  ['today-container-audit.mjs', 'shotPath', "shotPath('n3-probe.png')"],
  ['today-d2-shots.mjs', 'out', "path.join(out, 'n3-probe.png')"],
  ['levelpaid-trace.mjs', 'OUT', "path.join(OUT, 'n3-probe.json')"],
  ['figure-audit.mjs', 'tmp', 'tmp'],
];
for (const [file, variable, expression] of paths) {
  await test(`ARTIFACT ${file} defaults outside checkout`, () => {
    const source = read(`tests/${file}`);
    const declaration = source.match(new RegExp(`^\\s*const ${variable} = [^\\n]+;`, 'm'))?.[0];
    assert.ok(declaration, `missing ${variable} declaration`);
    const dest = vm.runInNewContext(`${declaration}\n${expression}`, {
      ROOT: root, repo: root, path, join: path.join, shotDir,
      arg: (_name, fallback) => fallback, process: { pid: process.pid },
    });
    outside(dest); // Refuse before writing, including on a reverted copy.
    const probe = `${dest}.n3-${process.pid}`;
    try {
      writeFileSync(probe, 'N3 artifact routing proof', { flag: 'wx' });
      assert.equal(readFileSync(probe, 'utf8'), 'N3 artifact routing proof');
    } finally { unlinkSync(probe); }
  });
}

await test('RACE News delivers the equipped outfit to the poster renderer', async () => {
  const app = read('js/app.js');
  const entry = app.slice(app.indexOf("{ id: 'race',"), app.indexOf("{ id: 'spire',"));
  const callback = entry.match(/open: (.+) \},/)?.[1];
  assert.ok(callback, 'missing real News callback');
  const start = app.indexOf('function openRaceIntro()');
  const render = app.slice(start, app.indexOf('\n}\n', start) + 3);
  assert.ok(start >= 0 && render.includes('avatarLayersHtml(raceIntroFit'), 'missing real poster renderer');
  const initial = app.match(/let raceIntroFit = [^\n]+;/)?.[0];
  assert.ok(initial, 'missing cold module default');
  let fit = { B: 'B0-1', SK: 'SK0-1', H: 'H11-1', FW: 'FW1', IL: 'IL1-1', IR: 'IR10-3', P: 'P1' };
  let delivered = null, reads = 0;
  const context = vm.createContext({
    equipped: async () => { reads++; return { ...fit }; },
    document: { createElement: () => ({}) },
    RACE_PURSE: [{ coins: 5000, dust: 200 }], RACE_DAYS: 7,
    avatarLayersHtml: eq => { delivered = { ...eq }; return ''; },
    openVeil: () => () => {}, composeAvatars: () => {},
    $: () => ({ addEventListener() {} }),
  });
  vm.runInContext(`${initial}\n${render}\nconst openNews = ${callback};`, context);
  await vm.runInContext('openNews()', context);
  const missing = Object.values(fit).filter(id => !Object.values(delivered || {}).includes(id));
  assert.equal(missing.length, 0, `missing ${missing.length}: ${missing.join(' ')}`);
  assert.equal(reads, 1, 'News must await the current equipment read');
  assert.deepEqual(delivered, fit);
  // A second visit must refresh, not keep the first player's look cached.
  fit = { B: 'B0-1', SK: 'SK0-1', H: 'H13-3' };
  await vm.runInContext('openNews()', context);
  assert.equal(reads, 2);
  assert.deepEqual(delivered, fit);
});

console.log(`${passed}/${passed + failed} passed (Node paths and renderer input only)`);
process.exitCode = failed ? 1 : 0;
