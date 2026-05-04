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
import { RESIZE_MODE_ALL, RESIZE_MODE_HEIGHT, RESIZE_MODE_WIDTH } from '../common/gx-types';
import { WidgetInfo, FolderInfo } from '../common/widget-info';
import { GxRectangle } from '../common/widget-info';
export { RESIZE_MODE_ALL, RESIZE_MODE_HEIGHT, RESIZE_MODE_WIDTH };
export type PropertyFieldKind = 'string' | 'number' | 'boolean' | 'color_id' | 'font_id' | 'pixelmap_id' | 'string_id' | 'style_bits' | 'enum';
export interface PropertyField {
    /** Display label in the property panel. */
    label: string;
    /** JSON key path on WidgetInfo (dotted, e.g. "size.left", "color_id.0"). */
    path: string;
    kind: PropertyFieldKind;
    /** For 'enum' kind — maps numeric value → display name. */
    enumValues?: ReadonlyArray<{
        value: number;
        label: string;
    }>;
    /** For 'style_bits' kind — the bitmask for this single bit field. */
    bitMask?: number;
    readOnly?: boolean;
}
export declare abstract class WidgetService {
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
    createDefault(parent?: WidgetInfo | FolderInfo): WidgetInfo;
    /**
     * Return the ordered list of property fields the panel should display.
     * Common fields (name, position, size, style, colors…) are prepended
     * by the base implementation; subclasses add type-specific fields.
     */
    getPropertyFields(): PropertyField[];
    /** Override to add type-specific fields after the common ones. */
    protected typeSpecificFields(): PropertyField[];
    /**
     * Resize mode reported to the canvas snap engine.
     * Default: allow resize in all directions.
     */
    getResizeMode(): number;
    /**
     * Return the default bounding rectangle for a new widget of this type
     * placed in a 320x240 display with its top-left at (10,10).
     */
    getDefaultRect(): GxRectangle;
    /** Labels for color_id[0..7] slots. Override to name them. */
    colorLabels(): string[];
    /** Labels for font_id[0..3] slots. Override to name them. */
    fontLabels(): string[];
    /** Labels for pixelmap_id[0..7] slots. Override to name them. */
    pixelmapLabels(): string[];
    /** Labels for string_id[0..1] slots. Override to name them. */
    stringLabels(): string[];
    protected commonFields(): PropertyField[];
}
export declare class WidgetServiceBase extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
}
export declare class WindowService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
}
export declare class RootWindowService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
}
export declare class ButtonService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): {
        label: string;
        path: string;
        kind: "color_id";
    }[];
}
export declare class TextButtonService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "string_id";
    } | {
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "color_id";
    })[];
}
export declare class MultiLineTextButtonService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "string_id";
    } | {
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "color_id";
    })[];
}
export declare class CheckboxService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "string_id";
    } | {
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "pixelmap_id";
    })[];
}
export declare class RadioButtonService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "string_id";
    } | {
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "pixelmap_id";
    })[];
}
export declare class IconButtonService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): {
        label: string;
        path: string;
        kind: "pixelmap_id";
    }[];
}
export declare class PixelmapButtonService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): {
        label: string;
        path: string;
        kind: "pixelmap_id";
    }[];
}
export declare class IconService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): {
        label: string;
        path: string;
        kind: "pixelmap_id";
    }[];
}
export declare class SpriteService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
}
export declare class CircularGaugeService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): {
        label: string;
        path: string;
        kind: "pixelmap_id";
    }[];
}
export declare class ProgressBarService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "color_id";
    } | {
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "string_id";
    })[];
}
export declare class RadialProgressBarService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "string_id";
    })[];
}
export declare class PromptService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "string_id";
    } | {
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "color_id";
    })[];
}
export declare class NumericPromptService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "color_id";
    })[];
}
export declare class PixelmapPromptService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "string_id";
    } | {
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "pixelmap_id";
    })[];
}
export declare class NumericPixelmapPromptService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "pixelmap_id";
    })[];
}
export declare class SingleLineTextInputService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "string_id";
    } | {
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "color_id";
    })[];
}
export declare class MultiLineTextInputService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "string_id";
    } | {
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "color_id";
    })[];
}
export declare class MultiLineTextViewService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "string_id";
    } | {
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "color_id";
    })[];
}
export declare class RichTextViewService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "string_id";
    } | {
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "color_id";
    })[];
}
export declare class VerticalListService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
}
export declare class HorizontalListService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
}
export declare class DropListService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): {
        label: string;
        path: string;
        kind: "pixelmap_id";
    }[];
}
export declare class GenericScrollWheelService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
}
export declare class StringScrollWheelService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "color_id";
    })[];
}
export declare class NumericScrollWheelService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "color_id";
    })[];
}
export declare class TemplateService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
}
export declare class HorizontalScrollbarService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    getResizeMode(): number;
}
export declare class VerticalScrollbarService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    getResizeMode(): number;
}
export declare class SliderService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): {
        label: string;
        path: string;
        kind: "color_id";
    }[];
}
export declare class PixelmapSliderService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): {
        label: string;
        path: string;
        kind: "pixelmap_id";
    }[];
}
export declare class RadialSliderService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): {
        label: string;
        path: string;
        kind: "pixelmap_id";
    }[];
}
export declare class LineChartService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): {
        label: string;
        path: string;
        kind: "color_id";
    }[];
}
export declare class MenuService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): ({
        label: string;
        path: string;
        kind: "string_id";
    } | {
        label: string;
        path: string;
        kind: "font_id";
    } | {
        label: string;
        path: string;
        kind: "color_id";
    })[];
}
export declare class AccordionMenuService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
}
export declare class TreeViewService extends WidgetService {
    getType(): number;
    getControlBlockName(): string;
    getShortName(): string;
    protected typeSpecificFields(): {
        label: string;
        path: string;
        kind: "pixelmap_id";
    }[];
}
//# sourceMappingURL=widget-service.d.ts.map