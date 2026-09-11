import assert from 'node:assert/strict';
import { auditOutputPath } from './audit-output.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { studioArtPath } from './studio-art-path.mjs';
import { BH_ITEMS, BH_SLOTS } from '../../data/boneheadz.js';
import { composeStudio } from '../../js/studio.js';

const directory = mkdtempSync(auditOutputPath(join(tmpdir(), 'studio art ')));
let failed = 0;
try {
  mkdirSync(auditOutputPath(join(directory, 'assets')));
  writeFileSync(auditOutputPath(join(directory, 'assets', 'probe.png')), 'asset probe');
  try {
    assert.equal(readFileSync(studioArtPath('assets/probe.png', pathToFileURL(directory + '/')), 'utf8'), 'asset probe');
    console.log('PASS asset resolution from a directory containing a space');
  } catch (error) { failed++; console.error('FAIL asset resolution:', error.message); }
  try {
    await assert.rejects(composeStudio({ outfit: Object.fromEntries(BH_SLOTS.filter(s => !['BG', 'C'].includes(s.code)).map(s => [s.code, s.default || BH_ITEMS.find(i => i.slot === s.code)?.id]).filter(([, id]) => id)) }, {}, {
      ready: async () => {},
      loadImage: async () => { throw Error('distinctive studio decode cause'); },
    }), error => /Download required art/.test(error.message) && /distinctive studio decode cause/.test(error.message));
    console.log('PASS friendly art failure preserves underlying cause');
  } catch (error) { failed++; console.error('FAIL cause preservation:', error.message); }
} finally { rmSync(auditOutputPath(directory), { recursive: true, force: true }); }
assert.equal(failed, 0, 'Studio path and diagnostic guards');
