/* Shared audit receipt. Preload for arbitrary entry points with node --import;
 * godmode imports it for direct browser audits too. A START without END is
 * incomplete (including SIGKILL, which no in-process handler can survive).
 * Legacy totals are EMITTED rows, not an invented planned denominator.
 */
import { writeSync } from 'node:fs';
import { basename } from 'node:path';
import { format } from 'node:util';
import { cpus, loadavg, platform, arch, hostname } from 'node:os';

// Disclose every browser row, including timing hidden behind a DOM/sample
// predicate. Never infer timing dependence from a row's name or change its grade.
const machinePages = new WeakMap(), machines = [];
const cpu = cpus();
const host = { host: hostname(), platform: platform(), arch: arch(),
  cpu: cpu[0]?.model || 'unavailable', logicalCPUs: cpu.length };
export async function observeMachine(page, browser, launch = {}) {
  if (machinePages.has(page)) return;
  const machine = { page: machines.length + 1, closed: false,
    renderer: 'UNAVAILABLE', browser: 'UNAVAILABLE', headless: launch.headless ?? 'default',
    rendererFlags: (launch.args || []).filter(a => /gpu|gl|angle|headless/.test(a)),
    trace: { attached: false, active: false, note: 'no trace attached' },
    cpuRates: [1], viewport: launch.defaultViewport ?? 'default', baselines: [] };
  machinePages.set(page, machine); machines.push(machine);
  page.once('close', () => { machine.closed = true; });
  try {
    machine.browser = await browser.version();
    const session = await browser.target().createCDPSession();
    try {
      const info = await session.send('SystemInfo.getInfo');
      machine.renderer = info.gpu?.auxAttributes?.glRenderer || 'UNAVAILABLE: CDP did not identify the active renderer';
      machine.gpuDevices = info.gpu?.devices;
    } finally { await session.detach(); }
  } catch (error) { machine.renderer = `UNAVAILABLE: ${error.message}`; }
  if (page.setViewport) {
    const set = page.setViewport.bind(page);
    page.setViewport = async value => { const result = await set(value); machine.viewport = value; return result; };
  }
  if (page.createCDPSession) {
    const create = page.createCDPSession.bind(page);
    page.createCDPSession = async (...args) => {
      const session = await create(...args), send = session.send.bind(session);
      session.send = async (method, params, ...rest) => {
        const result = await send(method, params, ...rest);
        if (method === 'Emulation.setCPUThrottlingRate') machine.cpuRates.push(params.rate);
        if (method === 'Tracing.start') trace(true);
        if (method === 'Tracing.end') trace(false);
        return result;
      };
      return session;
    };
  }
  const trace = active => {
    machine.trace = { attached: true, active,
      note: 'trace adds profiling overhead; diagnostic cadence, rerun without tracing for performance evidence' };
  };
  if (page.tracing) for (const method of ['start', 'stop']) {
    const call = page.tracing[method].bind(page.tracing);
    page.tracing[method] = async (...args) => { const result = await call(...args); trace(method === 'start'); return result; };
  }
  // Blank-page baseline does not navigate, open a crate or compile its shaders.
  // Its extra setup time is disclosed; no rAF loop survives the bounded probe.
  await sampleMachineCadence(page, 'blank page before navigation');
}

export async function sampleMachineCadence(page, state) {
  const machine = machinePages.get(page);
  if (!machine) throw new Error('machine observation must be installed before sampling cadence');
  const baseline = { state, measuredAt: new Date().toISOString(), cpuRate: machine.cpuRates.at(-1),
    traceAttached: machine.trace.active, hostLoad: loadavg(), windowMs: 500 };
  let timeout;
  try {
    Object.assign(baseline, await Promise.race([page.evaluate(() => new Promise(resolve => {
      const samples = [], start = performance.now();
      let raf;
      const tick = t => { samples.push(t); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
      setTimeout(() => {
        cancelAnimationFrame(raf);
        const gaps = samples.slice(1).map((t, i) => t - samples[i]).sort((a, b) => a - b);
        resolve({ status: gaps.length ? 'MEASURED' : 'UNAVAILABLE: fewer than two rAF samples',
          samples: samples.length, elapsedMs: performance.now() - start,
          medianMs: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
          minMs: gaps[0] ?? null, maxMs: gaps.at(-1) ?? null,
          visibility: document.visibilityState, dpr: devicePixelRatio });
      }, 500);
    })), new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('cadence probe exceeded 2000ms')), 2000);
    })]));
  } catch (error) { baseline.status = `UNAVAILABLE: ${error.message}`; }
  finally { clearTimeout(timeout); }
  machine.baselines.push(baseline);
  return baseline;
}

export function discloseMachineRow(label) {
  if (!machines.length) return;
  // Include all observed pages, with IDs and closed state. A row may compare two
  // pages or grade a closed browser; choosing the last page would misattribute it.
  write(`MACHINE CHARACTER ${label}: ${JSON.stringify({ ...host, loadAverage1m5m15m: loadavg(),
    loadNote: 'host load at grading, not a list of competing processes; Windows reports zero',
    baselineNote: '500ms setup probe per page; rAF cadence is not presented-frame count; state and trace recorded per probe',
    pagesObserved: machines })}`);
}

const suite = basename(process.argv[1] || 'audit');
const rows = [];
const dependencies = [];
let expected = null, explicit = false, completed = false, interrupted = null;
const write = text => { try { writeSync(2, text + '\n'); } catch { /* closed output */ } };
write(`AUDIT START ${suite}: completion pending; planned rows undeclared`);
const log = console.log.bind(console);
console.log = (...args) => {
  for (const line of format(...args).split('\n')) {
    const match = line.trim().match(/^(?:PASS|FAIL|ok|OK|UNPRV|UNPROVEN|SETUP)(?::|\s)\s*(.+)/);
    if (match && !explicit) discloseMachineRow(match[1]);
  }
  if (!explicit) {
    for (const line of format(...args).split('\n')) {
      const match = line.match(/^(PASS|FAIL|ok|UNPRV)\s+(.+)/);
      if (match) rows.push({ label: match[2], status: match[1] === 'UNPRV' ? 'UNPROVEN' : match[1] });
    }
  }
  log(...args);
};
const errorLog = console.error.bind(console);
console.error = (...args) => {
  discloseMachineRow(format(...args).trim().replace(/\n/g, ' | '));
  errorLog(...args);
};
export function declareAudit({ expectedRows }) {
  if (!Number.isInteger(expectedRows) || expectedRows < 1) throw new Error('planned rows must be a positive integer');
  if (rows.length) throw new Error('declare planned rows before grading');
  expected = expectedRows;
  explicit = true;
  write(`AUDIT PLAN ${suite}: ${expected} rows`);
}
export function recordAuditRow(label, status) {
  if (!['PASS', 'FAIL', 'UNPROVEN'].includes(status)) throw new Error(`invalid row status: ${status}`);
  rows.push({ label, status });
  discloseMachineRow(label);
}
export function completeAudit() { completed = true; }
export function discloseDependency(name, ok, detail) {
  dependencies.push({ name, ok: !!ok, detail });
  write(`DEPENDENCY ${name}: ${ok ? 'AVAILABLE' : 'UNAVAILABLE'} | ${detail}`);
}
process.on('uncaughtExceptionMonitor', error => { interrupted = error.stack || String(error); });
for (const [signal, code] of [['SIGTERM', 143], ['SIGINT', 130]]) {
  process.once(signal, () => { interrupted = signal; process.exit(code); });
}
process.once('exit', code => {
  const failed = rows.filter(r => r.status === 'FAIL');
  const unproven = rows.filter(r => r.status === 'UNPROVEN');
  const missing = dependencies.filter(d => !d.ok);
  const incomplete = !!interrupted || (explicit && (!completed || rows.length !== expected)) || code === 13;
  const verdict = failed.length || (code !== 0 && code !== 97) ? 'FAILED'
    : incomplete || unproven.length || missing.length || code === 97 ? 'UNPROVEN' : 'PASSED';
  // A missing dependency never erases a real failure or a crash.
  if (verdict === 'FAILED' && !code) process.exitCode = 1;
  if (verdict === 'UNPROVEN' && !code) process.exitCode = 97;
  for (const r of failed) write(`RETAINED FAIL ${r.label}`);
  for (const d of missing) write(`UNPRV ${d.name}  DID NOT RUN: ${d.detail}`);
  if (interrupted) write(`INTERRUPTED ${suite}: ${interrupted}`);
  write(`AUDIT END ${suite}: ${verdict}; ${incomplete ? 'INCOMPLETE' : explicit ? 'COMPLETE' : 'NORMAL EXIT (row coverage undeclared)'}; `
    + `rows=${rows.length}/${expected ?? 'undeclared'}; failed=${failed.length}; unproven=${unproven.length}; exit=${process.exitCode ?? code}`);
});
