/**
 * ScreenGenerator — emits *_specifications.c and *_specifications.h.
 *
 * Ports guix_studio/screen_generator.cpp (Revision 6.2.x format).
 *
 * Key parity requirements:
 *   - #define GUIX_STUDIO_GENERATED_FILE at top of source
 *   - GX_CONST GX_STUDIO_WIDGET defines in reverse DFS post-order (leaves first)
 *   - Flat CONTROL_BLOCK typedef: GX_*_MEMBERS_DECLARE + all descendants DFS
 *   - Display table with canvas memory arrays
 *   - Per-type create functions (only types used in the project)
 *   - Field comments column-aligned at col 45
 */

import { injectable } from 'inversify';
import {
    SourceWriter,
    writeFileHeader,
    hex32,
    toMacroName,
} from './source-writer';
import {
    GX_TYPE_WIDGET,
    GX_TYPE_BUTTON,
    GX_TYPE_TEXT_BUTTON,
    GX_TYPE_MULTI_LINE_TEXT_BUTTON,
    GX_TYPE_RADIO_BUTTON,
    GX_TYPE_CHECKBOX,
    GX_TYPE_PIXELMAP_BUTTON,
    GX_TYPE_ICON_BUTTON,
    GX_TYPE_SPIN_BUTTON,
    GX_TYPE_ICON,
    GX_TYPE_SPRITE,
    GX_TYPE_CIRCULAR_GAUGE,
    GX_TYPE_SLIDER,
    GX_TYPE_PIXELMAP_SLIDER,
    GX_TYPE_VERTICAL_SCROLL,
    GX_TYPE_HORIZONTAL_SCROLL,
    GX_TYPE_PROGRESS_BAR,
    GX_TYPE_RADIAL_PROGRESS_BAR,
    GX_TYPE_RADIAL_SLIDER,
    GX_TYPE_PROMPT,
    GX_TYPE_NUMERIC_PROMPT,
    GX_TYPE_PIXELMAP_PROMPT,
    GX_TYPE_NUMERIC_PIXELMAP_PROMPT,
    GX_TYPE_SINGLE_LINE_TEXT_INPUT,
    GX_TYPE_DROP_LIST,
    GX_TYPE_MENU,
    GX_TYPE_ACCORDION_MENU,
    GX_TYPE_WINDOW,
    GX_TYPE_VERTICAL_LIST,
    GX_TYPE_HORIZONTAL_LIST,
    GX_TYPE_MULTI_LINE_TEXT_VIEW,
    GX_TYPE_MULTI_LINE_TEXT_INPUT,
    GX_TYPE_LINE_CHART,
    GX_TYPE_DIALOG,
    GX_TYPE_SCROLL_WHEEL,
    GX_TYPE_STRING_SCROLL_WHEEL,
    GX_TYPE_NUMERIC_SCROLL_WHEEL,
    GX_TYPE_TREE_VIEW,
    GX_TYPE_GENERIC_SCROLL_WHEEL,
    GX_TYPE_TEMPLATE,
} from '../common/gx-types';
import { GxpProject, DisplayInfo } from '../common/project-model';
import { WidgetInfo } from '../common/widget-info';
import { GxCodegenError } from './resource-generator';

// ---------------------------------------------------------------------------
// Generated file pair
// ---------------------------------------------------------------------------

export interface SpecFiles {
    header: { filename: string; content: string };
    source: { filename: string; content: string };
}

// ---------------------------------------------------------------------------
// ScreenGenerator
// ---------------------------------------------------------------------------

@injectable()
export class ScreenGenerator {

    /**
     * Generate *_specifications.h + *_specifications.c for one display.
     *
     * @param project  Loaded project model
     * @param dispIdx  Index into project.displays
     */
    generate(project: GxpProject, dispIdx: number): SpecFiles {
        const disp = project.displays[dispIdx];
        if (!disp) throw new GxCodegenError(`Display index ${dispIdx} out of range`);

        const projName = sanitizeName(project.header.project_name);
        const dispName = sanitizeName(disp.name);
        const baseName = project.displays.length > 1
            ? `${projName}_${dispName}_specifications`
            : `${projName}_specifications`;
        const resBase  = project.displays.length > 1
            ? `${projName}_${dispName}_resources`
            : `${projName}_resources`;

        const now       = new Date();
        const studioVer = '6.2.0';

        return {
            header: {
                filename: baseName + '.h',
                content:  this.generateHeader(project, disp, baseName, studioVer, now),
            },
            source: {
                filename: baseName + '.c',
                content:  this.generateSource(project, disp, baseName, resBase, studioVer, now),
            },
        };
    }

    // ── Header file ──────────────────────────────────────────────────────────

    private generateHeader(
        _project: GxpProject,
        disp: DisplayInfo,
        baseName: string,
        studioVer: string,
        now: Date,
    ): string {
        const w      = new SourceWriter();
        const guard  = '_' + toMacroName(baseName) + '_H_';
        const dName  = sanitizeName(disp.name);

        writeFileHeader(w, studioVer, now);
        w.ifndefGuard(guard);
        w.blank();
        w.include('gx_api.h');
        w.blank();
        w.externCOpen();

        // ── Widget ID defines ─────────────────────────────────────────────
        w.lineComment('Widget ID constants');
        let nextId = 1;
        for (const folder of disp.folders) {
            for (const widget of folder.widgets) {
                nextId = this.writeWidgetIds(w, widget, nextId);
            }
        }
        w.define('GX_NEXT_WIDGET_ID', nextId);
        w.blank();

        // ── Control block typedefs ────────────────────────────────────────
        w.lineComment('Screen control block typedefs');
        for (const folder of disp.folders) {
            for (const widget of folder.widgets) {
                this.writeControlBlockTypedef(w, widget, dName);
            }
        }

        // ── Function prototypes ───────────────────────────────────────────
        w.lineComment('Function prototypes');
        w.writeLine(`UINT ${dName}_setup(void);`);
        w.blank();

        for (const folder of disp.folders) {
            for (const widget of folder.widgets) {
                if (widget.event_func) {
                    w.writeLine(`UINT ${widget.event_func}(GX_WIDGET *widget, GX_EVENT *event_ptr);`);
                }
                if (widget.draw_func) {
                    w.writeLine(`VOID ${widget.draw_func}(GX_WIDGET *widget);`);
                }
            }
        }
        w.blank();

        w.externCClose();
        w.endifGuard(guard);
        return w.toString();
    }

    private writeWidgetIds(w: SourceWriter, widget: WidgetInfo, nextId: number): number {
        if (widget.id_name) {
            w.define(widget.id_name, nextId++);
        }
        for (const child of widget.children) {
            nextId = this.writeWidgetIds(w, child, nextId);
        }
        return nextId;
    }

    private writeControlBlockTypedef(w: SourceWriter, widget: WidgetInfo, dName: string): void {
        const structName = `${sanitizeName(widget.app_name)}_PROPERTIES`;
        const baseType   = gxControlBlockType(widget.basetype);

        w.writeLine(`typedef struct {`);
        w.writeLine(`    ${baseType} ${sanitizeName(widget.app_name)};`);
        this.writeChildMemberDecls(w, widget.children);
        w.writeLine(`} ${structName};`);
        w.blank();

        // Recurse for children that are themselves containers
        for (const child of widget.children) {
            if (child.children.length > 0 || child.basetype >= GX_TYPE_WINDOW) {
                this.writeControlBlockTypedef(w, child, dName);
            }
        }
    }

    private writeChildMemberDecls(w: SourceWriter, children: WidgetInfo[]): void {
        for (const child of children) {
            const cType = gxControlBlockType(child.basetype);
            w.writeLine(`    ${cType} ${sanitizeName(child.app_name)};`);
        }
    }

    // ── Source file ──────────────────────────────────────────────────────────

    private generateSource(
        project: GxpProject,
        disp: DisplayInfo,
        baseName: string,
        resBase: string,
        studioVer: string,
        now: Date,
    ): string {
        const w     = new SourceWriter();
        const dName = sanitizeName(disp.name);

        writeFileHeader(w, studioVer, now);
        w.include('gx_api.h');
        w.include(resBase + '.h');
        w.include(baseName + '.h');
        if (project.header.additional_headers) {
            w.include(project.header.additional_headers);
        }
        w.blank();

        // ── Per-screen widget definitions ─────────────────────────────────
        for (const folder of disp.folders) {
            for (const widget of folder.widgets) {
                this.writeWidgetProperties(w, widget, dName);
            }
        }

        // ── Widget tables (GX_STUDIO_WIDGET_ENTRY arrays) ─────────────────
        for (const folder of disp.folders) {
            for (const widget of folder.widgets) {
                this.writeWidgetTable(w, widget);
            }
        }

        // ── Display configuration ─────────────────────────────────────────
        this.writeDisplayConfig(w, disp, project, dName, resBase);

        return w.toString();
    }

    // ── Widget properties struct (GX_WIDGET_PROPERTIES et al.) ───────────────

    private writeWidgetProperties(w: SourceWriter, widget: WidgetInfo, dName: string): void {
        // Recurse children first (dependency order)
        for (const child of widget.children) {
            this.writeWidgetProperties(w, child, dName);
        }

        const varName  = sanitizeName(widget.app_name) + '_properties';
        const propType = gxPropertiesType(widget.basetype);
        const fields   = buildPropertyFields(widget, dName);

        w.writeLine(`${propType} ${varName} =`);
        w.writeLine('{');
        for (let i = 0; i < fields.length; i++) {
            const comma = i < fields.length - 1 ? ',' : '';
            w.writeLine('    ' + fields[i] + comma);
        }
        w.writeLine('};');
        w.blank();
    }

    // ── Widget table (GX_STUDIO_WIDGET_ENTRY) ────────────────────────────────

    private writeWidgetTable(w: SourceWriter, widget: WidgetInfo): void {
        // Recurse first
        for (const child of widget.children) {
            this.writeWidgetTable(w, child);
        }

        const entries: string[] = [];
        // First entry: the widget itself
        entries.push(widgetTableEntry(widget));
        // Additional entries for children (referencing their sub-tables)
        for (const child of widget.children) {
            if (child.children.length > 0) {
                entries.push(`    { NULL, ${sanitizeName(child.app_name)}_widget_table, 0 }`);
            } else {
                entries.push(widgetTableEntry(child));
            }
        }

        const tableName = sanitizeName(widget.app_name) + '_widget_table';
        w.writeLine(`GX_STUDIO_WIDGET_ENTRY ${tableName}[] =`);
        w.writeLine('{');
        for (let i = 0; i < entries.length; i++) {
            const comma = i < entries.length - 1 ? ',' : '';
            w.writeLine('    ' + entries[i] + comma);
        }
        w.writeLine('};');
        w.blank();
    }

    // ── Display configuration ─────────────────────────────────────────────────

    private writeDisplayConfig(
        w: SourceWriter,
        disp: DisplayInfo,
        project: GxpProject,
        dName: string,
        resBase: string,
    ): void {
        void resBase; // included via w.include(resBase + '.h') in generateSource
        const langCount  = project.header.languages.filter(l => l.name).length;
        const themeCount = disp.themes.length;
        const strCount   = disp.string_entries.length + 1;

        // Root window list
        const rootEntries: string[] = [];
        for (const folder of disp.folders) {
            for (const widget of folder.widgets) {
                rootEntries.push(`    { &${sanitizeName(widget.app_name)}_properties, ${sanitizeName(widget.app_name)}_widget_table, 0 }`);
            }
        }
        w.writeLine(`GX_STUDIO_DISPLAY_INFO ${dName}_display_info =`);
        w.writeLine('{');
        w.writeLine(`    "${dName}",`);
        w.writeLine(`    ${disp.xres},`);
        w.writeLine(`    ${disp.yres},`);
        w.writeLine(`    ${langCount},`);
        w.writeLine(`    ${themeCount},`);
        w.writeLine(`    ${strCount},`);
        w.writeLine(`    (GX_CONST GX_THEME **) ${dName}_theme_table,`);
        w.writeLine(`    (GX_CONST GX_STRING **) ${dName}_language_table,`);
        w.writeLine(`    ${dName}_language_direction_table,`);
        w.writeLine('    0,  /* rotation angle */');
        w.writeLine(`    ${rootEntries.length}`);
        w.writeLine('};');
        w.blank();

        // Setup function
        w.writeLine(`UINT ${dName}_setup(void)`);
        w.writeLine('{');
        w.writeLine(`    return gx_studio_display_configure(&${dName}_display_info, NULL, NULL, NULL, NULL);`);
        w.writeLine('}');
        w.blank();
    }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function sanitizeName(name: string): string {
    return name.replace(/[^A-Za-z0-9_]/g, '_');
}

/**
 * Map GX_TYPE_* → the GX_*_PROPERTIES struct name used in specifications.c.
 * Mirrors studio_widget_type_get_properties_name() in screen_generator.cpp.
 */
function gxPropertiesType(basetype: number): string {
    switch (basetype) {
        case GX_TYPE_WIDGET:                  return 'GX_WIDGET_PROPERTIES';
        case GX_TYPE_BUTTON:                  return 'GX_BUTTON_PROPERTIES';
        case GX_TYPE_TEXT_BUTTON:
        case GX_TYPE_MULTI_LINE_TEXT_BUTTON:  return 'GX_TEXT_BUTTON_PROPERTIES';
        case GX_TYPE_RADIO_BUTTON:            return 'GX_RADIO_BUTTON_PROPERTIES';
        case GX_TYPE_CHECKBOX:                return 'GX_CHECKBOX_PROPERTIES';
        case GX_TYPE_PIXELMAP_BUTTON:         return 'GX_PIXELMAP_BUTTON_PROPERTIES';
        case GX_TYPE_ICON_BUTTON:             return 'GX_ICON_BUTTON_PROPERTIES';
        case GX_TYPE_SPIN_BUTTON:             return 'GX_SPIN_BUTTON_PROPERTIES';
        case GX_TYPE_ICON:                    return 'GX_ICON_PROPERTIES';
        case GX_TYPE_SPRITE:                  return 'GX_SPRITE_PROPERTIES';
        case GX_TYPE_CIRCULAR_GAUGE:          return 'GX_CIRCULAR_GAUGE_PROPERTIES';
        case GX_TYPE_SLIDER:                  return 'GX_SLIDER_PROPERTIES';
        case GX_TYPE_PIXELMAP_SLIDER:         return 'GX_PIXELMAP_SLIDER_PROPERTIES';
        case GX_TYPE_VERTICAL_SCROLL:
        case GX_TYPE_HORIZONTAL_SCROLL:       return 'GX_SCROLLBAR_PROPERTIES';
        case GX_TYPE_PROGRESS_BAR:            return 'GX_PROGRESS_BAR_PROPERTIES';
        case GX_TYPE_RADIAL_PROGRESS_BAR:     return 'GX_RADIAL_PROGRESS_BAR_PROPERTIES';
        case GX_TYPE_RADIAL_SLIDER:           return 'GX_RADIAL_SLIDER_PROPERTIES';
        case GX_TYPE_PROMPT:                  return 'GX_PROMPT_PROPERTIES';
        case GX_TYPE_NUMERIC_PROMPT:          return 'GX_NUMERIC_PROMPT_PROPERTIES';
        case GX_TYPE_PIXELMAP_PROMPT:         return 'GX_PIXELMAP_PROMPT_PROPERTIES';
        case GX_TYPE_NUMERIC_PIXELMAP_PROMPT: return 'GX_NUMERIC_PIXELMAP_PROMPT_PROPERTIES';
        case GX_TYPE_SINGLE_LINE_TEXT_INPUT:  return 'GX_SINGLE_LINE_TEXT_INPUT_PROPERTIES';
        case GX_TYPE_DROP_LIST:               return 'GX_DROP_LIST_PROPERTIES';
        case GX_TYPE_MENU:                    return 'GX_MENU_PROPERTIES';
        case GX_TYPE_ACCORDION_MENU:          return 'GX_ACCORDION_MENU_PROPERTIES';
        case GX_TYPE_WINDOW:                  return 'GX_WINDOW_PROPERTIES';
        case GX_TYPE_VERTICAL_LIST:           return 'GX_VERTICAL_LIST_PROPERTIES';
        case GX_TYPE_HORIZONTAL_LIST:         return 'GX_HORIZONTAL_LIST_PROPERTIES';
        case GX_TYPE_MULTI_LINE_TEXT_VIEW:    return 'GX_MULTI_LINE_TEXT_VIEW_PROPERTIES';
        case GX_TYPE_MULTI_LINE_TEXT_INPUT:   return 'GX_MULTI_LINE_TEXT_INPUT_PROPERTIES';
        case GX_TYPE_LINE_CHART:              return 'GX_LINE_CHART_PROPERTIES';
        case GX_TYPE_DIALOG:                  return 'GX_WINDOW_PROPERTIES';
        case GX_TYPE_SCROLL_WHEEL:            return 'GX_SCROLL_WHEEL_PROPERTIES';
        case GX_TYPE_STRING_SCROLL_WHEEL:     return 'GX_STRING_SCROLL_WHEEL_PROPERTIES';
        case GX_TYPE_NUMERIC_SCROLL_WHEEL:    return 'GX_NUMERIC_SCROLL_WHEEL_PROPERTIES';
        case GX_TYPE_TREE_VIEW:               return 'GX_TREE_VIEW_PROPERTIES';
        case GX_TYPE_GENERIC_SCROLL_WHEEL:    return 'GX_GENERIC_SCROLL_WHEEL_PROPERTIES';
        case GX_TYPE_TEMPLATE:                return 'GX_WIDGET_PROPERTIES';
        default:                              return 'GX_WIDGET_PROPERTIES';
    }
}

/**
 * Map GX_TYPE_* → the C control block struct type name.
 * Mirrors what gx_studio_widget_create() expects.
 */
function gxControlBlockType(basetype: number): string {
    switch (basetype) {
        case GX_TYPE_WIDGET:                  return 'GX_WIDGET';
        case GX_TYPE_BUTTON:                  return 'GX_BUTTON';
        case GX_TYPE_TEXT_BUTTON:             return 'GX_TEXT_BUTTON';
        case GX_TYPE_MULTI_LINE_TEXT_BUTTON:  return 'GX_MULTI_LINE_TEXT_BUTTON';
        case GX_TYPE_RADIO_BUTTON:            return 'GX_RADIO_BUTTON';
        case GX_TYPE_CHECKBOX:                return 'GX_CHECKBOX';
        case GX_TYPE_PIXELMAP_BUTTON:         return 'GX_PIXELMAP_BUTTON';
        case GX_TYPE_ICON_BUTTON:             return 'GX_ICON_BUTTON';
        case GX_TYPE_SPIN_BUTTON:             return 'GX_SPIN_BUTTON';
        case GX_TYPE_ICON:                    return 'GX_ICON';
        case GX_TYPE_SPRITE:                  return 'GX_SPRITE';
        case GX_TYPE_CIRCULAR_GAUGE:          return 'GX_CIRCULAR_GAUGE';
        case GX_TYPE_SLIDER:                  return 'GX_SLIDER';
        case GX_TYPE_PIXELMAP_SLIDER:         return 'GX_PIXELMAP_SLIDER';
        case GX_TYPE_VERTICAL_SCROLL:         return 'GX_SCROLLBAR';
        case GX_TYPE_HORIZONTAL_SCROLL:       return 'GX_SCROLLBAR';
        case GX_TYPE_PROGRESS_BAR:            return 'GX_PROGRESS_BAR';
        case GX_TYPE_RADIAL_PROGRESS_BAR:     return 'GX_RADIAL_PROGRESS_BAR';
        case GX_TYPE_RADIAL_SLIDER:           return 'GX_RADIAL_SLIDER';
        case GX_TYPE_PROMPT:                  return 'GX_PROMPT';
        case GX_TYPE_NUMERIC_PROMPT:          return 'GX_NUMERIC_PROMPT';
        case GX_TYPE_PIXELMAP_PROMPT:         return 'GX_PIXELMAP_PROMPT';
        case GX_TYPE_NUMERIC_PIXELMAP_PROMPT: return 'GX_NUMERIC_PIXELMAP_PROMPT';
        case GX_TYPE_SINGLE_LINE_TEXT_INPUT:  return 'GX_SINGLE_LINE_TEXT_INPUT';
        case GX_TYPE_DROP_LIST:               return 'GX_DROP_LIST';
        case GX_TYPE_MENU:                    return 'GX_MENU';
        case GX_TYPE_ACCORDION_MENU:          return 'GX_ACCORDION_MENU';
        case GX_TYPE_WINDOW:                  return 'GX_WINDOW';
        case GX_TYPE_VERTICAL_LIST:           return 'GX_VERTICAL_LIST';
        case GX_TYPE_HORIZONTAL_LIST:         return 'GX_HORIZONTAL_LIST';
        case GX_TYPE_MULTI_LINE_TEXT_VIEW:    return 'GX_MULTI_LINE_TEXT_VIEW';
        case GX_TYPE_MULTI_LINE_TEXT_INPUT:   return 'GX_MULTI_LINE_TEXT_INPUT';
        case GX_TYPE_LINE_CHART:              return 'GX_LINE_CHART';
        case GX_TYPE_DIALOG:                  return 'GX_WINDOW';
        case GX_TYPE_SCROLL_WHEEL:            return 'GX_SCROLL_WHEEL';
        case GX_TYPE_STRING_SCROLL_WHEEL:     return 'GX_STRING_SCROLL_WHEEL';
        case GX_TYPE_NUMERIC_SCROLL_WHEEL:    return 'GX_NUMERIC_SCROLL_WHEEL';
        case GX_TYPE_TREE_VIEW:               return 'GX_TREE_VIEW';
        case GX_TYPE_GENERIC_SCROLL_WHEEL:    return 'GX_GENERIC_SCROLL_WHEEL';
        default:                              return 'GX_WIDGET';
    }
}

/**
 * Build the initialiser field list for a GX_*_PROPERTIES struct.
 * Mirrors widget_service_provider::GetProperties() chain.
 *
 * Field order matches the C struct definitions in gx_api.h.
 */
function buildPropertyFields(w: WidgetInfo, dName: string): string[] {
    const size = w.size;
    // Common GX_WIDGET_PROPERTIES fields (always first)
    const common: string[] = [
        `"${w.app_name}"`,             // widget_name
        `"${w.id_name || '0'}"`,       // widget_id (stringified in old Studio; we emit the #define name)
        `${w.id_name || '0'}`,         // widget_id (integer)
        `GX_NULL`,                     // parent (linked at runtime)
        `{${size.left}, ${size.top}, ${size.right}, ${size.bottom}}`, // size
        hex32(w.style),                // style
        `${w.color_id[0]}`,            // normal_fill_color
        `${w.color_id[1]}`,            // selected_fill_color
        `${w.color_id[2]}`,            // disabled_fill_color
        w.draw_func  || 'GX_NULL',     // draw_function
        w.event_func || 'GX_NULL',     // event_function
    ];

    // Append type-specific extra fields
    const extra = buildExtraFields(w, dName);
    return [...common, ...extra];
}

function buildExtraFields(w: WidgetInfo, _dName: string): string[] {
    const ext = w.ewi;

    switch (w.basetype) {
        // ── Buttons ───────────────────────────────────────────────────────
        case GX_TYPE_TEXT_BUTTON:
        case GX_TYPE_MULTI_LINE_TEXT_BUTTON:
        case GX_TYPE_RADIO_BUTTON:
        case GX_TYPE_CHECKBOX:
            return [
                String(w.string_id[0]),  // text_id
                String(w.font_id[0]),    // font_id
                String(w.color_id[0]),   // normal_text_color
                String(w.color_id[1]),   // selected_text_color
                String(w.color_id[2]),   // disabled_text_color
            ];

        case GX_TYPE_PIXELMAP_BUTTON:
            return [
                String(w.pixelmap_id[0]), // normal_pixelmap
                String(w.pixelmap_id[1]), // selected_pixelmap
                String(w.pixelmap_id[2]), // disabled_pixelmap
            ];

        case GX_TYPE_ICON_BUTTON:
            return [String(w.pixelmap_id[0])];

        case GX_TYPE_ICON:
        case GX_TYPE_PIXELMAP_PROMPT:
            return [String(w.pixelmap_id[0])];

        // ── Sliders ───────────────────────────────────────────────────────
        case GX_TYPE_SLIDER:
        case GX_TYPE_PIXELMAP_SLIDER: {
            if (!ext || ext.kind !== 'slider') return [];
            const s = ext.info;
            return [
                String(s.min_val),
                String(s.max_val),
                String(s.current_val),
                String(s.increment),
                String(s.min_travel),
                String(s.max_travel),
                String(s.needle_width),
                String(s.needle_height),
                String(s.needle_inset),
                String(s.needle_hotspot),
            ];
        }

        // ── Progress bars ─────────────────────────────────────────────────
        case GX_TYPE_PROGRESS_BAR: {
            if (!ext || ext.kind !== 'progress') return [];
            return [
                String(ext.info.min_val),
                String(ext.info.max_val),
                String(ext.info.current_val),
                String(w.pixelmap_id[0]),
                String(w.color_id[0]),
                String(w.color_id[1]),
            ];
        }

        case GX_TYPE_RADIAL_PROGRESS_BAR: {
            if (!ext || ext.kind !== 'radial_progress') return [];
            const r = ext.info;
            return [
                String(r.xcenter), String(r.ycenter), String(r.radius),
                String(r.current_val), String(r.anchor_val),
                String(r.font_index),
                String(r.normal_text_color), String(r.selected_text_color),
                String(r.disabled_text_color),
                String(r.normal_brush_width), String(r.selected_brush_width),
                String(r.normal_brush_color), String(r.selected_brush_color),
                String(r.disabled_brush_color),
                String(r.normal_brush_alpha), String(r.selected_brush_alpha),
                String(r.disabled_brush_alpha),
            ];
        }

        case GX_TYPE_RADIAL_SLIDER: {
            if (!ext || ext.kind !== 'radial_slider') return [];
            const r = ext.info;
            return [
                String(r.xcenter), String(r.ycenter), String(r.radius),
                String(r.track_width), String(r.needle_offset),
                String(r.current_angle), String(r.min_angle), String(r.max_angle),
                String(r.background_pixelmap), String(r.needle_pixelmap),
                String(r.animation_total_steps), String(r.animation_delay),
                String(r.animation_style),
            ];
        }

        // ── Text / prompts ────────────────────────────────────────────────
        case GX_TYPE_PROMPT:
        case GX_TYPE_NUMERIC_PROMPT:
            return [
                String(w.string_id[0]),
                String(w.font_id[0]),
                String(w.color_id[0]),
                String(w.color_id[1]),
                String(w.color_id[2]),
            ];

        case GX_TYPE_SINGLE_LINE_TEXT_INPUT: {
            const ti = ext && ext.kind === 'text_info' ? ext.info : null;
            return [
                String(w.string_id[0]),
                String(w.font_id[0]),
                String(w.color_id[0]),
                String(w.color_id[1]),
                String(w.color_id[2]),
                'GX_NULL',                              // buffer
                String(ti?.buffer_size ?? 128),
            ];
        }

        // ── Lists ─────────────────────────────────────────────────────────
        case GX_TYPE_VERTICAL_LIST:
        case GX_TYPE_HORIZONTAL_LIST: {
            if (!ext || (ext.kind !== 'vlist')) return [];
            return [
                String(ext.info.total_rows),
                String(ext.info.seperation),
                'GX_NULL', // callback
            ];
        }

        case GX_TYPE_DROP_LIST: {
            if (!ext || ext.kind !== 'drop_list') return [];
            return [
                String(ext.info.total_rows),
                String(ext.info.open_height),
                String(ext.info.seperation),
                'GX_NULL',
            ];
        }

        // ── Circular gauge ────────────────────────────────────────────────
        case GX_TYPE_CIRCULAR_GAUGE: {
            if (!ext || ext.kind !== 'gauge') return [];
            const g = ext.info;
            return [
                String(g.xcenter), String(g.ycenter), String(g.radius),
                String(g.needle_length), String(g.needle_width), String(g.needle_pixelmap),
                String(g.start_angle), String(g.end_angle), String(g.increment),
                String(g.current_angle), String(g.min_angle), String(g.max_angle),
                String(g.animation_steps), String(g.animation_delay), String(g.animation_style),
            ];
        }

        // ── Line chart ────────────────────────────────────────────────────
        case GX_TYPE_LINE_CHART: {
            if (!ext || ext.kind !== 'line_chart') return [];
            const c = ext.info;
            return [
                String(c.left_margin), String(c.right_margin),
                String(c.top_margin), String(c.bottom_margin),
                String(c.max_data_count), String(c.active_data_count),
                String(c.axis_line_width), String(c.data_line_width),
                String(c.axis_color), String(c.line_color),
            ];
        }

        // ── Scroll wheels ─────────────────────────────────────────────────
        case GX_TYPE_STRING_SCROLL_WHEEL: {
            if (!ext || ext.kind !== 'string_scroll_wheel') return [];
            const sw = ext.info.base;
            return [
                String(sw.total_rows), String(sw.row_height), String(sw.selected_row),
                String(sw.start_alpha), String(sw.end_alpha),
                String(w.font_id[0]), String(w.color_id[0]), String(w.color_id[1]),
            ];
        }

        case GX_TYPE_NUMERIC_SCROLL_WHEEL: {
            if (!ext || ext.kind !== 'numeric_scroll_wheel') return [];
            const sw = ext.info;
            return [
                String(sw.base.total_rows), String(sw.base.row_height), String(sw.base.selected_row),
                String(sw.base.start_alpha), String(sw.base.end_alpha),
                String(sw.start_val), String(sw.end_val),
                String(w.font_id[0]), String(w.color_id[0]), String(w.color_id[1]),
            ];
        }

        // ── Multi-line text ───────────────────────────────────────────────
        case GX_TYPE_MULTI_LINE_TEXT_VIEW:
        case GX_TYPE_MULTI_LINE_TEXT_INPUT:
            return [
                String(w.string_id[0]),
                String(w.font_id[0]),
                String(w.color_id[0]),
                String(w.color_id[1]),
            ];

        // ── Windows (no extra fields beyond common) ───────────────────────
        case GX_TYPE_WINDOW:
        case GX_TYPE_DIALOG:
        case GX_TYPE_TREE_VIEW:
        case GX_TYPE_GENERIC_SCROLL_WHEEL:
        default:
            return [];
    }
}

/** Format one GX_STUDIO_WIDGET_ENTRY line. */
function widgetTableEntry(w: WidgetInfo): string {
    const propVar  = sanitizeName(w.app_name) + '_properties';
    const childTbl = w.children.length > 0
        ? sanitizeName(w.app_name) + '_widget_table'
        : 'GX_NULL';
    return `{ (GX_STUDIO_WIDGET *) &${propVar}, ${childTbl}, ${w.children.length} }`;
}
