import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isIP } from 'node:net';
import { Rooms, RoomError } from './rooms.js';

export function createApp({ directory = resolve('.data/rooms'), dist = resolve('dist'), origin = process.env.PUBLIC_ORIGIN,
  rooms = new Rooms(directory), rateLimit = true, trustProxy = process.env.TRUST_PROXY === 'loopback' } = {}) {
  const limits = new Map();
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        if (origin && req.headers.origin && req.headers.origin !== origin) throw new RoomError(403, 'Nguồn yêu cầu không được phép.');
        if (!origin && req.headers.origin) {
          let host;
          try { host = new URL(req.headers.origin).host; } catch { /* Reject opaque origins. */ }
          if (host !== req.headers.host) throw new RoomError(403, 'Nguồn yêu cầu không được phép.');
        }
        if (rateLimit) {
          const now = Date.now(), peer = req.socket.remoteAddress;
          const forwarded = req.headers['x-real-ip'];
          const ip = trustProxy && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)
            && typeof forwarded === 'string' && isIP(forwarded) ? forwarded : peer;
          for (const [key, limit] of limits) if (now > limit.until) limits.delete(key);
          if (limits.size >= 10000 && !limits.has(ip)) throw new RoomError(503, 'Server đang bận.');
          const limit = limits.get(ip) || { until: now + 60000, count: 0 };
          limits.set(ip, limit);
          if (++limit.count > 240) { res.setHeader('Retry-After', '60'); throw new RoomError(429, 'Quá nhiều yêu cầu. Hãy thử lại sau.'); }
        }
        const match = /^\/api\/rooms\/([a-f0-9]{24})(?:\/(join|commands))?$/.exec(url.pathname);
        if (!match) throw new RoomError(404, 'Không tìm thấy API.');
        const [, id, route] = match;
        const key = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
        if (req.method === 'GET' && !route) return json(200, rooms.read(id, key));
        if (!((req.method === 'PUT' && !route) || (req.method === 'POST' && route))) throw new RoomError(405, 'Phương thức không được hỗ trợ.');
        if (!req.headers['content-type']?.startsWith('application/json')) throw new RoomError(415, 'Cần JSON.');
        let text = '';
        for await (const chunk of req) {
          text += chunk.toString('utf8');
          if (Buffer.byteLength(text) > 8192) throw new RoomError(413, 'Yêu cầu quá lớn.');
        }
        let body;
        try { body = JSON.parse(text); } catch { throw new RoomError(400, 'JSON không hợp lệ.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RoomError(400, 'Yêu cầu không hợp lệ.');
        return json(200, route === 'join' ? rooms.join(id, body) : route === 'commands' ? rooms.command(id, key, body) : rooms.create(id, body));
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new RoomError(405, 'Phương thức không được hỗ trợ.');
      const name = decodeURIComponent(url.pathname);
      const path = resolve(dist, name === '/' ? 'index.html' : `.${name}`);
      if (!path.startsWith(resolve(dist) + sep)) throw new RoomError(404, 'Không tìm thấy trang.');
      let data;
      try { if (!statSync(path).isFile()) throw Error(); data = readFileSync(path); }
      catch { throw new RoomError(404, 'Không tìm thấy trang. Hãy build ứng dụng trước.'); }
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' })[extname(path)] || 'application/octet-stream');
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (!res.headersSent && !res.destroyed) json(error instanceof RoomError ? error.status : 500,
        { error: error instanceof RoomError ? error.message : 'Server chưa lưu được thay đổi. Hãy thử lại.' });
    }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createApp({ directory: resolve(process.env.DATA_DIR || '.data/rooms') });
  const port = Number(process.env.PORT || 4212), host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`Rivergate: http://${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
