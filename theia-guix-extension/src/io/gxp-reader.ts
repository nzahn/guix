/**
 * GXP project file reader.
 *
 * Ports StudioXProject::Read(), ReadProjectHeader(), ReadDisplayInfo(),
 * ReadResources(), ReadStringTable(), ReadScreenFlow(), ReadWidgetFolders()
 * and the base widget_service_provider::ReadFromProject() from the C++ GUIX
 * Studio source.
 *
 * Uses @xmldom/xmldom for XML parsing (no regex, no native add-ons).
 * Schema version 56 (PROJECT_VERSION) is the canonical target; older versions
 * are migrated forward automatically.
 */

import { DOMParser } from '@xmldom/xmldom';
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
    RES_TYPE_STRING,
    PATH_TYPE_PROJECT_RELATIVE,
    PATH_TYPE_INSTALL_RELATIVE,
    PALETTE_TYPE_NONE,
    PALETTE_TYPE_PRIVATE,
    PALETTE_TYPE_SHARED,
    DEFAULT_THEME,
    PROJECT_VERSION,
    MAX_DISPLAYS,
    MAX_LANGUAGES,
    MAX_THEMES,
    NUM_FONT_CHAR_RANGES,
    NUM_FONT_EXTENDED_CHAR_RANGES,
    CUSTOM_COLOR_FOLDER,
    CUSTOM_FONT_FOLDER,
    CUSTOM_PIXELMAP_FOLDER,
    STRING_GROUP,
    THEME_HEADER,
    GX_SCREEN_ROTATION_NONE,
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
    STRING_EXPORT_TYPE_XLIFF,
    STATICALLY_ALLOCATED,
} from '../common/gx-types';

import type {
    GxpProject,
    ProjectHeader,
    DisplayInfo,
    ThemeInfo,
    ScrollbarAppearance,
} from '../common/project-model';

import {
    createDefaultResInfo,
    createDefaultPathInfo,
} from '../common/res-info';
import type { ResInfo } from '../common/res-info';

import {
    createDefaultWidgetInfo,
} from '../common/widget-info';
import type { WidgetInfo, FolderInfo, GxRectangle } from '../common/widget-info';

// ---------------------------------------------------------------------------
// Public error type
// ---------------------------------------------------------------------------

export class GxpParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GxpParseError';
    }
}

// ---------------------------------------------------------------------------
// Widget type → string name mapping (mirrors widget_service_provider::GetShortName())
// ---------------------------------------------------------------------------

const WIDGET_TYPE_TO_NAME: ReadonlyMap<number, string> = new Map([
    [1,   'widget'],
    [2,   'button'],
    [3,   'text button'],
    [4,   'multi line text button'],
    [5,   'radio button'],
    [6,   'checkbox'],
    [7,   'pixelmap button'],
    [8,   'shadow button'],
    [9,   'icon button'],
    [10,  'spin button'],
    [11,  'icon'],
    [12,  'sprite'],
    [13,  'circular gauge'],
    [20,  'slider'],
    [21,  'pixelmap slider'],
    [22,  'vertical scroll'],
    [23,  'horizontal scroll'],
    [24,  'progress bar'],
    [25,  'radial progress bar'],
    [26,  'radial slider'],
    [30,  'prompt'],
    [31,  'numeric prompt'],
    [32,  'pixelmap prompt'],
    [33,  'numeric pixelmap prompt'],
    [64,  'single line text input'],
    [65,  'pixelmap text input'],
    [70,  'drop list'],
    [75,  'menu list'],
    [76,  'menu'],
    [77,  'accordion menu'],
    [128, 'window'],
    [129, 'root window'],
    [131, 'vertical list'],
    [132, 'horizontal list'],
    [133, 'popup list'],
    [134, 'multi line text view'],
    [135, 'multi line text input'],
    [136, 'line chart'],
    [137, 'dialog'],
    [138, 'keyboard'],
    [139, 'scroll wheel'],
    [140, 'text scroll wheel'],
    [141, 'string scroll wheel'],
    [142, 'numeric scroll wheel'],
    [143, 'tree view'],
    [144, 'rich text view'],
    [145, 'generic scroll wheel'],
    [200, 'template'],
]);

const WIDGET_NAME_TO_TYPE: ReadonlyMap<string, number> = new Map(
    [...WIDGET_TYPE_TO_NAME.entries()].map(([k, v]) => [v, k])
);

// ---------------------------------------------------------------------------
// Resource type name mapping (mirrors res_types[] in StudioXProject.cpp)
// ---------------------------------------------------------------------------

const RES_TYPE_NAME_MAP: ReadonlyMap<string, number> = new Map([
    ['HEADER',   RES_TYPE_HEADER],
    ['GROUP',    RES_TYPE_GROUP],
    ['FOLDER',   RES_TYPE_FOLDER],
    ['FONT',     RES_TYPE_FONT],
    ['COLOR',    RES_TYPE_COLOR],
    ['PIXELMAP', RES_TYPE_PIXELMAP],
    ['STRING',   RES_TYPE_STRING],
]);

// ---------------------------------------------------------------------------
// Folder-id name mapping (mirrors res_folder_ids[] / res_group_ids[] / res_header_ids[])
// ---------------------------------------------------------------------------

function parseFolderIdForType(resType: number, name: string): number {
    // res_header_ids
    if (resType === RES_TYPE_HEADER) {
        if (name === 'THEME_HEADER' || name === '4096') return THEME_HEADER;
        return parseInt(name, 10) || 0;
    }
    // res_group_ids
    if (resType === RES_TYPE_GROUP) {
        const map: Record<string, number> = {
            COLOR_GROUP: 4096, FONT_GROUP: 4097, PIXELMAP_GROUP: 4098, STRING_GROUP: 4099,
            '4096': 4096, '4097': 4097, '4098': 4098, '4099': 4099,
        };
        return map[name] ?? (parseInt(name, 10) || 0);
    }
    // res_folder_ids
    if (resType === RES_TYPE_FOLDER) {
        const map: Record<string, number> = {
            DEFAULT_COLOR_FOLDER: 4096, CUSTOM_COLOR_FOLDER: 4097,
            DEFAULT_FONT_FOLDER: 4098, CUSTOM_FONT_FOLDER: 4099,
            DEFAULT_PIXELMAP_FOLDER: 4100, CUSTOM_PIXELMAP_FOLDER: 4101,
            '4096': 4096, '4097': 4097, '4098': 4098,
            '4099': 4099, '4100': 4100, '4101': 4101,
        };
        return map[name] ?? (parseInt(name, 10) || 0);
    }
    return 0;
}

// ---------------------------------------------------------------------------
// Screen rotation string mapping (mirrors screen_rotation_list[] in ProjectConfigDlg.cpp)
// ---------------------------------------------------------------------------

function parseRotationAngle(name: string): number {
    const map: Record<string, number> = {
        None: GX_SCREEN_ROTATION_NONE,
        CW: GX_SCREEN_ROTATION_CW,
        CCW: GX_SCREEN_ROTATION_CCW,
        FLIP: GX_SCREEN_ROTATION_FLIP,
        '0': GX_SCREEN_ROTATION_NONE,
        '90': GX_SCREEN_ROTATION_CW,
        '270': GX_SCREEN_ROTATION_CCW,
        '180': GX_SCREEN_ROTATION_FLIP,
    };
    return map[name] ?? GX_SCREEN_ROTATION_NONE;
}

// ---------------------------------------------------------------------------
// String export type mapping
// ---------------------------------------------------------------------------

function parseStringExportType(name: string): number {
    if (name === 'STRING_EXPORT_TYPE_CSV') return 2;
    return STRING_EXPORT_TYPE_XLIFF; // default
}

// ---------------------------------------------------------------------------
// Colour format for display (derived from bits_per_pix + flags)
// ---------------------------------------------------------------------------

function deriveColorFormat(
    bits: number,
    packed: boolean,
    format_555: boolean,
    format_4444: boolean,
    format_332: boolean,
    _grayscale: boolean,
    reverse: boolean,
): number {
    switch (bits) {
        case 1:  return GX_COLOR_FORMAT_MONOCHROME;
        case 4:  return GX_COLOR_FORMAT_4BIT_GRAY;
        case 8:
            if (format_332) return GX_COLOR_FORMAT_8BIT_PACKED_PIXEL;
            return GX_COLOR_FORMAT_8BIT_PALETTE;
        case 24:
            return packed ? GX_COLOR_FORMAT_24RGB : GX_COLOR_FORMAT_24XRGB;
        case 32:
            return reverse ? GX_COLOR_FORMAT_32BGRA : GX_COLOR_FORMAT_32ARGB;
        default: { // 16 bpp
            if (format_4444) return reverse ? GX_COLOR_FORMAT_4444BGRA : GX_COLOR_FORMAT_4444ARGB;
            if (format_555)  return reverse ? GX_COLOR_FORMAT_5551BGRX : GX_COLOR_FORMAT_1555XRGB;
            return reverse ? GX_COLOR_FORMAT_565BGR : GX_COLOR_FORMAT_565RGB;
        }
    }
}

// ---------------------------------------------------------------------------
// GxpContext — sequential DOM section traversal
// (mirrors the xml_reader section stack from the C++ implementation)
// ---------------------------------------------------------------------------

/**
 * Wraps a DOM Element and maintains a sequential child-index so that
 * `enterSection()` and `read*()` advance forward through child elements
 * in document order — exactly as the C++ xml_reader section stack does.
 */
class GxpContext {
    private readonly children: Element[];
    private pos: number = 0;

    constructor(element: Element) {
        this.children = GxpContext.elementChildren(element);
    }

    /** Enter the next child element with `tagName` and return a new context. */
    enterSection(tagName: string): GxpContext | null {
        for (let i = this.pos; i < this.children.length; i++) {
            if (this.children[i].tagName === tagName) {
                this.pos = i + 1;
                return new GxpContext(this.children[i]);
            }
        }
        return null;
    }

    /**
     * Check whether `tagName` exists without advancing position.
     * Used for the C++ "peek and reset" pattern (CloseSection(FALSE,FALSE)).
     */
    hasSection(tagName: string): boolean {
        for (let i = this.pos; i < this.children.length; i++) {
            if (this.children[i].tagName === tagName) return true;
        }
        return false;
    }

    /** Read the text content of the next child with `tagName`; advance position. */
    private readText(tagName: string): string | null {
        for (let i = this.pos; i < this.children.length; i++) {
            if (this.children[i].tagName === tagName) {
                this.pos = i + 1;
                return this.children[i].textContent ?? null;
            }
        }
        return null;
    }

    readString(tagName: string, defaultVal = ''): string {
        return this.readText(tagName)?.trim() ?? defaultVal;
    }

    readInt(tagName: string, defaultVal = 0): number {
        const t = this.readText(tagName);
        if (t === null) return defaultVal;
        const v = parseInt(t.trim(), 10);
        return isNaN(v) ? defaultVal : v;
    }

    readUnsigned(tagName: string, defaultVal = 0): number {
        return this.readInt(tagName, defaultVal);
    }

    readBool(tagName: string, defaultVal = false): boolean {
        const t = this.readText(tagName);
        if (t === null) return defaultVal;
        const up = t.trim().toUpperCase();
        return up === 'TRUE' || up === '1';
    }

    readUByte(tagName: string, defaultVal = 0): number {
        const v = this.readInt(tagName, defaultVal);
        return Math.max(0, Math.min(255, v));
    }

    readUShort(tagName: string, defaultVal = 0): number {
        const v = this.readInt(tagName, defaultVal);
        return Math.max(0, Math.min(65535, v));
    }

    readRect(tagName: string): GxRectangle {
        const sec = this.enterSection(tagName);
        if (sec) {
            return {
                left:   sec.readInt('left'),
                top:    sec.readInt('top'),
                right:  sec.readInt('right'),
                bottom: sec.readInt('bottom'),
            };
        }
        return { left: 0, top: 0, right: 0, bottom: 0 };
    }

    readPathInfo(): { pathname: string; pathtype: number } {
        const sec = this.enterSection('pathinfo');
        if (!sec) return createDefaultPathInfo();
        const pathname = sec.readString('pathname', '');
        const typeStr  = sec.readString('pathtype', 'project_relative');
        let pathtype = PATH_TYPE_PROJECT_RELATIVE;
        if (typeStr === 'studio_relative') pathtype = PATH_TYPE_INSTALL_RELATIVE;
        else if (typeStr === 'absolute')   pathtype = 2;
        return { pathname, pathtype };
    }

    /** Return a snapshot of current position (for re-reading sections). */
    savePos(): number { return this.pos; }

    /** Restore a previously saved position. */
    restorePos(saved: number): void { this.pos = saved; }

    private static elementChildren(el: Element): Element[] {
        const result: Element[] = [];
        const nodes = el.childNodes;
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes.item(i);
            if (n && n.nodeType === 1 /* ELEMENT_NODE */) {
                result.push(n as Element);
            }
        }
        return result;
    }
}

// ---------------------------------------------------------------------------
// Resource dictionary helpers
// ---------------------------------------------------------------------------

/** Per-display resource name → numeric resource ID maps. */
interface ResDicts {
    colors:    Map<string, number>;
    fonts:     Map<string, number>;
    pixelmaps: Map<string, number>;
    strings:   Map<string, number>;
}

function makeResDicts(): ResDicts {
    return {
        colors: new Map(),
        fonts: new Map(),
        pixelmaps: new Map([['', 0]]), // index 0 is always empty
        strings: new Map(),
    };
}

function addToResDict(dicts: ResDicts, type: number, name: string): number {
    let dict: Map<string, number>;
    switch (type) {
        case RES_TYPE_COLOR:    dict = dicts.colors;    break;
        case RES_TYPE_FONT:     dict = dicts.fonts;     break;
        case RES_TYPE_PIXELMAP: dict = dicts.pixelmaps; break;
        case RES_TYPE_STRING:   dict = dicts.strings;   break;
        default: return 0;
    }
    if (dict.has(name)) return dict.get(name)!;
    const id = dict.size;
    dict.set(name, id);
    return id;
}

function lookupResId(dicts: ResDicts, type: number, name: string): number {
    let dict: Map<string, number>;
    switch (type) {
        case RES_TYPE_COLOR:    dict = dicts.colors;    break;
        case RES_TYPE_FONT:     dict = dicts.fonts;     break;
        case RES_TYPE_PIXELMAP: dict = dicts.pixelmaps; break;
        case RES_TYPE_STRING:   dict = dicts.strings;   break;
        default: return 0;
    }
    return dict.get(name) ?? 0;
}

// ---------------------------------------------------------------------------
// GxpReader — main parser class
// ---------------------------------------------------------------------------

@injectable()
export class GxpReader {

    /**
     * Parse a `.gxp` XML file and return the in-memory project model.
     *
     * @param xmlContent  Raw UTF-8 text of the `.gxp` file.
     * @param filePath    Absolute path to the file (for error messages and
     *                    relative-path resolution).
     */
    readProject(xmlContent: string, filePath: string): GxpProject {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlContent, 'application/xml');

        const root = doc.documentElement;
        if (!root || root.tagName !== 'project') {
            throw new GxpParseError(`Not a GUIX Studio project file: ${filePath}`);
        }

        const ctx = new GxpContext(root);

        const header = this.readProjectHeader(ctx);

        if (header.project_version > PROJECT_VERSION) {
            // Warn but continue — the C++ tool also continues after prompting
            console.warn(
                `[GxpReader] project_version=${header.project_version} > ` +
                `expected=${PROJECT_VERSION}. File may be from a newer GUIX Studio.`
            );
        }

        // Derive project name from file path (match C++ Read() behaviour)
        const baseName = filePath.replace(/\\/g, '/').split('/').pop() ?? '';
        header.project_name = baseName.endsWith('.gxp')
            ? baseName.slice(0, -4)
            : baseName;

        const resDicts: ResDicts[] = Array.from({ length: MAX_DISPLAYS }, makeResDicts);
        const displays: DisplayInfo[] = [];

        for (let idx = 0; idx < header.max_displays; idx++) {
            const display = this.readDisplayInfo(ctx, idx, header, resDicts[idx] ?? makeResDicts());
            displays.push(display);
        }

        return {
            header,
            displays,
            filePath,
            isModified: false,
        };
    }

    // -------------------------------------------------------------------------
    // ReadProjectHeader
    // -------------------------------------------------------------------------

    private readProjectHeader(ctx: GxpContext): ProjectHeader {
        const header = this.makeDefaultProjectHeader();

        const sec = ctx.enterSection('header');
        if (!sec) return header;

        header.project_version = sec.readInt('project_version', PROJECT_VERSION);
        header.guix_version    = sec.readInt('guix_version', 50000);
        header.studio_version  = sec.readInt('studio_version', 5030200);

        // Migrate old guix_version format (pre-5.0): "major * 10 + minor" → vv.mm.pp
        if (header.guix_version < 50000) {
            const major = Math.floor(header.guix_version / 10);
            const minor = header.guix_version - major * 10;
            header.guix_version = major * 1000000 + minor * 1000;
        }

        header.project_name       = sec.readString('project_name');
        header.source_path        = sec.readString('source_path', '.\\');
        header.header_path        = sec.readString('header_path', '.\\');
        header.resource_path      = sec.readString('resource_path', '.\\');
        header.malloc_name        = sec.readString('allocator_function');
        header.free_name          = sec.readString('free_function');
        header.additional_headers = sec.readString('additional_headers');
        header.insert_headers_before = sec.readBool('insert_headers_before');

        header.target_cpu   = sec.readInt('target_cpu');
        header.target_tools = sec.readInt('target_tools');
        header.big_endian   = sec.readBool('big_endian');

        header.dave2d_graph_accelerator = sec.readBool('dave2d_graph_accelerator') ||
                                          sec.readBool('synergy_graph_accelerator');
        header.renesas_jpeg_decoder = sec.readInt('renesas_jpeg_decoder',
                                        sec.readInt('synergy_jpeg_decoder', 2 /*DECODER_TYPE_HW*/));
        header.renesas_png_decoder  = sec.readInt('renesas_png_decoder',
                                        sec.readInt('synergy_png_decoder', 0));

        header.grid_enabled           = sec.readBool('grid_enabled');
        header.snap_enabled           = sec.readBool('snap_enabled');
        header.snap_to_widget_enabled = sec.readBool('snap_to_widget_enabled');
        header.grid_spacing = Math.max(1, Math.min(100, sec.readInt('grid_spacing', 10)));
        header.snap_spacing = Math.max(1, Math.min(100, sec.readInt('snap_spacing', 10)));

        header.gen_binary        = sec.readBool('gen_binary');
        header.binary_file_format = sec.readUnsigned('binary_file_format', 0x01);
        header.memory_offset     = sec.readUnsigned('memory_offset');
        header.gen_res_header    = sec.readBool('gen_res_header', true);

        header.custom_resource_enabled   = sec.readBool('custom_resource_enabled');
        header.custom_resource_file_name = sec.readString('custom_resource_file_name');

        header.app_execute_xpos          = sec.readInt('app_execute_xpos', 20);
        header.app_execute_ypos          = sec.readInt('app_execute_ypos', 20);
        header.is_widget_position_locked = sec.readBool('is_widget_position_locked');
        header.palette_mode_aa_text_colors = sec.readInt('palette_mode_aa_text_colors', 8);

        header.num_displays = Math.max(1, Math.min(MAX_DISPLAYS, sec.readInt('num_displays', 1)));
        header.max_displays = Math.max(header.num_displays,
                                       Math.min(MAX_DISPLAYS, sec.readInt('max_displays', 4)));
        header.num_languages = Math.max(1, Math.min(MAX_LANGUAGES, sec.readInt('num_languages', 1)));

        // Language names
        const langSec = sec.enterSection('language_names');
        if (langSec) {
            for (let i = 0; i < header.num_languages; i++) {
                let name = langSec.readString('language', 'English');
                // Strip old "{symbol}" suffix
                const braceIdx = name.lastIndexOf('{');
                if (braceIdx > 0) name = name.slice(0, braceIdx).trimEnd();

                header.languages[i] = {
                    name,
                    support_bidi_text:            langSec.readBool('support_bidi_text'),
                    gen_reordered_bidi_text:       langSec.readBool('gen_reordered_bidi_text'),
                    support_thai_glyph_shaping:    langSec.readBool('support_thai_glyph_shaping'),
                    gen_adjusted_thai_string:      langSec.readBool('gen_adjusted_thai_string'),
                    statically_defined:            langSec.readBool('statically_defined', true),
                };
            }
        }

        // String export section (may be named "string_export" or legacy "xliff")
        const expSec = sec.enterSection('string_export') ?? sec.enterSection('xliff');
        if (expSec) {
            header.string_export_src      = expSec.readInt('string_export_src') ||
                                            expSec.readInt('xliff_src');
            header.string_export_target   = expSec.readInt('string_export_target') ||
                                            expSec.readInt('xliff_target');
            header.string_export_version  = expSec.readInt('string_export_version') ||
                                            expSec.readInt('xliff_version');
            header.string_export_path     = expSec.readString('string_export_path') ||
                                            expSec.readString('xliff_path', '.\\');
            header.string_export_filename = expSec.readString('string_export_name') ||
                                            expSec.readString('xliff_name');
            const typeStr = expSec.readString('string_export_filetype');
            header.string_export_filetype = parseStringExportType(typeStr);
        }

        return header;
    }

    // -------------------------------------------------------------------------
    // ReadDisplayInfo
    // -------------------------------------------------------------------------

    private readDisplayInfo(
        ctx: GxpContext,
        index: number,
        header: ProjectHeader,
        dicts: ResDicts,
    ): DisplayInfo {
        const display = this.makeDefaultDisplayInfo(index, header.num_languages);

        const sec = ctx.enterSection('display_info');
        if (!sec) return display;

        const openIndex = sec.readInt('display_index', index);
        if (openIndex !== index) return display;

        display.name = sec.readString('display_name', display.name);

        let xres = sec.readInt('xres', 320);
        let yres = sec.readInt('yres', 240);
        if (xres <= 0 || xres > 65535) xres = 320;
        if (yres <= 0 || yres > 65535) yres = 240;
        display.xres = xres;
        display.yres = yres;

        display.bits_per_pix    = sec.readInt('bits_per_pix', 16);
        display.packed_format   = sec.readBool('packed_format');
        display.format_555      = sec.readBool('format_555');
        display.format_4444     = sec.readBool('format_4444');
        display.format_332      = sec.readBool('format_332');
        display.grayscale       = sec.readBool('grayscale');
        display.reverse_order   = sec.readBool('reverse_order');
        display.enabled         = sec.readBool('enabled', true);

        const rotStr            = sec.readString('rotation_angle', 'None');
        display.rotation_angle  = parseRotationAngle(rotStr);
        display.default_map_format = sec.readBool('default_map_format', true);
        display.allocate_canvas = sec.readBool('allocate_canvas', true);

        display.colorformat = deriveColorFormat(
            display.bits_per_pix,
            display.packed_format,
            display.format_555,
            display.format_4444,
            display.format_332,
            display.grayscale,
            display.reverse_order,
        );

        // Theme info
        const themeSec = sec.enterSection('theme_info');
        if (themeSec) {
            display.num_themes   = Math.max(1, Math.min(MAX_THEMES, themeSec.readInt('num_themes', 1)));
            display.active_theme = themeSec.readInt('active_theme', DEFAULT_THEME);
            if (display.active_theme < 0 || display.active_theme >= display.num_themes) {
                display.active_theme = DEFAULT_THEME;
            }

            for (let t = 0; t < display.num_themes; t++) {
                const theme = display.themes[t];
                theme.theme_name              = themeSec.readString('theme_name', theme.theme_name);
                theme.gen_color_table         = themeSec.readBool('gen_color_table', true);
                theme.gen_font_table          = themeSec.readBool('gen_font_table', true);
                theme.gen_pixelmap_table      = themeSec.readBool('gen_pixelmap_table', true);
                theme.enabled                 = themeSec.readBool('enabled', true);
                theme.statically_defined      = themeSec.readBool('statically_defined', true);

                const themeData = themeSec.enterSection('theme_data');
                if (themeData) {
                    if (header.project_version >= 53) {
                        this.readResources(themeData, index, t, display, header, dicts);
                    }
                    this.readThemeScrollbars(themeData, theme);
                    this.readThemePaletteInfo(themeData, theme);
                    if (header.project_version <= 52) {
                        this.readResources(themeData, index, t, display, header, dicts);
                    }
                }
            }
        }

        // Per-language string table gen flags
        for (let lang = 0; lang < header.num_languages; lang++) {
            const langName = header.languages[lang]?.name ?? `lang_${lang}`;
            // C++ reads bool by language name — must scan sequentially
            const flag = sec.readBool(langName, true);
            display.gen_string_table[lang] = flag;
        }

        // String table, screen flow, widget folders
        if (header.project_version <= 52) {
            this.readWidgetFolders(sec, display, header, dicts);
            this.readResources(sec, index, 0, display, header, dicts);
            this.readStringTable(sec, display, header);
        } else {
            this.readStringTable(sec, display, header);
            this.readScreenFlow(sec, display);
            this.readWidgetFolders(sec, display, header, dicts);
        }

        return display;
    }

    // -------------------------------------------------------------------------
    // ReadThemeScrollbars
    // -------------------------------------------------------------------------

    private readThemeScrollbars(sec: GxpContext, theme: ThemeInfo): void {
        const vSec = sec.enterSection('vscroll_appearance');
        if (vSec) {
            theme.vscroll_appearance = this.readScrollbarAppearance(vSec);
            theme.vscroll_style      = vSec.readUnsigned('scroll_style', theme.vscroll_style);
        }
        const hSec = sec.enterSection('hscroll_appearance');
        if (hSec) {
            theme.hscroll_appearance = this.readScrollbarAppearance(hSec);
            theme.hscroll_style      = hSec.readUnsigned('scroll_style', theme.hscroll_style);
        }
    }

    private readScrollbarAppearance(sec: GxpContext): ScrollbarAppearance {
        return {
            gx_scroll_width:              sec.readInt('gx_scroll_width', 20),
            gx_scroll_thumb_width:        sec.readInt('gx_scroll_thumb_width', 18),
            gx_scroll_thumb_travel_min:   sec.readInt('gx_scroll_thumb_travel_min', 20),
            gx_scroll_thumb_travel_max:   sec.readInt('gx_scroll_thumb_travel_max', 20),
            gx_scroll_thumb_border_style: sec.readUnsigned('gx_scroll_thumb_border_style', 0),
            gx_scroll_fill_pixelmap:      sec.readUnsigned('gx_scroll_fill_pixelmap', 0),
            gx_scroll_thumb_pixelmap:     sec.readUnsigned('gx_scroll_thumb_pixelmap', 0),
            gx_scroll_up_pixelmap:        sec.readUnsigned('gx_scroll_up_pixelmap', 0),
            gx_scroll_down_pixelmap:      sec.readUnsigned('gx_scroll_down_pixelmap', 0),
            gx_scroll_thumb_color:        sec.readUnsigned('gx_scroll_thumb_color', 0),
            gx_scroll_thumb_border_color: sec.readUnsigned('gx_scroll_thumb_border_color', 0),
            gx_scroll_button_color:       sec.readUnsigned('gx_scroll_button_color', 0),
        };
    }

    // -------------------------------------------------------------------------
    // ReadThemePaletteInfo
    // -------------------------------------------------------------------------

    private readThemePaletteInfo(sec: GxpContext, theme: ThemeInfo): void {
        const palSec = sec.enterSection('palette');
        if (!palSec) {
            theme.palette = [];
            theme.palette_total_size = 0;
            theme.palette_predefined = 0;
            return;
        }
        let totalSize  = palSec.readInt('total_size', 0);
        if (totalSize > 256) totalSize = 256;
        let predefined = palSec.readInt('predefined', totalSize);
        if (predefined > totalSize) predefined = totalSize;
        if (predefined < 0)        predefined = 0;

        theme.palette_total_size = totalSize;
        theme.palette_predefined = predefined;
        theme.palette = [];

        for (let i = 0; i < predefined; i++) {
            let color = palSec.readUnsigned('rgb', 0);
            // Old projects did not store alpha; default to 0xFF
            if (color >>> 24 === 0) color = (color | 0xFF000000) >>> 0;
            theme.palette.push(color);
        }
    }

    // -------------------------------------------------------------------------
    // ReadResources
    // -------------------------------------------------------------------------

    private readResources(
        sec: GxpContext,
        _displayIndex: number,
        themeIndex: number,
        display: DisplayInfo,
        header: ProjectHeader,
        dicts: ResDicts,
        parent?: ResInfo,
    ): void {
        let resSec: GxpContext | null;
        while ((resSec = sec.enterSection('resource')) !== null) {
            const typeName = resSec.readString('type');
            const resType  = RES_TYPE_NAME_MAP.get(typeName);

            if (resType === undefined) {
                // unknown type; skip but still recurse in case children are valid
                this.readResources(resSec, _displayIndex, themeIndex, display, header, dicts, undefined);
                continue;
            }

            const res = createDefaultResInfo(resType);
            this.readOneResource(resSec, display, header, dicts, res);

            // Attach add-item children for custom folders
            if (resType === RES_TYPE_FOLDER) {
                switch (res.folder_id) {
                    case CUSTOM_COLOR_FOLDER:
                        res.children.push(createDefaultResInfo(RES_TYPE_ADD_COLOR));
                        break;
                    case CUSTOM_FONT_FOLDER:
                        res.children.push(createDefaultResInfo(RES_TYPE_ADD_FONT));
                        break;
                    case CUSTOM_PIXELMAP_FOLDER:
                        res.children.push(createDefaultResInfo(RES_TYPE_ADD_PIXELMAP));
                        break;
                    default: break;
                }
            } else if (resType === RES_TYPE_GROUP && res.folder_id === STRING_GROUP) {
                res.children.push(createDefaultResInfo(RES_TYPE_ADD_STRING));
            }

            if (parent) {
                parent.children.push(res);
            } else {
                // Root-level resource: append to this theme's resources
                display.themes[themeIndex].resources.push(res);
            }

            // Recurse into child resources
            this.readResources(resSec, _displayIndex, themeIndex, display, header, dicts, res);
        }

        // If no theme header was created as first resource, inject one
        if (!parent && display.themes[themeIndex].resources.length > 0) {
            const first = display.themes[themeIndex].resources[0];
            if (first.type !== RES_TYPE_HEADER || first.folder_id !== THEME_HEADER) {
                const hdr = createDefaultResInfo(RES_TYPE_HEADER);
                hdr.folder_id = THEME_HEADER;
                hdr.name = display.themes[themeIndex].theme_name;
                display.themes[themeIndex].resources.unshift(hdr);
            }
        }
    }

    private readOneResource(
        sec: GxpContext,
        display: DisplayInfo,
        header: ProjectHeader,
        dicts: ResDicts,
        res: ResInfo,
    ): void {
        res.name = sec.readString('name');
        res.pathinfo = sec.readPathInfo();

        if (header.project_version <= 52) {
            const resId = sec.readInt('resource_id', -1);
            if (res.type === RES_TYPE_FOLDER || res.type === RES_TYPE_HEADER ||
                res.type === RES_TYPE_GROUP) {
                res.folder_id = resId;
            }
        } else {
            const folderIdStr = sec.readString('folder_id', '');
            res.folder_id = parseFolderIdForType(res.type, folderIdStr);
        }

        res.is_default = sec.readBool('is_default');
        res.enabled    = sec.readBool('enabled', true);

        switch (res.type) {
            case RES_TYPE_COLOR: {
                res.colorval = sec.readUnsigned('colorval', 0);
                res.compress = false;
                addToResDict(dicts, RES_TYPE_COLOR, res.name);
                break;
            }

            case RES_TYPE_FONT: {
                res.font_height = Math.max(1, Math.min(255, sec.readInt('height', 0)));
                res.font_bits   = sec.readInt('font_bits', 8);
                if (![1, 4, 8].includes(res.font_bits)) res.font_bits = 8;

                res.font_charset_include_string_table = sec.readBool('font_include_st_glyphs');
                res.font_support_extended_unicode      = sec.readBool('font_support_extended_unicode');
                res.font_kerning                       = sec.readBool('font_kerning');
                res.compress                           = sec.readBool('compress');
                res.output_file_enabled                = sec.readBool('output_file_enabled');
                res.output_file                        = sec.readString('output_file');
                res.binary_mode                        = sec.readBool('binary_mode');

                let pageCount = NUM_FONT_CHAR_RANGES;
                if (res.font_support_extended_unicode) {
                    pageCount += NUM_FONT_EXTENDED_CHAR_RANGES;
                }

                // Create default font pages
                res.font_pages = Array.from({ length: pageCount }, () => ({
                    enabled: false,
                    first_char: 0,
                    last_char: 0,
                }));

                const fpDataSec = sec.enterSection('font_page_data');
                if (fpDataSec) {
                    for (let i = 0; i < pageCount; i++) {
                        res.font_pages[i].enabled    = fpDataSec.readBool('enabled');
                        res.font_pages[i].first_char = fpDataSec.readInt('first_char', 0);
                        res.font_pages[i].last_char  = fpDataSec.readInt('last_char', 0);
                    }
                } else {
                    // Very old format: firstchar / lastchar as direct children
                    res.font_pages[0].enabled    = true;
                    res.font_pages[0].first_char = sec.readInt('firstchar', 0x20);
                    res.font_pages[0].last_char  = sec.readInt('lastchar', 0x7E);
                }

                addToResDict(dicts, RES_TYPE_FONT, res.name);
                break;
            }

            case RES_TYPE_PIXELMAP: {
                res.keep_alpha    = sec.readBool('alpha');
                res.dither        = sec.readBool('dither');
                res.raw           = sec.readBool('raw');
                res.compress      = sec.readBool('compress');

                if (header.project_version >= 50 /* PROJECT_VERSION_WRITE_COLOR_FORMAT_NAME */) {
                    const cfName = sec.readString('color_format', '');
                    res.output_color_format = this.parseColorFormatName(cfName);
                } else {
                    res.output_color_format = sec.readInt('color_format', 0);
                }

                res.output_file_enabled = sec.readBool('output_file_enabled');
                res.output_file         = sec.readString('output_file');
                res.binary_mode         = sec.readBool('binary_mode');

                res.palette_type = this.readPaletteType(
                    sec, display.colorformat, res.output_color_format
                );

                // Sanity-check output_color_format
                if (res.output_color_format < 0 || res.output_color_format > 50) {
                    res.output_color_format = 0;
                }

                addToResDict(dicts, RES_TYPE_PIXELMAP, res.name);
                break;
            }

            default:
                break;
        }
    }

    private readPaletteType(
        sec: GxpContext,
        displayColorFormat: number,
        outputColorFormat: number,
    ): number {
        if (displayColorFormat === GX_COLOR_FORMAT_8BIT_PALETTE) {
            return PALETTE_TYPE_SHARED;
        }
        if (outputColorFormat !== GX_COLOR_FORMAT_8BIT_PALETTE) {
            return PALETTE_TYPE_NONE;
        }
        const str = sec.readString('palette_type', '');
        if (str === 'Private') return PALETTE_TYPE_PRIVATE;
        if (str === 'Shared')  return PALETTE_TYPE_SHARED;
        // Backward compat: numeric
        if (str === '0') return PALETTE_TYPE_PRIVATE;
        if (str === '1' || str === '2') return PALETTE_TYPE_SHARED;
        return PALETTE_TYPE_NONE;
    }

    private parseColorFormatName(name: string): number {
        // Minimal mapping for common formats written by resource_gen::GetColorFormatName
        const map: Record<string, number> = {
            GX_COLOR_FORMAT_MONOCHROME:    GX_COLOR_FORMAT_MONOCHROME,
            GX_COLOR_FORMAT_4BIT_GRAY:     GX_COLOR_FORMAT_4BIT_GRAY,
            GX_COLOR_FORMAT_8BIT_PALETTE:  GX_COLOR_FORMAT_8BIT_PALETTE,
            GX_COLOR_FORMAT_565RGB:        GX_COLOR_FORMAT_565RGB,
            GX_COLOR_FORMAT_565BGR:        GX_COLOR_FORMAT_565BGR,
            GX_COLOR_FORMAT_1555XRGB:      GX_COLOR_FORMAT_1555XRGB,
            GX_COLOR_FORMAT_5551BGRX:      GX_COLOR_FORMAT_5551BGRX,
            GX_COLOR_FORMAT_4444ARGB:      GX_COLOR_FORMAT_4444ARGB,
            GX_COLOR_FORMAT_4444BGRA:      GX_COLOR_FORMAT_4444BGRA,
            GX_COLOR_FORMAT_24RGB:         GX_COLOR_FORMAT_24RGB,
            GX_COLOR_FORMAT_24XRGB:        GX_COLOR_FORMAT_24XRGB,
            GX_COLOR_FORMAT_32ARGB:        GX_COLOR_FORMAT_32ARGB,
            GX_COLOR_FORMAT_32BGRA:        GX_COLOR_FORMAT_32BGRA,
        };
        return map[name] ?? 0;
    }

    // -------------------------------------------------------------------------
    // ReadStringTable
    // -------------------------------------------------------------------------

    private readStringTable(
        sec: GxpContext,
        display: DisplayInfo,
        _header: ProjectHeader,
    ): void {
        display.string_entries = [];

        const stSec = sec.enterSection('string_table');
        if (!stSec) return;

        const numStrings   = Math.max(1, Math.min(65535, stSec.readInt('num_strings', 1)));
        const numLanguages = Math.max(1, Math.min(MAX_LANGUAGES, stSec.readInt('num_languages', 1)));

        // String indices are 1-based (index 0 is reserved/null)
        for (let idx = 1; idx < numStrings; idx++) {
            const recSec = stSec.enterSection('string_record');
            if (!recSec) break;

            const idName = recSec.readString('id', `STRING_${idx}`);
            void recSec.readInt('font', 0);      // advance position; value stored in StringEntry if needed
            void recSec.readString('notes', ''); // advance position
            const translations: string[] = [];

            for (let lang = 0; lang < numLanguages; lang++) {
                translations.push(recSec.readString('val', ''));
            }

            display.string_entries.push({ string_id: idx, name: idName, translations });
            // Register in string dictionary (for widget ID resolution)
            // Note: string IDs are managed by the string_table separately
        }
    }

    // -------------------------------------------------------------------------
    // ReadScreenFlow
    // -------------------------------------------------------------------------

    private readScreenFlow(sec: GxpContext, display: DisplayInfo): void {
        display.screen_flow = [];

        const flowSec = sec.enterSection('screen_flow');
        if (!flowSec) return;

        let item: GxpContext | null;
        while ((item = flowSec.enterSection('flow_item')) !== null) {
            const screenName = item.readString('screen_name');
            const triggers: unknown[] = [];

            let trigSec: GxpContext | null;
            while ((trigSec = item.enterSection('trigger_info')) !== null) {
                // Store raw trigger data; full parsing is in screen-flow-editor.ts
                triggers.push(this.readTriggerInfo(trigSec));
            }

            display.screen_flow.push({ screen_name: screenName, trigger_list: triggers });
        }
    }

    private readTriggerInfo(sec: GxpContext): unknown {
        // Read trigger structure; typed detail in screen-flow-model.ts
        const trigger_name            = sec.readString('trigger_name');
        const signal_id_name          = sec.readString('signal_id_name');
        const trigger_type            = sec.readString('trigger_type');
        const event_type              = sec.readString('event_type');
        const system_event_animat_id  = sec.readString('system_event_animat_id_name');
        const user_event_id           = sec.readString('user_event_id_name');

        const actions: unknown[] = [];
        const actionListSec = sec.enterSection('action_list');
        if (actionListSec) {
            let actionSec: GxpContext | null;
            while ((actionSec = actionListSec.enterSection('action_info')) !== null) {
                actions.push(this.readActionInfo(actionSec));
            }
        }

        return {
            trigger_name, signal_id_name, trigger_type, event_type,
            system_event_animat_id, user_event_id, actions,
        };
    }

    private readActionInfo(sec: GxpContext): unknown {
        const action_name          = sec.readString('action_name');
        const action_type          = sec.readString('action_type');
        const target_widget_name   = sec.readString('target_widget_name');
        const parent_widget_name   = sec.readString('parent_widget_name');
        const animation_id_name    = sec.readString('animation_id_name');
        const target_show_children = sec.readBool('target_show_child_widgets');
        const parent_show_children = sec.readBool('parent_show_child_widgets');

        let animation: unknown = null;
        const animSec = sec.enterSection('animation_info');
        if (animSec) {
            animation = {
                start_x:        animSec.readInt('start_x'),
                start_y:        animSec.readInt('start_y'),
                end_x:          animSec.readInt('end_x'),
                end_y:          animSec.readInt('end_y'),
                steps:          animSec.readUByte('steps', 0),
                frame_interval: animSec.readUShort('frame_interval',
                                    animSec.readUShort('delay_time', 0)),
                start_delay:    animSec.readUShort('start_delay',
                                    animSec.readUShort('delay_before', 0)),
                start_alpha:    animSec.readUByte('start_alpha', 255),
                end_alpha:      animSec.readUByte('end_alpha', 255),
                detach_target:  animSec.readBool('detach_target'),
                push_target:    animSec.readBool('push_target'),
                easing_func:    animSec.readString('easing_func_id_name'),
            };
        }

        return {
            action_name, action_type, target_widget_name, parent_widget_name,
            animation_id_name, target_show_children, parent_show_children, animation,
        };
    }

    // -------------------------------------------------------------------------
    // ReadWidgetFolders / ReadWidgets
    // -------------------------------------------------------------------------

    private readWidgetFolders(
        sec: GxpContext,
        display: DisplayInfo,
        header: ProjectHeader,
        dicts: ResDicts,
    ): void {
        display.folders = [];

        if (!sec.hasSection('widget_folder')) {
            // Old format: no folder wrapper — create a default folder
            const folder: FolderInfo = {
                folder_name: 'default_folder',
                output_filename: '',
                widgets: [],
            };
            display.folders.push(folder);
            this.readWidgets(sec, folder, header, dicts);
            return;
        }

        let folderSec: GxpContext | null;
        while ((folderSec = sec.enterSection('widget_folder')) !== null) {
            const folder: FolderInfo = {
                folder_name: folderSec.readString('folder_name', 'default_folder'),
                output_filename: folderSec.readString('specified_output_name', ''),
                widgets: [],
            };
            display.folders.push(folder);
            this.readWidgets(folderSec, folder, header, dicts);
        }
    }

    private readWidgets(
        sec: GxpContext,
        folder: FolderInfo,
        header: ProjectHeader,
        dicts: ResDicts,
    ): void {
        let widgetSec: GxpContext | null;
        while ((widgetSec = sec.enterSection('widget')) !== null) {
            const widget = this.readOneWidget(widgetSec, header, dicts);
            if (widget) {
                this.readChildWidgets(widgetSec, widget, header, dicts);
                folder.widgets.push(widget);
            }
        }
    }

    private readChildWidgets(
        sec: GxpContext,
        parent: WidgetInfo,
        header: ProjectHeader,
        dicts: ResDicts,
    ): void {
        let childSec: GxpContext | null;
        while ((childSec = sec.enterSection('widget')) !== null) {
            const widget = this.readOneWidget(childSec, header, dicts);
            if (widget) {
                this.readChildWidgets(childSec, widget, header, dicts);
                parent.children.push(widget);
            }
        }
    }

    /**
     * Read one widget from the "widget" section.
     * Mirrors widget_reader::ReadOneWidget() + widget_service_provider::ReadFromProject().
     */
    private readOneWidget(
        sec: GxpContext,
        header: ProjectHeader,
        dicts: ResDicts,
    ): WidgetInfo | null {
        const typeName   = sec.readString('type', 'widget');
        const widgetType = WIDGET_NAME_TO_TYPE.get(typeName);
        if (widgetType === undefined) return null;

        const info = createDefaultWidgetInfo(widgetType);
        info.base_name = typeName;

        // Base widget_service_provider::ReadFromProject
        info.app_name     = sec.readString('app_name');
        info.size         = sec.readRect('size');
        info.style        = sec.readUnsigned('style', 0);
        info.allocation   = sec.readInt('allocation', STATICALLY_ALLOCATED);
        info.accepts_focus = sec.readBool('accepts_focus', true);

        // Color resource IDs (version 53+: stored as names; older: raw integers)
        info.color_id[0] = this.readResourceId(sec, header, dicts, RES_TYPE_COLOR, 'normal_fill_color');
        info.color_id[1] = this.readResourceId(sec, header, dicts, RES_TYPE_COLOR, 'selected_fill_color');
        if (header.project_version > 54) {
            info.color_id[2] = this.readResourceId(sec, header, dicts, RES_TYPE_COLOR, 'disabled_fill_color');
        } else {
            info.color_id[2] = info.color_id[0];
        }

        info.event_func   = sec.readString('event_handler');
        info.draw_func    = sec.readString('draw_func');
        info.id_name      = sec.readString('id_name');
        info.custom_name  = sec.readString('custom_name');
        info.user_data    = sec.readString('user_data');
        info.is_template  = sec.readBool('template');
        info.visible_at_startup = sec.readBool('visible_at_startup', true);

        // Note: widget-type-specific fields are read in the WidgetService implementations
        // (src/widgets/*-service.ts). Those services call readWidgetExtended(sec, info).

        return info;
    }

    /**
     * Read a resource ID field.  Version > 52: stored as a resource name string.
     * Version ≤ 52: stored as a raw unsigned integer.
     */
    private readResourceId(
        sec: GxpContext,
        header: ProjectHeader,
        dicts: ResDicts,
        resType: number,
        tagName: string,
    ): number {
        if (header.project_version <= 52) {
            return sec.readUnsigned(tagName, 0);
        }
        const name = sec.readString(tagName, '');
        return lookupResId(dicts, resType, name);
    }

    // -------------------------------------------------------------------------
    // Factory helpers
    // -------------------------------------------------------------------------

    private makeDefaultProjectHeader(): ProjectHeader {
        return {
            project_version: PROJECT_VERSION,
            guix_version: 0,
            studio_version: 0,
            project_name: '',
            project_path: '',
            source_path: '.\\',
            header_path: '.\\',
            resource_path: '.\\',
            malloc_name: '',
            free_name: '',
            additional_headers: '',
            insert_headers_before: false,
            num_displays: 1,
            max_displays: MAX_DISPLAYS,
            num_languages: 1,
            target_cpu: 0,
            target_tools: 0,
            big_endian: false,
            languages: Array.from({ length: MAX_LANGUAGES }, (_, i) => ({
                name: i === 0 ? 'English' : '',
                support_bidi_text: false,
                gen_reordered_bidi_text: false,
                support_thai_glyph_shaping: false,
                gen_adjusted_thai_string: false,
                statically_defined: true,
            })),
            string_export_src: 0,
            string_export_target: 1,
            string_export_version: 2,
            string_export_path: '.\\',
            string_export_filename: '',
            string_export_filetype: STRING_EXPORT_TYPE_XLIFF,
            warn_missing_image: false,
            warn_missing_font: false,
            dave2d_graph_accelerator: false,
            renesas_png_decoder: 0,
            renesas_jpeg_decoder: 2,
            grid_enabled: false,
            snap_enabled: false,
            snap_to_widget_enabled: false,
            grid_spacing: 10,
            snap_spacing: 10,
            gen_binary: false,
            gen_res_header: true,
            binary_file_format: 0x01,
            memory_offset: 0,
            custom_resource_enabled: false,
            custom_resource_file_name: '',
            app_execute_xpos: 20,
            app_execute_ypos: 20,
            is_widget_position_locked: false,
            palette_mode_aa_text_colors: 8,
        };
    }

    private makeDefaultDisplayInfo(index: number, numLanguages: number): DisplayInfo {
        const themes: ThemeInfo[] = Array.from({ length: MAX_THEMES }, (_, t) => ({
            theme_name: `theme_${t + 1}`,
            vscroll_appearance: this.makeDefaultScrollbarAppearance(),
            hscroll_appearance: this.makeDefaultScrollbarAppearance(),
            vscroll_style: 0,
            hscroll_style: 0,
            palette: [],
            palette_total_size: 0,
            palette_predefined: 0,
            gen_color_table: true,
            gen_font_table: true,
            gen_pixelmap_table: true,
            enabled: true,
            statically_defined: true,
            resources: [],
        }));

        return {
            name: `display_${index + 1}`,
            xres: 320,
            yres: 240,
            bits_per_pix: 16,
            packed_format: false,
            format_555: false,
            format_4444: false,
            format_332: false,
            grayscale: false,
            reverse_order: false,
            allocate_canvas: true,
            enabled: true,
            rotation_angle: GX_SCREEN_ROTATION_NONE,
            default_map_format: true,
            colorformat: GX_COLOR_FORMAT_565RGB,
            num_themes: 1,
            active_theme: DEFAULT_THEME,
            themes,
            gen_string_table: Array(numLanguages).fill(true),
            string_entries: [],
            screen_flow: [],
            folders: [],
        };
    }

    private makeDefaultScrollbarAppearance(): ScrollbarAppearance {
        return {
            gx_scroll_width: 20,
            gx_scroll_thumb_width: 18,
            gx_scroll_thumb_travel_min: 20,
            gx_scroll_thumb_travel_max: 20,
            gx_scroll_thumb_border_style: 0,
            gx_scroll_fill_pixelmap: 0,
            gx_scroll_thumb_pixelmap: 0,
            gx_scroll_up_pixelmap: 0,
            gx_scroll_down_pixelmap: 0,
            gx_scroll_thumb_color: 0,
            gx_scroll_thumb_border_color: 0,
            gx_scroll_button_color: 0,
        };
    }
}
