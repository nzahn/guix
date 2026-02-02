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

## Goal
- Open and edit GUIX Studio project files (`.gxp`) and resource-project XML.
- Generate the same outputs as Studio (C source/header, specification, binary resource `.bin`/`.srec`, standalone binres) with compatible defaults.
## Non-goals (for the first MVP)
- [x] Assign resource IDs (colors/fonts/pixelmaps/strings): basic support in Properties panel (incl. fill + text colors; string IDs dropdown from string table when present, with Custom… fallback)
  - Includes a one-click action to create/extend a `string_id` entry in `string_table` (pads `<val>` to match declared languages).
- [x] Persist editor UI state: grid/snap enabled + spacing, and active theme per display
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
- [x] Register custom editor contribution for `.gxp`

### M2 — Cross-platform generator CLI (2–6 weeks)
**Goal:** a headless tool that reproduces Studio generation outputs.

**Definition of done (Phase 1 subset):**
- [x] CLI builds with CMake
- [x] CLI can summarize/validate `.gxp`
- [x] CLI supports a Phase-1 `generate` flow with stable JSON output contract
- [x] CLI can export resource-project XML from `.gxp` (best-effort, legacy-compatible shape)
- [x] Validate previews schema migration in-memory (no silent writes)

- [x] Create a new CMake target for a console app: [tools/guix_studio_cli/](tools/guix_studio_cli/)
- [ ] Refactor Studio code into layers:
  - [ ] `studio_core` (portable) — project model + XML read/write + generators
  - [ ] `studio_win` (legacy) — MFC UI that calls `studio_core`
- [ ] Replace Windows/MFC-only types in core paths:
  - [ ] `CString` → `std::string` (or a thin adapter)
  - [ ] `CFile/CStdioFile` → stdio/iostream/fs
  - [ ] Path handling: use `std::filesystem` and normalize separators
- [ ] Preserve CLI semantics from `guix_studio/CommandInfo.*`:
  - [x] `-p/--project` `.gxp`
  - [x] `-n/--nogui` (implicit; CLI is always headless)
  - [x] `-r/--resource`, `-s/--specification` (Phase 1: stub outputs)
  - [x] `-b/--binary`, `--big_endian`, `--no_res_header` (Phase 1: stub output)
  - [x] `-d/--display`, `-t/--theme`, `-l/--language` (supported by `generate`; `export-resource-xml` supports `--display/--theme`)
  - [x] `-x/--xml` resource-project XML input (supported by `generate`)
  - [x] `--output_path`
- [ ] Implement/port project loading:
  - [x] Parse `.gxp` with a portable XML DOM (cross-platform, no MFC)
  - [ ] Round-trip tests (load + save yields semantically equivalent XML)
- [ ] Backward compatibility layer:
  - [x] Detect `<project_version>` and migrate to latest schema in-memory
  - [x] Maintain a migration test corpus (fixtures above)
    - [x] CLI migration tests cover `guix_simple.gxp` and `demo_guix_washing_machine.gxp`
  - [x] Add “save as latest” option (explicit, not silent)
- [x] Add export-resource-xml smoke tests for fixture projects
- [ ] Implement/port resource generation and binary resource generation
  - [ ] Verify outputs match Studio for sample projects under `samples/` and `tutorials/`

### M3 — Extension integrates CLI (1–2 weeks)
- **Goal:** smooth UX around invoking the CLI (discoverability, logs, diagnostics).

- [x] Extension locates the CLI binary per platform (settings/env/common build paths/PATH)
  - [x] Command: “GUIX: Select CLI Path” writes `guixStudio.cli.path`
- [x] Optional: scaffold VS Code Tasks for CLI commands (`GUIX: Add VS Code Tasks`)
- [x] Add `guixStudio.outputPath` setting to avoid output folder prompts
  - [x] Option: ship prebuilt binaries as extension assets (supports `bin/<platform>(-<arch>)/guix_studio_cli` lookup)
  - [x] Option: build-from-source in user workspace (last resort) via “GUIX: Build CLI (CMake)” command
- [x] Provide “Generate” task UI:
- [x] Provide “Generate” task UX improvements:
  - [x] status bar shows resolved CLI source (click for details)
  - [x] configurable default output dir (`guixStudio.outputPath`)
  - [x] quick generate command for active `.gxp`
  - [x] show logs in VS Code Output Channel
  - [x] parse generator errors into Diagnostics
- [x] Detect CLI capability mismatches (older binaries missing subcommands) and prompt to build/select a newer CLI when needed
- [x] File watching:
  - [x] re-generate on save (optional toggle)

### M4 — Editable designer MVP (visual layout editing) (4–8+ weeks)
**Goal:** a usable designer for visual layouting: canvas + widget tree + properties + drag/drop editing.

- [x] Custom editor for `.gxp`
  - [x] Open legacy versions read-only with “Migrate Project…” action
  - [x] Open latest versions read/write
- [x] Widget tree view derived from `.gxp` structure
- [x] Properties panel for selected widget (name/type/rect)
- [x] Visual canvas (webview)
  - [x] Render widget rectangles + selection outlines
  - [x] Pan/zoom + grid overlay + snap (spacing configurable in designer; initialized from `.gxp` header `grid_*`/`snap_*`)
  - [x] Drag/move and resize handles (updates `.gxp`)
  - [x] Z-order operations (bring forward/back via sibling reorder)
  - [x] Undo/redo integration (VS Code undo stack; batched Apply and debounced nudges)
  - [x] Editing primitives (minimum)
  - [x] create/rename/delete screens and widgets (screens are root widgets; add sibling + duplicate supported)
  - [x] reorder children
  - [x] assign resource IDs (colors/fonts/pixelmaps: selectors; strings: string_id dropdown with Custom… fallback; includes fill + text colors)
  - [x] Multi-display + multi-theme + multi-language UX (minimum)
  - [x] switch active display/theme/language (selectors; active theme now persisted per display; resource selectors are theme-scoped; language previews string_table values, warns on missing IDs/translations; can create/extend string records and edit per-language values; includes New string… and Enter-to-commit)

### M5 — Import/export + advanced editors (ongoing)
- [x] CSV language import/export (see `guix_studio/csv_read_write.cpp`)
  - Implemented in `guix_studio_cli` as `export-strings` / `import-strings` using legacy Studio CSV header format: `name,<srcLangId>,<targetLangId...>` with CTest smoke coverage.
- [x] XLIFF import/export (see `guix_studio/xliff_read_write.cpp`)
  - Implemented in `guix_studio_cli` as `export-xliff` / `import-xliff` with CTest smoke coverage.
- [x] VS Code extension integration for translation workflows
  - Commands: `GUIX: Export Strings (CSV)`, `GUIX: Import Strings (CSV)`, `GUIX: Export XLIFF`, `GUIX: Import XLIFF`
  - Designer quick actions: single dropdown + Run button; import actions disabled for legacy read-only projects (also enforced in command handlers)
- [ ] Animation + screen flow editing (later; large feature surface)

---

## Testing strategy (make this real early)
- [x] Golden output comparison for generators (Phase 1 subset: resource-project XML)
  - [x] Pick representative `.gxp` projects from `samples/`/`tutorials/` (4 fixtures)
  - [x] Use committed canonical `.resource.xml` fixtures (legacy Studio shape)
  - [x] In CI, run the CLI and compare generated `.resource.xml` outputs (normalized whitespace)
- [x] Golden output comparison (Phase 1): export-resource-xml matches committed fixtures for 4 projects
- [x] Golden output comparison (Phase 1): generate produces the same `.resource.xml` as the committed fixtures for 4 projects
- [ ] Unit tests for `.gxp` parsing and schema migration
  - [x] Migration is idempotent (migrate twice yields identical output)
  - [x] Golden migration output comparison (2 projects)
- [ ] Extension smoke tests (command execution + diagnostics)
  - [x] Smoke script: `npm run -s smoke:gxp` (parses 2-theme + 5-theme `.gxp` fixtures)
  - [x] Smoke script optionally sanity-checks `guix_studio_cli` execution (`summary --json`), and will also exercise CSV/XLIFF export if the CLI advertises those subcommands

## CI / packaging
- [x] Add GitHub Actions workflow to build the extension (TypeScript) and the CLI (macOS/Linux/Windows)
- [x] Run extension compile + smoke on macOS/Linux/Windows
- [ ] Decide release packaging:
  - [ ] VSIX includes platform binaries (bigger but easy)
  - [ ] Separate downloads + extension fetches on first run
- [x] CI produces a VSIX artifact that bundles per-platform `guix_studio_cli` binaries (for evaluation)
  - [x] VSIX packaging is non-interactive (extension includes `repository` + `LICENSE.txt`)
  - [x] VSIX keeps dependencies minimal (whitelists `fast-xml-parser` + `strnum`)

## Open questions (need answers to plan accurately)
- Do we want “auto-migrate on save” or “explicit migrate command only”?
- What is the minimum supported `.gxp` `project_version` (e.g. oldest in `test/example_internal/`)?
- Do we need to support headless generation on Linux CI only, or also macOS?

## Immediate next actions (good first week)
- [ ] Create ADR + decide “extract portable CLI” vs “rewrite generators”
- [ ] Validate the MVP fixtures above end-to-end (load, generate, compare outputs)
- [ ] Sketch extension UX: views, commands, file associations, and a minimal webview mock
