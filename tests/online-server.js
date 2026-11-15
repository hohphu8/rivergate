import { createApp } from '../server/app.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = mkdtempSync(join(tmpdir(), 'rivergate-online-e2e-'));
const server = createApp({ directory, rateLimit: false });
server.listen(4213, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.closeAllConnections(); server.close(() => { rmSync(directory, { recursive: true, force: true }); process.exit(); });
});
