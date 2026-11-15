# Room API contract (v1)

Same-origin JSON over HTTP; root path `/api/rooms`. No cookies or CORS access. Requests with a browser Origin must match configured `PUBLIC_ORIGIN` (or Host for local development). Responses are non-cacheable. The browser uses Authorization, never a key in query parameters. No request logging of credentials is implemented.

Identifiers are lowercase hex: room/request ID = 24 characters, seat key/invite = 64. Generate them with a cryptographically secure RNG. Create uses a client-generated room ID and credentials so retries can recover a lost creation response. Black also generates its key before joining. Persist them before sending. Secrets in the examples below are placeholders, not usable credentials.

| Request | Authorization | JSON body | Successful behavior |
| --- | --- | --- | --- |
| `PUT /api/rooms/{roomId}` | None | `{key, invite}` | Create Red seat; retry with identical credentials returns existing room |
| `POST /api/rooms/{roomId}/join` | None | `{key, invite}` | Claim Black; retry with same key succeeds; another key gets 409 |
| `GET /api/rooms/{roomId}` | `Bearer <seatKey>` | None | Canonical snapshot for authenticated seat |
| `POST /api/rooms/{roomId}/commands` | `Bearer <seatKey>` | Command below | Validate, persist, return canonical snapshot |

All successful responses are 200. Snapshot fields:

```js
{
  id: '<roomId>', revision: 2,
  record: { rules: 'rivergate-casual-v1', mode: 'local', moves: [[54,45]], ending: null },
  side: 'red', joined: true,
  offer: null, // or { kind: 'draw' | 'restart', by: 'red' | 'black' }
  expiresAt: 0, // actual value: fixed creation time + 24h, epoch milliseconds
  presence: { red: true, black: true }
}
```

`record.mode = local` deliberately retains the existing export/replay format. The server reconstructs moves with the same pure rules engine; client-supplied board state is never accepted. Keys, invite hashes and request receipts are never included in snapshots.

Each command includes `id` and the last seen integer `revision`, plus:

```js
{ type: 'move', move: { from: 54, to: 45 } }
{ type: 'resign' }
{ type: 'offer', kind: 'draw' } // or restart
{ type: 'answer', accept: true } // or false; only opposite seat may answer
```

A duplicate `(seat, request ID)` with the same normalized command returns the **latest** snapshot without applying again. Reusing that ID with different action/revision returns 409. The last 128 accepted receipts are saved; an older evicted retry still fails its stale revision, so cannot replay the move. JSON property order is irrelevant. Revisions increment for joining and every accepted command, including offers/rejections/restarts; they never reset during the room's life.

Only legal own-turn moves are accepted after both seats join. Terminal games reject moves/resign/draw offers; restart offers remain possible. Mate/stalemate and casual repetition/600-ply rules come from the existing engine. Either side can resign out of turn. Restart requires the other seat, clears the recording/ending and leaves expiry and credentials unchanged. Any legal move clears an outstanding offer. There is no undo, arbitrary snapshot import, spectator access or account recovery endpoint.

Errors return `{error: '<user-facing message>'}`:

| Code | Meaning / caller behavior |
| --- | --- |
| 400 | Malformed/unsupported command or illegal move; discard command, refresh |
| 403 | Wrong origin/seat/invite; stop automatic retries |
| 404 / 410 | Unknown or expired room; stop retries and offer local play/new room |
| 409 | Stale revision, full room, wrong turn or conflicting offer; discard rejected command and fetch current snapshot; never silently rebase a move |
| 413 / 415 | Oversized body or non-JSON content type |
| 429 | Rate limited; `Retry-After: 60` |
| 500 / 503 | Storage/server error or room capacity reached; keep unacknowledged command ID for retry |

Transport failure is ambiguous: the server may already have committed. Retry the exact command with its original ID/revision. Never invent a new ID just because the response was lost. Client retries are serialized and a lifetime guard discards responses after leaving the room. Poll snapshots may update presence at an unchanged revision; older revisions cannot replace the current board. Ordinary transport retries back off to eight seconds; a 429 waits 60 seconds automatically. Explicit manual retry is still available.
