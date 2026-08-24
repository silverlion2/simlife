# Test Ownership

- `pure/run.js` is the deterministic data, migration, resource, and domain-contract entry point; its checks live in `pure/verify-pure.js`.
- `electron/run.js` is the Electron-shell and rendered-runtime integration entry point; its checks live in `electron/verify-electron.js`. It defaults to deterministic Canvas/software rendering so GPU-driver availability cannot hide gameplay regressions; set `SIMLIFE_ELECTRON_GPU=1` only for a diagnostic production-renderer run.
- `browser/run.js` is the real Chrome gameplay-loop, renderer recovery, and first-run onboarding smoke test.
- `scripts/verify-packaged-artifact.js` inspects an actual generated ASAR/installer; `scripts/verify-packaged-runtime.js` exercises the unpacked sibling through an offline create/save/reload/load journey.
- `tsconfig.typecheck.json` is the incremental TypeScript 7.0.2 `checkJs` boundary with `strictNullChecks`; `npm run typecheck` is a hard SOP gate.
- `npm run verify:generated` performs a read-only, CRLF-normalized comparison of generated world/avatar outputs. The current checked-in result is 82 world entries and 1,000 avatar entries backed by 1,000 PNG files.
- `scripts/verify-game.js` is a small compatibility launcher for the historical `--scope=pure`, `--scope=electron`, and default combined invocations.
- Generated screenshots and diagnostics belong under `artifacts/`, never under `tests/`.

Run `npm run test:pure`, `npm run typecheck`, `npm run verify:generated`, `npm run test:browser`, `npm run test:electron`, or `npm test` from the repository root. `npm test` composes structure, provenance, generated-asset, syntax, typecheck, pure, and Electron gates. Electron commands require a GUI-capable session; a no-display command sandbox is not a valid Electron host. After a Windows build, run `npm run verify:artifact -- <candidate-dir>` and `npm run verify:artifact-runtime -- <candidate-dir>`. Resource-constrained hosts may additionally run `npm run verify:artifact-runtime -- <candidate-dir> --software-rendering`; Windows release CI retains the production-default packaged path while the broader integration suite stays deterministic.
