import { boot, sleep, serveTree } from './godmode.js';
const srv = await serveTree(new URL('..', import.meta.url).pathname);
const { browser, page } = await boot(srv.url);
await sleep(2500);
console.log('   URL:', page.url().slice(-22));
await browser.close(); srv.stop?.(); process.exit(0);
