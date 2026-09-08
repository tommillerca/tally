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
// T2 2026-09-08: deliberately freeze the measured 0.5 damage budget.
// Only effect hashes change. All build hashes, counts, the original fixture,
// and the independent family identity guard remain intact.
const tunedHashes = [
  ["67e00ee6cf442efe1dd4b2c075943e57f488a5d5a1360b5b8d84d6a8f34cae43", "17930abf3bc69811cd831c1354dc6a43b861778b25826a06836c9be7695de862"], // C1 L1
  ["a1a8a176813eb0727cba4810a9df332363dfb64b8f094781e343f44f493a2f4d", "760e5f7e1cacad466968fc8ab557c09aa94e79f8035aad25f184effdc439901c"], // C1 L2
  ["23e8767d556afab85f1ea5552c990ebbfeea6b6c7e4b937d6be675a385f3c791", "760e5f7e1cacad466968fc8ab557c09aa94e79f8035aad25f184effdc439901c"], // C1 L3
  ["1d13470f1a106121f79bd2f4b03ecd9643ac8e0b39c535d17e9fd1dca07aa142", "60d1787581bed9b36e3cbcc48c1c098670745b273635d7524a8df83695ab1aa4"], // C1 L4
  ["d8eec3aec81d4b13757bd340d18bdbfb8068098f0b4089962bc5b120b2ce8578", "60d1787581bed9b36e3cbcc48c1c098670745b273635d7524a8df83695ab1aa4"], // C1 L5
  ["d3fa49b023dcfe15f5503a4ddf9309d23d1a843720d0de4fee05cc48f0c9561c", "54cd68533a4f282a27dd89b4f1cfa6b54b04f16858d9b796107f313f8cb2ccbe"], // C1 L6
  ["bbf2f202c4118ea086da0245756f857fb4a64f4514864643d35740aaf36d463c", "54cd68533a4f282a27dd89b4f1cfa6b54b04f16858d9b796107f313f8cb2ccbe"], // C1 L7
  ["8b2a29ee913ad4f697b79488824886d288fec4ae50537bc0eb85e5aeed5b8292", "96aaf593b97b8bb98d421e91517fe873f4a2327ca55b5ceb9d06cd848402c910"], // C1 L8
  ["01602a3650d65a971d749b8262da9881fc9726b77f608384686143d327df908c", "96aaf593b97b8bb98d421e91517fe873f4a2327ca55b5ceb9d06cd848402c910"], // C1 L9
  ["fadbe43b38d24697f174de34572c2aee58bef6d35378b844db658c25831371d4", "94da0f546531fb4e506e6f0e5d82c1136f0af5b64270a04fc92882f4774b9f52"], // C1 L10
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
  ["987f324d9b2cd16ffacab2072d6e62ddcc5f1bc28ca590e7d489e908e9334357", "0d2d42d6f8d8e0ac1cd04978322c6bcb3624ef9cbd95451df2c2d33fcca23075"], // C3 L1
  ["31cc4a01c1c2bc944be82a041fbf53424d74758505720987e63f23025d539527", "d6c947db22cef6080ab4494c0a6bdc6786a362241d3695ef1ebe5857fcd1207b"], // C3 L2
  ["aff6e9b25a81f14d00c87a872563ecb4cfd7f1dd69a1407e254e747bf68be5c9", "9dfac0056e108c3215fcde928f713e758fbd363d88de624a6eb704e1411acb08"], // C3 L3
  ["b0f2cd6e17c17a87714e440fe6e0fbd1816e8854befe0848d70ce05d00728a73", "fd50d23758b6ad9cdb8f6216a3257f8f05f4c4ea9564134c7f21934bd1ab5bc0"], // C3 L4
  ["d7e1c6dad8541047222eaf342665d1354ecd597a2a3cc7461e777a09afdf2558", "baf1b36e5ed0cb00e6bf311c16ab1e846940cbfc6adab4889c903e46fb9f183c"], // C3 L5
  ["6568ca9c44400028ab4832b9bb0f74a7fc0065021a0ded758e9c55f2117b915c", "87009dfad3d7a695bf568450795da6aca78055f6b567206806716444812cfd8a"], // C3 L6
  ["fa41d00c0314374239787707093753f0716882a4c36b8e4fc01524354a0fcf46", "52a5943caaeb3a9ea3241db53271c4efeb2833a4977fb44df6b7184a08a26581"], // C3 L7
  ["6e2c868c07068cb8026c2f2f60965f08789f72146da0df6b47d497c098436039", "269afe64762ebde6a4b275fa9131da3f7a59ac810d6aee3ffa69bbc09abbaef2"], // C3 L8
  ["2782cd5aff8dc571a7cffe27a506549772f62c86593937ce8f00cd463f44eac0", "1c08b7cc63f7c64332a72cf4fe8269d516e3c7a3d2dddae348b5d484fc143ee6"], // C3 L9
  ["77a30077753d92b49a6b2b4f5ef75d97586dea9e5c935cb154f9f97b6bf5cc56", "eeabe2d8c30a7c8af7687136e0e645a57e0f312a9f84181386deac4616b0f592"], // C3 L10
  ["95cbc48ddb2b8616a93808bbab6e309f2c997bdd9af1f7a27bfda296ed6dfb96", "0d2d42d6f8d8e0ac1cd04978322c6bcb3624ef9cbd95451df2c2d33fcca23075"], // C4 L1
  ["2a2e29270503d844ff7a7e17284d82d464201a22f9d23310089865bec8dc43ed", "d6c947db22cef6080ab4494c0a6bdc6786a362241d3695ef1ebe5857fcd1207b"], // C4 L2
  ["9d6d9d735266c92a7cadef78b52dfdc7d10b3d5aed1f4117289557e610663fd4", "9dfac0056e108c3215fcde928f713e758fbd363d88de624a6eb704e1411acb08"], // C4 L3
  ["53a11235fdb67a08ecc4bc4a4a07b110b6f8bac3692db8d29e1aedffe3194ca6", "fd50d23758b6ad9cdb8f6216a3257f8f05f4c4ea9564134c7f21934bd1ab5bc0"], // C4 L4
  ["f013fa67e693792ee0b65276610dd9d07bbaf30c4cb540dce9b915f86a9aff5d", "baf1b36e5ed0cb00e6bf311c16ab1e846940cbfc6adab4889c903e46fb9f183c"], // C4 L5
  ["a94043983a2ff779b2b2746e8c01cd5b88fb4a7af9b9eb5ecee26c9c6a1d6af3", "87009dfad3d7a695bf568450795da6aca78055f6b567206806716444812cfd8a"], // C4 L6
  ["f7c5755c5395f0c75e3d34c8070c0da9fd7a909f65c9307124988dd41fec57d9", "52a5943caaeb3a9ea3241db53271c4efeb2833a4977fb44df6b7184a08a26581"], // C4 L7
  ["7855855cce5eacd2ae81cc262840d44b2d5fc6452b5a4d14d187d2a9d501813c", "269afe64762ebde6a4b275fa9131da3f7a59ac810d6aee3ffa69bbc09abbaef2"], // C4 L8
  ["64d8797a5c7a28df65b29eba4ee58df6e592be514cb933426f817322b4c7d952", "1c08b7cc63f7c64332a72cf4fe8269d516e3c7a3d2dddae348b5d484fc143ee6"], // C4 L9
  ["767cdfa4669cc40f781fac11a1fdeaf691c127961a916f39af7b01f8133ec063", "f4a0ab2e8044aba4d65b9564b6bb7d9924657872d1bf2138e167f84dd296f230"], // C4 L10
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
  ["83e039a257819e5cdb4e38c0327e577cd1affb1c600c641f63304b504e49762a", "0d2d42d6f8d8e0ac1cd04978322c6bcb3624ef9cbd95451df2c2d33fcca23075"], // C6 L1
  ["39d5c154e336098f5a5a125f87a7f5b0c9db01dc11f3c02e11684bad6745128c", "d6c947db22cef6080ab4494c0a6bdc6786a362241d3695ef1ebe5857fcd1207b"], // C6 L2
  ["2aaa525b5c5fec2b2084cdefe75e6e36ca0c6d05f9bffb02df48843fe2d29ed4", "9dfac0056e108c3215fcde928f713e758fbd363d88de624a6eb704e1411acb08"], // C6 L3
  ["f41729a8cff697465fad58a013fd8a75521f2d8c85b4a4f1b6d3e74a3d65f78d", "fd50d23758b6ad9cdb8f6216a3257f8f05f4c4ea9564134c7f21934bd1ab5bc0"], // C6 L4
  ["6b7db7f66d254671a8c30058496ad96374f328d2758ef8abdb928e17b7fc7d47", "baf1b36e5ed0cb00e6bf311c16ab1e846940cbfc6adab4889c903e46fb9f183c"], // C6 L5
  ["03df0eff0a0132fc321cd654ff635882362cf1f01a339de5dcc9ea6274dbbcfd", "87009dfad3d7a695bf568450795da6aca78055f6b567206806716444812cfd8a"], // C6 L6
  ["c52b51d3c8bbf5ef336b9110ea042763c30c4bfade8fcde7718bf8ce2075a41e", "52a5943caaeb3a9ea3241db53271c4efeb2833a4977fb44df6b7184a08a26581"], // C6 L7
  ["68f5a97896ad19d5255a4d9bbb251d1331a39d857ede5f23e3f0dde714921aa9", "269afe64762ebde6a4b275fa9131da3f7a59ac810d6aee3ffa69bbc09abbaef2"], // C6 L8
  ["86c2bdbdb9063ba7187eab056b9e178790a185be5a4a48a7880776e2172b919a", "1c08b7cc63f7c64332a72cf4fe8269d516e3c7a3d2dddae348b5d484fc143ee6"], // C6 L9
  ["c6f69fdd917ff59c2cc037b46fc8c680feb59712d0de90cf11e2b0809e3000f0", "488e8dc036cb23ef3df306e202bf6491bc84711322d35971ed6077042b55308e"], // C6 L10
  ["4392ca457625d4debb78a56d4f6924c95fe12b337c451776f1b5782f5e117181", "0d2d42d6f8d8e0ac1cd04978322c6bcb3624ef9cbd95451df2c2d33fcca23075"], // CX L1
  ["255ef146d448d8f434118632a5673912ab6a564795a827b1f9716ae07033a383", "d6c947db22cef6080ab4494c0a6bdc6786a362241d3695ef1ebe5857fcd1207b"], // CX L2
  ["75156ee9b7427ae2c8725d424847c021eb9e9b5672ccba37271c04907b2e3895", "9dfac0056e108c3215fcde928f713e758fbd363d88de624a6eb704e1411acb08"], // CX L3
  ["9e7bc0f92a27bc2a3e4abad1428cb9f29a586e3fec5f5ae8abc41cfe0607d8ce", "fd50d23758b6ad9cdb8f6216a3257f8f05f4c4ea9564134c7f21934bd1ab5bc0"], // CX L4
  ["5ace3db75d2a48bae554c0c09646e76e946f4ab151daab8af2cc357ab4d05d54", "baf1b36e5ed0cb00e6bf311c16ab1e846940cbfc6adab4889c903e46fb9f183c"], // CX L5
  ["8a3d48b07fd6e0b94fdcc39de42379f2a5b1b1c916b3b4a82f0807b3469c38b1", "87009dfad3d7a695bf568450795da6aca78055f6b567206806716444812cfd8a"], // CX L6
  ["9b1a2e1d5e94799a9e0cdc62e386fabdd4cc69d7bad37540fa7a8864abc6a22a", "52a5943caaeb3a9ea3241db53271c4efeb2833a4977fb44df6b7184a08a26581"], // CX L7
  ["ef14542195e86448d7647ca2ed0c8264880b173382bb5095626ce79e82bfaaac", "269afe64762ebde6a4b275fa9131da3f7a59ac810d6aee3ffa69bbc09abbaef2"], // CX L8
  ["53d7a40f6ba05dcd0fa23a9fee14d7a66e3a91350e9834297e85c09766afce0d", "1c08b7cc63f7c64332a72cf4fe8269d516e3c7a3d2dddae348b5d484fc143ee6"], // CX L9
  ["fdc5fac769a080f78c28d5afa2dd908807ea493eeef389249aaf3ee36c7694fc", "e340e7ace2a681bf70210fbb2627024c8e9d1dba7208224fb95f7a978fb4f658"], // CX L10
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
test('NO-DRIFT full serialized builds and effects match the frozen WAVE baseline', () => {
  const baseline = JSON.parse(readFileSync(baselineURL));
  assert.equal(baseline.sourceSHA256, originalSHA);
  const actual = snapshot();
  assert.equal(actual.length, 70, 'all 7 species at all 10 levels');
  assert.equal(tunedHashes.length, baseline.rows.length);
  for (let i = 0; i < actual.length; i++) assert.deepEqual(actual[i], {
    ...baseline.rows[i], buildSHA256: tunedHashes[i][0], effectSHA256: tunedHashes[i][1],
  }, `${actual[i].id} level ${actual[i].level}`);
  console.log(`  ${actual.reduce((n, r) => n + r.builds, 0)} builds and ${actual.reduce((n, r) => n + r.effects, 0)} effects byte-identical`);
});
console.log(`pet-family-audit: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
