/**
 * SelectionManager — tracks selected widgets and computes drag/resize mode.
 *
 * Ports the SelectedWidgets array, CheckResizeCursor(), UpdateWidgetSize(),
 * ShiftSelectedWidgets(), and IsWidgetSelected() logic from target_screen.cpp.
 *
 * All coordinates are canvas pixels (zoom-independent).
 */

import { injectable } from 'inversify';
import 'reflect-metadata';

import type { GxRectangle, WidgetInfo } from '../common/widget-info';

// ---------------------------------------------------------------------------
// Constants (mirrors target_screen.cpp #defines)
// ---------------------------------------------------------------------------

/** Half-width of the resize handle hit zone in canvas pixels. */
export const SELECT_HANDLE_SIZE = 5;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export const enum DragMode {
    None         = 0,
    TopLeft      = 1,
    Top          = 2,
    TopRight     = 3,
    Right        = 4,
    BottomRight  = 5,
    Bottom       = 6,
    BottomLeft   = 7,
    Left         = 8,
    All          = 9,   // move (entire widget)
}

/** CSS cursor name for a drag mode. */
export function cursorForDragMode(mode: DragMode): string {
    switch (mode) {
        case DragMode.TopLeft:     return 'nw-resize';
        case DragMode.Top:         return 'n-resize';
        case DragMode.TopRight:    return 'ne-resize';
        case DragMode.Right:       return 'e-resize';
        case DragMode.BottomRight: return 'se-resize';
        case DragMode.Bottom:      return 's-resize';
        case DragMode.BottomLeft:  return 'sw-resize';
        case DragMode.Left:        return 'w-resize';
        case DragMode.All:         return 'move';
        default:                   return 'default';
    }
}

// ---------------------------------------------------------------------------
// SelectionManager
// ---------------------------------------------------------------------------

@injectable()
export class SelectionManager {

    private readonly _selected: WidgetInfo[] = [];

    // -------------------------------------------------------------------------
    // Selection state
    // -------------------------------------------------------------------------

    get selection(): ReadonlyArray<WidgetInfo> {
        return this._selected;
    }

    isSelected(widget: WidgetInfo): boolean {
        return this._selected.includes(widget);
    }

    /** Replace the entire selection. */
    setSelection(widgets: WidgetInfo[]): void {
        this._selected.length = 0;
        this._selected.push(...widgets);
    }

    /** Select a single widget; optionally add to existing selection. */
    selectWidget(widget: WidgetInfo, additive: boolean): void {
        if (!additive) {
            this._selected.length = 0;
        }
        if (!this._selected.includes(widget)) {
            this._selected.push(widget);
        }
    }

    deselect(widget: WidgetInfo): void {
        const idx = this._selected.indexOf(widget);
        if (idx !== -1) this._selected.splice(idx, 1);
    }

    clearSelection(): void {
        this._selected.length = 0;
    }

    // -------------------------------------------------------------------------
    // Resize-handle hit-testing (mirrors CheckResizeCursor())
    // -------------------------------------------------------------------------

    /**
     * Determine the drag mode for a canvas point against the primary selected
     * widget.  Returns `DragMode.None` if the point is not on any handle.
     *
     * @param canvasPoint  Point in canvas coordinates.
     */
    hitTestHandle(canvasPoint: { x: number; y: number }): DragMode {
        if (this._selected.length === 0) return DragMode.None;

        // Use the first (primary) selected widget
        const widget = this._selected[0];
        const inner  = widget.size;
        const outer  = expandRect(inner, SELECT_HANDLE_SIZE);

        if (!pointInRect(canvasPoint, outer)) return DragMode.None;
        if (pointInRect(canvasPoint, inner))  return DragMode.None;

        const { x, y } = canvasPoint;

        if (y < inner.top) {
            if (x < inner.left)  return DragMode.TopLeft;
            if (x > inner.right) return DragMode.TopRight;
            return DragMode.Top;
        }
        if (y > inner.bottom) {
            if (x < inner.left)  return DragMode.BottomLeft;
            if (x > inner.right) return DragMode.BottomRight;
            return DragMode.Bottom;
        }
        // y is inside [inner.top, inner.bottom]
        if (x < inner.left)  return DragMode.Left;
        return DragMode.Right;
    }

    // -------------------------------------------------------------------------
    // Rectangle mutation (mirrors UpdateWidgetSize())
    // -------------------------------------------------------------------------

    /**
     * Return a new `GxRectangle` for a widget being resized.
     *
     * @param rect      Current widget bounding box (immutable).
     * @param mode      Drag mode (corner or edge).
     * @param deltaX    Horizontal movement delta (in canvas pixels).
     * @param deltaY    Vertical movement delta (in canvas pixels).
     */
    applyResize(
        rect:   GxRectangle,
        mode:   DragMode,
        deltaX: number,
        deltaY: number,
    ): GxRectangle {
        const r = { ...rect };

        switch (mode) {
            case DragMode.TopLeft:
                r.left += deltaX;
                r.top  += deltaY;
                break;
            case DragMode.Top:
                r.top  += deltaY;
                break;
            case DragMode.TopRight:
                r.right += deltaX;
                r.top   += deltaY;
                break;
            case DragMode.Right:
                r.right += deltaX;
                break;
            case DragMode.BottomRight:
                r.right  += deltaX;
                r.bottom += deltaY;
                break;
            case DragMode.Bottom:
                r.bottom += deltaY;
                break;
            case DragMode.BottomLeft:
                r.left   += deltaX;
                r.bottom += deltaY;
                break;
            case DragMode.Left:
                r.left += deltaX;
                break;
            default:
                break;
        }

        return r;
    }

    /**
     * Shift all selected widgets by (deltaX, deltaY).
     * Returns a map of widget → new bounding box (does NOT mutate WidgetInfo).
     */
    computeMoveDeltas(deltaX: number, deltaY: number): Map<WidgetInfo, GxRectangle> {
        const result = new Map<WidgetInfo, GxRectangle>();
        for (const w of this._selected) {
            result.set(w, {
                left:   w.size.left   + deltaX,
                top:    w.size.top    + deltaY,
                right:  w.size.right  + deltaX,
                bottom: w.size.bottom + deltaY,
            });
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // Selection rectangle (bounding box of all selected widgets)
    // -------------------------------------------------------------------------

    selectionBounds(): GxRectangle | null {
        if (this._selected.length === 0) return null;

        let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity;
        for (const w of this._selected) {
            minL = Math.min(minL, w.size.left);
            minT = Math.min(minT, w.size.top);
            maxR = Math.max(maxR, w.size.right);
            maxB = Math.max(maxB, w.size.bottom);
        }
        return { left: minL, top: minT, right: maxR, bottom: maxB };
    }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function expandRect(r: GxRectangle, by: number): GxRectangle {
    return { left: r.left - by, top: r.top - by, right: r.right + by, bottom: r.bottom + by };
}

function pointInRect(p: { x: number; y: number }, r: GxRectangle): boolean {
    return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}
