// PURE tier: execute production functions and the production leaderboard row callback.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

export const NOW = 1800000000000;
export const PHRASES = [
  [0, 'online now'], [359999, 'online now'], [360000, '6 minutes ago'],
  [3599999, '59 minutes ago'], [3600000, '1 hour ago'], [7200000, '2 hours ago'],
  [86399999, '23 hours ago'], [86400000, 'yesterday'], [172799999, 'yesterday'],
  [172800000, '2 days ago'], [604799999, '6 days ago'], [604800000, '1 week ago'],
  [1209599999, '1 week ago'], [1209600000, '2 weeks ago'], [31536000000, '52 weeks ago'],
];
export function loadProduction(source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8')) {
  const functions = ['relativeAgo', 'leaderboardLastOnline', 'onlineLabel'].map(name => {
    const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
    if (name !== 'relativeAgo') assert.ok(match, `${name} missing`);
    return match?.[0] || '';
  }).join('\n');
  const start = source.indexOf('${players.map((p, i) => {');
  const end = source.indexOf("}).join('')}", start);
  assert.ok(start >= 0 && end > start, 'production leaderboard callback missing');
  const callback = source.slice(start + '${players.map('.length, end + 1);
  const context = vm.createContext({
    Date: class extends Date { static now() { return NOW; } },
    friendIds: new Set(), outIds: new Set(), inIds: new Set(),
    esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    ICONS: { check: () => '' }, badgePixHtml: () => '',
  });
  vm.runInContext(`${functions}\nthis.renderRow = (${callback});`, context);
  return context;
}
export function runAudit(source) {
  const production = loadProduction(source);
  let failed = 0;
  const row = production.renderRow({ name: 'Fixture Player', level: 42, playerId: 'fixture', addToken: 'fixture', lastSeen: NOW - 7200000 }, 3);
  const checks = [
    ['PHRASES', () => {
      for (const [age, expected] of PHRASES) {
        assert.equal(production.relativeAgo(NOW - age, NOW), expected, `age ${age}`);
        assert.equal(production.leaderboardLastOnline(NOW - age), expected, `last online age ${age}`);
      }
      for (const invalid of [undefined, null, NaN, Infinity, -1, 0, NOW + 1, '123']) {
        assert.equal(production.relativeAgo(invalid, NOW), '');
        assert.equal(production.leaderboardLastOnline(invalid), '');
      }
    }],
    ['NO-UTC', () => {
      assert.match(row, /class="lb-seen">[^<]+<\/span>/);
      assert.doesNotMatch(row, /UTC|\d{4}-\d{2}-\d{2}|\d{2}:\d{2}/);
    }],
    ['CONTROL', () => { assert.match(row, /Fixture Player/); assert.match(row, /Level 42/); }],
  ];
  for (const [name, check] of checks) {
    try { check(); console.log(`PURE ${name}: GREEN`); }
    catch (error) { failed++; console.log(`PURE ${name}: RED: ${error.message}`); }
  }
  console.log(`Leaderboard seen audit: ${checks.length - failed} passed, ${failed} failed`);
  return failed;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = process.argv.includes('--main')
    ? execFileSync('git', ['show', 'main:js/app.js'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, cwd: new URL('..', import.meta.url) })
    : undefined;
  process.exitCode = runAudit(source) ? 1 : 0;
}
