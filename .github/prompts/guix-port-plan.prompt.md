---
description: "GUIX Studio → Eclipse Theia Extension port plan. Reference this for milestone status, phase ordering, and task-to-agent routing."
---

# GUIX Studio → Theia Extension Port Plan

## Phase 1 — Foundation
**Goal**: Empty extension that opens a `.gxp` file and parses it into memory.

| # | Task | Agent | C++ Source | Status |
|---|------|-------|------------|--------|
| 1.1 | Scaffold `theia-guix-extension/` with `package.json`, `tsconfig.json`, `extension.ts` | `theia-extension-architect` | — | ⬜ |
| 1.2 | Set up build: `tsc`, `webpack`, `jest` | `guix-build-toolchain` | — | ⬜ |
| 1.3 | Define TypeScript types: `project-model.ts`, `widget-info.ts`, `res-info.ts`, `gx-types.ts` | `guix-widget-system` + `guix-project-io` | `StudioXProject.h`, `gx_api.h` | ⬜ |
| 1.4 | Implement `.gxp` XML parser (read-only, schema v56) | `guix-project-io` | `xml_reader.cpp` | ⬜ |

---

## Phase 2 — Visualization
**Goal**: Open a `.gxp`, see the screen tree, and see widgets rendered on canvas.

| # | Task | Agent | C++ Source | Status |
|---|------|-------|------------|--------|
| 2.1 | Project tree panel | `guix-project-view` | `project_view.cpp` | ⬜ |
| 2.2 | Widget registry + base `WidgetService` | `guix-widget-system` | `widget_service_provider.cpp`, `widget_factory.cpp` | ⬜ |
| 2.3 | Canvas controller + `GX_TYPE_WINDOW` / `GX_TYPE_BUTTON` renderers | `guix-canvas-renderer` | `target_screen.cpp` | ⬜ |
| 2.4 | Snap-to-grid engine | `guix-canvas-renderer` | `target_screen.cpp` snap logic | ⬜ |
| 2.5 | Resource manager — in-memory model + resource panel tree | `guix-resource-manager` | `resource_item.cpp`, `resource_view.cpp` | ⬜ |

---

## Phase 3 — Editing
**Goal**: Select, move, resize widgets; edit properties; full undo/redo.

| # | Task | Agent | C++ Source | Status |
|---|------|-------|------------|--------|
| 3.1 | Undo/redo stack + `ICommand` interface | `guix-undo-redo` | `undo_manager.cpp` | ⬜ |
| 3.2 | `MoveWidgetCommand`, `ResizeWidgetCommand` | `guix-undo-redo` | `undo_manager.cpp` | ⬜ |
| 3.3 | Selection manager (multi-select, handles) | `guix-canvas-renderer` | `target_view.cpp` | ⬜ |
| 3.4 | Property panel webview | `guix-property-panel` | `properties_win.cpp` | ⬜ |
| 3.5 | `PropertyChangeCommand` | `guix-undo-redo` | — | ⬜ |
| 3.6 | All remaining ~38 widget type services + renderers | `guix-widget-system` + `guix-canvas-renderer` | `*_service_provider.cpp` | ⬜ |
| 3.7 | Image reader (PNG/JPEG/BMP → `GxPixelmap`) | `guix-resource-manager` | `image_reader.cpp` | ⬜ |
| 3.8 | Font util (TTF → `GxFont` glyphs via `opentype.js`) | `guix-resource-manager` | `gx_studio_font_util.cpp` | ⬜ |

---

## Phase 4 — Code Generation
**Goal**: Generate C files byte-for-byte identical to the C++ tool's output.

| # | Task | Agent | C++ Source | Status |
|---|------|-------|------------|--------|
| 4.1 | `source-writer.ts` base | `guix-code-generator` | `studio_source_writer.cpp` | ⬜ |
| 4.2 | Resource generator (`_resources.c/h`) | `guix-code-generator` | `resource_gen.cpp` | ⬜ |
| 4.3 | Screen generator (`_specifications.c/h`) | `guix-code-generator` | `screen_generator.cpp` | ⬜ |
| 4.4 | Binary resource generator (`.bin`/`.srec`) | `guix-code-generator` | `binary_resource_gen.cpp` | ⬜ |
| 4.5 | Golden file test harness | `guix-build-toolchain` | sample `.gxp` projects | ⬜ |

---

## Phase 5 — Advanced Features
**Goal**: Feature parity with all GUIX Studio panels.

| # | Task | Agent | C++ Source | Status |
|---|------|-------|------------|--------|
| 5.1 | String table editor panel | `guix-string-table` | `string_table.cpp`, `string_table_edit_dlg.cpp` | ⬜ |
| 5.2 | XLIFF / CSV import-export | `guix-string-table` | `xliff_read_write.cpp`, `csv_read_write.cpp` | ⬜ |
| 5.3 | Screen flow editor (SVG diagram) | `guix-screen-flow-editor` | `screen_flow.cpp` | ⬜ |
| 5.4 | Trigger/action editing | `guix-screen-flow-editor` | `trigger_action_edit_dlg.cpp` | ⬜ |
| 5.5 | GXP serializer — write path | `guix-project-io` | `xml_writer.cpp` | ⬜ |
| 5.6 | VSIX packaging + CI pipeline | `guix-build-toolchain` | — | ⬜ |

---

## Key Risks

1. **Byte-exact codegen** — needs golden tests from day one of Phase 4.
2. **Font rendering parity** — `opentype.js` may diverge from FreeType for kerning; may need FreeType WASM.
3. **Theia DI bootstrapping** — get `ContainerModule` bindings right in Phase 1 or it blocks everything.

## Agent Quick Reference

```
@guix-port-coordinator      — start here for any new task
@theia-extension-architect  — 1.1
@guix-build-toolchain       — 1.2, 4.5, 5.6
@guix-project-io            — 1.4, 5.5
@guix-widget-system         — 1.3, 2.2, 3.6
@guix-project-view          — 2.1
@guix-canvas-renderer       — 2.3, 2.4, 3.3
@guix-resource-manager      — 2.5, 3.7, 3.8
@guix-undo-redo             — 3.1, 3.2, 3.5
@guix-property-panel        — 3.4
@guix-code-generator        — 4.1–4.4
@guix-string-table          — 5.1, 5.2
@guix-screen-flow-editor    — 5.3, 5.4
```
