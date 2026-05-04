/**
 * TypeScript equivalent of res_info and related resource structures.
 * Ported from guix_studio/StudioXProject.h.
 */
export interface PathInfo {
    pathname: string;
    pathtype: number;
}
export declare function createDefaultPathInfo(): PathInfo;
export interface FontPageInfo {
    enabled: boolean;
    first_char: number;
    last_char: number;
}
export interface GxPixelmapData {
    width: number;
    height: number;
    /** Raw decoded pixel bytes in the output color format */
    data: Uint8Array;
    /** Delay (ms) used when this pixelmap is a sprite frame */
    delay: number;
}
export interface ResInfo {
    type: number;
    name: string;
    pathinfo: PathInfo;
    is_default: boolean;
    enabled: boolean;
    folder_id: number;
    compress: boolean;
    keep_alpha: boolean;
    dither: boolean;
    raw: boolean;
    output_file_enabled: boolean;
    output_file: string;
    binary_mode: boolean;
    palette_type: number;
    output_color_format: number;
    /** Decoded pixelmap frames (populated by image-reader, not stored in .gxp) */
    map_list: GxPixelmapData[];
    colorval: number;
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
export declare function createDefaultResInfo(type: number, name?: string): ResInfo;
//# sourceMappingURL=res-info.d.ts.map