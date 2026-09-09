import { auditOutputPath } from './lib/audit-output.mjs';
// Node-only lane D contract audit. The baseline is captured BEFORE editing pets.js.
// CONTROL: --source /tmp/pets-before.mjs runs these same guards on a throwaway
// copy of the original module. No mocks replace the missing production helpers.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { BH_ITEMS, bhAsset } from '../data/boneheadz.js';

const originalSHA = '21366bc0aaa833800ddc55fef37bac83947e2b1507f47f4207cee55263cb7570';
const baselineURL = new URL('./fixtures/pet-family-baseline.json', import.meta.url);
const sourceFlag = process.argv.indexOf('--source');
const sourceURL = sourceFlag < 0 ? new URL('../js/pets.js', import.meta.url)
  : pathToFileURL(resolve(process.argv[sourceFlag + 1]));
const pets = await import(sourceURL.href);
// In red runs the real engine must import the throwaway pets module too, or a
// mutated action cooldown would only be tested against the untouched engine kit.
const pitURL = new URL('../js/pit.js', import.meta.url);
const pitSource = sourceFlag < 0 ? null : readFileSync(pitURL, 'utf8').replace(
  /from '(\.[^']+)'/g, (_, path) => `from '${path === './pets.js' ? sourceURL.href : new URL(path, pitURL).href}'`);
const { makeFighter, createFight, applyPetAction, petActionsFor, endTurn } = await import(
  pitSource === null ? pitURL.href : 'data:text/javascript;base64,' + Buffer.from(pitSource).toString('base64'));
const encode = value => JSON.stringify(value, (_, v) => v instanceof Set ? [...v] : v);
const hash = value => createHash('sha256').update(value).digest('hex');
const species = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'CX'];
const options = [{}, { shiny: true }, { lineage: 3 }, { shiny: true, lineage: 7 }];
// Includes both sides and the exact boundary of Frenzy, rounding-sensitive owner
// stats, all species signatures, and every choice INCLUDING leaving a tier empty.
const contexts = [
  [{ d: { powerMult: 1, maxHp: 100 } }, { hp: 100, d: { maxHp: 100 } }],
  [{ d: { powerMult: 1.37, maxHp: 237 } }, { hp: 26, d: { maxHp: 100 } }],
  [{ d: { powerMult: 2.11, maxHp: 501 } }, { hp: 25, d: { maxHp: 100 } }],
  [{ d: { powerMult: 0.73, maxHp: 83 } }, { hp: 1, d: { maxHp: 100 } }],
];
function combinations(tree, level) {
  return tree.filter(row => row.tier <= level).reduce((all, row) =>
    all.flatMap(picks => [picks, ...row.opts.map(opt => [...picks, opt.id])]), [[]]);
}
function snapshot() {
  const rows = [];
  for (const id of species) for (let level = 1; level <= 10; level++) {
    const builds = createHash('sha256'), effects = createHash('sha256');
    let count = 0;
    for (const picks of combinations(pets.PET_TREES[pets.PET_ASSIGN[id]], level)) {
      for (const opts of options) {
        const pet = pets.buildBattlePet(id, level, picks, opts);
        builds.update(encode(pet) + '\n');
        for (const [self, foe] of contexts) effects.update(encode(pets.petAbilityEffect(pet, self, foe)) + '\n');
        count++;
      }
    }
    rows.push({ id, level, builds: count, effects: count * contexts.length,
      buildSHA256: builds.digest('hex'), effectSHA256: effects.digest('hex') });
  }
  return rows;
}

if (process.argv.includes('--capture-baseline')) {
  assert.equal(hash(readFileSync(sourceURL)), originalSHA, 'baseline must come from the unmodified source');
  const outputIndex = process.argv.indexOf('--baseline-output');
  assert.ok(outputIndex >= 0 && process.argv[outputIndex + 1], 'capture requires --baseline-output outside the checkout');
  const baselineOutput = auditOutputPath(resolve(process.argv[outputIndex + 1]));
  assert.ok(!existsSync(baselineOutput), 'never overwrite a frozen baseline');
  const rows = snapshot();
  writeFileSync(auditOutputPath(baselineOutput), JSON.stringify({ sourceSHA256: originalSHA,
    sourceCommit: '45b4989ba45624c1cbc05934116df8cd06c4b54b', rows }, null, 2) + '\n');
  console.log(`CAPTURED baseline: ${rows.reduce((n, r) => n + r.builds, 0)} builds, ${rows.reduce((n, r) => n + r.effects, 0)} effects`);
  process.exit(0);
}

// WAVE 2026-09-07: deliberate rebaseline after measured tuning. Keep the original
// fixture immutable. Counts/order remain frozen; only the new serialized output
// hashes are replaced here, inside this lane's owned audit. No recapture-at-run.
// T1 2026-09-07: deliberately ratified this rebaseline under Tom's 20% ruling.
// HEAD already includes the tuned C2 effect and these exact hashes. Skewer's
// engine-only recovery change does not alter serialized pet builds/effects.
// Re-measured all 13,552 builds / 54,208 effects; retain these frozen values,
// plus the original fixture and independent FAMILY-IDENTITY guard.
// T2 round 2 2026-09-08: freeze the measured health-lead curve and bite soft cap.
// Only effect hashes change. All build hashes, counts, the original fixture,
// and the independent family identity guard remain intact.
const historicalTunedHashes = [
  ["67e00ee6cf442efe1dd4b2c075943e57f488a5d5a1360b5b8d84d6a8f34cae43", "17930abf3bc69811cd831c1354dc6a43b861778b25826a06836c9be7695de862"], // C1 L1
  ["a1a8a176813eb0727cba4810a9df332363dfb64b8f094781e343f44f493a2f4d", "760e5f7e1cacad466968fc8ab557c09aa94e79f8035aad25f184effdc439901c"], // C1 L2
  ["23e8767d556afab85f1ea5552c990ebbfeea6b6c7e4b937d6be675a385f3c791", "760e5f7e1cacad466968fc8ab557c09aa94e79f8035aad25f184effdc439901c"], // C1 L3
  ["1d13470f1a106121f79bd2f4b03ecd9643ac8e0b39c535d17e9fd1dca07aa142", "60d1787581bed9b36e3cbcc48c1c098670745b273635d7524a8df83695ab1aa4"], // C1 L4
  ["d8eec3aec81d4b13757bd340d18bdbfb8068098f0b4089962bc5b120b2ce8578", "60d1787581bed9b36e3cbcc48c1c098670745b273635d7524a8df83695ab1aa4"], // C1 L5
  ["d3fa49b023dcfe15f5503a4ddf9309d23d1a843720d0de4fee05cc48f0c9561c", "54cd68533a4f282a27dd89b4f1cfa6b54b04f16858d9b796107f313f8cb2ccbe"], // C1 L6
  ["bbf2f202c4118ea086da0245756f857fb4a64f4514864643d35740aaf36d463c", "54cd68533a4f282a27dd89b4f1cfa6b54b04f16858d9b796107f313f8cb2ccbe"], // C1 L7
  ["8b2a29ee913ad4f697b79488824886d288fec4ae50537bc0eb85e5aeed5b8292", "96aaf593b97b8bb98d421e91517fe873f4a2327ca55b5ceb9d06cd848402c910"], // C1 L8
  ["01602a3650d65a971d749b8262da9881fc9726b77f608384686143d327df908c", "96aaf593b97b8bb98d421e91517fe873f4a2327ca55b5ceb9d06cd848402c910"], // C1 L9
  ["fadbe43b38d24697f174de34572c2aee58bef6d35378b844db658c25831371d4", "a4bdecc55a5c17c2a70afac811527a4434318f7aa1c90d35e5b7922412e93e3a"], // C1 L10
  ["e8680c12670aa41d2db11004af807d89a5a69171b453b5371ae9542bd777f634", "63fc477f69b5bf6e8951824e2048346e9b1cc69e3487c93fd5ccb9aea0297155"], // C2 L1
  ["f886bb8cd5c29cb93706d6661d9b59cb7169ae261c7d77f979b4f245eacb1517", "935e2731a02ad806b301bcd18d994a5c5030bedb30909bd4c4a33aec66350c7d"], // C2 L2
  ["7d836a392329b9735b7650b83e023c5be486496ee130bb69a26ab79727c707b9", "fab36903acefe153d84bbcca4a2c1f0f49f0bbdbb76265e7c40417b4ab412137"], // C2 L3
  ["08cc9293dbb4433ecc331d7bf809a8a519c4444d6ce4c31af48eb5ca46c3d52a", "6f22b8b6425b6ff7b81df0bc22c45f33b4d358f760d94c6df9435d4265f6ddbf"], // C2 L4
  ["3e48005d8a9a32aaf95f794e1c281c195b16552da14835d9ba40d1164e2636cf", "94552067ecd440ef32257ff5a1007c1f16b291beaea6a9c0477b22266fae2c9f"], // C2 L5
  ["dac870595e2cc6ecc3082825cadd52d3176f190a1574b78975983c803f8c5e48", "5e55b1db1fb829c1d632fc2b90639cc3c64c214e90157abdbf773248c819368e"], // C2 L6
  ["bb3fa6fb7f97c72b540bd167e5ec878a96a3cb1b3e4f09875155d5310775f9d6", "ca42d3fed471118fe3b0cdadc3b6abd6df0885b17dbd4ccf326f26c2619d957b"], // C2 L7
  ["9701aa04572c96192767a2e2060574f0ed1938a4c3e6866429c54970329407c1", "8830e5e41439f5fa532121e14dd317964676518c8dd838919011d960fef27af6"], // C2 L8
  ["6f9dc39fd16cc48d88136ef989a670e7769f21ef3236e953c773c66aaa8f7883", "3fe9f0fab1c810428f314b482c4e343e75de925758fa7f970c10ebc78f0c048c"], // C2 L9
  ["1032023b59463694f9eaa06ce18de11b32e383ab0b79ba9753cf0ca5b4c95c13", "b2bc4b8ca7c2962c625c9aea2e36bb17cbec7447b73e9e4f5acb9c3648606f9f"], // C2 L10
  ["987f324d9b2cd16ffacab2072d6e62ddcc5f1bc28ca590e7d489e908e9334357", "26a915f74e15cbbd752dd524d6bd2ca162e241cb076b819fa683b8ebef4e3470"], // C3 L1
  ["31cc4a01c1c2bc944be82a041fbf53424d74758505720987e63f23025d539527", "94f17f65fbfe8d7a2cb2c1989ae02d970e7e50e56a3964314ccfd8281200a099"], // C3 L2
  ["aff6e9b25a81f14d00c87a872563ecb4cfd7f1dd69a1407e254e747bf68be5c9", "b1f0876b23160726088f029b236d4bb1326e520e3c9c5ed56e6f01b511240fa5"], // C3 L3
  ["b0f2cd6e17c17a87714e440fe6e0fbd1816e8854befe0848d70ce05d00728a73", "9d8b8a602a2ef19b9d3f2d4f6fb81da10d3501b4da69d6f07a55e6e7d6bb74dc"], // C3 L4
  ["d7e1c6dad8541047222eaf342665d1354ecd597a2a3cc7461e777a09afdf2558", "d235c2b0875140601add845b302806a711a6940a36e98a867f8db05090644cf3"], // C3 L5
  ["6568ca9c44400028ab4832b9bb0f74a7fc0065021a0ded758e9c55f2117b915c", "f3c6b2d82ff2fd7a79f149026d70f0ff0bb758a16ee422582769490ed346c2d2"], // C3 L6
  ["fa41d00c0314374239787707093753f0716882a4c36b8e4fc01524354a0fcf46", "ca3b98260c562a8d3ffef3debe0a12744e872b18737228dbb0a10b766cdbcef7"], // C3 L7
  ["6e2c868c07068cb8026c2f2f60965f08789f72146da0df6b47d497c098436039", "3dac83a295f3e9d71c706dfd31ce44a140c21ed59ccb2f0f8deaab57036f5384"], // C3 L8
  ["2782cd5aff8dc571a7cffe27a506549772f62c86593937ce8f00cd463f44eac0", "02e8bdbdcd5ebfc347dd3494055bf0314c463b7bac80fa940d9bbb65fef5c240"], // C3 L9
  ["77a30077753d92b49a6b2b4f5ef75d97586dea9e5c935cb154f9f97b6bf5cc56", "262be5849bdc6d07f1ca65ec3569567a110dda0d485b2cfc7a747c6588e11cb0"], // C3 L10
  ["95cbc48ddb2b8616a93808bbab6e309f2c997bdd9af1f7a27bfda296ed6dfb96", "26a915f74e15cbbd752dd524d6bd2ca162e241cb076b819fa683b8ebef4e3470"], // C4 L1
  ["2a2e29270503d844ff7a7e17284d82d464201a22f9d23310089865bec8dc43ed", "94f17f65fbfe8d7a2cb2c1989ae02d970e7e50e56a3964314ccfd8281200a099"], // C4 L2
  ["9d6d9d735266c92a7cadef78b52dfdc7d10b3d5aed1f4117289557e610663fd4", "b1f0876b23160726088f029b236d4bb1326e520e3c9c5ed56e6f01b511240fa5"], // C4 L3
  ["53a11235fdb67a08ecc4bc4a4a07b110b6f8bac3692db8d29e1aedffe3194ca6", "9d8b8a602a2ef19b9d3f2d4f6fb81da10d3501b4da69d6f07a55e6e7d6bb74dc"], // C4 L4
  ["f013fa67e693792ee0b65276610dd9d07bbaf30c4cb540dce9b915f86a9aff5d", "d235c2b0875140601add845b302806a711a6940a36e98a867f8db05090644cf3"], // C4 L5
  ["a94043983a2ff779b2b2746e8c01cd5b88fb4a7af9b9eb5ecee26c9c6a1d6af3", "f3c6b2d82ff2fd7a79f149026d70f0ff0bb758a16ee422582769490ed346c2d2"], // C4 L6
  ["f7c5755c5395f0c75e3d34c8070c0da9fd7a909f65c9307124988dd41fec57d9", "ca3b98260c562a8d3ffef3debe0a12744e872b18737228dbb0a10b766cdbcef7"], // C4 L7
  ["7855855cce5eacd2ae81cc262840d44b2d5fc6452b5a4d14d187d2a9d501813c", "3dac83a295f3e9d71c706dfd31ce44a140c21ed59ccb2f0f8deaab57036f5384"], // C4 L8
  ["64d8797a5c7a28df65b29eba4ee58df6e592be514cb933426f817322b4c7d952", "02e8bdbdcd5ebfc347dd3494055bf0314c463b7bac80fa940d9bbb65fef5c240"], // C4 L9
  ["767cdfa4669cc40f781fac11a1fdeaf691c127961a916f39af7b01f8133ec063", "d35e5b13b86917f8f9a969d2f38950dafcb0213a16b56db862d4b1b546fbe8e8"], // C4 L10
  ["448273883273cbfd8367c868a9fd4e6d5519b466b6e21e3d5cdc57db3b7ffb1d", "63fc477f69b5bf6e8951824e2048346e9b1cc69e3487c93fd5ccb9aea0297155"], // C5 L1
  ["153b717bb86f6e7dd31727adfb8adf3ff6cbf933dedac9470ea576319468f020", "935e2731a02ad806b301bcd18d994a5c5030bedb30909bd4c4a33aec66350c7d"], // C5 L2
  ["bf7ea7c2b434b3b9ca76f53ac272f4e886403232fa92f9b19debafd387eef90f", "fab36903acefe153d84bbcca4a2c1f0f49f0bbdbb76265e7c40417b4ab412137"], // C5 L3
  ["b9df1796c4b7a7a6ff4fe85075f36b1b9fd1f1a7544539507beb588c425b91d6", "6f22b8b6425b6ff7b81df0bc22c45f33b4d358f760d94c6df9435d4265f6ddbf"], // C5 L4
  ["36a345a5886f8a74717ab3d2ff7a92e41d31ee572ef595a9e6528cb50dad8300", "94552067ecd440ef32257ff5a1007c1f16b291beaea6a9c0477b22266fae2c9f"], // C5 L5
  ["ee379490c564df31b8a8adffaf01a4a94d5f8d180e5efa13bdaed855e6f28b2e", "5e55b1db1fb829c1d632fc2b90639cc3c64c214e90157abdbf773248c819368e"], // C5 L6
  ["a160455f86c8723efd8ca79db4a24423f9e7738e7abbc8d933d7b4610bf62571", "ca42d3fed471118fe3b0cdadc3b6abd6df0885b17dbd4ccf326f26c2619d957b"], // C5 L7
  ["e78bebf3729e6257b74e4f4d0272f7efac12a401e32628b2a3d702499e16715d", "8830e5e41439f5fa532121e14dd317964676518c8dd838919011d960fef27af6"], // C5 L8
  ["d6f68ba6ec235c25c83e4efae16444e755fb6cdab8cb3f5e8c62619020cee696", "3fe9f0fab1c810428f314b482c4e343e75de925758fa7f970c10ebc78f0c048c"], // C5 L9
  ["e2caeacac3b20c558941141414b748014e8c7becf3c43c464952d288f1b8de58", "4f9235a3ed59658804dcde646149ba10d270f773e9b1a1f4b6ad863423baf327"], // C5 L10
  ["83e039a257819e5cdb4e38c0327e577cd1affb1c600c641f63304b504e49762a", "26a915f74e15cbbd752dd524d6bd2ca162e241cb076b819fa683b8ebef4e3470"], // C6 L1
  ["39d5c154e336098f5a5a125f87a7f5b0c9db01dc11f3c02e11684bad6745128c", "94f17f65fbfe8d7a2cb2c1989ae02d970e7e50e56a3964314ccfd8281200a099"], // C6 L2
  ["2aaa525b5c5fec2b2084cdefe75e6e36ca0c6d05f9bffb02df48843fe2d29ed4", "b1f0876b23160726088f029b236d4bb1326e520e3c9c5ed56e6f01b511240fa5"], // C6 L3
  ["f41729a8cff697465fad58a013fd8a75521f2d8c85b4a4f1b6d3e74a3d65f78d", "9d8b8a602a2ef19b9d3f2d4f6fb81da10d3501b4da69d6f07a55e6e7d6bb74dc"], // C6 L4
  ["6b7db7f66d254671a8c30058496ad96374f328d2758ef8abdb928e17b7fc7d47", "d235c2b0875140601add845b302806a711a6940a36e98a867f8db05090644cf3"], // C6 L5
  ["03df0eff0a0132fc321cd654ff635882362cf1f01a339de5dcc9ea6274dbbcfd", "f3c6b2d82ff2fd7a79f149026d70f0ff0bb758a16ee422582769490ed346c2d2"], // C6 L6
  ["c52b51d3c8bbf5ef336b9110ea042763c30c4bfade8fcde7718bf8ce2075a41e", "ca3b98260c562a8d3ffef3debe0a12744e872b18737228dbb0a10b766cdbcef7"], // C6 L7
  ["68f5a97896ad19d5255a4d9bbb251d1331a39d857ede5f23e3f0dde714921aa9", "3dac83a295f3e9d71c706dfd31ce44a140c21ed59ccb2f0f8deaab57036f5384"], // C6 L8
  ["86c2bdbdb9063ba7187eab056b9e178790a185be5a4a48a7880776e2172b919a", "02e8bdbdcd5ebfc347dd3494055bf0314c463b7bac80fa940d9bbb65fef5c240"], // C6 L9
  ["c6f69fdd917ff59c2cc037b46fc8c680feb59712d0de90cf11e2b0809e3000f0", "eb4b1f30438811708116d5fa7d050442b273b0aeb74a3d13cf51254147b904ed"], // C6 L10
  ["4392ca457625d4debb78a56d4f6924c95fe12b337c451776f1b5782f5e117181", "26a915f74e15cbbd752dd524d6bd2ca162e241cb076b819fa683b8ebef4e3470"], // CX L1
  ["255ef146d448d8f434118632a5673912ab6a564795a827b1f9716ae07033a383", "94f17f65fbfe8d7a2cb2c1989ae02d970e7e50e56a3964314ccfd8281200a099"], // CX L2
  ["75156ee9b7427ae2c8725d424847c021eb9e9b5672ccba37271c04907b2e3895", "b1f0876b23160726088f029b236d4bb1326e520e3c9c5ed56e6f01b511240fa5"], // CX L3
  ["9e7bc0f92a27bc2a3e4abad1428cb9f29a586e3fec5f5ae8abc41cfe0607d8ce", "9d8b8a602a2ef19b9d3f2d4f6fb81da10d3501b4da69d6f07a55e6e7d6bb74dc"], // CX L4
  ["5ace3db75d2a48bae554c0c09646e76e946f4ab151daab8af2cc357ab4d05d54", "d235c2b0875140601add845b302806a711a6940a36e98a867f8db05090644cf3"], // CX L5
  ["8a3d48b07fd6e0b94fdcc39de42379f2a5b1b1c916b3b4a82f0807b3469c38b1", "f3c6b2d82ff2fd7a79f149026d70f0ff0bb758a16ee422582769490ed346c2d2"], // CX L6
  ["9b1a2e1d5e94799a9e0cdc62e386fabdd4cc69d7bad37540fa7a8864abc6a22a", "ca3b98260c562a8d3ffef3debe0a12744e872b18737228dbb0a10b766cdbcef7"], // CX L7
  ["ef14542195e86448d7647ca2ed0c8264880b173382bb5095626ce79e82bfaaac", "3dac83a295f3e9d71c706dfd31ce44a140c21ed59ccb2f0f8deaab57036f5384"], // CX L8
  ["53d7a40f6ba05dcd0fa23a9fee14d7a66e3a91350e9834297e85c09766afce0d", "02e8bdbdcd5ebfc347dd3494055bf0314c463b7bac80fa940d9bbb65fef5c240"], // CX L9
  ["fdc5fac769a080f78c28d5afa2dd908807ea493eeef389249aaf3ee36c7694fc", "a2382b625707698ceafb8a8bb0c493023b3e0a18a8ace08e1860635af41b59e6"], // CX L10
];

// vNEXT: upward stat parity changes serialized intrinsic stats only.
// All 54,208 effect hashes still use the historical expectations above.
// Freeze the 70 new build hashes, preserving original fixture and identities.
const parityBuildHashes = [
  "2ead89ae9f75c97c15912b7c1532c28cc04fdd60936437fd3f42ddbe01d01c1c", // C1 L1
  "c940a0f203a80f81b4cf6f2835f0289305e0753e70489e1dae98bfeb7395dab0", // C1 L2
  "7867e88066249af88aa5e7feef36e581d088e9983baca3d214b639a35596f29d", // C1 L3
  "81e06602abbf75710608e2152db9e2efa0642a756aa52cebd36288f2d0e61ca3", // C1 L4
  "ae163cc1ac8109161db3155ba8c7a19a3cbf886d3a27f083b025697ff592c7c4", // C1 L5
  "28cc43aec459c80ff0581927838dad03a2500261bcb1b0c6d86e3c7ca7283da3", // C1 L6
  "4fb3cb864161579eafb8d78b5bf3c5cba4efed0768ab5d429e0e35533a4316b5", // C1 L7
  "e637ddffc8065c50080a646ed4c610b029904b23808965f70ec86e2587ab3601", // C1 L8
  "d488987738d3903e282341723cccf9d63d8f282d2831db0583bdd33ed42c52b6", // C1 L9
  "be77c14a6e2188178bab15f1e7cd9e2d9dee4b40285ade73142cfdd4b1613273", // C1 L10
  "03b9ef2679629710404b08c4db50c216fa7292328c8e8235825db995a548d35c", // C2 L1
  "f0afd16575e75c972d23d518dbe6431c1b0737388e641a38dbcf76466e8432f6", // C2 L2
  "830d0bb78aa309dcb2196110efb4dcd79e225c6f9cd5a55d62acc5073decdfda", // C2 L3
  "de46322ef5fc6f87dae8da092918e322ece3793b725f8b3cf05e7c7858291a72", // C2 L4
  "b39334550b91617c3710a5ede4f01fa5ab5364a07bec68c50558affa0b9566eb", // C2 L5
  "b3bb4eca578030a2089b69100284b785e1b912945d2671d5f47ff731c31525f5", // C2 L6
  "2d4b7f4c88518f966e7dfbb778f6d2ee1146ce854f19f860faa604eea7bcb71e", // C2 L7
  "7ab0de568d1987ca6ca69751108f04a9dc914882603f17cd43334fde5e74c574", // C2 L8
  "94c647dc754a93354ab56fdb1cecc34b9ff72860bfbec35ddedf56d0c1757b87", // C2 L9
  "ffc68dcb09b7ac23cd2dc4212ca99cc58cc2e1d82593cc96b1dedac3937d5047", // C2 L10
  "1e9dd37f51d301d6923726a0d4dbd0b2a3fc3ac2d9a57ac7a5a9fa03ea847d1f", // C3 L1
  "dd51a8c2265dbe866db03c73cc9b91e9bf93a05a4f6fb227a526201c0173f250", // C3 L2
  "61078ffcb10fbbe06718471af81faa467490a54b3aecc8922a0d5b5be2bea275", // C3 L3
  "ea23a5deecb19d3f42d36f731622ebe4a25566d4750e8930b67a2c2716658d8e", // C3 L4
  "804217aa32c8ed7140c72e3523d2a52149eaad2be119841ac16828e528f774d0", // C3 L5
  "aa16db89c2de0af68e860800a7f8d6e727c0783a2d54ca2801d839512f13a004", // C3 L6
  "b500df15e7323167f559a202357cf78a7e8018693a52682c4200e41220578d10", // C3 L7
  "c0fb302be569530c2d629c6975d0f725ef45ab5a15b7d58a2e32be1e372d8202", // C3 L8
  "41587f7bf131d6a4d371821e733084a3fdeb185a608946a398d1dfad901c8f9e", // C3 L9
  "7914b0318805b4a3db8fda646177e12ac3c74cff0ce270f10f55a8698158ba41", // C3 L10
  "cd8cc1837a51d1876f666959358555468cded97b8df9eebe658b23f1d8136f24", // C4 L1
  "45cefa869cfc0945af005689eb16e3a44f7b5e783a8a22c164a32f6e6bc6ffe9", // C4 L2
  "0be3a94397117f60ed7b8509099af5869fa8ca850009680b818a2f44cd5a907a", // C4 L3
  "033119ebb73646382118c032010968ac675758bb12906ef01c7ad449756fb4a8", // C4 L4
  "fd9b1a41ff194e00ca30c8e6f457f270b623626c38b2852177cebebebe5a4448", // C4 L5
  "c1fcf5e95233fb74d487aaa17575b48883b3857c17f33c4c5fbf5129c53b63dc", // C4 L6
  "b900b14795a4ec0a15b2c4489a6422188e0d6c1e582662e02038c4227472f822", // C4 L7
  "f2a0632522504f5f3c363dbd47d253ff9690c010bb9626ccada15dea74f9e945", // C4 L8
  "3d9b434722ea22f7b642d7f8836522c29b541ca7292cc31ff676a587eb716519", // C4 L9
  "023dbb4b556bf8149ab24b57d1275f34cdd9b5213d5676397f845e84b3a4b585", // C4 L10
  "bebdb5b55b986c3a6bf4298a264adf94454ad7c35defe6630c086b635f57fa18", // C5 L1
  "6dfbd5bc6d7dd533aaeae171064699dc2a500d5786d16ecce7ef5a8beba5d170", // C5 L2
  "cb334ef1f9bea170316db2247c03cee9c05a7dd83eee78c6670455bd22c36d9c", // C5 L3
  "20655187fb8184fd2a4142628f3c158d1a3b5afc91912edc3314c7779ba50975", // C5 L4
  "79f7e4153da69bb28ef281df8a29dd827ac842e3d35d408ecd2987d6085c5f8e", // C5 L5
  "5729c7f6af3c411efa5d065748f7bba87a1f9a957d03f52fdec7ca5218860831", // C5 L6
  "d09f515e5a240373ff86a076a06b135930705feb7ec3a9e9578265b42be11c34", // C5 L7
  "6e1d6b990f305d709ee64a8a2472f2334a146a9f3e82f1fd4985087acf34addf", // C5 L8
  "8224c0a82bf9226c73c5795142f37eb3e58af288de13362372af9a6aae347c4e", // C5 L9
  "04cca42fc718170b83581cbebf93e9ebc21b20093f3a4f380e5e34f4cfe03963", // C5 L10
  "fd7052eb8a3aa24c91f7b3c65b0a32dd2d34c16d077878780cdf93662ef95f6f", // C6 L1
  "9d60527c226fea5ac85c5a68a14a97d4d03ccc4edcea01c4cb29e5227b04a013", // C6 L2
  "78d44619e2f9b4bc270e89be3791554df1b4c272d60ec5288f141c47d1ba3af4", // C6 L3
  "af2225a508ac56e3b6cdb33717a7b60f29d0b376e1d1083fce99cc24b0483fde", // C6 L4
  "fc8c14a9b4b43facfa07468dda409b045b82df922fb8701bd8a503f88c12162f", // C6 L5
  "d7459d2cdd2261b7c0bef877af92640c6909d740f806c2749220b67c8e5e3451", // C6 L6
  "19b7546b8530f9707d99f349772e791b362f79f1d08d9a9208d576c632d70d18", // C6 L7
  "8b4ec0b8cb99d8610a9d2c08e8c62fce5ddca57852b0636e337c8797c1df9f4c", // C6 L8
  "e9acab41a42df7fa77b49b9b2453d0f5a0cb8f00a29b37aa58b6c06298c51db1", // C6 L9
  "5194ff81a1e555cb4b0abd37b8e06f374491818cf2d6855add7aae0538f6d510", // C6 L10
  "f05b4c9a216d5044e56c25ef9c5556ab3de79fe62d5272cfef6dec8d2c3dc286", // CX L1
  "4100bfc4c9429c347372a58bb3808265fa110d1a11387c67e32563b33d675ca1", // CX L2
  "3d9fa4797da6800be7c657563a67ecacf68ea40193d853f444a2478561d7a2bf", // CX L3
  "71740a38eb9aaecd05d04a90230694d8b35d0cef163d5ad974e85ba4df0532a9", // CX L4
  "20963e7e0c36aa73fcd3ab937f2927c8dded145f74f98f694a3a104dbf1b085a", // CX L5
  "55f7d7e2ea85de8e9643b70fb49a61f9699a65f1390fefd3482898b5cafcf9ba", // CX L6
  "7ee073e82bb341dea6d3399e0e02ac8a6a7236599812b106a591d0ec0074c6b9", // CX L7
  "b14499de986c595798d7e63c35715a7fb5d075be5c8e8788b875653d1612feb1", // CX L8
  "bb02c36751692e5c023e0da234d2106886c61adf86887ed4605f9da260892208", // CX L9
  "673184fce0ead12bd224cf61dd3dd733ba3dc1b8b1004f61a8fde0832d9667bf", // CX L10
];

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function dummy(fn, actions = false) {
  pets.PET_FAMILIES.dummy = { ...pets.PET_FAMILIES.hound, key: 'dummy' };
  pets.PET_TREES.dummy = pets.PET_TREES.hound;
  pets.PET_ASSIGN.C3 = 'dummy';
  if (actions) pets.PET_ACTIONS.dummy = pets.PET_ACTIONS.hound;
  try { fn(); } finally {
    pets.PET_ASSIGN.C3 = 'hound';
    delete pets.PET_FAMILIES.dummy;
    delete pets.PET_TREES.dummy;
    delete pets.PET_ACTIONS.dummy;
  }
}
const namedDummy = e => /dummy/.test(e.message) && /family/i.test(e.message);
test('FAMILY-ACTIONS refuses a registered row without actions', () => dummy(() => {
  let actual;
  try { actual = pets.petActionMeta('dummy'); } catch (e) { assert.ok(namedDummy(e)); return; }
  assert.fail(`dummy silently received ${actual[0].name} (Hound actions)`);
}));
test('FAMILY-ABILITY refuses a registered row with actions but no dispatch', () => dummy(() => {
  let actual;
  try { actual = pets.petAbilityEffect({ family: 'dummy', level: 1, picks: new Set() }, ...contexts[0]); }
  catch (e) { assert.ok(namedDummy(e)); return; }
  assert.fail(`dummy silently executed ${actual.kind} (Imp effect)`);
}, true));
test('FAMILY-BUILD refuses an incomplete family before a real fight', () => dummy(() => {
  assert.throws(() => pets.buildBattlePet('C3'), namedDummy);
}, true));
test('FAMILY-MISSING an existing dispatch cannot hide missing actions', () => {
  const actions = pets.PET_ACTIONS.hound;
  delete pets.PET_ACTIONS.hound;
  try {
    assert.throws(() => pets.petActionMeta('hound'), /pet family: hound/);
    assert.throws(() => pets.petAbilityEffect({ family: 'hound', level: 1, picks: new Set() }, ...contexts[0]), /pet family: hound/);
    assert.throws(() => pets.buildBattlePet('C3'), /pet family: hound/);
    assert.equal(pets.isKnownPet('C3'), false);
  } finally { pets.PET_ACTIONS.hound = actions; }
});
test('KNOWN accepts renderable combat species and rejects unknown/prototype ids', () => {
  assert.equal(typeof pets.isKnownPet, 'function', 'isKnownPet export is missing');
  assert.deepEqual(BH_ITEMS.filter(i => i.slot === 'C').map(i => i.id).sort(), [...species].sort());
  for (const id of species) {
    assert.equal(pets.isKnownPet(id), true, id);
    const item = BH_ITEMS.find(i => i.id === id);
    assert.ok(existsSync(new URL('../' + bhAsset(item), import.meta.url)), `${id} has renderable art`);
    assert.ok(pets.buildBattlePet(id), `${id} can enter combat`);
  }
  for (const id of ['bogus', 'constructor', '__proto__', 'toString', '', null, undefined, 3, {}]) {
    assert.equal(pets.isKnownPet(id), false);
  }
  dummy(() => assert.equal(pets.isKnownPet('C3'), false), true);
  pets.PET_ASSIGN.C999 = 'hound';
  pets.PET_STATS.C999 = pets.PET_STATS.C3;
  try { assert.equal(pets.isKnownPet('C999'), false, 'combat-only species has no renderable identity'); }
  finally { delete pets.PET_ASSIGN.C999; delete pets.PET_STATS.C999; }
});
test('PICKS-TREE drops an out-of-family pick', () => {
  assert.equal(typeof pets.legalPicks, 'function', 'legalPicks export is missing; out-of-tree picks have no shared guard');
  assert.deepEqual(pets.legalPicks('C3', 10, ['w-mend', 'h-rabid']), ['h-rabid']);
});
test('PICKS-LEVEL drops an above-level pick', () => {
  assert.equal(typeof pets.legalPicks, 'function', 'legalPicks export is missing; above-level picks have no shared guard');
  assert.deepEqual(pets.legalPicks('C3', 2, ['h-savage', 'h-rabid']), ['h-rabid']);
});
test('PICKS-TIER drops the second pick in a tier', () => {
  assert.equal(typeof pets.legalPicks, 'function', 'legalPicks export is missing; competing tier picks have no shared guard');
  const picks = ['h-venom', 'h-bloodscent', 'h-rabid', 'h-venom'];
  assert.deepEqual(pets.legalPicks('C3', 4, picks), ['h-venom', 'h-bloodscent']);
  assert.deepEqual(picks, ['h-venom', 'h-bloodscent', 'h-rabid', 'h-venom'], 'input stays unchanged');
});
test('PICKS-SUBSET accepts every legal combination, preserves order, never throws on invalid data', () => {
  for (const id of species) for (let level = 1; level <= 10; level++) {
    for (const picks of combinations(pets.PET_TREES[pets.PET_ASSIGN[id]], level)) {
      assert.deepEqual(pets.legalPicks(id, level, [...picks].reverse()), [...picks].reverse());
    }
  }
  for (const picks of [null, undefined, {}, 'h-rabid', 3]) assert.deepEqual(pets.legalPicks('C3', 10, picks), []);
  for (const level of [null, undefined, NaN, Infinity, {}, 'bad']) assert.deepEqual(pets.legalPicks('C3', level, ['h-rabid']), []);
  assert.deepEqual(pets.legalPicks('unknown', 10, ['h-rabid']), []);
  assert.deepEqual(pets.legalPicks('C3', 10, [null, {}, 'unknown']), []);
  dummy(() => assert.deepEqual(pets.legalPicks('C3', 10, ['h-rabid']), []), true);
});
test('TIERS derives new unlocks from the applicable family tree', () => {
  pets.PET_TREES.warden.push({ tier: 3, opts: [{ id: 'w-dummy' }] });
  try {
    assert.deepEqual(pets.unlockedTiers(3, 'C2'), [2, 3], 'new Warden tier must unlock and celebrate');
    assert.deepEqual(pets.unlockedTiers(3, 'C3'), [2], 'Hound must not inherit Warden tiers');
    assert.deepEqual(pets.legalPicks('C2', 3, ['w-dummy']), ['w-dummy']);
    assert.deepEqual(pets.legalPicks('C2', 2, ['w-dummy']), []);
  } finally { pets.PET_TREES.warden.pop(); }
});
test('COOLDOWN family metadata agrees with the effective special action', () => {
  for (const family of Object.keys(pets.PET_FAMILIES)) {
    const special = pets.petActionMeta(family).find(a => a.kind === 'special');
    assert.equal(special.cd, family === 'hound' ? 2 : 4, `${family} tuned cooldown`);
    assert.equal(pets.PET_FAMILIES[family].cooldown, special.cd, `${family} has conflicting cooldown metadata`);
  }
});
test('COOLDOWN-ENGINE specials reopen after the full family recovery', () => {
  const stats = { power: 30, marrow: 100, wind: 40, reflex: 30, hype: 0 };
  for (const [id, action, picks] of [['C3', 'bite', ['h-pack']], ['C2', 'shield', []], ['C1', 'hex', []]]) {
    const fight = createFight({
      player: makeFighter({ name: 'Owner', stats, pet: pets.buildBattlePet(id, 6, picks) }),
      foe: makeFighter({ name: 'Foe', stats }), seed: 7,
    });
    assert.ok(petActionsFor(fight).find(a => a.id === action).enabled);
    assert.ok(applyPetAction(fight, action).length > 0, `${id} actually acted`);
    const recovery = id === 'C3' ? 2 : 4;
    assert.equal(fight.p.pet.specialCd, recovery, `${id} timer, including Pack Tactics`);
    assert.ok(!petActionsFor(fight).find(a => a.id === action).enabled);
    for (let turn = 1; turn <= recovery; turn++) {
      endTurn(fight); endTurn(fight);
      assert.equal(fight.p.pet.specialCd, recovery - turn);
      assert.equal(petActionsFor(fight).find(a => a.id === action).enabled, turn === recovery);
    }
  }
});
test('FAMILY-IDENTITY assignments, roles, passives, talent IDs/unlocks and Signature identities never drift', () => {
  const identity = {
    assign: pets.PET_ASSIGN,
    families: Object.values(pets.PET_FAMILIES).map(({ key, name, role, passive }) => ({ key, name, role, passive })),
    trees: Object.fromEntries(Object.entries(pets.PET_TREES).map(([key, rows]) =>
      [key, rows.map(t => [t.tier, t.opts.map(o => [o.id, o.name])])])),
    signatures: Object.entries(pets.PET_SIGNATURE).map(([id, sig]) => [id, sig.id, sig.name]),
  };
  // Captured from this checkout's original pets.js before any WAVE changes.
  assert.equal(hash(JSON.stringify(identity)), '207c6ed91d984441179c1e942df3d9bf685ad03f194ddbb31ff67b60fe36dbe2');
});
test('NO-DRIFT parity builds and unchanged WAVE effects match frozen expectations', () => {
  const baseline = JSON.parse(readFileSync(baselineURL));
  assert.equal(baseline.sourceSHA256, originalSHA);
  const actual = snapshot();
  assert.equal(actual.length, 70, 'all 7 species at all 10 levels');
  assert.equal(parityBuildHashes.length, baseline.rows.length);
  assert.equal(historicalTunedHashes.length, baseline.rows.length);
  for (let i = 0; i < actual.length; i++) assert.deepEqual(actual[i], {
    ...baseline.rows[i], buildSHA256: parityBuildHashes[i], effectSHA256: historicalTunedHashes[i][1],
  }, `${actual[i].id} level ${actual[i].level}`);
  console.log(`  ${actual.reduce((n, r) => n + r.builds, 0)} builds and ${actual.reduce((n, r) => n + r.effects, 0)} effects byte-identical`);
});
console.log(`pet-family-audit: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
