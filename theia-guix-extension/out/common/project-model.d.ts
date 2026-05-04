/**
 * Top-level project model — TypeScript equivalent of studiox_project,
 * project_header, display_info, theme_info, and language_info from
 * guix_studio/StudioXProject.h.
 *
 * This is the single in-memory source of truth for the loaded .gxp project.
 * All panels and the canvas read from this model; only the GXP serialiser
 * and undo/redo commands mutate it.
 */
import { ResInfo } from './res-info';
import { FolderInfo } from './widget-info';
export interface ScrollbarAppearance {
    gx_scroll_width: number;
    gx_scroll_thumb_width: number;
    gx_scroll_thumb_travel_min: number;
    gx_scroll_thumb_travel_max: number;
    gx_scroll_thumb_border_style: number;
    gx_scroll_fill_pixelmap: number;
    gx_scroll_thumb_pixelmap: number;
    gx_scroll_up_pixelmap: number;
    gx_scroll_down_pixelmap: number;
    gx_scroll_thumb_color: number;
    gx_scroll_thumb_border_color: number;
    gx_scroll_button_color: number;
}
export interface ThemeInfo {
    theme_name: string;
    vscroll_appearance: ScrollbarAppearance;
    hscroll_appearance: ScrollbarAppearance;
    vscroll_style: number;
    hscroll_style: number;
    palette: number[];
    palette_total_size: number;
    palette_predefined: number;
    gen_color_table: boolean;
    gen_font_table: boolean;
    gen_pixelmap_table: boolean;
    enabled: boolean;
    statically_defined: boolean;
    /** Resource tree root — a linked list in C++; a flat array of roots here.
     *  Each element is the head of a colour/font/pixelmap group. */
    resources: ResInfo[];
}
export interface StringEntry {
    string_id: number;
    name: string;
    /** translations[lang_index] — empty string if not translated */
    translations: string[];
}
export interface ScreenFlowEntry {
    screen_name: string;
    trigger_list: unknown[];
}
export interface LanguageInfo {
    name: string;
    support_bidi_text: boolean;
    gen_reordered_bidi_text: boolean;
    support_thai_glyph_shaping: boolean;
    gen_adjusted_thai_string: boolean;
    statically_defined: boolean;
}
export interface DisplayInfo {
    name: string;
    xres: number;
    yres: number;
    bits_per_pix: number;
    packed_format: boolean;
    format_555: boolean;
    format_4444: boolean;
    format_332: boolean;
    grayscale: boolean;
    reverse_order: boolean;
    allocate_canvas: boolean;
    enabled: boolean;
    rotation_angle: number;
    default_map_format: boolean;
    colorformat: number;
    num_themes: number;
    active_theme: number;
    /** String table — one entry per string ID; translations per language. */
    string_entries: StringEntry[];
    /** Screen flow definition */
    screen_flow: ScreenFlowEntry[];
    themes: ThemeInfo[];
    gen_string_table: boolean[];
    /** Widget tree root: array of folder_info, each holding top-level screens */
    folders: FolderInfo[];
}
export interface ProjectHeader {
    project_version: number;
    guix_version: number;
    studio_version: number;
    project_name: string;
    project_path: string;
    source_path: string;
    header_path: string;
    resource_path: string;
    malloc_name: string;
    free_name: string;
    additional_headers: string;
    insert_headers_before: boolean;
    num_displays: number;
    max_displays: number;
    num_languages: number;
    target_cpu: number;
    target_tools: number;
    big_endian: boolean;
    languages: LanguageInfo[];
    string_export_src: number;
    string_export_target: number;
    string_export_version: number;
    string_export_path: string;
    string_export_filename: string;
    string_export_filetype: number;
    warn_missing_image: boolean;
    warn_missing_font: boolean;
    dave2d_graph_accelerator: boolean;
    renesas_png_decoder: number;
    renesas_jpeg_decoder: number;
    grid_enabled: boolean;
    snap_enabled: boolean;
    snap_to_widget_enabled: boolean;
    grid_spacing: number;
    snap_spacing: number;
    gen_binary: boolean;
    gen_res_header: boolean;
    binary_file_format: number;
    memory_offset: number;
    custom_resource_enabled: boolean;
    custom_resource_file_name: string;
    app_execute_xpos: number;
    app_execute_ypos: number;
    is_widget_position_locked: boolean;
    palette_mode_aa_text_colors: number;
}
export interface GxpProject {
    header: ProjectHeader;
    displays: DisplayInfo[];
    /** Absolute filesystem path to the .gxp file (empty if unsaved) */
    filePath: string;
    /** True if the project has unsaved changes */
    isModified: boolean;
}
export declare function createDefaultDisplay(name: string): DisplayInfo;
export declare function createDefaultLanguage(name: string): LanguageInfo;
export declare function createDefaultHeader(projectName: string): ProjectHeader;
export declare function createEmptyProject(projectName: string, filePath?: string): GxpProject;
//# sourceMappingURL=project-model.d.ts.map