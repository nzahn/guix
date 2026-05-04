/**
 * Tests for PngjsImageAdapter (PNG / JPEG / BMP / GIF decoding) and
 * the convertToOutputFormat / compressRle helpers inside image-reader.ts.
 */

import { PNG } from 'pngjs';
import { registerImageDecodeAdapter, readImage } from '../../src/utils/image-reader';
import { createPngjsImageAdapter, PngjsImageAdapter } from '../../src/utils/pngjs-image-adapter';
import {
    GX_COLOR_FORMAT_565RGB,
    GX_COLOR_FORMAT_32ARGB,
} from '../../src/common/gx-types';

// Register the adapter once for the whole test suite
beforeAll(() => {
    registerImageDecodeAdapter(createPngjsImageAdapter());
});

// ---------------------------------------------------------------------------
// Helpers — synthetic image generators
// ---------------------------------------------------------------------------

/** 2×2 PNG: red, green, blue, yellow */
function make2x2Png(): Uint8Array {
    const png = new PNG({ width: 2, height: 2 });
    png.data = Buffer.from([
        255, 0,   0,   255,   // (0,0) red
        0,   255, 0,   255,   // (1,0) green
        0,   0,   255, 255,   // (0,1) blue
        255, 255, 0,   255,   // (1,1) yellow
    ]);
    return new Uint8Array(PNG.sync.write(png));
}

/**
 * Build a minimal 24-bit BMP (2×2, no compression, bottom-up).
 * Layout: row 0 (bottom) = blue, white;  row 1 (top) = red, green (BGR order)
 */
function make2x2Bmp(): Uint8Array {
    const w = 2, h = 2;
    const stride = (w * 3 + 3) & ~3;
    const pixBuf = Buffer.alloc(stride * h, 0);

    // Bottom row (row index 0 in file = logical row 1 for top-down view)
    pixBuf[0] = 255; pixBuf[1] = 0;   pixBuf[2] = 0;   // blue   (BGR)
    pixBuf[3] = 255; pixBuf[4] = 255; pixBuf[5] = 255; // white  (BGR)
    // Top row
    pixBuf[stride + 0] = 0;   pixBuf[stride + 1] = 0;   pixBuf[stride + 2] = 255; // red
    pixBuf[stride + 3] = 0;   pixBuf[stride + 4] = 255; pixBuf[stride + 5] = 0;   // green

    const fileSize = 54 + pixBuf.length;
    const buf = Buffer.alloc(fileSize, 0);
    buf[0] = 0x42; buf[1] = 0x4D;
    buf.writeUInt32LE(fileSize, 2);
    buf.writeUInt32LE(54, 10);    // pixel data offset
    buf.writeUInt32LE(40, 14);    // BITMAPINFOHEADER
    buf.writeInt32LE (w,  18);
    buf.writeInt32LE (h,  22);
    buf.writeUInt16LE(1,  26);    // color planes
    buf.writeUInt16LE(24, 28);    // bpp
    buf.writeUInt32LE(0,  30);    // BI_RGB
    pixBuf.copy(buf, 54);
    return new Uint8Array(buf);
}

/** Minimal 1×1 GIF89a with a single red pixel. */
function make1x1Gif(): Uint8Array {
    // Hand-crafted minimal GIF89a
    const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]; // GIF89a
    const lsd    = [0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00]; // 1x1, GCT=2 colours
    const gct    = [0xFF, 0x00, 0x00,  0x00, 0x00, 0x00];       // red, black
    const imgDesc = [0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]; // 1x1 image
    // LZW-encoded single red pixel (index 0): clearCode(4), 0, eofCode(5)
    // Packed LSB-first into 3-bit codes: 100 000 101 → byte0=0x44 byte1=0x01
    const imgData = [0x02, 0x02, 0x44, 0x01, 0x00]; // LZW minCodeSize=2, sub-block
    const trailer = [0x3B];
    return new Uint8Array([...header, ...lsd, ...gct, ...imgDesc, ...imgData, ...trailer]);
}

// ===========================================================================
// PngjsImageAdapter.supports()
// ===========================================================================

describe('PngjsImageAdapter.supports()', () => {
    const adapter = new PngjsImageAdapter();

    test('supports png',  () => expect(adapter.supports('png')).toBe(true));
    test('supports jpeg', () => expect(adapter.supports('jpeg')).toBe(true));
    test('supports bmp',  () => expect(adapter.supports('bmp')).toBe(true));
    test('supports gif',  () => expect(adapter.supports('gif')).toBe(true));
});

// ===========================================================================
// PNG decode
// ===========================================================================

describe('PNG decode', () => {

    test('returns correct dimensions for 2×2 PNG', async () => {
        const result = await readImage(make2x2Png(), 'png', GX_COLOR_FORMAT_32ARGB, false, true);
        expect(result.width).toBe(2);
        expect(result.height).toBe(2);
    });

    test('32ARGB output has 4 bytes/pixel', async () => {
        const result = await readImage(make2x2Png(), 'png', GX_COLOR_FORMAT_32ARGB, false, true);
        expect(result.data.length).toBe(2 * 2 * 4);
    });

    test('565RGB output has 2 bytes/pixel', async () => {
        const result = await readImage(make2x2Png(), 'png', GX_COLOR_FORMAT_565RGB, false, false);
        expect(result.data.length).toBe(2 * 2 * 2);
    });

    test('first pixel is red in 32ARGB', async () => {
        const result = await readImage(make2x2Png(), 'png', GX_COLOR_FORMAT_32ARGB, false, true);
        // 32ARGB layout: A R G B
        expect(result.data[0]).toBe(0xFF); // A
        expect(result.data[1]).toBe(0xFF); // R
        expect(result.data[2]).toBe(0x00); // G
        expect(result.data[3]).toBe(0x00); // B
    });

    test('first pixel red in 565RGB → R5=31, G6=0, B5=0', async () => {
        const result = await readImage(make2x2Png(), 'png', GX_COLOR_FORMAT_565RGB, false, false);
        const word = result.data[0] | (result.data[1] << 8);
        const r5   = (word >> 11) & 0x1F;
        const g6   = (word >>  5) & 0x3F;
        const b5   = (word      ) & 0x1F;
        expect(r5).toBe(31);
        expect(g6).toBe(0);
        expect(b5).toBe(0);
    });

    test('keepAlpha=false forces alpha to 0xFF', async () => {
        const result = await readImage(make2x2Png(), 'png', GX_COLOR_FORMAT_32ARGB, false, false);
        // All alpha bytes should be 0xFF
        for (let i = 0; i < 4; i++) {
            expect(result.data[i * 4]).toBe(0xFF);
        }
    });

    test('delay field is 0', async () => {
        const result = await readImage(make2x2Png(), 'png', GX_COLOR_FORMAT_32ARGB, false, true);
        expect(result.delay).toBe(0);
    });
});

// ===========================================================================
// BMP decode
// ===========================================================================

describe('BMP decode', () => {

    test('returns correct dimensions for 2×2 BMP', async () => {
        const result = await readImage(make2x2Bmp(), 'bmp', GX_COLOR_FORMAT_32ARGB, false, true);
        expect(result.width).toBe(2);
        expect(result.height).toBe(2);
    });

    test('32ARGB output has correct byte count', async () => {
        const result = await readImage(make2x2Bmp(), 'bmp', GX_COLOR_FORMAT_32ARGB, false, true);
        expect(result.data.length).toBe(2 * 2 * 4);
    });

    test('top-left pixel is red (BMP top row)', async () => {
        const result = await readImage(make2x2Bmp(), 'bmp', GX_COLOR_FORMAT_32ARGB, false, true);
        // BMP is bottom-up; our make2x2Bmp top row has red at (0,0) in screen space
        // Byte layout 32ARGB: A R G B
        expect(result.data[0]).toBe(0xFF); // A
        expect(result.data[1]).toBe(0xFF); // R (red)
        expect(result.data[2]).toBe(0x00); // G
        expect(result.data[3]).toBe(0x00); // B
    });
});

// ===========================================================================
// GIF decode
// ===========================================================================

describe('GIF decode', () => {

    test('returns dimensions 1×1', async () => {
        const result = await readImage(make1x1Gif(), 'gif', GX_COLOR_FORMAT_32ARGB, false, true);
        expect(result.width).toBe(1);
        expect(result.height).toBe(1);
    });

    test('pixel is red', async () => {
        const result = await readImage(make1x1Gif(), 'gif', GX_COLOR_FORMAT_32ARGB, false, true);
        expect(result.data[1]).toBe(0xFF); // R
        expect(result.data[2]).toBe(0x00); // G
        expect(result.data[3]).toBe(0x00); // B
    });
});

// ===========================================================================
// Error handling
// ===========================================================================

describe('readImage error handling', () => {

    test('throws on unsupported format', async () => {
        await expect(
            readImage(new Uint8Array(4), 'jpeg' as never, GX_COLOR_FORMAT_32ARGB, false, false)
        ).rejects.toThrow();
    });

    test('throws on corrupt BMP', async () => {
        await expect(
            readImage(new Uint8Array([0x00, 0x00, 0x00, 0x00]), 'bmp', GX_COLOR_FORMAT_32ARGB, false, false)
        ).rejects.toThrow('Not a valid BMP');
    });

    test('throws on corrupt GIF', async () => {
        await expect(
            readImage(new Uint8Array([0x00, 0x00, 0x00, 0x00]), 'gif', GX_COLOR_FORMAT_32ARGB, false, false)
        ).rejects.toThrow('Not a valid GIF');
    });
});
