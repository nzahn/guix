# ADR 0002: VS Code Extension Release Packaging (CLI Binaries)

## Status
Accepted (initial approach)

## Context
The VS Code extension needs a working `guix_studio_cli` binary to provide:
- project validation and diagnostics
- resource-project XML export
- generation workflows (current Phase 1 subset)
- import/export flows (CSV, XLIFF)

Users should be able to install the extension and use it immediately on supported platforms, without manual builds or additional downloads.

We already have CI producing a VSIX artifact that bundles per-platform `guix_studio_cli` binaries for evaluation, and the extension runtime can discover these binaries under `vscode-guix-studio/bin/<platform>(-<arch>)/guix_studio_cli`.

## Decision
Ship the VSIX with platform-specific `guix_studio_cli` binaries bundled inside the extension package.

This is the default distribution approach for the MVP and early releases.

## Rationale
- **Fast “install and go” UX**: no first-run download, no toolchain required.
- **Reliability**: avoids network failures and corporate proxy friction.
- **Reproducibility**: extension behavior is tied to a known CLI build.
- **Low operational complexity**: no hosting/version negotiation/bootstrap logic.

## Consequences
- **Larger VSIX**: one VSIX will include binaries for multiple platforms unless we publish per-platform VSIX variants.
- **Security/updates**: updating the CLI requires publishing a new extension version.
- **Marketplace constraints**: we must monitor VSIX size limits and keep dependencies lean.

## Alternatives considered
1) **Separate downloads + fetch-on-first-run**
   - Pros: smaller VSIX, can update CLI independently.
   - Cons: requires download hosting, integrity verification, proxy handling, offline story.

2) **Build from source in the user workspace**
   - Pros: always matches source.
   - Cons: requires CMake toolchain, slower, brittle across environments; best kept as a fallback.

## Follow-ups
- If VSIX size becomes problematic, consider publishing per-platform VSIX packages or switching to fetch-on-first-run.
- Keep `.vscodeignore` tight (TypeScript sources excluded; whitelist only required runtime deps).
- Continue to support a user override (`guixStudio.cli.path`) and a build-from-source fallback command.
