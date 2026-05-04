/**
 * TypeScript equivalent of res_info and related resource structures.
 * Ported from guix_studio/StudioXProject.h.
 */

import {
    PATH_TYPE_PROJECT_RELATIVE,
    PALETTE_TYPE_NONE,
} from './gx-types';

// ---------------------------------------------------------------------------
// PathInfo — mirrors PATHINFO struct in StudioXProject.h
// ---------------------------------------------------------------------------

export interface PathInfo {
    pathname: string;
    pathtype: number; // PATH_TYPE_* constant
}

export function createDefaultPathInfo(): PathInfo {
    return { pathname: '', pathtype: PATH_TYPE_PROJECT_RELATIVE };
}

// ---------------------------------------------------------------------------
// FontPageInfo — mirrors font_page_info struct in StudioXProject.h
// ---------------------------------------------------------------------------

export interface FontPageInfo {
    enabled: boolean;
    first_char: number;
    last_char: number;
}

// ---------------------------------------------------------------------------
// GxPixelmapData — decoded pixel data held at design time
// ---------------------------------------------------------------------------

export interface GxPixelmapData {
    width: number;
    height: number;
    /** Raw decoded pixel bytes in the output color format */
    data: Uint8Array;
    /** Delay (ms) used when this pixelmap is a sprite frame */
    delay: number;
}

// ---------------------------------------------------------------------------
// ResInfo — mirrors class res_info in StudioXProject.h
// ---------------------------------------------------------------------------

export interface ResInfo {
    type: number;        // RES_TYPE_* constant
    name: string;        // id name / resource name
    pathinfo: PathInfo;

    is_default: boolean;
    enabled: boolean;
    folder_id: number;

    // Pixelmap fields
    compress: boolean;
    keep_alpha: boolean;
    dither: boolean;
    raw: boolean;
    output_file_enabled: boolean;
    output_file: string;
    binary_mode: boolean;
    palette_type: number;       // PALETTE_TYPE_* constant
    output_color_format: number; // GX_COLOR_FORMAT_* constant

    /** Decoded pixelmap frames (populated by image-reader, not stored in .gxp) */
    map_list: GxPixelmapData[];

    // Color fields
    colorval: number;   // 0xAARRGGBB

    // Font fields
    font_height: number;
    font_bits: number;
    font_charset_include_string_table: boolean;
    font_support_extended_unicode: boolean;
    font_kerning: boolean;
    font_pages: FontPageInfo[];

    is_modified: boolean;

    /** Linked-list children (sub-resources); rendered as an array here. */
    children: ResInfo[];
}

/** Create a ResInfo with all fields initialised to safe defaults. */
export function createDefaultResInfo(type: number, name = ''): ResInfo {
    return {
        type,
        name,
        pathinfo: createDefaultPathInfo(),
        is_default: false,
        enabled: true,
        folder_id: 0,
        compress: false,
        keep_alpha: true,
        dither: false,
        raw: false,
        output_file_enabled: false,
        output_file: '',
        binary_mode: false,
        palette_type: PALETTE_TYPE_NONE,
        output_color_format: 0,
        map_list: [],
        colorval: 0,
        font_height: 0,
        font_bits: 4,
        font_charset_include_string_table: true,
        font_support_extended_unicode: false,
        font_kerning: false,
        font_pages: [],
        is_modified: false,
        children: [],
    };
}
