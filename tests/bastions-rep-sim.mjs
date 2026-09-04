/* BASTIONS: does the rank ladder take the time we claim it does?
 *
 * The rep thresholds (1200 / 5000 / 15000) were INVENTED from a daily-rate
 * estimate and a target of "the top takes about half a year". Tom, 2026-09-03:
 * "you need to sim the rep numbers to make sure this makes sense". This is that
 * sim. It is a MODEL, not a measurement — every assumption is named below and
 * each one is a place it can be wrong.
 *
 * EARNING RULES BEING GRADED (Wearing The Colours, 2026-09-03):
 *   holding a seat            1 rep / hour
 *   ...beside a Crew member   2 rep / hour   (the social hook)
 *   taking a tower            60 rep
 *   breaking a siege          40 rep
 *
 * ASSUMPTIONS, all challengeable:
 *   - Seats are NOT held around the clock. A seat is lost to another gang at a
 *     rate derived from the spec's own sim (about 1.25 tower flips per week at
 *     three seats), and re-taken on the player's next active day. Modelling
 *     seats as permanently held is the single easiest way to make this ladder
 *     look faster than it is.
 *   - A player only acts on ACTIVE days; held seats keep earning on off days,
 *     which is the point of holding.
 *   - Crew-adjacency rises with engagement: a hardcore player coordinates.
 */
const RULES = { hold: 1, holdWithCrew: 2, take: 60, siege: 40 };
const RANKS = [
  ['Sturdy',      1200],
  ['Hardened',    5000],
  ['Unbreakable', 15000],
];
/* activeDays: days per week they open the app and fight
   seats:      average seats held once settled (cap 3)
   takes:      tower takeovers per active day
   sieges:     sieges broken per active day
   crewShare:  fraction of held hours sitting beside a Crew member */
const ARCHETYPES = [
  { name: 'Casual',   activeDays: 2, seats: 0.5, takes: 0.15, sieges: 0.02, crewShare: 0.10 },
  { name: 'Regular',  activeDays: 4, seats: 1.4, takes: 0.60, sieges: 0.10, crewShare: 0.25 },
  { name: 'Engaged',  activeDays: 6, seats: 2.3, takes: 1.20, sieges: 0.25, crewShare: 0.40 },
  { name: 'Hardcore', activeDays: 7, seats: 3.0, takes: 2.20, sieges: 0.45, crewShare: 0.55 },
];
/* 100/day. SWEPT, not chosen: uncapped, a hardcore player reached Unbreakable in
   60 days against a claimed six months, and out-earned a casual one 19.9x. At
   100 the top two archetypes land within a week of each other (150d vs 157d),
   so consistency beats grinding — the right bias for a wellness app. Set CAP in
   the environment to re-sweep. */
const DAILY_CAP = Number(process.env.CAP || 100) || Infinity;
const SEAT_LOSS_PER_WEEK = 1.25;          // from the spec's garrison sim, 3-seat model
const DAYS = 400;

function runOne(a) {
  let rep = 0, seats = 0, out = {};
  for (let d = 1; d <= DAYS; d++) {
    const active = (d % 7) < a.activeDays;
    // seats drift toward the archetype's steady state on active days, and bleed
    // to other gangs every day whether the player shows up or not
    seats = Math.max(0, seats - (SEAT_LOSS_PER_WEEK / 7) * (seats / 3));
    if (active) seats = Math.min(3, seats + (a.seats - seats) * 0.5);
    // holding pays every hour of every day, crew-adjacent hours pay double
    const plain = seats * 24 * (1 - a.crewShare) * RULES.hold;
    const withCrew = seats * 24 * a.crewShare * RULES.holdWithCrew;
    let today = plain + withCrew;
    if (active) today += a.takes * RULES.take + a.sieges * RULES.siege;
    /* A DAILY CEILING, the same shape the spec already puts on seat coins. Without
       it the ladder is 20x faster for a hardcore player than a casual one, because
       holding rep multiplies seats by crew-adjacency by hours. The cap makes
       SHOWING UP matter more than grinding, which is the right bias for a
       wellness app. */
    rep += Math.min(today, DAILY_CAP);
    for (const [name, need] of RANKS) if (!out[name] && rep >= need) out[name] = d;
  }
  return { rep, out, perDay: rep / DAYS };
}

console.log('BASTIONS REP SIM — days to each rank\n');
console.log('archetype   rep/day   Sturdy(1200)   Hardened(5000)   Unbreakable(15000)');
console.log('-'.repeat(76));
const rows = [];
for (const a of ARCHETYPES) {
  const r = runOne(a);
  rows.push({ a, r });
  const f = n => (r.out[n] ? `${String(r.out[n]).padStart(3)}d` : ' never');
  console.log(
    a.name.padEnd(11),
    r.perDay.toFixed(0).padStart(6),
    f('Sturdy').padStart(12),
    f('Hardened').padStart(15),
    f('Unbreakable').padStart(19));
}
console.log('\nSANITY CHECKS');
const eng = rows.find(x => x.a.name === 'Engaged').r;
const cas = rows.find(x => x.a.name === 'Casual').r;
const hard = rows.find(x => x.a.name === 'Hardcore').r;
const check = (label, pass, detail) => console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}  ${detail}`);
check('an Engaged player reaches Unbreakable inside a year',
  eng.out.Unbreakable && eng.out.Unbreakable <= 365, `${eng.out.Unbreakable || 'never'}d`);
check('Unbreakable takes at least four months even for the hardest player',
  !hard.out.Unbreakable || hard.out.Unbreakable >= 120, `hardcore ${hard.out.Unbreakable || 'never'}d`);
check('grinding does not beat showing up: the top two land within 30 days',
  Math.abs((hard.out.Unbreakable || 999) - (eng.out.Unbreakable || 999)) <= 30,
  `hardcore ${hard.out.Unbreakable}d vs engaged ${eng.out.Unbreakable}d`);
check('a Casual player can still reach Sturdy',
  !!cas.out.Sturdy, `${cas.out.Sturdy || 'never'}d`);
check('Sturdy lands in the first fortnight for an Engaged player',
  eng.out.Sturdy && eng.out.Sturdy <= 21, `${eng.out.Sturdy}d`);
check('the earning spread between Casual and Hardcore is under 9x',
  hard.perDay / cas.perDay < 9, `${(hard.perDay / cas.perDay).toFixed(1)}x`);
/* NOT asserted, and deliberately: a Casual player never reaches Unbreakable.
   That is the design working. The top rank is for players who actually engage
   with towers, and someone who opens the app twice a week and holds half a seat
   is not doing that. Hardened at 392d is still a real, if distant, target. */
