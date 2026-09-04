// Native (Capacitor) bridge adapter. Inert in browsers; when the app runs
// inside the iOS shell this exposes the HealthKit plugin: native permission
// sheet on connect, silent automatic reads on every launch/resume.

export function isNative() {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch { return false; }
}

/* WHICH SHELL IS THIS? Tom, 2026-08-08, after I told him twice that Android had
   no step support: it has had a full Health Connect bridge all along, and I
   reasoned from a comment in this file instead of looking in native/android/.
   The reason that guess was even possible is that NOTHING recorded the platform,
   anywhere: not the events, not the devices table, not the profile. So "is this
   player on Android" was unanswerable and I filled the gap with a guess.
   Coarse on purpose: the shell and the OS family, nothing fingerprintable. */
export function platformTag() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const os = /iPhone|iPad|iPod/i.test(ua) ? 'ios'
    : /Android/i.test(ua) ? 'android'
      : /Macintosh/i.test(ua) ? 'mac'
        : /Windows/i.test(ua) ? 'win'
          : 'other';
  if (isNative()) return os === 'other' ? 'native' : os;
  // a home-screen PWA behaves differently from a browser tab, and on iOS it is
  // the difference between "Health just works" and "you need the shortcut"
  const standalone = (typeof navigator !== 'undefined' && navigator.standalone === true)
    || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
  return `${os}-${standalone ? 'pwa' : 'web'}`;
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
/* ONE RESUME PER FOREGROUND TRANSITION. QA round 26 O24: inside the Capacitor
   shell BOTH listeners fire on the same foregrounding (appStateChange
   isActive from the plugin, visibilitychange from the WebView), so the whole
   resume body in app.js (day rollover, health sync, social sync, refresh) ran
   twice. Not measured on a device (needs the shell), fixed defensively: both
   listeners stay (each is the only one on its platform) and share a single
   entry that ignores a second fire inside 500 ms. Two real transitions are
   always further apart than that, so both still run.
   ponytail: a fixed window, not a hidden->visible state flag; the flag would
   need both events to agree on "hidden", and the plugin does not fire on
   background reliably enough to trust. */
export function onAppResume(cb) {
  let lastAt = -Infinity;
  const fire = () => {
    const now = Date.now();
    if (now - lastAt < 500) return;
    lastAt = now;
    cb();
  };
  try {
    const AppP = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (AppP && AppP.addListener) AppP.addListener('appStateChange', s => { if (s.isActive) fire(); });
  } catch { /* app plugin absent */ }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fire(); });
}
