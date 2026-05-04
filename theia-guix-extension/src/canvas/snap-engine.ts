/**
 * SnapEngine — snap-to-grid and snap-to-widget logic.
 *
 * Ports CalSnap2GridDelta(), CalSnap2WidgetDelta(), and Snap2Widget()
 * from target_screen.cpp.
 *
 * All coordinates are in canvas pixels (zoom-independent).
 */

import { injectable } from 'inversify';
import 'reflect-metadata';

import type { GxRectangle } from '../common/widget-info';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export const enum SnapLineDirection {
    Horizontal = 0,
    Vertical   = 1,
}

/** A visible guide line drawn during drag. */
export interface SnapLine {
    direction: SnapLineDirection;
    /** Canvas coordinate (x for vertical line, y for horizontal line). */
    position:  number;
}

export interface SnapResult {
    deltaX: number;
    deltaY: number;
    snapLines: SnapLine[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rectWidth(r: GxRectangle): number  { return r.right  - r.left + 1; }
function rectHeight(r: GxRectangle): number { return r.bottom - r.top  + 1; }

function shiftRect(r: GxRectangle, dx: number, dy: number): GxRectangle {
    return { left: r.left + dx, top: r.top + dy, right: r.right + dx, bottom: r.bottom + dy };
}

// ---------------------------------------------------------------------------
// SnapEngine
// ---------------------------------------------------------------------------

@injectable()
export class SnapEngine {

    // -------------------------------------------------------------------------
    // Grid snap
    // -------------------------------------------------------------------------

    /**
     * Adjust `delta` so that `value + delta` snaps to the nearest grid line.
     * Mirrors `target_screen::CalSnap2GridDelta()`.
     *
     * @param value    Current coordinate value (widget edge).
     * @param delta    Proposed movement delta (modified in place logically).
     * @param spacing  Grid spacing in pixels.
     * @returns        Adjusted delta.
     */
    snapToGrid(value: number, delta: number, spacing: number): number {
        if (delta === 0 || spacing <= 0) return delta;

        const newPos      = value + delta;
        const dist        = newPos % spacing;
        const halfSpacing = Math.floor(spacing / 2);
        let snapDist      = 0;

        if (dist !== 0) {
            if (Math.abs(dist) < halfSpacing) {
                // Closer to the previous grid line — snap back
                snapDist = -dist;
            } else {
                // Closer to the next grid line — snap forward
                const sign = dist < 0 ? -1 : 1;
                snapDist   = spacing * sign - dist;
            }
        }

        return delta + snapDist;
    }

    // -------------------------------------------------------------------------
    // Widget snap (full two-axis calculation)
    // -------------------------------------------------------------------------

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
    snap(
        selected:    GxRectangle,
        siblings:    GxRectangle[],
        deltaX:      number,
        deltaY:      number,
        snapSpacing: number,
    ): SnapResult {
        const lines: SnapLine[] = [];

        const adjX = this.snapAxis(
            selected, siblings, deltaX, 0, snapSpacing, lines
        );
        const adjY = this.snapAxis(
            selected, siblings, deltaY, 1, snapSpacing, lines
        );

        return { deltaX: adjX, deltaY: adjY, snapLines: lines };
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Single-axis snap. Mirrors `CalSnap2WidgetDelta()`.
     *
     * @param axis  0 = horizontal (X), 1 = vertical (Y).
     */
    private snapAxis(
        selected:    GxRectangle,
        siblings:    GxRectangle[],
        delta:       number,
        axis:        0 | 1,
        maxDist:     number,
        outLines:    SnapLine[],
    ): number {
        const candidate = axis === 0
            ? shiftRect(selected, delta, 0)
            : shiftRect(selected, 0, delta);

        let bestDist = maxDist + 1; // larger than any valid snap
        let bestSnap = 0;

        for (const target of siblings) {
            const srcEdges    = this.getEdges(candidate, axis);
            const targetEdges = this.getEdges(target, axis);

            for (const srcVal of srcEdges) {
                for (const tgtVal of targetEdges) {
                    const dist = tgtVal - srcVal;
                    if (Math.abs(dist) < Math.abs(bestDist)) {
                        bestDist = dist;
                        bestSnap = dist;
                    }
                }
            }
        }

        if (Math.abs(bestDist) <= maxDist) {
            // Build snap lines
            const snappedRect = axis === 0
                ? shiftRect(candidate, bestSnap, 0)
                : shiftRect(candidate, 0, bestSnap);

            for (const target of siblings) {
                const srcEdges    = this.getEdges(snappedRect, axis);
                const targetEdges = this.getEdges(target, axis);

                for (const srcVal of srcEdges) {
                    for (const tgtVal of targetEdges) {
                        if (srcVal === tgtVal) {
                            outLines.push({
                                direction: axis === 0
                                    ? SnapLineDirection.Vertical
                                    : SnapLineDirection.Horizontal,
                                position: srcVal,
                            });
                        }
                    }
                }
            }

            return delta + bestSnap;
        }

        return delta;
    }

    /**
     * Return the three snap edge values (start, center, end) for one axis.
     * Mirrors the "snap line types" concept from Snap2Widget().
     */
    private getEdges(rect: GxRectangle, axis: 0 | 1): [number, number, number] {
        if (axis === 0) {
            const w = rectWidth(rect);
            return [rect.left, rect.left + Math.floor(w / 2), rect.right];
        } else {
            const h = rectHeight(rect);
            return [rect.top, rect.top + Math.floor(h / 2), rect.bottom];
        }
    }
}
