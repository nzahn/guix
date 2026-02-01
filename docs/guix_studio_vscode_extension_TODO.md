# GUIX Studio → VS Code Extension (Plan / TODO)

## How to use this document
- Treat each milestone (M0–M5) as a “chapter”. Each chapter has a **Definition of done** and a checklist.
- Keep work incremental: update checkboxes as you land changes.
- Prefer adding links to concrete artifacts (code, tests, fixtures) so this stays executable.

## Chapter template (copy/paste)
Use this format when adding new chapters or expanding an existing one:

### Mx — <Title>
**Goal:** <what this chapter achieves>

**Definition of done:**
- [ ] <user-visible behavior / verifiable outcome>
- [ ] <tests or smoke checks run>
- [ ] <docs updated>

**Tasks:**
- [ ] <task>
- [ ] <task>

## Current status (as of this branch)
- CLI exists and runs on macOS: [tools/guix_studio_cli/README.md](tools/guix_studio_cli/README.md)
- VS Code extension scaffolding exists and compiles: [vscode-guix-studio/README.md](vscode-guix-studio/README.md)
- Commands implemented: Open Project, Project Summary, Generate Outputs, Validate Project

## Goal
Replace the legacy Windows/MFC GUIX Studio app in `guix_studio/` with a cross-platform VS Code extension that can:
- Open and edit GUIX Studio project files (`.gxp`) and resource-project XML.
- Generate the same outputs as Studio (C source/header, specification, binary resource `.bin`/`.srec`, standalone binres) with compatible defaults.
- Provide a visual designer (layout + widget tree + properties) that maps to GUIX runtime concepts.

## Non-goals (for the first MVP)
- Reproducing every MFC dialog/panel pixel-for-pixel.
- Shipping a full Win32 app runner inside VS Code.
- Full feature parity with every legacy Studio feature on day 1 (e.g., every specialized editor/dialog).

## Key constraints discovered in this repo
- Project format is XML (`.gxp`) written by `studiox_project::Save()` in `guix_studio/StudioXProject.cpp`.
- Backward compatibility matters: real projects in-tree use older `<project_version>` values (e.g. `55`) while current Studio uses `PROJECT_VERSION` in `guix_studio/StudioXProject.h`.
- Studio already has a “no GUI” command line mode (`-n/--nogui`) and can generate:
  - from `.gxp`: resource/spec outputs (`-r/--resource`, `-s/--specification`, plus filters for display/theme/language)
  - from resource XML: binary output (`-x/--xml`, `-b/--binary`, `--big_endian`, `--no_res_header`)
  See `guix_studio/CommandInfo.cpp`.
- Generation logic lives in C++ and is intertwined with MFC types (`CString`, `CFile`, `CStdioFile`) and Windows paths (`\\`).
  Core entry points: `guix_studio/resource_gen.cpp`, `guix_studio/binary_resource_gen.cpp`.

## High-level approach (recommended)
Architecture decision record: `docs/adr/0001-guix-studio-vscode-extension-architecture.md`.

### Phase 1: “CLI-first”
Extract/port the generation pipeline into a cross-platform CLI tool (no MFC) and have the VS Code extension invoke it.
This gives fast value (open project + generate outputs) even before a full visual editor exists.

### Phase 2: “Editor UX”
Implement the designer UI using VS Code Webviews (React/Svelte/etc) and a TypeScript domain model aligned to `.gxp`.

### Phase 3: “Migration + compatibility”
Open older `.gxp` versions by migrating them in-memory to the latest schema, while preserving semantics.

---

## Milestones

### M0 — Discovery + decisions (1–2 weeks)
**Goal:** lock scope, fixtures, and architectural decisions so implementation doesn’t churn.

**Definition of done:**
- [x] ADR written and committed
- [x] MVP fixtures chosen and recorded

**Tasks:**
- [x] Inventory Studio file formats + schemas
  - [x] Identify required `.gxp` tags and versioning strategy (`PROJECT_VERSION`)
  - [x] Identify resource-project XML format (written by `studiox_project::GenerateResourceXml()`)
- [x] Pick MVP fixture projects (checked into repo)
  - [x] [samples/demo_guix_simple/guix_simple.gxp](samples/demo_guix_simple/guix_simple.gxp)
  - [x] [samples/demo_guix_washing_machine/demo_guix_washing_machine.gxp](samples/demo_guix_washing_machine/demo_guix_washing_machine.gxp)
  - [x] [tutorials/demo_guix_binres_standalone/demo_guix_binres_standalone.gxp](tutorials/demo_guix_binres_standalone/demo_guix_binres_standalone.gxp)
  - [x] [test/example_internal/all_widgets_5_3_3/all_widgets_5_3_3.gxp](test/example_internal/all_widgets_5_3_3/all_widgets_5_3_3.gxp)
- [x] Decide the architecture for reuse vs rewrite
- [x] Write an ADR documenting the choice: [docs/adr/0001-guix-studio-vscode-extension-architecture.md](docs/adr/0001-guix-studio-vscode-extension-architecture.md)

### M1 — Repo scaffolding (VS Code extension skeleton) (1 week)
**Goal:** extension exists, compiles, and can invoke the CLI.

**Definition of done:**
- [x] Extension compiles (`npm run compile`)
- [x] Commands are registered and usable

**Tasks:**
- [x] Create new extension package folder: [vscode-guix-studio/](vscode-guix-studio/)
- [x] Add `package.json`, `tsconfig.json`, build scripts
- [x] Define initial commands:
  - [x] Open Project (.gxp)
  - [x] Generate Outputs (calls CLI)
  - [x] Validate Project (diagnostics)
- [x] Add a basic “Project Explorer” view container (GUIX Projects tree)
- [ ] Register custom editor contribution for `.gxp` (planned for M4)

### M2 — Cross-platform generator CLI (2–6 weeks)
**Goal:** a headless tool that reproduces Studio generation outputs.

**Definition of done (Phase 1 subset):**
- [x] CLI builds with CMake
- [x] CLI can summarize/validate `.gxp`
- [x] CLI supports a Phase-1 `generate` flow with stable JSON output contract

- [x] Create a new CMake target for a console app: [tools/guix_studio_cli/](tools/guix_studio_cli/)
- [ ] Refactor Studio code into layers:
  - [ ] `studio_core` (portable) — project model + XML read/write + generators
  - [ ] `studio_win` (legacy) — MFC UI that calls `studio_core`
- [ ] Replace Windows/MFC-only types in core paths:
  - [ ] `CString` → `std::string` (or a thin adapter)
  - [ ] `CFile/CStdioFile` → stdio/iostream/fs
  - [ ] Path handling: use `std::filesystem` and normalize separators
- [ ] Preserve CLI semantics from `guix_studio/CommandInfo.*`:
  - [ ] `-p/--project` `.gxp`
  - [ ] `-n/--nogui` (implicit)
  - [ ] `-r/--resource`, `-s/--specification`
  - [ ] `-b/--binary`, `--big_endian`, `--no_res_header`
  - [ ] `-d/--display`, `-t/--theme`, `-l/--language`
  - [ ] `-x/--xml` resource-project XML input
  - [ ] `--output_path`
- [ ] Implement/port project loading:
  - [ ] Parse `.gxp` with a real XML parser (tinyxml2/pugixml/etc) OR port `xml_reader` cleanly
  - [ ] Round-trip tests (load + save yields semantically equivalent XML)
- [ ] Backward compatibility layer:
  - [ ] Detect `<project_version>` and migrate to latest schema in-memory
  - [x] Maintain a migration test corpus (fixtures above)
    - [x] CLI migration tests cover `guix_simple.gxp` and `demo_guix_washing_machine.gxp`
  - [x] Add “save as latest” option (explicit, not silent)
- [ ] Implement/port resource generation and binary resource generation
  - [ ] Verify outputs match Studio for sample projects under `samples/` and `tutorials/`

### M3 — Extension integrates CLI (1–2 weeks)
- **Goal:** smooth UX around invoking the CLI (discoverability, logs, diagnostics).

- [ ] Extension downloads/locates the CLI binary per platform
  - [ ] Option: ship prebuilt binaries as extension assets
  - [ ] Option: build-from-source in user workspace (last resort)
- [ ] Provide “Generate” task UI:
  - [ ] pick project file, output dir, flags (binary/srec/standalone, endianness)
  - [ ] show logs in VS Code Output Channel
  - [ ] parse CLI output and surface errors as Diagnostics
- [ ] File watching:
  - [ ] re-generate on save (optional toggle)

### M4 — Editable designer MVP (visual layout editing) (4–8+ weeks)
**Goal:** a usable designer for visual layouting: canvas + widget tree + properties + drag/drop editing.

- [ ] Custom editor for `.gxp`
  - [ ] Open legacy versions read-only with “Migrate Project…” action
  - [ ] Open latest versions read/write
- [ ] Widget tree view derived from `.gxp` structure
- [ ] Properties panel for selected item (display/theme/screen/widget/resource)
- [ ] Visual canvas (webview)
  - [ ] Render widget rectangles, names/IDs, selection outlines
  - [ ] Pan/zoom, grid overlay, snap settings (`grid_spacing`, `snap_spacing`)
  - [ ] Drag/move and resize handles (updates `.gxp`)
  - [ ] Z-order operations (bring forward/back)
  - [ ] Undo/redo integration (VS Code undo stack or internal history)
- [ ] Editing primitives (minimum)
  - [ ] create/rename/delete screens and widgets
  - [ ] reorder children
  - [ ] assign resource IDs (colors/fonts/pixelmaps/strings)
- [ ] Multi-display + multi-theme + multi-language UX (minimum)
  - [ ] switch active display/theme/language and keep edits scoped correctly

### M5 — Import/export + advanced editors (ongoing)
- [ ] CSV language import/export (see `guix_studio/csv_read_write.cpp`)
- [ ] XLIFF import/export (see `guix_studio/xliff_read_write.cpp`)
- [ ] Animation + screen flow editing (later; large feature surface)

---

## Testing strategy (make this real early)
- [ ] Golden output comparison for generators
  - [ ] Pick 3–5 representative `.gxp` projects from `samples/`/`tutorials/`
  - [ ] Run Studio (Windows) once to capture canonical outputs
  - [ ] In CI, run the new CLI and compare generated outputs (normalized whitespace)
- [ ] Unit tests for `.gxp` parsing and schema migration
- [ ] Extension smoke tests (command execution + diagnostics)

## CI / packaging
- [ ] Add GitHub Actions workflow to build the extension (TypeScript) and the CLI (macOS/Linux/Windows)
- [ ] Decide release packaging:
  - [ ] VSIX includes platform binaries (bigger but easy)
  - [ ] Separate downloads + extension fetches on first run

## Open questions (need answers to plan accurately)
- Do we want “auto-migrate on save” or “explicit migrate command only”?
- What is the minimum supported `.gxp` `project_version` (e.g. oldest in `test/example_internal/`)?
- Do we need to support headless generation on Linux CI only, or also macOS?

## Immediate next actions (good first week)
- [ ] Create ADR + decide “extract portable CLI” vs “rewrite generators”
- [ ] Validate the MVP fixtures above end-to-end (load, generate, compare outputs)
- [ ] Sketch extension UX: views, commands, file associations, and a minimal webview mock
