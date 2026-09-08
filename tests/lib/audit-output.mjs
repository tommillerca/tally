// R3: validate at the write, including caller overrides and symlinked parents.
import { realpathSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const checkout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const roots = new Map([[realpathSync(checkout), 1]]);
const inside = (root, target) => {
  const rel = path.relative(root, target);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
};
function canonical(value) {
  let target = path.resolve(value instanceof URL ? fileURLToPath(value) : value);
  const tail = [];
  for (;;) {
    try {
      lstatSync(target); // A dangling symlink must fail closed, not look absent.
      return path.join(realpathSync(target), ...tail.reverse());
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try { lstatSync(target); throw new Error(`AUDIT OUTPUT dangling symlink: ${target}`); }
      catch (probe) { if (probe.code !== 'ENOENT') throw probe; }
      const parent = path.dirname(target);
      if (parent === target) throw error;
      tail.push(path.basename(target)); target = parent;
    }
  }
}
export function protectAuditTree(root) {
  const key = canonical(root);
  roots.set(key, (roots.get(key) || 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = roots.get(key) - 1;
    if (count) roots.set(key, count); else roots.delete(key);
  };
}
export function auditOutputPath(value) {
  const lexical = path.resolve(value instanceof URL ? fileURLToPath(value) : value);
  const actual = canonical(value);
  for (const root of roots.keys()) {
    if (inside(root, lexical) || inside(root, actual) || inside(actual, root)) {
      throw new Error(`AUDIT OUTPUT refuses checkout write: ${lexical}`);
    }
  }
  return lexical;
}
