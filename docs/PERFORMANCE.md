# Bundle follow-up — 2026-11-15

> Runtime rollout: the app now pins published GyosJS 0.5.6. The measurements below remain the original 0.5.5 import comparison, not measurements of the new package.

Rivergate remains on **GyosJS 0.5.5** and the **CSP entry**. `src/main.js` now uses the existing namespace exports (`import * as Gyos from 'gyosjs/csp'`) so Vite can discard more unused API code. The development-only version probe reads the package's exported `package.json`; `version` is a default-object property, not a named runtime export. No rules, Worker protocol, dependency pin, CSP policy or persistence format changed.

Production build, Node 22.18.0 / Vite 6.4.6, decimal kB:

| Artifact | Before raw / gzip | After raw / gzip |
| --- | ---: | ---: |
| Application + CSP runtime JS | 252.82 / 79.82 kB | 208.71 / 66.22 kB |
| Separate bot Worker JS | 3.59 / 1.77 kB | 3.59 / 1.77 kB |

About 17.0% less gzip main JavaScript; the Worker artifact is unchanged. This is not a load-time, parse-time or FPS measurement. Static imports enable the saving in this app; dynamic namespace access can change bundler retention.

The [cross-project report](https://github.com/gyosjs/gyosjs/blob/main/docs/performance-follow-up.md) contains raw artifact evidence and the repeatable comparison script. Standard-runtime variants are smaller but have different CSP requirements, so the production import remains CSP. Existing exports are sufficient; no new framework entry/API was introduced.

Validation uses the existing rules/Worker tests and three-browser production suite, including a real module Worker, CSP without unsafe-eval, stale-result/error handling, import/save and board interaction. Keep the [earlier validation](VALIDATION.md) as historical evidence rather than silently replacing its artifact-size table.
