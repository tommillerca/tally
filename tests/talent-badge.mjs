/* The Build tab's unspent-point badge must drop the moment a point is spent,
 * WITHOUT leaving the tab.
 *
 * THE BUG (Tom, 2026-08-07): "when you spend your talent point in the build tab
 * the notification on build stays until you leave the tab it should go away once
 * the point is spent."
 *
 * CAUSE: the badge is built by renderCharacter (the hub tab strip). Spending
 * calls renderTalents(wrap), which re-renders only the tree so the scroll
 * position survives. Nothing told the tab strip its number had changed.
 *
 * PROVE-RED (confirmed 2026-08-07): drop the syncTalentBadge() call after
 * renderTalents(wrap) in the [data-talent] handler and this reports the badge
 * stuck at its old value.
 *
 * A skip when the demo save has no unspent points is reported, not passed.
 */
import path from 'node:path';
import { loadPuppeteer } from './godmode.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* puppeteer via godmode's loadPuppeteer: the repo's own node_modules first so a
   fresh clone works after `npm install`, the overlay-render-kit as fallback so the
   already-configured machines need no install. Each of these files used to carry
   its OWN copy of a hardcoded path into a sibling project. */
const puppeteer = await loadPuppeteer();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn('python3', ['-m','http.server','8139','--bind','127.0.0.1'], { cwd: ROOT, stdio:'ignore' });
await sleep(900);
const b = await puppeteer.launch({ headless:'new', defaultViewport:{width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true} });
const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://127.0.0.1:8139/?demo', { waitUntil:'networkidle2' });
await sleep(3000);
for (let i=0;i<8;i++){ const h=await p.evaluate(()=>{const rx=/^(spin|nice|done|collect|claim|continue|ok|got it|next|skip)$/i;const x=[...document.querySelectorAll('button')].find(y=>rx.test((y.textContent||'').trim())&&y.getBoundingClientRect().width);if(!x)return false;x.click();return true;}); if(!h)break; await sleep(1000); }
await p.evaluate(()=>{ location.hash='#/bonehead'; });
await sleep(2400);
await p.evaluate(()=>{ const t=[...document.querySelectorAll('.ch-tab')].find(x=>/build/i.test(x.textContent||'')); if(t)t.click(); });
await sleep(2000);
const read = () => p.evaluate(() => {
  const t = document.querySelector('.ch-tab[data-tab="talents"]');
  return { badge: t?.querySelector('.ch-badge')?.textContent ?? null, nodes: document.querySelectorAll('[data-talent]:not([disabled])').length };
});
const before = await read();
console.log('before spending:', JSON.stringify(before));
if (before.badge === null) { console.log('SKIP: no unspent points to spend in the demo save'); await b.close(); srv.kill(); process.exit(0); }
if (!before.nodes) { console.log('FAIL: badge shows points but no takeable talent node'); await b.close(); srv.kill(); process.exit(1); }
// spend one WITHOUT leaving the tab
await p.evaluate(()=>{ document.querySelector('[data-talent]:not([disabled])')?.click(); });
await sleep(1800);
const after = await read();
console.log('after spending:  ', JSON.stringify(after));
const ok = after.badge === null || Number(after.badge) === Number(before.badge) - 1;
console.log(ok ? 'PASS  the badge updated in place' : `FAIL  badge stayed at ${after.badge} (was ${before.badge})`);
await b.close(); srv.kill();
process.exit(ok ? 0 : 1);
