# vscode-guix-studio (Phase 1 scaffolding)

This folder contains a minimal VS Code extension scaffold for GUIX Studio projects (`.gxp`).

## Development

1. Build the CLI (from repo root):

```sh
cmake -S tools/guix_studio_cli -B tools/guix_studio_cli/build
cmake --build tools/guix_studio_cli/build
```

Alternative (out-of-source build under repo root):

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
- Run `GUIX: Open Project (.gxp)`.

## Configuration
- `guixStudio.cli.path`: explicit path to the `guix_studio_cli` binary.
- `guixStudio.outputPath`: default output directory for generation (set to avoid prompting). If relative, it is resolved against the workspace folder.
- `guixStudio.generateOnSave`: run “Quick Generate” on `.gxp` save (requires `guixStudio.outputPath`).
- `GUIX_STUDIO_CLI_PATH`: environment variable override.
- Command: `GUIX: Select CLI Path`.
- Command: `GUIX: Add VS Code Tasks` (adds/merges `.vscode/tasks.json` with GUIX tasks).

## Commands
- `GUIX: Generate Outputs`: interactive generation with prompts.
- `GUIX: Quick Generate (Active .gxp)`: no prompts; uses `guixStudio.outputPath`.
- `GUIX: Build CLI (CMake)`: configures/builds `tools/guix_studio_cli` in the current workspace and sets `guixStudio.cli.path`.

## Bundling a prebuilt CLI (optional)
If you want the extension to carry a prebuilt `guix_studio_cli`, place it under one of these paths:
- `vscode-guix-studio/bin/guix_studio_cli`
- `vscode-guix-studio/bin/<platform>/guix_studio_cli`
- `vscode-guix-studio/bin/<platform>-<arch>/guix_studio_cli`

Where `<platform>` is `darwin`, `linux`, or `win32`, and `<arch>` is `x64`, `arm64`, etc.

Notes on tasks:
- If `guixStudio.outputPath` is set, generated tasks will use it via `${config:guixStudio.outputPath}`.
- Otherwise tasks default to writing under `${workspaceFolder}/guix_studio_out`.

## Current scope
- Project summary via `guix_studio_cli summary --json`.
- Generate outputs via `guix_studio_cli generate --output_path <dir>` (Phase 1: exports a minimal resource-project XML and can emit stub resource/spec/binary outputs).
- Validate project via `guix_studio_cli validate --json`, surfaced as VS Code Diagnostics (Problems panel) on save.
- A basic “GUIX Projects” view listing workspace `.gxp` files (with context menu actions).
