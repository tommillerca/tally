import { spawnSync } from 'node:child_process';

// The release gate and audit-lifecycle.mjs already reserve 97 for UNPROVEN.
// Check prerequisites before grading so missing tools cannot create findings.
export function missingDependency(name, install) {
  console.log(`UNPRV ${name}  DID NOT RUN: missing dependency ${name}. ${install}`);
  process.exit(97);
}

export async function importAuditPackage(name) {
  let entry;
  try {
    entry = import.meta.resolve(name);
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND'
        || !error.message.startsWith(`Cannot find package '${name}'`)) throw error;
    missingDependency(name, 'Install from this checkout root: npm ci --include=dev');
  }
  // A package that resolves but is broken must still fail, including missing
  // internal/transitive modules, syntax errors and exceptions during loading.
  return import(entry);
}

export function requirePythonPackages(python, packages) {
  const probe = spawnSync(python, ['-c', `
import importlib, sys
for name in sys.argv[1:]:
    try:
        importlib.import_module(name)
    except ModuleNotFoundError as error:
        if error.name != name:
            raise
        print('AUDIT_MISSING_PACKAGE=' + name)
        sys.exit(97)
`, ...Object.keys(packages)], { encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT') {
    missingDependency('Python 3', `Install Python 3 and make ${python} available; then run ${python} -m pip install ${Object.values(packages).join(' ')}.`);
  }
  if (probe.error) throw probe.error;
  const missing = probe.stdout?.trim().match(/^AUDIT_MISSING_PACKAGE=(\w+)$/)?.[1];
  if (probe.status === 97 && Object.hasOwn(packages, missing)) {
    missingDependency(packages[missing], `Install for the audit interpreter: ${JSON.stringify(python)} -m pip install ${Object.values(packages).join(' ')}`);
  }
  if (probe.status !== 0) throw new Error(`Python dependency probe failed (${probe.status ?? probe.signal}): ${probe.stderr || probe.stdout}`);
}
