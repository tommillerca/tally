#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { main, options, generate, read, fail, GATE } from './lib.mjs';
main(() => {
  const o = options(process.argv.slice(2));
  const result = generate(o.tree, o.base, o.lanes);
  if (o.check) {
    if (read(o.tree, GATE) !== result.source) fail('GENERATED_GATE: assembled gate differs from baseline plus lane registrations');
  } else {
    const destination = path.join(o.tree, GATE);
    if (fs.lstatSync(destination).isSymbolicLink()) fail('PATH: gate destination is a symlink');
    const temp = destination + `.ship-${process.pid}`;
    try { fs.writeFileSync(temp, result.source, { flag: 'wx' }); fs.renameSync(temp, destination); }
    finally { fs.rmSync(temp, { force: true }); }
  }
  console.log(`PASS generated gate: ${result.additions.size} additions; base ${o.base}${o.check ? '; unchanged' : ''}`);
});
