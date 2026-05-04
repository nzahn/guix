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

import { injectable, inject } from 'inversify';
import 'reflect-metadata';

import { SnapEngine } from './snap-engine';
import {
    SelectionManager,
    DragMode,
    cursorForDragMode,
    SELECT_HANDLE_SIZE,
} from './selection-manager';
import { drawWidget as drawWidgetByType } from './widget-renderer';
import type { GxRectangle, WidgetInfo, FolderInfo } from '../common/widget-info';
import type { DisplayInfo } from '../common/project-model';
import {
    GX_SCREEN_ROTATION_CW,
    GX_SCREEN_ROTATION_CCW,
} from '../common/gx-types';

// ---------------------------------------------------------------------------
// DI tokens (avoid circular import — use Symbol literals here)
// ---------------------------------------------------------------------------

const SnapEngineToken       = Symbol.for('SnapEngine');
const SelectionManagerToken = Symbol.for('SelectionManager');

// ---------------------------------------------------------------------------
// Constants (mirrors target_screen.cpp #defines)
// ---------------------------------------------------------------------------

/** Animated selection dash pattern — 32-bit rotation (C++ select_pattern). */
const INITIAL_DASH_PATTERN = 0b11001100110011001100110011001100;

/** Selection blink interval in ms (C++ SetTimer(1, 500, ...)). */
const BLINK_INTERVAL_MS = 500;

/** Minimum widget dimension after resize. */
const MIN_WIDGET_SIZE = 4;

// ---------------------------------------------------------------------------
// Event types emitted by the controller
// ---------------------------------------------------------------------------

export interface WidgetMoveEvent {
    type:   'widgetMove';
    widget: WidgetInfo;
    newRect: GxRectangle;
}

export interface WidgetResizeEvent {
    type:    'widgetResize';
    widget:  WidgetInfo;
    newRect: GxRectangle;
}

export interface SelectionChangeEvent {
    type:      'selectionChange';
    selected:  WidgetInfo[];
}

export type CanvasEvent = WidgetMoveEvent | WidgetResizeEvent | SelectionChangeEvent;

export type CanvasEventListener = (event: CanvasEvent) => void;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rectWidth(r: GxRectangle):  number { return r.right  - r.left + 1; }
function rectHeight(r: GxRectangle): number { return r.bottom - r.top  + 1; }

function pointInRect(px: number, py: number, r: GxRectangle): boolean {
    return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
}

/** Collect all WidgetInfo leaves (pre-order DFS). */
function collectWidgets(folders: FolderInfo[]): WidgetInfo[] {
    const result: WidgetInfo[] = [];
    function walk(w: WidgetInfo): void {
        result.push(w);
        for (const c of w.children) walk(c);
    }
    for (const f of folders) {
        for (const w of f.widgets) walk(w);
    }
    return result;
}

// ---------------------------------------------------------------------------
// CanvasController
// ---------------------------------------------------------------------------

@injectable()
export class CanvasController {

    private canvas!: HTMLCanvasElement;
    private ctx!:    CanvasRenderingContext2D;

    private display: DisplayInfo | null   = null;
    private allWidgets: WidgetInfo[]      = [];

    private zoomScale = 100;          // percent (100 = 1:1)
    private panX      = 0;            // canvas-space scroll offset X
    private panY      = 0;            // canvas-space scroll offset Y

    private dashPattern  = INITIAL_DASH_PATTERN;
    private blinkTimer   = 0;

    // Drag state
    private dragMode:   DragMode = DragMode.None;
    private dragStart:  { x: number; y: number } = { x: 0, y: 0 };
    private dragTarget: WidgetInfo | null = null;

    private readonly listeners = new Set<CanvasEventListener>();

    constructor(
        @inject(SnapEngineToken)       private readonly snapEngine: SnapEngine,
        @inject(SelectionManagerToken) private readonly selection:  SelectionManager,
    ) {}

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /** Attach the controller to an HTML canvas element. */
    mount(canvas: HTMLCanvasElement): void {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot get 2D rendering context.');
        this.ctx = ctx;

        canvas.addEventListener('pointerdown',  this.onPointerDown);
        canvas.addEventListener('pointermove',  this.onPointerMove);
        canvas.addEventListener('pointerup',    this.onPointerUp);
        canvas.addEventListener('pointerleave', this.onPointerUp);

        this.blinkTimer = window.setInterval(() => this.onBlink(), BLINK_INTERVAL_MS);
    }

    /** Detach from the canvas and release all resources. */
    unmount(): void {
        if (this.canvas) {
            this.canvas.removeEventListener('pointerdown',  this.onPointerDown);
            this.canvas.removeEventListener('pointermove',  this.onPointerMove);
            this.canvas.removeEventListener('pointerup',    this.onPointerUp);
            this.canvas.removeEventListener('pointerleave', this.onPointerUp);
        }
        window.clearInterval(this.blinkTimer);
    }

    /** Load a display's widget tree into the canvas. */
    loadDisplay(display: DisplayInfo): void {
        this.display      = display;
        this.allWidgets   = collectWidgets(display.folders);
        this.selection.clearSelection();
        this.resetSize();
        this.render();
    }

    setZoom(percent: number): void {
        this.zoomScale = Math.max(25, Math.min(400, percent));
        this.resetSize();
        this.render();
    }

    on(listener: CanvasEventListener): void  { this.listeners.add(listener); }
    off(listener: CanvasEventListener): void { this.listeners.delete(listener); }

    /** Called by the extension when a project model update arrives (e.g. undo). */
    refresh(display: DisplayInfo): void {
        this.loadDisplay(display);
    }

    // -------------------------------------------------------------------------
    // Size / coordinate helpers
    // -------------------------------------------------------------------------

    private resetSize(): void {
        if (!this.display) return;
        const d    = this.display;
        let cw     = d.xres;
        let ch     = d.yres;
        if (d.rotation_angle === GX_SCREEN_ROTATION_CW ||
            d.rotation_angle === GX_SCREEN_ROTATION_CCW) {
            [cw, ch] = [ch, cw];
        }
        this.canvas.width  = Math.round(cw * this.zoomScale / 100);
        this.canvas.height = Math.round(ch * this.zoomScale / 100);
    }

    /** Convert screen (canvas-element) coordinates to canvas (model) coordinates. */
    private toCanvas(sx: number, sy: number): { x: number; y: number } {
        return {
            x: Math.round(sx * 100 / this.zoomScale) + this.panX,
            y: Math.round(sy * 100 / this.zoomScale) + this.panY,
        };
    }

    /** Convert canvas (model) coordinate to screen coordinate. */
    private toScreen(cx: number, cy: number): { x: number; y: number } {
        return {
            x: Math.round((cx - this.panX) * this.zoomScale / 100),
            y: Math.round((cy - this.panY) * this.zoomScale / 100),
        };
    }

    private scaleToScreen(v: number): number {
        return Math.round(v * this.zoomScale / 100);
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    private render(): void {
        const { canvas, ctx } = this;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!this.display) return;

        // 1. Background
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. Display background (canvas area)
        const dispW = this.scaleToScreen(this.display.xres);
        const dispH = this.scaleToScreen(this.display.yres);
        ctx.fillStyle = '#2d2d2d';
        ctx.fillRect(0, 0, dispW, dispH);

        // 3. Grid (if enabled)
        this.drawGrid();

        // 4. Widgets (z-order — paint pre-order; children on top of parents)
        for (const folder of this.display.folders) {
            for (const root of folder.widgets) {
                this.drawWidget(root);
            }
        }

        // 5. Selection outlines + handles
        this.drawSelectionOverlay();
    }

    private drawGrid(): void {
        if (!this.display) return;
        // Grid is drawn by the host page using CSS grid overlay;
        // here we draw the faint canvas-space lines directly.
        const spacing = 20; // default visual grid; project grid separate
        const { ctx } = this;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth   = 1;

        const w = this.scaleToScreen(this.display.xres);
        const h = this.scaleToScreen(this.display.yres);
        const step = this.scaleToScreen(spacing);
        if (step < 4) { ctx.restore(); return; } // too dense to draw

        ctx.beginPath();
        for (let x = 0; x <= w; x += step) {
            const sx = Math.round(x) + 0.5;
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, h);
        }
        for (let y = 0; y <= h; y += step) {
            const sy = Math.round(y) + 0.5;
            ctx.moveTo(0, sy);
            ctx.lineTo(w, sy);
        }
        ctx.stroke();
        ctx.restore();
    }

    private drawWidget(w: WidgetInfo): void {
        const { ctx } = this;
        const tl = this.toScreen(w.size.left,  w.size.top);
        const br = this.toScreen(w.size.right,  w.size.bottom);
        const sw = br.x - tl.x;
        const sh = br.y - tl.y;

        drawWidgetByType(ctx, tl.x, tl.y, sw, sh, w);

        // Children (paint on top of parent)
        for (const child of w.children) {
            this.drawWidget(child);
        }
    }

    private drawSelectionOverlay(): void {
        const { ctx } = this;

        for (const w of this.selection.selection) {
            const tl = this.toScreen(w.size.left,   w.size.top);
            const br = this.toScreen(w.size.right,  w.size.bottom);
            const sw = br.x - tl.x;
            const sh = br.y - tl.y;

            // Animated dashed selection outline
            ctx.save();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 1;
            ctx.setLineDash(this.buildLineDash());
            ctx.strokeRect(tl.x + 0.5, tl.y + 0.5, sw - 1, sh - 1);
            ctx.restore();

            // Resize handles (8 squares at corners + edges)
            this.drawHandles(tl.x, tl.y, sw, sh);
        }
    }

    /** Build an 8-element [on, off] dash sequence from the rotating bit pattern. */
    private buildLineDash(): number[] {
        // Extract highest 8 bits to determine on/off sequence (4 on, 4 off)
        const on  = ((this.dashPattern >>> 28) & 0xF) > 7 ? 4 : 4;
        const off = 4;
        return [on, off];
    }

    private drawHandles(x: number, y: number, w: number, h: number): void {
        const { ctx } = this;
        const hs = Math.max(4, this.scaleToScreen(SELECT_HANDLE_SIZE));

        const positions: Array<[number, number]> = [
            [x,           y          ],  // TL
            [x + w / 2,   y          ],  // T
            [x + w,       y          ],  // TR
            [x + w,       y + h / 2  ],  // R
            [x + w,       y + h      ],  // BR
            [x + w / 2,   y + h      ],  // B
            [x,           y + h      ],  // BL
            [x,           y + h / 2  ],  // L
        ];

        ctx.save();
        ctx.fillStyle   = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth   = 1;

        for (const [hx, hy] of positions) {
            ctx.fillRect(  hx - hs / 2, hy - hs / 2, hs, hs);
            ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
        }
        ctx.restore();
    }

    // -------------------------------------------------------------------------
    // Selection blink animation
    // -------------------------------------------------------------------------

    private onBlink(): void {
        if (this.selection.selection.length === 0) return;

        // Rotate 2 bits right (matches C++ `select_pattern >>= 2` with wrap)
        const temp           = this.dashPattern & 0x03;
        this.dashPattern   = (this.dashPattern >>> 2) | (temp << 30);

        // Redraw only the selection overlay
        this.render();
    }

    // -------------------------------------------------------------------------
    // Hit testing
    // -------------------------------------------------------------------------

    /**
     * Find the topmost (last drawn) widget at canvas coordinate (cx, cy).
     * Mirrors `_gx_system_top_widget_find()` — descends depth-first, returns
     * last leaf that contains the point (children are painted over parents).
     */
    private hitTest(cx: number, cy: number): WidgetInfo | null {
        if (!this.display) return null;

        function walkFind(w: WidgetInfo): WidgetInfo | null {
            // Check children last (they are on top)
            for (let i = w.children.length - 1; i >= 0; i--) {
                const hit = walkFind(w.children[i]);
                if (hit) return hit;
            }
            if (pointInRect(cx, cy, w.size)) return w;
            return null;
        }

        // Iterate folders in reverse (last folder rendered on top)
        for (let fi = this.display.folders.length - 1; fi >= 0; fi--) {
            const folder = this.display.folders[fi];
            for (let wi = folder.widgets.length - 1; wi >= 0; wi--) {
                const hit = walkFind(folder.widgets[wi]);
                if (hit) return hit;
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // Pointer event handlers
    // -------------------------------------------------------------------------

    private readonly onPointerDown = (e: PointerEvent): void => {
        const { x, y } = this.toCanvas(e.offsetX, e.offsetY);
        this.canvas.setPointerCapture(e.pointerId);

        // 1. Check resize handle first
        const handleMode = this.selection.hitTestHandle({ x, y });
        if (handleMode !== DragMode.None) {
            this.dragMode   = handleMode;
            this.dragStart  = { x, y };
            this.dragTarget = this.selection.selection[0] ?? null;
            return;
        }

        // 2. Hit-test widget
        const hit = this.hitTest(x, y);
        if (hit) {
            const additive = e.ctrlKey || e.metaKey;
            this.selection.selectWidget(hit, additive);
            this.emit({ type: 'selectionChange', selected: [...this.selection.selection] });
            this.dragMode   = DragMode.All;
            this.dragStart  = { x, y };
            this.dragTarget = hit;
            this.render();
        } else {
            this.selection.clearSelection();
            this.emit({ type: 'selectionChange', selected: [] });
            this.render();
        }
    };

    private readonly onPointerMove = (e: PointerEvent): void => {
        const { x, y } = this.toCanvas(e.offsetX, e.offsetY);

        if (this.dragMode === DragMode.None) {
            // Update cursor only
            const hoverMode = this.selection.hitTestHandle({ x, y });
            this.canvas.style.cursor = cursorForDragMode(hoverMode);
            return;
        }

        const target = this.dragTarget;
        if (!target) return;

        let deltaX = x - this.dragStart.x;
        let deltaY = y - this.dragStart.y;
        if (deltaX === 0 && deltaY === 0) return;

        // Snap
        if (this.display) {
            const header   = { snap_spacing: 10 }; // placeholder; wire real header
            const siblings = this.allWidgets.filter(w => w !== target);
            const siblRects = siblings.map(w => w.size);
            const snapped  = this.snapEngine.snap(
                target.size, siblRects, deltaX, deltaY, header.snap_spacing
            );
            deltaX = snapped.deltaX;
            deltaY = snapped.deltaY;
        }

        if (deltaX === 0 && deltaY === 0) return;

        if (this.dragMode === DragMode.All) {
            const moves = this.selection.computeMoveDeltas(deltaX, deltaY);
            this.dragStart = { x: this.dragStart.x + deltaX, y: this.dragStart.y + deltaY };

            for (const [w, rect] of moves) {
                this.emit({ type: 'widgetMove', widget: w, newRect: rect });
            }
        } else {
            const newRect = this.selection.applyResize(
                target.size, this.dragMode, deltaX, deltaY
            );

            // Enforce minimum size
            if (rectWidth(newRect)  < MIN_WIDGET_SIZE) return;
            if (rectHeight(newRect) < MIN_WIDGET_SIZE) return;

            this.dragStart = { x: this.dragStart.x + deltaX, y: this.dragStart.y + deltaY };

            this.emit({ type: 'widgetResize', widget: target, newRect });
        }
    };

    private readonly onPointerUp = (_e: PointerEvent): void => {
        this.dragMode   = DragMode.None;
        this.dragTarget = null;
        this.canvas.style.cursor = 'default';
    };

    // -------------------------------------------------------------------------
    // Event emission
    // -------------------------------------------------------------------------

    private emit(event: CanvasEvent): void {
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}
