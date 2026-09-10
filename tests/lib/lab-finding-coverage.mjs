// Executable ownership for the advisory report, independent of suite totals.
import assert from 'node:assert/strict';
export const LAB_FINDING_GUARDS = Object.freeze({1:'lab-health-recovery-audit.mjs'});
export const ROOM2_FINDINGS = Object.freeze(Array.from({length:20-5+1},(_,i)=>i+5));
export function requireLabFindingCoverage(files, pure) {
  for (const [id,file] of Object.entries(LAB_FINDING_GUARDS)) {
    assert.ok(files.includes(file),`finding ${id}: missing required guard ${file}`);
    assert.equal(pure.filter(f=>f===file).length,1,`finding ${id}: ${file} must run exactly once in PURE`);
  }
}
export function room2Missing(grades) {
  return ROOM2_FINDINGS.filter(id=>typeof grades[id] !== 'function');
}
