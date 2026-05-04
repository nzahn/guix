/**
 * image-reader.ts — PNG/JPEG/BMP → GxPixelmapData converter.
 *
 * Ports guix_studio/edit_pixelmap_dlg.cpp and the image-loading logic in
 * resource_gen.cpp.
 *
 * Implementation strategy:
 *   - In the VS Code extension host (Node.js): use the `sharp` or `jimp`
 *     npm package to decode images.
 *   - In a future browser build: use a Canvas element or a WASM decoder.
 *
 * This file provides the public API; the heavy decode work is done by the
 * platform adapters below.  Replace the adapter if a different library is
 * used at build time.
 *
 * NOTE: This module has no npm dependency wired yet — the decode functions
 * throw `GxImageReaderError` until a platform adapter is registered.
 */

import { GxPixelmapData } from '../common/res-info';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class GxImageReaderError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GxImageReaderError';
    }
}

// ---------------------------------------------------------------------------
// Supported input formats
// ---------------------------------------------------------------------------

export type ImageFormat = 'png' | 'jpeg' | 'bmp' | 'gif';

// ---------------------------------------------------------------------------
// Platform adapter interface
// ---------------------------------------------------------------------------

/** Plug in a decode implementation at runtime. */
export interface ImageDecodeAdapter {
    /** Return true if this adapter can handle the given format. */
    supports(format: ImageFormat): boolean;
    /**
     * Decode raw file bytes into a row-major RGBA8888 pixel array plus
     * width/height.
     */
    decode(bytes: Uint8Array, format: ImageFormat): Promise<{
        width: number;
        height: number;
        /** RGBA byte array, length === width * height * 4 */
        rgba: Uint8Array;
    }>;
}

let adapter: ImageDecodeAdapter | null = null;

/**
 * Register a platform adapter.  Must be called once before readImage().
 */
export function registerImageDecodeAdapter(a: ImageDecodeAdapter): void {
    adapter = a;
}

// ---------------------------------------------------------------------------
// readImage
// ---------------------------------------------------------------------------

/**
 * Decode an image file and return a GxPixelmapData suitable for embedding
 * in the resource generator output.
 *
 * @param bytes          Raw file bytes.
 * @param format         Image format hint (PNG/JPEG/BMP/GIF).
 * @param outputFormat   Target GX color format (GX_COLOR_FORMAT_* constant).
 * @param compress       Whether to run run-length compression on the output.
 * @param keepAlpha      Whether to preserve the alpha channel.
 */
export async function readImage(
    bytes: Uint8Array,
    format: ImageFormat,
    outputFormat: number,
    compress: boolean,
    keepAlpha: boolean,
): Promise<GxPixelmapData> {
    if (!adapter) {
        throw new GxImageReaderError(
            'No image decode adapter registered. ' +
            'Call registerImageDecodeAdapter() before readImage().',
        );
    }
    if (!adapter.supports(format)) {
        throw new GxImageReaderError(`Image format '${format}' is not supported by the active adapter.`);
    }

    const { width, height, rgba } = await adapter.decode(bytes, format);

    const pixelData = convertToOutputFormat(rgba, width, height, outputFormat, keepAlpha);

    let finalData  = pixelData;
    let finalAux: Uint8Array | undefined;

    if (compress) {
        const compressed = compressRle(pixelData, outputFormat, width, height);
        // Only use compressed data if it is actually smaller
        if (compressed.data.length < pixelData.length) {
            finalData = compressed.data;
            finalAux  = compressed.auxData;
        }
    }

    const result: GxPixelmapData = {
        width,
        height,
        data:    finalData,
        ...(finalAux !== undefined && { auxData: finalAux }),
        delay:   0,
    };
    return result;
}

// ---------------------------------------------------------------------------
// Color format conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a raw RGBA8888 buffer to the target GX color format.
 * Supports a subset of formats; unrecognised formats fall back to 32ARGB.
 */
function convertToOutputFormat(
    rgba: Uint8Array,
    width: number,
    height: number,
    outputFormat: number,
    keepAlpha: boolean,
): Uint8Array {
    const pixelCount = width * height;

    // GX_COLOR_FORMAT_32ARGB = 22
    if (outputFormat === 22) {
        const out = new Uint8Array(pixelCount * 4);
        for (let i = 0; i < pixelCount; i++) {
            const r = rgba[i * 4 + 0];
            const g = rgba[i * 4 + 1];
            const b = rgba[i * 4 + 2];
            const a = keepAlpha ? rgba[i * 4 + 3] : 0xff;
            // 32ARGB layout: A R G B (byte order)
            out[i * 4 + 0] = a;
            out[i * 4 + 1] = r;
            out[i * 4 + 2] = g;
            out[i * 4 + 3] = b;
        }
        return out;
    }

    // GX_COLOR_FORMAT_565RGB = 14
    if (outputFormat === 14) {
        const out = new Uint8Array(pixelCount * 2);
        for (let i = 0; i < pixelCount; i++) {
            const r = (rgba[i * 4 + 0] >> 3) & 0x1f;
            const g = (rgba[i * 4 + 1] >> 2) & 0x3f;
            const b = (rgba[i * 4 + 2] >> 3) & 0x1f;
            const word = (r << 11) | (g << 5) | b;
            out[i * 2 + 0] = word & 0xff;
            out[i * 2 + 1] = (word >> 8) & 0xff;
        }
        return out;
    }

    // Default: 32ARGB
    return convertToOutputFormat(rgba, width, height, 22, keepAlpha);
}

// ---------------------------------------------------------------------------
// Run-length compression — mirrors image_reader::Compress / RleEncodeRow
// ---------------------------------------------------------------------------

/**
 * GUIX RLE compressor.  Operates row-by-row; output format determines the
 * count-word size and whether counts live in a separate auxiliary stream.
 *
 * Encoding rules (from image_reader.cpp):
 *  - Count consecutive identical pixels at each position (CountDuplicates).
 *  - If ≥ 3 duplicates → repeat run: flush pending raw run, write count word
 *    (repeat flag set) then ONE pixel value.
 *  - Otherwise → raw run: accumulate ONE pixel, flush when 128 pixels or end
 *    of row.
 *
 * Count-word format by output format:
 *  - GX_COLOR_FORMAT_565RGB  (14): 2-byte LE uint16; bit 15 = repeat flag.
 *  - GX_COLOR_FORMAT_32ARGB  (22): 1-byte count in a separate aux stream;
 *    bit 7 = repeat flag.  Main stream carries pixel bytes only.
 *  - All other 8-bit formats: 1-byte count in main stream; bit 7 = repeat.
 *
 * Returns { data, auxData? }.  auxData is only set for 32ARGB.
 * The caller is responsible for skipping compression when the result is
 * larger than the original (image-reader.ts already handles that check).
 */
function compressRle(
    data: Uint8Array,
    outputFormat: number,
    width: number,
    height: number,
): { data: Uint8Array; auxData?: Uint8Array } {

    // GX_COLOR_FORMAT_565RGB = 14
    if (outputFormat === 14) {
        return { data: compressRle565(data, width, height) };
    }

    // GX_COLOR_FORMAT_32ARGB = 22
    if (outputFormat === 22) {
        return compressRle32argb(data, width, height);
    }

    // 8-bit formats — 1-byte count in main stream
    return { data: compressRle8(data, width, height) };
}

// ---------------------------------------------------------------------------
// 565RGB  (16-bit pixels, 2-byte count word in main stream, no aux)
// ---------------------------------------------------------------------------

function readU16LE(src: Uint8Array, offset: number): number {
    return src[offset] | (src[offset + 1] << 8);
}

function compressRle565(data: Uint8Array, width: number, height: number): Uint8Array {
    const bytesPerPx = 2;
    const parts: number[] = [];

    for (let row = 0; row < height; row++) {
        const rowOff = row * width * bytesPerPx;
        let pos = 0;
        const rawPixBuf: number[] = [];  // raw pixels accumulated this run

        const flushRaw = (): void => {
            if (rawPixBuf.length === 0) return;
            const countWord = (rawPixBuf.length / bytesPerPx - 1) & 0x7FFF;
            parts.push(countWord & 0xFF, (countWord >> 8) & 0xFF);
            for (const b of rawPixBuf) parts.push(b);
            rawPixBuf.length = 0;
        };

        while (pos < width) {
            // Count identical pixels from pos
            const pix = readU16LE(data, rowOff + pos * bytesPerPx);
            let dupes = 1;
            while (pos + dupes < width &&
                   readU16LE(data, rowOff + (pos + dupes) * bytesPerPx) === pix) {
                dupes++;
            }

            if (dupes >= 3) {
                flushRaw();
                const countWord = ((dupes - 1) | 0x8000) & 0xFFFF;
                parts.push(countWord & 0xFF, (countWord >> 8) & 0xFF);
                parts.push(data[rowOff + pos * bytesPerPx],
                           data[rowOff + pos * bytesPerPx + 1]);
                pos += dupes;
            } else {
                rawPixBuf.push(data[rowOff + pos * bytesPerPx],
                               data[rowOff + pos * bytesPerPx + 1]);
                pos++;
                if (rawPixBuf.length / bytesPerPx === 128 || pos === width) {
                    flushRaw();
                }
            }
        }
    }

    return new Uint8Array(parts);
}

// ---------------------------------------------------------------------------
// 32ARGB  (32-bit pixels, 1-byte count in aux stream)
// ---------------------------------------------------------------------------

function compressRle32argb(
    data: Uint8Array,
    width: number,
    height: number,
): { data: Uint8Array; auxData: Uint8Array } {
    const bytesPerPx = 4;
    const mainParts: number[] = [];
    const auxParts:  number[] = [];

    function readPx32(rowOff: number, col: number): number {
        const off = rowOff + col * bytesPerPx;
        return (data[off] << 24) | (data[off + 1] << 16) |
               (data[off + 2] << 8) | data[off + 3];
    }

    for (let row = 0; row < height; row++) {
        const rowOff = row * width * bytesPerPx;
        let pos = 0;
        const rawPixBuf: number[] = [];

        const flushRaw = (): void => {
            if (rawPixBuf.length === 0) return;
            const n = rawPixBuf.length / bytesPerPx;
            auxParts.push((Math.min(n, 128) - 1) & 0x7F);
            for (const b of rawPixBuf) mainParts.push(b);
            rawPixBuf.length = 0;
        };

        while (pos < width) {
            const pix = readPx32(rowOff, pos);
            let dupes = 1;
            while (pos + dupes < width && readPx32(rowOff, pos + dupes) === pix) {
                dupes++;
            }

            if (dupes >= 3) {
                flushRaw();
                const n = Math.min(dupes, 128);
                auxParts.push(((n - 1) | 0x80) & 0xFF);
                mainParts.push(data[rowOff + pos * bytesPerPx],
                               data[rowOff + pos * bytesPerPx + 1],
                               data[rowOff + pos * bytesPerPx + 2],
                               data[rowOff + pos * bytesPerPx + 3]);
                pos += n;
            } else {
                rawPixBuf.push(data[rowOff + pos * bytesPerPx],
                               data[rowOff + pos * bytesPerPx + 1],
                               data[rowOff + pos * bytesPerPx + 2],
                               data[rowOff + pos * bytesPerPx + 3]);
                pos++;
                if (rawPixBuf.length / bytesPerPx === 128 || pos === width) {
                    flushRaw();
                }
            }
        }
    }

    return {
        data:    new Uint8Array(mainParts),
        auxData: new Uint8Array(auxParts),
    };
}

// ---------------------------------------------------------------------------
// 8-bit formats  (1-byte count in main stream)
// ---------------------------------------------------------------------------

function compressRle8(data: Uint8Array, width: number, height: number): Uint8Array {
    const parts: number[] = [];

    for (let row = 0; row < height; row++) {
        const rowOff = row * width;
        let pos = 0;
        const rawBuf: number[] = [];

        const flushRaw = (): void => {
            if (rawBuf.length === 0) return;
            parts.push((Math.min(rawBuf.length, 128) - 1) & 0x7F);
            for (const b of rawBuf) parts.push(b);
            rawBuf.length = 0;
        };

        while (pos < width) {
            const pix = data[rowOff + pos];
            let dupes = 1;
            while (pos + dupes < width && data[rowOff + pos + dupes] === pix) {
                dupes++;
            }

            if (dupes >= 3) {
                flushRaw();
                const n = Math.min(dupes, 128);
                parts.push(((n - 1) | 0x80) & 0xFF, pix);
                pos += n;
            } else {
                rawBuf.push(pix);
                pos++;
                if (rawBuf.length === 128 || pos === width) {
                    flushRaw();
                }
            }
        }
    }

    return new Uint8Array(parts);
}
