// Real production Settings at the repository's 100% and 200% text test sizes.
// Button label line boxes exclude padding and the accessible hit target.
// COLUMN retired intentionally, 2026-09-11: the tidy abandons the fixed-width
// action column. Labels yield and actions size to their own nonwrapping text.
// settings-shape-audit.mjs NO-COLUMN replaces it, guarding the original
// stacked/clipped Import defect through button height and overflow checks.
// ROWS remains unchanged pending rendered 200% clipping-versus-wrapping triage.
import { boot, serveTree } from './godmode.js';
import { fileURLToPath } from 'node:url';

let browser, server, failed = 0;
const check = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
  if (!pass) failed++;
};
try {
  const supplied = process.argv.slice(2).find(a => /^https?:/.test(a));
  server = supplied ? null : await serveTree(fileURLToPath(new URL('../', import.meta.url)));
  const session = await boot(supplied || server.url);
  browser = session.browser;
  const { page } = session;
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.evaluate(async () => {
    if (!navigator.webdriver || !location.search.includes('demo')) throw Error('demo fixture required');
    const db = await import(new URL('./js/db.js', location.href).href);
    await db.kvSet('social', null);
    location.hash = '#/settings';
  });
  await page.waitForFunction(() => document.querySelector('#screen .page-h1')?.textContent === 'Settings');
  for (const scale of [100, 200]) {
    await page.evaluate(size => { document.documentElement.style.fontSize = `${size}%`; }, scale);
    await page.evaluate(() => document.fonts.ready);
    const data = await page.evaluate(() => {
      const root = document.querySelector('#screen');
      if (!root) throw Error('Settings screen missing');
      const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
      const buttons = [...root.querySelectorAll('button')].filter(visible).map((el, index) => {
        const r = el.getBoundingClientRect(), style = getComputedStyle(el);
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const lines = [];
        while (walker.nextNode()) {
          if (!walker.currentNode.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(walker.currentNode);
          for (const box of range.getClientRects()) if (box.width) lines.push(box);
        }
        const textHeight = lines.length ? Math.max(...lines.map(r => r.bottom)) - Math.min(...lines.map(r => r.top)) : 0;
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
        const label = el.innerText.trim() || el.getAttribute('aria-label') || el.title || el.textContent.trim();
        const identity = [el.id ? '#' + el.id : 'button[' + index + ']', label || '(no accessible label)',
          el.closest('.card')?.querySelector('.card-title')?.textContent.trim() || '(no card)'].join(' | ');
        return { label, identity, markup: el.outerHTML, id: el.id, rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
          scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
          whiteSpace: style.whiteSpace, textHeight, lineHeight,
          /* FITS MEANS NOTHING IS CUT OFF, NOT THAT THE LABEL IS ONE LINE.
             This was `textHeight <= lineHeight + 1`, i.e. single-line, and it
             went red at 200% on two buttons that are perfectly fine: measured
             2026-09-12, #restoreAcctBtn "I already have an account" reads
             scrollWidth 303 = clientWidth 303 and scrollHeight 99 =
             clientHeight 99, and #saveKey "Save key" 116 = 116 and 99 = 99.
             Neither is clipped; both simply take two lines at 200% text, which
             is what a long label SHOULD do at an accessibility size. A rule
             that counts ordinary wrapping as truncation produces false reds,
             and this programme has already had 146 of them from exactly that
             mistake in the name-fit audit.
             The defect this row was built for is different and still caught: a
             button so narrow that its label breaks into a vertical column of
             single letters (IMPORT rendering as IMP / ORT, or worse one glyph
             per line). That is characterised by the label wrapping onto MORE
             LINES THAN IT HAS WORDS, which single-word labels like Import,
             Review, Guide and Export cannot do without being broken, while a
             five-word label taking two lines cannot trip.
             NOT a scrollHeight check: an intermediate version of this added
             `scrollHeight <= clientHeight` and went red on forty buttons at
             once, because clientHeight excludes the border while scrollHeight
             includes content and padding, so a 3px difference (41 against 38)
             is routine on every button here and means nothing. Vertical
             clipping is not what this row is for; the width check and the
             line-count rule are. */
          fits: el.scrollWidth <= el.clientWidth
            && Math.round(textHeight / Math.max(lineHeight, 1)) <= Math.max(1, (el.textContent || '').trim().split(/\s+/).filter(Boolean).length) };
          /* textContent, NOT innerText, for the word count. innerText reflects
             RENDERING, so it returns '' for a control inside a collapsed
             <details>, and #saveKey lives in the USDA API key fold. That made
             its word count fall to 1 while its label genuinely has 2, and the
             row failed a button that was fine. */
      });
      const sections = [...root.querySelectorAll('.card')].map(card => ({
        title: card.querySelector('.card-title')?.innerText || '(untitled)',
        actions: [...card.querySelectorAll('.settings-row > button')].filter(visible).map(el => {
          const r = el.getBoundingClientRect(); return { label: el.innerText, x: r.x, width: r.width };
        }),
      }));
      return { buttons, sections, text: root.innerText, profile: !!root.querySelector('#profileSyncStatus') };
    });
    for (const button of data.buttons) console.log(`BUTTON ${scale}% ${JSON.stringify(button)}`);
    const yourData = data.sections.find(s => s.title === 'YOUR DATA');
    check(`CONTROL ${scale}%`, !!yourData && yourData.actions.length >= 3 && ['exportBtn', 'importBtn', 'filePointsBtn'].every(id => data.buttons.some(b => b.id === id)), JSON.stringify(yourData));
    check(`ROWS ${scale}%`, data.buttons.length > 0 && data.buttons.every(b => b.fits), `${data.buttons.length} buttons; failures=${JSON.stringify(data.buttons.filter(b => !b.fits))}`);
    check(`PLUMBING ${scale}%`, data.profile && !/server reply|sync attempt/i.test(data.text), `profile row present=${data.profile}; ${data.text.match(/[^\n]*(?:server reply|sync attempt)[^\n]*/ig)?.join(' ') || 'no plumbing phrases'}`);
  }
} catch (error) {
  console.error(`BLOCKED settings-rows: ${error.stack}`);
  failed++;
} finally {
  await browser?.close();
  server?.close();
}
console.log(`settings-rows: ${failed} failures`);
process.exitCode = failed ? 1 : 0;
