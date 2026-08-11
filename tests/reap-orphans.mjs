/* KILL THE BROWSERS WHOSE OWNER IS DEAD. Nothing else.
 *
 * WHAT ACTUALLY LEAKS, measured rather than assumed. I first blamed "audits that
 * crash before browser.close()" and wrote an in-process exit hook for it. That
 * theory was wrong: puppeteer already installs its own exit handlers, so a
 * thrown assertion, a null dereference and an uncaught rejection all clean up on
 * their own (tested: 0 processes left after each). The path that really leaks is
 * a HARD KILL of the node process, which is what a harness timeout does, and no
 * in-process hook can survive SIGKILL by definition. One SIGKILLed audit strands
 * ELEVEN processes (renderers, GPU, network service), which is how one long day
 * reached 41 of them, roughly 53GB of phantom memory, and a gate run that
 * reported five suites blocked on a tree that was fine.
 *
 * WHY PPID 1 IS THE RIGHT TEST, and why this obeys the GATE LOCK rule that says
 * never kill by name: a browser launched by a living audit has that audit as its
 * parent. When the parent is SIGKILLed the child is reparented to launchd, so
 * ppid == 1 means "the process that owned me is gone" and nothing else. Another
 * session's RUNNING suite always has a live parent and is therefore invisible to
 * this. `pkill -f "Chrome for Testing"` cannot make that distinction and would
 * kill a colleague's verification mid-flight; this cannot.
 *
 *   node tests/reap-orphans.mjs          # report only
 *   node tests/reap-orphans.mjs --kill   # reap them
 */
import { execFileSync } from 'node:child_process';

const MARKERS = ['Chrome for Testing', 'chrome-headless-shell'];
const ps = execFileSync('ps', ['-eo', 'pid=,ppid=,command=']).toString().split('\n');
const orphans = [];
for (const line of ps) {
  const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
  if (!m) continue;
  const [, pid, ppid, cmd] = m;
  if (ppid !== '1') continue;                       // owner still alive: not ours to touch
  if (!MARKERS.some(k => cmd.includes(k))) continue;
  if (/--type=/.test(cmd) === false && !/Chrome for Testing|chrome-headless-shell/.test(cmd)) continue;
  orphans.push({ pid: Number(pid), cmd: cmd.slice(0, 80) });
}

if (!orphans.length) { console.log('no orphaned test browsers'); process.exit(0); }
console.log(`${orphans.length} orphaned test browser process(es) (ppid 1):`);
for (const o of orphans.slice(0, 6)) console.log(`   ${o.pid}  ${o.cmd}`);
if (orphans.length > 6) console.log(`   ... and ${orphans.length - 6} more`);

if (!process.argv.includes('--kill')) {
  console.log('\nreport only. re-run with --kill to reap them.');
  process.exit(0);
}
let killed = 0;
for (const o of orphans) {
  try { process.kill(o.pid, 'SIGKILL'); killed++; } catch { /* already gone */ }
}
console.log(`\nreaped ${killed} by PID (never by name: a name match hits other sessions' live runs).`);
