/**
 * ResourceGenerator — emits *_resources.c and *_resources.h.
 *
 * Ports guix_studio/resource_gen.cpp.
 *
 * Key parity requirements (from guix-codegen.instructions.md):
 *   - Byte-for-byte output match with the C++ generator for the same .gxp input.
 *   - Section order: Color → Palette → Font → FontTable → Pixelmap → PixelmapTable
 *                    → Strings → LanguageTable → Themes → ThemeTable
 *   - Macro naming: GX_COLOR_ID_*, GX_FONT_ID_*, GX_PIXELMAP_ID_*, GX_STRING_ID_*
 *   - Windows CRLF line endings (handled by SourceWriter).
 */

import { injectable } from 'inversify';
import {
    SourceWriter,
    writeFileHeader,
    hex32,
    toMacroName,
} from './source-writer';
import {
    GX_COLOR_FORMAT_8BIT_PALETTE,
    RES_TYPE_COLOR,
    RES_TYPE_FONT,
    RES_TYPE_PIXELMAP,
} from '../common/gx-types';
import { GxpProject, DisplayInfo, ThemeInfo, StringEntry } from '../common/project-model';
import { ResInfo } from '../common/res-info';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class GxCodegenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GxCodegenError';
    }
}

// ---------------------------------------------------------------------------
// Generated file pair
// ---------------------------------------------------------------------------

export interface GeneratedFile {
    filename: string;
    content: string;
}

export interface ResourceFiles {
    header: GeneratedFile;
    source: GeneratedFile;
}

// ---------------------------------------------------------------------------
// ResourceGenerator
// ---------------------------------------------------------------------------

@injectable()
export class ResourceGenerator {

    /**
     * Generate *_resources.h + *_resources.c for one display.
     *
     * @param project  Loaded project model
     * @param dispIdx  Index into project.displays
     */
    generate(project: GxpProject, dispIdx: number): ResourceFiles {
        const disp = project.displays[dispIdx];
        if (!disp) throw new GxCodegenError(`Display index ${dispIdx} out of range`);

        const projName = sanitizeName(project.header.project_name);
        const dispName = sanitizeName(disp.name);
        const baseName = project.displays.length > 1
            ? `${projName}_${dispName}_resources`
            : `${projName}_resources`;

        const now = new Date();
        const studioVer = '6.2.0'; // TODO: read from project.header.studio_version

        return {
            header: {
                filename: baseName + '.h',
                content:  this.generateHeader(project, disp, dispIdx, baseName, studioVer, now),
            },
            source: {
                filename: baseName + '.c',
                content:  this.generateSource(project, disp, dispIdx, baseName, studioVer, now),
            },
        };
    }

    // ── Header file ──────────────────────────────────────────────────────────

    private generateHeader(
        project: GxpProject,
        disp: DisplayInfo,
        dispIdx: number,
        baseName: string,
        studioVer: string,
        now: Date,
    ): string {
        const w       = new SourceWriter();
        const guard   = '_' + toMacroName(baseName) + '_H_';
        const dName   = toMacroName(disp.name);
        const fmtName = colorFormatName(disp.colorformat);

        writeFileHeader(w, studioVer, now);
        w.ifndefGuard(guard);
        w.blank();
        w.include('gx_api.h');
        w.blank();

        // ── Error directives ─────────────────────────────────────────────
        // UTF-8 / extended unicode validation is emitted when fonts request it
        // (deferred to Phase 4 font pass — emit placeholders for now).

        // ── Display defines ──────────────────────────────────────────────
        w.lineComment(`Display ${disp.name}`);
        w.define(dName, dispIdx);
        w.define(`${dName}_COLOR_FORMAT`, `GX_COLOR_FORMAT_${fmtName}`);
        w.define(`${dName}_X_RESOLUTION`, disp.xres);
        w.define(`${dName}_Y_RESOLUTION`, disp.yres);
        w.blank();

        // ── Theme defines ────────────────────────────────────────────────
        w.lineComment('Themes');
        for (const [ti, theme] of disp.themes.entries()) {
            const tName = toMacroName(disp.name + '_' + theme.theme_name);
            w.define(tName, ti);
        }
        w.define(`${dName}_THEME_TABLE_SIZE`, disp.themes.length);
        w.blank();

        // ── Language defines ─────────────────────────────────────────────
        w.lineComment('Languages');
        const langs = project.header.languages;
        for (const [li, lang] of langs.entries()) {
            if (!lang.name) continue;
            w.define(`${dName}_LANGUAGE_${toMacroName(lang.name)}`, li);
        }
        w.define(`${dName}_LANGUAGE_TABLE_SIZE`, langs.filter(l => l.name).length);
        w.blank();

        // ── Resource ID defines ──────────────────────────────────────────
        this.writeResourceIds(w, disp, dName);

        w.endifGuard(guard);
        return w.toString();
    }

    private writeResourceIds(w: SourceWriter, disp: DisplayInfo, dName: string): void {
        for (const theme of disp.themes) {
            this.writeIdsForType(w, theme, RES_TYPE_COLOR,    dName, 'COLOR',    'GX_COLOR_ID_');
            this.writeIdsForType(w, theme, RES_TYPE_FONT,     dName, 'FONT',     'GX_FONT_ID_');
            this.writeIdsForType(w, theme, RES_TYPE_PIXELMAP, dName, 'PIXELMAP', 'GX_PIXELMAP_ID_');
            // Strings are per-display (shared across themes)
            break; // IDs are the same across themes — emit once
        }

        // String IDs (display-wide, not per-theme)
        this.writeStringIds(w, disp, dName);
    }

    private writeIdsForType(
        w: SourceWriter,
        theme: ThemeInfo,
        resType: number,
        dName: string,
        typeName: string,
        prefix: string,
    ): void {
        const items = collectByType(theme.resources, resType);
        if (items.length === 0) return;

        w.lineComment(`${typeName} IDs for display ${dName}`);
        for (const [idx, item] of items.entries()) {
            w.define(prefix + toMacroName(item.name), idx + 1); // IDs are 1-based
        }
        w.define(`${dName}_${typeName}_TABLE_SIZE`, items.length + 1); // +1 for null slot 0
        w.blank();
    }

    private writeStringIds(w: SourceWriter, disp: DisplayInfo, dName: string): void {
        const entries = disp.string_entries;
        if (entries.length === 0) return;

        w.lineComment('String IDs');
        for (const entry of entries) {
            w.define('GX_STRING_ID_' + toMacroName(entry.name), entry.string_id);
        }
        w.define(`${dName}_STRING_TABLE_SIZE`, entries.length + 1);
        w.blank();
    }

    // ── Source file ──────────────────────────────────────────────────────────

    private generateSource(
        project: GxpProject,
        disp: DisplayInfo,
        _dispIdx: number,
        baseName: string,
        studioVer: string,
        now: Date,
    ): string {
        const w     = new SourceWriter();
        const dName = sanitizeName(disp.name);

        writeFileHeader(w, studioVer, now);
        w.include('gx_api.h');
        w.include(baseName + '.h');
        w.blank();

        for (const [ti, theme] of disp.themes.entries()) {
            if (!theme.enabled) continue;
            const tPrefix = `${dName}_${sanitizeName(theme.theme_name)}`;
            this.writeColorTable(w, theme, tPrefix);
            if (disp.colorformat === GX_COLOR_FORMAT_8BIT_PALETTE) {
                this.writePalette(w, theme, tPrefix);
            }
            this.writeFontTable(w, theme, tPrefix);
            this.writePixelmapTable(w, theme, tPrefix);
            this.writeThemeStruct(w, disp, theme, ti, tPrefix);
        }

        this.writeThemeTable(w, disp, dName);
        this.writeLanguageTables(w, disp, project, dName);

        return w.toString();
    }

    // ── Color table ─────────────────────────────────────────────────────────

    private writeColorTable(w: SourceWriter, theme: ThemeInfo, tPrefix: string): void {
        if (!theme.gen_color_table) return;
        const colors = collectByType(theme.resources, RES_TYPE_COLOR);
        if (colors.length === 0) return;

        // Element 0 is reserved (GX_COLOR_ID_DEFAULT = 0 → index 0 = black)
        const values: string[] = colors.map(c => hex32(c.colorval));
        w.writeArray('GX_CONST GX_COLOR', `${tPrefix}_color_table`, values);
    }

    // ── Palette ──────────────────────────────────────────────────────────────

    private writePalette(w: SourceWriter, theme: ThemeInfo, tPrefix: string): void {
        if (theme.palette.length === 0) return;
        const values = theme.palette.map(hex32);
        w.writeArray('GX_CONST GX_COLOR', `${tPrefix}_palette`, values);
    }

    // ── Font table ───────────────────────────────────────────────────────────

    private writeFontTable(w: SourceWriter, theme: ThemeInfo, tPrefix: string): void {
        if (!theme.gen_font_table) return;
        const fonts = collectByType(theme.resources, RES_TYPE_FONT);
        if (fonts.length === 0) return;

        // Font data arrays (GX_GLYPH / GX_FONT structs) are generated by the
        // font-util module from TrueType input — this pass only emits the pointer table.
        // Glyph data emission is deferred to Phase 4 font-util integration.
        const ptrs: string[] = fonts.map(f => `&${tPrefix}_${sanitizeName(f.name)}_font`);
        w.writeArray('GX_CONST GX_FONT *', `${tPrefix}_font_table`, ptrs, 1);
    }

    // ── Pixelmap table ───────────────────────────────────────────────────────

    private writePixelmapTable(w: SourceWriter, theme: ThemeInfo, tPrefix: string): void {
        if (!theme.gen_pixelmap_table) return;
        const pixelmaps = collectByType(theme.resources, RES_TYPE_PIXELMAP);
        if (pixelmaps.length === 0) return;

        // Pixelmap pixel data is emitted by image-reader — this pass emits:
        // 1) GX_PIXELMAP structs referencing the data arrays
        // 2) The pointer table
        for (const pm of pixelmaps) {
            this.writePixelmapStruct(w, pm, tPrefix);
        }

        // Pointer table: element 0 = GX_NULL
        const ptrs = ['GX_NULL', ...pixelmaps.map(pm =>
            `&${tPrefix}_${sanitizeName(pm.name)}_pixelmap`,
        )];
        w.writeArray('GX_CONST GX_PIXELMAP *', `${tPrefix}_pixelmap_table`, ptrs, 1);
    }

    private writePixelmapStruct(w: SourceWriter, pm: ResInfo, tPrefix: string): void {
        const pmName  = `${tPrefix}_${sanitizeName(pm.name)}_pixelmap`;
        const dataVar = pmName + '_data';
        const mapData = pm.map_list[0];

        if (mapData && mapData.data.length > 0) {
            // Emit raw pixel data array
            const bytes = Array.from(mapData.data).map(b => hex32(b));
            w.writeArray('GX_CONST GX_UBYTE', dataVar, bytes);

            w.writeStruct('GX_CONST GX_PIXELMAP', pmName, [
                '0',                           // gx_pixelmap_version_major
                '0',                           // gx_pixelmap_version_minor
                pm.keep_alpha ? '1' : '0',     // gx_pixelmap_flags
                '0',                           // gx_pixelmap_format
                `(GX_CONST GX_UBYTE *) ${dataVar}`,
                String(mapData.data.length),   // gx_pixelmap_data_size
                `GX_NULL`,                     // gx_pixelmap_aux_data
                '0',                           // gx_pixelmap_aux_data_size
                String(mapData.width),
                String(mapData.height),
            ]);
        } else {
            // No decoded data yet — emit null pixelmap
            w.writeStruct('GX_CONST GX_PIXELMAP', pmName, [
                '0', '0', '0', '0', 'GX_NULL', '0', 'GX_NULL', '0', '0', '0',
            ]);
        }
    }

    // ── Theme struct ─────────────────────────────────────────────────────────

    private writeThemeStruct(
        w: SourceWriter,
        disp: DisplayInfo,
        theme: ThemeInfo,
        _themeIdx: number,
        tPrefix: string,
    ): void {
        const colors    = collectByType(theme.resources, RES_TYPE_COLOR);
        const fonts     = collectByType(theme.resources, RES_TYPE_FONT);
        const pixelmaps = collectByType(theme.resources, RES_TYPE_PIXELMAP);
        const paletteSize = disp.colorformat === GX_COLOR_FORMAT_8BIT_PALETTE
            ? theme.palette.length : 0;

        // Scrollbar appearance struct
        this.writeScrollbarAppearance(w, theme, tPrefix);

        w.writeStruct('GX_THEME', tPrefix, [
            theme.gen_color_table && colors.length > 0
                ? `(GX_COLOR *) ${tPrefix}_color_table`
                : 'GX_NULL',
            theme.gen_font_table && fonts.length > 0
                ? `(GX_FONT **) ${tPrefix}_font_table`
                : 'GX_NULL',
            theme.gen_pixelmap_table && pixelmaps.length > 0
                ? `(GX_PIXELMAP **) ${tPrefix}_pixelmap_table`
                : 'GX_NULL',
            paletteSize > 0 ? `(GX_COLOR *) ${tPrefix}_palette` : 'GX_NULL',
            `&${tPrefix}_vscroll_appearance`,
            `&${tPrefix}_hscroll_appearance`,
            scrollStyleFlags(theme.vscroll_style),
            scrollStyleFlags(theme.hscroll_style),
            String(colors.length + 1),       // color_table_size (includes slot 0)
            String(fonts.length + 1),        // font_table_size
            String(pixelmaps.length + 1),    // pixelmap_table_size
            String(paletteSize),
        ]);
    }

    private writeScrollbarAppearance(w: SourceWriter, theme: ThemeInfo, tPrefix: string): void {
        const vs = theme.vscroll_appearance;
        const hs = theme.hscroll_appearance;

        w.writeStruct('GX_SCROLLBAR_APPEARANCE', `${tPrefix}_vscroll_appearance`, [
            String(vs.gx_scroll_width),
            String(vs.gx_scroll_thumb_width),
            String(vs.gx_scroll_thumb_travel_min),
            String(vs.gx_scroll_thumb_travel_max),
            String(vs.gx_scroll_thumb_border_style),
            String(vs.gx_scroll_fill_pixelmap),
            String(vs.gx_scroll_thumb_pixelmap),
            String(vs.gx_scroll_up_pixelmap),
            String(vs.gx_scroll_down_pixelmap),
            String(vs.gx_scroll_thumb_color),
            String(vs.gx_scroll_thumb_border_color),
            String(vs.gx_scroll_button_color),
        ]);

        w.writeStruct('GX_SCROLLBAR_APPEARANCE', `${tPrefix}_hscroll_appearance`, [
            String(hs.gx_scroll_width),
            String(hs.gx_scroll_thumb_width),
            String(hs.gx_scroll_thumb_travel_min),
            String(hs.gx_scroll_thumb_travel_max),
            String(hs.gx_scroll_thumb_border_style),
            String(hs.gx_scroll_fill_pixelmap),
            String(hs.gx_scroll_thumb_pixelmap),
            String(hs.gx_scroll_up_pixelmap),
            String(hs.gx_scroll_down_pixelmap),
            String(hs.gx_scroll_thumb_color),
            String(hs.gx_scroll_thumb_border_color),
            String(hs.gx_scroll_button_color),
        ]);
    }

    // ── Theme table ──────────────────────────────────────────────────────────

    private writeThemeTable(w: SourceWriter, disp: DisplayInfo, dName: string): void {
        const ptrs = disp.themes.map(t => {
            const tPrefix = `${dName}_${sanitizeName(t.theme_name)}`;
            return `&${tPrefix}`;
        });
        w.writeArray('GX_CONST GX_THEME *', `${dName}_theme_table`, ptrs, 1);
    }

    // ── Language / String tables ─────────────────────────────────────────────

    private writeLanguageTables(
        w: SourceWriter,
        disp: DisplayInfo,
        project: GxpProject,
        dName: string,
    ): void {
        const langs   = project.header.languages.filter(l => l.name);
        const entries = disp.string_entries;
        if (entries.length === 0 || langs.length === 0) return;

        // Per-language string data + table
        for (const [li, lang] of langs.entries()) {
            this.writeStringTableForLanguage(w, disp, entries, li, lang.name, dName);
        }

        // Language pointer table
        const langPtrs = langs.map(l => `${dName}_${toMacroName(l.name)}_string_table`);
        w.writeArray('GX_CONST GX_STRING *', `${dName}_language_table`, langPtrs, 1);

        // Language direction table (LTR by default unless lang is RTL)
        const dirValues = langs.map(l => l.support_bidi_text ? 'GX_LANGUAGE_DIRECTION_RTL' : '0x00');
        w.writeArray('GX_CONST GX_UBYTE', `${dName}_language_direction_table`, dirValues, 8);
    }

    private writeStringTableForLanguage(
        w: SourceWriter,
        _disp: DisplayInfo,
        entries: StringEntry[],
        langIdx: number,
        langName: string,
        dName: string,
    ): void {
        const lMacro  = toMacroName(langName);
        const tblName = `${dName}_${lMacro}_string_table`;

        // Emit each non-empty string literal
        const tableEntries: string[] = ['{ GX_NULL, 0 }']; // slot 0 always null
        for (const entry of entries) {
            const text = entry.translations[langIdx] ?? '';
            const varName = `${dName}_${lMacro}_${toMacroName(entry.name)}`;
            if (isAsciiOnly(text)) {
                w.writeLine(`GX_CONST GX_CHAR ${varName}[] = "${escapeC(text)}";`);
            } else {
                // Emit as hex byte array for UTF-8
                const bytes = stringToUtf8Bytes(text);
                w.writeArray('GX_CONST GX_UBYTE', varName, bytes.map(b => hex32(b)));
            }
            tableEntries.push(`{ (GX_CONST GX_CHAR *) ${varName}, sizeof(${varName}) - 1 }`);
        }
        w.blank();

        // Emit GX_STRING table (new format for GX_VERSION_STRING_LENGTH_FIX)
        w.writeLine(`GX_CONST GX_STRING ${tblName}[] =`);
        w.writeLine('{');
        for (let idx = 0; idx < tableEntries.length; idx++) {
            const comma = idx < tableEntries.length - 1 ? ',' : '';
            w.writeLine('    ' + tableEntries[idx] + comma);
        }
        w.writeLine('};');
        w.blank();
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function collectByType(resources: ResInfo[], type: number): ResInfo[] {
    const result: ResInfo[] = [];
    for (const r of resources) {
        collectByTypeRecursive(r, type, result);
    }
    return result;
}

function collectByTypeRecursive(r: ResInfo, type: number, out: ResInfo[]): void {
    if (r.type === type && r.name) out.push(r);
    for (const child of r.children) {
        collectByTypeRecursive(child, type, out);
    }
}

function sanitizeName(name: string): string {
    return name.replace(/[^A-Za-z0-9_]/g, '_');
}

function colorFormatName(fmt: number): string {
    const map: Record<number, string> = {
        1:  'MONOCHROME',
        2:  'MONOCHROME_INVERTED',
        3:  '2BIT_GRAY',
        8:  '8BIT_GRAY',
        10: '8BIT_PALETTE',
        14: '565RGB',
        17: '565BGR',
        18: '24RGB',
        22: '32ARGB',
        23: '32RGBA',
    };
    return map[fmt] ?? String(fmt);
}

function scrollStyleFlags(style: number): string {
    if (style === 0) return '0';
    const flags: string[] = [];
    if (style & 0x00000100) flags.push('GX_SCROLLBAR_RELATIVE_THUMB');
    if (style & 0x00000200) flags.push('GX_SCROLLBAR_END_BUTTONS');
    if (style & 0x00000400) flags.push('GX_SCROLLBAR_VERTICAL');
    if (style & 0x00000800) flags.push('GX_SCROLLBAR_HORIZONTAL');
    return flags.length > 0 ? flags.join(' | ') : String(style);
}

function isAsciiOnly(s: string): boolean {
    for (let i = 0; i < s.length; i++) {
        if (s.charCodeAt(i) > 0x7E) return false;
    }
    return true;
}

function escapeC(s: string): string {
    return s
        .replace(/\\/g, '\\\\')
        .replace(/"/g,  '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}

function stringToUtf8Bytes(s: string): number[] {
    const result: number[] = [];
    for (let i = 0; i < s.length; i++) {
        let code = s.charCodeAt(i);
        // Handle surrogate pairs
        if (code >= 0xD800 && code <= 0xDBFF && i + 1 < s.length) {
            const low = s.charCodeAt(i + 1);
            if (low >= 0xDC00 && low <= 0xDFFF) {
                code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
                i++;
            }
        }
        if (code < 0x80) {
            result.push(code);
        } else if (code < 0x800) {
            result.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
        } else if (code < 0x10000) {
            result.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
        } else {
            result.push(
                0xF0 | (code >> 18),
                0x80 | ((code >> 12) & 0x3F),
                0x80 | ((code >>  6) & 0x3F),
                0x80 | (code & 0x3F),
            );
        }
    }
    result.push(0); // null terminator
    return result;
}
