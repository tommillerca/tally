// The Boneyard map: MapLibre GL mechanics, lazily loaded so app boot stays light.
// The screen/controller logic lives in app.js (openMap), mirroring how the old
// radar lived there; this module owns the library, camera defaults, and markers.

export const MAP_MIN_ZOOM = 13.5;
export const MAP_MAX_ZOOM = 18;
export const MAP_START_ZOOM = 16.4;

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
export function domMarker(maplibregl, map, { lat, lng, el, anchor = 'center' }) {
  if (!map) {
    try { el?.remove(); } catch { /* never attached */ }
    return { setLngLat() { return this; }, remove() { return this; }, getElement: () => el, _dead: true };
  }
  const m = new maplibregl.Marker({ element: el, anchor })
    .setLngLat([lng, lat])
    .addTo(map);
  return m;
}
