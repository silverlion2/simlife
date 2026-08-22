# SimLife Architecture

## System boundary

SimLife is a static browser game that also runs inside Electron. The runtime loads `index.html`, CSS, and global `window.Game` modules under `js/`. Local save data is stored in browser localStorage through `Game.State`; there is no server dependency in normal play.

## Data flows

- Boot: Electron/browser loads `index.html`, initializes UI, then starts Phaser rendering through `Game.Main`.
- New game: character creation calls `Game.State.createSave`, then `Game.Main.init` starts simulation and rendering.
- Activity click: `Game.UI.startActivityFromPanel` calls `Game.Character.startActivity` or queues through `Game.Character.queueActivity`, updates HUD/queue display, and closes the mobile activity panel.
- Build action: Build tab item calls `Game.UI.startBuild`, sets a build ghost in `Game.State.get().ui`, then placement calls `Game.House`.
- Save/load: `Game.State` serializes local save slots and strips transient runtime properties before persistence.

## Failure modes

| Dependency or component | Failure | User impact | Detection | Recovery |
|---|---|---|---|---|
| Phaser renderer | Canvas blank or missing | Game is not playable | `npm test` canvas pixel check | Fix renderer/assets before release |
| Avatar assets | Missing layer texture | Sim appears broken | `npm test` avatar debug check | Restore generated PNG/atlas assets |
| Build placement | Invalid room/furniture target | Action fails | UI notification/manual playtest | Keep ghost active so player can retry |
| Local save | Corrupt import | Save cannot load | Import error path | Show alert and leave existing saves intact |

## Security

- No authentication or remote authorization in the local game.
- Do not commit secrets or credentials.
- Imported saves are parsed locally and should fail closed on malformed data.

## Operations

- Development: run through Electron or static browser page.
- Verification: `npm test`, `web-sop doctor`, `web-sop check --mode fast`.
- Release: Electron packaging uses `npm run build:win` when a Windows build is needed.
- Rollback: revert the release commit or ship the previous known-good Electron package.

## Hearthbyte Edition modules

- `Game.Campaign` owns serializable chapter progress, XP, level, rewards, and campaign-panel rendering. It reads simulation state but never owns renderer objects.
- `Game.Shell` owns the pause/settings/controls overlay, accessibility preferences, and menu input gating.
- `Game.Main` remains the simulation clock and exposes explicit speed/pause functions used by the shell.
- `Game.Renderer` owns camera zoom and presentation only. Its initial zoom is responsive and does not alter simulation coordinates.
- `Game.Audio` owns the master mute and volume boundary. Settings persist in localStorage and are safe when Web Audio is unavailable.

Campaign state is stored under `state.campaign`. Settings are stored under `simlife_settings_v3` because they apply across save slots. The v3 key makes the clearer, scanline-free presentation the default while retaining scanlines as an opt-in setting. Existing saves call `Game.Campaign.ensureState()` during startup and receive defaults for missing fields.

Phaser, EasyStar, NavMesh, and the rex state manager load from pinned files under `vendor/`. CDN and production `node_modules` execution are not part of the shipping boot path. Steamworks is disabled by default and only initializes when a real `SIMLIFE_STEAM_APP_ID` is supplied for a Steam-specific build.

Production Electron builds use the branded `SimLife Hearthbyte Edition` user-data directory. On first launch, `main.js` copies only the legacy profile's `Local Storage` directory when the branded profile has no local storage yet. Volatile Chromium caches are intentionally not migrated.

## Foundation v2 boundaries

- `Game.Random` is the only source for gameplay randomness. It uses native randomness in normal play and accepts a deterministic seed in tests.
- `Game.Signals` is the event boundary for simulation-to-view notifications. Existing module facades remain compatible while new work should emit signals instead of reaching into DOM code.
- `Game.AssetManifest` defines stable domain groups and `Game.AssetLoader` owns image timeout, partial-load reporting, retry, and readiness.
- Save payloads use schema version 2. Missing versions are treated as v1 and pass through ordered, idempotent migrations that preserve unknown fields.
- `Game.UI` coordinates registered panel builders and delegated `data-action` events; panel markup contains no inline JavaScript handlers.
- Phaser selects the best available renderer through `Phaser.AUTO`; runtime loading, partial, renderer-error, and recovery states are DOM overlays.

## World asset pipeline

- `js/assets.js` contains the original embedded world textures; generated `js/world_assets.js` extends that catalog without changing existing keys.
- `assets/custom/generated_furniture/` contains normalized 256x256 household sprites. The original 4x4 source sheet and alpha-cleaned sheet remain under `assets/custom/` for reproducibility.
- `scripts/extract-furniture-sheet.py` splits and edge-cleans the source sheet when Pillow is available. The extracted PNGs are committed, so this optional step is not required to run the game.
- `npm run generate:world` embeds the extracted household sprites plus selected directional Kenney library, dungeon, and farm assets into the offline runtime bundle.
- `Game.Renderer.getFurnitureTextureReport()` exposes category-to-texture coverage for the Electron regression test.
