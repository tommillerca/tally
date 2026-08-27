/* A KILLED AUDIT MUST NOT LEAVE A BROWSER BEHIND. 2026-08-27.
 *
 * Tom: "can you find a way to not just leave insane 1200% cpu loops melting my
 * computer in the future??"
 *
 * What he was looking at: an orphaned chrome-headless-shell (ppid 1) whose GPU
 * child sat at 1200% CPU, eleven cores of SwiftShader software rendering, for
 * 1h37m, with no parent and no page doing anything. An audit had been SIGKILLed
 * by a 2-minute harness timeout at 14:07:35.
 *
 * EVERY EXISTING BACKSTOP IN godmode.js RUNS INSIDE THE NODE PROCESS, so SIGKILL
 * beats all of them, and the file said so in a comment and delegated the case to
 * the census. That delegation only pays out on runs the census performs; a
 * single audit killed on its own left nothing to reap it.
 *
 * So this grades the one property that matters and cannot be argued with: kill
 * the audit the way the harness kills it, then ask the operating system whether
 * the browser is still there.
 *
 * WHY EACH ROW EXISTS:
 *   ALIVE  the browser really was running before the kill. Without it, "the
 *          browser is gone" passes for free on a run that never launched one,
 *          which is this repo's single most repeated failure (an empty sample
 *          reported as a pass).
 *   KILLED the node process really is dead, so the reap cannot be credited to a
 *          process that is still tidying up after itself.
 *   REAPED the browser is gone afterwards. The actual claim.
 *   STRAY  reapStrandedBrowsers() clears an orphan that predates this run, which
 *          is the bound on any leak that escapes the nanny.
 *
 * PROVE-RED: delete the _nanny(browser) call in _trackBrowser and REAPED goes
 * red with the pid still alive, while ALIVE and KILLED stay green, so the red
 * names the defect rather than the file.
 *
 * Usage: node tests/harness-leak-audit.mjs
 */
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reapStrandedBrowsers } from './godmode.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(here);
/* POINTABLE AT THIS TREE, which the gate REQUIRES of every suite it runs: a file
   that cannot be handed a base URL is a file that would grade PRODUCTION, and
   the gate refuses to start rather than let one through. It caught this file the
   first time it ran, which is the guard doing exactly its job on my own audit.
   The victim below inherits it, so the browser it strands belongs to the tree
   under test and not to the live site. */
const BASE = process.argv[2] || process.env.URL || '';
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gone = async (pid, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (!alive(pid)) return Math.round(Date.now() - t0); await sleep(250); }
  return null;
};

/* A victim that boots a browser exactly as any audit does, reports the pid, then
   sits there. It never closes anything: being killed IS the scenario. */
const victimPath = path.join(here, `.leak-victim-${process.pid}.mjs`);
fs.writeFileSync(victimPath, `
import { boot } from ${JSON.stringify(path.join(here, 'godmode.js'))};
const { browser } = await boot(${JSON.stringify(BASE)} || undefined);
console.log('CHROME_PID=' + browser.process().pid);
await new Promise(() => {});
`);

let victim = null, chromePid = null;
try {
  victim = spawn(process.execPath, [victimPath], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '';
  const t0 = Date.now();
  while (Date.now() - t0 < 120000 && chromePid === null) {
    const chunk = victim.stdout.read();
    if (chunk) { buf += chunk; const m = buf.match(/CHROME_PID=(\d+)/); if (m) chromePid = +m[1]; }
    if (victim.exitCode !== null) break;
    await sleep(200);
  }

  ok('ALIVE  the victim audit really launched a browser, and it is running',
    !!chromePid && alive(chromePid),
    chromePid ? `chrome pid ${chromePid}, alive ${alive(chromePid)}` : 'the victim never reported a browser pid');

  if (!chromePid) throw new Error('no browser to grade');

  /* SIGKILL, which is exactly what a harness timeout sends and what nothing
     inside node can intercept. */
  victim.kill('SIGKILL');
  const victimGone = await gone(victim.pid, 10000);
  ok('KILLED the audit process is dead, so nothing of ours is left to tidy up',
    victimGone !== null, victimGone !== null ? `node gone in ${victimGone}ms` : 'the victim survived SIGKILL');

  const reaped = await gone(chromePid, 20000);
  ok('REAPED and the browser it left behind is gone too',
    reaped !== null,
    reaped !== null
      ? `chrome pid ${chromePid} gone ${reaped}ms after the kill`
      : `chrome pid ${chromePid} is STILL ALIVE 20s after its audit was killed, which is the 1200% CPU orphan`);
} finally {
  try { if (victim && victim.exitCode === null) victim.kill('SIGKILL'); } catch { /* gone */ }
  try { if (chromePid && alive(chromePid)) process.kill(chromePid, 'SIGKILL'); } catch { /* gone */ }
  try { fs.unlinkSync(victimPath); } catch { /* gone */ }
}

/* THE BOUND ON ANYTHING THAT ESCAPES THE NANNY. A real orphan is made the same
   way the real one was: launch, then kill the launcher so the browser reparents
   to init. Then the sweep has to find it by shape, without being told its pid. */
{
  const p2 = path.join(here, `.leak-stray-${process.pid}.mjs`);
  fs.writeFileSync(p2, `
import { boot } from ${JSON.stringify(path.join(here, 'godmode.js'))};
const { browser } = await boot(${JSON.stringify(BASE)} || undefined);
console.log('CHROME_PID=' + browser.process().pid);
await new Promise(() => {});
`);
  let v2 = null, pid2 = null;
  try {
    v2 = spawn(process.execPath, [p2], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = ''; const t0 = Date.now();
    while (Date.now() - t0 < 120000 && pid2 === null) {
      const c = v2.stdout.read();
      if (c) { buf += c; const m = buf.match(/CHROME_PID=(\d+)/); if (m) pid2 = +m[1]; }
      if (v2.exitCode !== null) break;
      await sleep(200);
    }
    if (pid2) {
      /* Take the nanny out first, so this row grades the SWEEP and not the
         nanny a second time. Without this, STRAY passes even if the sweep is
         broken, which would make it a second copy of REAPED wearing a hat. */
      try {
        const { execSync } = await import('node:child_process');
        const nannies = execSync(`ps -Ao pid,args | grep -F 'kill -0 ${v2.pid}' | grep -v grep || true`, { encoding: 'utf8' })
          .split('\n').map(l => +l.trim().split(/\s+/)[0]).filter(Boolean);
        for (const n of nannies) { try { process.kill(n, 'SIGKILL'); } catch { /* gone */ } }
      } catch { /* nothing to remove */ }
      v2.kill('SIGKILL');
      await gone(v2.pid, 10000);
      await sleep(1500);                       // let it reparent to init
      const orphaned = alive(pid2);
      const swept = reapStrandedBrowsers();
      const cleared = await gone(pid2, 10000);
      ok('STRAY  a browser stranded by an earlier run is swept on the next boot',
        orphaned && cleared !== null,
        orphaned
          ? `swept ${swept} stranded browser(s), pid ${pid2} ${cleared !== null ? `gone in ${cleared}ms` : 'STILL ALIVE'}`
          : 'could not stage an orphan, so this row graded nothing');
    } else {
      ok('STRAY  a browser stranded by an earlier run is swept on the next boot', false, 'could not launch the stray');
    }
  } finally {
    try { if (v2 && v2.exitCode === null) v2.kill('SIGKILL'); } catch { /* gone */ }
    try { if (pid2 && alive(pid2)) process.kill(pid2, 'SIGKILL'); } catch { /* gone */ }
    try { fs.unlinkSync(p2); } catch { /* gone */ }
  }
}

console.log(fails ? '\nharness-leak: FAILED' : '\nharness-leak: clean');
process.exit(fails);
