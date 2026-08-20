/* THE TALK BOX: the app's one typing-dialogue path.
 *
 * Tom, 2026-08-20: "i also want to create an old school dialogue style system
 * where it types on with this style of font", and "typing dialogue is going to be
 * instead of the chat bubbles everywhere in the app and also used during
 * onboarding with this character we are going to redesign as a tutorial wizard
 * type creature". Approved in the canvas "The Raising and the Talk Box", artboard
 * "The talk box".
 *
 * ONE RENDER PATH, the way ingIconHtml() is the one ingredient path. Every future
 * talking surface calls talkBoxHtml() + runTalkBox(); nothing reimplements typing.
 * There are 17 speech surfaces in this app and the reason to have this module is
 * that the second hand-rolled typer is the one that gets the skip wrong.
 *
 * THE FOUR STATES, and they are enforced STRUCTURALLY rather than by bookkeeping.
 * `tb-done` is the only state bit, and app.css hangs the caret off its ABSENCE and
 * the chevron off its PRESENCE, so "both showing at once" is not a bug that can be
 * reintroduced by a missed line of JS, it is unrepresentable:
 *
 *   TYPING              caret blinking, no chevron.        no tb-done
 *   FINISHED, WAITING   chevron nudging, no caret.         tb-done + tb-hold
 *   NAMED SPEAKER       a name label above the line.       { name } (the label IS
 *                       the character; nothing else in the app carries one)
 *   SYSTEM, NO SPEAKER  no name, no chevron, auto-goes.    the default shape
 *
 * A SECOND TAP SKIPS TO THE END OF THE LINE. It does not restart and it does not
 * do nothing. Being unable to hurry a talking box along is the single most
 * irritating thing about this pattern, so this is not optional.
 *
 * REDUCED MOTION prints the whole line at once and drops the blink.
 *
 * The face is BoldPixels by YukiPixels, CC BY-SA 4.0, credited in Settings and
 * shipped UNMODIFIED (modifying it would trigger the ShareAlike clause).
 */
import { reducedMotion } from './fx.js';

/* 26ms a character, about 38 a second: fast enough to read along, slow enough to
   feel spoken. The approved number; changing it changes every talking surface. */
export const TALK_MS = 26;

const escHtml = s => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Markup only; the CALLER owns placement. `cls` is where a surface's own
   positioning class goes (Today passes 'hero-bubble side-r'), so the box is one
   element rather than a box nested in a box.
   .tb-line carries the full text as an ATTRIBUTE, for two reasons: it survives
   innerHTML so any caller can just call runTalkBox(node) without plumbing the
   string through a second time (same trick as the hero art's fallback attribute),
   and app.css reads it with attr() to size the box before the first character
   lands. */
export function talkBoxHtml(text, { name = '', hold = false, cls = '' } = {}) {
  const full = String(text ?? '');
  /* role=note + aria-label, NOT role=status. A live region would announce the
     line again on every in-place refresh() of Today (logging water, closing a
     sheet), and there are a lot of those. The children are aria-hidden so nothing
     reads a half-typed sentence; the label carries the whole line, ready when the
     reader gets to it.
     .tb-name is ALWAYS emitted and hidden by :empty when there is no speaker, so
     a box can become a named speaker later (Today's pet line does) without any
     runtime DOM surgery. One markup shape, four states. */
  /* ONE LINE, no newlines between the children. .tb-txt carries white-space:
     pre-line so an authored \n in the dialogue becomes a real break; indentation
     in here would become blank lines in the box for exactly the same reason. */
  return `<div class="talkbox${hold ? ' tb-hold' : ''}${cls ? ' ' + cls : ''}" aria-label="${escHtml(name ? `${name}: ${full}` : full)}" role="note"><div class="tb-name" aria-hidden="true">${escHtml(name)}</div><div class="tb-line" aria-hidden="true" data-tb="${escHtml(full)}"><span class="tb-reveal"><span class="tb-txt"></span><span class="tb-caret"></span></span></div><span class="tb-next" aria-hidden="true"><svg viewBox="0 0 15 15"><path d="M3 5 L7.5 10 L12 5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg></span></div>`;
}

/* Start (or restart) the typing. Pass `text` to say something new through the same
   box, `name` to give (or clear) the speaker label, `hold` to switch between the
   waiting and auto-dismissing shapes. Idempotent: safe to call again on a box that
   is already mid-line. */
export function runTalkBox(box, text = null, { hold = null, name = null } = {}) {
  if (!box) return;
  if (text != null) { const l = box.querySelector('.tb-line'); if (l) l.dataset.tb = String(text); }
  if (hold != null) box.classList.toggle('tb-hold', !!hold);
  const txt = box.querySelector('.tb-txt');
  const line = box.querySelector('.tb-line');
  if (!txt || !line) return;
  const full = line.dataset.tb || '';
  const named = box.querySelector('.tb-name');
  if (named && name != null) named.textContent = String(name);
  const who = named ? named.textContent : '';
  box.setAttribute('aria-label', who ? `${who}: ${full}` : full);

  clearInterval(box._tb);
  box._tb = 0;
  box.classList.remove('tb-done', 'tb-gone');
  const finish = () => {
    clearInterval(box._tb); box._tb = 0;
    txt.textContent = full;
    box.classList.add('tb-done');
  };

  /* onclick, not addEventListener: this runs again on every re-say, and a second
     listener would skip and then immediately dismiss on one tap. */
  box.onclick = e => {
    if (box._tb) { e.stopPropagation(); finish(); return; }   // A SECOND TAP SKIPS
    /* A held box is the player's own line (they asked for it), so the player
       closes it. A finished un-held box has already gone pointer-events:none in
       app.css, so this handler is not even reached and the tap falls through to
       whatever the box was sitting on. */
    if (box.classList.contains('tb-hold')) { e.stopPropagation(); box.classList.add('tb-gone'); }
  };

  if (reducedMotion || !full) { finish(); return; }
  txt.textContent = '';
  let i = 0;
  box._tb = setInterval(() => {
    txt.textContent = full.slice(0, ++i);
    if (i >= full.length) finish();
  }, TALK_MS);
}
