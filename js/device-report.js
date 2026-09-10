// Device observations only. Unknown values never become successful measurements.
export function knownGap(manifest, id) {
  return !!manifest?.plugins?.find(p => p.id === id && p.known_gap);
}

export function classifyPlugin(id, registered, extra = '', gap = false) {
  if (!registered) return { state: gap ? 'missing (declared known gap)' : 'missing', value: 'no bridge object' };
  if (extra === ':probe-failed') return { state: 'no readback', value: 'probe failed or timed out; registered' };
  if (id === 'Haptics') return { state: 'no readback', value: 'registered; no readback API' };
  if (id === 'LocalNotifications' && extra === ':granted') return { state: 'permitted', value: 'display: granted' };
  return { state: 'registered', value: extra.slice(1) || 'permission not measured' };
}

export function safeAreaMath(top, bottom, viewportBottom, dockBottom) {
  if (![top, bottom, viewportBottom, dockBottom].every(Number.isFinite)) return null;
  return { top, bottom, dockBottom, safeBottom: viewportBottom - bottom, clearance: viewportBottom - bottom - dockBottom };
}

export function reportText(rows) {
  if (!rows.length) throw new Error('Device report has no observations');
  return 'Device report\n' + rows.map(r => `${r.name}: ${r.state} | ${r.value}`).join('\n');
}

export function readback(promise, ms = 2500) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('no readback')), ms); })]).finally(() => clearTimeout(timer));
}

const resume = { pauses: 0, resumes: 0, last: null, subscription: 'not yet subscribed' };
let started = false;
const watchers = new Set();
export async function startDeviceSession() {
  if (started) return;
  started = true;
  const app = window.Capacitor?.Plugins?.App;
  if (!app?.addListener) { resume.subscription = 'App listener unavailable'; return; }
  try {
    await readback(app.addListener('appStateChange', event => {
      if (typeof event.isActive !== 'boolean') return;
      resume[event.isActive ? 'resumes' : 'pauses']++;
      resume.last = `${event.isActive ? 'resume' : 'pause'} ${new Date().toISOString()}`;
      watchers.forEach(fn => fn());
    }));
    resume.subscription = 'subscribed';
  } catch { resume.subscription = 'listener failed or timed out'; }
}

let edgeResult = { name: 'Edge swipe', state: 'not yet observed', value: 'Tap Arm edge swipe, then swipe from the left edge within 8 seconds.' };
let edgeCleanup = null;
const edgeWatchers = new Set();

export function openDeviceReport({ openSheet, diagnosticsLine, esc, toast }) {
  const rows = [
    { name: 'Safe area', state: 'measuring', value: '' },
    { name: 'Viewport model', state: 'measuring', value: '' },
    { name: 'Build agreement', state: 'measuring', value: '' },
    ...['App', 'Health', 'LocalNotifications', 'BhVault', 'Haptics'].map(name => ({ name, state: 'measuring', value: '' })),
    { name: 'Resume', state: 'not yet observed', value: '' },
    { name: 'Keyboard', state: 'not yet observed', value: 'Tap Measure keyboard to focus the field.' },
    edgeResult,
    { name: 'Ring/silent switch', state: 'needs a person', value: 'No supported switch-position readback.' },
    { name: 'Low Power Mode', state: 'needs a person', value: 'No supported readback in this app.' },
    { name: 'VoiceOver reading order', state: 'needs a person', value: 'A person must judge whether the spoken order makes sense.' },
    { name: 'Real purchase on Tom\'s own save', state: 'needs a person', value: 'Only Tom can judge whether the purchase felt right.' },
  ];
  let keyboardCleanup = () => {};
  const wrap = openSheet(`<div class="sheet-head"><h2>Device report</h2><button class="btn small ghost sheet-close">Done</button></div><div class="sheet-body"><table style="width:100%;table-layout:fixed;overflow-wrap:anywhere"><thead><tr><th>Probe</th><th>State</th><th>Measured value</th></tr></thead><tbody id="deviceRows"></tbody></table><button class="btn" id="copyDeviceReport">Copy report</button><p><button class="btn small" id="deviceKeyboard">Measure keyboard</button></p><label>Keyboard probe<input id="deviceField" type="text" autocomplete="off" style="font-size:var(--fs-body);width:100%"></label><p><button class="btn small" id="deviceEdge">Arm edge swipe</button></p></div>`, { onClose: () => { watchers.delete(paintResume); edgeWatchers.delete(paint); keyboardCleanup(); } });
  function paint() {
    wrap.querySelector('#deviceRows').innerHTML = rows.map(r => `<tr><th scope="row">${esc(r.name)}</th><td>${esc(r.state)}</td><td>${esc(r.value)}</td></tr>`).join('');
  }
  function set(name, state, value) { Object.assign(rows.find(r => r.name === name), { state, value }); paint(); }
  function paintResume() { set('Resume', resume.last ? 'observed' : 'not yet observed', `pauses ${resume.pauses}; resumes ${resume.resumes}; last ${resume.last || 'not yet observed'}; ${resume.subscription}`); }
  watchers.add(paintResume);
  edgeWatchers.add(paint);
  startDeviceSession().then(paintResume);
  paintResume();
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;top:0;height:100dvh;padding-top:var(--sat);padding-bottom:var(--sab);box-sizing:content-box;';
  document.body.appendChild(probe);
  const css = getComputedStyle(probe);
  const top = parseFloat(css.paddingTop), bottom = parseFloat(css.paddingBottom);
  const dock = document.querySelector('#tabbar');
  const area = safeAreaMath(top, bottom, window.innerHeight, dock?.getClientRects().length ? dock.getBoundingClientRect().bottom : undefined);
  set('Safe area', area ? 'measured' : 'unavailable', area ? `top ${top}px; bottom ${bottom}px; dock bottom ${area.dockBottom}px; safe bottom ${area.safeBottom}px; clearance ${area.clearance}px (safe bottom minus dock bottom; dock surface includes padding)` : `top ${top}px; bottom ${bottom}px; dock not measurable`);
  set('Viewport model', 'measured', `innerHeight ${window.innerHeight}px; visualViewport.height ${window.visualViewport?.height ?? 'unavailable'}; 100dvh ${CSS.supports('height', '100dvh') ? css.height : 'unsupported'}`);
  probe.remove();
  (async () => {
    let manifest = null;
    try {
      const response = await readback(fetch('./native/capabilities.json', { cache: 'no-store' }));
      if (!response.ok) throw new Error('manifest unavailable');
      manifest = await readback(response.json());
    } catch { /* Missing manifest cannot establish a declared gap. */ }
    try {
      const line = await diagnosticsLine(rows, manifest);
      set('Build agreement', 'observed', line.split(' · App:')[0] + (manifest ? '' : ' · known-gap manifest unavailable'));
    } catch { set('Build agreement', 'no readback', 'diagnostics failed'); }
  })();
  wrap.querySelector('#copyDeviceReport').onclick = async () => {
    try { await navigator.clipboard.writeText(reportText(rows)); toast('Device report copied.'); }
    catch { toast('Clipboard unavailable. Report was not copied.'); }
  };
  wrap.querySelector('#deviceKeyboard').onclick = () => {
    keyboardCleanup();
    const field = wrap.querySelector('#deviceField'), vv = window.visualViewport;
    if (!vv) { set('Keyboard', 'unavailable', 'visualViewport API unavailable'); return; }
    const before = vv.height;
    let settle, limit;
    const finish = settled => {
      keyboardCleanup();
      const rect = field.getBoundingClientRect();
      const overlap = Math.max(0, vv.offsetTop - rect.top) + Math.max(0, rect.bottom - vv.offsetTop - vv.height);
      const horizontal = Math.max(0, vv.offsetLeft - rect.left) + Math.max(0, rect.right - vv.offsetLeft - vv.width);
      set('Keyboard', document.activeElement === field && settled ? 'measured' : 'not settled', `focused ${document.activeElement === field}; field ${rect.top}..${rect.bottom}px; visible ${vv.offsetTop}..${vv.offsetTop + vv.height}px; outside overlap ${overlap}px vertical, ${horizontal}px horizontal; inside ${overlap === 0 && horizontal === 0}; viewport height ${before}->${vv.height}px; keyboard appearance cannot be confirmed by viewport alone`);
    };
    const changed = () => { clearTimeout(settle); settle = setTimeout(() => finish(true), 700); };
    keyboardCleanup = () => { clearTimeout(settle); clearTimeout(limit); vv.removeEventListener('resize', changed); vv.removeEventListener('scroll', changed); };
    vv.addEventListener('resize', changed); vv.addEventListener('scroll', changed);
    field.focus();
    set('Keyboard', 'measuring', 'Waiting for viewport to settle.');
    settle = setTimeout(() => finish(true), 1400);
    limit = setTimeout(() => finish(false), 5000);
  };
  wrap.querySelector('#deviceEdge').onclick = () => {
    edgeCleanup?.();
    let received = false, start = null;
    const navigations = [];
    const touchStart = e => { const t = e.changedTouches[0]; start = t && t.clientX <= 24 ? { x: t.clientX, y: t.clientY } : null; };
    const touchEnd = e => { const t = e.changedTouches[0]; if (start && t && t.clientX - start.x >= 40 && Math.abs(t.clientY - start.y) < 100) received = true; start = null; };
    const navigation = e => { navigations.push(`${e.type} to ${location.href}${e.type === 'popstate' ? ` (history state ${JSON.stringify(e.state)})` : ''}`); };
    window.addEventListener('touchstart', touchStart, { passive: true });
    window.addEventListener('touchend', touchEnd, { passive: true });
    window.addEventListener('popstate', navigation); window.addEventListener('hashchange', navigation);
    const timer = setTimeout(() => {
      edgeCleanup();
      edgeResult.state = received ? 'gesture received' : 'no gesture received';
      edgeResult.value = `8 second window; navigation ${navigations.length ? navigations.join('; ') : 'not observed'}; navigation alone cannot identify a native swipe`;
      edgeWatchers.forEach(fn => fn());
    }, 8000);
    edgeCleanup = () => { clearTimeout(timer); window.removeEventListener('touchstart', touchStart); window.removeEventListener('touchend', touchEnd); window.removeEventListener('popstate', navigation); window.removeEventListener('hashchange', navigation); };
    edgeResult.state = 'armed'; edgeResult.value = 'Swipe from the left edge within 8 seconds. Reopen this report if navigation closes it.'; edgeWatchers.forEach(fn => fn());
  };
}
