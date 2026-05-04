/**
 * ScreenFlowEditor — VS Code WebviewView that renders the GUIX screen flow diagram.
 *
 * Ports guix_studio/screen_flow.cpp (CScrollView-based MFC diagram editor).
 *
 * Each display has a `ScreenFlowEntry[]` (one per screen).  Each entry holds a
 * list of `TriggerInfo` objects (events that cause navigation) and each trigger
 * holds a list of `ActionInfo` objects (what to do when the trigger fires).
 *
 * The webview renders an SVG diagram:
 *   • Each screen  → a rounded rectangle box
 *   • Each trigger → an arrow from source screen to target screen
 *   • Boxes are draggable; position is persisted back to `flowLayout`
 *
 * Diagram state (box positions + zoom) is stored in `flowLayout` per display.
 * It is not part of the .gxp format; it lives in extension state only.
 */

import * as vscode from 'vscode';
import { injectable } from 'inversify';
import { GxpProject, DisplayInfo, ScreenFlowEntry } from '../common/project-model';

// ---------------------------------------------------------------------------
// Screen-flow data types
// (mirrors flow_item / trigger_info / action_info in screen_flow.cpp)
// ---------------------------------------------------------------------------

export const enum TriggerType {
    SystemEvent = 0,
    Signal      = 1,
    UserEvent   = 2,
}

export const enum ActionType {
    ScreenShow        = 0,
    ScreenHide        = 1,
    ScreenToggle      = 2,
    ScreenAttach      = 3,
    AnimationExecute  = 4,
}

export interface ActionInfo {
    action_type: ActionType;
    action_name: string;
    parent_widget_name: string;
    target_widget_name: string;
    animation_id_name: string;
}

export interface TriggerInfo {
    trigger_name: string;
    trigger_type: TriggerType;
    /** GX_EVENT_* constant (0 if signal or user event) */
    event_type: number;
    signal_id_name: string;
    user_event_id_name: string;
    actions: ActionInfo[];
}

export interface FlowItem {
    screen_name: string;
    triggers: TriggerInfo[];
    enabled: boolean;
}

/** Per-display layout state (box positions + zoom) — not in .gxp */
export interface FlowLayout {
    scale: number;
    positions: Record<string, { x: number; y: number }>;
}

// ---------------------------------------------------------------------------
// Helper — convert ScreenFlowEntry[] from project model to FlowItem[]
// ---------------------------------------------------------------------------

function toFlowItems(entries: ScreenFlowEntry[]): FlowItem[] {
    return entries.map(e => ({
        screen_name: e.screen_name,
        // trigger_list is stored as unknown[] in the base model (typed here at the panel layer)
        triggers: (e.trigger_list as TriggerInfo[]) ?? [],
        enabled: true,
    }));
}

// ---------------------------------------------------------------------------
// ScreenFlowEditor
// ---------------------------------------------------------------------------

@injectable()
export class ScreenFlowEditor implements vscode.WebviewViewProvider {

    static readonly viewId = 'guixStudio.screenFlowEditor';

    private view: vscode.WebviewView | undefined;
    private project: GxpProject | null = null;
    private displayIndex = 0;

    /** Per-display layout (positions + zoom), keyed by display index */
    private layouts: Map<number, FlowLayout> = new Map();

    // ── Project lifecycle ──────────────────────────────────────────────────

    openProject(project: GxpProject): void {
        this.project      = project;
        this.displayIndex = 0;
        this.layouts.clear();
        this.updateView();
    }

    closeProject(): void {
        this.project = null;
        this.layouts.clear();
        this.updateView();
    }

    selectDisplay(index: number): void {
        this.displayIndex = index;
        this.updateView();
    }

    /** Called when a screen was renamed — update diagram labels. */
    updateScreenName(oldName: string, newName: string): void {
        // Update layout key if it existed
        for (const layout of this.layouts.values()) {
            if (oldName in layout.positions) {
                layout.positions[newName] = layout.positions[oldName];
                delete layout.positions[oldName];
            }
        }
        this.updateView();
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

    private get activeDisplay(): DisplayInfo | null {
        return this.project?.displays[this.displayIndex] ?? null;
    }

    private layoutFor(displayIndex: number): FlowLayout {
        let l = this.layouts.get(displayIndex);
        if (!l) {
            l = { scale: 100, positions: {} };
            this.layouts.set(displayIndex, l);
        }
        return l;
    }

    private updateView(): void {
        if (!this.view) return;
        const disp   = this.activeDisplay;
        const items  = disp ? toFlowItems(disp.screen_flow) : [];
        const layout = this.layoutFor(this.displayIndex);
        this.view.webview.html = buildDiagramHtml(items, layout);
    }

    private onMessage(msg: unknown): void {
        if (typeof msg !== 'object' || msg === null) return;
        const m = msg as Record<string, unknown>;

        switch (m['type']) {
            case 'move': {
                // User dragged a box
                const name = String(m['name'] ?? '');
                const x    = Number(m['x'] ?? 0);
                const y    = Number(m['y'] ?? 0);
                const layout = this.layoutFor(this.displayIndex);
                layout.positions[name] = { x, y };
                break;
            }
            case 'zoom': {
                const layout = this.layoutFor(this.displayIndex);
                layout.scale = Math.max(25, Math.min(400, Number(m['scale'] ?? 100)));
                break;
            }
            default:
                break;
        }
    }
}

// ---------------------------------------------------------------------------
// SVG diagram builder
// ---------------------------------------------------------------------------

/** Fixed box dimensions — mirrors CRect in screen_flow.cpp */
const BOX_W   = 120;
const BOX_H   = 60;
const PAD_X   = 180;
const PAD_Y   = 100;
const COLS    = 4;    // default wrapping column count

function buildDiagramHtml(items: FlowItem[], layout: FlowLayout): string {
    const nonce = generateNonce();
    const csp   = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;

    if (items.length === 0) {
        return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
</head><body style="font-family:var(--vscode-font-family);color:var(--vscode-foreground);
background:var(--vscode-editor-background);padding:12px">
<p style="color:var(--vscode-descriptionForeground);font-size:11px">
No screen flow data. Open a project with screen flow entries.</p>
</body></html>`;
    }

    // Assign default positions if not in layout
    items.forEach((item, i) => {
        if (!layout.positions[item.screen_name]) {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            layout.positions[item.screen_name] = {
                x: 20 + col * PAD_X,
                y: 20 + row * PAD_Y,
            };
        }
    });

    // Build adjacency list for arrows: source screen → target screens per trigger
    interface Arrow { from: string; to: string; label: string; }
    const arrows: Arrow[] = [];
    for (const item of items) {
        for (const trigger of item.triggers) {
            for (const action of trigger.actions) {
                if (action.target_widget_name) {
                    arrows.push({
                        from:  item.screen_name,
                        to:    action.target_widget_name,
                        label: trigger.trigger_name || eventLabel(trigger),
                    });
                }
            }
        }
    }

    const itemsJson  = JSON.stringify(items);
    const arrowsJson = JSON.stringify(arrows);
    const layoutJson = JSON.stringify(layout);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style nonce="${nonce}">
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--vscode-font-family);
  background: var(--vscode-editor-background);
  color: var(--vscode-foreground);
  overflow: hidden; height: 100vh;
}
#toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 8px; font-size: 11px;
  background: var(--vscode-sideBar-background);
  border-bottom: 1px solid var(--vscode-panel-border);
}
#toolbar select, #toolbar button {
  font-size: 11px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, #444);
  padding: 1px 6px; border-radius: 2px; cursor: pointer;
}
#canvas-wrap { flex: 1; overflow: auto; width: 100%; height: calc(100vh - 28px); }
svg { display: block; }
.box {
  cursor: move;
}
.box rect {
  fill: var(--vscode-editor-background, #1e1e1e);
  stroke: var(--vscode-focusBorder, #0078d4);
  stroke-width: 1.5; rx: 6; ry: 6;
  filter: drop-shadow(2px 2px 4px rgba(0,0,0,.4));
}
.box.disabled rect { stroke: #666; opacity: 0.5; }
.box text {
  font-family: var(--vscode-font-family);
  font-size: 11px;
  fill: var(--vscode-editor-foreground, #d4d4d4);
  pointer-events: none;
}
.arrow { fill: none; stroke: #4d9de0; stroke-width: 1.5; marker-end: url(#arrowhead); }
.arrow-label { font-size: 9px; fill: #888; pointer-events: none; }
</style>
</head>
<body>
<div id="toolbar">
  <span>Screen Flow</span>
  <label>Zoom:</label>
  <select id="zoom-sel">
    <option value="50">50%</option>
    <option value="75">75%</option>
    <option value="100" selected>100%</option>
    <option value="150">150%</option>
    <option value="200">200%</option>
  </select>
</div>
<div id="canvas-wrap">
  <svg id="flow-svg" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill="#4d9de0"/>
      </marker>
    </defs>
    <g id="root" transform="scale(1)">
      <g id="arrows-layer"></g>
      <g id="boxes-layer"></g>
    </g>
  </svg>
</div>

<script nonce="${nonce}">
(function() {
  'use strict';

  const ITEMS   = ${itemsJson};
  const ARROWS  = ${arrowsJson};
  const LAYOUT  = ${layoutJson};
  const BOX_W   = ${BOX_W};
  const BOX_H   = ${BOX_H};

  const vscode  = acquireVsCodeApi();
  const svg     = document.getElementById('flow-svg');
  const root    = document.getElementById('root');
  const arrowsL = document.getElementById('arrows-layer');
  const boxesL  = document.getElementById('boxes-layer');
  const zoomSel = document.getElementById('zoom-sel');
  const wrap    = document.getElementById('canvas-wrap');

  const SVG_NS = 'http://www.w3.org/2000/svg';
  let scale = (LAYOUT.scale || 100) / 100;

  // Position registry
  const pos = {};
  ITEMS.forEach(function(item) {
    var p = LAYOUT.positions[item.screen_name];
    pos[item.screen_name] = p ? { x: p.x, y: p.y } : { x: 20, y: 20 };
  });

  // ── Drag state ─────────────────────────────────────────────────────────
  let dragItem = null, dragOffX = 0, dragOffY = 0;

  // ── Build diagram ──────────────────────────────────────────────────────
  function render() {
    arrowsL.innerHTML = '';
    boxesL.innerHTML  = '';
    root.setAttribute('transform', 'scale(' + scale + ')');

    // Calculate SVG viewBox to encompass all boxes
    var maxX = 40, maxY = 40;
    ITEMS.forEach(function(item) {
      var p = pos[item.screen_name];
      maxX = Math.max(maxX, p.x + BOX_W + 20);
      maxY = Math.max(maxY, p.y + BOX_H + 20);
    });
    svg.setAttribute('width',  String(Math.round(maxX * scale)));
    svg.setAttribute('height', String(Math.round(maxY * scale)));
    svg.setAttribute('viewBox', '0 0 ' + maxX + ' ' + maxY);

    // Arrows first (below boxes)
    ARROWS.forEach(function(arrow) {
      var from = pos[arrow.from];
      var to   = pos[arrow.to];
      if (!from || !to) return;
      var x1 = from.x + BOX_W / 2, y1 = from.y + BOX_H;
      var x2 = to.x   + BOX_W / 2, y2 = to.y;
      if (arrow.from === arrow.to) {
        // Self-loop
        var cx = x1 + BOX_W / 2 + 30;
        var cy = from.y + BOX_H / 2;
        var path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('class', 'arrow');
        path.setAttribute('d', 'M ' + x1 + ' ' + (from.y + BOX_H/2) +
          ' C ' + cx + ' ' + (cy - 20) + ', ' + cx + ' ' + (cy + 20) + ', ' +
          x1 + ' ' + (from.y + BOX_H/2));
        arrowsL.appendChild(path);
      } else {
        var line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('class', 'arrow');
        line.setAttribute('x1', String(x1));
        line.setAttribute('y1', String(y1));
        line.setAttribute('x2', String(x2));
        line.setAttribute('y2', String(y2));
        arrowsL.appendChild(line);
        if (arrow.label) {
          var lbl = document.createElementNS(SVG_NS, 'text');
          lbl.setAttribute('class', 'arrow-label');
          lbl.setAttribute('x', String((x1 + x2) / 2 + 4));
          lbl.setAttribute('y', String((y1 + y2) / 2 - 4));
          lbl.textContent = arrow.label;
          arrowsL.appendChild(lbl);
        }
      }
    });

    // Boxes
    ITEMS.forEach(function(item) {
      var p  = pos[item.screen_name];
      var g  = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'box' + (item.enabled ? '' : ' disabled'));
      g.setAttribute('data-name', item.screen_name);

      var rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(p.x));
      rect.setAttribute('y', String(p.y));
      rect.setAttribute('width',  String(BOX_W));
      rect.setAttribute('height', String(BOX_H));
      rect.setAttribute('rx', '6'); rect.setAttribute('ry', '6');

      var txt = document.createElementNS(SVG_NS, 'text');
      txt.setAttribute('x', String(p.x + BOX_W / 2));
      txt.setAttribute('y', String(p.y + BOX_H / 2 + 4));
      txt.setAttribute('text-anchor', 'middle');
      txt.textContent = item.screen_name;

      var trigsLabel = document.createElementNS(SVG_NS, 'text');
      trigsLabel.setAttribute('x', String(p.x + BOX_W / 2));
      trigsLabel.setAttribute('y', String(p.y + BOX_H - 8));
      trigsLabel.setAttribute('text-anchor', 'middle');
      trigsLabel.setAttribute('style', 'font-size:8px;fill:#888');
      trigsLabel.textContent = item.triggers.length + ' trigger' + (item.triggers.length !== 1 ? 's' : '');

      g.appendChild(rect);
      g.appendChild(txt);
      g.appendChild(trigsLabel);
      boxesL.appendChild(g);

      // Drag
      g.addEventListener('pointerdown', function(e) {
        e.stopPropagation();
        dragItem  = item.screen_name;
        var pt    = svgPoint(e.clientX, e.clientY);
        dragOffX  = pt.x - p.x;
        dragOffY  = pt.y - p.y;
        g.setPointerCapture(e.pointerId);
      });
      g.addEventListener('pointermove', function(e) {
        if (dragItem !== item.screen_name) return;
        var pt = svgPoint(e.clientX, e.clientY);
        pos[item.screen_name].x = Math.max(0, pt.x - dragOffX);
        pos[item.screen_name].y = Math.max(0, pt.y - dragOffY);
        render();
      });
      g.addEventListener('pointerup', function() {
        if (dragItem !== item.screen_name) return;
        dragItem = null;
        vscode.postMessage({ type: 'move', name: item.screen_name,
          x: pos[item.screen_name].x, y: pos[item.screen_name].y });
      });
    });
  }

  function svgPoint(clientX, clientY) {
    var pt  = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    var ctm = root.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()) : pt;
  }

  // Zoom control
  zoomSel.addEventListener('change', function() {
    scale = Number(zoomSel.value) / 100;
    vscode.postMessage({ type: 'zoom', scale: Number(zoomSel.value) });
    render();
  });
  // Set zoom selector to match persisted layout
  zoomSel.value = String(LAYOUT.scale || 100);

  render();
}());
</script>
</body>
</html>`;
}

function eventLabel(trigger: TriggerInfo): string {
    switch (trigger.trigger_type) {
        case TriggerType.SystemEvent: return `sys:${trigger.event_type}`;
        case TriggerType.Signal:      return trigger.signal_id_name      || 'signal';
        case TriggerType.UserEvent:   return trigger.user_event_id_name  || 'user_event';
        default:                      return 'trigger';
    }
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
