// Recompute only on mount, image load, or layout resize, never per animation
// frame. One CSS-pixel composite and alpha scan per update; no art is changed.
let cleanup = () => {};
export function groundHero(stage) {
  cleanup();
  if (!stage) return;
  const char = stage.querySelector('.hero-char');
  const shadow = stage.querySelector('.c-bh');
  let frame;
  const update = () => {
    if (!stage.isConnected) { cleanup(); return; }
    const sc = stage.getBoundingClientRect();
    stage.style.setProperty('--hero-left-shift', `${-sc.width * .05}px`);
    const box = char.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(box.width); canvas.height = Math.ceil(box.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    for (const im of char.querySelectorAll('img')) {
      if (!im.complete || !im.naturalWidth) return;
      const b = im.getBoundingClientRect(), cs = getComputedStyle(im);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const scale = Math.min(b.width / im.naturalWidth, b.height / im.naturalHeight);
      const w = im.naturalWidth * scale, h = im.naturalHeight * scale;
      ctx.drawImage(im, b.x - box.x + (b.width - w) / 2, b.bottom - box.y - h, w, h);
    }
    try {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width, right = -1, bottom = -1;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] > 24) {
          left = Math.min(left, x); right = Math.max(right, x); bottom = y;
        }
      }
      if (bottom < 0) return;
      shadow.style.left = `${box.x - sc.x + (left + right) / 2}px`;
      shadow.style.top = `${box.y - sc.y + bottom - shadow.offsetHeight / 2}px`;
      shadow.style.bottom = 'auto';
    } catch (error) { console.warn('Hero ground alpha unavailable', error); }
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
  const observer = new ResizeObserver(schedule);
  observer.observe(stage); observer.observe(char);
  stage.addEventListener('load', schedule, true);
  cleanup = () => { observer.disconnect(); cancelAnimationFrame(frame); stage.removeEventListener('load', schedule, true); };
  schedule();
}
