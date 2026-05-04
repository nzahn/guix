/**
 * BinaryResourceGenerator — emits binary resource files (.bin or S-record).
 *
 * Ports guix_studio/binary_resource_gen.cpp.
 *
 * The binary format mirrors what gx_display_theme_install() consumes:
 *   GX_RESOURCE_HEADER
 *     GX_THEME_HEADER[n_themes]
 *       GX_COLOR_HEADER + color data
 *       GX_PALETTE_HEADER + palette data
 *       GX_FONT_HEADER + page + glyph blocks
 *       GX_PIXELMAP_HEADER + pixel data
 *     GX_STRING_HEADER + GX_LANGUAGE_HEADER[n_langs] + string data
 *
 * S-record format: Motorola SREC with S0 / S3 / S8 records.
 */
import { GxpProject } from '../common/project-model';
export declare const BINARY_FORMAT_RAW = 0;
export declare const BINARY_FORMAT_SREC = 1;
export interface BinaryResourceFile {
    filename: string;
    content: Uint8Array;
    srec: string;
}
export declare class BinaryResourceGenerator {
    /**
     * Generate the binary resource file for one display.
     *
     * @param project   Loaded project model
     * @param dispIdx   Index into project.displays
     * @param format    BINARY_FORMAT_RAW | BINARY_FORMAT_SREC
     */
    generate(project: GxpProject, dispIdx: number, format: number): BinaryResourceFile;
    private buildBinary;
    private colorBlockSize;
    private writeColorBlock;
    private paletteBlockSize;
    private writePaletteBlockIfNeeded;
    private writePaletteBlock;
    private fontBlockSize;
    private writeFontBlock;
    private pixelmapBlockSize;
    private writePixelmapBlock;
    private stringBlockSize;
    private writeStringBlock;
    /**
     * Encode binary data as Motorola S-record file.
     * Uses S0 (header), S3 (32-bit address data), S8 (end-of-file).
     */
    private toSrec;
}
//# sourceMappingURL=binary-resource-generator.d.ts.map