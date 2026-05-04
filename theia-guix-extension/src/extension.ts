/**
 * GUIX Studio Theia Extension — activation entry point.
 *
 * Registers the custom editor for `.gxp` files, wires up commands, and
 * provides the DI container root for all GUIX Studio services.
 */

import * as vscode from 'vscode';
import { Container } from 'inversify';
import 'reflect-metadata';

import { GxpReader } from './io/gxp-reader';
import { GxpWriter } from './io/gxp-writer';
import { SnapEngine } from './canvas/snap-engine';
import { SelectionManager } from './canvas/selection-manager';
import { ProjectView } from './panels/project-view';
import { PropertyPanel } from './panels/property-panel';
import { ResourcePanel } from './panels/resource-panel';
import { ScreenFlowEditor } from './panels/screen-flow-editor';
import { ResourceGenerator } from './codegen/resource-generator';
import { ScreenGenerator } from './codegen/screen-generator';
import { BinaryResourceGenerator, BINARY_FORMAT_RAW, BINARY_FORMAT_SREC } from './codegen/binary-resource-generator';
import { UndoManager } from './commands/undo-manager';
import { WidgetRegistry } from './widgets/widget-registry';
import { StringTable } from './i18n/string-table';
import {
    GxpReaderToken,
    GxpWriterToken,
    SnapEngineToken,
    SelectionManagerToken,
    ProjectViewToken,
    PropertyPanelToken,
    ResourcePanelToken,
    ScreenFlowEditorToken,
    ResourceGeneratorToken,
    ScreenGeneratorToken,
    BinaryResourceGeneratorToken,
    UndoManagerToken,
    WidgetRegistryToken,
    StringTableToken,
} from './di-tokens';
import type { GxpProject } from './common/project-model';

// ---------------------------------------------------------------------------
// DI container (root scope, one per extension host)
// ---------------------------------------------------------------------------

const container = new Container({ defaultScope: 'Singleton' });
container.bind(GxpReaderToken).to(GxpReader);
container.bind(GxpWriterToken).to(GxpWriter);
container.bind(SnapEngineToken).to(SnapEngine);
container.bind(SelectionManagerToken).to(SelectionManager);
container.bind(ProjectViewToken).to(ProjectView);
container.bind(PropertyPanelToken).to(PropertyPanel);
container.bind(ResourcePanelToken).to(ResourcePanel);
container.bind(ScreenFlowEditorToken).to(ScreenFlowEditor);
container.bind(ResourceGeneratorToken).to(ResourceGenerator);
container.bind(ScreenGeneratorToken).to(ScreenGenerator);
container.bind(BinaryResourceGeneratorToken).to(BinaryResourceGenerator);
container.bind(UndoManagerToken).to(UndoManager);
container.bind(WidgetRegistryToken).to(WidgetRegistry);
container.bind(StringTableToken).to(StringTable);

// ---------------------------------------------------------------------------
// Extension state
// ---------------------------------------------------------------------------

/** Map from document URI to the parsed project model. */
const openProjects = new Map<string, GxpProject>();

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
    const reader          = container.get<GxpReader>(GxpReaderToken);
    const writer          = container.get<GxpWriter>(GxpWriterToken);
    const projectView     = container.get<ProjectView>(ProjectViewToken);
    const propertyPanel   = container.get<PropertyPanel>(PropertyPanelToken);
    const resourcePanel   = container.get<ResourcePanel>(ResourcePanelToken);
    const screenFlow      = container.get<ScreenFlowEditor>(ScreenFlowEditorToken);
    const resGen          = container.get<ResourceGenerator>(ResourceGeneratorToken);
    const screenGen       = container.get<ScreenGenerator>(ScreenGeneratorToken);
    const binGen          = container.get<BinaryResourceGenerator>(BinaryResourceGeneratorToken);
    const undoMgr         = container.get<UndoManager>(UndoManagerToken);

    // ----- Tree views -----------------------------------------------------
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('guixStudio.projectView', projectView),
        vscode.window.registerTreeDataProvider('guixStudio.resourcePanel', resourcePanel),
    );

    // ----- Webview view providers -----------------------------------------
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(PropertyPanel.viewId, propertyPanel, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
        vscode.window.registerWebviewViewProvider(ScreenFlowEditor.viewId, screenFlow, {
            webviewOptions: { retainContextWhenHidden: false },
        }),
    );

    // ----- Custom editor provider ----------------------------------------
    const provider = new GxpEditorProvider(
        context, reader, writer, openProjects,
        projectView, resourcePanel, screenFlow, propertyPanel,
    );
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider('guixStudio.gxpEditor', provider, {
            webviewOptions: { retainContextWhenHidden: true },
            supportsMultipleEditorsPerDocument: false,
        })
    );

    // ----- Generate C Code -----------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('guixStudio.generateCode', async () => {
            const uri     = activeDocumentUri();
            const project = uri ? openProjects.get(uri) : undefined;
            if (!project) {
                void vscode.window.showWarningMessage('No GUIX project open.');
                return;
            }
            const outDir = project.header.source_path || project.header.project_path;
            const generated: string[] = [];
            try {
                for (let i = 0; i < project.displays.length; i++) {
                    const rf = resGen.generate(project, i);
                    const sf = screenGen.generate(project, i);
                    for (const f of [rf.header, rf.source, sf.header, sf.source]) {
                        await writeTextFile(outDir, f.filename, f.content);
                        generated.push(f.filename);
                    }
                }
                void vscode.window.showInformationMessage(
                    `Generated: ${generated.join(', ')}`
                );
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                void vscode.window.showErrorMessage(`Code generation failed: ${msg}`);
            }
        })
    );

    // ----- Generate Binary -----------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('guixStudio.generateBinary', async () => {
            const uri     = activeDocumentUri();
            const project = uri ? openProjects.get(uri) : undefined;
            if (!project) {
                void vscode.window.showWarningMessage('No GUIX project open.');
                return;
            }
            const fmt    = project.header.binary_file_format === 1 ? BINARY_FORMAT_SREC : BINARY_FORMAT_RAW;
            const outDir = project.header.resource_path || project.header.project_path;
            try {
                for (let i = 0; i < project.displays.length; i++) {
                    const bf = binGen.generate(project, i, fmt);
                    await writeBinaryFile(outDir, bf.filename, bf.content);
                    if (bf.srec) {
                        await writeTextFile(outDir, bf.filename.replace(/\.bin$/, '.srec'), bf.srec);
                    }
                }
                void vscode.window.showInformationMessage('Binary resources generated.');
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                void vscode.window.showErrorMessage(`Binary generation failed: ${msg}`);
            }
        })
    );

    // ----- Select display -------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('guixStudio.selectDisplay', async () => {
            const uri     = activeDocumentUri();
            const project = uri ? openProjects.get(uri) : undefined;
            if (!project) return;
            const items = project.displays.map((d, i) => ({
                label: d.name,
                description: `${d.xres}×${d.yres}`,
                index: i,
            }));
            const pick = await vscode.window.showQuickPick(items, { title: 'Select Display' });
            if (!pick) return;
            resourcePanel.selectDisplay(pick.index);
            screenFlow.selectDisplay(pick.index);
        })
    );

    // ----- Select theme ---------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('guixStudio.selectTheme', async () => {
            const uri     = activeDocumentUri();
            const project = uri ? openProjects.get(uri) : undefined;
            if (!project) return;
            const dispIdx = 0; // TODO: track active display per editor
            const disp = project.displays[dispIdx];
            if (!disp) return;
            const items = disp.themes.map((t, i) => ({ label: t.theme_name, index: i }));
            const pick = await vscode.window.showQuickPick(items, { title: 'Select Theme' });
            if (!pick) return;
            resourcePanel.selectTheme(pick.index);
        })
    );

    // ----- Undo / Redo ---------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('guixStudio.undo', () => {
            const uri     = activeDocumentUri();
            const project = uri ? openProjects.get(uri) : undefined;
            if (!project) return;
            if (!undoMgr.canUndo()) {
                void vscode.window.showInformationMessage('Nothing to undo.');
                return;
            }
            undoMgr.undo(project);
        }),
        vscode.commands.registerCommand('guixStudio.redo', () => {
            const uri     = activeDocumentUri();
            const project = uri ? openProjects.get(uri) : undefined;
            if (!project) return;
            if (!undoMgr.canRedo()) {
                void vscode.window.showInformationMessage('Nothing to redo.');
                return;
            }
            undoMgr.redo(project);
        }),
        vscode.commands.registerCommand('guixStudio.addDisplay', () => {
            void vscode.window.showInformationMessage('Add Display — not yet implemented.');
        }),
    );

    console.log('[GUIX Studio] Extension activated.');
}

export function deactivate(): void {
    openProjects.clear();
}

// ---------------------------------------------------------------------------
// GxpEditorProvider — CustomTextEditorProvider for *.gxp files
// ---------------------------------------------------------------------------

class GxpEditorProvider implements vscode.CustomTextEditorProvider {

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly reader: GxpReader,
        private readonly writer: GxpWriter,
        private readonly projects: Map<string, GxpProject>,
        private readonly projectView: ProjectView,
        private readonly resourcePanel: ResourcePanel,
        private readonly screenFlow: ScreenFlowEditor,
        private readonly propertyPanel: PropertyPanel,
    ) {}

    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        const uri = document.uri.toString();

        // Parse the project
        let project: GxpProject;
        try {
            project = this.reader.readProject(document.getText(), document.uri.fsPath);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            void vscode.window.showErrorMessage(`Failed to open GUIX project: ${msg}`);
            return;
        }

        this.projects.set(uri, project);
        await vscode.commands.executeCommand('setContext', 'guixStudio.projectOpen', true);

        // Notify panels
        this.projectView.openProject(project);
        this.resourcePanel.openProject(project);
        this.screenFlow.openProject(project);

        // Set up the webview content
        webviewPanel.webview.options = { enableScripts: true };
        webviewPanel.webview.html = this.buildWebviewHtml(webviewPanel.webview, project);

        // Keep project in sync with document edits (external changes)
        const changeDocSub = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() !== uri) return;
            try {
                const updated = this.reader.readProject(
                    e.document.getText(),
                    e.document.uri.fsPath,
                );
                this.projects.set(uri, updated);
                webviewPanel.webview.html = this.buildWebviewHtml(webviewPanel.webview, updated);
            } catch {
                // silently ignore transient parse errors during typing
            }
        });

        webviewPanel.onDidDispose(() => {
            changeDocSub.dispose();
            this.projects.delete(uri);
            // If no more projects open, clear context and close panels
            if (this.projects.size === 0) {
                void vscode.commands.executeCommand('setContext', 'guixStudio.projectOpen', false);
                this.projectView.closeProject();
                this.resourcePanel.closeProject();
                this.screenFlow.closeProject();
            }
        });

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(
            (msg: unknown) => this.handleWebviewMessage(document, msg),
            undefined,
            this.context.subscriptions,
        );
    }

    // -------------------------------------------------------------------------
    // Webview HTML
    // -------------------------------------------------------------------------

    private buildWebviewHtml(
        webview: vscode.Webview,
        project: GxpProject,
    ): string {
        const nonce = generateNonce();
        const csp = [
            `default-src 'none'`,
            `style-src ${webview.cspSource} 'nonce-${nonce}'`,
            `script-src 'nonce-${nonce}'`,
        ].join('; ');

        const projectName  = escapeHtml(project.header.project_name || '(unnamed)');
        const version      = project.header.project_version;

        // Serialise all displays as a JSON blob for the webview renderer
        const displaysJson = JSON.stringify(
            project.displays.map(d => ({
                name:    d.name,
                xres:    d.xres,
                yres:    d.yres,
                folders: d.folders.map(f => ({
                    folder_name: f.folder_name,
                    widgets: serializeWidgets(f.widgets),
                })),
            }))
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GUIX Studio — ${projectName}</title>
<style nonce="${nonce}">
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    display: flex; flex-direction: column; height: 100vh; overflow: hidden;
  }
  #toolbar {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 8px;
    background: var(--vscode-sideBar-background);
    border-bottom: 1px solid var(--vscode-panel-border);
    font-size: 12px; flex-shrink: 0;
  }
  #toolbar select, #toolbar button {
    font-size: 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #444);
    padding: 2px 6px; border-radius: 2px; cursor: pointer;
  }
  #canvas-wrap {
    flex: 1; overflow: auto; display: flex;
    justify-content: center; align-items: flex-start;
    padding: 16px;
  }
  #design-canvas {
    display: block;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    cursor: default;
  }
  #statusbar {
    padding: 2px 8px; font-size: 11px;
    background: var(--vscode-statusBar-background);
    color: var(--vscode-statusBar-foreground);
    flex-shrink: 0;
  }
</style>
</head>
<body>
<div id="toolbar">
  <span><strong>${projectName}</strong> &nbsp;<span style="opacity:0.6">v${version}</span></span>
  <label for="display-select">Display:</label>
  <select id="display-select"></select>
  <label for="zoom-select">Zoom:</label>
  <select id="zoom-select">
    <option value="50">50%</option>
    <option value="75">75%</option>
    <option value="100" selected>100%</option>
    <option value="150">150%</option>
    <option value="200">200%</option>
  </select>
</div>
<div id="canvas-wrap">
  <canvas id="design-canvas"></canvas>
</div>
<div id="statusbar" id="statusbar">Ready</div>

<script nonce="${nonce}">
(function() {
  'use strict';

  // ── Project data (injected server-side) ────────────────────────────────
  const DISPLAYS = ${displaysJson};

  // ── State ──────────────────────────────────────────────────────────────
  let activeDisplay = DISPLAYS[0] || null;
  let zoomScale     = 100;
  let dashPattern   = 0b11001100110011001100110011001100;
  const selected    = [];   // array of widget objects
  let dragMode      = 0;    // 0=none, 1-8=resize corners/edges, 9=move
  let dragStart     = { x: 0, y: 0 };
  let dragTarget    = null;

  const DRAG_NONE=0,DRAG_TL=1,DRAG_T=2,DRAG_TR=3,DRAG_R=4,
        DRAG_BR=5,DRAG_B=6,DRAG_BL=7,DRAG_L=8,DRAG_ALL=9;
  const HANDLE_SIZE = 5;
  const MIN_SIZE    = 4;

  // ── DOM refs ───────────────────────────────────────────────────────────
  const canvas  = document.getElementById('design-canvas');
  const ctx     = canvas.getContext('2d');
  const dispSel = document.getElementById('display-select');
  const zoomSel = document.getElementById('zoom-select');
  const status  = document.getElementById('statusbar');

  // ── Populate display selector ──────────────────────────────────────────
  DISPLAYS.forEach(function(d, i) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = d.name + ' (' + d.xres + '×' + d.yres + ')';
    dispSel.appendChild(opt);
  });

  dispSel.addEventListener('change', function() {
    activeDisplay = DISPLAYS[Number(dispSel.value)] || null;
    selected.length = 0;
    resetSize();
    render();
  });

  zoomSel.addEventListener('change', function() {
    zoomScale = Number(zoomSel.value);
    resetSize();
    render();
  });

  // ── Helpers ────────────────────────────────────────────────────────────
  function toCanvas(sx, sy) {
    return { x: Math.round(sx * 100 / zoomScale), y: Math.round(sy * 100 / zoomScale) };
  }
  function toScreen(cx, cy) {
    return { x: Math.round(cx * zoomScale / 100), y: Math.round(cy * zoomScale / 100) };
  }
  function ss(v) { return Math.round(v * zoomScale / 100); }

  function collectWidgets(folders) {
    const all = [];
    function walk(w) { all.push(w); (w.children||[]).forEach(walk); }
    folders.forEach(function(f) { (f.widgets||[]).forEach(walk); });
    return all;
  }

  function allWidgets() {
    return activeDisplay ? collectWidgets(activeDisplay.folders) : [];
  }

  function pointInRect(px, py, r) {
    return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
  }

  function widgetColor(t) {
    if (t >= 128) return '#3a6cae';
    if (t >= 64)  return '#7a4ea0';
    if (t >= 30)  return '#2e8b57';
    if (t >= 20)  return '#a06020';
    if (t >= 2)   return '#8b2020';
    return '#444';
  }

  function expandRect(r, by) {
    return { left:r.left-by, top:r.top-by, right:r.right+by, bottom:r.bottom+by };
  }

  function resetSize() {
    if (!activeDisplay) return;
    canvas.width  = ss(activeDisplay.xres);
    canvas.height = ss(activeDisplay.yres);
  }

  // ── Hit-test ───────────────────────────────────────────────────────────
  function hitTest(cx, cy) {
    if (!activeDisplay) return null;
    function walkFind(w) {
      for (let i = (w.children||[]).length - 1; i >= 0; i--) {
        const hit = walkFind(w.children[i]);
        if (hit) return hit;
      }
      return pointInRect(cx, cy, w.size) ? w : null;
    }
    const folders = activeDisplay.folders;
    for (let fi = folders.length-1; fi >= 0; fi--) {
      const ws = folders[fi].widgets || [];
      for (let wi = ws.length-1; wi >= 0; wi--) {
        const hit = walkFind(ws[wi]);
        if (hit) return hit;
      }
    }
    return null;
  }

  // ── Handle hit-test ────────────────────────────────────────────────────
  function hitTestHandle(cx, cy) {
    if (selected.length === 0) return DRAG_NONE;
    const w     = selected[0];
    const inner = w.size;
    const outer = expandRect(inner, HANDLE_SIZE);
    if (!pointInRect(cx, cy, outer) || pointInRect(cx, cy, inner)) return DRAG_NONE;
    if (cy < inner.top) {
      if (cx < inner.left)  return DRAG_TL;
      if (cx > inner.right) return DRAG_TR;
      return DRAG_T;
    }
    if (cy > inner.bottom) {
      if (cx < inner.left)  return DRAG_BL;
      if (cx > inner.right) return DRAG_BR;
      return DRAG_B;
    }
    return cx < inner.left ? DRAG_L : DRAG_R;
  }

  function cursorForMode(m) {
    const map = ['default','nw-resize','n-resize','ne-resize','e-resize',
                 'se-resize','s-resize','sw-resize','w-resize','move'];
    return map[m] || 'default';
  }

  // ── Resize rect ────────────────────────────────────────────────────────
  function applyResize(r, m, dx, dy) {
    const s = Object.assign({}, r);
    if (m===DRAG_TL||m===DRAG_L||m===DRAG_BL) s.left   += dx;
    if (m===DRAG_TR||m===DRAG_R||m===DRAG_BR) s.right  += dx;
    if (m===DRAG_TL||m===DRAG_T||m===DRAG_TR) s.top    += dy;
    if (m===DRAG_BL||m===DRAG_B||m===DRAG_BR) s.bottom += dy;
    return s;
  }

  // ── Render ─────────────────────────────────────────────────────────────
  function render() {
    if (!activeDisplay) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#2d2d2d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Light grid
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const step = ss(20);
    if (step >= 4) {
      ctx.beginPath();
      for (let x=0; x<=canvas.width; x+=step) { ctx.moveTo(x+0.5,0); ctx.lineTo(x+0.5,canvas.height); }
      for (let y=0; y<=canvas.height; y+=step) { ctx.moveTo(0,y+0.5); ctx.lineTo(canvas.width,y+0.5); }
      ctx.stroke();
    }
    ctx.restore();

    // Widgets
    function drawWidget(w) {
      const tl = toScreen(w.size.left, w.size.top);
      const br = toScreen(w.size.right, w.size.bottom);
      const sw = br.x - tl.x, sh = br.y - tl.y;
      ctx.save();
      ctx.fillStyle = widgetColor(w.basetype||1);
      ctx.globalAlpha = 0.6;
      ctx.fillRect(tl.x, tl.y, sw, sh);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(tl.x+0.5, tl.y+0.5, sw-1, sh-1);
      if (sw > 20 && sh > 10) {
        const fs = Math.max(9, Math.min(12, ss(11)));
        ctx.font = fs + 'px monospace';
        ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.globalAlpha = 0.9;
        ctx.fillText(w.app_name || w.base_name || '', tl.x+sw/2, tl.y+sh/2, sw-4);
      }
      ctx.restore();
      (w.children||[]).forEach(drawWidget);
    }
    activeDisplay.folders.forEach(function(f) { (f.widgets||[]).forEach(drawWidget); });

    // Selection overlay
    const dashLen = 4;
    const dashBit = (dashPattern >>> 28) & 0xF;
    const dashOn  = dashBit > 7 ? dashLen : dashLen;
    selected.forEach(function(w) {
      const tl = toScreen(w.size.left, w.size.top);
      const br = toScreen(w.size.right, w.size.bottom);
      const sw = br.x-tl.x, sh = br.y-tl.y;
      ctx.save();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      ctx.setLineDash([dashLen, dashLen]);
      ctx.strokeRect(tl.x+0.5, tl.y+0.5, sw-1, sh-1);
      ctx.restore();

      // Handles
      const hs = Math.max(4, ss(HANDLE_SIZE));
      [[tl.x,tl.y],[tl.x+sw/2,tl.y],[tl.x+sw,tl.y],
       [tl.x+sw,tl.y+sh/2],[tl.x+sw,tl.y+sh],[tl.x+sw/2,tl.y+sh],
       [tl.x,tl.y+sh],[tl.x,tl.y+sh/2]].forEach(function(pt) {
        ctx.fillStyle='#ffffff'; ctx.strokeStyle='#000'; ctx.lineWidth=1;
        ctx.fillRect(pt[0]-hs/2, pt[1]-hs/2, hs, hs);
        ctx.strokeRect(pt[0]-hs/2, pt[1]-hs/2, hs, hs);
      });
    });
  }

  // ── Selection blink ────────────────────────────────────────────────────
  setInterval(function() {
    if (selected.length === 0) return;
    const temp = dashPattern & 0x03;
    dashPattern = ((dashPattern >>> 2) | (temp << 30)) >>> 0;
    render();
  }, 500);

  // ── Pointer events ─────────────────────────────────────────────────────
  canvas.addEventListener('pointerdown', function(e) {
    const { x, y } = toCanvas(e.offsetX, e.offsetY);
    canvas.setPointerCapture(e.pointerId);

    const handleMode = hitTestHandle(x, y);
    if (handleMode !== DRAG_NONE) {
      dragMode = handleMode;
      dragStart = { x, y };
      dragTarget = selected[0] || null;
      return;
    }

    const hit = hitTest(x, y);
    if (hit) {
      if (!e.ctrlKey && !e.metaKey) selected.length = 0;
      if (!selected.includes(hit)) selected.push(hit);
      dragMode = DRAG_ALL; dragStart = { x, y }; dragTarget = hit;
      notifySelection();
    } else {
      selected.length = 0;
      notifySelection();
    }
    render();
  });

  canvas.addEventListener('pointermove', function(e) {
    const { x, y } = toCanvas(e.offsetX, e.offsetY);
    if (dragMode === DRAG_NONE) {
      canvas.style.cursor = cursorForMode(hitTestHandle(x, y));
      return;
    }
    if (!dragTarget) return;

    let dx = x - dragStart.x;
    let dy = y - dragStart.y;
    if (!dx && !dy) return;

    if (dragMode === DRAG_ALL) {
      dragStart = { x: dragStart.x+dx, y: dragStart.y+dy };
      selected.forEach(function(w) {
        w.size.left   += dx; w.size.right  += dx;
        w.size.top    += dy; w.size.bottom += dy;
      });
    } else {
      const nr = applyResize(dragTarget.size, dragMode, dx, dy);
      if ((nr.right-nr.left+1) < MIN_SIZE || (nr.bottom-nr.top+1) < MIN_SIZE) return;
      dragStart = { x: dragStart.x+dx, y: dragStart.y+dy };
      Object.assign(dragTarget.size, nr);
    }

    const w = dragTarget;
    status.textContent = w.app_name + '  [' + w.size.left + ', ' + w.size.top + ', ' + w.size.right + ', ' + w.size.bottom + ']';
    render();
  });

  canvas.addEventListener('pointerup', function() {
    dragMode = DRAG_NONE; dragTarget = null;
    canvas.style.cursor = 'default';
  });
  canvas.addEventListener('pointerleave', function() {
    dragMode = DRAG_NONE; dragTarget = null;
    canvas.style.cursor = 'default';
  });

  // ── VS Code message bridge ─────────────────────────────────────────────
  const vscode = acquireVsCodeApi();
  function notifySelection() {
    vscode.postMessage({ type: 'selectionChange', names: selected.map(function(w){ return w.app_name; }) });
  }

  // ── Init ───────────────────────────────────────────────────────────────
  resetSize();
  render();
}());
</script>
</body>
</html>`;
    }

    // -------------------------------------------------------------------------
    // Webview message handler
    // -------------------------------------------------------------------------

    private handleWebviewMessage(document: vscode.TextDocument, msg: unknown): void {
        if (typeof msg !== 'object' || msg === null) return;
        const m = msg as Record<string, unknown>;

        switch (m['type']) {
            case 'save': {
                const project = this.projects.get(document.uri.toString());
                if (!project) return;
                const xml = this.writer.writeProject(project);
                const edit = new vscode.WorkspaceEdit();
                edit.replace(
                    document.uri,
                    new vscode.Range(0, 0, document.lineCount, 0),
                    xml,
                );
                void vscode.workspace.applyEdit(edit);
                break;
            }
            case 'selectionChange': {
                // Forward selected widget names to property panel
                const names = Array.isArray(m['names']) ? m['names'] as string[] : [];
                const project = this.projects.get(document.uri.toString());
                if (project && names.length > 0) {
                    const widgetName = names[0];
                    const widget = findWidgetByName(project, widgetName);
                    if (widget) {
                        this.propertyPanel.showWidget(widget, project);
                        const node: import('./panels/project-view').ProjectNode = {
                            kind: 'widget',
                            label: widget.app_name,
                            id: `widget:${widget.app_name}`,
                            widgetInfo: widget,
                        };
                        this.projectView.handleSelectionChange([node]);
                    }
                }
                break;
            }
            default:
                break;
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function activeDocumentUri(): string | undefined {
    // Find the first active custom editor with a registered project
    const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
    if (!activeTab) return undefined;
    const input = activeTab.input;
    if (input instanceof vscode.TabInputCustom) {
        return input.uri.toString();
    }
    return undefined;
}

function generateNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    // Use crypto.getRandomValues when available (extension host), otherwise Math.random fallback
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        const arr = new Uint32Array(16);
        globalThis.crypto.getRandomValues(arr);
        for (const n of arr) {
            result += chars[n % chars.length];
        }
    } else {
        for (let i = 0; i < 32; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
    }
    return result;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Recursively serialise WidgetInfo to a plain object safe for JSON. */
function serializeWidgets(widgets: import('./common/widget-info').WidgetInfo[]): unknown[] {
    return widgets.map(w => ({
        app_name: w.app_name,
        base_name: w.base_name,
        basetype: w.basetype,
        size: { ...w.size },
        children: serializeWidgets(w.children),
    }));
}

/** Write a text file to outDir/filename using VS Code workspace FS. */
async function writeTextFile(outDir: string, filename: string, content: string): Promise<void> {
    const uri = vscode.Uri.joinPath(vscode.Uri.file(outDir), filename);
    const bytes = Buffer.from(content, 'utf8');
    await vscode.workspace.fs.writeFile(uri, bytes);
}

/** Write a binary file to outDir/filename using VS Code workspace FS. */
async function writeBinaryFile(outDir: string, filename: string, content: Uint8Array): Promise<void> {
    const uri = vscode.Uri.joinPath(vscode.Uri.file(outDir), filename);
    await vscode.workspace.fs.writeFile(uri, content);
}

/** Find the first widget in the project whose app_name matches. */
function findWidgetByName(
    project: GxpProject,
    name: string,
): import('./common/widget-info').WidgetInfo | undefined {
    for (const disp of project.displays) {
        for (const folder of disp.folders) {
            const found = findInWidgets(folder.widgets, name);
            if (found) return found;
        }
    }
    return undefined;
}

function findInWidgets(
    widgets: import('./common/widget-info').WidgetInfo[],
    name: string,
): import('./common/widget-info').WidgetInfo | undefined {
    for (const w of widgets) {
        if (w.app_name === name) return w;
        const found = findInWidgets(w.children, name);
        if (found) return found;
    }
    return undefined;
}
