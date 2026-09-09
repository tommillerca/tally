import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire, isBuiltin } from 'node:module';
let parse;
try { ({ parse } = await import('acorn')); }
catch { throw new Error('DEPENDENCY: acorn is missing; install the locked root dependencies before running ship tools'); }
export const GATE = 'tests/release-gate.mjs';
export const fail = message => { throw new Error(message); };
export const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');
export function git(root, ...args) {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { fail(`GIT: ${args[0]}: ${e.stderr || e.message}`); }
}
export function ast(source, label) {
  try { return parse(source, { ecmaVersion: 'latest', sourceType: 'module' }); }
  catch (e) { fail(`SYNTAX: ${label}: ${e.message}`); }
}
export function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(n => walk(n, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
const literal = n => n?.type === 'Literal' && typeof n.value === 'string';
export function registrations(source, label) {
  const tree = ast(source, label), tiers = { PURE: [], BROWSER: [] }, pushes = [];
  for (const tier of Object.keys(tiers)) {
    const decl = tree.body.flatMap(n => n.type === 'VariableDeclaration' ? n.declarations : []).filter(n => n.id.name === tier);
    if (decl.length !== 1 || decl[0].init?.type !== 'ArrayExpression' || !decl[0].init.elements.every(literal)) fail(`REGISTRY: ${label}: expected one literal ${tier} array`);
    tiers[tier].push(...decl[0].init.elements.map(n => n.value));
  }
  for (const node of tree.body) {
    const call = node.type === 'ExpressionStatement' && node.expression;
    if (call?.type !== 'CallExpression' || call.callee.type !== 'MemberExpression' || call.callee.computed || call.callee.property.name !== 'push' || !Object.hasOwn(tiers, call.callee.object.name)) continue;
    if (!call.arguments.length || !call.arguments.every(literal)) fail(`REGISTRY: ${label}: nonliteral registration`);
    const tier = call.callee.object.name;
    const names = call.arguments.map(n => n.value);
    tiers[tier].push(...names); pushes.push({ node, tier, names });
  }
  if (!tiers.PURE.length) fail(`EMPTY_PURE: ${label}: zero audits cannot be green`);
  const seen = new Set();
  for (const [tier, names] of Object.entries(tiers)) for (const name of names) {
    if (!/^[\w.-]+\.(mjs|js)$/.test(name)) fail(`REGISTRY: unsafe audit name ${name}`);
    if (seen.has(name)) fail(`DUPLICATE_REGISTRATION: ${label}: ${name}`);
    seen.add(name);
  }
  return { tree, tiers, pushes };
}
// AST comparison ignores comments/formatting but preserves all executable runner code.
function canonical(node) {
  return JSON.stringify(node, (key, value) => ['start', 'end', 'raw'].includes(key) ? undefined : value);
}
export function generate(root, base, lanes) {
  const baseSource = git(root, 'show', `${base}:${GATE}`);
  const baseline = registrations(baseSource, base);
  const additions = new Map();
  const baseNames = new Map(Object.entries(baseline.tiers).flatMap(([t, ns]) => ns.map(n => [n, t])));
  for (const lane of lanes) {
    const source = read(lane, GATE), reg = registrations(source, lane);
    const remove = new Set();
    for (const push of reg.pushes) {
      const fresh = push.names.filter(n => !baseNames.has(n));
      if (fresh.length && fresh.length !== push.names.length) fail(`UNSUPPORTED_GATE_EDIT: ${lane}: mixed existing/new push; use a separate push`);
      if (!fresh.length) continue;
      remove.add(push.node);
      for (const name of fresh) {
        if (additions.has(name)) fail(`DUPLICATE_REGISTRATION: lanes both register ${name}`);
        additions.set(name, push.tier);
      }
    }
    const stripped = { ...reg.tree, body: reg.tree.body.filter(n => !remove.has(n)) };
    if (canonical(stripped) !== canonical(baseline.tree)) fail(`UNSUPPORTED_GATE_EDIT: ${lane}: only new literal PURE/BROWSER.push statements are supported; rebase or split runner/tier changes`);
  }
  const insert = baseline.tree.body.find(n => n.type === 'VariableDeclaration' && n.declarations.some(d => d.id.name === 'BROWSER')).start;
  const rows = [...additions].sort(([a], [b]) => a.localeCompare(b)).map(([name, tier]) => `${tier}.push(${JSON.stringify(name)});`);
  // BROWSER additions must be after its declaration, before coverage/execution.
  const browserDecl = baseline.tree.body.find(n => n.start === insert);
  const result = baseSource.slice(0, browserDecl.end) + (rows.length ? '\n' + rows.join('\n') : '') + baseSource.slice(browserDecl.end);
  registrations(result, 'generated gate');
  return { source: result, additions };
}
export function options(argv, lanesAllowed = true) {
  const result = { tree: process.cwd(), base: 'origin/main', lanes: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (['--tree', '--base', '--lane'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) fail(`USAGE: ${arg} requires a value`);
      if (arg === '--lane' && lanesAllowed) result.lanes.push(path.resolve(value));
      else if (arg === '--lane') fail('USAGE: lanes not supported');
      else result[arg.slice(2)] = value;
    } else if (arg === '--check') result.check = true;
    else fail(`USAGE: unknown option ${arg}`);
  }
  result.tree = fs.realpathSync(result.tree);
  result.base = git(result.tree, 'rev-parse', '--verify', `${result.base}^{commit}`).trim();
  return result;
}
export function main(fn) {
  try { fn(); } catch (e) { console.error(`REFUSE ${e.message}`); process.exitCode = 1; }
}
export function files(root) {
  return [...new Set(git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean))];
}
export function changed(root, base) {
  return [...new Set([...git(root, 'diff', '--name-only', '-z', base, '--').split('\0'), ...git(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0')].filter(Boolean))];
}
export function dependencies(root, entries) {
  const pkg = JSON.parse(read(root, 'package.json'));
  const req = createRequire(path.join(root, 'package.json'));
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
    try { req.resolve(name); } catch { fail(`DEPENDENCY: ${name} declared but not installed in ${root}`); }
  }
  const visited = new Set();
  function scan(file) {
    if (visited.has(file) || !/\.[cm]?js$/.test(file)) return;
    visited.add(file);
    const tree = ast(fs.readFileSync(file, 'utf8'), file);
    const specs = [];
    walk(tree, n => {
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(n.type) && n.source) specs.push(n.source.value);
      if (n.type === 'ImportExpression' && literal(n.source)) specs.push(n.source.value);
    });
    for (const spec of specs) {
      if (isBuiltin(spec) || /^[a-z]+:\/\//i.test(spec)) continue;
      let resolved;
      try { resolved = createRequire(file).resolve(spec.split('?')[0]); }
      catch { fail(`DEPENDENCY: ${path.relative(root, file)} cannot resolve ${spec}`); }
      if (spec.startsWith('.') && resolved.startsWith(root + path.sep)) scan(resolved);
    }
  }
  entries.forEach(f => scan(path.join(root, f)));
}
export function command(root, args) {
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) fail(`CHECK: ${args.join(' ')}: ${r.error?.message || r.stderr || r.stdout || `exit ${r.status}`}`);
  return r.stdout.trim();
}
