// Thrown on purpose, by error-telemetry-audit.mjs, via a REAL same-origin
// <script src> so the errors carry a real filename the way the app's own
// modules do. Inline scripts arrive with an empty e.filename and
// evaluate-injected code is muted to "Script error.", so neither can prove
// the source-tail half of the telemetry payload.
// Controlled by two window flags set before the script is appended:
//   __crashMarker  string prefix for every message
//   __crashFull    truthy = the full dedupe/cap sequence, falsy = one of each
(() => {
  const M = window.__crashMarker || 'bh-unmarked';
  let t = 0;
  const th = msg => setTimeout(() => { throw new Error(msg); }, t += 30);
  if (window.__crashFull) {
    th(M + '-A');
    setTimeout(() => Promise.reject(new Error(M + '-R')), t += 30);
    th(M + '-A'); th(M + '-A'); th(M + '-A'); th(M + '-A');
    for (let i = 1; i <= 6; i++) th(M + '-C' + i);
  } else {
    th(M + ' should never be queued');
    setTimeout(() => Promise.reject(new Error(M + ' rejection either')), t += 30);
  }
})();
