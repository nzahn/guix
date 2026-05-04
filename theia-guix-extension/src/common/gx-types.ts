/**
 * GX_TYPE_* widget type constants — ported from common/inc/gx_api.h
 * Do NOT edit these values; they must match gx_api.h exactly.
 */

// Base widget types
export const GX_TYPE_WIDGET                   = 1;
export const GX_TYPE_BUTTON                   = 2;
export const GX_TYPE_TEXT_BUTTON              = 3;
export const GX_TYPE_MULTI_LINE_TEXT_BUTTON   = 4;
export const GX_TYPE_RADIO_BUTTON             = 5;
export const GX_TYPE_CHECKBOX                 = 6;
export const GX_TYPE_PIXELMAP_BUTTON          = 7;
export const GX_TYPE_SHADOW_BUTTON            = 8;
export const GX_TYPE_ICON_BUTTON              = 9;
export const GX_TYPE_SPIN_BUTTON              = 10;
export const GX_TYPE_ICON                     = 11;
export const GX_TYPE_SPRITE                   = 12;
export const GX_TYPE_CIRCULAR_GAUGE           = 13;

export const GX_TYPE_SLIDER                   = 20;
export const GX_TYPE_PIXELMAP_SLIDER          = 21;
export const GX_TYPE_VERTICAL_SCROLL          = 22;
export const GX_TYPE_HORIZONTAL_SCROLL        = 23;
export const GX_TYPE_PROGRESS_BAR             = 24;
export const GX_TYPE_RADIAL_PROGRESS_BAR      = 25;
export const GX_TYPE_RADIAL_SLIDER            = 26;

export const GX_TYPE_PROMPT                   = 30;
export const GX_TYPE_NUMERIC_PROMPT           = 31;
export const GX_TYPE_PIXELMAP_PROMPT          = 32;
export const GX_TYPE_NUMERIC_PIXELMAP_PROMPT  = 33;

export const GX_TYPE_SINGLE_LINE_TEXT_INPUT   = 64;
export const GX_TYPE_PIXELMAP_TEXT_INPUT      = 65;
export const GX_TYPE_DROP_LIST                = 70;

export const GX_TYPE_MENU_LIST                = 75;
export const GX_TYPE_MENU                     = 76;
export const GX_TYPE_ACCORDION_MENU           = 77;

// Window-derived types (always >= GX_TYPE_WINDOW)
export const GX_TYPE_WINDOW                   = 128;
export const GX_TYPE_ROOT_WINDOW              = 129;
export const GX_TYPE_VERTICAL_LIST            = 131;
export const GX_TYPE_HORIZONTAL_LIST          = 132;
export const GX_TYPE_POPUP_LIST               = 133;
export const GX_TYPE_MULTI_LINE_TEXT_VIEW     = 134;
export const GX_TYPE_MULTI_LINE_TEXT_INPUT    = 135;
export const GX_TYPE_LINE_CHART               = 136;
export const GX_TYPE_DIALOG                   = 137;
export const GX_TYPE_KEYBOARD                 = 138;
export const GX_TYPE_SCROLL_WHEEL             = 139;
export const GX_TYPE_TEXT_SCROLL_WHEEL        = 140;
export const GX_TYPE_STRING_SCROLL_WHEEL      = 141;
export const GX_TYPE_NUMERIC_SCROLL_WHEEL     = 142;
export const GX_TYPE_TREE_VIEW                = 143;
export const GX_TYPE_RICH_TEXT_VIEW           = 144;
export const GX_TYPE_GENERIC_SCROLL_WHEEL     = 145;

// Studio-only pseudo-type
export const GX_TYPE_TEMPLATE                 = 200;

// Widget style flags — from gx_api.h GX_STYLE_* defines
export const GX_STYLE_NONE                    = 0x00000000;
export const GX_STYLE_BORDER_NONE             = 0x00000000;
export const GX_STYLE_BORDER_RAISED           = 0x00000001;
export const GX_STYLE_BORDER_RECESSED         = 0x00000002;
export const GX_STYLE_BORDER_THIN             = 0x00000004;
export const GX_STYLE_BORDER_THICK            = 0x00000008;
export const GX_STYLE_TRANSPARENT             = 0x10000000;
export const GX_STYLE_DRAW_SELECTED           = 0x00000020;
export const GX_STYLE_ENABLED                 = 0x00000040;
export const GX_STYLE_TEXT_LEFT               = 0x00002000;
export const GX_STYLE_TEXT_RIGHT              = 0x00004000;
export const GX_STYLE_TEXT_CENTER             = 0x00000000;
export const GX_STYLE_BUTTON_PUSHED           = 0x00000010;
export const GX_STYLE_BUTTON_TOGGLE           = 0x00000200;
export const GX_STYLE_BUTTON_RADIO            = 0x00000400;
export const GX_STYLE_CHECKBOX_TICKMARK       = 0x00004000;
export const GX_STYLE_CURSOR_BLINK            = 0x00000200;
export const GX_STYLE_CURSOR_ALWAYS_DRAW      = 0x00000400;

// Widget status flags
export const GX_STATUS_VISIBLE                = 0x00000001;
export const GX_STATUS_ACCEPTS_INPUT          = 0x00000004;
export const GX_STATUS_STUDIO_CREATED         = 0x08000000;

// Color format constants — from gx_api.h GX_COLOR_FORMAT_*
export const GX_COLOR_FORMAT_MONOCHROME          = 1;
export const GX_COLOR_FORMAT_MONOCHROME_INVERTED = 2;
export const GX_COLOR_FORMAT_2BIT_GRAY           = 3;
export const GX_COLOR_FORMAT_2BIT_GRAY_INVERTED  = 4;
export const GX_COLOR_FORMAT_4BIT_GRAY           = 5;
export const GX_COLOR_FORMAT_4BIT_GRAY_INVERTED  = 6;
export const GX_COLOR_FORMAT_4BIT_VGA            = 7;
export const GX_COLOR_FORMAT_8BIT_GRAY           = 8;
export const GX_COLOR_FORMAT_8BIT_GRAY_INVERTED  = 9;
export const GX_COLOR_FORMAT_8BIT_PALETTE        = 10;
export const GX_COLOR_FORMAT_8BIT_PACKED_PIXEL   = 11;
export const GX_COLOR_FORMAT_5551BGRX            = 12;
export const GX_COLOR_FORMAT_1555XRGB            = 13;
export const GX_COLOR_FORMAT_565RGB              = 14;
export const GX_COLOR_FORMAT_4444ARGB            = 15;
export const GX_COLOR_FORMAT_4444BGRA            = 16;
export const GX_COLOR_FORMAT_565BGR              = 17;
export const GX_COLOR_FORMAT_24RGB               = 18;
export const GX_COLOR_FORMAT_24BGR               = 19;
export const GX_COLOR_FORMAT_24XRGB              = 20;
export const GX_COLOR_FORMAT_24BGRX              = 21;
export const GX_COLOR_FORMAT_32ARGB              = 22;
export const GX_COLOR_FORMAT_32RGBA              = 23;
export const GX_COLOR_FORMAT_32ABGR              = 24;
export const GX_COLOR_FORMAT_32BGRA              = 25;

// Allocation type constants — from StudioXProject.h
export const STATICALLY_ALLOCATED             = 0;
export const DYNAMIC_ALLOCATION_ROOT          = 1;
export const DYNAMIC_ALLOCATION_CHILD         = 2;

// Resource item types — from StudioXProject.h resource_item_types enum
export const RES_TYPE_HEADER    = 1;
export const RES_TYPE_GROUP     = 2;
export const RES_TYPE_FOLDER    = 3;
export const RES_TYPE_ADD_FONT  = 4;
export const RES_TYPE_ADD_COLOR = 5;
export const RES_TYPE_ADD_PIXELMAP = 6;
export const RES_TYPE_ADD_STRING = 7;
export const RES_TYPE_FONT      = 8;
export const RES_TYPE_COLOR     = 9;
export const RES_TYPE_PIXELMAP  = 10;
export const RES_TYPE_STRING    = 11;

// Path type constants — from StudioXProject.h PATHTYPES enum
export const PATH_TYPE_PROJECT_RELATIVE = 0;
export const PATH_TYPE_INSTALL_RELATIVE = 1;
export const PATH_TYPE_ABSOLUTE         = 2;

// Palette type constants — from StudioXProject.h PALETTE_TYPES enum
export const PALETTE_TYPE_NONE    = 0;
export const PALETTE_TYPE_PRIVATE = 1;
export const PALETTE_TYPE_SHARED  = 2;

// Widget resize mode constants — from widget_service_provider.h
export const RESIZE_MODE_ALL    = 1;
export const RESIZE_MODE_HEIGHT = 2;
export const RESIZE_MODE_WIDTH  = 3;

// Binary file format constants — from StudioXProject.h
export const BINARY_FILE_FORMAT_SREC            = 0x01;
export const BINARY_FILE_FORMAT_BIN             = 0x02;
export const BINARY_FILE_FORMAT_BIN_STANDALONE  = 0x03;

// Widget info array sizes — from StudioXProject.h
export const NUM_WIDGET_COLORS    = 8;
export const NUM_WIDGET_FONTS     = 4;
export const NUM_WIDGET_PIXELMAPS = 8;
export const NUM_WIDGET_STRINGS   = 2;

// Color array indices — from StudioXProject.h
export const NORMAL_FILL_COLOR_INDEX   = 0;
export const SELECTED_FILL_COLOR_INDEX = 1;
export const DISABLED_FILL_COLOR_INDEX = 2;
export const NORMAL_TEXT_COLOR_INDEX   = 3;
export const SELECTED_TEXT_COLOR_INDEX = 4;
export const DISABLED_TEXT_COLOR_INDEX = 5;
export const READONLY_FILL_COLOR_INDEX = 6;
export const READONLY_TEXT_COLOR_INDEX = 7;

// Font array indices
export const NORMAL_FONT_INDEX   = 0;
export const SELECTED_FONT_INDEX = 1;

// Pixelmap array indices
export const NORMAL_PIXELMAP_INDEX    = 0;
export const SELECTED_PIXELMAP_INDEX  = 1;
export const DISABLED_PIXELMAP_INDEX  = 2;

export const LOWER_PIXELMAP_INDEX     = 0;
export const UPPER_PIXELMAP_INDEX     = 1;
export const NEEDLE_PIXELMAP_INDEX    = 2;
export const WALLPAPER_PIXELMAP_INDEX = 0;
export const DROP_LIST_PIXELMAP_INDEX = 1;

// FolderIds enum — from StudioXProject.h
export const DEFAULT_COLOR_FOLDER   = 4096;
export const CUSTOM_COLOR_FOLDER    = 4097;
export const DEFAULT_FONT_FOLDER    = 4098;
export const CUSTOM_FONT_FOLDER     = 4099;
export const DEFAULT_PIXELMAP_FOLDER = 4100;
export const CUSTOM_PIXELMAP_FOLDER = 4101;

// GROUP_IDS enum — from StudioXProject.h
export const COLOR_GROUP   = 4096;
export const FONT_GROUP    = 4097;
export const PIXELMAP_GROUP = 4098;
export const STRING_GROUP  = 4099;

// HEADER_IDS — from StudioXProject.h
export const THEME_HEADER  = 4096;

// Default theme index
export const DEFAULT_THEME = 0;

// Font range counts — from StudioXProject.h
export const NUM_FONT_CHAR_RANGES          = 46;
export const NUM_FONT_EXTENDED_CHAR_RANGES = 4;

// Screen rotation constants — from gx_api.h
export const GX_SCREEN_ROTATION_NONE = 0;
export const GX_SCREEN_ROTATION_CW   = 90;
export const GX_SCREEN_ROTATION_CCW  = 270;
export const GX_SCREEN_ROTATION_FLIP = 180;

// String export type constants — from StudioXProject.h STRING_EXPORT_TYPES
export const STRING_EXPORT_TYPE_XLIFF = 1;
export const STRING_EXPORT_TYPE_CSV   = 2;

// Decoder type constants — from StudioXProject.h DECODER_TYPE
export const DECODER_TYPE_NONE = 0;
export const DECODER_TYPE_SW   = 1;
export const DECODER_TYPE_HW   = 2;

// Project constants — from StudioXProject.h
export const PROJECT_VERSION   = 56;
export const MAX_DISPLAYS      = 4;
export const MAX_LANGUAGES     = 128;
export const MAX_THEMES        = 8;

/** Returns true if a widget type is window-derived (>= GX_TYPE_WINDOW). */
export function isWindowType(widgetType: number): boolean {
    return widgetType >= GX_TYPE_WINDOW;
}

/** Returns the string name of a GX_TYPE_* constant (for diagnostics). */
export function gxTypeName(widgetType: number): string {
    const names: Record<number, string> = {
        [GX_TYPE_WIDGET]: 'GX_TYPE_WIDGET',
        [GX_TYPE_BUTTON]: 'GX_TYPE_BUTTON',
        [GX_TYPE_TEXT_BUTTON]: 'GX_TYPE_TEXT_BUTTON',
        [GX_TYPE_MULTI_LINE_TEXT_BUTTON]: 'GX_TYPE_MULTI_LINE_TEXT_BUTTON',
        [GX_TYPE_RADIO_BUTTON]: 'GX_TYPE_RADIO_BUTTON',
        [GX_TYPE_CHECKBOX]: 'GX_TYPE_CHECKBOX',
        [GX_TYPE_PIXELMAP_BUTTON]: 'GX_TYPE_PIXELMAP_BUTTON',
        [GX_TYPE_SHADOW_BUTTON]: 'GX_TYPE_SHADOW_BUTTON',
        [GX_TYPE_ICON_BUTTON]: 'GX_TYPE_ICON_BUTTON',
        [GX_TYPE_SPIN_BUTTON]: 'GX_TYPE_SPIN_BUTTON',
        [GX_TYPE_ICON]: 'GX_TYPE_ICON',
        [GX_TYPE_SPRITE]: 'GX_TYPE_SPRITE',
        [GX_TYPE_CIRCULAR_GAUGE]: 'GX_TYPE_CIRCULAR_GAUGE',
        [GX_TYPE_SLIDER]: 'GX_TYPE_SLIDER',
        [GX_TYPE_PIXELMAP_SLIDER]: 'GX_TYPE_PIXELMAP_SLIDER',
        [GX_TYPE_VERTICAL_SCROLL]: 'GX_TYPE_VERTICAL_SCROLL',
        [GX_TYPE_HORIZONTAL_SCROLL]: 'GX_TYPE_HORIZONTAL_SCROLL',
        [GX_TYPE_PROGRESS_BAR]: 'GX_TYPE_PROGRESS_BAR',
        [GX_TYPE_RADIAL_PROGRESS_BAR]: 'GX_TYPE_RADIAL_PROGRESS_BAR',
        [GX_TYPE_RADIAL_SLIDER]: 'GX_TYPE_RADIAL_SLIDER',
        [GX_TYPE_PROMPT]: 'GX_TYPE_PROMPT',
        [GX_TYPE_NUMERIC_PROMPT]: 'GX_TYPE_NUMERIC_PROMPT',
        [GX_TYPE_PIXELMAP_PROMPT]: 'GX_TYPE_PIXELMAP_PROMPT',
        [GX_TYPE_NUMERIC_PIXELMAP_PROMPT]: 'GX_TYPE_NUMERIC_PIXELMAP_PROMPT',
        [GX_TYPE_SINGLE_LINE_TEXT_INPUT]: 'GX_TYPE_SINGLE_LINE_TEXT_INPUT',
        [GX_TYPE_PIXELMAP_TEXT_INPUT]: 'GX_TYPE_PIXELMAP_TEXT_INPUT',
        [GX_TYPE_DROP_LIST]: 'GX_TYPE_DROP_LIST',
        [GX_TYPE_MENU_LIST]: 'GX_TYPE_MENU_LIST',
        [GX_TYPE_MENU]: 'GX_TYPE_MENU',
        [GX_TYPE_ACCORDION_MENU]: 'GX_TYPE_ACCORDION_MENU',
        [GX_TYPE_WINDOW]: 'GX_TYPE_WINDOW',
        [GX_TYPE_ROOT_WINDOW]: 'GX_TYPE_ROOT_WINDOW',
        [GX_TYPE_VERTICAL_LIST]: 'GX_TYPE_VERTICAL_LIST',
        [GX_TYPE_HORIZONTAL_LIST]: 'GX_TYPE_HORIZONTAL_LIST',
        [GX_TYPE_POPUP_LIST]: 'GX_TYPE_POPUP_LIST',
        [GX_TYPE_MULTI_LINE_TEXT_VIEW]: 'GX_TYPE_MULTI_LINE_TEXT_VIEW',
        [GX_TYPE_MULTI_LINE_TEXT_INPUT]: 'GX_TYPE_MULTI_LINE_TEXT_INPUT',
        [GX_TYPE_LINE_CHART]: 'GX_TYPE_LINE_CHART',
        [GX_TYPE_DIALOG]: 'GX_TYPE_DIALOG',
        [GX_TYPE_KEYBOARD]: 'GX_TYPE_KEYBOARD',
        [GX_TYPE_SCROLL_WHEEL]: 'GX_TYPE_SCROLL_WHEEL',
        [GX_TYPE_TEXT_SCROLL_WHEEL]: 'GX_TYPE_TEXT_SCROLL_WHEEL',
        [GX_TYPE_STRING_SCROLL_WHEEL]: 'GX_TYPE_STRING_SCROLL_WHEEL',
        [GX_TYPE_NUMERIC_SCROLL_WHEEL]: 'GX_TYPE_NUMERIC_SCROLL_WHEEL',
        [GX_TYPE_TREE_VIEW]: 'GX_TYPE_TREE_VIEW',
        [GX_TYPE_RICH_TEXT_VIEW]: 'GX_TYPE_RICH_TEXT_VIEW',
        [GX_TYPE_GENERIC_SCROLL_WHEEL]: 'GX_TYPE_GENERIC_SCROLL_WHEEL',
        [GX_TYPE_TEMPLATE]: 'GX_TYPE_TEMPLATE',
    };
    return names[widgetType] ?? `UNKNOWN(${widgetType})`;
}
