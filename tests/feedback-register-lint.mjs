/* THE OPEN-FEEDBACK REGISTER EXISTS, AND ITS CLOSED ROWS CARRY EVIDENCE.
 *
 * Tom, 2026-09-11: "it's your jobs to keep track and youve forgotten shit like
 * three times now like literally just write it down somewhere and reference it
 * bro it isnt hard. then when something is done cross it off? you used to use a
 * roadmap what happened to that i feel like youve regressed like crazy this
 * week."
 *
 * He was right, and ROADMAP.md's own header already said "every app note Tom
 * sends lands here FIRST". The system existed and was abandoned mid-week in
 * favour of ad-hoc docs and memory, which is how two requests were lost:
 *
 *   - "In back CENTRE chests lose the text..." was written down as "crates lose
 *     the text...". The word centre never made it to paper, so it never made it
 *     to a build.
 *   - "STOP MAKING BONEHEAD FLOAT AND MOVE SO MUCH" was actioned as the motion
 *     half only.
 *
 * A process that depends on remembering to follow it is the thing that just
 * failed, so this lint makes the gate depend on it instead.
 *
 * ROWS
 *   SECTION   ROADMAP.md still has the OPEN FEEDBACK section. Deleting the
 *             register is the exact regression this file exists to stop.
 *   CONTROL   it parses at least one item row. This is the positive control:
 *             every other row reads the parsed table, so a register that exists
 *             but parses to nothing would let them pass on a sample of zero.
 *             An empty sample is a failure (CLAUDE.md).
 *   VERBATIM  every open row quotes Tom rather than paraphrasing him. The
 *             centre-chests miss was a paraphrase, so paraphrase is the defect.
 *             A row whose quote field carries no quotation marks and is not an
 *             explicit non-quote marker fails.
 *   EVIDENCE  every row in the closed table names where it shipped AND what
 *             proves it. "Done" with an empty evidence cell is the claim this
 *             programme keeps making and then having to retract.
 *
 * PROVEN RED, 2026-09-11, one mutation per throwaway copy:
 *   SECTION   delete the heading            -> FAIL
 *   CONTROL   delete the item rows          -> FAIL
 *   EVIDENCE  blank one closed row's proof  -> FAIL
 *
 * Run: node tests/feedback-register-lint.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) fails++;
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const road = readFileSync(path.join(ROOT, 'ROADMAP.md'), 'utf8');
const HEAD = '## 🔴 OPEN FEEDBACK';
ok('SECTION ROADMAP.md still carries the open-feedback register', road.includes(HEAD),
  road.includes(HEAD) ? '' : `no "${HEAD}" heading in ROADMAP.md`);

const section = road.includes(HEAD) ? road.slice(road.indexOf(HEAD)).split('\n## ').slice(0, 1)[0] : '';
/* The section holds two tables: open items (| F1 | ...) and a closed table. */
const openRows = [...section.matchAll(/^\| (F\d+) \| ([^|]*)\| ([^|]*)\| ([^|]*)\| ([^|]*)\|/gm)]
  .map(m => ({ id: m[1], area: m[2].trim(), quote: m[3].trim(), status: m[4].trim(), evidence: m[5].trim() }));
/* This is the POSITIVE CONTROL, named so guard-hygiene-lint can see it: every
   row below reads the parsed table, so a register that is present but parses to
   nothing would let VERBATIM and EVIDENCE pass vacuously on a sample of zero.
   An empty sample is a failure (CLAUDE.md). */
ok('CONTROL the register parsed at least one open item', openRows.length > 0, `${openRows.length} open item(s)`);

/* A row either quotes Tom, or says plainly that it is not his words. Both are
   honest; a silent paraphrase is what lost the centring request. */
const NONQUOTE = /^(—|-|n\/a|internal|derived|measured|from )/i;
const unquoted = openRows.filter(r => !/["“”]/.test(r.quote) && !NONQUOTE.test(r.quote) && !/`/.test(r.quote));
ok('VERBATIM every open row quotes Tom rather than paraphrasing', unquoted.length === 0,
  unquoted.length ? unquoted.map(r => `${r.id}: ${r.quote.slice(0, 60)}`).join(' | ') : `${openRows.length} rows checked`);

const closedStart = section.indexOf('### Closed this week');
const closed = closedStart >= 0 ? section.slice(closedStart) : '';
const closedRows = [...closed.matchAll(/^\| ([^|]+)\| ([^|]+)\| ([^|]+)\| ([^|]+)\|/gm)]
  .map(m => ({ area: m[1].trim(), item: m[2].trim(), shipped: m[3].trim(), evidence: m[4].trim() }))
  .filter(r => !/^-+$/.test(r.area) && r.area !== 'Area');
const unevidenced = closedRows.filter(r => !r.evidence || /^[-—\s]*$/.test(r.evidence));
ok('EVIDENCE every closed row names what proves it', closedRows.length > 0 && unevidenced.length === 0,
  closedRows.length === 0 ? 'no closed rows found (the table is the sample; an empty one cannot pass)'
    : unevidenced.length ? unevidenced.map(r => r.item.slice(0, 40)).join(' | ')
      : `${closedRows.length} closed rows, all evidenced`);

console.log(`\n${fails ? 'FAILED' : 'OK'}  feedback-register-lint`);
process.exit(fails ? 1 : 0);
