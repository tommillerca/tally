// PURE. Run STUDIO_V4_BASELINE=1 against the frozen pre-edit checkout sources.
import assert from 'node:assert/strict';
import { studioArtPath } from './lib/studio-art-path.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { importAuditPackage } from './lib/audit-dependencies.mjs';
const root = new URL('../', import.meta.url), baseline = !!process.env.STUDIO_V4_BASELINE;
const read = p => readFileSync(new URL(p, root), 'utf8');
const source = read(baseline ? 'docs/reviews/studio-v4/baseline-compositor.txt' : 'js/studio.js');
const screen = read(baseline ? 'docs/reviews/studio-v4/baseline-screen.txt' : 'js/studio-screen.js');
if (baseline) {
  for (const [file, expected] of Object.entries(JSON.parse(read('docs/reviews/studio-v4/baseline-sha256.json'))))
    assert.equal(createHash('sha256').update(read('docs/reviews/studio-v4/' + file)).digest('hex'), expected);
}
const url = 'data:text/javascript;base64,' + Buffer.from(source.replace(/from '([^']+)'/g, (_, p) => `from '${new URL(p, new URL('js/studio.js', root)).href}'`)).toString('base64');
const studio = await import(url);
const { createCanvas, loadImage, GlobalFonts } = await importAuditPackage('@napi-rs/canvas');
GlobalFonts.registerFromPath(studioArtPath('assets/fonts/bangers.woff2', root), 'StudioBangers');
GlobalFonts.registerFromPath(studioArtPath('assets/fonts/boldpixels.woff2', root), 'StudioDialogue');
const runtime = { createCanvas, loadImage: p => loadImage(studioArtPath(p, root)), ready: async () => {}, encode: async c => new Blob([await c.encode('png')], { type: 'image/png' }) };
const decode = async blob => { const im = await loadImage(Buffer.from(await blob.arrayBuffer())), c = createCanvas(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0); return c; };
const rgba = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
const hash = c => createHash('sha256').update(rgba(c)).digest('hex');
const edges = c => { const d = rgba(c); let n = 0; for(let i = 3; i < d.length; i += 4) if(d[i] > 0 && d[i] < 255) n++; return n; };
// Outer/hole edge pixels: fractional alpha with an eight-neighbour transparent pixel.
const boundaryEdges = c => {
  const d=rgba(c); let count=0;
  for(let y=0;y<c.height;y++) for(let x=0;x<c.width;x++) {
    const a=d[(y*c.width+x)*4+3]; if(a===0 || a===255) continue;
    let edge=false;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
      const nx=x+dx, ny=y+dy;
      if(nx<0 || nx>=c.width || ny<0 || ny>=c.height || d[(ny*c.width+nx)*4+3]===0) edge=true;
    }
    if(edge) count++;
  }
  return count;
};
let failed = 0;
async function check(name, fn) { try { await fn(); console.log('PASS', name); } catch(e) { failed++; console.log('FAIL', name, e.stack); } }
await check('CONTROL smooth resampling preserves edge softness', async () => {
  // A hard diagonal must gain coverage samples when scaled, unlike nearest neighbour.
  const c = createCanvas(640,640), cx = c.getContext('2d');
  for(let y=0;y<640;y++) { cx.fillStyle='#2A2D28'; cx.fillRect(0,y,y+1,1); }
  const f = {canvas:c, ink:studio.studioInk(c)};
  const r = studio.studioRasterSticker(f,{x:540,y:950,size:180,flip:false},runtime);
  assert.ok(edges(await decode(await runtime.encode(r.art))) > 100, 'scaled diagonal must have partially covered edge pixels');
  assert.doesNotMatch(source + screen, /imageSmoothingEnabled\s*=\s*false/);
  const css = read(baseline ? 'docs/reviews/studio-v4/baseline-css.txt' : 'app.css');
  const originalCss = read('docs/reviews/studio-v4/baseline-css.txt');
  assert.equal(css.split('.studio-preview {')[0], originalCss.split('.studio-preview {')[0],
    'pixel icon rendering and all CSS before Studio are unchanged');
  assert.doesNotMatch(css.slice(css.indexOf('.studio-preview {')), /image-rendering:\s*pixelated/);
});
await check('one flat sticker list without group headings', () => {
  assert.equal((screen.match(/class="studio-sticker-grid studio-art-grid"/g)||[]).length, 1);
  assert.doesNotMatch(screen, /<h2[^>]*>(Monsters|Your Crew|Say it with bones)/);
  assert.doesNotMatch(screen, /<span>\$\{esc\((name|f.label|text)\)\}/);
});
await check('depth steps include figure and pet; decoded overlays remain on top', async () => {
  assert.equal(typeof studio.studioLayerStack, 'function');
  assert.equal(typeof studio.studioMoveLayer, 'function');
  const sticker = {kind:'monster',id:'The Wanderer',x:540,y:950,size:650,flip:false};
  const options = {stickers:[sticker],includePet:true};
  assert.deepEqual(studio.studioLayerStack(options), ['pet','body','sticker-0']);
  studio.studioMoveLayer(options,0,-1); assert.deepEqual(options.layerOrder,['pet','sticker-0','body']);
  studio.studioMoveLayer(options,0,-1); assert.deepEqual(options.layerOrder,['sticker-0','pet','body']);
  studio.studioMoveLayer(options,0,-1); assert.equal(options.layerOrder[0],'sticker-0');
  const look = {outfit:{B:'B0-1'},pet:{id:'C1',shiny:false,morph:'base',wear:null}};
  const back = await studio.composeStudio(look,options,runtime);
  const reopened = await studio.composeStudio(look,JSON.parse(JSON.stringify(options)),runtime);
  assert.equal(hash(await decode(back.blob)),hash(await decode(reopened.blob)));
  studio.studioMoveLayer(options,0,1); studio.studioMoveLayer(options,0,1);
  const front = await studio.composeStudio(look,options,runtime);
  assert.notEqual(hash(await decode(back.blob)),hash(await decode(front.blob)));
  // Independent layering oracle: plain page, supplied ordered surfaces, information last.
  for(const result of [back,front]) {
    const oracle=createCanvas(1080,1920), oc=oracle.getContext('2d');
    oc.drawImage(result.background,0,0);
    for(const id of result.layerOrder) oc.drawImage(result.sceneLayers[id],0,0);
    oc.drawImage(result.foreground,0,0);
    assert.equal(hash(oracle),hash(await decode(result.blob)));
    const live=createCanvas(1080,1920); result.renderLive(live,[sticker]);
    assert.equal(hash(live),hash(oracle));
    const d=rgba(await decode(result.blob)), fg=rgba(result.foreground);
    let cores=0; for(let i=0;i<d.length;i+=4) if(fg[i+3]===255) {
      assert.deepEqual([...d.slice(i,i+3)],[...fg.slice(i,i+3)], 'opaque information remains above the scene'); cores++;
    }
    assert.ok(cores>1000);
    assert.ok(result.markContrast.minimum >= 4.5);
    studio.assertStudioSafe([...result.bounds,...result.information]);
  }
  const overlap = rgba(back.sceneLayers.body), stickerPixels = rgba(back.sceneLayers['sticker-0']);
  const behind = rgba(await decode(back.blob)), above = rgba(await decode(front.blob)), fg = rgba(back.foreground);
  let witnessed = 0;
  for(let i=0;i<behind.length;i+=4) if(overlap[i+3]===255 && stickerPixels[i+3]===255 && fg[i+3]===0) {
    assert.deepEqual([...behind.slice(i,i+3)],[...overlap.slice(i,i+3)]);
    assert.deepEqual([...above.slice(i,i+3)],[...stickerPixels.slice(i,i+3)]); witnessed++;
  }
  assert.ok(witnessed>1000, 'actual figure/sticker occlusion witnessed');
  const removal = {stickers:[sticker, {...sticker}], layerOrder:['sticker-1','pet','sticker-0','body']};
  studio.studioRemoveSticker(removal,0);
  assert.deepEqual(removal.layerOrder,['sticker-0','pet','body']);
  assert.match(screen,/studioForward/); assert.match(screen,/studioBackLayer/);
});
await check('decoded creature edge measurements at both offered endpoints', async () => {
  const regressions = [];
  for(const id of studio.STUDIO_MONSTERS) {
    const sticker={kind:'monster',id,x:540,y:950,size:180,flip:false};
    const f=await studio.studioStickerFigure(sticker,runtime);
    for(const size of [180,650]) {
      const r=studio.studioRasterSticker(f,{...sticker,size},runtime);
      const output=await decode(await runtime.encode(r.art));
      const count=edges(output);
      // Frozen nearest-neighbour outputs, measured before edits. At least 10%
      // more fractional coverage protects real artwork as well as the diagonal.
      const nearest = {'The Wanderer':[1450,19004], 'The Mimic':[996,13026], 'The Glutton':[907,11896], Gwart:[645,8468]}[id][size===180?0:1];
      if (count < nearest * 1.1) regressions.push(`${id} ${size}px lacks coverage improvement`);
      console.log('EDGES',JSON.stringify({id,size,source:edges(f.canvas),decoded:count,sourceBoundary:boundaryEdges(f.canvas),decodedBoundary:boundaryEdges(output)}));
    }
  }
  assert.deepEqual(regressions, [], 'each size must retain more fractional edge coverage than frozen nearest-neighbour');
});
console.log(`${4-failed} passed, ${failed} failed. Browser appearance and gesture feel UNPROVEN.`);
process.exitCode=failed?1:0;
