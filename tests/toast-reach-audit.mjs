/* A toast clears visible, reachable controls on every route.
 * CLEAR previously treated any stage overlap as a collision. That cannot be
 * satisfied for a 592-707px Studio stage or a 480x480 Shop container button.
 * Count every overlap with controls <=160px tall, and overlaps covering >=25%
 * of a larger control's original area. Thus ordinary rows always count, while
 * a small toast over a full-screen stage does not. No element-name exclusions.
 * CONTROL reports the measured count, including large stages, on every route.
 * VISIBLE prevents offscreen/hidden toasts from producing vacuous CLEAR passes.
 * POLICY keeps z-index 320 and pointer-events none. The real queue is exercised.
 * TOAST_SHIPPED_96=1 restores the old seat via CSS for the red control run.
 * Dedicated map and Today audits remain active for map-card and door coverage.
 */
import { boot, serveTree, sleep, setWidth, dismissOverlays } from './godmode.js';
import { fileURLToPath } from 'node:url';
const srv = await serveTree(fileURLToPath(new URL('..', import.meta.url)));
let fails = 0;
const ok = (row, pass, detail) => { if (!pass) fails++; console.log(`${pass ? 'PASS' : 'FAIL'} ${row} ${detail}`); };
let browser;
try {
  const session = await boot(srv.url);
  browser = session.browser;
  const page = session.page;
  for (const [w, h] of [[375, 812], [430, 932]]) {
    await setWidth(page, w, h);
    for (const route of ['today', 'friends', 'foods', 'bonehead', 'shop', 'studio', 'progress', 'settings', 'boneyard']) {
      await dismissOverlays(page);
      await page.evaluate(route => { location.hash = '#/' + route; }, route);
      await sleep(2600);
      await dismissOverlays(page);
      if (process.env.TOAST_SHIPPED_96 === '1') await page.addStyleTag({ content: 'body #toast.toast { top:auto!important; bottom:calc(var(--sab) + 96px)!important; }' });
      const m = await page.evaluate(async () => {
        window.__toast('Tip: back up your log (Settings, Export)', 1200);
        await new Promise(r => setTimeout(r, 500));
        const toast = document.querySelector('#toast'), b = toast.getBoundingClientRect(), ts = getComputedStyle(toast);
        const selector = 'button, a[href], input, select, textarea, summary, [role="button"], [tabindex], .map-act';
        // renderSettings receives #screen and writes el.innerHTML, just like
        // the other routes. A positive global count alone could be shell nav
        // on an empty route. Keep CONTROL until browser evidence identifies
        // why route controls were rejected; expose ownership in failed rows.
        const controls = [...document.querySelectorAll(selector)].flatMap(el => {
          if (toast.contains(el) || el.closest('[hidden], [inert]')) return [];
          const r = el.getBoundingClientRect(), s = getComputedStyle(el);
          if (!r.width || !r.height || s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return [];
          let x = Math.max(0, r.left), y = Math.max(0, r.top), right = Math.min(innerWidth, r.right), bottom = Math.min(innerHeight, r.bottom);
          for (let p = el.parentElement; p; p = p.parentElement) {
            const ps = getComputedStyle(p), pr = p.getBoundingClientRect();
            if (/(auto|scroll|hidden|clip)/.test(ps.overflowX)) { x = Math.max(x, pr.left); right = Math.min(right, pr.right); }
            if (/(auto|scroll|hidden|clip)/.test(ps.overflowY)) { y = Math.max(y, pr.top); bottom = Math.min(bottom, pr.bottom); }
          }
          if (right <= x || bottom <= y) return [];
          const hit = document.elementFromPoint((x + right) / 2, (y + bottom) / 2);
          if (!hit || !(el.contains(hit) || hit.contains(el))) return [];
          const overlap = Math.max(0, Math.min(b.right, right) - Math.max(b.left, x)) * Math.max(0, Math.min(b.bottom, bottom) - Math.max(b.top, y));
          return [{ screen: !!el.closest('#screen'), name: el.id || el.textContent.trim().slice(0, 35) || el.tagName, y, height: r.height, collision: overlap > 0 && (r.height <= 160 || overlap / (r.width * r.height) >= .25) }];
        });
        return { controls, renderedScreenControls: document.querySelector('#screen')?.querySelectorAll(selector).length || 0, toast: { y: b.y, height: b.height }, visible: !toast.hidden && ts.visibility !== 'hidden' && +ts.opacity > 0 && b.width > 100 && b.height > 20 && b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, policy: ts.zIndex === '320' && ts.pointerEvents === 'none' };
      });
      const label = `${route} ${w}x${h}`;
      ok('CONTROL', m.controls.some(c => c.screen), `${label} count=${m.controls.length} screen=${m.controls.filter(c => c.screen).length} renderedScreen=${m.renderedScreenControls}${m.controls.some(c => c.screen) ? '' : ` reachable=${JSON.stringify(m.controls.map(c => c.name))}`}`);
      ok('VISIBLE', m.visible, `${label} ${JSON.stringify(m.toast)}`);
      const hits = m.controls.filter(c => c.collision);
      ok('CLEAR', !hits.length, `${label} ${JSON.stringify(hits)}`);
      ok('POLICY', m.policy, label);
      await sleep(1500);
    }
  }
} finally { if (browser) await browser.close(); srv.close(); }
process.exitCode = fails ? 1 : 0;
