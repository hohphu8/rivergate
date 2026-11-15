# GyosJS 0.5.6 rollout — 2026-11-15

The app now pins published `gyosjs@0.5.6` from the official npm registry. CSP namespace imports, rules, board interaction, Worker protocol and saved-game format are unchanged.

Validated locally on Windows with Node 22.18.0, Vite 6.4.6 and Playwright 1.55.1 (installed Chrome plus Playwright Firefox/WebKit):

- `npm ci --registry=https://registry.npmjs.org` and `npm audit --audit-level=high`: passed, zero audit findings.
- `npm test`: 18 rules/Worker tests passed; `npm run build` passed.
- `RIVERGATE_PRODUCTION=1 npm run test:e2e`: 42 passed, 6 existing intentional skips for development-only disposal hooks. No failures. Coverage includes drag/cancel, legal moves, history/import, the real Worker, stale replies/errors, CSP and local resources.

The earlier [bundle report](PERFORMANCE.md) and [validation report](VALIDATION.md) retain their original runtime versions and measurements. This rollout does not claim a new FPS/loading-time measurement, public deployment or physical Safari testing.
