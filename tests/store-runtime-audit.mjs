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
import esprima from 'esprima';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(path.join(tmpdir(), 'store-runtime-'));
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
    cpSync(path.join(root, name), path.join(temp, name), { recursive: true });
  }
  mkdirSync(path.join(temp, 'native'));
  for (const name of ['build-www.sh', 'build-store.sh', 'capacitor.config.json']) {
    cpSync(path.join(root, 'native', name), path.join(temp, 'native', name));
  }
  const built = spawnSync('/bin/bash', ['build-store.sh'], {
    cwd: path.join(temp, 'native'), encoding: 'utf8', env: { ...process.env, STORE_BUILD: '1' },
  });
  writeFileSync(path.join(temp, 'build-output.txt'), `${built.stdout || ''}${built.stderr || ''}`);
  writeFileSync(path.join(temp, 'build-exit.txt'), String(built.status));
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

  const calls = [], messages = [];
  const context = vm.createContext({ STORE_BUILD: true, AbortController, setTimeout, clearTimeout,
    navigator: {}, location: { protocol: 'capacitor:', reload: () => calls.push('reload') },
    toast: text => messages.push(text),
    fetch: async url => {
      calls.push(url.split('?')[0]);
      const file = path.join(www, url.split('?')[0]);
      return { ok: existsSync(file), json: async () => JSON.parse(read(file)) };
    },
  });
  vm.runInContext(functionSource(app, 'latestBuild') + '\n' + functionSource(app, 'hardRefresh'), context);
  await vm.runInContext('hardRefresh()', context);
  check(!calls.length && messages.length > 0 && messages.every(m => /app store/i.test(m)),
    `store refresh must explain App Store updates without web fetch/reload: calls=${JSON.stringify(calls)}, messages=${JSON.stringify(messages)}`);
  console.log('LIMIT: literal path inventory and VM functions only; dynamic assets, WKWebView APIs and rendered controls require device proof.');
} catch (error) {
  check(false, `audit could not complete: ${error.message}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
console.log(`store runtime: ${rows - failed}/${rows} passed`);
process.exit(failed ? 1 : 0);
