// R4-21: a remote iOS shell has no wrapped web build. Source-only proof.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function gradeNativeShellComment(config, pbxproj) {
  const comments = pbxproj.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) || [];
  const falseComments = comments.filter(comment => /\bWRAPPED_WEB_BUILD\s*=/.test(comment));
  return { green: !config.server?.url || falseComments.length === 0, falseComments };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync(new URL('../native/capacitor.config.json', import.meta.url), 'utf8'));
  // Optional pbxproj fixture path proves the command's exit status without
  // modifying a working native project. Config always comes from this checkout.
  const pbxproj = readFileSync(process.argv[2] || new URL('../native/ios/App/App.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
  const remote = { server: { url: 'https://example.invalid/' } };
  assert.ok(gradeNativeShellComment(remote, 'CURRENT_PROJECT_VERSION = 19; // Remote shell').green);
  for (const comment of ['// WRAPPED_WEB_BUILD=v413', '/* WRAPPED_WEB_BUILD = v413 */']) {
    assert.ok(!gradeNativeShellComment(remote, `CURRENT_PROJECT_VERSION = 19; ${comment}`).green);
  }
  assert.ok(gradeNativeShellComment({}, 'CURRENT_PROJECT_VERSION = 19; // WRAPPED_WEB_BUILD=v413').green);
  console.log('PASS CONTROL remote shell without marker GREEN, re-added line/block comments RED, bundled shell with marker GREEN');
  const result = gradeNativeShellComment(config, pbxproj);
  console.log(`${result.green ? 'GREEN' : 'RED'} iOS comment guard: server.url=${config.server?.url || '(unset)'}, WRAPPED_WEB_BUILD comments=${result.falseComments.length}`);
  if (!result.green) console.log('FAIL remote shell loads published main; no wrapped web version exists for this configuration.');
  process.exitCode = result.green ? 0 : 1;
}
