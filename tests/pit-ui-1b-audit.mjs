import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const source = app.match(/function pitOpponentPortrait\(cfg\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(source, 'SETUP Pit rows need the live opponent portrait renderer');
const ctx = {
  headshotHtml: (eq, px) => JSON.stringify({eq, px}),
  foeOutfitFor: name => ({name}), gluttonStageHtml: () => 'GLUTTON',
  mimicPlateHtml: () => 'MIMIC', WANDERER_ART: 'wanderer.png',
};
function render(code, cfg) { return vm.runInNewContext(code + '\npitOpponentPortrait(cfg)', {...ctx, cfg}); }
const look = {SK: 'actual-skull', C: 'species-only'};
assert.ok(render(source, {name: 'Sam', foeOutfit: look}).includes(JSON.stringify({eq: look, px: 52})));
assert.ok(render(source, {name: 'Loose Bones'}).includes('Loose Bones'));
for (const [flag, marker] of [['glutton','GLUTTON'],['mimic','MIMIC'],['mage','mage-fight.png'],['wanderer','wanderer.png']]) {
  assert.ok(render(source, {[flag]: true}).includes(marker), flag);
}
const pit = app.slice(app.indexOf('async function renderPit('), app.indexOf('function endlessFightCfg('));
for (const binding of ['pitOpponentPortrait({ name })', 'pitOpponentPortrait({ name: r.name })', 'pitOpponentPortrait({ name: CHAMPION.name })', 'pitOpponentPortrait(endlessFightCfg(fightFoe))', "foeOutfit: themedLook(rDen.theme && rDen.theme.key, rDen.id)"]) assert.ok(pit.includes(binding), binding);
assert.match(pit, /Rank \$\{fightRank\} ·/);
assert.match(pit, /Rung \$\{r.rung\} ·/);
assert.match(pit, /id="buildBtn"[^\n]+pixCur\('build'/);
// CONTROL: dropping the explicit outfit must reject the real opponent identity.
const broken = source.replace('cfg.foeOutfit || ', '');
assert.notEqual(broken, source);
assert.throws(() => assert.ok(render(broken, {name: 'Sam', foeOutfit: look}).includes(JSON.stringify({eq: look, px: 52}))), assert.AssertionError);
console.log('PASS Pit 1B: live outfits, all special figures, five row bindings, supporting ranks and distinct Build');
console.log('PASS CONTROL: lost opponent outfit rejected');
