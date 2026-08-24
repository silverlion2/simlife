# the-game Release Checklist

## Automated gates

- [x] `npm run sop:doctor` runs from the pinned local `web-sop` 1.0.0 tool with the configured hard typecheck gate and no typecheck warning.
- [x] `npm test` passes in a GUI-capable Windows session, including structure, provenance, generated-asset, syntax, TypeScript 7.0.2 `checkJs`/`strictNullChecks`, pure, and deterministic software-rendered Electron integration; the no-display command sandbox is not a valid Electron host.
- [x] Pure/data and Electron gates are independently runnable through `npm run test:pure` and `npm run test:electron`.
- [x] `npm run test:browser` passes in installed Chrome with desktop/mobile creation and gameplay, modal isolation, responsive HUD, and renderer-loss recovery.
- [x] `npm audit --audit-level=high --registry=https://registry.npmjs.org` reports zero vulnerabilities.
- [x] `npm run sop:check` passes in fast mode without skipped runtime coverage or typecheck warnings in a GUI-capable Windows session.
- [x] `npm run verify:generated` passes in read-only mode for 82 world entries and 1,000 avatar entries backed by 1,000 PNG files; CRLF-normalized generated text matches the checked-in catalogs.
- [x] Performance audit found no P1/P2 issue; telemetry and spatial furniture buckets are deferred unless sustained frame-time p95 exceeds 33 ms, repeated stalls exceed 100 ms, or saves approach thousands of objects.
- [x] `git diff --check` passes for the current source set.
- [x] Static package contract passes through `npm run build:verify`; product identity and runtime file globs are valid.
- [x] Rebuilt a current isolated Windows candidate and verified its sibling unpacked payload through menu → create → render → save → reload → Load World with external host resolution blocked. Clean-host installer install/uninstall remains a publication gate.
- [ ] Resolve the repository license mismatch (ISC in `package.json`, MIT in README, no root `LICENSE`) through an owner decision.

## Human verification

- [x] Critical journeys verified
- [x] Loading, empty, error, success, and partial states verified through the real-browser empty/recovery checks and the 2026-08-24 30-state Electron visual capture
- [x] Mobile and desktop layouts verified
- [ ] Electron desktop install/launch re-verified on a separate clean host (development integration and the packaged candidate both pass on this host when launched from a GUI-capable session)
- [x] Packaged Electron launch verified with Chromium external host resolution blocked; the page issued zero HTTP(S) requests
- [x] New Roots campaign advances and rewards only once
- [x] Event and pause surfaces preserve speed, isolate underlying input, focus their primary action, and restore the UI in real Chrome
- [x] Active-slot autosave, page-hide/background save, manual save, and transaction rollback are covered by pure/browser tests
- [x] Full keyboard controls and persisted settings re-verified against the exact packaged candidate in fresh isolated Electron profiles; clean-host installation remains separate
- [x] Existing save migration verified
- [x] Mobile-sized HUD screenshot reviewed
- [x] Desktop gameplay and pause-shell screenshots reviewed
- [x] Character creation preview shows the selected layered avatar clearly
- [x] Initial desktop camera makes the starter home the dominant playfield subject
- [x] Bright storybook palette is consistent across menu, creator, gameplay HUD, and pause
- [x] Every engine panel, modal, notification, announcer, interaction wheel, and placement state uses the shared semantic palette
- [x] `npm run test:visual` recaptured all 30 desktop/mobile and transient Electron states; no page/console errors or temporary process/profile residue remained
- [x] Camera centers correctly at responsive zoom levels and the starter landscaping remains visible around the HUD
- [x] Expanded 130-texture world bundle and 32 distinct household sprites verified by assets/pure checks and fresh desktop/mobile Chrome screenshots
- [ ] Rollback procedure verified
- [ ] Production smoke test completed if a hosted build is released

## Release record

Record version, owner, timestamp, artifact path or PR URL, evidence, and rollback version.

- Status: unsigned release candidate; not approved for public distribution until owner/legal and clean-host publication gates close
- Version: 2.0.0
- Owner: SimLife Team
- Verified: 2026-08-24 Asia/Shanghai
- Candidate: `artifacts/2026-08-24/release-candidate-continuation/SimLife-Hearthbyte-2.0.0-Setup.exe` (119,851,211 bytes, x64 NSIS)
- SHA-256: `0815E6CCFE95D6ACCB046CC5E8F6030163744C5AE83C069F675FF2D524F2584F`
- Package evidence: `npm run verify:artifact -- artifacts/2026-08-24/release-candidate-continuation` passed with a 27,969,657-byte ASAR, 1,144 entries, zero forbidden/source-only entries, and zero remote runtime dependencies. Windows Authenticode reports `NotSigned`.
- Runtime evidence: both `npm run verify:artifact-runtime -- artifacts/2026-08-24/release-candidate-continuation` and its explicit `--software-rendering` fallback passed against this exact candidate using isolated profiles and blocked external host resolution. In addition to create/save/reload/load, the gate verified speed keys 1/2/3, Space, B/J, Q, L, WASD/arrows, C/Home, Escape pause isolation/focus, and five persisted settings with localStorage, body-class, and control rehydration. Both paths rendered 41/41 furniture sprites and 130/130 assets with one canvas, zero page/console errors, and zero HTTP(S) requests. The production-default path kept `rendererOverride: null`; only software mode applied the Canvas override, and each mode retains a separate smoke screenshot. All test-owned processes and temporary profiles were removed after completion.
- Visual evidence: `artifacts/2026-08-24/visual-review-continuation-polished/` contains 30 reviewed PNG states (15,757,706 bytes) including mobile creation, every major panel, runtime recovery states, events, pause, placement, and responsive gameplay.
- Previous candidate: `artifacts/2026-08-24/release-candidate-final/SimLife-Hearthbyte-2.0.0-Setup.exe`, SHA-256 `C521B625927F8883DB4BE8B428302F10A9E4C22171958375F44B7AE98D2EA183`, remains preserved as prior evidence and was not overwritten.
- Historical artifact: `dist/SimLife-Hearthbyte-2.0.0-Setup.exe`, SHA-256 `845104626FADA875E974C8F66FFDB74F06E848AFF17FFFD88860D2EB5B70C4F4`, remains the 2026-08-07 build and was not overwritten.
- Distribution hold: apply a trusted Windows code-signing certificate before broad public distribution. Configure `SIMLIFE_STEAM_APP_ID` only for a Steam-specific build.
- Rollback version: set at publication time.
