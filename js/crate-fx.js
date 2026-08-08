/* Crate light: the volumetric burst behind a reveal card.
 *
 * A still, uneven ray fan with soft scattered edges, a haze core, and dust
 * drifting up through the beams. The rays never rotate on their own axis —
 * brightness breathes per ray from noise, which is what real light through
 * debris does — but the whole fan drifts slowly clockwise once it lands.
 *
 * Written straight against a WebGL context rather than three.js on purpose:
 * Tally is an offline-capable PWA with no CDN dependencies, and the entire
 * effect is two draw calls and ~250 lines. Callers get a plain handle back and
 * never touch GL state. If the context can't be created (old device, GPU
 * blocklist, too many live contexts) mountCrateBurst returns null and the
 * caller falls back to the CSS haze on .pack-burst.
 */

const RAY_VERT = `
  attribute vec2 aPos;
  varying vec2 vUv;
  void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const RAY_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uAmp, uHaze, uAspect, uReveal;
  uniform vec3 uColor;

  float hash(float n) { return fract(sin(n * 43758.5453123) * 758.5453); }
  float noise1(float x) {
    float i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash(i), hash(i + 1.0), f);
  }

  // one soft-edged wedge fan; feather widens with radius so the rays dissolve
  // instead of ending on a line
  float fan(float ang, float r, float spokes, float feather, float reach) {
    float wobble = (noise1(ang * 7.0) - 0.5) * 0.05 + (noise1(ang * 19.0 + 3.1) - 0.5) * 0.02;
    float a = (ang + wobble) * spokes;
    float s = fract(a), id = floor(a);
    float wide = mix(0.14, 0.32, noise1(id * 1.7));
    float e = feather * (0.35 + r * 1.4);
    float wedge = smoothstep(0.5 - wide - e, 0.5 - wide + e * 0.5, s)
                * (1.0 - smoothstep(0.5 + wide - e * 0.5, 0.5 + wide + e, s));
    float len = reach * (0.7 + 0.6 * noise1(id * 4.3));
    return wedge * (1.0 - smoothstep(len * 0.25, len, r));
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(p) * 1.9;
    float spin = uTime * 0.0085 * uReveal;                 // slow clockwise drift once it lands
    float ang = atan(p.y, p.x) / 6.2831853 + 0.5 - spin;

    float ink = 0.0;
    if (uAmp > 0.001) {
      float sharp = fan(ang, r, 15.0, 0.10, 2.6);
      float soft  = fan(ang, r, 15.0, 0.34, 3.4);          // wide blurred pass under it
      ink = (sharp * 0.40 + soft * 0.34) * uAmp;
      ink *= 0.55 + 0.45 * noise1(ang * 9.0 + uTime * 0.05);
      ink *= exp(-r * 0.68);
    }
    float glow = uHaze * exp(-r * 1.25) * 2.2;             // soft bloom around the mouth

    float vignette = smoothstep(2.55, 0.9, r);             // dissolve long before the quad edge
    float v = clamp((ink + glow) * uReveal * vignette, 0.0, 1.0);
    vec3 col = mix(uColor * 0.9, vec3(0.95, 0.91, 0.84), 0.22);
    gl_FragColor = vec4(col, v * 0.72);
  }
`;

const DUST_VERT = `
  attribute float aSeed;
  attribute float aSize;
  varying float vAlpha;
  uniform float uTime, uReveal;
  void main() {
    float life = fract(aSeed * 7.31 + uTime * (0.008 + fract(aSeed * 3.7) * 0.016));
    float x = (fract(aSeed * 13.7) - 0.5) * 3.4 + sin(life * 2.0 + aSeed * 20.0) * 0.14;
    float y = mix(-1.7, 1.7, life);
    // a radial fade rather than a y-clamp: motes thin out toward the edges of the
    // field instead of ending in a band with a hard cutoff
    float radial = 1.0 - smoothstep(0.35, 1.45, length(vec2(x * 0.6, y * 0.8)));
    vAlpha = sin(life * 3.14159) * radial * uReveal;
    gl_Position = vec4(x, y, 0.0, 1.0);
    gl_PointSize = aSize * (1.0 + 0.4 * sin(aSeed * 30.0));
  }
`;

const DUST_FRAG = `
  precision highp float;
  varying float vAlpha;
  uniform vec3 uColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float m = smoothstep(0.5, 0.0, length(d));
    gl_FragColor = vec4(mix(vec3(0.95, 0.91, 0.84), uColor, 0.45), m * vAlpha * 0.75);
  }
`;

const DUST_COUNT = 90;
// The burst element is deliberately far larger than the screen (the rays have no
// max reach), so a naive dpr-2 backing store runs 4M+ fragments on a phone for a
// picture that is entirely soft gradients. Cap the buffer by area and let it
// scale up; nothing in the image has an edge sharp enough to show it.
const MAX_PIXELS = 1.2e6;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('crate-fx: shader failed', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function program(gl, vertSrc, fragSrc) {
  const v = compile(gl, gl.VERTEX_SHADER, vertSrc), f = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!v || !f) return null;
  const p = gl.createProgram();
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  gl.deleteShader(v); gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('crate-fx: link failed', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

// '#ffc961' -> [1, 0.788, 0.38]
function rgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/* Mount the burst inside `host` (a positioned, pointer-events:none box centred
 * on the card). Returns a handle, or null when WebGL is unavailable.
 *   tune({ color, amp, haze })  re-tint / re-scale for the card now on top
 *   restart(delay)              replay the reveal ramp from now
 *   destroy()                   stop the loop and drop the context
 */
export function mountCrateBurst(host, { color = '#ffc961', amp = 0.5, haze = 0.06, delay = 0 } = {}) {
  if (!host) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'burst-gl';
  const opts = { alpha: true, antialias: true, premultipliedAlpha: false, depth: false, stencil: false, powerPreference: 'low-power' };
  const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  if (!gl) return null;

  const rays = program(gl, RAY_VERT, RAY_FRAG), dust = program(gl, DUST_VERT, DUST_FRAG);
  if (!rays || !dust) return null;
  host.appendChild(canvas);

  // One oversized triangle instead of two: fewer vertices, no diagonal seam.
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const seeds = new Float32Array(DUST_COUNT), sizes = new Float32Array(DUST_COUNT);
  for (let i = 0; i < DUST_COUNT; i++) {
    seeds[i] = (i * 0.137) % 1;
    sizes[i] = 1.4 + ((i * 0.618034) % 1) * 3.2;
  }
  const seedBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf); gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  const sizeBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf); gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);

  const rLoc = {
    pos: gl.getAttribLocation(rays, 'aPos'),
    time: gl.getUniformLocation(rays, 'uTime'), amp: gl.getUniformLocation(rays, 'uAmp'),
    haze: gl.getUniformLocation(rays, 'uHaze'), aspect: gl.getUniformLocation(rays, 'uAspect'),
    reveal: gl.getUniformLocation(rays, 'uReveal'), color: gl.getUniformLocation(rays, 'uColor'),
  };
  const dLoc = {
    seed: gl.getAttribLocation(dust, 'aSeed'), size: gl.getAttribLocation(dust, 'aSize'),
    time: gl.getUniformLocation(dust, 'uTime'), reveal: gl.getUniformLocation(dust, 'uReveal'),
    color: gl.getUniformLocation(dust, 'uColor'),
  };

  const state = { col: rgb(color), amp, haze, delay, aspect: 1 };
  let t0 = performance.now(), raf = 0, dead = false;

  const resize = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    const fit = Math.sqrt(MAX_PIXELS / (w * h));
    const pr = Math.max(0.5, Math.min(devicePixelRatio || 1, 2, fit));
    canvas.width = Math.max(1, Math.round(w * pr));
    canvas.height = Math.max(1, Math.round(h * pr));
    state.aspect = w / h;
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const draw = () => {
    raf = requestAnimationFrame(draw);
    if (gl.isContextLost && gl.isContextLost()) return;
    const t = (performance.now() - t0) / 1000;
    // smoothstep ramp rather than an exponential chase: no sudden onset, no tail
    const k = Math.min(Math.max((t - state.delay) / 1.8, 0), 1);
    const reveal = k * k * (3 - 2 * k);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);

    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(rays);
    gl.uniform1f(rLoc.time, t); gl.uniform1f(rLoc.amp, state.amp); gl.uniform1f(rLoc.haze, state.haze);
    gl.uniform1f(rLoc.aspect, state.aspect); gl.uniform1f(rLoc.reveal, reveal);
    gl.uniform3fv(rLoc.color, state.col);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(rLoc.pos);
    gl.vertexAttribPointer(rLoc.pos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // dust is light on light: additive, so motes brighten the beams they cross
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
    gl.useProgram(dust);
    gl.uniform1f(dLoc.time, t); gl.uniform1f(dLoc.reveal, reveal);
    gl.uniform3fv(dLoc.color, state.col);
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
    gl.enableVertexAttribArray(dLoc.seed);
    gl.vertexAttribPointer(dLoc.seed, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
    gl.enableVertexAttribArray(dLoc.size);
    gl.vertexAttribPointer(dLoc.size, 1, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, DUST_COUNT);
  };

  const onLost = e => { e.preventDefault(); cancelAnimationFrame(raf); canvas.remove(); };
  canvas.addEventListener('webglcontextlost', onLost);

  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(resize); ro.observe(host); }
  resize();
  draw();

  return {
    tune({ color: c, amp: a, haze: h } = {}) {
      if (c) state.col = rgb(c);
      if (a != null) state.amp = a;
      if (h != null) state.haze = h;
    },
    restart(d = 0) { state.delay = d; t0 = performance.now(); },
    destroy() {
      if (dead) return;
      dead = true;
      cancelAnimationFrame(raf);
      ro && ro.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
}
