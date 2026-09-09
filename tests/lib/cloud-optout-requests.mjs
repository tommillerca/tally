// Count every request, including preflights, reads, and non-backup uploads.
export function cloudOptoutRequests(requests, mark = 0) {
  const rows = requests.slice(mark);
  return { total: rows.length,
    backups: rows.filter(r => r.method === 'PUT' && /\/backup(?:\?|$)/.test(r.url)).length,
    rows };
}
