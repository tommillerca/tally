// Node-only positive and negative controls. No sockets, Git writes or network.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Override only for the documented mutation proof on a throwaway source copy.
const modulePath = process.env.BRANCH_GRAVEYARD_MODULE || resolve(root, 'scripts/branch-graveyard.mjs');
const { classify, rows, report, deletionPlan } = await import(pathToFileURL(modulePath));
let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}
const sha = digit => digit.repeat(40);
const remote = { name: 'origin', repository: 'owner/public', main: sha('a'), inventory: 'live' };
const branch = { remote: 'origin', name: 'feature', sha: sha('b'), inMain: false, mainInHead: false };
const proof = { number: 1, repository: remote.repository, baseRefName: 'main', headRefName: 'ship/v1',
  headRefOid: sha('c'), mergeOid: sha('d'), mergeInMain: true, headContained: true, url: 'https://github.com/owner/public/pull/1' };
check('ahead/diverged without proof stays uncertain', () => assert.equal(classify(branch, remote).bucket, 'unclassifiable'));
check('reachable head is shipped', () => assert.equal(classify({ ...branch, inMain: true }, remote).bucket, 'shipped'));
check('source head in merged release train is shipped', () => assert.equal(classify({ ...branch, prEvidence: [proof] }, remote).bucket, 'shipped'));
check('reused name or branch advanced after merge is uncertain', () => assert.equal(classify({ ...branch, prEvidence: [{ ...proof, headContained: false }] }, remote).bucket, 'unclassifiable'));
check('PR merged outside this main cannot establish shipping', () => assert.equal(classify({ ...branch, prEvidence: [{ ...proof, mergeInMain: false }] }, remote).bucket, 'unclassifiable'));
check('private/public evidence never crosses repositories', () => assert.equal(classify({ ...branch, prEvidence: [{ ...proof, repository: 'owner/private' }] }, remote).bucket, 'unclassifiable'));
check('non-main PR is uncertain', () => assert.equal(classify({ ...branch, prEvidence: [{ ...proof, baseRefName: 'develop' }] }, remote).bucket, 'unclassifiable'));
check('missing commit evidence is uncertain', () => assert.equal(classify({ ...branch, prEvidence: [{ ...proof, mergeInMain: null }] }, remote).bucket, 'unclassifiable'));
check('direct main extension includes concrete loss summary', () => {
  const result = classify({ ...branch, mainInHead: true, treeDiffers: true, summary: 'Add new.txt: unique work' }, remote);
  assert.equal(result.bucket, 'unmerged'); assert.match(result.loss, /new.txt/);
});
check('stale main cannot establish genuinely unmerged work', () => assert.equal(classify({ ...branch, mainInHead: true, treeDiffers: true }, { ...remote, inventory: 'local tracking refs only, freshness unverified' }).bucket, 'unclassifiable'));
check('empty extension never becomes a genuine loss', () => assert.equal(classify({ ...branch, mainInHead: true, treeDiffers: false }, remote).bucket, 'unclassifiable'));
const fixture = { schema: 1, capturedAt: 'fixture', excluded: [], remotes: [{ ...remote, errors: [] }], branches: [branch,
  { ...branch, name: 'shipped', inMain: true }, { ...branch, name: 'main', sha: remote.main, inMain: true }] };
check('dry run lists exact remote/ref/head/reason and protects main', () => {
  const plan = deletionPlan(fixture); assert.match(plan, /Candidates: 1\. Retained: 2/);
  const candidate = JSON.parse(plan.split('\n')[2]);
  assert.equal(candidate.remote, 'origin'); assert.equal(candidate.ref, 'refs/heads/shipped');
  assert.equal(candidate.expectedHead, branch.sha); assert.match(candidate.reason, /reachable/);
});
check('stale inventories have zero deletion candidates', () => assert.match(deletionPlan({ ...fixture,
  remotes: [{ ...remote, inventory: 'local tracking refs only, freshness unverified' }] }), /Candidates: 0/));
check('empty sample and duplicate refs fail closed', () => {
  assert.throws(() => rows({ ...fixture, branches: [] }), /empty/);
  assert.throws(() => rows({ ...fixture, branches: [branch, branch] }), /Duplicate/);
});
for (const args of [['--dry-run'], ['--acknowledge-deletion-plan'], ['--execute'], ['--delete']]) {
  check(`CLI refuses ${args.join(' ')}`, () => {
    const result = spawnSync(process.execPath, [modulePath, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.match(result.stderr, /requires both|No deletion executor/); assert.equal(result.stdout, '');
  });
}
const frozen = JSON.parse(readFileSync(resolve(root, 'docs/branch-graveyard.snapshot.json'), 'utf8'));
check('CONTROL captured reachable head is shipped and appears in the same classified rows', () => {
  const candidate = frozen.branches.find(b => b.inMain === true && b.name !== 'main');
  assert.ok(candidate, 'captured reachable non-main branch must exist');
  const result = classify(candidate, frozen.remotes.find(r => r.name === candidate.remote));
  assert.equal(result.bucket, 'shipped');
  const found = rows(frozen).filter(r => r.remote === candidate.remote && r.name === candidate.name);
  assert.equal(found.length, 1);
  assert.equal(found[0].bucket, 'shipped');
});
check('real captured divergent branch is not a phantom unmerged item', () => {
  const candidate = frozen.branches.find(b => b.inMain === false && b.mainInHead === false && !b.prEvidence.length);
  assert.ok(candidate, 'real divergent negative control must exist');
  assert.equal(classify(candidate, frozen.remotes.find(r => r.name === candidate.remote)).bucket, 'unclassifiable', `${candidate.remote}/${candidate.name}`);
});
check('all captured branches reproduce the checked-in report exactly', () => {
  assert.equal(rows(frozen).length, frozen.branches.length);
  assert.equal(report(frozen), readFileSync(resolve(root, 'docs/BRANCH-GRAVEYARD.md'), 'utf8'));
});
check('acknowledged CLI preview matches pure plan', () => {
  const result = spawnSync(process.execPath, [modulePath, '--snapshot', resolve(root, 'docs/branch-graveyard.snapshot.json'),
    '--dry-run', '--acknowledge-deletion-plan'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, deletionPlan(frozen));
});
console.log(`Branch graveyard audit: ${passed}/22 passed.`);
