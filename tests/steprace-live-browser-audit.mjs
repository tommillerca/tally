/* Operator-owned browser only. CONTROL mutations below must fail the same
 * pixel/geometry assertions as real rows. No synthetic layout or Node green.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { auditOutputPath } from './lib/audit-output.mjs';
import { prepareCrew, measureStepRows, stepLeaderboardSurface } from './lib/crew-capture.mjs';
import { assertStepIcons } from './lib/crew-geometry-guards.mjs';

const endpoint = process.env.CREW_CAPTURE_CDP, target = process.env.CREW_CAPTURE_URL || process.argv[2];
if (!endpoint || !target) {
  console.error('BLOCKED: operator browser required. Command: CREW_CAPTURE_CDP=http://127.0.0.1:9222 CREW_CAPTURE_URL="http://127.0.0.1:8765/?demo" node tests/steprace-live-browser-audit.mjs');
  process.exit(97);
}
const cdp = new URL(endpoint), url = new URL(target);
assert.ok([cdp, url].every(u => ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) && url.searchParams.has('demo'),
  'CONTROL only a local operator browser and disposable demo are allowed');
const { default: puppeteer } = await import('puppeteer');
const browser = await puppeteer.connect(cdp.protocol.startsWith('ws') ? { browserWSEndpoint: endpoint } : { browserURL: endpoint });
try {
  const pages = (await browser.pages()).filter(p => p.url() === target);
  assert.equal(pages.length, 1, 'CONTROL exactly one selected operator page');
  const page = pages[0];
  const output = auditOutputPath(resolve(process.env.CREW_CAPTURE_OUTPUT || resolve(tmpdir(), 'steprace-live-browser')));
  mkdirSync(auditOutputPath(output), { recursive: true });
  const measureTracks = () => page.evaluate(() => [...document.querySelectorAll('#raceCard .race-lane')].map(row => {
    const track = row.querySelector('.track, .race-pending-track'), fill = track?.querySelector(':scope > i');
    const geometry = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      let opacity = 1;
      for (let n = el; n; n = n.parentElement) {
        const style = getComputedStyle(n);
        opacity *= style.display === 'none' || style.visibility !== 'visible' ? 0 : Number(style.opacity);
      }
      return { width: r.width, height: r.height, clientWidth: el.clientWidth, opacity,
        background: s.backgroundColor, border: s.borderTopStyle, borderColor: s.borderTopColor };
    };
    return { track: geometry(track), fill: geometry(fill), text: row.textContent,
      placeholder: row.querySelector('.run')?.getAttribute('aria-label') };
  }));
  const assertTracks = (rows, fixture, neutral) => {
    assert.equal(rows.length, 5, 'CONTROL all five tracks measured');
    rows.forEach((row, i) => {
      assert.ok(row.track?.width >= 100 && row.track?.height >= 10 && row.track.opacity > 0.05, `rank ${i + 1}: visible track geometry`);
      assert.ok(row.track.border !== 'none' && row.track.borderColor !== 'rgba(0, 0, 0, 0)', 'Track has visible border ink');
      assert.ok(row.fill && row.fill.height > 0 && row.fill.opacity > 0.05, 'Fill has measurable height and opacity');
      const expected = neutral ? 0 : fixture.race.players[i].steps / fixture.race.players[0].steps * row.track.clientWidth;
      assert.ok(Math.abs(row.fill.width - expected) < 0.6, `rank ${i + 1}: fill ${row.fill.width}px, data requires ${expected}px`);
      assert.ok(row.text.includes(fixture.race.players[i].steps.toLocaleString()), 'Recorded count retained');
      if (neutral) assert.match(row.text, /Progress comparison awaits recent syncs/);
    });
  };
  for (const scenario of ['degraded', 'fresh', 'one-stale', 'all-stale', 'unknown']) {
    const fixture = await prepareCrew(page, { scenario });
    const surface = await stepLeaderboardSurface(page);
    const icons = await measureStepRows(page), tracks = await measureTracks();
    writeFileSync(auditOutputPath(resolve(output, `${scenario}.json`)), JSON.stringify({ icons, tracks }, null, 2) + '\n');
    await surface.screenshot({ path: auditOutputPath(resolve(output, `${scenario}.png`)) });
    assertStepIcons(icons); // decoded art, positive size, visible raster ink, no occlusion
    assertTracks(tracks, fixture, scenario !== 'fresh');
    if (scenario === 'degraded') {
      assert.match(tracks[0].placeholder, /Placeholder figure/);
      assert.match(tracks[1].placeholder, /Placeholder figure/);
      for (const css of [
        '#raceCard .race-pending-track { height:0!important; border:0!important }',
        '#raceCard .race-pending-track { opacity:0!important }',
        '#raceCard .race-pending-track > i { width:6%!important }',
      ]) {
        const style = await page.addStyleTag({ content: css });
        try { assert.throws(() => assertTracks([], fixture, true));
          assert.throws(() => assertTracks(tracks.map(r => ({ ...r, track: null })), fixture, true));
          const bad = await measureTracks(); assert.throws(() => assertTracks(bad, fixture, true), 'CONTROL rendered track mutation must fail');
        } finally { await style.evaluate(el => el.remove()); }
      }
      const style = await page.addStyleTag({ content: '#raceCard .run img, #raceCard .run canvas { opacity:0!important }' });
      try { const bad = await measureStepRows(page); assert.throws(() => assertStepIcons(bad), 'CONTROL empty placeholder art must fail'); }
      finally { await style.evaluate(el => el.remove()); }
    }
    console.log(`PASS ${scenario}: painted avatars and measured honest tracks`);
  }
} finally { browser.disconnect(); }
