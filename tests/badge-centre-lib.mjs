/* THE MEASUREMENT behind tests/badge-centre-audit.mjs. Kept separate so a
 * one-off survey of a screen can reuse it without importing the assertions.
 *
 * WHAT IS MEASURED, and why it is measured this way. A circular badge is a disc
 * with one drawing in it. The defect is the drawing not sitting in the middle of
 * the disc, and there are two independent ways to get there:
 *   LAYOUT  the glyph's BOX is off-centre in the disc. That is CSS, and it is
 *           what produced the "Too fast to loot" bolt: a global `.warn` banner
 *           utility (10px 12px of padding) landed on a 40px border-box disc via
 *           `class="ic warn"`, which left a 10x14 content box, and Chrome pins a
 *           grid item bigger than its area to the START edge instead of centring
 *           it. Top-left, which is exactly the words Tom used about the same
 *           mechanism on the Crew banner.
 *   ART     the glyph's box is centred and the DRAWING inside it is not, because
 *           the ink sits high or to one side of its own canvas.
 * A player cannot tell those apart and neither should the number, so the graded
 * quantity is the INK centroid against the disc's geometric centre, in rendered
 * pixels, and LAYOUT is printed beside it as the diagnosis.
 *
 * THE INK IS TAKEN FROM THE RENDER, NOT FROM THE SOURCE PNG. Captures of the
 * same screen with and without the glyph (`visibility: hidden`, which preserves
 * layout where display:none would not), and the ink is the per-pixel difference.
 * That is two captures per SCREEN rather than per badge, it works identically
 * for a PNG and for an inline SVG, and it needs no reasoning about object-fit,
 * tints, borders or backgrounds: whatever the glyph puts on the glass is what
 * gets weighed. It also cannot be fooled by an <img> that laid out perfectly and
 * never decoded, because an undecoded image contributes no difference at all,
 * which surfaces as NO-INK and is graded as a failure rather than a pass.
 *
 * DECODING HAPPENS IN THE BROWSER. Node ships no PNG decoder and this repo is
 * not adding a dependency for one, so the captures go back into the page as data
 * URLs and canvas reads them. Same pixels either way.
 *
 * THE BADGES ARE HELD BY REFERENCE, NOT RE-FOUND BY RECT, and that is a bug this
 * file already had. The first cut located each badge again before hiding its
 * glyph by matching the rect recorded a moment earlier. On the Boneyard the
 * markers are maplibre elements whose transform is rewritten on every camera
 * frame, so that match landed on a DIFFERENT marker, hid the wrong glyph, and
 * produced a 35% reading for a marker that is centred to 2.3% -- while the
 * stability check said "stable", because the marker it was grading had been
 * fully visible in both bracketing captures. A guard that reads red on correct
 * code is the failure recorded in lessons_guard_samples_wrong_instant, and this
 * was a fresh instance of it. The elements now live in window.__bcEls for the
 * duration of one screen and are addressed by index.
 */
import { sleep } from './godmode.js';

/* A CIRCLE, not a rounded rectangle. Deliberately narrow: `.gbn-ico` on the Crew
   banners is a 38px box at a 10px radius (26%) with the same top-left glyph, and
   that is feedback item v424-7.

   TRIED AND REVERTED 2026-08-23, by the session that then fixed v424-7: setting
   this to 24 does reach `.gbn-ico`, and BOX and INK both stay green on it (the
   banner glyph measures 0.0%). But it also pulls the Boneyard readout disc into
   the sample, which is OCCLUDED on that screen, so COVERAGE goes red with "found
   and NOT graded: COVERED" for a reason that has nothing to do with centring.
   Widening is therefore one number PLUS a decision about occluded discs, not one
   number. v424-7 is guarded in tests/crew-fan-audit.mjs instead, on the real
   banner, and this stays narrow. */
export const ROUND_MIN_PCT = 45;   // border-radius as a % of the box's own size
export const MIN_BADGE_PX = 20;    // below this a "badge" is a bullet, not a disc

/* Find every circular badge on screen, hold the elements, and describe them. */
export const collectBadges = page => page.evaluate((ROUND_MIN_PCT, MIN_BADGE_PX) => {
  const pathOf = el => {
    const bits = [];
    for (let n = el; n && n.tagName !== 'BODY'; n = n.parentElement) {
      bits.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '')
        + (n.classList.length ? '.' + [...n.classList].join('.') : ''));
      if (bits.length >= 3) break;
    }
    return bits.join(' > ');
  };
  const roundPct = (cs, size) => {
    /* Anything that is not ONE uniform radius is not a disc. borderRadius
       resolves to px or to a percentage; both answer the same question once
       divided by the box. */
    const v = cs.borderTopLeftRadius;
    if (v !== cs.borderTopRightRadius || v !== cs.borderBottomLeftRadius || v !== cs.borderBottomRightRadius) return 0;
    if (v.endsWith('%')) return parseFloat(v);
    return size ? parseFloat(v) * 100 / size : 0;
  };
  window.__bcEls = [];
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < MIN_BADGE_PX || Math.abs(r.width - r.height) > 2) continue;
    if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) continue;
    if (roundPct(cs, r.width) < ROUND_MIN_PCT) continue;
    /* ONE DRAWING IN THE DISC. A disc holding text, or a whole scene, or two
       sprites, is not what this grades: "centred" is only well defined for a
       single mark, and a second painting child would pollute the difference
       image. Nested discs (an avatar ring around an avatar ring) fall out by the
       same rule, since the outer one's only child is itself a disc. */
    const kids = [...el.children].filter(k => {
      const kr = k.getBoundingClientRect();
      const kcs = getComputedStyle(k);
      return kr.width > 0 && kr.height > 0 && kcs.visibility !== 'hidden' && kcs.display !== 'none';
    });
    if (kids.length !== 1) continue;
    const g = kids[0];
    const tag = g.tagName.toLowerCase();
    if (tag !== 'img' && tag !== 'svg') continue;
    if ((el.innerText || '').trim()) continue;   // a disc with a letter in it is a monogram
    out.push({
      idx: window.__bcEls.length, path: pathOf(el), tag,
      src: tag === 'img' ? (g.getAttribute('src') || '') : 'inline-svg',
      decoded: tag === 'img' ? (g.naturalWidth > 0) : true,
    });
    window.__bcEls.push([el, g]);
  }
  return out;
}, ROUND_MIN_PCT, MIN_BADGE_PX);

/* Rects, plus a HIT TEST over each disc.
 *
 * THE HIT TEST IS NOT DECORATION, it is the row that makes the ink number mean
 * anything. The ink is weighed as the difference the glyph makes to the glass,
 * so anything drawn ON TOP of the glyph contributes no difference and silently
 * disappears from the centroid. Out on the Boneyard the loot markers are laid
 * over one another and over the dens, the spires, the Glutton and the you-marker,
 * and a half-covered Bone cache came back reading 35.3% on a badge whose box
 * offset is exactly 0.0%: three runs, the same 5.38,-5.10px, reproducible and
 * wrong every time. Reproducible is not the same as correct. Comparing badge
 * rects to each other does not catch it, because most of the things doing the
 * covering are not badges. elementFromPoint over the disc is the repo's own
 * idiom for this (anti-regression rule 6) and it answers the question directly.
 *
 * Sampled inside the INSCRIBED circle at 0.9 of the radius, because a disc's
 * corners belong to whatever is behind it and would report every badge covered. */
const rects = page => page.evaluate(() => (window.__bcEls || []).map(([el, g]) => {
  const r = el.getBoundingClientRect(), gr = g.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2, rad = r.width / 2 * 0.9;
  const coveredBy = [];
  let covered = 0, samples = 0;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const dx = (i / 4 - 0.5) * 2 * rad, dy = (j / 4 - 0.5) * 2 * rad;
      if (dx * dx + dy * dy > rad * rad) continue;
      samples++;
      const hit = document.elementFromPoint(cx + dx, cy + dy);
      /* AN ANCESTOR ON TOP IS NOT A COVER. elementFromPoint honours
         pointer-events, and plenty of decorative badges (the Boneyard readout
         disc among them) are pointer-transparent, so the topmost hit is the
         CONTAINER rather than the badge. That means nothing is painted between
         the badge and the viewer, which is the question being asked. A sibling
         or an unrelated element on top is neither ancestor nor descendant, and
         that is the real cover. Measured: without this arm the bolt itself came
         back COVERED and the audit failed its own COVERAGE row. */
      if (!hit || !(el.contains(hit) || hit.contains(el))) {
        covered++;
        /* NAME THE THING ON TOP. "NOT graded: COVERED" with no culprit is a dead
           end for whoever reads it: the Boneyard readout disc failed this way
           three separate times on 2026-08-27/28 and each time the only route to
           an answer was to re-instrument this line by hand. The occluder is
           right here, so keep it. Deduped, capped, and only ever read on the
           failure path. */
        if (!coveredBy.includes(hit ? hit.tagName : 'null') && coveredBy.length < 4) {
          coveredBy.push(hit
            ? hit.tagName.toLowerCase()
              + (hit.id ? '#' + hit.id : '')
              + (hit.className && hit.className.toString ? '.' + hit.className.toString().trim().split(/\s+/).slice(0, 2).join('.') : '')
            : '(nothing at that point)');
        }
      }
    }
  }
  return { disc: { x: r.x, y: r.y, w: r.width, h: r.height },
    glyph: { x: gr.x, y: gr.y, w: gr.width, h: gr.height }, covered, coveredBy, samples };
}));
const setGlyphVisibility = (page, v) => page.evaluate(vv => { for (const [, g] of window.__bcEls || []) g.style.visibility = vv; }, v);
const shot = async page => 'data:image/png;base64,' + (await page.screenshot({ encoding: 'base64' }));

/* THREE captures, not two: with the glyph, without it, and with it again.
 *
 * The third one is the stability bracket. A badge whose own region differs
 * between the first and third capture, or whose rect moved between them, was in
 * motion while it was being weighed, so its "difference" is partly its own
 * travel. It is returned with stable:false and never graded -- but it is
 * returned, not dropped, because a badge that quietly leaves the sample is how a
 * guard ends up passing on nothing. */
export async function measureScreen(page, screenName) {
  const badges = await collectBadges(page);
  if (!badges.length) return [];
  const r0 = await rects(page);
  const A = await shot(page);
  await setGlyphVisibility(page, 'hidden');
  await sleep(160);
  const B = await shot(page);
  await setGlyphVisibility(page, '');
  await sleep(160);
  const C = await shot(page);
  const r1 = await rects(page);

  const rows = await page.evaluate(async (a, b, c, list, geo) => {
    const load = u => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
    const [ia, ib, ic] = await Promise.all([load(a), load(b), load(c)]);
    const dpr = ia.width / innerWidth;
    const grab = img => {
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, img.width, img.height).data;
    };
    const PA = grab(ia), PB = grab(ib), PC = grab(ic), W = ia.width;
    const d3 = (P, Q, i) => Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]));
    return list.map(r => {
      const d = geo[r.idx].disc;
      const x0 = Math.floor(d.x * dpr), y0 = Math.floor(d.y * dpr);
      const x1 = Math.ceil((d.x + d.w) * dpr), y1 = Math.ceil((d.y + d.h) * dpr);
      let sum = 0, sx = 0, sy = 0, n = 0, drift = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 4;
          if (d3(PA, PC, i) >= 12) drift++;            // moved between the brackets
          const v = d3(PA, PB, i);
          if (v < 12) continue;                        // capture noise, not ink
          sum += v; sx += (x + 0.5) * v; sy += (y + 0.5) * v; n++;
        }
      }
      const cx = (d.x + d.w / 2) * dpr, cy = (d.y + d.h / 2) * dpr;
      return { ...r, dpr, inkPx: n, driftPx: drift,
        ink: sum ? { dx: (sx / sum - cx) / dpr, dy: (sy / sum - cy) / dpr } : null };
    });
  }, A, B, C, badges, r0);

  /* OVERLAPPING DISCS CANNOT BE WEIGHED THIS WAY, and pretending otherwise cost
     a full round here. Every glyph is hidden in the same capture, so if two
     badges overlap, the ink that vanishes inside badge A's rect includes some of
     badge B's drawing and A's centroid is pulled toward B. Out on the Boneyard
     the loot markers routinely sit on top of one another, which is exactly how a
     Bone cache that is centred to 2.3% came back reading 35.3% twice in a row --
     reproducible, and wrong both times. Reproducible is not the same as correct. */
    const overlaps = i => r0.some((o, j) => j !== i
      && o.disc.x < r0[i].disc.x + r0[i].disc.w && o.disc.x + o.disc.w > r0[i].disc.x
      && o.disc.y < r0[i].disc.y + r0[i].disc.h && o.disc.y + o.disc.h > r0[i].disc.y);

  return rows.map(r => {
    const g0 = r0[r.idx], g1 = r1[r.idx];
    const moved = Math.max(Math.abs(g0.disc.x - g1.disc.x), Math.abs(g0.disc.y - g1.disc.y),
      Math.abs(g0.glyph.x - g1.glyph.x), Math.abs(g0.glyph.y - g1.glyph.y));
    const R = g0.disc.w / 2;
    const box = { dx: (g0.glyph.x + g0.glyph.w / 2) - (g0.disc.x + g0.disc.w / 2),
                  dy: (g0.glyph.y + g0.glyph.h / 2) - (g0.disc.y + g0.disc.h / 2) };
    const inkOff = r.ink ? Math.hypot(r.ink.dx, r.ink.dy) : null;
    /* The occluder travels WITH the verdict, so the failure line can name it
       instead of sending the next reader back here to re-instrument. */
    const cov = [...new Set([...(g0.coveredBy || []), ...(g1.coveredBy || [])])].slice(0, 4);
    const why = (g0.covered || g1.covered) ? `COVERED by ${cov.join(', ') || 'something'}`
      : overlaps(r.idx) ? 'OVERLAP'
      : (r.driftPx > 0 || moved >= 0.5) ? 'MOVING'
      : r.ink ? null : 'NO-INK';
    return { screen: screenName, ...r, ...g0, R, box, movedPx: moved, why, graded: !why,
      boxOffPct: Math.hypot(box.dx, box.dy) * 100 / R,
      inkOffPct: inkOff == null ? null : inkOff * 100 / R };
  });
}

/* One key per badge, so the same disc seen on two screens is one thing. The
   disc's POSITION is deliberately not in it: a badge that scrolls is the same
   badge. Its size is, because a 40px disc and a 22px disc are different sites. */
export const keyOf = r => `${r.path}|${r.src.split('/').pop()}|${r.disc.w.toFixed(0)}`;

export const grade = r => (r.why || r.inkOffPct.toFixed(1) + '%');
export const fmt = r => `${grade(r).padStart(7)}`
  + `  ink(${(r.ink ? r.ink.dx : 0).toFixed(2)},${(r.ink ? r.ink.dy : 0).toFixed(2)})px`
  + `  box(${r.box.dx.toFixed(2)},${r.box.dy.toFixed(2)})px=${r.boxOffPct.toFixed(1)}%`
  + `  r=${r.R.toFixed(1)}px  ${r.screen}  ${r.src.split('/').pop()}  ${r.path}`;
