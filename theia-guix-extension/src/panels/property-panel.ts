/**
 * PropertyPanel — VS Code WebviewView provider for the GUIX widget property editor.
 *
 * Ports guix_studio/properties_win.cpp (CDialog-based MFC panel).
 *
 * The panel renders inside a VS Code sidebar webview.  When a widget is
 * selected in the canvas or project tree, `showWidget()` is called and the
 * webview is refreshed with dynamically-built HTML form fields that mirror
 * the per-type property groups in the original C++ panel.
 *
 * Mutations post a `propChange` message back to the extension host, which
 * applies them through the undo stack (Phase 4).
 */

import * as vscode from 'vscode';
import { injectable } from 'inversify';
import { GxpProject } from '../common/project-model';
import { WidgetInfo, GxRectangle } from '../common/widget-info';
import {
    RES_TYPE_COLOR,
    RES_TYPE_FONT,
    RES_TYPE_PIXELMAP,
    RES_TYPE_STRING,
} from '../common/gx-types';

// ---------------------------------------------------------------------------
// Publicly visible interface so other panels can call showWidget()
// ---------------------------------------------------------------------------

export interface IPropertyPanel {
    showWidget(widget: WidgetInfo | null, project: GxpProject | null, displayIdx?: number): void;
    widgetWasModified(widget: WidgetInfo): void;
}

// ---------------------------------------------------------------------------
// PropertyChangeEvent — posted from webview to extension host
// ---------------------------------------------------------------------------

/** Identifies a single property mutation. */
export interface PropertyChangeEvent {
    readonly field: string;    // e.g. 'app_name', 'size.left', 'style'
    readonly value: unknown;   // new value (number | string | boolean)
}

// ---------------------------------------------------------------------------
// PropertyPanel
// ---------------------------------------------------------------------------

@injectable()
export class PropertyPanel implements vscode.WebviewViewProvider, IPropertyPanel {

    static readonly viewId = 'guixStudio.propertyPanel';

    private view: vscode.WebviewView | undefined;
    private currentWidget: WidgetInfo | null = null;
    private currentProject: GxpProject | null = null;
    private currentDisplayIdx = 0;

    /** Listeners notified when the user edits a property. */
    private changeListeners: Array<(w: WidgetInfo, e: PropertyChangeEvent) => void> = [];

    // ── Registration helpers ───────────────────────────────────────────────

    onPropertyChange(listener: (w: WidgetInfo, e: PropertyChangeEvent) => void): void {
        this.changeListeners.push(listener);
    }

    // ── IPropertyPanel ─────────────────────────────────────────────────────

    showWidget(widget: WidgetInfo | null, project: GxpProject | null, displayIdx = 0): void {
        this.currentWidget     = widget;
        this.currentProject    = project;
        this.currentDisplayIdx = displayIdx;
        this.updateView();
    }

    widgetWasModified(widget: WidgetInfo): void {
        if (this.currentWidget === widget) this.updateView();
    }

    // ── WebviewViewProvider ────────────────────────────────────────────────

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.onDidDispose(() => { this.view = undefined; });
        webviewView.webview.onDidReceiveMessage((msg: unknown) => this.onMessage(msg));
        this.updateView();
    }

    // ── Internal ───────────────────────────────────────────────────────────

    private updateView(): void {
        if (!this.view) return;
        this.view.webview.html = this.buildHtml(this.view.webview, this.currentWidget, this.currentDisplayIdx);
    }

    private onMessage(msg: unknown): void {
        if (typeof msg !== 'object' || msg === null) return;
        const m = msg as Record<string, unknown>;
        if (m['type'] !== 'propChange') return;
        if (!this.currentWidget) return;
        const event: PropertyChangeEvent = {
            field: String(m['field'] ?? ''),
            value: m['value'],
        };
        applyPropertyChange(this.currentWidget, event);
        for (const l of this.changeListeners) l(this.currentWidget, event);
    }

    private buildHtml(_webview: vscode.Webview, widget: WidgetInfo | null, displayIdx = 0): string {
        const nonce = generateNonce();
        const csp   = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;

        const body = widget
            ? buildPropertyGroups(widget, this.currentProject, displayIdx)
            : `<p class="empty">No widget selected.</p>`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style nonce="${nonce}">
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-sideBar-background);
  padding: 4px;
}
.group-header {
  font-weight: bold; font-size: 11px;
  color: var(--vscode-sideBarSectionHeader-foreground);
  background: var(--vscode-sideBarSectionHeader-background);
  padding: 3px 6px; margin-top: 6px; cursor: pointer;
  user-select: none;
}
.group-header:first-child { margin-top: 0; }
.group-body { padding: 0 4px; }
.prop-row {
  display: flex; align-items: center;
  min-height: 22px; border-bottom: 1px solid var(--vscode-panel-border);
}
.prop-label {
  width: 120px; min-width: 120px; font-size: 11px; padding: 2px 4px;
  color: var(--vscode-descriptionForeground); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.prop-value { flex: 1; }
.prop-value input, .prop-value select {
  width: 100%; font-size: 11px; font-family: var(--vscode-font-family);
  background: var(--vscode-input-background); color: var(--vscode-input-foreground);
  border: 1px solid transparent; padding: 1px 4px; height: 20px;
}
.prop-value input:focus, .prop-value select:focus {
  border-color: var(--vscode-focusBorder); outline: none;
}
.prop-value input[type=checkbox] { width: auto; height: auto; }
.empty { color: var(--vscode-descriptionForeground); padding: 8px; font-size: 11px; }
</style>
</head>
<body>
${body}
<script nonce="${nonce}">
(function() {
  const vscode = acquireVsCodeApi();

  document.querySelectorAll('.group-header').forEach(function(hdr) {
    hdr.addEventListener('click', function() {
      var body = hdr.nextElementSibling;
      if (body) { body.style.display = body.style.display === 'none' ? '' : 'none'; }
    });
  });

  function post(field, value) {
    vscode.postMessage({ type: 'propChange', field: field, value: value });
  }

  // Number / text inputs — fire on blur
  document.querySelectorAll('input[data-field]').forEach(function(el) {
    var input = el;
    input.addEventListener('change', function() {
      var field = input.dataset.field;
      var raw   = input.type === 'checkbox' ? input.checked : input.value;
      var val   = input.type === 'number'   ? Number(raw)   : raw;
      post(field, val);
    });
  });

  // Selects — fire immediately
  document.querySelectorAll('select[data-field]').forEach(function(el) {
    el.addEventListener('change', function() {
      post(el.dataset.field, Number(el.value));
    });
  });
}());
</script>
</body>
</html>`;
    }
}

// ---------------------------------------------------------------------------
// Property group builders  (mirrors AddWidgetProps() dispatch + per-type helpers)
// ---------------------------------------------------------------------------

function buildPropertyGroups(w: WidgetInfo, project: GxpProject | null, displayIdx = 0): string {
    const groups: string[] = [];
    groups.push(groupCommon(w));
    groups.push(groupGeometry(w.size));
    groups.push(groupAppearance(w, project, displayIdx));

    // ── Widget-type-specific groups ────────────────────────────────────────
    const ext = w.ewi;
    if (ext) {
        switch (ext.kind) {
            case 'slider':           groups.push(groupSlider(ext.info));   break;
            case 'progress':         groups.push(groupProgress(ext.info)); break;
            case 'radial_progress':  groups.push(groupRadialProgress(ext.info)); break;
            case 'radial_slider':    groups.push(groupRadialSlider(ext.info));   break;
            case 'vlist':            groups.push(groupList(ext.info.total_rows, ext.info.seperation)); break;
            case 'drop_list':        groups.push(groupDropList(ext.info)); break;
            case 'text_info':        groups.push(groupTextInput(ext.info)); break;
            case 'gauge':            groups.push(groupGauge(ext.info));    break;
            case 'line_chart':       groups.push(groupLineChart(ext.info)); break;
            case 'scroll_wheel':
            case 'string_scroll_wheel':
            case 'numeric_scroll_wheel':
                groups.push(groupScrollWheel(
                    ext.kind === 'scroll_wheel' ? ext.info :
                    ext.kind === 'string_scroll_wheel' ? ext.info.base :
                    ext.info.base,
                ));
                break;
            case 'menu':             groups.push(groupMenu(ext.info));     break;
            default: break;
        }
    }

    groups.push(groupCallbacks(w));
    return groups.join('\n');
}

// ---------------------------------------------------------------------------
// Group: Common Properties
// ---------------------------------------------------------------------------

function groupCommon(w: WidgetInfo): string {
    return group('Common', [
        row('Name',        textField('app_name',   w.app_name)),
        row('ID',          textField('id_name',    w.id_name)),
        row('Base Name',   textField('base_name',  w.base_name)),
        row('User Data',   textField('user_data',  w.user_data)),
        row('Visible',     checkField('style_visible',   !!(w.style & 0x00000001))),
        row('Enabled',     checkField('style_enabled',   !!(w.style & 0x00000002))),
        row('Transparent', checkField('style_transparent', !!(w.style & 0x00000010))),
    ]);
}

// ---------------------------------------------------------------------------
// Group: Geometry
// ---------------------------------------------------------------------------

function groupGeometry(size: GxRectangle): string {
    return group('Position & Size', [
        row('Left',   numField('size.left',   size.left)),
        row('Top',    numField('size.top',    size.top)),
        row('Right',  numField('size.right',  size.right)),
        row('Bottom', numField('size.bottom', size.bottom)),
        row('Width',  `<span style="font-size:11px;padding:2px 4px">${size.right - size.left + 1}</span>`),
        row('Height', `<span style="font-size:11px;padding:2px 4px">${size.bottom - size.top + 1}</span>`),
    ]);
}

// ---------------------------------------------------------------------------
// Group: Appearance
// ---------------------------------------------------------------------------

function groupAppearance(w: WidgetInfo, project: GxpProject | null, displayIdx: number): string {
    const borderOptions: ReadonlyArray<readonly [number, string]> = [
        [0, 'None'],
        [1, 'Simple'],
        [2, 'Raised'],
        [3, 'Recessed'],
        [4, 'Thin'],
    ];
    const borderSel = selectField('border', (w.style >> 8) & 0xF, borderOptions);

    return group('Appearance', [
        row('Border',          borderSel),
        row('Normal Color',    selectField('color_id.0',    w.color_id[0],    resourceOpts(project, displayIdx, RES_TYPE_COLOR))),
        row('Selected Color',  selectField('color_id.1',    w.color_id[1],    resourceOpts(project, displayIdx, RES_TYPE_COLOR))),
        row('Disabled Color',  selectField('color_id.2',    w.color_id[2],    resourceOpts(project, displayIdx, RES_TYPE_COLOR))),
        row('Normal Font',     selectField('font_id.0',     w.font_id[0],     resourceOpts(project, displayIdx, RES_TYPE_FONT))),
        row('Normal Pixelmap', selectField('pixelmap_id.0', w.pixelmap_id[0], resourceOpts(project, displayIdx, RES_TYPE_PIXELMAP))),
        row('String 0',        selectField('string_id.0',   w.string_id[0],   resourceOpts(project, displayIdx, RES_TYPE_STRING))),
    ]);
}

// ---------------------------------------------------------------------------
// Group: Callbacks
// ---------------------------------------------------------------------------

function groupCallbacks(w: WidgetInfo): string {
    return group('Functions', [
        row('Event Func',  textField('event_func',    w.event_func)),
        row('Draw Func',   textField('draw_func',     w.draw_func)),
        row('Callback',    textField('callback_func', w.callback_func)),
        row('Format Func', textField('format_func',   w.format_func)),
    ]);
}

// ---------------------------------------------------------------------------
// Type-specific property groups
// ---------------------------------------------------------------------------

function groupSlider(s: import('../common/widget-info').SliderInfo): string {
    return group('Slider', [
        row('Min Value',    numField('ext.min_val',     s.min_val)),
        row('Max Value',    numField('ext.max_val',     s.max_val)),
        row('Current Val',  numField('ext.current_val', s.current_val)),
        row('Increment',    numField('ext.increment',   s.increment)),
        row('Min Travel',   numField('ext.min_travel',  s.min_travel)),
        row('Max Travel',   numField('ext.max_travel',  s.max_travel)),
        row('Needle Width', numField('ext.needle_width',  s.needle_width)),
        row('Needle Height',numField('ext.needle_height', s.needle_height)),
        row('Needle Inset', numField('ext.needle_inset',  s.needle_inset)),
    ]);
}

function groupProgress(p: import('../common/widget-info').ProgressInfo): string {
    return group('Progress Bar', [
        row('Min Value',   numField('ext.min_val',     p.min_val)),
        row('Max Value',   numField('ext.max_val',     p.max_val)),
        row('Current Val', numField('ext.current_val', p.current_val)),
    ]);
}

function groupRadialProgress(r: import('../common/widget-info').RadialProgressBarInfo): string {
    return group('Radial Progress', [
        row('Center X',    numField('ext.xcenter', r.xcenter)),
        row('Center Y',    numField('ext.ycenter', r.ycenter)),
        row('Radius',      numField('ext.radius',  r.radius)),
        row('Current Val', numField('ext.current_val', r.current_val)),
        row('Anchor Val',  numField('ext.anchor_val',  r.anchor_val)),
    ]);
}

function groupRadialSlider(r: import('../common/widget-info').RadialSliderInfo): string {
    return group('Radial Slider', [
        row('Center X',   numField('ext.xcenter',       r.xcenter)),
        row('Center Y',   numField('ext.ycenter',       r.ycenter)),
        row('Radius',     numField('ext.radius',        r.radius)),
        row('Min Angle',  numField('ext.min_angle',     r.min_angle)),
        row('Max Angle',  numField('ext.max_angle',     r.max_angle)),
        row('Current Angle', numField('ext.current_angle', r.current_angle)),
    ]);
}

function groupList(totalRows: number, separation: number): string {
    return group('List', [
        row('Total Rows', numField('ext.total_rows', totalRows)),
        row('Separation', numField('ext.seperation', separation)),
    ]);
}

function groupDropList(d: import('../common/widget-info').DropListInfo): string {
    return group('Drop List', [
        row('Total Rows',  numField('ext.total_rows', d.total_rows)),
        row('Separation',  numField('ext.seperation', d.seperation)),
        row('Open Height', numField('ext.open_height', d.open_height)),
    ]);
}

function groupTextInput(t: import('../common/widget-info').TextInputInfo): string {
    return group('Text Input', [
        row('Whitespace',   numField('ext.whitespace',   t.whitespace)),
        row('Line Space',   numField('ext.line_space',   t.line_space)),
        row('Buffer Size',  numField('ext.buffer_size',  t.buffer_size)),
        row('Dynamic Buf',  checkField('ext.dynamic_buffer', t.dynamic_buffer)),
    ]);
}

function groupGauge(g: import('../common/widget-info').CircularGaugeInfo): string {
    return group('Circular Gauge', [
        row('Center X',   numField('ext.xcenter',      g.xcenter)),
        row('Center Y',   numField('ext.ycenter',      g.ycenter)),
        row('Radius',     numField('ext.radius',       g.radius)),
        row('Start Angle',numField('ext.start_angle',  g.start_angle)),
        row('End Angle',  numField('ext.end_angle',    g.end_angle)),
        row('Min Angle',  numField('ext.min_angle',    g.min_angle)),
        row('Max Angle',  numField('ext.max_angle',    g.max_angle)),
    ]);
}

function groupLineChart(c: import('../common/widget-info').LineChartInfo): string {
    return group('Line Chart', [
        row('Left Margin',   numField('ext.left_margin',   c.left_margin)),
        row('Right Margin',  numField('ext.right_margin',  c.right_margin)),
        row('Top Margin',    numField('ext.top_margin',    c.top_margin)),
        row('Bottom Margin', numField('ext.bottom_margin', c.bottom_margin)),
        row('Max Data Cnt',  numField('ext.max_data_count', c.max_data_count)),
    ]);
}

function groupScrollWheel(sw: import('../common/widget-info').ScrollWheelInfo): string {
    return group('Scroll Wheel', [
        row('Total Rows',  numField('ext.total_rows',    sw.total_rows)),
        row('Row Height',  numField('ext.row_height',    sw.row_height)),
        row('Selected Row',numField('ext.selected_row',  sw.selected_row)),
        row('Start Alpha', numField('ext.start_alpha',   sw.start_alpha)),
        row('End Alpha',   numField('ext.end_alpha',     sw.end_alpha)),
    ]);
}

function groupMenu(m: import('../common/widget-info').MenuInfo): string {
    return group('Menu', [
        row('Text X Offset',   numField('ext.text_x_offset',     m.text_x_offset)),
        row('Text Y Offset',   numField('ext.text_y_offset',     m.text_y_offset)),
        row('List Total Count',numField('ext.list_total_count',  m.list_total_count)),
    ]);
}

// ---------------------------------------------------------------------------
// Apply property change (host-side mutation — called before undo command in Phase 4)
// ---------------------------------------------------------------------------

/**
 * Mutates `widget` in place for the given property field + value.
 * Supports dotted paths: 'size.left', 'color_id.0', 'style_visible', etc.
 */
export function applyPropertyChange(widget: WidgetInfo, event: PropertyChangeEvent): void {
    const { field, value } = event;

    // Geometry
    if (field.startsWith('size.')) {
        const key = field.slice(5) as keyof GxRectangle;
        if (key in widget.size) (widget.size as unknown as Record<string, unknown>)[key] = Number(value);
        return;
    }

    // Color IDs
    if (field.startsWith('color_id.')) {
        const idx = parseInt(field.slice(9), 10);
        if (idx >= 0 && idx < widget.color_id.length) widget.color_id[idx] = Number(value);
        return;
    }

    // Font IDs
    if (field.startsWith('font_id.')) {
        const idx = parseInt(field.slice(8), 10);
        if (idx >= 0 && idx < widget.font_id.length) widget.font_id[idx] = Number(value);
        return;
    }

    // Pixelmap IDs
    if (field.startsWith('pixelmap_id.')) {
        const idx = parseInt(field.slice(12), 10);
        if (idx >= 0 && idx < widget.pixelmap_id.length) widget.pixelmap_id[idx] = Number(value);
        return;
    }

    // String IDs
    if (field.startsWith('string_id.')) {
        const idx = parseInt(field.slice(10), 10);
        if (idx >= 0 && idx < widget.string_id.length) widget.string_id[idx] = Number(value);
        return;
    }

    // Extended widget info fields (sliders, gauges, text inputs, …)
    if (field.startsWith('ext.')) {
        const key = field.slice(4);
        if (widget.ewi && 'info' in widget.ewi) {
            const info = (widget.ewi as { kind: string; info: unknown }).info as Record<string, unknown>;
            // String/numeric scroll wheel: base properties are nested under .base
            const nestedWheel = widget.ewi.kind === 'string_scroll_wheel'
                             || widget.ewi.kind === 'numeric_scroll_wheel';
            const base = nestedWheel ? (info['base'] as Record<string, unknown> | undefined) : undefined;
            const target: Record<string, unknown> =
                (base && key in base) ? base : info;
            if (key in target) {
                const cur = target[key];
                target[key] = typeof cur === 'boolean' ? Boolean(value)
                            : typeof cur === 'number'  ? Number(value)
                            : value;
            }
        }
        return;
    }

    // Style bit-flags
    if (field === 'style_visible')     { toggleStyleBit(widget, 0x00000001, Boolean(value)); return; }
    if (field === 'style_enabled')     { toggleStyleBit(widget, 0x00000002, Boolean(value)); return; }
    if (field === 'style_transparent') { toggleStyleBit(widget, 0x00000010, Boolean(value)); return; }
    if (field === 'border')            {
        widget.style = (widget.style & ~0x00000F00) | ((Number(value) & 0xF) << 8);
        return;
    }

    // Scalar fields
    const scalarFields: (keyof WidgetInfo)[] = [
        'app_name', 'id_name', 'base_name', 'user_data',
        'event_func', 'draw_func', 'callback_func', 'format_func',
    ];
    for (const f of scalarFields) {
        if (field === f) {
            (widget as unknown as Record<string, unknown>)[f] = String(value);
            return;
        }
    }
}

function toggleStyleBit(widget: WidgetInfo, bit: number, on: boolean): void {
    if (on) widget.style |= bit;
    else    widget.style &= ~bit;
}

// ---------------------------------------------------------------------------
// HTML building helpers
// ---------------------------------------------------------------------------

function group(title: string, rows: string[]): string {
    return `<div class="group-header">${escHtml(title)}</div>
<div class="group-body">${rows.join('')}</div>`;
}

function row(label: string, control: string): string {
    return `<div class="prop-row">
  <div class="prop-label">${escHtml(label)}</div>
  <div class="prop-value">${control}</div>
</div>`;
}

function textField(field: string, value: string): string {
    return `<input type="text" data-field="${escAttr(field)}" value="${escAttr(value)}">`;
}

function numField(field: string, value: number): string {
    return `<input type="number" data-field="${escAttr(field)}" value="${value}">`;
}

function checkField(field: string, checked: boolean): string {
    return `<input type="checkbox" data-field="${escAttr(field)}"${checked ? ' checked' : ''}>`;
}

function selectField(
    field: string,
    current: number,
    opts: ReadonlyArray<readonly [number, string]>,
): string {
    const optHtml = opts
        .map(([v, l]) => `<option value="${v}"${v === current ? ' selected' : ''}>${escHtml(l)}</option>`)
        .join('');
    return `<select data-field="${escAttr(field)}">${optHtml}</select>`;
}

// ---------------------------------------------------------------------------
// Resource option helpers
// ---------------------------------------------------------------------------

function resourceOpts(
    project: GxpProject | null,
    displayIdx: number,
    resType: number,
): ReadonlyArray<readonly [number, string]> {
    const result: Array<readonly [number, string]> = [[0, '(none)']];
    const resources = project?.displays[displayIdx]?.themes[0]?.resources;
    if (resources) {
        let id = 1;
        for (const res of resources) {
            if (res.type === resType) result.push([id++, res.name]);
        }
    }
    return result;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function generateNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        const arr = new Uint32Array(16);
        globalThis.crypto.getRandomValues(arr);
        for (const n of arr) result += chars[n % chars.length];
    } else {
        for (let i = 0; i < 32; i++) result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}
