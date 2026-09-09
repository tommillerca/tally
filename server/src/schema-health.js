import { WRITE_PROBES } from './write-contract.generated.js';

// WHERE 0 executes the UPDATE through D1 but visits and changes no rows.
// SQLite still resolves every target and RHS column before running it.
export async function schemaHealth(db) {
  for (const { table, sql } of WRITE_PROBES) {
    try {
      const result = await db.prepare(sql).run();
      if (!result.success || result.meta?.changes !== 0) throw new Error('unexpected write probe result');
    } catch (error) {
      // Expose only a schema identifier, never raw SQL, player data or secrets.
      const message = String(error.message);
      const missing = message.match(/no such (?:column|table):\s*([a-z_][a-z0-9_]*)/i);
      return { ok: false, check: 'write-schema', table,
        error: missing ? `missing ${missing[0].includes('column') ? 'column' : 'table'}: ${missing[1]}` : 'D1 write probe failed' };
    }
  }
  return { ok: true, check: 'write-schema', tables: WRITE_PROBES.length };
}
