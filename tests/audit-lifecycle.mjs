/* Shared audit receipt. Preload for arbitrary entry points with node --import;
 * godmode imports it for direct browser audits too. A START without END is
 * incomplete (including SIGKILL, which no in-process handler can survive).
 * Legacy totals are EMITTED rows, not an invented planned denominator.
 */
import { writeSync } from 'node:fs';
import { basename } from 'node:path';
import { format } from 'node:util';

const suite = basename(process.argv[1] || 'audit');
const rows = [];
const dependencies = [];
let expected = null, explicit = false, completed = false, interrupted = null;
const write = text => { try { writeSync(2, text + '\n'); } catch { /* closed output */ } };
write(`AUDIT START ${suite}: completion pending; planned rows undeclared`);
const log = console.log.bind(console);
console.log = (...args) => {
  if (!explicit) {
    for (const line of format(...args).split('\n')) {
      const match = line.match(/^(PASS|FAIL|ok|UNPRV)\s+(.+)/);
      if (match) rows.push({ label: match[2], status: match[1] === 'UNPRV' ? 'UNPROVEN' : match[1] });
    }
  }
  log(...args);
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
