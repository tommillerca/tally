# Crew capture: operator runbook

This lane supplies instruments and a bisect plan. Browser operation, screenshots, visual approval and device proof belong to the operator. Nothing here launches a browser or starts a listener. All imports resolve within the checkout containing these files.

## Prerequisites and safety

Use an operator-started Puppeteer browser with an isolated context, a disposable local origin serving the selected checkout, and an already booted `?demo` page. Dismiss any boot sheets using their real controls before capture. Do not mask `navigator.webdriver`: the existing application hooks require it. Do not use a production URL or an `api` override. The module refuses non-local origins, non-demo pages, non-webdriver pages, absent `tally-demo` databases and missing demo headers before installing fixtures.

`prepareCrew(page)` installs a request interceptor for that disposable page's lifetime. It blocks external network requests and non-GET/HEAD requests, and bypasses service workers. It never registers or modifies a social identity. It writes only `racePushAt`, `crewFaves` and `friendSnaps` in the named `tally-demo` database. Close this disposable context when finished. Do not attach another request interceptor which continues requests ahead of this one.

The existing demo boot itself is operator-owned. The harness cannot undo requests made before it was attached. The app's demo/webdriver boot disables social boot sync. Start on a clean context so an earlier demo social identity, saved sheet or font override cannot contaminate a run.

## Drive the page

Run the following in an operator Node script or REPL from this checkout. `page` is the existing Puppeteer page. Set the viewport before booting the demo page. Keep browser engine, viewport, DPR, root font, zoom, fixture scenario and selected member identical across builds.

```js
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  prepareCrew, fanSurface, memberSurface, stepLeaderboardSurface,
  levelLeaderboardSurface, measureCrew, measureStepRows,
} from './tests/lib/crew-capture.mjs';

const out = '/tmp/crew-capture-v538';
mkdirSync(out, { recursive: true });
const fixture = await prepareCrew(page, { scenario: 'fresh' });
await (await fanSurface(page)).screenshot({ path: `${out}/fan.png` });
const members = [];
for (const friend of fixture.data.friends) {
  await (await memberSurface(page, friend.playerId)).screenshot({
    path: `${out}/${friend.playerId}.png`,
  });
  const measurement = await measureCrew(page);
  members.push(measurement.cards.find(card => card.featured));
}
const measurement = await measureCrew(page);
measurement.cards = members;
writeFileSync(`${out}/members.json`, JSON.stringify(measurement, null, 2));

await (await stepLeaderboardSurface(page)).screenshot({ path: `${out}/steps.png` });
writeFileSync(`${out}/step-rows.json`, JSON.stringify(await measureStepRows(page), null, 2));

// Optional diagnostic: this is the LEVEL board, not the step race.
await (await levelLeaderboardSurface(page)).screenshot({ path: `${out}/levels.png` });
```

A surface function returns an ElementHandle. It scrolls into view and waits for fonts, image decoding and the fan transition. A single member is selected through the real delegated fan click, without rewriting card styles. The fan has seven members, including long text, a spire line, and six pet species. The step board has five ranked racers and an own row at rank 3.

Repeat the step capture in a fresh page/context for each scenario: `fresh`, `one-stale`, `all-stale`, `unknown`. The latter three vary step snapshot timestamps only, keeping member-card data fixed. `one-stale` is particularly important: the current renderer hides every track when just one racer has stale data. A fresh-only run will miss it. Use the real Done control to close the level sheet before another surface capture.

## What the measurements mean

`measureCrew(page)` returns JSON with viewport metadata, member measurements and the currently mounted step rows. All boxes are live `getBoundingClientRect()` values in CSS pixels, including transforms.

- `card`, `bar`, `barHeightFraction`, `barWidthFraction`: the bar is `.cfan-plate`, the name/title/snapshot plate. Centralize each member before comparing ratios. Side cards are rotated, so their axis-aligned box ratios mix rotation with height.
- `pet`, `petTopFraction`, `petCenterFraction`, `petBottomFraction`: the `.cfan-pet` wrapper's vertical bounds relative to the card. `petBarOverlapPx` measures vertical plate encroachment. These are layout bounds, not a pet silhouette or its shadow.
- Each step row includes its rank, own-row flag, row box and `.run` icon measurement. A missing node returns `exists:false` and a null box. An existing node returns full and clipped boxes, own and ancestor-effective opacity, decoded image/canvas boxes, source raster alpha counts, and alpha inside the icon crop. The crop is rendered into a 64 by 64 analysis canvas using current DOM image boxes.
- `samples` are a 5 by 5 hit-test grid. `overlaps` reports elements ahead of the icon in those hit tests and probes the box intersections of other elements to catch small covers between grid points. A temporary pointer-events rule includes pointer-inert overlays; it is removed in `finally` and does not change layout or paint. Transparent intersecting containers are conservatively reported, rather than silently dismissed.
- `measureStepRows(page)` scrolls every row into view and measures it there. Use it for assertions. A one-shot `measureCrew` also reports offscreen rows, whose clipped boxes can legitimately be empty.

These are DOM layout, raster-alpha and hit-test measurements, not a screenshot compositor oracle. Arbitrary masks, filters, pseudo-elements, complex rotations and transparent overlays can require manual screenshot review. Pet animation frames and source silhouettes are not normalized by the pet-wrapper guard. Screenshot inspection must decide the hedged pet symptom. No browser measurements have been collected in this lane.

## Run the three BROWSER guards

The scripts connect to an already running operator browser. They never launch one. Without required configuration they report `UNPROVEN` and exit 97.

```sh
export CREW_CAPTURE_CDP=http://127.0.0.1:9222
export CREW_CAPTURE_URL='http://127.0.0.1:8765/?demo#/friends'
export CREW_CAPTURE_OUTPUT=/tmp/crew-capture-guards
export CREW_CAPTURE_BASELINE=/tmp/crew-approved-members.json
node tests/crew-bars-browser-audit.mjs
node tests/crew-pets-browser-audit.mjs
node tests/crew-icons-browser-audit.mjs
```

Use the exact `page.url()` value for `CREW_CAPTURE_URL`, including the hash. Exactly one matching page is required. Close any sheets before running. Each script returns to Crew. Node inspection never needs these environment variables.

For bars and pets, inspect a known-good capture, approve it, and add `approvedBy` and `sourceBuild` to its `members.json` before saving it as the baseline. Keep all seven centrally measured members. Do not approve current output automatically. Baseline metadata must match viewport width/height, DPR, root font size, visual zoom and user agent. For another text size or device, provide another approved baseline.

Bar height must not grow beyond the approved ratio plus two CSS pixels normalized to baseline card height. Bar width and pet top/center/bottom must stay within the corresponding two-pixel tolerance. Pet/plate overlap must not grow by more than two pixels. These are comparison tolerances, not invented product acceptance limits. No product threshold or approved geometry was supplied with the frozen order.

The icon guard needs no approved baseline. Every one of five rows must have positive icon geometry, effective opacity above 0.05, at least 90% of its icon box unclipped, decoded nontransparent raster art, raster ink inside the icon crop, and no detected covers. Controls mutate actual DOM geometry: zero icon size, zero opacity, hidden art, an opaque pointer-inert overlay, a 240px plate, and a pet shifted down 100px. Each must be detected. The fresh sample must be healthy before the icon controls are meaningful.

The current stale scenarios are expected to fail the icon guard. That is recorded source behavior, not a browser result. No Crew rendering is fixed here.

## Node proof

```sh
node tests/crew-capture-node-audit.mjs
node tests/unit.test.js
node docs/crew-capture/run-pure.mjs
```

The Node audit installs the same guarded fixture callback into a VM, then executes the shipped identity branch, `paint`, `paintFan`, `fetchLb`, `openLeaderboard` and `hydrateRace` with explicit DOM doubles. It proves seven card templates, five level rows, five step rows including the player, and zero social fallback calls. Removing the friend hook must hit the fallback; disabling webdriver must refuse fixture identity. It does not execute browser navigation, fan seating, image composition or layout.

The PURE runner enumerates the initializer and every `PURE.push`/`PURE.unshift` in `tests/release-gate.mjs`, rejects fewer than 152 entries and duplicates, respects the gate's SERIAL list, and starts no server or browser. It saves the enumeration and every exit code in `proof/`, with full per-audit streams in the printed temporary directory. The three geometry audits are registered only in BROWSER.
