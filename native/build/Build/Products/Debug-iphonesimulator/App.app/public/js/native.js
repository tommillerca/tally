// Native (Capacitor) bridge adapter. Inert in browsers; when the app runs
// inside the iOS shell this exposes the HealthKit plugin: native permission
// sheet on connect, silent automatic reads on every launch/resume.

export function isNative() {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch { return false; }
}

function health() {
  return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Health) || null;
}

export async function nativeHealthAvailable() {
  if (!isNative() || !health()) return false;
  try {
    const r = await health().isAvailable();
    return !!r.available;
  } catch { return false; }
}

export async function nativeRequestAuth() {
  const r = await health().requestAuth();
  return !!r.granted;
}

// -> { date: 'YYYY-MM-DD', steps, activeKcal, weightKg? }
export async function nativeQueryToday() {
  return health().queryToday();
}

// Fires cb when the app returns to the foreground (native + web fallbacks).
export function onAppResume(cb) {
  try {
    const AppP = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (AppP && AppP.addListener) AppP.addListener('appStateChange', s => { if (s.isActive) cb(); });
  } catch { /* app plugin absent */ }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) cb(); });
}
