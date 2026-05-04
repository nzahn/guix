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

// ---------------------------------------------------------------------------
// GX font data structures (TypeScript mirrors of gx_api.h structs)
// ---------------------------------------------------------------------------

/** Mirrors GX_GLYPH. */
export interface GxGlyph {
    /** Pointer into the glyph map byte array (computed at link time). */
    mapOffset: number;
    advance:   number;
    ascent:    number;
    descent:   number;
    left:      number;
    top:       number;
    width:     number;
    height:    number;
    rowPitch:  number;
}

/** Mirrors GX_FONT. */
export interface GxFont {
    /** GX color format for glyph maps (GX_FONT_FORMAT_*). */
    format:      number;
    /** Pixel height of the font (em height). */
    height:      number;
    firstGlyph:  number;   // first Unicode code point
    lastGlyph:   number;   // last Unicode code point
    glyphs:      GxGlyph[];
    /** Raw glyph bitmap data.  All glyph maps are packed sequentially. */
    glyphData:   Uint8Array;
}

/** Output of generateFontData(). */
export interface GxFontData {
    font: GxFont;
    /** Page count (1 page per contiguous Unicode block). */
    pageCount: number;
}

// GX_FONT_FORMAT constants (from gx_api.h GX_FONT_FORMAT_*)
export const GX_FONT_FORMAT_1BPP  = 1;
export const GX_FONT_FORMAT_2BPP  = 2;
export const GX_FONT_FORMAT_4BPP  = 4;
export const GX_FONT_FORMAT_8BPP  = 8;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class GxFontUtilError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GxFontUtilError';
    }
}

// ---------------------------------------------------------------------------
// Font render adapter interface
// ---------------------------------------------------------------------------

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
    renderGlyph(
        fontBytes: Uint8Array,
        codePoint: number,
        pixelHeight: number,
        bpp: number,
    ): Promise<{ glyph: GxGlyph; data: Uint8Array } | null>;
}

let adapter: FontRenderAdapter | null = null;

/**
 * Register a platform font render adapter.
 * Must be called once before generateFontData().
 */
export function registerFontRenderAdapter(a: FontRenderAdapter): void {
    adapter = a;
}

// ---------------------------------------------------------------------------
// generateFontData
// ---------------------------------------------------------------------------

/**
 * Generate GX_FONT data for a set of Unicode code points.
 *
 * @param fontBytes     Raw TTF/OTF file bytes.
 * @param pixelHeight   Font height in pixels.
 * @param codePoints    Set of Unicode code points to include.
 * @param bpp           Bits per pixel for glyph maps (1, 2, 4, or 8).
 */
export async function generateFontData(
    fontBytes: Uint8Array,
    pixelHeight: number,
    codePoints: Set<number>,
    bpp: 1 | 2 | 4 | 8 = 4,
): Promise<GxFontData> {
    if (!adapter) {
        throw new GxFontUtilError(
            'No font render adapter registered. ' +
            'Call registerFontRenderAdapter() before generateFontData().',
        );
    }

    const sortedPoints = [...codePoints].sort((a, b) => a - b);
    if (sortedPoints.length === 0) {
        throw new GxFontUtilError('No code points specified for font generation.');
    }

    const firstGlyph = sortedPoints[0];
    const lastGlyph  = sortedPoints[sortedPoints.length - 1];

    const glyphs: GxGlyph[]     = [];
    const dataParts: Uint8Array[] = [];
    let   mapOffset = 0;

    for (const cp of sortedPoints) {
        const result = await adapter.renderGlyph(fontBytes, cp, pixelHeight, bpp);
        if (result) {
            result.glyph.mapOffset = mapOffset;
            glyphs.push(result.glyph);
            dataParts.push(result.data);
            mapOffset += result.data.length;
        } else {
            // Missing glyph — insert a zero-advance placeholder
            const placeholder: GxGlyph = {
                mapOffset: 0,
                advance: 0, ascent: 0, descent: 0,
                left: 0, top: 0, width: 0, height: 0, rowPitch: 0,
            };
            glyphs.push(placeholder);
        }
    }

    // Concatenate all glyph bitmap data
    const totalBytes = dataParts.reduce((s, p) => s + p.length, 0);
    const glyphData  = new Uint8Array(totalBytes);
    let   pos        = 0;
    for (const part of dataParts) {
        glyphData.set(part, pos);
        pos += part.length;
    }

    const font: GxFont = {
        format:     bpp,
        height:     pixelHeight,
        firstGlyph,
        lastGlyph,
        glyphs,
        glyphData,
    };

    // Count contiguous Unicode pages
    const pageCount = countPages(sortedPoints);

    return { font, pageCount };
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function countPages(sortedPoints: number[]): number {
    if (sortedPoints.length === 0) return 0;
    let pages = 1;
    for (let i = 1; i < sortedPoints.length; i++) {
        if (sortedPoints[i] !== sortedPoints[i - 1] + 1) {
            pages++;
        }
    }
    return pages;
}
