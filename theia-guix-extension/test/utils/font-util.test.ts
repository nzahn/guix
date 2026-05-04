/**
 * Tests for OpentypeFontAdapter and generateFontData().
 *
 * Uses the Arial Unicode TTF available on macOS at /Library/Fonts/Arial Unicode.ttf.
 * Tests that don't require a font file check error paths only.
 */

import * as fs from 'fs';
import {
    generateFontData,
    registerFontRenderAdapter,
    GX_FONT_FORMAT_1BPP,
    GX_FONT_FORMAT_4BPP,
    GX_FONT_FORMAT_8BPP,
    GxFontUtilError,
} from '../../src/utils/font-util';
import { createOpentypeFontAdapter } from '../../src/utils/opentype-font-adapter';

// ---------------------------------------------------------------------------
// Fixture: path to a real TTF on macOS
// ---------------------------------------------------------------------------

const FONT_CANDIDATES = [
    '/Library/Fonts/Arial Unicode.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',  // Linux CI
];

function findFont(): string | null {
    for (const p of FONT_CANDIDATES) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

const FONT_PATH = findFont();

// ===========================================================================
// Error paths (no adapter registered)
// ===========================================================================

describe('generateFontData — error paths', () => {

    test('throws GxFontUtilError when no adapter', async () => {
        // Temporarily remove adapter by re-importing with a fresh module cache
        // is complex; instead verify the exported error class
        await expect(
            generateFontData(new Uint8Array(4), 14, new Set([65]), 4)
        ).rejects.toBeInstanceOf(GxFontUtilError);
    });

    test('throws when no code points given (with adapter)', async () => {
        registerFontRenderAdapter(createOpentypeFontAdapter());
        await expect(
            generateFontData(new Uint8Array(100), 14, new Set<number>(), 4)
        ).rejects.toBeInstanceOf(GxFontUtilError);
    });
});

// ===========================================================================
// Real font tests — skipped when no TTF is available
// ===========================================================================

const describeFont = FONT_PATH ? describe : describe.skip;

describeFont('OpentypeFontAdapter — renderGlyph', () => {

    let fontBytes: Uint8Array;

    beforeAll(() => {
        registerFontRenderAdapter(createOpentypeFontAdapter());
        fontBytes = new Uint8Array(fs.readFileSync(FONT_PATH!));
    });

    test('returns non-null for ASCII "A"', async () => {
        const adapter = createOpentypeFontAdapter();
        const result = await adapter.renderGlyph(fontBytes, 65 /* 'A' */, 14, 4);
        expect(result).not.toBeNull();
    });

    test('"A" glyph has positive width and height', async () => {
        const adapter = createOpentypeFontAdapter();
        const result = await adapter.renderGlyph(fontBytes, 65, 14, 4);
        expect(result!.glyph.width).toBeGreaterThan(0);
        expect(result!.glyph.height).toBeGreaterThan(0);
    });

    test('"A" glyph has positive advance width', async () => {
        const adapter = createOpentypeFontAdapter();
        const result = await adapter.renderGlyph(fontBytes, 65, 14, 4);
        expect(result!.glyph.advance).toBeGreaterThan(0);
    });

    test('"A" glyph has positive ascent', async () => {
        const adapter = createOpentypeFontAdapter();
        const result = await adapter.renderGlyph(fontBytes, 65, 14, 4);
        expect(result!.glyph.ascent).toBeGreaterThan(0);
    });

    test('"A" glyph data length matches rowPitch × height', async () => {
        const adapter = createOpentypeFontAdapter();
        const result = await adapter.renderGlyph(fontBytes, 65, 14, 4);
        const { glyph, data } = result!;
        expect(data.length).toBe(glyph.rowPitch * glyph.height);
    });

    test('1bpp rowPitch = ceil(width / 8)', async () => {
        const adapter = createOpentypeFontAdapter();
        const result = await adapter.renderGlyph(fontBytes, 65, 14, 1);
        const { glyph } = result!;
        expect(glyph.rowPitch).toBe(Math.ceil(glyph.width / 8));
    });

    test('8bpp rowPitch = width', async () => {
        const adapter = createOpentypeFontAdapter();
        const result = await adapter.renderGlyph(fontBytes, 65, 14, 8);
        const { glyph } = result!;
        expect(glyph.rowPitch).toBe(glyph.width);
    });

    test('space character returns zero-size glyph with advance', async () => {
        const adapter = createOpentypeFontAdapter();
        const result = await adapter.renderGlyph(fontBytes, 32 /* ' ' */, 14, 4);
        // Space may be null or return a zero-size glyph with advance
        if (result !== null) {
            expect(result.glyph.advance).toBeGreaterThan(0);
        }
    });

    test('4bpp data contains non-zero bytes for "A"', async () => {
        const adapter = createOpentypeFontAdapter();
        const result = await adapter.renderGlyph(fontBytes, 65, 14, 4);
        expect(result!.data.some(b => b !== 0)).toBe(true);
    });

    test('larger pixelHeight produces larger bitmap', async () => {
        const adapter = createOpentypeFontAdapter();
        const r14 = await adapter.renderGlyph(fontBytes, 65, 14, 4);
        const r28 = await adapter.renderGlyph(fontBytes, 65, 28, 4);
        expect(r28!.glyph.width).toBeGreaterThan(r14!.glyph.width);
    });
});

// ===========================================================================
// generateFontData integration
// ===========================================================================

describeFont('generateFontData integration', () => {

    let fontBytes: Uint8Array;

    beforeAll(() => {
        registerFontRenderAdapter(createOpentypeFontAdapter());
        fontBytes = new Uint8Array(fs.readFileSync(FONT_PATH!));
    });

    test('generates font data for "Hello"', async () => {
        const codePoints = new Set('Hello'.split('').map(c => c.codePointAt(0)!));
        const result = await generateFontData(fontBytes, 16, codePoints, GX_FONT_FORMAT_4BPP);
        expect(result.font.glyphs.length).toBe(codePoints.size);
    });

    test('firstGlyph and lastGlyph are correct', async () => {
        const codePoints = new Set([65, 66, 90]); // A, B, Z
        const result = await generateFontData(fontBytes, 14, codePoints, GX_FONT_FORMAT_4BPP);
        expect(result.font.firstGlyph).toBe(65);
        expect(result.font.lastGlyph).toBe(90);
    });

    test('glyphData length matches sum of individual glyph data', async () => {
        const codePoints = new Set([65, 66, 67]); // A, B, C
        const result = await generateFontData(fontBytes, 14, codePoints, GX_FONT_FORMAT_4BPP);
        const sumLen = result.font.glyphs.reduce(
            (s, g) => s + g.rowPitch * g.height, 0
        );
        expect(result.font.glyphData.length).toBe(sumLen);
    });

    test('1bpp font generation', async () => {
        const codePoints = new Set([65]);
        const result = await generateFontData(fontBytes, 14, codePoints, GX_FONT_FORMAT_1BPP);
        expect(result.font.format).toBe(GX_FONT_FORMAT_1BPP);
        expect(result.font.glyphs[0].rowPitch).toBe(
            Math.ceil(result.font.glyphs[0].width / 8)
        );
    });

    test('8bpp font generation', async () => {
        const codePoints = new Set([65]);
        const result = await generateFontData(fontBytes, 14, codePoints, GX_FONT_FORMAT_8BPP);
        expect(result.font.format).toBe(GX_FONT_FORMAT_8BPP);
    });

    test('mapOffset increases monotonically', async () => {
        const codePoints = new Set([65, 66, 67, 68]);
        const result = await generateFontData(fontBytes, 14, codePoints, GX_FONT_FORMAT_4BPP);
        let prev = -1;
        for (const g of result.font.glyphs) {
            if (g.height > 0 && g.width > 0) {
                expect(g.mapOffset).toBeGreaterThan(prev);
                prev = g.mapOffset;
            }
        }
    });

    test('pageCount is 1 for contiguous ASCII block', async () => {
        const codePoints = new Set([65, 66, 67]); // A B C — contiguous
        const result = await generateFontData(fontBytes, 14, codePoints, GX_FONT_FORMAT_4BPP);
        expect(result.pageCount).toBe(1);
    });

    test('pageCount is 2 for two disjoint blocks', async () => {
        const codePoints = new Set([65, 0x0391]); // 'A' and Greek 'Α' — not contiguous
        const result = await generateFontData(fontBytes, 14, codePoints, GX_FONT_FORMAT_4BPP);
        expect(result.pageCount).toBe(2);
    });
});
