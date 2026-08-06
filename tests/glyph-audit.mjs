/* Glyph audit: no text characters standing in for icons.
 *
 * The app used to draw its UI with 141 dingbats and 147 emoji sitting next to
 * Cam's hand-inked art. Bone Dust, a CORE CURRENCY, was a ◆ in 24 places. Ticks,
 * stars, close crosses, trend arrows and AP pips were all typography.
 *
 * THE RULE (Tom's call 2026-08-07): controls and data get drawn icons. Emoji
 * survive only as flavour inside prose and speech lines, where they read as the
 * Bonehead's voice.
 *
 * So this fails on a control/data glyph appearing in a position that BUILDS UI:
 * inside a template literal that also contains markup. Prose strings and code
 * comments are left alone, which is the whole point of the distinction.
 *
 * PROVE-RED (confirmed 2026-08-07): put `<span class="dust-ico">◆</span>` back
 * anywhere in js/app.js and this exits 1 naming the file and line.
 *
 * Usage: node tests/glyph-audit.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../js');

/* Characters that are ALWAYS standing in for an icon, never prose. Deliberately
   excludes emoji (allowed as voice; telling voice from a data icon needs a human,
   not a regex) AND arrows: "Shortcuts app → + → name it" is punctuation between
   two words, and flagging it made the audit argue with correct copy. */
const CONTROL_GLYPHS = /[◆✓✔★☆✕✖✗●○▲▼◀▶⇧⇩⌀⏱⚡⚔☠]/;

/* a line is BUILDING UI if it carries markup or is clearly an element's content */
const MARKUP = /<\/?[a-z][a-z0-9-]*[\s>]|class="|innerHTML|textContent\s*=/i;

const problems = [];
let scanned = 0, uiLines = 0;

for (const f of readdirSync(JS).filter(n => n.endsWith('.js'))) {
  const lines = readFileSync(path.join(JS, f), 'utf8').split('\n');
  scanned++;
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;  // comments
    if (!MARKUP.test(line)) return;                                            // not building UI
    uiLines++;
    const hit = line.match(CONTROL_GLYPHS);
    if (!hit) return;
    // a glyph inside an esc()'d value is player data, not our markup
    problems.push(`${f}:${i + 1}  [${hit[0]}]  ${t.slice(0, 96)}`);
  });
}

// An empty sample set is a failure: zero UI lines means the heuristic broke and
// this audit is checking nothing at all.
if (!uiLines) {
  console.log('FAIL: matched 0 UI-building lines across ' + scanned + ' files; the check did not run');
  process.exit(1);
}

console.log(`glyph-audit: ${scanned} files, ${uiLines} UI-building lines examined`);
if (problems.length) {
  console.log(`\n${problems.length} control/data glyph(s) still standing in for an icon:\n`);
  for (const p of problems) console.log('  FAIL  ' + p);
  console.log('\nUse a drawn icon (ICONS.* / bhIcon) in control and data positions.');
  process.exit(1);
}
console.log('glyph-audit clean: no text characters used as control or data icons');
