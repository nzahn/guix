/**
 * TypeScript equivalent of widget_info and all its dependent sub-structs.
 * Ported from guix_studio/StudioXProject.h.
 *
 * IMPORTANT: Field names mirror the XML attribute names used in the .gxp
 * serialiser so that JSON ↔ model conversion is trivial.
 */
export interface GxRectangle {
    left: number;
    top: number;
    right: number;
    bottom: number;
}
export interface GxPoint {
    x: number;
    y: number;
}
export interface SliderInfo {
    min_val: number;
    max_val: number;
    current_val: number;
    increment: number;
    min_travel: number;
    max_travel: number;
    needle_width: number;
    needle_height: number;
    needle_inset: number;
    needle_hotspot: number;
}
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
export interface RadialProgressBarInfo {
    xcenter: number;
    ycenter: number;
    radius: number;
    current_val: number;
    anchor_val: number;
    font_index: number;
    normal_text_color: number;
    selected_text_color: number;
    disabled_text_color: number;
    normal_brush_width: number;
    selected_brush_width: number;
    normal_brush_color: number;
    selected_brush_color: number;
    disabled_brush_color: number;
    normal_brush_alpha: number;
    selected_brush_alpha: number;
    disabled_brush_alpha: number;
}
export interface RadialSliderInfo {
    xcenter: number;
    ycenter: number;
    radius: number;
    track_width: number;
    needle_offset: number;
    current_angle: number;
    min_angle: number;
    max_angle: number;
    background_pixelmap: number;
    needle_pixelmap: number;
    animation_total_steps: number;
    animation_delay: number;
    animation_style: number;
}
export interface LineChartInfo {
    left_margin: number;
    right_margin: number;
    top_margin: number;
    bottom_margin: number;
    max_data_count: number;
    active_data_count: number;
    axis_line_width: number;
    data_line_width: number;
    axis_color: number;
    line_color: number;
}
export interface ProgressInfo {
    min_val: number;
    max_val: number;
    current_val: number;
}
export interface VerticalListInfo {
    total_rows: number;
    seperation: number;
}
export interface DropListInfo {
    total_rows: number;
    seperation: number;
    open_height: number;
}
export interface TextInputInfo {
    whitespace: number;
    line_space: number;
    buffer_size: number;
    dynamic_buffer: boolean;
}
export interface SpriteFrameInfo {
    pixelmap_id: number;
    x_offset: number;
    y_offset: number;
    delay: number;
    alpha: number;
    blend_alpha_value: number;
    frame_flags: number;
}
export interface SpriteInfo {
    framelist: SpriteFrameInfo[];
    apply_to_all_frames: boolean;
}
export interface CircularGaugeInfo {
    xcenter: number;
    ycenter: number;
    radius: number;
    needle_length: number;
    needle_width: number;
    needle_pixelmap: number;
    start_angle: number;
    end_angle: number;
    increment: number;
    current_angle: number;
    min_angle: number;
    max_angle: number;
    animation_steps: number;
    animation_delay: number;
    animation_style: number;
}
export interface ScrollWheelInfo {
    total_rows: number;
    row_height: number;
    selected_row: number;
    start_alpha: number;
    end_alpha: number;
}
export interface StringScrollWheelInfo {
    base: ScrollWheelInfo;
    string_id_list: number[];
}
export interface NumericScrollWheelInfo {
    base: ScrollWheelInfo;
    start_val: number;
    end_val: number;
}
export interface MenuInfo {
    text_x_offset: number;
    text_y_offset: number;
    list_total_count: number;
    insert_as_menu_item: boolean;
}
/** Discriminated union mirroring the C++ extended_widget_info union. */
export type ExtendedWidgetInfo = {
    kind: 'slider';
    info: SliderInfo;
} | {
    kind: 'scroll';
    info: ScrollbarAppearance;
} | {
    kind: 'radial_progress';
    info: RadialProgressBarInfo;
} | {
    kind: 'radial_slider';
    info: RadialSliderInfo;
} | {
    kind: 'line_chart';
    info: LineChartInfo;
} | {
    kind: 'progress';
    info: ProgressInfo;
} | {
    kind: 'vlist';
    info: VerticalListInfo;
} | {
    kind: 'drop_list';
    info: DropListInfo;
} | {
    kind: 'text_info';
    info: TextInputInfo;
} | {
    kind: 'sprite';
    info: SpriteInfo;
} | {
    kind: 'gauge';
    info: CircularGaugeInfo;
} | {
    kind: 'numeric_prompt_value';
    value: number;
} | {
    kind: 'scroll_wheel';
    info: ScrollWheelInfo;
} | {
    kind: 'string_scroll_wheel';
    info: StringScrollWheelInfo;
} | {
    kind: 'numeric_scroll_wheel';
    info: NumericScrollWheelInfo;
} | {
    kind: 'menu';
    info: MenuInfo;
} | {
    kind: 'tree_view_indentation';
    value: number;
} | {
    kind: 'template_display';
    value: number;
} | {
    kind: 'none';
};
export interface WidgetInfo {
    basetype: number;
    misc_value: number;
    allocation: number;
    size: GxRectangle;
    /** Resource IDs — indices match *_COLOR_INDEX constants */
    color_id: [number, number, number, number, number, number, number, number];
    /** Resource IDs — indices match *_PIXELMAP_INDEX constants */
    pixelmap_id: [number, number, number, number, number, number, number, number];
    /** Resource IDs — string resources */
    string_id: [number, number];
    /** Resource IDs — font resources */
    font_id: [number, number, number, number];
    style: number;
    event_func: string;
    draw_func: string;
    id_name: string;
    app_name: string;
    base_name: string;
    custom_name: string;
    callback_func: string;
    format_func: string;
    user_data: string;
    accepts_focus: boolean;
    is_template: boolean;
    visible_at_startup: boolean;
    ewi: ExtendedWidgetInfo;
    /** Child widgets (linked list in C++; array here for ergonomics). */
    children: WidgetInfo[];
}
/** Create a WidgetInfo with all fields initialised to safe defaults. */
export declare function createDefaultWidgetInfo(basetype: number): WidgetInfo;
export interface FolderInfo {
    folder_name: string;
    output_filename: string;
    widgets: WidgetInfo[];
}
//# sourceMappingURL=widget-info.d.ts.map