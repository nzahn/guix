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
    const finalData = compress ? compressRle(pixelData, outputFormat) : pixelData;

    const result: GxPixelmapData = {
        width,
        height,
        data:  finalData,
        delay: 0,
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
// Run-length compression (mirrors binary_resource_gen.cpp WriteCompressed)
// ---------------------------------------------------------------------------

/** Perform a simple 16-bit-word RLE compression over pixel data. */
function compressRle(data: Uint8Array, _outputFormat: number): Uint8Array {
    // Placeholder: return uncompressed data until full RLE is implemented.
    void _outputFormat;
    return data;
}
