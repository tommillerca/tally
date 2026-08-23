/* EVERY THING TOM ASKED FOR HAS A STATUS, AND THE OPEN ONES ARE PRINTED. 2026-08-23.
 *
 * He asked: "what is your plan to make sure that you never again forget and miss
 * my feedback because this keeps happening?" A rule was the wrong answer. He had
 * already been given one, in the shape of a docs convention, and it had already
 * failed: 18 items were captured verbatim and planned in 280 lines, on a branch
 * that was never merged, and a later session looked at main, found nothing, and
 * rewrote a worse plan from scratch. Six items that had already SHIPPED were
 * re-planned as open in the same pass.
 *
 * So this is a lint. Rules get forgotten; a red gate does not.
 *
 * WHAT IT ENFORCES, and each row exists because that exact thing went wrong:
 *   STATUS   every numbered item in every docs/FEEDBACK-*.md carries one of
 *            OPEN / SHIPPED / DROPPED. Without it the next reader has to
 *            re-derive what is done, which is how shipped work got re-planned.
 *   PLAN     a batch with any OPEN item has a plan file beside it. A list nobody
 *            planned is a list nobody will finish.
 *   VISIBLE  the open items are PRINTED on every run. This is the whole point:
 *            not a pass/fail, a standing reminder that appears in front of
 *            whoever runs the gate, so "I did not know it was outstanding"
 *            stops being possible.
 *
 * DELIBERATELY NOT ENFORCED: whether an item is DONE. A lint cannot know that,
 * and a lint that guesses would train people to mark things SHIPPED to silence
 * it. It enforces only that somebody has SAID which it is.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, '..', 'docs');
const fails = [];
const ok = (n, pass, d = '') => { console.log(`${pass ? 'ok  ' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!pass) fails.push(n); };

const files = readdirSync(docs).filter(f => /^FEEDBACK-.*\.md$/.test(f)).sort();

/* SETUP, because a scan that finds no batches passes every row below for free,
   which is the exact shape of the failure this file is about. */
ok('SETUP feedback batches were found to grade', files.length >= 1, `${files.length} batch file(s)`);

const STATUS = /\b(OPEN|SHIPPED|DROPPED)\b/;
const batches = [];
for (const f of files) {
  const lines = readFileSync(join(docs, f), 'utf8').split('\n');
  const items = [];
  let cur = null;
  for (const l of lines) {
    /* TWO SHAPES, because the batches use two and a parser that knows one is
       blind to the other. v424 is a numbered list; v421 and v423 are
       "## 3. The Herb patch is still the old art  [OPEN, asked FIVE times]".
       The first version of this lint read only the numbered form, so two whole
       batches graded clean by being invisible to it, which is the same failure
       this file exists to stop, one level down. */
    const num = l.match(/^\s{0,3}(\d+)\.\s+(.*)$/);
    const head = l.match(/^#{2,3}\s+(\d+)\.\s+(.*)$/);
    const m = head || num;
    if (m) { cur = { n: +m[1], text: m[2], body: m[2] }; items.push(cur); continue; }
    /* ANY heading closes the current item. Without this, a section heading
       between two items is swallowed into the one above it, and v421's
       "# WHAT IS ALSO STILL OPEN FROM BEFORE" made item 9 (SHIPPED) print as
       outstanding. An item's status must come from the item, never from the
       prose that happens to follow it. */
    if (/^#{1,6}\s/.test(l)) { cur = null; continue; }
    if (cur && l.trim() && !/^\s{0,3}\d+\./.test(l)) cur.body += ' ' + l.trim();
  }
  batches.push({ f, items });
}

const unstatused = [];
for (const b of batches)
  for (const it of b.items)
    if (!STATUS.test(it.body)) unstatused.push(`${b.f}:${it.n}`);

/* An item's status is its FIRST status marker. Testing /OPEN/ against the whole
   accumulated body lets a later mention of some other item's state flip this
   one, which is exactly how a SHIPPED item got printed as outstanding. */
const statusOf = it => (STATUS.exec(it.body) || [])[1] || null;

ok('STATUS every captured item says OPEN, SHIPPED or DROPPED',
  unstatused.length === 0,
  unstatused.length
    ? `${unstatused.length} with no status: ${unstatused.slice(0, 6).join(', ')}${unstatused.length > 6 ? ' ...' : ''}`
    : `${batches.reduce((s, b) => s + b.items.length, 0)} items across ${batches.length} batch(es)`);

/* SEALED exists because the bug it catches was SILENT. The first parser let a
   section heading ("# WHAT IS ALSO STILL OPEN FROM BEFORE") be swallowed into
   the item above it, so a SHIPPED item printed in the standing reminder as
   outstanding, and every row still exited 0. A reminder that quietly lies about
   what is outstanding is worse than no reminder, and nothing here could see it.

   It asserts the PARSER's own invariant rather than the prose's: an item's body
   is the item, so no heading text may appear inside one. Stated this way it goes
   red on the parser bug and stays quiet on healthy prose. The earlier attempt
   ("one item, one distinct status") was wrong and went red on v424 #2, whose
   status line legitimately reads OPEN with some parts SHIPPED in #99. */
const bled = [];
for (const b of batches) {
  const headings = readFileSync(join(docs, b.f), 'utf8').split('\n')
    .filter(l => /^#{1,6}\s/.test(l) && !/^#{2,3}\s+\d+\./.test(l))
    .map(l => l.replace(/^#{1,6}\s+/, '').trim())
    .filter(h => h.length > 8);
  for (const it of b.items)
    for (const h of headings)
      if (it.body.includes(h)) { bled.push(`${b.f}:${it.n} swallowed "${h.slice(0, 40)}"`); break; }
}
ok('SEALED no item body swallowed a section heading',
  bled.length === 0,
  bled.length ? `${bled.length}: ${bled.slice(0, 3).join(', ')}` : `${batches.reduce((s2, b) => s2 + b.items.length, 0)} item bodies sealed`);

const planless = [];
for (const b of batches) {
  const open = b.items.filter(it => statusOf(it) === 'OPEN');
  if (!open.length) continue;
  const stem = b.f.replace(/^FEEDBACK-/, '').replace(/\.md$/, '');
  /* EITHER its own plan file OR an explicit pointer to the one that covers it.
     Demanding a PLAN-<batch>.md per batch would produce stub files whose only
     content is "see the other plan", and a stub satisfies a lint while helping
     nobody. Older batches get folded into the current plan on purpose. */
  const raw = readFileSync(join(docs, b.f), 'utf8');
  const pointer = /planned in\s+(?:docs\/)?PLAN-[\w.-]+\.md/i.exec(raw);
  const named = pointer && readdirSync(docs).includes(pointer[0].replace(/.*?(PLAN-)/i, '$1'));
  const hasPlan = named || readdirSync(docs).some(x => /^PLAN-/.test(x) && x.includes(stem.slice(0, 10)));
  if (!hasPlan) planless.push(b.f);
}
ok('PLAN every batch with open items has a plan beside it',
  planless.length === 0,
  planless.length ? `no PLAN-* for: ${planless.join(', ')}` : 'every open batch is planned');

/* THE STANDING REMINDER. Not a verdict: a list, printed every run. */
const open = batches.flatMap(b => b.items.filter(it => statusOf(it) === 'OPEN').map(it => ({ f: b.f, ...it })));
if (open.length) {
  console.log(`\n    STILL OPEN FROM TOM (${open.length}):`);
  for (const it of open) console.log(`      ${it.f.replace(/^FEEDBACK-/, '').replace(/\.md$/, '')} #${it.n}  ${it.text.replace(/\s+/g, ' ').slice(0, 88)}`);
} else if (batches.length) {
  console.log('\n    nothing open from Tom.');
}

console.log(`\nfeedback-status: ${fails.length ? fails.length + ' FAILED' : 'clean'}`);
process.exit(fails.length ? 1 : 0);
