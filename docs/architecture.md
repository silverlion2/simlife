# SimLife Architecture

## System boundary

SimLife is a static browser game that also runs inside Electron. The runtime loads `index.html`, CSS, and global `window.Game` modules under `js/`. Local save data is stored in browser localStorage through `Game.State`; there is no server dependency in normal play.

## Data flows

- Boot: Electron/browser loads `index.html`; guarded UI/controller initialization runs once, then `Game.Renderer` starts Phaser once and resolves a shared readiness promise.
- New game: character creation calls `Game.State.createSave`, then `Game.Main.init` starts simulation and rendering.
- Activity click: `Game.UI.startActivityFromPanel` queries the central target-aware activity contract, then calls `Game.Character.startActivity` or queues a target-preserving entry through `Game.Character.queueActivity`. Interaction and autonomy use the same contract.
- Build action: Build tab item calls `Game.UI.startBuild`, sets a build ghost in `Game.State.get().ui`, then placement calls `Game.House`.
- Save/load: `Game.State` strips transient path/UI state, validates resource/depth/map-entry and persistent-collection schemas, and commits slots/index metadata with rollback. Page hide or backgrounding performs a best-effort synchronous save of the active slot.

## Failure modes

| Dependency or component | Failure | User impact | Detection | Recovery |
|---|---|---|---|---|
| Phaser renderer | WebGL unavailable or context lost | Game is not playable | Browser/Electron smoke and blocking recovery overlay | Fall back to Canvas at boot; save and reload from the recovery dialog after context loss |
| Avatar assets | Missing layer texture | Sim appears broken | `npm test` avatar debug check | Restore generated PNG/atlas assets |
| Build placement | Invalid room/furniture target | Action fails | UI notification/manual playtest | Keep ghost active so player can retry |
| Local save | Corrupt, oversized, nested-invalid, or malformed persistent-array import | Save cannot load | Pure malformed-save suite and import error path | Reject before derived systems/rendering and leave the active slot/index intact |
| Browser storage | Storage unavailable or quota failure | Saves/settings cannot persist | Rollback and storage-failure tests | Keep in-memory play usable, report the failure, and do not leave a partial transaction |

## Security

- No authentication or remote authorization in the local game.
- Do not commit secrets or credentials.
- Imported saves are parsed locally and should fail closed on malformed data.
- Electron uses context isolation, a sandboxed renderer, no Node integration, denied child windows/navigation, and a narrow validated Steam IPC surface.

## Operations

- Development: run through Electron or static browser page.
- Verification: `npm test` runs structure, provenance, generated-asset, syntax, TypeScript, pure, and Electron gates; `npm run test:browser`, `npm run verify:artifact -- <candidate-dir>`, `npm run verify:artifact-runtime -- <candidate-dir>`, `web-sop doctor`, and `web-sop check --mode fast` cover the remaining browser, package, runtime, and SOP surfaces. The hard incremental TypeScript 7.0.2 `checkJs` gate uses `strictNullChecks` through `tsconfig.typecheck.json` and now includes the stable appearance, asset loading, avatar rendering, event, interaction, and state modules.
- Release: Electron packaging uses `npm run build:win` when a Windows build is needed. The built archive verifier inspects the actual ASAR for required runtime files, forbidden source-only material, and remote dependencies; packaged runtime smoke launches the unpacked sibling with an isolated profile and blocked external host resolution, then verifies save/load, the documented keyboard surface, pause isolation, and settings/graphics rehydration. A separate `verify:installer-lifecycle` gate is mutation-protected to GitHub Actions Windows CI: it refuses pre-existing SimLife footprints, performs a current-user silent NSIS install, passes the installed executable into the same offline runtime journey, and silently uninstalls it.
- Rollback: before publication, revert the release commit or select the previous known-good package. The automated lifecycle proves the cleanup half of rollback by removing the current candidate and checking its install directory, executable, uninstaller, shortcuts, and HKCU uninstall entry; it does not claim a previous package was reinstalled.
- CI: Linux runs SOP plus real-Chrome smoke; Windows builds an isolated NSIS candidate, verifies the actual ASAR and unpacked packaged journey, then exercises the real current-user install/launch/uninstall lifecycle. The lifecycle report and installed-runtime report/screenshot upload even when a later lifecycle stage fails.

## Workspace boundaries

- `index.html`, `main.js`, and `preload.js` are composition roots and stay at repository root because browser loading and Electron packaging reference them directly.
- `js/` and `css/` are the declared source roots. Runtime JavaScript keeps the existing `window.Game` facade until a separately approved module migration exists.
- `assets/` contains runtime art and reproducible source material; `vendor/` contains pinned offline browser dependencies. Neither directory is temporary output.
- `assets/provenance.json` separates licensed source packs, generated runtime outputs, and unresolved source-only material. Electron packaging excludes raw archives and source-only packs after generated catalogs are verified.
- `tests/pure/`, `tests/browser/`, and `tests/electron/` own the extracted verification suites. `scripts/verify-game.js` is a small compatibility launcher that preserves the previous scope-based command contract.
- `tsconfig.typecheck.json` defines the incremental JavaScript `checkJs` boundary; `scripts/generate-world-assets.js --check` and `scripts/generate-avatar-assets.js --check` are read-only consistency checks and never regenerate or overwrite committed assets.
- `artifacts/` is the ignored boundary for local screenshots, logs, reports, and other reproducible evidence. Product and engineering decisions remain in `docs/`.
- Root-level legacy utilities, downloaded research files, and duplicate renderer backups were removed through the executed migration map in `docs/improvement-proposals.md`.

## Hearthbyte Edition modules

- `Game.Campaign` owns serializable chapter progress, XP, level, rewards, and campaign-panel rendering. It reads simulation state but never owns renderer objects.
- `Game.Shell` owns the pause/settings/controls overlay, accessibility preferences, and menu input gating.
- `Game.Main` remains the simulation clock and exposes explicit speed/pause functions used by the shell.
- `Game.Renderer` owns camera zoom and presentation only. Its initial zoom is responsive, preserves mobile lot context, and does not alter simulation coordinates. Furniture sync is throttled and dirty-aware; transient emitters are destroyed after their effects finish.
- `Game.Audio` owns the master mute and volume boundary. Settings persist in localStorage and are safe when Web Audio is unavailable.

Campaign state is stored under `state.campaign`. Settings are stored under `simlife_settings_v3` because they apply across save slots. The v3 key makes the clearer, scanline-free presentation the default while retaining scanlines as an opt-in setting. Existing saves call `Game.Campaign.ensureState()` during startup and receive defaults for missing fields.

Phaser, EasyStar, NavMesh, and the rex state manager load from pinned files under `vendor/`. CDN and production `node_modules` execution are not part of the shipping boot path. Steamworks is disabled by default and only initializes when a real `SIMLIFE_STEAM_APP_ID` is supplied for a Steam-specific build.

Production Electron builds use the branded `SimLife Hearthbyte Edition` user-data directory. On first launch, `main.js` copies only the legacy profile's `Local Storage` directory when the branded profile has no local storage yet. Volatile Chromium caches are intentionally not migrated.

The shipped HTML/CSS shell has no remote runtime dependency. Preferred display fonts may be used when installed locally, but the default offline path uses the declared system font fallbacks and never imports web fonts.

## Foundation v2 boundaries

- `Game.Random` is the only source for gameplay randomness. It uses native randomness in normal play and accepts a deterministic seed in tests.
- `Game.Signals` is the event boundary for simulation-to-view notifications. Existing module facades remain compatible while new work should emit signals instead of reaching into DOM code.
- `Game.AssetManifest` defines stable domain groups and `Game.AssetLoader` owns image timeout, partial-load reporting, retry, and readiness.
- Save payloads use schema version 2. Missing versions are treated as v1 and pass through ordered, idempotent migrations that preserve unknown fields.
- `Game.UI` coordinates registered panel builders and delegated `data-action` events; panel markup contains no inline JavaScript handlers. Event, Makeover, pause, and recovery dialogs pause/isolate input and restore the exact prior speed and trigger focus.
- Phaser starts explicitly with WebGL because Phaser 4 rejects `AUTO` when a canvas is supplied, then retries with Canvas if WebGL construction fails. Loading, partial, renderer-error, and recovery states are accessible DOM overlays; error recovery pauses and inerts all underlying UI.

## World asset pipeline

- `js/assets.js` contains the original embedded world textures; generated `js/world_assets.js` extends that catalog without changing existing keys.
- `assets/custom/generated_furniture/` contains normalized 256x256 household sprites. The original 4x4 source sheet and alpha-cleaned sheet remain under `assets/custom/` for reproducibility.
- `scripts/extract-furniture-sheet.py` splits and edge-cleans the source sheet when Pillow is available. The extracted PNGs are committed, so this optional step is not required to run the game.
- `npm run generate:world` embeds the extracted household sprites plus selected directional Kenney library, dungeon, and farm assets into the offline runtime bundle.
- `npm run verify:generated` compares the generated catalogs without writing: the current checked-in output is 82 world entries and 1,000 avatar entries backed by 1,000 PNG files. The comparison normalizes CRLF to LF for generated text modules while still requiring the complete asset key/file set.
- `Game.Renderer.getFurnitureTextureReport()` exposes category-to-texture coverage for the Electron regression test.

## Performance posture

- The latest performance audit found no P1/P2 issue in the current playability and rendering paths. Long-session frame-time telemetry and spatial furniture buckets remain deferred engineering work.
- Revisit those investments if sustained frame-time p95 exceeds 33 ms, repeated stalls exceed 100 ms, or saves routinely approach thousands of objects. These are escalation thresholds, not current defects.
