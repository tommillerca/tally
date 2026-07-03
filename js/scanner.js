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

  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    if (now - lastScan < SCAN_INTERVAL_MS) return;
    lastScan = now;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    // center band: full width, middle 45% height, downscaled to <=900px wide
    const bandH = Math.round(vh * 0.45);
    const sy = Math.round((vh - bandH) / 2);
    const scale = Math.min(1, 900 / vw);
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(bandH * scale);
    ctx.drawImage(video, 0, sy, vw, bandH, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    scanImageData(img).then(symbols => {
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
    }).catch(() => { /* keep scanning */ });
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
