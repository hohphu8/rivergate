# Private online rooms

Two people can play through an invitation link. The host is Red; the first invited player claims Black. No account, matchmaking, spectator, ranking or clock. The approved casual repetition policy remains unchanged: the same board and side to move three times is a draw, including during checks.

## Try locally

Node 22+ is required. No new npm dependency is needed.

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4212**. Choose **Tạo phòng online**, confirm and copy the invitation. Open that link in a different browser or private browser profile, then choose **Vào phòng được mời**. Two tabs in the same browser profile normally share the same seat; use independent profiles to try both sides.

For development, run `npm run server` in one terminal and `npm run dev` in another. Vite proxies `/api` to the Node server on 4212. `npm run preview` is still a static preview: it does not run the room API. Existing bot/local play remains usable on static hosting.

## Playing and returning

- The board changes after server acknowledgement; opponents receive updates through HTTP polling about once a second. This is not a latency guarantee. Background tabs may be throttled by the browser.
- A second player must join before moves are accepted. Only your assigned side can move on its turn. Reload automatically reconnects when the URL contains your saved room ID; **Vào lại phòng** returns from local play.
- The seat key and any unacknowledged request are saved in localStorage before sending. A dropped response retries the same request ID. Never share the seat key. Invitations contain a different, one-seat claiming secret in the URL fragment; after entering, the fragment is replaced with the room ID. The first recipient to join occupies Black.
- Each browser remembers one room. Creating/joining another replaces that shortcut. Clearing browser data or moving devices loses the saved seat; there is no account-based recovery. A room invite cannot steal a seat already claimed by another key.
- Bot/local save data stays separate. Returning to local does not resign or delete the online room. On an observed network failure, moves are locked until a canonical snapshot arrives. No automatic loss/draw occurs on disconnection. Presence means a recent authenticated request (10-second window), not proof the human is looking at the board.
- Draw and restart require an offer accepted by the other player. A legal move cancels a pending offer. Resigning applies to the caller's side regardless of turn. Restart keeps seats and the original expiry; revisions keep increasing. Online undo/import is disabled. History/replay and JSON export remain available.
- Rooms expire **24 hours after creation**, even if a game is active. Export before expiry. Expired files are removed on startup or room access/creation, not by a continuous erasure timer.

## Deploy

This app now requires a Node process for online play; uploading only `dist/` enables local/bot play but not rooms. Run **one process per data directory**. Do not use PM2 cluster mode, multiple replicas or a shared directory across processes. The initial limit is 100 unexpired rooms.

Set environment variables in your service manager:

```text
NODE_ENV=production
HOST=127.0.0.1
PORT=4212
PUBLIC_ORIGIN=https://your-rivergate-domain.example
TRUST_PROXY=loopback
DATA_DIR=/var/lib/rivergate/rooms
```

Build in the repository, then run `node server/app.js` with the repository as its working directory. `DATA_DIR` defaults to `.data/rooms`; keep it outside `dist/`, preserve it across deployments and restrict access to the service user. It contains move logs, room metadata and hashed seat/invite credentials. Do not expose it through the web server or commit it. Back up this directory if you want recovery beyond ordinary process restarts. A corrupt active room file fails startup rather than silently erasing a game.

Put the process behind HTTPS using your existing reverse proxy. Browsers need HTTPS (or localhost) for room creation and clipboard features. Proxy both page/assets and `/api` to the same Node process/origin. For example, inside an existing TLS-enabled Nginx server block:

```nginx
location / {
    proxy_pass http://127.0.0.1:4212;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 15s;
    client_max_body_size 16k;
}
```

No WebSocket upgrade configuration is needed. Set `PUBLIC_ORIGIN` to the exact browser origin without a trailing slash. Do not cache `/api` or strip Authorization headers. The server returns `Cache-Control: no-store`, refuses other browser origins, serves a CSP without `unsafe-eval`, bounds JSON bodies to 8 KiB and applies a small per-IP rate limit (240 requests/minute). `TRUST_PROXY=loopback` accepts a valid `X-Real-IP` only from a loopback connection. Use it only with a local proxy that **overwrites** this header as above, and keep Node bound to loopback. Otherwise omit it and the socket IP is used. `X-Forwarded-For` is never blindly trusted. Add appropriate edge limits before opening a busy public service; users sharing a public IP still share this basic limit.

Room updates use a flushed temporary file followed by rename before acknowledgement. This survives normal process restart; it is not a database transaction across machines or a guarantee against disk/power-loss failure. The synchronous small-room store and full snapshots are intended for this initial private-room deployment, not a high-concurrency claim.

## Verify

```sh
npm test
npm run build
npm run test:online
```

The online browser suite starts its own Node server on 4213 with a temporary data directory and uses independent browser contexts. Existing production/local browser suites remain separate. See [API contract](ONLINE-API.md) and [validation](ONLINE-VALIDATION.md).
