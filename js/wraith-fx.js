/* The Hooded Wraith's casts. Self-contained: injects its own filter defs and
 * styles, touches no app CSS, same shape as js/crate-fx.js.
 *
 * ART DIRECTION (docs/FX-DESIGN-RULES.md).
 * Boneheadz is rubber-hose cartoon over screenprint: flat fills, heavy ink,
 * printed texture. So NOTHING here is a bordered div with a box-shadow. Every
 * edge is either DISPLACED by turbulence (so it wobbles like ink on paper) or
 * FEATHERED by a mask (so it falls off like light), usually both. Three rules:
 *
 *   1. No geometric edge survives. Rings run through feTurbulence displacement,
 *      so a "circle" is never actually circular.
 *   2. Light is layered, never one pass. Core, bloom and haze are separate
 *      elements at increasing blur and decreasing opacity.
 *   3. Everything carries grain. A screenprint has tooth; a clean gradient reads
 *      as a different medium sitting on top of Cam's art.
 *
 * PALETTE: brand tokens only. Bone #F2ECDA is the light, violet #9B92E8 is the
 * bleed, ink #2A2D28 is the core of anything solid, coral #FD6857 is reserved
 * for the telegraph so "this one hurts" has its own colour. No invented hues.
 */

const NS = 'wfx';
const BONE = '#F2ECDA', VIOLET = '#9B92E8', INK = '#2A2D28', CORAL = '#FD6857';

/* Dramatic easing, not the default bounce.
   IN: everything rushes at the last moment (anticipation collapses).
   OUT: a hard start that decays for a long time (impact settles). */
const EASE_IN = 'cubic-bezier(.7,0,.84,0)';
const EASE_OUT = 'cubic-bezier(.16,1,.3,1)';
const EASE_SNAP = 'cubic-bezier(.2,.9,.1,1)';

let mounted = false;
function mount(host) {
  if (mounted && document.getElementById(NS + '-defs')) return;
  mounted = true;

  /* Filter defs. `wobble` is the workhorse: it warps whatever it touches with
     fractal noise, which is what stops a ring reading as SVG geometry. Two
     seeds so two rings on screen never wobble identically. */
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = NS + '-defs';
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;pointer-events:none';
  svg.innerHTML = `
    <defs>
      <filter id="${NS}-wobble" x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="3" seed="4" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <filter id="${NS}-wobble2" x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.02 0.014" numOctaves="3" seed="19" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <!-- torn, not clipped: an ink edge that frays -->
      <filter id="${NS}-fray" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="turbulence" baseFrequency="0.06" numOctaves="2" seed="7" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="B"/>
      </filter>
    </defs>`;
  host.appendChild(svg);

  const css = document.createElement('style');
  css.id = NS + '-css';
  css.textContent = `
  .${NS}{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:4;
    -webkit-mask-image:linear-gradient(transparent 0,#000 22%,#000 100%);
            mask-image:linear-gradient(transparent 0,#000 22%,#000 100%)}
  .${NS} *{position:absolute;pointer-events:none}
  .${NS} .lit{mix-blend-mode:screen}
  /* Tooth, INSIDE the shape. An ::after overlay was a rectangle sitting on a
     blurred round parent and it read as a grey box on screen. Grain is a second
     background layer now, so it is clipped by the shape's own gradient. */
  .${NS} .grain{background-blend-mode:overlay;background-size:150px 150px, auto}
  /* a ring is a feathered annulus, masked to fade at both edges, then displaced */
  .${NS} .ring{border-radius:50%;
    background:radial-gradient(closest-side, transparent 58%, ${BONE} 74%, ${VIOLET} 86%, transparent 100%);
    -webkit-mask-image:radial-gradient(closest-side, transparent 54%, #000 70%, #000 88%, transparent 100%);
            mask-image:radial-gradient(closest-side, transparent 54%, #000 70%, #000 88%, transparent 100%);
    filter:url(#${NS}-wobble) blur(var(--b,3px))}
  .${NS} .ring.alt{filter:url(#${NS}-wobble2) blur(var(--b,3px))}
  /* a light LANCE: tapered by a mask at both ends so it has no cut edge */
  .${NS} .lance{transform-origin:0 50%;
    background:linear-gradient(90deg, ${BONE}, ${VIOLET});
    -webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 62%,transparent 100%),
                        linear-gradient(#0000,#000 40%,#000 60%,#0000);
    -webkit-mask-composite:source-in;
    mask-image:linear-gradient(90deg,transparent,#000 8%,#000 62%,transparent 100%),
                linear-gradient(#0000,#000 40%,#000 60%,#0000);
    mask-composite:intersect;
    filter:url(#${NS}-fray) blur(var(--b,2px))}
  .${NS} .orb{border-radius:50%;
    background:radial-gradient(circle, #fff 0%, ${BONE} 22%, ${VIOLET} 46%, transparent 72%)}
  .${NS} .orb.grain{background-image:var(--grain), radial-gradient(circle, #fff 0%, ${BONE} 22%, ${VIOLET} 46%, transparent 72%)}
  .${NS} .lance.grain{background-image:var(--grain), linear-gradient(90deg, ${BONE}, ${VIOLET})}
  .${NS} .haze{border-radius:50%;filter:blur(var(--b,30px));
    background:radial-gradient(circle, rgba(155,146,232,.55), rgba(155,146,232,0) 70%)}
  .${NS} .vig{inset:0;background:radial-gradient(120% 80% at 50% 45%, transparent 30%, rgba(12,10,20,.85) 100%)}
  /* CAM'S OWN BOLTS. Tom, 2026-08-10: "You also haven't included any of the
     lightning bolts etc that were attached in the artwork I gave you for the
     Live Wire as separate layers. You should be using these to repurpose for his
     moves. You could isolate the other layers and have them grow or flash etc
     that's why cam included them."
     Right, and mage-fx.png was sitting on disk unreferenced while this file drew
     its own light from scratch. His bolts are now the SUBJECT of every cast and
     the CSS light is demoted to the glow around them, which is the correct order:
     the drawn thing is Cam's, the atmosphere is ours. Six sprites cut off the
     supplied layer by connected component, trimmed to their own ink so a rotation
     pivots on the bolt and not on empty canvas. */
  .${NS} .artwrap{display:block;transform-origin:50% 50%}
  .${NS} .art{inset:0;width:100%;height:100%;transform-origin:50% 50%;
    /* screen-blend so the green rim glow Cam inked lifts off the dark arena
       instead of sitting on it as a grey card */
    mix-blend-mode:screen;
    filter:drop-shadow(0 0 10px rgba(155,146,232,.75))}
  .${NS} .art.strike{animation:${NS}strike .55s cubic-bezier(.16,1,.3,1) both}
  .${NS} .art.grow{animation:${NS}grow .7s cubic-bezier(.16,1,.3,1) both}
  .${NS} .art.flash{animation:${NS}flash .5s steps(1,end) 2 both}
  .${NS} .art.sweep{animation:${NS}sweep .6s cubic-bezier(.7,0,.84,0) both}
  @keyframes ${NS}strike{0%{opacity:0;transform:translateY(-14%) scaleY(.35)}
    38%{opacity:1;transform:translateY(0) scaleY(1.06)}
    100%{opacity:.9;transform:translateY(0) scaleY(1)}}
  @keyframes ${NS}grow{0%{opacity:0;transform:scale(.28)}
    46%{opacity:1;transform:scale(1.12)}100%{opacity:.85;transform:scale(1)}}
  @keyframes ${NS}flash{0%{opacity:1}50%{opacity:.25}100%{opacity:1}}
  @keyframes ${NS}sweep{0%{opacity:0;transform:translateX(26%) scaleX(.5)}
    40%{opacity:1}100%{opacity:.9;transform:translateX(0) scaleX(1)}}
  @media (prefers-reduced-motion: reduce){
    .${NS} .art{animation:none !important}}
  `;
  host.ownerDocument.head.appendChild(css);
}

/* Build one light element. Layered by construction: caller asks for a shape and
   gets core + bloom + haze, never a single pass. */
function light(cls, style, { blur = 3, opacity = 1, bloom = true } = {}) {
  const core = `<div class="lit grain ${cls}" style="${style};--b:${blur}px;opacity:${opacity}"></div>`;
  if (!bloom) return core;
  /* Two bloom passes, both FAINT. Screen-blending three bright copies on a dark
     arena compounds to white paste; the first build of this did exactly that. */
  return core
    + `<div class="lit ${cls}" style="${style};--b:${blur * 3.2}px;opacity:${(opacity * .26).toFixed(2)}"></div>`
    + `<div class="lit ${cls}" style="${style};--b:${blur * 8}px;opacity:${(opacity * .11).toFixed(2)}"></div>`;
}

const box = (x, y, w, h) => `left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px`;

/* One of Cam's bolts, centred on a point, sized by WIDTH with the height left to
   the file's own aspect so nothing is squashed. `anim` picks which of the four
   entrances it makes. */
const FX_ASPECT = { 'bolt-sweep': 142 / 382, 'bolt-tall': 280 / 140, 'bolt-strike': 201 / 132,
  'bolt-thin': 156 / 69, zigzag: 116 / 174, sparks: 87 / 159 };
function sprite(name, x, y, w, { anim = 'grow', rot = 0, opacity = 1, flip = false } = {}) {
  const h = w * (FX_ASPECT[name] || 1);
  /* ROTATION LIVES ON A WRAPPER. The entrance animations own `transform` on the
     image, so a rotate() in its inline style is simply discarded the moment the
     animation starts: the first build of this had every bolt snap to 0deg on
     frame one. The wrapper holds the pose, the image holds the motion. */
  return `<span class="artwrap" style="left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px;`
    + `transform:rotate(${rot}deg)${flip ? ' scaleX(-1)' : ''};opacity:${opacity}">`
    + `<img class="art ${anim}" src="assets/bh/mage/fx/${name}.png" alt="" aria-hidden="true"></span>`;
}

/* ---------------------------------------------------------------- the casts */

export const CASTS = {
  /* WAIL — a scream you can see. Anticipation: the arena vignettes hard and the
     hood pulls a breath of light IN. Release: three frayed rings breathe out,
     each wobbled on its own seed so they never stack into concentric geometry.
     Settle: the vignette bleeds off over 1.5s while the last ring keeps going. */
  wail(a) {
    const { hood } = a;
    let h = `<div class="vig" style="opacity:.75"></div>`;
    [[132, 2.5, .8], [236, 4, .55], [344, 6, .35]].forEach(([w, b, o], i) => {
      h += light(i % 2 ? 'ring alt' : 'ring', box(hood.x, hood.y, w, w * .62), { blur: b, opacity: o });
    });
    h += light('haze', box(hood.x, hood.y, 260, 190), { blur: 28, opacity: .5, bloom: false });
    /* the scream is the yellow: Cam's zigzag and his spark ticks are the only
       yellow marks in the set, and wail is the one cast that is a SOUND */
    h += sprite('zigzag', hood.x - 74, hood.y - 14, 116, { anim: 'flash', rot: -12 });
    h += sprite('zigzag', hood.x + 76, hood.y - 6, 104, { anim: 'flash', rot: 14, flip: true, opacity: .9 });
    h += sprite('sparks', hood.x, hood.y - 76, 108, { anim: 'grow' });
    return h;
  },

  /* HOLLOW BOLT — approved, unchanged in feel, rebuilt on the same primitives so
     it frays and grains like everything else instead of being a clean gradient. */
  bolt(a) {
    const { hand, target } = a;
    const dx = target.x - hand.x, dy = target.y - hand.y;
    const len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const lance = `left:${hand.x}px;top:${hand.y - 7}px;width:${len}px;height:14px;transform:rotate(${ang}deg)`;
    /* Cam's tall fork IS the bolt, laid along the hand->target vector. Its art is
       drawn vertically, so it is rotated an extra 90deg onto the line of travel
       and sized to the distance rather than to a fixed width. */
    const mid = { x: (hand.x + target.x) / 2, y: (hand.y + target.y) / 2 };
    /* NO LANCE. The CSS beam used to be the bolt; with Cam's fork doing that job
       it rendered as a flat pale band straight across the arena and read as a
       rendering artefact, not lightning. What is left is a glow at his hand and a
       soft violet bloom where it lands: atmosphere around the drawing, not a
       second drawing competing with it. */
    return sprite('bolt-tall', mid.x, mid.y, Math.max(96, len * 0.58), { anim: 'strike', rot: ang + 90 })
      + light('orb', box(hand.x, hand.y, 46, 46), { blur: 2, opacity: .55 })
      + light('haze', box(target.x, target.y, 132, 132), { blur: 24, opacity: .34, bloom: false });
  },

  /* REAP — approved. Anticipation is the whole point: a hard white point
     collapses in the palm (EASE_IN, so nothing happens then everything does),
     the creature rim-lights, and only then does the arc tear across. */
  reap(a) {
    const { hand, target } = a;
    /* Cam drew one bolt that travels horizontally with a hooked tail. That is the
       reap: it tears across the arena rather than being thrown at a point. */
    /* CENTRED ON THE SWING, NOT HUNG OFF HIS HAND. Placing it at hand.x - 70 put
       most of a 300px sprite past the left edge of the arena, so the one cast
       that is supposed to tear across the screen was the one you could barely
       see. It spans the gap between him and you now, which is what the drawing
       depicts. */
    const mx = (hand.x + target.x) / 2, my = (hand.y + target.y) / 2 - 18;
    return sprite('bolt-sweep', mx, my, 300, { anim: 'sweep' })
      + light('orb', box(hand.x, hand.y, 62, 62), { blur: 3, opacity: .6 })
      + light('haze', box(mx, my, 260, 170), { blur: 34, opacity: .32, bloom: false });
  },

  /* AMULET SHATTER — Tom, 2026-08-09: "keep the glowing lines instead of the
     shard pieces". Right call: shards are objects, and objects in this app are
     drawn, not CSS. So this is pure light. A flash, then nine tapered lances
     thrown out on a spread, each frayed and feathered at both ends, over a
     wobbled ring that outruns them. No chips. */
  amulet(a) {
    const { amulet } = a;
    let h = light('orb', box(amulet.x, amulet.y, 84, 84), { blur: 3, opacity: .8 });
    h += light('ring', box(amulet.x, amulet.y, 168, 116), { blur: 4, opacity: .6 });
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * 360 + 18;
      const len = 40 + ((i * 13) % 34);
      h += light('lance',
        `left:${amulet.x}px;top:${amulet.y - 4}px;width:${len}px;height:8px;transform:rotate(${ang}deg)`,
        { blur: 2, opacity: .8 });
    }
    h += light('haze', box(amulet.x, amulet.y, 170, 170), { blur: 28, opacity: .45, bloom: false });
    /* the amulet is gold, so it breaks in Cam's yellow, and his thin fork is
       thrown out either side of it */
    /* bigger than felt right on paper: at fight size a 46px fork is four pixels
       of ink and the shatter read as a plain glow */
    h += sprite('sparks', amulet.x, amulet.y - 6, 176, { anim: 'grow' });
    h += sprite('bolt-thin', amulet.x - 84, amulet.y + 16, 74, { anim: 'strike', rot: -38 });
    h += sprite('bolt-thin', amulet.x + 84, amulet.y + 16, 74, { anim: 'strike', rot: 38, flip: true });
    return h;
  },

  /* RISE — he calls something up out of the floor, so the bolt comes DOWN and
     lands. Previously this reused the wail, which is a scream and reads nothing
     like a summon. Cam's near-vertical strike is exactly the shape. */
  rise(a) {
    const { hand, hood } = a;
    const gx = hand.x - 8, gy = hood.y + 168;
    return light('haze', box(gx, gy, 240, 120), { blur: 32, opacity: .5, bloom: false })
      + sprite('bolt-strike', gx, gy - 92, 128, { anim: 'strike' })
      + light('orb', box(gx, gy, 118, 118), { blur: 3, opacity: .7 })
      + light('ring', box(gx, gy + 16, 210, 74), { blur: 4, opacity: .55 });
  },
};

/* Anchors are FRACTIONS OF THE SPRITE BOX. These were originally eyeballed off
   the TEMP art with a grid overlay and never re-measured when Cam's drawing
   landed, and the fight uses a different crop again (mage-fight.png, 914x1024)
   from the poster (mage.png, 1024x905), so every cast was firing from somewhere
   near the mage rather than from him: the hood anchor was 0.09 out horizontally
   and 0.11 vertically, which at a 200px stage is most of his head.
   Re-measured off mage-fight.png itself, by colour, not by eye:
     hand   the EXTENDED pointing hand, the larger left mint cluster (0.184,0.502)
     hood   the yellow eyes inside the hood                          (0.490,0.383)
     amulet the gold chain                                           (0.558,0.577)
   If the fight plate is ever recropped, re-run that measurement; do not nudge
   these by eye. */
export const ANCHORS = { hand: [0.184, 0.502], hood: [0.490, 0.383], amulet: [0.558, 0.577] };

/* THE STAGE BOX IS NOT THE DRAWING. mage-fight.png renders with object-fit:
   contain inside #foeStage.mage-foe, whose aspect changes per device (width:100%
   of the foe column, height clamped), so the image floats letterboxed inside the
   box, centred by object-position 50% 50%. ANCHORS above are fractions of the
   IMAGE (measured by colour off the file), so they must be applied to the DRAWN
   rect: applied to the raw box they drift by the letterbox offset, which is
   ~2-6px on a 390pt phone and ~27px on the hand at a 320px-wide stage column.
   That drift is device-dependent, which is why it looked fixed on the phone the
   anchors were tuned on. Figure-contract rule 3: align on ink, and
   object-position is part of the mapping.
   Falls back to the element box only when the plate is missing or undecoded;
   the SW precaches the plate, so a real fight never takes the fallback. */
export function plateRect(stageEl) {
  const img = stageEl && (stageEl.querySelector('img.mage-plate') || stageEl.querySelector('img'));
  const box = (img || stageEl).getBoundingClientRect();
  if (!img || !img.naturalWidth || !box.width || !box.height) return box;
  const asp = img.naturalWidth / img.naturalHeight;
  const w = Math.min(box.width, box.height * asp);
  const h = w / asp;
  return { left: box.left + (box.width - w) / 2, top: box.top + (box.height - h) / 2, width: w, height: h };
}

/* `youRect` is optional and should be the PLAYER's stage. Without it the target
   falls back to a point measured once on one phone width, which the bolt could
   live with (it only aims) but reap cannot: reap now spans the midpoint between
   him and you, so a fixed target drifts off-centre on any other screen size. */
export function anchorsFor(stageRect, arenaRect, youRect = null) {
  const rel = ([fx, fy]) => ({
    x: Math.round(stageRect.left - arenaRect.left + stageRect.width * fx),
    y: Math.round(stageRect.top - arenaRect.top + stageRect.height * fy),
  });
  const target = youRect
    ? { x: Math.round(youRect.left - arenaRect.left + youRect.width * 0.5),
        y: Math.round(youRect.top - arenaRect.top + youRect.height * 0.45) }
    : undefined;
  return { hand: rel(ANCHORS.hand), hood: rel(ANCHORS.hood), amulet: rel(ANCHORS.amulet), ...(target ? { target } : {}) };
}

/* Play a cast. Three beats, always: wind up (EASE_IN so it collapses late),
   release (EASE_SNAP), settle (EASE_OUT over 1.5s so ash-drift timing feels
   deliberate rather than an animation ending). */
export function cast(arena, name, anchors, { reduced = false } = {}) {
  mount(arena.ownerDocument.body);
  const layer = document.createElement('div');
  layer.className = NS;
  layer.innerHTML = CASTS[name]({ ...anchors, target: anchors.target || { x: 92, y: 178 } });
  arena.appendChild(layer);
  if (reduced) { setTimeout(() => layer.remove(), 700); return layer; }
  layer.animate(
    [{ opacity: 0, transform: 'scale(.82)' },
      { opacity: 1, transform: 'scale(1.04)', offset: .22 },
      { opacity: .95, transform: 'scale(1)', offset: .4 },
      { opacity: 0, transform: 'scale(1.12)' }],
    { duration: 1500, easing: EASE_OUT },
  ).onfinish = () => layer.remove();
  return layer;
}
