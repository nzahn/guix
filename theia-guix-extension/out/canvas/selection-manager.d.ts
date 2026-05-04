/**
 * SelectionManager — tracks selected widgets and computes drag/resize mode.
 *
 * Ports the SelectedWidgets array, CheckResizeCursor(), UpdateWidgetSize(),
 * ShiftSelectedWidgets(), and IsWidgetSelected() logic from target_screen.cpp.
 *
 * All coordinates are canvas pixels (zoom-independent).
 */
import 'reflect-metadata';
import type { GxRectangle, WidgetInfo } from '../common/widget-info';
/** Half-width of the resize handle hit zone in canvas pixels. */
export declare const SELECT_HANDLE_SIZE = 5;
export declare const enum DragMode {
    None = 0,
    TopLeft = 1,
    Top = 2,
    TopRight = 3,
    Right = 4,
    BottomRight = 5,
    Bottom = 6,
    BottomLeft = 7,
    Left = 8,
    All = 9
}
/** CSS cursor name for a drag mode. */
export declare function cursorForDragMode(mode: DragMode): string;
export declare class SelectionManager {
    private readonly _selected;
    get selection(): ReadonlyArray<WidgetInfo>;
    isSelected(widget: WidgetInfo): boolean;
    /** Replace the entire selection. */
    setSelection(widgets: WidgetInfo[]): void;
    /** Select a single widget; optionally add to existing selection. */
    selectWidget(widget: WidgetInfo, additive: boolean): void;
    deselect(widget: WidgetInfo): void;
    clearSelection(): void;
    /**
     * Determine the drag mode for a canvas point against the primary selected
     * widget.  Returns `DragMode.None` if the point is not on any handle.
     *
     * @param canvasPoint  Point in canvas coordinates.
     */
    hitTestHandle(canvasPoint: {
        x: number;
        y: number;
    }): DragMode;
    /**
     * Return a new `GxRectangle` for a widget being resized.
     *
     * @param rect      Current widget bounding box (immutable).
     * @param mode      Drag mode (corner or edge).
     * @param deltaX    Horizontal movement delta (in canvas pixels).
     * @param deltaY    Vertical movement delta (in canvas pixels).
     */
    applyResize(rect: GxRectangle, mode: DragMode, deltaX: number, deltaY: number): GxRectangle;
    /**
     * Shift all selected widgets by (deltaX, deltaY).
     * Returns a map of widget → new bounding box (does NOT mutate WidgetInfo).
     */
    computeMoveDeltas(deltaX: number, deltaY: number): Map<WidgetInfo, GxRectangle>;
    selectionBounds(): GxRectangle | null;
}
//# sourceMappingURL=selection-manager.d.ts.map