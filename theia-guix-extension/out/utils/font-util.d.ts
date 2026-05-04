/**
 * font-util.ts — TrueType/OpenType → GX_FONT glyph data converter.
 *
 * Ports guix_studio/gx_studio_font_util.cpp.
 *
 * The output is a `GxFontData` object whose binary layout matches the
 * GX_FONT / GX_GLYPH / GX_KERNING_TABLE structs in gx_api.h so that the
 * resource generator can emit it verbatim into *_resources.c.
 *
 * Implementation strategy:
 *   - Use the `opentype.js` library (or a WASM build of FreeType) to
 *     rasterise glyphs at the requested pixel height.
 *   - Register a FontRenderAdapter the same way image-reader.ts uses an
 *     ImageDecodeAdapter.
 *
 * NOTE: No font render adapter is wired by default.  Functions throw
 * GxFontUtilError until one is registered.
 */
/** Mirrors GX_GLYPH. */
export interface GxGlyph {
    /** Pointer into the glyph map byte array (computed at link time). */
    mapOffset: number;
    advance: number;
    ascent: number;
    descent: number;
    left: number;
    top: number;
    width: number;
    height: number;
    rowPitch: number;
}
/** Mirrors GX_FONT. */
export interface GxFont {
    /** GX color format for glyph maps (GX_FONT_FORMAT_*). */
    format: number;
    /** Pixel height of the font (em height). */
    height: number;
    firstGlyph: number;
    lastGlyph: number;
    glyphs: GxGlyph[];
    /** Raw glyph bitmap data.  All glyph maps are packed sequentially. */
    glyphData: Uint8Array;
}
/** Output of generateFontData(). */
export interface GxFontData {
    font: GxFont;
    /** Page count (1 page per contiguous Unicode block). */
    pageCount: number;
}
export declare const GX_FONT_FORMAT_1BPP = 1;
export declare const GX_FONT_FORMAT_2BPP = 2;
export declare const GX_FONT_FORMAT_4BPP = 4;
export declare const GX_FONT_FORMAT_8BPP = 8;
export declare class GxFontUtilError extends Error {
    constructor(message: string);
}
export interface FontRenderAdapter {
    /**
     * Rasterise one glyph from the font at the specified height.
     *
     * @param fontBytes   Raw TTF/OTF file bytes.
     * @param codePoint   Unicode code point to rasterise.
     * @param pixelHeight Requested em height in pixels.
     * @param bpp         Bits per pixel (1, 2, 4, or 8).
     * @returns           GxGlyph metrics + raw glyph bitmap data, or null if
     *                    the code point is not in the font.
     */
    renderGlyph(fontBytes: Uint8Array, codePoint: number, pixelHeight: number, bpp: number): Promise<{
        glyph: GxGlyph;
        data: Uint8Array;
    } | null>;
}
/**
 * Register a platform font render adapter.
 * Must be called once before generateFontData().
 */
export declare function registerFontRenderAdapter(a: FontRenderAdapter): void;
/**
 * Generate GX_FONT data for a set of Unicode code points.
 *
 * @param fontBytes     Raw TTF/OTF file bytes.
 * @param pixelHeight   Font height in pixels.
 * @param codePoints    Set of Unicode code points to include.
 * @param bpp           Bits per pixel for glyph maps (1, 2, 4, or 8).
 */
export declare function generateFontData(fontBytes: Uint8Array, pixelHeight: number, codePoints: Set<number>, bpp?: 1 | 2 | 4 | 8): Promise<GxFontData>;
//# sourceMappingURL=font-util.d.ts.map