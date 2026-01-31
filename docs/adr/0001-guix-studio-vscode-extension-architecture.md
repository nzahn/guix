# ADR 0001: GUIX Studio as a VS Code extension (architecture)

- Status: Proposed
- Date: 2026-01-31

## Context
Legacy GUIX Studio lives in `guix_studio/` and is a Windows/MFC application using MFC/Win32 types (`CString`, `CFile`, Windows path separators) intertwined with project parsing and output generation.

We want a cross-platform VS Code extension that supports:
- Visual layout editing (canvas + widget tree + properties) for `.gxp` projects.
- Generating outputs compatible with current Studio: C source/header, specification, binary resource `.bin`/`.srec`, and standalone binary resources.
- Backward compatibility: older `.gxp` versions exist in-tree (e.g. `<project_version>55</project_version>`), while current Studio uses `PROJECT_VERSION` defined in `guix_studio/StudioXProject.h`.

Existing “headless/no GUI” CLI semantics already exist in `guix_studio/CommandInfo.cpp` (`-n`, `-r`, `-s`, `-x`, `-b`, `--big_endian`, theme/display/language filters, `--output_path`). Generation entry points include `guix_studio/resource_gen.cpp` and `guix_studio/binary_resource_gen.cpp`.

## Decision
We will build GUIX Studio for VS Code using a 2-part architecture:

1) **Portable generator core + CLI**
- Extract/port the non-UI “Studio engine” into a portable C++ library (proposed name: `studio_core`) plus a cross-platform CLI executable (proposed: `guix_studio_cli`).
- The CLI becomes the single source of truth for generation and validation. The VS Code extension invokes the CLI.

2) **VS Code extension UI (TypeScript + Webviews)**
- Implement the visual designer (canvas + widget tree + properties) in the extension using a Webview UI.
- The extension owns editing UX and writes `.gxp` changes (via text edits or an in-memory model), while delegating generation/validation to the CLI.

### Backward compatibility policy
- **Open older `.gxp` versions by migrating in-memory** to the latest schema.
- Provide an explicit command to persist upgrades (e.g. `GUix: Migrate Project to Latest`).
- Avoid silent on-disk migrations during open to reduce surprises and to preserve older files for debugging/regression.

## Options considered

### A) Extract portable C++ core + CLI (chosen)
Pros:
- Reuses the known-good generation logic and keeps output compatibility high.
- Provides a stable seam between UI (VS Code) and engine (CLI).
- Supports CI validation via golden file comparisons.

Cons:
- Requires disentangling MFC/Win32 types from generator code.
- Requires packaging binaries for macOS/Linux/Windows.

### B) Full TypeScript rewrite of parsing + generators
Pros:
- Single language stack for the extension.
- Easier packaging (no native binaries).

Cons:
- High risk of incompatibilities/regressions vs current Studio outputs.
- Large scope: reimplement resource generators, binres/srec formats, edge cases.

### C) Native addon / WASM binding to existing Studio engine
Pros:
- Some reuse without major refactors.

Cons:
- Complex build/packaging/debug story across platforms.
- Toolchain friction for users; harder to keep reliable.

## Consequences
- We will introduce a new “tooling” build surface for the CLI and possibly a portable `studio_core` library.
- The extension’s primary responsibilities are:
  - UX (designer canvas, tree, properties, undo/redo)
  - `.gxp` edit model + schema migration UI
  - Invoking the CLI and surfacing errors via Diagnostics/Output Channel
- We must define and maintain a migration test corpus (fixture `.gxp` files + expected results).

## Implementation notes / next steps
- Create the CLI skeleton that matches `guix_studio/CommandInfo.cpp` arguments.
- Choose an XML implementation for `studio_core`:
  - Option: keep/port `guix_studio/xml_reader.h` + `xml_writer.h` with minimal dependencies, or
  - Adopt a standard XML library (e.g. pugixml/tinyxml2) and implement exact writer formatting only where required.
- Define a minimal “designer rendering model” for webview:
  - widget rectangles, names/IDs, parent/child relationships, z-order.
- Pin initial fixtures (see `docs/guix_studio_vscode_extension_TODO.md`) and start golden generation comparisons early.
