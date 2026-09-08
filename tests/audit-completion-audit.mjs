import { auditOutputPath } from './lib/audit-output.mjs';
/* N2 CONTROL: execute the shipped receipt and unavailable grading branches.
 * No browser or socket. A killed child, a throw after a red control and healthy
 * controls verify outcomes, not merely the presence of source strings.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { observeDependencies, requireDependencyHosts, observePuppeteer } from './dependency-observer.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const lifecycle = new URL('./audit-lifecycle.mjs', import.meta.url).href;
const godmode = new URL('./godmode.js', import.meta.url).href;
const temp = mkdtempSync(auditOutputPath(join(tmpdir(), 'n2-receipts-')));
let failures = 0, cases = 0;
async function check(name, fn) {
  cases++;
  try { await fn(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.log(`FAIL ${name}: ${error.stack}`); }
}
function run(source, preload = true) {
  const file = join(temp, 'fixture.mjs');
  writeFileSync(auditOutputPath(file), source);
  const result = spawnSync(process.execPath, [...(preload ? ['--import', lifecycle] : []), file], { encoding: 'utf8', timeout: 5000 });
  const out = result.stdout + result.stderr;
  writeFileSync(auditOutputPath(join(temp, 'last.out')), out);
  writeFileSync(auditOutputPath(join(temp, 'last.exit')), String(result.status));
  assert.ifError(result.error);
  return { ...result, out };
}
function between(file, start, end) {
  const source = readFileSync(join(here, file), 'utf8');
  assert.equal(source.split(start).length, 2, `CONTROL unique start in ${file}`);
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(b > a, `CONTROL end in ${file}`);
  return source.slice(a, b);
}
try {
  await check('CONTROL healthy declared audit has a complete 2/2 receipt', () => {
    const r = run(`import {declareAudit,recordAuditRow,completeAudit} from ${JSON.stringify(lifecycle)};
      declareAudit({expectedRows:2}); recordAuditRow('one','PASS'); recordAuditRow('two','PASS'); completeAudit();`);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /PASSED; COMPLETE; rows=2\/2/);
  });
  await check('THROW retains the red CONTROL and declares INCOMPLETE', () => {
    const r = run(`console.log('PASS first'); console.log('FAIL CONTROL empty trace'); throw new Error('no frame');`);
    assert.equal(r.status, 1);
    assert.match(r.out, /RETAINED FAIL CONTROL empty trace/);
    assert.match(r.out, /INTERRUPTED.*no frame/);
    assert.match(r.out, /FAILED; INCOMPLETE; rows=2\/undeclared; failed=1/);
  });
  await check('REJECTION and parse failure cannot look like completion', () => {
    for (const source of ["await Promise.reject(new Error('lost frame'));", 'const twice=1; const twice=2;']) {
      const r = run(source);
      assert.equal(r.status, 1);
      assert.match(r.out, /AUDIT END.*FAILED; INCOMPLETE/);
    }
  });
  await check('EARLY zero exit refuses an incomplete declared denominator', () => {
    const r = run(`import {declareAudit,recordAuditRow,completeAudit} from ${JSON.stringify(lifecycle)};
      declareAudit({expectedRows:37}); recordAuditRow('one','PASS'); completeAudit(); process.exit(0);`);
    assert.equal(r.status, 97, r.out);
    assert.match(r.out, /UNPROVEN; INCOMPLETE; rows=1\/37/);
  });
  await check('SIGNAL termination is incomplete and nonzero', () => {
    const r = run("process.kill(process.pid, 'SIGTERM'); setTimeout(()=>{},1000);");
    assert.equal(r.status, 143, r.out);
    assert.match(r.out, /INCOMPLETE/);
  });
  await check('DEPENDENCY unavailable refuses green; a real failure still wins', () => {
    for (const fail of [false, true]) {
      const r = run(`import {discloseDependency} from ${JSON.stringify(lifecycle)};
        discloseDependency('tile host',false,'proxy refused'); ${fail ? "console.log('FAIL control');" : ''} process.exit(0);`);
      assert.equal(r.status, fail ? 1 : 97, r.out);
      assert.match(r.out, /DEPENDENCY tile host: UNAVAILABLE.*proxy refused/);
    }
  });
  await check('BANNER default name and malformed legacy capability never throw', () => {
    const r = run(`import {unproven,unprovenReport,exitFor} from ${JSON.stringify(godmode)};
      unproven('rows','no tiles'); unprovenReport(); unprovenReport('legacy',1); process.exit(exitFor(0));`, false);
    assert.equal(r.status, 97, r.out);
    assert.doesNotMatch(r.out, /undefined did not fully run|TypeError/);
    assert.match(r.out, /fixture.mjs did not fully run/);
    assert.match(r.out, /AUDIT END/);
  });
  await check('RAF missing capability executes the real branch and exits 97', () => {
    const block = between('boneyard-raf-audit.mjs', '  const cap = await boneyardCapability(page);', '\n  await browser.defaultBrowserContext()');
    const r = run(`import {unproven,unprovenReport,UNPROVEN_EXIT} from ${JSON.stringify(godmode)};
      const page={}, browser={close:async()=>{}}, srv={close(){}};
      const boneyardCapability=async()=>({ok:false,checks:[{kind:'TILES',ok:false,detail:'proxy refused'}]});
      ${block}`);
    assert.equal(r.status, 97, r.out);
    assert.match(r.out, /TILES\s+proxy refused/);
    assert.doesNotMatch(r.out, /TypeError/);
  });
  await check('ICON gates before map DOM reads and streams a failing row', async () => {
    const block = between('boneyard-icon-audit.mjs', 'let s;\ntry {', '\n  await browser.defaultBrowserContext()').slice('let s;\ntry {'.length);
    const r = run(`import {unproven,unprovenReport,exitFor} from ${JSON.stringify(godmode)};
      const page={}, browser={close:async()=>{}}, srv={close(){}}, fails=0;
      const boneyardCapability=async()=>({ok:false,checks:[{kind:'TILES',ok:false,detail:'proxy refused'}]});
      ${block}`);
    assert.equal(r.status, 97, r.out);
    assert.match(r.out, /no icon comparisons were graded/);
    const row = between('boneyard-icon-audit.mjs', 'let fails = 0;', '\nconst srv =');
    const crashed = run(`${row}\nok('CONTROL sample',false); throw new Error('DOM missing');`);
    assert.match(crashed.out, /RETAINED FAIL CONTROL sample/);
  });
  await check('WATER real grading block distinguishes unavailable, healthy, and cache loss', () => {
    const block = between('water-cache-audit.mjs', '  }, HOME);\n\n', '\n} finally').slice('  }, HOME);\n\n'.length);
    for (const [sample, want] of [[{warm:'never answered'},97], [{warm:false,tiles:121,blanks:0,reads:11},0], [{warm:false,tiles:121,blanks:1,reads:11},1]]) {
      const r = run(`import {unproven,exitFor} from ${JSON.stringify(godmode)};
        import {discloseDependency} from ${JSON.stringify(lifecycle)};
        let fails=0; const ok=(label,pass)=>{if(!pass)fails++; console.log((pass?'PASS ':'FAIL ')+label);};
        const r=${JSON.stringify(sample)}; ${block} process.exit(exitFor(fails));`);
      assert.equal(r.status, want, r.out);
      if (want === 97) { assert.doesNotMatch(r.out,/FAIL WARM/); assert.match(r.out,/UNPRV WARM/); }
    }
  });
  await check('CAPABILITY discloses successful and refused measurements from the real helper', async () => {
    const body = between('godmode.js', 'export async function boneyardCapability(page) {', '\n/* AN AUDIT');
    for (const available of [true, false]) {
      const reports = [], responses = [{ok:true,api:'webgl2',renderer:'fixture'}, {results:[{u:'https://tiles.invalid/planet',ok:available,status:available?200:403}],styleUrl:'fixture'}];
      const context = { page: {evaluate:async()=>responses.shift(),on(){},off(){},url:()=> 'http://localhost:8765'}, fs:{readFileSync:()=>"style: 'assets/map/boneheadz-style.json'"}, path:{join}, ROOT_DIR:here,
        discloseDependency: (...args)=>reports.push(args), requireDependencyHosts() {}, observeDependencies() {} };
      const cap = await vm.runInNewContext(`(async()=>{${body.replace('export ', '')}; return boneyardCapability(page);})()`,context);
      assert.equal(cap.ok,available);
      assert.equal(reports.length,2);
      assert.equal(reports.find(r=>r[0]==='TILES')[1],available);
    }
  });
  await check('NETWORK reports answered, refused, cached, and mocked traffic without claiming a host answered for a fixture', () => {
    const page = new EventEmitter(), lines = [];
    const report = observeDependencies(page,'http://localhost:8765',line=>lines.push(line));
    const req = (host, action) => ({url:()=>`https://${host}/tile`, failure:()=>({errorText:'proxy refused'}),interceptResolutionState:()=>({action}),respond(){action='already-handled';}});
    const good=req('good.invalid'), bad=req('bad.invalid'), cached=req('cached.invalid'), mock=req('mock.invalid','respond');
    for (const request of [good,bad,cached,mock]) page.emit('request',request);
    mock.respond();
    for (const request of [good,cached,mock]) page.emit('response',{request:()=>request,status:()=>200,fromCache:()=>request===cached});
    page.emit('requestfailed',bad); report(); page.emit('close');
    assert.equal(lines.length,4);
    assert.match(lines.find(l=>l.includes('good.invalid')),/host answered=YES/);
    assert.match(lines.find(l=>l.includes('bad.invalid')),/host answered=NOT OBSERVED.*proxy refused/);
    assert.match(lines.find(l=>l.includes('cached.invalid')),/host answered=NOT OBSERVED.*cached=1/);
    assert.match(lines.find(l=>l.includes('mock.invalid')),/host answered=NOT OBSERVED.*mocked=1/);
    const missing=[];
    requireDependencyHosts(page,['https://mock.invalid','https://cached.invalid'],(...args)=>missing.push(args));
    assert.equal(missing.length,2);
    assert.ok(missing.every(r=>r[1]===false));
  });
  await check('GATE preloads the receipt and reports SIGKILL without a false completion', async () => {
    writeFileSync(auditOutputPath(join(temp, 'audit-lifecycle.mjs')), readFileSync(join(here, 'audit-lifecycle.mjs')));
    writeFileSync(auditOutputPath(join(temp, 'gate-fixture.mjs')), "console.log('FAIL CONTROL before kill'); process.kill(process.pid,'SIGKILL');");
    const body = between('release-gate.mjs', 'function run(file, args) {', '\n/* THERE ARE THREE');
    const result = await vm.runInNewContext(`${body};run('gate-fixture.mjs',[])`, {spawn,process,join,here:temp});
    assert.notEqual(result.code,0);
    assert.match(result.out,/AUDIT START gate-fixture.mjs/);
    assert.match(result.out,/AUDIT INCOMPLETE gate-fixture.mjs: no final receipt; signal=SIGKILL/);
    assert.match(result.out,/FAIL CONTROL before kill/);
    const reportBody = between('release-gate.mjs', 'function report(r) {', '\n/* ====');
    const lines = [];
    vm.runInNewContext(`${reportBody}; report(r);`, {r:{code:0,file:'fixture',secs:0,out:'DEPENDENCY TILES: AVAILABLE\nAUDIT END fixture: PASSED'},
      verdict:()=> 'PASS', UNPROVEN:97, console:{log:line=>lines.push(line)}});
    assert.ok(lines.some(l=>l.includes('DEPENDENCY TILES: AVAILABLE')));
    assert.ok(lines.some(l=>l.includes('AUDIT END fixture: PASSED')));
  });
  await check('TILE probe executes a bounded tile fetch beyond the responding manifest', async () => {
    const body = between('godmode.js', '  const net = await page.evaluate(async (sp) => {', '\n  page.off(');
    for (const tileOK of [true,false]) {
      const requests = [];
      const context = {stylePath:'assets/map/style.json', location:{href:'http://localhost:8765/'},URL,AbortSignal,
        page:{evaluate:async(fn,arg)=>fn(arg)},fetch:async(url,opts)=>{
          requests.push(String(url));
          assert.ok(opts.signal, 'CONTROL every probe has a timeout');
          if(String(url).endsWith('style.json')) return {ok:true,json:async()=>({sources:{tiles:{url:'https://manifest.invalid/source'}}})};
          if(String(url).includes('manifest.invalid')) return {ok:true,status:200,json:async()=>({tiles:['https://tiles.invalid/{z}/{x}/{y}.pbf']})};
          return {ok:tileOK,status:tileOK?200:403,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};
        }};
      const result = await vm.runInNewContext(`(async()=>{${body};return net;})()`,context);
      assert.equal(requests.length,3);
      assert.equal(result.results.length,2);
      assert.equal(result.results[1].ok,tileOK);
      assert.equal(result.results[1].u,'https://tiles.invalid/0/0/0.pbf');
    }
  });
  await check('DEPENDENCY lost after preflight is UNPROVEN, optional failures stay disclosed only', () => {
    const r = run(`import { EventEmitter } from 'node:events';
      import { observeDependencies, requireDependencyHosts, observePuppeteer } from ${JSON.stringify(new URL('./dependency-observer.mjs',import.meta.url).href)};
      import { discloseDependency } from ${JSON.stringify(lifecycle)};
      const page=new EventEmitter(); observeDependencies(page,'http://localhost:8765');
      requireDependencyHosts(page,['https://tiles.invalid/planet'],discloseDependency);
      const request={url:()=> 'https://tiles.invalid/1/0/0.pbf',failure:()=>({errorText:'proxy refused mid-run'})};
      page.emit('request',request);page.emit('requestfailed',request);page.emit('close');process.exit(0);`);
    assert.equal(r.status,97,r.out);
    assert.match(r.out,/DEPENDENCY REMOTE https:\/\/tiles.invalid: UNAVAILABLE.*proxy refused mid-run/);
    const lines=[], reports=[], page=new EventEmitter();
    observeDependencies(page,'http://localhost:8765',line=>lines.push(line));
    requireDependencyHosts(page,['https://required.invalid'],(...args)=>reports.push(args));
    const request={url:()=> 'https://optional.invalid/ping',failure:()=>({errorText:'fixture refused'})};
    page.emit('request',request);page.emit('requestfailed',request);page.emit('close');
    assert.equal(reports.length,0);
    assert.match(lines[0],/optional.invalid.*failed=1/);
  });
  await check('BROWSER raw launch and isolated-context pages observe before navigation', async () => {
    const context = () => ({newPage:async()=>new EventEmitter()});
    const normal=context(), isolated=context();
    const browser={newPage:async()=>normal.newPage(),browserContexts:()=>[normal],createBrowserContext:async()=>isolated};
    class Instrument { #token='fixture'; version(){return this.#token;} async launch(){return browser;} }
    const proxy=observePuppeteer(new Instrument());
    assert.equal(proxy.version(),'fixture');
    const launched=await proxy.launch();
    const reports=[];
    for (const page of [await launched.newPage(),await (await launched.createBrowserContext()).newPage()]) {
      assert.equal(page.listenerCount('request'),1);
      requireDependencyHosts(page,['https://tiles.invalid'],(...args)=>reports.push(args));
      const request={url:()=> 'https://tiles.invalid/tile', failure:()=>({errorText:'proxy refused'})};
      page.emit('request',request);page.emit('requestfailed',request);page.emit('close');
    }
    assert.equal(reports.length,2);
  });
  await check('MIMIC real row helpers retain 19/38 on a throw and complete 38/38', () => {
    const source=readFileSync(join(here,'mimic-audit.mjs'),'utf8');
    const plan=source.match(/^declareAudit\(.*$/m)?.[0] || '';
    const helpers=plan+'\n'+between('mimic-audit.mjs','let fails = 0;','\nconst srv =');
    const tail=source.slice(source.includes('\ncompleteAudit();') ? source.lastIndexOf('\ncompleteAudit();') : source.lastIndexOf('\nconsole.log('));
    for (const count of [19,38]) {
      const r=run(`import {declareAudit,recordAuditRow,completeAudit} from ${JSON.stringify(lifecycle)};
        ${helpers}
        for(let i=0;i<${count};i++) ok('CONTROL row '+i,${count}===38 || i!==18);
        ${count===19 ? "throw new Error('empty capture');" : tail}`);
      assert.equal(r.status,count===19?1:0,r.out);
      assert.match(r.out,count===19?/FAILED; INCOMPLETE; rows=19\/38; failed=1/:/PASSED; COMPLETE; rows=38\/38/);
      if(count===19) assert.match(r.out,/RETAINED FAIL CONTROL row 18/);
    }
  });
  await check('MIMIC preserves all existing rows and declares its denominator before boot', () => {
    const source = readFileSync(join(here,'mimic-audit.mjs'),'utf8');
    const count = [...source.matchAll(/^\s*(?:ok|pixelRow)\('/gm)].length;
    assert.equal(count,38);
    assert.match(source,/declareAudit\(\{ expectedRows: 38 \}\)/);
    assert.ok(source.indexOf('declareAudit({') < source.indexOf('await serveTree('));
    assert.match(source,/completeAudit\(\);\s*console.log\(`\\nMIMIC AUDIT/);
  });
} finally { rmSync(auditOutputPath(temp),{recursive:true,force:true}); }
console.log(`audit-completion: ${cases-failures}/${cases} passed, ${failures} FAILED`);
process.exitCode = failures ? 1 : 0;
