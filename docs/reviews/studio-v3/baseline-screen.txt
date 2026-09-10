import { LOOKS } from './bosses.js';
import { BH_ITEMS, BH_BY_ID, bhAsset } from '../data/boneheadz.js';
import { STUDIO_CAPTIONS, STUDIO_DEFAULTS, STUDIO_POSITIONS, STUDIO_MARK_POSITIONS, STUDIO_TEXT_STICKERS, STUDIO_MONSTERS, STUDIO_STICKER_MIN, STUDIO_STICKER_MAX, STUDIO_SAFE, composeStudio } from './studio.js';
import { saveStudioImage, studioSaveMode } from './studio-save.js';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// One render at a time. Fast control changes coalesce; stale pixels cannot save.
export function mountStudio(el, { look, ownedBackdrops, crew = [], draft, onBack, compose = composeStudio, save = saveStudioImage, env = globalThis }) {
  const options = draft || { ...STUDIO_DEFAULTS };
  for (const [key, value] of Object.entries(STUDIO_DEFAULTS)) if (options[key] === undefined) options[key] = value;
  options.stickers = structuredClone(options.stickers);
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
    <div class="studio-preview" id="studioStage"><img id="studioPreview" alt="Your Studio image preview" hidden draggable="false"><div id="studioSelection" hidden></div></div>
    <p id="studioStatus" class="note" role="status" aria-live="polite">Preparing your image...</p>
    <button class="btn primary" id="studioClean" disabled>Ready for screenshot</button>
    <p class="note">Save for now: hide the controls, then take a screenshot. Tap the picture or press Escape to return.</p>
    <button class="btn ghost" id="studioSave" aria-describedby="studioSaveHelp" disabled${saveMode === 'unavailable' ? ' hidden' : ''}>${saveMode === 'native' ? 'Save to device' : 'Download PNG'}</button>
    <p class="note" id="studioSaveHelp">${saveMode === 'unavailable' ? 'Saving to device needs a newer app build. Use a screenshot for now.' : saveMode === 'native' ? 'On iPhone, saving asks for permission to add this image to Photos. On Android, choose where to save it.' : 'A download requests a PNG. Check your downloads.'}</p>
    <aside class="studio-tray" id="studioTray">
      <button class="btn" id="studioTrayToggle" aria-expanded="false" aria-controls="studioTrayBody">Stickers &amp; scene</button>
      <div id="studioTrayBody" hidden>
        <div class="studio-controls">
          <button class="chip" id="studioBackdrop"></button>
          <button class="chip" id="studioPet" aria-pressed="${options.includePet}"${look.pet ? '' : ' disabled'}>Include my pet</button>
          <button class="chip" id="studioCaption"></button>
          <button class="chip" id="studioBubble"></button>
          <button class="chip" id="studioMark"></button>
          <button class="chip" id="studioCode" aria-pressed="false"${look.friendCode ? '' : ' disabled'}>Include my friend code</button>
        </div>
        <p class="note" id="studioCodeValue">Your code stays off unless you turn it on.</p>
        <h2 class="sect-h">Say it with bones</h2>
        <div class="studio-sticker-grid">${Object.entries(STUDIO_TEXT_STICKERS).map(([id, text]) => `<button class="btn studio-text-sticker" id="studioText-${id}">${esc(text)}</button>`).join('')}</div>
        <details><summary>Monsters</summary><div class="studio-sticker-grid">${STUDIO_MONSTERS.map((name, i) => `<button class="chip" id="studioMonster-${i}"><img src="${esc(bhAsset(BH_BY_ID[LOOKS[name].SK]))}" alt="" loading="lazy">${esc(name)}</button>`).join('')}</div></details>
        <details><summary>Your Crew</summary><div class="studio-sticker-grid">${crew.map((f, i) => `<button class="chip" id="studioCrew-${i}"><img src="${esc(bhAsset(BH_BY_ID[f.outfit.SK || 'SK0-1']))}" alt="" loading="lazy">${esc(f.label)}</button>`).join('')}</div>${crew.length ? '' : '<p class="note">Open the Crew screen first to load your friends, then come back here.</p>'}</details>
        <h2 class="sect-h">On your picture</h2><div id="studioPlaced" class="studio-sticker-grid"></div>
        <div id="studioStickerTools" hidden>
          <p class="note">Drag the selected sticker, or use the move buttons. New stickers sit on top.</p>
          <div class="studio-sticker-grid">${['Left', 'Right', 'Up', 'Down', 'Smaller', 'Larger', 'Flip', 'Remove'].map(action => `<button class="chip" id="studio${action}">${action}</button>`).join('')}</div>
        </div>
        <button class="btn ghost" id="studioRetry">Retry preview</button>
      </div>
    </aside>
    <dialog id="studioCleanView" class="studio-clean" aria-label="Screenshot picture. Tap anywhere or press Escape to return." tabindex="0"><img id="studioCleanImage" alt="Your finished Studio picture. Tap to return." draggable="false"></dialog>
  </section>`;
  const q = id => el.querySelector('#' + id);
  let revision = 0, rendering = false, disposed = false, saving = false, result = null, url = null;
  const status = text => { if (!disposed) q('studioStatus').textContent = text; };
  const draw = async () => {
    revision++; result = null; q('studioSave').disabled = true; q('studioClean').disabled = true; q('studioSelection').hidden = true;
    // Hide obsolete preview so turning the code OFF cannot leave it visible.
    q('studioPreview').hidden = true;
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
        url = nextUrl; result = next; img.hidden = false; q('studioSave').disabled = saving;
        q('studioClean').disabled = false; updateSelection();
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
  const tray = open => {
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
  const updateSelection = () => {
    q('studioStickerTools').hidden = selected < 0;
    const box = result?.bounds.find(b => b.id === `sticker-${selected}`), node = q('studioSelection');
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
    options.stickers.push({ ...sticker, x: 540, y: 950, size: 400, flip: false }); selected = options.stickers.length - 1; placed(); void draw();
  };
  for (const id of Object.keys(STUDIO_TEXT_STICKERS)) q(`studioText-${id}`).onclick = () => add({ kind: 'text', id });
  STUDIO_MONSTERS.forEach((id, i) => { q(`studioMonster-${i}`).onclick = () => add({ kind: 'monster', id }); });
  crew.forEach((f, i) => { q(`studioCrew-${i}`).onclick = () => add({ kind: 'crew', outfit: structuredClone(f.outfit) }); });
  const change = action => {
    const s = options.stickers[selected]; if (!s) return;
    const box = result?.bounds.find(b => b.id === `sticker-${selected}`);
    if (box) { s.x = box.x + box.width / 2; s.y = box.y + box.height / 2; }
    action(s); placed(); void draw();
  };
  for (const [name, dx, dy] of [['Left', -30, 0], ['Right', 30, 0], ['Up', 0, -30], ['Down', 0, 30]]) q(`studio${name}`).onclick = () => change(s => { s.x += dx; s.y += dy; });
  q('studioSmaller').onclick = () => change(s => { s.size = Math.max(STUDIO_STICKER_MIN, s.size - 40); });
  q('studioLarger').onclick = () => change(s => { s.size = Math.min(STUDIO_STICKER_MAX, s.size + 40); });
  q('studioFlip').onclick = () => change(s => { s.flip = !s.flip; });
  q('studioRemove').onclick = () => change(() => { options.stickers.splice(selected, 1); selected = -1; });
  let drag;
  const point = e => { const r = q('studioStage').getBoundingClientRect(); return { x: (e.clientX - r.left) * 1080 / r.width, y: (e.clientY - r.top) * 1920 / r.height }; };
  q('studioStage').onpointerdown = e => {
    if (!result) return;
    const p = point(e), box = [...result.bounds].reverse().find(b => b.id.startsWith('sticker-') && p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height);
    if (!box) { selected = -1; placed(); return; }
    selected = Number(box.id.slice(8)); placed();
    drag = { start: p, box, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    q('studioStage').setPointerCapture(e.pointerId);
  };
  q('studioStage').onpointermove = e => {
    if (!drag) return; const p = point(e), s = options.stickers[selected], b = drag.box;
    s.x = Math.max(STUDIO_SAFE.left + b.width / 2, Math.min(STUDIO_SAFE.right - b.width / 2, drag.x + p.x - drag.start.x));
    s.y = Math.max(STUDIO_SAFE.top + b.height / 2, Math.min(STUDIO_SAFE.bottom - b.height / 2, drag.y + p.y - drag.start.y));
    q('studioSelection').style.left = `${(s.x - b.width / 2) / 10.8}%`;
    q('studioSelection').style.top = `${(s.y - b.height / 2) / 19.2}%`;
  };
  q('studioStage').onpointerup = () => { if (drag) { drag = null; void draw(); } };
  q('studioStage').onpointercancel = () => { if (drag) { const s = options.stickers[selected]; s.x = drag.x; s.y = drag.y; drag = null; updateSelection(); } };
  q('studioClean').onclick = () => {
    if (!result || rendering || disposed) return;
    q('studioCleanImage').src = url; q('studioCleanView').showModal(); q('studioCleanView').focus();
  };
  q('studioCleanView').onclick = () => q('studioCleanView').close();
  labels(); placed();
  q('studioRetry').onclick = () => { void draw(); };
  q('studioBack').onclick = onBack;
  q('studioSave').onclick = async () => {
    if (!result || saving || rendering || disposed) return;
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
  return () => { q('studioCleanView').close(); disposed = true; revision++; result = null; if (url) URL.revokeObjectURL(url); };
}
