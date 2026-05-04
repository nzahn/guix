# GUIX Studio — Eclipse Theia Extension Port

## Project Context

This repository contains **Eclipse ThreadX GUIX** — an embedded GUI library for RTOS systems —
and **GUIX Studio**, a Windows-only MFC C++ design tool that generates GUIX C code.

The active porting goal is to re-implement GUIX Studio as a **cross-platform Eclipse Theia Extension**
(Electron + Web) so it can run in VS Code, Theia IDEs, and the browser. The port produces the same
`.gxp` project files and generates the same C output as the original tool.

## Canonical Source Mapping

| GUIX Studio C++ Component | Theia/Web Equivalent |
|---------------------------|----------------------|
| `StudioXProject.h/.cpp` | `src/common/project-model.ts` — project data model |
| `xml_reader/writer.cpp` | `src/io/gxp-serializer.ts` — `.gxp` XML I/O |
| `widget_factory.cpp` | `src/widgets/widget-registry.ts` — widget type registry |
| `widget_service_provider.cpp` | `src/widgets/widget-service.ts` — per-type service |
| `target_screen.cpp / target_view.cpp` | `src/canvas/canvas-controller.ts` — design canvas |
| `properties_win.cpp` | `src/panels/property-panel.ts` — property webview |
| `resource_view.cpp / resource_tree.cpp` | `src/panels/resource-panel.ts` — resource tree |
| `screen_flow.cpp` | `src/panels/screen-flow-editor.ts` — flow diagram |
| `screen_generator.cpp` | `src/codegen/screen-generator.ts` — screen C codegen |
| `resource_gen.cpp` | `src/codegen/resource-generator.ts` — resource C codegen |
| `binary_resource_gen.cpp` | `src/codegen/binary-resource-generator.ts` — binary gen |
| `undo_manager.cpp` | `src/commands/undo-manager.ts` — command/undo stack |
| `string_table.cpp` | `src/i18n/string-table.ts` — multi-language strings |

## Extension Layout (target)

```
theia-guix-extension/
  package.json               # Theia/VS Code manifest
  src/
    extension.ts             # activation entry
    common/
      project-model.ts       # GXP data types and tree
      widget-info.ts         # widget_info equivalent
      res-info.ts            # res_info equivalent
    io/
      gxp-serializer.ts      # read/write .gxp XML
      xliff-rw.ts            # XLIFF string import/export
      csv-rw.ts              # CSV string import/export
    widgets/
      widget-registry.ts     # maps GX_TYPE_* → service
      widget-service.ts      # base class
      button-service.ts
      window-service.ts
      ...                    # one file per widget type
    canvas/
      canvas-controller.ts   # design surface (HTML Canvas / WebGL)
      snap-engine.ts         # snap-to-grid / snap-to-widget
      selection-manager.ts   # multi-select, drag handles
    panels/
      property-panel.ts      # property webview provider
      resource-panel.ts      # resource tree view
      project-view.ts        # project/screen tree
      screen-flow-editor.ts  # SVG screen-flow diagram
    codegen/
      screen-generator.ts    # generates *_specifications.c/h
      resource-generator.ts  # generates *_resources.c/h
      binary-resource-generator.ts
      source-writer.ts       # base buffered writer
    commands/
      undo-manager.ts        # ICommand + undo stack
      command-ids.ts
    i18n/
      string-table.ts        # per-language string arrays
    utils/
      image-reader.ts        # PNG/JPEG/BMP → GX_PIXELMAP
      font-util.ts           # TrueType → GX_FONT glyph data
```

## Key Constraints

- **Pixel-exact parity**: generated `.c` and `.h` files must be byte-for-byte identical to what GUIX Studio produces for the same `.gxp` project.
- **No native add-ons** in the web build; pixel conversion and font rendering use WASM or pure JS.
- **Single source of truth**: the `.gxp` XML schema (version 56) is authoritative; do not invent new XML elements.
- **TypeScript strict mode** throughout.
- **Theia API first**: prefer `@theia/core` APIs over VS Code APIs where they differ; use `@theia/filesystem`, `@theia/editor`, `@theia/widget` etc.

## GXP Project File Facts

- Format: XML, schema version 56 (`PROJECT_VERSION` constant).
- Root element: `<project>`.
- Up to 4 `<display>` elements, each with up to 8 themes and 128 languages.
- Resources (colors, fonts, pixelmaps, strings) are scoped per display + theme.
- Widgets are stored as a tree under `<screen>` nodes.

## Widget Type Registry

All ~40 GUIX widget types map to integer constants `GX_TYPE_*` (see `gx_api.h`).  
Each type has a `widget_service_provider` subclass in C++; the Theia port mirrors this with a
`WidgetService` subclass per type.

## Code Generation Rules

- Output file naming: `<display_name>_specifications.c`, `<display_name>_specifications.h`,
  `<display_name>_resources.c`, `<display_name>_resources.h`.
- Use exact same comment blocks, macro names, typedef names, and array layouts as the C++ generator.
- Font data is serialized as raw `GX_GLYPH` / `GX_FONT` structs in C arrays.
- Pixelmap data is serialized as raw pixel bytes in `GX_PIXELMAP` structs.
