import { auditOutputPath } from './lib/audit-output.mjs';
/* Node-only bundled-path audit. Runs only the web file-copy producer in a
 * throwaway checkout. No native build, browser, sockets or external requests.
 * A failing store refresh row is a release blocker, not an allowed exception.
 */
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { importAuditPackage } from './lib/audit-dependencies.mjs';
const { default: esprima } = await importAuditPackage('esprima');
await import('./lib/store-bundle-guard.mjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(auditOutputPath(path.join(tmpdir(), 'store-runtime-')));
let failed = 0, rows = 0;
const check = (ok, name) => { rows++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const read = p => readFileSync(p, 'utf8');
const tokens = s => esprima.tokenize(s, { range: true });
// Token ranges count actual braces, not braces in comments or template prose.
function functionSource(source, name) {
  const ts = tokens(source);
  const start = ts.findIndex((t, i) => t.value === 'function' && ts[i + 1]?.value === name);
  if (start < 0) throw new Error(`missing function ${name}`);
  const brace = ts.findIndex((t, i) => i > start && t.value === '{');
  let depth = 0;
  for (let i = brace; i < ts.length; i++) {
    if (ts[i].type !== 'Punctuator') continue;
    if (ts[i].value === '{') depth++;
    if (ts[i].value === '}' && --depth === 0) {
      const from = ts[start - 1]?.value === 'async' ? start - 1 : start;
      return source.slice(ts[from].range[0], ts[i].range[1]);
    }
  }
  throw new Error(`unclosed function ${name}`);
}
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
    ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
try {
  for (const name of ['index.html', 'app.css', 'manifest.webmanifest', 'privacy.html', 'version.json', 'js', 'data', 'vendor', 'icons', 'assets']) {
    cpSync(path.join(root, name), auditOutputPath(path.join(temp, name)), { recursive: true });
  }
  mkdirSync(auditOutputPath(path.join(temp, 'native')));
  for (const name of ['build-www.sh', 'build-store.sh', 'capacitor.config.json']) {
    cpSync(path.join(root, 'native', name), auditOutputPath(path.join(temp, 'native', name)));
  }
  const built = spawnSync('/bin/bash', ['build-store.sh'], {
    cwd: path.join(temp, 'native'), encoding: 'utf8', env: { ...process.env, STORE_BUILD: '1' },
  });
  writeFileSync(auditOutputPath(path.join(temp, 'build-output.txt')), `${built.stdout || ''}${built.stderr || ''}`);
  writeFileSync(auditOutputPath(path.join(temp, 'build-exit.txt')), String(built.status));
  check(built.status === 0, 'real web bundle producer completes in throwaway checkout');
  if (built.status !== 0) throw new Error(read(path.join(temp, 'build-output.txt')));
  const www = path.join(temp, 'native/www');
  const app = read(path.join(www, 'js/app.js'));
  const config = JSON.parse(read(path.join(temp, 'native/capacitor.config.store.json')));
  check(!('server' in config) && /const STORE_BUILD = true;/.test(app), 'generated store config is local and bundled flag is true');

  const missing = [], absolute = [];
  let refs = 0, modules = 0;
  function asset(from, ref) {
    if (/^(?:[a-z][\w+.-]*:|#)/i.test(ref)) return;
    refs++;
    if (ref.startsWith('/')) { absolute.push(`${path.relative(www, from)}: ${ref}`); return; }
    const target = path.resolve(path.dirname(from), ref.split(/[?#]/)[0]);
    if (!target.startsWith(www + path.sep) || !existsSync(target)) missing.push(`${path.relative(www, from)}: ${ref}`);
  }
  const html = read(path.join(www, 'index.html')).replace(/<!--[\s\S]*?-->/g, '');
  for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) asset(path.join(www, 'index.html'), m[1]);
  const css = read(path.join(www, 'app.css')).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/g)) asset(path.join(www, 'app.css'), m[1] ?? m[2] ?? m[3]);
  for (const file of [...files(path.join(www, 'js')), ...files(path.join(www, 'data'))].filter(f => f.endsWith('.js'))) {
    modules++;
    const ts = tokens(read(file));
    for (let i = 0; i < ts.length; i++) {
      if (ts[i].value !== 'import' || ts[i + 1]?.value === '.') continue;
      let next = i + 1;
      if (ts[next]?.value === '(') next++;
      else while (next < ts.length && ts[next].type !== 'String' && ts[next].value !== ';') next++;
      if (ts[next]?.type === 'String') asset(file, vm.runInNewContext(ts[next].value));
    }
  }
  check(modules > 0 && refs > 0 && !missing.length && !absolute.length,
    `bundle paths: ${modules} modules, ${refs} literal entry/CSS/import references, missing=${JSON.stringify(missing)}, root-absolute=${JSON.stringify(absolute)}`);

  const swCondition = app.match(/if\s*\(([^\n]*'serviceWorker'[^\n]*)\)\s*\{/);
  if (!swCondition) throw new Error('service-worker registration condition missing');
  const swAllowed = protocol => vm.runInNewContext(swCondition[1], { navigator: { serviceWorker: {} }, S: { demo: false }, location: { protocol } });
  check(!swAllowed('capacitor:') && swAllowed('https:'), 'real service-worker condition skips capacitor and admits HTTPS control');

  // Use the same function extraction and instruments for both channels. The web
  // control must observe the fetch, banner, click and update, so an empty/wrong
  // source selection or disconnected instrument cannot make the store pass.
  const web = read(path.join(root, 'js/app.js'));
  const settingsRow = web.match(/^    <div class="settings-row">.*id="buildLine".*$/m)?.[0];
  if (!settingsRow) throw new Error('Settings version row missing');
  const settings = store => vm.runInNewContext('`' + settingsRow + '`', {
    STORE_BUILD: store, APP_BUILD: 'v514', shellV: '',
  });
  check(settings(false) === '    <div class="settings-row"><div class="lab"><b>App version</b><span id="buildLine">Build v514 · tap if the app looks out of date</span></div><button class="btn small ghost" id="updateBtn">Get latest</button></div>',
    'CONTROL web Settings update row retains identical rendered bytes');
  /* ASSERT THE RULE, NOT THE SENTENCE. This row was pinned to the exact string
     "Updates are available through the App Store" and went red in v581 when the
     Settings tidy reworded it to "updates come through the App Store", which
     satisfies the rule perfectly well. A guard pinned to copy goes red on
     healthy code and gets relaxed by whoever is in a hurry, so it is fixed at
     the assertion: the row must NAME the App Store before the player taps, and
     must not offer the web build's action. Both halves still fail if the store
     branch stops distinguishing itself. */
  const storeRow = settings(true);
  check(/app store/i.test(storeRow) && !storeRow.includes('>Get latest</button>')
    && !/tap if the app looks out of date/i.test(storeRow),
    'store Settings names the update channel before the player taps', storeRow);
  check(web.includes("$('#updateBtn')?.addEventListener('click', hardRefresh);"),
    'REACH Settings update button is bound to the audited handler');
  function runtime(source, store, online = true, withWorker = false) {
    const calls = [], messages = [], handlers = {};
    const banner = { isConnected: true, innerHTML: '' };
    const button = { addEventListener: (event, fn) => { handlers[event] = fn; } };
    const context = vm.createContext({ STORE_BUILD: store, AbortController, setTimeout, clearTimeout,
      APP_BUILD: 'v514', runningBuild: () => 514, esc: String,
      $: selector => selector === '#updBanner' ? banner : selector === '#updBannerBtn' ? button : null,
      navigator: withWorker ? { serviceWorker: { getRegistration: async () => ({
        update: async () => calls.push('update'),
        waiting: { state: 'installed', postMessage: m => calls.push(m), addEventListener: () => {} },
      }) } } : {},
      location: { protocol: store ? 'capacitor:' : 'https:', reload: () => calls.push('reload') },
      toast: text => messages.push(text),
      fetch: async url => {
        calls.push(url.split('?')[0]);
        return { ok: online, json: async () => ({ version: 'tally-v515' }) };
      },
    });
    vm.runInContext(['latestBuild', 'hardRefresh', 'checkForUpdate'].map(name => functionSource(source, name)).join('\n'), context);
    return { calls, messages, handlers, banner, run: code => vm.runInContext(code, context) };
  }
  const store = runtime(app, true);
  await store.run('hardRefresh()');
  check(!store.calls.length && store.messages.length === 1
    && store.messages[0] === 'To update Boneheadz Gym, open the App Store and check for updates.',
    `store refresh must explain App Store updates without web fetch/reload: calls=${JSON.stringify(store.calls)}, messages=${JSON.stringify(store.messages)}`);
  const latest = await store.run('latestBuild()');
  await store.run('checkForUpdate({})');
  check(latest === 0 && !store.calls.length && store.banner.innerHTML === '',
    `store background update checks never fetch or show a web banner: calls=${JSON.stringify(store.calls)}`);
  const live = runtime(web, false, true, true);
  await live.run('checkForUpdate({})');
  check(JSON.stringify(live.calls) === '["version.json"]'
    && live.banner.innerHTML.includes("You're on v514; v515 is live.")
    && typeof live.handlers.click === 'function', 'CONTROL web stale banner observes the live version and binds its update button');
  if (live.handlers.click) await live.handlers.click();
  check(JSON.stringify(live.calls) === '["version.json","version.json","update","SKIP_WAITING"]'
    && JSON.stringify(live.messages) === '["Getting the latest build..."]',
    'CONTROL web banner click updates the waiting worker without a premature reload');
  const plain = runtime(web, false);
  await plain.run('hardRefresh()');
  check(JSON.stringify(plain.calls) === '["version.json","reload"]'
    && JSON.stringify(plain.messages) === '["Getting the latest build..."]', 'CONTROL web refresh without a worker fetches and reloads');
  const offline = runtime(web, false, false);
  await offline.run('hardRefresh()');
  check(JSON.stringify(offline.calls) === '["version.json"]'
    && JSON.stringify(offline.messages) === '["No connection. Try again when you have signal"]',
    'CONTROL offline web refresh retains its connection message without reloading');
  console.log('LIMIT: literal path inventory and VM functions only; dynamic assets, WKWebView APIs and rendered controls require device proof.');
} catch (error) {
  check(false, `audit could not complete: ${error.message}`);
} finally {
  rmSync(auditOutputPath(temp), { recursive: true, force: true });
}
console.log(`store runtime: ${rows - failed}/${rows} passed`);
process.exit(failed ? 1 : 0);
