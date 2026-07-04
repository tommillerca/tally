// Live barcode scanning: getUserMedia + zbar-wasm on a center crop of the video frame.
import { scanImageData } from '../vendor/zbar/zbar.mjs';

const ACCEPT = new Set(['ZBAR_EAN13', 'ZBAR_UPCA', 'ZBAR_EAN8', 'ZBAR_UPCE', 'ZBAR_ISBN13']);
const SCAN_INTERVAL_MS = 160;

export function createScanner(video, { onCode, onState }) {
  let stream = null;
  let running = false;
  let lastScan = 0;
  let raf = 0;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  async function start() {
    onState?.('starting');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 }, height: { ideal: 1080 },
          // continuous autofocus is the #1 reliability win for 1D barcodes;
          // ignored gracefully where unsupported (e.g. iOS often lacks it)
          focusMode: { ideal: 'continuous' },
        },
      });
    } catch (e) {
      onState?.(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'error', e);
      return false;
    }
    video.srcObject = stream;
    video.muted = true;
    video.setAttribute('playsinline', ''); // iOS: stay inline
    // Do not await play(): on some engines the promise never settles for camera
    // streams. The scan loop simply skips frames until dimensions arrive.
    try { const p = video.play(); if (p && p.catch) p.catch(() => {}); } catch { /* interrupted by close */ }
    running = true;
    onState?.('running');
    loop();
    // stall watchdog: no frames after 10 s means the stream is wedged
    setTimeout(() => {
      if (running && (!video.videoWidth || !video.videoHeight)) onState?.('stalled');
    }, 10000);
    return true;
  }

  function scanRegion(sx, sy, sw, sh, maxW) {
    const scale = Math.min(1, maxW / sw);
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return scanImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }

  async function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    if (now - lastScan < SCAN_INTERVAL_MS) return;
    lastScan = now;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    try {
      // Pass 1: the center reticle at NATIVE resolution (sharp bars) so a
      // barcode held at a comfortable, in-focus distance still decodes.
      // Pass 2: the full-width band downscaled, to catch off-center codes.
      const rw = Math.round(vw * 0.8), rh = Math.round(vh * 0.34);
      const rx = Math.round((vw - rw) / 2), ry = Math.round((vh - rh) / 2);
      let symbols = await scanRegion(rx, ry, rw, rh, 1600);
      if ((!symbols || !symbols.length) && running) {
        const bandH = Math.round(vh * 0.5), by = Math.round((vh - bandH) / 2);
        symbols = await scanRegion(0, by, vw, bandH, 1024);
      }
      if (!running || !symbols || !symbols.length) return;
      for (const s of symbols) {
        if (!ACCEPT.has(s.typeName)) continue;
        const code = s.decode().trim();
        if (/^\d{7,14}$/.test(code)) {
          stopLoop();
          onCode(code, s.typeName);
          return;
        }
      }
    } catch { /* keep scanning */ }
  }

  function stopLoop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function stop() {
    stopLoop();
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
    video.srcObject = null;
  }

  function torchTrack() {
    const t = stream && stream.getVideoTracks()[0];
    if (!t || !t.getCapabilities) return null;
    try { return t.getCapabilities().torch ? t : null; } catch { return null; }
  }

  return {
    start, stop,
    hasTorch: () => !!torchTrack(),
    setTorch: (on) => {
      const t = torchTrack();
      if (t) t.applyConstraints({ advanced: [{ torch: !!on }] }).catch(() => {});
    },
    resume: () => { if (stream && !running) { running = true; loop(); } },
  };
}

// Decode a single still image (used by tests and as a fallback path).
export async function decodeImageData(imageData) {
  const symbols = await scanImageData(imageData);
  for (const s of symbols || []) {
    if (ACCEPT.has(s.typeName)) return { code: s.decode().trim(), type: s.typeName };
  }
  return null;
}
