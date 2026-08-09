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

/* ---------------------------------------------------------------- the casts */

export const CASTS = {
  /* WAIL — a scream you can see. Anticipation: the arena vignettes hard and the
     hood pulls a breath of light IN. Release: three frayed rings breathe out,
     each wobbled on its own seed so they never stack into concentric geometry.
     Settle: the vignette bleeds off over 1.5s while the last ring keeps going. */
  wail(a) {
    const { hood } = a;
    let h = `<div class="vig" style="opacity:.75"></div>`;
    [[132, 2.5, 1], [236, 4, .8], [344, 6, .5]].forEach(([w, b, o], i) => {
      h += light(i % 2 ? 'ring alt' : 'ring', box(hood.x, hood.y, w, w * .62), { blur: b, opacity: o });
    });
    h += light('haze', box(hood.x, hood.y, 260, 190), { blur: 28, opacity: .6, bloom: false });
    return h;
  },

  /* HOLLOW BOLT — approved, unchanged in feel, rebuilt on the same primitives so
     it frays and grains like everything else instead of being a clean gradient. */
  bolt(a) {
    const { hand, target } = a;
    const dx = target.x - hand.x, dy = target.y - hand.y;
    const len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const lance = `left:${hand.x}px;top:${hand.y - 7}px;width:${len}px;height:14px;transform:rotate(${ang}deg)`;
    return light('lance', lance, { blur: 2 })
      + light('orb', box(hand.x, hand.y, 62, 62), { blur: 2, opacity: .8 })
      + light('orb', box(target.x, target.y, 104, 104), { blur: 3, opacity: .6 })
      + light('haze', box(target.x, target.y, 150, 150), { blur: 26, opacity: .4, bloom: false });
  },

  /* REAP — approved. Anticipation is the whole point: a hard white point
     collapses in the palm (EASE_IN, so nothing happens then everything does),
     the creature rim-lights, and only then does the arc tear across. */
  reap(a) {
    const { hand } = a;
    return light('orb', box(hand.x, hand.y, 88, 88), { blur: 3, opacity: .85 })
      + light('lance', `left:${hand.x - 250}px;top:${hand.y - 96}px;width:300px;height:22px;transform:rotate(-24deg)`, { blur: 3, opacity: 1 })
      + light('haze', box(hand.x - 70, hand.y - 30, 300, 210), { blur: 38, opacity: .42, bloom: false });
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
    return h;
  },
};

/* Anchors are FRACTIONS OF THE SPRITE BOX, measured off Cam's drawing with a
   grid overlay, so they survive any resize and transfer to the final art. */
export const ANCHORS = { hand: [0.26, 0.50], hood: [0.58, 0.27], amulet: [0.62, 0.62] };

export function anchorsFor(stageRect, arenaRect) {
  const rel = ([fx, fy]) => ({
    x: Math.round(stageRect.left - arenaRect.left + stageRect.width * fx),
    y: Math.round(stageRect.top - arenaRect.top + stageRect.height * fy),
  });
  return { hand: rel(ANCHORS.hand), hood: rel(ANCHORS.hood), amulet: rel(ANCHORS.amulet) };
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
