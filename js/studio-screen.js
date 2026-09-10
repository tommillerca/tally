import { LOOKS as legacyLooks } from './bosses.js';
import { BH_ITEMS } from '../data/boneheadz.js';
import { STUDIO_CAPTIONS, STUDIO_DEFAULTS, STUDIO_POSITIONS, STUDIO_MARK_POSITIONS, STUDIO_TEXT_STICKERS, STUDIO_MONSTERS, STUDIO_STICKER_MIN, STUDIO_STICKER_MAX, STUDIO_SAFE, studioStickerFigure, studioRasterSticker, studioBrowserRuntime, composeStudio } from './studio.js';
import { saveStudioImage, studioSaveMode } from './studio-save.js';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// One render at a time. Fast control changes coalesce; stale pixels cannot save.
export function mountStudio(el, { look, ownedBackdrops, crew = [], draft, onBack, compose = composeStudio, save = saveStudioImage, thumbnailRuntime = studioBrowserRuntime(), env = globalThis }) {
  const options = draft || { ...STUDIO_DEFAULTS };
  for (const [key, value] of Object.entries(STUDIO_DEFAULTS)) if (options[key] === undefined) options[key] = value;
  options.stickers = structuredClone(options.stickers).map(s => {
    // Keep an old in-memory outfit sticker as Crew art when reopening a draft.
    if (s.kind !== 'monster' || !Object.hasOwn(legacyLooks, s.id)) return s;
    const { id, ...transform } = s;
    return { ...transform, kind: 'crew', outfit: structuredClone(legacyLooks[id]) };
  });
  let selected = -1;
  // Never retain consent across an entry, even if appearance choices survive.
  options.includeFriendCode = false;
  const backgrounds = BH_ITEMS.filter(i => i.slot === 'BG' && ownedBackdrops.has(i.id));
  if (!backgrounds.some(i => i.id === options.backdrop)) options.backdrop = null;
  const saveMode = studioSaveMode(env);
  el.innerHTML = `<section class="studio-screen">
    <header class="studio-header">
      <h1 class="page-h1">The Studio</h1>
      <button class="studio-link" id="studioBack">Back to Wardrobe</button>
    </header>
    <div class="studio-preview" id="studioStage" tabindex="0" role="group" aria-label="Sticker canvas" aria-describedby="studioGestureHelp studioKeyboardHelp"><img id="studioPreview" alt="Your Studio image preview" hidden draggable="false"><canvas id="studioLive" width="1080" height="1920" hidden aria-hidden="true"></canvas><div id="studioSelection" hidden><button id="studioFlip" aria-label="Flip selected sticker">Flip</button></div><div id="studioBin" hidden>Drop to delete</div></div>
    <aside class="studio-tray" id="studioTray">
      <button class="btn" id="studioTrayToggle" aria-expanded="false" aria-controls="studioTrayBody">Stickers &amp; scene</button>
      <div id="studioTrayBody" hidden>
        <details><summary>Scene settings</summary><div class="studio-controls">
          <button class="chip" id="studioBackdrop"></button>
          <button class="chip" id="studioPet" aria-pressed="${options.includePet}"${look.pet ? '' : ' disabled'}>Include my pet</button>
          <button class="chip" id="studioCaption"></button>
          <button class="chip" id="studioBubble"></button>
          <button class="chip" id="studioMark"></button>
          <button class="chip" id="studioCode" aria-pressed="false"${look.friendCode ? '' : ' disabled'}>Include my friend code</button>
        </div>
        <p class="note" id="studioCodeValue">Your code stays off unless you turn it on.</p>
        </details><h2 class="sect-h">Monsters</h2>
        <div class="studio-sticker-grid studio-art-grid">${STUDIO_MONSTERS.map((name, i) => `<button class="studio-pick" id="studioMonster-${i}" aria-label="Place ${esc(name)}"><canvas id="studioMonsterThumb-${i}" aria-hidden="true"></canvas><span>${esc(name)}</span></button>`).join('')}</div>
        <h2 class="sect-h">Your Crew</h2>
        <div class="studio-sticker-grid studio-art-grid">${crew.map((f, i) => `<button class="studio-pick" id="studioCrew-${i}" aria-label="Place ${esc(f.label)}"><canvas id="studioCrewThumb-${i}" aria-hidden="true"></canvas><span>${esc(f.label)}</span></button>`).join('')}</div>${crew.length ? '' : '<p class="note">Open the Crew screen first to load your friends, then come back here.</p>'}
        <h2 class="sect-h">Say it with bones</h2>
        <div class="studio-sticker-grid studio-art-grid">${Object.entries(STUDIO_TEXT_STICKERS).map(([id, text]) => `<button class="studio-pick" id="studioText-${id}" aria-label="Place ${esc(text)}"><canvas id="studioTextThumb-${id}" aria-hidden="true"></canvas><span>${esc(text)}</span></button>`).join('')}</div>
        <p id="studioTrayStatus" class="note" role="status"></p>
        <details id="studioAccessible"><summary>Sticker controls (keyboard and screen reader)</summary><h2 class="sect-h">On your picture</h2><div id="studioPlaced" class="studio-sticker-grid"></div>
        <p class="note" id="studioKeyboardHelp">Keyboard: Enter selects a sticker, arrows move, + and - resize, [ and ] rotate, F flips, Delete removes, Escape deselects.</p>
        <div id="studioStickerTools" hidden>
          <p class="note">Drag the selected sticker, or use the move buttons. New stickers sit on top.</p>
          <div class="studio-sticker-grid">${['Left', 'Right', 'Up', 'Down', 'Smaller', 'Larger', 'RotateLeft', 'RotateRight', 'FlipAccessible', 'Remove', 'Deselect'].map(action => `<button class="chip" id="studio${action}">${({ RotateLeft: 'Rotate left', RotateRight: 'Rotate right', FlipAccessible: 'Flip' })[action] || action}</button>`).join('')}</div>
        </div>
        </details><button class="btn ghost" id="studioRetry">Retry preview</button>
      </div>
    </aside>
    <p class="note" id="studioGestureHelp">Drag to move. Pinch and twist with two fingers. Drag down to the bin to delete.</p>
    <p id="studioStatus" class="note" role="status" aria-live="polite">Preparing your image...</p>
    <button class="btn primary" id="studioClean" disabled>Ready for screenshot</button>
    <p class="note">Save for now: hide the controls, then take a screenshot. Tap the picture or press Escape to return.</p>
    <button class="btn ghost" id="studioSave" aria-describedby="studioSaveHelp" disabled${saveMode === 'unavailable' ? ' hidden' : ''}>${saveMode === 'native' ? 'Save to device' : 'Download PNG'}</button>
    <p class="note" id="studioSaveHelp">${saveMode === 'unavailable' ? 'Saving to device needs a newer app build. Use a screenshot for now.' : saveMode === 'native' ? 'On iPhone, saving asks for permission to add this image to Photos. On Android, choose where to save it.' : 'A download requests a PNG. Check your downloads.'}</p>
    <dialog id="studioCleanView" class="studio-clean" aria-label="Screenshot picture. Tap anywhere or press Escape to return." tabindex="0"><img id="studioCleanImage" alt="Your finished Studio picture. Tap to return." draggable="false"></dialog>
  </section>`;
  const q = id => el.querySelector('#' + id);
  let revision = 0, rendering = false, disposed = false, saving = false, result = null, url = null;
  const status = text => { if (!disposed) q('studioStatus').textContent = text; };
  const draw = async (keepPicture = false) => {
    // Scene changes can also arrive from keyboard controls during a capture.
    const captured = [...pointers.keys()]; pointers.clear(); gesture = null; origin = null; overBin = false;
    for (const id of captured) if (q('studioStage').hasPointerCapture?.(id)) q('studioStage').releasePointerCapture(id);
    q('studioBin').hidden = true;
    revision++; result = null; q('studioSave').disabled = true; q('studioClean').disabled = true; q('studioSelection').hidden = true;
    // Hide obsolete preview so turning the code OFF cannot leave it visible.
    if (!keepPicture) { q('studioPreview').hidden = true; q('studioLive').hidden = true; }
    status('Preparing your image...');
    if (rendering) return;
    rendering = true;
    while (!disposed) {
      const version = revision, snapshot = structuredClone(options);
      try {
        const next = await compose(look, snapshot);
        if (disposed) break;
        if (version !== revision) continue;
        const nextUrl = URL.createObjectURL(next.blob);
        const img = q('studioPreview'); img.src = nextUrl;
        try { await img.decode(); } catch (error) { URL.revokeObjectURL(nextUrl); throw error; }
        if (disposed || version !== revision) { URL.revokeObjectURL(nextUrl); if (disposed) break; continue; }
        if (url) URL.revokeObjectURL(url);
        url = nextUrl; result = next; liveBounds = null; img.hidden = false; q('studioLive').hidden = true; q('studioSave').disabled = saving;
        q('studioClean').disabled = false;
        for (const box of next.bounds) if (box.id.startsWith('sticker-') && box.fittedSize !== undefined)
          options.stickers[Number(box.id.slice(8))].size = box.fittedSize;
        updateSelection();
        status('Picture ready. Hide controls and take a screenshot to save.');
      } catch (error) {
        if (disposed) break;
        if (version !== revision) continue;
        status(`${error.message} Your draft is still here.`);
      }
      break;
    }
    rendering = false;
  };
  const labels = () => {
    q('studioBackdrop').textContent = `Backdrop: ${backgrounds.find(i => i.id === options.backdrop)?.name || 'Plain wash'} (tap to change)`;
    q('studioCaption').textContent = `Caption: ${STUDIO_CAPTIONS[options.caption] || 'None'} (tap to change)`;
    q('studioBubble').textContent = `Bubble: ${options.bubblePosition} (tap to change)`;
    q('studioMark').textContent = `BONEHEADZ: ${options.markPosition} (tap to change)`;
    q('studioPet').setAttribute('aria-pressed', String(options.includePet));
    q('studioCode').setAttribute('aria-pressed', String(options.includeFriendCode));
  };
  const cycle = (id, key, values) => { q(id).onclick = () => {
    options[key] = values[(values.indexOf(options[key]) + 1) % values.length]; labels(); void draw();
  }; };
  cycle('studioBackdrop', 'backdrop', [null, ...backgrounds.map(i => i.id)]);
  cycle('studioCaption', 'caption', Object.keys(STUDIO_CAPTIONS));
  cycle('studioBubble', 'bubblePosition', STUDIO_POSITIONS);
  cycle('studioMark', 'markPosition', STUDIO_MARK_POSITIONS);
  q('studioPet').onclick = () => { options.includePet = !options.includePet; labels(); void draw(); };
  q('studioCode').onclick = () => {
    options.includeFriendCode = !options.includeFriendCode;
    q('studioCodeValue').textContent = options.includeFriendCode ? look.friendCode : 'Your code stays off unless you turn it on.';
    labels(); void draw();
  };
  let thumbnailsLoading = false, thumbnailsReady = false;
  const thumbnails = async () => {
    if (thumbnailsLoading || thumbnailsReady || disposed) return;
    thumbnailsLoading = true; q('studioTrayStatus').textContent = 'Loading stickers...';
    const entries = [
      ...STUDIO_MONSTERS.map((id, i) => [`studioMonsterThumb-${i}`, { kind: 'monster', id }]),
      ...crew.map((f, i) => [`studioCrewThumb-${i}`, { kind: 'crew', outfit: f.outfit }]),
      ...Object.keys(STUDIO_TEXT_STICKERS).map(id => [`studioTextThumb-${id}`, { kind: 'text', id }]),
    ];
    try {
      for (const [id, entry] of entries) {
        if (disposed) break;
        const sticker = { ...entry, x: 540, y: 950, size: 180, flip: false };
        const figure = await studioStickerFigure(sticker, thumbnailRuntime);
        if (disposed) break;
        const raster = studioRasterSticker(figure, sticker, thumbnailRuntime), c = q(id);
        c.width = raster.art.width; c.height = raster.art.height;
        const cx = c.getContext('2d'); cx.imageSmoothingEnabled = false;
        cx.drawImage(raster.decoration, 0, 0); cx.drawImage(raster.art, 0, 0);
      }
      thumbnailsReady = true;
      if (!disposed) q('studioTrayStatus').textContent = '';
    } catch (error) {
      if (!disposed) q('studioTrayStatus').textContent = `${error.message} Close and reopen stickers to retry.`;
    } finally { thumbnailsLoading = false; }
  };
  const tray = open => {
    if (open) void thumbnails();
    q('studioTray').setAttribute('data-open', String(open));
    q('studioTrayBody').hidden = !open; q('studioTrayToggle').setAttribute('aria-expanded', String(open));
    q('studioTrayToggle').textContent = open ? 'Collapse stickers & scene' : 'Stickers & scene';
  };
  q('studioTrayToggle').onclick = () => tray(q('studioTrayBody').hidden);
  let swipeY;
  q('studioTrayToggle').onpointerdown = e => { suppressTrayClick = false; swipeY = e.clientY; q('studioTrayToggle').setPointerCapture(e.pointerId); };
  q('studioTrayToggle').onpointerup = e => {
    if (Math.abs(e.clientY - swipeY) > 30) {
      tray(e.clientY < swipeY); suppressTrayClick = true;
    }
  };
  let suppressTrayClick = false;
  q('studioTrayToggle').onclick = () => { if (suppressTrayClick) { suppressTrayClick = false; return; } tray(q('studioTrayBody').hidden); };
  let liveBounds = null;
  const updateSelection = () => {
    q('studioStickerTools').hidden = selected < 0;
    /* THE CANVAS ONLY CLAIMS THE GESTURE WHILE IT HAS SOMETHING TO MOVE.
       Tom, 2026-09-10: "the studio is unseable in it's current state it's
       actually bricked". `.studio-preview` shipped with a blanket
       `touch-action: none`, and it fills 398x708 of a 430x932 phone, so
       three quarters of the screen refused to scroll. The one control that
       opens the sticker tray sits below the fold, so a player could neither
       reach it nor scroll to it: the screen was a dead end. Pinch and twist
       still need the raw stream, so the block is applied only while a sticker
       is actually selected, and released the moment nothing is. */
    q('studioStage').classList.toggle('grabbing', selected >= 0);
    const box = (liveBounds || result?.bounds)?.find(b => b.id === `sticker-${selected}`), node = q('studioSelection');
    node.hidden = !box;
    if (box) Object.assign(node.style, { left: `${box.x / 10.8}%`, top: `${box.y / 19.2}%`, width: `${box.width / 10.8}%`, height: `${box.height / 19.2}%` });
  };
  const placed = () => {
    q('studioPlaced').innerHTML = options.stickers.map((s, i) => `<button class="chip" data-studio-index="${i}" aria-pressed="${selected === i}">${i + 1}. ${esc(s.kind === 'text' ? STUDIO_TEXT_STICKERS[s.id] : s.kind === 'monster' ? s.id : 'Crew bonehead')}</button>`).join('') || '<p class="note">Pick a sticker above to place it.</p>';
    updateSelection();
  };
  q('studioPlaced').onclick = e => { const button = e.target.closest('[data-studio-index]'); if (button) { selected = Number(button.dataset.studioIndex); placed(); } };
  const add = sticker => {
    if (options.stickers.length >= 12) { status('Your sheet has 12 stickers. Remove one to add another.'); return; }
    options.stickers.push({ ...sticker, x: 540, y: 950, size: 400, flip: false }); selected = options.stickers.length - 1; tray(false); q('studioStage').focus(); placed(); void draw();
  };
  for (const id of Object.keys(STUDIO_TEXT_STICKERS)) q(`studioText-${id}`).onclick = () => add({ kind: 'text', id });
  STUDIO_MONSTERS.forEach((id, i) => { q(`studioMonster-${i}`).onclick = () => add({ kind: 'monster', id }); });
  crew.forEach((f, i) => { q(`studioCrew-${i}`).onclick = () => add({ kind: 'crew', outfit: structuredClone(f.outfit) }); });
  const change = action => {
    const s = options.stickers[selected]; if (!s || pointers.size) return;
    const box = result?.bounds.find(b => b.id === `sticker-${selected}`);
    if (box) { s.x = box.x + box.width / 2; s.y = box.y + box.height / 2; }
    action(s); placed(); void draw();
  };
  for (const [name, dx, dy] of [['Left', -30, 0], ['Right', 30, 0], ['Up', 0, -30], ['Down', 0, 30]]) q(`studio${name}`).onclick = () => change(s => { s.x += dx; s.y += dy; });
  q('studioSmaller').onclick = () => change(s => { s.size = Math.max(STUDIO_STICKER_MIN, s.size - 40); });
  q('studioLarger').onclick = () => change(s => { s.size = Math.min(STUDIO_STICKER_MAX, s.size + 40); });
  q('studioFlip').onclick = e => { e?.stopPropagation?.(); change(s => { s.flip = !s.flip; }); };
  q('studioFlipAccessible').onclick = q('studioFlip').onclick;
  q('studioFlip').onpointerdown = e => e.stopPropagation();
  q('studioRotateLeft').onclick = () => change(s => { s.rotation = ((s.rotation || 0) - 15 + 360) % 360; });
  q('studioRotateRight').onclick = () => change(s => { s.rotation = ((s.rotation || 0) + 15) % 360; });
  q('studioDeselect').onclick = () => { selected = -1; placed(); q('studioStage').focus(); };
  q('studioRemove').onclick = () => change(() => { options.stickers.splice(selected, 1); selected = -1; });
  // A gesture retains the render's decoded layers. Its positions and pixels
  // update in the pointer handler; PNG export is rebuilt only when it ends.
  const pointers = new Map();
  let gesture = null, origin = null, overBin = false;
  const stage = q('studioStage');
  const point = e => { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) * 1080 / r.width, y: (e.clientY - r.top) * 1920 / r.height }; };
  const rebase = () => {
    const [a, b] = [...pointers.values()], s = options.stickers[selected];
    gesture = a && s ? { ...s, a, centre: b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a,
      distance: b ? Math.hypot(b.x - a.x, b.y - a.y) : 0,
      angle: b ? Math.atan2(b.y - a.y, b.x - a.x) : 0 } : null;
  };
  const repaint = () => {
    if (!result?.renderLive) return;
    liveBounds = result.renderLive(q('studioLive'), options.stickers);
    const box = liveBounds.find(b => b.id === `sticker-${selected}`), s = options.stickers[selected];
    if (box && s) { s.x = box.x + box.width / 2; s.y = box.y + box.height / 2; s.size = box.fittedSize; }
    q('studioLive').hidden = false; q('studioPreview').hidden = true; updateSelection();
  };
  stage.onpointerdown = e => {
    if (!result || rendering || pointers.size >= 2 || (e.button !== undefined && e.button !== 0)) return;
    const p = point(e);
    if (!pointers.size) {
      const box = [...(liveBounds || result.bounds)].reverse().find(b => b.id.startsWith('sticker-') && p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height && (() => {
        const r = result.figures?.[Number(b.id.slice(8))]?.raster;
        if (!r) return true;
        const x = Math.floor(p.x - b.x), y = Math.floor(p.y - b.y);
        return r.decoration.getContext('2d').getImageData(x, y, 1, 1).data[3] > 0;
      })());
      if (!box) { selected = -1; placed(); return; }
      selected = Number(box.id.slice(8));
      const s = options.stickers[selected]; s.x = box.x + box.width / 2; s.y = box.y + box.height / 2;
      origin = structuredClone(s); placed(); stage.focus();
    }
    e.preventDefault?.();
    pointers.set(e.pointerId, p); stage.setPointerCapture(e.pointerId); rebase();
    q('studioSave').disabled = true; q('studioClean').disabled = true;
  };
  stage.onpointermove = e => {
    if (!gesture || !pointers.has(e.pointerId)) return;
    e.preventDefault?.(); pointers.set(e.pointerId, point(e));
    const [a, b] = [...pointers.values()], s = options.stickers[selected];
    const centre = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
    s.x = gesture.x + centre.x - gesture.centre.x; s.y = gesture.y + centre.y - gesture.centre.y;
    if (b && gesture.distance > 0) {
      s.size = Math.max(STUDIO_STICKER_MIN, Math.min(STUDIO_STICKER_MAX, gesture.size * Math.hypot(b.x - a.x, b.y - a.y) / gesture.distance));
      s.rotation = ((gesture.rotation || 0) + (Math.atan2(b.y - a.y, b.x - a.x) - gesture.angle) * 180 / Math.PI + 360) % 360;
    }
    // Bin is fixed in canvas coordinates, outside the export safe rectangle.
    q('studioBin').hidden = false;
    overBin = !b && a.x >= 330 && a.x <= 750 && a.y >= 1660 && a.y <= 1900;
    q('studioBin').textContent = overBin ? 'Release to delete' : 'Drop to delete';
    q('studioBin').setAttribute('data-active', String(overBin));
    repaint();
  };
  const finish = (e, cancel = false) => {
    if (!gesture || !pointers.has(e.pointerId)) return;
    if (cancel) {
      Object.assign(options.stickers[selected], origin);
      const ids = [...pointers.keys()]; pointers.clear(); gesture = null;
      for (const id of ids) if (stage.hasPointerCapture?.(id)) stage.releasePointerCapture(id);
    } else {
      pointers.delete(e.pointerId);
      if (stage.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);
      if (pointers.size) { overBin = false; rebase(); return; }
      if (overBin) { options.stickers.splice(selected, 1); selected = -1; status('Sticker removed.'); }
      gesture = null;
    }
    origin = null; overBin = false; q('studioBin').hidden = true; liveBounds = null; placed(); void draw(true);
  };
  stage.onpointerup = e => finish(e);
  stage.onpointercancel = e => finish(e, true);
  stage.onlostpointercapture = e => finish(e, true);
  stage.onkeydown = e => {
    if (e.target !== stage) return;
    if (e.key === 'Escape') {
      if (pointers.size) finish({ pointerId: pointers.keys().next().value }, true);
      selected = -1; placed(); return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); selected = options.stickers.length ? (selected + 1) % options.stickers.length : -1; placed();
      status(selected < 0 ? 'No stickers placed.' : `Sticker ${selected + 1} selected. Arrow keys move, plus and minus resize, brackets rotate, F flips, Delete removes, Escape deselects.`); return;
    }
    const action = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
      '+': 'Larger', '=': 'Larger', '-': 'Smaller', '[': 'RotateLeft', ']': 'RotateRight', f: 'FlipAccessible',
      Delete: 'Remove', Backspace: 'Remove' }[e.key];
    if (action && selected >= 0 && !pointers.size) { e.preventDefault(); q('studio' + action).onclick(); }
  };
  q('studioClean').onclick = () => {
    if (!result || rendering || disposed || pointers.size) return;
    q('studioCleanImage').src = url; q('studioCleanView').showModal(); q('studioCleanView').focus();
  };
  q('studioCleanView').onclick = () => q('studioCleanView').close();
  labels(); placed();
  q('studioRetry').onclick = () => { void draw(); void thumbnails(); };
  q('studioBack').onclick = onBack;
  q('studioSave').onclick = async () => {
    if (!result || saving || rendering || disposed || pointers.size) return;
    saving = true; q('studioSave').disabled = true;
    const version = revision;
    try {
      const saved = await save(result.blob, env); // EXACT Blob displayed, no second composition.
      if (version === revision) status(saved.status === 'saved' ? 'Image saved to device.'
        : saved.status === 'cancelled' ? 'Save cancelled. Your draft is still here.' : 'Download requested. Check your downloads, or touch and hold the preview to save.');
    } catch (error) { if (version === revision) status(`${error.message} Your draft is still here.`); }
    finally { saving = false; if (!disposed) q('studioSave').disabled = !result || rendering; }
  };
  void draw();
  return () => { pointers.clear(); gesture = null; q('studioCleanView').close(); disposed = true; revision++; result = null; if (url) URL.revokeObjectURL(url); };
}
