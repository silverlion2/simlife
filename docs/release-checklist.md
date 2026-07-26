# the-game Release Checklist

## Automated gates

- [ ] `web-sop doctor` has no errors.
- [ ] `npm test` passes.
- [ ] `web-sop check --mode fast` passes.
- [ ] `git diff --check` passes.
- [ ] Windows package build passes when shipping an installer: `npm run build:win`.

## Human verification

- [ ] Critical journeys verified
- [ ] Loading, empty, error, success, and partial states verified
- [ ] Mobile and desktop layouts verified
- [ ] Electron desktop launch verified
- [ ] Mobile-sized HUD screenshot reviewed
- [ ] Rollback procedure verified
- [ ] Production smoke test completed if a hosted build is released

## Release record

Record version, owner, timestamp, artifact path or PR URL, evidence, and rollback version.
