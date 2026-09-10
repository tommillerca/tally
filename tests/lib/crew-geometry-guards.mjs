/* BROWSER only: all inputs must be measured by crew-capture on a live page.
 * A baseline is operator-approved evidence, never synthesized from current CSS.
 */
import assert from 'node:assert/strict';
const finite = n => typeof n === 'number' && Number.isFinite(n);
const positiveBox = b => b && finite(b.width) && finite(b.height) && b.width > 0 && b.height > 0;
export function assertBars(measurement, baseline) {
  assert.equal(measurement.cards.length, 1, 'CONTROL one centered member measurement required');
  const c = measurement.cards[0], b = baseline.cards.find(b => b.playerId === c.playerId);
  assert.ok(c.featured && b?.featured && positiveBox(c.card) && positiveBox(c.bar) && positiveBox(b.card), 'CONTROL rendered centered card/bar and baseline required');
  assert.ok(finite(c.barHeightFraction) && finite(b.barHeightFraction) && finite(c.barWidthFraction) && finite(b.barWidthFraction));
  const hTolerance = 2 / b.card.height, wTolerance = 2 / b.card.width;
  assert.ok(c.barHeightFraction <= b.barHeightFraction + hTolerance,
    `${c.playerId}: bar/card height ${c.barHeightFraction} > approved ${b.barHeightFraction} + ${hTolerance}`);
  assert.ok(Math.abs(c.barWidthFraction - b.barWidthFraction) <= wTolerance,
    `${c.playerId}: bar/card width changed: ${c.barWidthFraction} vs ${b.barWidthFraction}`);
}
export function assertPets(measurement, baseline) {
  assert.equal(measurement.cards.length, 1, 'CONTROL one centered member measurement required');
  const c = measurement.cards[0], b = baseline.cards.find(b => b.playerId === c.playerId);
  assert.ok(c.featured && b?.featured && positiveBox(c.card) && positiveBox(c.pet) && positiveBox(b.pet), 'CONTROL rendered pet and baseline required');
  const tolerance = 2 / b.card.height;
  for (const field of ['petTopFraction', 'petCenterFraction', 'petBottomFraction']) {
    assert.ok(finite(c[field]) && finite(b[field]), `${field}: finite live geometry required`);
    assert.ok(Math.abs(c[field] - b[field]) <= tolerance, `${c.playerId}: ${field} moved ${c[field]} vs ${b[field]}`);
  }
  assert.ok(c.petBarOverlapPx <= b.petBarOverlapPx + 2, `${c.playerId}: plate covers more pet: ${c.petBarOverlapPx}px vs ${b.petBarOverlapPx}px`);
}
export function assertStepIcons(rows) {
  assert.equal(rows.length, 5, 'CONTROL all five ranked rows must be measured');
  assert.equal(rows.filter(r => r.own).length, 1, 'CONTROL own ranked row must be included');
  for (const row of rows) {
    const i = row.icon;
    assert.ok(i.exists && positiveBox(i.box), `rank ${row.rank}: icon absent or zero-sized`);
    assert.ok(i.opacity > 0.05, `rank ${row.rank}: icon transparent`);
    assert.ok(positiveBox(i.clippedBox) && i.clippedBox.width * i.clippedBox.height >= i.box.width * i.box.height * 0.9,
      `rank ${row.rank}: icon clipped or outside viewport`);
    assert.ok(i.art.some(a => a.decoded && a.inkPixels > 0 && a.opacity > 0.05 && positiveBox(a.clippedBox)), `rank ${row.rank}: no decoded, painted artwork`);
    assert.ok(i.visibleInkPixels > 0, `rank ${row.rank}: icon crop contains no raster ink (${i.inkError || 'empty'})`);
    assert.ok(i.overlaps.length === 0 && i.samples.length === 25 && i.samples.every(s => s.hit && !s.covered),
      `rank ${row.rank}: icon covered or unhittable: ${JSON.stringify(i.overlaps)}`);
  }
}
