// Shared by Node and browser guards. Only the peer is mocked: real signing,
// encryption, pushBackup, pullBackup, importAll and currency writers run.
export async function backupScenarios({ D, L, S, check, hidden }) {
  let cloud = null, version = 0, puts = 0, conflicts = 0;
  const response = (status, body) => ({ ok: status < 300, status, json: async () => body });
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path === '/register') return response(200, { playerId: 'l2-player', handle: 'L2', friendCode: 'L2TEST' });
    if (path !== '/backup') return response(404, {});
    if ((options.method || 'GET') === 'GET') return cloud ? response(200, { blob: cloud, version }) : response(404, {});
    const body = JSON.parse(options.body);
    if (cloud && body.baseVersion !== version) { conflicts++; return response(409, { code: 'stale-backup', version }); }
    cloud = body.blob; version++; puts++;
    return response(200, { ok: true, version });
  };
  for (const mode of ['push', 'hidden']) for (const first of ['a', 'b']) {
    await check(`${mode} ${first}-first: both offline sessions survive locally and in ciphertext`, async assert => {
      cloud = null; version = 0; puts = 0; conflicts = 0;
      const prefix = `l2-${mode}-${first}-${Date.now()}`;
      D.useDbName(`${prefix}-seed`);
      await D.kvSet('apiBase', 'https://l2-audit.invalid');
      assert.equal((await S.goOnline()).ok, true, 'CONTROL registered');
      await L.coinsAdd(1000 - (await D.kvGet('coins', 0))); await L.boneDustAdd(500);
      assert.equal(await D.kvGet('coins'), 1000, 'CONTROL shared opening balance');
      assert.equal(await S.pushBackup('l2-proof'), true, 'CONTROL initial ciphertext stored');
      const base = await D.exportAll();
      for (const [device, amount] of [['a', 300], ['b', 700]]) {
        D.useDbName(`${prefix}-${device}`);
        await D.importAll(base);
        await L.coinsAdd(amount); await L.boneDustAdd(amount / 10);
        await D.db.put('xp', { key: `earned-${device}`, xp: amount });
        await D.db.put('inv', { id: `crate-${device}`, type: 'crate', rarity: 'common' });
        await D.db.put('log', { id: `meal-${device}`, date: '2026-09-07', kcal: 300 });
        await D.kvSet('backupAt', 0); // make lifecycle push due without waiting ten minutes
      }
      for (const device of [first, first === 'a' ? 'b' : 'a']) {
        D.useDbName(`${prefix}-${device}`);
        const before = puts;
        if (mode === 'push') assert.equal(await S.pushBackup('l2-proof'), true);
        else {
          await new Promise(resolve => setTimeout(resolve, 30));
          assert.equal(puts, before, 'CONTROL no push before visibilitychange');
          hidden();
          const until = Date.now() + 5000;
          while (!(await D.kvGet('backupAt')) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(puts, before + 1, 'one acknowledged PUT per trigger');
        assert.equal(await D.kvGet('backupFail'), null, 'healthy push acknowledged');
      }
      assert.equal(conflicts, 1, 'CONTROL stale device took the real 409, pull, merge, retry path');
      for (const device of ['a', 'b', 'fresh']) {
        D.useDbName(`${prefix}-${device}`);
        if (device === 'fresh') {
          for (const k of ['apiBase', 'identity', 'social']) await D.kvSet(k, base.kv.find(r => r.k === k).v);
        }
        assert.equal((await S.pullBackup()).restored, true);
        assert.equal(await D.kvGet('coins'), 2000, '1000 shared + 300 A + 700 B coins');
        assert.equal(await D.kvGet('bonedust'), 600, '500 shared + 30 A + 70 B dust');
        assert.equal((await D.db.all('xp')).filter(r => r.key.startsWith('earned-')).length, 2);
        assert.equal((await D.db.all('inv')).filter(r => r.id.startsWith('crate-')).length, 2);
        assert.equal((await D.db.all('log')).filter(r => r.id.startsWith('meal-')).length, 2);
        assert.equal((await S.pullBackup()).restored, true);
        assert.equal(await D.kvGet('coins'), 2000, 'repeated ciphertext does not pay twice');
      }
    });
  }
}
