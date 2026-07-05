// Nutrition label OCR: tesseract.js v5, fully self-hosted (no CDN).
// Assets lazy-load on first use (~10 MB, then cached by the service worker + tesseract cache).

const BASE = new URL('../vendor/tesseract/', import.meta.url).href;
let workerPromise = null;

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const mod = await import('../vendor/tesseract/tesseract.esm.min.js');
      const T = mod.default || mod;
      const worker = await T.createWorker('eng', 1, {
        workerPath: BASE + 'worker.min.js',
        corePath: BASE,
        langPath: BASE.replace(/\/$/, ''),
        gzip: true,
        logger: m => {
          if (m.status === 'recognizing text') onProgress?.(0.2 + m.progress * 0.8);
          else onProgress?.(0.1);
        },
      });
      await worker.setParameters({ tessedit_pageseg_mode: '4' }); // single column, variable sizes
      return worker;
    })();
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

// ---- image ops for label OCR (phone photos: skew, glare, small/curved text) ----

function toGray(imgData) {
  const d = imgData.data, n = d.length >> 2;
  const g = new Float32Array(n);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) g[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return g;
}

function otsu(gray) {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i] | 0]++;
  const total = gray.length;
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, bestT = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; bestT = t; }
  }
  return bestT;
}

// Estimate page skew by maximising the variance of the horizontal ink-projection
// over candidate angles: text rows line up (peaky profile) only when deskewed.
function estimateSkew(gray, w, h) {
  const dw = 360, dh = Math.max(1, Math.round(h * dw / w));
  const small = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) { const sy = (y * h / dh) | 0; for (let x = 0; x < dw; x++) small[y * dw + x] = gray[sy * w + ((x * w / dw) | 0)]; }
  const thr = otsu(small);
  const ink = new Uint8Array(dw * dh);
  for (let i = 0; i < small.length; i++) ink[i] = small[i] < thr ? 1 : 0;
  const cx = dw / 2, cy = dh / 2;
  let bestDeg = 0, bestVar = -1;
  for (let deg = -12; deg <= 12; deg += 0.75) {
    const a = deg * Math.PI / 180, s = Math.sin(a), c = Math.cos(a);
    const rows = new Float64Array(dh);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      if (!ink[y * dw + x]) continue;
      const ry = Math.round(cy + (x - cx) * s + (y - cy) * c);
      if (ry >= 0 && ry < dh) rows[ry]++;
    }
    let mean = 0; for (let y = 0; y < dh; y++) mean += rows[y]; mean /= dh;
    let v = 0; for (let y = 0; y < dh; y++) { const d = rows[y] - mean; v += d * d; }
    if (v > bestVar) { bestVar = v; bestDeg = deg; }
  }
  return bestDeg;
}

// source: File | Blob | HTMLCanvasElement | HTMLImageElement
export async function preprocess(source, maxDim = 1800) {
  let bmp;
  if (source instanceof HTMLCanvasElement) {
    bmp = source;
  } else if (typeof createImageBitmap === 'function') {
    try { bmp = await createImageBitmap(source, { imageOrientation: 'from-image' }); }
    catch { bmp = await createImageBitmap(source); }
  } else {
    throw new Error('No image decoder available');
  }
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  let w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  let canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  let ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);

  // DESKEW: phone photos are rarely level and tesseract fails hard past a few
  // degrees. Measure tilt from the ink projection, rotate the canvas to level
  // it (white fill: labels are white). This is the one big real-world win;
  // everything else the simple path below already handles.
  const skew = estimateSkew(toGray(ctx.getImageData(0, 0, w, h)), w, h);
  if (Math.abs(skew) >= 1.2) {
    const a = skew * Math.PI / 180, ac = Math.abs(Math.cos(a)), as = Math.abs(Math.sin(a));
    const nw = Math.ceil(w * ac + h * as), nh = Math.ceil(w * as + h * ac);
    const rot = document.createElement('canvas'); rot.width = nw; rot.height = nh;
    const rctx = rot.getContext('2d', { willReadFrequently: true });
    rctx.fillStyle = '#fff'; rctx.fillRect(0, 0, nw, nh);
    rctx.translate(nw / 2, nh / 2); rctx.rotate(a); rctx.drawImage(canvas, -w / 2, -h / 2);
    canvas = rot; ctx = rctx; w = nw; h = nh;
  }

  // grayscale + gentle global contrast stretch (proven path for phone photos)
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, ((g - min) / range) * 255));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function ocrLabel(source, onProgress) {
  const worker = await getWorker(onProgress);
  const canvas = await preprocess(source);
  const { data } = await worker.recognize(canvas);
  return data.text || '';
}

export function ocrReady() { return !!workerPromise; }
