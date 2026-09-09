// Simulated loader clock and transport. Does not certify visible MapLibre tiles.
import vm from 'node:vm';
import { assert, read, audit } from './lib/r4-proof.mjs';
const a = audit('WATER RETRY'), source = read('js/water.js').replaceAll('export ', '');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function loader(src = source, random = 0.5) {
  let now = 0, id = 0, up = true, templateUp = true;
  const timers = new Map(), calls = [];
  const ctx = vm.createContext({ Uint8Array, Math: Object.assign(Object.create(Math), { random: () => random }),
    Date: { now: () => now },
    setTimeout: (fn, delay) => { timers.set(++id, { at: now + delay, fn }); return id; }, clearTimeout: id => timers.delete(id),
    fetch: async url => {
      calls.push({ url, at: now }); const template = url.endsWith('/planet');
      if (!(template ? templateUp : up)) throw Error('host down');
      return { ok: true, json: async () => ({ tiles: ['https://fixture/{z}/{x}/{y}'] }), arrayBuffer: async () => new ArrayBuffer(0) };
    },
  });
  vm.runInContext(src, ctx);
  return { calls, timers, ctx, set up(v) { up = v; }, set templateUp(v) { templateUp = v; },
    query: (lat = 49, lng = -123) => ctx.isWater(lat, lng),
    async advance(to) {
      await flush(); let n = 0;
      while (true) {
        const next = [...timers].sort((x,y) => x[1].at-y[1].at)[0]; if (!next || next[1].at > to) break;
        assert(++n < 10000, 'retry timer spun'); timers.delete(next[0]); now = next[1].at; next[1].fn(); await flush();
      }
      now = to; await flush();
    },
  };
}
const tileCalls = l => l.calls.filter(c => !c.url.endsWith('/planet'));
const intervals = l => { const calls = tileCalls(l), first = calls[0]?.url, ts = calls.filter(c => c.url === first).map(c => c.at); return ts.slice(1).map((t,i) => (t-ts[i])/1000); };
await a.check('CONTROL healthy host delivers and stops its timer', async () => {
  const l = loader(); assert.equal(l.query(), undefined); await flush(); assert.equal(l.query(), false); assert.equal(tileCalls(l).length, 1); assert.equal(l.timers.size, 0);
});
await a.check('same URL retry intervals grow to a literal 120-second cap with jitter', async () => {
  const l = loader(); l.up = false; l.query(); await l.advance(606000);
  const gaps = intervals(l); console.log('GREEN intervals (seconds): '+gaps.join(', '));
  assert.deepEqual(gaps.slice(0,4), [13.5, 27, 54, 108]); assert(gaps.every(g => g <= 120));
  const edge = loader(source, 0); edge.up = false; edge.query(); await edge.advance(606000); assert(intervals(edge).includes(120));
});
await a.check('BOOT host returns and delivers queued tiles without another lookup', async () => {
  const l = loader(); l.templateUp = false; l.up = false; l.query(); await l.advance(50000);
  assert.equal(tileCalls(l).length, 0); l.templateUp = true; l.up = true; await l.advance(180000);
  assert(tileCalls(l).length > 0, 'no tile delivered'); assert.equal(l.query(), false); assert.equal(l.timers.size, 0);
});
await a.check('tile-only outage heals with no walking or additional lookup', async () => {
  const l = loader(); l.up = false; l.query(); await l.advance(50000); l.up = true; await l.advance(180000);
  const count = tileCalls(l).length; assert.equal(l.query(), false); await l.advance(606000); assert.equal(tileCalls(l).length, count);
});
// Deliberate regression control, not claimed to be the absent original audit.
const flat = source.replace(/const delay = [^;]+;/, 'const delay = 15000;').replace('function scheduleRetry() {', 'function scheduleRetry() { return;');
await a.check('CONTROL walking comparison detects flat retries and reports interval AND count', async () => {
  async function walk(src) {
    const l = loader(src); l.up = false;
    for (let ms = 0; ms <= 606000; ms += 1200) {
      await l.advance(ms); for (let i = 0; i < 13; i++) l.query(49, -123 + i * 0.03); await flush();
    }
    return l;
  }
  const before = await walk(flat), after = await walk(source), gaps = intervals(before);
  console.log(`CONTROL reconstructed flat loader: ${tileCalls(before).length} requests; first intervals ${gaps.slice(0,8).join(', ')} seconds`);
  console.log(`GREEN walking loader: ${tileCalls(after).length} requests; first intervals ${intervals(after).slice(0,8).join(', ')} seconds`);
  assert(gaps.length >= 4); assert(gaps.every(g => g === 15.6), 'flat control must reproduce 15.6s');
  assert(tileCalls(after).length < tileCalls(before).length); assert.equal(new Set(tileCalls(after).map(c => c.url)).size, 13);
});
await a.check('CONTROL disabled timer cannot self-heal a boot outage', async () => {
  const l = loader(flat); l.templateUp = false; l.query(); await l.advance(50000); l.templateUp = true; await l.advance(180000);
  assert.equal(tileCalls(l).length, 0, 'broken boot control unexpectedly delivered');
});
a.finish();
