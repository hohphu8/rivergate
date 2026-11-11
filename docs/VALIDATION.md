# Rivergate verification

Verified locally on **2026-11-12** (Asia/Saigon), Windows, Node **22.18.0**, GyosJS **0.5.2** from the official npm registry. This rollout removes the 0.5.1 accessor workaround and binds the import textarea directly to its signal. The suites below were rerun against the installed npm package without a local core alias.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Node rules/controller/Worker-client tests | **18 passed** | `tests/engine.test.js`, `tests/game.test.js`, `tests/bot.test.js` |
| Dev browser suite | **36 passed**, 0 flaky, 0 skipped | `.local/development-results.json`; all 12 scenarios on Chrome, Firefox, WebKit |
| Production browser suite | **33 passed**, 0 flaky, 3 intentional skips | `.local/production-results.json`; development-only teardown hook is absent in production |
| Scope teardown | **3 passed**, included in dev suite | Worker termination, replay timer removal, listener AbortSignals on all three browsers |
| Production build | Passed | `dist/index.html` and bundled JS/CSS/module Worker |
| npm audit | **0 vulnerabilities reported** | Official npm registry audit on verification date |
| Visual review (initial 0.5.1 delivery) | Passed for reviewed layouts; not repeated for this runtime-only rollout | Chrome 157.0.8103.39, desktop 1440×1100 and mobile 390×844; 320px overflow checked by all browser projects |
| Dependency provenance | Official registry | Exact `gyosjs: 0.5.2`; lockfile tarball `https://registry.npmjs.org/gyosjs/-/gyosjs-0.5.2.tgz`, no npmmirror URL |

`.local/`, `dist/`, and Playwright artifacts are ignored in Git. Reports and screenshots remain on the delivery machine; commands and tests are committed so they can be reproduced. Screenshots reviewed: `.local/desktop-final.png`, `.local/mobile-final.png`, and the per-browser mobile captures.

## Requirement-to-evidence audit

| Requirement | Concrete verification |
| --- | --- |
| Seven piece types and constraints | Fixed fixtures for horse legs, elephant eyes/river, palace bounds, rook blocking, cannon screens, pawn river/edge behavior; up to 300 sampled plies also compare a side-swapped 180° rotation |
| Check, facing generals and end conditions | Pinned blocker/self-check fixtures, distinct mate and stalemate-loss fixtures, two complete repetition cycles, move cap, terminal record rejection |
| Deterministic legal reconstruction | Replay sampled legal games and compare full final state; reject wrong rule versions, invalid coordinates/types, extra moves after a terminal result and conflicting manual endings |
| Local two-player interaction | Two-sided moves, legal hints, undo, board flip, piece-name toggle and keyboard focus navigation on three browsers |
| Bot in a real Worker | Actual legal reply in dev and production; generated Worker URL observed under `/assets/` in production; flip remains operable while search runs |
| Cancellation and stale replies | Controlled Workers explicitly deliver captured callbacks after undo, new game, history navigation and mode switch; move count and board stay correct |
| Failure recovery | Worker errors, invalid returned moves, construction errors, timeout, retry and local-mode fallback; no board replacement by an illegal reply |
| Save/resume | Reload resumes live game and mode; browsing history does not overwrite the saved board; blocked storage and corrupt JSON display a recovery message |
| History/replay | Read-only first and last frames, timed replay, explicit return to live play, continued legal play afterward |
| Import/export | Actual browser download; invalid typed input preserves the current game; file import after a failed typed import updates the model and loads a validated game |
| Confirmations/results | Cancelled new-game dialog preserves moves; confirmed reset clears the game; draw/resign show the result; help states the approved casual-rule limits |
| Mouse, touch, keyboard | Mouse clicks, actual Playwright touch taps in `hasTouch` contexts, arrow-key navigation before/after flip; reduced-motion CSS and narrow-layout checks |
| Lifecycle | Scope cleanup terminates pending Worker, ignores a delayed reply, clears the active 850ms replay timer, and aborts dialog/visibility listener signals |
| CSP and local resources | Real game + Worker under `script-src 'self'` without `unsafe-eval`, with zero recorded CSP violations; no external requests during the observed gameplay |
| Reproducible GyosJS findings | Isolated HTML repro, observed JSON and source-level diagnosis in `docs/repros/` and `docs/DOGFOOD.md` |
| Git delivery | Incremental commits in `hohphu8/rivergate`; server deployment remains owner-managed |

## Production artifact sizes

Vite 6.4.6 reported:

| Artifact | Bytes displayed by Vite | Gzip displayed by Vite |
| --- | ---: | ---: |
| HTML | 17.21 kB | 4.95 kB |
| Application + GyosJS CSP JS | 246.27 kB | 77.52 kB |
| CSS | 13.46 kB | 3.89 kB |
| Dedicated Worker JS | 3.59 kB | Not reported |

These are bundle sizes, not a loading-speed or FPS benchmark.

## Limits of this verification

Playwright's WebKit is not a physical iPhone/Safari test. Touch coverage uses emulated touch contexts; physical Android/iOS, screen-reader usability, long-duration memory profiling and rated bot strength were not measured. Rules tests are fixtures and sampled invariants, not an exhaustive formal proof. Full WXF repetition adjudication and no-progress rules are explicitly outside the approved scope.

The signal/`g-model` issue is fixed in published GyosJS 0.5.2. Rivergate now uses `g-model="importText"` directly. The existing invalid-typed-JSON to valid-file-import journey passes on all three browsers in dev and production. The isolated reproduction also passes with the published package; see [0.5.2 observations](repros/observed-0.5.2.json). The original [0.5.1 observations](repros/observed-0.5.1.json) remain unchanged as historical evidence.
