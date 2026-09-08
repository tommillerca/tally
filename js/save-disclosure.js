// Per-tab evidence only. A normal exit needs no warning. Storage access can be
// refused, and a browser can discard this journal together with the tab.
const SAVE_STATE = 'tally-save-state';
const pending = new Set();
let failed = false;
function remember(value) {
  try {
    if (value) sessionStorage.setItem(SAVE_STATE, value);
    else sessionStorage.removeItem(SAVE_STATE);
  } catch { /* unavailable storage must not stop a save */ }
}
export function beginSave() {
  const token = {};
  pending.add(token);
  remember(failed ? 'failed' : 'pending');
  return token;
}
export function finishSave(token, didFail = false) {
  pending.delete(token);
  failed ||= didFail;
  remember(failed ? 'failed' : pending.size ? 'pending' : null);
}
export function takeSaveInterruption() {
  let state = null;
  try { state = sessionStorage.getItem(SAVE_STATE); } catch { /* unavailable */ }
  remember(null);
  failed = false;
  return state === 'pending' || state === 'failed' ? state : null;
}

export function writeFailureCopy(quota) {
  return quota
    ? 'Your device is out of storage, so your progress did not save. Free some space, then open Settings and export a backup.'
    : 'Your progress did not save. Open Settings and export a backup before trying again.';
}
export const ERASED_COPY = 'Your saved progress and Wardrobe on this device were erased. Restore an account or backup file to recover them.';

export function interruptionCopy({ save, fight, draft, now = Date.now() }) {
  const lines = [];
  if (save === 'failed') lines.push('Your last session ended after a save failed. Open Settings and export a backup before trying again.');
  else if (save === 'pending') lines.push('Your last session ended before a save was confirmed. Check your saved progress before trying that action again.');
  if (fight?.phase === 'open') lines.push(`Your last session ended with a fight against ${fight.foe || 'The Pit'} still open. Open the Pit to review the result.`);
  if (draft && typeof draft.ts === 'number' && now >= draft.ts && now - draft.ts < 24 * 3600e3 && (draft.q || draft.foodId)) {
    lines.push('A food entry was open when your last session ended. Check Today before finishing the entry.');
  }
  return lines.join(' ');
}
