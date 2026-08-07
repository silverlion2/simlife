# the-game Release Checklist

## Automated gates

- [x] `web-sop doctor` has no errors.
- [x] `npm test` passes.
- [x] `web-sop check --mode fast` passes.
- [x] `git diff --check` passes.
- [x] Windows package build passes when shipping an installer: `npm run build:win`.
- [x] Installer uses the `SimLife Hearthbyte Edition` product identity and contains no test-only runtime dependencies.

## Human verification

- [x] Critical journeys verified
- [ ] Loading, empty, error, success, and partial states verified
- [x] Mobile and desktop layouts verified
- [x] Electron desktop launch verified
- [ ] Electron launch verified with external network requests blocked
- [x] New Roots campaign advances and rewards only once
- [ ] Pause, save, resume, controls, and settings verified
- [x] Existing save migration verified
- [x] Mobile-sized HUD screenshot reviewed
- [x] Desktop gameplay and pause-shell screenshots reviewed
- [x] Character creation preview shows the selected layered avatar clearly
- [x] Initial desktop camera makes the starter home the dominant playfield subject
- [ ] Rollback procedure verified
- [ ] Production smoke test completed if a hosted build is released

## Release record

Record version, owner, timestamp, artifact path or PR URL, evidence, and rollback version.

- Version: 2.0.0
- Owner: SimLife Team
- Verified: 2026-08-07 Asia/Shanghai
- Artifact: `dist/SimLife-Hearthbyte-2.0.0-Setup.exe` (139.58 MB, x64 NSIS)
- SHA-256: `845104626FADA875E974C8F66FFDB74F06E848AFF17FFFD88860D2EB5B70C4F4`
- Evidence: release SOP passed against `https://registry.npmjs.org`; zero audited vulnerabilities; packaged clean-profile smoke passed with Phaser 4.0.0, one canvas, zero console errors, and no horizontal overflow.
- Distribution hold: apply a trusted Windows code-signing certificate before broad public distribution. Configure `SIMLIFE_STEAM_APP_ID` only for a Steam-specific build.
- Rollback version: set at publication time.
