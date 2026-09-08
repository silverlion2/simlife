# Project Improvement Proposals

## Purpose

This document records the completed 2026-08-23/24 normalization and quality pass, plus the few updates that still require an owner or clean release host. SimLife remains a static browser/Electron game using the `window.Game` facade; no framework rewrite is proposed.

## Current quality snapshot

- The maintained source boundary is `js/` and `css/`; browser/Electron composition roots remain at repository root.
- Legacy root diagnostics, downloaded research, host-specific generators, `js/renderer.js.backup`, and `js/renderer_utf8.js` were removed after reference and package review. Generated evidence now belongs under ignored `artifacts/`.
- The local `web-sop` 1.0.0 tool, syntax lint, structure/provenance verification, static and built-ASAR package verification, pure tests, packaged Electron smoke, and real-Chrome browser smoke have distinct commands.
- The hard quality chain now includes TypeScript 7.0.2 incremental JavaScript `checkJs` with `strictNullChecks`; `npm test` runs lint, typecheck, and read-only generated-catalog verification in addition to structure, assets, pure, and Electron checks.
- Deterministic read-only generated-asset verification passes: 82 world entries and 1,000 avatar entries/files match, with CRLF normalized for generated text modules.
- Browser smoke covers desktop/mobile creation and gameplay, first-action onboarding, activity locking, event/pause focus isolation, side-panel semantics, mobile campaign visibility, responsive overflow, and renderer-loss recovery.
- The 30-state Electron visual matrix covers desktop/mobile menu, creator, gameplay, panels, build tabs, pause, notifications, event/announcer, interaction, placement, and runtime loading/partial/error states. The final polish adds a responsive mobile-creator scroll cue, a semantic coral retry action, and readable locked workshop cards.
- The exact packaged candidate now verifies the complete speed/pause/panel/autonomy/graphics/camera keyboard surface plus volume, mute, scanlines, reduced motion, and high-contrast persistence across reload in both production-default and software-rendered journeys.
- Gameplay actions use one target-aware availability contract across manual play, interaction, queueing, and autonomy. Failed paths cannot grant completion rewards.
- Save creation/import and existing-slot updates use rollback-safe transactions. Loads validate nested maps, persistent collection entries, and resource limits before committing; page hide and backgrounding save the active slot.
- The renderer starts WebGL explicitly with Canvas fallback, guards duplicate initialization, throttles furniture synchronization, culls distant furniture, caches unchanged avatars, destroys transient particle emitters, and blocks all underlying input during recovery.

## Executed migration map

Deleted files remain recoverable from Git history.

| Previous path | Disposition | Replacement or evidence |
|---|---|---|
| `check.py`, `check_load.py` | Removed undeclared browser probes | Maintained pure, Electron, and Chrome suites under `tests/` |
| `generate_banana.py`, `generate_svgs.py` | Removed host-specific generators | Catalog-driven generators under `scripts/` |
| `tmp_screenshot.js` | Removed one-off capture probe | `scripts/capture-visuals.js` and `tests/browser/run.js` |
| `series.html`, `farm_assets.txt` | Removed downloaded/generated research output | Machine-checked `assets/provenance.json` |
| `.gemini/MEMORY.md` | Removed from Git tracking; local ignored copy preserved | Durable decisions in configured `docs/` files |
| `js/renderer.js.backup`, `js/renderer_utf8.js` | Removed unreferenced duplicate renderers (about 2.24 MB) | Canonical `js/renderer.js`; structure gate prevents return |

## Remaining decisions and proposals

### P0: owner decision — repository license

`package.json` says ISC, `README.md` says MIT, and no root `LICENSE` exists. The project owner must select the intended license and confirm rights for project-owned branding/custom art. Then align all three locations. This is a release blocker and must not be guessed by tooling.

### P1: clean-host Electron publication verification

The development Electron integration suite now launches the source tree directly and connects over CDP, avoiding false failures from Playwright's Electron launcher on constrained Windows sessions. It passes in a GUI-capable session, and the current packaged candidate passes both production-default and software-rendered offline CDP journeys through create/save/reload/load, the documented keyboard controls, and settings rehydration with zero external requests. Windows CI now owns a guarded installed-lifecycle gate that requires a clean runner, installs the NSIS candidate for the current user, runs that same offline journey from the installed executable, silently uninstalls it, and uploads structured failure/cleanup evidence. The checklist remains open until the first main-branch run passes; trusted signing, owner/license decisions, previous-artifact selection, and real production smoke remain separate gates.

### P1: unresolved source-only asset provenance

`assets/isokennynl` remains source-only, has no verified license metadata, and is excluded from Electron packages. Resolve its origin or remove it in a reviewed change. It must not enter shipping globs while unresolved.

### Completed quality-gate work

- The incremental `checkJs` gate is configured in `tsconfig.typecheck.json` and enforced by the SOP configuration; it uses `strictNullChecks` without claiming a full typed migration. Appearance, asset loading, avatar rendering, events, interaction, and state joined the zero-diagnostic boundary in the final pass.
- Generated world/avatar consistency is verified read-only through `npm run verify:generated`; the current checked-in catalogs contain 82 world entries and 1,000 avatar entries/files.

### P3: threshold-triggered performance investments

- Add long-session frame-time telemetry and spatial furniture buckets only if sustained frame-time p95 exceeds 33 ms, repeated stalls exceed 100 ms, or saves routinely approach thousands of objects. The current performance audit found no P1/P2 finding.
- Split UI/renderer modules only where ownership or profiling demonstrates a problem; keep public `Game.*` contracts stable.

## Completion criteria

The technical quality pass is complete when lint, pure tests, browser and packaged-runtime smoke, structure/assets/static/ASAR verification, and the fast SOP gate pass with no material audit findings. Public release additionally requires the owner license decision, clean-host installer verification, trusted signing for broad distribution, and a recorded rollback artifact.
