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
import type { GxFontData } from '../utils/font-util';

// ---------------------------------------------------------------------------
// Font name helpers (mirror resource_gen.cpp MakeFontName / m_ThemeName)
// ---------------------------------------------------------------------------

/**
 * Returns the C variable name prefix for a font, matching the C++ convention:
 *   `${THEME_NAME_UPPER}_${font_res_name}`
 * e.g. theme="Default", name="verasans_12" → "DEFAULT_verasans_12"
 */
function makeFontVarName(themeName: string, fontName: string): string {
    return `${themeName.toUpperCase()}_${fontName}`;
}

/** Hex char code string for a glyph data array name: FONT_{fontVar}_char_{HEX} */
function glyphDataVarName(fontVar: string, codePoint: number): string {
    return `FONT_${fontVar}_char_${codePoint.toString(16).padStart(2, ' ')}`;
}

/** C format string for GX_FONT_FORMAT_*BPP constant */
function fontFormatMacro(bpp: number): string {
    switch (bpp) {
        case 1: return 'GX_FONT_FORMAT_1BPP';
        case 2: return 'GX_FONT_FORMAT_2BPP';
        case 4: return 'GX_FONT_FORMAT_4BPP';
        case 8: return 'GX_FONT_FORMAT_8BPP';
        default: return `GX_FONT_FORMAT_${bpp}BPP`;
    }
}

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

/**
 * Optional pre-generated font data keyed by font resource name.
 * Populate by calling generateFontData() from font-util.ts for each
 * font resource before calling ResourceGenerator.generate().
 */
export type FontDataMap = ReadonlyMap<string, GxFontData>;

// ---------------------------------------------------------------------------
// ResourceGenerator
// ---------------------------------------------------------------------------

@injectable()
export class ResourceGenerator {

    /**
     * Generate *_resources.h + *_resources.c for one display.
     *
     * @param project      Loaded project model
     * @param dispIdx      Index into project.displays
     * @param fontDataMap  Pre-generated font data keyed by res_info.name.
     *                     When absent, font glyph arrays are omitted.
     */
    generate(
        project: GxpProject,
        dispIdx: number,
        fontDataMap?: FontDataMap,
    ): ResourceFiles {
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
                content:  this.generateSource(project, disp, dispIdx, baseName, studioVer, now, fontDataMap),
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
        fontDataMap?: FontDataMap,
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
            this.writeFontSection(w, theme, tPrefix, fontDataMap);
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

    // ── Font section (data arrays + GX_FONT structs + pointer table) ─────────

    /**
     * Emits everything for a theme's fonts:
     *   1. Per-glyph bitmap data arrays  (FONT_<fontVar>_char_<hex>[])
     *   2. GX_GLYPH table array          (<fontVar>_FONT_PAGE_1_GLYPHS[])
     *   3. GX_FONT struct                (<fontVar>)
     *   4. GX_FONT* pointer table        (<tPrefix>_font_table[])
     *
     * Mirrors resource_gen.cpp WriteFont() + WriteFontPage() + WriteFontTable().
     * When fontDataMap is absent (or has no entry for a font), the GX_FONT struct
     * is emitted as a forward-declared extern, and the glyph data is skipped.
     */
    private writeFontSection(
        w: SourceWriter,
        theme: ThemeInfo,
        tPrefix: string,
        fontDataMap?: FontDataMap,
    ): void {
        if (!theme.gen_font_table) return;
        const fonts = collectByType(theme.resources, RES_TYPE_FONT);
        if (fonts.length === 0) return;

        // Theme name from tPrefix: "Display_1_Default" → theme part is "Default"
        // We need the uppercase theme name for the font var name.
        // tPrefix format: <dispName>_<themeName>
        // The theme name is the portion after the first underscore-separated dispName.
        // Use the whole tPrefix uppercased as the base for font vars, matching C++:
        //   name.Format("%s_%s", m_ThemeName.MakeUpper(), info->name)
        // So we split tPrefix to get just the theme portion (everything after first '_<disp>_'):
        // Actually C++ uses m_ThemeName (the raw theme name), not the display-prefixed tPrefix.
        // We recover it from the theme object's theme_name field.
        // The font var name is: THEME_NAME_UPPER + "_" + font_res_name
        // e.g. tPrefix = "Display_1_Default", theme.theme_name = "Default"
        //   → fontVar = "DEFAULT_verasans_12"
        const themeName = theme.theme_name;

        for (const font of fonts) {
            const fontVar  = makeFontVarName(themeName, font.name);
            const fontData = fontDataMap?.get(font.name);

            if (fontData) {
                this.writeFontPageData(w, fontVar, fontData);
            }

            // Emit the GX_FONT struct (or forward declaration when no data)
            const fontStructVar = `${fontVar}`;
            if (fontData) {
                this.writeFontStruct(w, fontStructVar, fontData);
            } else {
                // No font data — emit an extern declaration so the pointer table
                // still compiles (linker will find it from the custom output file).
                w.writeLine(`extern GX_CONST GX_FONT ${fontStructVar};`);
                w.blank();
            }
        }

        // Pointer table:  GX_FONT* array[N]  (element 0 = GX_NULL)
        const ptrs: string[] = fonts.map(f => `&${makeFontVarName(themeName, f.name)}`);
        w.writeArray('GX_CONST GX_FONT *', `${tPrefix}_font_table`, ptrs, 1);
    }

    /**
     * Emit per-glyph bitmap data arrays + GX_GLYPH table for one font page.
     * Mirrors resource_gen.cpp WriteFontPage() (non-compressed, non-kerning path,
     * guix_version >= 50402 field order).
     */
    private writeFontPageData(
        w: SourceWriter,
        fontVar: string,
        fontData: GxFontData,
    ): void {
        const { font } = fontData;
        let glyphDataOffset = 0;

        // ── Per-glyph bitmap data arrays ──────────────────────────────────
        for (let i = 0; i < font.glyphs.length; i++) {
            const glyph = font.glyphs[i];
            const cp    = font.firstGlyph + i;

            const dataSize = glyph.rowPitch * glyph.height;
            if (dataSize === 0) continue;   // whitespace / missing glyph — no array

            const varName = glyphDataVarName(fontVar, cp);
            const bytes   = Array.from(
                font.glyphData.subarray(glyphDataOffset, glyphDataOffset + dataSize),
            ).map(b => `0x${b.toString(16).padStart(2, '0')}`);

            w.writeArray(`static GX_CONST GX_UBYTE`, varName, bytes);
            glyphDataOffset += dataSize;
        }

        // ── GX_GLYPH table ────────────────────────────────────────────────
        const glyphCount = font.lastGlyph - font.firstGlyph + 1;
        const glyphLines: string[] = [];

        for (let i = 0; i < font.glyphs.length; i++) {
            const glyph = font.glyphs[i];
            const cp    = font.firstGlyph + i;
            const dataSize = glyph.rowPitch * glyph.height;

            const mapPtr = dataSize > 0
                ? glyphDataVarName(fontVar, cp)
                : 'GX_NULL';

            // Field order (guix_version >= 50402):
            //   {map, ascent, descent, advance, leading, width, height}
            glyphLines.push(
                `{${mapPtr}, ${glyph.ascent}, ${glyph.descent}, ` +
                `${glyph.advance}, ${glyph.left}, ${glyph.width}, ${glyph.height}}`,
            );
        }

        w.rawBlock(
            `static GX_CONST GX_GLYPH ${fontVar}_FONT_PAGE_1_GLYPHS[${glyphCount}] =\r\n` +
            `{\r\n` +
            glyphLines.map((l, i) => `    ${l}${i < glyphLines.length - 1 ? ',' : ''}`).join('\r\n') +
            `\r\n};\r\n`,
        );
    }

    /**
     * Emit GX_FONT struct for one page.
     * Mirrors WriteFontPage() link-format section (guix_version >= 50402).
     */
    private writeFontStruct(
        w: SourceWriter,
        fontVar: string,
        fontData: GxFontData,
    ): void {
        const { font } = fontData;
        w.rawBlock(
            `static GX_CONST GX_FONT ${fontVar} =\r\n` +
            `{\r\n` +
            `    ${fontFormatMacro(font.format)},        /* format */\r\n` +
            `    0,         /* line pre-space */\r\n` +
            `    0,         /* line post-space */\r\n` +
            `    ${font.height},        /* font data height */\r\n` +
            `    ${font.baseline},        /* font baseline offset */\r\n` +
            `    0x${font.firstGlyph.toString(16)},    /* first glyph within data page */\r\n` +
            `    0x${font.lastGlyph.toString(16)},    /* last glyph within data page */\r\n` +
            `    {${fontVar}_FONT_PAGE_1_GLYPHS},    /* pointer to glyph data */\r\n` +
            `    GX_NULL       /* next font page */\r\n` +
            `};\r\n`,
        );
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
        const auxVar  = pmName + '_aux_data';
        const mapData = pm.map_list[0];

        if (mapData && mapData.data.length > 0) {
            // Emit main pixel data array
            const bytes = Array.from(mapData.data).map(b => hex32(b));
            w.writeArray('GX_CONST GX_UBYTE', dataVar, bytes);

            // Emit auxiliary (count) data array for compressed formats that use it
            if (mapData.auxData && mapData.auxData.length > 0) {
                const auxBytes = Array.from(mapData.auxData).map(b => hex32(b));
                w.writeArray('GX_CONST GX_UBYTE', auxVar, auxBytes);
            }

            const compressedFlag = pm.compress ? 'GX_PIXELMAP_COMPRESSED' : '0';
            const alphaFlag      = pm.keep_alpha ? '|GX_PIXELMAP_ALPHA' : '';
            const flags          = pm.compress ? compressedFlag + alphaFlag : (pm.keep_alpha ? 'GX_PIXELMAP_ALPHA' : '0');

            const hasAux = mapData.auxData && mapData.auxData.length > 0;

            w.writeStruct('GX_CONST GX_PIXELMAP', pmName, [
                '0',                           // gx_pixelmap_version_major
                '0',                           // gx_pixelmap_version_minor
                flags,                         // gx_pixelmap_flags
                '0',                           // gx_pixelmap_format
                `(GX_CONST GX_UBYTE *) ${dataVar}`,
                String(mapData.data.length),   // gx_pixelmap_data_size
                hasAux
                    ? `(GX_CONST GX_UBYTE *) ${auxVar}`
                    : 'GX_NULL',               // gx_pixelmap_aux_data
                hasAux
                    ? String(mapData.auxData!.length)
                    : '0',                     // gx_pixelmap_aux_data_size
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
