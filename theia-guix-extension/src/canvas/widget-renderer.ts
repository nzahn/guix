/**
 * WidgetRenderer — per-type HTML Canvas 2D drawing for every GX_TYPE_* widget.
 *
 * Each `draw*` method receives:
 *   ctx        — Canvas 2D rendering context (already transformed / alpha)
 *   x, y       — top-left screen coordinate (integer pixels)
 *   w, h       — screen width / height (integer pixels)
 *   widget     — WidgetInfo (for labels, style bits, resource indices)
 *   zoom       — current zoom factor (0-4 range, e.g. 1.0 = 100 %)
 *
 * All colours are hard-coded design-time palettes — they are NOT the runtime
 * GUIX theme colours (those are only known at generate/run time).
 *
 * The visual style is intentionally similar to the original GUIX Studio
 * target_screen.cpp rendering: flat fills, single-pixel borders, centred
 * labels, and type-specific chrome (check boxes, radio dots, arrows …).
 */

import type { WidgetInfo } from '../common/widget-info';
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
} from '../common/gx-types';

// ---------------------------------------------------------------------------
// Design-time colour palette (per-category)
// ---------------------------------------------------------------------------

const COLOR = {
    windowFill:       '#2b4a72',
    windowBorder:     '#5a8fc4',
    buttonFill:       '#6b2020',
    buttonBorder:     '#cc4444',
    buttonHighlight:  '#ff8888',
    promptFill:       '#1e5e3a',
    promptBorder:     '#3da86a',
    inputFill:        '#1a1a3e',
    inputBorder:      '#6666cc',
    sliderFill:       '#5a3800',
    sliderBorder:     '#cc8800',
    scrollFill:       '#3a3a3a',
    scrollBorder:     '#888888',
    scrollThumb:      '#aaaaaa',
    chartFill:        '#0d2b3e',
    chartBorder:      '#2090c0',
    chartLine:        '#00d0ff',
    listFill:         '#2a2a2a',
    listBorder:       '#666666',
    listItem:         '#3a3a3a',
    gaugeFill:        '#0d0d2a',
    gaugeBorder:      '#3030cc',
    gaugeArc:         '#6666ff',
    miscFill:         '#2a2a2a',
    miscBorder:       '#666666',
    label:            'rgba(255,255,255,0.90)',
    labelDim:         'rgba(255,255,255,0.55)',
    check:            '#00ee44',
    radio:            '#00aaff',
    disabled:         'rgba(255,255,255,0.2)',
} as const;

// ---------------------------------------------------------------------------
// Helper drawing primitives
// ---------------------------------------------------------------------------

/** Fill + stroke a rectangle. */
function fillStroke(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    fill: string, stroke: string,
    lineWidth = 1,
): void {
    ctx.fillStyle   = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = lineWidth;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/** Draw centred text, clipped to the rectangle. */
function centredText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number, y: number, w: number, h: number,
    color: string = COLOR.label,
    fontSize = 11,
): void {
    if (!text || w < 8 || h < 8) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle    = color;
    ctx.font         = `${Math.max(8, Math.min(13, fontSize))}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'center';
    ctx.fillText(text, x + w / 2, y + h / 2, w - 4);
    ctx.restore();
}

/** Draw a simple 3-D-style raised bevel (button look). */
function bevelRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    light: string, shadow: string,
): void {
    ctx.strokeStyle = light;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5,     y + h - 0.5);
    ctx.lineTo(x + 0.5,     y + 0.5);
    ctx.lineTo(x + w - 0.5, y + 0.5);
    ctx.stroke();
    ctx.strokeStyle = shadow;
    ctx.beginPath();
    ctx.moveTo(x + 0.5,     y + h - 0.5);
    ctx.lineTo(x + w - 0.5, y + h - 0.5);
    ctx.lineTo(x + w - 0.5, y + 0.5);
    ctx.stroke();
}

/** Draw a right-pointing triangle arrow centred in a rect. */
function drawArrowRight(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, size: number, color: string,
): void {
    const s = Math.max(3, Math.round(size));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - s / 2, cy - s / 2);
    ctx.lineTo(cx + s / 2, cy);
    ctx.lineTo(cx - s / 2, cy + s / 2);
    ctx.closePath();
    ctx.fill();
}

/** Draw a downward triangle (drop-list chevron). */
function drawArrowDown(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, size: number, color: string,
): void {
    const s = Math.max(3, Math.round(size));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - s / 2, cy - s / 4);
    ctx.lineTo(cx + s / 2, cy - s / 4);
    ctx.lineTo(cx,          cy + s / 4);
    ctx.closePath();
    ctx.fill();
}

/** Draw three horizontal lines to indicate scrollable list. */
function drawListLines(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    color: string,
): void {
    const n    = Math.min(5, Math.floor(h / 14));
    if (n < 1) return;
    const gap  = h / (n + 1);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1;
    for (let i = 1; i <= n; i++) {
        const ly = Math.round(y + i * gap) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x + 4, ly);
        ctx.lineTo(x + w - 4, ly);
        ctx.stroke();
    }
}

// ---------------------------------------------------------------------------
// Per-type draw functions
// ---------------------------------------------------------------------------

function drawWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.windowFill, COLOR.windowBorder);
    // Title bar strip
    if (h > 16) {
        const barH = Math.min(16, Math.floor(h * 0.15));
        ctx.fillStyle = COLOR.windowBorder;
        ctx.fillRect(x + 1, y + 1, w - 2, barH);
        centredText(ctx, widget.app_name || 'window', x, y + 1, w, barH, COLOR.label, 9);
    }
}

function drawButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.buttonFill, COLOR.buttonBorder);
    bevelRect(ctx, x + 1, y + 1, w - 2, h - 2, COLOR.buttonHighlight, '#440000');
    centredText(ctx, widget.app_name || 'button', x, y, w, h);
}

function drawCheckbox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.buttonFill, COLOR.buttonBorder);
    // Box on left
    const boxSize = Math.min(h - 6, 12);
    const bx = x + 4;
    const by = y + (h - boxSize) / 2;
    ctx.strokeStyle = COLOR.buttonHighlight;
    ctx.lineWidth   = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, boxSize - 1, boxSize - 1);
    // Checkmark
    ctx.strokeStyle = COLOR.check;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx + 2, by + boxSize / 2);
    ctx.lineTo(bx + boxSize / 2 - 1, by + boxSize - 3);
    ctx.lineTo(bx + boxSize - 2, by + 2);
    ctx.stroke();
    // Label
    centredText(ctx, widget.app_name || 'checkbox', x + boxSize + 8, y, w - boxSize - 12, h);
}

function drawRadioButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.buttonFill, COLOR.buttonBorder);
    // Circle on left
    const r  = Math.min((h - 6) / 2, 7);
    const cx = x + 4 + r;
    const cy = y + h / 2;
    ctx.strokeStyle = COLOR.buttonHighlight;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Dot
    ctx.fillStyle = COLOR.radio;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    centredText(ctx, widget.app_name || 'radio', x + r * 2 + 10, y, w - r * 2 - 14, h);
}

function drawPrompt(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.promptFill, COLOR.promptBorder);
    centredText(ctx, widget.app_name || 'prompt', x, y, w, h, COLOR.label);
}

function drawTextInput(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.inputFill, COLOR.inputBorder);
    // Cursor blink indicator
    const cursorX = x + 4;
    ctx.strokeStyle = COLOR.label;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(cursorX + 0.5, y + 3);
    ctx.lineTo(cursorX + 0.5, y + h - 4);
    ctx.stroke();
    centredText(ctx, widget.app_name || 'text_input', x + 8, y, w - 10, h, COLOR.labelDim);
}

function drawMultiLineText(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.inputFill, COLOR.inputBorder);
    drawListLines(ctx, x, y, w, h, COLOR.inputBorder);
    centredText(ctx, widget.app_name || '', x, y + 2, w, Math.min(h, 14), COLOR.labelDim, 9);
}

function drawSlider(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, _widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.sliderFill, COLOR.sliderBorder);
    // Track + thumb (horizontal layout)
    const trackY = y + h / 2;
    ctx.strokeStyle = COLOR.sliderBorder;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(x + 4, trackY);
    ctx.lineTo(x + w - 4, trackY);
    ctx.stroke();
    // Thumb at 50 %
    const thumbX = x + w / 2;
    const thumbH = Math.min(h - 4, 16);
    const thumbW = Math.max(6, thumbH / 2);
    ctx.fillStyle   = COLOR.sliderBorder;
    ctx.strokeStyle = COLOR.buttonHighlight;
    ctx.lineWidth   = 1;
    ctx.fillRect(thumbX - thumbW / 2, trackY - thumbH / 2, thumbW, thumbH);
    ctx.strokeRect(thumbX - thumbW / 2 + 0.5, trackY - thumbH / 2 + 0.5, thumbW - 1, thumbH - 1);
}

function drawScrollbar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, _widget: WidgetInfo, horizontal: boolean): void {
    fillStroke(ctx, x, y, w, h, COLOR.scrollFill, COLOR.scrollBorder);
    if (horizontal) {
        // Left arrow
        const aw = Math.min(w / 6, 14);
        ctx.fillStyle = COLOR.scrollBorder;
        ctx.fillRect(x, y, aw, h);
        drawArrowRight(ctx, x + aw / 2, y + h / 2, aw * 0.5, COLOR.label);
        // Right arrow
        ctx.fillRect(x + w - aw, y, aw, h);
        ctx.save();
        ctx.translate(x + w - aw / 2, y + h / 2);
        ctx.scale(-1, 1);
        drawArrowRight(ctx, 0, 0, aw * 0.5, COLOR.label);
        ctx.restore();
        // Thumb
        const thumbW = Math.max(8, (w - aw * 2) * 0.35);
        const thumbX = x + aw + ((w - aw * 2 - thumbW) * 0.4);
        ctx.fillStyle = COLOR.scrollThumb;
        ctx.fillRect(thumbX, y + 1, thumbW, h - 2);
    } else {
        const ah = Math.min(h / 6, 14);
        // Up/Down arrows
        ctx.fillStyle = COLOR.scrollBorder;
        ctx.fillRect(x, y, w, ah);
        ctx.fillRect(x, y + h - ah, w, ah);
        // Up arrow
        ctx.save();
        ctx.translate(x + w / 2, y + ah / 2);
        ctx.rotate(-Math.PI / 2);
        drawArrowRight(ctx, 0, 0, ah * 0.5, COLOR.label);
        ctx.restore();
        // Down arrow
        ctx.save();
        ctx.translate(x + w / 2, y + h - ah / 2);
        ctx.rotate(Math.PI / 2);
        drawArrowRight(ctx, 0, 0, ah * 0.5, COLOR.label);
        ctx.restore();
        // Thumb
        const thumbH = Math.max(8, (h - ah * 2) * 0.35);
        const thumbY = y + ah + ((h - ah * 2 - thumbH) * 0.4);
        ctx.fillStyle = COLOR.scrollThumb;
        ctx.fillRect(x + 1, thumbY, w - 2, thumbH);
    }
}

function drawProgressBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, _widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.sliderFill, COLOR.sliderBorder);
    // Fill at 60 % for visual
    const fill = Math.round(w * 0.6);
    ctx.fillStyle = COLOR.sliderBorder;
    ctx.fillRect(x + 1, y + 1, fill - 2, h - 2);
    centredText(ctx, '60%', x, y, w, h, COLOR.label);
}

function drawCircularGauge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, _widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.gaugeFill, COLOR.gaugeBorder);
    const cx  = x + w / 2;
    const cy  = y + h / 2;
    const r   = Math.min(w, h) / 2 - 4;
    if (r < 4) return;
    // Background arc
    ctx.strokeStyle = COLOR.gaugeBorder;
    ctx.lineWidth   = Math.max(2, r / 8);
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();
    // Value arc (60 %)
    ctx.strokeStyle = COLOR.gaugeArc;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + (Math.PI * 1.5 * 0.6));
    ctx.stroke();
    // Needle
    const angle = Math.PI * 0.75 + Math.PI * 1.5 * 0.6;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * r * 0.8, cy + Math.sin(angle) * r * 0.8);
    ctx.stroke();
}

function drawRadialProgressBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, _widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.gaugeFill, COLOR.gaugeBorder);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r  = Math.min(w, h) / 2 - 4;
    if (r < 4) return;
    ctx.strokeStyle = COLOR.gaugeBorder;
    ctx.lineWidth   = Math.max(3, r / 5);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = COLOR.gaugeArc;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.7);
    ctx.stroke();
}

function drawLineChart(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, _widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.chartFill, COLOR.chartBorder);
    if (w < 16 || h < 16) return;
    // Axes
    ctx.strokeStyle = COLOR.chartBorder;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 4);
    ctx.lineTo(x + 4, y + h - 4);
    ctx.lineTo(x + w - 4, y + h - 4);
    ctx.stroke();
    // Data line (a simple sine-like wave)
    const pts = 8;
    const sy  = [0.8, 0.5, 0.7, 0.3, 0.6, 0.4, 0.75, 0.5];
    ctx.strokeStyle = COLOR.chartLine;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    for (let i = 0; i < pts; i++) {
        const px = x + 4 + ((w - 8) / (pts - 1)) * i;
        const py = y + h - 4 - (h - 12) * sy[i];
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();
}

function drawDropList(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.inputFill, COLOR.inputBorder);
    // Drop button on right
    const bw = Math.min(w / 5, 18);
    ctx.fillStyle = COLOR.buttonFill;
    ctx.fillRect(x + w - bw, y, bw, h);
    ctx.strokeStyle = COLOR.buttonBorder;
    ctx.strokeRect(x + w - bw + 0.5, y + 0.5, bw - 1, h - 1);
    drawArrowDown(ctx, x + w - bw / 2, y + h / 2, bw * 0.5, COLOR.label);
    centredText(ctx, widget.app_name || 'drop_list', x, y, w - bw, h, COLOR.labelDim);
}

function drawScrollWheel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.listFill, COLOR.listBorder);
    // Highlight centre item
    const rowH = Math.max(14, Math.round(h / 5));
    const selY = y + (h - rowH) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 1, selY, w - 2, rowH);
    drawListLines(ctx, x, y, w, h, COLOR.listBorder);
    centredText(ctx, widget.app_name || 'scroll_wheel', x, selY, w, rowH, COLOR.label, 9);
}

function drawList(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, widget: WidgetInfo, withScrollbar: boolean): void {
    fillStroke(ctx, x, y, w, h, COLOR.listFill, COLOR.listBorder);
    // Item rows
    const rowH  = Math.max(12, Math.round(h / 5));
    const nRows = Math.floor(h / rowH);
    for (let i = 0; i < nRows; i++) {
        const ry = y + i * rowH;
        if (i % 2 === 0) {
            ctx.fillStyle = COLOR.listItem;
            ctx.fillRect(x + 1, ry + 1, w - (withScrollbar ? 14 : 2), rowH - 1);
        }
    }
    if (withScrollbar && w > 20) {
        drawScrollbar(ctx, x + w - 12, y, 12, h, widget, false);
    }
    centredText(ctx, widget.app_name || 'list', x, y, w, Math.min(rowH, h), COLOR.labelDim, 9);
}

function drawIcon(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.miscFill, COLOR.miscBorder);
    // Placeholder image icon
    const margin = Math.min(4, Math.floor(Math.min(w, h) * 0.1));
    ctx.strokeStyle = COLOR.miscBorder;
    ctx.lineWidth   = 1;
    ctx.strokeRect(x + margin + 0.5, y + margin + 0.5, w - margin * 2 - 1, h - margin * 2 - 1);
    // Mountain + sun
    const ix = x + margin;
    const iy = y + margin;
    const iw = w - margin * 2;
    const ih = h - margin * 2;
    if (iw > 10 && ih > 10) {
        ctx.fillStyle = COLOR.miscBorder;
        ctx.beginPath();
        ctx.moveTo(ix,          iy + ih);
        ctx.lineTo(ix + iw * 0.4, iy + ih * 0.4);
        ctx.lineTo(ix + iw * 0.7, iy + ih * 0.7);
        ctx.lineTo(ix + iw,     iy + ih);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ix + iw * 0.75, iy + ih * 0.25, ih * 0.12, 0, Math.PI * 2);
        ctx.fill();
    }
    centredText(ctx, widget.app_name || '', x, y, w, Math.min(10, h), COLOR.labelDim, 8);
}

function drawSprite(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, widget: WidgetInfo): void {
    drawIcon(ctx, x, y, w, h, widget);
    // Overlay "SPRITE" tag
    if (w > 30 && h > 14) {
        ctx.fillStyle   = 'rgba(0,0,0,0.45)';
        ctx.fillRect(x, y + h - 13, w, 13);
        centredText(ctx, 'SPRITE', x, y + h - 13, w, 13, COLOR.label, 8);
    }
}

function drawMenu(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.windowFill, COLOR.windowBorder);
    // Header bar
    const barH = Math.min(h, 20);
    ctx.fillStyle = COLOR.windowBorder;
    ctx.fillRect(x + 1, y + 1, w - 2, barH - 2);
    drawArrowRight(ctx, x + w - 10, y + barH / 2, 7, COLOR.label);
    centredText(ctx, widget.app_name || 'menu', x, y, w - 14, barH, COLOR.label);
    // Sub-items
    if (h > barH + 4) {
        drawListLines(ctx, x, y + barH, w, h - barH, 'rgba(255,255,255,0.15)');
    }
}

function drawTreeView(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.listFill, COLOR.listBorder);
    const rowH = 14;
    const rows = Math.min(6, Math.floor(h / rowH));
    const indent = [0, 12, 24, 12, 24, 36];
    for (let i = 0; i < rows; i++) {
        const ry  = y + 2 + i * rowH;
        const ind = indent[i] ?? 0;
        // Expand triangle
        ctx.fillStyle = COLOR.listBorder;
        ctx.beginPath();
        ctx.moveTo(x + 4 + ind, ry + 4);
        ctx.lineTo(x + 4 + ind, ry + rowH - 4);
        ctx.lineTo(x + 4 + ind + 6, ry + rowH / 2);
        ctx.closePath();
        ctx.fill();
        // Item line
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(x + 14 + ind, ry + rowH / 2 + 0.5);
        ctx.lineTo(x + w - 4,   ry + rowH / 2 + 0.5);
        ctx.stroke();
    }
    centredText(ctx, widget.app_name || 'tree_view', x, y, w, Math.min(rowH, h), COLOR.labelDim, 9);
}

function drawGenericWidget(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, widget: WidgetInfo): void {
    fillStroke(ctx, x, y, w, h, COLOR.miscFill, COLOR.miscBorder);
    centredText(ctx, widget.app_name || `widget(${widget.basetype})`, x, y, w, h, COLOR.labelDim);
}

// ---------------------------------------------------------------------------
// Public dispatch function
// ---------------------------------------------------------------------------

/**
 * Draw a single widget on the canvas context.
 *
 * @param ctx    Canvas 2D context (caller sets transform/alpha before calling)
 * @param x      Top-left screen X (integer)
 * @param y      Top-left screen Y (integer)
 * @param w      Screen width  (integer)
 * @param h      Screen height (integer)
 * @param widget WidgetInfo node
 */
export function drawWidget(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    widget: WidgetInfo,
): void {
    if (w < 1 || h < 1) return;

    ctx.save();
    // Clip to this widget's bounds so children can't bleed out of their parent
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    switch (widget.basetype) {

        // ── Windows / containers ───────────────────────────────────────
        case GX_TYPE_ROOT_WINDOW:
            fillStroke(ctx, x, y, w, h, '#1a2a3a', '#4080a0');
            centredText(ctx, widget.app_name || 'root', x, y, w, Math.min(h, 14), COLOR.labelDim, 9);
            break;
        case GX_TYPE_WINDOW:
        case GX_TYPE_TEMPLATE:
            drawWindow(ctx, x, y, w, h, widget);
            break;

        // ── Buttons ────────────────────────────────────────────────────
        case GX_TYPE_BUTTON:
        case GX_TYPE_ICON_BUTTON:
        case GX_TYPE_PIXELMAP_BUTTON:
        case GX_TYPE_MULTI_LINE_TEXT_BUTTON:
            drawButton(ctx, x, y, w, h, widget);
            break;
        case GX_TYPE_TEXT_BUTTON:
            drawButton(ctx, x, y, w, h, widget);
            break;
        case GX_TYPE_CHECKBOX:
            drawCheckbox(ctx, x, y, w, h, widget);
            break;
        case GX_TYPE_RADIO_BUTTON:
            drawRadioButton(ctx, x, y, w, h, widget);
            break;

        // ── Prompts / labels ───────────────────────────────────────────
        case GX_TYPE_PROMPT:
        case GX_TYPE_NUMERIC_PROMPT:
        case GX_TYPE_PIXELMAP_PROMPT:
        case GX_TYPE_NUMERIC_PIXELMAP_PROMPT:
            drawPrompt(ctx, x, y, w, h, widget);
            break;

        // ── Text inputs ────────────────────────────────────────────────
        case GX_TYPE_SINGLE_LINE_TEXT_INPUT:
            drawTextInput(ctx, x, y, w, h, widget);
            break;
        case GX_TYPE_MULTI_LINE_TEXT_INPUT:
        case GX_TYPE_MULTI_LINE_TEXT_VIEW:
        case GX_TYPE_RICH_TEXT_VIEW:
            drawMultiLineText(ctx, x, y, w, h, widget);
            break;

        // ── Sliders ────────────────────────────────────────────────────
        case GX_TYPE_SLIDER:
        case GX_TYPE_PIXELMAP_SLIDER:
        case GX_TYPE_RADIAL_SLIDER:
            drawSlider(ctx, x, y, w, h, widget);
            break;

        // ── Scrollbars ─────────────────────────────────────────────────
        case GX_TYPE_HORIZONTAL_SCROLL:
            drawScrollbar(ctx, x, y, w, h, widget, true);
            break;
        case GX_TYPE_VERTICAL_SCROLL:
            drawScrollbar(ctx, x, y, w, h, widget, false);
            break;

        // ── Progress ───────────────────────────────────────────────────
        case GX_TYPE_PROGRESS_BAR:
            drawProgressBar(ctx, x, y, w, h, widget);
            break;
        case GX_TYPE_RADIAL_PROGRESS_BAR:
            drawRadialProgressBar(ctx, x, y, w, h, widget);
            break;
        case GX_TYPE_CIRCULAR_GAUGE:
            drawCircularGauge(ctx, x, y, w, h, widget);
            break;

        // ── Charts ─────────────────────────────────────────────────────
        case GX_TYPE_LINE_CHART:
            drawLineChart(ctx, x, y, w, h, widget);
            break;

        // ── Lists ──────────────────────────────────────────────────────
        case GX_TYPE_VERTICAL_LIST:
            drawList(ctx, x, y, w, h, widget, true);
            break;
        case GX_TYPE_HORIZONTAL_LIST:
            drawList(ctx, x, y, w, h, widget, false);
            break;
        case GX_TYPE_DROP_LIST:
            drawDropList(ctx, x, y, w, h, widget);
            break;

        // ── Scroll wheels ──────────────────────────────────────────────
        case GX_TYPE_GENERIC_SCROLL_WHEEL:
        case GX_TYPE_STRING_SCROLL_WHEEL:
        case GX_TYPE_NUMERIC_SCROLL_WHEEL:
            drawScrollWheel(ctx, x, y, w, h, widget);
            break;

        // ── Icons / sprites ────────────────────────────────────────────
        case GX_TYPE_ICON:
            drawIcon(ctx, x, y, w, h, widget);
            break;
        case GX_TYPE_SPRITE:
            drawSprite(ctx, x, y, w, h, widget);
            break;

        // ── Menus ──────────────────────────────────────────────────────
        case GX_TYPE_MENU:
        case GX_TYPE_ACCORDION_MENU:
            drawMenu(ctx, x, y, w, h, widget);
            break;

        // ── Tree view ──────────────────────────────────────────────────
        case GX_TYPE_TREE_VIEW:
            drawTreeView(ctx, x, y, w, h, widget);
            break;

        // ── Base widget / fallback ─────────────────────────────────────
        case GX_TYPE_WIDGET:
        default:
            drawGenericWidget(ctx, x, y, w, h, widget);
            break;
    }

    ctx.restore();
}
