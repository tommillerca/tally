/* NOTHING INTERRUPTS A COLD LAUNCH.
 *
 * Tom, 2026-08-21: "Fix the pop ups that's a night mare." The answer that time
 * was a BUDGET, claimBootSheet, one takeover per app open, and this file graded
 * that budget: it counted claim sites in the source and went green.
 *
 * Tom, 2026-08-25, four days later, on a booted iPhone 17 Pro: "i see in the
 * simulator you have popups showing i told you to remove all those from the
 * game?" Six interruptions before Today, in order: the recovery-code sheet, the
 * TestFlight thank-you, the iOS notification dialog, the Day One survey, the
 * 63-cosmetics post, and a toast.
 *
 * SO THE OLD GUARD GRADED THE WRONG THING. "At most one" is a number nobody
 * asked for, and a source scan for `claimBootSheet(` cannot see a sheet that
 * never claims (the recovery prompt, the survey and the notification ask were
 * all deliberately not claimants, all three fired, and this file was green
 * through every one of them). The number is now ZERO, and it is graded by
 * launching the app and looking.
 *
 * WHY NOBODY EVER SAW IT, and it is the whole trick of this file: every one of
 * these suppresses itself under navigator.webdriver, and puppeteer IS
 * navigator.webdriver, so no audit in this repo had ever rendered one. This one
 * MASKS the flag (Object.defineProperty before any app script runs) so the app
 * behaves exactly as it does on Tom's phone. MASKED is a graded row for that
 * reason: with the flag visible, every gate returns early and COLD passes on
 * nothing.
 *
 * WHAT IS ASSERTED, and which direction is failure:
 *   MASKED   the page really reports navigator.webdriver === false. Without it
 *            COLD is vacuous.
 *   COLD     across 40 seconds of an untouched launch, ZERO sheets, veils or
 *            teaser posts appear. Failure is UP: one is the defect.
 *            The daily wheel is excluded and dismissed each poll, the same
 *            exclusion this file always carried: it is the day's free reward,
 *            there is no other button for it, and every gate behind it waits on
 *            it, so leaving it up would make COLD vacuous a second way.
 *   CONTROL  the detector can see an interstitial at all, proven by opening a
 *            REAL one through a REAL control (Settings -> What's New) on the
 *            same masked page. Every zero above passes on a broken detector.
 *   QUEUE    statically, boot() schedules nothing outside the allowlist, and the
 *            allowlist itself may not carry an entry that is no longer
 *            scheduled. This is the row that catches the NEXT announcement
 *            before it ships, since COLD can only see one whose kv gate happens
 *            to be open on the demo profile.
 *
 * MEASURED, 2026-08-25, this same file against both trees:
 *   origin/main (23de102b)   COLD 2  (the recovery sheet, then What's New)
 *   fix/remove-interstitials COLD 0
 * PROVEN RED by restoring one call: see the report on the PR.
 *
 * Usage: node tests/first-session-audit.mjs [baseUrl]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree, maskWebdriver } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;

let fails = 0;
const ok = (n, pass, d = '') => { if (!pass) fails++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

/* ---------------- QUEUE: what boot() is allowed to schedule ---------------- */
const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
/* Read the tail of boot() rather than restating it, so a new call added there is
   picked up without editing this file. The anchor is the analytics line, which is
   the last statement before the scheduling block. */
const bootTail = (src.match(/initAnalytics\(APP_BUILD\);[\s\S]*?\n\}\n/) || [''])[0];
/* Every remaining launch-time scheduler, with the reason it is allowed. Anything
   else that matches the shape fails, by name. */
const ALLOWED = {
  maybeShowDailyWheel: 'the day\'s free spin: a reward, and the only route to it',
  maybeShowRenameNotice: 'server-flagged, one device, clears itself, no other route',
  maybeNudgeRecovery: 'a toast, not a sheet: points at the Settings row',
};
const scheduled = [...new Set([...bootTail.matchAll(/\b(maybe(?:Show|Prompt|Request|Nudge)\w+)\(/g)].map(m => m[1]))];
const strays = scheduled.filter(n => !(n in ALLOWED));
ok('CONTROL the boot tail was found and it still schedules something (an empty sample is a failure)',
  bootTail.length > 0 && scheduled.length >= 3, `${scheduled.length} scheduled: ${scheduled.join(', ') || 'NONE'}`);
ok('QUEUE boot() schedules nothing outside the allowlist',
  strays.length === 0,
  strays.length ? `UNDECLARED: ${strays.join(', ')} (add it to ALLOWED with a reason, or take it off the launch path)`
    : scheduled.join(', '));
/* A ratchet, not a list: an entry that outlives its call site turns the
   allowlist into a place where a future exemption can hide unnoticed. Same
   shape as guard-hygiene-lint's stale-inventory row. */
const staleAllows = Object.keys(ALLOWED).filter(n => !scheduled.includes(n));
ok('QUEUE the allowlist has no stale entries (took one off the launch path? drop its line)',
  staleAllows.length === 0,
  staleAllows.length ? `no longer scheduled: ${staleAllows.join(', ')}` : `${Object.keys(ALLOWED).length} allowed, all live`);

/* ---------------- COLD: launch it and look ---------------- */
const { browser, page } = await boot(base);
/* Before any app script on the next load. Setting it after boot() would be too
   late: every gate has already read the flag and returned. */
await maskWebdriver(page);
await page.reload({ waitUntil: 'networkidle2' });

const masked = await page.evaluate(() => navigator.webdriver);
ok('MASKED navigator.webdriver reads false, so the launch gates do not self-suppress',
  masked === false, `navigator.webdriver = ${masked}`);

const POLLS = 40;               // seconds. The old queue's last gate fired at 4.6s
const seen = [];                // distinct interstitials, in the order they arrived
for (let i = 0; i < POLLS; i++) {
  const r = await page.evaluate(() => ({
    /* A sheet, a veil and the teaser post are the app's three takeover shapes.
       Identified by what they ARE, not by any one card's class, so an
       announcement written next year is caught without editing this file. */
    sheets: [...document.querySelectorAll('#sheets .sheet')]
      .map(s => `sheet ${(s.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48)}`),
    veils: [...document.querySelectorAll('.drop-veil')]
      .map(v => `veil ${(v.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48)}`),
    tz: document.querySelector('.tz-pop') ? ['teaser post'] : [],
    dw: !!document.querySelector('.dw'),
  }));
  for (const it of [...r.sheets, ...r.veils, ...r.tz]) if (!seen.includes(it)) seen.push(it);
  // dismiss the wheel (excluded, see the header) and anything else, the way a
  // player would, so a card sitting there cannot hide the one queued behind it
  if (r.dw) await page.evaluate(() => document.querySelector('.dw-close, .dw button')?.click());
  await page.evaluate(() => {
    document.querySelector('.drop-veil')?.remove();
    document.querySelector('#sheets .sheet .sheet-close')?.click();
  });
  await sleep(1000);
}
ok(`COLD ${POLLS}s of an untouched launch raises no sheet, veil or post`,
  seen.length === 0,
  seen.length ? `${seen.length} INTERRUPTION(S): ${seen.join(' | ')}` : '0 interruptions');

/* ---------------- CONTROL: the detector can see one ---------------- */
/* A REAL card through a REAL control on this same masked page, because every row
   above asserts a zero and a zero is what a blind detector reports. Settings ->
   What's New, which is one of the routes this change deliberately kept. */
await page.evaluate(() => { location.hash = '#/settings'; });
await sleep(2500);
await page.evaluate(() => document.querySelector('#whatsNewBtn')?.click());
await sleep(1500);
const control = await page.evaluate(() =>
  [...document.querySelectorAll('#sheets .sheet')]
    .map(s => (s.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)));
ok('CONTROL the same detector sees a real sheet opened by a real control',
  control.length > 0, control[0] || 'Settings -> What\'s New opened nothing: the detector is blind, or the route is broken');

await browser.close();
console.log(`\n${fails ? `${fails} FAILED` : 'all green'}, 6 checks`);
process.exit(fails ? 1 : 0);
