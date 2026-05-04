/**
 * WidgetService — abstract base class for per-type widget services.
 *
 * Ports guix_studio/widget_service_provider.h/.cpp.
 *
 * One concrete subclass exists per GX_TYPE_* constant.  The subclass:
 *   - reports its type number and string names
 *   - creates a default-initialised WidgetInfo for that type
 *   - provides the property descriptor list used by the property panel
 *   - maps resource indices (color, font, pixelmap, string) to names
 *   - reports resize constraints
 */

import {
    GX_TYPE_WIDGET,
    GX_TYPE_WINDOW,
    GX_TYPE_ROOT_WINDOW,
    GX_TYPE_BUTTON,
    GX_TYPE_TEXT_BUTTON,
    GX_TYPE_MULTI_LINE_TEXT_BUTTON,
    GX_TYPE_CHECKBOX,
    GX_TYPE_RADIO_BUTTON,
    GX_TYPE_ICON_BUTTON,
    GX_TYPE_PIXELMAP_BUTTON,
    GX_TYPE_ICON,
    GX_TYPE_SPRITE,
    GX_TYPE_CIRCULAR_GAUGE,
    GX_TYPE_PROGRESS_BAR,
    GX_TYPE_RADIAL_PROGRESS_BAR,
    GX_TYPE_PROMPT,
    GX_TYPE_NUMERIC_PROMPT,
    GX_TYPE_PIXELMAP_PROMPT,
    GX_TYPE_NUMERIC_PIXELMAP_PROMPT,
    GX_TYPE_SINGLE_LINE_TEXT_INPUT,
    GX_TYPE_MULTI_LINE_TEXT_INPUT,
    GX_TYPE_MULTI_LINE_TEXT_VIEW,
    GX_TYPE_RICH_TEXT_VIEW,
    GX_TYPE_VERTICAL_LIST,
    GX_TYPE_HORIZONTAL_LIST,
    GX_TYPE_DROP_LIST,
    GX_TYPE_GENERIC_SCROLL_WHEEL,
    GX_TYPE_STRING_SCROLL_WHEEL,
    GX_TYPE_NUMERIC_SCROLL_WHEEL,
    GX_TYPE_TEMPLATE,
    GX_TYPE_HORIZONTAL_SCROLL,
    GX_TYPE_VERTICAL_SCROLL,
    GX_TYPE_SLIDER,
    GX_TYPE_PIXELMAP_SLIDER,
    GX_TYPE_RADIAL_SLIDER,
    GX_TYPE_LINE_CHART,
    GX_TYPE_MENU,
    GX_TYPE_ACCORDION_MENU,
    GX_TYPE_TREE_VIEW,
    RESIZE_MODE_ALL,
    RESIZE_MODE_HEIGHT,
    RESIZE_MODE_WIDTH,
} from '../common/gx-types';
import { WidgetInfo, FolderInfo, createDefaultWidgetInfo } from '../common/widget-info';
import { GxRectangle } from '../common/widget-info';

// Re-export resize modes for convenience
export { RESIZE_MODE_ALL, RESIZE_MODE_HEIGHT, RESIZE_MODE_WIDTH };

// ---------------------------------------------------------------------------
// PropertyField — describes a single editable property shown in the panel
// ---------------------------------------------------------------------------

export type PropertyFieldKind =
    | 'string'
    | 'number'
    | 'boolean'
    | 'color_id'
    | 'font_id'
    | 'pixelmap_id'
    | 'string_id'
    | 'style_bits'
    | 'enum';

export interface PropertyField {
    /** Display label in the property panel. */
    label: string;
    /** JSON key path on WidgetInfo (dotted, e.g. "size.left", "color_id.0"). */
    path: string;
    kind: PropertyFieldKind;
    /** For 'enum' kind — maps numeric value → display name. */
    enumValues?: ReadonlyArray<{ value: number; label: string }>;
    /** For 'style_bits' kind — the bitmask for this single bit field. */
    bitMask?: number;
    readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// WidgetService — abstract base
// ---------------------------------------------------------------------------

export abstract class WidgetService {

    /** GX_TYPE_* integer constant this service handles. */
    abstract getType(): number;

    /** C type name string, e.g. "GX_WIDGET". */
    abstract getControlBlockName(): string;

    /** Short lower-case name used in app code, e.g. "widget", "button". */
    abstract getShortName(): string;

    /**
     * Create a new WidgetInfo with sensible defaults for this widget type.
     * Mirrors CreateNewInstance in the C++ service provider.
     */
    createDefault(parent?: WidgetInfo | FolderInfo): WidgetInfo {
        const info = createDefaultWidgetInfo(this.getType());
        void parent; // subclasses may use parent for positioning
        return info;
    }

    /**
     * Return the ordered list of property fields the panel should display.
     * Common fields (name, position, size, style, colors…) are prepended
     * by the base implementation; subclasses add type-specific fields.
     */
    getPropertyFields(): PropertyField[] {
        return [
            ...this.commonFields(),
            ...this.typeSpecificFields(),
        ];
    }

    /** Override to add type-specific fields after the common ones. */
    protected typeSpecificFields(): PropertyField[] {
        return [];
    }

    /**
     * Resize mode reported to the canvas snap engine.
     * Default: allow resize in all directions.
     */
    getResizeMode(): number { return RESIZE_MODE_ALL; }

    /**
     * Return the default bounding rectangle for a new widget of this type
     * placed in a 320x240 display with its top-left at (10,10).
     */
    getDefaultRect(): GxRectangle {
        return { left: 10, top: 10, right: 109, bottom: 59 };
    }

    // ── Resource index label maps ─────────────────────────────────────────────

    /** Labels for color_id[0..7] slots. Override to name them. */
    colorLabels(): string[] {
        return ['Normal color', 'Selected color', 'Disabled color',
                'Color 3', 'Color 4', 'Color 5', 'Color 6', 'Color 7'];
    }

    /** Labels for font_id[0..3] slots. Override to name them. */
    fontLabels(): string[] {
        return ['Normal font', 'Selected font', 'Disabled font', 'Font 3'];
    }

    /** Labels for pixelmap_id[0..7] slots. Override to name them. */
    pixelmapLabels(): string[] {
        return ['Normal pixelmap', 'Selected pixelmap', 'Disabled pixelmap',
                'Map 3', 'Map 4', 'Map 5', 'Map 6', 'Map 7'];
    }

    /** Labels for string_id[0..1] slots. Override to name them. */
    stringLabels(): string[] {
        return ['Text string', 'String 1'];
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    protected commonFields(): PropertyField[] {
        return [
            { label: 'Widget name',   path: 'app_name',  kind: 'string' },
            { label: 'Widget ID',     path: 'id_name',   kind: 'string' },
            { label: 'Left',          path: 'size.left',   kind: 'number' },
            { label: 'Top',           path: 'size.top',    kind: 'number' },
            { label: 'Right',         path: 'size.right',  kind: 'number' },
            { label: 'Bottom',        path: 'size.bottom', kind: 'number' },
            { label: 'Visible at startup', path: 'visible_at_startup', kind: 'boolean' },
            { label: 'Accepts focus',      path: 'accepts_focus',      kind: 'boolean' },
            { label: 'Style',         path: 'style',     kind: 'style_bits' },
        ];
    }
}

// ===========================================================================
// Concrete service implementations (one per GX_TYPE_* constant)
// ===========================================================================

export class WidgetServiceBase extends WidgetService {
    getType() { return GX_TYPE_WIDGET; }
    getControlBlockName() { return 'GX_WIDGET'; }
    getShortName() { return 'widget'; }
}

export class WindowService extends WidgetService {
    getType() { return GX_TYPE_WINDOW; }
    getControlBlockName() { return 'GX_WINDOW'; }
    getShortName() { return 'window'; }
}

export class RootWindowService extends WidgetService {
    getType() { return GX_TYPE_ROOT_WINDOW; }
    getControlBlockName() { return 'GX_WINDOW'; }
    getShortName() { return 'root_window'; }
}

export class ButtonService extends WidgetService {
    getType() { return GX_TYPE_BUTTON; }
    getControlBlockName() { return 'GX_BUTTON'; }
    getShortName() { return 'button'; }
    protected typeSpecificFields() {
        return [
            { label: 'Normal color',    path: 'color_id.0', kind: 'color_id' as const },
            { label: 'Selected color',  path: 'color_id.1', kind: 'color_id' as const },
            { label: 'Disabled color',  path: 'color_id.2', kind: 'color_id' as const },
        ];
    }
}

export class TextButtonService extends WidgetService {
    getType() { return GX_TYPE_TEXT_BUTTON; }
    getControlBlockName() { return 'GX_TEXT_BUTTON'; }
    getShortName() { return 'text_button'; }
    protected typeSpecificFields() {
        return [
            { label: 'Text',           path: 'string_id.0', kind: 'string_id' as const },
            { label: 'Normal font',    path: 'font_id.0',   kind: 'font_id'   as const },
            { label: 'Normal color',   path: 'color_id.0',  kind: 'color_id'  as const },
            { label: 'Selected color', path: 'color_id.1',  kind: 'color_id'  as const },
            { label: 'Disabled color', path: 'color_id.2',  kind: 'color_id'  as const },
        ];
    }
}

export class MultiLineTextButtonService extends WidgetService {
    getType() { return GX_TYPE_MULTI_LINE_TEXT_BUTTON; }
    getControlBlockName() { return 'GX_MULTI_LINE_TEXT_BUTTON'; }
    getShortName() { return 'ml_text_button'; }
    protected typeSpecificFields() {
        return [
            { label: 'Text',           path: 'string_id.0', kind: 'string_id' as const },
            { label: 'Normal font',    path: 'font_id.0',   kind: 'font_id'   as const },
            { label: 'Normal color',   path: 'color_id.0',  kind: 'color_id'  as const },
            { label: 'Selected color', path: 'color_id.1',  kind: 'color_id'  as const },
            { label: 'Disabled color', path: 'color_id.2',  kind: 'color_id'  as const },
        ];
    }
}

export class CheckboxService extends WidgetService {
    getType() { return GX_TYPE_CHECKBOX; }
    getControlBlockName() { return 'GX_CHECKBOX'; }
    getShortName() { return 'checkbox'; }
    protected typeSpecificFields() {
        return [
            { label: 'Text',              path: 'string_id.0',  kind: 'string_id'   as const },
            { label: 'Normal font',       path: 'font_id.0',    kind: 'font_id'     as const },
            { label: 'Normal pixelmap',   path: 'pixelmap_id.0',kind: 'pixelmap_id' as const },
            { label: 'Selected pixelmap', path: 'pixelmap_id.1',kind: 'pixelmap_id' as const },
        ];
    }
}

export class RadioButtonService extends WidgetService {
    getType() { return GX_TYPE_RADIO_BUTTON; }
    getControlBlockName() { return 'GX_RADIO_BUTTON'; }
    getShortName() { return 'radio_button'; }
    protected typeSpecificFields() {
        return [
            { label: 'Text',              path: 'string_id.0',  kind: 'string_id'   as const },
            { label: 'Normal font',       path: 'font_id.0',    kind: 'font_id'     as const },
            { label: 'Off pixelmap',      path: 'pixelmap_id.0',kind: 'pixelmap_id' as const },
            { label: 'On pixelmap',       path: 'pixelmap_id.1',kind: 'pixelmap_id' as const },
        ];
    }
}

export class IconButtonService extends WidgetService {
    getType() { return GX_TYPE_ICON_BUTTON; }
    getControlBlockName() { return 'GX_ICON_BUTTON'; }
    getShortName() { return 'icon_button'; }
    protected typeSpecificFields() {
        return [
            { label: 'Normal pixelmap',   path: 'pixelmap_id.0',kind: 'pixelmap_id' as const },
        ];
    }
}

export class PixelmapButtonService extends WidgetService {
    getType() { return GX_TYPE_PIXELMAP_BUTTON; }
    getControlBlockName() { return 'GX_PIXELMAP_BUTTON'; }
    getShortName() { return 'pixelmap_button'; }
    protected typeSpecificFields() {
        return [
            { label: 'Normal pixelmap',   path: 'pixelmap_id.0',kind: 'pixelmap_id' as const },
            { label: 'Selected pixelmap', path: 'pixelmap_id.1',kind: 'pixelmap_id' as const },
            { label: 'Disabled pixelmap', path: 'pixelmap_id.2',kind: 'pixelmap_id' as const },
        ];
    }
}

export class IconService extends WidgetService {
    getType() { return GX_TYPE_ICON; }
    getControlBlockName() { return 'GX_ICON'; }
    getShortName() { return 'icon'; }
    protected typeSpecificFields() {
        return [
            { label: 'Normal pixelmap',   path: 'pixelmap_id.0',kind: 'pixelmap_id' as const },
            { label: 'Selected pixelmap', path: 'pixelmap_id.1',kind: 'pixelmap_id' as const },
        ];
    }
}

export class SpriteService extends WidgetService {
    getType() { return GX_TYPE_SPRITE; }
    getControlBlockName() { return 'GX_SPRITE'; }
    getShortName() { return 'sprite'; }
}

export class CircularGaugeService extends WidgetService {
    getType() { return GX_TYPE_CIRCULAR_GAUGE; }
    getControlBlockName() { return 'GX_CIRCULAR_GAUGE'; }
    getShortName() { return 'circular_gauge'; }
    protected typeSpecificFields() {
        return [
            { label: 'Background pixelmap', path: 'pixelmap_id.0',kind: 'pixelmap_id' as const },
            { label: 'Needle pixelmap',     path: 'pixelmap_id.1',kind: 'pixelmap_id' as const },
        ];
    }
}

export class ProgressBarService extends WidgetService {
    getType() { return GX_TYPE_PROGRESS_BAR; }
    getControlBlockName() { return 'GX_PROGRESS_BAR'; }
    getShortName() { return 'progress_bar'; }
    protected typeSpecificFields() {
        return [
            { label: 'Normal color',   path: 'color_id.0', kind: 'color_id' as const },
            { label: 'Fill color',     path: 'color_id.1', kind: 'color_id' as const },
            { label: 'Normal font',    path: 'font_id.0',  kind: 'font_id'  as const },
            { label: 'Text string',    path: 'string_id.0',kind: 'string_id' as const },
        ];
    }
}

export class RadialProgressBarService extends WidgetService {
    getType() { return GX_TYPE_RADIAL_PROGRESS_BAR; }
    getControlBlockName() { return 'GX_RADIAL_PROGRESS_BAR'; }
    getShortName() { return 'radial_progress_bar'; }
    protected typeSpecificFields() {
        return [
            { label: 'Normal font',    path: 'font_id.0',  kind: 'font_id'  as const },
            { label: 'Text string',    path: 'string_id.0',kind: 'string_id' as const },
        ];
    }
}

export class PromptService extends WidgetService {
    getType() { return GX_TYPE_PROMPT; }
    getControlBlockName() { return 'GX_PROMPT'; }
    getShortName() { return 'prompt'; }
    protected typeSpecificFields() {
        return [
            { label: 'Text',           path: 'string_id.0', kind: 'string_id' as const },
            { label: 'Normal font',    path: 'font_id.0',   kind: 'font_id'   as const },
            { label: 'Normal color',   path: 'color_id.0',  kind: 'color_id'  as const },
            { label: 'Selected color', path: 'color_id.1',  kind: 'color_id'  as const },
            { label: 'Disabled color', path: 'color_id.2',  kind: 'color_id'  as const },
            { label: 'Fill color',     path: 'color_id.3',  kind: 'color_id'  as const },
        ];
    }
}

export class NumericPromptService extends WidgetService {
    getType() { return GX_TYPE_NUMERIC_PROMPT; }
    getControlBlockName() { return 'GX_NUMERIC_PROMPT'; }
    getShortName() { return 'numeric_prompt'; }
    protected typeSpecificFields() {
        return [
            { label: 'Normal font',    path: 'font_id.0',  kind: 'font_id'  as const },
            { label: 'Normal color',   path: 'color_id.0', kind: 'color_id' as const },
        ];
    }
}

export class PixelmapPromptService extends WidgetService {
    getType() { return GX_TYPE_PIXELMAP_PROMPT; }
    getControlBlockName() { return 'GX_PIXELMAP_PROMPT'; }
    getShortName() { return 'pixelmap_prompt'; }
    protected typeSpecificFields() {
        return [
            { label: 'Text',              path: 'string_id.0',  kind: 'string_id'   as const },
            { label: 'Normal font',       path: 'font_id.0',    kind: 'font_id'     as const },
            { label: 'Left pixelmap',     path: 'pixelmap_id.0',kind: 'pixelmap_id' as const },
            { label: 'Fill pixelmap',     path: 'pixelmap_id.1',kind: 'pixelmap_id' as const },
            { label: 'Right pixelmap',    path: 'pixelmap_id.2',kind: 'pixelmap_id' as const },
            { label: 'Selected left',     path: 'pixelmap_id.3',kind: 'pixelmap_id' as const },
            { label: 'Selected fill',     path: 'pixelmap_id.4',kind: 'pixelmap_id' as const },
            { label: 'Selected right',    path: 'pixelmap_id.5',kind: 'pixelmap_id' as const },
        ];
    }
}

export class NumericPixelmapPromptService extends WidgetService {
    getType() { return GX_TYPE_NUMERIC_PIXELMAP_PROMPT; }
    getControlBlockName() { return 'GX_NUMERIC_PIXELMAP_PROMPT'; }
    getShortName() { return 'numeric_pixelmap_prompt'; }
    protected typeSpecificFields() {
        return [
            { label: 'Normal font',       path: 'font_id.0',    kind: 'font_id'     as const },
            { label: 'Left pixelmap',     path: 'pixelmap_id.0',kind: 'pixelmap_id' as const },
            { label: 'Fill pixelmap',     path: 'pixelmap_id.1',kind: 'pixelmap_id' as const },
            { label: 'Right pixelmap',    path: 'pixelmap_id.2',kind: 'pixelmap_id' as const },
        ];
    }
}

export class SingleLineTextInputService extends WidgetService {
    getType() { return GX_TYPE_SINGLE_LINE_TEXT_INPUT; }
    getControlBlockName() { return 'GX_SINGLE_LINE_TEXT_INPUT'; }
    getShortName() { return 'sl_input'; }
    protected typeSpecificFields() {
        return [
            { label: 'Text',           path: 'string_id.0', kind: 'string_id' as const },
            { label: 'Normal font',    path: 'font_id.0',   kind: 'font_id'   as const },
            { label: 'Normal color',   path: 'color_id.0',  kind: 'color_id'  as const },
            { label: 'Selected color', path: 'color_id.1',  kind: 'color_id'  as const },
            { label: 'Cursor color',   path: 'color_id.4',  kind: 'color_id'  as const },
        ];
    }
}

export class MultiLineTextInputService extends WidgetService {
    getType() { return GX_TYPE_MULTI_LINE_TEXT_INPUT; }
    getControlBlockName() { return 'GX_MULTI_LINE_TEXT_INPUT'; }
    getShortName() { return 'ml_text_input'; }
    protected typeSpecificFields() {
        return [
            { label: 'Text',           path: 'string_id.0', kind: 'string_id' as const },
            { label: 'Normal font',    path: 'font_id.0',   kind: 'font_id'   as const },
            { label: 'Normal color',   path: 'color_id.0',  kind: 'color_id'  as const },
            { label: 'Selected color', path: 'color_id.1',  kind: 'color_id'  as const },
        ];
    }
}

export class MultiLineTextViewService extends WidgetService {
    getType() { return GX_TYPE_MULTI_LINE_TEXT_VIEW; }
    getControlBlockName() { return 'GX_MULTI_LINE_TEXT_VIEW'; }
    getShortName() { return 'ml_text_view'; }
    protected typeSpecificFields() {
        return [
            { label: 'Text',           path: 'string_id.0', kind: 'string_id' as const },
            { label: 'Normal font',    path: 'font_id.0',   kind: 'font_id'   as const },
            { label: 'Normal color',   path: 'color_id.0',  kind: 'color_id'  as const },
        ];
    }
}

export class RichTextViewService extends WidgetService {
    getType() { return GX_TYPE_RICH_TEXT_VIEW; }
    getControlBlockName() { return 'GX_RICH_TEXT_VIEW'; }
    getShortName() { return 'rich_text_view'; }
    protected typeSpecificFields() {
        return [
            { label: 'Text',           path: 'string_id.0', kind: 'string_id' as const },
            { label: 'Normal font',    path: 'font_id.0',   kind: 'font_id'   as const },
            { label: 'Bold font',      path: 'font_id.1',   kind: 'font_id'   as const },
            { label: 'Italic font',    path: 'font_id.2',   kind: 'font_id'   as const },
            { label: 'Bold-italic',    path: 'font_id.3',   kind: 'font_id'   as const },
            { label: 'Normal color',   path: 'color_id.0',  kind: 'color_id'  as const },
        ];
    }
}

export class VerticalListService extends WidgetService {
    getType() { return GX_TYPE_VERTICAL_LIST; }
    getControlBlockName() { return 'GX_VERTICAL_LIST'; }
    getShortName() { return 'vertical_list'; }
}

export class HorizontalListService extends WidgetService {
    getType() { return GX_TYPE_HORIZONTAL_LIST; }
    getControlBlockName() { return 'GX_HORIZONTAL_LIST'; }
    getShortName() { return 'horizontal_list'; }
}

export class DropListService extends WidgetService {
    getType() { return GX_TYPE_DROP_LIST; }
    getControlBlockName() { return 'GX_DROP_LIST'; }
    getShortName() { return 'drop_list'; }
    protected typeSpecificFields() {
        return [
            { label: 'Background pixelmap', path: 'pixelmap_id.0',kind: 'pixelmap_id' as const },
        ];
    }
}

export class GenericScrollWheelService extends WidgetService {
    getType() { return GX_TYPE_GENERIC_SCROLL_WHEEL; }
    getControlBlockName() { return 'GX_GENERIC_SCROLL_WHEEL'; }
    getShortName() { return 'generic_scroll_wheel'; }
}

export class StringScrollWheelService extends WidgetService {
    getType() { return GX_TYPE_STRING_SCROLL_WHEEL; }
    getControlBlockName() { return 'GX_STRING_SCROLL_WHEEL'; }
    getShortName() { return 'string_scroll_wheel'; }
    protected typeSpecificFields() {
        return [
            { label: 'Normal font',        path: 'font_id.0',   kind: 'font_id'  as const },
            { label: 'Selected font',      path: 'font_id.1',   kind: 'font_id'  as const },
            { label: 'Normal color',       path: 'color_id.0',  kind: 'color_id' as const },
            { label: 'Selected color',     path: 'color_id.1',  kind: 'color_id' as const },
            { label: 'Selected fill color',path: 'color_id.4',  kind: 'color_id' as const },
        ];
    }
}

export class NumericScrollWheelService extends WidgetService {
    getType() { return GX_TYPE_NUMERIC_SCROLL_WHEEL; }
    getControlBlockName() { return 'GX_NUMERIC_SCROLL_WHEEL'; }
    getShortName() { return 'numeric_scroll_wheel'; }
    protected typeSpecificFields() {
        return [
            { label: 'Normal font',        path: 'font_id.0',   kind: 'font_id'  as const },
            { label: 'Selected font',      path: 'font_id.1',   kind: 'font_id'  as const },
            { label: 'Normal color',       path: 'color_id.0',  kind: 'color_id' as const },
            { label: 'Selected color',     path: 'color_id.1',  kind: 'color_id' as const },
        ];
    }
}

export class TemplateService extends WidgetService {
    getType() { return GX_TYPE_TEMPLATE; }
    getControlBlockName() { return 'GX_WIDGET'; }
    getShortName() { return 'template'; }
}

export class HorizontalScrollbarService extends WidgetService {
    getType() { return GX_TYPE_HORIZONTAL_SCROLL; }
    getControlBlockName() { return 'GX_SCROLLBAR'; }
    getShortName() { return 'hscroll'; }
    getResizeMode() { return RESIZE_MODE_WIDTH; }
}

export class VerticalScrollbarService extends WidgetService {
    getType() { return GX_TYPE_VERTICAL_SCROLL; }
    getControlBlockName() { return 'GX_SCROLLBAR'; }
    getShortName() { return 'vscroll'; }
    getResizeMode() { return RESIZE_MODE_HEIGHT; }
}

export class SliderService extends WidgetService {
    getType() { return GX_TYPE_SLIDER; }
    getControlBlockName() { return 'GX_SLIDER'; }
    getShortName() { return 'slider'; }
    protected typeSpecificFields() {
        return [
            { label: 'Normal color',   path: 'color_id.0', kind: 'color_id' as const },
            { label: 'Selected color', path: 'color_id.1', kind: 'color_id' as const },
        ];
    }
}

export class PixelmapSliderService extends WidgetService {
    getType() { return GX_TYPE_PIXELMAP_SLIDER; }
    getControlBlockName() { return 'GX_PIXELMAP_SLIDER'; }
    getShortName() { return 'pixelmap_slider'; }
    protected typeSpecificFields() {
        return [
            { label: 'Lower pixelmap',  path: 'pixelmap_id.0',kind: 'pixelmap_id' as const },
            { label: 'Upper pixelmap',  path: 'pixelmap_id.1',kind: 'pixelmap_id' as const },
            { label: 'Needle pixelmap', path: 'pixelmap_id.2',kind: 'pixelmap_id' as const },
        ];
    }
}

export class RadialSliderService extends WidgetService {
    getType() { return GX_TYPE_RADIAL_SLIDER; }
    getControlBlockName() { return 'GX_RADIAL_SLIDER'; }
    getShortName() { return 'radial_slider'; }
    protected typeSpecificFields() {
        return [
            { label: 'Background pixelmap', path: 'pixelmap_id.0',kind: 'pixelmap_id' as const },
            { label: 'Needle pixelmap',     path: 'pixelmap_id.1',kind: 'pixelmap_id' as const },
        ];
    }
}

export class LineChartService extends WidgetService {
    getType() { return GX_TYPE_LINE_CHART; }
    getControlBlockName() { return 'GX_LINE_CHART'; }
    getShortName() { return 'line_chart'; }
    protected typeSpecificFields() {
        return [
            { label: 'Background color', path: 'color_id.0', kind: 'color_id' as const },
            { label: 'Axis color',       path: 'color_id.1', kind: 'color_id' as const },
            { label: 'Line color',       path: 'color_id.2', kind: 'color_id' as const },
        ];
    }
}

export class MenuService extends WidgetService {
    getType() { return GX_TYPE_MENU; }
    getControlBlockName() { return 'GX_MENU'; }
    getShortName() { return 'menu'; }
    protected typeSpecificFields() {
        return [
            { label: 'Text',           path: 'string_id.0', kind: 'string_id' as const },
            { label: 'Normal font',    path: 'font_id.0',   kind: 'font_id'   as const },
            { label: 'Normal color',   path: 'color_id.0',  kind: 'color_id'  as const },
            { label: 'Fill color',     path: 'color_id.3',  kind: 'color_id'  as const },
        ];
    }
}

export class AccordionMenuService extends WidgetService {
    getType() { return GX_TYPE_ACCORDION_MENU; }
    getControlBlockName() { return 'GX_ACCORDION_MENU'; }
    getShortName() { return 'accordion_menu'; }
}

export class TreeViewService extends WidgetService {
    getType() { return GX_TYPE_TREE_VIEW; }
    getControlBlockName() { return 'GX_TREE_VIEW'; }
    getShortName() { return 'tree_view'; }
    protected typeSpecificFields() {
        return [
            { label: 'Root pixelmap',     path: 'pixelmap_id.0',kind: 'pixelmap_id' as const },
            { label: 'Expanded pixelmap', path: 'pixelmap_id.1',kind: 'pixelmap_id' as const },
            { label: 'Collapsed pixelmap',path: 'pixelmap_id.2',kind: 'pixelmap_id' as const },
        ];
    }
}
