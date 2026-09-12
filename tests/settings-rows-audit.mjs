// Real production Settings at the repository's 100% and 200% text test sizes.
// Button label line boxes exclude padding and the accessible hit target.
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
    const db = await import('/js/db.js');
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
      const buttons = [...root.querySelectorAll('button')].filter(visible).map(el => {
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
        return { label: el.innerText.trim(), id: el.id, rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, textHeight, lineHeight,
          fits: textHeight <= lineHeight + 1 && el.scrollWidth <= el.clientWidth };
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
    check(`ROWS ${scale}%`, data.buttons.length > 0 && data.buttons.every(b => b.fits), `${data.buttons.length} buttons; failures=${data.buttons.filter(b => !b.fits).map(b => b.label).join(', ')}`);
    const columns = data.sections.filter(s => s.actions.length >= 2);
    check(`COLUMN ${scale}%`, columns.length > 0 && columns.every(s =>
      Math.max(...s.actions.map(a => a.x)) - Math.min(...s.actions.map(a => a.x)) <= 1 &&
      Math.max(...s.actions.map(a => a.width)) - Math.min(...s.actions.map(a => a.width)) <= 1), JSON.stringify(columns));
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
