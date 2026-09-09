/* Frozen r56 B1 work order, 2026-09-08: all 90 shipped PNG pairs must exceed
 * mean core OKLab delta * 100 of 20. CONTROL restores the actual old C1 frost.
 * Pure offline image reads, using the same Python dependencies as the generator.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function checkPetPalette() {
  const script = fileURLToPath(new URL('./pet-palette-check.py', import.meta.url));
  const run = (...args) => spawnSync('python3', [script, ...args], { encoding: 'utf8' });
  const current = run();
  assert.equal(current.status, 0, current.error?.message || current.stdout + current.stderr);
  const control = run('--control');
  assert.equal(control.status, 1, `CONTROL must reject shipped pre-fix frost: ${control.stdout}${control.stderr}`);
  assert.match(control.stdout, /FAIL C1 base\/frost 10\.130837 <= 20\.00/);
  return current.stdout + 'CONTROL: shipped pre-fix C1 frost rejected at 10.130837 (exit 1)\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(checkPetPalette());
}
