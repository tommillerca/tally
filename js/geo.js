// Pure geometry for placing spawns on WALKABLE ground. Spawns are still anchored
// by their deterministic seeded cell (the ledger key never changes), but the
// DISPLAYED + collectible position is snapped to the nearest road / path / park
// from the map's vector features, so nothing lands in a backyard or a building.
// No DOM, no map API: takes plain GeoJSON features. Unit-tested.

// Which OpenMapTiles features count as "walkable" to snap onto.
const WALKABLE_ROAD = new Set([
  'primary', 'secondary', 'tertiary', 'residential', 'living_street', 'service',
  'unclassified', 'road', 'minor', 'pedestrian', 'path', 'footway', 'cycleway',
  'track', 'steps',
]);
const WALKABLE_LANDUSE = new Set([
  'park', 'grass', 'recreation_ground', 'meadow', 'garden', 'pitch',
  'playground', 'village_green', 'common', 'dog_park', 'greenway',
]);
export function isWalkableFeature(f) {
  if (!f) return false;
  const sl = f.sourceLayer;
  const cls = f.properties && (f.properties.class || f.properties.subclass);
  if (sl === 'transportation') return WALKABLE_ROAD.has(cls);
  if (sl === 'park') return true;
  if (sl === 'landuse') return WALKABLE_LANDUSE.has(cls);
  return false;
}

const M_PER_DEG_LAT = 110540;
function mPerDegLng(lat) { return 111320 * Math.cos((lat * Math.PI) / 180); }
function toXY(lat, lng, oLat, oLng) { return { x: (lng - oLng) * mPerDegLng(oLat), y: (lat - oLat) * M_PER_DEG_LAT }; }
function toLatLng(x, y, oLat, oLng) { return { lat: oLat + y / M_PER_DEG_LAT, lng: oLng + x / mPerDegLng(oLat) }; }

// nearest point on segment AB to the origin (0,0), returned in local meters
function nearestOnSeg(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + t * dx, y: ay + t * dy };
}
// ray-cast: is the origin (0,0) inside the ring (array of {x,y})?
function originInRing(ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].y, xi = ring[i].x, yj = ring[j].y, xj = ring[j].x;
    if (((yi > 0) !== (yj > 0)) && (0 < (xj - xi) * (0 - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// Snap `anchor` {lat,lng} to the nearest walkable point within maxMeters.
// Returns {lat,lng,dist,inside?} or null if nothing walkable is close enough.
export function snapToWalkable(anchor, features, maxMeters = 35) {
  let best = null, bestD = Infinity;
  const consider = (x, y) => { const d = Math.hypot(x, y); if (d < bestD) { bestD = d; best = { x, y }; } };
  for (const f of features || []) {
    if (!isWalkableFeature(f)) continue;
    const g = f.geometry;
    if (!g) continue;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : null;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
    if (lines) {
      for (const line of lines) {
        for (let i = 0; i + 1 < line.length; i++) {
          const a = toXY(line[i][1], line[i][0], anchor.lat, anchor.lng);
          const b = toXY(line[i + 1][1], line[i + 1][0], anchor.lat, anchor.lng);
          const p = nearestOnSeg(a.x, a.y, b.x, b.y);
          consider(p.x, p.y);
        }
      }
    }
    if (polys) {
      for (const poly of polys) {
        const ring = poly[0].map(c => toXY(c[1], c[0], anchor.lat, anchor.lng));
        if (originInRing(ring)) return { lat: anchor.lat, lng: anchor.lng, dist: 0, inside: true }; // already in the park
        for (let i = 0; i + 1 < ring.length; i++) {
          const p = nearestOnSeg(ring[i].x, ring[i].y, ring[i + 1].x, ring[i + 1].y);
          consider(p.x, p.y);
        }
      }
    }
  }
  if (best && bestD <= maxMeters) return { ...toLatLng(best.x, best.y, anchor.lat, anchor.lng), dist: bestD };
  return null;
}
