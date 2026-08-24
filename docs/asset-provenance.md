# Asset Provenance

`assets/provenance.json` is the machine-checked inventory for verified third-party source packs, selected generated runtime art, and explicitly unresolved third-party source material.

## Policy

- Third-party source packs retain their original local license file and a SHA-256 checksum.
- Raw archives and extracted source packs are kept for reproducibility but excluded from Electron packages.
- Runtime-generated catalogs and sprite layers record their generator and inputs.
- Unknown third-party provenance is recorded explicitly; it must not be silently treated as licensed or generated content.
- `npm run verify:assets` fails when declared paths disappear, license/archive checksums change, or a licensed top-level pack is omitted from the manifest.

## Current exception

`assets/isokennynl` has no colocated license or source metadata. It is retained as source-only and excluded from packaged builds until its origin is resolved or the files are removed in a reviewed change.

The repository-level license is also unresolved: `package.json` declares ISC while `README.md` says MIT and no root license file exists. Project-owned branding, character, and custom-source rights must be documented after that legal choice is made.
