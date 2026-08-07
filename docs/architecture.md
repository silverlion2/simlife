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

Campaign state is stored under `state.campaign`. Settings are stored under `simlife_settings_v2` because they apply across save slots. Existing saves call `Game.Campaign.ensureState()` during startup and receive defaults for missing fields.

Phaser, EasyStar, NavMesh, and the rex state manager load from pinned files under `vendor/`. CDN and production `node_modules` execution are not part of the shipping boot path. Steamworks is disabled by default and only initializes when a real `SIMLIFE_STEAM_APP_ID` is supplied for a Steam-specific build.

Production Electron builds use the branded `SimLife Hearthbyte Edition` user-data directory. On first launch, `main.js` copies only the legacy profile's `Local Storage` directory when the branded profile has no local storage yet. Volatile Chromium caches are intentionally not migrated.
