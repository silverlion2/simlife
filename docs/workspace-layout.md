# the-game Workspace Layout

## Detected contract

- Workspace kind: `single`
- Framework profile: `static`
- Package manager: `npm`
- Source roots: `not detected`

## Canonical structure

```text
index.html              Browser entry point
main.js                 Electron main process
preload.js              Electron preload
css/                    UI styling
js/                     Game modules on window.Game
assets/                 Sprites, generated avatar layers, and bundled art packs
scripts/                Verification and asset-generation scripts
docs/                   SOP, specs, plans, and release notes
.github/workflows/      CI quality checks
```

## Rules

- Keep product and engineering decisions under `docs/`.
- Keep temporary generated output under `artifacts/`.
- Keep automation under `scripts/`.
- Keep tests separate from generated output.
- Never store secrets, credentials, or production exports.
- Do not move legacy files without an approved migration map.
- Keep the static global-module architecture unless a migration plan exists.
