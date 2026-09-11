import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
function grade(source, styles) {
  const sel = source.slice(source.indexOf('  const paintFanSel ='), source.indexOf('  // Starred friends as skull chips'));
  assert.match(sel, /class="cfan-identity"/, 'identity must have its own row');
  assert.match(sel, /<\/div>\s*<div class="cfan-acts">/, 'actions follow the closed identity row');
  assert.match(sel, /aria-pressed="\$\{favs.has\(f.playerId\)\}"/);
  assert.match(sel, /ICONS.star\(48\)/);
  assert.doesNotMatch(sel, /cfan-chips|gearCount|Pet LV/);
  for (const handler of ['openFriendProfile(f, paint)', 'openCheerSheet(f)', 'openGiftSheet(f)', "kvSet('crewFaves', [...favs])", 'resortFan(); paintFaves(); applyFan();']) assert.ok(sel.includes(handler), handler);
  const screen = source.slice(source.indexOf('async function renderFriends('), source.indexOf('  /* ONE WATERMARK READ'));
  assert.ok(screen.indexOf('id="raceCard"') < screen.indexOf('id="crewLeaderboard"'), 'race precedes visible podium');
  assert.match(screen, /id="lbPodium"/);
  assert.match(styles, /#cfanSel \.cfan-star\s*\{[^}]*width: 46px; height: 46px/);
  assert.match(styles, /#cfanSel \.cfan-star img\s*\{[^}]*width: 48px; height: 48px/);
  assert.match(styles, /#cfanSel \.cfan-acts\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /#cfanDeck \.cfan-stage::after\s*\{\s*content: none; background: none;\s*\}/);
  assert.ok(source.includes('navigator.webdriver && window.__testFriends'));
  assert.ok(source.includes("if (off) { if (stage.firstChild) stage.textContent = ''; }"));
}
grade(app, css);
console.log('PASS Crew 1C source: separate rows, pixel star and state, handlers, race/podium order, no base gradient, fixture and unmount seam');
assert.throws(() => grade(app.replace('class="cfan-identity"', 'class="broken-identity"'), css), /identity must have its own row/);
assert.throws(() => grade(app, css.replace('#cfanSel .cfan-star { width: 46px; height: 46px', '#cfanSel .cfan-star { width: 20px; height: 20px')));
assert.throws(() => grade(app, css.replace('#cfanDeck .cfan-stage::after { content: none; background: none; }', '')));
console.log('PASS CONTROL: missing identity row, undersized target and restored base gradient rejected. Browser layout and ink remain UNPROVEN.');
