// Enumerate the gate's actual PURE declarations without executing its server.
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import vm from 'node:vm';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../', import.meta.url));
const source = readFileSync(resolve(root, 'tests/release-gate.mjs'), 'utf8');
const init = source.match(/const PURE = (\[[\s\S]*?\]);/)?.[0];
assert.ok(init, 'Missing PURE declaration');
const mutations = [...source.matchAll(/^PURE\.(?:push|unshift)\([^;]+\);/gm)].map(m => m[0]);
const files = vm.runInNewContext(init + '\n' + mutations.join('\n') + '\nPURE');
assert.ok(files.length >= 152, `Refusing a partial green: only ${files.length} PURE audits`);
assert.equal(new Set(files).size, files.length, 'Duplicate PURE registration');
const serial = vm.runInNewContext('(' + source.match(/const SERIAL = ({[\s\S]*?\n});/)[1] + ')');
const out = resolve(root, 'docs/crew-capture/proof');
mkdirSync(out, { recursive: true });
const streams = mkdtempSync(resolve(tmpdir(), 'crew-capture-pure-'));
console.log(`Full audit streams: ${streams}`);
writeFileSync(resolve(out, 'pure-enumeration.json'), JSON.stringify(files, null, 2) + '\n');
console.log(`Enumerated ${files.length} PURE audits from tests/release-gate.mjs`);
const results = [];
async function run(file) {
  return new Promise(resolveRun => {
    const child = spawn(process.execPath, ['tests/' + file], { cwd: root });
    let output = '', error = null;
    const timer = setTimeout(() => child.kill('SIGTERM'), 180000);
    child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
    child.on('error', e => { error = e.message; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      writeFileSync(resolve(streams, file + '.txt'), output);
      results.push({ file, code, signal, error });
      console.log(`${code === 0 ? 'PASS' : 'FAIL'} ${file} exit=${code}${signal ? ' ' + signal : ''}`);
      resolveRun();
    });
  });
}
const parallel = files.filter(f => !Object.hasOwn(serial, f));
let index = 0;
await Promise.all(Array.from({ length: 4 }, async () => { for (let i = index++; i < parallel.length; i = index++) await run(parallel[i]); }));
for (const file of files.filter(f => Object.hasOwn(serial, f))) await run(file);
results.sort((a, b) => files.indexOf(a.file) - files.indexOf(b.file));
writeFileSync(resolve(out, 'pure-results.json'), JSON.stringify(results, null, 2) + '\n');
assert.equal(results.length, files.length, 'Missing PURE result');
console.log(`${results.filter(r => r.code === 0).length}/${files.length} PURE audits exit 0`);
process.exitCode = results.some(r => r.code !== 0) ? 1 : 0;
