# Online rooms verification — 2026-11-16

Runtime: published GyosJS 0.5.6. Node 22.18.0 on Windows; installed Chrome plus Playwright Firefox/WebKit. No new runtime dependency, rules format, core change or version bump.

## Checks

- **29 Node tests passed**: existing engine/game/search/Worker cases plus rooms, HTTP and online-controller tests. They cover seat authorization, illegal/wrong-turn moves, normalized duplicate requests, stale/concurrent revisions, draw/restart consent, caller-side resignation, capacity/expiry, failed disk writes, hashed secrets, request body/origin/auth boundaries, proxy rate-limit trust, normal server restart, pending-request restoration and late-response cleanup.
- Production Vite build passed. The Node server serves that actual build with same-origin CSP; online tests do not use Vite's dev hooks.
- **9 online browser cases passed across Chromium, Firefox and WebKit** (three journeys on each). Independent browser contexts play both seats; a third cannot steal Black. Includes reload, rejection/acceptance of offers, restart, resignation, local-save preservation, lost acknowledgement, offline lock/reconnect, stable drag through polling and read-only history while the live game advances.
- **48 existing production browser cases passed**, with **6 existing development-only skips**. Covers bot Worker, cancellation/stale replies, local game, CSP, import/export, storage failure, mobile/touch, board feedback and casual repetition.
- The **6 development-only scope cleanup cases also passed separately** across all three browsers (`--grep scope`). Evidence: `.local/online-cleanup.log`.
- Desktop and 390px mobile online screenshots inspected. Own/opponent labels reflect the assigned side, board orientation remains usable and the mobile page has no horizontal overflow.

The online browser tests use an actual Node room service and actual rules/disk persistence. One case deliberately lets a command reach the server and then drops only its response before reloading; the stored request ID is retried and exactly one move remains. Another puts the browser offline while the other player moves, then reconnects to the server's board. No external provider or mock backend is involved. Unit tests additionally control delayed client responses to prove that disposed instances cannot publish.

The restart integration test closes the HTTP server, constructs a fresh store/server from the same files and retries the accepted command. Failed-write tests verify that memory/revision does not advance without persistence. These checks establish normal process-restart behavior, not recovery from every disk or power failure.

Local evidence is in ignored `.local/online-unit.log`, `.local/online-all.log`, `.local/online-results.json`, `.local/online-local-regressions.log`, `.local/online-desktop.png` and `.local/online-mobile.png`. Playwright traces are retained on failure and may contain ephemeral test credentials; do not publish them as production logs.

## Limits

No public deployment, load test, geographic latency measurement, tournament-strength claim or full security/accessibility certification is implied. This is a single-process, disk-backed private-room implementation with a 100-room cap and 24-hour expiry. Online deployment needs the Node process, persistent writable data directory, HTTPS and the documented proxy configuration. See [setup](ONLINE.md) and [contract](ONLINE-API.md).

Bot/local storage and behavior remain available without the API. Online room data is separate; users without persistent browser storage are asked to enable it before claiming a seat rather than silently losing their rejoin credentials.
