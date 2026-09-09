// Local outcomes only. db.js excludes this key from exports and imports.
import { kvGet, kvUpdate } from './db.js';

const KEY = 'syncHealth';
const NO_ACCOUNT_NOTICE = 'This device is not connected to a Crew account. No profile request started.';
const NOTICE = 'Your Crew profile has not finished syncing for a while. Your progress is still on this phone. Check Profile sync in Settings.';
const ERROR_NAMES = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError',
  'AbortError', 'TimeoutError', 'NetworkError', 'OperationError', 'DataError', 'InvalidAccessError',
  'NotSupportedError', 'SecurityError', 'QuotaExceededError', 'UnknownError']);
let pending = Promise.resolve();
let noticeSink = null;
let storageFailed = false;
export function onSyncTrouble(fn) { noticeSink = typeof fn === 'function' ? fn : null; }
export function syncAttempt(source) {
  return { at: Date.now(), source, hop: 'success', network: false, status: null,
    errorName: null, profileStatus: null, profileAt: null, grantsStatus: null, grantsNetwork: false, optedOut: false };
}
export function syncFailure(attempt, hop, error) {
  // Keep the first failed hop even if later work also fails.
  if (attempt.hop !== 'success') return;
  attempt.hop = hop;
  if (hop === 'grants-failed') attempt.status = attempt.grantsStatus;
  if (error) attempt.errorName = ERROR_NAMES.has(error.name) ? error.name : 'Error';
}
export function recordSyncOutcome(attempt) {
  // Dispatch one atomic local update, without awaiting it in the boot path.
  const entry = { ...attempt };
  const task = kvUpdate(KEY, old => {
    const state = old || { entries: [], lastReachedAt: null, lastAcceptedAt: null, streak: null };
    state.entries = [...state.entries, entry].slice(-40);
    if (entry.hop !== 'throttled') state.lastOutcome = entry;
    if (entry.profileStatus) state.lastReachedAt = Math.max(state.lastReachedAt || 0, entry.profileAt);
    if (entry.profileStatus >= 200 && entry.profileStatus < 300) state.lastAcceptedAt = Math.max(state.lastAcceptedAt || 0, entry.profileAt);
    if (entry.optedOut || entry.hop === 'success') state.streak = null;
    else if (entry.hop !== 'throttled') {
      const streak = state.streak || { since: entry.at, count: 0, notified: false };
      streak.since = Math.min(streak.since, entry.at);
      streak.count = Math.min(1000000, streak.count + 1);
      state.streak = streak;
    }
    return state;
  }, null).then(state => {
    storageFailed = false;
    if (state.streak?.count >= 3 && !state.streak.notified) return deliverNotice();
  }).catch(() => {
    if (!storageFailed) console.warn('Profile sync diagnostics could not be saved on this device.');
    storageFailed = true;
  });
  pending = Promise.all([pending, task]).then(() => undefined);
}
async function deliverNotice() {
  if (!noticeSink || await kvGet('cloudOff', false)) return;
  let show = false;
  await kvUpdate(KEY, state => {
    const streak = state?.streak;
    if (streak && !streak.notified && streak.count >= 3 && Date.now() - streak.since >= 3600000) {
      streak.notified = true;
      show = true;
    }
    return state;
  }, null);
  if (show && !(await kvGet('cloudOff', false))) {
    const account = await kvGet('social', null);
    noticeSink(account?.playerId ? NOTICE : NO_ACCOUNT_NOTICE);
  }
}
export async function syncHealthState() {
  await pending;
  try { return await kvGet(KEY, null); }
  catch { storageFailed = true; return null; }
}
const REASONS = {
  success: 'Sync completed.',
  'offline-gate': 'This device is not connected to a Crew account.',
  'null-snapshot': 'The profile was not ready to send.',
  'snapshot-failed': 'The app could not prepare the profile.',
  'request-failed': 'The profile request could not finish.',
  'non-2xx': 'The server did not accept the profile.',
  'grants-failed': 'Crew deliveries could not be checked.',
  'backup-failed': 'Sync stopped while preparing the cloud backup.',
  throttled: 'Waiting for the next scheduled sync.',
  'opted-out': 'Profile sync is off.',
};
export async function syncHealthLine() {
  const state = await syncHealthState();
  const off = await kvGet('cloudOff', false).catch(() => false);
  if (off) return 'Cloud backup is off. Profile sync is off. Your Crew row and leaderboard entry stop updating.';
  if (storageFailed) return 'Sync diagnostics could not be saved on this device.';
  const last = state?.entries?.at(-1);
  const date = at => new Date(at).toLocaleString();
  const reached = state?.lastReachedAt ? `Last server reply: ${date(state.lastReachedAt)}.` : 'No profile server reply recorded yet.';
  const accepted = state?.lastAcceptedAt ? `Last profile accepted: ${date(state.lastAcceptedAt)}.` : 'No accepted profile recorded yet.';
  if (!last) return `${reached} No sync attempt recorded yet.`;
  // A throttle skip must not hide the failure that preceded it.
  const outcome = state.lastOutcome || last;
  if (outcome.hop === 'offline-gate' && !outcome.network) {
    return `${reached} ${accepted} Last attempt: ${date(outcome.at)}. ${NO_ACCOUNT_NOTICE}`;
  }
  const detail = (outcome.status ? ` HTTP ${outcome.status}.` : '') + (outcome.errorName ? ` (${outcome.errorName})` : '');
  const network = outcome.network ? ' Request started.' : ' No profile request started.';
  return `${reached} ${accepted} Last attempt: ${date(outcome.at)}. ${REASONS[outcome.hop] || 'Sync could not finish.'}${detail}${network}`;
}
