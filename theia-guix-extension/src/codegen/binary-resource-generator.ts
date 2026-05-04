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

import { injectable } from 'inversify';
import { GxpProject, DisplayInfo, ThemeInfo } from '../common/project-model';
import { ResInfo } from '../common/res-info';
import {
    GX_COLOR_FORMAT_8BIT_PALETTE,
    RES_TYPE_COLOR,
    RES_TYPE_FONT,
    RES_TYPE_PIXELMAP,
} from '../common/gx-types';
import { GxCodegenError } from './resource-generator';

// ---------------------------------------------------------------------------
// Binary struct size constants (must match common/inc/gx_api.h)
// ---------------------------------------------------------------------------

const GX_RESOURCE_HEADER_SIZE  = 16;
const GX_THEME_HEADER_SIZE     = 12;
const GX_COLOR_HEADER_SIZE     = 8;
const GX_PALETTE_HEADER_SIZE   = 8;
const GX_FONT_HEADER_SIZE      = 14;
const GX_PIXELMAP_HEADER_SIZE  = 20;
const GX_STRING_HEADER_SIZE    = 8;
const GX_LANGUAGE_HEADER_SIZE  = 8;

// Magic / version
const GX_RESOURCE_MAGIC        = 0x47584249; // 'GXBI'
const GX_RESOURCE_VERSION      = 0x0001;

// SREC line data payload (bytes per record)
const SREC_MAX_DATA_SIZE       = 32;

// ---------------------------------------------------------------------------
// Output formats
// ---------------------------------------------------------------------------

export const BINARY_FORMAT_RAW   = 0;
export const BINARY_FORMAT_SREC  = 1;

// ---------------------------------------------------------------------------
// Generated output
// ---------------------------------------------------------------------------

export interface BinaryResourceFile {
    filename: string;
    content: Uint8Array;      // raw binary
    srec:    string;          // S-record text (empty when format = RAW)
}

// ---------------------------------------------------------------------------
// BinaryResourceGenerator
// ---------------------------------------------------------------------------

@injectable()
export class BinaryResourceGenerator {

    /**
     * Generate the binary resource file for one display.
     *
     * @param project   Loaded project model
     * @param dispIdx   Index into project.displays
     * @param format    BINARY_FORMAT_RAW | BINARY_FORMAT_SREC
     */
    generate(project: GxpProject, dispIdx: number, format: number): BinaryResourceFile {
        const disp = project.displays[dispIdx];
        if (!disp) throw new GxCodegenError(`Display index ${dispIdx} out of range`);

        const projName = project.header.project_name.replace(/[^A-Za-z0-9_]/g, '_');
        const dispName = disp.name.replace(/[^A-Za-z0-9_]/g, '_');
        const baseName = project.displays.length > 1
            ? `${projName}_${dispName}_resources`
            : `${projName}_resources`;
        const ext      = format === BINARY_FORMAT_SREC ? '.srec' : '.bin';

        const buf = this.buildBinary(project, disp);

        return {
            filename: baseName + ext,
            content:  buf,
            srec:     format === BINARY_FORMAT_SREC ? this.toSrec(baseName, buf) : '',
        };
    }

    // ── Binary layout builder ────────────────────────────────────────────────

    private buildBinary(project: GxpProject, disp: DisplayInfo): Uint8Array {
        const bigEndian       = project.header.big_endian;
        const enabledThemes   = disp.themes.filter(t => t.enabled);
        const langs           = project.header.languages.filter(l => l.name);
        const nThemes         = enabledThemes.length;
        const nLangs          = langs.length;

        // ── Compute total size ──────────────────────────────────────────
        let totalSize = GX_RESOURCE_HEADER_SIZE
            + nThemes * GX_THEME_HEADER_SIZE;

        for (const theme of enabledThemes) {
            totalSize += this.colorBlockSize(disp, theme);
            totalSize += this.paletteBlockSize(disp, theme);
            totalSize += this.fontBlockSize(theme);
            totalSize += this.pixelmapBlockSize(theme);
        }
        totalSize += this.stringBlockSize(disp, nLangs);

        // ── Allocate buffer ─────────────────────────────────────────────
        const data   = new Uint8Array(totalSize);
        const view   = new DataView(data.buffer);
        let   offset = 0;

        // ── GX_RESOURCE_HEADER ──────────────────────────────────────────
        offset += writeU32(view, offset, bigEndian, GX_RESOURCE_MAGIC);       // magic
        offset += writeU16(view, offset, bigEndian, GX_RESOURCE_VERSION);     // version
        offset += writeU16(view, offset, bigEndian, nThemes);                 // theme_count
        offset += writeU16(view, offset, bigEndian, nLangs);                  // language_count
        offset += writeU32(view, offset, bigEndian, totalSize);               // total_size
        offset += writeU16(view, offset, bigEndian, 0);                       // reserved

        // ── Per-theme data ──────────────────────────────────────────────
        for (const theme of enabledThemes) {
            // GX_THEME_HEADER
            const themeStart = offset;
            offset += writeU32(view, offset, bigEndian, 0); // color_data_offset (back-fill)
            offset += writeU32(view, offset, bigEndian, 0); // font_data_offset (back-fill)
            offset += writeU32(view, offset, bigEndian, 0); // pixelmap_data_offset (back-fill)

            const colorOffset = offset;
            offset = this.writeColorBlock(data, view, offset, bigEndian, disp, theme);
            offset = this.writePaletteBlockIfNeeded(view, offset, bigEndian, disp, theme);

            const fontOffset  = offset;
            offset = this.writeFontBlock(data, view, offset, bigEndian, theme);

            const mapOffset   = offset;
            offset = this.writePixelmapBlock(data, view, offset, bigEndian, theme);

            // Back-fill offsets in GX_THEME_HEADER
            writeU32(view, themeStart,     bigEndian, colorOffset);
            writeU32(view, themeStart + 4, bigEndian, fontOffset);
            writeU32(view, themeStart + 8, bigEndian, mapOffset);
        }

        // ── String data ─────────────────────────────────────────────────
        offset = this.writeStringBlock(data, view, offset, bigEndian, disp, project);

        return data.subarray(0, offset);
    }

    // ── Color block ──────────────────────────────────────────────────────────

    private colorBlockSize(_disp: DisplayInfo, theme: ThemeInfo): number {
        const colors = collectByType(theme.resources, RES_TYPE_COLOR);
        if (colors.length === 0) return 0;
        return GX_COLOR_HEADER_SIZE + colors.length * 4;
    }

    private writeColorBlock(
        _data: Uint8Array,
        view: DataView,
        offset: number,
        bigEndian: boolean,
        _disp: DisplayInfo,
        theme: ThemeInfo,
    ): number {
        const colors = collectByType(theme.resources, RES_TYPE_COLOR);
        if (colors.length === 0) return offset;

        // GX_COLOR_HEADER
        offset += writeU16(view, offset, bigEndian, GX_COLOR_HEADER_SIZE);   // header_size
        offset += writeU16(view, offset, bigEndian, colors.length);           // color_count
        offset += writeU32(view, offset, bigEndian, 0);                       // reserved

        for (const c of colors) {
            offset += writeU32(view, offset, bigEndian, c.colorval);
        }
        return offset;
    }

    // ── Palette block ─────────────────────────────────────────────────────────

    private paletteBlockSize(disp: DisplayInfo, theme: ThemeInfo): number {
        if (disp.colorformat !== GX_COLOR_FORMAT_8BIT_PALETTE) return 0;
        if (theme.palette.length === 0) return 0;
        return GX_PALETTE_HEADER_SIZE + theme.palette.length * 4;
    }

    private writePaletteBlockIfNeeded(
        view: DataView,
        offset: number,
        bigEndian: boolean,
        disp: DisplayInfo,
        theme: ThemeInfo,
    ): number {
        if (disp.colorformat !== GX_COLOR_FORMAT_8BIT_PALETTE) return offset;
        return this.writePaletteBlock(view, offset, bigEndian, theme);
    }

    private writePaletteBlock(
        view: DataView,
        offset: number,
        bigEndian: boolean,
        theme: ThemeInfo,
    ): number {
        if (theme.palette.length === 0) return offset;
        offset += writeU16(view, offset, bigEndian, GX_PALETTE_HEADER_SIZE);
        offset += writeU16(view, offset, bigEndian, theme.palette.length);
        offset += writeU32(view, offset, bigEndian, 0);
        for (const c of theme.palette) {
            offset += writeU32(view, offset, bigEndian, c);
        }
        return offset;
    }

    // ── Font block ────────────────────────────────────────────────────────────

    private fontBlockSize(theme: ThemeInfo): number {
        const fonts = collectByType(theme.resources, RES_TYPE_FONT);
        if (fonts.length === 0) return 0;
        // Header only — actual glyph data not yet generated (font-util deferred)
        return GX_FONT_HEADER_SIZE * fonts.length;
    }

    private writeFontBlock(
        _data: Uint8Array,
        view: DataView,
        offset: number,
        bigEndian: boolean,
        theme: ThemeInfo,
    ): number {
        const fonts = collectByType(theme.resources, RES_TYPE_FONT);
        for (const f of fonts) {
            // GX_FONT_HEADER (placeholder — real data from font-util)
            offset += writeU16(view, offset, bigEndian, GX_FONT_HEADER_SIZE); // header_size
            offset += writeU16(view, offset, bigEndian, f.font_height);       // font_height
            offset += writeU16(view, offset, bigEndian, f.font_bits);         // font_bits
            offset += writeU16(view, offset, bigEndian, 0);                   // page_count
            offset += writeU32(view, offset, bigEndian, 0);                   // font_data_size
            offset += writeU16(view, offset, bigEndian, 0);                   // first_char
            offset += writeU16(view, offset, bigEndian, 0);                   // last_char
        }
        return offset;
    }

    // ── Pixelmap block ────────────────────────────────────────────────────────

    private pixelmapBlockSize(theme: ThemeInfo): number {
        const maps = collectByType(theme.resources, RES_TYPE_PIXELMAP);
        if (maps.length === 0) return 0;
        let size = 0;
        for (const m of maps) {
            size += GX_PIXELMAP_HEADER_SIZE;
            const mapData = m.map_list[0];
            if (mapData) size += mapData.data.length;
        }
        return size;
    }

    private writePixelmapBlock(
        data: Uint8Array,
        view: DataView,
        offset: number,
        bigEndian: boolean,
        theme: ThemeInfo,
    ): number {
        const maps = collectByType(theme.resources, RES_TYPE_PIXELMAP);
        for (const m of maps) {
            const mapData     = m.map_list[0];
            const pixelBytes  = mapData ? mapData.data.length : 0;
            const width       = mapData ? mapData.width  : 0;
            const height      = mapData ? mapData.height : 0;

            // GX_PIXELMAP_HEADER
            offset += writeU16(view, offset, bigEndian, GX_PIXELMAP_HEADER_SIZE);
            offset += writeU16(view, offset, bigEndian, 0);                   // flags
            offset += writeU16(view, offset, bigEndian, 0);                   // format
            offset += writeU16(view, offset, bigEndian, width);
            offset += writeU16(view, offset, bigEndian, height);
            offset += writeU32(view, offset, bigEndian, pixelBytes);          // data_size
            offset += writeU32(view, offset, bigEndian, 0);                   // aux_data_size
            offset += writeU32(view, offset, bigEndian, 0);                   // reserved

            if (mapData && mapData.data.length > 0) {
                data.set(mapData.data, offset);
                offset += mapData.data.length;
            }
        }
        return offset;
    }

    // ── String block ──────────────────────────────────────────────────────────

    private stringBlockSize(disp: DisplayInfo, nLangs: number): number {
        if (disp.string_entries.length === 0 || nLangs === 0) return 0;
        let size = GX_STRING_HEADER_SIZE + nLangs * GX_LANGUAGE_HEADER_SIZE;
        for (let li = 0; li < nLangs; li++) {
            for (const entry of disp.string_entries) {
                const text  = entry.translations[li] ?? '';
                const bytes = textToUtf8(text);
                size += 2 + bytes.length + 1; // length(u16) + data + null
            }
        }
        return size;
    }

    private writeStringBlock(
        data: Uint8Array,
        view: DataView,
        offset: number,
        bigEndian: boolean,
        disp: DisplayInfo,
        project: GxpProject,
    ): number {
        const langs   = project.header.languages.filter(l => l.name);
        const entries = disp.string_entries;
        if (entries.length === 0 || langs.length === 0) return offset;

        // GX_STRING_HEADER
        offset += writeU16(view, offset, bigEndian, GX_STRING_HEADER_SIZE);
        offset += writeU16(view, offset, bigEndian, langs.length);
        offset += writeU16(view, offset, bigEndian, entries.length + 1); // +1 for null slot
        offset += writeU16(view, offset, bigEndian, 0);

        // Per-language GX_LANGUAGE_HEADER + string data
        for (const [li] of langs.entries()) {
            // GX_LANGUAGE_HEADER
            offset += writeU16(view, offset, bigEndian, GX_LANGUAGE_HEADER_SIZE);
            offset += writeU16(view, offset, bigEndian, entries.length + 1);
            offset += writeU32(view, offset, bigEndian, 0); // data_size (back-fill)

            for (const entry of entries) {
                const text  = entry.translations[li] ?? '';
                const bytes = textToUtf8(text);
                // length-prefixed string
                offset += writeU16(view, offset, bigEndian, bytes.length);
                data.set(bytes, offset);
                offset += bytes.length;
                data[offset++] = 0; // null terminator
            }
        }
        return offset;
    }

    // ── S-record formatter ────────────────────────────────────────────────────

    /**
     * Encode binary data as Motorola S-record file.
     * Uses S0 (header), S3 (32-bit address data), S8 (end-of-file).
     */
    private toSrec(name: string, data: Uint8Array): string {
        const lines: string[] = [];

        // S0 record — header
        const nameBytes = new TextEncoder().encode(name.substring(0, 20));
        lines.push(buildSrec(0x00, 0, nameBytes));

        // S3 records — data at sequential addresses
        for (let addr = 0; addr < data.length; addr += SREC_MAX_DATA_SIZE) {
            const chunk = data.subarray(addr, addr + SREC_MAX_DATA_SIZE);
            lines.push(buildSrec(0x03, addr, chunk));
        }

        // S8 record — end of file (32-bit start address = 0)
        lines.push(buildSrec(0x08, 0, new Uint8Array(0)));

        return lines.join('\r\n') + '\r\n';
    }
}

// ---------------------------------------------------------------------------
// S-record helper
// ---------------------------------------------------------------------------

/**
 * Build one S-record line.
 *
 * @param type    0=S0, 3=S3 (32-bit addr data), 8=S8 (end, 32-bit addr)
 * @param addr    Address
 * @param payload Data bytes
 */
function buildSrec(type: number, addr: number, payload: Uint8Array): string {
    const addrBytes = type === 0 ? 2 : 4; // S0 uses 16-bit address
    const byteCount = addrBytes + payload.length + 1; // addr + data + checksum

    let hex = byteCount.toString(16).toUpperCase().padStart(2, '0');

    // Address
    if (addrBytes === 4) {
        hex += (addr >>> 24 & 0xFF).toString(16).toUpperCase().padStart(2, '0');
        hex += (addr >>> 16 & 0xFF).toString(16).toUpperCase().padStart(2, '0');
    }
    hex += (addr >>  8 & 0xFF).toString(16).toUpperCase().padStart(2, '0');
    hex += (addr       & 0xFF).toString(16).toUpperCase().padStart(2, '0');

    // Data
    for (const b of payload) {
        hex += b.toString(16).toUpperCase().padStart(2, '0');
    }

    // Checksum: ones-complement of all bytes sum
    let sum = byteCount;
    if (addrBytes === 4) {
        sum += (addr >>> 24 & 0xFF) + (addr >>> 16 & 0xFF);
    }
    sum += (addr >>  8 & 0xFF) + (addr & 0xFF);
    for (const b of payload) sum += b;
    const checksum = (~sum) & 0xFF;
    hex += checksum.toString(16).toUpperCase().padStart(2, '0');

    return `S${type}${hex}`;
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

function writeU16(view: DataView, offset: number, bigEndian: boolean, value: number): number {
    view.setUint16(offset, value & 0xFFFF, !bigEndian);
    return 2;
}

function writeU32(view: DataView, offset: number, bigEndian: boolean, value: number): number {
    view.setUint32(offset, value >>> 0, !bigEndian);
    return 4;
}

// ---------------------------------------------------------------------------
// Resource tree helpers
// ---------------------------------------------------------------------------

function collectByType(resources: ResInfo[], type: number): ResInfo[] {
    const result: ResInfo[] = [];
    for (const r of resources) collectRec(r, type, result);
    return result;
}

function collectRec(r: ResInfo, type: number, out: ResInfo[]): void {
    if (r.type === type && r.name) out.push(r);
    for (const child of r.children) collectRec(child, type, out);
}

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

function textToUtf8(s: string): Uint8Array {
    return new TextEncoder().encode(s);
}
