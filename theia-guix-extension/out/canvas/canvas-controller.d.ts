/**
 * CanvasController — design-surface rendering and interaction.
 *
 * Ports target_screen.cpp and target_view.cpp to TypeScript / HTML Canvas 2D.
 *
 * Responsibilities:
 *  - Render widget tree (flat boxes with per-type colours)
 *  - Draw grid, selection outlines, snap guides, selection handles
 *  - Handle pointer events → widget hit-test → drag/resize
 *  - Animate selection dashes (500 ms timer, matching C++ SelectBoxDraw pattern)
 *  - Emit events consumed by extension.ts to update the project model
 *
 * All internal coordinates are canvas pixels (zoom-independent).
 * Screen coordinates are scaled by `zoomScale / 100`.
 */
import 'reflect-metadata';
import { SnapEngine } from './snap-engine';
import { SelectionManager } from './selection-manager';
import type { GxRectangle, WidgetInfo } from '../common/widget-info';
import type { DisplayInfo } from '../common/project-model';
export interface WidgetMoveEvent {
    type: 'widgetMove';
    widget: WidgetInfo;
    newRect: GxRectangle;
}
export interface WidgetResizeEvent {
    type: 'widgetResize';
    widget: WidgetInfo;
    newRect: GxRectangle;
}
export interface SelectionChangeEvent {
    type: 'selectionChange';
    selected: WidgetInfo[];
}
export type CanvasEvent = WidgetMoveEvent | WidgetResizeEvent | SelectionChangeEvent;
export type CanvasEventListener = (event: CanvasEvent) => void;
export declare class CanvasController {
    private readonly snapEngine;
    private readonly selection;
    private canvas;
    private ctx;
    private display;
    private allWidgets;
    private zoomScale;
    private panX;
    private panY;
    private dashPattern;
    private blinkTimer;
    private dragMode;
    private dragStart;
    private dragTarget;
    private readonly listeners;
    constructor(snapEngine: SnapEngine, selection: SelectionManager);
    /** Attach the controller to an HTML canvas element. */
    mount(canvas: HTMLCanvasElement): void;
    /** Detach from the canvas and release all resources. */
    unmount(): void;
    /** Load a display's widget tree into the canvas. */
    loadDisplay(display: DisplayInfo): void;
    setZoom(percent: number): void;
    on(listener: CanvasEventListener): void;
    off(listener: CanvasEventListener): void;
    /** Called by the extension when a project model update arrives (e.g. undo). */
    refresh(display: DisplayInfo): void;
    private resetSize;
    /** Convert screen (canvas-element) coordinates to canvas (model) coordinates. */
    private toCanvas;
    /** Convert canvas (model) coordinate to screen coordinate. */
    private toScreen;
    private scaleToScreen;
    private render;
    private drawGrid;
    private drawWidget;
    private drawSelectionOverlay;
    /** Build an 8-element [on, off] dash sequence from the rotating bit pattern. */
    private buildLineDash;
    private drawHandles;
    private onBlink;
    /**
     * Find the topmost (last drawn) widget at canvas coordinate (cx, cy).
     * Mirrors `_gx_system_top_widget_find()` — descends depth-first, returns
     * last leaf that contains the point (children are painted over parents).
     */
    private hitTest;
    private readonly onPointerDown;
    private readonly onPointerMove;
    private readonly onPointerUp;
    private emit;
}
//# sourceMappingURL=canvas-controller.d.ts.map