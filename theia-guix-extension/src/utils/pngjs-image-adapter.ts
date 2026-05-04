/**
 * pngjs-image-adapter.ts — Concrete ImageDecodeAdapter using pngjs and jpeg-js.
 *
 * Supported formats:
 *   PNG  — pngjs (pure JS, synchronous via Buffer decode)
 *   JPEG — jpeg-js (pure JS)
 *   BMP  — built-in pure-JS parser (supports 1/4/8/16/24/32-bit DIB bitmaps)
 *   GIF  — built-in pure-JS GIF89a parser (first frame only)
 *
 * No native add-ons required; works in both Node.js and browser WASM contexts.
 *
 * Usage:
 *   import { registerImageDecodeAdapter } from './image-reader';
 *   import { createPngjsImageAdapter }    from './pngjs-image-adapter';
 *   registerImageDecodeAdapter(createPngjsImageAdapter());
 */

import { PNG } from 'pngjs';
import * as jpegJs from 'jpeg-js';
import type { ImageDecodeAdapter, ImageFormat } from './image-reader';

// ---------------------------------------------------------------------------
// PNG decoder (synchronous pngjs)
// ---------------------------------------------------------------------------

function decodePng(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
    const png = PNG.sync.read(Buffer.from(bytes));
    return {
        width:  png.width,
        height: png.height,
        rgba:   new Uint8Array(png.data),
    };
}

// ---------------------------------------------------------------------------
// JPEG decoder (jpeg-js)
// ---------------------------------------------------------------------------

function decodeJpeg(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
    const result = jpegJs.decode(Buffer.from(bytes), { useTArray: true });
    return {
        width:  result.width,
        height: result.height,
        rgba:   new Uint8Array(result.data),
    };
}

// ---------------------------------------------------------------------------
// BMP decoder — pure JS, supports 1/4/8/16/24/32-bit DIB v3/v4/v5
// ---------------------------------------------------------------------------

function decodeBmp(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
    // Validate signature 'BM'
    if (bytes[0] !== 0x42 || bytes[1] !== 0x4D) {
        throw new Error('Not a valid BMP file');
    }

    const dataView  = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const pixelOff  = dataView.getUint32(10, true);   // file offset to pixel data
    const dibSize   = dataView.getUint32(14, true);   // DIB header size
    const width     = dataView.getInt32 (18, true);
    let   height    = dataView.getInt32 (22, true);
    const bitCount  = dataView.getUint16(28, true);
    const compress  = dataView.getUint32(30, true);
    const clrUsed   = dataView.getUint32(46, true);

    const flipY     = height > 0;      // negative height = top-down
    const absH      = Math.abs(height);

    if (width <= 0 || absH === 0) {
        throw new Error('Invalid BMP dimensions');
    }

    // Colour table offset = 14 (file hdr) + dibSize
    const palOffset = 14 + dibSize;
    const palEntries = bitCount <= 8 ? (clrUsed > 0 ? clrUsed : 1 << bitCount) : 0;

    // Read palette (4 bytes each: B G R 0)
    const palette = new Uint32Array(palEntries);
    for (let i = 0; i < palEntries; i++) {
        const b = bytes[palOffset + i * 4 + 0];
        const g = bytes[palOffset + i * 4 + 1];
        const r = bytes[palOffset + i * 4 + 2];
        palette[i] = (0xFF << 24) | (r << 16) | (g << 8) | b;
    }

    const rgba = new Uint8Array(width * absH * 4);

    const rowBytes = Math.ceil(width * bitCount / 8);
    const stride   = (rowBytes + 3) & ~3;  // padded to 4-byte boundary

    for (let row = 0; row < absH; row++) {
        const srcRow = flipY ? (absH - 1 - row) : row;
        const srcOff = pixelOff + srcRow * stride;
        const dstRow = row * width * 4;

        for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0, a = 0xFF;

            if (bitCount === 32) {
                b = bytes[srcOff + x * 4 + 0];
                g = bytes[srcOff + x * 4 + 1];
                r = bytes[srcOff + x * 4 + 2];
                a = bytes[srcOff + x * 4 + 3];
                // If BI_BITFIELDS or BI_RGB with alpha=0 treat as opaque
                if (compress === 0 && a === 0) a = 0xFF;
            } else if (bitCount === 24) {
                b = bytes[srcOff + x * 3 + 0];
                g = bytes[srcOff + x * 3 + 1];
                r = bytes[srcOff + x * 3 + 2];
            } else if (bitCount === 16) {
                const word = dataView.getUint16(srcOff + x * 2, true);
                // 5-5-5 (BI_RGB 16-bit)
                r = ((word >> 10) & 0x1F) << 3;
                g = ((word >>  5) & 0x1F) << 3;
                b = ((word      ) & 0x1F) << 3;
            } else if (bitCount === 8) {
                const idx = bytes[srcOff + x];
                const val = palette[idx] ?? 0;
                r = (val >> 16) & 0xFF;
                g = (val >>  8) & 0xFF;
                b = (val      ) & 0xFF;
            } else if (bitCount === 4) {
                const byteVal = bytes[srcOff + (x >> 1)];
                const idx     = x & 1 ? byteVal & 0x0F : (byteVal >> 4) & 0x0F;
                const val     = palette[idx] ?? 0;
                r = (val >> 16) & 0xFF;
                g = (val >>  8) & 0xFF;
                b = (val      ) & 0xFF;
            } else if (bitCount === 1) {
                const byteVal = bytes[srcOff + (x >> 3)];
                const bit     = (byteVal >> (7 - (x & 7))) & 1;
                const val     = palette[bit] ?? 0;
                r = (val >> 16) & 0xFF;
                g = (val >>  8) & 0xFF;
                b = (val      ) & 0xFF;
            }

            rgba[dstRow + x * 4 + 0] = r;
            rgba[dstRow + x * 4 + 1] = g;
            rgba[dstRow + x * 4 + 2] = b;
            rgba[dstRow + x * 4 + 3] = a;
        }
    }

    return { width, height: absH, rgba };
}

// ---------------------------------------------------------------------------
// GIF decoder — pure JS, first frame only (GIF87a / GIF89a)
// ---------------------------------------------------------------------------

/** Extract colour index → RGBA palette. */
function buildGifPalette(
    bytes: Uint8Array,
    offset: number,
    count: number,
): Uint32Array {
    const pal = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
        const r = bytes[offset + i * 3 + 0];
        const g = bytes[offset + i * 3 + 1];
        const b = bytes[offset + i * 3 + 2];
        pal[i] = (0xFF << 24) | (r << 16) | (g << 8) | b;
    }
    return pal;
}

/** Minimal LZW decompressor for GIF. */
function gifLzwDecode(
    data: Uint8Array,
    minCodeSize: number,
    pixelCount: number,
): Uint8Array {
    const clearCode = 1 << minCodeSize;
    const eofCode   = clearCode + 1;
    let codeSize    = minCodeSize + 1;
    let codeMask    = (1 << codeSize) - 1;

    // Code table
    const table: number[][] = [];
    function initTable(): void {
        table.length = 0;
        for (let i = 0; i < clearCode; i++) table.push([i]);
        table.push([]);  // clear code slot
        table.push([]);  // eof code slot
    }
    initTable();

    const out    = new Uint8Array(pixelCount);
    let   outPos = 0;

    let bitBuf  = 0;
    let bitCnt  = 0;
    let dataPos = 0;

    function readCode(): number {
        while (bitCnt < codeSize) {
            bitBuf |= data[dataPos++] << bitCnt;
            bitCnt  += 8;
        }
        const code = bitBuf & codeMask;
        bitBuf >>= codeSize;
        bitCnt  -= codeSize;
        return code;
    }

    let prev: number[] = [];
    let code = readCode();
    while (code !== eofCode && outPos < pixelCount) {
        if (code === clearCode) {
            initTable();
            codeSize = minCodeSize + 1;
            codeMask = (1 << codeSize) - 1;
            prev     = [];
            code     = readCode();
            continue;
        }

        let entry: number[];
        if (code < table.length) {
            entry = table[code];
        } else if (code === table.length && prev.length > 0) {
            entry = [...prev, prev[0]];
        } else {
            break; // corrupt stream
        }

        for (const px of entry) {
            if (outPos < pixelCount) out[outPos++] = px;
        }

        if (prev.length > 0 && table.length < 4096) {
            table.push([...prev, entry[0]]);
            if (table.length === (1 << codeSize) && codeSize < 12) {
                codeSize++;
                codeMask = (1 << codeSize) - 1;
            }
        }

        prev = entry;
        code = readCode();
    }
    return out;
}

function decodeGif(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
    if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) {
        throw new Error('Not a valid GIF file');
    }

    // Header: GIF87a / GIF89a
    const logWidth  = bytes[6]  | (bytes[7]  << 8);
    const logHeight = bytes[8]  | (bytes[9]  << 8);
    const packed    = bytes[10];
    const gctFlag   = (packed >> 7) & 1;
    const gctSize   = 1 << ((packed & 7) + 1);
    const bgIdx     = bytes[11];
    void bgIdx;

    let offset = 13;
    let globalPalette: Uint32Array | null = null;
    if (gctFlag) {
        globalPalette = buildGifPalette(bytes, offset, gctSize);
        offset += gctSize * 3;
    }

    const rgba = new Uint8Array(logWidth * logHeight * 4);

    // Scan blocks to find first image descriptor (0x2C)
    while (offset < bytes.length) {
        const introducer = bytes[offset++];

        if (introducer === 0x3B) break; // trailer

        if (introducer === 0x21) {
            // Extension block — skip
            offset++; // extension label
            while (true) {
                const sz = bytes[offset++];
                if (sz === 0) break;
                offset += sz;
            }
            continue;
        }

        if (introducer === 0x2C) {
            // Image descriptor
            const imgX  = bytes[offset]   | (bytes[offset + 1] << 8); offset += 2;
            const imgY  = bytes[offset]   | (bytes[offset + 1] << 8); offset += 2;
            const imgW  = bytes[offset]   | (bytes[offset + 1] << 8); offset += 2;
            const imgH  = bytes[offset]   | (bytes[offset + 1] << 8); offset += 2;
            const flags = bytes[offset++];
            const lctFlag = (flags >> 7) & 1;
            const lctSize = 1 << ((flags & 7) + 1);

            let pal = globalPalette;
            if (lctFlag) {
                pal = buildGifPalette(bytes, offset, lctSize);
                offset += lctSize * 3;
            }

            const minCodeSize = bytes[offset++];

            // Accumulate sub-blocks
            const chunks: Uint8Array[] = [];
            while (true) {
                const sz = bytes[offset++];
                if (sz === 0) break;
                chunks.push(bytes.subarray(offset, offset + sz));
                offset += sz;
            }
            const totalSize = chunks.reduce((s, c) => s + c.length, 0);
            const lzwData   = new Uint8Array(totalSize);
            let   pos = 0;
            for (const c of chunks) { lzwData.set(c, pos); pos += c.length; }

            const indices = gifLzwDecode(lzwData, minCodeSize, imgW * imgH);

            for (let y = 0; y < imgH; y++) {
                for (let x = 0; x < imgW; x++) {
                    const px   = imgX + x;
                    const py   = imgY + y;
                    if (px >= logWidth || py >= logHeight) continue;
                    const idx  = indices[y * imgW + x];
                    const col  = pal ? pal[idx] ?? 0 : 0;
                    const dOff = (py * logWidth + px) * 4;
                    rgba[dOff + 0] = (col >> 16) & 0xFF;
                    rgba[dOff + 1] = (col >>  8) & 0xFF;
                    rgba[dOff + 2] = (col      ) & 0xFF;
                    rgba[dOff + 3] = 0xFF;
                }
            }
            // Only decode the first frame
            break;
        }
    }

    return { width: logWidth, height: logHeight, rgba };
}

// ---------------------------------------------------------------------------
// PngjsImageAdapter
// ---------------------------------------------------------------------------

export class PngjsImageAdapter implements ImageDecodeAdapter {

    supports(format: ImageFormat): boolean {
        return format === 'png' || format === 'jpeg' || format === 'bmp' || format === 'gif';
    }

    async decode(
        bytes: Uint8Array,
        format: ImageFormat,
    ): Promise<{ width: number; height: number; rgba: Uint8Array }> {
        switch (format) {
            case 'png':  return decodePng(bytes);
            case 'jpeg': return decodeJpeg(bytes);
            case 'bmp':  return decodeBmp(bytes);
            case 'gif':  return decodeGif(bytes);
            default:
                throw new Error(`Unsupported image format: ${format as string}`);
        }
    }
}

/**
 * Factory — creates a ready-to-use PngjsImageAdapter.
 * Typically called once at extension activation:
 *   registerImageDecodeAdapter(createPngjsImageAdapter());
 */
export function createPngjsImageAdapter(): PngjsImageAdapter {
    return new PngjsImageAdapter();
}
