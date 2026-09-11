// Execute production filtering and painting with a DOM model. No pixel claim.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app = readFileSync(process.argv.find(x => x.startsWith('--source='))?.slice(9) || new URL('../js/app.js', import.meta.url), 'utf8');
const filter = app.slice(app.indexOf('  const fanFriend ='), app.indexOf('  /* Seats every card'));
const paint = app.slice(app.indexOf('  let fanPaintRevision ='), app.indexOf('  const cfanCycle ='));
assert.ok(filter && paint, 'production slices exist');
let passed = 0, failed = 0;
async function run(label, {friends = 7, favourites = false, query = '', stars = [], blank = false, reached = true, pending = false} = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: true, textContent: id === '#cfanEmpty' ? 'Add a friend to start your Crew' : id === '#cfanUnreached' ? 'Could not reach the Crew server. Tap to try again.' : '', innerHTML: '', dataset: {},
      classList: {toggle() {}}, setAttribute() {}, remove() {}, addEventListener() {},
      querySelectorAll() { return [...this.innerHTML.matchAll(/class="cfan-card"/g)]; },
    });
    return nodes.get(id);
  };
  let resolve;
  const wait = new Promise(r => { resolve = r; });
  const ctx = vm.createContext({
    data: {friends: Array.from({length: friends}, (_,i) => ({playerId: String(i), name: `Friend ${i}`})), reached},
    favs: new Set(stars), fanOrder: [], centerId: null, fanQuery: query, fanFavouritesOnly: favourites,
    el: {}, $: node, onlineLabel: () => ({on: false}), snapshotNotice: () => '', crewCount: fs => fs.length,
    crewTruncText: () => '', paintFaves() {}, applyFan() {},
    crewCardHtml: f => blank ? '' : `<button class="cfan-card" data-fan="${f.playerId}"></button>`,
    friendSinceYesterdayMap: () => pending ? wait : Promise.resolve({}),
  });
  vm.runInContext(filter + '\n' + paint + '\nthis.paint = paintFan;', ctx);
  try {
    const painting = ctx.paint();
    if (!pending) await painting;
    const count = node('#cfanDeck').querySelectorAll('.cfan-card').length;
    if (!count) assert.ok(['#cfanNoHit', '#cfanEmpty', '#cfanUnreached'].some(id => !node(id).hidden && node(id).textContent), 'zero cards must carry an explanation');
    else assert.equal(node('#cfanNoHit').hidden, true);
    if (favourites && !stars.length && friends) assert.match(node('#cfanNoHit').textContent, /Filter: favourites/);
    if (query) assert.match(node('#cfanNoHit').textContent, /Clear search/);
    if (!blank && reached && !query && (!favourites || stars.length)) assert.equal(count, favourites ? stars.length : friends);
    resolve({}); await painting;
    passed++; console.log(`PASS ${label}`);
  } catch (e) { resolve({}); failed++; console.log(`FAIL ${label}: ${e.message}`); }
}
await run('empty favourites explain undo', {favourites: true});
await run('search explains undo', {query: 'absent'});
await run('combined filters explain both controls', {query: 'absent', favourites: true});
await run('empty crew', {friends: 0});
await run('CONTROL mounted-result refusal', {blank: true});
await run('cards mount while enrichment is pending', {pending: true});
await run('CONTROL full crew');
await run('CONTROL matching favourite', {favourites: true, stars: ['2']});
await run('unreachable explains failure', {reached: false, friends: 0});
console.log(`CREW EMPTY: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
