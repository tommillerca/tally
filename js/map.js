// The Boneyard map: MapLibre GL mechanics, lazily loaded so app boot stays light.
// The screen/controller logic lives in app.js (openMap), mirroring how the old
// radar lived there; this module owns the library, camera defaults, and markers.

export const MAP_MIN_ZOOM = 13.5;
export const MAP_MAX_ZOOM = 18;
/* HOW MUCH GROUND THE SCREEN HOLDS, and therefore how full the Boneyard looks.
 *
 * Tom, 2026-08-18: "splitting up the amount of food items and gold would help us
 * curb that and make the boneyard seem more full." econ/boneyard-supply did the
 * splitting (2.5x the spawns, each worth less). It did not make the map look
 * fuller, and measuring the RENDERED map said why.
 *
 * The field is ~24.7 spawns/km². At 16.4 a 440x956 phone screen covers
 * 260 x 525 m = 0.14 km², so it can only ever hold ~3.4 of them. Measured on the
 * real map at four Vancouver locations: 2.75 spawns generated inside the
 * viewport, 2.75 of them placed, 3.75 markers visible. I looked at that
 * screenshot and counted TWO. The gate that hides off-screen spawns is not what
 * empties it: 0.00 of the in-view spawns failed the walkability snap, so every
 * spawn the screen could hold was already drawn. There were only ever three.
 *
 * So the lever is ground per screen, not spawns per ground (that half is done,
 * and touching it again would move the faucet). Measured across the same four
 * locations, markers whose box meets the 440x956 screen, by start zoom:
 *
 *   16.4  3.75   0.14 km²   collect ring 254px    (before)
 *   15.9  8.50   0.27 km²   collect ring 180px
 *   15.4  15.75  0.55 km²   collect ring 127px    (chosen)
 *   15.0  27.75  0.95 km²   collect ring  96px    markers start colliding
 *   14.5  51.75  1.9 km²    collect ring  68px    a wall of pins
 *
 * Counted against the map CANVAS instead, which is the stricter box the header
 * and tests/boneyard-density-audit.mjs both use, 16.4 gives 4.00 and 15.4 gives
 * 13.75. Same story, two definitions of "on screen"; the ratio is what matters.
 *
 * 15.4 is where the map reads full and the markers still stand apart: at 15.0
 * the screenshot has four overlapping pairs, and the 75 m ring, which is the one
 * thing on this screen that tells you what "in reach" means, is down to 96px.
 * Nothing generated, dropped or paid changes; this only moves the camera.
 */
export const MAP_START_ZOOM = 15.4;

let maplibrePromise = null;

// Dynamic-import the vendored UMD build (same lazy pattern as js/ocr.js).
// The wrapper exports globalThis.maplibregl; CSS is injected once on demand.
export function loadMaplibre() {
  if (!maplibrePromise) {
    maplibrePromise = (async () => {
      if (!document.querySelector('link[data-maplibre]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = new URL('../vendor/maplibre/maplibre-gl.css', import.meta.url).href;
        link.dataset.maplibre = '1';
        document.head.appendChild(link);
        await new Promise(res => { link.onload = res; link.onerror = res; setTimeout(res, 1500); });
      }
      const mod = await import('../vendor/maplibre/maplibre.mjs');
      const gl = mod.default || globalThis.maplibregl;
      if (!gl) throw new Error('MapLibre failed to load');
      return gl;
    })();
    maplibrePromise.catch(() => { maplibrePromise = null; });
  }
  return maplibrePromise;
}

// Create the styled map. North-up, follow-cam friendly, no default controls
// (we draw our own attribution pill; OSM credit is required and always visible).
export function createBoneyardMap(maplibregl, container, { lat, lng }) {
  const map = new maplibregl.Map({
    container,
    style: 'assets/map/boneheadz-style.json',
    preserveDrawingBuffer: !!navigator.webdriver, // pixel-readback for tests only
    center: [lng, lat],
    zoom: MAP_START_ZOOM,
    minZoom: MAP_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    pitch: 0,
    bearing: 0,
    attributionControl: false,
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false,
  });
  map.touchZoomRotate.disableRotation();
  return map;
}

// A DOM marker that keeps map-space alignment (stays put as the camera eases).
/* One choke point for every DOM marker on the Boneyard, and the one place that
   has to survive teardown.
   Leaving the Boneyard runs cleanup(): map.remove() then `map = null`. But the
   refresh functions are async (they await the server for spire ownership, and
   queryRenderedFeatures for walkable snapping), so a refresh started before you
   left can resolve after, and it will happily build a marker for a map that no
   longer exists. maplibre's Marker.addTo(null) then throws
   `Cannot read properties of null (reading '_getUIString')`, an uncaught
   TypeError with a stack that points into the vendor bundle and names nothing
   useful. Reproducible by opening the Boneyard, leaving, and going back.
   A dead-marker stub rather than null, because ~6 call sites immediately do
   rec.marker.setLngLat(...) on the way back out. */
/* LATE ARRIVALS FADE IN TOGETHER, NOT ONE AT A TIME.
 *
 * Tom, 2026-08-08: "you've told me multiple times that the boneyard doesn't load
 * POIs differently anymore. It does. It still doesn't load cleanly, things
 * trickle in."
 *
 * He was right and the audit was testing the wrong moment. First load IS clean:
 * everything is held at opacity 0 until the first placement pass finishes, then
 * `markers-in` fades the lot up together. But that class is permanent, so every
 * marker created AFTER it -- which is every marker found while you look around,
 * the roaming-POI feature working as asked -- was born already visible and popped
 * in on its own. Measured after one pan: three separate arrivals spread over
 * 1281ms.
 *
 * So the same rule the first load gets is applied to every later batch: a new
 * marker is held invisible, and everything that lands in the same beat is
 * revealed in one go. Debounced, because placement resolves in waves (the
 * walkability snap needs tiles), with a hard cap so a marker can never be
 * stranded invisible if the waves never stop.
 */
/* Measured after one pan (2026-08-08): placement resolves in TWO waves, at
   ~1.5s and ~4.1s, because the walkability snap waits on tiles and spires need a
   network round trip. A 500ms quiet window split them into two reveals, which is
   the trickle.
   Measured gap between the two waves: ~2.6s. The quiet window must outlast it or
   the first wave reveals alone and the second still trickles in behind it. This
   trades a little latency (late finds land together roughly 3s after you pan)
   for the map never assembling itself in front of you, which is the complaint. */
const ARRIVE_QUIET_MS = 1200;   // no new marker for this long = the beat is over
const ARRIVE_MAX_MS = 2600;     // never hold anything longer than this
const POI_CLASSES = ['map-spawn', 'map-den-mark', 'map-mini-mark', 'map-spire', 'map-glutton-mark'];
let arriving = [];
let quietT = null;
let capT = null;
/* The bundled hold below is for PAN arrivals: POIs found while looking around,
   which really do trickle and need coordinating into a beat. The initial-load
   second wave (POIs that missed the first placement because tiles were still
   loading) is a different animal: it lands 200-1500ms after the reveal on a
   slow line, and holding it 1200ms then popping it in with a poiPop scale is
   exactly the "stuff appearing on a settled map" Tom complained about in v294
   and v295. Route those through the standard markers-in transition (a 220ms
   opacity fade) instead. Flip on the first user gesture (dragstart/zoomstart
   with e.originalEvent, gated in openMap): after a real pan or zoom, we're
   back to the trickle-guard regime. Programmatic camera moves (easeTo/flyTo)
   must NOT flip this or the initial second wave would re-enter the batched
   hold path, which is the exact bug being fixed. */
let interacted = false;
export function markMapInteracted() { interacted = true; }
export function resetMapInteracted() { interacted = false; }   // openMap teardown
export function isMapInteracted() { return interacted; }   // audit hook, no runtime callers
function flushArrivals() {
  clearTimeout(quietT); clearTimeout(capT); quietT = capT = null;
  /* Everything in the beat is revealed on the SAME frame, with a deliberate
     entrance. Measured 2026-08-08: placement genuinely lands in two waves ~2.6s
     apart (local snap, then network-backed spires), so holding for both leaves
     the map blank for 6.6s after a pan, which is its own bug. Two coordinated
     beats with an entrance is not the complaint: the complaint is markers
     appearing one at a time with no acknowledgement, which reads as the screen
     still loading. A thing that ANNOUNCES itself reads as a discovery. */
  const batch = arriving; arriving = [];
  requestAnimationFrame(() => {
    for (const n of batch) { n.classList.remove('poi-arriving'); n.classList.add('poi-in'); }
    setTimeout(() => { for (const n of batch) n.classList.remove('poi-in'); }, 420);
  });
}
function holdArrival(el) {
  const stage = document.getElementById('mapStage');
  // Before the first reveal, `markers-in` already owns the batching. Only markers
  // that turn up AFTER the map is on screen need holding.
  if (!stage || !stage.classList.contains('markers-in')) return;
  if (!POI_CLASSES.some(c => el.classList.contains(c))) return;   // never the player's own marker
  if (!interacted) {
    /* Initial-load second wave: fade in over 220ms via the standard markers-in
       transition. `poi-arriving` forces opacity 0 for one frame so the
       transition has a start value; the next rAF removes it and the base
       opacity transition takes over. No batching, no poiPop scale, no 1200ms
       hold. */
    el.classList.add('poi-arriving');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.remove('poi-arriving');
    }));
    return;
  }
  el.classList.add('poi-arriving');
  arriving.push(el);
  clearTimeout(quietT);
  quietT = setTimeout(flushArrivals, ARRIVE_QUIET_MS);
  // anti-regression rule 8: whatever hides something must own un-hiding it
  if (!capT) capT = setTimeout(flushArrivals, ARRIVE_MAX_MS);
}

export function domMarker(maplibregl, map, { lat, lng, el, anchor = 'center' }) {
  if (!map) {
    try { el?.remove(); } catch { /* never attached */ }
    return { setLngLat() { return this; }, remove() { return this; }, getElement: () => el, _dead: true };
  }
  holdArrival(el);
  const m = new maplibregl.Marker({ element: el, anchor })
    .setLngLat([lng, lat])
    .addTo(map);
  return m;
}
