# the-game Workspace Layout

## Detected contract

- Workspace kind: `single`
- Framework profile: `static`
- Package manager: `npm`
- Source roots: `js/`, `css/`
- Runtime targets: modern browser and Electron
- Composition roots: `index.html`, `main.js`, `preload.js`

## Canonical structure

```text
index.html              Browser entry point
main.js                 Electron main process
preload.js              Electron preload
css/                    UI styling source root
js/                     Game source root using the window.Game facade
assets/                 Runtime sprites, generated avatar layers, and source art
vendor/                 Pinned offline runtime dependencies
scripts/                Maintained verification and asset-generation automation
tests/                  Pure and Electron verification entry points
tsconfig.typecheck.json Incremental JavaScript checkJs boundary
tools/web-sop/          Pinned local workspace-governance CLI
artifacts/              Ignored generated evidence and local diagnostics
docs/                   SOP, specs, plans, migration maps, and release notes
.github/workflows/      Continuous integration
```

## Ownership boundaries

| Area | Owns | Must not contain |
|---|---|---|
| Repository root | Runtime/package composition and project metadata | One-off diagnostics, screenshots, downloaded research pages |
| `js/`, `css/` | Shipped application source | Generated test evidence |
| `assets/`, `vendor/` | Shipped offline resources and their attributable source material | Local logs or temporary extracts |
| `scripts/` | Maintained, repeatable automation | Host-specific output paths or ad hoc patch scripts |
| `tests/` | Suite entry points and test-owned support code | Generated screenshots or production assets |
| `tools/` | Pinned repository-local development tooling | Shipped game runtime dependencies |
| `artifacts/` | Reproducible local evidence | Required runtime inputs or product decisions |
| `docs/` | Durable product, architecture, test, migration, and release decisions | Generated binaries |

## Current normalization status

- The universal SOP contract (`AGENTS.md`, `.website-sop.yml`, `.sop/`, and required `docs/`) is present.
- Source roots are explicitly declared.
- `artifacts/` is the repository boundary for future local output and is ignored except for its placeholder.
- The reviewed seven-file root cleanup was executed on 2026-08-23 after reference and packaging validation.
- `.gemini/MEMORY.md` was removed from Git tracking while its local ignored copy was preserved; durable decisions remain in `docs/`.
- `web-sop` 1.0.0 is pinned as a repository-local file dependency under `tools/web-sop/`.
- Pure, real-browser, and Electron tests have separate entry points under `tests/`; the existing npm command names remain stable.
- `npm test` composes structure, provenance, generated-asset, syntax, TypeScript 7.0.2 `checkJs`/`strictNullChecks`, pure, and Electron gates. The SOP typecheck command is configured with hard enforcement and `web-sop doctor` reports no typecheck warning; the stable appearance, asset-loader, avatar-renderer, event, interaction, and state modules are included in the zero-diagnostic boundary.
- Read-only generated checks pass for 82 world entries and 1,000 avatar entries/files; generated text comparisons normalize CRLF to LF and do not rewrite `assets/` or `js/`.
- Obsolete renderer backups (`js/renderer.js.backup` and `js/renderer_utf8.js`) were removed after confirming that runtime and packaging references use `js/renderer.js`; structure verification now forbids their return.
- Real-browser screenshots and diagnostics are generated only under ignored `artifacts/<date>/browser-smoke/` directories.
- Windows candidates and their ASAR/runtime evidence are generated under ignored `artifacts/<date>/release-candidate-*/` directories so historical `dist/` releases are never overwritten during verification.
- The performance audit found no P1/P2 issue. Telemetry and spatial furniture buckets are intentionally deferred until sustained p95 frame time exceeds 33 ms, repeated stalls exceed 100 ms, or saves approach thousands of objects.

## Rules

- Keep product and engineering decisions under `docs/`.
- Keep temporary generated output under `artifacts/`.
- Keep automation under `scripts/`.
- Keep tests separate from generated output.
- Never store secrets, credentials, or production exports.
- Do not move legacy files without an approved migration map.
- Keep the static global-module architecture unless a migration plan exists.
- Keep browser and Electron composition roots at repository root until packaging and loading references change together.
