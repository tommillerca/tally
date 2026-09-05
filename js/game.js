// Gamification: XP, levels, badges, and Apple Health payload parsing.
// XP events are append-only rows in the 'xp' store, keyed for idempotency:
// awarding the same key twice is a no-op, so backfills and retries are safe.

import { db, kvGet, kvSet, claimDay } from './db.js';
import { dayTotals, addDays, dateKey, streakFrom } from './nutrition.js';
import { grantCrate, grantConsumable, coinsAdd, boneDustAdd, grantEgg, equipped } from './loot.js';
import { gardenState, clearGarden, PLOT_PRICES, PLOTS_FREE, HARVEST_BASE, HARVEST_BASE_RARE } from './garden.js';
import { grantIngredient } from './cooking.js';
import { BH_SLOTS } from '../data/boneheadz.js';

// Streak counts logged days PLUS days a Streak Freeze protected back when the
// item existed. Freezes were retired in v253, but these markers stay honoured:
// removing an item must not retroactively break a streak someone really kept.
export function streakDateSet(log, xpRows) {
  const set = new Set(log.map(e => e.date));
  for (const r of xpRows) if (r.type === 'freeze') set.add(r.date);
  return set;
}

export const LEVEL_NAMES = [
  'Rookie Logger', 'Snack Scout', 'Barcode Cadet', 'Portion Padawan', 'Macro Apprentice',
  'Kitchen Chemist', 'Protein Prefect', 'Streak Runner', 'Label Sleuth', 'Calorie Cartographer',
  'Meal Strategist', 'Macro Machinist', 'Data Gourmet', 'Trend Tamer', 'Deficit Architect',
  'Gainz Engineer', 'Nutrition Ninja', 'Macro Wizard', 'Legendary Logger', 'Bone Grandmaster',
];

export function xpForLevel(L) {
  if (L <= 1) return 0;
  return Math.round((120 * Math.pow(L - 1, 1.55) + 80 * (L - 1)) / 10) * 10;
}

export function levelFor(xp) {
  let L = 1;
  while (xpForLevel(L + 1) <= xp) L++;
  const cur = xpForLevel(L), next = xpForLevel(L + 1);
  return {
    level: L,
    name: L <= LEVEL_NAMES.length ? LEVEL_NAMES[L - 1] : `${LEVEL_NAMES[LEVEL_NAMES.length - 1]} ${L}`,
    into: xp - cur,
    need: next - cur,
    pct: Math.max(0, Math.min(100, Math.round(((xp - cur) / (next - cur)) * 100))),
    nextAt: next,
    total: xp,
  };
}

/* THE RUNNING XP TOTAL, AND WHY IT IS ALLOWED TO EXIST.
 *
 * totalXp() used to be db.all('xp') plus a reduce, and award() called it on EVERY
 * reward. Measured in Chrome on this container against the real store: a full scan
 * cost 4.4ms at 900 rows (a month), 24ms at 5400 (six months) and 33ms at 10950
 * (a year), and one award cost 4.9 / 28 / 35ms across the same three. Linear in
 * rows, and rewards fire in BURSTS (a fight win is award plus coins plus gear plus
 * quests plus badges), on a phone that is 5 to 8x slower than this machine. Worse,
 * initGameIfNeeded replays ~1900 awards against a store that is growing under it,
 * so the retroactive backfill was quadratic.
 *
 * So the sum is cached, IN MEMORY ONLY, stamped with the xp store's write epoch
 * from js/db.js. Nothing is persisted, which deletes a whole class of bug up
 * front: a cached total cannot outlive the process, so no interrupted write, no
 * quota failure and no half-finished restore can ever leave a WRONG number sitting
 * on disk for the next boot to believe. The worst case is a cold cache, and a cold
 * cache costs exactly one full scan, once, and then rebuilds itself from the truth.
 *
 * A CACHED NUMBER THAT CANNOT BE CHECKED IS JUST A FAST WRONG NUMBER, so the cache
 * is only used when its epoch still matches db.epoch('xp'). db.js stamps that epoch
 * on every put, delete and clear against the store, before the write is dispatched,
 * so a write that then fails still invalidates. That covers every way it can drift:
 *   - interrupted write: db.put stamps a new epoch, so if the tab dies before the
 *     running total is updated the cache is already disowned and the next read
 *     rebuilds from the rows that actually committed.
 *   - import: importAll stamps every store inside its own all-or-nothing
 *     transaction, so a restored save recomputes from what it actually got.
 *   - erase / clear / any raw db.del: same stamp, same rebuild.
 *   - a different database (useDbName, the ?demo save): stamps move too.
 * The two in-place puts in this file (friendbattle tagging, levelup claimed flag)
 * re-put a row award() already counted, so they cost a rebuild and stay correct;
 * neither changes .xp, and xp rows are append-only by design (see the file header).
 *
 * DIRECTION AND BOUND, measured in Chrome on this container against the REAL burst
 * (award then coins, coins being kvSet, thirty in a row on a page with nothing else
 * touching IndexedDB), at 900 / 5400 / 10950 xp rows:
 *     original scan-per-award   4.9 / 28 / 35 ms, one full scan per award
 *     shared-counter version    10.1 / 25.0 / 38.3 ms, 28 of 30 awards still scanned
 *     now                       1.1 / 1.3 / 1.5 ms, ZERO scans
 * award() does not scan the xp store on the warm path at any row count, and the
 * cost stops tracking the store. The middle row is the version that looked fixed
 * and was not: see the PER STORE note in js/db.js.
 *
 * tests/xp-total-audit.mjs pins both halves against that same interleaved burst:
 * the SHAPE (full scans of the xp store do not grow with row count) and the TRUTH
 * (the cached total equals a from-scratch recount after every single award).
 */
let xpCache = null; // { v, epoch }

// The truth, and the only thing that ever produces a total it did not add up itself.
export async function rebuildXpTotal() {
  const epoch = db.epoch('xp');
  const rows = await db.all('xp');
  xpCache = { v: rows.reduce((a, r) => a + (r.xp || 0), 0), epoch };
  return xpCache.v;
}

export async function totalXp() {
  if (xpCache && xpCache.epoch === db.epoch('xp')) return xpCache.v;
  return rebuildXpTotal();
}

// Idempotent award. Returns the xp granted (0 if this key already exists).
let quietLevelups = false; // backfills replay history; they must not celebrate or drop loot

/* WHAT A REPEATABLE ACTION IS ALLOWED TO PAY IN ONE DAY.
   These exist because six call sites built their award key out of Date.now(),
   which defeats the entire point of award(): the key is what stops a reward
   being claimed twice, and a fresh timestamp is a fresh key every single call.
   So Pit wins, harvests, cooks and siege breaks had NO cap and NO dedupe, and a
   player could farm them forever. Found 2026-08-16 chasing a level 80 account
   whose device logged 214 Pit wins in one day, 200 the day before and 159 before
   that.
   Sized against the bounded sources rather than picked: everything else in the
   game (steps, health, meals, quests, streaks) tops out around 690 XP on a
   maximal day, so the repeatables are allowed roughly 300 on top. That keeps a
   long session worth playing without making the ladder farmable.
     fight  12 x 10 = 120     a solid Pit session, not an afternoon of tapping
     garden 10 x  6 =  60     five beds, so two full cycles in a day
     cook    8 x  8 =  64
     siege   5 x 12 =  60     sieges are rare anyway, this is a backstop
   Levels are NOT capped and are not meant to be (Tom, 2026-08-16). The ladder
   just has to be climbed rather than farmed.
     log    20 x 10 = 200     QA round A, 2026-09-03 (L1): the log key was
                             `log-${entry.id}` and entry.id is newId(), which is
                             Date.now() plus randomness, so it was the SAME bug
                             one variable hop away and the static lint missed it.
                             5 re-logs from the recents row = 15 taps for +50 XP,
                             uncapped, level 20 in ~53 minutes of tapping. The
                             ledger row also outlived its log row, so log-then-
                             delete kept every XP. Twenty is above any honest
                             day (three meals of five items each is fifteen);
                             past it a log still counts for streak, variety,
                             marrow and badges, which are recomputed from the log
                             store and so fall honestly when rows are deleted.
                             The minted XP is now bounded per DAY by construction,
                             like every other repeatable, which is the invariant
                             that lets a permanent mint stand after a delete. */
export const XP_DAILY_CAP = { fight: 12, garden: 10, cook: 8, siege: 5, log: 20 };

/* Award a repeatable action against its daily ceiling.
   The key is `${prefix}-${date}-${n}`, so it is bounded by construction: dedupe
   works again, replaying a day cannot double-pay, and the nth award of the day
   is a stable key rather than a timestamp nobody can reason about. Returns 0
   once the day's ceiling for that source is spent, which is the same thing
   award() already returns for a duplicate, so every caller's `if (g)` still
   means "something was actually granted". */
export async function awardCapped(prefix, type, xp, label, cap, date, ref = null) {
  return (await claimCapped(prefix, type, xp, label, cap, date, ref)).xp;
}
/* The loop behind awardCapped, returning `claimed` as well as xp. awardCapped's
   number cannot say whether a 0-XP slot was taken (0 is both "capped" and "a
   payload with no XP"), and the spar ledger below pays COINS off a 0-XP row, so
   anything gating money on the slot must read `claimed` (QA round 28 P4). */
async function claimCapped(prefix, type, xp, label, cap, date, ref = null) {
  const d = date || dateKey();
  for (let n = 1; n <= cap; n++) {
    const key = `${prefix}-${d}-${n}`;
    /* `ref` is the thing being paid for (the log entry's id). Keying by ordinal
       made the ceiling hold but dropped the per-entry dedupe the old
       `log-<entry.id>` key gave for free: reward-sop-audit's streak driver
       (gate7, 2026-09-04) ran onFoodLogged twice on ONE entry and the second
       call took slot n+1 for 10 XP. So: a slot that already names this ref
       means this entry was paid, return 0; a slot naming another ref is simply
       taken, move on. The row carries `ref` (awardOnce's extra) so the check is
       one keyed get per slot, no store scan. */
    if (ref != null) {
      const have = await db.get('xp', key);
      if (have) { if (have.ref === ref) return { claimed: false, xp: 0 }; continue; }
    }
    /* `claimed`, not the xp number, decides whether this slot was ours. A
       second tab racing for the same n loses the addIfAbsent inside awardOnce
       and must move on to n+1 rather than being paid for a row it did not
       write. Measured before this: two tabs each pushing 12 awards against a
       12/day ceiling wrote the correct 12 rows and PAID 190 XP against a cap
       of 120, because both were told they had granted the same key. */
    const r = await awardOnce(key, type, xp, label, d, ref != null ? { ref } : null);
    if (r.claimed) return r;
    /* Lost the claim. If the winner was our own twin (two overlapping calls
       for one entry: reward-sop's "twoAtOnce" line paid 320 against 310), the
       entry is paid and we stop here instead of taking the next slot. */
    if (ref != null && (await db.get('xp', key))?.ref === ref) return { claimed: false, xp: 0 };
  }
  return { claimed: false, xp: 0 };
}

/* QA round 28 P4: SPARRING PAID WITH NO STATE TRANSITION. start() in the Pit
   skips spendPitFight on purpose (sparring is free practice, Tom's call), and
   settle() then paid 15 coins per win and 5 per loss with no ledger key, no
   cooldown and no cap: the Glutton class, in the Pit itself. This is the
   transition: "the nth spar of the day, n <= SPAR_DAILY_CAP, for a fight not yet
   paid". Authority: the ledger key spar-<date>-<n>, with the fight's own id as
   `ref` so a repeated settle of ONE fight (or two overlapping ones) takes one
   slot. 0 XP on purpose: the win's XP is still the 'fight' cap in settle(); this
   row exists to bound the coins, and coins are read off `claimed`.
   FLAGGED, NOT DECIDED: SPAR_DAILY_CAP reuses XP_DAILY_CAP.fight (12/day) so no
   new economy number is invented here; the 15/5 amounts are the shipped ones.
   Whether a spar should also spend a Pit charge is Tom's call and unchanged. */
export const SPAR_DAILY_CAP = XP_DAILY_CAP.fight;
export const SPAR_COINS = { win: 15, loss: 5 };
export async function claimSpar(fightId, won, date) {
  const r = await claimCapped('spar', 'spar', 0, won ? 'Sparring win' : 'Sparring loss', SPAR_DAILY_CAP, date, fightId);
  return { claimed: r.claimed, coins: r.claimed ? (won ? SPAR_COINS.win : SPAR_COINS.loss) : 0 };
}

export async function award(key, type, xp, label, date) {
  return (await awardOnce(key, type, xp, label, date)).xp;
}

/* THE LEDGER ROW IS THE RECEIPT, SO WRITING IT HAS TO BE THE TEST-AND-SET,
 * AND THE RECEIPT ALSO HAS TO CARRY THE RUNNING TOTAL FORWARD.
 *
 * Two changes met here and neither one survives being dropped, so read both
 * halves before touching this function.
 *
 * HALF ONE, THE CLAIM. This used to be `const existing = await db.get('xp',
 * key); if (existing) return 0;` and then, several awaits later, a `db.put`.
 * Every "the ledger is the authority" claim in this codebase rests on that
 * pair, and a pair is not an authority: with the app open in two tabs both
 * reads returned undefined, both writes landed on the same key, and both
 * callers were told they had been granted the reward. The ROW count stayed
 * correct (one key, one row) which is exactly why it is invisible to any check
 * that counts rows: what doubled was everything the caller does on the strength
 * of a non-zero return, which is coins, dust, crates, gear and level-ups.
 *
 * IT DOES NOT NEED TWO TABS EITHER. Measured against a real IndexedDB on this
 * tree in ONE page, 2026-08-17: two concurrent claimGluttonWin('2099-01-01', 1)
 * both returned a full claim, and two concurrent collectSpawn on one spawn both
 * paid. Sequentially every one of them correctly refused, which is why five
 * years of sequential checks never saw it. Two overlapping taps on one control,
 * or two code paths reaching the same claim, are enough.
 *
 * addIfAbsent does the check and the insert in one IndexedDB request, so
 * exactly one caller can ever be told `claimed: true` for a key. Returns the
 * pair rather than just the xp because `xp` is ambiguous by design: award()
 * pays 0 for a duplicate AND 0 for a legitimately zero-XP payload, and that
 * ambiguity is precisely the v390 gift double-pay. Callers that gate money on
 * "did I write this row" must read `claimed`.
 *
 * HALF TWO, THE RUNNING TOTAL. award() used to call totalXp() on every reward,
 * which was a full scan of the xp store: 30.6s of retroactive backfill on a
 * one-year save, past index.html's 12s dead-shell timer, which is a reload
 * loop. The total is cached in memory and stamped with the xp store's write
 * epoch (js/db.js), and THIS is the function that carries it forward instead of
 * recomputing it.
 *
 * WHAT THE EPOCH DOES UNDER addIfAbsent, WHICH IS NOT WHAT IT DID UNDER put.
 * db.js stamps SYNCHRONOUSLY before dispatching, and it stamps for addIfAbsent
 * whether or not the row lands, because it cannot know yet. So across our own
 * call the stamp always moves by at least one, and:
 *   - WE WON. Our row landed. If the stamp moved by exactly one, that one move
 *     was ours, nothing else touched the xp store, and the new total is the old
 *     one plus our xp. Advance by exactly our own xp, never by anything else's.
 *   - WE LOST (ConstraintError). Our insert did NOT land, so the total did not
 *     change AT ALL and the cache must not be advanced by our xp. It can still
 *     be re-stamped at the value it already held: if the stamp moved by exactly
 *     one it was our own no-op move, so no xp write happened in this process
 *     across our call, and whoever wrote the key we lost to must have written
 *     it BEFORE our stamp, which means the cached value already counted it
 *     (a cache is only live at an epoch if it was built at or after that
 *     epoch's write, and IndexedDB serialises that write ahead of the scan that
 *     built it). This branch is what keeps a duplicate award cheap. Dropping
 *     the cache here instead would put a full scan behind every repeat award,
 *     and a resumed backfill is nothing but repeat awards.
 *   - ANYTHING ELSE (stamp moved by two or more, or the cache was not live when
 *     we started): we cannot say what the total is, so we drop it and the next
 *     read pays for one honest scan. Two concurrent awards land here on both
 *     sides. Every unsure branch costs a scan; none of them bank drift.
 * Writes to OTHER stores deliberately do not matter: a fight win pays coins
 * through kvSet between awards and the XP total does not depend on kv. That is
 * why the epoch is per store (see js/db.js) and not one global counter.
 *
 * `before` for the level-up check is derived by subtraction rather than read
 * first: the row is already committed by the time we get there, so totalXp()
 * includes it, and on the warm path it is the cache we just advanced rather
 * than a scan. */
/* `extra` is a bag of EXTRA COLUMNS on the ledger row, and it exists because
   the ledger is the only place a delivery survives long enough to be read back.
   A cheer arrives carrying which of the twelve it is and who sent it; both were
   thrown away here, because this row shape has never had anywhere to put them,
   and the Crew inbox could then only ever say "somebody cheered you" and offer
   no way to cheer back. It is spread FIRST so nothing a caller passes can
   overwrite key/type/xp/ts: those five are what every reader and every dedupe in
   the app is built on, and a caller quietly shadowing `key` would break the
   claim this function exists to make. */
/* `pay`, when given, is the REST of the reward, written in the SAME transaction
   as the ledger row (db.claimAndPay). Without it the claim is atomic and the
   payout that follows is not, so a process death in between spends the action
   and hands over nothing (QA round 28 Y5, the Boneyard collect). Omitted by
   every other caller, and omitting it is byte-for-byte the old path. */
export async function awardOnce(key, type, xp, label, date, extra = null, pay = null) {
  const row = { ...(extra || {}), key, type, xp, label, date: date || dateKey(), ts: Date.now() };
  /* Read the stamp and the cache with no await between them, so the pair is
     consistent: `live` means base IS the xp total as of epoch e0. */
  const e0 = db.epoch('xp');
  const live = !!xpCache && xpCache.epoch === e0;
  const base = live ? xpCache.v : 0;
  const claimed = pay ? await db.claimAndPay('xp', row, pay) : await db.addIfAbsent('xp', row);
  xpCache = live && db.epoch('xp') === e0 + 1
    ? { v: base + (claimed ? (xp || 0) : 0), epoch: e0 + 1 }
    : null;
  if (!claimed) return { claimed: false, xp: 0 };
  // any XP source can cross a level: steps, quests, pit wins, the road
  if (type !== 'levelup' && !quietLevelups) {
    const after = await totalXp();
    const before = after - (xp || 0);
    const lvB = levelFor(before), lvA = levelFor(after);
    if (lvA.level > lvB.level) {
      const rewards = await grantLevelRewards(lvB.level, lvA.level);
      if (typeof dispatchEvent === 'function') {
        dispatchEvent(new CustomEvent('bh-levelup', { detail: { levelUp: lvA, from: lvB.level, rewards } }));
      }
    }
  }
  return { claimed: true, xp };
}

// v136: battling a friend's AI bonehead. Pays ONCE per friend per day (win pays
// more, a loss still gives a shame-free consolation) so the incentive is to battle
// MANY friends, not farm one. Records a `friendbattle` ledger row tagged with the
// friendId so the daily/weekly friend quests can count total + distinct friends.
// Returns {firstToday, coins, xp, won}; caller adds the coins.
export async function claimFriendBattle(friendId, won, date) {
  const d = date || dateKey();
  const key = `friendbattle-${d}-${friendId}`;
  const xp = won ? 12 : 5;
  /* The claim IS the check. `if (await db.get(...)) return firstToday:false`
     followed by an award was two operations with an await between them, and
     the caller pays 25 coins on firstToday, so two tabs battling the same
     friend at the same moment were both paid. */
  const claim = await awardOnce(key, 'friendbattle', xp, won ? "Beat a friend's bonehead" : 'Battled a friend', d);
  if (!claim.claimed) return { firstToday: false, coins: 0, xp: 0, won };
  const row = await db.get('xp', key);
  if (row) { row.friendId = friendId; row.won = won ? 1 : 0; await db.put('xp', row); }
  return { firstToday: true, coins: won ? 25 : 8, xp, won };
}

export function levelCoins(level) { return 20 + level * 5; }

// one reward drop per level, ever: ledger rows `levelup-N` make it idempotent,
// safe across multi-level jumps and every XP source
/* MILESTONE LEVELS.
 *
 * Tom, 2026-08-06: "Do all level ups give the same reward? I feel like this is a
 * very boring strategy if true. Most games have levels that are bigger rewards
 * than others to keep it dynamic."
 *
 * They did: every level paid coins + exactly one Golden Crate, forever, with only
 * the coin number creeping up. So every fifth level now pays a second crate,
 * every tenth adds Bone Dust and a Step Egg, and every twenty-fifth is a proper
 * event. Deliberately ECONOMY-ONLY: more cosmetic rolls, more pets, more dust to
 * spend on looks. Nothing here sells power, which is the standing game rule and
 * the thing cosmetic-only monetization depends on.
 *
 * Levels are uncapped, so this keeps paying out at 75, 100, 125 and beyond.
 */
export function levelMilestone(L) {
  if (L % 25 === 0) return { tier: 'marquee', crates: 2, dust: 150, egg: true, label: 'MILESTONE' };
  if (L % 10 === 0) return { tier: 'big', crates: 1, dust: 75, egg: true, label: 'BIG LEVEL' };
  if (L % 5 === 0) return { tier: 'small', crates: 1, dust: 0, egg: false, label: 'BONUS CRATE' };
  return null;
}

export async function grantLevelRewards(fromLevel, toLevel) {
  let coins = 0, crates = 0, dust = 0, eggs = 0, milestone = null;
  for (let L = fromLevel + 1; L <= toLevel; L++) {
    await award(`levelup-${L}`, 'levelup', 0, `Reached level ${L}`);
    /* THE PAYOUT CLAIM IS ITS OWN ROW, AND MINTING IT IS ATOMIC.
       It used to be a `claimed` flag on the levelup row, set with a get and
       then a put, which is two transactions: two overlapping level crossings
       both read claimed=false and both paid. Measured 2026-08-17, two
       concurrent grantLevelRewards(199, 200) paid 2290 coins and 300 dust for
       one level. `levelpaid-<L>` is claimed with addIfAbsent, so exactly one
       caller can ever take it. The old flag is still honoured so nobody who
       already collected a level gets paid for it again, and initGameIfNeeded's
       retroactive baseline (which sets the flag WITHOUT paying) keeps working
       unchanged. */
    const legacy = await db.get('xp', `levelup-${L}`);
    if (legacy && legacy.claimed) continue;
    if (!(await db.addIfAbsent('xp', { key: `levelpaid-${L}`, type: 'levelup', xp: 0, label: `Level ${L} rewards`, date: dateKey(), ts: Date.now() }))) continue;
    await coinsAdd(levelCoins(L));
    await grantCrate('golden', 'level-' + L);
    coins += levelCoins(L); crates += 1;
    // the milestone rides the SAME claimed-once ledger row, so a multi-level
    // jump pays each milestone it passed exactly once and a retry pays nothing
    const m = levelMilestone(L);
    if (!m) continue;
    for (let i = 0; i < m.crates; i++) await grantCrate('golden', `milestone-${L}-${i}`);
    if (m.dust) await boneDustAdd(m.dust);
    if (m.egg) await grantEgg(`milestone-${L}`);
    crates += m.crates; dust += m.dust; eggs += m.egg ? 1 : 0;
    // the biggest one reached in this jump is the one the celebration announces
    if (!milestone || m.tier === 'marquee' || (m.tier === 'big' && milestone.tier === 'small')) milestone = { ...m, level: L };
  }
  return { coins, crates, dust, eggs, milestone };
}

/* ---------------- badges ---------------- */

export const BADGES = [
  { id: 'first-log', icon: '🍽', name: 'First bite', desc: 'Log your first food' },
  { id: 'scan-1', icon: '📷', name: 'Laser eyes', desc: 'Log a food from a barcode scan' },
  { id: 'label-1', icon: '🔍', name: 'Fine print', desc: 'Create a food from a label photo' },
  { id: 'streak-3', icon: '🔥', name: 'Warming up', desc: 'Log 3 days in a row' },
  { id: 'streak-7', icon: '🚀', name: 'On a roll', desc: 'Log 7 days in a row' },
  { id: 'streak-30', icon: '🏆', name: 'Unstoppable', desc: 'Log 30 days in a row' },
  { id: 'protein-1', icon: '💪', name: 'Protein hit', desc: 'Hit your protein target for a day' },
  { id: 'protein-5', icon: '🦾', name: 'Protein week', desc: 'Hit protein 5 times' },
  { id: 'close-1', icon: '🎯', name: 'Bullseye', desc: 'Finish a day inside your calorie budget' },
  { id: 'logs-100', icon: '💯', name: 'Century club', desc: 'Log 100 foods' },
  { id: 'scan-25', icon: '🛒', name: 'Scanner pro', desc: '25 barcode scans logged' },
  { id: 'weigh-5', icon: '⚖️', name: 'Data driven', desc: 'Log 5 weigh-ins' },
  { id: 'steps-10k', icon: '👟', name: '10k stepper', desc: 'Sync a 10,000-step day from Apple Health' },
  { id: 'collector-10', icon: '🎩', name: 'Collector', desc: 'Own 10 Boneheadz cosmetics' },
  { id: 'drip-6', icon: '🧥', name: 'Full drip', desc: 'Have 6 or more slots equipped at once' },
  { id: 'hunter-1', icon: '🦴', name: 'First find', desc: 'Collect a Boneyard spawn' },
  { id: 'hunter-25', icon: '🗺', name: 'Boneyard regular', desc: 'Collect 25 Boneyard spawns' },
  { id: 'road-stop-1', icon: '🪧', name: 'First mile', desc: 'Claim a Bone Road stop' },
  { id: 'road-1', icon: '🗿', name: 'Road tripper', desc: 'Walk a full Bone Road lap' },
  { id: 'den-1', icon: '🏚', name: 'Den cracker', desc: 'Beat a boss den on the map' },
  { id: 'den-5', icon: '👑', name: 'Den lord', desc: 'Beat 5 boss dens' },
  { id: 'pit-1', icon: '🥊', name: 'Blooded', desc: 'Win a fight in The Pit' },
  { id: 'pit-25', icon: '💀', name: 'Pit fiend', desc: 'Win 25 Pit fights' },
  { id: 'pit-champ', icon: '👑', name: 'Kingslayer', desc: 'Dethrone the Marrow King' },
  // WARDEN: the only badges in the game you cannot get from the Pit, the Kitchen or
  // a crate. They come from holding a Dark Spire over real days, and from defending
  // one against a siege, so they are proof of a walking habit rather than of grinding.
  { id: 'warden-7', icon: '🏚', name: 'Warden', desc: 'Hold a Dark Spire for 7 days' },
  { id: 'warden-30', icon: '🗿', name: 'Keeper of the Gate', desc: 'Hold a Dark Spire for 30 days' },
  { id: 'warden-100', icon: '👑', name: 'Lord of Spires', desc: 'Hold a Dark Spire for 100 days' },
  { id: 'siege-1', icon: '🥊', name: 'Siegebreaker', desc: 'Break a siege on one of your spires' },
  // hidden until earned: easter-egg bosses spread by rumor, not by badge list
  { id: 'secret-tumtum', icon: '🥁', name: 'Wabaloo Whisperer', desc: 'Found Tum Tum Wabaloo where he was buried', secret: true },
];

export function badgeCheck(id, st) {
  switch (id) {
    case 'first-log': return st.logs >= 1;
    case 'scan-1': return st.scans >= 1;
    case 'label-1': return st.labels >= 1;
    case 'streak-3': return st.streak >= 3;
    case 'streak-7': return st.streak >= 7;
    case 'streak-30': return st.streak >= 30;
    case 'protein-1': return st.proteinDays >= 1;
    case 'protein-5': return st.proteinDays >= 5;
    case 'close-1': return st.closes >= 1;
    case 'logs-100': return st.logs >= 100;
    case 'scan-25': return st.scans >= 25;
    case 'weigh-5': return st.weighs >= 5;
    case 'steps-10k': return st.maxSteps >= 10000;
    case 'collector-10': return st.cosmetics >= 10;
    case 'drip-6': return st.equippedSlots >= 6;
    case 'hunter-1': return st.spawns >= 1;
    case 'hunter-25': return st.spawns >= 25;
    case 'road-stop-1': return st.roadStops >= 1;
    case 'road-1': return st.roadCycles >= 1;
    case 'den-1': return st.bossWins >= 1;
    case 'den-5': return st.bossWins >= 5;
    case 'pit-1': return st.pitWins >= 1;
    case 'pit-25': return st.pitWins >= 25;
    case 'pit-champ': return st.pitChamp;
    case 'warden-7': return st.spireDaysBest >= 7;
    case 'warden-30': return st.spireDaysBest >= 30;
    case 'warden-100': return st.spireDaysBest >= 100;
    case 'siege-1': return st.siegesBroken >= 1;
    case 'secret-tumtum': return st.secretTumtum;
    default: return false;
  }
}

/* Exported for tests/drip-badge-audit.mjs only; the app reaches it through
   evaluateBadges. */
export async function buildStats() {
  /* THE LOOK, NOT THE RAW KV (QA round 23 F4). `drip-6` read kv `equipped`, while
     transmog writes kv `transmog`, so a slot hidden in the Dressing Room still
     counted as drip and the badge could not see what the player actually wears.
     equipped() is the one resolution every renderer draws from; the badge reads
     the same picture. (collector-10 counts inventory rows and lands on day 2-3
     without the Wardrobe ever being opened: noted, not redesigned here.) */
  const [log, weights, xp, health, inv, eq] = await Promise.all([
    db.all('log'), db.all('weights'), db.all('xp'), db.all('health'), db.all('inv'), equipped(),
  ]);
  const defaults = new Set(BH_SLOTS.filter(s => s.default).map(s => s.code));
  return {
    logs: log.length,
    scans: xp.filter(r => r.type === 'scan').length,
    labels: xp.filter(r => r.type === 'label').length,
    proteinDays: xp.filter(r => r.type === 'protein').length,
    closes: xp.filter(r => r.type === 'dayclose').length,
    weighs: weights.length,
    streak: streakFrom([...streakDateSet(log, xp)], dateKey()),
    maxSteps: Math.max(0, ...health.map(h => h.steps || 0)),
    maxActiveKcal: Math.max(0, ...health.map(h => h.activeKcal || 0)),
    cosmetics: inv.filter(r => r.kind === 'cos').length,
    spawns: xp.filter(r => r.type === 'spawn').length,
    roadStops: xp.filter(r => r.type === 'road').length,
    roadCycles: xp.filter(r => r.type === 'road' && r.key.endsWith('-6')).length,
    /* 'boss' is a dead type: den wins have written 'bossday' (landmark and
       remote) or 'roamboss' (roaming) since the den rework, so the den-1 and
       den-5 badges were unearnable for every player. Same fix as the m-boss
       and w-boss quest counters one commit down; the legacy type stays counted
       for saves that carry it. Players who already earned these retroactively
       will see the badge pop on their next evaluate, which is them being paid
       what they were owed. */
    bossWins: xp.filter(r => r.type === 'bossday' || r.type === 'roamboss' || r.type === 'boss').length,
    pitWins: xp.filter(r => r.type === 'fight').length,
    pitChamp: xp.some(r => r.type === 'pitchamp'),
    secretTumtum: xp.some(r => r.key === 'secret-tumtum'),
    equippedSlots: Object.keys(eq).filter(k => !defaults.has(k)).length + 2, // body + skull always on
    // longest UNBROKEN hold across all spires, in days, and sieges repelled. The
    // hold is read from the spire records themselves (server-corrected on sync), so
    // it survives a reinstall the same way the towers do.
    spireDaysBest: Math.max(0, ...Object.values((await kvGet('spires', {})) || {})
      .map(r => Math.floor((Date.now() - (r.claimedAt || Date.now())) / 86400000))),
    siegesBroken: xp.filter(r => r.type === 'siege').length,
  };
}

/* What one badge pays. Exported because the screen that TRIGGERS a badge has to
   be able to say what it just minted: a fight that unlocks one mints this on top
   of its own reward, and the victory card used to report only the fight's half
   (QA round 20, R20-P6: the Wanderer card said +160 XP against a ledger of 185). */
export const BADGE_XP = 25;

// Awards any newly earned badges (+BADGE_XP each). Returns the badge objects.
export async function evaluateBadges() {
  const st = await buildStats();
  const out = [];
  for (const b of BADGES) {
    /* The badge is announced only if THIS call minted it. The old shape read
       the row, then awarded, then pushed regardless of what award() said, so
       two overlapping evaluateBadges both announced the same badge and both
       callers added 25 to the XP they report. awardOnce answers the same
       question the read was asking, indivisibly, and `claimed` is the half of
       its answer that is unambiguous: `xp` is 25 for a fresh badge and 0 for a
       duplicate, but it is also 0 for any payload that legitimately pays no XP,
       which is the v390 ambiguity this pair exists to end. */
    if (badgeCheck(b.id, st) && (await awardOnce('badge-' + b.id, 'badge', BADGE_XP, b.name)).claimed) out.push(b);
  }
  return out;
}

export async function earnedBadgeIds() {
  const rows = await db.all('xp');
  return new Set(rows.filter(r => r.type === 'badge').map(r => r.key.slice(6)));
}

/* ---------------- triggers ---------------- */

const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100];

async function streakAwards(streak) {
  let gained = 0, milestone = null;
  for (const n of STREAK_MILESTONES) {
    if (streak >= n) {
      const g = await award(`streak-${n}`, 'streakms', 100, `${n}-day streak`);
      if (g) { gained += g; milestone = n; }
    }
  }
  return { gained, milestone };
}

// Called after a log entry is written. Returns {xp, newBadges, streakMilestone, boosted}.
// A level crossed by this log is announced by awardOnce's `bh-levelup` event, not here.
export async function onFoodLogged(entry, { via = null, targets = null, entriesForDate = [] } = {}) {
  let gained = 0;
  /* Capped and keyed by DATE, never by entry.id: see XP_DAILY_CAP.log. The
     date is the entry's own, so a backdated log spends that day's ceiling. */
  const logXp = await awardCapped('log', 'log', 10, 'Logged a food', XP_DAILY_CAP.log, entry.date, entry.id);
  gained += logXp;
  gained += await award(`firstlog-${entry.date}`, 'firstlog', 15, 'First log of the day', entry.date);
  /* The fallback used to be `|| entry.id`, which is newId() and so a fresh key
     per scan: tests/xp-key-provenance-lint.mjs (QA round A, 2026-09-03) traced
     both to the clock. Every food-backed log carries food.id, so the fallback
     only ever names an id-less scan, and one such award per key is the bound. */
  if (via === 'scan') gained += await award(`scan-${entry.date}-${entry.foodId || 'nofood'}`, 'scan', 15, 'Barcode scan', entry.date);
  if (via === 'label') gained += await award(`label-${entry.foodId || 'nofood'}`, 'label', 20, 'Label scan', entry.date);

  const tot = dayTotals(entriesForDate);
  if (targets && targets.p && tot.p >= targets.p) {
    gained += await award(`protein-${entry.date}`, 'protein', 40, 'Protein target hit', entry.date);
  }
  const meals = new Set(entriesForDate.map(e => e.meal));
  if ([0, 1, 2].every(m => meals.has(m))) {
    gained += await award(`meals3-${entry.date}`, 'meals', 20, 'All meals logged', entry.date);
  }

  // Logging pays its base XP only. The old double-XP-for-logging perk was
  // retired (the fun is walking + the Pit, not a logging bonus); the item that
  // powered it is now the Battle Charm, spent on Pit wins instead.
  const boosted = false;

  const [log, xpRows] = await Promise.all([db.all('log'), db.all('xp')]);
  const streak = streakFrom([...streakDateSet(log, xpRows)], dateKey());
  const sa = await streakAwards(streak);
  gained += sa.gained;
  if (sa.milestone) await grantCrate('golden', 'streak-' + sa.milestone);

  const newBadges = await evaluateBadges();
  gained += newBadges.length * 25;

  /* ONE OWNER OF THE LEVEL CROSSING, AND IT IS NOT THIS FUNCTION.
     This used to re-read the total here, recompute the crossing over `gained`
     and call grantLevelRewards again, so a food log that crossed a level
     reported it TWICE: once from awardOnce, which dispatches `bh-levelup` the
     moment a sub-award crosses, and once from here, through the caller's
     queueCelebration. grantLevelRewards is idempotent (`levelpaid-<L>` is
     claimed with addIfAbsent), so the payout was always correct, but the second
     ceremony was handed a zeroed reward object and opened ON TOP of the real
     one reading "+0" (measured 2026-09-01: two .lu-take sheets, +427ms "+65"
     and +514ms "+0"). Every other XP source already relies on the dispatch
     alone, so food logging now does too.
     Nothing is missed by dropping the recompute: every sub-award above goes
     through awardOnce, which reads a fresh total per award and compares the
     level either side of it. XP only ever grows, so a crossing over the sum is
     a crossing over one of the parts, and that part is the one that dispatches. */
  return {
    xp: gained,
    total: await totalXp(),
    newBadges,
    streakMilestone: sa.milestone,
    streak,
    boosted,
    // streak crates only. Level crates are granted and counted by the level
    // crossing's own owner (awardOnce -> grantLevelRewards).
    crates: sa.milestone ? 1 : 0,
  };
}

export async function onWeighIn(date) {
  const gained = await award(`weigh-${date}`, 'weigh', 15, 'Weigh-in', date);
  const newBadges = await evaluateBadges();
  return { xp: gained + newBadges.length * 25, newBadges };
}

// A series of step goals that reward you, then keep paying (less and less) past
// the daily cap so extra walking always counts. Steps only: wellbeing-safe.
export const STEP_MILESTONES = [
  { at: 5000, coins: 20 },
  { at: 8000, coins: 30 },
  { at: 10000, coins: 40 }, // the daily cap
];
// Step Eggs now take a genuinely big day (not every 10k), so pets aren't handed
// out too fast. Combined with the higher hatch cost (EGG_GOAL_STEPS), eggs are rarer.
export const EGG_STEP_THRESHOLD = 14000;
export const STEP_OVER = [ // diminishing bonuses beyond the cap
  { at: 12500, coins: 12 }, { at: 15000, coins: 10 }, { at: 17500, coins: 8 }, { at: 20000, coins: 6 },
];

// ACTIVE ENERGY (Apple Watch / Health): active kcal is the universal "you moved"
// signal - a bike ride, a gym session, a run all burn it, so rewarding it means
// every workout counts, not just steps. Wellbeing-safe: rewards effort/movement,
// never eating less. (Active energy also nudges the eating TARGET up elsewhere.)
export const ACTIVE_MILESTONES = [
  { at: 250, coins: 15 },  // an active day
  { at: 500, coins: 25 },  // a genuine workout / ride happened today -> also a crate
  { at: 750, coins: 35 },  // big training day (soft cap)
];
export const ACTIVE_WORKOUT_KCAL = 500; // "you worked out today" threshold -> daily crate
export const ACTIVE_OVER = [ // diminishing beyond the cap
  { at: 1000, coins: 10 }, { at: 1250, coins: 8 }, { at: 1500, coins: 6 },
];

// ---- WORKOUTS (HealthKit / Health Connect granularity) ----
// Beyond steps + calories: reward completed workout sessions, exercise minutes,
// and cycling distance, and theme the reward to the KIND of activity. Wellbeing-
// safe (rewards doing the activity, never eating less).
export const WORKOUT_COINS = 25;          // per completed workout
export const WORKOUT_CAP = 3;             // rewarded workouts/day (anti-farm)
export const EXERCISE_RING_MIN = 30;      // Apple's daily Exercise ring
export const CYCLE_KM_STEP = 5;           // reward every 5 km ridden
export const CYCLE_KM_CAP = 40;           // stop paying past 40 km/day
// Raw HealthKit / Health Connect activity types -> our three "disciplines".
export const WORKOUT_DISCIPLINE = {
  // cardio -> Vigor (energy)
  running: 'cardio', walking: 'cardio', cycling: 'cardio', biking: 'cardio', hiking: 'cardio',
  swimming: 'cardio', rowing: 'cardio', elliptical: 'cardio', stairclimbing: 'cardio',
  hiit: 'cardio', dance: 'cardio', jumprope: 'cardio', kickboxing: 'cardio',
  // strength -> Battle Charm (hit harder)
  strength: 'strength', functionalstrength: 'strength', traditionalstrength: 'strength',
  core: 'strength', crosstraining: 'strength', crossfit: 'strength', weightlifting: 'strength',
  // flexibility / mind -> Bone Dust (restorative crafting mat)
  yoga: 'flex', pilates: 'flex', flexibility: 'flex', mindandbody: 'flex', barre: 'flex',
  cooldown: 'flex', stretching: 'flex',
};
// discipline -> the themed reward it grants (once per discipline per day)
export const DISCIPLINE_REWARD = {
  cardio:   { consumable: 'vigor', label: 'Vigor Draught' },
  strength: { consumable: 'xp2',   label: 'Battle Charm' },
  flex:     { dust: 20,            label: 'Bone Dust' },
};
export function disciplineOf(type) {
  const k = String(type || '').toLowerCase().replace(/[^a-z]/g, '');
  return WORKOUT_DISCIPLINE[k] || 'cardio'; // unknown activity still counts as cardio effort
}

export async function onHealthSync(date, { steps, activeKcal, exerciseMin, cycleKm, workouts, wtypes } = {}) {
  let gained = await award(`hk-${date}`, 'hk', 10, 'Apple Health sync', date);
  let egg = false, coinsEarned = 0, workout = false;
  const themed = []; // themed consumables granted this sync (for the toast)
  if (steps != null) {
    for (const m of STEP_MILESTONES) {
      if (steps < m.at) break;
      const g = await award(`stepms-${date}-${m.at}`, 'stepms', 15, `${m.at.toLocaleString()} steps`, date);
      if (g) { gained += g; coinsEarned += m.coins; }
    }
    // a Step Egg only on a genuinely big day
    if (steps >= EGG_STEP_THRESHOLD) {
      const g = await award(`egg-${date}`, 'egg', 15, 'Big-day Step Egg', date);
      if (g) { gained += g; await grantCrate('egg', 'steps-' + date); egg = true; }
    }
    for (const o of STEP_OVER) {
      if (steps < o.at) break;
      const g = await award(`stepx-${date}-${o.at}`, 'stepx', 5, `Extra steps past the cap: ${o.at.toLocaleString()}`, date);
      if (g) { gained += g; coinsEarned += o.coins; }
    }
  }
  // Active energy: rewards every kind of workout (bike/run/gym/swim all burn it).
  if (activeKcal != null) {
    for (const m of ACTIVE_MILESTONES) {
      if (activeKcal < m.at) break;
      const g = await award(`actms-${date}-${m.at}`, 'actms', 15, `${m.at.toLocaleString()} active kcal`, date);
      if (g) { gained += g; coinsEarned += m.coins; }
    }
    // a real workout's worth of burn -> a daily crate (once/day, idempotent)
    if (activeKcal >= ACTIVE_WORKOUT_KCAL) {
      const g = await award(`actcrate-${date}`, 'actcrate', 15, 'Workout of the day', date);
      if (g) { gained += g; await grantCrate('daily', 'active-' + date); workout = true; }
    }
    for (const o of ACTIVE_OVER) {
      if (activeKcal < o.at) break;
      const g = await award(`actx-${date}-${o.at}`, 'actx', 5, `Extra burn past the cap: ${o.at.toLocaleString()} kcal`, date);
      if (g) { gained += g; coinsEarned += o.coins; }
    }
  }
  // Completed workout SESSIONS (capped/day so it can't be farmed).
  if (workouts != null && workouts > 0) {
    for (let i = 1; i <= Math.min(workouts, WORKOUT_CAP); i++) {
      const g = await award(`wk-${date}-${i}`, 'wk', 15, `Workout ${i}`, date);
      if (g) { gained += g; coinsEarned += WORKOUT_COINS; workout = true; }
    }
  }
  // Apple Exercise ring.
  if (exerciseMin != null && exerciseMin >= EXERCISE_RING_MIN) {
    const g = await award(`exring-${date}`, 'exring', 20, `${EXERCISE_RING_MIN} exercise minutes`, date);
    if (g) { gained += g; coinsEarned += 20; }
  }
  // Cycling distance (every CYCLE_KM_STEP km up to the cap).
  if (cycleKm != null && cycleKm > 0) {
    for (let km = CYCLE_KM_STEP; km <= CYCLE_KM_CAP; km += CYCLE_KM_STEP) {
      if (cycleKm < km) break;
      const g = await award(`cyc-${date}-${km}`, 'cyc', 8, `${km} km ridden`, date);
      if (g) { gained += g; coinsEarned += 10; }
    }
  }
  // Type-themed reward: one per DISCIPLINE done today (cardio->Vigor,
  // strength->Battle Charm, flex->Bone Dust). Idempotent per date+discipline.
  if (wtypes && wtypes.length) {
    for (const disc of new Set(wtypes.map(disciplineOf))) {
      const g = await award(`wtype-${date}-${disc}`, 'wtype', 10, `${disc} session`, date);
      if (!g) continue;
      gained += g;
      const r = DISCIPLINE_REWARD[disc];
      if (r?.consumable) { await grantConsumable(r.consumable, `workout-${disc}-${date}`); themed.push(r.label); }
      else if (r?.dust) { await boneDustAdd(r.dust); themed.push(r.label); }
    }
  }
  if (coinsEarned) await coinsAdd(coinsEarned);
  const newBadges = await evaluateBadges();
  gained += newBadges.length * 25;
  return { xp: gained, newBadges, egg, coins: coinsEarned, workout, themed };
}

// At boot: settle yesterday (day-close bonus and any missed day checks).
export async function awardDayCloseIfDue(targets) {
  if (!targets) return null;
  /* MONOTONIC DAY GUARD (js/db.js claimDay). Settling yesterday is worth 50 XP
     and a GOLDEN crate, and it becomes due the moment dateKey() rolls over, so
     it is the single biggest prize a clock nudge buys. The mark is taken on
     TODAY, not on the yesterday being settled: the question is whether the
     device has honestly arrived at a new day, and yesterday's own key is what
     the award() ledger already dedupes on. */
  const today = dateKey();
  const day = await claimDay(today);
  /* Handed back rather than swallowed (QA round 26 O14): boot and the midnight
     roll toast DAY_GUARD_COPY off this, where a bare null was indistinguishable
     from "nothing owed". Carries no closed/consoled, so nothing counts it as a
     payout; tests/gap-settle-audit.mjs reads it that way. */
  if (!day.fresh) return { dayGuard: day.reason || true };
  let y = addDays(today, -1);
  let es = await db.byIndex('log', 'date', y);
  if (!es.length) {
    /* THE GAP CASE. Yesterday empty used to mean "nothing to settle", which
       silently discarded the day-close a lapsed player EARNED on the last day
       they logged: come back after a 2+ day gap and the crate was just gone.
       Settle the LAST LOGGED day before today instead. EXACTLY ONE day settles
       here however long the gap is: the most recent logged day, nothing further
       back, so a long absence never pays a backlog. The award() ledger keys on
       that date, so a day already settled before the gap pays nothing again,
       and the claimDay guard above still rules the whole path. */
    const rows = await db.all('log');
    let last = null;
    for (const r of rows) if (r.date < today && (!last || r.date > last)) last = r.date;
    if (!last) return null;
    y = last;
    es = rows.filter(r => r.date === y);
  }
  const tot = dayTotals(es);
  const onBudget = tot.kcal <= targets.kcal && tot.kcal >= targets.kcal * 0.6;
  let closed = false, consoled = false;
  if (onBudget) {
    // locked in: the full reward
    const g = await award(`dayclose-${y}`, 'dayclose', 50, 'Closed the day on budget', y);
    if (g) { await grantCrate('golden', 'dayclose-' + y); closed = true; }
  } else {
    // shame-free: you still logged the day, so you still earn - just a lighter
    // reward, never a penalty ("you'll get 'em next time"). This rewards the ACT
    // of tracking, not the calorie number, so it never favours eating less: an
    // on-budget day always pays strictly more, and over/under both land here.
    // No crate here (2026-09-05, crate-frequency audit lever 2): this was the
    // lowest-value crate in the game, 145/yr for a committed player yielding
    // 0.19 cosmetics each against 0.55 for a day-close Bone. The XP still pays.
    const g = await award(`dayeffort-${y}`, 'dayeffort', 25, 'Logged the day', y);
    if (g) consoled = true;
  }
  if (targets.p && tot.p >= targets.p) await award(`protein-${y}`, 'protein', 40, 'Protein target hit', y);
  const meals = new Set(es.map(e => e.meal));
  if ([0, 1, 2].every(m => meals.has(m))) await award(`meals3-${y}`, 'meals', 20, 'All meals logged', y);
  await evaluateBadges();
  // gap: the settled day was not yesterday, so the caller's toast can say so.
  const gap = y !== addDays(today, -1);
  return closed ? { date: y, closed: true, gap } : consoled ? { date: y, consoled: true, gap } : null;
}

/* THE DAY-CLOSE AS A ROW THE PLAYER CAN READ LATER. QA round 24 L16: the two
   toasts above are the ONLY delivery of the day-close, at 3.4s/3.6s inside a
   queue that caps at 4 and drops the oldest, so a boot that also pays a welcome
   kit, a merchant refund and a den ceiling can drop the golden crate's notice on
   the floor, and nothing persistent on Today ever says the day closed.
   DERIVED, NOT STORED. The `dayclose-<date>` / `dayeffort-<date>` ledger rows
   ARE the receipt (that is what the ledger is for), so this reads the newest one
   and hands renderToday a news-shaped row with the toast's exact copy, dated to
   the closed day. No second store to drift, no producer change: the policy at
   the award() calls above is untouched.
   `gap` is recovered from the row itself: ts is the day the settle ran, date is
   the day settled, and the toast said "your last logged day" exactly when those
   are not adjacent. Only the NEWEST row is surfaced; older closes age out with
   the list. */
export function dayCloseNews(xpRows) {
  let r = null;
  for (const x of xpRows) {
    if (x.type !== 'dayclose' && x.type !== 'dayeffort') continue;
    if (!r || x.date > r.date) r = x;
  }
  if (!r) return null;
  const gap = addDays(dateKey(new Date(r.ts)), -1) !== r.date;
  // 2026-09-05: the dayeffort branch no longer grants a crate (crate-frequency
  // audit lever 2), so its copy no longer promises one.
  const title = r.type === 'dayclose'
    ? (gap ? 'Your last logged day closed on budget: Bone Crate earned' : 'Yesterday closed on budget: Bone Crate earned')
    : (gap ? 'You logged your last day here. That counts.' : 'You logged yesterday. That counts.');
  return { id: `dayclose-${r.date}`, type: r.type, title, date: r.date };
}

/* THE REBALANCE CARD (QA round 28 B1). R21-P1 made every stat start flat and
   returned the habit-earned spread as unspent training points through a
   one-shot kv (js/app.js habitBaseGrantTp), with no toast, notice or card: the
   release's own mage audit measured a fighter dropping 312 HP to 210 on update
   day and nothing on screen said why or that points were waiting. This is the
   one place the explanation lives. Pure, so tests/unit.test.js can drive it:
   the grant row in, a card (or null) out; `seen` is the dismissal flag the
   Today button writes. COPY IS A DRAFT FOR TOM (flagged in the round-28 report):
   edit the three strings here and nowhere else. */
export const HABIT_GRANT_CARD = {
  title: 'Your Bonehead was rebalanced',
  body: n => `Every stat now starts flat, and the strength you had earned is waiting as ${n} training point${n === 1 ? '' : 's'}. Spend them in Training.`,
  button: 'Open Training',
};
export function habitGrantCard(grant, seen) {
  const tp = grant && typeof grant.tp === 'number' ? grant.tp : 0;
  if (seen || tp <= 0) return null;   // nothing granted, or already explained: no card, ever again
  return { tp, title: HABIT_GRANT_CARD.title, body: HABIT_GRANT_CARD.body(tp), button: HABIT_GRANT_CARD.button };
}

/* THE RETROACTIVE BACKFILL, AND THE BOOT LOOP IT USED TO CAUSE.
 *
 * This is the one-shot replay that honours a pre-RPG install's history: about
 * 1,980 awards for a one-year diary (400 log rows, one first-log per date, 60
 * weigh-ins, up to three per past date, streaks, badges, the level baseline).
 *
 * It had three properties and only together were they fatal:
 *   1. app.js ran it BEFORE route(), so it blocked first paint;
 *   2. the `game-init` flag was written at the very END, so nothing survived an
 *      interruption;
 *   3. index.html's dead-shell backstop reloads the page if #screen is still
 *      empty at 12s.
 * So on a slow phone with an old save the replay blocked paint past 12s, the
 * shell reloaded, the flag had never been written, and the replay started again
 * from zero: a loop no amount of waiting escapes, because waiting is the thing
 * that triggers it.
 *
 * MEASURED, on this container, one year of diary (1,825 log rows, 60 weigh-ins,
 * 1,982 awards), end to end. All three trees run back to back in one interleaved
 * session, two samples each, because the container's own speed drifts by nearly
 * 2x between sessions and a table stitched from different ones reports the load
 * average rather than the code:
 * Re-taken against origin/main = ddbb079 (v391); the v388 table this comment used
 * to carry no longer holds, because v390 and v391 rewrote js/app.js. PAINT is the
 * first sample where #screen has children, INIT is the moment kv 'game-init'
 * lands:
 *                                          PAINT                INIT
 *   v391 main   (award() rescans store)  1x never / never    30.6s / 30.7s
 *                                        4x never / never    65.8s / 65.2s
 *   gwart/xpperf (constant-cost award)   1x never / never     3.6s /  3.7s
 *                                        4x never / never    18.1s / 10.9s
 *   this branch (chunked, checkpointed)  1x 347ms / 418ms     5.5s /  5.7s
 *                                        4x 799ms / 1130ms   27.4s / 29.7s
 * The line that matters is 12,000ms. On v391 main it is crossed at NO THROTTLE AT
 * ALL, and by further than it was on v388: 30.6s cold, on the fastest machine
 * available, so a one-year legacy install trips the dead-shell reload here with
 * nothing slowing it down. The constant-cost award() takes 8x off that and still
 * never paints before the flag, and at 4x it is back over the line. Speed moves
 * the cliff, it does not remove it, so the SHAPE is what changed here. Note the
 * cost, stated rather than buried: chunking yields between chunks, so this branch
 * takes 5.5s where xpperf alone takes 3.6s. It buys the only property that ends
 * the loop, which is that content is up in about a second, always before the flag:
 *
 *   - CHECKPOINTED. A cursor in kv ('game-init-at') is written after every chunk
 *     of awards, so an interrupted boot resumes where it stopped instead of
 *     restarting. The cursor is a fast-forward hint, never the source of truth:
 *     award() is idempotent on its ledger key, so the worst a lost or stale
 *     cursor can cost is a re-run, never a missed award. It is VERIFIED on
 *     resume against the recomputed item list (see initCursorStart) because the
 *     player can now log food while the backfill runs, which would shift every
 *     index under it; a cursor that does not match its own item is discarded and
 *     that phase restarts.
 *   - YIELDING. Each chunk hands the task queue back so the page paints and
 *     stays responsive while it works.
 *   - The flag now lands AFTER the level baseline loop, not before it, so
 *     'game-init' means finished rather than nearly finished.
 *
 * The chunking now costs nothing measurable: this branch lands inside xpperf's
 * own run-to-run spread at every throttle, and came out FASTER at 1x and 4x. It
 * used to cost real time. Each checkpoint is a kv write, and under the SHARED
 * write counter db.js carried before the per-store fix, every one of those ~32
 * writes invalidated the XP cache and forced a full rescan of a store averaging
 * about 960 rows. That is gone, and it is why the earlier measurement of this
 * branch showed a ~25% penalty that no longer exists.
 *
 * The visible-state and never-publish-a-half-level halves live in app.js and in
 * gameInitSettled() below. tests/boot-backfill-audit.mjs is the guard.
 */
const INIT_CURSOR = 'game-init-at';
/* Awards between checkpoints. A year of history is ~1,980 awards, so this is about
   33 checkpoints: roughly every 600ms on a 10x-throttled CPU, which is the interval
   of work an interruption can cost. Smaller values were measured and the extra kv
   writes plus task-queue hops disappeared into run-to-run noise, so this is chosen
   for checkpoint spacing in TIME, not for the overhead. */
const INIT_CHUNK = 60;

let initInFlight = null;

/* Resolves when no retroactive backfill is running. socialSnapshot() awaits this,
   which is what keeps a HALF-REPLAYED level off the shared leaderboard: the
   backfill takes the player from level 1 to their real level over seconds, and
   every profile push in the app (autoSync, pushProfileSoon, syncProfile) builds
   its payload through socialSnapshot, so one await covers all of them. Never
   rejects: a backfill that throws still settles this. */
export function gameInitSettled() { return initInFlight || Promise.resolve(); }
export function gameInitRunning() { return !!initInFlight; }

// hand the task queue back so the page can paint between chunks
const yieldToPaint = () => new Promise(r => setTimeout(r, 0));

/* Where to resume. Verified, not trusted: the stored index only counts if the
   item it claims to have finished is still sitting at that index. */
function initCursorStart(cur, phases) {
  if (!cur || !Number.isInteger(cur.p) || cur.p < 0) return { p: 0, i: 0 };
  const p = Math.min(cur.p, phases.length);
  const ph = phases[p];
  if (ph && cur.i > 0 && cur.i <= ph.items.length && ph.key(ph.items[cur.i - 1]) === cur.k) return { p, i: cur.i };
  return { p, i: 0 };
}

// One-time retroactive backfill so existing users start with their history honored.
export function initGameIfNeeded(targets, { onProgress = null } = {}) {
  if (initInFlight) return initInFlight;   // one at a time; a second caller joins the first
  const p = runInitBackfill(targets, onProgress);
  initInFlight = p;
  // settle the gate whatever happens, so nothing can wait on it forever
  p.catch(() => {}).then(() => { if (initInFlight === p) initInFlight = null; });
  return p;
}

async function runInitBackfill(targets, onProgress) {
  if (await kvGet('game-init')) return null;
  quietLevelups = true;
  try {
  const [log, weights] = await Promise.all([db.all('log'), db.all('weights')]);
  const today = dateKey();
  const dates = [...new Set(log.map(e => e.date))].sort();
  // one pass instead of one filter per date: 365 dates over 1,825 rows was 666k
  // comparisons before the first award even landed
  const byDate = new Map();
  for (const e of log) { const a = byDate.get(e.date); if (a) a.push(e); else byDate.set(e.date, [e]); }

  /* The replay, as ordered phases of idempotent items. Order is fixed and every
     list is derived deterministically (IndexedDB key order for log and weights,
     a sorted date set), which is what makes an index into one of them a
     resumable position at all. */
  /* The replay keys log XP the way onFoodLogged does now, `log-<date>-<n>`,
     with n the row's ordinal within its day (byDate is in IndexedDB key order,
     so it is deterministic), and stops paying at XP_DAILY_CAP.log. Computed
     here rather than probed through awardCapped: probing costs n adds per row
     and this is the boot path the 12s dead-shell timer watches. */
  const ord = new Map();
  for (const es of byDate.values()) es.forEach((e, i) => ord.set(e.id, i + 1));
  const phases = [
    { id: 'log', items: log.slice(-400),
      key: e => `log-${e.id}`,   // checkpoint label only, not an award key
      run: e => { const n = ord.get(e.id); return n > XP_DAILY_CAP.log ? 0 : awardOnce(`log-${e.date}-${n}`, 'log', 10, 'Logged a food', e.date, { ref: e.id }).then(r => r.xp); } },
    { id: 'firstlog', items: dates,
      key: d => `firstlog-${d}`,
      run: d => award(`firstlog-${d}`, 'firstlog', 15, 'First log of the day', d) },
    { id: 'weigh', items: weights.slice(-60),
      key: w => `weigh-${w.date}`,
      run: w => award(`weigh-${w.date}`, 'weigh', 15, 'Weigh-in', w.date) },
    { id: 'days', items: dates.filter(d => d < today),
      key: d => `day-${d}`,
      run: async d => {
        const es = byDate.get(d) || [];
        const tot = dayTotals(es);
        if (targets) {
          if (targets.p && tot.p >= targets.p) await award(`protein-${d}`, 'protein', 40, 'Protein target hit', d);
          if (tot.kcal <= targets.kcal && tot.kcal >= targets.kcal * 0.6) await award(`dayclose-${d}`, 'dayclose', 50, 'Closed the day on budget', d);
        }
        const meals = new Set(es.map(e => e.meal));
        if ([0, 1, 2].every(m => meals.has(m))) await award(`meals3-${d}`, 'meals', 20, 'All meals logged', d);
      } },
  ];

  const total = phases.reduce((a, ph) => a + ph.items.length, 0);
  const start = initCursorStart(await kvGet(INIT_CURSOR, null), phases);
  let done = phases.slice(0, start.p).reduce((a, ph) => a + ph.items.length, 0) + start.i;
  onProgress?.({ done, total, resumed: done > 0 });

  for (let p = start.p; p < phases.length; p++) {
    const ph = phases[p];
    let i = p === start.p ? start.i : 0;
    while (i < ph.items.length) {
      const end = Math.min(i + INIT_CHUNK, ph.items.length);
      for (; i < end; i++) await ph.run(ph.items[i]);
      // the checkpoint is written only after its chunk's awards have landed, so
      // resuming at it can never skip work that was not actually done
      await kvSet(INIT_CURSOR, { p, i, k: ph.key(ph.items[i - 1]) });
      done = phases.slice(0, p).reduce((a, q) => a + q.items.length, 0) + i;
      onProgress?.({ done, total, resumed: false });
      await yieldToPaint();
    }
    await kvSet(INIT_CURSOR, { p: p + 1, i: 0, k: null });
  }

  /* The tail is small and bounded (six streak keys, one badge sweep, one level
     baseline loop), so it is not checkpointed: it simply re-runs on a resume,
     which is correct because every step of it is idempotent. */
  const streak = streakFrom(dates, today);
  await streakAwards(streak);
  await evaluateBadges();
  const xp = await totalXp();
  const lv = levelFor(xp);
  // baseline: levels reached before this feature never retro-drop rewards
  for (let L = 2; L <= lv.level; L++) {
    await award(`levelup-${L}`, 'levelup', 0, `Reached level ${L}`);
    const row = await db.get('xp', `levelup-${L}`);
    if (row && !row.claimed) { row.claimed = true; await db.put('xp', row); }
  }
  /* LAST, not first. It used to be set before this loop, which meant an
     interruption here left the flag saying "done" over an unfinished baseline. */
  await kvSet('game-init', true);
  await db.del('kv', INIT_CURSOR);
  onProgress?.({ done: total, total, complete: true });
  return { xp, level: lv };
  } finally { quietLevelups = false; }
}

// One-time welcome kit when the RPG layer first arrives (or on fresh install).
export async function initLootIfNeeded() {
  if (await kvGet('loot-init')) return null;
  await grantCrate('golden', 'welcome');
  await grantCrate('daily', 'welcome');
  /* A Draught in the kit, because logging stopped earning Vigor on 2026-08-15.
     An established player buys fights at 90 coins for 3; a brand new player who
     cannot walk has neither coins nor crates, so day one would be the free
     three and nothing else. This covers exactly that gap without paying anybody
     for what they type into their food diary. */
  await grantConsumable('vigor', 'welcome');
  /* STARTER POUCH. Rewarded-actions SOP, the state transition: "this device has
     never been given the welcome kit" becomes "it has", recorded by the
     'loot-init' kv flag that guards the whole function above. There is no second
     transition, so a second call pays nothing at all: it returns null at the
     guard before reaching any grant. grantIngredient is purely additive and
     would happily pay twice, so the guard is the only thing standing between this and
     a farm, which is why the grants stay INSIDE it.
     Two Marrow and one Grave Salt is not an arbitrary handful: it is exactly
     Bone Broth, the first recipe, so the pouch is a legible errand instead of an
     empty Kitchen with a coach mark.
     THESE USED TO BE SEEDS. The Bone Garden left the player's path on
     2026-08-18, so a seed is unplantable: the pouch pays the INGREDIENTS the
     seeds would have grown into, which is the same first errand one step
     shorter. Strictly less generous than before (a seed harvested for 2). */
  await grantIngredient('marrow', 2);
  await grantIngredient('salt', 1);
  /* STARTER EGG (playtest P2, 2026-08-30): one pet egg in the kit, so day one
     ends with a pet instead of a locked mechanic the player has only read
     about. It lives INSIDE the 'loot-init' guard with the rest of the kit, so
     it is granted exactly once per save through the same state transition, and
     it sits HERE rather than in the onboarding screens because BOTH onboarding
     paths (the full form and "skip, use defaults") land on saveInitialSettings
     -> initLootIfNeeded: a skipped onboarding still gets it, and the render
     layer stays untouched.
     goal 0 is not an invented number, it is the smaller of the only two egg
     goal tiers that exist (0 and EGG_GOAL_STEPS 8000), and it is the tier v307
     created for exactly this moment: loot.js's own words are that a goal-0 egg
     "is how the Crew channel can hand a new player one they can crack straight
     away". It renders as READY TO HATCH with a live HATCH button, so the first
     visit to the Backpack teaches the whole egg loop instead of opening on a
     progress bar at zero. If day one should instead teach incubation by
     walking, the only honest alternative is dropping this argument to take the
     8,000-step default; anything in between would be a number no other egg in
     the game has ever carried. */
  await grantEgg('welcome', 0);
  await kvSet('loot-init', true);
  return { crates: 2, draught: true, ingredients: 3, egg: true };
}

/* THE STARTER POUCH, BACKFILLED TO INSTALLS THAT ALREADY EXIST.
 *
 * The pouch above sits inside the 'loot-init' guard, which is correct for a new
 * player and reaches nobody else: every install made before it shipped already
 * has that flag set, so Tom's beta testers would never see a seed. Clearing or
 * re-running 'loot-init' is not the fix. That flag guards two crates and a
 * Draught as well, and it is the ONLY thing standing between the welcome kit and
 * a farm, so it gets its own key instead.
 *
 * Rewarded-actions SOP:
 *  1. THE STATE TRANSITION: "this install has never been handed a starter pouch"
 *     becomes "it has". There is exactly one such transition per install, so
 *     there is exactly one payment. Nothing about play can put it back.
 *  2. ASK THE AUTHORITY FIRST. The ledger here is the 'seedpouch-backfill' key,
 *     and it is both read and WRITTEN before a single ingredient is granted.
 *     grantIngredient is purely additive and would happily pay twice; writing the key first means
 *     a failure halfway through costs the player a pouch, never pays them two.
 *  3. THE RULE ON WHO GETS IT: only a player with no seeds in the pouch and
 *     nothing in a bed. Anyone holding a seed, or growing one, found their own
 *     way into the garden and does not need a first errand. They still get the
 *     key written, so we never look again and the check can never become a farm.
 *     A player who has already harvested everything and spent every seed reads as
 *     empty and is paid; that is three seeds once, and the alternative is asking
 *     the ledger a question it does not store.
 */
/* SEEDS BECAME INGREDIENTS, 2026-08-18, same reason as the pouch above: with the
 * Bone Garden off the player's path a seed cannot be planted. The ledger key,
 * the who-gets-it rule and the write-before-pay order are all unchanged. */
export async function backfillStarterSeedsIfNeeded() {
  if (await kvGet('seedpouch-backfill')) return null;
  await kvSet('seedpouch-backfill', true);
  const g = await gardenState();
  if (Object.values(g.seeds).some(n => n > 0) || g.plots.some(p => !p.empty)) return null;
  await grantIngredient('marrow', 2);
  await grantIngredient('salt', 1);
  return { ingredients: 3 };
}

/* THE BONE GARDEN'S CLOSING PAYOUT. Refund the beds, convert the holdings, ONCE.
 *
 * Tom, 2026-08-18, took the Hollow and the garden off the player's path. A
 * player who spent 1,500 and 4,000 coins on beds 4 and 5 must not watch them
 * disappear without a word, and seeds and half-grown crops must not be stranded
 * as items with nowhere left to go.
 *
 * THIS PAYS COINS ON EVERY BOOT PATH, so it is the exact shape a farm is made
 * of. Rewarded-actions SOP, in order:
 *
 * 1. THE STATE TRANSITION. "this device still holds a live Bone Garden" becomes
 *    "it has been settled". There is exactly one such transition per save and
 *    nothing about play can put it back: no route into the garden survives, so
 *    no bed can be bought and no seed can be earned after this runs.
 * 2. ASK THE AUTHORITY FIRST, PAY SECOND. The authority is db.addIfAbsent on the
 *    kv row 'garden-retired', which is IndexedDB's own uniqueness constraint:
 *    exactly one caller on the device is ever told true, however many tabs,
 *    boots or restores ask in the same instant. The kvGet/kvSet pair the starter
 *    pouch above uses has a window between the read and the write, and it hands
 *    out three ingredients rather than 5,500 coins. This one gets the
 *    indivisible primitive. Nothing is paid before the answer arrives.
 * 3. A NO-OP ANSWER IS NOT A SUCCESS. `false` means another caller settled this
 *    save; return null and pay nothing at all, not a consolation.
 * 4. THE ENTRY POINT IS ALREADY CLOSED: the garden has no door, which is the
 *    whole reason this exists.
 * 5. PROVEN, not asserted: tests/garden-retire-audit.mjs drives it twice against
 *    a real IndexedDB and measures the coin balance either side. The second run
 *    moves it by 0.
 *
 * WHAT IT PAYS, all derived from the save, none of it from a server (there is no
 * server-side garden state, so no migration is possible and none is needed):
 *  - coins: PLOT_PRICES for every bed actually BOUGHT. Beds 1 to 3 are free.
 *  - each unplanted seed: 1 ingredient of its kind. A seed is one plant.
 *  - each occupied bed, ripe or mid-grow: HARVEST_BASE (2 for a common, 1 for an
 *    Ectoplasm spore), which is the GUARANTEED floor of harvestYield. Not the
 *    watered bonus and not the bumper roll: this settles a bed, it does not
 *    gamble on one, and a deterministic payout is a payout an audit can pin.
 *
 * The beds go back to PLOTS_FREE and the pouch and plots are emptied, because
 * the alternative is a player holding the coins AND the goods AND the beds if
 * the garden ever comes back. kv 'garden' keeps its shape and reads back fine.
 * The RECEIPT is the ledger row's value, so a revival can read exactly what was
 * paid instead of guessing.
 *
 * NOT WRITTEN when there is nothing to settle (three free beds, empty pouch, no
 * crops), which is most players. That is deliberate: a save restored later from
 * cloud backup carries its own kv wholesale, so either it brings the receipt
 * with it (already settled, addIfAbsent says false) or it brings an unsettled
 * garden and its own pre-refund coin balance, and settling it then is correct.
 */
export const GARDEN_RETIRE_KEY = 'garden-retired';

export async function retireGardenIfNeeded() {
  const g = await gardenState();
  const seeds = Object.entries(g.seeds).filter(([, n]) => n > 0);
  const crops = g.plots.filter(p => !p.empty).map(p => [p.ing, p.rare ? HARVEST_BASE_RARE : HARVEST_BASE]);
  const bought = Math.max(0, Math.min(PLOT_PRICES.length, g.plotsOwned - PLOTS_FREE));
  const coinsBack = PLOT_PRICES.slice(0, bought).reduce((a, n) => a + n, 0);
  if (!coinsBack && !seeds.length && !crops.length) return null;   // nothing was ever put in

  const pay = [...seeds, ...crops];
  const receipt = { coins: coinsBack, beds: g.plotsOwned, seeds: seeds.reduce((a, [, n]) => a + n, 0),
    crops: crops.length, ingredients: pay.reduce((a, [, n]) => a + n, 0), at: Date.now() };
  // THE CLAIM. Exactly one caller gets true; everybody else pays nothing.
  if (!(await db.addIfAbsent('kv', { k: GARDEN_RETIRE_KEY, v: receipt }))) return null;

  await clearGarden();                       // take first
  if (coinsBack) await coinsAdd(coinsBack);  // pay second
  for (const [id, n] of pay) await grantIngredient(id, n);
  return receipt;
}

// XP rows for a given date (for the progress sheet).
export async function xpForDate(date) {
  const rows = await db.all('xp');
  return rows.filter(r => r.date === date).sort((a, b) => b.ts - a.ts);
}

/* ---------------- Apple Health payload ---------------- */
// Accepts the clipboard format written by the Shortcut, or URL params:
//   "tally-hk d=2026-07-03 steps=8421 active=512 weightlb=184.6"
//   "#/hk?steps=8421&active=512&weightkg=83.4"
export function parseHkPayload(input) {
  const t = String(input || '').trim();
  if (!t) return null;
  if (!(/tally-hk/i.test(t) || /(^|[?&# ])(steps|active|weightlb|weightkg|exmin|cyclekm|workouts)=/i.test(t))) return null;

  const params = {};
  for (const m of t.matchAll(/([a-z]+)\s*=\s*([0-9.,-]+)/gi)) params[m[1].toLowerCase()] = m[2];
  // wtypes is a comma list of activity slugs (letters), not numeric
  const wtMatch = t.match(/wtypes\s*=\s*([a-z,]+)/i);
  const wtypes = wtMatch ? wtMatch[1].toLowerCase().split(',').map(s => s.trim()).filter(Boolean) : null;

  const num = v => {
    if (v == null) return null;
    let s = String(v).trim();
    // strip thousands separators, keep a trailing decimal comma
    s = s.replace(/,(?=\d{3}(\D|$))/g, '');
    s = s.replace(',', '.');
    const x = parseFloat(s);
    return isFinite(x) && x >= 0 ? x : null;
  };

  const dm = t.match(/\d{4}-\d{2}-\d{2}/);
  const date = dm ? dm[0] : dateKey();
  const steps = num(params.steps) != null ? Math.round(num(params.steps)) : null;
  const active = num(params.active ?? params.activekcal) != null ? Math.round(num(params.active ?? params.activekcal)) : null;
  /* QA round 25 M10: activeKcal was the one unbounded number in this parser.
     A 6,000 typo (for 600) flowed through activeCalorieBonus and added +2,504
     kcal to an 800 kcal day. Same treatment as weightKg below: out of range is
     unreadable, so null, never clamped to the edge. Range 0..4000 kcal/day: a
     marathon is roughly 2,600 to 3,000 active kcal, so 4,000 keeps every real
     day and drops the added-digit typos (5000, 60000). `num` already rejects
     negatives. */
  const activeKcal = active != null && active <= 4000 ? active : null;
  let weightKg = num(params.weightkg);
  const wlb = num(params.weightlb);
  if (weightKg == null && wlb != null) weightKg = wlb * 0.45359237;
  if (weightKg != null && (weightKg < 25 || weightKg > 350)) weightKg = null;

  const exerciseMin = num(params.exmin) != null ? Math.round(num(params.exmin)) : null;
  const cycleKm = num(params.cyclekm);
  const workouts = num(params.workouts) != null ? Math.round(num(params.workouts)) : null;

  if (steps == null && activeKcal == null && weightKg == null &&
      exerciseMin == null && cycleKm == null && workouts == null && !wtypes) return null;
  return { date, steps, activeKcal, weightKg, exerciseMin, cycleKm, workouts, wtypes };
}
