#!/usr/bin/env node
// Read-only Git/gh inventory. No execution path deletes refs or pushes.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHA = /^[0-9a-f]{40,64}$/;
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function run(bin, args) {
  const result = spawnSync(bin, args, { cwd: root, encoding: 'utf8', timeout: 60000,
    maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' } });
  if (result.error || result.status !== 0) {
    throw new Error(`${bin} ${args.join(' ')}: ${result.error?.message || result.stderr.trim() || `exit ${result.status}`}`);
  }
  return result.stdout.trim();
}
function ancestor(a, b) {
  if (!SHA.test(a || '') || !SHA.test(b || '')) return null;
  const result = spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? true : result.status === 1 ? false : null;
}
function githubRepo(url) {
  return url.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1] || null;
}

export function classify(branch, remote) {
  if (!remote.main || !SHA.test(branch.sha)) return { bucket: 'unclassifiable', reason: 'Missing main or branch object identity.' };
  if (branch.inMain === true) return { bucket: 'shipped', reason: `Head is reachable from ${remote.name}/main (${remote.main}).` };
  // A name match alone is unsafe: a branch can advance or reuse an old name.
  const proof = (branch.prEvidence || []).find(p => p.baseRefName === 'main' && p.repository === remote.repository &&
    p.mergeInMain === true && p.headContained === true && SHA.test(p.headRefOid || '') && SHA.test(p.mergeOid || ''));
  if (proof) return { bucket: 'shipped', reason: `Head contained in merged PR #${proof.number} (${proof.headRefName}@${proof.headRefOid}); merge ${proof.mergeOid} is on this remote's main. ${proof.url}` };
  // Only a direct extension of the current main provides an unambiguous current
  // baseline. Divergence, ahead counts, open PRs and missing PRs prove no loss.
  if (remote.inventory === 'live' && branch.mainInHead === true && branch.treeDiffers === true) return { bucket: 'unmerged',
    reason: 'Branch extends the recorded current main and has different committed content.',
    loss: branch.summary || 'Committed changes beyond current main; details unavailable.' };
  return { bucket: 'unclassifiable', reason: 'No complete head containment proof on main. Squash, cherry-pick, train conflict resolutions, branch reuse or unavailable PR/object evidence cannot be distinguished.' };
}

export function collect() {
  const snapshot = { schema: 1, capturedAt: new Date().toISOString(), remotes: [], branches: [], excluded: [] };
  const refs = run('git', ['for-each-ref', '--format=%(refname)%09%(objectname)%09%(symref)', 'refs/remotes']).split('\n');
  for (const name of run('git', ['remote']).split('\n').filter(Boolean).sort(order)) {
    const url = run('git', ['remote', 'get-url', name]);
    const remote = { name, url, repository: githubRepo(url), inventory: 'live', errors: [], prs: [] };
    let heads;
    try {
      heads = run('git', ['ls-remote', '--heads', name]).split('\n').filter(Boolean).map(line => {
        const [sha, ref] = line.split(/\s+/); return { name: ref.replace(/^refs\/heads\//, ''), sha };
      });
    } catch (error) {
      remote.inventory = 'local tracking refs only, freshness unverified';
      remote.errors.push(error.message);
      heads = refs.filter(line => line.startsWith(`refs/remotes/${name}/`)).flatMap(line => {
        const [ref, sha, symbolic] = line.split('\t');
        const branchName = ref.slice(`refs/remotes/${name}/`.length);
        if (symbolic || branchName === 'HEAD') { snapshot.excluded.push(ref); return []; }
        return [{ name: branchName, sha }];
      });
    }
    remote.main = heads.find(h => h.name === 'main')?.sha || null;
    // Explicit --repo avoids confusing the public remote with the private one.
    // Paginate every closed PR, retaining only merged records. Never infer
    // unmerged from absence, even if the API query succeeds.
    try {
      if (!remote.repository) throw new Error('Unsupported GitHub remote URL; PR evidence unavailable.');
      const pages = JSON.parse(run('gh', ['api', '--method', 'GET', '--paginate', '--slurp',
        `repos/${remote.repository}/pulls?state=closed&base=main&per_page=100`]));
      remote.prs = pages.flat().filter(p => p.merged_at && p.base?.ref === 'main' &&
        p.base?.repo?.full_name?.toLowerCase() === remote.repository.toLowerCase() &&
        p.head?.repo?.full_name?.toLowerCase() === remote.repository.toLowerCase()).map(p => ({
        number: p.number, headRefName: p.head.ref, headRefOid: p.head.sha, baseRefName: p.base.ref,
        repository: remote.repository, mergeOid: p.merge_commit_sha, url: p.html_url,
        mergeInMain: ancestor(p.merge_commit_sha, remote.main)
      }));
      remote.prStatus = 'complete paginated merged PR inventory (same repository heads only)';
    } catch (error) {
      remote.prStatus = 'unavailable'; remote.errors.push(error.message);
    }
    snapshot.remotes.push(remote);
    for (const head of heads.sort((a, b) => order(a.name, b.name))) {
      const branch = { remote: name, name: head.name, sha: head.sha,
        inMain: ancestor(head.sha, remote.main), mainInHead: ancestor(remote.main, head.sha), prEvidence: [] };
      if (!branch.inMain) {
        for (const pr of remote.prs.filter(p => p.mergeInMain === true)) {
          // Also handles a source head included in a merged ship/vNNN train.
          const headContained = head.sha === pr.headRefOid || ancestor(head.sha, pr.headRefOid) === true;
          if (headContained) { branch.prEvidence.push({ ...pr, headContained }); break; }
        }
      }
      try {
        branch.subject = run('git', ['show', '-s', '--format=%s', head.sha]);
        if (branch.mainInHead && !branch.inMain) {
          branch.treeDiffers = run('git', ['rev-parse', `${head.sha}^{tree}`]) !== run('git', ['rev-parse', `${remote.main}^{tree}`]);
          branch.summary = run('git', ['log', '--format=%h %s', `${remote.main}..${head.sha}`]) + '\n' +
            run('git', ['diff', '--stat', remote.main, head.sha, '--']);
        }
      } catch (error) { branch.objectError = error.message; }
      snapshot.branches.push(branch);
    }
  }
  if (!snapshot.branches.length) throw new Error('No remote branches examined.');
  return snapshot;
}

export function rows(snapshot) {
  if (snapshot.schema !== 1 || !snapshot.branches?.length) throw new Error('Invalid or empty snapshot.');
  const seen = new Set();
  return snapshot.branches.map(branch => {
    const ref = `${branch.remote}/${branch.name}`;
    if (seen.has(ref)) throw new Error(`Duplicate branch: ${ref}`);
    seen.add(ref);
    const remote = snapshot.remotes.find(r => r.name === branch.remote);
    if (!remote) throw new Error(`Missing remote: ${branch.remote}`);
    return { ...branch, ref, ...classify(branch, remote) };
  }).sort((a, b) => order(a.ref, b.ref));
}
const clean = value => String(value ?? '').replaceAll('\u2014', ',').replaceAll('|', '\\|').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>');

export function report(snapshot) {
  const result = rows(snapshot);
  const counts = Object.fromEntries(['shipped', 'unmerged', 'unclassifiable'].map(b => [b, result.filter(r => r.bucket === b).length]));
  const lines = ['# Branch graveyard inventory', '', `Captured: ${snapshot.capturedAt}.`, '',
    `Total: ${result.length}. Shipped: ${counts.shipped}. Genuinely unmerged: ${counts.unmerged}. Unclassifiable: ${counts.unclassifiable}.`, '',
    'Each remote is evaluated against its own recorded main. Shipped means integrated historically, not a promise that later main commits retained every line. Main is listed but always protected from the deletion plan. Remote HEAD aliases are excluded.', '',
    'A merged PR must contain the current branch head and have its merge commit reachable from that remote main. This also recognizes source heads inside merged release trains. Name matches, ahead counts, patch IDs and three-dot diffs are never shipping evidence. Cherry-picks and conflict-resolved trains without head ancestry stay uncertain. Fork PR heads are conservatively excluded.', '',
    'Genuinely unmerged requires a live inventory and a direct extension of recorded current main with different committed content. Its loss summary lists all commits beyond main and the file diff statistics. These are changes absent from that remote main, not proof that deleting one ref makes them irrecoverable: other refs or the other remote may retain them. Divergent branches without positive shipping evidence stay unclassifiable, even with an open PR. Deleting an uncertain branch may lose work; its tip subject below is context, not a verified loss summary.', '',
    'Reproduce this frozen report: `node scripts/branch-graveyard.mjs --snapshot docs/branch-graveyard.snapshot.json --report docs/BRANCH-GRAVEYARD.md`.', '',
    'Refresh read-only evidence: `node scripts/branch-graveyard.mjs --capture docs/branch-graveyard.snapshot.json --report docs/BRANCH-GRAVEYARD.md`. This queries git ls-remote and the paginated GitHub PR API without fetching or changing refs. Missing commit objects stay uncertain. A refresh can change counts.', '',
    'Preview candidates only: `node scripts/branch-graveyard.mjs --snapshot docs/branch-graveyard.snapshot.json --dry-run --acknowledge-deletion-plan`. Both flags are required. No execution mode exists. Stale local inventories produce zero candidates. A frozen preview is advisory, never authorization to delete.', '', '## Evidence availability', ''];
  for (const remote of snapshot.remotes) {
    lines.push(`- ${clean(remote.name)} (${clean(remote.url)}): ${clean(remote.inventory)}; main ${remote.main || 'unknown'}; PRs ${clean(remote.prStatus)}.`);
    for (const error of remote.errors) lines.push(`  - ${clean(error)}`);
  }
  lines.push('', `Excluded aliases: ${snapshot.excluded.map(clean).join(', ') || 'none'}.`);
  for (const [bucket, label] of [['shipped', 'Shipped'], ['unmerged', 'Genuinely unmerged'], ['unclassifiable', 'Unclassifiable']]) {
    lines.push('', `## ${label} (${counts[bucket]})`, '', '| Branch | Head | Evidence or uncertainty | Tip subject / loss if deleted |', '| --- | --- | --- | --- |');
    for (const row of result.filter(r => r.bucket === bucket)) lines.push(`| ${clean(row.ref)} | ${row.sha} | ${clean(row.reason)} | ${clean(row.loss || row.subject || 'Object unavailable')} |`);
    if (!counts[bucket]) lines.push('| None established | | | |');
  }
  return lines.join('\n') + '\n';
}

export function deletionPlan(snapshot) {
  const result = rows(snapshot);
  const candidates = result.filter(r => r.bucket === 'shipped' && r.name !== 'main' && r.name !== 'HEAD' &&
    snapshot.remotes.find(remote => remote.name === r.remote).inventory === 'live');
  return ['DRY RUN ONLY. No branch will be deleted. No delete executor is implemented.',
    `Evidence captured: ${snapshot.capturedAt}. Revalidate remote, main and head identities before any separately authorized action.`,
    ...candidates.map(r => JSON.stringify({ action: 'would delete remote branch', remote: r.remote,
      url: snapshot.remotes.find(remote => remote.name === r.remote).url, ref: `refs/heads/${r.name}`, expectedHead: r.sha, reason: r.reason })),
    `Candidates: ${candidates.length}. Retained: ${result.length - candidates.length} (main, uncertain, unmerged or inventory freshness unverified).`].join('\n') + '\n';
}

export function main(args) {
  const flags = new Set(['--dry-run', '--acknowledge-deletion-plan']);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (flags.has(key)) options[key] = true;
    else if (['--snapshot', '--capture', '--report'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) options[key] = args[++i];
    else throw new Error(`Unknown or incomplete option: ${key}. No deletion executor exists.`);
  }
  if (!!options['--dry-run'] !== !!options['--acknowledge-deletion-plan']) throw new Error('Deletion preview requires both --dry-run and --acknowledge-deletion-plan.');
  if (options['--snapshot'] && options['--capture']) throw new Error('Use either --snapshot or --capture.');
  const snapshot = options['--snapshot'] ? JSON.parse(readFileSync(resolve(root, options['--snapshot']), 'utf8')) : collect();
  const markdown = report(snapshot);
  if (options['--capture']) writeFileSync(resolve(root, options['--capture']), JSON.stringify(snapshot, null, 2).replaceAll('\u2014', '\\u2014') + '\n');
  if (options['--report']) writeFileSync(resolve(root, options['--report']), markdown);
  process.stdout.write(options['--dry-run'] ? deletionPlan(snapshot) : options['--report'] ? markdown.split('\n')[4] + '\n' : markdown);
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
