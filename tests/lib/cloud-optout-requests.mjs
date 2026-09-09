// Pin endpoint paths, not cursor values. Both server receipts and browser
// attempts use this policy; never discard an unrecognised method or endpoint.
const READ_PATHS = new Set(['/backup', '/friends', '/grants', '/health']);
const pathname = r => {
  try { return new URL(r.url, 'http://audit.invalid').pathname; }
  catch { return null; }
};
const readPreflight = r => r.method === 'OPTIONS' && r.preflightMethod === 'GET';
const write = r => (r.method !== 'GET' && !readPreflight(r)) || (r.bytes || 0) > 0;
const allowedRead = r => r.method === 'GET' ? READ_PATHS.has(pathname(r))
  : readPreflight(r) && pathname(r) === '/grants';

export function cloudOptoutRequests(requests, mark = 0) {
  const rows = requests.slice(mark);
  return { total: rows.length,
    backups: rows.filter(r => r.method === 'PUT' && /\/backup(?:\?|$)/.test(r.url)).length,
    writes: rows.filter(write),
    unexpectedReads: rows.filter(r => !write(r) && !allowedRead(r)),
    grants: rows.filter(r => r.method === 'GET' && pathname(r) === '/grants').length,
    rows };
}
