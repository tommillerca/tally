/* Observe actual browser requests without issuing traffic. Optional traffic and
 * intentional cancellations are disclosed without changing verdicts. Required measurements
 * use discloseDependency in audit-lifecycle. CONTROL lives in audit-completion-audit.
 */
import { observeMachine } from './audit-lifecycle.mjs';
const watched = new WeakMap();
export function requireDependencyHosts(page, urls, disclose) {
  const state = watched.get(page);
  if (!state) throw new Error('required hosts need an installed dependency observer');
  for (const host of new Set(urls.map(url => new URL(url).origin))) {
    state.required.set(host, disclose);
    const seen = state.hosts.get(host);
    if (seen?.mocked) disclose(`REMOTE ${host}`, false, 'required responses were intercepted; host reachability was not fully measured');
    else if (seen?.cached && !seen.answered) disclose(`REMOTE ${host}`, false, 'only cached responses observed; host reachability was not measured');
  }
}
export function observeDependencies(page, base = null, emit = console.log) {
  if (watched.has(page)) return watched.get(page).report;
  let local = base ? new URL(base).origin : null;
  const hosts = new Map(), required = new Map(), mocked = new WeakSet();
  const lost = (request, why) => {
    const host = new URL(request.url()).origin;
    required.get(host)?.(`REMOTE ${host}`, false, why);
  };
  const get = request => {
    let url;
    try { url = new URL(request.url()); } catch { return null; }
    if (!local && request.isNavigationRequest?.() && request.frame?.() === page.mainFrame()) local = url.origin;
    if (!/^https?:$/.test(url.protocol) || url.origin === local) return null;
    if (!hosts.has(url.origin)) hosts.set(url.origin, { requests: 0, answered: 0, cached: 0, mocked: 0, failed: 0, statuses: new Set(), reasons: new Set() });
    return hosts.get(url.origin);
  };
  page.on('request', request => {
    const h = get(request);
    if (!h) return;
    h.requests++;
    // After respond(), Puppeteer reports 'already-handled', which also covers
    // continue(). Observe the call while it is still distinguishable.
    if (request.respond) {
      const respond = request.respond.bind(request);
      request.respond = (...args) => { mocked.add(request); return respond(...args); };
    }
  });
  page.on('response', response => {
    const request = response.request(), h = get(request);
    if (!h) return;
    const isMocked = mocked.has(request) || request.interceptResolutionState?.().action === 'respond';
    if (isMocked) h.mocked++;
    else if (response.fromCache?.() || response.fromServiceWorker?.()) h.cached++;
    else h.answered++;
    h.statuses.add(response.status());
    if (isMocked) lost(request, 'intercepted response; host reachability was not measured');
    else if (response.status() >= 400) lost(request, `answered HTTP ${response.status()} during the audit`);
  });
  page.on('requestfailed', request => {
    const h = get(request);
    if (h) {
      const why = request.failure()?.errorText || 'request failed';
      h.failed++; h.reasons.add(why);
      // Navigation and browser teardown cancel requests too. Report those, but
      // do not infer an unavailable host from an intentional cancellation.
      if (!why.includes('ERR_ABORTED')) lost(request, why);
    }
  });
  let reported = false;
  const report = () => {
    if (reported) return;
    reported = true;
    process.off('exit', report);
    if (!hosts.size) emit('DEPENDENCY NETWORK: no external requests observed on this page');
    for (const [host, h] of hosts) emit(`DEPENDENCY NETWORK ${host}: host answered=${h.answered > 0 ? 'YES' : 'NOT OBSERVED'}; `
      + `requests=${h.requests}; responses=${h.answered}; cached=${h.cached}; mocked=${h.mocked}; failed=${h.failed}; `
      + `HTTP=${[...h.statuses].join(',') || 'none'}; reasons=${[...h.reasons].join(',') || 'none'}`);
  };
  watched.set(page, { required, report, hosts });
  page.once('close', report);
  process.once('exit', report);
  return report;
}

/* Cover raw loadPuppeteer callers, secondary pages and isolated contexts before
 * their first navigation. Patching the instance leaves Puppeteer's API intact.
 */
export function observePuppeteer(puppeteer) {
  return new Proxy(puppeteer, {
    get(target, key) {
      if (key !== 'launch') {
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return async (...args) => {
        const browser = await target.launch(...args);
        const launchOptions = args[0] || {};
        const wrapped = new WeakSet();
        const wrapPages = owner => {
          if (wrapped.has(owner)) return owner;
          wrapped.add(owner);
          const newPage = owner.newPage.bind(owner);
          owner.newPage = async (...args) => {
            const page = await newPage(...args);
            observeDependencies(page);
            await observeMachine(page, browser, launchOptions);
            return page;
          };
          return owner;
        };
        wrapPages(browser);
        for (const context of browser.browserContexts()) wrapPages(context);
        const create = browser.createBrowserContext.bind(browser);
        browser.createBrowserContext = async (...args) => wrapPages(await create(...args));
        return browser;
      };
    },
  });
}
