import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url));
const png = read('assets/slime/slime-spritesheet.png');
const meta = JSON.parse(read('assets/slime/slime.json'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(png),'dccf56c7c3a5557437bfd15c1ea99776bdd63fc08c3feb337b4bf5527ae41035');
assert.equal(hash(read('assets/slime/slime.json')),'d94b8cf028a2f4ef6d120d7e62da865592dbf46537c1c816bf7b933fb660353b');
assert.equal(png.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
function checkDimensions(bytes, data) {
  assert.equal(bytes.readUInt32BE(16), data.columns * data.frameWidth);
  assert.equal(bytes.readUInt32BE(20), data.rows * data.frameHeight);
}
checkDimensions(png,meta);
const corrupt = Buffer.from(png);
corrupt.writeUInt32BE(769,16);
assert.throws(() => checkDimensions(corrupt,meta),assert.AssertionError);
assert.throws(() => checkDimensions(png,{...meta,rows:16}),assert.AssertionError);
console.log('PASS CONTROL mismatched PNG width and JSON rows are rejected.');
assert.deepEqual([meta.frameWidth,meta.frameHeight,meta.columns,meta.rows,meta.frameCount,meta.fps,meta.durationSeconds], [48,48,16,15,240,50,4.8]);
assert.equal(meta.frames.length,240);
for (let i=0;i<240;i++) {
  assert.deepEqual(meta.frames[i].frame,{x:i%16*48,y:Math.floor(i/16)*48,w:48,h:48});
  assert.equal(meta.frames[i].duration,20);
  // CSS column and row clocks must select the authored frame at its midpoint.
  const t=(i+.5)/50;
  assert.equal(Math.floor((t%0.32)/0.02),i%16);
  assert.equal(Math.floor(t/0.32),Math.floor(i/16));
}
const css=read('app.css').toString(), app=read('js/app.js').toString();
assert.match(css,/\.ward-head \{ row-gap: 7\.683333px; \}/);
assert.match(css,/slime-columns 0\.32s steps\(16\) infinite/);
assert.match(css,/slime-rows 4\.8s steps\(15\) infinite/);
assert.match(css,/@keyframes slime-columns \{ to \{ background-position-x: -768px; \} \}/);
assert.match(css,/@keyframes slime-rows \{ to \{ background-position-y: -720px; \} \}/);
assert.match(css,/@media \(prefers-reduced-motion: reduce\) \{\s*\.lab-slime \{ animation: none; background-position: 0 0; \}/);
assert.match(css,/\.lab-slime \{[\s\S]*?width: 48px; height: 48px;[\s\S]*?image-rendering: pixelated;/);
const bp=app.slice(app.indexOf("  if (tab === 'crates') {"));
assert.ok(!app.includes('class="lab-egg-help"'), 'Backpack explainer wall removed');
assert.ok(!app.includes('Explore Laboratory recipes'), 'superseded button removed');
const help = app.slice(app.indexOf('<details id="labHelp"'), app.indexOf('</details>', app.indexOf('<details id="labHelp"')));
assert.match(help, /Hatch eggs to discover species/);
assert.match(help, /New eggs hatch Base pets, with the existing rare shiny chance/);
assert.match(help, /Your pets and the colours already stored in your eggs stay yours/);
assert.match(bp,/<button class="lab-banner" type="button" data-lab-open>/);
assert.match(bp,/Spare pets become new colours\./);
const banner = bp.slice(bp.indexOf('<button class="lab-banner"'), bp.indexOf('</button>', bp.indexOf('<button class="lab-banner"')));
const gradeBanner = html => {
  assert.match(html, /THE LABORATORY/);
  assert.match(html, /Spare pets become new colours\./);
  assert.doesNotMatch(html, /Recipes ›|lab-banner-recipes/);
};
gradeBanner(banner);
assert.throws(() => gradeBanner(banner + '<span class="lab-banner-recipes">Recipes ›</span>'), assert.AssertionError);
assert.match(app, /\$\{labRecipesHtml\(s, sp\)\}/);
assert.match(help, /How the recipes work/);
assert.match(app,/\$\$\('\[data-lab-open\]', root\)\.forEach\(b => b.addEventListener\('click', \(\) => openLaboratory\(\)\)\)/);
console.log('PASS slime PNG/JSON dimensions, all 240 authored frames and CSS clocks, reduced motion, fixed art box, Backpack entrance and existing Laboratory route. Browser geometry UNPROVEN.');
