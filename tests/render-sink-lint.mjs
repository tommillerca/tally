/* A RAW SINK HELD UP BY CALLER DISCIPLINE. 2026-09-01.
 *
 * The escaping in this codebase is genuinely thorough. packCardHtml esc()s the
 * card name, the kind, the level, the talent and every stat chip. openSheet's
 * callers esc() a friend's name, their nickname, their level name. The gap was
 * never carelessness, it was ARRANGEMENT: two slots stayed raw HTML on purpose,
 * for callers that legitimately pass markup, and then a caller started feeding
 * one of them a sentence the SERVER wrote around another player's typed name.
 *
 *   packCardHtml  `<div class="pc-stats">${c.stats}</div>`      (js/app.js)
 *   openPackReveal `<span class="pack-coins">${footerNote}</span>`
 *
 * Nothing executed in a victim's client, because the one caller that could feed
 * it wrote `stats: esc(p.note)`. That is the entire safety property: one caller
 * remembering. Proven executable on 2026-09-01 against 996f28b9 by feeding
 * `<img src=x onerror=...>` through the real window.__packReveal render: the
 * flag was set and TWO live img[onerror] nodes were in the DOM, one from each
 * slot. The fix is at the sinks (esc() there, `statsHtml` by name for the two
 * app-controlled markup callers), and this file is what stops the arrangement
 * coming back.
 *
 * WHY A REGISTER OF FIELD NAMES AND NOT "FLAG RAW ${...}".
 * MEASURED FIRST, because a lint that cries wolf gets deleted and takes the real
 * rows with it (guard-hygiene-lint section 3 says so, and it is right).
 * js/app.js has 570 raw `${obj.prop}` interpolations inside markup and almost
 * every one is a number, a pixel width, a colour, a catalog id or a count. A
 * blanket rule would report 570 findings on healthy code on day one and be
 * switched off by the end of the week.
 *
 * So the rule is narrow and names the thing that actually matters: the fields
 * that can only ever hold text ANOTHER PLAYER supplied. Measured against
 * 996f28b9 and against the fix, this register finds exactly the two raw sinks on
 * the pre-fix tree and exactly nothing on the fixed one. Two findings, no noise,
 * and a new free-form slot has to escape or be named *Html to land.
 *
 * WHAT IT DELIBERATELY DOES NOT CATCH, said plainly rather than oversold:
 *   - a bare `${note}`. js/app.js:5412 builds a local `const note = <span>...`
 *     out of Apple Health numbers, which is app-controlled markup and correct.
 *     A bare common noun cannot be told from a local variable by a static rule,
 *     so the register only matches a DOTTED read (`p.note`, `c.stats`) plus the
 *     handful of bare names that exist nowhere else (`footerNote`, `tookFrom`).
 *   - assignment, as opposed to interpolation. `stats: p.note` is not a finding
 *     here and should not be: after the fix that is the CORRECT way to write it,
 *     because the sink escapes. This lint guards the sink, not the caller. That
 *     is the whole point of moving the rule to the sink.
 *   - anything outside a line containing a `<`. A raw read into a toast or a
 *     textContent is not a render sink and is not this file's business.
 *   - whether esc() is the RIGHT escape for the context. It is a text escape and
 *     every slot here is a text slot. An attribute or a URL slot would need its
 *     own rule, and there is not one in these files today.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fails = [];
const ok = (n, pass, d = '') => { console.log(`${pass ? 'ok  ' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!pass) fails.push(n); };

/* THE WHOLE RENDER LAYER, enumerated rather than listed. js/app.js holds 163 of
   the repo's HTML sinks and nine other modules hold the rest (measured
   2026-09-01), and js/paddock-cards.js among them draws a FRIEND's paddock, so a
   hand-written list here would have been wrong on the day it was written. Reading
   the directory means a new module is covered the day it lands rather than the
   day somebody remembers this file exists. */
const FILES = readdirSync(join(root, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`);

/* EVERY FIELD NAME THAT CAN CARRY ANOTHER PLAYER'S TEXT, read off what
   server/src/index.js actually hands a client on 2026-09-01:
     note, from, cheerFrom  the grants channel (gift, cheer, spire-lost, admin)
     tookFrom               PUT /spires/{id}/claim's response
     ownerName              GET /spires, the pennant on a rival's tower
     levelName              the peer snapshot, via /friends and /leaderboard
     alias, handle, friendCode   the crew row
     stats                  the pack card's free-form slot, and the one the
                            spire-lost inbox card fed a server sentence into
   A DOTTED read only (`p.note`), never a bare one: see the header on why a bare
   `${note}` is a local markup builder in this codebase and not a finding. */
const CROSS_PLAYER = ['note', 'from', 'cheerFrom', 'tookFrom', 'ownerName', 'levelName',
  'alias', 'handle', 'friendCode', 'stats'];
/* The same list, restricted to the names that exist nowhere else in these files,
   so a bare identifier can be matched without the false positive above. Measured
   on 2026-09-01: each of these five appears only as a peer-supplied value, and
   `footerNote` is openPackReveal's own parameter, which is the second raw sink.
   `note` and `from` are deliberately absent: both are common enough as local
   variable names here that a bare match would cry wolf (js/app.js:5412). */
const CROSS_PLAYER_BARE = ['footerNote', 'cheerFrom', 'tookFrom', 'ownerName', 'levelName'];

const dotted = new RegExp(`^(?:[A-Za-z_$][\\w$]*(?:\\?\\.|\\.))+(?:${CROSS_PLAYER.join('|')})$`);
const bare = new RegExp(`^(?:${CROSS_PLAYER_BARE.join('|')})$`);
const INTERP = /\$\{([^{}]*)\}/g;

/* `x || 'a default'` is the same read with a fallback, so the tail comes off
   before the test. An expression doing anything more than that (a ternary, a
   call, a concatenation) is out of scope on purpose: it is no longer a bare
   read of a peer's field and guessing at it is how a lint gets noisy. */
const scan = text => {
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (!line.includes('<')) return;          // not a markup line, not a render sink
    let m; INTERP.lastIndex = 0;
    while ((m = INTERP.exec(line))) {
      const raw = m[1].trim();
      if (/\besc\(/.test(raw)) continue;      // already escaped, which is the ask
      const expr = raw.replace(/\s*\|\|\s*('[^']*'|"[^"]*")\s*$/, '');
      if (dotted.test(expr) || bare.test(expr)) out.push({ n: i + 1, expr: raw });
    }
  });
  return out;
};

/* SAMPLE. Every row below is an ABSENCE, so the scan finding no files, or files
   with no interpolation in them at all, would report clean for free. */
let lines = 0, interps = 0;
const sources = new Map();
for (const f of FILES) {
  const text = readFileSync(join(root, f), 'utf8');
  sources.set(f, text);
  lines += text.split('\n').length;
  interps += (text.match(INTERP) || []).length;
}
ok('SAMPLE the render layer was read and it contains interpolated markup',
  sources.size === FILES.length && lines > 10000 && interps > 500,
  `${sources.size} files, ${lines} lines, ${interps} interpolations`);

/* CONTROL. The matcher is run against the two sinks EXACTLY as they read on
   996f28b9, copied out of js/app.js on 2026-09-01 before the fix landed, and it
   must flag both. Without this row a typo in the register, or a regex that
   compiles to something matching nothing, reports a clean tree forever, which is
   the failure guard-hygiene-lint exists for. */
const PRE_FIX = [
  '    + (c.stats ? `<div class="pc-stats">${c.stats}</div>` : \'\')',
  '            ${footerNote ? `<span class="pack-coins">${footerNote}</span>` : \'\'}',
].join('\n');
const control = scan(PRE_FIX);
ok('CONTROL the matcher flags both pre-fix raw sinks when it is shown them',
  control.length === 2,
  control.length === 2 ? control.map(c => c.expr).join(', ')
                       : `flagged ${control.length} of 2: the register or the matcher is looking in the wrong place`);

/* CONTROL, the other direction: an escaped sink and an app-controlled raw
   interpolation must BOTH pass, or the row above is satisfied by a rule so broad
   it would red the whole render layer. The first two lines are the two sinks as
   they read AFTER the 2026-09-01 fix; the third is a representative healthy
   interpolation of the kind js/app.js contains 570 of. */
const CLEAN = [
  '    + (statsBit ? `<div class="pc-stats">${statsBit}</div>` : \'\')',
  '            ${footerNote ? `<span class="pack-coins">${esc(footerNote)}</span>` : \'\'}',
  '  return `<div class="bar" style="width:${stepPct}%">${ICONS.coin(11)} ${r.coins}</div>`;',
].join('\n');
const clean = scan(CLEAN);
ok('CONTROL an escaped sink and an app-controlled raw value are NOT flagged',
  clean.length === 0,
  clean.length ? `false positives: ${clean.map(c => c.expr).join(', ')}` : 'quiet on healthy markup');

/* THE ROW ITSELF. */
const findings = [];
for (const [f, text] of sources) for (const h of scan(text)) findings.push(`${f}:${h.n}  \${${h.expr}}`);
ok('SINK no field that can carry another player\'s text is interpolated raw into markup',
  findings.length === 0,
  findings.length
    ? `${findings.length}:\n      ${findings.join('\n      ')}\n      Escape it at the SINK (esc(...)), or rename the slot *Html if it is markup this app wrote.`
    : `${interps} interpolations scanned, none raw`);

console.log(`\nrender-sink: ${fails.length ? fails.length + ' FAILED' : 'clean'}`);
process.exit(fails.length ? 1 : 0);
