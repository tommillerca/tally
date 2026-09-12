/* Frozen fix-anim order, 2026-09-08. Execute production render functions and
 * measure actual PNG body widths. CONTROL uses the pre-fix gate, resolver and
 * FILL separately. No browser, playback, offline-fetch or pixel-layout claim.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as art from '../data/boneheadz.js';
import * as animation from '../js/petanim.js';
import { morphAsset, petGrowth } from '../js/pets.js';

const root = new URL('../', import.meta.url);
const app = fs.readFileSync(new URL('js/app.js', root), 'utf8');
const css = fs.readFileSync(new URL('app.css', root), 'utf8');
const sw = fs.readFileSync(new URL('sw.js', root), 'utf8');
const production = name => {
  const match = app.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'));
  assert.ok(match, `production function ${name}`); return match[0];
};
function renderer({ oldGate = false, oldFill = false, anim = animation } = {}) {
  const context = vm.createContext({ ...art, ...anim, morphAsset,
    S: { shinyPets: new Set(), petMorphs: { C1: 'frost' }, petWear: null },
    window: { devicePixelRatio: 2 }, sparkIco: () => '',
  });
  let src = ['staticMassScale', 'petScale', 'croppedPetImg', 'petSpriteHtml', 'petPortraitHtml'].map(production).join('\n');
  src += '\nconst wearOf = wear => wear === undefined ? S.petWear : wear;\nconst petWearsFootball = (id, wear) => petWornTints(id, wearOf(wear)).some(Boolean);';
  if (oldGate) {
    const fixed = '(wearsFootball ? null : animatedPetHtml(petId, S2, petMorph))';
    assert.ok(src.includes(fixed), 'CONTROL gate mutation applied');
    src = src.replace(fixed, '(wearsFootball || morphSrc ? null : animatedPetHtml(petId, S2))');
  }
  if (oldFill) {
    assert.match(src, /const imgSize = restStage[^;]+;/, 'CONTROL fill mutation applied');
    src = src.replace(/const imgSize = restStage[^;]+;/, 'const imgSize = (px * FILL) / Math.max(cw, ch);');
  }
  context.petGrowth = petGrowth; // v589: sprites scale by lineage
  vm.runInContext(src, context);
  return context;
}
const now = renderer();
const morphs = ['ember', 'frost', 'toxic', 'midnight', 'rose'];
function moving(ctx) {
  for (const morph of morphs) {
    const html = ctx.petSpriteHtml('C1', 124, false, { morph, shiny: false, wear: null });
    assert.match(html, /class="petanim"/, `C1 ${morph} animates`);
    for (const layer of ['body-noeyes', 'eyes', 'drop']) {
      assert.ok(html.includes(`assets/bh/anim/morph/C1/${morph}/${layer}.png`));
    }
    for (const [, path] of html.matchAll(/src="([^"]+)"/g)) {
      assert.ok(fs.existsSync(new URL(path, root)), path);
      assert.ok(sw.includes(`'./${path}'`), `${path} precached`);
    }
  }
}
function fallback(api, ctx) {
  for (const [id, name] of [['C3', 'Catfish'], ['C4', 'Beardie']]) {
    assert.ok(api.MORPH_ANIMATION_FALLBACKS?.[id]?.includes(name), `${name} failed layer model is NAMED`);
    for (const morph of morphs) {
      assert.equal(api.animatedPetHtml(id, 124, morph), null);
      const html = ctx.petSpriteHtml(id, 124, false, { morph, shiny: false, wear: null });
      assert.ok(!html.includes('class="petanim"'));
      assert.ok(html.includes(`C/morph/${id}__${morph}.png`));
    }
  }
}
moving(now); fallback(animation, now);
assert.throws(() => moving(renderer({ oldGate: true })), /C1 ember animates/);
// Today's resolver has no named fallback and ignores a third morph argument.
const oldResolver = { ...animation, MORPH_ANIMATION_FALLBACKS: undefined,
  animatedPetHtml: (id, px) => animation.animatedPetHtml(id, px) };
assert.throws(() => fallback(oldResolver, renderer({ anim: oldResolver })), /Catfish.*NAMED/);
const blindResolver = { ...animation, animatedPetHtml: oldResolver.animatedPetHtml };
assert.throws(() => fallback(blindResolver, renderer({ anim: blindResolver })));
console.log('PASS MORPH-PATH, NAMED-FALLBACK; pre-fix gate/resolver CONTROL rejected');

const check = spawnSync('python3', [fileURLToPath(new URL('scripts/build-pet-morph-layers.py', root)), '--check'], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stdout + check.stderr);
const measurements = JSON.parse(check.stdout);
const helmet = Object.values(art.BH_BY_ID).find(x => x.slot === 'CH' && x.football);
const jersey = Object.values(art.BH_BY_ID).find(x => x.slot === 'CT' && x.football);
assert.ok(helmet && jersey, 'real football garments');
const kit = { CH: helmet.id, CT: jersey.id };
function size(ctx) {
  for (const [id, stage, family] of [['C1', 222, 'cloud'], ['C3', 261, 'catfish'], ['C4', 273, 'lizard'], ['CX', 273, 'lizard']]) {
    assert.ok(css.includes(`.pa-${family} { width: ${stage}px;`), 'CSS stage agrees');
    for (const px of [48, 76, 124, 192]) for (const mass of [false, true]) for (const ground of [false, true]) {
      const requested = mass ? Math.round(px * ctx.petScale(id)) : px;
      const base = animation.animatedPetHtml(id, requested);
      const scale = Number(base.match(/transform:scale\(([^)]+)\)/)[1]);
      const baseline = measurements.body_widths[id].animated * scale;
      for (const wear of [null, kit]) for (const morph of ['base', ...morphs]) {
        const html = ctx.croppedPetImg(id, requested, ground, morphAsset(id, morph), wear, null, true);
        const percent = Number(html.match(/left:0;top:0;width:([\d.]+)%/)[1]);
        const width = measurements.body_widths[id].static * requested * percent / 100 / 640;
        assert.ok(Math.abs(width / baseline - 1) <= .01, `${id} neutral-rest width ${width} vs ${baseline}`);
        // Both image dimensions and every garment inherit one scalar geometry.
        const geos = [...html.matchAll(/left:0;top:0;width:([\d.]+)%;height:([\d.]+)%/g)];
        assert.ok(geos.length > 0);
        for (const g of geos) { assert.equal(g[1], g[2]); assert.equal(g[1], geos[0][1]); }
      }
      for (const morph of morphs) {
        const sprite = ctx.petSpriteHtml(id, px, ground, { mass, morph, shiny: false, wear: null });
        if (id === 'C3' || id === 'C4') {
          assert.equal(sprite, ctx.croppedPetImg(id, requested, ground, morphAsset(id, morph), null, undefined, true));
        } else {
          assert.equal(Number(sprite.match(/transform:scale\(([^)]+)\)/)[1]), scale);
        }
      }
      if (id === 'C4' || id === 'CX') {
        const dressed = ctx.petSpriteHtml(id, px, ground, { mass, morph: 'frost', shiny: false, wear: kit });
        assert.ok(dressed.includes('fb-tint') && !dressed.includes('class="petanim"'));
        const expected = ctx.croppedPetImg(id, requested, ground, morphAsset(id, 'frost'), kit, undefined, true);
        assert.equal(dressed, expected, 'sprite fallback uses rest geometry with garments');
      }
    }
  }
}
size(now);
assert.throws(() => size(renderer({ oldFill: true })), /neutral-rest width/);
console.log('PASS REST-WIDTH: largest alpha > 8 body component, neutral t=0, 1% tolerance; pre-fix FILL CONTROL rejected');
console.log('PASS LAYERS: 15 reproducible PNGs, unchanged alpha/ink, approved source transfers');

for (const id of ['C1', 'C3', 'C4', 'CX']) {
  const base = now.petSpriteHtml(id, 124, false, { morph: 'base', wear: null, shiny: false });
  assert.match(base, /class="petanim"/);
  const shiny = now.petSpriteHtml(id, 124, false, { morph: 'frost', wear: null, shiny: true });
  assert.match(shiny, /class="petanim"/); assert.ok(!shiny.includes('/morph/'));
  if (id === 'CX') assert.ok(shiny.includes('lizard-amethyst'));
  const portrait = now.petPortraitHtml(id, 124, false, { morph: 'frost', wear: null });
  assert.ok(!portrait.includes('class="petanim"'));
}
assert.match(now.petSpriteHtml('C1', 124, false, { shiny: false }), /morph\/C1\/frost/);
assert.equal(animation.animatedPetHtml('C1', 124, '../../bad'), animation.animatedPetHtml('C1', 124));
const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {', css.indexOf('.code-line')));
assert.match(reduced, /\*, \*::before, \*::after \{[^}]*animation-duration: 0\.001s !important;[^}]*animation-iteration-count: 1 !important;[^}]*animation-delay: 0s !important;/);
console.log('PASS PRESERVE: base, CX, shiny priority, football, cached morph, static portraits, reduced-motion CSS');
