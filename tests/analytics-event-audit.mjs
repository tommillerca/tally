/* DO THE ANALYTICS EVENTS MEAN WHAT THEIR NAMES SAY?
 *
 * Nobody had ever checked. The backend is live (js/social.js PROD_API), the
 * dashboard at server/src/index.js:/stats is what roadmap decisions get read
 * off, and a dashboard that is confidently wrong is worse than no dashboard.
 * One envelope bug had been found (first sessions tagged build 'v68', because
 * the onboarding path passes APP_SOCIAL_V to initAnalytics) but the EVENTS
 * themselves had never been looked at.
 *
 * WHY THIS IS A GUARD AND NOT A LIST. A one-off inventory rots the moment
 * somebody adds an event, and the failure is silent: a wrong row looks exactly
 * like a right one in D1. So this file does three things, and each of them
 * fails loudly.
 *
 *   STATIC   every track()/screen() call site is resolved to the NAMES it can
 *            emit, including the two that are computed at the call site (a
 *            grep for string literals undercounts those), and checked against
 *            EVENTS below. A new name that nobody declared fails. A declared
 *            name whose call site is gone fails too, so the registry cannot
 *            rot into fiction. Same shape as figure-audit's SITES coverage.
 *   LABELS   every openSheet() call site is resolved to the feat_open label it
 *            will actually emit. This is the analytics half of the dead-selector
 *            problem: the label is auto-derived from the sheet's <h2>, so an
 *            unbounded <h2> (a food name, a friend's name) puts one dashboard
 *            row per FOOD in the events table, and an <h2> the regex cannot
 *            read collapses several unrelated features into one row called
 *            'sheet'. Both were measured here before they were fixed.
 *   LIVE     the app is driven with real navigations and real taps under
 *            window.__evProbe, and the rows that ACTUALLY land in the kv queue
 *            are asserted by EXACT COUNT. Exact, never "at least": an
 *            inequality passes on a double-fire, and a double-fire is the
 *            entire class of bug this was written to find. An empty captured
 *            queue is a FAILURE, never a pass.
 *
 * WHAT THE LIVE HALF PINS, and which direction each one fails in:
 *   BOOT        exactly one app_open and one session_start per load. Two would
 *               halve the dashboard's avgSessionMin (pings x 45 / sessions).
 *   NAV         N navigations emit exactly N screen rows, in order. A second
 *               row per navigation inflates every screen in the heatmap.
 *   RE-ROUTE    an in-place re-render of the SAME tab emits nothing. route()
 *               is called by refresh() too, so losing screen()'s dedupe would
 *               file a screen row on every water log.
 *   PAIR LAG    N screen changes emit exactly N-1 screen_time rows within the
 *               window, because the screen you are ON has not closed yet. This
 *               is asserted rather than fixed: it is the structural reason
 *               screen_time can never equal screen, and the last screen of
 *               every session is the one that goes missing.
 *   BACKGROUND  hiding the tab with no navigation emits exactly one extra
 *               screen_time and zero screen rows, so the heatmap's COUNT(*)
 *               column counts backgrounding as a visit. Pinned WITH the bg
 *               flag that now makes it separable.
 *   SHEET PAIR  one open and one close emit exactly one feat_open and exactly
 *               one feat_time, with the same label.
 *   ATTEMPT     feedback_send fires on a send that FAILED, and must say so.
 *   PAYLOAD     no props exceeds the server's non-JSON-aware 300-char clip
 *               (server/src/index.js:932), measured, not eyeballed.
 *   FUNNEL      onboarding Back re-renders a step, and the row must mark it,
 *               or the launch funnel counts views as reaches.
 *
 * PROBE SAFETY. window.__evProbe un-gates track(), screen() and initAnalytics()
 * only. flush(), sendReport() and sendSurvey() keep the RAW BOT gate, so a
 * probed row can never leave the device; PROBE-SEALED below asserts exactly
 * that, because the day somebody "tidies" those three to use muted() is the day
 * this audit starts posting to production.
 *
 * PROVE-RED: see the branch handoff. Every LIVE assertion was proven red by
 * breaking its mapping in a throwaway tree (git archive copy, never cp -a).
 *
 * Run: node tests/analytics-event-audit.mjs [http://127.0.0.1:PORT/]
 * With no URL it serves its own tree, so it is never pointed at production.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const note = (n, d) => console.log(`NOTE  ${n}  ${d}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ======================= source reading helpers ============================
 * Comments are stripped first, and that is not cosmetic: js/app.js contains
 * the line "Every harvest used to openSheet() its own panel", and a scanner
 * that reads comments reports a real call site that does not exist. */
function stripComments(s) {
  let out = '', i = 0;
  const frames = [];
  while (i < s.length) {
    const t = frames[frames.length - 1], c = s[i], n = s[i + 1];
    if (t === 'str' || t === 'tpl') {
      if (c === '\\') { out += c + n; i += 2; continue; }
      if ((t === 'str' && c === frames.q) || (t === 'tpl' && c === '`')) { frames.pop(); out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (c === '`') { frames.push('tpl'); out += c; i++; continue; }
    if (c === "'" || c === '"') { frames.push('str'); frames.q = c; out += c; i++; continue; }
    /* LINE NUMBERS ARE THE DELIVERABLE HERE, so a comment is replaced by its
       own newlines rather than deleted: a scanner that collapses js/app.js's
       very heavy commenting reports every call site ~140 lines early, and a
       finding you cannot open is not a finding. */
    if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') {
      const e = s.indexOf('*/', i); const end = e < 0 ? s.length : e + 2;
      out += ' ' + '\n'.repeat((s.slice(i, end).match(/\n/g) || []).length); i = end; continue;
    }
    out += c; i++;
  }
  return out;
}

/* Read a call's argument list, from its '(' to the matching ')'.
   Frames: code / template / string. A `${` inside a template opens a CODE
   frame that closes on the brace balancing it. The naive version of this
   (pop the template-expression frame on the first '}') runs away the moment
   an interpolation contains an object literal, which js/app.js is full of:
   it read one openSheet call as 217KB long and reported eleven sheets as
   having no <h2> when they plainly do. Measured, then fixed. */
function callArgs(s, open) {
  const frames = [{ t: 'code', depth: 0 }];
  let i = open, out = '';
  while (i < s.length) {
    const f = frames[frames.length - 1], c = s[i], n = s[i + 1];
    if (f.t === 'str') {
      if (c === '\\') { out += c + n; i += 2; continue; }
      if (c === f.q) { frames.pop(); out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (f.t === 'tpl') {
      if (c === '\\') { out += c + n; i += 2; continue; }
      if (c === '`') { frames.pop(); out += c; i++; continue; }
      if (c === '$' && n === '{') { frames.push({ t: 'code', depth: 1 }); out += '${'; i += 2; continue; }
      out += c; i++; continue;
    }
    if (c === '\\') { out += c + n; i += 2; continue; }
    if (c === '`') { frames.push({ t: 'tpl' }); out += c; i++; continue; }
    if (c === "'" || c === '"') { frames.push({ t: 'str', q: c }); out += c; i++; continue; }
    if (c === '(' || c === '{' || c === '[') { f.depth++; out += c; i++; continue; }
    if (c === ')' || c === '}' || c === ']') {
      f.depth--; out += c; i++;
      if (f.depth === 0) { if (frames.length === 1) return { text: out, end: i }; frames.pop(); continue; }
      continue;
    }
    out += c; i++;
  }
  return null;
}

// the FIRST argument's source text, top-level comma only
function firstArg(argText) {
  const body = argText.slice(1, -1);
  let depth = 0, i = 0;
  const frames = [];
  for (; i < body.length; i++) {
    const c = body[i], t = frames[frames.length - 1];
    if (t === 'str' || t === 'tpl') {
      if (c === '\\') { i++; continue; }
      if ((t === 'str' && c === frames.q) || (t === 'tpl' && c === '`')) frames.pop();
      continue;
    }
    if (c === '`') { frames.push('tpl'); continue; }
    if (c === "'" || c === '"') { frames.push('str'); frames.q = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) break;
  }
  return body.slice(0, i).trim();
}

const lineOf = (s, i) => s.slice(0, i).split('\n').length;

/* ======================= 1. THE INVENTORY ==================================
 * Every event this app can emit, with where it comes from and what actually
 * triggers it. Two names are computed at the call site, so this is resolved
 * from the argument EXPRESSION (all of its string literals), not from a grep.
 *
 * A name here that no call site can produce fails. A call site producing a
 * name that is not here fails. Both directions, or the registry becomes a
 * story about the app rather than a description of it. */
const EVENTS = {
  // ---- analytics.js itself: the session envelope
  app_open:        'initAnalytics: once per page load, after the onboarding gate',
  session_start:   'initAnalytics: once per page load. The dashboard divides play-time pings by this',
  session_ping:    'every 45s the document is visible. playMinutes = pings x 45',
  session_resume:  'every visibilitychange back to visible. NOT a new session',
  screen:          'screen(): a bottom-nav/route change to a DIFFERENT tab. Deduped on name',
  screen_time:     'screen(): closing out the PREVIOUS screen, and on backgrounding (bg:1)',
  err:             'pushErr: uncaught error / unhandled rejection. Capped 5/session, 2/message',
  // ---- app.js: the funnel
  onb_step:        'renderOnboarding(): one row per RENDER of a step. re:1 marks a Back revisit',
  onb_restore:     'onboarding step 0: "Played before? Restore a backup"',
  onb_done:        'the plan screen: Start tracking (skip:0) or Skip for now (skip:1)',
  // ---- app.js: surfaces
  feat_open:       'openSheet(): every sheet, labelled by explicit name or its <h2>',
  feat_time:       'closeTopSheet -> rec.onClose: dwell in that sheet, WALL CLOCK',
  // ---- app.js: the loop
  food_log:        'a meal saved (not an edit), AFTER the db.put succeeded',
  log_write_failed:'the db.put for a meal threw; quota:1 if the device is full',
  cook:            'a dish started or lined up in the Kitchen, after res.ok',
  transmute:       'commons -> a rare ingredient, after res.ok',
  hatch:           'an egg hatched, after res.ready',
  quest_claim:     'a quest claimed, after claimQuest returned a payout',
  buy_weapon:      'a weapon bought, after res.ok',
  fight_start:     'openFight(): every fight in the app walks through this one door',
  pit_win:         'settle(): a WIN in any mode that is not boss/mini/friend. See the finding',
  boss_win:        'settle(): a world-boss den win',
  mini_win:        'settle(): a roaming mini-boss win',
  friend_battle:   'settle(): a friend battle, won or lost (won:0|1)',
  secret_boss_win: 'settle(): easter-egg boss. ALSO files pit_win, see the finding',
  glutton_win:     'settle(): the Glutton. ALSO files pit_win, see the finding',
  // ---- app.js: reaching out
  go_online:       'the Crew tab: goOnline() came back ok',
  feedback_send:   'Settings -> Send feedback: the tap. ok:1 only if it reached the server',
  den_nominate:    'Boneyard long-press -> nominate a den: the tap. ok as above',
  report_unreachable: 'Boneyard long-press -> report a spot: the tap. ok as above',
  survey_open:     'openSurveySheet(): auto (established players) or the Settings button',
  survey_later:    'the survey "Maybe later" button',
  survey_submit:   'the survey submitted. The pet is granted locally either way',
  // ---- app.js: the garden announcement funnel
  garden_intro_shown:      'openGardenPopup(): the card was put on screen',
  garden_intro_suppressed: 'the boot stayed busy for the whole 30s window: never shown',
  garden_intro_later:      '"Maybe later", or a tap on the veil (tap:veil)',
  garden_intro_cta:        '"See the garden"',
  // ---- other modules
  vault_backfill:  'social.js: an existing identity mirrored into the OS keychain',
  vault_recover:   'social.js: a wiped install came back as the SAME account',
  pet_iid_heal:    'loot.js: duplicate pet instance ids repaired. Diagnostic, carries a sample',
};

/* Names that are NOT string literals at the call site. Keyed by the exact
   argument source text so a rewrite of the expression fails here rather than
   silently dropping a name out of the inventory. */
const COMPUTED = {
  "isDen ? 'den_nominate' : 'report_unreachable'": ['den_nominate', 'report_unreachable'],
  "foeCfg.mode === 'boss' ? 'boss_win' : foeCfg.mode === 'mini' ? 'mini_win' : 'pit_win'":
    ['boss_win', 'mini_win', 'pit_win'],
  // trackScreen(tab): the name IS the route, checked separately by DEAD SCREENS
  tab: ['screen'],
  // analytics.js's own definitions and pass-throughs, not call sites
  name: [],
};

const appSrc = stripComments(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
const anaSrc = stripComments(fs.readFileSync(path.join(ROOT, 'js/analytics.js'), 'utf8'));
const rawAna = fs.readFileSync(path.join(ROOT, 'js/analytics.js'), 'utf8');

function callSites(src, file, callee) {
  const out = [];
  const re = new RegExp(`(^|[^\\w.$])${callee.replace('.', '\\.')}\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    const a = callArgs(src, open);
    if (!a) continue;
    out.push({ file, line: lineOf(src, open), arg: firstArg(a.text) });
  }
  return out;
}

const sites = [
  ...callSites(appSrc, 'js/app.js', 'trackEvent'),
  ...callSites(appSrc, 'js/app.js', 'trackScreen'),
  ...callSites(anaSrc, 'js/analytics.js', 'track'),
  ...callSites(stripComments(fs.readFileSync(path.join(ROOT, 'js/loot.js'), 'utf8')), 'js/loot.js', 'a.track'),
  ...callSites(stripComments(fs.readFileSync(path.join(ROOT, 'js/social.js'), 'utf8')), 'js/social.js', 'a.track'),
];
// pushErr writes 'err' straight into the queue, past track(), so no call site
// carries that name. Declared here rather than left to fall through.
if (/name: 'err'/.test(anaSrc)) sites.push({ file: 'js/analytics.js', line: lineOf(anaSrc, anaSrc.indexOf("name: 'err'")), arg: "'err'" });

const emitted = new Map();       // name -> [file:line]
const unresolved = [];
for (const s of sites) {
  const lits = [...s.arg.matchAll(/'([^']*)'/g)].map(m => m[1]);
  /* The DECLARED set wins over the literals: a computed name is a ternary of
     literals, and reading its literals blind would also swallow a rewrite that
     changed which of them can actually be reached. */
  let names;
  if (COMPUTED[s.arg]) names = COMPUTED[s.arg];
  else if (lits.length) names = [lits[0]];
  else { unresolved.push(`${s.file}:${s.line} ${JSON.stringify(s.arg)}`); continue; }
  for (const n of names) { if (!emitted.has(n)) emitted.set(n, []); emitted.get(n).push(`${s.file}:${s.line}`); }
}

console.log(`\n--- INVENTORY (${sites.length} call sites, ${emitted.size} distinct names) ---`);
for (const [n, where] of [...emitted].sort()) console.log(`  ${n.padEnd(24)} ${where.join(', ')}`);

ok('INVENTORY: every call site resolves to a name', unresolved.length === 0,
  unresolved.length ? unresolved.join(' | ') : `${sites.length} sites, none unresolved`);
ok('INVENTORY: the sample is not empty', sites.length > 20 && emitted.size > 20,
  `${sites.length} call sites, ${emitted.size} names`);
const undeclared = [...emitted.keys()].filter(n => !EVENTS[n]);
ok('INVENTORY: no undeclared event name', undeclared.length === 0,
  undeclared.length ? `add to EVENTS: ${undeclared.join(', ')}` : 'all declared');
const orphan = Object.keys(EVENTS).filter(n => !emitted.has(n));
ok('INVENTORY: no declared name has lost its call site', orphan.length === 0,
  orphan.length ? `EVENTS describes rows nothing can emit: ${orphan.join(', ')}` : 'registry matches the source');

/* ======================= 2. DEAD SCREENS ===================================
 * route() renders a branch per tab and files screen{s:tab} for it. A branch no
 * in-app navigation can reach emits a name that will never appear in the
 * dashboard's screen heatmap, and worse, reads as a screen nobody uses. This is
 * the dead-selector guard applied to the events table.
 *
 * Reachable = anything the app itself puts in location.hash, plus every
 * data-tab in the tab bar, plus the empty-hash default. */
const routeBody = appSrc.slice(appSrc.indexOf('function route({ keepScroll'));
const branchTabs = new Set([...routeBody.slice(0, 4000).matchAll(/tab === '(\w+)'/g)].map(m => m[1]));
branchTabs.add('today');   // the else
const idxHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const reachable = new Set(['today']);
for (const f of ['js/app.js', 'js/pit.js', 'js/game.js', 'js/loot.js', 'js/social.js', 'js/poi.js', 'js/quests.js']) {
  const t = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  for (const m of t.matchAll(/#\/(\w+)/g)) reachable.add(m[1]);
}
for (const m of idxHtml.matchAll(/data-tab="(\w+)"/g)) reachable.add(m[1]);
/* DECLARED DEAD, with the evidence. Neither is a bug to fix: both branches are
   deliberate deep-link targets. They are here so that (a) nobody reads a zero
   in the heatmap as "players avoid the Shop", and (b) the day something DOES
   link to them, this goes red and the new rows are expected rather than a
   mystery. */
const KNOWN_DEAD = {
  shop: '#/shop is a deep link into the hub\'s Shop tab. Nothing in the app, the shell or the help pages navigates to it, so screen{s:"shop"} cannot occur.',
  trends: '#/trends is an alias of #/progress. js/app.js says so in its own comment: "nothing in the app ever navigates there".',
};
const dead = [...branchTabs].filter(t => !reachable.has(t)).sort();
for (const d of dead) if (KNOWN_DEAD[d]) note('DEAD SCREEN', `screen{s:'${d}'} / screen_time{s:'${d}'} can never fire. ${KNOWN_DEAD[d]}`);
ok('DEAD SCREENS: exactly the two declared route branches are unreachable',
  eq(dead, Object.keys(KNOWN_DEAD).sort()),
  `unreachable=[${dead}] declared=[${Object.keys(KNOWN_DEAD).sort()}] (of ${[...branchTabs].sort().join(',')})`);

/* ======================= 3. FEATURE LABELS =================================
 * feat_open's label is auto-derived: the explicit `name` option, else the first
 * <h2> in the sheet's markup, capped at 40 non-markup characters, else the
 * literal string 'sheet'. The dashboard groups by it
 * (server/src/index.js:1033, LIMIT 40). Two ways that goes wrong, both measured
 * on this tree before they were fixed:
 *   UNBOUNDED  <h2>${esc(food.name)}</h2> puts ONE ROW PER FOOD in the table.
 *              The most-used sheet in a food tracker was therefore invisible:
 *              every one of its rows sits far below the top 40.
 *   COLLIDING  a sheet with no <h2>, or an <h2> containing markup, falls back
 *              to 'sheet'. Ten unrelated features shared that one row.
 * An interpolation is BOUNDED if it is a ternary over string literals (no call
 * parens): those have a fixed, small range. Anything else is unbounded. */
const SHEET_LABELS = {
  cosmetic_teaser: 'the cosmetics drop teaser',
  'The Glutton': 'the Glutton announcement',
  'spire-sheet': 'a Dark Spire',
  'den-sheet': 'a boss den',
  'Dark Spire': 'the spire intro',
  Siege: 'a spire under siege',
  'The Hollow': 'the salvage bench',
  'The Bone Garden': 'the garden',
  'Plant a seed': 'garden: planting',
  'Compost heap': 'garden: compost',
  Harvest: 'garden: harvest',
  Kitchen: 'the kitchen',
  'Add food': 'food search',
  food_portion: 'the portion sheet. Was the FOOD NAME: one dashboard row per food',
  quick_add: 'quick add. Its <h2> holds markup, so it landed in the "sheet" bucket',
  scanner: 'the barcode scanner. No <h2>: was in the "sheet" bucket',
  'Not in the books': 'the no-result food screen',
  'Scan a label': 'the scan prompt',
  food_edit: 'new/edit food. Markup <h2>: was in the "sheet" bucket',
  text_input: 'the generic text-input sheet. Its name was the caller\'s free-text TITLE',
  "'trend_' + metricKey": 'the metric detail sheets. Bounded: one per health metric',
  'Log weight': 'the weight sheet',
  rename_notice: 'the forced-rename notice',
  'Your Bonehead name': 'the name builder',
  Leaderboard: 'the leaderboard',
  friend_profile: 'a friend. Was the FRIEND\'S NAME: one dashboard row per friend',
  'Send a gift': 'crew gifting',
  'Send a cheer': 'crew cheering',
  feedback: 'Settings -> Send feedback',
  survey: 'the Day One survey',
  "What's New": 'the changelog',
  Erase: 'the erase-everything confirm',
  'Your plan': 'the targets sheet',
  celebration: 'the badge/streak takeover. No <h2>: was in the "sheet" bucket',
  levelup: 'the level-up takeover',
  hatch_reveal: 'the hatch reveal. No <h2>: was in the "sheet" bucket',
  pack_reveal: 'the crate/pack reveal. No <h2>: was in the "sheet" bucket',
  pet_levelup: 'the pet level-up. No <h2>: was in the "sheet" bucket',
  pets_help: 'how pets work',
  'The Paddock': 'the paddock',
  'The Stable': 'the stable',
  breed_reveal: 'the breeding result. No <h2>: was in the "sheet" bucket',
  'Recovery code': 'the recovery code sheet',
  Restore: 'restore an account',
  'Connect Apple Health': 'the Health connect sheet (two entry points, same label)',
  map_report: 'den nomination / unreachable report',
  'The Pit': 'the Pit',
  fight: 'a fight. Was the FOE NAME: one dashboard row per enemy',
  Talents: 'the talents sheet',
  'html (variable)': 'the sleep detail sheet: markup built into a local, so the <h2> ("Sleep") is only resolvable at runtime',
};

const sheetSites = [];
{
  let i = 0;
  while ((i = appSrc.indexOf('openSheet(', i)) >= 0) {
    const line = lineOf(appSrc, i);
    const a = callArgs(appSrc, i + 'openSheet'.length);
    i += 10;
    if (!a) { sheetSites.push({ line, kind: 'UNPARSED', key: '?' }); continue; }
    const body = a.text.slice(1, -1);
    if (/^\s*html\s*[,)]?\s*$/.test(body.split(/,(?![^{]*\})/)[0])) {
      // markup built into a local: the <h2> is only resolvable at runtime, but
      // an explicit name option still pins the label from here
      const inm = body.match(/\bname:\s*([^,}\n]+)/);
      sheetSites.push({ line, kind: 'indirect', key: inm ? inm[1].trim() : 'html (variable)' });
      continue;
    }
    if (!/^\s*`/.test(body)) continue;                    // the definition / a re-export
    const nm = body.match(/\bname:\s*([^,}\n]+)/);
    if (nm) {
      const raw = nm[1].trim();
      sheetSites.push({ line, kind: 'name', key: /^'[^']*'$/.test(raw) ? raw.slice(1, -1) : raw });
      continue;
    }
    const h2 = body.match(/<h2[^>]*>([\s\S]{0,140}?)<\/h2>/);
    if (!h2) { sheetSites.push({ line, kind: 'COLLIDES', key: '(sheet)' }); continue; }
    if (!/^[^<]{1,40}$/.test(h2[1])) { sheetSites.push({ line, kind: 'COLLIDES', key: '(sheet)' }); continue; }
    const exprs = [...h2[1].matchAll(/\$\{([^}]*)\}/g)].map(m => m[1]);
    const unbounded = exprs.some(e => /\(/.test(e) || !/\?/.test(e));
    sheetSites.push({ line, kind: unbounded ? 'UNBOUNDED' : 'h2', key: h2[1] });
  }
}
ok('LABELS: the openSheet sample is not empty', sheetSites.length > 40, `${sheetSites.length} sheets scanned`);
const bad = sheetSites.filter(s => s.kind === 'COLLIDES' || s.kind === 'UNBOUNDED' || s.kind === 'UNPARSED');
ok('LABELS: no sheet emits an unbounded or colliding feat_open label', bad.length === 0,
  bad.length ? bad.map(b => `js/app.js:${b.line} ${b.kind} ${JSON.stringify(b.key)}`).join(' | ') : `${sheetSites.length} sheets, every label bounded`);
const labelKeys = [...new Set(sheetSites.map(s => s.key))].sort();
const newLabels = labelKeys.filter(k => !SHEET_LABELS[k]);
const goneLabels = Object.keys(SHEET_LABELS).filter(k => !labelKeys.includes(k)).sort();
ok('LABELS: every sheet label is registered', newLabels.length === 0,
  newLabels.length ? `unregistered (a new sheet, or an <h2> edit that RENAMED a dashboard series): ${newLabels.map(l => JSON.stringify(l)).join(', ')}` : `${labelKeys.length} labels`);
ok('LABELS: no registered label has lost its sheet', goneLabels.length === 0,
  goneLabels.length ? `SHEET_LABELS describes rows nothing emits: ${goneLabels.join(', ')}` : 'registry matches the source');

/* ======================= 3b. THE 300-CHAR CLIP =============================
 * server/src/index.js does `JSON.stringify(e.props).slice(0, 300)` and is NOT
 * JSON-aware, so a props that overflows lands in D1 as unterminated JSON and
 * every json_extract on it returns null: the row survives, its contents do not.
 * pushErr budgets against that cap by hand. Two things have to hold, and the
 * live drive below can only see the payloads it happens to produce, so they are
 * bounded here instead of hoped for.
 *   AGREEMENT  the client's copy of the cap is the server's actual number. If
 *              the Worker's slice ever changes, the client budget diverges
 *              silently and only the longest, most informative crash messages
 *              are lost, which is the worst possible failure to have silently.
 *   LABELS     feat_open's label is capped at 40 chars ONLY on the <h2> path.
 *              An explicit `name` option is not capped at all, so a long one
 *              would ride into the table unchecked. */
const SRV_CAP = 300;
const srvSrc = fs.readFileSync(path.join(ROOT, 'server/src/index.js'), 'utf8');
const srvCap = Number((srvSrc.match(/JSON\.stringify\(e\.props\)\.slice\(0,\s*(\d+)\)/) || [])[1]);
const cliCap = Number((rawAna.match(/SRV_PROP_CAP = (\d+)/) || [])[1]);
ok('CLIP: the client budget equals the server\'s actual clip',
  srvCap === SRV_CAP && cliCap === SRV_CAP, `server=${srvCap} client=${cliCap} expected=${SRV_CAP}`);
const fatLabel = labelKeys.filter(k => JSON.stringify({ f: k, ms: 999999 }).length > SRV_CAP || k.length > 40);
ok('CLIP: every feature label fits, explicit names included', fatLabel.length === 0,
  fatLabel.length ? `over budget: ${fatLabel.join(', ')}` : `${labelKeys.length} labels, longest ${Math.max(...labelKeys.map(k => k.length))} chars`);

/* ======================= 4. PROBE SEALED ===================================
 * The escape hatch this audit runs on must never reach the network. flush(),
 * sendReport() and sendSurvey() are the three functions that do, and all three
 * must keep the RAW BOT gate rather than the probe-aware muted(). */
const netFns = ['export async function flush', 'export async function sendReport', 'export async function sendSurvey'];
const sealed = netFns.every(sig => {
  const at = rawAna.indexOf(sig);
  if (at < 0) return false;
  const head = rawAna.slice(at, at + 260);
  return /if \(BOT[ )]/.test(head) && !/muted\(\)/.test(head);
});
ok('PROBE-SEALED: flush/sendReport/sendSurvey still use the RAW BOT gate', sealed,
  sealed ? 'no probed row can leave the device' : 'a probed audit run could POST to production');
ok('PROBE-SEALED: pushErr still honours BOT without its own probe',
  /if \(BOT && !\(typeof window !== 'undefined' && window\.__errProbe\)\) return;/.test(rawAna),
  'the direct-to-queue write in pushErr must not bypass the suppression gate');

/* ======================= 5. LIVE: drive the app ============================ */
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;
console.log(`\n--- LIVE (${base}) ---`);

const { browser, page } = await boot(base);
try {
  // the probe has to exist BEFORE analytics.js evaluates its BOT const
  await page.evaluateOnNewDocument(() => { window.__evProbe = 1; });
  await page.goto(base.replace(/\/?$/, '/') + '?demo', { waitUntil: 'networkidle2' });
  await sleep(3200);

  const readQ = () => page.evaluate(async () => {
    const db = await import('./js/db.js');
    return (await db.kvGet('evq', [])) || [];
  });
  const clear = () => page.evaluate(async () => { const db = await import('./js/db.js'); await db.kvSet('evq', []); });
  const nav = async h => { await page.evaluate(x => { location.hash = x; }, h); await sleep(1500); };
  const names = q => q.map(r => r.name);
  const only = (q, n) => q.filter(r => r.name === n);

  const bootQ = await readQ();
  const all = [...bootQ];   // everything this run captured, for the payload + registry sweeps

  ok('LIVE: the captured queue is not empty', bootQ.length > 0,
    bootQ.length ? `${bootQ.length} rows off the boot` : 'NOTHING was captured: the probe is not reaching track(), so nothing below tested anything');
  ok('BOOT: exactly one app_open', only(bootQ, 'app_open').length === 1, `${only(bootQ, 'app_open').length}`);
  ok('BOOT: exactly one session_start', only(bootQ, 'session_start').length === 1, `${only(bootQ, 'session_start').length}`);
  ok('BOOT: exactly one screen row, and it is the landing tab',
    only(bootQ, 'screen').length === 1 && only(bootQ, 'screen')[0].props.s === 'today',
    JSON.stringify(names(bootQ)));
  ok('BOOT: the first screen has no screen_time yet', only(bootQ, 'screen_time').length === 0,
    `${only(bootQ, 'screen_time').length} (a dwell row before anything closed would be time nobody spent)`);

  // ---- NAV: three navigations, exact counts and exact order
  await clear();
  await nav('#/friends'); await nav('#/bonehead'); await nav('#/today');
  const navQ = await readQ(); all.push(...navQ);
  ok('NAV: three navigations emit exactly three screen rows, in order',
    eq(only(navQ, 'screen').map(r => r.props.s), ['friends', 'bonehead', 'today']),
    JSON.stringify(only(navQ, 'screen').map(r => r.props.s)));
  ok('NAV: exactly three screen_time rows, each closing the PREVIOUS screen',
    eq(only(navQ, 'screen_time').map(r => r.props.s), ['today', 'friends', 'bonehead']),
    JSON.stringify(only(navQ, 'screen_time').map(r => r.props.s)));
  ok('NAV: nothing but screen/screen_time is emitted by navigating',
    navQ.every(r => r.name === 'screen' || r.name === 'screen_time'), JSON.stringify(names(navQ)));
  ok('PAIR LAG: the screen you are ON has no screen_time row',
    !only(navQ, 'screen_time').some(r => r.props.s === 'today' && r.props.bg),
    'screen_time can never equal screen: the last screen of every session is lost');

  // ---- RE-ROUTE: an in-place re-render of the same tab must emit nothing.
  // route() is called by refresh() too (logging water, changing the day), so a
  // lost dedupe would file a screen row on every small edit.
  await clear();
  await page.evaluate(() => { dispatchEvent(new HashChangeEvent('hashchange')); });
  await sleep(1200);
  const reQ = await readQ(); all.push(...reQ);
  ok('RE-ROUTE: re-rendering the SAME tab emits exactly zero rows', reQ.length === 0,
    reQ.length ? JSON.stringify(reQ) : 'deduped');

  // ---- BACKGROUND: hiding the tab is not a screen change
  await clear();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(800);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(800);
  const bgQ = await readQ(); all.push(...bgQ);
  ok('BACKGROUND: emits exactly one screen_time and exactly zero screen rows',
    only(bgQ, 'screen_time').length === 1 && only(bgQ, 'screen').length === 0,
    JSON.stringify(names(bgQ)));
  ok('BACKGROUND: that screen_time is flagged bg, so the heatmap can tell it from a visit',
    only(bgQ, 'screen_time')[0]?.props?.bg === 1,
    JSON.stringify(only(bgQ, 'screen_time')[0]?.props) + '  (unflagged, COUNT(*) reads backgrounding as a visit)');
  ok('BACKGROUND: exactly one session_resume, and no second session_start',
    only(bgQ, 'session_resume').length === 1 && only(bgQ, 'session_start').length === 0,
    JSON.stringify(names(bgQ)));

  // ---- SHEET PAIR: one open, one close
  await clear();
  await nav('#/settings');
  const opened = await page.evaluate(() => { const b = document.getElementById('feedbackBtn'); if (!b) return false; b.click(); return true; });
  ok('SHEET: the feedback sheet could be opened', opened, opened ? '' : 'no #feedbackBtn on Settings: nothing below tested a sheet');
  await sleep(1500);
  const openQ = await readQ();
  ok('SHEET: opening emits exactly one feat_open, with the registered label',
    only(openQ, 'feat_open').length === 1 && only(openQ, 'feat_open')[0].props.f === 'feedback',
    JSON.stringify(only(openQ, 'feat_open').map(r => r.props)));
  ok('SHEET: opening emits no feat_time', only(openQ, 'feat_time').length === 0, `${only(openQ, 'feat_time').length}`);

  // ---- ATTEMPT vs DELIVERY: the send CANNOT succeed here (no apiBase, and
  // sendReport keeps the raw BOT gate), so the row must not read as delivered.
  await page.evaluate(() => {
    const t = document.getElementById('fbNote');
    if (t) t.value = 'analytics-event-audit probe note';
    document.getElementById('fbSend')?.click();
  });
  await sleep(1600);
  const sendQ = await readQ();
  const fb = only(sendQ, 'feedback_send');
  ok('ATTEMPT: exactly one feedback_send for one tap', fb.length === 1, `${fb.length}`);
  ok('ATTEMPT: a send that FAILED is not filed as delivered', fb.length === 1 && fb[0].props && fb[0].props.ok === 0,
    fb.length ? `props=${JSON.stringify(fb[0].props)} (undefined/1 here means every offline tap counts as a delivered report)` : 'no row');

  await page.evaluate(() => history.back());
  await sleep(1500);
  const closeQ = await readQ(); all.push(...closeQ);
  const fo = only(closeQ, 'feat_open'), ft = only(closeQ, 'feat_time');
  ok('SHEET PAIR: exactly one feat_open and exactly one feat_time, same label',
    fo.length === 1 && ft.length === 1 && fo[0].props.f === ft[0].props.f,
    `open=${JSON.stringify(fo.map(r => r.props))} time=${JSON.stringify(ft.map(r => r.props))}`);
  ok('SHEET PAIR: the dwell is a real, non-negative duration',
    ft.length === 1 && Number.isFinite(ft[0].props.ms) && ft[0].props.ms >= 0, JSON.stringify(ft[0]?.props));

  // ---- PAYLOAD: the server does JSON.stringify(props).slice(0, 300) and is
  // NOT JSON-aware, so a props that overflows lands in D1 as unterminated JSON
  // and every json_extract on it returns null. Measured, not eyeballed.
  const sizes = all.filter(r => r.props).map(r => ({ n: r.name, len: JSON.stringify(r.props).length }));
  const worst = sizes.sort((a, b) => b.len - a.len)[0];
  ok('PAYLOAD: something was measured', sizes.length > 0, `${sizes.length} rows carried props`);
  ok('PAYLOAD: no captured props exceeds the server\'s 300-char clip',
    sizes.every(s => s.len <= SRV_CAP),
    `largest measured: ${worst ? `${worst.n} at ${worst.len} chars` : 'none'} (cap ${SRV_CAP})`);

  // ---- REGISTRY sweep over everything that actually landed
  const seen = [...new Set(all.map(r => r.name))];
  ok('LIVE: every captured name is in the inventory', seen.every(n => EVENTS[n]),
    JSON.stringify(seen.filter(n => !EVENTS[n])) + ` of ${seen.length} names seen`);

  /* ---- FUNNEL: onboarding. Needs a page with NO settings, so this one runs
     WITHOUT ?demo (?demo seeds a profile and skips onboarding entirely). The
     plain 'tally' database is empty in a fresh puppeteer profile. Nothing can
     leave: NOSOCIAL is navigator.webdriver, and flush keeps the raw BOT gate. */
  await page.goto(base.replace(/\/?$/, '/'), { waitUntil: 'networkidle2' });
  await sleep(3000);
  const onOnb = await page.evaluate(() => !!document.querySelector('.onb'));
  ok('FUNNEL: a settings-less boot lands on onboarding', onOnb,
    onOnb ? '' : 'not on the onboarding screen, so the funnel below tested nothing');
  /* NOT cleared: the very first onb_step (the landing render) is part of what
     is being counted, and clearing it would hide a double-fire on step 0. The
     plain 'tally' database is untouched in a fresh profile, so this queue holds
     nothing but this run. */
  // forward to step 1, then BACK to step 0: the funnel's own re-render
  await page.evaluate(() => document.getElementById('onbGo')?.click());
  await sleep(900);
  await page.evaluate(() => document.getElementById('onbBack')?.click());
  await sleep(900);
  const onbQ = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    return ((await db.kvGet('evq', [])) || []).filter(r => r.name === 'onb_step');
  });
  ok('FUNNEL: forward-then-back emits exactly three onb_step rows',
    onbQ.length === 3, `${onbQ.length}: ${JSON.stringify(onbQ.map(r => r.props))}`);
  ok('FUNNEL: only the Back re-render is marked as a revisit',
    eq(onbQ.map(r => [r.props.n, r.props.re]), [[0, 0], [1, 0], [0, 1]]),
    `${JSON.stringify(onbQ.map(r => r.props))} (without \`re\` the launch funnel counts step VIEWS as step REACHES)`);
} finally {
  await browser.close().catch(() => {});
  srv?.close();
}

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nthe events say what their names say');
process.exit(fails.length ? 1 : 0);
