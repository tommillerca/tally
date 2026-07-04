// ES-module wrapper for the vendored MapLibre GL JS UMD build (v5.24.0, BSD-3).
// The UMD assigns globalThis.maplibregl; the regular (non-CSP) build inlines
// its web worker as a blob, which works on https and capacitor:// origins.
import './maplibre-gl.js';
const maplibregl = globalThis.maplibregl;
export default maplibregl;
