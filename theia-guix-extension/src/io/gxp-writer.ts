/**
 * GXP project file writer.
 *
 * Mirrors StudioXProject::Save(), WriteProjectHeader(), WriteDisplayInfo(),
 * WriteResources(), WriteOneResource(), WriteStringTable(), WriteScreenFlow(),
 * WriteWidgetFolders() and widget_service_provider::WriteToProject() from the
 * C++ GUIX Studio source.
 *
 * Attribute order and indentation match the C++ writer exactly so that diffs
 * between a file saved by GUIX Studio and by this writer are minimal.
 */

import { injectable } from 'inversify';
import 'reflect-metadata';

import {
    RES_TYPE_HEADER,
    RES_TYPE_GROUP,
    RES_TYPE_FOLDER,
    RES_TYPE_ADD_FONT,
    RES_TYPE_ADD_COLOR,
    RES_TYPE_ADD_PIXELMAP,
    RES_TYPE_ADD_STRING,
    RES_TYPE_FONT,
    RES_TYPE_COLOR,
    RES_TYPE_PIXELMAP,
    PALETTE_TYPE_PRIVATE,
    PALETTE_TYPE_SHARED,
    GX_SCREEN_ROTATION_CW,
    GX_SCREEN_ROTATION_CCW,
    GX_SCREEN_ROTATION_FLIP,
    GX_COLOR_FORMAT_MONOCHROME,
    GX_COLOR_FORMAT_4BIT_GRAY,
    GX_COLOR_FORMAT_8BIT_PALETTE,
    GX_COLOR_FORMAT_8BIT_PACKED_PIXEL,
    GX_COLOR_FORMAT_565RGB,
    GX_COLOR_FORMAT_565BGR,
    GX_COLOR_FORMAT_1555XRGB,
    GX_COLOR_FORMAT_5551BGRX,
    GX_COLOR_FORMAT_4444ARGB,
    GX_COLOR_FORMAT_4444BGRA,
    GX_COLOR_FORMAT_24RGB,
    GX_COLOR_FORMAT_24XRGB,
    GX_COLOR_FORMAT_32ARGB,
    GX_COLOR_FORMAT_32BGRA,
    PATH_TYPE_INSTALL_RELATIVE,
    NUM_FONT_CHAR_RANGES,
    NUM_FONT_EXTENDED_CHAR_RANGES,
    STRING_EXPORT_TYPE_CSV,
} from '../common/gx-types';

import type {
    GxpProject,
    ProjectHeader,
    DisplayInfo,
    ThemeInfo,
    ScrollbarAppearance,
} from '../common/project-model';

import type { ResInfo } from '../common/res-info';
import type { WidgetInfo } from '../common/widget-info';

// ---------------------------------------------------------------------------
// GxCodegenError
// ---------------------------------------------------------------------------

export class GxpWriteError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GxpWriteError';
    }
}

// ---------------------------------------------------------------------------
// Internal XML builder
// ---------------------------------------------------------------------------

class XmlBuilder {
    private parts: string[] = [];
    private indentLevel = 0;
    private readonly indent = '    ';

    writeHeader(docType: string): void {
        this.parts.push('<?xml version="1.0" encoding="utf-8"?>\n');
        this.parts.push(`<!DOCTYPE ${docType}>\n`);
    }

    openTag(name: string, inline = false): void {
        if (inline) {
            this.parts.push(`<${name}>`);
        } else {
            this.parts.push(`${this.getIndent()}<${name}>\n`);
            this.indentLevel++;
        }
    }

    closeTag(name: string, inline = false): void {
        if (inline) {
            this.parts.push(`</${name}>\n`);
        } else {
            this.indentLevel--;
            this.parts.push(`${this.getIndent()}</${name}>\n`);
        }
    }

    writeString(name: string, value: string, force = false): void {
        if (!force && value === '') return;
        this.openTag(name, true);
        this.parts.push(this.escapeXml(value));
        this.closeTag(name, true);
    }

    writeInt(name: string, value: number): void {
        this.writeString(name, String(Math.trunc(value)), true);
    }

    writeUnsigned(name: string, value: number): void {
        this.writeString(name, String(value >>> 0), true);
    }

    writeBool(name: string, value: boolean): void {
        this.openTag(name, true);
        this.parts.push(value ? 'TRUE' : 'FALSE');
        this.closeTag(name, true);
    }

    writeRect(name: string, left: number, top: number, right: number, bottom: number): void {
        this.openTag(name);
        this.writeInt('left', left);
        this.writeInt('top', top);
        this.writeInt('right', right);
        this.writeInt('bottom', bottom);
        this.closeTag(name);
    }

    writePathInfo(pathname: string, pathtype: number): void {
        this.openTag('pathinfo');
        if (pathname !== '') this.writeString('pathname', pathname);
        let typeStr: string;
        switch (pathtype) {
            case PATH_TYPE_INSTALL_RELATIVE: typeStr = 'studio_relative'; break;
            case 2: typeStr = 'absolute'; break;
            default: typeStr = 'project_relative';
        }
        this.writeString('pathtype', typeStr);
        this.closeTag('pathinfo');
    }

    toString(): string {
        return this.parts.join('');
    }

    private getIndent(): string {
        return this.indent.repeat(this.indentLevel);
    }

    private escapeXml(s: string): string {
        return s
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}

// ---------------------------------------------------------------------------
// Helper: rotation angle → name
// ---------------------------------------------------------------------------

function rotationName(angle: number): string {
    switch (angle) {
        case GX_SCREEN_ROTATION_CW:   return 'CW';
        case GX_SCREEN_ROTATION_CCW:  return 'CCW';
        case GX_SCREEN_ROTATION_FLIP: return 'FLIP';
        default:                      return 'None';
    }
}

// ---------------------------------------------------------------------------
// Helper: color format → name (matches resource_gen::GetColorFormatName)
// ---------------------------------------------------------------------------

const COLOR_FORMAT_NAMES: ReadonlyMap<number, string> = new Map([
    [GX_COLOR_FORMAT_MONOCHROME,      'GX_COLOR_FORMAT_MONOCHROME'],
    [GX_COLOR_FORMAT_4BIT_GRAY,       'GX_COLOR_FORMAT_4BIT_GRAY'],
    [GX_COLOR_FORMAT_8BIT_PALETTE,    'GX_COLOR_FORMAT_8BIT_PALETTE'],
    [GX_COLOR_FORMAT_8BIT_PACKED_PIXEL,'GX_COLOR_FORMAT_8BIT_PACKED_PIXEL'],
    [GX_COLOR_FORMAT_565RGB,          'GX_COLOR_FORMAT_565RGB'],
    [GX_COLOR_FORMAT_565BGR,          'GX_COLOR_FORMAT_565BGR'],
    [GX_COLOR_FORMAT_1555XRGB,        'GX_COLOR_FORMAT_1555XRGB'],
    [GX_COLOR_FORMAT_5551BGRX,        'GX_COLOR_FORMAT_5551BGRX'],
    [GX_COLOR_FORMAT_4444ARGB,        'GX_COLOR_FORMAT_4444ARGB'],
    [GX_COLOR_FORMAT_4444BGRA,        'GX_COLOR_FORMAT_4444BGRA'],
    [GX_COLOR_FORMAT_24RGB,           'GX_COLOR_FORMAT_24RGB'],
    [GX_COLOR_FORMAT_24XRGB,          'GX_COLOR_FORMAT_24XRGB'],
    [GX_COLOR_FORMAT_32ARGB,          'GX_COLOR_FORMAT_32ARGB'],
    [GX_COLOR_FORMAT_32BGRA,          'GX_COLOR_FORMAT_32BGRA'],
]);

function colorFormatName(fmt: number): string {
    return COLOR_FORMAT_NAMES.get(fmt) ?? '';
}

// ---------------------------------------------------------------------------
// Helper: resource type → XML name string
// ---------------------------------------------------------------------------

const RES_TYPE_NAMES: ReadonlyMap<number, string> = new Map([
    [RES_TYPE_HEADER,      'HEADER'],
    [RES_TYPE_GROUP,       'GROUP'],
    [RES_TYPE_FOLDER,      'FOLDER'],
    [RES_TYPE_FONT,        'FONT'],
    [RES_TYPE_COLOR,       'COLOR'],
    [RES_TYPE_PIXELMAP,    'PIXELMAP'],
    [4, 'ADD_FONT'],   // RES_TYPE_ADD_FONT
    [5, 'ADD_COLOR'],
    [6, 'ADD_PIXELMAP'],
    [7, 'ADD_STRING'],
]);

// ---------------------------------------------------------------------------
// Helper: folder_id → name strings
// ---------------------------------------------------------------------------

const FOLDER_ID_NAMES: ReadonlyMap<number, string> = new Map([
    [4096, 'DEFAULT_COLOR_FOLDER'],
    [4097, 'CUSTOM_COLOR_FOLDER'],
    [4098, 'DEFAULT_FONT_FOLDER'],
    [4099, 'CUSTOM_FONT_FOLDER'],
    [4100, 'DEFAULT_PIXELMAP_FOLDER'],
    [4101, 'CUSTOM_PIXELMAP_FOLDER'],
]);
const GROUP_ID_NAMES: ReadonlyMap<number, string> = new Map([
    [4096, 'COLOR_GROUP'],
    [4097, 'FONT_GROUP'],
    [4098, 'PIXELMAP_GROUP'],
    [4099, 'STRING_GROUP'],
]);
const HEADER_ID_NAMES: ReadonlyMap<number, string> = new Map([
    [4096, 'THEME_HEADER'],
]);

function folderIdString(resType: number, folderId: number): string {
    if (resType === RES_TYPE_HEADER) return HEADER_ID_NAMES.get(folderId) ?? '';
    if (resType === RES_TYPE_GROUP)  return GROUP_ID_NAMES.get(folderId) ?? '';
    if (resType === RES_TYPE_FOLDER) return FOLDER_ID_NAMES.get(folderId) ?? '';
    return '';
}

// ---------------------------------------------------------------------------
// Helper: string export type name
// ---------------------------------------------------------------------------

function stringExportTypeName(t: number): string {
    if (t === STRING_EXPORT_TYPE_CSV) return 'STRING_EXPORT_TYPE_CSV';
    return 'STRING_EXPORT_TYPE_XLIFF';
}

// ---------------------------------------------------------------------------
// Helper: widget type → XML section name
// ---------------------------------------------------------------------------

const WIDGET_TYPE_TO_NAME: ReadonlyMap<number, string> = new Map([
    [1,   'widget'],    [2,   'button'],   [3,   'text button'],
    [4,   'multi line text button'], [5, 'radio button'],
    [6,   'checkbox'],  [7,   'pixelmap button'], [8, 'shadow button'],
    [9,   'icon button'], [10, 'spin button'], [11, 'icon'],
    [12,  'sprite'],    [13,  'circular gauge'],
    [20,  'slider'],    [21,  'pixelmap slider'],
    [22,  'vertical scroll'], [23, 'horizontal scroll'],
    [24,  'progress bar'], [25, 'radial progress bar'],
    [26,  'radial slider'],
    [30,  'prompt'],    [31,  'numeric prompt'],
    [32,  'pixelmap prompt'], [33, 'numeric pixelmap prompt'],
    [64,  'single line text input'], [65, 'pixelmap text input'],
    [70,  'drop list'], [75, 'menu list'], [76, 'menu'],
    [77,  'accordion menu'],
    [128, 'window'],    [129, 'root window'],
    [131, 'vertical list'], [132, 'horizontal list'],
    [133, 'popup list'], [134, 'multi line text view'],
    [135, 'multi line text input'], [136, 'line chart'],
    [137, 'dialog'],    [138, 'keyboard'],
    [139, 'scroll wheel'], [140, 'text scroll wheel'],
    [141, 'string scroll wheel'], [142, 'numeric scroll wheel'],
    [143, 'tree view'], [144, 'rich text view'],
    [145, 'generic scroll wheel'], [200, 'template'],
]);

// ---------------------------------------------------------------------------
// GxpWriter
// ---------------------------------------------------------------------------

@injectable()
export class GxpWriter {

    /**
     * Serialise a `GxpProject` to a `.gxp` XML string.
     *
     * The output matches the C++ xml_writer output byte-for-byte in terms of
     * element structure and order.  Indentation uses 4 spaces per level to
     * match the C++ OpenTag() behaviour.
     */
    writeProject(project: GxpProject): string {
        const b = new XmlBuilder();
        b.writeHeader('GUIX_Studio_Project');
        b.openTag('project');
        this.writeProjectHeader(b, project.header);
        for (let i = 0; i < project.header.max_displays; i++) {
            this.writeDisplayInfo(b, project, i);
        }
        b.closeTag('project');
        return b.toString();
    }

    // -------------------------------------------------------------------------
    // WriteProjectHeader
    // -------------------------------------------------------------------------

    private writeProjectHeader(b: XmlBuilder, h: ProjectHeader): void {
        b.openTag('header');
        b.writeInt('project_version', h.project_version);
        b.writeInt('guix_version',    h.guix_version);
        b.writeInt('studio_version',  h.studio_version);

        b.writeString('project_name',       h.project_name);
        b.writeString('source_path',        h.source_path);
        b.writeString('header_path',        h.header_path);
        b.writeString('resource_path',      h.resource_path);
        b.writeString('allocator_function', h.malloc_name);
        b.writeString('free_function',      h.free_name);
        b.writeString('additional_headers', h.additional_headers);
        b.writeBool('insert_headers_before', h.insert_headers_before);

        b.writeInt('target_cpu',   h.target_cpu);
        b.writeInt('target_tools', h.target_tools);
        b.writeBool('big_endian',  h.big_endian);
        b.writeBool('dave2d_graph_accelerator', h.dave2d_graph_accelerator);
        b.writeInt('renesas_jpeg_decoder', h.renesas_jpeg_decoder);
        b.writeInt('renesas_png_decoder',  h.renesas_png_decoder);

        b.writeBool('grid_enabled',           h.grid_enabled);
        b.writeBool('snap_enabled',           h.snap_enabled);
        b.writeBool('snap_to_widget_enabled', h.snap_to_widget_enabled);
        b.writeInt('grid_spacing', h.grid_spacing);
        b.writeInt('snap_spacing', h.snap_spacing);

        b.writeBool('gen_binary', h.gen_binary);
        b.writeUnsigned('binary_file_format', h.binary_file_format);
        b.writeUnsigned('memory_offset',      h.memory_offset);
        b.writeBool('gen_res_header',         h.gen_res_header);

        b.writeBool('custom_resource_enabled',    h.custom_resource_enabled);
        b.writeString('custom_resource_file_name', h.custom_resource_file_name);
        b.writeInt('app_execute_xpos',            h.app_execute_xpos);
        b.writeInt('app_execute_ypos',            h.app_execute_ypos);
        b.writeBool('is_widget_position_locked',  h.is_widget_position_locked);
        b.writeInt('palette_mode_aa_text_colors', h.palette_mode_aa_text_colors);

        b.writeInt('num_displays',  h.num_displays);
        b.writeInt('max_displays',  h.max_displays);
        b.writeInt('num_languages', h.num_languages);

        b.openTag('language_names');
        for (let i = 0; i < h.num_languages; i++) {
            const lang = h.languages[i];
            b.writeString('language',                lang.name, true);
            b.writeBool('support_bidi_text',          lang.support_bidi_text);
            b.writeBool('gen_reordered_bidi_text',    lang.gen_reordered_bidi_text);
            b.writeBool('support_thai_glyph_shaping', lang.support_thai_glyph_shaping);
            b.writeBool('gen_adjusted_thai_string',   lang.gen_adjusted_thai_string);
            b.writeBool('statically_defined',         lang.statically_defined);
        }
        b.closeTag('language_names');

        b.openTag('string_export');
        b.writeInt('string_export_src',     h.string_export_src);
        b.writeInt('string_export_target',  h.string_export_target);
        b.writeInt('string_export_version', h.string_export_version);
        b.writeString('string_export_path', h.string_export_path);
        b.writeString('string_export_name', h.string_export_filename);
        b.writeString('string_export_filetype', stringExportTypeName(h.string_export_filetype));
        b.closeTag('string_export');

        b.closeTag('header');
    }

    // -------------------------------------------------------------------------
    // WriteDisplayInfo
    // -------------------------------------------------------------------------

    private writeDisplayInfo(b: XmlBuilder, project: GxpProject, displayIndex: number): void {
        const h = project.header;
        const d = project.displays[displayIndex];
        if (!d) return;

        b.openTag('display_info');
        b.writeInt('display_index',      displayIndex);
        b.writeString('display_name',    d.name);
        b.writeInt('xres',               d.xres);
        b.writeInt('yres',               d.yres);
        b.writeInt('bits_per_pix',       d.bits_per_pix);
        b.writeBool('packed_format',     d.packed_format);
        b.writeBool('format_555',        d.format_555);
        b.writeBool('format_4444',       d.format_4444);
        b.writeBool('format_332',        d.format_332);
        b.writeBool('grayscale',         d.grayscale);
        b.writeBool('reverse_order',     d.reverse_order);
        b.writeBool('allocate_canvas',   d.allocate_canvas);
        b.writeBool('enabled',           d.enabled);
        b.writeString('rotation_angle',  rotationName(d.rotation_angle));
        b.writeBool('default_map_format', d.default_map_format);

        b.openTag('theme_info');
        b.writeInt('num_themes',   d.num_themes);
        b.writeInt('active_theme', d.active_theme);

        for (let t = 0; t < d.num_themes; t++) {
            const theme = d.themes[t];
            b.writeString('theme_name',          theme.theme_name);
            b.writeBool('gen_color_table',        theme.gen_color_table);
            b.writeBool('gen_font_table',         theme.gen_font_table);
            b.writeBool('gen_pixelmap_table',     theme.gen_pixelmap_table);
            b.writeBool('enabled',                theme.enabled);
            b.writeBool('statically_defined',     theme.statically_defined);

            b.openTag('theme_data');
            this.writeResources(b, theme.resources);
            this.writeThemeScrollbars(b, theme);
            if (theme.palette.length > 0) {
                this.writeThemePaletteInfo(b, theme);
            }
            b.closeTag('theme_data');
        }
        b.closeTag('theme_info');

        // Per-language gen flags
        for (let lang = 0; lang < h.num_languages; lang++) {
            const langName = h.languages[lang]?.name ?? `lang_${lang}`;
            b.writeBool(langName, d.gen_string_table[lang] ?? true);
        }

        if (displayIndex < h.num_displays) {
            this.writeStringTable(b, d, h);
            this.writeScreenFlow(b, d);
        }
        this.writeWidgetFolders(b, d);

        b.closeTag('display_info');
    }

    // -------------------------------------------------------------------------
    // WriteThemeScrollbars
    // -------------------------------------------------------------------------

    private writeThemeScrollbars(b: XmlBuilder, theme: ThemeInfo): void {
        b.openTag('vscroll_appearance');
        this.writeScrollbarAppearance(b, theme.vscroll_appearance);
        b.writeUnsigned('scroll_style', theme.vscroll_style);
        b.closeTag('vscroll_appearance');

        b.openTag('hscroll_appearance');
        this.writeScrollbarAppearance(b, theme.hscroll_appearance);
        b.writeUnsigned('scroll_style', theme.hscroll_style);
        b.closeTag('hscroll_appearance');
    }

    private writeScrollbarAppearance(b: XmlBuilder, a: ScrollbarAppearance): void {
        b.writeInt('gx_scroll_width',              a.gx_scroll_width);
        b.writeInt('gx_scroll_thumb_width',        a.gx_scroll_thumb_width);
        b.writeInt('gx_scroll_thumb_travel_min',   a.gx_scroll_thumb_travel_min);
        b.writeInt('gx_scroll_thumb_travel_max',   a.gx_scroll_thumb_travel_max);
        b.writeUnsigned('gx_scroll_thumb_border_style', a.gx_scroll_thumb_border_style);
        b.writeUnsigned('gx_scroll_fill_pixelmap',      a.gx_scroll_fill_pixelmap);
        b.writeUnsigned('gx_scroll_thumb_pixelmap',     a.gx_scroll_thumb_pixelmap);
        b.writeUnsigned('gx_scroll_up_pixelmap',        a.gx_scroll_up_pixelmap);
        b.writeUnsigned('gx_scroll_down_pixelmap',      a.gx_scroll_down_pixelmap);
        b.writeUnsigned('gx_scroll_thumb_color',        a.gx_scroll_thumb_color);
        b.writeUnsigned('gx_scroll_thumb_border_color', a.gx_scroll_thumb_border_color);
        b.writeUnsigned('gx_scroll_button_color',       a.gx_scroll_button_color);
    }

    // -------------------------------------------------------------------------
    // WriteThemePaletteInfo
    // -------------------------------------------------------------------------

    private writeThemePaletteInfo(b: XmlBuilder, theme: ThemeInfo): void {
        b.openTag('palette');
        b.writeInt('total_size', theme.palette_total_size);
        b.writeInt('predefined', theme.palette_predefined);
        for (let i = 0; i < theme.palette_predefined; i++) {
            b.writeUnsigned('rgb', theme.palette[i] ?? 0);
        }
        b.closeTag('palette');
    }

    // -------------------------------------------------------------------------
    // WriteResources
    // -------------------------------------------------------------------------

    private writeResources(b: XmlBuilder, resources: ResInfo[]): void {
        for (const res of resources) {
            const skip = (res.type === RES_TYPE_ADD_COLOR ||
                          res.type === RES_TYPE_ADD_FONT  ||
                          res.type === RES_TYPE_ADD_PIXELMAP ||
                          res.type === RES_TYPE_ADD_STRING);
            if (!skip) {
                b.openTag('resource');
                this.writeOneResource(b, res);
            }
            this.writeResources(b, res.children);
            if (!skip) {
                b.closeTag('resource');
            }
        }
    }

    private writeOneResource(b: XmlBuilder, res: ResInfo): void {
        const typeName = RES_TYPE_NAMES.get(res.type) ?? '';
        b.writeString('type', typeName);
        b.writeString('name', res.name);
        b.writePathInfo(res.pathinfo.pathname, res.pathinfo.pathtype);
        b.writeBool('is_default', res.is_default);
        b.writeBool('enabled',    res.enabled);
        b.writeBool('compress',   res.compress);

        switch (res.type) {
            case RES_TYPE_PIXELMAP: {
                b.writeBool('alpha',   res.keep_alpha);
                b.writeBool('dither',  res.dither);
                b.writeBool('raw',     res.raw);
                b.writeString('color_format', colorFormatName(res.output_color_format));
                b.writeBool('output_file_enabled', res.output_file_enabled);
                b.writeString('output_file', res.output_file);
                b.writeBool('binary_mode', res.binary_mode);
                this.writePaletteType(b, res.palette_type);
                break;
            }

            case RES_TYPE_COLOR:
                b.writeUnsigned('colorval', res.colorval);
                break;

            case RES_TYPE_FONT: {
                b.writeInt('height',     res.font_height);
                b.writeInt('font_bits',  res.font_bits);
                b.writeBool('font_kerning', res.font_kerning);
                b.writeBool('font_include_st_glyphs',      res.font_charset_include_string_table);
                b.writeBool('font_support_extended_unicode', res.font_support_extended_unicode);
                b.writeBool('output_file_enabled', res.output_file_enabled);
                b.writeString('output_file', res.output_file);
                b.writeBool('binary_mode', res.binary_mode);

                const pageCount = NUM_FONT_CHAR_RANGES +
                    (res.font_support_extended_unicode ? NUM_FONT_EXTENDED_CHAR_RANGES : 0);

                b.openTag('font_page_data');
                for (let i = 0; i < pageCount; i++) {
                    const page = res.font_pages[i];
                    if (page) {
                        b.writeBool('enabled',     page.enabled);
                        b.writeInt('first_char',   page.first_char);
                        b.writeInt('last_char',    page.last_char);
                    }
                }
                b.closeTag('font_page_data');
                break;
            }

            default:
                b.writeString('folder_id', folderIdString(res.type, res.folder_id));
                break;
        }
    }

    private writePaletteType(b: XmlBuilder, paletteType: number): void {
        let name: string;
        switch (paletteType) {
            case PALETTE_TYPE_PRIVATE: name = 'Private'; break;
            case PALETTE_TYPE_SHARED:  name = 'Shared';  break;
            default:                   name = 'None';    break;
        }
        b.writeString('palette_type', name);
    }

    // -------------------------------------------------------------------------
    // WriteStringTable
    // -------------------------------------------------------------------------

    private writeStringTable(b: XmlBuilder, d: DisplayInfo, h: ProjectHeader): void {
        b.openTag('string_table');
        const entries = d.string_entries;
        b.writeInt('sort_column',  -1);  // default: no sort
        b.writeInt('num_strings',  entries.length + 1); // +1: 1-based
        b.writeInt('num_languages', h.num_languages);

        for (const entry of entries) {
            b.openTag('string_record');
            b.writeString('id',   entry.name, true);
            b.writeInt('font',    0);
            b.writeString('notes', '', true);
            for (let lang = 0; lang < h.num_languages; lang++) {
                b.writeString('val', entry.translations[lang] ?? '', true);
            }
            b.closeTag('string_record');
        }
        b.closeTag('string_table');
    }

    // -------------------------------------------------------------------------
    // WriteScreenFlow
    // -------------------------------------------------------------------------

    private writeScreenFlow(b: XmlBuilder, d: DisplayInfo): void {
        if (d.screen_flow.length === 0) return;

        b.openTag('screen_flow');
        b.writeInt('scale', 100);
        for (const item of d.screen_flow) {
            b.openTag('flow_item');
            b.writeString('screen_name', item.screen_name);
            b.writeRect('rect', 0, 0, 0, 0);
            b.writeBool('enabled', true);
            for (const trigger of item.trigger_list) {
                this.writeTriggerInfo(b, trigger as Record<string, unknown>);
            }
            b.closeTag('flow_item');
        }
        b.closeTag('screen_flow');
    }

    private writeTriggerInfo(b: XmlBuilder, t: Record<string, unknown>): void {
        b.openTag('trigger_info');
        b.writeString('trigger_name',                t['trigger_name'] as string ?? '');
        b.writeString('signal_id_name',              t['signal_id_name'] as string ?? '');
        b.writeString('trigger_type',                t['trigger_type'] as string ?? '');
        b.writeString('event_type',                  t['event_type'] as string ?? '');
        b.writeString('system_event_animat_id_name', t['system_event_animat_id'] as string ?? '');
        b.writeString('user_event_id_name',          t['user_event_id'] as string ?? '');

        b.openTag('action_list');
        const actions = (t['actions'] as unknown[]) ?? [];
        for (const action of actions) {
            this.writeActionInfo(b, action as Record<string, unknown>);
        }
        b.closeTag('action_list');

        b.closeTag('trigger_info');
    }

    private writeActionInfo(b: XmlBuilder, a: Record<string, unknown>): void {
        b.openTag('action_info');
        b.writeString('action_name',         a['action_name'] as string ?? '');
        b.writeString('action_type',         a['action_type'] as string ?? '');
        b.writeString('target_widget_name',  a['target_widget_name'] as string ?? '');
        b.writeString('parent_widget_name',  a['parent_widget_name'] as string ?? '');
        b.writeString('animation_id_name',   a['animation_id_name'] as string ?? '');
        b.writeBool('target_show_child_widgets', (a['target_show_children'] as boolean) ?? false);
        b.writeBool('parent_show_child_widgets', (a['parent_show_children'] as boolean) ?? false);

        const anim = a['animation'] as Record<string, unknown> | null;
        if (anim) {
            b.openTag('animation_info');
            b.writeInt('start_x', anim['start_x'] as number ?? 0);
            b.writeInt('start_y', anim['start_y'] as number ?? 0);
            b.writeInt('end_x',   anim['end_x'] as number ?? 0);
            b.writeInt('end_y',   anim['end_y'] as number ?? 0);
            // UByte / UShort fields
            b.writeString('steps', String(anim['steps'] ?? 0), true);
            b.writeString('frame_interval', String(anim['frame_interval'] ?? 0), true);
            b.writeString('start_delay',    String(anim['start_delay'] ?? 0), true);
            b.writeString('start_alpha',    String(anim['start_alpha'] ?? 255), true);
            b.writeString('end_alpha',      String(anim['end_alpha'] ?? 255), true);
            b.writeBool('detach_target',    (anim['detach_target'] as boolean) ?? false);
            b.writeBool('push_target',      (anim['push_target'] as boolean) ?? false);
            b.writeString('easing_func_id_name', anim['easing_func'] as string ?? '');
            b.closeTag('animation_info');
        }
        b.closeTag('action_info');
    }

    // -------------------------------------------------------------------------
    // WriteWidgetFolders / WriteWidgets
    // -------------------------------------------------------------------------

    private writeWidgetFolders(b: XmlBuilder, d: DisplayInfo): void {
        for (const folder of d.folders) {
            b.openTag('widget_folder');
            b.writeString('folder_name', folder.folder_name, true);
            b.writeString('specified_output_name', folder.output_filename);
            this.writeWidgets(b, folder.widgets);
            b.closeTag('widget_folder');
        }
    }

    private writeWidgets(b: XmlBuilder, widgets: WidgetInfo[]): void {
        for (const w of widgets) {
            b.openTag('widget');
            this.writeOneWidget(b, w);
            this.writeWidgets(b, w.children);
            b.closeTag('widget');
        }
    }

    /**
     * Write one widget's base fields (mirrors widget_service_provider::WriteToProject).
     * Widget-type-specific fields are written by the WidgetService implementations.
     */
    private writeOneWidget(b: XmlBuilder, w: WidgetInfo): void {
        const typeName = WIDGET_TYPE_TO_NAME.get(w.basetype) ?? 'widget';
        b.writeString('type', typeName);
        b.writeString('app_name', w.app_name);
        b.writeRect('size', w.size.left, w.size.top, w.size.right, w.size.bottom);
        b.writeUnsigned('style',      w.style);
        b.writeInt('allocation',      w.allocation);
        b.writeBool('accepts_focus',  w.accepts_focus);

        // Color IDs — stored as resource name strings (version 53+)
        // In the TypeScript model we store numeric IDs; reverse-lookup to name is in
        // the write path via ResourceDictionary.  For now write "0" as placeholder.
        b.writeString('normal_fill_color',   String(w.color_id[0]), true);
        b.writeString('selected_fill_color', String(w.color_id[1]), true);
        b.writeString('disabled_fill_color', String(w.color_id[2]), true);

        b.writeString('event_handler',    w.event_func);
        b.writeString('draw_func',        w.draw_func);
        b.writeString('id_name',          w.id_name);
        b.writeString('custom_name',      w.custom_name);
        b.writeString('user_data',        w.user_data);
        b.writeBool('template',           w.is_template);
        b.writeBool('visible_at_startup', w.visible_at_startup);
    }
}
