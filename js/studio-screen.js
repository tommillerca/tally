import { BH_ITEMS } from '../data/boneheadz.js';
import { STUDIO_CAPTIONS, STUDIO_DEFAULTS, composeStudio } from './studio.js';
import { saveStudioImage, studioSaveMode } from './studio-save.js';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// One render at a time. Fast control changes coalesce; stale pixels cannot save.
export function mountStudio(el, { look, ownedBackdrops, draft, onBack, compose = composeStudio, save = saveStudioImage, env = globalThis }) {
  const options = draft || { ...STUDIO_DEFAULTS };
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
    <div class="studio-controls studio-top-control">
      <label>Backdrop<select id="studioBackdrop"><option value="">Plain wash</option>${backgrounds.map(i => `<option value="${esc(i.id)}"${options.backdrop === i.id ? ' selected' : ''}>${esc(i.name)}</option>`).join('')}</select></label>
    </div>
    <div class="studio-preview"><img id="studioPreview" alt="Your Studio image preview" hidden></div>
    <p id="studioStatus" class="note" role="status" aria-live="polite">Preparing your image...</p>
    <div class="studio-controls">
      <label><input id="studioPet" type="checkbox"${options.includePet ? ' checked' : ''}${look.pet ? '' : ' disabled'}> Include my pet</label>
      <label>Choose a caption<select id="studioCaption">${Object.entries(STUDIO_CAPTIONS).map(([id, text]) => `<option value="${id}"${options.caption === id ? ' selected' : ''}>${esc(text || 'No caption')}</option>`).join('')}</select></label>
      <label><input id="studioCode" type="checkbox"${look.friendCode ? '' : ' disabled'}> Include my friend code</label>
      <p class="note" id="studioCodeValue">${look.friendCode ? 'Your code stays off unless you turn it on.' : 'Your friend code is not available yet.'}</p>
      <label>Frame<select id="studioFrame" disabled><option>None</option></select></label>
      <p class="note">Frames are coming after art review.</p>
    </div>
    <button class="btn primary" id="studioSave" aria-describedby="studioSaveHelp" disabled>Save to device</button>
    <button class="btn ghost" id="studioRetry">Retry preview</button>
    <p class="note" id="studioSaveHelp">${saveMode === 'unavailable'
      ? 'Preview is available in this app build. Saving needs a newer app build.'
      : saveMode === 'native'
        ? 'On iPhone, saving asks for permission to add this image to Photos. On Android, choose where to save it.'
        : 'In a browser, check your downloads or touch and hold the preview to save.'}</p>
  </section>`;
  const q = id => el.querySelector('#' + id);
  let revision = 0, rendering = false, disposed = false, saving = false, result = null, url = null;
  const status = text => { if (!disposed) q('studioStatus').textContent = text; };
  const draw = async () => {
    revision++; result = null; q('studioSave').disabled = true;
    // Hide obsolete preview so turning the code OFF cannot leave it visible.
    q('studioPreview').hidden = true;
    status('Preparing your image...');
    if (rendering) return;
    rendering = true;
    while (!disposed) {
      const version = revision, snapshot = { ...options };
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
        status(saveMode === 'unavailable' ? 'Preview ready. Saving needs a newer app build.' : 'Ready to save.');
      } catch (error) {
        if (disposed) break;
        if (version !== revision) continue;
        status(`${error.message} Your draft is still here.`);
      }
      break;
    }
    rendering = false;
  };
  q('studioBackdrop').onchange = e => { options.backdrop = e.target.value || null; void draw(); };
  q('studioCaption').onchange = e => { options.caption = e.target.value; void draw(); };
  q('studioPet').onchange = e => { options.includePet = e.target.checked; void draw(); };
  q('studioCode').onchange = e => {
    options.includeFriendCode = e.target.checked;
    q('studioCodeValue').textContent = options.includeFriendCode ? look.friendCode : 'Your code stays off unless you turn it on.';
    void draw();
  };
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
  return () => { disposed = true; revision++; result = null; if (url) URL.revokeObjectURL(url); };
}
