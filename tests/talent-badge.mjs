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
 * No unspent points in the demo save is an EMPTY SAMPLE: the check did not run,
 * so it fails. It is never skipped and never passed.
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
/* The badge is what we are auditing, so it cannot also be the evidence that there
   is anything to audit. `unspent` comes from the SAME state renderCharacter reads
   (talentPoints(level) - taken), so a missing badge with points unspent is the bug
   this file exists to catch, not a reason to skip. */
const read = () => p.evaluate(async () => {
  const [{ levelFor, totalXp }, { talentPoints }, { kvGet }] =
    await Promise.all([import('./js/game.js'), import('./js/pit.js'), import('./js/db.js')]);
  const t = document.querySelector('.ch-tab[data-tab="talents"]');
  return {
    unspent: Math.max(0, talentPoints(levelFor(await totalXp()).level) - (await kvGet('talents', [])).length),
    badge: t?.querySelector('.ch-badge')?.textContent ?? null,
    nodes: document.querySelectorAll('[data-talent]:not([disabled])').length,
  };
});
const die = async m => { console.log(m); await b.close(); srv.kill(); process.exit(1); };
const before = await read();
console.log('before spending:', JSON.stringify(before));
if (!before.unspent) await die('FAIL: demo save has no unspent talent points, so this check cannot run (empty sample)');
if (Number(before.badge) !== before.unspent) await die(`FAIL  ${before.unspent} unspent point(s) but the badge reads ${JSON.stringify(before.badge)}`);
if (!before.nodes) await die('FAIL: badge shows points but no takeable talent node');
// spend one WITHOUT leaving the tab
await p.evaluate(()=>{ document.querySelector('[data-talent]:not([disabled])')?.click(); });
await sleep(1800);
const after = await read();
console.log('after spending:  ', JSON.stringify(after));
if (after.unspent !== before.unspent - 1) await die(`FAIL  the click did not spend a point (${before.unspent} -> ${after.unspent})`);
// after.unspent is still > 0 here, so the badge must be present and must match it
const ok = Number(after.badge) === after.unspent;
console.log(ok ? 'PASS  the badge updated in place' : `FAIL  badge reads ${JSON.stringify(after.badge)} with ${after.unspent} unspent (was ${before.badge})`);
await b.close(); srv.kill();
process.exit(ok ? 0 : 1);
