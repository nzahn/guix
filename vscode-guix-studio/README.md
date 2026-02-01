# vscode-guix-studio (Phase 1 scaffolding)

This folder contains a minimal VS Code extension scaffold for GUIX Studio projects (`.gxp`).

## Development

1. Build the CLI (from repo root):

```sh
cmake -S tools/guix_studio_cli -B build/guix_studio_cli
cmake --build build/guix_studio_cli
```

2. Build the extension:

```sh
cd vscode-guix-studio
npm install
npm run compile
```

3. Run/debug in VS Code:
- Use the standard “Run Extension” launch configuration (add one if needed).
- Run `GUix: Open Project (.gxp)`.

## Configuration
- `GUIX_STUDIO_CLI_PATH` can be set to point to a built `guix_studio_cli` binary.

## Current scope
- Project summary via `guix_studio_cli summary --json`.
- Generate outputs via `guix_studio_cli generate --output_path <dir>` (Phase 1: exports a minimal resource-project XML and can emit stub resource/spec/binary outputs).
- Validate project via `guix_studio_cli validate --json`, surfaced as VS Code Diagnostics (Problems panel) on save.
- A basic “GUIX Projects” view listing workspace `.gxp` files (with context menu actions).
