// Haptics: a four-word vocabulary, not a per-callsite zoo. The game had ZERO
// haptic feedback anywhere (Phase 4 of the design elevation plan, approved
// 2026-08-06). Native Capacitor Haptics when the shell provides it, else
// navigator.vibrate (Android web; iOS Safari has no vibrate, so web-iOS stays
// silent, which is correct rather than fake). Gated like sounds: kv 'haptics',
// default ON, toggled in Settings.
//
// Vocabulary (keep it FOUR; a fifth word means two of these were wrong):
//   tap      a control acknowledged you (light)
//   success  something small paid out: collect, log, save
//   heavy    an impact or an irreversible commit: pit hit, destroy, spend
//   reward   the big payoff: level up, legendary pull, hatch

let enabled = true;
export function setHaptics(on) { enabled = !!on; }
export function hapticsEnabled() { return enabled; }

function native() {
  try { return window.Capacitor?.Plugins?.Haptics || null; } catch { return null; }
}

// vibrate() patterns tuned short: Android motors are loud, and a toast-length
// buzz reads as an error, not a pat on the back
const PATTERNS = { tap: [8], success: [12, 40, 18], heavy: [28], reward: [14, 60, 14, 60, 26] };
const IMPACT = { tap: 'Light', success: 'Medium', heavy: 'Heavy', reward: 'Medium' };

function fire(kind) {
  if (!enabled) return;
  const n = native();
  try {
    if (n) {
      if (kind === 'reward') { n.notification({ type: 'SUCCESS' }); return; }
      n.impact({ style: IMPACT[kind] || 'Light' });
      return;
    }
    navigator.vibrate?.(PATTERNS[kind] || PATTERNS.tap);
  } catch { /* haptics never break the app */ }
}

export const haptic = {
  tap: () => fire('tap'),
  success: () => fire('success'),
  heavy: () => fire('heavy'),
  reward: () => fire('reward'),
};
