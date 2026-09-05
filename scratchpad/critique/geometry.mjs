/* Assessment-B geometry evidence for #fbSect at two widths. NOT a test.
 * Run: HEADLESS_MODE=shell node scratchpad/critique/geometry.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, settle, setWidth, serveTree, sleep } from '../../tests/godmode.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

async function measureAt(page, width, height) {
  await setWidth(page, width, height);
  await settle(page);
  await page.evaluate(() => { const el = document.getElementById('fbSect'); if (el && !el.open) el.open = true; });
  await settle(page);

  return page.evaluate(() => {
    const rectOf = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) }; };
    const fbSect = document.getElementById('fbSect');
    const summary = fbSect?.querySelector(':scope > summary.t3-drop.fb-drop');
    const hero = fbSect?.querySelector('.fb-hero');
    const tx = fbSect?.querySelector('.tx');
    const priceEl = fbSect?.querySelector('.fb-drop .t3-price');
    const priceRect = priceEl ? priceEl.getBoundingClientRect() : null;
    const priceLineHeight = priceEl ? parseFloat(getComputedStyle(priceEl).lineHeight) : null;
    const discs = [...(fbSect?.querySelectorAll('.fb-swatch.xs') || [])];
    const discRects = discs.map(d => d.getBoundingClientRect());
    const txRect = tx ? tx.getBoundingClientRect() : null;
    const fbTeam = document.getElementById('fbTeam');
    const dropBuys = [...(fbSect?.querySelectorAll('.drop-buy') || [])];

    return {
      poster_summary_rect: rectOf(summary),
      fb_hero_rect: rectOf(hero),
      tx_rect: rectOf(tx),
      price_chip: priceRect ? {
        rect: { width: +priceRect.width.toFixed(1), height: +priceRect.height.toFixed(1) },
        line_height_px: priceLineHeight,
        ratio_height_to_lineheight: +(priceRect.height / priceLineHeight).toFixed(2),
        one_line: priceRect.height < priceLineHeight * 1.5,
      } : null,
      discs: {
        count: discs.length,
        each_size: discRects.length ? { width: +discRects[0].width.toFixed(2), height: +discRects[0].height.toFixed(2) } : null,
        all_same_size: discRects.every(r => Math.abs(r.width - discRects[0].width) < 0.5 && Math.abs(r.height - discRects[0].height) < 0.5),
        last_disc_right_edge: discRects.length ? +discRects[discRects.length - 1].right.toFixed(1) : null,
        tx_right_edge: txRect ? +txRect.right.toFixed(1) : null,
        fits_inside_tx: (discRects.length && txRect) ? (discRects[discRects.length - 1].right <= txRect.right + 0.5) : null,
        overflow_px: (discRects.length && txRect) ? +(discRects[discRects.length - 1].right - txRect.right).toFixed(1) : null,
      },
      tap_targets: {
        summary_whole_poster: rectOf(summary),
        fbTeam_select: rectOf(fbTeam),
        drop_buy_buttons: dropBuys.map(b => ({ label: (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30), disabled: b.disabled, ...rectOf(b) })),
      },
      aria: {
        summary_tag: summary?.tagName.toLowerCase(),
        summary_role_implicit: summary ? 'native <summary> inside <details> -- implicit disclosure widget, exposed to AT as a button-like control that toggles the details element; no explicit role/aria-expanded needed per HTML AAM' : null,
        summary_has_explicit_aria_expanded: summary ? summary.hasAttribute('aria-expanded') : null,
        summary_aria_label: summary?.getAttribute('aria-label'),
        details_open: fbSect?.open,
        fbTeam_aria_label: fbTeam?.getAttribute('aria-label'),
        fb_teams_role_img: fbSect?.querySelector('.fb-teams')?.getAttribute('role'),
        fb_teams_aria_label: fbSect?.querySelector('.fb-teams')?.getAttribute('aria-label'),
      },
    };
  });
}

async function main() {
  const srv = await serveTree(ROOT);
  const { browser, page } = await boot(srv.url);
  page.on('pageerror', e => console.error('PAGEERROR', e.message));
  const out = {};
  try {
    await seed(page, { level: 20, coins: 400000 });
    await page.evaluate(() => { location.hash = '#/shop'; });
    await sleep(3200);
    await settle(page);

    for (const [w, h] of [[390, 844], [375, 667]]) {
      out[`${w}x${h}`] = await measureAt(page, w, h);
    }

    fs.writeFileSync(path.join(HERE, 'geometry.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await browser.close();
    srv.close?.();
    console.log('done');
  }
}

main().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
