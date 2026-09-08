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

// Health read evidence is not permission evidence. In particular, an empty
// HealthKit read cannot distinguish a quiet day from revoked read access.
export const HK_STALE_MS = 36 * 3600e3;
export function stepSyncStatus(result) {
  if (!result || result.error || result.stepsRead === 'failed') return 'failed';
  if (result.stepsRead === 'empty') return 'empty';
  if (!Number.isFinite(result.steps) || result.steps < 0) return 'empty';
  // Older native bridges fabricated zero for empty/error results. Only the
  // explicit new read status can certify that zero came from a quantity.
  return result.steps > 0 || result.stepsRead === 'ok' ? 'ok' : 'empty';
}
export function healthSyncInfo({ connected, last, issue, now = Date.now() }) {
  if (!connected) return null;
  const lastSuccess = Number.isFinite(last) && last > 0 ? last : null;
  const since = lastSuccess ?? issue?.since;
  const ms = Number.isFinite(since) ? Math.max(0, now - since) : 0;
  if (!issue?.failedAt && ms < HK_STALE_MS) return null;
  return { last: lastSuccess, failedAt: issue?.failedAt || null,
    hours: Math.floor(ms / 3600e3), days: Math.floor(ms / 86400e3) };
}
export function healthSyncCopy({ health, native = false }) {
  if (!health) return '';
  const age = health.days >= 2 ? `${health.days} days` : `${health.hours} hours`;
  const evidence = health.failedAt ? 'The latest step sync failed.' : `No step data has synced for ${age}.`;
  const last = health.last ? ` Last successful step sync: ${new Date(health.last).toISOString()}.` : ' No successful step sync time was recorded.';
  const action = native ? 'Open Today and tap Steps need attention to retry or review the connection.'
    : 'Run your Sync Boneheadz shortcut, then open Today and tap Steps need attention for sync help.';
  return `${evidence}${last} ${action}`;
}

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
