# Refactor Cleanup Design

## Goal

Reduce codebase dirt while preserving game behavior. The cleanup should make the source easier to navigate, reduce oversized files where the boundaries are clear, and avoid disturbing generated assets or unrelated in-progress changes.

## Current Context

The project is a browser/Electron life simulation game that uses global browser scripts under `window.Game`. The script order in `index.html` is the module boundary today. The largest maintenance problems are concentrated in source files rather than assets:

- `js/renderer.js` is about 1,590 lines and mixes Phaser scene setup, projection math, path/grid work, sprite lifecycle, texture selection, camera behavior, and draw ordering.
- `js/ui.js` is about 873 lines and mixes main menu flow, panel rendering, notifications, graphics controls, and modal behavior.
- Generated or backup-looking files exist near source code, including `js/assets.js`, `js/renderer_utf8.js`, and `js/renderer.js.backup`.
- The working tree already contains broad changes, so the refactor must avoid reverting or overwriting user work.

## Recommended Approach

Use a targeted source cleanup that keeps the current browser-script architecture and public globals stable. Do not migrate to ES modules or a bundler in this pass.

The refactor may use small behavior-preserving rewrites where they clarify responsibilities, remove duplication, or make split files easier to test. It should not intentionally change gameplay, UI flows, save format, asset keys, input behavior, or Electron startup.

## Architecture

Keep these public globals as the compatibility contract:

- `Game.Renderer`
- `Game.UI`
- `Game.State`
- Existing domain modules such as `Game.Character`, `Game.Economy`, `Game.House`, `Game.Social`, `Game.Events`, and `Game.Prestige`

Add small helper modules under `js/` and load them before their consumers in `index.html`. Helpers should attach to `Game.*` namespaces rather than using a new module system.

Likely renderer helper boundaries:

- Projection and coordinate conversion helpers.
- Tile/furniture footprint and depth-order helpers.
- Texture/key lookup helpers.
- Pathfinding/grid helper setup where it can be separated without changing runtime behavior.

Likely UI helper boundaries:

- DOM lookup and class toggling helpers.
- Main menu/save-list flow, if it has clean dependencies.
- Panel rendering helpers, if extraction does not create a tangled API.

Generated assets and large packed files should remain untouched unless they are directly loaded incorrectly. Backup/development leftovers should be moved out of active load paths or ignored by verification only when that is clearly safe.

## Data Flow

The runtime flow stays the same:

1. `index.html` loads vendor libraries, config/state/domain modules, assets, renderer, autonomy/interaction, UI, and main loop in order.
2. Modules attach functions to `window.Game`.
3. `Game.Main` initializes state, renderer, UI, input, and the loop.
4. Renderer reads state through existing state APIs and draws the active map.
5. UI reads state/domain APIs and dispatches actions through existing modules.

Any new helper file must be loaded before the file that uses it. If a helper needs to be optional during tests, consumers must fail clearly with a useful error rather than silently changing behavior.

## Error Handling

Preserve existing user-facing behavior. Refactor-only changes should not introduce new alerts, notifications, save migrations, or fallback paths unless needed to keep current behavior working after extraction.

For developer-facing errors, prefer explicit guards when a required helper namespace is missing. This makes script-order mistakes easier to diagnose.

## Testing

Verification should use the existing `npm test` flow, which currently performs:

- Node syntax checks for browser and Electron scripts.
- Resource checks for embedded assets and furniture definitions.
- Electron runtime smoke test that starts a new game and validates canvas, preloaded assets, rooms, and furniture.

If files are split, update `scripts/verify-game.js` and `index.html` together so syntax checks and runtime script ordering remain accurate.

## Scope

In scope:

- Extract focused helpers from `renderer.js` and possibly `ui.js`.
- Reduce duplicated calculations or repeated DOM operations where low risk.
- Clean comments that document old migration steps when they obscure current behavior.
- Keep source and verification structure consistent after the split.

Out of scope:

- ES module or bundler migration.
- Save format redesign.
- Asset pipeline redesign.
- Visual redesign or gameplay tuning.
- Large-scale formatting churn across files unrelated to the extracted code.
