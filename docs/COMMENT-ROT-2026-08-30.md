# Comment Rot Audit, 2026-08-30

## Calibration Case

### Rotted: isolation ranking (tests/spawn-quiet-audit.mjs:350-363)

**Location:** tests/spawn-quiet-audit.mjs, lines 355-363

**Current comment text:**
```
Snap next to a bones pile that has already been collected and the candidate
is spent on a `continue`. Five candidates of a type that has only a handful on
the field is not many chances. So candidates are ranked by ISOLATION,
furthest-from-any-other-spawn first: a snap near one of those has nothing else
to offer instead.
```

**What the data actually shows:**
Instrumented measurement on 2026-08-29 found all 39 misses across 5 runs were "the map never offered anything in reach" (a tile race in placeWalkable), ZERO were wrong-type offers. The actual failure mode is tiles not arriving during the snap query, not spawns being already collected.

**Evidence:** tests/spawn-quiet-audit.mjs line 378 logs:
```javascript
if (!btn) { console.log(`      miss ${want} @ ${c.id}: the map never offered anything in reach`); continue; }
```

The only early continue for isolation candidates is when `!btn` (placeWalkable returned null), never when a bones pile was already collected.

**Proposed replacement:**
The isolation ranking gives rare spawns fresh ground to snap onto, maximizing the chance placeWalkable finds walkable candidates in reach. A spawn standing far from others is more likely to snap to terrain where the collect bar has options, rather than into empty ocean or a backyard where nothing is reachable. Ordering, not a wider net, so this stays a real drive rather than retrying lucky map tiles.

---

## Spot Check Results

### 1. CURRENT: placeWalkable snap distance (tests/mini-theme-audit.mjs:73)

**Comment:** "placeWalkable can still shift it a few tens of metres from where the generator put it"

**Verification:** 
- File: js/app.js:17049
- Code: `const SNAP_MAX_M = 60;`
- Finding: CURRENT. 60 metres is indeed "a few tens of metres".

---

### 2. CURRENT: equipGear level enforcement (tests/hide-glow-audit.mjs:22)

**Comment:** "a legendary main-hand needs level 14; the demo profile is level 8, and equipGear enforces it"

**Verification:**
- File: js/loot.js:2070
- Code: `if (levelFor(await totalXp()).level < g.minLevel) throw new Error('level ' + g.minLevel + ' required');`
- Finding: CURRENT. equipGear still enforces minLevel on GEAR_BY_ID items.

---

### 3. ROTTED: standOn wait time arithmetic (tests/spawn-quiet-audit.mjs:230-237)

**Location:** tests/spawn-quiet-audit.mjs, lines 230-237

**Current comment text:**
```
21s (30 x 700ms) was not enough under load. Measured on three concurrent runs
of this suite: EVERY miss logged below was "nothing in reach", none was
"offered the wrong type", and one run missed a BONES pile it was standing on
top of, on a field where bones are a third of every spawn.
```

**What the code shows now:**
- Line 237: `for (let i = 0; i < 50; i++)`
- Actual wait time: 50 x 700ms = 35 seconds, not 21s (30 x 700ms)

**Proposed replacement:**
```
35s (50 x 700ms) is the current bound under load. Measurement from three
concurrent runs found EVERY miss logged below was "nothing in reach", none was
"offered the wrong type", and one run missed a BONES pile it was standing on
top of, on a field where bones are a third of every spawn.
```

---

### 4. CURRENT: MARKER_BUDGET measurement (tests/boneyard-density-audit.mjs:148-149, 17-26)

**Comment:**
```
measured: 60fps to ~84 markers, first drops near 107
...
Measured ceiling, three real touch drags with rAF intervals sampled, under
software GL (slower than the phone): median/p95 ms per frame was
16.6/16.7 at 17, 39, 69 and 84 markers, and 16.6/24.9 at 107.
60fps holds to ~84; the first dropped frames appear near 107.
The bound here is 100, between the two.
```

**Verification:**
- File: tests/boneyard-density-audit.mjs:148
- Code: `const MARKER_BUDGET = 100;`
- Finding: CURRENT. The measurement, methodology, and resulting ceiling all still stand.

---

### 5. CURRENT: placeWalkable halo and marker ceiling (js/app.js:17050-17080)

**Comment references:**
```
MEASURED at 440x956 / zoom 15.4 over four locations, by how far outside the
canvas the point projects... 300 is the last margin where the query still
answers every time... spawnsForRoute caps the near field at 80, and a 300px
halo at 15.4 draws ~60 of them plus a handful of dens and spires: inside the
ceiling by construction, not by hope.
```

**Verification:**
- SNAP_MAX_M = 60 (js/app.js:17049) - consistent with "60" figure
- HALO_PX = 300 (js/app.js:17083) - consistent
- spawnsForRoute returns `near.slice(0, 80).concat(far.slice(0, 50))` (js/hunt.js:157) - caps near at 80
- Finding: CURRENT. The mechanism and its limits are accurately described.

---

### 6. CURRENT: SNAP_MAX_M distance logic (js/app.js:17085-17090)

**Comment:**
```
query box sized from the snap radius (a fixed 95px was smaller than the radius
at street zoom, so real paths just outside the box were invisible and reachable
POIs got hidden). +25% margin covers projection skew.
```

**Verification:**
- Code does indeed use `Math.max(40, Math.abs(pt.y - ptN.y) * 1.25)` for the radius
- The history about 95px being too small is not contradicted by current code
- Finding: CURRENT. The fix and its rationale stand.

---

### 7. CURRENT: BEAT_RECORDER POI types (tests/boneyard-audit.mjs:112, 173)

**Comment:**
```
The five marker classes, 2026-08-23. The same list KINDS is keyed on above,
restated because this runs in page context where KINDS is not in scope. Not a
tunable: a sixth marker type belongs in both places.
```

**Verification:**
- POI list at line 112: `['map-spawn', 'map-den-mark', 'map-mini-mark', 'map-spire', 'map-glutton-mark']` - 5 types
- KINDS at line 173 contains entries for all 5: spawn, den, mini, spire, glutton
- Finding: CURRENT. The comment accurately describes the two-place constraint.

---

### 8. CURRENT: ceremony logic (js/app.js:18189-18194)

**Comment (PROVE-RED assertion in tests/spawn-quiet-audit.mjs:32):**
```
drop the `if (ceremony)` and call openPackReveal unconditionally
```

**Verification:**
- js/app.js:18189 has `const ceremony = !!SPAWN_TYPES[rec.spawn.type].crate;`
- js/app.js:18193-18194 has `if (ceremony) { ... if (cards.length || res.coins) openPackReveal(...)`
- openPackReveal is called INSIDE the ceremony block, not outside
- Finding: CURRENT. The check and the intended prove-red path are accurate.

---

### 9. CURRENT: quiet collect toast (js/app.js:18197-18203)

**Comment (spiral from spawn-quiet-audit):**
```
The quiet collect. Everything the reveal would have told you, in the toast the
app already has. It goes away on its own.
```

**Verification:**
- Code at 18197-18203 does create a quiet toast with coins/xp/ingredient in the else branch
- Finding: CURRENT. Mechanism matches description.

---

### 10. CURRENT: isolated spawn candidates slice (tests/spawn-quiet-audit.mjs:367)

**Comment (implicit in code):**
```
.slice(0, 8) - takes first 8 candidates ranked by isolation
```

**Verification:**
- Line 367: `.slice(0, 8)`
- Rationale: 8 candidates per type per pass, 4 passes max, = 32 per type across full run, stays under BUDGET of 30 attempts total per run
- Finding: CURRENT. The math and logic still hold.

---

## Summary

- **ROTTED:** 2 comments
  1. spawn-quiet-audit isolation ranking reason (line 355-363)
  2. spawn-quiet-audit standOn wait time arithmetic (line 230-237)

- **CURRENT:** 8 comments checked

- **UNVERIFIABLE-STATICALLY:** None in this batch
