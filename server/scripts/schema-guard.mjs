import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { sourceContract, generatedSource } from './write-contract.mjs';

export const serverRoot = fileURLToPath(new URL('../', import.meta.url));
export function currentContract() { return sourceContract(join(serverRoot, 'src')); }
export function checkGenerated(contract = currentContract()) {
  if (readFileSync(join(serverRoot, 'src/write-contract.generated.js'), 'utf8') !== generatedSource(contract)) {
    throw new Error('Stale write contract. Run: cd server && node scripts/schema-guard.mjs --generate');
  }
  return contract;
}

// PRAGMA only, including on remote. No real or synthetic player writes.
export function driftSQL(contract) {
  return Object.keys(contract).map(t => `PRAGMA table_info('${t}');`).join('\n');
}
export function assertColumns(contract, results) {
  const entries = Object.entries(contract);
  if (!Array.isArray(results) || results.length !== entries.length) throw new Error('Invalid D1 schema response');
  const missing = [];
  entries.forEach(([table, columns], i) => {
    if (results[i].success !== true || !Array.isArray(results[i].results)) throw new Error(`D1 schema query failed: ${table}`);
    const present = new Set(results[i].results.map(r => r.name));
    for (const col of columns) if (!present.has(col)) missing.push(`${table}.${col}`);
  });
  if (missing.length) throw new Error(`Schema drift: missing column(s): ${missing.join(', ')}. Apply the required migration before deploy.`);
  return `Schema OK: ${entries.length} tables, ${entries.reduce((n, [, c]) => n + c.length, 0)} write columns`;
}

export function main(args) {
  const mode = args[0];
  if (!['--generate', '--check', '--local', '--remote'].includes(mode)
      || (args.length > 1 && !(mode === '--local' && args.length === 3 && args[1] === '--persist-to'))) {
    throw new Error('Usage: node scripts/schema-guard.mjs --generate | --check | --local [--persist-to DIR] | --remote');
  }
  const contract = currentContract();
  if (mode === '--generate') {
    writeFileSync(join(serverRoot, 'src/write-contract.generated.js'), generatedSource(contract));
    console.log('Generated write contract from server/src SQL');
    return;
  }
  checkGenerated(contract);
  if (mode === '--check') { console.log('Write contract matches source'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'bonez-schema-'));
  try {
    const extra = args.length > 1 ? ['--persist-to', resolve(args[2])] : [];
    const result = spawnSync(process.execPath, [join(serverRoot, 'node_modules/wrangler/bin/wrangler.js'),
      'd1', 'execute', 'bonez', '--config', join(serverRoot, 'wrangler.toml'), mode,
      // --file invokes the remote import API, which locks D1 and returns an
      // import summary. --command uses the read-only PRAGMA query response.
      '--command', driftSQL(contract), '--json', ...extra], {
      cwd: serverRoot, encoding: 'utf8', timeout: 120000,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(dir, 'logs') },
    });
    if (result.error || result.status !== 0) throw new Error(`D1 schema check failed (${mode}): ${result.error?.message || result.stderr || result.stdout}`);
    console.log(assertColumns(contract, JSON.parse(result.stdout)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
