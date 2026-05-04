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
import { MAX_DISPLAYS, MAX_LANGUAGES, MAX_THEMES, PROJECT_VERSION } from './gx-types';

// ---------------------------------------------------------------------------
// ScrollbarAppearance — mirrors GX_SCROLLBAR_APPEARANCE
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ThemeInfo — mirrors class theme_info in StudioXProject.h
// ---------------------------------------------------------------------------

export interface ThemeInfo {
    theme_name: string;
    vscroll_appearance: ScrollbarAppearance;
    hscroll_appearance: ScrollbarAppearance;
    vscroll_style: number;
    hscroll_style: number;
    palette: number[];           // GX_COLOR values (0xAARRGGBB)
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

// ---------------------------------------------------------------------------
// StringEntry + StringTable
// ---------------------------------------------------------------------------

export interface StringEntry {
    string_id: number;   // 1-based
    name: string;        // resource name, e.g. "STRING_HELLO"
    /** translations[lang_index] — empty string if not translated */
    translations: string[];
}

// ---------------------------------------------------------------------------
// ScreenFlowTrigger + ScreenFlow (forward declarations; detail in screen-flow-model.ts)
// ---------------------------------------------------------------------------

export interface ScreenFlowEntry {
    screen_name: string;
    trigger_list: unknown[];  // typed in screen-flow-model.ts
}

// ---------------------------------------------------------------------------
// LanguageInfo — mirrors class language_info in StudioXProject.h
// ---------------------------------------------------------------------------

export interface LanguageInfo {
    name: string;
    support_bidi_text: boolean;
    gen_reordered_bidi_text: boolean;
    support_thai_glyph_shaping: boolean;
    gen_adjusted_thai_string: boolean;
    statically_defined: boolean;
}

// ---------------------------------------------------------------------------
// DisplayInfo — mirrors class display_info in StudioXProject.h
// ---------------------------------------------------------------------------

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
    colorformat: number;         // GX_COLOR_FORMAT_*
    num_themes: number;
    active_theme: number;
    /** String table — one entry per string ID; translations per language. */
    string_entries: StringEntry[];
    /** Screen flow definition */
    screen_flow: ScreenFlowEntry[];
    themes: ThemeInfo[];
    gen_string_table: boolean[]; // [MAX_LANGUAGES] — which languages to generate
    /** Widget tree root: array of folder_info, each holding top-level screens */
    folders: FolderInfo[];
}

// ---------------------------------------------------------------------------
// ProjectHeader — mirrors class project_header in StudioXProject.h
// ---------------------------------------------------------------------------

export interface ProjectHeader {
    project_version: number;    // must equal PROJECT_VERSION (56) after migration
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

    languages: LanguageInfo[];   // [MAX_LANGUAGES]

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

// ---------------------------------------------------------------------------
// GxpProject — top-level model for one loaded .gxp file
// ---------------------------------------------------------------------------

export interface GxpProject {
    header: ProjectHeader;
    displays: DisplayInfo[];   // [0..header.num_displays - 1]
    /** Absolute filesystem path to the .gxp file (empty if unsaved) */
    filePath: string;
    /** True if the project has unsaved changes */
    isModified: boolean;
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createDefaultScrollbarAppearance(): ScrollbarAppearance {
    return {
        gx_scroll_width: 20,
        gx_scroll_thumb_width: 18,
        gx_scroll_thumb_travel_min: 20,
        gx_scroll_thumb_travel_max: 20,
        gx_scroll_thumb_border_style: 0,
        gx_scroll_fill_pixelmap: 0,
        gx_scroll_thumb_pixelmap: 0,
        gx_scroll_up_pixelmap: 0,
        gx_scroll_down_pixelmap: 0,
        gx_scroll_thumb_color: 0,
        gx_scroll_thumb_border_color: 0,
        gx_scroll_button_color: 0,
    };
}

function createDefaultTheme(index: number): ThemeInfo {
    return {
        theme_name: index === 0 ? 'Theme_1' : `Theme_${index + 1}`,
        vscroll_appearance: createDefaultScrollbarAppearance(),
        hscroll_appearance: createDefaultScrollbarAppearance(),
        vscroll_style: 0,
        hscroll_style: 0,
        palette: [],
        palette_total_size: 0,
        palette_predefined: 0,
        gen_color_table: true,
        gen_font_table: true,
        gen_pixelmap_table: true,
        enabled: index === 0,
        statically_defined: false,
        resources: [],
    };
}

export function createDefaultDisplay(name: string): DisplayInfo {
    const themes: ThemeInfo[] = [];
    for (let i = 0; i < MAX_THEMES; i++) {
        themes.push(createDefaultTheme(i));
    }

    const gen_string_table: boolean[] = new Array(MAX_LANGUAGES).fill(false);
    gen_string_table[0] = true;

    return {
        name,
        xres: 320,
        yres: 240,
        bits_per_pix: 16,
        packed_format: false,
        format_555: false,
        format_4444: false,
        format_332: false,
        grayscale: false,
        reverse_order: false,
        allocate_canvas: true,
        enabled: true,
        rotation_angle: 0,
        default_map_format: true,
        colorformat: 7, // GX_COLOR_FORMAT_565RGB
        num_themes: 1,
        active_theme: 0,
        string_entries: [],
        screen_flow: [],
        themes,
        gen_string_table,
        folders: [],
    };
}

export function createDefaultLanguage(name: string): LanguageInfo {
    return {
        name,
        support_bidi_text: false,
        gen_reordered_bidi_text: false,
        support_thai_glyph_shaping: false,
        gen_adjusted_thai_string: false,
        statically_defined: false,
    };
}

export function createDefaultHeader(projectName: string): ProjectHeader {
    const languages: LanguageInfo[] = new Array(MAX_LANGUAGES)
        .fill(null)
        .map((_, i) => createDefaultLanguage(i === 0 ? 'English' : ''));

    return {
        project_version: PROJECT_VERSION,
        guix_version: 0,
        studio_version: 0,
        project_name: projectName,
        project_path: '',
        source_path: '',
        header_path: '',
        resource_path: '',
        malloc_name: '',
        free_name: '',
        additional_headers: '',
        insert_headers_before: false,
        num_displays: 1,
        max_displays: MAX_DISPLAYS,
        num_languages: 1,
        target_cpu: 0,
        target_tools: 0,
        big_endian: false,
        languages,
        string_export_src: 0,
        string_export_target: 0,
        string_export_version: 0,
        string_export_path: '',
        string_export_filename: '',
        string_export_filetype: 1,
        warn_missing_image: true,
        warn_missing_font: true,
        dave2d_graph_accelerator: false,
        renesas_png_decoder: 0,
        renesas_jpeg_decoder: 0,
        grid_enabled: false,
        snap_enabled: true,
        snap_to_widget_enabled: true,
        grid_spacing: 10,
        snap_spacing: 5,
        gen_binary: false,
        gen_res_header: false,
        binary_file_format: 0,
        memory_offset: 0,
        custom_resource_enabled: false,
        custom_resource_file_name: '',
        app_execute_xpos: 0,
        app_execute_ypos: 0,
        is_widget_position_locked: false,
        palette_mode_aa_text_colors: 0,
    };
}

export function createEmptyProject(projectName: string, filePath = ''): GxpProject {
    const header = createDefaultHeader(projectName);
    const displays: DisplayInfo[] = [];
    for (let i = 0; i < header.max_displays; i++) {
        displays.push(createDefaultDisplay(i === 0 ? `Display_${i + 1}` : ''));
    }
    displays[0].enabled = true;
    for (let i = 1; i < displays.length; i++) {
        displays[i].enabled = false;
    }

    return { header, displays, filePath, isModified: false };
}
