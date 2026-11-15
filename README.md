# Rivergate · Cờ tướng qua sông

A Vietnamese Xiangqi app built with **GyosJS 0.5.6**, plain HTML/CSS/JavaScript and Vite. Play Red against a basic bot, share one device, or invite a friend to a private online room. Online rooms use an optional Node server with disk storage; bot/local play remains standalone. No accounts, telemetry or external runtime assets.

Use click/tap to select and move, or drag a piece with the mouse onto a highlighted legal point. Escape, dropping outside the board, or an invalid drop cancels the drag. Invalid destination clicks retain the selected piece and its legal hints. Touch retains tap/scroll behavior; arrow keys and Enter remain available.

## Run locally

Requires Node.js **22+** and npm.

```sh
npm ci --registry=https://registry.npmjs.org
npm run dev
```

Open **http://127.0.0.1:4210**. The strict port prevents accidentally testing another app. Firefox blocks port 4190; this project deliberately uses 4210 instead.

```sh
npm run build
npm run preview
```

Production preview: **http://127.0.0.1:4211**. To host, serve `dist/` over HTTP(S), including its generated Worker asset. Opening `index.html` directly with `file://` is unsupported. The app is configured for a domain root. For a subdirectory deployment, set Vite's `base` and verify that the generated Worker URL resolves there.

For **online rooms**, run `npm run build` then `npm start` and open **http://127.0.0.1:4212**. Create a room and open the invitation in another browser/profile. Static preview alone does not run the API. Online deployment currently expects a domain root; see [room setup, limits and HTTPS deployment](docs/ONLINE.md).

## Play

- Select a piece, then a marked legal destination. Red starts.
- Online: the host is Red, the first invited player is Black. Reconnect/reload uses your saved browser seat. Rooms expire after 24 hours. Draw/restart needs the other player's acceptance; online undo/import is disabled. The local save is kept separately.
- On a keyboard, arrows move focus, Enter/Space select, Escape clears selection, Home focuses the lower-left corner. On a phone, tap the piece and destination.
- Flip the board or show Vietnamese piece names. Reduced-motion preferences disable movement animation.
- Follow the latest move using a dashed origin ring, a boxed destination, the moved piece's outline and a text description. These follow the displayed history frame and undo. Red pieces have light faces; Black pieces have dark faces, so the sides do not rely only on hue.
- Undo returns to the human's previous turn against the bot; in local mode it undoes one move.
- Browse or automatically replay the move history. History is read-only, including its last frame; use **Trở lại ván đang chơi** to continue.
- The current game and mode are saved in this browser. Export JSON to keep a copy or transfer devices. Import replays and validates every move before replacing the current game. Storage failures are shown in the UI.
- Bot failures offer retry or switching to two-player mode without losing the board.

## Rules and limits

All seven piece types, blocked horse legs/elephant eyes, cannon screens, palace/river restrictions, facing generals, self-check and mate are enforced. **Stalemate is a loss.** Generals are never captured in an accepted move; a game ends when the opponent has no legal reply.

This version uses the owner's approved **casual** rules:

- The same position with the same side to move occurring three times is a draw.
- A second occurrence displays a warning. This policy also applies during checks; the draw message explains it explicitly.
- No tournament perpetual-check/chase adjudication and no automatic no-progress draw.
- Players can agree a draw. Against the bot, the human can choose a draw at any time.
- A game automatically draws at 600 individual moves to bound recordings and restoration work. A mate/stalemate on that move takes priority.

The bot is a basic iterative-deepening alpha-beta search with material and simple positional evaluation. It searches in a module Worker with an approximately 800 ms computation budget, up to depth 4 plus at most 4 tactical extension plies for captures/check escapes. Equal-scoring root choices prefer less repeated positions; necessary draws remain valid choices. A regression covers the opening cannon-for-defended-horse blunder. This is **not** a rated or tournament engine: no opening book, clocks or puzzles. Bounded tactical search can still miss combinations. Online rooms connect two humans; the server does not run the bot.

General move-rule reference: [WXF 2018 World Xiangqi Rules](https://www.wxf-xiangqi.org/images/wxf-rules/2018_World_XiangQi_Rules_English2018.pdf). The repetition and move-limit policies above are Rivergate's own casual rules, not a claim of WXF tournament compliance.

## Development and verification

```sh
npm test
npm run test:e2e
npm run check
```

Playwright runs Chromium, Firefox and WebKit. Windows uses installed Google Chrome for the Chromium project. Install the Playwright browsers if needed (`npx playwright install`; Linux CI may also need `--with-deps`). Each run owns its local server and closes it when finished.

To check the actual production bundle after `npm run build`:

```powershell
$env:RIVERGATE_PRODUCTION='1'
npm run test:e2e
Remove-Item Env:RIVERGATE_PRODUCTION
```

On a POSIX shell: `RIVERGATE_PRODUCTION=1 npm run test:e2e`.

| Module | Responsibility |
| --- | --- |
| `src/engine.js` | Immutable legal moves, check/outcomes, versioned recording validation |
| `src/search.js` | Pure search used only inside the Worker at runtime |
| `src/bot.worker.js` | Worker request/progress/result protocol |
| `src/bot-client.js` | Worker termination, request/position guards, deadline and error recovery |
| `src/game.js` | Live state, historical view, storage, mode and turn-aware undo |
| `src/main.js` | GyosJS signals, keyed rendering, input, dialogs and lifecycle cleanup |
| `src/online.js` | Canonical room snapshots, saved seat/pending request, reconnect and cleanup |
| `server/rooms.js` | Authoritative commands, seats, revisions, receipts and disk persistence |
| `server/app.js` | Same-origin HTTP API and production static server |

The board uses stable piece IDs as `g-key`; moving a piece updates its position on the same DOM element. The engine stays independent of the UI. Worker messages carry plain snapshots, and accepted replies are checked again against the current position and legal moves.

See [dogfood findings](docs/DOGFOOD.md), [verification evidence](docs/VALIDATION.md) and [accepted scope](docs/PLAN.md). Source is maintained in [hohphu8/rivergate](https://github.com/hohphu8/rivergate); deployment is managed by the owner.

See the [bundle follow-up](docs/PERFORMANCE.md) for measured CSP namespace-import savings; the published runtime pin and Worker behavior are unchanged.

See the [0.5.6 runtime rollout](docs/RUNTIME-0.5.6.md) for validation of the subsequent npm upgrade.

See [gameplay feedback](docs/GAMEPLAY-FOLLOWUP.md) for last-move visibility, side contrast, casual repetition explanations, tactical search changes and the proposed online-room milestone.
