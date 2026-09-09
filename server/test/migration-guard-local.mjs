// Full local D1 proof. Never accepts a URL, remote flag or external DB path.
// Requires loopback sockets and the installed, locked Wrangler runtime.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { serverRoot } from '../scripts/schema-guard.mjs';
import { beforeWeekFreeze, sentinelSQL } from './migration-fixture.mjs';

if (process.argv.length !== 2) throw new Error('This proof accepts no arguments; local D1 only');
const temp = mkdtempSync(join(tmpdir(), 'bonez-d1-migration-'));
const state = join(temp, 'state');
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(temp, 'logs') };
const wrangler = join(serverRoot, 'node_modules/wrangler/bin/wrangler.js');
const config = join(serverRoot, 'wrangler.toml');
let dev;
let output = '';
const run = args => {
  const result = spawnSync(process.execPath, args, { cwd: serverRoot, env, encoding: 'utf8', timeout: 120000 });
  if (result.error) throw result.error;
  return { code: result.status, output: result.stdout + result.stderr, stdout: result.stdout };
};
const execute = args => {
  const r = run([wrangler, 'd1', 'execute', 'bonez', '--config', config, '--local', '--persist-to', state, '--json', ...args]);
  assert.equal(r.code, 0, r.output);
  return JSON.parse(r.stdout);
};
const drift = () => run([join(serverRoot, 'scripts/schema-guard.mjs'), '--local', '--persist-to', state]);
try {
  const schema = join(temp, 'before.sql');
  writeFileSync(schema, beforeWeekFreeze() + '\n' + sentinelSQL);
  execute(['--file', schema]);
  const red = drift();
  assert.equal(red.code, 1, red.output);
  assert.match(red.output, /players.last_week_key.*players.last_week_steps/);
  console.log(`CONTROL RED local D1 drift: ${red.output.trim()}`);

  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  dev = spawn(process.execPath, [wrangler, 'dev', '--config', config, '--local', '--ip', '127.0.0.1',
    '--port', String(port), '--inspector-port', '0', '--persist-to', state],
  { cwd: serverRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
  dev.stdout.on('data', d => { output += d; });
  dev.stderr.on('data', d => { output += d; });
  dev.on('error', error => { output += error.message; });
  const health = path => fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(3000) });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (dev.exitCode !== null) break;
    try { await health('/health'); ready = true; break; } catch { /* wait for local runtime */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, `Local Worker did not start: ${output}`);
  for (const path of ['/health', '/health/deep']) {
    const r = await health(path);
    const body = await r.text();
    assert.equal(r.status, 503, body);
    assert.match(body, /missing column: last_week_key/);
    console.log(`CONTROL RED local D1 ${path}: ${r.status} ${body}`);
  }
  execute(['--file', join(serverRoot, 'migrations/2026-09-05-week-freeze.sql')]);
  const green = drift();
  assert.equal(green.code, 0, green.output);
  console.log(`GREEN local D1 drift: ${green.output.trim()}`);
  const snapshot = () => execute(['--command', 'SELECT * FROM players'])[0].results;
  const before = snapshot();
  for (let i = 0; i < 3; i++) {
    for (const path of ['/health', '/health/deep']) {
      const r = await health(path);
      assert.equal(r.status, 200, await r.clone().text());
      assert.equal((await r.json()).ok, true);
    }
  }
  assert.deepEqual(snapshot(), before);
  console.log('GREEN local D1 /health and /health/deep: 200, six calls, sentinel unchanged');
} finally {
  if (dev && dev.exitCode === null) {
    dev.kill('SIGTERM');
    await new Promise(resolve => {
      const timer = setTimeout(() => { dev.kill('SIGKILL'); }, 5000);
      dev.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
  rmSync(temp, { recursive: true, force: true });
}
