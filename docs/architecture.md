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
