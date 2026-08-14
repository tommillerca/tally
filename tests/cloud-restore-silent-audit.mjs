/* A FAILED CLOUD RESTORE MUST SPEAK, AND MUST BE RETRIED.
 *
 * Reg, 2026-08-13: "A failed cloud restore is now silent. social.js:491 catches
 * the rejection into {restored:false, reason} and bootSync is called with
 * .catch(() => null), so nothing reaches the screen. The file-import path gets
 * this right: 'Import failed: your old data is unchanged'."
 *
 * Measuring it turned up a worse defect underneath the silence. bootSync ran
 * `await kvSet('bootRestored', true)` immediately after pullBackup, WHATEVER the
 * outcome. So a transient 500, or a dropped connection, on the one boot where the
 * restore was supposed to happen would permanently forfeit it: the flag reads
 * "already restored" on every later boot, and the player keeps an empty save with
 * a perfectly good backup sitting on the server, forever, in silence.
 *
 * That is the real finding. The missing toast is the symptom; the burned one-shot
 * is the data loss.
 *
 * These are unit checks against the real modules rather than a browser run,
 * because the condition is a state transition in bootSync and a branch in boot(),
 * and both are far easier to drive honestly here than through a UI that would
 * need a failing server to exist.
 *
 * PROVE-RED: restore `await kvSet('bootRestored', true)` unconditionally in
 * bootSync and RETRY fails. Remove the else-if in js/app.js boot() and SPEAKS
 * fails.
 */
import { readFileSync } from 'node:fs';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const social = readFileSync(new URL('../js/social.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

/* ---- the one-shot is not burned on a failure ---- */
const bootSync = social.slice(social.indexOf('export async function bootSync'));
const body = bootSync.slice(0, bootSync.indexOf('\n}'));
const setLine = body.split('\n').find(l => l.includes("kvSet('bootRestored'"));

ok('SAMPLE bootSync still sets the bootRestored flag somewhere (an absent flag would restore on EVERY boot)',
  !!setLine, setLine ? setLine.trim() : 'NOT FOUND, this audit is measuring nothing');

ok('RETRY the restore flag is only set on success or a definitive no-backup, never on a failure',
  !!setLine && /res\.restored/.test(setLine) && /'none'/.test(setLine) && /'empty'/.test(setLine),
  setLine ? setLine.trim() : 'no line to inspect');

/* the specific regression: an unconditional set. This is what shipped. */
ok('RETRY the flag is NOT set unconditionally (the shipped bug)',
  !/\n\s*await kvSet\('bootRestored', true\);/.test(body),
  'an unguarded `await kvSet(...)` on its own line is the forfeit bug');

/* ---- the player is told ---- */
const bootFn = app.slice(app.indexOf('social.bootSync()'));
const branch = bootFn.slice(0, bootFn.indexOf('if (!S.settings)'));

ok('SAMPLE the success toast is still there (positive control: if this vanishes the parse is wrong)',
  /restored from your cloud backup/.test(branch), 'success branch found');

ok('SPEAKS a failed cloud restore reaches the player',
  /else if \(cloudRestore/.test(branch) && /toast\(/.test(branch.slice(branch.indexOf('else if'))),
  'an else-if on cloudRestore that toasts');

ok('QUIET the normal no-backup paths stay silent (or every returning player is alarmed)',
  /'none'/.test(branch) && /'empty'/.test(branch) && /'already'/.test(branch),
  "none / empty / already excluded from the failure branch");

ok('HONEST the failure wording does not claim data was lost',
  !/lost your|data (was )?lost|deleted/i.test(branch),
  'wording reassures rather than alarms');

console.log(`\n${fails.length ? `FAILED: ${fails.join(', ')}` : 'all green'}`);
process.exit(fails.length ? 1 : 0);
