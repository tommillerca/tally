import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { auditOutputPath } from './audit-output.mjs';

export function checkAuditDependencies() {
  const temp = mkdtempSync(auditOutputPath(join(tmpdir(), 'audit-dependencies-')));
  const put = (file, text) => writeFileSync(auditOutputPath(join(temp, file)), text);
  const run = source => spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: temp, encoding: 'utf8', timeout: 5000,
  });
  const load = "import {importAuditPackage} from './audit-dependencies.mjs'; await importAuditPackage('audit-dependency-fixture');";
  const output = r => `${r.stdout || ''}${r.stderr || ''}`;
  try {
    copyFileSync(new URL('./audit-dependencies.mjs', import.meta.url), auditOutputPath(join(temp, 'audit-dependencies.mjs')));
    const absent = run(load);
    assert.equal(absent.status, 97, output(absent));
    assert.match(output(absent), /UNPRV audit-dependency-fixture.*DID NOT RUN: missing dependency audit-dependency-fixture.*npm ci --include=dev/);

    // Exercise the gate's actual classifier, without starting its server.
    const gate = readFileSync(new URL('../release-gate.mjs', import.meta.url), 'utf8');
    const classify = vm.runInNewContext(`${gate.match(/^const UNPROVEN = .*;$/m)[0]}\n${gate.match(/^const verdict = .*;$/m)[0]}\nverdict`);
    assert.equal(classify({ code: absent.status }).trim(), 'UNPRV');
    assert.equal(classify({ code: 1 }).trim(), 'FAIL');
    assert.equal(classify({ code: 0 }).trim(), 'PASS');
    const reasons = vm.runInNewContext(`(${gate.match(/function unprovenLines\(out\) \{[\s\S]*?\n\}/)[0]})`)(output(absent));
    assert.equal(reasons.rows, 1);
    assert.match(reasons.why[0], /missing dependency audit-dependency-fixture.*npm ci --include=dev/);

    mkdirSync(auditOutputPath(join(temp, 'node_modules/audit-dependency-fixture')), { recursive: true });
    put('node_modules/audit-dependency-fixture/package.json', '{"type":"module","main":"index.js"}');
    put('node_modules/audit-dependency-fixture/index.js', 'export const value = 42;');
    assert.equal(run(load).status, 0, 'installed package loads');
    for (const source of ['throw new Error("broken installed package");', 'export const = ;',
      'import "./missing-internal.js";', 'import "audit-missing-transitive-fixture";']) {
      put('node_modules/audit-dependency-fixture/index.js', source);
      const broken = run(load);
      assert.equal(broken.status, 1, output(broken));
      assert.doesNotMatch(output(broken), /UNPRV/, 'broken packages remain RED');
    }
    rmSync(auditOutputPath(join(temp, 'node_modules/audit-dependency-fixture/index.js')));
    assert.equal(run(load).status, 1, 'missing installed entry point remains RED');

    // Each real store entry must stop before emitting false assertion failures.
    mkdirSync(auditOutputPath(join(temp, 'tests/lib')), { recursive: true });
    for (const file of ['audit-dependencies.mjs', 'audit-output.mjs']) {
      copyFileSync(new URL(file, import.meta.url), auditOutputPath(join(temp, 'tests/lib', file)));
    }
    for (const file of ['store-copy-scan.mjs', 'store-copy-lint.mjs', 'store-runtime-audit.mjs',
      'submission-build-audit.mjs', 'submission-preflight-audit.mjs']) {
      copyFileSync(new URL('../' + file, import.meta.url), auditOutputPath(join(temp, 'tests', file)));
      if (file === 'store-copy-scan.mjs') continue;
      const result = run(`await import('./tests/${file}');`);
      assert.equal(result.status, 97, `${file}: ${output(result)}`);
      assert.match(output(result), /UNPRV esprima.*DID NOT RUN: missing dependency esprima.*npm ci --include=dev/);
      assert.doesNotMatch(output(result), /^(PASS|FAIL) /m);
    }

    // A local executable stands in for the Python probe, keeping unit tests
    // independent of Python. Real Python absence/presence is separate proof.
    const python = join(temp, 'python-probe');
    const probe = `import {requirePythonPackages} from './audit-dependencies.mjs'; requirePythonPackages(${JSON.stringify(python)}, {PIL:'Pillow',numpy:'numpy'});`;
    const setProbe = text => writeFileSync(auditOutputPath(python), `#!${process.execPath}\n${text}`, { mode: 0o755 });
    assert.equal(run(probe).status, 97, 'absent interpreter is UNPROVEN');
    for (const [module, pkg] of [['PIL', 'Pillow'], ['numpy', 'numpy']]) {
      setProbe(`console.log('AUDIT_MISSING_PACKAGE=${module}'); process.exit(97);`);
      const missing = run(probe);
      assert.equal(missing.status, 97, output(missing));
      assert.ok(output(missing).includes(`missing dependency ${pkg}`));
      assert.match(output(missing), /-m pip install Pillow numpy/);
    }
    setProbe('process.exit(0);');
    assert.equal(run(probe).status, 0, 'available Python packages run');
    for (const code of [1, 97]) {
      setProbe(`console.error('broken installed Python package'); process.exit(${code});`);
      const broken = run(probe);
      assert.equal(broken.status, 1, 'unrecognized Python errors remain RED');
      assert.doesNotMatch(output(broken), /UNPRV/);
    }
  } finally {
    rmSync(auditOutputPath(temp), { recursive: true, force: true });
  }
}
