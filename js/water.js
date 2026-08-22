/* IS THIS POINT WATER? The Boneyard's one land oracle, and the reason it exists
 * is a lake. Tom, 2026-08-22: "The wanderer is out in the lake where I am right
 * now. He shouldn't be. He's bound to land." wandererAt was pure math on a
 * lat/lng grid with zero land awareness, so a seeded beat centred on water put
 * the map's one agent out on the surface of it.
 *
 * THE ANSWER MUST BE THE SAME ON EVERY DEVICE, or two friends see the wanderer
 * in different places, which is worse than the lake. So nothing here reads the
 * RENDERED map: queryRenderedFeatures answers from whatever tiles the viewport
 * happens to hold at whatever zoom the camera is at, which is a per-device
 * answer. Instead the classification is computed from the basemap's own vector
 * tiles at ONE FIXED ZOOM:
 *
 *   - The style's only source is OpenFreeMap planet (openmaptiles schema),
 *     maxzoom 14. Every zoom the player can see (13.5 to 18) is an overzoom of
 *     the same z14 data, so z14 is both the finest data that exists and exactly
 *     what is DRAWN as water on screen.
 *   - Tiles are immutable per release: the TileJSON's template carries a dated
 *     path (e.g. /planet/20260816_080001_pt/) and tiles serve with
 *     cache-control max-age=315360000 and access-control-allow-origin: *.
 *     Same tile bytes for every client, decoded by the same code.
 *   - The test is point-in-polygon against the tile's `water` layer in integer
 *     tile coordinates. No rendering, no viewport, no zoom dependence.
 *
 * THE ONE HONEST CAVEAT: OpenFreeMap re-cuts the planet every week or two and
 * the dated path moves. Two devices that fetched the TileJSON on either side of
 * a re-cut can briefly hold different shoreline geometry, so a sample point
 * sitting exactly on an edited shoreline could classify differently for a day.
 * That is the same skew the basemap itself already has (they would also be
 * LOOKING at two different shorelines), it converges as soon as both maps
 * reopen, and there is no smaller answer available without shipping our own
 * water data. Everything else is bit-identical.
 *
 * SYNC BY DESIGN. isWater(lat, lng) returns true / false / undefined-right-now.
 * The pure derivation in js/wanderer.js consumes it as data; undefined means
 * "tiles not here yet", the caller hides the wanderer for that pass, and the
 * lookup itself queues the missing tile so a later pass can answer. That is the
 * placeWalkable pattern: undecided is hidden-and-retry, never shown-and-wrong.
 */

const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
export const WATER_Z = 14;

let tpl = null;          // resolved tile URL template, or null until TileJSON lands
let tplLoading = null;
const tiles = new Map(); // "x/y" -> { feats } | 'pending' | { retryAt }
const MAX_TILES = 64;    // ~9 cells around the player need <= ~16; cap the cache

function fetchTemplate() {
  if (tpl || tplLoading) return;
  tplLoading = fetch(TILEJSON_URL)
    .then(r => r.json())
    .then(j => { tpl = j.tiles[0]; })
    .catch(() => { tplLoading = null; }); // retried by the next isWater call
}

async function gunzipMaybe(buf) {
  const b = new Uint8Array(buf);
  if (b.length < 2 || b[0] !== 0x1f || b[1] !== 0x8b) return b; // fetch already inflated it
  const ds = new DecompressionStream('gzip');
  const out = new Response(new Blob([b]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

function fetchTile(tx, ty) {
  const key = `${tx}/${ty}`;
  const cur = tiles.get(key);
  if (cur === 'pending' || (cur && cur.feats)) return;
  if (cur && cur.retryAt > Date.now()) return;
  if (!tpl) { fetchTemplate(); return; }
  if (tiles.size > MAX_TILES) {
    for (const [k, v] of tiles) { if (v !== 'pending') tiles.delete(k); if (tiles.size <= MAX_TILES / 2) break; }
  }
  tiles.set(key, 'pending');
  const url = tpl.replace('{z}', WATER_Z).replace('{x}', tx).replace('{y}', ty);
  fetch(url)
    .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
    .then(gunzipMaybe)
    .then(bytes => { tiles.set(key, { feats: waterFeatures(bytes) }); })
    .catch(() => { tiles.set(key, { retryAt: Date.now() + 15000 }); });
}

/* ------------------------- Mapbox Vector Tile decode, water polygons only.
   A tile is protobuf: Tile { repeated Layer layers = 3 }, Layer { name = 1,
   repeated Feature features = 2, extent = 5 }, Feature { type = 3 (3=POLYGON),
   packed uint32 geometry = 4 }. Geometry is MoveTo/LineTo/ClosePath commands
   with zigzag-delta coordinates. ~60 lines beats shipping a protobuf library
   for one message type we control end to end. */
function varint(b, s) { // -> [value, nextPos]; MVT values fit in 53 bits fine
  let v = 0, shift = 0, p = s.p;
  for (;;) {
    const byte = b[p++];
    v += (byte & 0x7f) * 2 ** shift;
    if (byte < 0x80) break;
    shift += 7;
  }
  s.p = p;
  return v;
}
const zigzag = v => (v % 2 === 1 ? -(v + 1) / 2 : v / 2);

function waterFeatures(b) {
  const feats = [];
  const s = { p: 0 };
  while (s.p < b.length) {
    const tag = varint(b, s);
    if (tag >>> 3 !== 3 || (tag & 7) !== 2) { skip(b, s, tag & 7); continue; }
    const len = varint(b, s), end = s.p + len, layerStart = s.p;
    // first pass: is this layer "water"? (name can come after features)
    let name = '', extent = 4096;
    const featSpans = [];
    while (s.p < end) {
      const t = varint(b, s);
      const f = t >>> 3, w = t & 7;
      if (f === 1 && w === 2) { const l = varint(b, s); name = ascii(b, s.p, l); s.p += l; }
      else if (f === 5 && w === 0) extent = varint(b, s);
      else if (f === 2 && w === 2) { const l = varint(b, s); featSpans.push([s.p, s.p + l]); s.p += l; }
      else skip(b, s, w);
    }
    if (name !== 'water') { s.p = end; continue; }
    for (const [fs, fe] of featSpans) {
      s.p = fs;
      let type = 0, rings = null;
      while (s.p < fe) {
        const t = varint(b, s), f = t >>> 3, w = t & 7;
        if (f === 3 && w === 0) type = varint(b, s);
        else if (f === 4 && w === 2) { const l = varint(b, s); const ge = s.p + l; rings = decodeRings(b, s, ge); }
        else skip(b, s, w);
      }
      if (type === 3 && rings && rings.length) feats.push({ rings, extent });
    }
    s.p = end;
    void layerStart;
  }
  return feats;
}
function ascii(b, p, l) { let out = ''; for (let i = 0; i < l; i++) out += String.fromCharCode(b[p + i]); return out; }
function skip(b, s, wire) {
  if (wire === 0) varint(b, s);
  else if (wire === 2) { const l = varint(b, s); s.p += l; }
  else if (wire === 5) s.p += 4;
  else if (wire === 1) s.p += 8;
  else throw new Error('wire' + wire);
}
function decodeRings(b, s, end) {
  const rings = [];
  let ring = null, x = 0, y = 0;
  while (s.p < end) {
    const cmd = varint(b, s), op = cmd & 7, n = cmd >>> 3;
    if (op === 1) { // MoveTo
      for (let i = 0; i < n; i++) {
        x += zigzag(varint(b, s)); y += zigzag(varint(b, s));
        ring = [x, y]; rings.push(ring);
      }
    } else if (op === 2) { // LineTo
      for (let i = 0; i < n; i++) { x += zigzag(varint(b, s)); y += zigzag(varint(b, s)); ring.push(x, y); }
    } else if (op === 7) { /* ClosePath: implicit segment back to ring start */ }
    else throw new Error('cmd' + op);
  }
  return rings;
}

/* Even-odd point-in-polygon per feature, across all its rings, so holes
   (islands) count OUT and a point on an island in a lake is land. */
function inFeature(f, px, py) {
  let inside = false;
  for (const r of f.rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/* true = water, false = land, undefined = the tile is not here yet (queued;
   ask again next pass). Deterministic for a given tile release: pure integer
   tile coordinates against the same bytes every client downloads. */
export function isWater(lat, lng) {
  const n = 1 << WATER_Z;
  const xf = ((lng + 180) / 360) * n;
  const latR = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  const tx = Math.floor(xf), ty = Math.floor(yf);
  const t = tiles.get(`${tx}/${ty}`);
  if (!t || !t.feats) { fetchTile(tx, ty); return undefined; }
  const px = (xf - tx) * 4096, py = (yf - ty) * 4096;
  for (const f of t.feats) {
    const sx = f.extent === 4096 ? px : (px * f.extent) / 4096;
    const sy = f.extent === 4096 ? py : (py * f.extent) / 4096;
    if (inFeature(f, sx, sy)) return true;
  }
  return false;
}

/* Resolves once every point in `points` ([lat, lng] pairs) can answer.
   The audits use it; the app just calls isWater and lets refresh cadence retry. */
export async function ensureWater(points, timeoutMs = 30000) {
  const t0 = Date.now();
  for (;;) {
    if (points.every(([la, ln]) => isWater(la, ln) !== undefined)) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await new Promise(r => setTimeout(r, 120));
  }
}
