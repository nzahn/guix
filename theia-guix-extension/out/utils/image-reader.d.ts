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
export declare class GxImageReaderError extends Error {
    constructor(message: string);
}
export type ImageFormat = 'png' | 'jpeg' | 'bmp' | 'gif';
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
/**
 * Register a platform adapter.  Must be called once before readImage().
 */
export declare function registerImageDecodeAdapter(a: ImageDecodeAdapter): void;
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
export declare function readImage(bytes: Uint8Array, format: ImageFormat, outputFormat: number, compress: boolean, keepAlpha: boolean): Promise<GxPixelmapData>;
//# sourceMappingURL=image-reader.d.ts.map