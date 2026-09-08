/* L1 CONTROL: execute the real page wrapper, probe and receipt in Node doubles.
 * This proves disclosure, not browser cadence or app performance. The missing
 * receipt is proven red by restoring the pre-L1 lifecycle on a throwaway tree.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const temp = mkdtempSync(join(tmpdir(), 'l1-machine-'));
const lifecycle = new URL('./audit-lifecycle.mjs', import.meta.url).href;
const observer = new URL('./dependency-observer.mjs', import.meta.url).href;
let failures = 0, cases = 0;
function check(name, fn) {
  cases++;
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.log(`FAIL ${name}: ${error.message}`); }
}
function run(mode) {
  const fixture = join(temp, 'fixture.mjs');
  writeFileSync(fixture, `
    import { EventEmitter } from 'node:events';
    import vm from 'node:vm';
    import { observePuppeteer } from ${JSON.stringify(observer)};
    import { declareAudit, recordAuditRow, completeAudit } from ${JSON.stringify(lifecycle)};
    import * as receipt from ${JSON.stringify(lifecycle)};
    const mode = ${JSON.stringify(mode)}, events = [];
    let ticks = 0;
    class Page extends EventEmitter {
      tracing = { start: async () => { if (mode === 'trace-fails') throw Error('trace refused'); events.push('trace-start'); }, stop: async () => events.push('trace-stop') };
      async setViewport(value) { events.push(['viewport',value]); }
      async createCDPSession() { return { send: async (method,params) => events.push([method,params]) }; }
      async evaluate(fn) {
        if (mode === 'probe-fails') throw Error('renderer unavailable');
        if (mode === 'probe-hangs') return new Promise(() => {});
        let timer, next = 0, callbacks = new Map();
        const value = vm.runInNewContext('('+fn.toString()+')()', {
          performance: { now: () => next }, document: { visibilityState: 'visible' }, devicePixelRatio: 2,
          requestAnimationFrame: cb => { callbacks.set(++ticks,cb); return ticks; },
          cancelAnimationFrame: id => callbacks.delete(id),
          setTimeout: (cb,ms) => { timer = cb; events.push(['probe-window',ms]); },
        });
        if (mode !== 'zero') for (next = 16; next <= 496; next += 16) {
          const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(cb => cb(next));
        }
        next = 500; timer();
        if (callbacks.size) throw Error('probe leaked a rAF loop');
        return value;
      }
    }
    const context = { newPage: async () => new Page() };
    const browser = { newPage: async () => context.newPage(), browserContexts: () => [context],
      createBrowserContext: async () => ({ newPage: async () => new Page() }),
      version: async () => 'Chrome/CONTROL', target: () => ({ createCDPSession: async () => ({
        send: async () => { if (mode === 'gpu-fails') throw Error('GPU refused'); return { gpu: { auxAttributes: { glRenderer: 'ANGLE CONTROL GPU' }, devices: [{deviceString:'CONTROL'}] } }; },
        detach: async () => events.push('detach'),
      }) }),
    };
    const pptr = observePuppeteer({ launch: async () => browser });
    const launched = await pptr.launch({headless:false,args:['--use-angle=metal'],defaultViewport:{width:393,height:852}});
    const page = await launched.newPage();
    if (mode === 'trace' || mode === 'trace-fails') {
      try {
        await page.tracing.start();
        await receipt.sampleMachineCadence(page,'CONTROL after trace start before action');
        await page.tracing.stop();
      } catch (error) { if (mode !== 'trace-fails') throw error; }
    }
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
    if (mode === 'cdp-trace') { await cdp.send('Tracing.start',{}); await cdp.send('Tracing.end'); }
    await page.setViewport({width:440,height:956,deviceScaleFactor:3});
    if (mode === 'multi') {
      await (await launched.createBrowserContext()).newPage();
      page.emit('close');
    }
    if (mode === 'explicit') {
      declareAudit({expectedRows:1}); recordAuditRow('FIRST FLICK control','PASS');
      console.log('PASS FIRST FLICK control'); completeAudit();
    } else console.log((mode === 'failed-row' ? 'FAIL' : 'PASS')+' FIRST FLICK control\\n  OK: frame life\\nUNPRV missing frame');
    if (mode === 'stderr') console.error('FX AUDIT CANNOT RUN: timing setup refused');
    console.log('EVENTS '+JSON.stringify(events));
  `);
  const r = spawnSync(process.execPath, [fixture], { encoding:'utf8', timeout:10000 });
  writeFileSync(join(temp, 'last.exit'), String(r.status));
  writeFileSync(join(temp, 'last.out'), r.stdout + r.stderr);
  assert.ifError(r.error);
  assert.equal(r.status, mode === 'explicit' ? 0 : mode === 'failed-row' ? 1 : 97, r.stdout + r.stderr);
  const lines = r.stderr.split('\n').filter(l => l.startsWith('MACHINE CHARACTER '));
  assert.equal(lines.length, mode === 'explicit' ? 1 : mode === 'stderr' ? 4 : 3, 'each result row must emit machine character');
  return lines.map(l => JSON.parse(l.slice(l.indexOf(': {') + 2)));
}
try {
  check('CONTROL every result row carries measured machine character and cleans up its probe', () => {
    for (const row of run('normal')) {
      assert.ok(row.cpu && row.logicalCPUs > 0 && row.host);
      assert.equal(row.loadAverage1m5m15m.length,3);
      assert.equal(row.pagesObserved.length,1,'newPage wrappers must not double-register');
      const m = row.pagesObserved[0], b = m.baselines[0];
      assert.equal(m.renderer,'ANGLE CONTROL GPU'); assert.equal(m.browser,'Chrome/CONTROL');
      assert.equal(m.headless,false); assert.deepEqual(m.rendererFlags,['--use-angle=metal']);
      assert.equal(m.trace.attached,false); assert.deepEqual(m.cpuRates,[1,6,1]);
      assert.equal(m.viewport.deviceScaleFactor,3);
      assert.equal(b.state,'blank page before navigation');
      assert.equal(b.status,'MEASURED'); assert.equal(b.samples,31); assert.equal(b.medianMs,16);
      assert.equal(b.elapsedMs,500); assert.equal(b.traceAttached,false);
    }
  });
  check('TRACE stopped Puppeteer and CDP traces retain attached history and overhead warning', () => {
    for (const mode of ['trace','cdp-trace']) {
      const machine = run(mode)[0].pagesObserved[0], trace = machine.trace;
      if (mode === 'trace') {
        assert.equal(machine.baselines.length,2);
        assert.equal(machine.baselines[1].traceAttached,true);
      }
      assert.equal(trace.attached,true); assert.equal(trace.active,false); assert.match(trace.note,/profiling overhead/);
    }
    assert.equal(run('trace-fails')[0].pagesObserved[0].trace.attached,false);
  });
  check('EMPTY and refused probes disclose unavailable cadence, never invent a healthy baseline', () => {
    const empty = run('zero')[0].pagesObserved[0].baselines[0];
    assert.equal(empty.samples,0); assert.equal(empty.medianMs,null); assert.match(empty.status,/UNAVAILABLE/);
    assert.match(run('probe-fails')[0].pagesObserved[0].baselines[0].status,/renderer unavailable/);
    assert.match(run('gpu-fails')[0].pagesObserved[0].renderer,/GPU refused/);
    assert.match(run('probe-hangs')[0].pagesObserved[0].baselines[0].status,/exceeded 2000ms/);
    assert.equal(run('failed-row').length,3,'failed rows keep their failure and machine context');
    assert.equal(run('stderr').length,4,'stderr setup failures retain their machine context');
  });
  check('PAGES isolated contexts and closed pages retain distinct measurement provenance', () => {
    const pages = run('multi')[0].pagesObserved;
    assert.equal(pages.length,2); assert.deepEqual(pages.map(p=>p.page),[1,2]);
    assert.deepEqual(pages.map(p=>p.closed),[true,false]);
    assert.deepEqual(pages[1].cpuRates,[1]);
    assert.equal(run('explicit').length,1,'declared rows must not duplicate disclosure');
  });
  check('FLICK baseline brackets the actual diagnostic path before opening the crate; bounds unchanged', () => {
    const s = readFileSync(new URL('./crate-reveal-audit.mjs',import.meta.url),'utf8');
    const start = s.indexOf('await page.tracing.start(');
    const baseline = s.indexOf('await sampleMachineCadence(page,');
    const open = s.indexOf("document.querySelector('[data-open]')?.click();",start);
    assert.ok(start >= 0 && baseline > start && open > baseline);
    assert.match(s,/const minFrames = Math.floor\(520 \/ \(1000 \/ 60\)\) - 6;/);
    assert.match(s,/w.length >= minFrames && m.over20 <= 6/);
    assert.match(s,/worstTask <= 200/);
    assert.match(s,/If Tom's QA rig still reproduces 12 to 20 frames/);
  });
  check('REGISTER the disclosure guard executes in exactly one gate tier', () => {
    const s = readFileSync(new URL('./release-gate.mjs',import.meta.url),'utf8');
    const pure = vm.runInNewContext(s.slice(s.indexOf('const PURE ='),s.indexOf('const BROWSER ='))+';PURE');
    assert.equal(pure.filter(f=>f==='machine-character-audit.mjs').length,1);
    assert.equal((s.match(/'machine-character-audit.mjs'/g)||[]).length,1);
  });
} finally { rmSync(temp,{recursive:true,force:true}); }
console.log(`machine-character: ${cases-failures}/${cases} passed, ${failures} FAILED`);
process.exitCode = failures ? 1 : 0;
