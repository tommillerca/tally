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
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  // grayscale + gentle contrast stretch helps tesseract on phone photos
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
