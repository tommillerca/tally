/* no-debug-markers-lint: nothing marked "do not commit" ships to players.
 *
 * WHY (2026-09-06): v475 shipped index.html with a TEMP DIAGNOSTICS OVERLAY, a
 * fixed <pre id="dbg"> at z-index 999999 that mirrored every console.error in
 * green text over the top 40% of every player's screen. It was pasted in for an
 * on-device iOS session and carried into a squash merge; nothing on the gate
 * read the marker its own comment wore. This lint does: any shipped file that
 * says "do not commit", carries a TEMP DIAGNOSTICS block or an id="dbg" sink
 * fails, naming the line.
 *
 * Proven red on origin/main at v475 (6eb45e81): index.html:31 TEMP DIAGNOSTICS
 * OVERLAY, do not commit; index.html:33 id="dbg". Exit 1. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARK = /do not commit|TEMP DIAGNOSTICS|id="dbg"/i;
const files = ['index.html', 'sw.js', 'app.css',
  ...readdirSync(join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f),
  ...readdirSync(join(ROOT, 'data')).filter(f => f.endsWith('.js')).map(f => 'data/' + f)];
const hits = [];
for (const f of files) {
  readFileSync(join(ROOT, f), 'utf8').split('\n').forEach((line, i) => {
    if (MARK.test(line)) hits.push(`${f}:${i + 1}  ${line.trim().slice(0, 100)}`);
  });
}
console.log(`ok    REACH  scanned ${files.length} shipped file(s)`);
if (files.length < 10) { console.log('FAIL  REACH  the scan reached fewer than 10 files'); process.exit(1); }
if (hits.length) {
  console.log(`FAIL  MARKER ${hits.length} debug marker(s) in shipped files:\n     ${hits.join('\n     ')}`);
  process.exit(1);
}
console.log('PASS  MARKER no "do not commit", TEMP DIAGNOSTICS or id="dbg" in any shipped file');
