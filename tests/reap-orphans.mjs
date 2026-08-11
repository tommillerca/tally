/* KILL THE TEST PROCESSES WHOSE OWNER IS DEAD. Nothing else.
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

/* THE SERVERS LEAK THE SAME WAY, and this reaper's scope stopped one process type
   short of the runner's. ~20 self-serving audits spawn `python3 -m http.server`
   on a FIXED port with `stdio: 'ignore'`, and they do kill it on a normal exit,
   so the leak is the same SIGKILL path the browsers have. Measured 2026-08-11
   02:5x: NINE stranded servers holding 8123/8134/8136/8165/8173/8177/8219/8281/
   8321, ages 3 hours to 2 DAYS, all ppid 1.
   Consequence today is mild, not nil: a stranded server holds the port, the next
   run's `http.server` fails to bind, and because stdio is ignored that failure is
   SILENT. The audit then talks to whatever already holds the port. In this house
   every session shares one checkout and http.server reads from disk per request,
   so it serves the same bytes and the run stays honest. It stops being honest the
   day a second checkout exists, which is precisely the hazard release-gate.mjs's
   own header was written about. Reaping them is the cheap half; a bind check in
   the audits is the real fix and belongs to whoever owns that plumbing.
   SCOPED THREE WAYS, and the third was found by testing the reaper against
   itself. Port: the audit servers all sit in 8100-8399, so a bare 'http.server'
   match is refused and a server Tom started himself on 9000 survives (he closed
   the terminal, so it is ppid 1 too and looks identical otherwise). Anchor: the
   first version matched the string ANYWHERE in the command line, so it flagged
   the `node -e` process I was testing with, whose SOURCE merely contained
   "http.server 8298". A reaper that kills any process quoting its own marker is
   worse than no reaper, so the match must start at the executable and be a real
   `python -m http.server`. Parent: ppid 1, as for the browsers. */
/* WHAT THIS MUST NEVER REAP: a gate PARENT. Reggie spotted an idle
   `node tests/release-gate.mjs` (pid 3346) holding no children and almost no CPU
   for 30 minutes and asked whether the reaper should cover it. It should not, and
   the reason is the line this file is built on. Browsers and http.servers are LEAF
   resources: their owner is provably gone, they can only hold memory and ports,
   and killing one aborts nothing. A gate parent is an ORCHESTRATOR, and ppid 1
   does not mean it is dead: a gate launched from a shell that has since closed is
   reparented to launchd while still perfectly alive, and between suites it looks
   exactly like the idle one, no children and no CPU. Reaping by that signature
   would SIGKILL another session's live run mid-gate, which is the precise thing
   the kill-by-PID-only rule exists to prevent. A stranded gate parent is a report,
   never a kill, and the operator decides. (3346 was gone by the time I looked and
   I could not prove whose it was, so nothing was killed then either.) */
const MARKERS = ['Chrome for Testing', 'chrome-headless-shell'];
const SERVER = /^\S*python[\d.]*\s+-m\s+http\.server\s+8[123]\d\d\b/;
const ps = execFileSync('ps', ['-eo', 'pid=,ppid=,command=']).toString().split('\n');
const orphans = [];
for (const line of ps) {
  const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
  if (!m) continue;
  const [, pid, ppid, cmd] = m;
  if (ppid !== '1') continue;                       // owner still alive: not ours to touch
  if (SERVER.test(cmd)) { orphans.push({ pid: Number(pid), cmd: cmd.slice(0, 80) }); continue; }
  if (!MARKERS.some(k => cmd.includes(k))) continue;
  if (/--type=/.test(cmd) === false && !/Chrome for Testing|chrome-headless-shell/.test(cmd)) continue;
  orphans.push({ pid: Number(pid), cmd: cmd.slice(0, 80) });
}

if (!orphans.length) { console.log('no orphaned test browsers or servers'); process.exit(0); }
console.log(`${orphans.length} orphaned test process(es) (ppid 1):`);
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
