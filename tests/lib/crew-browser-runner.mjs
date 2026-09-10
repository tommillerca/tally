/* Operator browser required. Connect only; never launch a browser or listener.
 * CONTROL mutations prove each predicate sees rendered failures on that page.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { auditOutputPath } from './audit-output.mjs';
import { prepareCrew, memberSurface, stepLeaderboardSurface, measureCrew, measureStepRows } from './crew-capture.mjs';
import { assertBars, assertPets, assertStepIcons } from './crew-geometry-guards.mjs';

export async function runCrewGuard(kind) {
  const endpoint = process.env.CREW_CAPTURE_CDP, target = process.env.CREW_CAPTURE_URL;
  if (!endpoint || !target || kind !== 'icons' && !process.env.CREW_CAPTURE_BASELINE) {
    console.error('UNPROVEN: operator browser run required. Set CREW_CAPTURE_CDP and exact CREW_CAPTURE_URL (?demo); bars/pets also need CREW_CAPTURE_BASELINE.');
    process.exitCode = 97; return;
  }
  const cdp = new URL(endpoint), url = new URL(target);
  if (![cdp, url].every(u => ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) || !url.searchParams.has('demo'))
    throw new Error('Refusing non-local browser or non-demo target');
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.connect(cdp.protocol.startsWith('ws') ? { browserWSEndpoint: endpoint } : { browserURL: endpoint });
  try {
    const pages = (await browser.pages()).filter(p => p.url() === target);
    assert.equal(pages.length, 1, 'CONTROL exactly one operator-selected demo page required');
    const page = pages[0];
    const out = resolve(process.env.CREW_CAPTURE_OUTPUT || resolve(tmpdir(), 'crew-capture-browser'));
    mkdirSync(auditOutputPath(out), { recursive: true });
    const baseline = kind === 'icons' ? null : JSON.parse(readFileSync(process.env.CREW_CAPTURE_BASELINE, 'utf8'));
    if (baseline) assert.ok(baseline.approvedBy && baseline.sourceBuild && baseline.schema === 1, 'Operator approval and baseline build required');
    const cases = kind === 'icons' ? ['fresh', 'one-stale', 'all-stale', 'unknown'] : ['fresh'];
    const failures = [];
    for (const scenario of cases) {
      const fx = await prepareCrew(page, { scenario });
      if (kind === 'icons') {
        await stepLeaderboardSurface(page);
        const rows = await measureStepRows(page);
        writeFileSync(auditOutputPath(resolve(out, `${kind}-${scenario}.json`)), JSON.stringify(rows, null, 2) + '\n');
        // CONTROL rendered mutations must turn a healthy single-row sample red.
        // Other rows retain their actual measurements, and the chosen row is
        // brought into view again before each mutation is measured.
        if (scenario === 'fresh') {
          assertStepIcons(rows);
          for (const css of ['width:0!important;height:0!important', 'opacity:0!important']) {
            const style = await page.addStyleTag({ content: `#raceCard .run { ${css} }` });
            try { assert.throws(() => assertStepIcons([])); // CONTROL empty sample
              const bad = await measureStepRows(page); assert.throws(() => assertStepIcons(bad));
            } finally { await style.evaluate(el => el.remove()); }
          }
          const hiddenArt = await page.addStyleTag({ content: '#raceCard .run img, #raceCard .run canvas { opacity:0!important }' });
          try { const bad = await measureStepRows(page); assert.throws(() => assertStepIcons(bad)); }
          finally { await hiddenArt.evaluate(el => el.remove()); }
          await page.evaluate(() => {
            const cover = document.createElement('div'); cover.id = 'capture-occlusion-control';
            cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:black;pointer-events:none'; document.body.append(cover);
          });
          try { const bad = await measureStepRows(page); assert.throws(() => assertStepIcons(bad)); }
          finally { await page.evaluate(() => document.querySelector('#capture-occlusion-control').remove()); }
        }
        try { assertStepIcons(rows); console.log(`PASS icons ${scenario}`); }
        catch (e) { failures.push(`${scenario}: ${e.message}`); }
      } else {
        for (const f of fx.data.friends) {
          await memberSurface(page, f.playerId);
          const m = await measureCrew(page); m.cards = m.cards.filter(c => c.featured);
          for (const key of ['width', 'height', 'dpr', 'rootFont', 'visualScale', 'userAgent'])
            assert.equal(m.metadata[key], baseline.metadata[key], `Baseline environment mismatch: ${key}`);
          writeFileSync(auditOutputPath(resolve(out, `${kind}-${f.playerId}.json`)), JSON.stringify(m, null, 2) + '\n');
          const check = kind === 'bars' ? assertBars : assertPets;
          // CONTROL a 100px DOM displacement/growth fails against the actual
          // unmutated measurement, even if the approved baseline is already red.
          const style = await page.addStyleTag({ content: kind === 'bars'
            ? '.cfan-card.feat .cfan-plate { height:240px!important }'
            : '.cfan-card.feat .cfan-pet { transform:translateY(100px)!important }' });
          try {
            const bad = await measureCrew(page); bad.cards = bad.cards.filter(c => c.featured);
            assert.throws(() => check(bad, m), 'CONTROL rendered geometry mutation must fail');
          } finally { await style.evaluate(el => el.remove()); }
          try { check(m, baseline); console.log(`PASS ${kind} ${f.playerId}`); }
          catch (e) { failures.push(e.message); }
        }
      }
    }
    if (failures.length) throw new Error(failures.join('\n'));
  } finally { browser.disconnect(); } // operator owns the page/browser lifetime
}
