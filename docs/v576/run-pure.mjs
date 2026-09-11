// Run from the checkout root. No server, browser driver, or shell pipeline.
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
const gate = readFileSync('tests/release-gate.mjs', 'utf8');
const init = gate.match(/const PURE = (\[[\s\S]*?\]);/)[0];
const additions = [...gate.matchAll(/^PURE\.(?:push|unshift)\([^;]+\);/gm)].map(m => m[0]);
const suites = Array.from(vm.runInNewContext(init + '\n' + additions.join('\n') + '\nPURE'));
if (new Set(suites).size !== suites.length) throw Error('Duplicate PURE entry');
const logs = '/tmp/v576-pure';
mkdirSync(logs, { recursive: true });
const results = [];
console.log(`PURE enumerated: ${suites.length}; mutation sites: ${additions.length}`);
for (const suite of suites) {
  const fd = openSync(`${logs}/${suite}.txt`, 'w');
  const result = spawnSync(process.execPath, [`tests/${suite}`], { stdio: ['ignore', fd, fd] });
  closeSync(fd);
  results.push({ suite, exitCode: result.status, signal: result.signal, error: result.error?.message ?? null });
  writeFileSync('docs/v576/pure-results.json', JSON.stringify({ count: suites.length, mutationSites: additions.length, results }, null, 2) + '\n');
  console.log(`${results.length}/${suites.length} ${suite} exit=${result.status}`);
}
const passed = results.filter(r => r.exitCode === 0).length;
console.log(`PURE ${passed}/${suites.length}; failed ${suites.length - passed}`);
process.exitCode = passed === suites.length ? 0 : 1;
