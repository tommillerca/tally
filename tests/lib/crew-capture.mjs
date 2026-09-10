/* Operator-owned Puppeteer page. No server, browser launch, or production writes.
 * DOM geometry is browser evidence only. Node doubles prove fixture routing only.
 */
export const SURFACES = {
  fan: '#cfanWrap', member: '.cfan-card.feat', steps: '#raceCard', level: '#lbBody',
};

export function crewFixture({ scenario = 'fresh', now = Date.now() } = {}) {
  if (!['fresh', 'one-stale', 'all-stale', 'unknown', 'degraded'].includes(scenario)) throw new Error(`Unknown scenario: ${scenario}`);
  const names = ['Marrow Max', 'Bone Jovi', 'Grave Mint', 'Swole Phantom', 'Rib Tickler', 'Grim Wich', 'Dusty Lulu'];
  const friends = names.map((name, i) => ({
    playerId: `capture-${i}`, name, alias: i === 2 ? 'A deliberately long Crew nickname' : null,
    addToken: `capture-token-${i}`, spires: i === 2 ? 3 : 0,
    lastSeen: now - 60000,
    profile: { level: 40 - i, levelName: 'Bonehead', title: i === 2 ? 'Bone Grand Master 113' : '',
      outfit: { B: 'B0-1', SK: 'SK0-1', T: 'T2' },
      pet: { id: ['C3', 'C1', 'C2', 'C5', 'C4', 'C6', 'C3'][i], level: 4, shiny: false },
      yard: { n: 1, pets: [{ sp: ['C3', 'C1', 'C2', 'C5', 'C4', 'C6', 'C3'][i] }] }, badges: 2, gearCount: 8 },
  }));
  if (scenario === 'degraded') {
    // A partial, previously synced profile can race. A never-synced friend
    // cannot: /leaderboard and /steps/week both exclude profile IS NULL.
    const epoch = Date.parse('2026-08-07T00:00:00Z'), period = 7 * 86400000;
    const weekKey = new Date(epoch + Math.max(0, Math.floor((now - epoch) / period)) * period).toISOString().slice(0, 10);
    friends[0].profile = { level: 1, outfit: {}, weekKey, weekSteps: 24000, raceV: 2 };
    friends[0].lastSeen = now - 2 * 86400000;
    friends[1].profile.outfit = null;
    friends[6].profile = null;
    // Registration writes last_seen even before a first profile upload.
  }
  const players = friends.slice(0, 4).map(f => ({ ...f.profile, playerId: f.playerId, name: f.name, addToken: f.addToken, lastSeen: f.lastSeen }));
  players.splice(2, 0, { ...players[0], playerId: 'capture-self', name: 'Capture Player', you: true });
  const racers = players.map((p, i) => ({ ...p, rank: i + 1, steps: 24000 - i * 3000,
    seenAt: scenario === 'unknown' ? null : now - ((scenario === 'all-stale' || scenario === 'one-stale' && i === 0) ? 2 * 86400000 : 60000) }));
  if (scenario === 'degraded') {
    // Own outfit remains complete. Only remote partial rows lose their art.
    players[2].outfit = { B: 'B0-1', SK: 'SK0-1', T: 'T2' };
    racers[2].outfit = players[2].outfit;
    racers[0].seenAt = friends[0].lastSeen;
  }
  return { scenario, now, me: { playerId: 'capture-self', name: 'Capture Player', handle: 'capture', friendCode: 'BONE-0000' },
    data: { friends, incoming: [], outgoing: [], truncated: { friends: false, incoming: false, outgoing: false }, reached: true },
    leaderboard: players, race: { players: racers, yourRank: 3, podium: [] } };
}

// Serialized by Puppeteer and exercised unchanged in the Node DOM proof.
export async function assertDemoPage(fixture = null) {
  const url = new URL(location.href);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Refusing capture: use a local disposable origin, never production.');
  if (!url.searchParams.has('demo')) throw new Error('Refusing capture: real save, load ?demo.');
  if (url.searchParams.has('api')) throw new Error('Refusing capture: remove the API override.');
  if (navigator.webdriver !== true) throw new Error('Refusing capture: webdriver fixture hooks are unavailable.');
  if (!(await indexedDB.databases()).some(d => d.name === 'tally-demo')) throw new Error('Refusing capture: tally-demo has not booted.');
  if (!document.querySelector('.demo-header')) throw new Error('Refusing capture: no booted demo header.');
  if (!fixture) return;
  window.__testMe = fixture.me;
  window.__testFriends = fixture.data;
  window.__testLb = fixture.leaderboard;
  window.__testRace = fixture.race;
  window.__crewCapture = { scenario: fixture.scenario, memberIds: fixture.data.friends.map(f => f.playerId), rows: fixture.race.players.length };
}

const protectedPages = new WeakSet();
export async function prepareCrew(page, options = {}) {
  await page.evaluate(assertDemoPage);
  if (!protectedPages.has(page)) {
    // Keep interception installed for this disposable page's lifetime. Even an
    // accidental social action cannot escape to the API. No live host allowed.
    const origin = new URL(page.url()).origin;
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.isInterceptResolutionHandled()) return;
      const url = new URL(request.url());
      const allowed = ['data:', 'blob:'].includes(url.protocol) ||
        (url.origin === origin && ['GET', 'HEAD'].includes(request.method()) &&
          (!request.isNavigationRequest() || url.searchParams.has('demo')));
      void (allowed ? request.continue() : request.abort('blockedbyclient')).catch(() => {});
    });
    protectedPages.add(page);
  }
  const fixture = crewFixture(options);
  await page.evaluate(assertDemoPage, fixture);
  // Pin the local throttle and comparison cache in the NAMED demo DB only.
  // No social identity, outfit, settings or real-save writes.
  await page.evaluate(async fixture => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('tally-demo'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        for (const [k, v] of Object.entries({ racePushAt: Date.now(), crewFaves: [],
          friendSnaps: Object.fromEntries(fixture.data.friends.map(f => [f.playerId, { level: f.profile?.level, gear: f.profile?.gearCount, badges: f.profile?.badges, spires: f.spires }])) }))
          tx.objectStore('kv').put({ k, v });
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Demo seed aborted'));
      });
    } finally { db.close(); }
    location.hash = '#/today';
  }, fixture);
  await page.waitForFunction(() => !document.querySelector('#cfanDeck'));
  await page.evaluate(() => { location.hash = '#/friends'; });
  await page.waitForFunction(n => document.querySelectorAll('#cfanDeck .cfan-card').length === n &&
    document.querySelectorAll('#raceCard .race-lane').length === 5, {}, fixture.data.friends.length);
  await settleCrew(page);
  return fixture;
}

export async function settleCrew(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.race([Promise.all([...document.querySelectorAll('#cfanWrap img, #raceCard img, #lbBody img')].map(i => i.decode().catch(() => {}))),
      new Promise(resolve => setTimeout(resolve, 5000))]);
    await new Promise(resolve => setTimeout(resolve, 650)); // fan's 450ms transition and observer delivery
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function surface(page, selector) {
  await page.evaluate(assertDemoPage);
  const handle = await page.$(selector);
  if (!handle) throw new Error(`Missing capture surface: ${selector}`);
  await handle.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await settleCrew(page);
  return handle; // operator: await handle.screenshot({ path: '...' })
}
export const fanSurface = page => surface(page, SURFACES.fan);
export async function memberSurface(page, playerId = 'capture-0') {
  await page.evaluate(assertDemoPage);
  await page.evaluate(id => {
    const card = [...document.querySelectorAll('.cfan-card')].find(c => c.dataset.fan === id);
    if (!card) throw new Error(`Member absent: ${id}`);
    if (!card.classList.contains('feat')) card.click(); // real delegated fan selection, not a profile
  }, playerId);
  await page.waitForFunction(id => document.querySelector('.cfan-card.feat')?.dataset.fan === id, {}, playerId);
  return surface(page, SURFACES.member);
}
export async function stepLeaderboardSurface(page) {
  await page.evaluate(assertDemoPage);
  await page.evaluate(() => {
    const card = document.querySelector('#raceCard');
    if (!card) throw new Error('Step board absent');
    if (!card.open) card.querySelector('summary').click();
  });
  return surface(page, SURFACES.steps);
}
export async function levelLeaderboardSurface(page) {
  await page.evaluate(assertDemoPage);
  await page.click('#crewLeaderboard');
  await page.waitForSelector('#lbBody .lb-row');
  return surface(page, SURFACES.level);
}

// Live CSS pixel boxes, including transforms. Fractions for rotated side cards
// are axis-aligned bounding-box ratios; use memberSurface to measure centrally.
export function measureCrewDOM() {
  const box = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  };
  const opacity = el => {
    let value = 1;
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility !== 'visible' || s.contentVisibility === 'hidden') return 0;
      value *= Number(s.opacity);
    }
    return value;
  };
  const intersection = (a, b) => {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    const width = Math.max(0, Math.min(a.right, b.right) - x), height = Math.max(0, Math.min(a.bottom, b.bottom) - y);
    return { x, y, width, height, right: x + width, bottom: y + height };
  };
  const clipped = el => {
    let r = intersection(box(el), { x: 0, y: 0, right: innerWidth, bottom: innerHeight });
    for (let n = el.parentElement; n; n = n.parentElement) {
      const s = getComputedStyle(n), b = box(n);
      if (/(hidden|clip|scroll|auto)/.test(s.overflowX)) r = intersection(r, { x: b.x, y: r.y, right: b.right, bottom: r.bottom });
      if (/(hidden|clip|scroll|auto)/.test(s.overflowY)) r = intersection(r, { x: r.x, y: b.y, right: r.right, bottom: b.bottom });
    }
    return r;
  };
  const label = el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' ? '.' + el.className.trim().replace(/\s+/g, '.') : ''}`;
  const art = el => [...el.querySelectorAll('img, canvas')].map(node => {
    let inkPixels = null, inkError = null;
    // Inspect actual raster alpha, so a decoded transparent image/blank canvas
    // cannot certify a visible head. This is source ink, not screenshot pixels.
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(node, 0, 0, 64, 64);
      const rgba = ctx.getImageData(0, 0, 64, 64).data;
      inkPixels = 0;
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 16) inkPixels++;
    } catch (e) { inkError = e.message; }
    return { node: label(node), box: box(node), clippedBox: clipped(node), opacity: opacity(node),
      decoded: node.tagName === 'CANVAS' ? node.width > 0 && node.height > 0 : node.complete && node.naturalWidth > 0,
      source: node.currentSrc || null, inkPixels, inkError };
  });
  // Pointer-inert artwork and covers must participate in hit testing. This
  // temporary rule changes hit testing only, never layout/paint, and is removed.
  const hitStyle = document.createElement('style');
  hitStyle.textContent = '* { pointer-events: auto !important; }';
  document.head.append(hitStyle);
  const icon = el => {
    if (!el) return { exists: false, box: null, opacity: 0, overlaps: [], samples: [], art: [] };
    const r = clipped(el), samples = [], overlaps = new Map();
    if (r.width > 0 && r.height > 0) for (const fy of [0.1, 0.3, 0.5, 0.7, 0.9]) for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const x = r.x + r.width * fx, y = r.y + r.height * fy;
      const stack = document.elementsFromPoint(x, y);
      const own = stack.findIndex(n => n === el || el.contains(n));
      const covers = (own < 0 ? stack : stack.slice(0, own)).filter(n => !n.contains(el) && opacity(n) > 0);
      for (const n of covers) overlaps.set(n, { node: label(n), box: box(n), opacity: opacity(n), background: getComputedStyle(n).backgroundColor });
      samples.push({ x, y, hit: own >= 0, covered: covers.length > 0, covers: covers.map(label) });
    }
    // Also probe the intersection of every other element's box. A narrow
    // pointer-inert cover can sit between all 25 grid samples.
    if (r.width > 0 && r.height > 0) for (const n of document.querySelectorAll('body *')) {
      if (n === el || n.contains(el) || el.contains(n) || opacity(n) <= 0) continue;
      const overlap = intersection(r, box(n));
      if (!overlap.width || !overlap.height) continue;
      const stack = document.elementsFromPoint(overlap.x + overlap.width / 2, overlap.y + overlap.height / 2);
      const own = stack.findIndex(item => item === el || el.contains(item)), other = stack.indexOf(n);
      if (other >= 0 && (own < 0 || other < own)) overlaps.set(n, { node: label(n), box: box(n),
        overlapBox: overlap, opacity: opacity(n), background: getComputedStyle(n).backgroundColor });
    }
    let visibleInkPixels = null, inkError = null;
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      const bounds = box(el);
      for (const node of el.querySelectorAll('img, canvas')) {
        if (opacity(node) <= 0 || !bounds.width || !bounds.height) continue;
        const b = box(node), clip = clipped(node);
        ctx.save();
        ctx.beginPath(); ctx.rect((clip.x - bounds.x) / bounds.width * 64, (clip.y - bounds.y) / bounds.height * 64,
          clip.width / bounds.width * 64, clip.height / bounds.height * 64); ctx.clip();
        ctx.globalAlpha = opacity(node);
        ctx.drawImage(node, (b.x - bounds.x) / bounds.width * 64, (b.y - bounds.y) / bounds.height * 64,
          b.width / bounds.width * 64, b.height / bounds.height * 64);
        ctx.restore();
      }
      const rgba = ctx.getImageData(0, 0, 64, 64).data;
      visibleInkPixels = 0;
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 16) visibleInkPixels++;
    } catch (e) { inkError = e.message; }
    return { exists: true, visibleInkPixels, inkError, box: box(el), clippedBox: r, opacity: opacity(el), cssOpacity: getComputedStyle(el).opacity,
      overlaps: [...overlaps.values()], samples, art: art(el) };
  };
  try {
    const cards = [...document.querySelectorAll('.cfan-card')].map(el => {
      const c = box(el), b = box(el.querySelector('.cfan-plate')), p = box(el.querySelector('.cfan-pet'));
      return { playerId: el.dataset.fan, featured: el.classList.contains('feat'), card: c, bar: b,
        barHeightFraction: c.height && b ? b.height / c.height : null,
        barWidthFraction: c.width && b ? b.width / c.width : null,
        pet: p, petTopFraction: c.height && p ? (p.y - c.y) / c.height : null,
        petCenterFraction: c.height && p ? (p.y + p.height / 2 - c.y) / c.height : null,
        petBottomFraction: c.height && p ? (p.bottom - c.y) / c.height : null,
        petBarOverlapPx: p && b ? Math.max(0, p.bottom - b.y) : null };
    });
    const rows = [...document.querySelectorAll('#raceCard .race-lane')].map((row, index) => ({
      index, playerId: row.dataset.raceview || (row.classList.contains('you') ? 'capture-self' : null),
      own: row.classList.contains('you'), rank: row.querySelector('.rk')?.textContent.trim(), row: box(row),
      icon: icon(row.querySelector('.run')),
    }));
    return { schema: 1, scenario: window.__crewCapture?.scenario, metadata: { width: innerWidth, height: innerHeight,
      dpr: devicePixelRatio, rootFont: getComputedStyle(document.documentElement).fontSize,
      visualScale: visualViewport?.scale ?? 1, viewport: document.querySelector('meta[name="viewport"]')?.content,
      userAgent: navigator.userAgent }, cards, rows };
  } finally { hitStyle.remove(); }
}
export async function measureCrew(page) { await page.evaluate(assertDemoPage); await settleCrew(page); return page.evaluate(measureCrewDOM); }

// Scroll EACH row into view before measuring. A long board must not fail merely
// because it is below the viewport, or pass because its first row looked good.
export async function measureStepRows(page) {
  await stepLeaderboardSurface(page);
  const count = await page.$$eval('#raceCard .race-lane', rows => rows.length);
  const rows = [];
  for (let index = 0; index < count; index++) {
    await page.$$eval('#raceCard .race-lane', (nodes, i) => nodes[i].scrollIntoView({ block: 'center', behavior: 'instant' }), index);
    rows.push((await measureCrew(page)).rows[index]);
  }
  return rows;
}
