import { readFileSync } from 'node:fs';

export const weekFreeze = readFileSync(new URL('../migrations/2026-09-05-week-freeze.sql', import.meta.url), 'utf8');
export function beforeWeekFreeze() {
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  const lines = schema.match(/^  last_week_(?:key TEXT|steps INTEGER),[^\n]*\n/gm);
  if (lines?.length !== 2) throw new Error('Week-freeze fixture must remove exactly the two migration columns');
  return schema.replace(/^  last_week_(?:key TEXT|steps INTEGER),[^\n]*\n/gm, '');
}

// Local fixtures only. A row ensures a health check cannot pass by relying on
// the absence of player data. These values must survive every probe unchanged.
export const sentinelSQL = `INSERT INTO players
  (id,pubkey,handle,friend_code,created_at,last_seen,profile,week_key,week_steps)
  VALUES ('migration-guard','local-key','Local fixture','LOCAL-GUARD',1,2,'{}','2026-08-31',123);`;
