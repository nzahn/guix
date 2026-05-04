/**
 * SnapEngine — snap-to-grid and snap-to-widget logic.
 *
 * Ports CalSnap2GridDelta(), CalSnap2WidgetDelta(), and Snap2Widget()
 * from target_screen.cpp.
 *
 * All coordinates are in canvas pixels (zoom-independent).
 */
import 'reflect-metadata';
import type { GxRectangle } from '../common/widget-info';
export declare const enum SnapLineDirection {
    Horizontal = 0,
    Vertical = 1
}
/** A visible guide line drawn during drag. */
export interface SnapLine {
    direction: SnapLineDirection;
    /** Canvas coordinate (x for vertical line, y for horizontal line). */
    position: number;
}
export interface SnapResult {
    deltaX: number;
    deltaY: number;
    snapLines: SnapLine[];
}
export declare class SnapEngine {
    /**
     * Adjust `delta` so that `value + delta` snaps to the nearest grid line.
     * Mirrors `target_screen::CalSnap2GridDelta()`.
     *
     * @param value    Current coordinate value (widget edge).
     * @param delta    Proposed movement delta (modified in place logically).
     * @param spacing  Grid spacing in pixels.
     * @returns        Adjusted delta.
     */
    snapToGrid(value: number, delta: number, spacing: number): number;
    /**
     * Compute the snapped dx/dy and the set of visual snap lines.
     * Mirrors `target_screen::CalSnapDelta()` for a single selected widget.
     *
     * @param selected     Bounding box of the widget being dragged (pre-delta).
     * @param siblings     Peer widgets (including parent) to snap against.
     * @param deltaX       Raw horizontal movement delta.
     * @param deltaY       Raw vertical movement delta.
     * @param snapSpacing  Maximum snap attraction distance (pixels).
     */
    snap(selected: GxRectangle, siblings: GxRectangle[], deltaX: number, deltaY: number, snapSpacing: number): SnapResult;
    /**
     * Single-axis snap. Mirrors `CalSnap2WidgetDelta()`.
     *
     * @param axis  0 = horizontal (X), 1 = vertical (Y).
     */
    private snapAxis;
    /**
     * Return the three snap edge values (start, center, end) for one axis.
     * Mirrors the "snap line types" concept from Snap2Widget().
     */
    private getEdges;
}
//# sourceMappingURL=snap-engine.d.ts.map