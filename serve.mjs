import { serveTree } from './tests/godmode.js';
const srv = await serveTree(process.cwd(), { forcePort: 8791 });
console.log('SERVING ' + srv.url);
process.stdin.resume();
