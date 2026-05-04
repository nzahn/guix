/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ([
/* 0 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * GUIX Studio Theia Extension — activation entry point.
 *
 * Registers the custom editor for `.gxp` files, wires up commands, and
 * provides the DI container root for all GUIX Studio services.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(__webpack_require__(1));
const inversify_1 = __webpack_require__(2);
__webpack_require__(3);
const gxp_reader_1 = __webpack_require__(83);
const gxp_writer_1 = __webpack_require__(93);
const snap_engine_1 = __webpack_require__(94);
const selection_manager_1 = __webpack_require__(95);
const project_view_1 = __webpack_require__(96);
const property_panel_1 = __webpack_require__(97);
const resource_panel_1 = __webpack_require__(98);
const screen_flow_editor_1 = __webpack_require__(99);
const resource_generator_1 = __webpack_require__(100);
const screen_generator_1 = __webpack_require__(102);
const binary_resource_generator_1 = __webpack_require__(103);
const undo_manager_1 = __webpack_require__(104);
const widget_registry_1 = __webpack_require__(105);
const string_table_1 = __webpack_require__(107);
const di_tokens_1 = __webpack_require__(108);
// ---------------------------------------------------------------------------
// DI container (root scope, one per extension host)
// ---------------------------------------------------------------------------
const container = new inversify_1.Container({ defaultScope: 'Singleton' });
container.bind(di_tokens_1.GxpReaderToken).to(gxp_reader_1.GxpReader);
container.bind(di_tokens_1.GxpWriterToken).to(gxp_writer_1.GxpWriter);
container.bind(di_tokens_1.SnapEngineToken).to(snap_engine_1.SnapEngine);
container.bind(di_tokens_1.SelectionManagerToken).to(selection_manager_1.SelectionManager);
container.bind(di_tokens_1.ProjectViewToken).to(project_view_1.ProjectView);
container.bind(di_tokens_1.PropertyPanelToken).to(property_panel_1.PropertyPanel);
container.bind(di_tokens_1.ResourcePanelToken).to(resource_panel_1.ResourcePanel);
container.bind(di_tokens_1.ScreenFlowEditorToken).to(screen_flow_editor_1.ScreenFlowEditor);
container.bind(di_tokens_1.ResourceGeneratorToken).to(resource_generator_1.ResourceGenerator);
container.bind(di_tokens_1.ScreenGeneratorToken).to(screen_generator_1.ScreenGenerator);
container.bind(di_tokens_1.BinaryResourceGeneratorToken).to(binary_resource_generator_1.BinaryResourceGenerator);
container.bind(di_tokens_1.UndoManagerToken).to(undo_manager_1.UndoManager);
container.bind(di_tokens_1.WidgetRegistryToken).to(widget_registry_1.WidgetRegistry);
container.bind(di_tokens_1.StringTableToken).to(string_table_1.StringTable);
// ---------------------------------------------------------------------------
// Extension state
// ---------------------------------------------------------------------------
/** Map from document URI to the parsed project model. */
const openProjects = new Map();
// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------
function activate(context) {
    const reader = container.get(di_tokens_1.GxpReaderToken);
    const writer = container.get(di_tokens_1.GxpWriterToken);
    const projectView = container.get(di_tokens_1.ProjectViewToken);
    const propertyPanel = container.get(di_tokens_1.PropertyPanelToken);
    const resourcePanel = container.get(di_tokens_1.ResourcePanelToken);
    const screenFlow = container.get(di_tokens_1.ScreenFlowEditorToken);
    const resGen = container.get(di_tokens_1.ResourceGeneratorToken);
    const screenGen = container.get(di_tokens_1.ScreenGeneratorToken);
    const binGen = container.get(di_tokens_1.BinaryResourceGeneratorToken);
    const undoMgr = container.get(di_tokens_1.UndoManagerToken);
    // ----- Tree views -----------------------------------------------------
    context.subscriptions.push(vscode.window.registerTreeDataProvider('guixStudio.projectView', projectView), vscode.window.registerTreeDataProvider('guixStudio.resourcePanel', resourcePanel));
    // ----- Webview view providers -----------------------------------------
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(property_panel_1.PropertyPanel.viewId, propertyPanel, {
        webviewOptions: { retainContextWhenHidden: true },
    }), vscode.window.registerWebviewViewProvider(screen_flow_editor_1.ScreenFlowEditor.viewId, screenFlow, {
        webviewOptions: { retainContextWhenHidden: false },
    }));
    // ----- Custom editor provider ----------------------------------------
    const provider = new GxpEditorProvider(context, reader, writer, openProjects, projectView, resourcePanel, screenFlow, propertyPanel);
    context.subscriptions.push(vscode.window.registerCustomEditorProvider('guixStudio.gxpEditor', provider, {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
    }));
    // ----- Generate C Code -----------------------------------------------
    context.subscriptions.push(vscode.commands.registerCommand('guixStudio.generateCode', async () => {
        const uri = activeDocumentUri();
        const project = uri ? openProjects.get(uri) : undefined;
        if (!project) {
            void vscode.window.showWarningMessage('No GUIX project open.');
            return;
        }
        const outDir = project.header.source_path || project.header.project_path;
        const generated = [];
        try {
            for (let i = 0; i < project.displays.length; i++) {
                const rf = resGen.generate(project, i);
                const sf = screenGen.generate(project, i);
                for (const f of [rf.header, rf.source, sf.header, sf.source]) {
                    await writeTextFile(outDir, f.filename, f.content);
                    generated.push(f.filename);
                }
            }
            void vscode.window.showInformationMessage(`Generated: ${generated.join(', ')}`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            void vscode.window.showErrorMessage(`Code generation failed: ${msg}`);
        }
    }));
    // ----- Generate Binary -----------------------------------------------
    context.subscriptions.push(vscode.commands.registerCommand('guixStudio.generateBinary', async () => {
        const uri = activeDocumentUri();
        const project = uri ? openProjects.get(uri) : undefined;
        if (!project) {
            void vscode.window.showWarningMessage('No GUIX project open.');
            return;
        }
        const fmt = project.header.binary_file_format === 1 ? binary_resource_generator_1.BINARY_FORMAT_SREC : binary_resource_generator_1.BINARY_FORMAT_RAW;
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
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            void vscode.window.showErrorMessage(`Binary generation failed: ${msg}`);
        }
    }));
    // ----- Select display -------------------------------------------------
    context.subscriptions.push(vscode.commands.registerCommand('guixStudio.selectDisplay', async () => {
        const uri = activeDocumentUri();
        const project = uri ? openProjects.get(uri) : undefined;
        if (!project)
            return;
        const items = project.displays.map((d, i) => ({
            label: d.name,
            description: `${d.xres}×${d.yres}`,
            index: i,
        }));
        const pick = await vscode.window.showQuickPick(items, { title: 'Select Display' });
        if (!pick)
            return;
        resourcePanel.selectDisplay(pick.index);
        screenFlow.selectDisplay(pick.index);
    }));
    // ----- Select theme ---------------------------------------------------
    context.subscriptions.push(vscode.commands.registerCommand('guixStudio.selectTheme', async () => {
        const uri = activeDocumentUri();
        const project = uri ? openProjects.get(uri) : undefined;
        if (!project)
            return;
        const dispIdx = 0; // TODO: track active display per editor
        const disp = project.displays[dispIdx];
        if (!disp)
            return;
        const items = disp.themes.map((t, i) => ({ label: t.theme_name, index: i }));
        const pick = await vscode.window.showQuickPick(items, { title: 'Select Theme' });
        if (!pick)
            return;
        resourcePanel.selectTheme(pick.index);
    }));
    // ----- Undo / Redo ---------------------------------------------------
    context.subscriptions.push(vscode.commands.registerCommand('guixStudio.undo', () => {
        const uri = activeDocumentUri();
        const project = uri ? openProjects.get(uri) : undefined;
        if (!project)
            return;
        if (!undoMgr.canUndo()) {
            void vscode.window.showInformationMessage('Nothing to undo.');
            return;
        }
        undoMgr.undo(project);
    }), vscode.commands.registerCommand('guixStudio.redo', () => {
        const uri = activeDocumentUri();
        const project = uri ? openProjects.get(uri) : undefined;
        if (!project)
            return;
        if (!undoMgr.canRedo()) {
            void vscode.window.showInformationMessage('Nothing to redo.');
            return;
        }
        undoMgr.redo(project);
    }), vscode.commands.registerCommand('guixStudio.addDisplay', () => {
        void vscode.window.showInformationMessage('Add Display — not yet implemented.');
    }));
    console.log('[GUIX Studio] Extension activated.');
}
function deactivate() {
    openProjects.clear();
}
// ---------------------------------------------------------------------------
// GxpEditorProvider — CustomTextEditorProvider for *.gxp files
// ---------------------------------------------------------------------------
class GxpEditorProvider {
    constructor(context, reader, writer, projects, projectView, resourcePanel, screenFlow, propertyPanel) {
        this.context = context;
        this.reader = reader;
        this.writer = writer;
        this.projects = projects;
        this.projectView = projectView;
        this.resourcePanel = resourcePanel;
        this.screenFlow = screenFlow;
        this.propertyPanel = propertyPanel;
    }
    async resolveCustomTextEditor(document, webviewPanel, _token) {
        const uri = document.uri.toString();
        // Parse the project
        let project;
        try {
            project = this.reader.readProject(document.getText(), document.uri.fsPath);
        }
        catch (err) {
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
            if (e.document.uri.toString() !== uri)
                return;
            try {
                const updated = this.reader.readProject(e.document.getText(), e.document.uri.fsPath);
                this.projects.set(uri, updated);
                webviewPanel.webview.html = this.buildWebviewHtml(webviewPanel.webview, updated);
            }
            catch {
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
        webviewPanel.webview.onDidReceiveMessage((msg) => this.handleWebviewMessage(document, msg), undefined, this.context.subscriptions);
    }
    // -------------------------------------------------------------------------
    // Webview HTML
    // -------------------------------------------------------------------------
    buildWebviewHtml(webview, project) {
        const nonce = generateNonce();
        const csp = [
            `default-src 'none'`,
            `style-src ${webview.cspSource} 'nonce-${nonce}'`,
            `script-src 'nonce-${nonce}'`,
        ].join('; ');
        const projectName = escapeHtml(project.header.project_name || '(unnamed)');
        const version = project.header.project_version;
        // Serialise all displays as a JSON blob for the webview renderer
        const displaysJson = JSON.stringify(project.displays.map(d => ({
            name: d.name,
            xres: d.xres,
            yres: d.yres,
            folders: d.folders.map(f => ({
                folder_name: f.folder_name,
                widgets: serializeWidgets(f.widgets),
            })),
        })));
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
    handleWebviewMessage(document, msg) {
        if (typeof msg !== 'object' || msg === null)
            return;
        const m = msg;
        switch (m['type']) {
            case 'save': {
                const project = this.projects.get(document.uri.toString());
                if (!project)
                    return;
                const xml = this.writer.writeProject(project);
                const edit = new vscode.WorkspaceEdit();
                edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), xml);
                void vscode.workspace.applyEdit(edit);
                break;
            }
            case 'selectionChange': {
                // Forward selected widget names to property panel
                const names = Array.isArray(m['names']) ? m['names'] : [];
                const project = this.projects.get(document.uri.toString());
                if (project && names.length > 0) {
                    const widgetName = names[0];
                    const widget = findWidgetByName(project, widgetName);
                    if (widget) {
                        this.propertyPanel.showWidget(widget, project);
                        const node = {
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
function activeDocumentUri() {
    // Find the first active custom editor with a registered project
    const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
    if (!activeTab)
        return undefined;
    const input = activeTab.input;
    if (input instanceof vscode.TabInputCustom) {
        return input.uri.toString();
    }
    return undefined;
}
function generateNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    // Use crypto.getRandomValues when available (extension host), otherwise Math.random fallback
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        const arr = new Uint32Array(16);
        globalThis.crypto.getRandomValues(arr);
        for (const n of arr) {
            result += chars[n % chars.length];
        }
    }
    else {
        for (let i = 0; i < 32; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
    }
    return result;
}
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
/** Recursively serialise WidgetInfo to a plain object safe for JSON. */
function serializeWidgets(widgets) {
    return widgets.map(w => ({
        app_name: w.app_name,
        base_name: w.base_name,
        basetype: w.basetype,
        size: { ...w.size },
        children: serializeWidgets(w.children),
    }));
}
/** Write a text file to outDir/filename using VS Code workspace FS. */
async function writeTextFile(outDir, filename, content) {
    const uri = vscode.Uri.joinPath(vscode.Uri.file(outDir), filename);
    const bytes = Buffer.from(content, 'utf8');
    await vscode.workspace.fs.writeFile(uri, bytes);
}
/** Write a binary file to outDir/filename using VS Code workspace FS. */
async function writeBinaryFile(outDir, filename, content) {
    const uri = vscode.Uri.joinPath(vscode.Uri.file(outDir), filename);
    await vscode.workspace.fs.writeFile(uri, content);
}
/** Find the first widget in the project whose app_name matches. */
function findWidgetByName(project, name) {
    for (const disp of project.displays) {
        for (const folder of disp.folders) {
            const found = findInWidgets(folder.widgets, name);
            if (found)
                return found;
        }
    }
    return undefined;
}
function findInWidgets(widgets, name) {
    for (const w of widgets) {
        if (w.app_name === name)
            return w;
        const found = findInWidgets(w.children, name);
        if (found)
            return found;
    }
    return undefined;
}


/***/ }),
/* 1 */
/***/ ((module) => {

"use strict";
module.exports = require("vscode");

/***/ }),
/* 2 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.multiBindToService = exports.getServiceIdentifierAsString = exports.typeConstraint = exports.namedConstraint = exports.taggedConstraint = exports.traverseAncerstors = exports.decorate = exports.id = exports.MetadataReader = exports.preDestroy = exports.postConstruct = exports.targetName = exports.multiInject = exports.unmanaged = exports.optional = exports.inject = exports.named = exports.tagged = exports.injectable = exports.createTaggedDecorator = exports.ContainerModule = exports.AsyncContainerModule = exports.TargetTypeEnum = exports.BindingTypeEnum = exports.BindingScopeEnum = exports.Container = exports.METADATA_KEY = exports.LazyServiceIdentifer = exports.LazyServiceIdentifier = void 0;
/* eslint-disable @typescript-eslint/naming-convention */
__webpack_require__(3);
const common_1 = __webpack_require__(4);
const keys = __importStar(__webpack_require__(7));
var common_2 = __webpack_require__(4);
Object.defineProperty(exports, "LazyServiceIdentifier", ({ enumerable: true, get: function () { return common_2.LazyServiceIdentifier; } }));
/**
 * @deprecated Use LazyServiceIdentifier instead
 */
exports.LazyServiceIdentifer = common_1.LazyServiceIdentifier;
// eslint-disable-next-line @typescript-eslint/typedef
exports.METADATA_KEY = keys;
var container_1 = __webpack_require__(8);
Object.defineProperty(exports, "Container", ({ enumerable: true, get: function () { return container_1.Container; } }));
var literal_types_1 = __webpack_require__(10);
Object.defineProperty(exports, "BindingScopeEnum", ({ enumerable: true, get: function () { return literal_types_1.BindingScopeEnum; } }));
Object.defineProperty(exports, "BindingTypeEnum", ({ enumerable: true, get: function () { return literal_types_1.BindingTypeEnum; } }));
Object.defineProperty(exports, "TargetTypeEnum", ({ enumerable: true, get: function () { return literal_types_1.TargetTypeEnum; } }));
var container_module_1 = __webpack_require__(68);
Object.defineProperty(exports, "AsyncContainerModule", ({ enumerable: true, get: function () { return container_module_1.AsyncContainerModule; } }));
Object.defineProperty(exports, "ContainerModule", ({ enumerable: true, get: function () { return container_module_1.ContainerModule; } }));
var decorator_utils_1 = __webpack_require__(69);
Object.defineProperty(exports, "createTaggedDecorator", ({ enumerable: true, get: function () { return decorator_utils_1.createTaggedDecorator; } }));
var injectable_1 = __webpack_require__(71);
Object.defineProperty(exports, "injectable", ({ enumerable: true, get: function () { return injectable_1.injectable; } }));
var tagged_1 = __webpack_require__(72);
Object.defineProperty(exports, "tagged", ({ enumerable: true, get: function () { return tagged_1.tagged; } }));
var named_1 = __webpack_require__(73);
Object.defineProperty(exports, "named", ({ enumerable: true, get: function () { return named_1.named; } }));
var inject_1 = __webpack_require__(74);
Object.defineProperty(exports, "inject", ({ enumerable: true, get: function () { return inject_1.inject; } }));
var optional_1 = __webpack_require__(76);
Object.defineProperty(exports, "optional", ({ enumerable: true, get: function () { return optional_1.optional; } }));
var unmanaged_1 = __webpack_require__(77);
Object.defineProperty(exports, "unmanaged", ({ enumerable: true, get: function () { return unmanaged_1.unmanaged; } }));
var multi_inject_1 = __webpack_require__(78);
Object.defineProperty(exports, "multiInject", ({ enumerable: true, get: function () { return multi_inject_1.multiInject; } }));
var target_name_1 = __webpack_require__(79);
Object.defineProperty(exports, "targetName", ({ enumerable: true, get: function () { return target_name_1.targetName; } }));
var post_construct_1 = __webpack_require__(80);
Object.defineProperty(exports, "postConstruct", ({ enumerable: true, get: function () { return post_construct_1.postConstruct; } }));
var pre_destroy_1 = __webpack_require__(82);
Object.defineProperty(exports, "preDestroy", ({ enumerable: true, get: function () { return pre_destroy_1.preDestroy; } }));
var metadata_reader_1 = __webpack_require__(13);
Object.defineProperty(exports, "MetadataReader", ({ enumerable: true, get: function () { return metadata_reader_1.MetadataReader; } }));
var id_1 = __webpack_require__(11);
Object.defineProperty(exports, "id", ({ enumerable: true, get: function () { return id_1.id; } }));
var decorator_utils_2 = __webpack_require__(69);
Object.defineProperty(exports, "decorate", ({ enumerable: true, get: function () { return decorator_utils_2.decorate; } }));
var constraint_helpers_1 = __webpack_require__(63);
Object.defineProperty(exports, "traverseAncerstors", ({ enumerable: true, get: function () { return constraint_helpers_1.traverseAncerstors; } }));
Object.defineProperty(exports, "taggedConstraint", ({ enumerable: true, get: function () { return constraint_helpers_1.taggedConstraint; } }));
Object.defineProperty(exports, "namedConstraint", ({ enumerable: true, get: function () { return constraint_helpers_1.namedConstraint; } }));
Object.defineProperty(exports, "typeConstraint", ({ enumerable: true, get: function () { return constraint_helpers_1.typeConstraint; } }));
var serialization_1 = __webpack_require__(44);
Object.defineProperty(exports, "getServiceIdentifierAsString", ({ enumerable: true, get: function () { return serialization_1.getServiceIdentifierAsString; } }));
var binding_utils_1 = __webpack_require__(54);
Object.defineProperty(exports, "multiBindToService", ({ enumerable: true, get: function () { return binding_utils_1.multiBindToService; } }));
//# sourceMappingURL=index.js.map

/***/ }),
/* 3 */
/***/ (() => {

/*! *****************************************************************************
Copyright (C) Microsoft. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */
var Reflect;
(function (Reflect) {
    // Metadata Proposal
    // https://rbuckton.github.io/reflect-metadata/
    (function (factory) {
        var root = typeof globalThis === "object" ? globalThis :
            typeof global === "object" ? global :
                typeof self === "object" ? self :
                    typeof this === "object" ? this :
                        sloppyModeThis();
        var exporter = makeExporter(Reflect);
        if (typeof root.Reflect !== "undefined") {
            exporter = makeExporter(root.Reflect, exporter);
        }
        factory(exporter, root);
        if (typeof root.Reflect === "undefined") {
            root.Reflect = Reflect;
        }
        function makeExporter(target, previous) {
            return function (key, value) {
                Object.defineProperty(target, key, { configurable: true, writable: true, value: value });
                if (previous)
                    previous(key, value);
            };
        }
        function functionThis() {
            try {
                return Function("return this;")();
            }
            catch (_) { }
        }
        function indirectEvalThis() {
            try {
                return (void 0, eval)("(function() { return this; })()");
            }
            catch (_) { }
        }
        function sloppyModeThis() {
            return functionThis() || indirectEvalThis();
        }
    })(function (exporter, root) {
        var hasOwn = Object.prototype.hasOwnProperty;
        // feature test for Symbol support
        var supportsSymbol = typeof Symbol === "function";
        var toPrimitiveSymbol = supportsSymbol && typeof Symbol.toPrimitive !== "undefined" ? Symbol.toPrimitive : "@@toPrimitive";
        var iteratorSymbol = supportsSymbol && typeof Symbol.iterator !== "undefined" ? Symbol.iterator : "@@iterator";
        var supportsCreate = typeof Object.create === "function"; // feature test for Object.create support
        var supportsProto = { __proto__: [] } instanceof Array; // feature test for __proto__ support
        var downLevel = !supportsCreate && !supportsProto;
        var HashMap = {
            // create an object in dictionary mode (a.k.a. "slow" mode in v8)
            create: supportsCreate
                ? function () { return MakeDictionary(Object.create(null)); }
                : supportsProto
                    ? function () { return MakeDictionary({ __proto__: null }); }
                    : function () { return MakeDictionary({}); },
            has: downLevel
                ? function (map, key) { return hasOwn.call(map, key); }
                : function (map, key) { return key in map; },
            get: downLevel
                ? function (map, key) { return hasOwn.call(map, key) ? map[key] : undefined; }
                : function (map, key) { return map[key]; },
        };
        // Load global or shim versions of Map, Set, and WeakMap
        var functionPrototype = Object.getPrototypeOf(Function);
        var _Map = typeof Map === "function" && typeof Map.prototype.entries === "function" ? Map : CreateMapPolyfill();
        var _Set = typeof Set === "function" && typeof Set.prototype.entries === "function" ? Set : CreateSetPolyfill();
        var _WeakMap = typeof WeakMap === "function" ? WeakMap : CreateWeakMapPolyfill();
        var registrySymbol = supportsSymbol ? Symbol.for("@reflect-metadata:registry") : undefined;
        var metadataRegistry = GetOrCreateMetadataRegistry();
        var metadataProvider = CreateMetadataProvider(metadataRegistry);
        /**
         * Applies a set of decorators to a property of a target object.
         * @param decorators An array of decorators.
         * @param target The target object.
         * @param propertyKey (Optional) The property key to decorate.
         * @param attributes (Optional) The property descriptor for the target key.
         * @remarks Decorators are applied in reverse order.
         * @example
         *
         *     class Example {
         *         // property declarations are not part of ES6, though they are valid in TypeScript:
         *         // static staticProperty;
         *         // property;
         *
         *         constructor(p) { }
         *         static staticMethod(p) { }
         *         method(p) { }
         *     }
         *
         *     // constructor
         *     Example = Reflect.decorate(decoratorsArray, Example);
         *
         *     // property (on constructor)
         *     Reflect.decorate(decoratorsArray, Example, "staticProperty");
         *
         *     // property (on prototype)
         *     Reflect.decorate(decoratorsArray, Example.prototype, "property");
         *
         *     // method (on constructor)
         *     Object.defineProperty(Example, "staticMethod",
         *         Reflect.decorate(decoratorsArray, Example, "staticMethod",
         *             Object.getOwnPropertyDescriptor(Example, "staticMethod")));
         *
         *     // method (on prototype)
         *     Object.defineProperty(Example.prototype, "method",
         *         Reflect.decorate(decoratorsArray, Example.prototype, "method",
         *             Object.getOwnPropertyDescriptor(Example.prototype, "method")));
         *
         */
        function decorate(decorators, target, propertyKey, attributes) {
            if (!IsUndefined(propertyKey)) {
                if (!IsArray(decorators))
                    throw new TypeError();
                if (!IsObject(target))
                    throw new TypeError();
                if (!IsObject(attributes) && !IsUndefined(attributes) && !IsNull(attributes))
                    throw new TypeError();
                if (IsNull(attributes))
                    attributes = undefined;
                propertyKey = ToPropertyKey(propertyKey);
                return DecorateProperty(decorators, target, propertyKey, attributes);
            }
            else {
                if (!IsArray(decorators))
                    throw new TypeError();
                if (!IsConstructor(target))
                    throw new TypeError();
                return DecorateConstructor(decorators, target);
            }
        }
        exporter("decorate", decorate);
        // 4.1.2 Reflect.metadata(metadataKey, metadataValue)
        // https://rbuckton.github.io/reflect-metadata/#reflect.metadata
        /**
         * A default metadata decorator factory that can be used on a class, class member, or parameter.
         * @param metadataKey The key for the metadata entry.
         * @param metadataValue The value for the metadata entry.
         * @returns A decorator function.
         * @remarks
         * If `metadataKey` is already defined for the target and target key, the
         * metadataValue for that key will be overwritten.
         * @example
         *
         *     // constructor
         *     @Reflect.metadata(key, value)
         *     class Example {
         *     }
         *
         *     // property (on constructor, TypeScript only)
         *     class Example {
         *         @Reflect.metadata(key, value)
         *         static staticProperty;
         *     }
         *
         *     // property (on prototype, TypeScript only)
         *     class Example {
         *         @Reflect.metadata(key, value)
         *         property;
         *     }
         *
         *     // method (on constructor)
         *     class Example {
         *         @Reflect.metadata(key, value)
         *         static staticMethod() { }
         *     }
         *
         *     // method (on prototype)
         *     class Example {
         *         @Reflect.metadata(key, value)
         *         method() { }
         *     }
         *
         */
        function metadata(metadataKey, metadataValue) {
            function decorator(target, propertyKey) {
                if (!IsObject(target))
                    throw new TypeError();
                if (!IsUndefined(propertyKey) && !IsPropertyKey(propertyKey))
                    throw new TypeError();
                OrdinaryDefineOwnMetadata(metadataKey, metadataValue, target, propertyKey);
            }
            return decorator;
        }
        exporter("metadata", metadata);
        /**
         * Define a unique metadata entry on the target.
         * @param metadataKey A key used to store and retrieve metadata.
         * @param metadataValue A value that contains attached metadata.
         * @param target The target object on which to define metadata.
         * @param propertyKey (Optional) The property key for the target.
         * @example
         *
         *     class Example {
         *         // property declarations are not part of ES6, though they are valid in TypeScript:
         *         // static staticProperty;
         *         // property;
         *
         *         constructor(p) { }
         *         static staticMethod(p) { }
         *         method(p) { }
         *     }
         *
         *     // constructor
         *     Reflect.defineMetadata("custom:annotation", options, Example);
         *
         *     // property (on constructor)
         *     Reflect.defineMetadata("custom:annotation", options, Example, "staticProperty");
         *
         *     // property (on prototype)
         *     Reflect.defineMetadata("custom:annotation", options, Example.prototype, "property");
         *
         *     // method (on constructor)
         *     Reflect.defineMetadata("custom:annotation", options, Example, "staticMethod");
         *
         *     // method (on prototype)
         *     Reflect.defineMetadata("custom:annotation", options, Example.prototype, "method");
         *
         *     // decorator factory as metadata-producing annotation.
         *     function MyAnnotation(options): Decorator {
         *         return (target, key?) => Reflect.defineMetadata("custom:annotation", options, target, key);
         *     }
         *
         */
        function defineMetadata(metadataKey, metadataValue, target, propertyKey) {
            if (!IsObject(target))
                throw new TypeError();
            if (!IsUndefined(propertyKey))
                propertyKey = ToPropertyKey(propertyKey);
            return OrdinaryDefineOwnMetadata(metadataKey, metadataValue, target, propertyKey);
        }
        exporter("defineMetadata", defineMetadata);
        /**
         * Gets a value indicating whether the target object or its prototype chain has the provided metadata key defined.
         * @param metadataKey A key used to store and retrieve metadata.
         * @param target The target object on which the metadata is defined.
         * @param propertyKey (Optional) The property key for the target.
         * @returns `true` if the metadata key was defined on the target object or its prototype chain; otherwise, `false`.
         * @example
         *
         *     class Example {
         *         // property declarations are not part of ES6, though they are valid in TypeScript:
         *         // static staticProperty;
         *         // property;
         *
         *         constructor(p) { }
         *         static staticMethod(p) { }
         *         method(p) { }
         *     }
         *
         *     // constructor
         *     result = Reflect.hasMetadata("custom:annotation", Example);
         *
         *     // property (on constructor)
         *     result = Reflect.hasMetadata("custom:annotation", Example, "staticProperty");
         *
         *     // property (on prototype)
         *     result = Reflect.hasMetadata("custom:annotation", Example.prototype, "property");
         *
         *     // method (on constructor)
         *     result = Reflect.hasMetadata("custom:annotation", Example, "staticMethod");
         *
         *     // method (on prototype)
         *     result = Reflect.hasMetadata("custom:annotation", Example.prototype, "method");
         *
         */
        function hasMetadata(metadataKey, target, propertyKey) {
            if (!IsObject(target))
                throw new TypeError();
            if (!IsUndefined(propertyKey))
                propertyKey = ToPropertyKey(propertyKey);
            return OrdinaryHasMetadata(metadataKey, target, propertyKey);
        }
        exporter("hasMetadata", hasMetadata);
        /**
         * Gets a value indicating whether the target object has the provided metadata key defined.
         * @param metadataKey A key used to store and retrieve metadata.
         * @param target The target object on which the metadata is defined.
         * @param propertyKey (Optional) The property key for the target.
         * @returns `true` if the metadata key was defined on the target object; otherwise, `false`.
         * @example
         *
         *     class Example {
         *         // property declarations are not part of ES6, though they are valid in TypeScript:
         *         // static staticProperty;
         *         // property;
         *
         *         constructor(p) { }
         *         static staticMethod(p) { }
         *         method(p) { }
         *     }
         *
         *     // constructor
         *     result = Reflect.hasOwnMetadata("custom:annotation", Example);
         *
         *     // property (on constructor)
         *     result = Reflect.hasOwnMetadata("custom:annotation", Example, "staticProperty");
         *
         *     // property (on prototype)
         *     result = Reflect.hasOwnMetadata("custom:annotation", Example.prototype, "property");
         *
         *     // method (on constructor)
         *     result = Reflect.hasOwnMetadata("custom:annotation", Example, "staticMethod");
         *
         *     // method (on prototype)
         *     result = Reflect.hasOwnMetadata("custom:annotation", Example.prototype, "method");
         *
         */
        function hasOwnMetadata(metadataKey, target, propertyKey) {
            if (!IsObject(target))
                throw new TypeError();
            if (!IsUndefined(propertyKey))
                propertyKey = ToPropertyKey(propertyKey);
            return OrdinaryHasOwnMetadata(metadataKey, target, propertyKey);
        }
        exporter("hasOwnMetadata", hasOwnMetadata);
        /**
         * Gets the metadata value for the provided metadata key on the target object or its prototype chain.
         * @param metadataKey A key used to store and retrieve metadata.
         * @param target The target object on which the metadata is defined.
         * @param propertyKey (Optional) The property key for the target.
         * @returns The metadata value for the metadata key if found; otherwise, `undefined`.
         * @example
         *
         *     class Example {
         *         // property declarations are not part of ES6, though they are valid in TypeScript:
         *         // static staticProperty;
         *         // property;
         *
         *         constructor(p) { }
         *         static staticMethod(p) { }
         *         method(p) { }
         *     }
         *
         *     // constructor
         *     result = Reflect.getMetadata("custom:annotation", Example);
         *
         *     // property (on constructor)
         *     result = Reflect.getMetadata("custom:annotation", Example, "staticProperty");
         *
         *     // property (on prototype)
         *     result = Reflect.getMetadata("custom:annotation", Example.prototype, "property");
         *
         *     // method (on constructor)
         *     result = Reflect.getMetadata("custom:annotation", Example, "staticMethod");
         *
         *     // method (on prototype)
         *     result = Reflect.getMetadata("custom:annotation", Example.prototype, "method");
         *
         */
        function getMetadata(metadataKey, target, propertyKey) {
            if (!IsObject(target))
                throw new TypeError();
            if (!IsUndefined(propertyKey))
                propertyKey = ToPropertyKey(propertyKey);
            return OrdinaryGetMetadata(metadataKey, target, propertyKey);
        }
        exporter("getMetadata", getMetadata);
        /**
         * Gets the metadata value for the provided metadata key on the target object.
         * @param metadataKey A key used to store and retrieve metadata.
         * @param target The target object on which the metadata is defined.
         * @param propertyKey (Optional) The property key for the target.
         * @returns The metadata value for the metadata key if found; otherwise, `undefined`.
         * @example
         *
         *     class Example {
         *         // property declarations are not part of ES6, though they are valid in TypeScript:
         *         // static staticProperty;
         *         // property;
         *
         *         constructor(p) { }
         *         static staticMethod(p) { }
         *         method(p) { }
         *     }
         *
         *     // constructor
         *     result = Reflect.getOwnMetadata("custom:annotation", Example);
         *
         *     // property (on constructor)
         *     result = Reflect.getOwnMetadata("custom:annotation", Example, "staticProperty");
         *
         *     // property (on prototype)
         *     result = Reflect.getOwnMetadata("custom:annotation", Example.prototype, "property");
         *
         *     // method (on constructor)
         *     result = Reflect.getOwnMetadata("custom:annotation", Example, "staticMethod");
         *
         *     // method (on prototype)
         *     result = Reflect.getOwnMetadata("custom:annotation", Example.prototype, "method");
         *
         */
        function getOwnMetadata(metadataKey, target, propertyKey) {
            if (!IsObject(target))
                throw new TypeError();
            if (!IsUndefined(propertyKey))
                propertyKey = ToPropertyKey(propertyKey);
            return OrdinaryGetOwnMetadata(metadataKey, target, propertyKey);
        }
        exporter("getOwnMetadata", getOwnMetadata);
        /**
         * Gets the metadata keys defined on the target object or its prototype chain.
         * @param target The target object on which the metadata is defined.
         * @param propertyKey (Optional) The property key for the target.
         * @returns An array of unique metadata keys.
         * @example
         *
         *     class Example {
         *         // property declarations are not part of ES6, though they are valid in TypeScript:
         *         // static staticProperty;
         *         // property;
         *
         *         constructor(p) { }
         *         static staticMethod(p) { }
         *         method(p) { }
         *     }
         *
         *     // constructor
         *     result = Reflect.getMetadataKeys(Example);
         *
         *     // property (on constructor)
         *     result = Reflect.getMetadataKeys(Example, "staticProperty");
         *
         *     // property (on prototype)
         *     result = Reflect.getMetadataKeys(Example.prototype, "property");
         *
         *     // method (on constructor)
         *     result = Reflect.getMetadataKeys(Example, "staticMethod");
         *
         *     // method (on prototype)
         *     result = Reflect.getMetadataKeys(Example.prototype, "method");
         *
         */
        function getMetadataKeys(target, propertyKey) {
            if (!IsObject(target))
                throw new TypeError();
            if (!IsUndefined(propertyKey))
                propertyKey = ToPropertyKey(propertyKey);
            return OrdinaryMetadataKeys(target, propertyKey);
        }
        exporter("getMetadataKeys", getMetadataKeys);
        /**
         * Gets the unique metadata keys defined on the target object.
         * @param target The target object on which the metadata is defined.
         * @param propertyKey (Optional) The property key for the target.
         * @returns An array of unique metadata keys.
         * @example
         *
         *     class Example {
         *         // property declarations are not part of ES6, though they are valid in TypeScript:
         *         // static staticProperty;
         *         // property;
         *
         *         constructor(p) { }
         *         static staticMethod(p) { }
         *         method(p) { }
         *     }
         *
         *     // constructor
         *     result = Reflect.getOwnMetadataKeys(Example);
         *
         *     // property (on constructor)
         *     result = Reflect.getOwnMetadataKeys(Example, "staticProperty");
         *
         *     // property (on prototype)
         *     result = Reflect.getOwnMetadataKeys(Example.prototype, "property");
         *
         *     // method (on constructor)
         *     result = Reflect.getOwnMetadataKeys(Example, "staticMethod");
         *
         *     // method (on prototype)
         *     result = Reflect.getOwnMetadataKeys(Example.prototype, "method");
         *
         */
        function getOwnMetadataKeys(target, propertyKey) {
            if (!IsObject(target))
                throw new TypeError();
            if (!IsUndefined(propertyKey))
                propertyKey = ToPropertyKey(propertyKey);
            return OrdinaryOwnMetadataKeys(target, propertyKey);
        }
        exporter("getOwnMetadataKeys", getOwnMetadataKeys);
        /**
         * Deletes the metadata entry from the target object with the provided key.
         * @param metadataKey A key used to store and retrieve metadata.
         * @param target The target object on which the metadata is defined.
         * @param propertyKey (Optional) The property key for the target.
         * @returns `true` if the metadata entry was found and deleted; otherwise, false.
         * @example
         *
         *     class Example {
         *         // property declarations are not part of ES6, though they are valid in TypeScript:
         *         // static staticProperty;
         *         // property;
         *
         *         constructor(p) { }
         *         static staticMethod(p) { }
         *         method(p) { }
         *     }
         *
         *     // constructor
         *     result = Reflect.deleteMetadata("custom:annotation", Example);
         *
         *     // property (on constructor)
         *     result = Reflect.deleteMetadata("custom:annotation", Example, "staticProperty");
         *
         *     // property (on prototype)
         *     result = Reflect.deleteMetadata("custom:annotation", Example.prototype, "property");
         *
         *     // method (on constructor)
         *     result = Reflect.deleteMetadata("custom:annotation", Example, "staticMethod");
         *
         *     // method (on prototype)
         *     result = Reflect.deleteMetadata("custom:annotation", Example.prototype, "method");
         *
         */
        function deleteMetadata(metadataKey, target, propertyKey) {
            if (!IsObject(target))
                throw new TypeError();
            if (!IsUndefined(propertyKey))
                propertyKey = ToPropertyKey(propertyKey);
            if (!IsObject(target))
                throw new TypeError();
            if (!IsUndefined(propertyKey))
                propertyKey = ToPropertyKey(propertyKey);
            var provider = GetMetadataProvider(target, propertyKey, /*Create*/ false);
            if (IsUndefined(provider))
                return false;
            return provider.OrdinaryDeleteMetadata(metadataKey, target, propertyKey);
        }
        exporter("deleteMetadata", deleteMetadata);
        function DecorateConstructor(decorators, target) {
            for (var i = decorators.length - 1; i >= 0; --i) {
                var decorator = decorators[i];
                var decorated = decorator(target);
                if (!IsUndefined(decorated) && !IsNull(decorated)) {
                    if (!IsConstructor(decorated))
                        throw new TypeError();
                    target = decorated;
                }
            }
            return target;
        }
        function DecorateProperty(decorators, target, propertyKey, descriptor) {
            for (var i = decorators.length - 1; i >= 0; --i) {
                var decorator = decorators[i];
                var decorated = decorator(target, propertyKey, descriptor);
                if (!IsUndefined(decorated) && !IsNull(decorated)) {
                    if (!IsObject(decorated))
                        throw new TypeError();
                    descriptor = decorated;
                }
            }
            return descriptor;
        }
        // 3.1.1.1 OrdinaryHasMetadata(MetadataKey, O, P)
        // https://rbuckton.github.io/reflect-metadata/#ordinaryhasmetadata
        function OrdinaryHasMetadata(MetadataKey, O, P) {
            var hasOwn = OrdinaryHasOwnMetadata(MetadataKey, O, P);
            if (hasOwn)
                return true;
            var parent = OrdinaryGetPrototypeOf(O);
            if (!IsNull(parent))
                return OrdinaryHasMetadata(MetadataKey, parent, P);
            return false;
        }
        // 3.1.2.1 OrdinaryHasOwnMetadata(MetadataKey, O, P)
        // https://rbuckton.github.io/reflect-metadata/#ordinaryhasownmetadata
        function OrdinaryHasOwnMetadata(MetadataKey, O, P) {
            var provider = GetMetadataProvider(O, P, /*Create*/ false);
            if (IsUndefined(provider))
                return false;
            return ToBoolean(provider.OrdinaryHasOwnMetadata(MetadataKey, O, P));
        }
        // 3.1.3.1 OrdinaryGetMetadata(MetadataKey, O, P)
        // https://rbuckton.github.io/reflect-metadata/#ordinarygetmetadata
        function OrdinaryGetMetadata(MetadataKey, O, P) {
            var hasOwn = OrdinaryHasOwnMetadata(MetadataKey, O, P);
            if (hasOwn)
                return OrdinaryGetOwnMetadata(MetadataKey, O, P);
            var parent = OrdinaryGetPrototypeOf(O);
            if (!IsNull(parent))
                return OrdinaryGetMetadata(MetadataKey, parent, P);
            return undefined;
        }
        // 3.1.4.1 OrdinaryGetOwnMetadata(MetadataKey, O, P)
        // https://rbuckton.github.io/reflect-metadata/#ordinarygetownmetadata
        function OrdinaryGetOwnMetadata(MetadataKey, O, P) {
            var provider = GetMetadataProvider(O, P, /*Create*/ false);
            if (IsUndefined(provider))
                return;
            return provider.OrdinaryGetOwnMetadata(MetadataKey, O, P);
        }
        // 3.1.5.1 OrdinaryDefineOwnMetadata(MetadataKey, MetadataValue, O, P)
        // https://rbuckton.github.io/reflect-metadata/#ordinarydefineownmetadata
        function OrdinaryDefineOwnMetadata(MetadataKey, MetadataValue, O, P) {
            var provider = GetMetadataProvider(O, P, /*Create*/ true);
            provider.OrdinaryDefineOwnMetadata(MetadataKey, MetadataValue, O, P);
        }
        // 3.1.6.1 OrdinaryMetadataKeys(O, P)
        // https://rbuckton.github.io/reflect-metadata/#ordinarymetadatakeys
        function OrdinaryMetadataKeys(O, P) {
            var ownKeys = OrdinaryOwnMetadataKeys(O, P);
            var parent = OrdinaryGetPrototypeOf(O);
            if (parent === null)
                return ownKeys;
            var parentKeys = OrdinaryMetadataKeys(parent, P);
            if (parentKeys.length <= 0)
                return ownKeys;
            if (ownKeys.length <= 0)
                return parentKeys;
            var set = new _Set();
            var keys = [];
            for (var _i = 0, ownKeys_1 = ownKeys; _i < ownKeys_1.length; _i++) {
                var key = ownKeys_1[_i];
                var hasKey = set.has(key);
                if (!hasKey) {
                    set.add(key);
                    keys.push(key);
                }
            }
            for (var _a = 0, parentKeys_1 = parentKeys; _a < parentKeys_1.length; _a++) {
                var key = parentKeys_1[_a];
                var hasKey = set.has(key);
                if (!hasKey) {
                    set.add(key);
                    keys.push(key);
                }
            }
            return keys;
        }
        // 3.1.7.1 OrdinaryOwnMetadataKeys(O, P)
        // https://rbuckton.github.io/reflect-metadata/#ordinaryownmetadatakeys
        function OrdinaryOwnMetadataKeys(O, P) {
            var provider = GetMetadataProvider(O, P, /*create*/ false);
            if (!provider) {
                return [];
            }
            return provider.OrdinaryOwnMetadataKeys(O, P);
        }
        // 6 ECMAScript Data Types and Values
        // https://tc39.github.io/ecma262/#sec-ecmascript-data-types-and-values
        function Type(x) {
            if (x === null)
                return 1 /* Null */;
            switch (typeof x) {
                case "undefined": return 0 /* Undefined */;
                case "boolean": return 2 /* Boolean */;
                case "string": return 3 /* String */;
                case "symbol": return 4 /* Symbol */;
                case "number": return 5 /* Number */;
                case "object": return x === null ? 1 /* Null */ : 6 /* Object */;
                default: return 6 /* Object */;
            }
        }
        // 6.1.1 The Undefined Type
        // https://tc39.github.io/ecma262/#sec-ecmascript-language-types-undefined-type
        function IsUndefined(x) {
            return x === undefined;
        }
        // 6.1.2 The Null Type
        // https://tc39.github.io/ecma262/#sec-ecmascript-language-types-null-type
        function IsNull(x) {
            return x === null;
        }
        // 6.1.5 The Symbol Type
        // https://tc39.github.io/ecma262/#sec-ecmascript-language-types-symbol-type
        function IsSymbol(x) {
            return typeof x === "symbol";
        }
        // 6.1.7 The Object Type
        // https://tc39.github.io/ecma262/#sec-object-type
        function IsObject(x) {
            return typeof x === "object" ? x !== null : typeof x === "function";
        }
        // 7.1 Type Conversion
        // https://tc39.github.io/ecma262/#sec-type-conversion
        // 7.1.1 ToPrimitive(input [, PreferredType])
        // https://tc39.github.io/ecma262/#sec-toprimitive
        function ToPrimitive(input, PreferredType) {
            switch (Type(input)) {
                case 0 /* Undefined */: return input;
                case 1 /* Null */: return input;
                case 2 /* Boolean */: return input;
                case 3 /* String */: return input;
                case 4 /* Symbol */: return input;
                case 5 /* Number */: return input;
            }
            var hint = PreferredType === 3 /* String */ ? "string" : PreferredType === 5 /* Number */ ? "number" : "default";
            var exoticToPrim = GetMethod(input, toPrimitiveSymbol);
            if (exoticToPrim !== undefined) {
                var result = exoticToPrim.call(input, hint);
                if (IsObject(result))
                    throw new TypeError();
                return result;
            }
            return OrdinaryToPrimitive(input, hint === "default" ? "number" : hint);
        }
        // 7.1.1.1 OrdinaryToPrimitive(O, hint)
        // https://tc39.github.io/ecma262/#sec-ordinarytoprimitive
        function OrdinaryToPrimitive(O, hint) {
            if (hint === "string") {
                var toString_1 = O.toString;
                if (IsCallable(toString_1)) {
                    var result = toString_1.call(O);
                    if (!IsObject(result))
                        return result;
                }
                var valueOf = O.valueOf;
                if (IsCallable(valueOf)) {
                    var result = valueOf.call(O);
                    if (!IsObject(result))
                        return result;
                }
            }
            else {
                var valueOf = O.valueOf;
                if (IsCallable(valueOf)) {
                    var result = valueOf.call(O);
                    if (!IsObject(result))
                        return result;
                }
                var toString_2 = O.toString;
                if (IsCallable(toString_2)) {
                    var result = toString_2.call(O);
                    if (!IsObject(result))
                        return result;
                }
            }
            throw new TypeError();
        }
        // 7.1.2 ToBoolean(argument)
        // https://tc39.github.io/ecma262/2016/#sec-toboolean
        function ToBoolean(argument) {
            return !!argument;
        }
        // 7.1.12 ToString(argument)
        // https://tc39.github.io/ecma262/#sec-tostring
        function ToString(argument) {
            return "" + argument;
        }
        // 7.1.14 ToPropertyKey(argument)
        // https://tc39.github.io/ecma262/#sec-topropertykey
        function ToPropertyKey(argument) {
            var key = ToPrimitive(argument, 3 /* String */);
            if (IsSymbol(key))
                return key;
            return ToString(key);
        }
        // 7.2 Testing and Comparison Operations
        // https://tc39.github.io/ecma262/#sec-testing-and-comparison-operations
        // 7.2.2 IsArray(argument)
        // https://tc39.github.io/ecma262/#sec-isarray
        function IsArray(argument) {
            return Array.isArray
                ? Array.isArray(argument)
                : argument instanceof Object
                    ? argument instanceof Array
                    : Object.prototype.toString.call(argument) === "[object Array]";
        }
        // 7.2.3 IsCallable(argument)
        // https://tc39.github.io/ecma262/#sec-iscallable
        function IsCallable(argument) {
            // NOTE: This is an approximation as we cannot check for [[Call]] internal method.
            return typeof argument === "function";
        }
        // 7.2.4 IsConstructor(argument)
        // https://tc39.github.io/ecma262/#sec-isconstructor
        function IsConstructor(argument) {
            // NOTE: This is an approximation as we cannot check for [[Construct]] internal method.
            return typeof argument === "function";
        }
        // 7.2.7 IsPropertyKey(argument)
        // https://tc39.github.io/ecma262/#sec-ispropertykey
        function IsPropertyKey(argument) {
            switch (Type(argument)) {
                case 3 /* String */: return true;
                case 4 /* Symbol */: return true;
                default: return false;
            }
        }
        function SameValueZero(x, y) {
            return x === y || x !== x && y !== y;
        }
        // 7.3 Operations on Objects
        // https://tc39.github.io/ecma262/#sec-operations-on-objects
        // 7.3.9 GetMethod(V, P)
        // https://tc39.github.io/ecma262/#sec-getmethod
        function GetMethod(V, P) {
            var func = V[P];
            if (func === undefined || func === null)
                return undefined;
            if (!IsCallable(func))
                throw new TypeError();
            return func;
        }
        // 7.4 Operations on Iterator Objects
        // https://tc39.github.io/ecma262/#sec-operations-on-iterator-objects
        function GetIterator(obj) {
            var method = GetMethod(obj, iteratorSymbol);
            if (!IsCallable(method))
                throw new TypeError(); // from Call
            var iterator = method.call(obj);
            if (!IsObject(iterator))
                throw new TypeError();
            return iterator;
        }
        // 7.4.4 IteratorValue(iterResult)
        // https://tc39.github.io/ecma262/2016/#sec-iteratorvalue
        function IteratorValue(iterResult) {
            return iterResult.value;
        }
        // 7.4.5 IteratorStep(iterator)
        // https://tc39.github.io/ecma262/#sec-iteratorstep
        function IteratorStep(iterator) {
            var result = iterator.next();
            return result.done ? false : result;
        }
        // 7.4.6 IteratorClose(iterator, completion)
        // https://tc39.github.io/ecma262/#sec-iteratorclose
        function IteratorClose(iterator) {
            var f = iterator["return"];
            if (f)
                f.call(iterator);
        }
        // 9.1 Ordinary Object Internal Methods and Internal Slots
        // https://tc39.github.io/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots
        // 9.1.1.1 OrdinaryGetPrototypeOf(O)
        // https://tc39.github.io/ecma262/#sec-ordinarygetprototypeof
        function OrdinaryGetPrototypeOf(O) {
            var proto = Object.getPrototypeOf(O);
            if (typeof O !== "function" || O === functionPrototype)
                return proto;
            // TypeScript doesn't set __proto__ in ES5, as it's non-standard.
            // Try to determine the superclass constructor. Compatible implementations
            // must either set __proto__ on a subclass constructor to the superclass constructor,
            // or ensure each class has a valid `constructor` property on its prototype that
            // points back to the constructor.
            // If this is not the same as Function.[[Prototype]], then this is definately inherited.
            // This is the case when in ES6 or when using __proto__ in a compatible browser.
            if (proto !== functionPrototype)
                return proto;
            // If the super prototype is Object.prototype, null, or undefined, then we cannot determine the heritage.
            var prototype = O.prototype;
            var prototypeProto = prototype && Object.getPrototypeOf(prototype);
            if (prototypeProto == null || prototypeProto === Object.prototype)
                return proto;
            // If the constructor was not a function, then we cannot determine the heritage.
            var constructor = prototypeProto.constructor;
            if (typeof constructor !== "function")
                return proto;
            // If we have some kind of self-reference, then we cannot determine the heritage.
            if (constructor === O)
                return proto;
            // we have a pretty good guess at the heritage.
            return constructor;
        }
        // Global metadata registry
        // - Allows `import "reflect-metadata"` and `import "reflect-metadata/no-conflict"` to interoperate.
        // - Uses isolated metadata if `Reflect` is frozen before the registry can be installed.
        /**
         * Creates a registry used to allow multiple `reflect-metadata` providers.
         */
        function CreateMetadataRegistry() {
            var fallback;
            if (!IsUndefined(registrySymbol) &&
                typeof root.Reflect !== "undefined" &&
                !(registrySymbol in root.Reflect) &&
                typeof root.Reflect.defineMetadata === "function") {
                // interoperate with older version of `reflect-metadata` that did not support a registry.
                fallback = CreateFallbackProvider(root.Reflect);
            }
            var first;
            var second;
            var rest;
            var targetProviderMap = new _WeakMap();
            var registry = {
                registerProvider: registerProvider,
                getProvider: getProvider,
                setProvider: setProvider,
            };
            return registry;
            function registerProvider(provider) {
                if (!Object.isExtensible(registry)) {
                    throw new Error("Cannot add provider to a frozen registry.");
                }
                switch (true) {
                    case fallback === provider: break;
                    case IsUndefined(first):
                        first = provider;
                        break;
                    case first === provider: break;
                    case IsUndefined(second):
                        second = provider;
                        break;
                    case second === provider: break;
                    default:
                        if (rest === undefined)
                            rest = new _Set();
                        rest.add(provider);
                        break;
                }
            }
            function getProviderNoCache(O, P) {
                if (!IsUndefined(first)) {
                    if (first.isProviderFor(O, P))
                        return first;
                    if (!IsUndefined(second)) {
                        if (second.isProviderFor(O, P))
                            return first;
                        if (!IsUndefined(rest)) {
                            var iterator = GetIterator(rest);
                            while (true) {
                                var next = IteratorStep(iterator);
                                if (!next) {
                                    return undefined;
                                }
                                var provider = IteratorValue(next);
                                if (provider.isProviderFor(O, P)) {
                                    IteratorClose(iterator);
                                    return provider;
                                }
                            }
                        }
                    }
                }
                if (!IsUndefined(fallback) && fallback.isProviderFor(O, P)) {
                    return fallback;
                }
                return undefined;
            }
            function getProvider(O, P) {
                var providerMap = targetProviderMap.get(O);
                var provider;
                if (!IsUndefined(providerMap)) {
                    provider = providerMap.get(P);
                }
                if (!IsUndefined(provider)) {
                    return provider;
                }
                provider = getProviderNoCache(O, P);
                if (!IsUndefined(provider)) {
                    if (IsUndefined(providerMap)) {
                        providerMap = new _Map();
                        targetProviderMap.set(O, providerMap);
                    }
                    providerMap.set(P, provider);
                }
                return provider;
            }
            function hasProvider(provider) {
                if (IsUndefined(provider))
                    throw new TypeError();
                return first === provider || second === provider || !IsUndefined(rest) && rest.has(provider);
            }
            function setProvider(O, P, provider) {
                if (!hasProvider(provider)) {
                    throw new Error("Metadata provider not registered.");
                }
                var existingProvider = getProvider(O, P);
                if (existingProvider !== provider) {
                    if (!IsUndefined(existingProvider)) {
                        return false;
                    }
                    var providerMap = targetProviderMap.get(O);
                    if (IsUndefined(providerMap)) {
                        providerMap = new _Map();
                        targetProviderMap.set(O, providerMap);
                    }
                    providerMap.set(P, provider);
                }
                return true;
            }
        }
        /**
         * Gets or creates the shared registry of metadata providers.
         */
        function GetOrCreateMetadataRegistry() {
            var metadataRegistry;
            if (!IsUndefined(registrySymbol) && IsObject(root.Reflect) && Object.isExtensible(root.Reflect)) {
                metadataRegistry = root.Reflect[registrySymbol];
            }
            if (IsUndefined(metadataRegistry)) {
                metadataRegistry = CreateMetadataRegistry();
            }
            if (!IsUndefined(registrySymbol) && IsObject(root.Reflect) && Object.isExtensible(root.Reflect)) {
                Object.defineProperty(root.Reflect, registrySymbol, {
                    enumerable: false,
                    configurable: false,
                    writable: false,
                    value: metadataRegistry
                });
            }
            return metadataRegistry;
        }
        function CreateMetadataProvider(registry) {
            // [[Metadata]] internal slot
            // https://rbuckton.github.io/reflect-metadata/#ordinary-object-internal-methods-and-internal-slots
            var metadata = new _WeakMap();
            var provider = {
                isProviderFor: function (O, P) {
                    var targetMetadata = metadata.get(O);
                    if (IsUndefined(targetMetadata))
                        return false;
                    return targetMetadata.has(P);
                },
                OrdinaryDefineOwnMetadata: OrdinaryDefineOwnMetadata,
                OrdinaryHasOwnMetadata: OrdinaryHasOwnMetadata,
                OrdinaryGetOwnMetadata: OrdinaryGetOwnMetadata,
                OrdinaryOwnMetadataKeys: OrdinaryOwnMetadataKeys,
                OrdinaryDeleteMetadata: OrdinaryDeleteMetadata,
            };
            metadataRegistry.registerProvider(provider);
            return provider;
            function GetOrCreateMetadataMap(O, P, Create) {
                var targetMetadata = metadata.get(O);
                var createdTargetMetadata = false;
                if (IsUndefined(targetMetadata)) {
                    if (!Create)
                        return undefined;
                    targetMetadata = new _Map();
                    metadata.set(O, targetMetadata);
                    createdTargetMetadata = true;
                }
                var metadataMap = targetMetadata.get(P);
                if (IsUndefined(metadataMap)) {
                    if (!Create)
                        return undefined;
                    metadataMap = new _Map();
                    targetMetadata.set(P, metadataMap);
                    if (!registry.setProvider(O, P, provider)) {
                        targetMetadata.delete(P);
                        if (createdTargetMetadata) {
                            metadata.delete(O);
                        }
                        throw new Error("Wrong provider for target.");
                    }
                }
                return metadataMap;
            }
            // 3.1.2.1 OrdinaryHasOwnMetadata(MetadataKey, O, P)
            // https://rbuckton.github.io/reflect-metadata/#ordinaryhasownmetadata
            function OrdinaryHasOwnMetadata(MetadataKey, O, P) {
                var metadataMap = GetOrCreateMetadataMap(O, P, /*Create*/ false);
                if (IsUndefined(metadataMap))
                    return false;
                return ToBoolean(metadataMap.has(MetadataKey));
            }
            // 3.1.4.1 OrdinaryGetOwnMetadata(MetadataKey, O, P)
            // https://rbuckton.github.io/reflect-metadata/#ordinarygetownmetadata
            function OrdinaryGetOwnMetadata(MetadataKey, O, P) {
                var metadataMap = GetOrCreateMetadataMap(O, P, /*Create*/ false);
                if (IsUndefined(metadataMap))
                    return undefined;
                return metadataMap.get(MetadataKey);
            }
            // 3.1.5.1 OrdinaryDefineOwnMetadata(MetadataKey, MetadataValue, O, P)
            // https://rbuckton.github.io/reflect-metadata/#ordinarydefineownmetadata
            function OrdinaryDefineOwnMetadata(MetadataKey, MetadataValue, O, P) {
                var metadataMap = GetOrCreateMetadataMap(O, P, /*Create*/ true);
                metadataMap.set(MetadataKey, MetadataValue);
            }
            // 3.1.7.1 OrdinaryOwnMetadataKeys(O, P)
            // https://rbuckton.github.io/reflect-metadata/#ordinaryownmetadatakeys
            function OrdinaryOwnMetadataKeys(O, P) {
                var keys = [];
                var metadataMap = GetOrCreateMetadataMap(O, P, /*Create*/ false);
                if (IsUndefined(metadataMap))
                    return keys;
                var keysObj = metadataMap.keys();
                var iterator = GetIterator(keysObj);
                var k = 0;
                while (true) {
                    var next = IteratorStep(iterator);
                    if (!next) {
                        keys.length = k;
                        return keys;
                    }
                    var nextValue = IteratorValue(next);
                    try {
                        keys[k] = nextValue;
                    }
                    catch (e) {
                        try {
                            IteratorClose(iterator);
                        }
                        finally {
                            throw e;
                        }
                    }
                    k++;
                }
            }
            function OrdinaryDeleteMetadata(MetadataKey, O, P) {
                var metadataMap = GetOrCreateMetadataMap(O, P, /*Create*/ false);
                if (IsUndefined(metadataMap))
                    return false;
                if (!metadataMap.delete(MetadataKey))
                    return false;
                if (metadataMap.size === 0) {
                    var targetMetadata = metadata.get(O);
                    if (!IsUndefined(targetMetadata)) {
                        targetMetadata.delete(P);
                        if (targetMetadata.size === 0) {
                            metadata.delete(targetMetadata);
                        }
                    }
                }
                return true;
            }
        }
        function CreateFallbackProvider(reflect) {
            var defineMetadata = reflect.defineMetadata, hasOwnMetadata = reflect.hasOwnMetadata, getOwnMetadata = reflect.getOwnMetadata, getOwnMetadataKeys = reflect.getOwnMetadataKeys, deleteMetadata = reflect.deleteMetadata;
            var metadataOwner = new _WeakMap();
            var provider = {
                isProviderFor: function (O, P) {
                    var metadataPropertySet = metadataOwner.get(O);
                    if (!IsUndefined(metadataPropertySet) && metadataPropertySet.has(P)) {
                        return true;
                    }
                    if (getOwnMetadataKeys(O, P).length) {
                        if (IsUndefined(metadataPropertySet)) {
                            metadataPropertySet = new _Set();
                            metadataOwner.set(O, metadataPropertySet);
                        }
                        metadataPropertySet.add(P);
                        return true;
                    }
                    return false;
                },
                OrdinaryDefineOwnMetadata: defineMetadata,
                OrdinaryHasOwnMetadata: hasOwnMetadata,
                OrdinaryGetOwnMetadata: getOwnMetadata,
                OrdinaryOwnMetadataKeys: getOwnMetadataKeys,
                OrdinaryDeleteMetadata: deleteMetadata,
            };
            return provider;
        }
        /**
         * Gets the metadata provider for an object. If the object has no metadata provider and this is for a create operation,
         * then this module's metadata provider is assigned to the object.
         */
        function GetMetadataProvider(O, P, Create) {
            var registeredProvider = metadataRegistry.getProvider(O, P);
            if (!IsUndefined(registeredProvider)) {
                return registeredProvider;
            }
            if (Create) {
                if (metadataRegistry.setProvider(O, P, metadataProvider)) {
                    return metadataProvider;
                }
                throw new Error("Illegal state.");
            }
            return undefined;
        }
        // naive Map shim
        function CreateMapPolyfill() {
            var cacheSentinel = {};
            var arraySentinel = [];
            var MapIterator = /** @class */ (function () {
                function MapIterator(keys, values, selector) {
                    this._index = 0;
                    this._keys = keys;
                    this._values = values;
                    this._selector = selector;
                }
                MapIterator.prototype["@@iterator"] = function () { return this; };
                MapIterator.prototype[iteratorSymbol] = function () { return this; };
                MapIterator.prototype.next = function () {
                    var index = this._index;
                    if (index >= 0 && index < this._keys.length) {
                        var result = this._selector(this._keys[index], this._values[index]);
                        if (index + 1 >= this._keys.length) {
                            this._index = -1;
                            this._keys = arraySentinel;
                            this._values = arraySentinel;
                        }
                        else {
                            this._index++;
                        }
                        return { value: result, done: false };
                    }
                    return { value: undefined, done: true };
                };
                MapIterator.prototype.throw = function (error) {
                    if (this._index >= 0) {
                        this._index = -1;
                        this._keys = arraySentinel;
                        this._values = arraySentinel;
                    }
                    throw error;
                };
                MapIterator.prototype.return = function (value) {
                    if (this._index >= 0) {
                        this._index = -1;
                        this._keys = arraySentinel;
                        this._values = arraySentinel;
                    }
                    return { value: value, done: true };
                };
                return MapIterator;
            }());
            var Map = /** @class */ (function () {
                function Map() {
                    this._keys = [];
                    this._values = [];
                    this._cacheKey = cacheSentinel;
                    this._cacheIndex = -2;
                }
                Object.defineProperty(Map.prototype, "size", {
                    get: function () { return this._keys.length; },
                    enumerable: true,
                    configurable: true
                });
                Map.prototype.has = function (key) { return this._find(key, /*insert*/ false) >= 0; };
                Map.prototype.get = function (key) {
                    var index = this._find(key, /*insert*/ false);
                    return index >= 0 ? this._values[index] : undefined;
                };
                Map.prototype.set = function (key, value) {
                    var index = this._find(key, /*insert*/ true);
                    this._values[index] = value;
                    return this;
                };
                Map.prototype.delete = function (key) {
                    var index = this._find(key, /*insert*/ false);
                    if (index >= 0) {
                        var size = this._keys.length;
                        for (var i = index + 1; i < size; i++) {
                            this._keys[i - 1] = this._keys[i];
                            this._values[i - 1] = this._values[i];
                        }
                        this._keys.length--;
                        this._values.length--;
                        if (SameValueZero(key, this._cacheKey)) {
                            this._cacheKey = cacheSentinel;
                            this._cacheIndex = -2;
                        }
                        return true;
                    }
                    return false;
                };
                Map.prototype.clear = function () {
                    this._keys.length = 0;
                    this._values.length = 0;
                    this._cacheKey = cacheSentinel;
                    this._cacheIndex = -2;
                };
                Map.prototype.keys = function () { return new MapIterator(this._keys, this._values, getKey); };
                Map.prototype.values = function () { return new MapIterator(this._keys, this._values, getValue); };
                Map.prototype.entries = function () { return new MapIterator(this._keys, this._values, getEntry); };
                Map.prototype["@@iterator"] = function () { return this.entries(); };
                Map.prototype[iteratorSymbol] = function () { return this.entries(); };
                Map.prototype._find = function (key, insert) {
                    if (!SameValueZero(this._cacheKey, key)) {
                        this._cacheIndex = -1;
                        for (var i = 0; i < this._keys.length; i++) {
                            if (SameValueZero(this._keys[i], key)) {
                                this._cacheIndex = i;
                                break;
                            }
                        }
                    }
                    if (this._cacheIndex < 0 && insert) {
                        this._cacheIndex = this._keys.length;
                        this._keys.push(key);
                        this._values.push(undefined);
                    }
                    return this._cacheIndex;
                };
                return Map;
            }());
            return Map;
            function getKey(key, _) {
                return key;
            }
            function getValue(_, value) {
                return value;
            }
            function getEntry(key, value) {
                return [key, value];
            }
        }
        // naive Set shim
        function CreateSetPolyfill() {
            var Set = /** @class */ (function () {
                function Set() {
                    this._map = new _Map();
                }
                Object.defineProperty(Set.prototype, "size", {
                    get: function () { return this._map.size; },
                    enumerable: true,
                    configurable: true
                });
                Set.prototype.has = function (value) { return this._map.has(value); };
                Set.prototype.add = function (value) { return this._map.set(value, value), this; };
                Set.prototype.delete = function (value) { return this._map.delete(value); };
                Set.prototype.clear = function () { this._map.clear(); };
                Set.prototype.keys = function () { return this._map.keys(); };
                Set.prototype.values = function () { return this._map.keys(); };
                Set.prototype.entries = function () { return this._map.entries(); };
                Set.prototype["@@iterator"] = function () { return this.keys(); };
                Set.prototype[iteratorSymbol] = function () { return this.keys(); };
                return Set;
            }());
            return Set;
        }
        // naive WeakMap shim
        function CreateWeakMapPolyfill() {
            var UUID_SIZE = 16;
            var keys = HashMap.create();
            var rootKey = CreateUniqueKey();
            return /** @class */ (function () {
                function WeakMap() {
                    this._key = CreateUniqueKey();
                }
                WeakMap.prototype.has = function (target) {
                    var table = GetOrCreateWeakMapTable(target, /*create*/ false);
                    return table !== undefined ? HashMap.has(table, this._key) : false;
                };
                WeakMap.prototype.get = function (target) {
                    var table = GetOrCreateWeakMapTable(target, /*create*/ false);
                    return table !== undefined ? HashMap.get(table, this._key) : undefined;
                };
                WeakMap.prototype.set = function (target, value) {
                    var table = GetOrCreateWeakMapTable(target, /*create*/ true);
                    table[this._key] = value;
                    return this;
                };
                WeakMap.prototype.delete = function (target) {
                    var table = GetOrCreateWeakMapTable(target, /*create*/ false);
                    return table !== undefined ? delete table[this._key] : false;
                };
                WeakMap.prototype.clear = function () {
                    // NOTE: not a real clear, just makes the previous data unreachable
                    this._key = CreateUniqueKey();
                };
                return WeakMap;
            }());
            function CreateUniqueKey() {
                var key;
                do
                    key = "@@WeakMap@@" + CreateUUID();
                while (HashMap.has(keys, key));
                keys[key] = true;
                return key;
            }
            function GetOrCreateWeakMapTable(target, create) {
                if (!hasOwn.call(target, rootKey)) {
                    if (!create)
                        return undefined;
                    Object.defineProperty(target, rootKey, { value: HashMap.create() });
                }
                return target[rootKey];
            }
            function FillRandomBytes(buffer, size) {
                for (var i = 0; i < size; ++i)
                    buffer[i] = Math.random() * 0xff | 0;
                return buffer;
            }
            function GenRandomBytes(size) {
                if (typeof Uint8Array === "function") {
                    var array = new Uint8Array(size);
                    if (typeof crypto !== "undefined") {
                        crypto.getRandomValues(array);
                    }
                    else if (typeof msCrypto !== "undefined") {
                        msCrypto.getRandomValues(array);
                    }
                    else {
                        FillRandomBytes(array, size);
                    }
                    return array;
                }
                return FillRandomBytes(new Array(size), size);
            }
            function CreateUUID() {
                var data = GenRandomBytes(UUID_SIZE);
                // mark as random - RFC 4122 § 4.4
                data[6] = data[6] & 0x4f | 0x40;
                data[8] = data[8] & 0xbf | 0x80;
                var result = "";
                for (var offset = 0; offset < UUID_SIZE; ++offset) {
                    var byte = data[offset];
                    if (offset === 4 || offset === 6 || offset === 8)
                        result += "-";
                    if (byte < 16)
                        result += "0";
                    result += byte.toString(16).toLowerCase();
                }
                return result;
            }
        }
        // uses a heuristic used by v8 and chakra to force an object into dictionary mode.
        function MakeDictionary(obj) {
            obj.__ = undefined;
            delete obj.__;
            return obj;
        }
    });
})(Reflect || (Reflect = {}));


/***/ }),
/* 4 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.stringifyServiceIdentifier = exports.LazyServiceIdentifier = void 0;
const stringifyServiceIdentifier_1 = __webpack_require__(5);
Object.defineProperty(exports, "stringifyServiceIdentifier", ({ enumerable: true, get: function () { return stringifyServiceIdentifier_1.stringifyServiceIdentifier; } }));
const LazyServiceIdentifier_1 = __webpack_require__(6);
Object.defineProperty(exports, "LazyServiceIdentifier", ({ enumerable: true, get: function () { return LazyServiceIdentifier_1.LazyServiceIdentifier; } }));
//# sourceMappingURL=index.js.map

/***/ }),
/* 5 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.stringifyServiceIdentifier = stringifyServiceIdentifier;
function stringifyServiceIdentifier(serviceIdentifier) {
    switch (typeof serviceIdentifier) {
        case 'string':
        case 'symbol':
            return serviceIdentifier.toString();
        case 'function':
            return serviceIdentifier.name;
        default:
            throw new Error(`Unexpected ${typeof serviceIdentifier} service id type`);
    }
}
//# sourceMappingURL=stringifyServiceIdentifier.js.map

/***/ }),
/* 6 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LazyServiceIdentifier = exports.islazyServiceIdentifierSymbol = void 0;
exports.islazyServiceIdentifierSymbol = Symbol.for('@inversifyjs/common/islazyServiceIdentifier');
class LazyServiceIdentifier {
    [exports.islazyServiceIdentifierSymbol];
    #buildServiceId;
    constructor(buildServiceId) {
        this.#buildServiceId = buildServiceId;
        this[exports.islazyServiceIdentifierSymbol] = true;
    }
    static is(value) {
        return (typeof value === 'object' &&
            value !== null &&
            value[exports.islazyServiceIdentifierSymbol] === true);
    }
    unwrap() {
        return this.#buildServiceId();
    }
}
exports.LazyServiceIdentifier = LazyServiceIdentifier;
//# sourceMappingURL=LazyServiceIdentifier.js.map

/***/ }),
/* 7 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.NON_CUSTOM_TAG_KEYS = exports.PRE_DESTROY = exports.POST_CONSTRUCT = exports.DESIGN_PARAM_TYPES = exports.PARAM_TYPES = exports.TAGGED_PROP = exports.TAGGED = exports.MULTI_INJECT_TAG = exports.INJECT_TAG = exports.OPTIONAL_TAG = exports.UNMANAGED_TAG = exports.NAME_TAG = exports.NAMED_TAG = void 0;
// Used for named bindings
exports.NAMED_TAG = 'named';
// The name of the target at design time
exports.NAME_TAG = 'name';
// The for unmanaged injections (in base classes when using inheritance)
exports.UNMANAGED_TAG = 'unmanaged';
// The for optional injections
exports.OPTIONAL_TAG = 'optional';
// The type of the binding at design time
exports.INJECT_TAG = 'inject';
// The type of the binding at design type for multi-injections
exports.MULTI_INJECT_TAG = 'multi_inject';
// used to store constructor arguments tags
exports.TAGGED = 'inversify:tagged';
// used to store class properties tags
exports.TAGGED_PROP = 'inversify:tagged_props';
// used to store types to be injected
exports.PARAM_TYPES = 'inversify:paramtypes';
// used to access design time types
exports.DESIGN_PARAM_TYPES = 'design:paramtypes';
// used to identify postConstruct functions
exports.POST_CONSTRUCT = 'post_construct';
// used to identify preDestroy functions
exports.PRE_DESTROY = 'pre_destroy';
function getNonCustomTagKeys() {
    return [
        exports.INJECT_TAG,
        exports.MULTI_INJECT_TAG,
        exports.NAME_TAG,
        exports.UNMANAGED_TAG,
        exports.NAMED_TAG,
        exports.OPTIONAL_TAG,
    ];
}
exports.NON_CUSTOM_TAG_KEYS = getNonCustomTagKeys();
//# sourceMappingURL=metadata_keys.js.map

/***/ }),
/* 8 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Container = void 0;
const binding_1 = __webpack_require__(9);
const ERROR_MSGS = __importStar(__webpack_require__(12));
const literal_types_1 = __webpack_require__(10);
const METADATA_KEY = __importStar(__webpack_require__(7));
const metadata_reader_1 = __webpack_require__(13);
const planner_1 = __webpack_require__(14);
const resolver_1 = __webpack_require__(51);
const binding_to_syntax_1 = __webpack_require__(57);
const async_1 = __webpack_require__(53);
const id_1 = __webpack_require__(11);
const serialization_1 = __webpack_require__(44);
const container_snapshot_1 = __webpack_require__(64);
const lookup_1 = __webpack_require__(65);
const module_activation_store_1 = __webpack_require__(67);
class Container {
    id;
    parent;
    options;
    _middleware;
    _bindingDictionary;
    _activations;
    _deactivations;
    _snapshots;
    _metadataReader;
    _moduleActivationStore;
    constructor(containerOptions) {
        const options = containerOptions || {};
        if (typeof options !== 'object') {
            throw new Error(ERROR_MSGS.CONTAINER_OPTIONS_MUST_BE_AN_OBJECT);
        }
        if (options.defaultScope === undefined) {
            options.defaultScope = literal_types_1.BindingScopeEnum.Transient;
        }
        else if (options.defaultScope !== literal_types_1.BindingScopeEnum.Singleton &&
            options.defaultScope !== literal_types_1.BindingScopeEnum.Transient &&
            options.defaultScope !== literal_types_1.BindingScopeEnum.Request) {
            throw new Error(ERROR_MSGS.CONTAINER_OPTIONS_INVALID_DEFAULT_SCOPE);
        }
        if (options.autoBindInjectable === undefined) {
            options.autoBindInjectable = false;
        }
        else if (typeof options.autoBindInjectable !== 'boolean') {
            throw new Error(ERROR_MSGS.CONTAINER_OPTIONS_INVALID_AUTO_BIND_INJECTABLE);
        }
        if (options.skipBaseClassChecks === undefined) {
            options.skipBaseClassChecks = false;
        }
        else if (typeof options.skipBaseClassChecks !== 'boolean') {
            throw new Error(ERROR_MSGS.CONTAINER_OPTIONS_INVALID_SKIP_BASE_CHECK);
        }
        this.options = {
            autoBindInjectable: options.autoBindInjectable,
            defaultScope: options.defaultScope,
            skipBaseClassChecks: options.skipBaseClassChecks,
        };
        this.id = (0, id_1.id)();
        this._bindingDictionary = new lookup_1.Lookup();
        this._snapshots = [];
        this._middleware = null;
        this._activations = new lookup_1.Lookup();
        this._deactivations = new lookup_1.Lookup();
        this.parent = null;
        this._metadataReader = new metadata_reader_1.MetadataReader();
        this._moduleActivationStore = new module_activation_store_1.ModuleActivationStore();
    }
    static merge(container1, container2, ...containers) {
        const container = new Container();
        const targetContainers = [
            container1,
            container2,
            ...containers,
        ].map((targetContainer) => (0, planner_1.getBindingDictionary)(targetContainer));
        const bindingDictionary = (0, planner_1.getBindingDictionary)(container);
        function copyDictionary(origin, destination) {
            origin.traverse((_key, value) => {
                value.forEach((binding) => {
                    destination.add(binding.serviceIdentifier, binding.clone());
                });
            });
        }
        targetContainers.forEach((targetBindingDictionary) => {
            copyDictionary(targetBindingDictionary, bindingDictionary);
        });
        return container;
    }
    load(...modules) {
        // eslint-disable-next-line @typescript-eslint/typedef
        const getHelpers = this._getContainerModuleHelpersFactory();
        for (const currentModule of modules) {
            // eslint-disable-next-line @typescript-eslint/typedef
            const containerModuleHelpers = getHelpers(currentModule.id);
            currentModule.registry(containerModuleHelpers.bindFunction, containerModuleHelpers.unbindFunction, containerModuleHelpers.isboundFunction, containerModuleHelpers.rebindFunction, containerModuleHelpers.unbindAsyncFunction, containerModuleHelpers.onActivationFunction, containerModuleHelpers.onDeactivationFunction);
        }
    }
    async loadAsync(...modules) {
        // eslint-disable-next-line @typescript-eslint/typedef
        const getHelpers = this._getContainerModuleHelpersFactory();
        for (const currentModule of modules) {
            // eslint-disable-next-line @typescript-eslint/typedef
            const containerModuleHelpers = getHelpers(currentModule.id);
            await currentModule.registry(containerModuleHelpers.bindFunction, containerModuleHelpers.unbindFunction, containerModuleHelpers.isboundFunction, containerModuleHelpers.rebindFunction, containerModuleHelpers.unbindAsyncFunction, containerModuleHelpers.onActivationFunction, containerModuleHelpers.onDeactivationFunction);
        }
    }
    unload(...modules) {
        modules.forEach((module) => {
            const deactivations = this._removeModuleBindings(module.id);
            this._deactivateSingletons(deactivations);
            this._removeModuleHandlers(module.id);
        });
    }
    async unloadAsync(...modules) {
        for (const module of modules) {
            const deactivations = this._removeModuleBindings(module.id);
            await this._deactivateSingletonsAsync(deactivations);
            this._removeModuleHandlers(module.id);
        }
    }
    // Registers a type binding
    bind(serviceIdentifier) {
        return this._bind(this._buildBinding(serviceIdentifier));
    }
    rebind(serviceIdentifier) {
        this.unbind(serviceIdentifier);
        return this.bind(serviceIdentifier);
    }
    async rebindAsync(serviceIdentifier) {
        await this.unbindAsync(serviceIdentifier);
        return this.bind(serviceIdentifier);
    }
    // Removes a type binding from the registry by its key
    unbind(serviceIdentifier) {
        if (this._bindingDictionary.hasKey(serviceIdentifier)) {
            const bindings = this._bindingDictionary.get(serviceIdentifier);
            this._deactivateSingletons(bindings);
        }
        this._removeServiceFromDictionary(serviceIdentifier);
    }
    async unbindAsync(serviceIdentifier) {
        if (this._bindingDictionary.hasKey(serviceIdentifier)) {
            const bindings = this._bindingDictionary.get(serviceIdentifier);
            await this._deactivateSingletonsAsync(bindings);
        }
        this._removeServiceFromDictionary(serviceIdentifier);
    }
    // Removes all the type bindings from the registry
    unbindAll() {
        this._bindingDictionary.traverse((_key, value) => {
            this._deactivateSingletons(value);
        });
        this._bindingDictionary = new lookup_1.Lookup();
    }
    async unbindAllAsync() {
        const promises = [];
        this._bindingDictionary.traverse((_key, value) => {
            promises.push(this._deactivateSingletonsAsync(value));
        });
        await Promise.all(promises);
        this._bindingDictionary = new lookup_1.Lookup();
    }
    onActivation(serviceIdentifier, onActivation) {
        this._activations.add(serviceIdentifier, onActivation);
    }
    onDeactivation(serviceIdentifier, onDeactivation) {
        this._deactivations.add(serviceIdentifier, onDeactivation);
    }
    // Allows to check if there are bindings available for serviceIdentifier
    isBound(serviceIdentifier) {
        let bound = this._bindingDictionary.hasKey(serviceIdentifier);
        if (!bound && this.parent) {
            bound = this.parent.isBound(serviceIdentifier);
        }
        return bound;
    }
    // check binding dependency only in current container
    isCurrentBound(serviceIdentifier) {
        return this._bindingDictionary.hasKey(serviceIdentifier);
    }
    isBoundNamed(serviceIdentifier, named) {
        return this.isBoundTagged(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    // Check if a binding with a complex constraint is available without throwing a error. Ancestors are also verified.
    isBoundTagged(serviceIdentifier, key, value) {
        let bound = false;
        // verify if there are bindings available for serviceIdentifier on current binding dictionary
        if (this._bindingDictionary.hasKey(serviceIdentifier)) {
            const bindings = this._bindingDictionary.get(serviceIdentifier);
            const request = (0, planner_1.createMockRequest)(this, serviceIdentifier, {
                customTag: {
                    key,
                    value,
                },
                isMultiInject: false,
            });
            bound = bindings.some((b) => b.constraint(request));
        }
        // verify if there is a parent container that could solve the request
        if (!bound && this.parent) {
            bound = this.parent.isBoundTagged(serviceIdentifier, key, value);
        }
        return bound;
    }
    snapshot() {
        this._snapshots.push(container_snapshot_1.ContainerSnapshot.of(this._bindingDictionary.clone(), this._middleware, this._activations.clone(), this._deactivations.clone(), this._moduleActivationStore.clone()));
    }
    restore() {
        const snapshot = this._snapshots.pop();
        if (snapshot === undefined) {
            throw new Error(ERROR_MSGS.NO_MORE_SNAPSHOTS_AVAILABLE);
        }
        this._bindingDictionary = snapshot.bindings;
        this._activations = snapshot.activations;
        this._deactivations = snapshot.deactivations;
        this._middleware = snapshot.middleware;
        this._moduleActivationStore = snapshot.moduleActivationStore;
    }
    createChild(containerOptions) {
        const child = new Container(containerOptions || this.options);
        child.parent = this;
        return child;
    }
    applyMiddleware(...middlewares) {
        const initial = this._middleware
            ? this._middleware
            : this._planAndResolve();
        this._middleware = middlewares.reduce((prev, curr) => curr(prev), initial);
    }
    applyCustomMetadataReader(metadataReader) {
        this._metadataReader = metadataReader;
    }
    // Resolves a dependency by its runtime identifier
    // The runtime identifier must be associated with only one binding
    // use getAll when the runtime identifier is associated with multiple bindings
    get(serviceIdentifier) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, false);
        return this._getButThrowIfAsync(getArgs);
    }
    async getAsync(serviceIdentifier) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, false);
        return this._get(getArgs);
    }
    getTagged(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, false, key, value);
        return this._getButThrowIfAsync(getArgs);
    }
    async getTaggedAsync(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, false, key, value);
        return this._get(getArgs);
    }
    getNamed(serviceIdentifier, named) {
        return this.getTagged(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    async getNamedAsync(serviceIdentifier, named) {
        return this.getTaggedAsync(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    // Resolves a dependency by its runtime identifier
    // The runtime identifier can be associated with one or multiple bindings
    getAll(serviceIdentifier, options) {
        const getArgs = this._getAllArgs(serviceIdentifier, options, false);
        return this._getButThrowIfAsync(getArgs);
    }
    async getAllAsync(serviceIdentifier, options) {
        const getArgs = this._getAllArgs(serviceIdentifier, options, false);
        return this._getAll(getArgs);
    }
    getAllTagged(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, true, false, key, value);
        return this._getButThrowIfAsync(getArgs);
    }
    async getAllTaggedAsync(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, true, false, key, value);
        return this._getAll(getArgs);
    }
    getAllNamed(serviceIdentifier, named) {
        return this.getAllTagged(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    async getAllNamedAsync(serviceIdentifier, named) {
        return this.getAllTaggedAsync(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    resolve(constructorFunction) {
        const isBound = this.isBound(constructorFunction);
        if (!isBound) {
            this.bind(constructorFunction).toSelf();
        }
        const resolved = this.get(constructorFunction);
        if (!isBound) {
            this.unbind(constructorFunction);
        }
        return resolved;
    }
    tryGet(serviceIdentifier) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, true);
        return this._getButThrowIfAsync(getArgs);
    }
    async tryGetAsync(serviceIdentifier) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, true);
        return this._get(getArgs);
    }
    tryGetTagged(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, true, key, value);
        return this._getButThrowIfAsync(getArgs);
    }
    async tryGetTaggedAsync(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, false, true, key, value);
        return this._get(getArgs);
    }
    tryGetNamed(serviceIdentifier, named) {
        return this.tryGetTagged(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    async tryGetNamedAsync(serviceIdentifier, named) {
        return this.tryGetTaggedAsync(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    tryGetAll(serviceIdentifier, options) {
        const getArgs = this._getAllArgs(serviceIdentifier, options, true);
        return this._getButThrowIfAsync(getArgs);
    }
    async tryGetAllAsync(serviceIdentifier, options) {
        const getArgs = this._getAllArgs(serviceIdentifier, options, true);
        return this._getAll(getArgs);
    }
    tryGetAllTagged(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, true, true, key, value);
        return this._getButThrowIfAsync(getArgs);
    }
    async tryGetAllTaggedAsync(serviceIdentifier, key, value) {
        const getArgs = this._getNotAllArgs(serviceIdentifier, true, true, key, value);
        return this._getAll(getArgs);
    }
    tryGetAllNamed(serviceIdentifier, named) {
        return this.tryGetAllTagged(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    async tryGetAllNamedAsync(serviceIdentifier, named) {
        return this.tryGetAllTaggedAsync(serviceIdentifier, METADATA_KEY.NAMED_TAG, named);
    }
    _preDestroy(constructor, instance) {
        if (constructor !== undefined &&
            Reflect.hasMetadata(METADATA_KEY.PRE_DESTROY, constructor)) {
            const data = Reflect.getMetadata(METADATA_KEY.PRE_DESTROY, constructor);
            return instance[data.value]?.();
        }
    }
    _removeModuleHandlers(moduleId) {
        const moduleActivationsHandlers = this._moduleActivationStore.remove(moduleId);
        this._activations.removeIntersection(moduleActivationsHandlers.onActivations);
        this._deactivations.removeIntersection(moduleActivationsHandlers.onDeactivations);
    }
    _removeModuleBindings(moduleId) {
        return this._bindingDictionary.removeByCondition((binding) => binding.moduleId === moduleId);
    }
    _deactivate(binding, instance) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const constructor = instance == undefined
            ? undefined
            : // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                Object.getPrototypeOf(instance).constructor;
        try {
            if (this._deactivations.hasKey(binding.serviceIdentifier)) {
                const result = this._deactivateContainer(instance, this._deactivations.get(binding.serviceIdentifier).values());
                if ((0, async_1.isPromise)(result)) {
                    return this._handleDeactivationError(result.then(async () => this._propagateContainerDeactivationThenBindingAndPreDestroyAsync(binding, instance, constructor)), binding.serviceIdentifier);
                }
            }
            const propagateDeactivationResult = this._propagateContainerDeactivationThenBindingAndPreDestroy(binding, instance, constructor);
            if ((0, async_1.isPromise)(propagateDeactivationResult)) {
                return this._handleDeactivationError(propagateDeactivationResult, binding.serviceIdentifier);
            }
        }
        catch (ex) {
            if (ex instanceof Error) {
                throw new Error(ERROR_MSGS.ON_DEACTIVATION_ERROR((0, serialization_1.getServiceIdentifierAsString)(binding.serviceIdentifier), ex.message));
            }
        }
    }
    async _handleDeactivationError(asyncResult, serviceIdentifier) {
        try {
            await asyncResult;
        }
        catch (ex) {
            if (ex instanceof Error) {
                throw new Error(ERROR_MSGS.ON_DEACTIVATION_ERROR((0, serialization_1.getServiceIdentifierAsString)(serviceIdentifier), ex.message));
            }
        }
    }
    _deactivateContainer(instance, deactivationsIterator) {
        let deactivation = deactivationsIterator.next();
        while (typeof deactivation.value === 'function') {
            const result = deactivation.value(instance);
            if ((0, async_1.isPromise)(result)) {
                return result.then(async () => this._deactivateContainerAsync(instance, deactivationsIterator));
            }
            deactivation = deactivationsIterator.next();
        }
    }
    async _deactivateContainerAsync(instance, deactivationsIterator) {
        let deactivation = deactivationsIterator.next();
        while (typeof deactivation.value === 'function') {
            await deactivation.value(instance);
            deactivation = deactivationsIterator.next();
        }
    }
    _getContainerModuleHelpersFactory() {
        const getBindFunction = (moduleId) => (serviceIdentifier) => {
            const binding = this._buildBinding(serviceIdentifier);
            binding.moduleId = moduleId;
            return this._bind(binding);
        };
        const getUnbindFunction = () => (serviceIdentifier) => {
            this.unbind(serviceIdentifier);
        };
        const getUnbindAsyncFunction = () => async (serviceIdentifier) => {
            return this.unbindAsync(serviceIdentifier);
        };
        const getIsboundFunction = () => (serviceIdentifier) => {
            return this.isBound(serviceIdentifier);
        };
        const getRebindFunction = (moduleId) => {
            const bind = getBindFunction(moduleId);
            return (serviceIdentifier) => {
                this.unbind(serviceIdentifier);
                return bind(serviceIdentifier);
            };
        };
        const getOnActivationFunction = (moduleId) => (serviceIdentifier, onActivation) => {
            this._moduleActivationStore.addActivation(moduleId, serviceIdentifier, onActivation);
            this.onActivation(serviceIdentifier, onActivation);
        };
        const getOnDeactivationFunction = (moduleId) => (serviceIdentifier, onDeactivation) => {
            this._moduleActivationStore.addDeactivation(moduleId, serviceIdentifier, onDeactivation);
            this.onDeactivation(serviceIdentifier, onDeactivation);
        };
        return (mId) => ({
            bindFunction: getBindFunction(mId),
            isboundFunction: getIsboundFunction(),
            onActivationFunction: getOnActivationFunction(mId),
            onDeactivationFunction: getOnDeactivationFunction(mId),
            rebindFunction: getRebindFunction(mId),
            unbindAsyncFunction: getUnbindAsyncFunction(),
            unbindFunction: getUnbindFunction(),
        });
    }
    _bind(binding) {
        this._bindingDictionary.add(binding.serviceIdentifier, binding);
        return new binding_to_syntax_1.BindingToSyntax(binding);
    }
    _buildBinding(serviceIdentifier) {
        const scope = this.options.defaultScope || literal_types_1.BindingScopeEnum.Transient;
        return new binding_1.Binding(serviceIdentifier, scope);
    }
    async _getAll(getArgs) {
        return Promise.all(this._get(getArgs));
    }
    // Prepares arguments required for resolution and
    // delegates resolution to _middleware if available
    // otherwise it delegates resolution to _planAndResolve
    _get(getArgs) {
        const planAndResolveArgs = {
            ...getArgs,
            contextInterceptor: (context) => context,
            targetType: literal_types_1.TargetTypeEnum.Variable,
        };
        if (this._middleware) {
            const middlewareResult = this._middleware(planAndResolveArgs);
            if (middlewareResult === undefined || middlewareResult === null) {
                throw new Error(ERROR_MSGS.INVALID_MIDDLEWARE_RETURN);
            }
            return middlewareResult;
        }
        return this._planAndResolve()(planAndResolveArgs);
    }
    _getButThrowIfAsync(getArgs) {
        const result = this._get(getArgs);
        if ((0, async_1.isPromiseOrContainsPromise)(result)) {
            throw new Error(ERROR_MSGS.LAZY_IN_SYNC(getArgs.serviceIdentifier));
        }
        return result;
    }
    _getAllArgs(serviceIdentifier, options, isOptional) {
        const getAllArgs = {
            avoidConstraints: !(options?.enforceBindingConstraints ?? false),
            isMultiInject: true,
            isOptional,
            serviceIdentifier,
        };
        return getAllArgs;
    }
    _getNotAllArgs(serviceIdentifier, isMultiInject, isOptional, key, value) {
        const getNotAllArgs = {
            avoidConstraints: false,
            isMultiInject,
            isOptional,
            key,
            serviceIdentifier,
            value,
        };
        return getNotAllArgs;
    }
    _getPlanMetadataFromNextArgs(args) {
        const planMetadata = {
            isMultiInject: args.isMultiInject,
        };
        if (args.key !== undefined) {
            planMetadata.customTag = {
                key: args.key,
                value: args.value,
            };
        }
        if (args.isOptional === true) {
            planMetadata.isOptional = true;
        }
        return planMetadata;
    }
    // Planner creates a plan and Resolver resolves a plan
    // one of the jobs of the Container is to links the Planner
    // with the Resolver and that is what this function is about
    _planAndResolve() {
        return (args) => {
            // create a plan
            let context = (0, planner_1.plan)(this._metadataReader, this, args.targetType, args.serviceIdentifier, this._getPlanMetadataFromNextArgs(args), args.avoidConstraints);
            // apply context interceptor
            context = args.contextInterceptor(context);
            // resolve plan
            const result = (0, resolver_1.resolve)(context);
            return result;
        };
    }
    _deactivateIfSingleton(binding) {
        if (!binding.activated) {
            return;
        }
        if ((0, async_1.isPromise)(binding.cache)) {
            return binding.cache.then((resolved) => this._deactivate(binding, resolved));
        }
        return this._deactivate(binding, binding.cache);
    }
    _deactivateSingletons(bindings) {
        for (const binding of bindings) {
            const result = this._deactivateIfSingleton(binding);
            if ((0, async_1.isPromise)(result)) {
                throw new Error(ERROR_MSGS.ASYNC_UNBIND_REQUIRED);
            }
        }
    }
    async _deactivateSingletonsAsync(bindings) {
        await Promise.all(bindings.map(async (b) => this._deactivateIfSingleton(b)));
    }
    _propagateContainerDeactivationThenBindingAndPreDestroy(binding, instance, constructor) {
        if (this.parent) {
            return this._deactivate.bind(this.parent)(binding, instance);
        }
        else {
            return this._bindingDeactivationAndPreDestroy(binding, instance, constructor);
        }
    }
    async _propagateContainerDeactivationThenBindingAndPreDestroyAsync(binding, instance, constructor) {
        if (this.parent) {
            await this._deactivate.bind(this.parent)(binding, instance);
        }
        else {
            await this._bindingDeactivationAndPreDestroyAsync(binding, instance, constructor);
        }
    }
    _removeServiceFromDictionary(serviceIdentifier) {
        try {
            this._bindingDictionary.remove(serviceIdentifier);
        }
        catch (_e) {
            throw new Error(`${ERROR_MSGS.CANNOT_UNBIND} ${(0, serialization_1.getServiceIdentifierAsString)(serviceIdentifier)}`);
        }
    }
    _bindingDeactivationAndPreDestroy(binding, instance, constructor) {
        if (typeof binding.onDeactivation === 'function') {
            const result = binding.onDeactivation(instance);
            if ((0, async_1.isPromise)(result)) {
                return result.then(() => this._preDestroy(constructor, instance));
            }
        }
        return this._preDestroy(constructor, instance);
    }
    async _bindingDeactivationAndPreDestroyAsync(binding, instance, constructor) {
        if (typeof binding.onDeactivation === 'function') {
            await binding.onDeactivation(instance);
        }
        await this._preDestroy(constructor, instance);
    }
}
exports.Container = Container;
//# sourceMappingURL=container.js.map

/***/ }),
/* 9 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Binding = void 0;
const literal_types_1 = __webpack_require__(10);
const id_1 = __webpack_require__(11);
class Binding {
    id;
    moduleId;
    // Determines weather the bindings has been already activated
    // The activation action takes place when an instance is resolved
    // If the scope is singleton it only happens once
    activated;
    // A runtime identifier because at runtime we don't have interfaces
    serviceIdentifier;
    // constructor from binding to or toConstructor
    implementationType;
    // Cache used to allow singleton scope and BindingType.ConstantValue bindings
    cache;
    // Cache used to allow BindingType.DynamicValue bindings
    dynamicValue;
    // The scope mode to be used
    scope;
    // The kind of binding
    type;
    // A factory method used in BindingType.Factory bindings
    factory;
    // An async factory method used in BindingType.Provider bindings
    provider;
    // A constraint used to limit the contexts in which this binding is applicable
    constraint;
    // On activation handler (invoked just before an instance is added to cache and injected)
    onActivation;
    // On deactivation handler (invoked just before an instance is unbinded and removed from container)
    onDeactivation;
    constructor(serviceIdentifier, scope) {
        this.id = (0, id_1.id)();
        this.activated = false;
        this.serviceIdentifier = serviceIdentifier;
        this.scope = scope;
        this.type = literal_types_1.BindingTypeEnum.Invalid;
        this.constraint = (_request) => true;
        this.implementationType = null;
        this.cache = null;
        this.factory = null;
        this.provider = null;
        this.onActivation = null;
        this.onDeactivation = null;
        this.dynamicValue = null;
    }
    clone() {
        const clone = new Binding(this.serviceIdentifier, this.scope);
        clone.activated =
            clone.scope === literal_types_1.BindingScopeEnum.Singleton ? this.activated : false;
        clone.implementationType = this.implementationType;
        clone.dynamicValue = this.dynamicValue;
        clone.scope = this.scope;
        clone.type = this.type;
        clone.factory = this.factory;
        clone.provider = this.provider;
        clone.constraint = this.constraint;
        clone.onActivation = this.onActivation;
        clone.onDeactivation = this.onDeactivation;
        clone.cache = this.cache;
        return clone;
    }
}
exports.Binding = Binding;
//# sourceMappingURL=binding.js.map

/***/ }),
/* 10 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TargetTypeEnum = exports.BindingTypeEnum = exports.BindingScopeEnum = void 0;
// eslint-disable-next-line @typescript-eslint/naming-convention
const BindingScopeEnum = {
    Request: 'Request',
    Singleton: 'Singleton',
    Transient: 'Transient',
};
exports.BindingScopeEnum = BindingScopeEnum;
// eslint-disable-next-line @typescript-eslint/naming-convention
const BindingTypeEnum = {
    ConstantValue: 'ConstantValue',
    Constructor: 'Constructor',
    DynamicValue: 'DynamicValue',
    Factory: 'Factory',
    Function: 'Function',
    Instance: 'Instance',
    Invalid: 'Invalid',
    Provider: 'Provider',
};
exports.BindingTypeEnum = BindingTypeEnum;
// eslint-disable-next-line @typescript-eslint/naming-convention
const TargetTypeEnum = {
    ClassProperty: 'ClassProperty',
    ConstructorArgument: 'ConstructorArgument',
    Variable: 'Variable',
};
exports.TargetTypeEnum = TargetTypeEnum;
//# sourceMappingURL=literal_types.js.map

/***/ }),
/* 11 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.id = id;
let idCounter = 0;
function id() {
    return idCounter++;
}
//# sourceMappingURL=id.js.map

/***/ }),
/* 12 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.STACK_OVERFLOW = exports.CIRCULAR_DEPENDENCY_IN_FACTORY = exports.ON_DEACTIVATION_ERROR = exports.PRE_DESTROY_ERROR = exports.POST_CONSTRUCT_ERROR = exports.ASYNC_UNBIND_REQUIRED = exports.MULTIPLE_POST_CONSTRUCT_METHODS = exports.MULTIPLE_PRE_DESTROY_METHODS = exports.CONTAINER_OPTIONS_INVALID_SKIP_BASE_CHECK = exports.CONTAINER_OPTIONS_INVALID_AUTO_BIND_INJECTABLE = exports.CONTAINER_OPTIONS_INVALID_DEFAULT_SCOPE = exports.CONTAINER_OPTIONS_MUST_BE_AN_OBJECT = exports.ARGUMENTS_LENGTH_MISMATCH = exports.INVALID_DECORATOR_OPERATION = exports.INVALID_TO_SELF_VALUE = exports.LAZY_IN_SYNC = exports.INVALID_FUNCTION_BINDING = exports.INVALID_MIDDLEWARE_RETURN = exports.NO_MORE_SNAPSHOTS_AVAILABLE = exports.INVALID_BINDING_TYPE = exports.CIRCULAR_DEPENDENCY = exports.UNDEFINED_INJECT_ANNOTATION = exports.TRYING_TO_RESOLVE_BINDINGS = exports.NOT_REGISTERED = exports.CANNOT_UNBIND = exports.AMBIGUOUS_MATCH = exports.KEY_NOT_FOUND = exports.NULL_ARGUMENT = exports.DUPLICATED_METADATA = exports.DUPLICATED_INJECTABLE_DECORATOR = void 0;
exports.DUPLICATED_INJECTABLE_DECORATOR = 'Cannot apply @injectable decorator multiple times.';
exports.DUPLICATED_METADATA = 'Metadata key was used more than once in a parameter:';
exports.NULL_ARGUMENT = 'NULL argument';
exports.KEY_NOT_FOUND = 'Key Not Found';
exports.AMBIGUOUS_MATCH = 'Ambiguous match found for serviceIdentifier:';
exports.CANNOT_UNBIND = 'Could not unbind serviceIdentifier:';
exports.NOT_REGISTERED = 'No matching bindings found for serviceIdentifier:';
const TRYING_TO_RESOLVE_BINDINGS = (name) => `Trying to resolve bindings for "${name}"`;
exports.TRYING_TO_RESOLVE_BINDINGS = TRYING_TO_RESOLVE_BINDINGS;
const UNDEFINED_INJECT_ANNOTATION = (name) => `@inject called with undefined this could mean that the class ${name} has ` +
    'a circular dependency problem. You can use a LazyServiceIdentifer to ' +
    'overcome this limitation.';
exports.UNDEFINED_INJECT_ANNOTATION = UNDEFINED_INJECT_ANNOTATION;
exports.CIRCULAR_DEPENDENCY = 'Circular dependency found:';
exports.INVALID_BINDING_TYPE = 'Invalid binding type:';
exports.NO_MORE_SNAPSHOTS_AVAILABLE = 'No snapshot available to restore.';
exports.INVALID_MIDDLEWARE_RETURN = 'Invalid return type in middleware. Middleware must return!';
exports.INVALID_FUNCTION_BINDING = 'Value provided to function binding must be a function!';
const LAZY_IN_SYNC = (key) => `You are attempting to construct ${keyToString(key)} in a synchronous way ` +
    'but it has asynchronous dependencies.';
exports.LAZY_IN_SYNC = LAZY_IN_SYNC;
exports.INVALID_TO_SELF_VALUE = 'The toSelf function can only be applied when a constructor is ' +
    'used as service identifier';
exports.INVALID_DECORATOR_OPERATION = 'The @inject @multiInject @tagged and @named decorators ' +
    'must be applied to the parameters of a class constructor or a class property.';
const ARGUMENTS_LENGTH_MISMATCH = (name) => 'The number of constructor arguments in the derived class ' +
    `${name} must be >= than the number of constructor arguments of its base class.`;
exports.ARGUMENTS_LENGTH_MISMATCH = ARGUMENTS_LENGTH_MISMATCH;
exports.CONTAINER_OPTIONS_MUST_BE_AN_OBJECT = 'Invalid Container constructor argument. Container options ' +
    'must be an object.';
exports.CONTAINER_OPTIONS_INVALID_DEFAULT_SCOPE = 'Invalid Container option. Default scope must ' +
    'be a string ("singleton" or "transient").';
exports.CONTAINER_OPTIONS_INVALID_AUTO_BIND_INJECTABLE = 'Invalid Container option. Auto bind injectable must ' + 'be a boolean';
exports.CONTAINER_OPTIONS_INVALID_SKIP_BASE_CHECK = 'Invalid Container option. Skip base check must ' + 'be a boolean';
exports.MULTIPLE_PRE_DESTROY_METHODS = 'Cannot apply @preDestroy decorator multiple times in the same class';
exports.MULTIPLE_POST_CONSTRUCT_METHODS = 'Cannot apply @postConstruct decorator multiple times in the same class';
exports.ASYNC_UNBIND_REQUIRED = 'Attempting to unbind dependency with asynchronous destruction (@preDestroy or onDeactivation)';
const POST_CONSTRUCT_ERROR = (clazz, errorMessage) => `@postConstruct error in class ${clazz}: ${errorMessage}`;
exports.POST_CONSTRUCT_ERROR = POST_CONSTRUCT_ERROR;
const PRE_DESTROY_ERROR = (clazz, errorMessage) => `@preDestroy error in class ${clazz}: ${errorMessage}`;
exports.PRE_DESTROY_ERROR = PRE_DESTROY_ERROR;
const ON_DEACTIVATION_ERROR = (clazz, errorMessage) => `onDeactivation() error in class ${clazz}: ${errorMessage}`;
exports.ON_DEACTIVATION_ERROR = ON_DEACTIVATION_ERROR;
const CIRCULAR_DEPENDENCY_IN_FACTORY = (factoryType, serviceIdentifier) => `It looks like there is a circular dependency in one of the '${factoryType}' bindings. Please investigate bindings with ` +
    `service identifier '${serviceIdentifier}'.`;
exports.CIRCULAR_DEPENDENCY_IN_FACTORY = CIRCULAR_DEPENDENCY_IN_FACTORY;
exports.STACK_OVERFLOW = 'Maximum call stack size exceeded';
function keyToString(key) {
    if (typeof key === 'function') {
        return `[function/class ${key.name || '<anonymous>'}]`;
    }
    if (typeof key === 'symbol') {
        return key.toString();
    }
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return `'${key}'`;
}
//# sourceMappingURL=error_msgs.js.map

/***/ }),
/* 13 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MetadataReader = void 0;
const METADATA_KEY = __importStar(__webpack_require__(7));
class MetadataReader {
    getConstructorMetadata(constructorFunc) {
        // TypeScript compiler generated annotations
        const compilerGeneratedMetadata = Reflect.getMetadata(METADATA_KEY.DESIGN_PARAM_TYPES, constructorFunc) ?? [];
        // User generated constructor annotations
        const userGeneratedMetadata = Reflect.getMetadata(METADATA_KEY.TAGGED, constructorFunc);
        return {
            compilerGeneratedMetadata,
            userGeneratedMetadata: userGeneratedMetadata ?? {},
        };
    }
    getPropertiesMetadata(constructorFunc) {
        // User generated properties annotations
        const userGeneratedMetadata = Reflect.getMetadata(METADATA_KEY.TAGGED_PROP, constructorFunc) ?? {};
        return userGeneratedMetadata;
    }
}
exports.MetadataReader = MetadataReader;
//# sourceMappingURL=metadata_reader.js.map

/***/ }),
/* 14 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getBindingDictionary = getBindingDictionary;
exports.plan = plan;
exports.createMockRequest = createMockRequest;
const core_1 = __webpack_require__(15);
const binding_count_1 = __webpack_require__(42);
const ERROR_MSGS = __importStar(__webpack_require__(12));
const literal_types_1 = __webpack_require__(10);
const METADATA_KEY = __importStar(__webpack_require__(7));
const exceptions_1 = __webpack_require__(43);
const serialization_1 = __webpack_require__(44);
const context_1 = __webpack_require__(45);
const metadata_1 = __webpack_require__(46);
const plan_1 = __webpack_require__(47);
const reflection_utils_1 = __webpack_require__(48);
const request_1 = __webpack_require__(50);
function getBindingDictionary(cntnr) {
    return cntnr._bindingDictionary;
}
function _createTarget(targetType, serviceIdentifier, metadata) {
    const metadataList = _getTargetMetadata(serviceIdentifier, metadata);
    const classElementMetadata = (0, core_1.getClassElementMetadataFromLegacyMetadata)(metadataList);
    if (classElementMetadata.kind === core_1.ClassElementMetadataKind.unmanaged) {
        throw new Error('Unexpected metadata when creating target');
    }
    const target = new core_1.LegacyTargetImpl('', classElementMetadata, targetType);
    return target;
}
function _getActiveBindings(metadataReader, avoidConstraints, context, parentRequest, target) {
    let bindings = getBindings(context.container, target.serviceIdentifier);
    let activeBindings = [];
    // automatic binding
    if (bindings.length === binding_count_1.BindingCount.NoBindingsAvailable &&
        context.container.options.autoBindInjectable === true &&
        typeof target.serviceIdentifier === 'function' &&
        metadataReader.getConstructorMetadata(target.serviceIdentifier)
            .compilerGeneratedMetadata) {
        context.container.bind(target.serviceIdentifier).toSelf();
        bindings = getBindings(context.container, target.serviceIdentifier);
    }
    // multiple bindings available
    if (!avoidConstraints) {
        // apply constraints if available to reduce the number of active bindings
        activeBindings = bindings.filter((binding) => {
            const request = new request_1.Request(binding.serviceIdentifier, context, parentRequest, binding, target);
            return binding.constraint(request);
        });
    }
    else {
        // simple injection or multi-injection without constraints
        activeBindings = bindings;
    }
    // validate active bindings
    _validateActiveBindingCount(target.serviceIdentifier, activeBindings, parentRequest, target, context.container);
    return activeBindings;
}
function _getTargetMetadata(serviceIdentifier, metadata) {
    const metadataKey = metadata.isMultiInject
        ? METADATA_KEY.MULTI_INJECT_TAG
        : METADATA_KEY.INJECT_TAG;
    const metadataList = [
        new metadata_1.Metadata(metadataKey, serviceIdentifier),
    ];
    if (metadata.customTag !== undefined) {
        metadataList.push(new metadata_1.Metadata(metadata.customTag.key, metadata.customTag.value));
    }
    if (metadata.isOptional === true) {
        metadataList.push(new metadata_1.Metadata(METADATA_KEY.OPTIONAL_TAG, true));
    }
    return metadataList;
}
function _validateActiveBindingCount(serviceIdentifier, bindings, parentRequest, target, container) {
    switch (bindings.length) {
        case binding_count_1.BindingCount.NoBindingsAvailable:
            if (target.isOptional()) {
                return bindings;
            }
            else {
                const serviceIdentifierString = (0, serialization_1.getServiceIdentifierAsString)(serviceIdentifier);
                let msg = ERROR_MSGS.NOT_REGISTERED;
                msg += (0, serialization_1.listMetadataForTarget)(serviceIdentifierString, target);
                msg += (0, serialization_1.listRegisteredBindingsForServiceIdentifier)(container, serviceIdentifierString, getBindings);
                if (parentRequest !== null) {
                    msg += `\n${ERROR_MSGS.TRYING_TO_RESOLVE_BINDINGS((0, serialization_1.getServiceIdentifierAsString)(parentRequest.serviceIdentifier))}`;
                }
                throw new Error(msg);
            }
        case binding_count_1.BindingCount.OnlyOneBindingAvailable:
            return bindings;
        case binding_count_1.BindingCount.MultipleBindingsAvailable:
        default:
            if (!target.isArray()) {
                const serviceIdentifierString = (0, serialization_1.getServiceIdentifierAsString)(serviceIdentifier);
                let msg = `${ERROR_MSGS.AMBIGUOUS_MATCH} ${serviceIdentifierString}`;
                msg += (0, serialization_1.listRegisteredBindingsForServiceIdentifier)(container, serviceIdentifierString, getBindings);
                throw new Error(msg);
            }
            else {
                return bindings;
            }
    }
}
function _createSubRequests(metadataReader, avoidConstraints, serviceIdentifier, context, parentRequest, target) {
    let activeBindings;
    let childRequest;
    if (parentRequest === null) {
        activeBindings = _getActiveBindings(metadataReader, avoidConstraints, context, null, target);
        childRequest = new request_1.Request(serviceIdentifier, context, null, activeBindings, target);
        const thePlan = new plan_1.Plan(context, childRequest);
        context.addPlan(thePlan);
    }
    else {
        activeBindings = _getActiveBindings(metadataReader, avoidConstraints, context, parentRequest, target);
        childRequest = parentRequest.addChildRequest(target.serviceIdentifier, activeBindings, target);
    }
    activeBindings.forEach((binding) => {
        let subChildRequest = null;
        if (target.isArray()) {
            subChildRequest = childRequest.addChildRequest(binding.serviceIdentifier, binding, target);
        }
        else {
            if (binding.cache !== null) {
                return;
            }
            subChildRequest = childRequest;
        }
        if (binding.type === literal_types_1.BindingTypeEnum.Instance &&
            binding.implementationType !== null) {
            const dependencies = (0, reflection_utils_1.getDependencies)(metadataReader, binding.implementationType);
            if (context.container.options.skipBaseClassChecks !== true) {
                // Throw if a derived class does not implement its constructor explicitly
                // We do this to prevent errors when a base class (parent) has dependencies
                // and one of the derived classes (children) has no dependencies
                const baseClassDependencyCount = (0, reflection_utils_1.getBaseClassDependencyCount)(metadataReader, binding.implementationType);
                if (dependencies.length < baseClassDependencyCount) {
                    const error = ERROR_MSGS.ARGUMENTS_LENGTH_MISMATCH((0, reflection_utils_1.getFunctionName)(binding.implementationType));
                    throw new Error(error);
                }
            }
            dependencies.forEach((dependency) => {
                _createSubRequests(metadataReader, false, dependency.serviceIdentifier, context, subChildRequest, dependency);
            });
        }
    });
}
function getBindings(container, serviceIdentifier) {
    let bindings = [];
    const bindingDictionary = getBindingDictionary(container);
    if (bindingDictionary.hasKey(serviceIdentifier)) {
        bindings = bindingDictionary.get(serviceIdentifier);
    }
    else if (container.parent !== null) {
        // recursively try to get bindings from parent container
        bindings = getBindings(container.parent, serviceIdentifier);
    }
    return bindings;
}
function plan(metadataReader, container, targetType, serviceIdentifier, metadata, avoidConstraints = false) {
    const context = new context_1.Context(container);
    const target = _createTarget(targetType, serviceIdentifier, metadata);
    try {
        _createSubRequests(metadataReader, avoidConstraints, serviceIdentifier, context, null, target);
        return context;
    }
    catch (error) {
        if ((0, exceptions_1.isStackOverflowException)(error)) {
            (0, serialization_1.circularDependencyToException)(context.plan.rootRequest);
        }
        throw error;
    }
}
function createMockRequest(container, serviceIdentifier, metadata) {
    const metadataList = _getTargetMetadata(serviceIdentifier, metadata);
    const classElementMetadata = (0, core_1.getClassElementMetadataFromLegacyMetadata)(metadataList);
    if (classElementMetadata.kind === core_1.ClassElementMetadataKind.unmanaged) {
        throw new Error('Unexpected metadata when creating target');
    }
    const target = new core_1.LegacyTargetImpl('', classElementMetadata, 'Variable');
    const context = new context_1.Context(container);
    const request = new request_1.Request(serviceIdentifier, context, null, [], target);
    return request;
}
//# sourceMappingURL=planner.js.map

/***/ }),
/* 15 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LegacyTargetImpl = exports.getTargets = exports.getClassMetadataFromMetadataReader = exports.getClassMetadata = exports.getClassElementMetadataFromLegacyMetadata = exports.ClassElementMetadataKind = void 0;
const getTargets_1 = __webpack_require__(16);
Object.defineProperty(exports, "getTargets", ({ enumerable: true, get: function () { return getTargets_1.getTargets; } }));
const LegacyTargetImpl_1 = __webpack_require__(37);
Object.defineProperty(exports, "LegacyTargetImpl", ({ enumerable: true, get: function () { return LegacyTargetImpl_1.LegacyTargetImpl; } }));
const getClassElementMetadataFromLegacyMetadata_1 = __webpack_require__(29);
Object.defineProperty(exports, "getClassElementMetadataFromLegacyMetadata", ({ enumerable: true, get: function () { return getClassElementMetadataFromLegacyMetadata_1.getClassElementMetadataFromLegacyMetadata; } }));
const getClassMetadata_1 = __webpack_require__(17);
Object.defineProperty(exports, "getClassMetadata", ({ enumerable: true, get: function () { return getClassMetadata_1.getClassMetadata; } }));
const getClassMetadataFromMetadataReader_1 = __webpack_require__(32);
Object.defineProperty(exports, "getClassMetadataFromMetadataReader", ({ enumerable: true, get: function () { return getClassMetadataFromMetadataReader_1.getClassMetadataFromMetadataReader; } }));
const ClassElementMetadataKind_1 = __webpack_require__(27);
Object.defineProperty(exports, "ClassElementMetadataKind", ({ enumerable: true, get: function () { return ClassElementMetadataKind_1.ClassElementMetadataKind; } }));
//# sourceMappingURL=index.js.map

/***/ }),
/* 16 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getTargets = void 0;
const getClassMetadata_1 = __webpack_require__(17);
const getClassMetadataFromMetadataReader_1 = __webpack_require__(32);
const getClassMetadataProperties_1 = __webpack_require__(30);
const getClassMetadataPropertiesFromMetadataReader_1 = __webpack_require__(34);
const getTargetsFromMetadataProviders_1 = __webpack_require__(35);
const getTargets = (metadataReader) => {
    const getClassMetadataFn = metadataReader === undefined
        ? getClassMetadata_1.getClassMetadata
        : (type) => (0, getClassMetadataFromMetadataReader_1.getClassMetadataFromMetadataReader)(type, metadataReader);
    const getClassMetadataPropertiesFn = metadataReader === undefined
        ? getClassMetadataProperties_1.getClassMetadataProperties
        : (type) => (0, getClassMetadataPropertiesFromMetadataReader_1.getClassMetadataPropertiesFromMetadataReader)(type, metadataReader);
    return (0, getTargetsFromMetadataProviders_1.getTargetsFromMetadataProviders)(getClassMetadataFn, getClassMetadataPropertiesFn);
};
exports.getTargets = getTargets;
//# sourceMappingURL=getTargets.js.map

/***/ }),
/* 17 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getClassMetadata = getClassMetadata;
const reflect_metadata_utils_1 = __webpack_require__(18);
const keys_1 = __webpack_require__(21);
const getClassMetadataConstructorArguments_1 = __webpack_require__(22);
const getClassMetadataProperties_1 = __webpack_require__(30);
function getClassMetadata(type) {
    const postConstructMetadata = (0, reflect_metadata_utils_1.getReflectMetadata)(type, keys_1.POST_CONSTRUCT);
    const preDestroyMetadata = (0, reflect_metadata_utils_1.getReflectMetadata)(type, keys_1.PRE_DESTROY);
    const classMetadata = {
        constructorArguments: (0, getClassMetadataConstructorArguments_1.getClassMetadataConstructorArguments)(type),
        lifecycle: {
            postConstructMethodName: postConstructMetadata?.value,
            preDestroyMethodName: preDestroyMetadata?.value,
        },
        properties: (0, getClassMetadataProperties_1.getClassMetadataProperties)(type),
    };
    return classMetadata;
}
//# sourceMappingURL=getClassMetadata.js.map

/***/ }),
/* 18 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.updateReflectMetadata = exports.getReflectMetadata = void 0;
const getReflectMetadata_1 = __webpack_require__(19);
Object.defineProperty(exports, "getReflectMetadata", ({ enumerable: true, get: function () { return getReflectMetadata_1.getReflectMetadata; } }));
const updateReflectMetadata_1 = __webpack_require__(20);
Object.defineProperty(exports, "updateReflectMetadata", ({ enumerable: true, get: function () { return updateReflectMetadata_1.updateReflectMetadata; } }));
//# sourceMappingURL=index.js.map

/***/ }),
/* 19 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getReflectMetadata = getReflectMetadata;
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function getReflectMetadata(target, metadataKey) {
    return Reflect.getMetadata(metadataKey, target);
}
//# sourceMappingURL=getReflectMetadata.js.map

/***/ }),
/* 20 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.updateReflectMetadata = updateReflectMetadata;
const getReflectMetadata_1 = __webpack_require__(19);
function updateReflectMetadata(target, metadataKey, defaultValue, callback) {
    const metadata = (0, getReflectMetadata_1.getReflectMetadata)(target, metadataKey) ?? defaultValue;
    const updatedMetadata = callback(metadata);
    Reflect.defineMetadata(metadataKey, updatedMetadata, target);
}
//# sourceMappingURL=updateReflectMetadata.js.map

/***/ }),
/* 21 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.NON_CUSTOM_TAG_KEYS = exports.PRE_DESTROY = exports.POST_CONSTRUCT = exports.DESIGN_PARAM_TYPES = exports.PARAM_TYPES = exports.TAGGED_PROP = exports.TAGGED = exports.MULTI_INJECT_TAG = exports.INJECT_TAG = exports.OPTIONAL_TAG = exports.UNMANAGED_TAG = exports.NAME_TAG = exports.NAMED_TAG = void 0;
// Used for named bindings
exports.NAMED_TAG = 'named';
exports.NAME_TAG = 'name';
// The for unmanaged injections (in base classes when using inheritance)
exports.UNMANAGED_TAG = 'unmanaged';
// The for optional injections
exports.OPTIONAL_TAG = 'optional';
// The type of the binding at design time
exports.INJECT_TAG = 'inject';
// The type of the binding at design type for multi-injections
exports.MULTI_INJECT_TAG = 'multi_inject';
// used to store constructor arguments tags
exports.TAGGED = 'inversify:tagged';
// used to store class properties tags
exports.TAGGED_PROP = 'inversify:tagged_props';
// used to store types to be injected
exports.PARAM_TYPES = 'inversify:paramtypes';
// used to access design time types
exports.DESIGN_PARAM_TYPES = 'design:paramtypes';
// used to identify postConstruct functions
exports.POST_CONSTRUCT = 'post_construct';
// used to identify preDestroy functions
exports.PRE_DESTROY = 'pre_destroy';
function getNonCustomTagKeys() {
    return [
        exports.INJECT_TAG,
        exports.MULTI_INJECT_TAG,
        exports.NAME_TAG,
        exports.UNMANAGED_TAG,
        exports.NAMED_TAG,
        exports.OPTIONAL_TAG,
    ];
}
exports.NON_CUSTOM_TAG_KEYS = getNonCustomTagKeys();
//# sourceMappingURL=keys.js.map

/***/ }),
/* 22 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getClassMetadataConstructorArguments = getClassMetadataConstructorArguments;
const reflect_metadata_utils_1 = __webpack_require__(18);
const keys_1 = __webpack_require__(21);
const assertConstructorMetadataArrayFilled_1 = __webpack_require__(23);
const getClassElementMetadataFromNewable_1 = __webpack_require__(26);
const getConstructorArgumentMetadataFromLegacyMetadata_1 = __webpack_require__(28);
function getClassMetadataConstructorArguments(type) {
    const typescriptMetadataList = (0, reflect_metadata_utils_1.getReflectMetadata)(type, keys_1.DESIGN_PARAM_TYPES);
    const constructorParametersLegacyMetadata = (0, reflect_metadata_utils_1.getReflectMetadata)(type, keys_1.TAGGED);
    const constructorArgumentsMetadata = [];
    if (constructorParametersLegacyMetadata !== undefined) {
        for (const [stringifiedIndex, metadataList] of Object.entries(constructorParametersLegacyMetadata)) {
            const index = parseInt(stringifiedIndex);
            constructorArgumentsMetadata[index] =
                (0, getConstructorArgumentMetadataFromLegacyMetadata_1.getConstructorArgumentMetadataFromLegacyMetadata)(type, index, metadataList);
        }
    }
    if (typescriptMetadataList !== undefined) {
        for (let i = 0; i < typescriptMetadataList.length; ++i) {
            if (constructorArgumentsMetadata[i] === undefined) {
                const typescriptMetadata = typescriptMetadataList[i];
                constructorArgumentsMetadata[i] =
                    (0, getClassElementMetadataFromNewable_1.getClassElementMetadataFromNewable)(typescriptMetadata);
            }
        }
    }
    (0, assertConstructorMetadataArrayFilled_1.assertConstructorMetadataArrayFilled)(type, constructorArgumentsMetadata);
    return constructorArgumentsMetadata;
}
//# sourceMappingURL=getClassMetadataConstructorArguments.js.map

/***/ }),
/* 23 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.assertConstructorMetadataArrayFilled = assertConstructorMetadataArrayFilled;
const InversifyCoreError_1 = __webpack_require__(24);
const InversifyCoreErrorKind_1 = __webpack_require__(25);
function assertConstructorMetadataArrayFilled(type, value) {
    const undefinedIndexes = [];
    // Using a for loop to ensure empty values are traversed as well
    for (let i = 0; i < value.length; ++i) {
        const element = value[i];
        if (element === undefined) {
            undefinedIndexes.push(i);
        }
    }
    if (undefinedIndexes.length > 0) {
        throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.missingInjectionDecorator, `Found unexpected missing metadata on type "${type.name}" at constructor indexes "${undefinedIndexes.join('", "')}".

Are you using @inject, @multiInject or @unmanaged decorators at those indexes?

If you're using typescript and want to rely on auto injection, set "emitDecoratorMetadata" compiler option to true`);
    }
}
//# sourceMappingURL=assertConstructorMetadataArrayFilled.js.map

/***/ }),
/* 24 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.InversifyCoreError = exports.isAppErrorSymbol = void 0;
exports.isAppErrorSymbol = Symbol.for('@inversifyjs/core/InversifyCoreError');
class InversifyCoreError extends Error {
    [exports.isAppErrorSymbol];
    kind;
    constructor(kind, message, options) {
        super(message, options);
        this[exports.isAppErrorSymbol] = true;
        this.kind = kind;
    }
    static is(value) {
        return (typeof value === 'object' &&
            value !== null &&
            value[exports.isAppErrorSymbol] === true);
    }
    static isErrorOfKind(value, kind) {
        return InversifyCoreError.is(value) && value.kind === kind;
    }
}
exports.InversifyCoreError = InversifyCoreError;
//# sourceMappingURL=InversifyCoreError.js.map

/***/ }),
/* 25 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.InversifyCoreErrorKind = void 0;
var InversifyCoreErrorKind;
(function (InversifyCoreErrorKind) {
    InversifyCoreErrorKind[InversifyCoreErrorKind["injectionDecoratorConflict"] = 0] = "injectionDecoratorConflict";
    InversifyCoreErrorKind[InversifyCoreErrorKind["missingInjectionDecorator"] = 1] = "missingInjectionDecorator";
    InversifyCoreErrorKind[InversifyCoreErrorKind["planning"] = 2] = "planning";
    InversifyCoreErrorKind[InversifyCoreErrorKind["unknown"] = 3] = "unknown";
})(InversifyCoreErrorKind || (exports.InversifyCoreErrorKind = InversifyCoreErrorKind = {}));
//# sourceMappingURL=InversifyCoreErrorKind.js.map

/***/ }),
/* 26 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getClassElementMetadataFromNewable = getClassElementMetadataFromNewable;
const ClassElementMetadataKind_1 = __webpack_require__(27);
function getClassElementMetadataFromNewable(type) {
    return {
        kind: ClassElementMetadataKind_1.ClassElementMetadataKind.singleInjection,
        name: undefined,
        optional: false,
        tags: new Map(),
        targetName: undefined,
        value: type,
    };
}
//# sourceMappingURL=getClassElementMetadataFromNewable.js.map

/***/ }),
/* 27 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ClassElementMetadataKind = void 0;
var ClassElementMetadataKind;
(function (ClassElementMetadataKind) {
    ClassElementMetadataKind[ClassElementMetadataKind["multipleInjection"] = 0] = "multipleInjection";
    ClassElementMetadataKind[ClassElementMetadataKind["singleInjection"] = 1] = "singleInjection";
    ClassElementMetadataKind[ClassElementMetadataKind["unmanaged"] = 2] = "unmanaged";
})(ClassElementMetadataKind || (exports.ClassElementMetadataKind = ClassElementMetadataKind = {}));
//# sourceMappingURL=ClassElementMetadataKind.js.map

/***/ }),
/* 28 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getConstructorArgumentMetadataFromLegacyMetadata = getConstructorArgumentMetadataFromLegacyMetadata;
const InversifyCoreError_1 = __webpack_require__(24);
const InversifyCoreErrorKind_1 = __webpack_require__(25);
const getClassElementMetadataFromLegacyMetadata_1 = __webpack_require__(29);
function getConstructorArgumentMetadataFromLegacyMetadata(type, index, metadataList) {
    try {
        return (0, getClassElementMetadataFromLegacyMetadata_1.getClassElementMetadataFromLegacyMetadata)(metadataList);
    }
    catch (error) {
        if (InversifyCoreError_1.InversifyCoreError.isErrorOfKind(error, InversifyCoreErrorKind_1.InversifyCoreErrorKind.missingInjectionDecorator)) {
            throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.missingInjectionDecorator, `Expected a single @inject, @multiInject or @unmanaged decorator at type "${type.name}" at constructor arguments at index "${index.toString()}"`, { cause: error });
        }
        else {
            throw error;
        }
    }
}
//# sourceMappingURL=getConstructorArgumentMetadataFromLegacyMetadata.js.map

/***/ }),
/* 29 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getClassElementMetadataFromLegacyMetadata = getClassElementMetadataFromLegacyMetadata;
const InversifyCoreError_1 = __webpack_require__(24);
const InversifyCoreErrorKind_1 = __webpack_require__(25);
const keys_1 = __webpack_require__(21);
const ClassElementMetadataKind_1 = __webpack_require__(27);
function getClassElementMetadataFromLegacyMetadata(metadataList) {
    const injectMetadata = metadataList.find((metadata) => metadata.key === keys_1.INJECT_TAG);
    const multiInjectMetadata = metadataList.find((metadata) => metadata.key === keys_1.MULTI_INJECT_TAG);
    const unmanagedMetadata = metadataList.find((metadata) => metadata.key === keys_1.UNMANAGED_TAG);
    if (unmanagedMetadata !== undefined) {
        return getUnmanagedClassElementMetadata(injectMetadata, multiInjectMetadata);
    }
    if (multiInjectMetadata === undefined && injectMetadata === undefined) {
        throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.missingInjectionDecorator, 'Expected @inject, @multiInject or @unmanaged metadata');
    }
    const nameMetadata = metadataList.find((metadata) => metadata.key === keys_1.NAMED_TAG);
    const optionalMetadata = metadataList.find((metadata) => metadata.key === keys_1.OPTIONAL_TAG);
    const targetNameMetadata = metadataList.find((metadata) => metadata.key === keys_1.NAME_TAG);
    const managedClassElementMetadata = {
        kind: injectMetadata === undefined
            ? ClassElementMetadataKind_1.ClassElementMetadataKind.multipleInjection
            : ClassElementMetadataKind_1.ClassElementMetadataKind.singleInjection,
        name: nameMetadata?.value,
        optional: optionalMetadata !== undefined,
        tags: new Map(metadataList
            .filter((metadata) => keys_1.NON_CUSTOM_TAG_KEYS.every((customTagKey) => metadata.key !== customTagKey))
            .map((metadata) => [
            metadata.key,
            metadata.value,
        ])),
        targetName: targetNameMetadata?.value,
        value: injectMetadata === undefined
            ? multiInjectMetadata?.value
            : injectMetadata.value,
    };
    return managedClassElementMetadata;
}
function getUnmanagedClassElementMetadata(injectMetadata, multiInjectMetadata) {
    if (multiInjectMetadata !== undefined || injectMetadata !== undefined) {
        throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.missingInjectionDecorator, 'Expected a single @inject, @multiInject or @unmanaged metadata');
    }
    return {
        kind: ClassElementMetadataKind_1.ClassElementMetadataKind.unmanaged,
    };
}
//# sourceMappingURL=getClassElementMetadataFromLegacyMetadata.js.map

/***/ }),
/* 30 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getClassMetadataProperties = getClassMetadataProperties;
const reflect_metadata_utils_1 = __webpack_require__(18);
const keys_1 = __webpack_require__(21);
const getPropertyMetadataFromLegacyMetadata_1 = __webpack_require__(31);
function getClassMetadataProperties(type) {
    const propertiesLegacyMetadata = (0, reflect_metadata_utils_1.getReflectMetadata)(type, keys_1.TAGGED_PROP);
    const propertiesMetadata = new Map();
    if (propertiesLegacyMetadata !== undefined) {
        for (const property of Reflect.ownKeys(propertiesLegacyMetadata)) {
            const legacyMetadata = propertiesLegacyMetadata[property];
            propertiesMetadata.set(property, (0, getPropertyMetadataFromLegacyMetadata_1.getPropertyMetadataFromLegacyMetadata)(type, property, legacyMetadata));
        }
    }
    return propertiesMetadata;
}
//# sourceMappingURL=getClassMetadataProperties.js.map

/***/ }),
/* 31 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getPropertyMetadataFromLegacyMetadata = getPropertyMetadataFromLegacyMetadata;
const InversifyCoreError_1 = __webpack_require__(24);
const InversifyCoreErrorKind_1 = __webpack_require__(25);
const getClassElementMetadataFromLegacyMetadata_1 = __webpack_require__(29);
function getPropertyMetadataFromLegacyMetadata(type, key, metadataList) {
    try {
        return (0, getClassElementMetadataFromLegacyMetadata_1.getClassElementMetadataFromLegacyMetadata)(metadataList);
    }
    catch (error) {
        if (InversifyCoreError_1.InversifyCoreError.isErrorOfKind(error, InversifyCoreErrorKind_1.InversifyCoreErrorKind.missingInjectionDecorator)) {
            throw new InversifyCoreError_1.InversifyCoreError(InversifyCoreErrorKind_1.InversifyCoreErrorKind.missingInjectionDecorator, `Expected a single @inject, @multiInject or @unmanaged decorator at type "${type.name}" at property "${key.toString()}"`, { cause: error });
        }
        else {
            throw error;
        }
    }
}
//# sourceMappingURL=getPropertyMetadataFromLegacyMetadata.js.map

/***/ }),
/* 32 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getClassMetadataFromMetadataReader = getClassMetadataFromMetadataReader;
const reflect_metadata_utils_1 = __webpack_require__(18);
const keys_1 = __webpack_require__(21);
const getClassMetadataConstructorArgumentsFromMetadataReader_1 = __webpack_require__(33);
const getClassMetadataPropertiesFromMetadataReader_1 = __webpack_require__(34);
function getClassMetadataFromMetadataReader(type, metadataReader) {
    const postConstructMetadata = (0, reflect_metadata_utils_1.getReflectMetadata)(type, keys_1.POST_CONSTRUCT);
    const preDestroyMetadata = (0, reflect_metadata_utils_1.getReflectMetadata)(type, keys_1.PRE_DESTROY);
    const classMetadata = {
        constructorArguments: (0, getClassMetadataConstructorArgumentsFromMetadataReader_1.getClassMetadataConstructorArgumentsFromMetadataReader)(type, metadataReader),
        lifecycle: {
            postConstructMethodName: postConstructMetadata?.value,
            preDestroyMethodName: preDestroyMetadata?.value,
        },
        properties: (0, getClassMetadataPropertiesFromMetadataReader_1.getClassMetadataPropertiesFromMetadataReader)(type, metadataReader),
    };
    return classMetadata;
}
//# sourceMappingURL=getClassMetadataFromMetadataReader.js.map

/***/ }),
/* 33 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getClassMetadataConstructorArgumentsFromMetadataReader = getClassMetadataConstructorArgumentsFromMetadataReader;
const assertConstructorMetadataArrayFilled_1 = __webpack_require__(23);
const getClassElementMetadataFromNewable_1 = __webpack_require__(26);
const getConstructorArgumentMetadataFromLegacyMetadata_1 = __webpack_require__(28);
function getClassMetadataConstructorArgumentsFromMetadataReader(type, metadataReader) {
    const legacyConstructorMetadata = metadataReader.getConstructorMetadata(type);
    const constructorArgumentsMetadata = [];
    for (const [stringifiedIndex, metadataList] of Object.entries(legacyConstructorMetadata.userGeneratedMetadata)) {
        const index = parseInt(stringifiedIndex);
        constructorArgumentsMetadata[index] =
            (0, getConstructorArgumentMetadataFromLegacyMetadata_1.getConstructorArgumentMetadataFromLegacyMetadata)(type, index, metadataList);
    }
    if (legacyConstructorMetadata.compilerGeneratedMetadata !== undefined) {
        for (let i = 0; i < legacyConstructorMetadata.compilerGeneratedMetadata.length; ++i) {
            if (constructorArgumentsMetadata[i] === undefined) {
                const typescriptMetadata = legacyConstructorMetadata
                    .compilerGeneratedMetadata[i];
                constructorArgumentsMetadata[i] =
                    (0, getClassElementMetadataFromNewable_1.getClassElementMetadataFromNewable)(typescriptMetadata);
            }
        }
    }
    (0, assertConstructorMetadataArrayFilled_1.assertConstructorMetadataArrayFilled)(type, constructorArgumentsMetadata);
    return constructorArgumentsMetadata;
}
//# sourceMappingURL=getClassMetadataConstructorArgumentsFromMetadataReader.js.map

/***/ }),
/* 34 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getClassMetadataPropertiesFromMetadataReader = getClassMetadataPropertiesFromMetadataReader;
const getPropertyMetadataFromLegacyMetadata_1 = __webpack_require__(31);
function getClassMetadataPropertiesFromMetadataReader(type, metadataReader) {
    const propertiesLegacyMetadata = metadataReader.getPropertiesMetadata(type);
    const propertiesMetadata = new Map();
    for (const property of Reflect.ownKeys(propertiesLegacyMetadata)) {
        const legacyMetadata = propertiesLegacyMetadata[property];
        propertiesMetadata.set(property, (0, getPropertyMetadataFromLegacyMetadata_1.getPropertyMetadataFromLegacyMetadata)(type, property, legacyMetadata));
    }
    return propertiesMetadata;
}
//# sourceMappingURL=getClassMetadataPropertiesFromMetadataReader.js.map

/***/ }),
/* 35 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getTargetsFromMetadataProviders = getTargetsFromMetadataProviders;
const ClassElementMetadataKind_1 = __webpack_require__(27);
const getBaseType_1 = __webpack_require__(36);
const LegacyTargetImpl_1 = __webpack_require__(37);
function getTargetsFromMetadataProviders(getClassMetadata, getClassMetadataProperties) {
    return function getTagets(type) {
        const classMetadata = getClassMetadata(type);
        let baseType = (0, getBaseType_1.getBaseType)(type);
        while (baseType !== undefined && baseType !== Object) {
            const classMetadataProperties = getClassMetadataProperties(baseType);
            for (const [propertyKey, propertyValue] of classMetadataProperties) {
                if (!classMetadata.properties.has(propertyKey)) {
                    classMetadata.properties.set(propertyKey, propertyValue);
                }
            }
            baseType = (0, getBaseType_1.getBaseType)(baseType);
        }
        const targets = [];
        for (const constructorArgument of classMetadata.constructorArguments) {
            if (constructorArgument.kind !== ClassElementMetadataKind_1.ClassElementMetadataKind.unmanaged) {
                const targetName = constructorArgument.targetName ?? '';
                targets.push(new LegacyTargetImpl_1.LegacyTargetImpl(targetName, constructorArgument, 'ConstructorArgument'));
            }
        }
        for (const [property, metadata] of classMetadata.properties) {
            if (metadata.kind !== ClassElementMetadataKind_1.ClassElementMetadataKind.unmanaged) {
                const targetName = metadata.targetName ?? property;
                targets.push(new LegacyTargetImpl_1.LegacyTargetImpl(targetName, metadata, 'ClassProperty'));
            }
        }
        return targets;
    };
}
//# sourceMappingURL=getTargetsFromMetadataProviders.js.map

/***/ }),
/* 36 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getBaseType = getBaseType;
function getBaseType(type) {
    const prototype = Object.getPrototypeOf(type.prototype);
    const baseType = prototype?.constructor;
    return baseType;
}
//# sourceMappingURL=getBaseType.js.map

/***/ }),
/* 37 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LegacyTargetImpl = void 0;
const common_1 = __webpack_require__(4);
const getLegacyMetadata_1 = __webpack_require__(38);
const ClassElementMetadataKind_1 = __webpack_require__(27);
const keys_1 = __webpack_require__(21);
const LegacyQueryableStringImpl_1 = __webpack_require__(39);
const getDescription_1 = __webpack_require__(40);
const getTargetId_1 = __webpack_require__(41);
class LegacyTargetImpl {
    #metadata;
    #id;
    #identifier;
    #lazyLegacyMetadata;
    #name;
    #type;
    constructor(identifier, metadata, type) {
        this.#id = (0, getTargetId_1.getTargetId)();
        this.#identifier = identifier;
        this.#lazyLegacyMetadata = undefined;
        this.#metadata = metadata;
        this.#name = new LegacyQueryableStringImpl_1.LegacyQueryableStringImpl(typeof identifier === 'string' ? identifier : (0, getDescription_1.getDescription)(identifier));
        this.#type = type;
    }
    get id() {
        return this.#id;
    }
    /**
     * If this is a class property target, this is the name of the property to be injected
     */
    get identifier() {
        return this.#identifier;
    }
    get metadata() {
        if (this.#lazyLegacyMetadata === undefined) {
            this.#lazyLegacyMetadata = (0, getLegacyMetadata_1.getLegacyMetadata)(this.#metadata);
        }
        return this.#lazyLegacyMetadata;
    }
    get name() {
        return this.#name;
    }
    get type() {
        return this.#type;
    }
    get serviceIdentifier() {
        if (common_1.LazyServiceIdentifier.is(this.#metadata.value)) {
            return this.#metadata.value.unwrap();
        }
        else {
            return this.#metadata.value;
        }
    }
    getCustomTags() {
        return [...this.#metadata.tags.entries()].map(([key, value]) => ({
            key,
            value,
        }));
    }
    getNamedTag() {
        return this.#metadata.name === undefined
            ? null
            : {
                key: keys_1.NAMED_TAG,
                value: this.#metadata.name,
            };
    }
    hasTag(key) {
        return this.metadata.some((metadata) => metadata.key === key);
    }
    isArray() {
        return this.#metadata.kind === ClassElementMetadataKind_1.ClassElementMetadataKind.multipleInjection;
    }
    isNamed() {
        return this.#metadata.name !== undefined;
    }
    isOptional() {
        return this.#metadata.optional;
    }
    isTagged() {
        return this.#metadata.tags.size > 0;
    }
    matchesArray(name) {
        return this.isArray() && this.#metadata.value === name;
    }
    matchesNamedTag(name) {
        return this.#metadata.name === name;
    }
    matchesTag(key) {
        return (value) => this.metadata.some((metadata) => metadata.key === key && metadata.value === value);
    }
}
exports.LegacyTargetImpl = LegacyTargetImpl;
//# sourceMappingURL=LegacyTargetImpl.js.map

/***/ }),
/* 38 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getLegacyMetadata = getLegacyMetadata;
const keys_1 = __webpack_require__(21);
const ClassElementMetadataKind_1 = __webpack_require__(27);
function getLegacyMetadata(classElementMetadata) {
    switch (classElementMetadata.kind) {
        case ClassElementMetadataKind_1.ClassElementMetadataKind.unmanaged:
            return getUnmanagedLegacyMetadata();
        default:
            return getManagedLegacyMetadata(classElementMetadata);
    }
}
function getManagedLegacyMetadata(classElementMetadata) {
    const legacyMetadataList = [
        getManagedKindLegacyMetadata(classElementMetadata),
    ];
    if (classElementMetadata.name !== undefined) {
        legacyMetadataList.push({
            key: keys_1.NAMED_TAG,
            value: classElementMetadata.name,
        });
    }
    if (classElementMetadata.optional) {
        legacyMetadataList.push({
            key: keys_1.OPTIONAL_TAG,
            value: true,
        });
    }
    for (const [tagKey, tagValue] of classElementMetadata.tags) {
        legacyMetadataList.push({
            key: tagKey,
            value: tagValue,
        });
    }
    if (classElementMetadata.targetName !== undefined) {
        legacyMetadataList.push({
            key: keys_1.NAME_TAG,
            value: classElementMetadata.targetName,
        });
    }
    return legacyMetadataList;
}
function getManagedKindLegacyMetadata(classElementMetadata) {
    let kindLegacyMetadata;
    switch (classElementMetadata.kind) {
        case ClassElementMetadataKind_1.ClassElementMetadataKind.multipleInjection:
            kindLegacyMetadata = {
                key: keys_1.MULTI_INJECT_TAG,
                value: classElementMetadata.value,
            };
            break;
        case ClassElementMetadataKind_1.ClassElementMetadataKind.singleInjection:
            kindLegacyMetadata = {
                key: keys_1.INJECT_TAG,
                value: classElementMetadata.value,
            };
            break;
    }
    return kindLegacyMetadata;
}
function getUnmanagedLegacyMetadata() {
    return [
        {
            key: keys_1.UNMANAGED_TAG,
            value: true,
        },
    ];
}
//# sourceMappingURL=getLegacyMetadata.js.map

/***/ }),
/* 39 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LegacyQueryableStringImpl = void 0;
class LegacyQueryableStringImpl {
    #str;
    constructor(str) {
        this.#str = str;
    }
    startsWith(searchString) {
        return this.#str.startsWith(searchString);
    }
    endsWith(searchString) {
        return this.#str.endsWith(searchString);
    }
    contains(searchString) {
        return this.#str.includes(searchString);
    }
    equals(compareString) {
        return this.#str === compareString;
    }
    value() {
        return this.#str;
    }
}
exports.LegacyQueryableStringImpl = LegacyQueryableStringImpl;
//# sourceMappingURL=LegacyQueryableStringImpl.js.map

/***/ }),
/* 40 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getDescription = getDescription;
const SYMBOL_INDEX_START = 7;
const SYMBOL_INDEX_END = -1;
function getDescription(symbol) {
    return symbol.toString().slice(SYMBOL_INDEX_START, SYMBOL_INDEX_END);
}
//# sourceMappingURL=getDescription.js.map

/***/ }),
/* 41 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getTargetId = getTargetId;
const reflect_metadata_utils_1 = __webpack_require__(18);
const ID_METADATA = '@inversifyjs/core/targetId';
function getTargetId() {
    const targetId = (0, reflect_metadata_utils_1.getReflectMetadata)(Object, ID_METADATA) ?? 0;
    if (targetId === Number.MAX_SAFE_INTEGER) {
        (0, reflect_metadata_utils_1.updateReflectMetadata)(Object, ID_METADATA, targetId, () => Number.MIN_SAFE_INTEGER);
    }
    else {
        (0, reflect_metadata_utils_1.updateReflectMetadata)(Object, ID_METADATA, targetId, (id) => id + 1);
    }
    return targetId;
}
//# sourceMappingURL=getTargetId.js.map

/***/ }),
/* 42 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BindingCount = void 0;
var BindingCount;
(function (BindingCount) {
    BindingCount[BindingCount["MultipleBindingsAvailable"] = 2] = "MultipleBindingsAvailable";
    BindingCount[BindingCount["NoBindingsAvailable"] = 0] = "NoBindingsAvailable";
    BindingCount[BindingCount["OnlyOneBindingAvailable"] = 1] = "OnlyOneBindingAvailable";
})(BindingCount || (exports.BindingCount = BindingCount = {}));
//# sourceMappingURL=binding_count.js.map

/***/ }),
/* 43 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.tryAndThrowErrorIfStackOverflow = void 0;
exports.isStackOverflowException = isStackOverflowException;
const ERROR_MSGS = __importStar(__webpack_require__(12));
function isStackOverflowException(error) {
    return (error instanceof RangeError ||
        error.message === ERROR_MSGS.STACK_OVERFLOW);
}
const tryAndThrowErrorIfStackOverflow = (fn, errorCallback) => {
    try {
        return fn();
    }
    catch (error) {
        if (isStackOverflowException(error)) {
            throw errorCallback();
        }
        throw error;
    }
};
exports.tryAndThrowErrorIfStackOverflow = tryAndThrowErrorIfStackOverflow;
//# sourceMappingURL=exceptions.js.map

/***/ }),
/* 44 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getFunctionName = getFunctionName;
exports.getServiceIdentifierAsString = getServiceIdentifierAsString;
exports.listRegisteredBindingsForServiceIdentifier = listRegisteredBindingsForServiceIdentifier;
exports.listMetadataForTarget = listMetadataForTarget;
exports.circularDependencyToException = circularDependencyToException;
exports.getSymbolDescription = getSymbolDescription;
const ERROR_MSGS = __importStar(__webpack_require__(12));
function getServiceIdentifierAsString(serviceIdentifier) {
    if (typeof serviceIdentifier === 'function') {
        return serviceIdentifier.name;
    }
    else if (typeof serviceIdentifier === 'symbol') {
        return serviceIdentifier.toString();
    }
    else {
        return serviceIdentifier;
    }
}
function listRegisteredBindingsForServiceIdentifier(container, serviceIdentifier, getBindings) {
    let registeredBindingsList = '';
    const registeredBindings = getBindings(container, serviceIdentifier);
    if (registeredBindings.length !== 0) {
        registeredBindingsList = '\nRegistered bindings:';
        registeredBindings.forEach((binding) => {
            // Use 'Object as name of constant value injections'
            let name = 'Object';
            // Use function name if available
            if (binding.implementationType !== null) {
                name = getFunctionName(binding.implementationType);
            }
            registeredBindingsList = `${registeredBindingsList}\n ${name}`;
            if (binding.constraint.metaData) {
                // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
                registeredBindingsList = `${registeredBindingsList} - ${binding.constraint.metaData}`;
            }
        });
    }
    return registeredBindingsList;
}
function alreadyDependencyChain(request, serviceIdentifier) {
    if (request.parentRequest === null) {
        return false;
    }
    else if (request.parentRequest.serviceIdentifier === serviceIdentifier) {
        return true;
    }
    else {
        return alreadyDependencyChain(request.parentRequest, serviceIdentifier);
    }
}
function dependencyChainToString(request) {
    function _createStringArr(req, result = []) {
        const serviceIdentifier = getServiceIdentifierAsString(req.serviceIdentifier);
        result.push(serviceIdentifier);
        if (req.parentRequest !== null) {
            return _createStringArr(req.parentRequest, result);
        }
        return result;
    }
    const stringArr = _createStringArr(request);
    return stringArr.reverse().join(' --> ');
}
function circularDependencyToException(request) {
    request.childRequests.forEach((childRequest) => {
        if (alreadyDependencyChain(request, childRequest.serviceIdentifier)) {
            const services = dependencyChainToString(childRequest);
            throw new Error(`${ERROR_MSGS.CIRCULAR_DEPENDENCY} ${services}`);
        }
        else {
            circularDependencyToException(childRequest);
        }
    });
}
function listMetadataForTarget(serviceIdentifierString, target) {
    if (target.isTagged() || target.isNamed()) {
        let m = '';
        const namedTag = target.getNamedTag();
        const otherTags = target.getCustomTags();
        if (namedTag !== null) {
            m += stringifyMetadata(namedTag) + '\n';
        }
        if (otherTags !== null) {
            otherTags.forEach((tag) => {
                m += stringifyMetadata(tag) + '\n';
            });
        }
        return ` ${serviceIdentifierString}\n ${serviceIdentifierString} - ${m}`;
    }
    else {
        return ` ${serviceIdentifierString}`;
    }
}
function getFunctionName(func) {
    if (func.name != null && func.name !== '') {
        return func.name;
    }
    else {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const name = func.toString();
        const match = name.match(/^function\s*([^\s(]+)/);
        return match === null
            ? `Anonymous function: ${name}`
            : match[1];
    }
}
function getSymbolDescription(symbol) {
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    return symbol.toString().slice(7, -1);
}
function stringifyMetadata(metadata) {
    return `{"key":"${metadata.key.toString()}","value":"${metadata.value.toString()}"}`;
}
//# sourceMappingURL=serialization.js.map

/***/ }),
/* 45 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Context = void 0;
const id_1 = __webpack_require__(11);
class Context {
    id;
    container;
    plan;
    currentRequest;
    constructor(container) {
        this.id = (0, id_1.id)();
        this.container = container;
    }
    addPlan(plan) {
        this.plan = plan;
    }
    setCurrentRequest(currentRequest) {
        this.currentRequest = currentRequest;
    }
}
exports.Context = Context;
//# sourceMappingURL=context.js.map

/***/ }),
/* 46 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Metadata = void 0;
const METADATA_KEY = __importStar(__webpack_require__(7));
class Metadata {
    key;
    value;
    constructor(key, value) {
        this.key = key;
        this.value = value;
    }
    toString() {
        if (this.key === METADATA_KEY.NAMED_TAG) {
            return `named: ${String(this.value).toString()} `;
        }
        else {
            return `tagged: { key:${this.key.toString()}, value: ${String(this.value)} }`;
        }
    }
}
exports.Metadata = Metadata;
//# sourceMappingURL=metadata.js.map

/***/ }),
/* 47 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Plan = void 0;
class Plan {
    parentContext;
    rootRequest;
    constructor(parentContext, rootRequest) {
        this.parentContext = parentContext;
        this.rootRequest = rootRequest;
    }
}
exports.Plan = Plan;
//# sourceMappingURL=plan.js.map

/***/ }),
/* 48 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getFunctionName = void 0;
exports.getDependencies = getDependencies;
exports.getBaseClassDependencyCount = getBaseClassDependencyCount;
const core_1 = __webpack_require__(15);
const METADATA_KEY = __importStar(__webpack_require__(7));
const get_base_type_1 = __webpack_require__(49);
const serialization_1 = __webpack_require__(44);
Object.defineProperty(exports, "getFunctionName", ({ enumerable: true, get: function () { return serialization_1.getFunctionName; } }));
function getDependencies(metadataReader, func) {
    return (0, core_1.getTargets)(metadataReader)(func);
}
function getBaseClassDependencyCount(metadataReader, func) {
    const baseConstructor = (0, get_base_type_1.getBaseType)(func);
    if (baseConstructor === undefined || baseConstructor === Object) {
        return 0;
    }
    // get targets for base class
    const targets = (0, core_1.getTargets)(metadataReader)(baseConstructor);
    // get unmanaged metadata
    const metadata = targets.map((t) => t.metadata.filter((m) => m.key === METADATA_KEY.UNMANAGED_TAG));
    // Compare the number of constructor arguments with the number of
    // unmanaged dependencies unmanaged dependencies are not required
    const unmanagedCount = [].concat.apply([], metadata).length;
    const dependencyCount = targets.length - unmanagedCount;
    if (dependencyCount > 0) {
        return dependencyCount;
    }
    else {
        return getBaseClassDependencyCount(metadataReader, baseConstructor);
    }
}
//# sourceMappingURL=reflection_utils.js.map

/***/ }),
/* 49 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getBaseType = getBaseType;
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function getBaseType(type) {
    const prototype = Object.getPrototypeOf(type.prototype);
    const baseType = prototype?.constructor;
    return baseType;
}
//# sourceMappingURL=get_base_type.js.map

/***/ }),
/* 50 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Request = void 0;
const id_1 = __webpack_require__(11);
class Request {
    id;
    serviceIdentifier;
    parentContext;
    parentRequest;
    bindings;
    childRequests;
    target;
    requestScope;
    constructor(serviceIdentifier, parentContext, parentRequest, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bindings, target) {
        this.id = (0, id_1.id)();
        this.serviceIdentifier = serviceIdentifier;
        this.parentContext = parentContext;
        this.parentRequest = parentRequest;
        this.target = target;
        this.childRequests = [];
        this.bindings = Array.isArray(bindings) ? bindings : [bindings];
        // Set requestScope if Request is the root request
        this.requestScope = parentRequest === null ? new Map() : null;
    }
    addChildRequest(serviceIdentifier, bindings, target) {
        const child = new Request(serviceIdentifier, this.parentContext, this, bindings, target);
        this.childRequests.push(child);
        return child;
    }
}
exports.Request = Request;
//# sourceMappingURL=request.js.map

/***/ }),
/* 51 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.resolve = resolve;
const ERROR_MSGS = __importStar(__webpack_require__(12));
const literal_types_1 = __webpack_require__(10);
const planner_1 = __webpack_require__(14);
const scope_1 = __webpack_require__(52);
const async_1 = __webpack_require__(53);
const binding_utils_1 = __webpack_require__(54);
const exceptions_1 = __webpack_require__(43);
const instantiation_1 = __webpack_require__(56);
// eslint-disable-next-line @typescript-eslint/naming-convention
const _resolveRequest = (requestScope) => (request) => {
    request.parentContext.setCurrentRequest(request);
    const bindings = request.bindings;
    const childRequests = request.childRequests;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions
    const targetIsAnArray = request.target && request.target.isArray();
    const targetParentIsNotAnArray = !request.parentRequest ||
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions
        !request.parentRequest.target ||
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions
        !request.target ||
        !request.parentRequest.target.matchesArray(request.target.serviceIdentifier);
    if (targetIsAnArray && targetParentIsNotAnArray) {
        // Create an array instead of creating an instance
        return childRequests.map((childRequest) => {
            const resolveRequest = _resolveRequest(requestScope);
            return resolveRequest(childRequest);
        });
    }
    else {
        if (request.target.isOptional() && bindings.length === 0) {
            return undefined;
        }
        const binding = bindings[0];
        return _resolveBinding(requestScope, request, binding);
    }
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _resolveFactoryFromBinding = (binding, context) => {
    const factoryDetails = (0, binding_utils_1.getFactoryDetails)(binding);
    return (0, exceptions_1.tryAndThrowErrorIfStackOverflow)(() => factoryDetails.factory.bind(binding)(context), () => new Error(ERROR_MSGS.CIRCULAR_DEPENDENCY_IN_FACTORY(factoryDetails.factoryType, context.currentRequest.serviceIdentifier.toString())));
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _getResolvedFromBinding = (requestScope, request, binding) => {
    let result;
    const childRequests = request.childRequests;
    (0, binding_utils_1.ensureFullyBound)(binding);
    switch (binding.type) {
        case literal_types_1.BindingTypeEnum.ConstantValue:
        case literal_types_1.BindingTypeEnum.Function:
            result = binding.cache;
            break;
        case literal_types_1.BindingTypeEnum.Constructor:
            result = binding.implementationType;
            break;
        case literal_types_1.BindingTypeEnum.Instance:
            result = (0, instantiation_1.resolveInstance)(binding, binding.implementationType, childRequests, _resolveRequest(requestScope));
            break;
        default:
            result = _resolveFactoryFromBinding(binding, request.parentContext);
    }
    return result;
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _resolveInScope = (requestScope, binding, resolveFromBinding) => {
    let result = (0, scope_1.tryGetFromScope)(requestScope, binding);
    if (result !== null) {
        return result;
    }
    result = resolveFromBinding();
    (0, scope_1.saveToScope)(requestScope, binding, result);
    return result;
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _resolveBinding = (requestScope, request, binding) => {
    return _resolveInScope(requestScope, binding, () => {
        let result = _getResolvedFromBinding(requestScope, request, binding);
        if ((0, async_1.isPromise)(result)) {
            result = result.then((resolved) => _onActivation(request, binding, resolved));
        }
        else {
            result = _onActivation(request, binding, result);
        }
        return result;
    });
};
function _onActivation(request, binding, resolved) {
    let result = _bindingActivation(request.parentContext, binding, resolved);
    const containersIterator = _getContainersIterator(request.parentContext.container);
    let container;
    let containersIteratorResult = containersIterator.next();
    do {
        container = containersIteratorResult.value;
        const context = request.parentContext;
        const serviceIdentifier = request.serviceIdentifier;
        const activationsIterator = _getContainerActivationsForService(container, serviceIdentifier);
        if ((0, async_1.isPromise)(result)) {
            result = _activateContainerAsync(activationsIterator, context, result);
        }
        else {
            result = _activateContainer(activationsIterator, context, result);
        }
        containersIteratorResult = containersIterator.next();
        // make sure if we are currently on the container that owns the binding, not to keep looping down to child containers
    } while (containersIteratorResult.done !== true &&
        !(0, planner_1.getBindingDictionary)(container).hasKey(request.serviceIdentifier));
    return result;
}
// eslint-disable-next-line @typescript-eslint/naming-convention
const _bindingActivation = (context, binding, previousResult) => {
    let result;
    // use activation handler if available
    if (typeof binding.onActivation === 'function') {
        result = binding.onActivation(context, previousResult);
    }
    else {
        result = previousResult;
    }
    return result;
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _activateContainer = (activationsIterator, context, result) => {
    let activation = activationsIterator.next();
    while (activation.done !== true) {
        result = activation.value(context, result);
        if ((0, async_1.isPromise)(result)) {
            return _activateContainerAsync(activationsIterator, context, result);
        }
        activation = activationsIterator.next();
    }
    return result;
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _activateContainerAsync = async (activationsIterator, context, resultPromise) => {
    let result = await resultPromise;
    let activation = activationsIterator.next();
    while (activation.done !== true) {
        result = await activation.value(context, result);
        activation = activationsIterator.next();
    }
    return result;
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _getContainerActivationsForService = (container, serviceIdentifier) => {
    // smell accessing _activations, but similar pattern is done in planner.getBindingDictionary()
    const activations = container._activations;
    return activations.hasKey(serviceIdentifier)
        ? activations.get(serviceIdentifier).values()
        : [].values();
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _getContainersIterator = (container) => {
    const containersStack = [container];
    let parent = container.parent;
    while (parent !== null) {
        containersStack.push(parent);
        parent = parent.parent;
    }
    const getNextContainer = () => {
        const nextContainer = containersStack.pop();
        if (nextContainer !== undefined) {
            return { done: false, value: nextContainer };
        }
        else {
            return { done: true, value: undefined };
        }
    };
    const containersIterator = {
        next: getNextContainer,
    };
    return containersIterator;
};
function resolve(context) {
    const resolveRequestFunction = _resolveRequest(context.plan.rootRequest.requestScope);
    return resolveRequestFunction(context.plan.rootRequest);
}
//# sourceMappingURL=resolver.js.map

/***/ }),
/* 52 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.saveToScope = exports.tryGetFromScope = void 0;
const literal_types_1 = __webpack_require__(10);
const async_1 = __webpack_require__(53);
const tryGetFromScope = (requestScope, binding) => {
    if (binding.scope === literal_types_1.BindingScopeEnum.Singleton && binding.activated) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return binding.cache;
    }
    if (binding.scope === literal_types_1.BindingScopeEnum.Request &&
        requestScope.has(binding.id)) {
        return requestScope.get(binding.id);
    }
    return null;
};
exports.tryGetFromScope = tryGetFromScope;
const saveToScope = (requestScope, binding, result) => {
    if (binding.scope === literal_types_1.BindingScopeEnum.Singleton) {
        _saveToSingletonScope(binding, result);
    }
    if (binding.scope === literal_types_1.BindingScopeEnum.Request) {
        _saveToRequestScope(requestScope, binding, result);
    }
};
exports.saveToScope = saveToScope;
// eslint-disable-next-line @typescript-eslint/naming-convention
const _saveToRequestScope = (requestScope, binding, result) => {
    if (!requestScope.has(binding.id)) {
        requestScope.set(binding.id, result);
    }
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _saveToSingletonScope = (binding, result) => {
    // store in cache if scope is singleton
    binding.cache = result;
    binding.activated = true;
    if ((0, async_1.isPromise)(result)) {
        void _saveAsyncResultToSingletonScope(binding, result);
    }
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _saveAsyncResultToSingletonScope = async (binding, asyncResult) => {
    try {
        const result = await asyncResult;
        binding.cache = result;
    }
    catch (ex) {
        // allow binding to retry in future
        binding.cache = null;
        binding.activated = false;
        throw ex;
    }
};
//# sourceMappingURL=scope.js.map

/***/ }),
/* 53 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isPromise = isPromise;
exports.isPromiseOrContainsPromise = isPromiseOrContainsPromise;
function isPromise(object) {
    const isObjectOrFunction = (typeof object === 'object' && object !== null) ||
        typeof object === 'function';
    return (isObjectOrFunction && typeof object.then === 'function');
}
function isPromiseOrContainsPromise(object) {
    if (isPromise(object)) {
        return true;
    }
    return Array.isArray(object) && object.some(isPromise);
}
//# sourceMappingURL=async.js.map

/***/ }),
/* 54 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getFactoryDetails = exports.ensureFullyBound = exports.multiBindToService = void 0;
const ERROR_MSGS = __importStar(__webpack_require__(12));
const literal_types_1 = __webpack_require__(10);
const serialization_1 = __webpack_require__(44);
const factory_type_1 = __webpack_require__(55);
const multiBindToService = (container) => (service) => (...types) => {
    types.forEach((t) => {
        container.bind(t).toService(service);
    });
};
exports.multiBindToService = multiBindToService;
const ensureFullyBound = (binding) => {
    let boundValue = null;
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
    switch (binding.type) {
        case literal_types_1.BindingTypeEnum.ConstantValue:
        case literal_types_1.BindingTypeEnum.Function:
            boundValue = binding.cache;
            break;
        case literal_types_1.BindingTypeEnum.Constructor:
        case literal_types_1.BindingTypeEnum.Instance:
            boundValue = binding.implementationType;
            break;
        case literal_types_1.BindingTypeEnum.DynamicValue:
            boundValue = binding.dynamicValue;
            break;
        case literal_types_1.BindingTypeEnum.Provider:
            boundValue = binding.provider;
            break;
        case literal_types_1.BindingTypeEnum.Factory:
            boundValue = binding.factory;
            break;
    }
    if (boundValue === null) {
        // The user probably created a binding but didn't finish it
        // e.g. container.bind<T>('Something'); missing BindingToSyntax
        const serviceIdentifierAsString = (0, serialization_1.getServiceIdentifierAsString)(binding.serviceIdentifier);
        throw new Error(`${ERROR_MSGS.INVALID_BINDING_TYPE} ${serviceIdentifierAsString}`);
    }
};
exports.ensureFullyBound = ensureFullyBound;
const getFactoryDetails = (binding) => {
    switch (binding.type) {
        case literal_types_1.BindingTypeEnum.Factory:
            return { factory: binding.factory, factoryType: factory_type_1.FactoryType.Factory };
        case literal_types_1.BindingTypeEnum.Provider:
            return { factory: binding.provider, factoryType: factory_type_1.FactoryType.Provider };
        case literal_types_1.BindingTypeEnum.DynamicValue:
            return {
                factory: binding.dynamicValue,
                factoryType: factory_type_1.FactoryType.DynamicValue,
            };
        default:
            throw new Error(`Unexpected factory type ${binding.type}`);
    }
};
exports.getFactoryDetails = getFactoryDetails;
//# sourceMappingURL=binding_utils.js.map

/***/ }),
/* 55 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.FactoryType = void 0;
var FactoryType;
(function (FactoryType) {
    FactoryType["DynamicValue"] = "toDynamicValue";
    FactoryType["Factory"] = "toFactory";
    FactoryType["Provider"] = "toProvider";
})(FactoryType || (exports.FactoryType = FactoryType = {}));
//# sourceMappingURL=factory_type.js.map

/***/ }),
/* 56 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.resolveInstance = resolveInstance;
const error_msgs_1 = __webpack_require__(12);
const literal_types_1 = __webpack_require__(10);
const METADATA_KEY = __importStar(__webpack_require__(7));
const async_1 = __webpack_require__(53);
function _resolveRequests(childRequests, resolveRequest) {
    return childRequests.reduce((resolvedRequests, childRequest) => {
        const injection = resolveRequest(childRequest);
        const targetType = childRequest.target.type;
        if (targetType === literal_types_1.TargetTypeEnum.ConstructorArgument) {
            resolvedRequests.constructorInjections.push(injection);
        }
        else {
            resolvedRequests.propertyRequests.push(childRequest);
            resolvedRequests.propertyInjections.push(injection);
        }
        if (!resolvedRequests.isAsync) {
            resolvedRequests.isAsync = (0, async_1.isPromiseOrContainsPromise)(injection);
        }
        return resolvedRequests;
    }, {
        constructorInjections: [],
        isAsync: false,
        propertyInjections: [],
        propertyRequests: [],
    });
}
function _createInstance(constr, childRequests, resolveRequest) {
    let result;
    if (childRequests.length > 0) {
        const resolved = _resolveRequests(childRequests, resolveRequest);
        const createInstanceWithInjectionsArg = {
            ...resolved,
            constr,
        };
        if (resolved.isAsync) {
            result = createInstanceWithInjectionsAsync(createInstanceWithInjectionsArg);
        }
        else {
            result = createInstanceWithInjections(createInstanceWithInjectionsArg);
        }
    }
    else {
        result = new constr();
    }
    return result;
}
function createInstanceWithInjections(args) {
    const instance = new args.constr(...args.constructorInjections);
    args.propertyRequests.forEach((r, index) => {
        const property = r.target.identifier;
        const injection = args.propertyInjections[index];
        if (!r.target.isOptional() || injection !== undefined) {
            instance[property] = injection;
        }
    });
    return instance;
}
async function createInstanceWithInjectionsAsync(args) {
    const constructorInjections = await possiblyWaitInjections(args.constructorInjections);
    const propertyInjections = await possiblyWaitInjections(args.propertyInjections);
    return createInstanceWithInjections({
        ...args,
        constructorInjections,
        propertyInjections,
    });
}
async function possiblyWaitInjections(possiblePromiseinjections) {
    const injections = [];
    for (const injection of possiblePromiseinjections) {
        if (Array.isArray(injection)) {
            injections.push(Promise.all(injection));
        }
        else {
            injections.push(injection);
        }
    }
    return Promise.all(injections);
}
function _getInstanceAfterPostConstruct(constr, result) {
    const postConstructResult = _postConstruct(constr, result);
    if ((0, async_1.isPromise)(postConstructResult)) {
        return postConstructResult.then(() => result);
    }
    else {
        return result;
    }
}
function _postConstruct(constr, instance) {
    if (Reflect.hasMetadata(METADATA_KEY.POST_CONSTRUCT, constr)) {
        const data = Reflect.getMetadata(METADATA_KEY.POST_CONSTRUCT, constr);
        try {
            return instance[data.value]?.();
        }
        catch (e) {
            if (e instanceof Error) {
                throw new Error((0, error_msgs_1.POST_CONSTRUCT_ERROR)(constr.name, e.message));
            }
        }
    }
}
function _validateInstanceResolution(binding, constr) {
    if (binding.scope !== literal_types_1.BindingScopeEnum.Singleton) {
        _throwIfHandlingDeactivation(binding, constr);
    }
}
function _throwIfHandlingDeactivation(binding, constr) {
    const scopeErrorMessage = `Class cannot be instantiated in ${binding.scope === literal_types_1.BindingScopeEnum.Request ? 'request' : 'transient'} scope.`;
    if (typeof binding.onDeactivation === 'function') {
        throw new Error((0, error_msgs_1.ON_DEACTIVATION_ERROR)(constr.name, scopeErrorMessage));
    }
    if (Reflect.hasMetadata(METADATA_KEY.PRE_DESTROY, constr)) {
        throw new Error((0, error_msgs_1.PRE_DESTROY_ERROR)(constr.name, scopeErrorMessage));
    }
}
function resolveInstance(binding, constr, childRequests, resolveRequest) {
    _validateInstanceResolution(binding, constr);
    const result = _createInstance(constr, childRequests, resolveRequest);
    if ((0, async_1.isPromise)(result)) {
        return result.then((resolvedResult) => _getInstanceAfterPostConstruct(constr, resolvedResult));
    }
    else {
        return _getInstanceAfterPostConstruct(constr, result);
    }
}
//# sourceMappingURL=instantiation.js.map

/***/ }),
/* 57 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BindingToSyntax = void 0;
const ERROR_MSGS = __importStar(__webpack_require__(12));
const literal_types_1 = __webpack_require__(10);
const binding_in_when_on_syntax_1 = __webpack_require__(58);
const binding_when_on_syntax_1 = __webpack_require__(60);
class BindingToSyntax {
    // TODO: Implement an internal type `_BindingToSyntax<T>` wherein this member
    // can be public. Let `BindingToSyntax<T>` be the presentational type that
    // depends on it, and does not expose this member as public.
    _binding;
    constructor(binding) {
        this._binding = binding;
    }
    to(constructor) {
        this._binding.type = literal_types_1.BindingTypeEnum.Instance;
        this._binding.implementationType = constructor;
        return new binding_in_when_on_syntax_1.BindingInWhenOnSyntax(this._binding);
    }
    toSelf() {
        if (typeof this._binding.serviceIdentifier !== 'function') {
            throw new Error(ERROR_MSGS.INVALID_TO_SELF_VALUE);
        }
        const self = this._binding
            .serviceIdentifier;
        return this.to(self);
    }
    toConstantValue(value) {
        this._binding.type = literal_types_1.BindingTypeEnum.ConstantValue;
        this._binding.cache = value;
        this._binding.dynamicValue = null;
        this._binding.implementationType = null;
        this._binding.scope = literal_types_1.BindingScopeEnum.Singleton;
        return new binding_when_on_syntax_1.BindingWhenOnSyntax(this._binding);
    }
    toDynamicValue(func) {
        this._binding.type = literal_types_1.BindingTypeEnum.DynamicValue;
        this._binding.cache = null;
        this._binding.dynamicValue = func;
        this._binding.implementationType = null;
        return new binding_in_when_on_syntax_1.BindingInWhenOnSyntax(this._binding);
    }
    toConstructor(constructor) {
        this._binding.type = literal_types_1.BindingTypeEnum.Constructor;
        this._binding.implementationType = constructor;
        this._binding.scope = literal_types_1.BindingScopeEnum.Singleton;
        return new binding_when_on_syntax_1.BindingWhenOnSyntax(this._binding);
    }
    toFactory(factory) {
        this._binding.type = literal_types_1.BindingTypeEnum.Factory;
        this._binding.factory = factory;
        this._binding.scope = literal_types_1.BindingScopeEnum.Singleton;
        return new binding_when_on_syntax_1.BindingWhenOnSyntax(this._binding);
    }
    toFunction(func) {
        // toFunction is an alias of toConstantValue
        if (typeof func !== 'function') {
            throw new Error(ERROR_MSGS.INVALID_FUNCTION_BINDING);
        }
        const bindingWhenOnSyntax = this.toConstantValue(func);
        this._binding.type = literal_types_1.BindingTypeEnum.Function;
        this._binding.scope = literal_types_1.BindingScopeEnum.Singleton;
        return bindingWhenOnSyntax;
    }
    toAutoFactory(serviceIdentifier) {
        this._binding.type = literal_types_1.BindingTypeEnum.Factory;
        this._binding.factory = (context) => {
            const autofactory = () => context.container.get(serviceIdentifier);
            return autofactory;
        };
        this._binding.scope = literal_types_1.BindingScopeEnum.Singleton;
        return new binding_when_on_syntax_1.BindingWhenOnSyntax(this._binding);
    }
    toAutoNamedFactory(serviceIdentifier) {
        this._binding.type = literal_types_1.BindingTypeEnum.Factory;
        this._binding.factory = (context) => {
            return (named) => context.container.getNamed(serviceIdentifier, named);
        };
        return new binding_when_on_syntax_1.BindingWhenOnSyntax(this._binding);
    }
    toProvider(provider) {
        this._binding.type = literal_types_1.BindingTypeEnum.Provider;
        this._binding.provider = provider;
        this._binding.scope = literal_types_1.BindingScopeEnum.Singleton;
        return new binding_when_on_syntax_1.BindingWhenOnSyntax(this._binding);
    }
    toService(service) {
        this._binding.type = literal_types_1.BindingTypeEnum.DynamicValue;
        // Service bindings should never ever be cached. This is just a workaround to achieve that. A better design should replace this approach.
        Object.defineProperty(this._binding, 'cache', {
            configurable: true,
            enumerable: true,
            get() {
                return null;
            },
            set(_value) { },
        });
        this._binding.dynamicValue = (context) => {
            try {
                return context.container.get(service);
            }
            catch (_error) {
                // This is a performance degradation in this edge case, we do need to improve the internal resolution architecture in order to solve this properly.
                return context.container.getAsync(service);
            }
        };
        this._binding.implementationType = null;
    }
}
exports.BindingToSyntax = BindingToSyntax;
//# sourceMappingURL=binding_to_syntax.js.map

/***/ }),
/* 58 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BindingInWhenOnSyntax = void 0;
const binding_in_syntax_1 = __webpack_require__(59);
const binding_on_syntax_1 = __webpack_require__(61);
const binding_when_syntax_1 = __webpack_require__(62);
class BindingInWhenOnSyntax {
    _bindingInSyntax;
    _bindingWhenSyntax;
    _bindingOnSyntax;
    _binding;
    constructor(binding) {
        this._binding = binding;
        this._bindingWhenSyntax = new binding_when_syntax_1.BindingWhenSyntax(this._binding);
        this._bindingOnSyntax = new binding_on_syntax_1.BindingOnSyntax(this._binding);
        this._bindingInSyntax = new binding_in_syntax_1.BindingInSyntax(binding);
    }
    inRequestScope() {
        return this._bindingInSyntax.inRequestScope();
    }
    inSingletonScope() {
        return this._bindingInSyntax.inSingletonScope();
    }
    inTransientScope() {
        return this._bindingInSyntax.inTransientScope();
    }
    when(constraint) {
        return this._bindingWhenSyntax.when(constraint);
    }
    whenTargetNamed(name) {
        return this._bindingWhenSyntax.whenTargetNamed(name);
    }
    whenTargetIsDefault() {
        return this._bindingWhenSyntax.whenTargetIsDefault();
    }
    whenTargetTagged(tag, value) {
        return this._bindingWhenSyntax.whenTargetTagged(tag, value);
    }
    whenInjectedInto(parent) {
        return this._bindingWhenSyntax.whenInjectedInto(parent);
    }
    whenParentNamed(name) {
        return this._bindingWhenSyntax.whenParentNamed(name);
    }
    whenParentTagged(tag, value) {
        return this._bindingWhenSyntax.whenParentTagged(tag, value);
    }
    whenAnyAncestorIs(ancestor) {
        return this._bindingWhenSyntax.whenAnyAncestorIs(ancestor);
    }
    whenNoAncestorIs(ancestor) {
        return this._bindingWhenSyntax.whenNoAncestorIs(ancestor);
    }
    whenAnyAncestorNamed(name) {
        return this._bindingWhenSyntax.whenAnyAncestorNamed(name);
    }
    whenAnyAncestorTagged(tag, value) {
        return this._bindingWhenSyntax.whenAnyAncestorTagged(tag, value);
    }
    whenNoAncestorNamed(name) {
        return this._bindingWhenSyntax.whenNoAncestorNamed(name);
    }
    whenNoAncestorTagged(tag, value) {
        return this._bindingWhenSyntax.whenNoAncestorTagged(tag, value);
    }
    whenAnyAncestorMatches(constraint) {
        return this._bindingWhenSyntax.whenAnyAncestorMatches(constraint);
    }
    whenNoAncestorMatches(constraint) {
        return this._bindingWhenSyntax.whenNoAncestorMatches(constraint);
    }
    onActivation(handler) {
        return this._bindingOnSyntax.onActivation(handler);
    }
    onDeactivation(handler) {
        return this._bindingOnSyntax.onDeactivation(handler);
    }
}
exports.BindingInWhenOnSyntax = BindingInWhenOnSyntax;
//# sourceMappingURL=binding_in_when_on_syntax.js.map

/***/ }),
/* 59 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BindingInSyntax = void 0;
const literal_types_1 = __webpack_require__(10);
const binding_when_on_syntax_1 = __webpack_require__(60);
class BindingInSyntax {
    _binding;
    constructor(binding) {
        this._binding = binding;
    }
    inRequestScope() {
        this._binding.scope = literal_types_1.BindingScopeEnum.Request;
        return new binding_when_on_syntax_1.BindingWhenOnSyntax(this._binding);
    }
    inSingletonScope() {
        this._binding.scope = literal_types_1.BindingScopeEnum.Singleton;
        return new binding_when_on_syntax_1.BindingWhenOnSyntax(this._binding);
    }
    inTransientScope() {
        this._binding.scope = literal_types_1.BindingScopeEnum.Transient;
        return new binding_when_on_syntax_1.BindingWhenOnSyntax(this._binding);
    }
}
exports.BindingInSyntax = BindingInSyntax;
//# sourceMappingURL=binding_in_syntax.js.map

/***/ }),
/* 60 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BindingWhenOnSyntax = void 0;
const binding_on_syntax_1 = __webpack_require__(61);
const binding_when_syntax_1 = __webpack_require__(62);
class BindingWhenOnSyntax {
    _bindingWhenSyntax;
    _bindingOnSyntax;
    _binding;
    constructor(binding) {
        this._binding = binding;
        this._bindingWhenSyntax = new binding_when_syntax_1.BindingWhenSyntax(this._binding);
        this._bindingOnSyntax = new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
    when(constraint) {
        return this._bindingWhenSyntax.when(constraint);
    }
    whenTargetNamed(name) {
        return this._bindingWhenSyntax.whenTargetNamed(name);
    }
    whenTargetIsDefault() {
        return this._bindingWhenSyntax.whenTargetIsDefault();
    }
    whenTargetTagged(tag, value) {
        return this._bindingWhenSyntax.whenTargetTagged(tag, value);
    }
    whenInjectedInto(parent) {
        return this._bindingWhenSyntax.whenInjectedInto(parent);
    }
    whenParentNamed(name) {
        return this._bindingWhenSyntax.whenParentNamed(name);
    }
    whenParentTagged(tag, value) {
        return this._bindingWhenSyntax.whenParentTagged(tag, value);
    }
    whenAnyAncestorIs(ancestor) {
        return this._bindingWhenSyntax.whenAnyAncestorIs(ancestor);
    }
    whenNoAncestorIs(ancestor) {
        return this._bindingWhenSyntax.whenNoAncestorIs(ancestor);
    }
    whenAnyAncestorNamed(name) {
        return this._bindingWhenSyntax.whenAnyAncestorNamed(name);
    }
    whenAnyAncestorTagged(tag, value) {
        return this._bindingWhenSyntax.whenAnyAncestorTagged(tag, value);
    }
    whenNoAncestorNamed(name) {
        return this._bindingWhenSyntax.whenNoAncestorNamed(name);
    }
    whenNoAncestorTagged(tag, value) {
        return this._bindingWhenSyntax.whenNoAncestorTagged(tag, value);
    }
    whenAnyAncestorMatches(constraint) {
        return this._bindingWhenSyntax.whenAnyAncestorMatches(constraint);
    }
    whenNoAncestorMatches(constraint) {
        return this._bindingWhenSyntax.whenNoAncestorMatches(constraint);
    }
    onActivation(handler) {
        return this._bindingOnSyntax.onActivation(handler);
    }
    onDeactivation(handler) {
        return this._bindingOnSyntax.onDeactivation(handler);
    }
}
exports.BindingWhenOnSyntax = BindingWhenOnSyntax;
//# sourceMappingURL=binding_when_on_syntax.js.map

/***/ }),
/* 61 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BindingOnSyntax = void 0;
const binding_when_syntax_1 = __webpack_require__(62);
class BindingOnSyntax {
    _binding;
    constructor(binding) {
        this._binding = binding;
    }
    onActivation(handler) {
        this._binding.onActivation = handler;
        return new binding_when_syntax_1.BindingWhenSyntax(this._binding);
    }
    onDeactivation(handler) {
        this._binding.onDeactivation = handler;
        return new binding_when_syntax_1.BindingWhenSyntax(this._binding);
    }
}
exports.BindingOnSyntax = BindingOnSyntax;
//# sourceMappingURL=binding_on_syntax.js.map

/***/ }),
/* 62 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BindingWhenSyntax = void 0;
const binding_on_syntax_1 = __webpack_require__(61);
const constraint_helpers_1 = __webpack_require__(63);
class BindingWhenSyntax {
    _binding;
    constructor(binding) {
        this._binding = binding;
    }
    when(constraint) {
        this._binding.constraint = constraint;
        return new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
    whenTargetNamed(name) {
        this._binding.constraint = (0, constraint_helpers_1.namedConstraint)(name);
        return new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
    whenTargetIsDefault() {
        this._binding.constraint = (request) => {
            if (request === null) {
                return false;
            }
            const targetIsDefault = 
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            request.target !== null &&
                !request.target.isNamed() &&
                !request.target.isTagged();
            return targetIsDefault;
        };
        return new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
    whenTargetTagged(tag, value) {
        this._binding.constraint = (0, constraint_helpers_1.taggedConstraint)(tag)(value);
        return new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
    whenInjectedInto(parent) {
        this._binding.constraint = (request) => request !== null && (0, constraint_helpers_1.typeConstraint)(parent)(request.parentRequest);
        return new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
    whenParentNamed(name) {
        this._binding.constraint = (request) => request !== null && (0, constraint_helpers_1.namedConstraint)(name)(request.parentRequest);
        return new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
    whenParentTagged(tag, value) {
        this._binding.constraint = (request) => request !== null && (0, constraint_helpers_1.taggedConstraint)(tag)(value)(request.parentRequest);
        return new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
    whenAnyAncestorIs(ancestor) {
        this._binding.constraint = (request) => request !== null && (0, constraint_helpers_1.traverseAncerstors)(request, (0, constraint_helpers_1.typeConstraint)(ancestor));
        return new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
    whenNoAncestorIs(ancestor) {
        this._binding.constraint = (request) => request !== null &&
            !(0, constraint_helpers_1.traverseAncerstors)(request, (0, constraint_helpers_1.typeConstraint)(ancestor));
        return new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
    whenAnyAncestorNamed(name) {
        this._binding.constraint = (request) => request !== null && (0, constraint_helpers_1.traverseAncerstors)(request, (0, constraint_helpers_1.namedConstraint)(name));
        return new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
    whenNoAncestorNamed(name) {
        this._binding.constraint = (request) => request !== null && !(0, constraint_helpers_1.traverseAncerstors)(request, (0, constraint_helpers_1.namedConstraint)(name));
        return new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
    whenAnyAncestorTagged(tag, value) {
        this._binding.constraint = (request) => request !== null &&
            (0, constraint_helpers_1.traverseAncerstors)(request, (0, constraint_helpers_1.taggedConstraint)(tag)(value));
        return new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
    whenNoAncestorTagged(tag, value) {
        this._binding.constraint = (request) => request !== null &&
            !(0, constraint_helpers_1.traverseAncerstors)(request, (0, constraint_helpers_1.taggedConstraint)(tag)(value));
        return new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
    whenAnyAncestorMatches(constraint) {
        this._binding.constraint = (request) => request !== null &&
            (0, constraint_helpers_1.traverseAncerstors)(request, constraint);
        return new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
    whenNoAncestorMatches(constraint) {
        this._binding.constraint = (request) => request !== null &&
            !(0, constraint_helpers_1.traverseAncerstors)(request, constraint);
        return new binding_on_syntax_1.BindingOnSyntax(this._binding);
    }
}
exports.BindingWhenSyntax = BindingWhenSyntax;
//# sourceMappingURL=binding_when_syntax.js.map

/***/ }),
/* 63 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.typeConstraint = exports.namedConstraint = exports.taggedConstraint = exports.traverseAncerstors = void 0;
const METADATA_KEY = __importStar(__webpack_require__(7));
const metadata_1 = __webpack_require__(46);
const traverseAncerstors = (request, constraint) => {
    const parent = request.parentRequest;
    if (parent !== null) {
        return constraint(parent) ? true : traverseAncerstors(parent, constraint);
    }
    else {
        return false;
    }
};
exports.traverseAncerstors = traverseAncerstors;
// This helpers use currying to help you to generate constraints
const taggedConstraint = (key) => (value) => {
    const constraint = (request) => request !== null &&
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        request.target !== null &&
        request.target.matchesTag(key)(value);
    constraint.metaData = new metadata_1.Metadata(key, value);
    return constraint;
};
exports.taggedConstraint = taggedConstraint;
const namedConstraint = taggedConstraint(METADATA_KEY.NAMED_TAG);
exports.namedConstraint = namedConstraint;
const typeConstraint = (type) => (request) => {
    // Using index 0 because constraints are applied
    // to one binding at a time (see Planner class)
    let binding = null;
    if (request !== null) {
        binding = request.bindings[0];
        if (typeof type === 'string') {
            return binding.serviceIdentifier === type;
        }
        else {
            const constructor = request.bindings[0].implementationType;
            return type === constructor;
        }
    }
    return false;
};
exports.typeConstraint = typeConstraint;
//# sourceMappingURL=constraint_helpers.js.map

/***/ }),
/* 64 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ContainerSnapshot = void 0;
class ContainerSnapshot {
    bindings;
    activations;
    deactivations;
    middleware;
    moduleActivationStore;
    static of(bindings, middleware, activations, deactivations, moduleActivationStore) {
        const snapshot = new ContainerSnapshot();
        snapshot.bindings = bindings;
        snapshot.middleware = middleware;
        snapshot.deactivations = deactivations;
        snapshot.activations = activations;
        snapshot.moduleActivationStore = moduleActivationStore;
        return snapshot;
    }
}
exports.ContainerSnapshot = ContainerSnapshot;
//# sourceMappingURL=container_snapshot.js.map

/***/ }),
/* 65 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Lookup = void 0;
const ERROR_MSGS = __importStar(__webpack_require__(12));
const clonable_1 = __webpack_require__(66);
class Lookup {
    // dictionary used store multiple values for each key <key>
    _map;
    constructor() {
        this._map = new Map();
    }
    getMap() {
        return this._map;
    }
    // adds a new entry to _map
    add(serviceIdentifier, value) {
        this._checkNonNulish(serviceIdentifier);
        if (value === null || value === undefined) {
            throw new Error(ERROR_MSGS.NULL_ARGUMENT);
        }
        const entry = this._map.get(serviceIdentifier);
        if (entry !== undefined) {
            entry.push(value);
        }
        else {
            this._map.set(serviceIdentifier, [value]);
        }
    }
    // gets the value of a entry by its key (serviceIdentifier)
    get(serviceIdentifier) {
        this._checkNonNulish(serviceIdentifier);
        const entry = this._map.get(serviceIdentifier);
        if (entry !== undefined) {
            return entry;
        }
        else {
            throw new Error(ERROR_MSGS.KEY_NOT_FOUND);
        }
    }
    // removes a entry from _map by its key (serviceIdentifier)
    remove(serviceIdentifier) {
        this._checkNonNulish(serviceIdentifier);
        if (!this._map.delete(serviceIdentifier)) {
            throw new Error(ERROR_MSGS.KEY_NOT_FOUND);
        }
    }
    removeIntersection(lookup) {
        this.traverse((serviceIdentifier, value) => {
            const lookupActivations = lookup.hasKey(serviceIdentifier)
                ? lookup.get(serviceIdentifier)
                : undefined;
            if (lookupActivations !== undefined) {
                const filteredValues = value.filter((lookupValue) => !lookupActivations.some((moduleActivation) => lookupValue === moduleActivation));
                this._setValue(serviceIdentifier, filteredValues);
            }
        });
    }
    removeByCondition(condition) {
        const removals = [];
        this._map.forEach((entries, key) => {
            const updatedEntries = [];
            for (const entry of entries) {
                const remove = condition(entry);
                if (remove) {
                    removals.push(entry);
                }
                else {
                    updatedEntries.push(entry);
                }
            }
            this._setValue(key, updatedEntries);
        });
        return removals;
    }
    // returns true if _map contains a key (serviceIdentifier)
    hasKey(serviceIdentifier) {
        this._checkNonNulish(serviceIdentifier);
        return this._map.has(serviceIdentifier);
    }
    // returns a new Lookup instance; note: this is not a deep clone, only Lookup related data structure (dictionary) is
    // cloned, content remains the same
    clone() {
        const copy = new Lookup();
        this._map.forEach((value, key) => {
            value.forEach((b) => {
                copy.add(key, (0, clonable_1.isClonable)(b) ? b.clone() : b);
            });
        });
        return copy;
    }
    traverse(func) {
        this._map.forEach((value, key) => {
            func(key, value);
        });
    }
    _checkNonNulish(value) {
        if (value == null) {
            throw new Error(ERROR_MSGS.NULL_ARGUMENT);
        }
    }
    _setValue(serviceIdentifier, value) {
        if (value.length > 0) {
            this._map.set(serviceIdentifier, value);
        }
        else {
            this._map.delete(serviceIdentifier);
        }
    }
}
exports.Lookup = Lookup;
//# sourceMappingURL=lookup.js.map

/***/ }),
/* 66 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isClonable = isClonable;
function isClonable(obj) {
    return (typeof obj === 'object' &&
        obj !== null &&
        'clone' in obj &&
        typeof obj.clone === 'function');
}
//# sourceMappingURL=clonable.js.map

/***/ }),
/* 67 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ModuleActivationStore = void 0;
const lookup_1 = __webpack_require__(65);
class ModuleActivationStore {
    _map = new Map();
    remove(moduleId) {
        const handlers = this._map.get(moduleId);
        if (handlers === undefined) {
            return this._getEmptyHandlersStore();
        }
        this._map.delete(moduleId);
        return handlers;
    }
    addDeactivation(moduleId, serviceIdentifier, onDeactivation) {
        this._getModuleActivationHandlers(moduleId).onDeactivations.add(serviceIdentifier, onDeactivation);
    }
    addActivation(moduleId, serviceIdentifier, onActivation) {
        this._getModuleActivationHandlers(moduleId).onActivations.add(serviceIdentifier, onActivation);
    }
    clone() {
        const clone = new ModuleActivationStore();
        this._map.forEach((handlersStore, moduleId) => {
            clone._map.set(moduleId, {
                onActivations: handlersStore.onActivations.clone(),
                onDeactivations: handlersStore.onDeactivations.clone(),
            });
        });
        return clone;
    }
    _getModuleActivationHandlers(moduleId) {
        let moduleActivationHandlers = this._map.get(moduleId);
        if (moduleActivationHandlers === undefined) {
            moduleActivationHandlers = this._getEmptyHandlersStore();
            this._map.set(moduleId, moduleActivationHandlers);
        }
        return moduleActivationHandlers;
    }
    _getEmptyHandlersStore() {
        const handlersStore = {
            onActivations: new lookup_1.Lookup(),
            onDeactivations: new lookup_1.Lookup(),
        };
        return handlersStore;
    }
}
exports.ModuleActivationStore = ModuleActivationStore;
//# sourceMappingURL=module_activation_store.js.map

/***/ }),
/* 68 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AsyncContainerModule = exports.ContainerModule = void 0;
const id_1 = __webpack_require__(11);
class ContainerModule {
    id;
    registry;
    constructor(registry) {
        this.id = (0, id_1.id)();
        this.registry = registry;
    }
}
exports.ContainerModule = ContainerModule;
class AsyncContainerModule {
    id;
    registry;
    constructor(registry) {
        this.id = (0, id_1.id)();
        this.registry = registry;
    }
}
exports.AsyncContainerModule = AsyncContainerModule;
//# sourceMappingURL=container_module.js.map

/***/ }),
/* 69 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.decorate = decorate;
exports.tagParameter = tagParameter;
exports.tagProperty = tagProperty;
exports.createTaggedDecorator = createTaggedDecorator;
const ERROR_MSGS = __importStar(__webpack_require__(12));
const METADATA_KEY = __importStar(__webpack_require__(7));
const js_1 = __webpack_require__(70);
function targetIsConstructorFunction(target) {
    return target.prototype !== undefined;
}
function _throwIfMethodParameter(parameterName) {
    if (parameterName !== undefined) {
        throw new Error(ERROR_MSGS.INVALID_DECORATOR_OPERATION);
    }
}
function tagParameter(annotationTarget, parameterName, parameterIndex, metadata) {
    _throwIfMethodParameter(parameterName);
    _tagParameterOrProperty(METADATA_KEY.TAGGED, annotationTarget, parameterIndex.toString(), metadata);
}
function tagProperty(annotationTarget, propertyName, metadata) {
    if (targetIsConstructorFunction(annotationTarget)) {
        throw new Error(ERROR_MSGS.INVALID_DECORATOR_OPERATION);
    }
    _tagParameterOrProperty(METADATA_KEY.TAGGED_PROP, annotationTarget.constructor, propertyName, metadata);
}
function _ensureNoMetadataKeyDuplicates(metadata) {
    let metadatas = [];
    if (Array.isArray(metadata)) {
        metadatas = metadata;
        const duplicate = (0, js_1.getFirstArrayDuplicate)(metadatas.map((md) => md.key));
        if (duplicate !== undefined) {
            throw new Error(`${ERROR_MSGS.DUPLICATED_METADATA} ${duplicate.toString()}`);
        }
    }
    else {
        metadatas = [metadata];
    }
    return metadatas;
}
function _tagParameterOrProperty(metadataKey, annotationTarget, key, metadata) {
    const metadatas = _ensureNoMetadataKeyDuplicates(metadata);
    let paramsOrPropertiesMetadata = {};
    // read metadata if available
    if (Reflect.hasOwnMetadata(metadataKey, annotationTarget)) {
        paramsOrPropertiesMetadata = Reflect.getMetadata(metadataKey, annotationTarget);
    }
    let paramOrPropertyMetadata = paramsOrPropertiesMetadata[key];
    if (paramOrPropertyMetadata === undefined) {
        paramOrPropertyMetadata = [];
    }
    else {
        for (const m of paramOrPropertyMetadata) {
            if (metadatas.some((md) => md.key === m.key)) {
                throw new Error(`${ERROR_MSGS.DUPLICATED_METADATA} ${m.key.toString()}`);
            }
        }
    }
    // set metadata
    paramOrPropertyMetadata.push(...metadatas);
    paramsOrPropertiesMetadata[key] = paramOrPropertyMetadata;
    Reflect.defineMetadata(metadataKey, paramsOrPropertiesMetadata, annotationTarget);
}
function createTaggedDecorator(metadata) {
    return (target, targetKey, indexOrPropertyDescriptor) => {
        if (typeof indexOrPropertyDescriptor === 'number') {
            tagParameter(target, targetKey, indexOrPropertyDescriptor, metadata);
        }
        else {
            tagProperty(target, targetKey, metadata);
        }
    };
}
function _decorate(decorators, target) {
    Reflect.decorate(decorators, target);
}
function _param(paramIndex, decorator) {
    return function (target, key) {
        decorator(target, key, paramIndex);
    };
}
// Allows VanillaJS developers to use decorators:
// decorate(injectable(), FooBar);
// decorate(targetName('foo', 'bar'), FooBar);
// decorate(named('foo'), FooBar, 0);
// decorate(tagged('bar'), FooBar, 1);
function decorate(decorator, target, parameterIndexOrProperty) {
    if (typeof parameterIndexOrProperty === 'number') {
        _decorate([_param(parameterIndexOrProperty, decorator)], target);
    }
    else if (typeof parameterIndexOrProperty === 'string') {
        Reflect.decorate([decorator], target, parameterIndexOrProperty);
    }
    else {
        _decorate([decorator], target);
    }
}
//# sourceMappingURL=decorator_utils.js.map

/***/ }),
/* 70 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getFirstArrayDuplicate = getFirstArrayDuplicate;
function getFirstArrayDuplicate(array) {
    const seenValues = new Set();
    for (const entry of array) {
        if (seenValues.has(entry)) {
            return entry;
        }
        else {
            seenValues.add(entry);
        }
    }
    return undefined;
}
//# sourceMappingURL=js.js.map

/***/ }),
/* 71 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.injectable = injectable;
const ERRORS_MSGS = __importStar(__webpack_require__(12));
const METADATA_KEY = __importStar(__webpack_require__(7));
function injectable() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function (target) {
        if (Reflect.hasOwnMetadata(METADATA_KEY.PARAM_TYPES, target)) {
            throw new Error(ERRORS_MSGS.DUPLICATED_INJECTABLE_DECORATOR);
        }
        const types = Reflect.getMetadata(METADATA_KEY.DESIGN_PARAM_TYPES, target) || [];
        Reflect.defineMetadata(METADATA_KEY.PARAM_TYPES, types, target);
        return target;
    };
}
//# sourceMappingURL=injectable.js.map

/***/ }),
/* 72 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.tagged = tagged;
const metadata_1 = __webpack_require__(46);
const decorator_utils_1 = __webpack_require__(69);
// Used to add custom metadata which is used to resolve metadata-based contextual bindings.
function tagged(metadataKey, metadataValue) {
    return (0, decorator_utils_1.createTaggedDecorator)(new metadata_1.Metadata(metadataKey, metadataValue));
}
//# sourceMappingURL=tagged.js.map

/***/ }),
/* 73 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.named = named;
const METADATA_KEY = __importStar(__webpack_require__(7));
const metadata_1 = __webpack_require__(46);
const decorator_utils_1 = __webpack_require__(69);
// Used to add named metadata which is used to resolve name-based contextual bindings.
function named(name) {
    return (0, decorator_utils_1.createTaggedDecorator)(new metadata_1.Metadata(METADATA_KEY.NAMED_TAG, name));
}
//# sourceMappingURL=named.js.map

/***/ }),
/* 74 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.inject = void 0;
const METADATA_KEY = __importStar(__webpack_require__(7));
const inject_base_1 = __webpack_require__(75);
const inject = (0, inject_base_1.injectBase)(METADATA_KEY.INJECT_TAG);
exports.inject = inject;
//# sourceMappingURL=inject.js.map

/***/ }),
/* 75 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.injectBase = injectBase;
const error_msgs_1 = __webpack_require__(12);
const metadata_1 = __webpack_require__(46);
const decorator_utils_1 = __webpack_require__(69);
function injectBase(metadataKey) {
    return (serviceIdentifier) => {
        return (target, targetKey, indexOrPropertyDescriptor) => {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (serviceIdentifier === undefined) {
                const className = typeof target === 'function' ? target.name : target.constructor.name;
                throw new Error((0, error_msgs_1.UNDEFINED_INJECT_ANNOTATION)(className));
            }
            (0, decorator_utils_1.createTaggedDecorator)(new metadata_1.Metadata(metadataKey, serviceIdentifier))(target, targetKey, indexOrPropertyDescriptor);
        };
    };
}
//# sourceMappingURL=inject_base.js.map

/***/ }),
/* 76 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.optional = optional;
const METADATA_KEY = __importStar(__webpack_require__(7));
const metadata_1 = __webpack_require__(46);
const decorator_utils_1 = __webpack_require__(69);
function optional() {
    return (0, decorator_utils_1.createTaggedDecorator)(new metadata_1.Metadata(METADATA_KEY.OPTIONAL_TAG, true));
}
//# sourceMappingURL=optional.js.map

/***/ }),
/* 77 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.unmanaged = unmanaged;
const METADATA_KEY = __importStar(__webpack_require__(7));
const metadata_1 = __webpack_require__(46);
const decorator_utils_1 = __webpack_require__(69);
function unmanaged() {
    return function (target, targetKey, index) {
        const metadata = new metadata_1.Metadata(METADATA_KEY.UNMANAGED_TAG, true);
        (0, decorator_utils_1.tagParameter)(target, targetKey, index, metadata);
    };
}
//# sourceMappingURL=unmanaged.js.map

/***/ }),
/* 78 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.multiInject = void 0;
const METADATA_KEY = __importStar(__webpack_require__(7));
const inject_base_1 = __webpack_require__(75);
const multiInject = (0, inject_base_1.injectBase)(METADATA_KEY.MULTI_INJECT_TAG);
exports.multiInject = multiInject;
//# sourceMappingURL=multi_inject.js.map

/***/ }),
/* 79 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.targetName = targetName;
const METADATA_KEY = __importStar(__webpack_require__(7));
const metadata_1 = __webpack_require__(46);
const decorator_utils_1 = __webpack_require__(69);
function targetName(name) {
    return function (target, targetKey, index) {
        const metadata = new metadata_1.Metadata(METADATA_KEY.NAME_TAG, name);
        (0, decorator_utils_1.tagParameter)(target, targetKey, index, metadata);
    };
}
//# sourceMappingURL=target_name.js.map

/***/ }),
/* 80 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.postConstruct = void 0;
const ERRORS_MSGS = __importStar(__webpack_require__(12));
const METADATA_KEY = __importStar(__webpack_require__(7));
const property_event_decorator_1 = __webpack_require__(81);
const postConstruct = (0, property_event_decorator_1.propertyEventDecorator)(METADATA_KEY.POST_CONSTRUCT, ERRORS_MSGS.MULTIPLE_POST_CONSTRUCT_METHODS);
exports.postConstruct = postConstruct;
//# sourceMappingURL=post_construct.js.map

/***/ }),
/* 81 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.propertyEventDecorator = propertyEventDecorator;
const metadata_1 = __webpack_require__(46);
function propertyEventDecorator(eventKey, errorMessage) {
    return () => {
        return (target, propertyKey) => {
            const metadata = new metadata_1.Metadata(eventKey, propertyKey);
            if (Reflect.hasOwnMetadata(eventKey, target.constructor)) {
                throw new Error(errorMessage);
            }
            Reflect.defineMetadata(eventKey, metadata, target.constructor);
        };
    };
}
//# sourceMappingURL=property_event_decorator.js.map

/***/ }),
/* 82 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.preDestroy = void 0;
const ERRORS_MSGS = __importStar(__webpack_require__(12));
const METADATA_KEY = __importStar(__webpack_require__(7));
const property_event_decorator_1 = __webpack_require__(81);
const preDestroy = (0, property_event_decorator_1.propertyEventDecorator)(METADATA_KEY.PRE_DESTROY, ERRORS_MSGS.MULTIPLE_PRE_DESTROY_METHODS);
exports.preDestroy = preDestroy;
//# sourceMappingURL=pre_destroy.js.map

/***/ }),
/* 83 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * GXP project file reader.
 *
 * Ports StudioXProject::Read(), ReadProjectHeader(), ReadDisplayInfo(),
 * ReadResources(), ReadStringTable(), ReadScreenFlow(), ReadWidgetFolders()
 * and the base widget_service_provider::ReadFromProject() from the C++ GUIX
 * Studio source.
 *
 * Uses @xmldom/xmldom for XML parsing (no regex, no native add-ons).
 * Schema version 56 (PROJECT_VERSION) is the canonical target; older versions
 * are migrated forward automatically.
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GxpReader = exports.GxpParseError = void 0;
const xmldom_1 = __webpack_require__(84);
const inversify_1 = __webpack_require__(2);
__webpack_require__(3);
const gx_types_1 = __webpack_require__(90);
const res_info_1 = __webpack_require__(91);
const widget_info_1 = __webpack_require__(92);
// ---------------------------------------------------------------------------
// Public error type
// ---------------------------------------------------------------------------
class GxpParseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'GxpParseError';
    }
}
exports.GxpParseError = GxpParseError;
// ---------------------------------------------------------------------------
// Widget type → string name mapping (mirrors widget_service_provider::GetShortName())
// ---------------------------------------------------------------------------
const WIDGET_TYPE_TO_NAME = new Map([
    [1, 'widget'],
    [2, 'button'],
    [3, 'text button'],
    [4, 'multi line text button'],
    [5, 'radio button'],
    [6, 'checkbox'],
    [7, 'pixelmap button'],
    [8, 'shadow button'],
    [9, 'icon button'],
    [10, 'spin button'],
    [11, 'icon'],
    [12, 'sprite'],
    [13, 'circular gauge'],
    [20, 'slider'],
    [21, 'pixelmap slider'],
    [22, 'vertical scroll'],
    [23, 'horizontal scroll'],
    [24, 'progress bar'],
    [25, 'radial progress bar'],
    [26, 'radial slider'],
    [30, 'prompt'],
    [31, 'numeric prompt'],
    [32, 'pixelmap prompt'],
    [33, 'numeric pixelmap prompt'],
    [64, 'single line text input'],
    [65, 'pixelmap text input'],
    [70, 'drop list'],
    [75, 'menu list'],
    [76, 'menu'],
    [77, 'accordion menu'],
    [128, 'window'],
    [129, 'root window'],
    [131, 'vertical list'],
    [132, 'horizontal list'],
    [133, 'popup list'],
    [134, 'multi line text view'],
    [135, 'multi line text input'],
    [136, 'line chart'],
    [137, 'dialog'],
    [138, 'keyboard'],
    [139, 'scroll wheel'],
    [140, 'text scroll wheel'],
    [141, 'string scroll wheel'],
    [142, 'numeric scroll wheel'],
    [143, 'tree view'],
    [144, 'rich text view'],
    [145, 'generic scroll wheel'],
    [200, 'template'],
]);
const WIDGET_NAME_TO_TYPE = new Map([...WIDGET_TYPE_TO_NAME.entries()].map(([k, v]) => [v, k]));
// ---------------------------------------------------------------------------
// Resource type name mapping (mirrors res_types[] in StudioXProject.cpp)
// ---------------------------------------------------------------------------
const RES_TYPE_NAME_MAP = new Map([
    ['HEADER', gx_types_1.RES_TYPE_HEADER],
    ['GROUP', gx_types_1.RES_TYPE_GROUP],
    ['FOLDER', gx_types_1.RES_TYPE_FOLDER],
    ['FONT', gx_types_1.RES_TYPE_FONT],
    ['COLOR', gx_types_1.RES_TYPE_COLOR],
    ['PIXELMAP', gx_types_1.RES_TYPE_PIXELMAP],
    ['STRING', gx_types_1.RES_TYPE_STRING],
]);
// ---------------------------------------------------------------------------
// Folder-id name mapping (mirrors res_folder_ids[] / res_group_ids[] / res_header_ids[])
// ---------------------------------------------------------------------------
function parseFolderIdForType(resType, name) {
    // res_header_ids
    if (resType === gx_types_1.RES_TYPE_HEADER) {
        if (name === 'THEME_HEADER' || name === '4096')
            return gx_types_1.THEME_HEADER;
        return parseInt(name, 10) || 0;
    }
    // res_group_ids
    if (resType === gx_types_1.RES_TYPE_GROUP) {
        const map = {
            COLOR_GROUP: 4096, FONT_GROUP: 4097, PIXELMAP_GROUP: 4098, STRING_GROUP: 4099,
            '4096': 4096, '4097': 4097, '4098': 4098, '4099': 4099,
        };
        return map[name] ?? (parseInt(name, 10) || 0);
    }
    // res_folder_ids
    if (resType === gx_types_1.RES_TYPE_FOLDER) {
        const map = {
            DEFAULT_COLOR_FOLDER: 4096, CUSTOM_COLOR_FOLDER: 4097,
            DEFAULT_FONT_FOLDER: 4098, CUSTOM_FONT_FOLDER: 4099,
            DEFAULT_PIXELMAP_FOLDER: 4100, CUSTOM_PIXELMAP_FOLDER: 4101,
            '4096': 4096, '4097': 4097, '4098': 4098,
            '4099': 4099, '4100': 4100, '4101': 4101,
        };
        return map[name] ?? (parseInt(name, 10) || 0);
    }
    return 0;
}
// ---------------------------------------------------------------------------
// Screen rotation string mapping (mirrors screen_rotation_list[] in ProjectConfigDlg.cpp)
// ---------------------------------------------------------------------------
function parseRotationAngle(name) {
    const map = {
        None: gx_types_1.GX_SCREEN_ROTATION_NONE,
        CW: gx_types_1.GX_SCREEN_ROTATION_CW,
        CCW: gx_types_1.GX_SCREEN_ROTATION_CCW,
        FLIP: gx_types_1.GX_SCREEN_ROTATION_FLIP,
        '0': gx_types_1.GX_SCREEN_ROTATION_NONE,
        '90': gx_types_1.GX_SCREEN_ROTATION_CW,
        '270': gx_types_1.GX_SCREEN_ROTATION_CCW,
        '180': gx_types_1.GX_SCREEN_ROTATION_FLIP,
    };
    return map[name] ?? gx_types_1.GX_SCREEN_ROTATION_NONE;
}
// ---------------------------------------------------------------------------
// String export type mapping
// ---------------------------------------------------------------------------
function parseStringExportType(name) {
    if (name === 'STRING_EXPORT_TYPE_CSV')
        return 2;
    return gx_types_1.STRING_EXPORT_TYPE_XLIFF; // default
}
// ---------------------------------------------------------------------------
// Colour format for display (derived from bits_per_pix + flags)
// ---------------------------------------------------------------------------
function deriveColorFormat(bits, packed, format_555, format_4444, format_332, _grayscale, reverse) {
    switch (bits) {
        case 1: return gx_types_1.GX_COLOR_FORMAT_MONOCHROME;
        case 4: return gx_types_1.GX_COLOR_FORMAT_4BIT_GRAY;
        case 8:
            if (format_332)
                return gx_types_1.GX_COLOR_FORMAT_8BIT_PACKED_PIXEL;
            return gx_types_1.GX_COLOR_FORMAT_8BIT_PALETTE;
        case 24:
            return packed ? gx_types_1.GX_COLOR_FORMAT_24RGB : gx_types_1.GX_COLOR_FORMAT_24XRGB;
        case 32:
            return reverse ? gx_types_1.GX_COLOR_FORMAT_32BGRA : gx_types_1.GX_COLOR_FORMAT_32ARGB;
        default: { // 16 bpp
            if (format_4444)
                return reverse ? gx_types_1.GX_COLOR_FORMAT_4444BGRA : gx_types_1.GX_COLOR_FORMAT_4444ARGB;
            if (format_555)
                return reverse ? gx_types_1.GX_COLOR_FORMAT_5551BGRX : gx_types_1.GX_COLOR_FORMAT_1555XRGB;
            return reverse ? gx_types_1.GX_COLOR_FORMAT_565BGR : gx_types_1.GX_COLOR_FORMAT_565RGB;
        }
    }
}
// ---------------------------------------------------------------------------
// GxpContext — sequential DOM section traversal
// (mirrors the xml_reader section stack from the C++ implementation)
// ---------------------------------------------------------------------------
/**
 * Wraps a DOM Element and maintains a sequential child-index so that
 * `enterSection()` and `read*()` advance forward through child elements
 * in document order — exactly as the C++ xml_reader section stack does.
 */
class GxpContext {
    constructor(element) {
        this.pos = 0;
        this.children = GxpContext.elementChildren(element);
    }
    /** Enter the next child element with `tagName` and return a new context. */
    enterSection(tagName) {
        for (let i = this.pos; i < this.children.length; i++) {
            if (this.children[i].tagName === tagName) {
                this.pos = i + 1;
                return new GxpContext(this.children[i]);
            }
        }
        return null;
    }
    /**
     * Check whether `tagName` exists without advancing position.
     * Used for the C++ "peek and reset" pattern (CloseSection(FALSE,FALSE)).
     */
    hasSection(tagName) {
        for (let i = this.pos; i < this.children.length; i++) {
            if (this.children[i].tagName === tagName)
                return true;
        }
        return false;
    }
    /** Read the text content of the next child with `tagName`; advance position. */
    readText(tagName) {
        for (let i = this.pos; i < this.children.length; i++) {
            if (this.children[i].tagName === tagName) {
                this.pos = i + 1;
                return this.children[i].textContent ?? null;
            }
        }
        return null;
    }
    readString(tagName, defaultVal = '') {
        return this.readText(tagName)?.trim() ?? defaultVal;
    }
    readInt(tagName, defaultVal = 0) {
        const t = this.readText(tagName);
        if (t === null)
            return defaultVal;
        const v = parseInt(t.trim(), 10);
        return isNaN(v) ? defaultVal : v;
    }
    readUnsigned(tagName, defaultVal = 0) {
        return this.readInt(tagName, defaultVal);
    }
    readBool(tagName, defaultVal = false) {
        const t = this.readText(tagName);
        if (t === null)
            return defaultVal;
        const up = t.trim().toUpperCase();
        return up === 'TRUE' || up === '1';
    }
    readUByte(tagName, defaultVal = 0) {
        const v = this.readInt(tagName, defaultVal);
        return Math.max(0, Math.min(255, v));
    }
    readUShort(tagName, defaultVal = 0) {
        const v = this.readInt(tagName, defaultVal);
        return Math.max(0, Math.min(65535, v));
    }
    readRect(tagName) {
        const sec = this.enterSection(tagName);
        if (sec) {
            return {
                left: sec.readInt('left'),
                top: sec.readInt('top'),
                right: sec.readInt('right'),
                bottom: sec.readInt('bottom'),
            };
        }
        return { left: 0, top: 0, right: 0, bottom: 0 };
    }
    readPathInfo() {
        const sec = this.enterSection('pathinfo');
        if (!sec)
            return (0, res_info_1.createDefaultPathInfo)();
        const pathname = sec.readString('pathname', '');
        const typeStr = sec.readString('pathtype', 'project_relative');
        let pathtype = gx_types_1.PATH_TYPE_PROJECT_RELATIVE;
        if (typeStr === 'studio_relative')
            pathtype = gx_types_1.PATH_TYPE_INSTALL_RELATIVE;
        else if (typeStr === 'absolute')
            pathtype = 2;
        return { pathname, pathtype };
    }
    /** Return a snapshot of current position (for re-reading sections). */
    savePos() { return this.pos; }
    /** Restore a previously saved position. */
    restorePos(saved) { this.pos = saved; }
    static elementChildren(el) {
        const result = [];
        const nodes = el.childNodes;
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes.item(i);
            if (n && n.nodeType === 1 /* ELEMENT_NODE */) {
                result.push(n);
            }
        }
        return result;
    }
}
function makeResDicts() {
    return {
        colors: new Map(),
        fonts: new Map(),
        pixelmaps: new Map([['', 0]]), // index 0 is always empty
        strings: new Map(),
    };
}
function addToResDict(dicts, type, name) {
    let dict;
    switch (type) {
        case gx_types_1.RES_TYPE_COLOR:
            dict = dicts.colors;
            break;
        case gx_types_1.RES_TYPE_FONT:
            dict = dicts.fonts;
            break;
        case gx_types_1.RES_TYPE_PIXELMAP:
            dict = dicts.pixelmaps;
            break;
        case gx_types_1.RES_TYPE_STRING:
            dict = dicts.strings;
            break;
        default: return 0;
    }
    if (dict.has(name))
        return dict.get(name);
    const id = dict.size;
    dict.set(name, id);
    return id;
}
function lookupResId(dicts, type, name) {
    let dict;
    switch (type) {
        case gx_types_1.RES_TYPE_COLOR:
            dict = dicts.colors;
            break;
        case gx_types_1.RES_TYPE_FONT:
            dict = dicts.fonts;
            break;
        case gx_types_1.RES_TYPE_PIXELMAP:
            dict = dicts.pixelmaps;
            break;
        case gx_types_1.RES_TYPE_STRING:
            dict = dicts.strings;
            break;
        default: return 0;
    }
    return dict.get(name) ?? 0;
}
// ---------------------------------------------------------------------------
// GxpReader — main parser class
// ---------------------------------------------------------------------------
let GxpReader = class GxpReader {
    /**
     * Parse a `.gxp` XML file and return the in-memory project model.
     *
     * @param xmlContent  Raw UTF-8 text of the `.gxp` file.
     * @param filePath    Absolute path to the file (for error messages and
     *                    relative-path resolution).
     */
    readProject(xmlContent, filePath) {
        const parser = new xmldom_1.DOMParser();
        const doc = parser.parseFromString(xmlContent, 'application/xml');
        const root = doc.documentElement;
        if (!root || root.tagName !== 'project') {
            throw new GxpParseError(`Not a GUIX Studio project file: ${filePath}`);
        }
        const ctx = new GxpContext(root);
        const header = this.readProjectHeader(ctx);
        if (header.project_version > gx_types_1.PROJECT_VERSION) {
            // Warn but continue — the C++ tool also continues after prompting
            console.warn(`[GxpReader] project_version=${header.project_version} > ` +
                `expected=${gx_types_1.PROJECT_VERSION}. File may be from a newer GUIX Studio.`);
        }
        // Derive project name from file path (match C++ Read() behaviour)
        const baseName = filePath.replace(/\\/g, '/').split('/').pop() ?? '';
        header.project_name = baseName.endsWith('.gxp')
            ? baseName.slice(0, -4)
            : baseName;
        const resDicts = Array.from({ length: gx_types_1.MAX_DISPLAYS }, makeResDicts);
        const displays = [];
        for (let idx = 0; idx < header.max_displays; idx++) {
            const display = this.readDisplayInfo(ctx, idx, header, resDicts[idx] ?? makeResDicts());
            displays.push(display);
        }
        return {
            header,
            displays,
            filePath,
            isModified: false,
        };
    }
    // -------------------------------------------------------------------------
    // ReadProjectHeader
    // -------------------------------------------------------------------------
    readProjectHeader(ctx) {
        const header = this.makeDefaultProjectHeader();
        const sec = ctx.enterSection('header');
        if (!sec)
            return header;
        header.project_version = sec.readInt('project_version', gx_types_1.PROJECT_VERSION);
        header.guix_version = sec.readInt('guix_version', 50000);
        header.studio_version = sec.readInt('studio_version', 5030200);
        // Migrate old guix_version format (pre-5.0): "major * 10 + minor" → vv.mm.pp
        if (header.guix_version < 50000) {
            const major = Math.floor(header.guix_version / 10);
            const minor = header.guix_version - major * 10;
            header.guix_version = major * 1000000 + minor * 1000;
        }
        header.project_name = sec.readString('project_name');
        header.source_path = sec.readString('source_path', '.\\');
        header.header_path = sec.readString('header_path', '.\\');
        header.resource_path = sec.readString('resource_path', '.\\');
        header.malloc_name = sec.readString('allocator_function');
        header.free_name = sec.readString('free_function');
        header.additional_headers = sec.readString('additional_headers');
        header.insert_headers_before = sec.readBool('insert_headers_before');
        header.target_cpu = sec.readInt('target_cpu');
        header.target_tools = sec.readInt('target_tools');
        header.big_endian = sec.readBool('big_endian');
        header.dave2d_graph_accelerator = sec.readBool('dave2d_graph_accelerator') ||
            sec.readBool('synergy_graph_accelerator');
        header.renesas_jpeg_decoder = sec.readInt('renesas_jpeg_decoder', sec.readInt('synergy_jpeg_decoder', 2 /*DECODER_TYPE_HW*/));
        header.renesas_png_decoder = sec.readInt('renesas_png_decoder', sec.readInt('synergy_png_decoder', 0));
        header.grid_enabled = sec.readBool('grid_enabled');
        header.snap_enabled = sec.readBool('snap_enabled');
        header.snap_to_widget_enabled = sec.readBool('snap_to_widget_enabled');
        header.grid_spacing = Math.max(1, Math.min(100, sec.readInt('grid_spacing', 10)));
        header.snap_spacing = Math.max(1, Math.min(100, sec.readInt('snap_spacing', 10)));
        header.gen_binary = sec.readBool('gen_binary');
        header.binary_file_format = sec.readUnsigned('binary_file_format', 0x01);
        header.memory_offset = sec.readUnsigned('memory_offset');
        header.gen_res_header = sec.readBool('gen_res_header', true);
        header.custom_resource_enabled = sec.readBool('custom_resource_enabled');
        header.custom_resource_file_name = sec.readString('custom_resource_file_name');
        header.app_execute_xpos = sec.readInt('app_execute_xpos', 20);
        header.app_execute_ypos = sec.readInt('app_execute_ypos', 20);
        header.is_widget_position_locked = sec.readBool('is_widget_position_locked');
        header.palette_mode_aa_text_colors = sec.readInt('palette_mode_aa_text_colors', 8);
        header.num_displays = Math.max(1, Math.min(gx_types_1.MAX_DISPLAYS, sec.readInt('num_displays', 1)));
        header.max_displays = Math.max(header.num_displays, Math.min(gx_types_1.MAX_DISPLAYS, sec.readInt('max_displays', 4)));
        header.num_languages = Math.max(1, Math.min(gx_types_1.MAX_LANGUAGES, sec.readInt('num_languages', 1)));
        // Language names
        const langSec = sec.enterSection('language_names');
        if (langSec) {
            for (let i = 0; i < header.num_languages; i++) {
                let name = langSec.readString('language', 'English');
                // Strip old "{symbol}" suffix
                const braceIdx = name.lastIndexOf('{');
                if (braceIdx > 0)
                    name = name.slice(0, braceIdx).trimEnd();
                header.languages[i] = {
                    name,
                    support_bidi_text: langSec.readBool('support_bidi_text'),
                    gen_reordered_bidi_text: langSec.readBool('gen_reordered_bidi_text'),
                    support_thai_glyph_shaping: langSec.readBool('support_thai_glyph_shaping'),
                    gen_adjusted_thai_string: langSec.readBool('gen_adjusted_thai_string'),
                    statically_defined: langSec.readBool('statically_defined', true),
                };
            }
        }
        // String export section (may be named "string_export" or legacy "xliff")
        const expSec = sec.enterSection('string_export') ?? sec.enterSection('xliff');
        if (expSec) {
            header.string_export_src = expSec.readInt('string_export_src') ||
                expSec.readInt('xliff_src');
            header.string_export_target = expSec.readInt('string_export_target') ||
                expSec.readInt('xliff_target');
            header.string_export_version = expSec.readInt('string_export_version') ||
                expSec.readInt('xliff_version');
            header.string_export_path = expSec.readString('string_export_path') ||
                expSec.readString('xliff_path', '.\\');
            header.string_export_filename = expSec.readString('string_export_name') ||
                expSec.readString('xliff_name');
            const typeStr = expSec.readString('string_export_filetype');
            header.string_export_filetype = parseStringExportType(typeStr);
        }
        return header;
    }
    // -------------------------------------------------------------------------
    // ReadDisplayInfo
    // -------------------------------------------------------------------------
    readDisplayInfo(ctx, index, header, dicts) {
        const display = this.makeDefaultDisplayInfo(index, header.num_languages);
        const sec = ctx.enterSection('display_info');
        if (!sec)
            return display;
        const openIndex = sec.readInt('display_index', index);
        if (openIndex !== index)
            return display;
        display.name = sec.readString('display_name', display.name);
        let xres = sec.readInt('xres', 320);
        let yres = sec.readInt('yres', 240);
        if (xres <= 0 || xres > 65535)
            xres = 320;
        if (yres <= 0 || yres > 65535)
            yres = 240;
        display.xres = xres;
        display.yres = yres;
        display.bits_per_pix = sec.readInt('bits_per_pix', 16);
        display.packed_format = sec.readBool('packed_format');
        display.format_555 = sec.readBool('format_555');
        display.format_4444 = sec.readBool('format_4444');
        display.format_332 = sec.readBool('format_332');
        display.grayscale = sec.readBool('grayscale');
        display.reverse_order = sec.readBool('reverse_order');
        display.enabled = sec.readBool('enabled', true);
        const rotStr = sec.readString('rotation_angle', 'None');
        display.rotation_angle = parseRotationAngle(rotStr);
        display.default_map_format = sec.readBool('default_map_format', true);
        display.allocate_canvas = sec.readBool('allocate_canvas', true);
        display.colorformat = deriveColorFormat(display.bits_per_pix, display.packed_format, display.format_555, display.format_4444, display.format_332, display.grayscale, display.reverse_order);
        // Theme info
        const themeSec = sec.enterSection('theme_info');
        if (themeSec) {
            display.num_themes = Math.max(1, Math.min(gx_types_1.MAX_THEMES, themeSec.readInt('num_themes', 1)));
            display.active_theme = themeSec.readInt('active_theme', gx_types_1.DEFAULT_THEME);
            if (display.active_theme < 0 || display.active_theme >= display.num_themes) {
                display.active_theme = gx_types_1.DEFAULT_THEME;
            }
            for (let t = 0; t < display.num_themes; t++) {
                const theme = display.themes[t];
                theme.theme_name = themeSec.readString('theme_name', theme.theme_name);
                theme.gen_color_table = themeSec.readBool('gen_color_table', true);
                theme.gen_font_table = themeSec.readBool('gen_font_table', true);
                theme.gen_pixelmap_table = themeSec.readBool('gen_pixelmap_table', true);
                theme.enabled = themeSec.readBool('enabled', true);
                theme.statically_defined = themeSec.readBool('statically_defined', true);
                const themeData = themeSec.enterSection('theme_data');
                if (themeData) {
                    if (header.project_version >= 53) {
                        this.readResources(themeData, index, t, display, header, dicts);
                    }
                    this.readThemeScrollbars(themeData, theme);
                    this.readThemePaletteInfo(themeData, theme);
                    if (header.project_version <= 52) {
                        this.readResources(themeData, index, t, display, header, dicts);
                    }
                }
            }
        }
        // Per-language string table gen flags
        for (let lang = 0; lang < header.num_languages; lang++) {
            const langName = header.languages[lang]?.name ?? `lang_${lang}`;
            // C++ reads bool by language name — must scan sequentially
            const flag = sec.readBool(langName, true);
            display.gen_string_table[lang] = flag;
        }
        // String table, screen flow, widget folders
        if (header.project_version <= 52) {
            this.readWidgetFolders(sec, display, header, dicts);
            this.readResources(sec, index, 0, display, header, dicts);
            this.readStringTable(sec, display, header);
        }
        else {
            this.readStringTable(sec, display, header);
            this.readScreenFlow(sec, display);
            this.readWidgetFolders(sec, display, header, dicts);
        }
        return display;
    }
    // -------------------------------------------------------------------------
    // ReadThemeScrollbars
    // -------------------------------------------------------------------------
    readThemeScrollbars(sec, theme) {
        const vSec = sec.enterSection('vscroll_appearance');
        if (vSec) {
            theme.vscroll_appearance = this.readScrollbarAppearance(vSec);
            theme.vscroll_style = vSec.readUnsigned('scroll_style', theme.vscroll_style);
        }
        const hSec = sec.enterSection('hscroll_appearance');
        if (hSec) {
            theme.hscroll_appearance = this.readScrollbarAppearance(hSec);
            theme.hscroll_style = hSec.readUnsigned('scroll_style', theme.hscroll_style);
        }
    }
    readScrollbarAppearance(sec) {
        return {
            gx_scroll_width: sec.readInt('gx_scroll_width', 20),
            gx_scroll_thumb_width: sec.readInt('gx_scroll_thumb_width', 18),
            gx_scroll_thumb_travel_min: sec.readInt('gx_scroll_thumb_travel_min', 20),
            gx_scroll_thumb_travel_max: sec.readInt('gx_scroll_thumb_travel_max', 20),
            gx_scroll_thumb_border_style: sec.readUnsigned('gx_scroll_thumb_border_style', 0),
            gx_scroll_fill_pixelmap: sec.readUnsigned('gx_scroll_fill_pixelmap', 0),
            gx_scroll_thumb_pixelmap: sec.readUnsigned('gx_scroll_thumb_pixelmap', 0),
            gx_scroll_up_pixelmap: sec.readUnsigned('gx_scroll_up_pixelmap', 0),
            gx_scroll_down_pixelmap: sec.readUnsigned('gx_scroll_down_pixelmap', 0),
            gx_scroll_thumb_color: sec.readUnsigned('gx_scroll_thumb_color', 0),
            gx_scroll_thumb_border_color: sec.readUnsigned('gx_scroll_thumb_border_color', 0),
            gx_scroll_button_color: sec.readUnsigned('gx_scroll_button_color', 0),
        };
    }
    // -------------------------------------------------------------------------
    // ReadThemePaletteInfo
    // -------------------------------------------------------------------------
    readThemePaletteInfo(sec, theme) {
        const palSec = sec.enterSection('palette');
        if (!palSec) {
            theme.palette = [];
            theme.palette_total_size = 0;
            theme.palette_predefined = 0;
            return;
        }
        let totalSize = palSec.readInt('total_size', 0);
        if (totalSize > 256)
            totalSize = 256;
        let predefined = palSec.readInt('predefined', totalSize);
        if (predefined > totalSize)
            predefined = totalSize;
        if (predefined < 0)
            predefined = 0;
        theme.palette_total_size = totalSize;
        theme.palette_predefined = predefined;
        theme.palette = [];
        for (let i = 0; i < predefined; i++) {
            let color = palSec.readUnsigned('rgb', 0);
            // Old projects did not store alpha; default to 0xFF
            if (color >>> 24 === 0)
                color = (color | 0xFF000000) >>> 0;
            theme.palette.push(color);
        }
    }
    // -------------------------------------------------------------------------
    // ReadResources
    // -------------------------------------------------------------------------
    readResources(sec, _displayIndex, themeIndex, display, header, dicts, parent) {
        let resSec;
        while ((resSec = sec.enterSection('resource')) !== null) {
            const typeName = resSec.readString('type');
            const resType = RES_TYPE_NAME_MAP.get(typeName);
            if (resType === undefined) {
                // unknown type; skip but still recurse in case children are valid
                this.readResources(resSec, _displayIndex, themeIndex, display, header, dicts, undefined);
                continue;
            }
            const res = (0, res_info_1.createDefaultResInfo)(resType);
            this.readOneResource(resSec, display, header, dicts, res);
            // Attach add-item children for custom folders
            if (resType === gx_types_1.RES_TYPE_FOLDER) {
                switch (res.folder_id) {
                    case gx_types_1.CUSTOM_COLOR_FOLDER:
                        res.children.push((0, res_info_1.createDefaultResInfo)(gx_types_1.RES_TYPE_ADD_COLOR));
                        break;
                    case gx_types_1.CUSTOM_FONT_FOLDER:
                        res.children.push((0, res_info_1.createDefaultResInfo)(gx_types_1.RES_TYPE_ADD_FONT));
                        break;
                    case gx_types_1.CUSTOM_PIXELMAP_FOLDER:
                        res.children.push((0, res_info_1.createDefaultResInfo)(gx_types_1.RES_TYPE_ADD_PIXELMAP));
                        break;
                    default: break;
                }
            }
            else if (resType === gx_types_1.RES_TYPE_GROUP && res.folder_id === gx_types_1.STRING_GROUP) {
                res.children.push((0, res_info_1.createDefaultResInfo)(gx_types_1.RES_TYPE_ADD_STRING));
            }
            if (parent) {
                parent.children.push(res);
            }
            else {
                // Root-level resource: append to this theme's resources
                display.themes[themeIndex].resources.push(res);
            }
            // Recurse into child resources
            this.readResources(resSec, _displayIndex, themeIndex, display, header, dicts, res);
        }
        // If no theme header was created as first resource, inject one
        if (!parent && display.themes[themeIndex].resources.length > 0) {
            const first = display.themes[themeIndex].resources[0];
            if (first.type !== gx_types_1.RES_TYPE_HEADER || first.folder_id !== gx_types_1.THEME_HEADER) {
                const hdr = (0, res_info_1.createDefaultResInfo)(gx_types_1.RES_TYPE_HEADER);
                hdr.folder_id = gx_types_1.THEME_HEADER;
                hdr.name = display.themes[themeIndex].theme_name;
                display.themes[themeIndex].resources.unshift(hdr);
            }
        }
    }
    readOneResource(sec, display, header, dicts, res) {
        res.name = sec.readString('name');
        res.pathinfo = sec.readPathInfo();
        if (header.project_version <= 52) {
            const resId = sec.readInt('resource_id', -1);
            if (res.type === gx_types_1.RES_TYPE_FOLDER || res.type === gx_types_1.RES_TYPE_HEADER ||
                res.type === gx_types_1.RES_TYPE_GROUP) {
                res.folder_id = resId;
            }
        }
        else {
            const folderIdStr = sec.readString('folder_id', '');
            res.folder_id = parseFolderIdForType(res.type, folderIdStr);
        }
        res.is_default = sec.readBool('is_default');
        res.enabled = sec.readBool('enabled', true);
        switch (res.type) {
            case gx_types_1.RES_TYPE_COLOR: {
                res.colorval = sec.readUnsigned('colorval', 0);
                res.compress = false;
                addToResDict(dicts, gx_types_1.RES_TYPE_COLOR, res.name);
                break;
            }
            case gx_types_1.RES_TYPE_FONT: {
                res.font_height = Math.max(1, Math.min(255, sec.readInt('height', 0)));
                res.font_bits = sec.readInt('font_bits', 8);
                if (![1, 4, 8].includes(res.font_bits))
                    res.font_bits = 8;
                res.font_charset_include_string_table = sec.readBool('font_include_st_glyphs');
                res.font_support_extended_unicode = sec.readBool('font_support_extended_unicode');
                res.font_kerning = sec.readBool('font_kerning');
                res.compress = sec.readBool('compress');
                res.output_file_enabled = sec.readBool('output_file_enabled');
                res.output_file = sec.readString('output_file');
                res.binary_mode = sec.readBool('binary_mode');
                let pageCount = gx_types_1.NUM_FONT_CHAR_RANGES;
                if (res.font_support_extended_unicode) {
                    pageCount += gx_types_1.NUM_FONT_EXTENDED_CHAR_RANGES;
                }
                // Create default font pages
                res.font_pages = Array.from({ length: pageCount }, () => ({
                    enabled: false,
                    first_char: 0,
                    last_char: 0,
                }));
                const fpDataSec = sec.enterSection('font_page_data');
                if (fpDataSec) {
                    for (let i = 0; i < pageCount; i++) {
                        res.font_pages[i].enabled = fpDataSec.readBool('enabled');
                        res.font_pages[i].first_char = fpDataSec.readInt('first_char', 0);
                        res.font_pages[i].last_char = fpDataSec.readInt('last_char', 0);
                    }
                }
                else {
                    // Very old format: firstchar / lastchar as direct children
                    res.font_pages[0].enabled = true;
                    res.font_pages[0].first_char = sec.readInt('firstchar', 0x20);
                    res.font_pages[0].last_char = sec.readInt('lastchar', 0x7E);
                }
                addToResDict(dicts, gx_types_1.RES_TYPE_FONT, res.name);
                break;
            }
            case gx_types_1.RES_TYPE_PIXELMAP: {
                res.keep_alpha = sec.readBool('alpha');
                res.dither = sec.readBool('dither');
                res.raw = sec.readBool('raw');
                res.compress = sec.readBool('compress');
                if (header.project_version >= 50 /* PROJECT_VERSION_WRITE_COLOR_FORMAT_NAME */) {
                    const cfName = sec.readString('color_format', '');
                    res.output_color_format = this.parseColorFormatName(cfName);
                }
                else {
                    res.output_color_format = sec.readInt('color_format', 0);
                }
                res.output_file_enabled = sec.readBool('output_file_enabled');
                res.output_file = sec.readString('output_file');
                res.binary_mode = sec.readBool('binary_mode');
                res.palette_type = this.readPaletteType(sec, display.colorformat, res.output_color_format);
                // Sanity-check output_color_format
                if (res.output_color_format < 0 || res.output_color_format > 50) {
                    res.output_color_format = 0;
                }
                addToResDict(dicts, gx_types_1.RES_TYPE_PIXELMAP, res.name);
                break;
            }
            default:
                break;
        }
    }
    readPaletteType(sec, displayColorFormat, outputColorFormat) {
        if (displayColorFormat === gx_types_1.GX_COLOR_FORMAT_8BIT_PALETTE) {
            return gx_types_1.PALETTE_TYPE_SHARED;
        }
        if (outputColorFormat !== gx_types_1.GX_COLOR_FORMAT_8BIT_PALETTE) {
            return gx_types_1.PALETTE_TYPE_NONE;
        }
        const str = sec.readString('palette_type', '');
        if (str === 'Private')
            return gx_types_1.PALETTE_TYPE_PRIVATE;
        if (str === 'Shared')
            return gx_types_1.PALETTE_TYPE_SHARED;
        // Backward compat: numeric
        if (str === '0')
            return gx_types_1.PALETTE_TYPE_PRIVATE;
        if (str === '1' || str === '2')
            return gx_types_1.PALETTE_TYPE_SHARED;
        return gx_types_1.PALETTE_TYPE_NONE;
    }
    parseColorFormatName(name) {
        // Minimal mapping for common formats written by resource_gen::GetColorFormatName
        const map = {
            GX_COLOR_FORMAT_MONOCHROME: gx_types_1.GX_COLOR_FORMAT_MONOCHROME,
            GX_COLOR_FORMAT_4BIT_GRAY: gx_types_1.GX_COLOR_FORMAT_4BIT_GRAY,
            GX_COLOR_FORMAT_8BIT_PALETTE: gx_types_1.GX_COLOR_FORMAT_8BIT_PALETTE,
            GX_COLOR_FORMAT_565RGB: gx_types_1.GX_COLOR_FORMAT_565RGB,
            GX_COLOR_FORMAT_565BGR: gx_types_1.GX_COLOR_FORMAT_565BGR,
            GX_COLOR_FORMAT_1555XRGB: gx_types_1.GX_COLOR_FORMAT_1555XRGB,
            GX_COLOR_FORMAT_5551BGRX: gx_types_1.GX_COLOR_FORMAT_5551BGRX,
            GX_COLOR_FORMAT_4444ARGB: gx_types_1.GX_COLOR_FORMAT_4444ARGB,
            GX_COLOR_FORMAT_4444BGRA: gx_types_1.GX_COLOR_FORMAT_4444BGRA,
            GX_COLOR_FORMAT_24RGB: gx_types_1.GX_COLOR_FORMAT_24RGB,
            GX_COLOR_FORMAT_24XRGB: gx_types_1.GX_COLOR_FORMAT_24XRGB,
            GX_COLOR_FORMAT_32ARGB: gx_types_1.GX_COLOR_FORMAT_32ARGB,
            GX_COLOR_FORMAT_32BGRA: gx_types_1.GX_COLOR_FORMAT_32BGRA,
        };
        return map[name] ?? 0;
    }
    // -------------------------------------------------------------------------
    // ReadStringTable
    // -------------------------------------------------------------------------
    readStringTable(sec, display, _header) {
        display.string_entries = [];
        const stSec = sec.enterSection('string_table');
        if (!stSec)
            return;
        const numStrings = Math.max(1, Math.min(65535, stSec.readInt('num_strings', 1)));
        const numLanguages = Math.max(1, Math.min(gx_types_1.MAX_LANGUAGES, stSec.readInt('num_languages', 1)));
        // String indices are 1-based (index 0 is reserved/null)
        for (let idx = 1; idx < numStrings; idx++) {
            const recSec = stSec.enterSection('string_record');
            if (!recSec)
                break;
            const idName = recSec.readString('id', `STRING_${idx}`);
            void recSec.readInt('font', 0); // advance position; value stored in StringEntry if needed
            void recSec.readString('notes', ''); // advance position
            const translations = [];
            for (let lang = 0; lang < numLanguages; lang++) {
                translations.push(recSec.readString('val', ''));
            }
            display.string_entries.push({ string_id: idx, name: idName, translations });
            // Register in string dictionary (for widget ID resolution)
            // Note: string IDs are managed by the string_table separately
        }
    }
    // -------------------------------------------------------------------------
    // ReadScreenFlow
    // -------------------------------------------------------------------------
    readScreenFlow(sec, display) {
        display.screen_flow = [];
        const flowSec = sec.enterSection('screen_flow');
        if (!flowSec)
            return;
        let item;
        while ((item = flowSec.enterSection('flow_item')) !== null) {
            const screenName = item.readString('screen_name');
            const triggers = [];
            let trigSec;
            while ((trigSec = item.enterSection('trigger_info')) !== null) {
                // Store raw trigger data; full parsing is in screen-flow-editor.ts
                triggers.push(this.readTriggerInfo(trigSec));
            }
            display.screen_flow.push({ screen_name: screenName, trigger_list: triggers });
        }
    }
    readTriggerInfo(sec) {
        // Read trigger structure; typed detail in screen-flow-model.ts
        const trigger_name = sec.readString('trigger_name');
        const signal_id_name = sec.readString('signal_id_name');
        const trigger_type = sec.readString('trigger_type');
        const event_type = sec.readString('event_type');
        const system_event_animat_id = sec.readString('system_event_animat_id_name');
        const user_event_id = sec.readString('user_event_id_name');
        const actions = [];
        const actionListSec = sec.enterSection('action_list');
        if (actionListSec) {
            let actionSec;
            while ((actionSec = actionListSec.enterSection('action_info')) !== null) {
                actions.push(this.readActionInfo(actionSec));
            }
        }
        return {
            trigger_name, signal_id_name, trigger_type, event_type,
            system_event_animat_id, user_event_id, actions,
        };
    }
    readActionInfo(sec) {
        const action_name = sec.readString('action_name');
        const action_type = sec.readString('action_type');
        const target_widget_name = sec.readString('target_widget_name');
        const parent_widget_name = sec.readString('parent_widget_name');
        const animation_id_name = sec.readString('animation_id_name');
        const target_show_children = sec.readBool('target_show_child_widgets');
        const parent_show_children = sec.readBool('parent_show_child_widgets');
        let animation = null;
        const animSec = sec.enterSection('animation_info');
        if (animSec) {
            animation = {
                start_x: animSec.readInt('start_x'),
                start_y: animSec.readInt('start_y'),
                end_x: animSec.readInt('end_x'),
                end_y: animSec.readInt('end_y'),
                steps: animSec.readUByte('steps', 0),
                frame_interval: animSec.readUShort('frame_interval', animSec.readUShort('delay_time', 0)),
                start_delay: animSec.readUShort('start_delay', animSec.readUShort('delay_before', 0)),
                start_alpha: animSec.readUByte('start_alpha', 255),
                end_alpha: animSec.readUByte('end_alpha', 255),
                detach_target: animSec.readBool('detach_target'),
                push_target: animSec.readBool('push_target'),
                easing_func: animSec.readString('easing_func_id_name'),
            };
        }
        return {
            action_name, action_type, target_widget_name, parent_widget_name,
            animation_id_name, target_show_children, parent_show_children, animation,
        };
    }
    // -------------------------------------------------------------------------
    // ReadWidgetFolders / ReadWidgets
    // -------------------------------------------------------------------------
    readWidgetFolders(sec, display, header, dicts) {
        display.folders = [];
        if (!sec.hasSection('widget_folder')) {
            // Old format: no folder wrapper — create a default folder
            const folder = {
                folder_name: 'default_folder',
                output_filename: '',
                widgets: [],
            };
            display.folders.push(folder);
            this.readWidgets(sec, folder, header, dicts);
            return;
        }
        let folderSec;
        while ((folderSec = sec.enterSection('widget_folder')) !== null) {
            const folder = {
                folder_name: folderSec.readString('folder_name', 'default_folder'),
                output_filename: folderSec.readString('specified_output_name', ''),
                widgets: [],
            };
            display.folders.push(folder);
            this.readWidgets(folderSec, folder, header, dicts);
        }
    }
    readWidgets(sec, folder, header, dicts) {
        let widgetSec;
        while ((widgetSec = sec.enterSection('widget')) !== null) {
            const widget = this.readOneWidget(widgetSec, header, dicts);
            if (widget) {
                this.readChildWidgets(widgetSec, widget, header, dicts);
                folder.widgets.push(widget);
            }
        }
    }
    readChildWidgets(sec, parent, header, dicts) {
        let childSec;
        while ((childSec = sec.enterSection('widget')) !== null) {
            const widget = this.readOneWidget(childSec, header, dicts);
            if (widget) {
                this.readChildWidgets(childSec, widget, header, dicts);
                parent.children.push(widget);
            }
        }
    }
    /**
     * Read one widget from the "widget" section.
     * Mirrors widget_reader::ReadOneWidget() + widget_service_provider::ReadFromProject().
     */
    readOneWidget(sec, header, dicts) {
        const typeName = sec.readString('type', 'widget');
        const widgetType = WIDGET_NAME_TO_TYPE.get(typeName);
        if (widgetType === undefined)
            return null;
        const info = (0, widget_info_1.createDefaultWidgetInfo)(widgetType);
        info.base_name = typeName;
        // Base widget_service_provider::ReadFromProject
        info.app_name = sec.readString('app_name');
        info.size = sec.readRect('size');
        info.style = sec.readUnsigned('style', 0);
        info.allocation = sec.readInt('allocation', gx_types_1.STATICALLY_ALLOCATED);
        info.accepts_focus = sec.readBool('accepts_focus', true);
        // Color resource IDs (version 53+: stored as names; older: raw integers)
        info.color_id[0] = this.readResourceId(sec, header, dicts, gx_types_1.RES_TYPE_COLOR, 'normal_fill_color');
        info.color_id[1] = this.readResourceId(sec, header, dicts, gx_types_1.RES_TYPE_COLOR, 'selected_fill_color');
        if (header.project_version > 54) {
            info.color_id[2] = this.readResourceId(sec, header, dicts, gx_types_1.RES_TYPE_COLOR, 'disabled_fill_color');
        }
        else {
            info.color_id[2] = info.color_id[0];
        }
        info.event_func = sec.readString('event_handler');
        info.draw_func = sec.readString('draw_func');
        info.id_name = sec.readString('id_name');
        info.custom_name = sec.readString('custom_name');
        info.user_data = sec.readString('user_data');
        info.is_template = sec.readBool('template');
        info.visible_at_startup = sec.readBool('visible_at_startup', true);
        // Note: widget-type-specific fields are read in the WidgetService implementations
        // (src/widgets/*-service.ts). Those services call readWidgetExtended(sec, info).
        return info;
    }
    /**
     * Read a resource ID field.  Version > 52: stored as a resource name string.
     * Version ≤ 52: stored as a raw unsigned integer.
     */
    readResourceId(sec, header, dicts, resType, tagName) {
        if (header.project_version <= 52) {
            return sec.readUnsigned(tagName, 0);
        }
        const name = sec.readString(tagName, '');
        return lookupResId(dicts, resType, name);
    }
    // -------------------------------------------------------------------------
    // Factory helpers
    // -------------------------------------------------------------------------
    makeDefaultProjectHeader() {
        return {
            project_version: gx_types_1.PROJECT_VERSION,
            guix_version: 0,
            studio_version: 0,
            project_name: '',
            project_path: '',
            source_path: '.\\',
            header_path: '.\\',
            resource_path: '.\\',
            malloc_name: '',
            free_name: '',
            additional_headers: '',
            insert_headers_before: false,
            num_displays: 1,
            max_displays: gx_types_1.MAX_DISPLAYS,
            num_languages: 1,
            target_cpu: 0,
            target_tools: 0,
            big_endian: false,
            languages: Array.from({ length: gx_types_1.MAX_LANGUAGES }, (_, i) => ({
                name: i === 0 ? 'English' : '',
                support_bidi_text: false,
                gen_reordered_bidi_text: false,
                support_thai_glyph_shaping: false,
                gen_adjusted_thai_string: false,
                statically_defined: true,
            })),
            string_export_src: 0,
            string_export_target: 1,
            string_export_version: 2,
            string_export_path: '.\\',
            string_export_filename: '',
            string_export_filetype: gx_types_1.STRING_EXPORT_TYPE_XLIFF,
            warn_missing_image: false,
            warn_missing_font: false,
            dave2d_graph_accelerator: false,
            renesas_png_decoder: 0,
            renesas_jpeg_decoder: 2,
            grid_enabled: false,
            snap_enabled: false,
            snap_to_widget_enabled: false,
            grid_spacing: 10,
            snap_spacing: 10,
            gen_binary: false,
            gen_res_header: true,
            binary_file_format: 0x01,
            memory_offset: 0,
            custom_resource_enabled: false,
            custom_resource_file_name: '',
            app_execute_xpos: 20,
            app_execute_ypos: 20,
            is_widget_position_locked: false,
            palette_mode_aa_text_colors: 8,
        };
    }
    makeDefaultDisplayInfo(index, numLanguages) {
        const themes = Array.from({ length: gx_types_1.MAX_THEMES }, (_, t) => ({
            theme_name: `theme_${t + 1}`,
            vscroll_appearance: this.makeDefaultScrollbarAppearance(),
            hscroll_appearance: this.makeDefaultScrollbarAppearance(),
            vscroll_style: 0,
            hscroll_style: 0,
            palette: [],
            palette_total_size: 0,
            palette_predefined: 0,
            gen_color_table: true,
            gen_font_table: true,
            gen_pixelmap_table: true,
            enabled: true,
            statically_defined: true,
            resources: [],
        }));
        return {
            name: `display_${index + 1}`,
            xres: 320,
            yres: 240,
            bits_per_pix: 16,
            packed_format: false,
            format_555: false,
            format_4444: false,
            format_332: false,
            grayscale: false,
            reverse_order: false,
            allocate_canvas: true,
            enabled: true,
            rotation_angle: gx_types_1.GX_SCREEN_ROTATION_NONE,
            default_map_format: true,
            colorformat: gx_types_1.GX_COLOR_FORMAT_565RGB,
            num_themes: 1,
            active_theme: gx_types_1.DEFAULT_THEME,
            themes,
            gen_string_table: Array(numLanguages).fill(true),
            string_entries: [],
            screen_flow: [],
            folders: [],
        };
    }
    makeDefaultScrollbarAppearance() {
        return {
            gx_scroll_width: 20,
            gx_scroll_thumb_width: 18,
            gx_scroll_thumb_travel_min: 20,
            gx_scroll_thumb_travel_max: 20,
            gx_scroll_thumb_border_style: 0,
            gx_scroll_fill_pixelmap: 0,
            gx_scroll_thumb_pixelmap: 0,
            gx_scroll_up_pixelmap: 0,
            gx_scroll_down_pixelmap: 0,
            gx_scroll_thumb_color: 0,
            gx_scroll_thumb_border_color: 0,
            gx_scroll_button_color: 0,
        };
    }
};
exports.GxpReader = GxpReader;
exports.GxpReader = GxpReader = __decorate([
    (0, inversify_1.injectable)()
], GxpReader);


/***/ }),
/* 84 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

var dom = __webpack_require__(85)
exports.DOMImplementation = dom.DOMImplementation
exports.XMLSerializer = dom.XMLSerializer
exports.DOMParser = __webpack_require__(87).DOMParser


/***/ }),
/* 85 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

var conventions = __webpack_require__(86);

var find = conventions.find;
var NAMESPACE = conventions.NAMESPACE;

/**
 * A prerequisite for `[].filter`, to drop elements that are empty
 * @param {string} input
 * @returns {boolean}
 */
function notEmptyString (input) {
	return input !== ''
}
/**
 * @see https://infra.spec.whatwg.org/#split-on-ascii-whitespace
 * @see https://infra.spec.whatwg.org/#ascii-whitespace
 *
 * @param {string} input
 * @returns {string[]} (can be empty)
 */
function splitOnASCIIWhitespace(input) {
	// U+0009 TAB, U+000A LF, U+000C FF, U+000D CR, U+0020 SPACE
	return input ? input.split(/[\t\n\f\r ]+/).filter(notEmptyString) : []
}

/**
 * Adds element as a key to current if it is not already present.
 *
 * @param {Record<string, boolean | undefined>} current
 * @param {string} element
 * @returns {Record<string, boolean | undefined>}
 */
function orderedSetReducer (current, element) {
	if (!current.hasOwnProperty(element)) {
		current[element] = true;
	}
	return current;
}

/**
 * @see https://infra.spec.whatwg.org/#ordered-set
 * @param {string} input
 * @returns {string[]}
 */
function toOrderedSet(input) {
	if (!input) return [];
	var list = splitOnASCIIWhitespace(input);
	return Object.keys(list.reduce(orderedSetReducer, {}))
}

/**
 * Uses `list.indexOf` to implement something like `Array.prototype.includes`,
 * which we can not rely on being available.
 *
 * @param {any[]} list
 * @returns {function(any): boolean}
 */
function arrayIncludes (list) {
	return function(element) {
		return list && list.indexOf(element) !== -1;
	}
}

function copy(src,dest){
	for(var p in src){
		if (Object.prototype.hasOwnProperty.call(src, p)) {
			dest[p] = src[p];
		}
	}
}

/**
^\w+\.prototype\.([_\w]+)\s*=\s*((?:.*\{\s*?[\r\n][\s\S]*?^})|\S.*?(?=[;\r\n]));?
^\w+\.prototype\.([_\w]+)\s*=\s*(\S.*?(?=[;\r\n]));?
 */
function _extends(Class,Super){
	var pt = Class.prototype;
	if(!(pt instanceof Super)){
		function t(){};
		t.prototype = Super.prototype;
		t = new t();
		copy(pt,t);
		Class.prototype = pt = t;
	}
	if(pt.constructor != Class){
		if(typeof Class != 'function'){
			console.error("unknown Class:"+Class)
		}
		pt.constructor = Class
	}
}

// Node Types
var NodeType = {}
var ELEMENT_NODE                = NodeType.ELEMENT_NODE                = 1;
var ATTRIBUTE_NODE              = NodeType.ATTRIBUTE_NODE              = 2;
var TEXT_NODE                   = NodeType.TEXT_NODE                   = 3;
var CDATA_SECTION_NODE          = NodeType.CDATA_SECTION_NODE          = 4;
var ENTITY_REFERENCE_NODE       = NodeType.ENTITY_REFERENCE_NODE       = 5;
var ENTITY_NODE                 = NodeType.ENTITY_NODE                 = 6;
var PROCESSING_INSTRUCTION_NODE = NodeType.PROCESSING_INSTRUCTION_NODE = 7;
var COMMENT_NODE                = NodeType.COMMENT_NODE                = 8;
var DOCUMENT_NODE               = NodeType.DOCUMENT_NODE               = 9;
var DOCUMENT_TYPE_NODE          = NodeType.DOCUMENT_TYPE_NODE          = 10;
var DOCUMENT_FRAGMENT_NODE      = NodeType.DOCUMENT_FRAGMENT_NODE      = 11;
var NOTATION_NODE               = NodeType.NOTATION_NODE               = 12;

// ExceptionCode
var ExceptionCode = {}
var ExceptionMessage = {};
var INDEX_SIZE_ERR              = ExceptionCode.INDEX_SIZE_ERR              = ((ExceptionMessage[1]="Index size error"),1);
var DOMSTRING_SIZE_ERR          = ExceptionCode.DOMSTRING_SIZE_ERR          = ((ExceptionMessage[2]="DOMString size error"),2);
var HIERARCHY_REQUEST_ERR       = ExceptionCode.HIERARCHY_REQUEST_ERR       = ((ExceptionMessage[3]="Hierarchy request error"),3);
var WRONG_DOCUMENT_ERR          = ExceptionCode.WRONG_DOCUMENT_ERR          = ((ExceptionMessage[4]="Wrong document"),4);
var INVALID_CHARACTER_ERR       = ExceptionCode.INVALID_CHARACTER_ERR       = ((ExceptionMessage[5]="Invalid character"),5);
var NO_DATA_ALLOWED_ERR         = ExceptionCode.NO_DATA_ALLOWED_ERR         = ((ExceptionMessage[6]="No data allowed"),6);
var NO_MODIFICATION_ALLOWED_ERR = ExceptionCode.NO_MODIFICATION_ALLOWED_ERR = ((ExceptionMessage[7]="No modification allowed"),7);
var NOT_FOUND_ERR               = ExceptionCode.NOT_FOUND_ERR               = ((ExceptionMessage[8]="Not found"),8);
var NOT_SUPPORTED_ERR           = ExceptionCode.NOT_SUPPORTED_ERR           = ((ExceptionMessage[9]="Not supported"),9);
var INUSE_ATTRIBUTE_ERR         = ExceptionCode.INUSE_ATTRIBUTE_ERR         = ((ExceptionMessage[10]="Attribute in use"),10);
//level2
var INVALID_STATE_ERR        	= ExceptionCode.INVALID_STATE_ERR        	= ((ExceptionMessage[11]="Invalid state"),11);
var SYNTAX_ERR               	= ExceptionCode.SYNTAX_ERR               	= ((ExceptionMessage[12]="Syntax error"),12);
var INVALID_MODIFICATION_ERR 	= ExceptionCode.INVALID_MODIFICATION_ERR 	= ((ExceptionMessage[13]="Invalid modification"),13);
var NAMESPACE_ERR            	= ExceptionCode.NAMESPACE_ERR           	= ((ExceptionMessage[14]="Invalid namespace"),14);
var INVALID_ACCESS_ERR       	= ExceptionCode.INVALID_ACCESS_ERR      	= ((ExceptionMessage[15]="Invalid access"),15);

/**
 * DOM Level 2
 * Object DOMException
 * @see http://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/ecma-script-binding.html
 * @see http://www.w3.org/TR/REC-DOM-Level-1/ecma-script-language-binding.html
 */
function DOMException(code, message) {
	if(message instanceof Error){
		var error = message;
	}else{
		error = this;
		Error.call(this, ExceptionMessage[code]);
		this.message = ExceptionMessage[code];
		if(Error.captureStackTrace) Error.captureStackTrace(this, DOMException);
	}
	error.code = code;
	if(message) this.message = this.message + ": " + message;
	return error;
};
DOMException.prototype = Error.prototype;
copy(ExceptionCode,DOMException)

/**
 * @see http://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/core.html#ID-536297177
 * The NodeList interface provides the abstraction of an ordered collection of nodes, without defining or constraining how this collection is implemented. NodeList objects in the DOM are live.
 * The items in the NodeList are accessible via an integral index, starting from 0.
 */
function NodeList() {
};
NodeList.prototype = {
	/**
	 * The number of nodes in the list. The range of valid child node indices is 0 to length-1 inclusive.
	 * @standard level1
	 */
	length:0,
	/**
	 * Returns the indexth item in the collection. If index is greater than or equal to the number of nodes in the list, this returns null.
	 * @standard level1
	 * @param index  unsigned long
	 *   Index into the collection.
	 * @return Node
	 * 	The node at the indexth position in the NodeList, or null if that is not a valid index.
	 */
	item: function(index) {
		return index >= 0 && index < this.length ? this[index] : null;
	},
	toString:function(isHTML,nodeFilter,options){
		var requireWellFormed = !!options && !!options.requireWellFormed;
		for(var buf = [], i = 0;i<this.length;i++){
			serializeToString(this[i],buf,isHTML,nodeFilter,null,requireWellFormed);
		}
		return buf.join('');
	},
	/**
	 * @private
	 * @param {function (Node):boolean} predicate
	 * @returns {Node[]}
	 */
	filter: function (predicate) {
		return Array.prototype.filter.call(this, predicate);
	},
	/**
	 * @private
	 * @param {Node} item
	 * @returns {number}
	 */
	indexOf: function (item) {
		return Array.prototype.indexOf.call(this, item);
	},
};

function LiveNodeList(node,refresh){
	this._node = node;
	this._refresh = refresh
	_updateLiveList(this);
}
function _updateLiveList(list){
	var inc = list._node._inc || list._node.ownerDocument._inc;
	if (list._inc !== inc) {
		var ls = list._refresh(list._node);
		__set__(list,'length',ls.length);
		if (!list.$$length || ls.length < list.$$length) {
			for (var i = ls.length; i in list; i++) {
				if (Object.prototype.hasOwnProperty.call(list, i)) {
					delete list[i];
				}
			}
		}
		copy(ls,list);
		list._inc = inc;
	}
}
LiveNodeList.prototype.item = function(i){
	_updateLiveList(this);
	return this[i] || null;
}

_extends(LiveNodeList,NodeList);

/**
 * Objects implementing the NamedNodeMap interface are used
 * to represent collections of nodes that can be accessed by name.
 * Note that NamedNodeMap does not inherit from NodeList;
 * NamedNodeMaps are not maintained in any particular order.
 * Objects contained in an object implementing NamedNodeMap may also be accessed by an ordinal index,
 * but this is simply to allow convenient enumeration of the contents of a NamedNodeMap,
 * and does not imply that the DOM specifies an order to these Nodes.
 * NamedNodeMap objects in the DOM are live.
 * used for attributes or DocumentType entities
 */
function NamedNodeMap() {
};

function _findNodeIndex(list,node){
	var i = list.length;
	while(i--){
		if(list[i] === node){return i}
	}
}

function _addNamedNode(el,list,newAttr,oldAttr){
	if(oldAttr){
		list[_findNodeIndex(list,oldAttr)] = newAttr;
	}else{
		list[list.length++] = newAttr;
	}
	if(el){
		newAttr.ownerElement = el;
		var doc = el.ownerDocument;
		if(doc){
			oldAttr && _onRemoveAttribute(doc,el,oldAttr);
			_onAddAttribute(doc,el,newAttr);
		}
	}
}
function _removeNamedNode(el,list,attr){
	//console.log('remove attr:'+attr)
	var i = _findNodeIndex(list,attr);
	if(i>=0){
		var lastIndex = list.length-1
		while(i<lastIndex){
			list[i] = list[++i]
		}
		list.length = lastIndex;
		if(el){
			var doc = el.ownerDocument;
			if(doc){
				_onRemoveAttribute(doc,el,attr);
				attr.ownerElement = null;
			}
		}
	}else{
		throw new DOMException(NOT_FOUND_ERR,new Error(el.tagName+'@'+attr))
	}
}
NamedNodeMap.prototype = {
	length:0,
	item:NodeList.prototype.item,
	getNamedItem: function(key) {
//		if(key.indexOf(':')>0 || key == 'xmlns'){
//			return null;
//		}
		//console.log()
		var i = this.length;
		while(i--){
			var attr = this[i];
			//console.log(attr.nodeName,key)
			if(attr.nodeName == key){
				return attr;
			}
		}
	},
	setNamedItem: function(attr) {
		var el = attr.ownerElement;
		if(el && el!=this._ownerElement){
			throw new DOMException(INUSE_ATTRIBUTE_ERR);
		}
		var oldAttr = this.getNamedItem(attr.nodeName);
		_addNamedNode(this._ownerElement,this,attr,oldAttr);
		return oldAttr;
	},
	/* returns Node */
	setNamedItemNS: function(attr) {// raises: WRONG_DOCUMENT_ERR,NO_MODIFICATION_ALLOWED_ERR,INUSE_ATTRIBUTE_ERR
		var el = attr.ownerElement, oldAttr;
		if(el && el!=this._ownerElement){
			throw new DOMException(INUSE_ATTRIBUTE_ERR);
		}
		oldAttr = this.getNamedItemNS(attr.namespaceURI,attr.localName);
		_addNamedNode(this._ownerElement,this,attr,oldAttr);
		return oldAttr;
	},

	/* returns Node */
	removeNamedItem: function(key) {
		var attr = this.getNamedItem(key);
		_removeNamedNode(this._ownerElement,this,attr);
		return attr;


	},// raises: NOT_FOUND_ERR,NO_MODIFICATION_ALLOWED_ERR

	//for level2
	removeNamedItemNS:function(namespaceURI,localName){
		var attr = this.getNamedItemNS(namespaceURI,localName);
		_removeNamedNode(this._ownerElement,this,attr);
		return attr;
	},
	getNamedItemNS: function(namespaceURI, localName) {
		var i = this.length;
		while(i--){
			var node = this[i];
			if(node.localName == localName && node.namespaceURI == namespaceURI){
				return node;
			}
		}
		return null;
	}
};

/**
 * The DOMImplementation interface represents an object providing methods
 * which are not dependent on any particular document.
 * Such an object is returned by the `Document.implementation` property.
 *
 * __The individual methods describe the differences compared to the specs.__
 *
 * @constructor
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation MDN
 * @see https://www.w3.org/TR/REC-DOM-Level-1/level-one-core.html#ID-102161490 DOM Level 1 Core (Initial)
 * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#ID-102161490 DOM Level 2 Core
 * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-102161490 DOM Level 3 Core
 * @see https://dom.spec.whatwg.org/#domimplementation DOM Living Standard
 */
function DOMImplementation() {
}

DOMImplementation.prototype = {
	/**
	 * The DOMImplementation.hasFeature() method returns a Boolean flag indicating if a given feature is supported.
	 * The different implementations fairly diverged in what kind of features were reported.
	 * The latest version of the spec settled to force this method to always return true, where the functionality was accurate and in use.
	 *
	 * @deprecated It is deprecated and modern browsers return true in all cases.
	 *
	 * @param {string} feature
	 * @param {string} [version]
	 * @returns {boolean} always true
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/hasFeature MDN
	 * @see https://www.w3.org/TR/REC-DOM-Level-1/level-one-core.html#ID-5CED94D7 DOM Level 1 Core
	 * @see https://dom.spec.whatwg.org/#dom-domimplementation-hasfeature DOM Living Standard
	 */
	hasFeature: function(feature, version) {
			return true;
	},
	/**
	 * Creates an XML Document object of the specified type with its document element.
	 *
	 * __It behaves slightly different from the description in the living standard__:
	 * - There is no interface/class `XMLDocument`, it returns a `Document` instance.
	 * - `contentType`, `encoding`, `mode`, `origin`, `url` fields are currently not declared.
	 * - this implementation is not validating names or qualified names
	 *   (when parsing XML strings, the SAX parser takes care of that)
	 *
	 * @param {string|null} namespaceURI
	 * @param {string} qualifiedName
	 * @param {DocumentType=null} doctype
	 * @returns {Document}
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocument MDN
	 * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocument DOM Level 2 Core (initial)
	 * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument  DOM Level 2 Core
	 *
	 * @see https://dom.spec.whatwg.org/#validate-and-extract DOM: Validate and extract
	 * @see https://www.w3.org/TR/xml/#NT-NameStartChar XML Spec: Names
	 * @see https://www.w3.org/TR/xml-names/#ns-qualnames XML Namespaces: Qualified names
	 */
	createDocument: function(namespaceURI,  qualifiedName, doctype){
		var doc = new Document();
		doc.implementation = this;
		doc.childNodes = new NodeList();
		doc.doctype = doctype || null;
		if (doctype){
			doc.appendChild(doctype);
		}
		if (qualifiedName){
			var root = doc.createElementNS(namespaceURI, qualifiedName);
			doc.appendChild(root);
		}
		return doc;
	},
	/**
	 * Returns a doctype, with the given `qualifiedName`, `publicId`, and `systemId`.
	 *
	 * __This implementation differs from the specification:__
	 * - this implementation is not validating names or qualified names
	 *   (when parsing XML strings, the SAX parser takes care of that)
	 *
	 * Note: `internalSubset` can only be introduced via a direct property write to `node.internalSubset` after creation.
	 * Creation-time validation of `publicId`, `systemId` is not enforced.
	 * The serializer-level check covers all mutation vectors, including direct property writes.
	 * `internalSubset` is only serialized as `[ ... ]` when both `publicId` and `systemId` are
	 * absent (empty or `'.'`) — if either external identifier is present, `internalSubset` is
	 * silently omitted from the serialized output.
	 *
	 * @param {string} qualifiedName
	 * @param {string} [publicId]
	 * The external subset public identifier. Stored verbatim including surrounding quotes.
	 * When serialized with `requireWellFormed: true` (via the 4th-parameter options object),
	 * throws `DOMException` with code `INVALID_STATE_ERR` if the value is non-empty and does
	 * not match the XML `PubidLiteral` production (W3C DOM Parsing §3.2.1.3; XML 1.0 [12]).
	 * @param {string} [systemId]
	 * The external subset system identifier. Stored verbatim including surrounding quotes.
	 * When serialized with `requireWellFormed: true`, throws `DOMException` with code
	 * `INVALID_STATE_ERR` if the value is non-empty and does not match the XML `SystemLiteral`
	 * production (W3C DOM Parsing §3.2.1.3; XML 1.0 [11]).
	 * @returns {DocumentType} which can either be used with `DOMImplementation.createDocument` upon document creation
	 * 				  or can be put into the document via methods like `Node.insertBefore()` or `Node.replaceChild()`
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocumentType MDN
	 * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocType DOM Level 2 Core
	 * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocumenttype DOM Living Standard
	 *
	 * @see https://dom.spec.whatwg.org/#validate-and-extract DOM: Validate and extract
	 * @see https://www.w3.org/TR/xml/#NT-NameStartChar XML Spec: Names
	 * @see https://www.w3.org/TR/xml-names/#ns-qualnames XML Namespaces: Qualified names
	 */
	createDocumentType: function(qualifiedName, publicId, systemId){
		var node = new DocumentType();
		node.name = qualifiedName;
		node.nodeName = qualifiedName;
		node.publicId = publicId || '';
		node.systemId = systemId || '';

		return node;
	}
};


/**
 * @see http://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/core.html#ID-1950641247
 */

function Node() {
};

Node.prototype = {
	firstChild : null,
	lastChild : null,
	previousSibling : null,
	nextSibling : null,
	attributes : null,
	parentNode : null,
	childNodes : null,
	ownerDocument : null,
	nodeValue : null,
	namespaceURI : null,
	prefix : null,
	localName : null,
	// Modified in DOM Level 2:
	insertBefore:function(newChild, refChild){//raises
		return _insertBefore(this,newChild,refChild);
	},
	replaceChild:function(newChild, oldChild){//raises
		_insertBefore(this, newChild,oldChild, assertPreReplacementValidityInDocument);
		if(oldChild){
			this.removeChild(oldChild);
		}
	},
	removeChild:function(oldChild){
		return _removeChild(this,oldChild);
	},
	appendChild:function(newChild){
		return this.insertBefore(newChild,null);
	},
	hasChildNodes:function(){
		return this.firstChild != null;
	},
	cloneNode:function(deep){
		return cloneNode(this.ownerDocument||this,this,deep);
	},
	// Modified in DOM Level 2:
	/**
	 * Puts the specified node and all of its subtree into a "normalized" form. In a normalized
	 * subtree, no text nodes in the subtree are empty and there are no adjacent text nodes.
	 *
	 * Specifically, this method merges any adjacent text nodes (i.e., nodes for which `nodeType`
	 * is `TEXT_NODE`) into a single node with the combined data. It also removes any empty text
	 * nodes.
	 *
	 * This method iteratively traverses all child nodes to normalize all descendant nodes within
	 * the subtree.
	 *
	 * @throws {DOMException}
	 * May throw a DOMException if operations within removeChild or appendData (which are
	 * potentially invoked in this method) do not meet their specific constraints.
	 * @see {@link Node.removeChild}
	 * @see {@link CharacterData.appendData}
	 * @see ../docs/walk-dom.md.
	 */
	normalize: function () {
		walkDOM(this, null, {
			enter: function (node) {
				// Merge adjacent text children of node before walkDOM schedules them.
				// walkDOM reads lastChild/previousSibling after enter returns, so the
				// surviving post-merge children are what it descends into.
				var child = node.firstChild;
				while (child) {
					var next = child.nextSibling;
					if (next !== null && next.nodeType === TEXT_NODE && child.nodeType === TEXT_NODE) {
						node.removeChild(next);
						child.appendData(next.data);
						// Do not advance child: re-check new nextSibling for another text run
					} else {
						child = next;
					}
				}
				return true; // descend into surviving children
			},
		});
	},
  	// Introduced in DOM Level 2:
	isSupported:function(feature, version){
		return this.ownerDocument.implementation.hasFeature(feature,version);
	},
    // Introduced in DOM Level 2:
    hasAttributes:function(){
    	return this.attributes.length>0;
    },
	/**
	 * Look up the prefix associated to the given namespace URI, starting from this node.
	 * **The default namespace declarations are ignored by this method.**
	 * See Namespace Prefix Lookup for details on the algorithm used by this method.
	 *
	 * _Note: The implementation seems to be incomplete when compared to the algorithm described in the specs._
	 *
	 * @param {string | null} namespaceURI
	 * @returns {string | null}
	 * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-lookupNamespacePrefix
	 * @see https://www.w3.org/TR/DOM-Level-3-Core/namespaces-algorithms.html#lookupNamespacePrefixAlgo
	 * @see https://dom.spec.whatwg.org/#dom-node-lookupprefix
	 * @see https://github.com/xmldom/xmldom/issues/322
	 */
    lookupPrefix:function(namespaceURI){
    	var el = this;
    	while(el){
    		var map = el._nsMap;
    		//console.dir(map)
    		if(map){
    			for(var n in map){
						if (Object.prototype.hasOwnProperty.call(map, n) && map[n] === namespaceURI) {
							return n;
						}
    			}
    		}
    		el = el.nodeType == ATTRIBUTE_NODE?el.ownerDocument : el.parentNode;
    	}
    	return null;
    },
    // Introduced in DOM Level 3:
    lookupNamespaceURI:function(prefix){
    	var el = this;
    	while(el){
    		var map = el._nsMap;
    		//console.dir(map)
    		if(map){
    			if(Object.prototype.hasOwnProperty.call(map, prefix)){
    				return map[prefix] ;
    			}
    		}
    		el = el.nodeType == ATTRIBUTE_NODE?el.ownerDocument : el.parentNode;
    	}
    	return null;
    },
    // Introduced in DOM Level 3:
    isDefaultNamespace:function(namespaceURI){
    	var prefix = this.lookupPrefix(namespaceURI);
    	return prefix == null;
    }
};


function _xmlEncoder(c){
	return c == '<' && '&lt;' ||
         c == '>' && '&gt;' ||
         c == '&' && '&amp;' ||
         c == '"' && '&quot;' ||
         '&#'+c.charCodeAt()+';'
}


copy(NodeType,Node);
copy(NodeType,Node.prototype);

/**
 * @param {Node} node
 * Root of the subtree to visit.
 * @param {function(Node): boolean} callback
 * Called for each node in depth-first pre-order. Return a truthy value to stop traversal early.
 * @return {boolean} `true` if traversal was aborted by the callback, `false` otherwise.
 */
function _visitNode(node, callback) {
	return walkDOM(node, null, { enter: function (n) { return callback(n) ? walkDOM.STOP : true; } }) === walkDOM.STOP;
}

/**
 * Depth-first pre/post-order DOM tree walker.
 *
 * Visits every node in the subtree rooted at `node`. For each node:
 *
 * 1. Calls `callbacks.enter(node, context)` before descending into the node's children. The
 * return value becomes the `context` passed to each child's `enter` call and to the matching
 * `exit` call.
 * 2. If `enter` returns `null` or `undefined`, the node's children are skipped;
 * sibling traversal continues normally.
 * 3. If `enter` returns `walkDOM.STOP`, the entire traversal is aborted immediately — no
 * further `enter` or `exit` calls are made.
 * 4. `lastChild` and `previousSibling` are read **after** `enter` returns, so `enter` may
 * safely modify the node's own child list before the walker descends. Modifying siblings of
 * the current node or any other part of the tree produces unpredictable results: nodes already
 * queued on the stack are visited regardless of DOM changes, and newly inserted nodes outside
 * the current child list are never visited.
 * 5. Calls `callbacks.exit(node, context)` (if provided) after all of a node's children have
 * been visited, passing the same `context` that `enter`
 * returned for that node.
 *
 * This implementation uses an explicit stack and does not recurse — it is safe on arbitrarily
 * deep trees.
 *
 * @param {Node} node
 * Root of the subtree to walk.
 * @param {*} context
 * Initial context value passed to the root node's `enter`.
 * @param {{ enter: function(Node, *): *, exit?: function(Node, *): void }} callbacks
 * @returns {void | walkDOM.STOP}
 * @see ../docs/walk-dom.md.
 */
function walkDOM(node, context, callbacks) {
	// Each stack frame is {node, context, phase}:
	//   walkDOM.ENTER — call enter, then push children
	//   walkDOM.EXIT  — call exit
	var stack = [{ node: node, context: context, phase: walkDOM.ENTER }];
	while (stack.length > 0) {
		var frame = stack.pop();
		if (frame.phase === walkDOM.ENTER) {
			var childContext = callbacks.enter(frame.node, frame.context);
			if (childContext === walkDOM.STOP) {
				return walkDOM.STOP;
			}
			// Push exit frame before children so it fires after all children are processed (Last In First Out)
			stack.push({ node: frame.node, context: childContext, phase: walkDOM.EXIT });
			if (childContext === null || childContext === undefined) {
				continue; // skip children
			}
			// lastChild is read after enter returns, so enter may modify the child list.
			var child = frame.node.lastChild;
			// Traverse from lastChild backwards so that pushing onto the stack
			// naturally yields firstChild on top (processed first).
			while (child) {
				stack.push({ node: child, context: childContext, phase: walkDOM.ENTER });
				child = child.previousSibling;
			}
		} else {
			// frame.phase === walkDOM.EXIT
			if (callbacks.exit) {
				callbacks.exit(frame.node, frame.context);
			}
		}
	}
}

/**
 * Sentinel value returned from a `walkDOM` `enter` callback to abort the entire traversal
 * immediately.
 *
 * @type {symbol}
 */
walkDOM.STOP = Symbol('walkDOM.STOP');
/**
 * Phase constant for a stack frame that has not yet been visited.
 * The `enter` callback is called and children are scheduled.
 *
 * @type {number}
 */
walkDOM.ENTER = 0;
/**
 * Phase constant for a stack frame whose subtree has been fully visited.
 * The `exit` callback is called.
 *
 * @type {number}
 */
walkDOM.EXIT = 1;

function Document(){
	this.ownerDocument = this;
}

function _onAddAttribute(doc,el,newAttr){
	doc && doc._inc++;
	var ns = newAttr.namespaceURI ;
	if(ns === NAMESPACE.XMLNS){
		//update namespace
		el._nsMap[newAttr.prefix?newAttr.localName:''] = newAttr.value
	}
}

function _onRemoveAttribute(doc,el,newAttr,remove){
	doc && doc._inc++;
	var ns = newAttr.namespaceURI ;
	if(ns === NAMESPACE.XMLNS){
		//update namespace
		delete el._nsMap[newAttr.prefix?newAttr.localName:'']
	}
}

/**
 * Updates `el.childNodes`, updating the indexed items and it's `length`.
 * Passing `newChild` means it will be appended.
 * Otherwise it's assumed that an item has been removed,
 * and `el.firstNode` and it's `.nextSibling` are used
 * to walk the current list of child nodes.
 *
 * @param {Document} doc
 * @param {Node} el
 * @param {Node} [newChild]
 * @private
 */
function _onUpdateChild (doc, el, newChild) {
	if(doc && doc._inc){
		doc._inc++;
		//update childNodes
		var cs = el.childNodes;
		if (newChild) {
			cs[cs.length++] = newChild;
		} else {
			var child = el.firstChild;
			var i = 0;
			while (child) {
				cs[i++] = child;
				child = child.nextSibling;
			}
			cs.length = i;
			delete cs[cs.length];
		}
	}
}

/**
 * Removes the connections between `parentNode` and `child`
 * and any existing `child.previousSibling` or `child.nextSibling`.
 *
 * @see https://github.com/xmldom/xmldom/issues/135
 * @see https://github.com/xmldom/xmldom/issues/145
 *
 * @param {Node} parentNode
 * @param {Node} child
 * @returns {Node} the child that was removed.
 * @private
 */
function _removeChild (parentNode, child) {
	var previous = child.previousSibling;
	var next = child.nextSibling;
	if (previous) {
		previous.nextSibling = next;
	} else {
		parentNode.firstChild = next;
	}
	if (next) {
		next.previousSibling = previous;
	} else {
		parentNode.lastChild = previous;
	}
	child.parentNode = null;
	child.previousSibling = null;
	child.nextSibling = null;
	_onUpdateChild(parentNode.ownerDocument, parentNode);
	return child;
}

/**
 * Returns `true` if `node` can be a parent for insertion.
 * @param {Node} node
 * @returns {boolean}
 */
function hasValidParentNodeType(node) {
	return (
		node &&
		(node.nodeType === Node.DOCUMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE || node.nodeType === Node.ELEMENT_NODE)
	);
}

/**
 * Returns `true` if `node` can be inserted according to it's `nodeType`.
 * @param {Node} node
 * @returns {boolean}
 */
function hasInsertableNodeType(node) {
	return (
		node &&
		(isElementNode(node) ||
			isTextNode(node) ||
			isDocTypeNode(node) ||
			node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ||
			node.nodeType === Node.COMMENT_NODE ||
			node.nodeType === Node.PROCESSING_INSTRUCTION_NODE)
	);
}

/**
 * Returns true if `node` is a DOCTYPE node
 * @param {Node} node
 * @returns {boolean}
 */
function isDocTypeNode(node) {
	return node && node.nodeType === Node.DOCUMENT_TYPE_NODE;
}

/**
 * Returns true if the node is an element
 * @param {Node} node
 * @returns {boolean}
 */
function isElementNode(node) {
	return node && node.nodeType === Node.ELEMENT_NODE;
}
/**
 * Returns true if `node` is a text node
 * @param {Node} node
 * @returns {boolean}
 */
function isTextNode(node) {
	return node && node.nodeType === Node.TEXT_NODE;
}

/**
 * Check if en element node can be inserted before `child`, or at the end if child is falsy,
 * according to the presence and position of a doctype node on the same level.
 *
 * @param {Document} doc The document node
 * @param {Node} child the node that would become the nextSibling if the element would be inserted
 * @returns {boolean} `true` if an element can be inserted before child
 * @private
 * https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
 */
function isElementInsertionPossible(doc, child) {
	var parentChildNodes = doc.childNodes || [];
	if (find(parentChildNodes, isElementNode) || isDocTypeNode(child)) {
		return false;
	}
	var docTypeNode = find(parentChildNodes, isDocTypeNode);
	return !(child && docTypeNode && parentChildNodes.indexOf(docTypeNode) > parentChildNodes.indexOf(child));
}

/**
 * Check if en element node can be inserted before `child`, or at the end if child is falsy,
 * according to the presence and position of a doctype node on the same level.
 *
 * @param {Node} doc The document node
 * @param {Node} child the node that would become the nextSibling if the element would be inserted
 * @returns {boolean} `true` if an element can be inserted before child
 * @private
 * https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
 */
function isElementReplacementPossible(doc, child) {
	var parentChildNodes = doc.childNodes || [];

	function hasElementChildThatIsNotChild(node) {
		return isElementNode(node) && node !== child;
	}

	if (find(parentChildNodes, hasElementChildThatIsNotChild)) {
		return false;
	}
	var docTypeNode = find(parentChildNodes, isDocTypeNode);
	return !(child && docTypeNode && parentChildNodes.indexOf(docTypeNode) > parentChildNodes.indexOf(child));
}

/**
 * @private
 * Steps 1-5 of the checks before inserting and before replacing a child are the same.
 *
 * @param {Node} parent the parent node to insert `node` into
 * @param {Node} node the node to insert
 * @param {Node=} child the node that should become the `nextSibling` of `node`
 * @returns {Node}
 * @throws DOMException for several node combinations that would create a DOM that is not well-formed.
 * @throws DOMException if `child` is provided but is not a child of `parent`.
 * @see https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
 * @see https://dom.spec.whatwg.org/#concept-node-replace
 */
function assertPreInsertionValidity1to5(parent, node, child) {
	// 1. If `parent` is not a Document, DocumentFragment, or Element node, then throw a "HierarchyRequestError" DOMException.
	if (!hasValidParentNodeType(parent)) {
		throw new DOMException(HIERARCHY_REQUEST_ERR, 'Unexpected parent node type ' + parent.nodeType);
	}
	// 2. If `node` is a host-including inclusive ancestor of `parent`, then throw a "HierarchyRequestError" DOMException.
	// not implemented!
	// 3. If `child` is non-null and its parent is not `parent`, then throw a "NotFoundError" DOMException.
	if (child && child.parentNode !== parent) {
		throw new DOMException(NOT_FOUND_ERR, 'child not in parent');
	}
	if (
		// 4. If `node` is not a DocumentFragment, DocumentType, Element, or CharacterData node, then throw a "HierarchyRequestError" DOMException.
		!hasInsertableNodeType(node) ||
		// 5. If either `node` is a Text node and `parent` is a document,
		// the sax parser currently adds top level text nodes, this will be fixed in 0.9.0
		// || (node.nodeType === Node.TEXT_NODE && parent.nodeType === Node.DOCUMENT_NODE)
		// or `node` is a doctype and `parent` is not a document, then throw a "HierarchyRequestError" DOMException.
		(isDocTypeNode(node) && parent.nodeType !== Node.DOCUMENT_NODE)
	) {
		throw new DOMException(
			HIERARCHY_REQUEST_ERR,
			'Unexpected node type ' + node.nodeType + ' for parent node type ' + parent.nodeType
		);
	}
}

/**
 * @private
 * Step 6 of the checks before inserting and before replacing a child are different.
 *
 * @param {Document} parent the parent node to insert `node` into
 * @param {Node} node the node to insert
 * @param {Node | undefined} child the node that should become the `nextSibling` of `node`
 * @returns {Node}
 * @throws DOMException for several node combinations that would create a DOM that is not well-formed.
 * @throws DOMException if `child` is provided but is not a child of `parent`.
 * @see https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
 * @see https://dom.spec.whatwg.org/#concept-node-replace
 */
function assertPreInsertionValidityInDocument(parent, node, child) {
	var parentChildNodes = parent.childNodes || [];
	var nodeChildNodes = node.childNodes || [];

	// DocumentFragment
	if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
		var nodeChildElements = nodeChildNodes.filter(isElementNode);
		// If node has more than one element child or has a Text node child.
		if (nodeChildElements.length > 1 || find(nodeChildNodes, isTextNode)) {
			throw new DOMException(HIERARCHY_REQUEST_ERR, 'More than one element or text in fragment');
		}
		// Otherwise, if `node` has one element child and either `parent` has an element child,
		// `child` is a doctype, or `child` is non-null and a doctype is following `child`.
		if (nodeChildElements.length === 1 && !isElementInsertionPossible(parent, child)) {
			throw new DOMException(HIERARCHY_REQUEST_ERR, 'Element in fragment can not be inserted before doctype');
		}
	}
	// Element
	if (isElementNode(node)) {
		// `parent` has an element child, `child` is a doctype,
		// or `child` is non-null and a doctype is following `child`.
		if (!isElementInsertionPossible(parent, child)) {
			throw new DOMException(HIERARCHY_REQUEST_ERR, 'Only one element can be added and only after doctype');
		}
	}
	// DocumentType
	if (isDocTypeNode(node)) {
		// `parent` has a doctype child,
		if (find(parentChildNodes, isDocTypeNode)) {
			throw new DOMException(HIERARCHY_REQUEST_ERR, 'Only one doctype is allowed');
		}
		var parentElementChild = find(parentChildNodes, isElementNode);
		// `child` is non-null and an element is preceding `child`,
		if (child && parentChildNodes.indexOf(parentElementChild) < parentChildNodes.indexOf(child)) {
			throw new DOMException(HIERARCHY_REQUEST_ERR, 'Doctype can only be inserted before an element');
		}
		// or `child` is null and `parent` has an element child.
		if (!child && parentElementChild) {
			throw new DOMException(HIERARCHY_REQUEST_ERR, 'Doctype can not be appended since element is present');
		}
	}
}

/**
 * @private
 * Step 6 of the checks before inserting and before replacing a child are different.
 *
 * @param {Document} parent the parent node to insert `node` into
 * @param {Node} node the node to insert
 * @param {Node | undefined} child the node that should become the `nextSibling` of `node`
 * @returns {Node}
 * @throws DOMException for several node combinations that would create a DOM that is not well-formed.
 * @throws DOMException if `child` is provided but is not a child of `parent`.
 * @see https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
 * @see https://dom.spec.whatwg.org/#concept-node-replace
 */
function assertPreReplacementValidityInDocument(parent, node, child) {
	var parentChildNodes = parent.childNodes || [];
	var nodeChildNodes = node.childNodes || [];

	// DocumentFragment
	if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
		var nodeChildElements = nodeChildNodes.filter(isElementNode);
		// If `node` has more than one element child or has a Text node child.
		if (nodeChildElements.length > 1 || find(nodeChildNodes, isTextNode)) {
			throw new DOMException(HIERARCHY_REQUEST_ERR, 'More than one element or text in fragment');
		}
		// Otherwise, if `node` has one element child and either `parent` has an element child that is not `child` or a doctype is following `child`.
		if (nodeChildElements.length === 1 && !isElementReplacementPossible(parent, child)) {
			throw new DOMException(HIERARCHY_REQUEST_ERR, 'Element in fragment can not be inserted before doctype');
		}
	}
	// Element
	if (isElementNode(node)) {
		// `parent` has an element child that is not `child` or a doctype is following `child`.
		if (!isElementReplacementPossible(parent, child)) {
			throw new DOMException(HIERARCHY_REQUEST_ERR, 'Only one element can be added and only after doctype');
		}
	}
	// DocumentType
	if (isDocTypeNode(node)) {
		function hasDoctypeChildThatIsNotChild(node) {
			return isDocTypeNode(node) && node !== child;
		}

		// `parent` has a doctype child that is not `child`,
		if (find(parentChildNodes, hasDoctypeChildThatIsNotChild)) {
			throw new DOMException(HIERARCHY_REQUEST_ERR, 'Only one doctype is allowed');
		}
		var parentElementChild = find(parentChildNodes, isElementNode);
		// or an element is preceding `child`.
		if (child && parentChildNodes.indexOf(parentElementChild) < parentChildNodes.indexOf(child)) {
			throw new DOMException(HIERARCHY_REQUEST_ERR, 'Doctype can only be inserted before an element');
		}
	}
}

/**
 * @private
 * @param {Node} parent the parent node to insert `node` into
 * @param {Node} node the node to insert
 * @param {Node=} child the node that should become the `nextSibling` of `node`
 * @returns {Node}
 * @throws DOMException for several node combinations that would create a DOM that is not well-formed.
 * @throws DOMException if `child` is provided but is not a child of `parent`.
 * @see https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
 */
function _insertBefore(parent, node, child, _inDocumentAssertion) {
	// To ensure pre-insertion validity of a node into a parent before a child, run these steps:
	assertPreInsertionValidity1to5(parent, node, child);

	// If parent is a document, and any of the statements below, switched on the interface node implements,
	// are true, then throw a "HierarchyRequestError" DOMException.
	if (parent.nodeType === Node.DOCUMENT_NODE) {
		(_inDocumentAssertion || assertPreInsertionValidityInDocument)(parent, node, child);
	}

	var cp = node.parentNode;
	if(cp){
		cp.removeChild(node);//remove and update
	}
	if(node.nodeType === DOCUMENT_FRAGMENT_NODE){
		var newFirst = node.firstChild;
		if (newFirst == null) {
			return node;
		}
		var newLast = node.lastChild;
	}else{
		newFirst = newLast = node;
	}
	var pre = child ? child.previousSibling : parent.lastChild;

	newFirst.previousSibling = pre;
	newLast.nextSibling = child;


	if(pre){
		pre.nextSibling = newFirst;
	}else{
		parent.firstChild = newFirst;
	}
	if(child == null){
		parent.lastChild = newLast;
	}else{
		child.previousSibling = newLast;
	}
	do{
		newFirst.parentNode = parent;
		// Update ownerDocument for each node being inserted
		var targetDoc = parent.ownerDocument || parent;
		_updateOwnerDocument(newFirst, targetDoc);
	}while(newFirst !== newLast && (newFirst= newFirst.nextSibling))
	_onUpdateChild(parent.ownerDocument||parent, parent);
	//console.log(parent.lastChild.nextSibling == null)
	if (node.nodeType == DOCUMENT_FRAGMENT_NODE) {
		node.firstChild = node.lastChild = null;
	}
	return node;
}

/**
 * Recursively updates the ownerDocument property for a node and all its descendants
 * @param {Node} node
 * @param {Document} newOwnerDocument
 * @private
 */
function _updateOwnerDocument(node, newOwnerDocument) {
	if (node.ownerDocument === newOwnerDocument) {
		return;
	}
	
	node.ownerDocument = newOwnerDocument;
	
	// Update attributes if this is an element
	if (node.nodeType === ELEMENT_NODE && node.attributes) {
		for (var i = 0; i < node.attributes.length; i++) {
			var attr = node.attributes.item(i);
			if (attr) {
				attr.ownerDocument = newOwnerDocument;
			}
		}
	}
	
	// Recursively update child nodes
	var child = node.firstChild;
	while (child) {
		_updateOwnerDocument(child, newOwnerDocument);
		child = child.nextSibling;
	}
}

/**
 * Appends `newChild` to `parentNode`.
 * If `newChild` is already connected to a `parentNode` it is first removed from it.
 *
 * @see https://github.com/xmldom/xmldom/issues/135
 * @see https://github.com/xmldom/xmldom/issues/145
 * @param {Node} parentNode
 * @param {Node} newChild
 * @returns {Node}
 * @private
 */
function _appendSingleChild (parentNode, newChild) {
	if (newChild.parentNode) {
		newChild.parentNode.removeChild(newChild);
	}
	newChild.parentNode = parentNode;
	newChild.previousSibling = parentNode.lastChild;
	newChild.nextSibling = null;
	if (newChild.previousSibling) {
		newChild.previousSibling.nextSibling = newChild;
	} else {
		parentNode.firstChild = newChild;
	}
	parentNode.lastChild = newChild;
	_onUpdateChild(parentNode.ownerDocument, parentNode, newChild);
	
	// Update ownerDocument for the new child and all its descendants
	var targetDoc = parentNode.ownerDocument || parentNode;
	_updateOwnerDocument(newChild, targetDoc);
	
	return newChild;
}

Document.prototype = {
	//implementation : null,
	nodeName :  '#document',
	nodeType :  DOCUMENT_NODE,
	/**
	 * The DocumentType node of the document.
	 *
	 * @readonly
	 * @type DocumentType
	 */
	doctype :  null,
	documentElement :  null,
	_inc : 1,

	insertBefore :  function(newChild, refChild){//raises
		if(newChild.nodeType == DOCUMENT_FRAGMENT_NODE){
			var child = newChild.firstChild;
			while(child){
				var next = child.nextSibling;
				this.insertBefore(child,refChild);
				child = next;
			}
			return newChild;
		}
		_insertBefore(this, newChild, refChild);
		_updateOwnerDocument(newChild, this);
		if (this.documentElement === null && newChild.nodeType === ELEMENT_NODE) {
			this.documentElement = newChild;
		}

		return newChild;
	},
	removeChild :  function(oldChild){
		if(this.documentElement == oldChild){
			this.documentElement = null;
		}
		return _removeChild(this,oldChild);
	},
	replaceChild: function (newChild, oldChild) {
		//raises
		_insertBefore(this, newChild, oldChild, assertPreReplacementValidityInDocument);
		_updateOwnerDocument(newChild, this);
		if (oldChild) {
			this.removeChild(oldChild);
		}
		if (isElementNode(newChild)) {
			this.documentElement = newChild;
		}
	},
	// Introduced in DOM Level 2:
	importNode : function(importedNode,deep){
		return importNode(this,importedNode,deep);
	},
	// Introduced in DOM Level 2:
	getElementById :	function(id){
		var rtv = null;
		_visitNode(this.documentElement,function(node){
			if(node.nodeType == ELEMENT_NODE){
				if(node.getAttribute('id') == id){
					rtv = node;
					return true;
				}
			}
		})
		return rtv;
	},

	/**
	 * The `getElementsByClassName` method of `Document` interface returns an array-like object
	 * of all child elements which have **all** of the given class name(s).
	 *
	 * Returns an empty list if `classeNames` is an empty string or only contains HTML white space characters.
	 *
	 *
	 * Warning: This is a live LiveNodeList.
	 * Changes in the DOM will reflect in the array as the changes occur.
	 * If an element selected by this array no longer qualifies for the selector,
	 * it will automatically be removed. Be aware of this for iteration purposes.
	 *
	 * @param {string} classNames is a string representing the class name(s) to match; multiple class names are separated by (ASCII-)whitespace
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementsByClassName
	 * @see https://dom.spec.whatwg.org/#concept-getelementsbyclassname
	 */
	getElementsByClassName: function(classNames) {
		var classNamesSet = toOrderedSet(classNames)
		return new LiveNodeList(this, function(base) {
			var ls = [];
			if (classNamesSet.length > 0) {
				_visitNode(base.documentElement, function(node) {
					if(node !== base && node.nodeType === ELEMENT_NODE) {
						var nodeClassNames = node.getAttribute('class')
						// can be null if the attribute does not exist
						if (nodeClassNames) {
							// before splitting and iterating just compare them for the most common case
							var matches = classNames === nodeClassNames;
							if (!matches) {
								var nodeClassNamesSet = toOrderedSet(nodeClassNames)
								matches = classNamesSet.every(arrayIncludes(nodeClassNamesSet))
							}
							if(matches) {
								ls.push(node);
							}
						}
					}
				});
			}
			return ls;
		});
	},

	//document factory method:
	createElement :	function(tagName){
		var node = new Element();
		node.ownerDocument = this;
		node.nodeName = tagName;
		node.tagName = tagName;
		node.localName = tagName;
		node.childNodes = new NodeList();
		var attrs	= node.attributes = new NamedNodeMap();
		attrs._ownerElement = node;
		return node;
	},
	createDocumentFragment :	function(){
		var node = new DocumentFragment();
		node.ownerDocument = this;
		node.childNodes = new NodeList();
		return node;
	},
	createTextNode :	function(data){
		var node = new Text();
		node.ownerDocument = this;
		node.appendData(data)
		return node;
	},
	createComment :	function(data){
		var node = new Comment();
		node.ownerDocument = this;
		node.appendData(data)
		return node;
	},
	/**
	 * Returns a new CDATASection node whose data is `data`.
	 *
	 * __This implementation differs from the specification:__
	 * - calling this method on an HTML document does not throw `NotSupportedError`.
	 *
	 * @param {string} data
	 * @returns {CDATASection}
	 * @throws DOMException with code `INVALID_CHARACTER_ERR` if `data` contains `"]]>"`.
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createCDATASection
	 * @see https://dom.spec.whatwg.org/#dom-document-createcdatasection
	 */
	createCDATASection :	function(data){
		if (data.indexOf(']]>') !== -1) {
			throw new DOMException(INVALID_CHARACTER_ERR, 'data contains "]]>"');
		}
		var node = new CDATASection();
		node.ownerDocument = this;
		node.appendData(data)
		return node;
	},
	/**
	 * Returns a ProcessingInstruction node whose target is target and data is data.
	 *
	 * __This implementation differs from the specification:__
	 * - it does not do any input validation on the arguments and doesn't throw "InvalidCharacterError".
	 *
	 * Note: When the resulting document is serialized with `requireWellFormed: true`, the
	 * serializer throws with code `INVALID_STATE_ERR` if `.data` contains `?>` (W3C DOM Parsing
	 * §3.2.1.7). Without that option the data is emitted verbatim.
	 *
	 * @param {string} target
	 * @param {string} data
	 * @returns {ProcessingInstruction}
	 * @see https://developer.mozilla.org/docs/Web/API/Document/createProcessingInstruction
	 * @see https://dom.spec.whatwg.org/#dom-document-createprocessinginstruction
	 * @see https://www.w3.org/TR/DOM-Parsing/#dfn-concept-serialize-xml §3.2.1.7
	 */
	createProcessingInstruction :	function(target,data){
		var node = new ProcessingInstruction();
		node.ownerDocument = this;
		node.tagName = node.nodeName = node.target = target;
		node.nodeValue = node.data = data;
		return node;
	},
	createAttribute :	function(name){
		var node = new Attr();
		node.ownerDocument	= this;
		node.name = name;
		node.nodeName	= name;
		node.localName = name;
		node.specified = true;
		return node;
	},
	createEntityReference :	function(name){
		var node = new EntityReference();
		node.ownerDocument	= this;
		node.nodeName	= name;
		return node;
	},
	// Introduced in DOM Level 2:
	createElementNS :	function(namespaceURI,qualifiedName){
		var node = new Element();
		var pl = qualifiedName.split(':');
		var attrs	= node.attributes = new NamedNodeMap();
		node.childNodes = new NodeList();
		node.ownerDocument = this;
		node.nodeName = qualifiedName;
		node.tagName = qualifiedName;
		node.namespaceURI = namespaceURI;
		if(pl.length == 2){
			node.prefix = pl[0];
			node.localName = pl[1];
		}else{
			//el.prefix = null;
			node.localName = qualifiedName;
		}
		attrs._ownerElement = node;
		return node;
	},
	// Introduced in DOM Level 2:
	createAttributeNS :	function(namespaceURI,qualifiedName){
		var node = new Attr();
		var pl = qualifiedName.split(':');
		node.ownerDocument = this;
		node.nodeName = qualifiedName;
		node.name = qualifiedName;
		node.namespaceURI = namespaceURI;
		node.specified = true;
		if(pl.length == 2){
			node.prefix = pl[0];
			node.localName = pl[1];
		}else{
			//el.prefix = null;
			node.localName = qualifiedName;
		}
		return node;
	}
};
_extends(Document,Node);


function Element() {
	this._nsMap = {};
};
Element.prototype = {
	nodeType : ELEMENT_NODE,
	hasAttribute : function(name){
		return this.getAttributeNode(name)!=null;
	},
	getAttribute : function(name){
		var attr = this.getAttributeNode(name);
		return attr && attr.value || '';
	},
	getAttributeNode : function(name){
		return this.attributes.getNamedItem(name);
	},
	setAttribute : function(name, value){
		var attr = this.ownerDocument.createAttribute(name);
		attr.value = attr.nodeValue = "" + value;
		this.setAttributeNode(attr)
	},
	removeAttribute : function(name){
		var attr = this.getAttributeNode(name)
		attr && this.removeAttributeNode(attr);
	},

	//four real opeartion method
	appendChild:function(newChild){
		if(newChild.nodeType === DOCUMENT_FRAGMENT_NODE){
			return this.insertBefore(newChild,null);
		}else{
			return _appendSingleChild(this,newChild);
		}
	},
	setAttributeNode : function(newAttr){
		return this.attributes.setNamedItem(newAttr);
	},
	setAttributeNodeNS : function(newAttr){
		return this.attributes.setNamedItemNS(newAttr);
	},
	removeAttributeNode : function(oldAttr){
		//console.log(this == oldAttr.ownerElement)
		return this.attributes.removeNamedItem(oldAttr.nodeName);
	},
	//get real attribute name,and remove it by removeAttributeNode
	removeAttributeNS : function(namespaceURI, localName){
		var old = this.getAttributeNodeNS(namespaceURI, localName);
		old && this.removeAttributeNode(old);
	},

	hasAttributeNS : function(namespaceURI, localName){
		return this.getAttributeNodeNS(namespaceURI, localName)!=null;
	},
	getAttributeNS : function(namespaceURI, localName){
		var attr = this.getAttributeNodeNS(namespaceURI, localName);
		return attr && attr.value || '';
	},
	setAttributeNS : function(namespaceURI, qualifiedName, value){
		var attr = this.ownerDocument.createAttributeNS(namespaceURI, qualifiedName);
		attr.value = attr.nodeValue = "" + value;
		this.setAttributeNode(attr)
	},
	getAttributeNodeNS : function(namespaceURI, localName){
		return this.attributes.getNamedItemNS(namespaceURI, localName);
	},

	getElementsByTagName : function(tagName){
		return new LiveNodeList(this,function(base){
			var ls = [];
			_visitNode(base,function(node){
				if(node !== base && node.nodeType == ELEMENT_NODE && (tagName === '*' || node.tagName == tagName)){
					ls.push(node);
				}
			});
			return ls;
		});
	},
	getElementsByTagNameNS : function(namespaceURI, localName){
		return new LiveNodeList(this,function(base){
			var ls = [];
			_visitNode(base,function(node){
				if(node !== base && node.nodeType === ELEMENT_NODE && (namespaceURI === '*' || node.namespaceURI === namespaceURI) && (localName === '*' || node.localName == localName)){
					ls.push(node);
				}
			});
			return ls;

		});
	}
};
Document.prototype.getElementsByTagName = Element.prototype.getElementsByTagName;
Document.prototype.getElementsByTagNameNS = Element.prototype.getElementsByTagNameNS;


_extends(Element,Node);
function Attr() {
};
Attr.prototype.nodeType = ATTRIBUTE_NODE;
_extends(Attr,Node);


function CharacterData() {
};
CharacterData.prototype = {
	data : '',
	substringData : function(offset, count) {
		return this.data.substring(offset, offset+count);
	},
	appendData: function(text) {
		text = this.data+text;
		this.nodeValue = this.data = text;
		this.length = text.length;
	},
	insertData: function(offset,text) {
		this.replaceData(offset,0,text);

	},
	appendChild:function(newChild){
		throw new Error(ExceptionMessage[HIERARCHY_REQUEST_ERR])
	},
	deleteData: function(offset, count) {
		this.replaceData(offset,count,"");
	},
	replaceData: function(offset, count, text) {
		var start = this.data.substring(0,offset);
		var end = this.data.substring(offset+count);
		text = start + text + end;
		this.nodeValue = this.data = text;
		this.length = text.length;
	}
}
_extends(CharacterData,Node);
function Text() {
};
Text.prototype = {
	nodeName : "#text",
	nodeType : TEXT_NODE,
	splitText : function(offset) {
		var text = this.data;
		var newText = text.substring(offset);
		text = text.substring(0, offset);
		this.data = this.nodeValue = text;
		this.length = text.length;
		var newNode = this.ownerDocument.createTextNode(newText);
		if(this.parentNode){
			this.parentNode.insertBefore(newNode, this.nextSibling);
		}
		return newNode;
	}
}
_extends(Text,CharacterData);
function Comment() {
};
Comment.prototype = {
	nodeName : "#comment",
	nodeType : COMMENT_NODE
}
_extends(Comment,CharacterData);

function CDATASection() {
};
CDATASection.prototype = {
	nodeName : "#cdata-section",
	nodeType : CDATA_SECTION_NODE
}
_extends(CDATASection,CharacterData);


/**
 * Represents a DocumentType node (the `<!DOCTYPE ...>` declaration).
 *
 * `publicId`, `systemId`, and `internalSubset` are plain own-property assignments.
 * xmldom does not enforce the `readonly` constraint declared by the WHATWG DOM spec —
 * direct property writes succeed silently. Values are serialized verbatim when
 * `requireWellFormed` is false (the default). When the serializer is invoked with
 * `requireWellFormed: true` (via the 4th-parameter options object), it validates each
 * field and throws `DOMException` with code `INVALID_STATE_ERR` on invalid values.
 *
 * @class
 * @see https://developer.mozilla.org/en-US/docs/Web/API/DocumentType MDN
 */
function DocumentType() {
};
DocumentType.prototype.nodeType = DOCUMENT_TYPE_NODE;
_extends(DocumentType,Node);

function Notation() {
};
Notation.prototype.nodeType = NOTATION_NODE;
_extends(Notation,Node);

function Entity() {
};
Entity.prototype.nodeType = ENTITY_NODE;
_extends(Entity,Node);

function EntityReference() {
};
EntityReference.prototype.nodeType = ENTITY_REFERENCE_NODE;
_extends(EntityReference,Node);

function DocumentFragment() {
};
DocumentFragment.prototype.nodeName =	"#document-fragment";
DocumentFragment.prototype.nodeType =	DOCUMENT_FRAGMENT_NODE;
_extends(DocumentFragment,Node);


function ProcessingInstruction() {
}
ProcessingInstruction.prototype.nodeType = PROCESSING_INSTRUCTION_NODE;
_extends(ProcessingInstruction,Node);
function XMLSerializer(){}
/**
 * Returns the result of serializing `node` to XML.
 *
 * When `options.requireWellFormed` is `true`, the serializer throws for content that would
 * produce ill-formed XML.
 *
 * __This implementation differs from the specification:__
 * - CDATASection nodes whose data contains `]]>` are serialized by splitting the section
 *   at each `]]>` occurrence (following W3C DOM Level 3 Core `split-cdata-sections`
 *   default behaviour) unless `requireWellFormed` is `true`.
 * - when `requireWellFormed` is `true`, `DOMException` with code `INVALID_STATE_ERR`
 *   is only thrown to prevent injection vectors, not for all the spec mandated checks.
 *
 * @param {Node} node
 * @param {boolean} [isHtml]
 * @param {function} [nodeFilter]
 * @param {Object} [options]
 * @param {boolean} [options.requireWellFormed=false]
 * When `true`, throws for content that would produce ill-formed XML.
 * @returns {string}
 * @throws {DOMException}
 * With code `INVALID_STATE_ERR` when `requireWellFormed` is `true` and:
 * - a CDATASection node's data contains `"]]>"`,
 * - a Comment node's data contains `"-->"` (bare `"--"` does not throw on this branch),
 * - a ProcessingInstruction's data contains `"?>"`,
 * - a DocumentType's `publicId` is non-empty and does not match the XML `PubidLiteral`
 *   production,
 * - a DocumentType's `systemId` is non-empty and does not match the XML `SystemLiteral`
 *   production, or
 * - a DocumentType's `internalSubset` contains `"]>"`.
 * Note: xmldom does not enforce `readonly` on DocumentType fields — direct property
 * writes succeed and are covered by the serializer-level checks above.
 * @see https://html.spec.whatwg.org/#dom-xmlserializer-serializetostring
 * @see https://w3c.github.io/DOM-Parsing/#xml-serialization
 * @see https://github.com/w3c/DOM-Parsing/issues/84
 */
XMLSerializer.prototype.serializeToString = function(node,isHtml,nodeFilter,options){
	return nodeSerializeToString.call(node,isHtml,nodeFilter,options);
}
Node.prototype.toString = nodeSerializeToString;
function nodeSerializeToString(isHtml,nodeFilter,options){
	var requireWellFormed = !!options && !!options.requireWellFormed;
	var buf = [];
	var refNode = this.nodeType == 9 && this.documentElement || this;
	var prefix = refNode.prefix;
	var uri = refNode.namespaceURI;

	if(uri && prefix == null){
		//console.log(prefix)
		var prefix = refNode.lookupPrefix(uri);
		if(prefix == null){
			//isHTML = true;
			var visibleNamespaces=[
			{namespace:uri,prefix:null}
			//{namespace:uri,prefix:''}
			]
		}
	}
	serializeToString(this,buf,isHtml,nodeFilter,visibleNamespaces,requireWellFormed);
	//console.log('###',this.nodeType,uri,prefix,buf.join(''))
	return buf.join('');
}

function needNamespaceDefine(node, isHTML, visibleNamespaces) {
	var prefix = node.prefix || '';
	var uri = node.namespaceURI;
	// According to [Namespaces in XML 1.0](https://www.w3.org/TR/REC-xml-names/#ns-using) ,
	// and more specifically https://www.w3.org/TR/REC-xml-names/#nsc-NoPrefixUndecl :
	// > In a namespace declaration for a prefix [...], the attribute value MUST NOT be empty.
	// in a similar manner [Namespaces in XML 1.1](https://www.w3.org/TR/xml-names11/#ns-using)
	// and more specifically https://www.w3.org/TR/xml-names11/#nsc-NSDeclared :
	// > [...] Furthermore, the attribute value [...] must not be an empty string.
	// so serializing empty namespace value like xmlns:ds="" would produce an invalid XML document.
	if (!uri) {
		return false;
	}
	if (prefix === "xml" && uri === NAMESPACE.XML || uri === NAMESPACE.XMLNS) {
		return false;
	}

	var i = visibleNamespaces.length
	while (i--) {
		var ns = visibleNamespaces[i];
		// get namespace prefix
		if (ns.prefix === prefix) {
			return ns.namespace !== uri;
		}
	}
	return true;
}
/**
 * Well-formed constraint: No < in Attribute Values
 * > The replacement text of any entity referred to directly or indirectly
 * > in an attribute value must not contain a <.
 * @see https://www.w3.org/TR/xml11/#CleanAttrVals
 * @see https://www.w3.org/TR/xml11/#NT-AttValue
 *
 * Literal whitespace other than space that appear in attribute values
 * are serialized as their entity references, so they will be preserved.
 * (In contrast to whitespace literals in the input which are normalized to spaces)
 * @see https://www.w3.org/TR/xml11/#AVNormalize
 * @see https://w3c.github.io/DOM-Parsing/#serializing-an-element-s-attributes
 */
function addSerializedAttribute(buf, qualifiedName, value) {
	buf.push(' ', qualifiedName, '="', value.replace(/[<>&"\t\n\r]/g, _xmlEncoder), '"')
}

function serializeToString(node, buf, isHTML, nodeFilter, visibleNamespaces, requireWellFormed) {
	if (!visibleNamespaces) {
		visibleNamespaces = [];
	}
	walkDOM(node, { ns: visibleNamespaces, isHTML: isHTML }, {
		enter: function (n, ctx) {
			var ns = ctx.ns;
			var html = ctx.isHTML;

			if (nodeFilter) {
				n = nodeFilter(n);
				if (n) {
					if (typeof n == 'string') {
						buf.push(n);
						return null;
					}
				} else {
					return null;
				}
			}

			switch (n.nodeType) {
				case ELEMENT_NODE:
					var attrs = n.attributes;
					var len = attrs.length;
					var nodeName = n.tagName;

					html = NAMESPACE.isHTML(n.namespaceURI) || html;

					var prefixedNodeName = nodeName;
					if (!html && !n.prefix && n.namespaceURI) {
						var defaultNS;
						// lookup current default ns from `xmlns` attribute
						for (var ai = 0; ai < attrs.length; ai++) {
							if (attrs.item(ai).name === 'xmlns') {
								defaultNS = attrs.item(ai).value;
								break;
							}
						}
						if (!defaultNS) {
							// lookup current default ns in visibleNamespaces
							for (var nsi = ns.length - 1; nsi >= 0; nsi--) {
								var nsEntry = ns[nsi];
								if (nsEntry.prefix === '' && nsEntry.namespace === n.namespaceURI) {
									defaultNS = nsEntry.namespace;
									break;
								}
							}
						}
						if (defaultNS !== n.namespaceURI) {
							for (var nsi = ns.length - 1; nsi >= 0; nsi--) {
								var nsEntry = ns[nsi];
								if (nsEntry.namespace === n.namespaceURI) {
									if (nsEntry.prefix) {
										prefixedNodeName = nsEntry.prefix + ':' + nodeName;
									}
									break;
								}
							}
						}
					}

					buf.push('<', prefixedNodeName);

					// Build a fresh namespace snapshot for this element's children.
					// The slice prevents sibling elements from inheriting each other's declarations.
					var childNs = ns.slice();
					for (var i = 0; i < len; i++) {
						var attr = attrs.item(i);
						if (attr.prefix == 'xmlns') {
							childNs.push({ prefix: attr.localName, namespace: attr.value });
						} else if (attr.nodeName == 'xmlns') {
							childNs.push({ prefix: '', namespace: attr.value });
						}
					}

					for (var i = 0; i < len; i++) {
						var attr = attrs.item(i);
						if (needNamespaceDefine(attr, html, childNs)) {
							var attrPrefix = attr.prefix || '';
							var uri = attr.namespaceURI;
							addSerializedAttribute(buf, attrPrefix ? 'xmlns:' + attrPrefix : 'xmlns', uri);
							childNs.push({ prefix: attrPrefix, namespace: uri });
						}
						// Apply nodeFilter and serialize the attribute.
						var filteredAttr = nodeFilter ? nodeFilter(attr) : attr;
						if (filteredAttr) {
							if (typeof filteredAttr === 'string') {
								buf.push(filteredAttr);
							} else {
								addSerializedAttribute(buf, filteredAttr.name, filteredAttr.value);
							}
						}
					}

					// add namespace for current node
					if (nodeName === prefixedNodeName && needNamespaceDefine(n, html, childNs)) {
						var nodePrefix = n.prefix || '';
						var uri = n.namespaceURI;
						addSerializedAttribute(buf, nodePrefix ? 'xmlns:' + nodePrefix : 'xmlns', uri);
						childNs.push({ prefix: nodePrefix, namespace: uri });
					}

					var child = n.firstChild;
					if (child || html && !/^(?:meta|link|img|br|hr|input)$/i.test(nodeName)) {
						buf.push('>');
						if (html && /^script$/i.test(nodeName)) {
							// Inline serialization for <script> children; return null to skip walkDOM descent.
							while (child) {
								if (child.data) {
									buf.push(child.data);
								} else {
									serializeToString(child, buf, html, nodeFilter, childNs.slice(), requireWellFormed);
								}
								child = child.nextSibling;
							}
							buf.push('</', nodeName, '>');
							return null;
						}
						// Return child context; walkDOM descends and exit emits the closing tag.
						return { ns: childNs, isHTML: html, tag: prefixedNodeName };
					} else {
						buf.push('/>');
						return null;
					}

				case DOCUMENT_NODE:
				case DOCUMENT_FRAGMENT_NODE:
					// Descend into children; exit is a no-op (tag is null).
					return { ns: ns.slice(), isHTML: html, tag: null };

				case ATTRIBUTE_NODE:
					addSerializedAttribute(buf, n.name, n.value);
					return null;

				case TEXT_NODE:
					/**
					 * The ampersand character (&) and the left angle bracket (<) must not appear in their literal form,
					 * except when used as markup delimiters, or within a comment, a processing instruction, or a CDATA section.
					 * If they are needed elsewhere, they must be escaped using either numeric character references or the strings
					 * `&amp;` and `&lt;` respectively.
					 * The right angle bracket (>) may be represented using the string " &gt; ", and must, for compatibility,
					 * be escaped using either `&gt;` or a character reference when it appears in the string `]]>` in content,
					 * when that string is not marking the end of a CDATA section.
					 *
					 * In the content of elements, character data is any string of characters
					 * which does not contain the start-delimiter of any markup
					 * and does not include the CDATA-section-close delimiter, `]]>`.
					 *
					 * @see https://www.w3.org/TR/xml/#NT-CharData
					 * @see https://w3c.github.io/DOM-Parsing/#xml-serializing-a-text-node
					 */
					buf.push(n.data.replace(/[<&>]/g, _xmlEncoder));
					return null;

				case CDATA_SECTION_NODE:
					if (requireWellFormed && n.data.indexOf(']]>') !== -1) {
						throw new DOMException(INVALID_STATE_ERR, 'The CDATASection data contains "]]>"');
					}
					buf.push('<![CDATA[', n.data.replace(/]]>/g, ']]]]><![CDATA[>'), ']]>');
					return null;

				case COMMENT_NODE:
					if (requireWellFormed && n.data.indexOf('-->') !== -1) {
						throw new DOMException(INVALID_STATE_ERR, 'The comment node data contains "-->"');
					}
					buf.push('<!--', n.data, '-->');
					return null;

				case DOCUMENT_TYPE_NODE:
					if (requireWellFormed) {
						if (n.publicId && !/^("[\x20\r\na-zA-Z0-9\-()+,.\/:=?;!*#@$_%']*"|'[\x20\r\na-zA-Z0-9\-()+,.\/:=?;!*#@$_%'"]*')$/.test(n.publicId)) {
							throw new DOMException(INVALID_STATE_ERR, 'DocumentType publicId is not a valid PubidLiteral');
						}
						if (n.systemId && !/^("[^"]*"|'[^']*')$/.test(n.systemId)) {
							throw new DOMException(INVALID_STATE_ERR, 'DocumentType systemId is not a valid SystemLiteral');
						}
						if (n.internalSubset && n.internalSubset.indexOf(']>') !== -1) {
							throw new DOMException(INVALID_STATE_ERR, 'DocumentType internalSubset contains "]>"');
						}
					}
					var pubid = n.publicId;
					var sysid = n.systemId;
					buf.push('<!DOCTYPE ', n.name);
					if (pubid) {
						buf.push(' PUBLIC ', pubid);
						if (sysid && sysid != '.') {
							buf.push(' ', sysid);
						}
						buf.push('>');
					} else if (sysid && sysid != '.') {
						buf.push(' SYSTEM ', sysid, '>');
					} else {
						var sub = n.internalSubset;
						if (sub) {
							buf.push(' [', sub, ']');
						}
						buf.push('>');
					}
					return null;

				case PROCESSING_INSTRUCTION_NODE:
					if (requireWellFormed && n.data.indexOf('?>') !== -1) {
						throw new DOMException(INVALID_STATE_ERR, 'The ProcessingInstruction data contains "?>"');
					}
					buf.push('<?', n.target, ' ', n.data, '?>');
					return null;

				case ENTITY_REFERENCE_NODE:
					buf.push('&', n.nodeName, ';');
					return null;

				//case ENTITY_NODE:
				//case NOTATION_NODE:
				default:
					buf.push('??', n.nodeName);
					return null;
			}
		},
		exit: function (n, childCtx) {
			if (childCtx && childCtx.tag) {
				buf.push('</', childCtx.tag, '>');
			}
		},
	});
}
/**
 * Imports a node from a different document into `doc`, creating a new copy.
 * Delegates to {@link walkDOM} for traversal. Each node in the subtree is shallow-cloned,
 * stamped with `doc` as its `ownerDocument`, and detached (`parentNode` set to `null`).
 * Children are imported recursively when `deep` is `true`; for {@link Attr} nodes `deep` is
 * always forced to `true`
 * because an attribute's value lives in a child text node.
 *
 * @param {Document} doc
 * The document that will own the imported node.
 * @param {Node} node
 * The node to import.
 * @param {boolean} deep
 * If `true`, descendants are imported recursively.
 * @returns {Node}
 * The newly imported node, now owned by `doc`.
 */
function importNode(doc, node, deep) {
	var destRoot;
	walkDOM(node, null, {
		enter: function (srcNode, destParent) {
			// Shallow-clone the node and stamp it into the target document.
			var destNode = srcNode.cloneNode(false);
			destNode.ownerDocument = doc;
			destNode.parentNode = null;
			// capture as the root of the imported subtree or attach to parent.
			if (destParent === null) {
				destRoot = destNode;
			} else {
				destParent.appendChild(destNode);
			}
			// ATTRIBUTE_NODE must always be imported deeply: its value lives in a child text node.
			var shouldDeep = srcNode.nodeType === ATTRIBUTE_NODE || deep;
			return shouldDeep ? destNode : null;
		},
	});
	return destRoot;
}
//
//var _relationMap = {firstChild:1,lastChild:1,previousSibling:1,nextSibling:1,
//					attributes:1,childNodes:1,parentNode:1,documentElement:1,doctype,};
function cloneNode(doc, node, deep) {
	var destRoot;
	walkDOM(node, null, {
		enter: function (srcNode, destParent) {
			// 1. Create a blank node of the same type and copy all scalar own properties.
			var destNode = new srcNode.constructor();
			for (var n in srcNode) {
				if (Object.prototype.hasOwnProperty.call(srcNode, n)) {
					var v = srcNode[n];
					if (typeof v != 'object') {
						if (v != destNode[n]) {
							destNode[n] = v;
						}
					}
				}
			}
			if (srcNode.childNodes) {
				destNode.childNodes = new NodeList();
			}
			destNode.ownerDocument = doc;
			// 2. Handle node-type-specific setup.
			//    Attributes are not DOM children, so they are cloned inline here
			//    rather than by walkDOM descent.
			//    ATTRIBUTE_NODE forces deep=true so its own children are walked.
			var shouldDeep = deep;
			switch (destNode.nodeType) {
				case ELEMENT_NODE:
					var attrs = srcNode.attributes;
					var attrs2 = (destNode.attributes = new NamedNodeMap());
					var len = attrs.length;
					attrs2._ownerElement = destNode;
					for (var i = 0; i < len; i++) {
						destNode.setAttributeNode(cloneNode(doc, attrs.item(i), true));
					}
					break;
				case ATTRIBUTE_NODE:
					shouldDeep = true;
			}
			// 3. Attach to parent, or capture as the root of the cloned subtree.
			if (destParent !== null) {
				destParent.appendChild(destNode);
			} else {
				destRoot = destNode;
			}
			// 4. Return destNode as the context for children (causes walkDOM to descend),
			//    or null to skip children (shallow clone).
			return shouldDeep ? destNode : null;
		},
	});
	return destRoot;
}

function __set__(object,key,value){
	object[key] = value
}
//do dynamic
try{
	if(Object.defineProperty){
		Object.defineProperty(LiveNodeList.prototype,'length',{
			get:function(){
				_updateLiveList(this);
				return this.$$length;
			}
		});

		/**
		 * The text content of this node and its descendants.
		 *
		 * Setting `textContent` on an element or document fragment replaces all child nodes with a
		 * single text node; on other nodes it sets `data`, `value`, and `nodeValue` directly.
		 *
		 * @type {string | null}
		 * @see {@link https://dom.spec.whatwg.org/#dom-node-textcontent}
		 */
		Object.defineProperty(Node.prototype, 'textContent', {
			get: function () {
				if (this.nodeType === ELEMENT_NODE || this.nodeType === DOCUMENT_FRAGMENT_NODE) {
					var buf = [];
					walkDOM(this, null, {
						enter: function (n) {
							if (n.nodeType === ELEMENT_NODE || n.nodeType === DOCUMENT_FRAGMENT_NODE) {
								return true; // enter children
							}
							if (n.nodeType === PROCESSING_INSTRUCTION_NODE || n.nodeType === COMMENT_NODE) {
								return null; // excluded from text content
							}
							buf.push(n.nodeValue);
						},
					});
					return buf.join('');
				}
				return this.nodeValue;
			},

			set: function (data) {
				switch (this.nodeType) {
					case ELEMENT_NODE:
					case DOCUMENT_FRAGMENT_NODE:
						while (this.firstChild) {
							this.removeChild(this.firstChild);
						}
						if (data || String(data)) {
							this.appendChild(this.ownerDocument.createTextNode(data));
						}
						break;

					default:
						this.data = data;
						this.value = data;
						this.nodeValue = data;
				}
			},
		})

		__set__ = function(object,key,value){
			//console.log(value)
			object['$$'+key] = value
		}
	}
}catch(e){//ie8
}

//if(typeof require == 'function'){
	exports.DocumentType = DocumentType;
	exports.DOMException = DOMException;
	exports.DOMImplementation = DOMImplementation;
	exports.Element = Element;
	exports.Node = Node;
	exports.NodeList = NodeList;
	exports.walkDOM = walkDOM;
	exports.XMLSerializer = XMLSerializer;
//}


/***/ }),
/* 86 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";


/**
 * Ponyfill for `Array.prototype.find` which is only available in ES6 runtimes.
 *
 * Works with anything that has a `length` property and index access properties, including NodeList.
 *
 * @template {unknown} T
 * @param {Array<T> | ({length:number, [number]: T})} list
 * @param {function (item: T, index: number, list:Array<T> | ({length:number, [number]: T})):boolean} predicate
 * @param {Partial<Pick<ArrayConstructor['prototype'], 'find'>>?} ac `Array.prototype` by default,
 * 				allows injecting a custom implementation in tests
 * @returns {T | undefined}
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find
 * @see https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.find
 */
function find(list, predicate, ac) {
	if (ac === undefined) {
		ac = Array.prototype;
	}
	if (list && typeof ac.find === 'function') {
		return ac.find.call(list, predicate);
	}
	for (var i = 0; i < list.length; i++) {
		if (Object.prototype.hasOwnProperty.call(list, i)) {
			var item = list[i];
			if (predicate.call(undefined, item, i, list)) {
				return item;
			}
		}
	}
}

/**
 * "Shallow freezes" an object to render it immutable.
 * Uses `Object.freeze` if available,
 * otherwise the immutability is only in the type.
 *
 * Is used to create "enum like" objects.
 *
 * @template T
 * @param {T} object the object to freeze
 * @param {Pick<ObjectConstructor, 'freeze'> = Object} oc `Object` by default,
 * 				allows to inject custom object constructor for tests
 * @returns {Readonly<T>}
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
 */
function freeze(object, oc) {
	if (oc === undefined) {
		oc = Object
	}
	return oc && typeof oc.freeze === 'function' ? oc.freeze(object) : object
}

/**
 * Since we can not rely on `Object.assign` we provide a simplified version
 * that is sufficient for our needs.
 *
 * @param {Object} target
 * @param {Object | null | undefined} source
 *
 * @returns {Object} target
 * @throws TypeError if target is not an object
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign
 * @see https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-object.assign
 */
function assign(target, source) {
	if (target === null || typeof target !== 'object') {
		throw new TypeError('target is not an object')
	}
	for (var key in source) {
		if (Object.prototype.hasOwnProperty.call(source, key)) {
			target[key] = source[key]
		}
	}
	return target
}

/**
 * All mime types that are allowed as input to `DOMParser.parseFromString`
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString#Argument02 MDN
 * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#domparsersupportedtype WHATWG HTML Spec
 * @see DOMParser.prototype.parseFromString
 */
var MIME_TYPE = freeze({
	/**
	 * `text/html`, the only mime type that triggers treating an XML document as HTML.
	 *
	 * @see DOMParser.SupportedType.isHTML
	 * @see https://www.iana.org/assignments/media-types/text/html IANA MimeType registration
	 * @see https://en.wikipedia.org/wiki/HTML Wikipedia
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString MDN
	 * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-domparser-parsefromstring WHATWG HTML Spec
	 */
	HTML: 'text/html',

	/**
	 * Helper method to check a mime type if it indicates an HTML document
	 *
	 * @param {string} [value]
	 * @returns {boolean}
	 *
	 * @see https://www.iana.org/assignments/media-types/text/html IANA MimeType registration
	 * @see https://en.wikipedia.org/wiki/HTML Wikipedia
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString MDN
	 * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-domparser-parsefromstring 	 */
	isHTML: function (value) {
		return value === MIME_TYPE.HTML
	},

	/**
	 * `application/xml`, the standard mime type for XML documents.
	 *
	 * @see https://www.iana.org/assignments/media-types/application/xml IANA MimeType registration
	 * @see https://tools.ietf.org/html/rfc7303#section-9.1 RFC 7303
	 * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
	 */
	XML_APPLICATION: 'application/xml',

	/**
	 * `text/html`, an alias for `application/xml`.
	 *
	 * @see https://tools.ietf.org/html/rfc7303#section-9.2 RFC 7303
	 * @see https://www.iana.org/assignments/media-types/text/xml IANA MimeType registration
	 * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
	 */
	XML_TEXT: 'text/xml',

	/**
	 * `application/xhtml+xml`, indicates an XML document that has the default HTML namespace,
	 * but is parsed as an XML document.
	 *
	 * @see https://www.iana.org/assignments/media-types/application/xhtml+xml IANA MimeType registration
	 * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument WHATWG DOM Spec
	 * @see https://en.wikipedia.org/wiki/XHTML Wikipedia
	 */
	XML_XHTML_APPLICATION: 'application/xhtml+xml',

	/**
	 * `image/svg+xml`,
	 *
	 * @see https://www.iana.org/assignments/media-types/image/svg+xml IANA MimeType registration
	 * @see https://www.w3.org/TR/SVG11/ W3C SVG 1.1
	 * @see https://en.wikipedia.org/wiki/Scalable_Vector_Graphics Wikipedia
	 */
	XML_SVG_IMAGE: 'image/svg+xml',
})

/**
 * Namespaces that are used in this code base.
 *
 * @see http://www.w3.org/TR/REC-xml-names
 */
var NAMESPACE = freeze({
	/**
	 * The XHTML namespace.
	 *
	 * @see http://www.w3.org/1999/xhtml
	 */
	HTML: 'http://www.w3.org/1999/xhtml',

	/**
	 * Checks if `uri` equals `NAMESPACE.HTML`.
	 *
	 * @param {string} [uri]
	 *
	 * @see NAMESPACE.HTML
	 */
	isHTML: function (uri) {
		return uri === NAMESPACE.HTML
	},

	/**
	 * The SVG namespace.
	 *
	 * @see http://www.w3.org/2000/svg
	 */
	SVG: 'http://www.w3.org/2000/svg',

	/**
	 * The `xml:` namespace.
	 *
	 * @see http://www.w3.org/XML/1998/namespace
	 */
	XML: 'http://www.w3.org/XML/1998/namespace',

	/**
	 * The `xmlns:` namespace
	 *
	 * @see https://www.w3.org/2000/xmlns/
	 */
	XMLNS: 'http://www.w3.org/2000/xmlns/',
})

exports.assign = assign;
exports.find = find;
exports.freeze = freeze;
exports.MIME_TYPE = MIME_TYPE;
exports.NAMESPACE = NAMESPACE;


/***/ }),
/* 87 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

var conventions = __webpack_require__(86);
var dom = __webpack_require__(85)
var entities = __webpack_require__(88);
var sax = __webpack_require__(89);

var DOMImplementation = dom.DOMImplementation;

var NAMESPACE = conventions.NAMESPACE;

var ParseError = sax.ParseError;
var XMLReader = sax.XMLReader;

/**
 * Normalizes line ending according to https://www.w3.org/TR/xml11/#sec-line-ends:
 *
 * > XML parsed entities are often stored in computer files which,
 * > for editing convenience, are organized into lines.
 * > These lines are typically separated by some combination
 * > of the characters CARRIAGE RETURN (#xD) and LINE FEED (#xA).
 * >
 * > To simplify the tasks of applications, the XML processor must behave
 * > as if it normalized all line breaks in external parsed entities (including the document entity)
 * > on input, before parsing, by translating all of the following to a single #xA character:
 * >
 * > 1. the two-character sequence #xD #xA
 * > 2. the two-character sequence #xD #x85
 * > 3. the single character #x85
 * > 4. the single character #x2028
 * > 5. any #xD character that is not immediately followed by #xA or #x85.
 *
 * @param {string} input
 * @returns {string}
 */
function normalizeLineEndings(input) {
	return input
		.replace(/\r[\n\u0085]/g, '\n')
		.replace(/[\r\u0085\u2028]/g, '\n')
}

/**
 * @typedef Locator
 * @property {number} [columnNumber]
 * @property {number} [lineNumber]
 */

/**
 * @typedef DOMParserOptions
 * @property {DOMHandler} [domBuilder]
 * @property {Function} [errorHandler]
 * @property {(string) => string} [normalizeLineEndings] used to replace line endings before parsing
 * 						defaults to `normalizeLineEndings`
 * @property {Locator} [locator]
 * @property {Record<string, string>} [xmlns]
 *
 * @see normalizeLineEndings
 */

/**
 * The DOMParser interface provides the ability to parse XML or HTML source code
 * from a string into a DOM `Document`.
 *
 * _xmldom is different from the spec in that it allows an `options` parameter,
 * to override the default behavior._
 *
 * @param {DOMParserOptions} [options]
 * @constructor
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser
 * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-parsing-and-serialization
 */
function DOMParser(options){
	this.options = options ||{locator:{}};
}

DOMParser.prototype.parseFromString = function(source,mimeType){
	var options = this.options;
	var sax =  new XMLReader();
	var domBuilder = options.domBuilder || new DOMHandler();//contentHandler and LexicalHandler
	var errorHandler = options.errorHandler;
	var locator = options.locator;
	var defaultNSMap = options.xmlns||{};
	var isHTML = /\/x?html?$/.test(mimeType);//mimeType.toLowerCase().indexOf('html') > -1;
  	var entityMap = isHTML ? entities.HTML_ENTITIES : entities.XML_ENTITIES;
	if(locator){
		domBuilder.setDocumentLocator(locator)
	}

	sax.errorHandler = buildErrorHandler(errorHandler,domBuilder,locator);
	sax.domBuilder = options.domBuilder || domBuilder;
	if(isHTML){
		defaultNSMap[''] = NAMESPACE.HTML;
	}
	defaultNSMap.xml = defaultNSMap.xml || NAMESPACE.XML;
	var normalize = options.normalizeLineEndings || normalizeLineEndings;
	if (source && typeof source === 'string') {
		sax.parse(
			normalize(source),
			defaultNSMap,
			entityMap
		)
	} else {
		sax.errorHandler.error('invalid doc source')
	}
	return domBuilder.doc;
}
function buildErrorHandler(errorImpl,domBuilder,locator){
	if(!errorImpl){
		if(domBuilder instanceof DOMHandler){
			return domBuilder;
		}
		errorImpl = domBuilder ;
	}
	var errorHandler = {}
	var isCallback = errorImpl instanceof Function;
	locator = locator||{}
	function build(key){
		var fn = errorImpl[key];
		if(!fn && isCallback){
			fn = errorImpl.length == 2?function(msg){errorImpl(key,msg)}:errorImpl;
		}
		errorHandler[key] = fn && function(msg){
			fn('[xmldom '+key+']\t'+msg+_locator(locator));
		}||function(){};
	}
	build('warning');
	build('error');
	build('fatalError');
	return errorHandler;
}

//console.log('#\n\n\n\n\n\n\n####')
/**
 * +ContentHandler+ErrorHandler
 * +LexicalHandler+EntityResolver2
 * -DeclHandler-DTDHandler
 *
 * DefaultHandler:EntityResolver, DTDHandler, ContentHandler, ErrorHandler
 * DefaultHandler2:DefaultHandler,LexicalHandler, DeclHandler, EntityResolver2
 * @link http://www.saxproject.org/apidoc/org/xml/sax/helpers/DefaultHandler.html
 */
function DOMHandler() {
    this.cdata = false;
}
function position(locator,node){
	node.lineNumber = locator.lineNumber;
	node.columnNumber = locator.columnNumber;
}
/**
 * @see org.xml.sax.ContentHandler#startDocument
 * @link http://www.saxproject.org/apidoc/org/xml/sax/ContentHandler.html
 */
DOMHandler.prototype = {
	startDocument : function() {
    	this.doc = new DOMImplementation().createDocument(null, null, null);
    	if (this.locator) {
        	this.doc.documentURI = this.locator.systemId;
    	}
	},
	startElement:function(namespaceURI, localName, qName, attrs) {
		var doc = this.doc;
	    var el = doc.createElementNS(namespaceURI, qName||localName);
	    var len = attrs.length;
	    appendElement(this, el);
	    this.currentElement = el;

		this.locator && position(this.locator,el)
	    for (var i = 0 ; i < len; i++) {
	        var namespaceURI = attrs.getURI(i);
	        var value = attrs.getValue(i);
	        var qName = attrs.getQName(i);
			var attr = doc.createAttributeNS(namespaceURI, qName);
			this.locator &&position(attrs.getLocator(i),attr);
			attr.value = attr.nodeValue = value;
			el.setAttributeNode(attr)
	    }
	},
	endElement:function(namespaceURI, localName, qName) {
		var current = this.currentElement
		var tagName = current.tagName;
		this.currentElement = current.parentNode;
	},
	startPrefixMapping:function(prefix, uri) {
	},
	endPrefixMapping:function(prefix) {
	},
	processingInstruction:function(target, data) {
	    var ins = this.doc.createProcessingInstruction(target, data);
	    this.locator && position(this.locator,ins)
	    appendElement(this, ins);
	},
	ignorableWhitespace:function(ch, start, length) {
	},
	characters:function(chars, start, length) {
		chars = _toString.apply(this,arguments)
		//console.log(chars)
		if(chars){
			if (this.cdata) {
				var charNode = this.doc.createCDATASection(chars);
			} else {
				var charNode = this.doc.createTextNode(chars);
			}
			if(this.currentElement){
				this.currentElement.appendChild(charNode);
			}else if(/^\s*$/.test(chars)){
				this.doc.appendChild(charNode);
				//process xml
			}
			this.locator && position(this.locator,charNode)
		}
	},
	skippedEntity:function(name) {
	},
	endDocument:function() {
		this.doc.normalize();
	},
	setDocumentLocator:function (locator) {
	    if(this.locator = locator){// && !('lineNumber' in locator)){
	    	locator.lineNumber = 0;
	    }
	},
	//LexicalHandler
	comment:function(chars, start, length) {
		chars = _toString.apply(this,arguments)
	    var comm = this.doc.createComment(chars);
	    this.locator && position(this.locator,comm)
	    appendElement(this, comm);
	},

	startCDATA:function() {
	    //used in characters() methods
	    this.cdata = true;
	},
	endCDATA:function() {
	    this.cdata = false;
	},

	startDTD:function(name, publicId, systemId) {
		var impl = this.doc.implementation;
	    if (impl && impl.createDocumentType) {
	        var dt = impl.createDocumentType(name, publicId, systemId);
	        this.locator && position(this.locator,dt)
	        appendElement(this, dt);
					this.doc.doctype = dt;
	    }
	},
	/**
	 * @see org.xml.sax.ErrorHandler
	 * @link http://www.saxproject.org/apidoc/org/xml/sax/ErrorHandler.html
	 */
	warning:function(error) {
		console.warn('[xmldom warning]\t'+error,_locator(this.locator));
	},
	error:function(error) {
		console.error('[xmldom error]\t'+error,_locator(this.locator));
	},
	fatalError:function(error) {
		throw new ParseError(error, this.locator);
	}
}
function _locator(l){
	if(l){
		return '\n@'+(l.systemId ||'')+'#[line:'+l.lineNumber+',col:'+l.columnNumber+']'
	}
}
function _toString(chars,start,length){
	if(typeof chars == 'string'){
		return chars.substr(start,length)
	}else{//java sax connect width xmldom on rhino(what about: "? && !(chars instanceof String)")
		if(chars.length >= start+length || start){
			return new java.lang.String(chars,start,length)+'';
		}
		return chars;
	}
}

/*
 * @link http://www.saxproject.org/apidoc/org/xml/sax/ext/LexicalHandler.html
 * used method of org.xml.sax.ext.LexicalHandler:
 *  #comment(chars, start, length)
 *  #startCDATA()
 *  #endCDATA()
 *  #startDTD(name, publicId, systemId)
 *
 *
 * IGNORED method of org.xml.sax.ext.LexicalHandler:
 *  #endDTD()
 *  #startEntity(name)
 *  #endEntity(name)
 *
 *
 * @link http://www.saxproject.org/apidoc/org/xml/sax/ext/DeclHandler.html
 * IGNORED method of org.xml.sax.ext.DeclHandler
 * 	#attributeDecl(eName, aName, type, mode, value)
 *  #elementDecl(name, model)
 *  #externalEntityDecl(name, publicId, systemId)
 *  #internalEntityDecl(name, value)
 * @link http://www.saxproject.org/apidoc/org/xml/sax/ext/EntityResolver2.html
 * IGNORED method of org.xml.sax.EntityResolver2
 *  #resolveEntity(String name,String publicId,String baseURI,String systemId)
 *  #resolveEntity(publicId, systemId)
 *  #getExternalSubset(name, baseURI)
 * @link http://www.saxproject.org/apidoc/org/xml/sax/DTDHandler.html
 * IGNORED method of org.xml.sax.DTDHandler
 *  #notationDecl(name, publicId, systemId) {};
 *  #unparsedEntityDecl(name, publicId, systemId, notationName) {};
 */
"endDTD,startEntity,endEntity,attributeDecl,elementDecl,externalEntityDecl,internalEntityDecl,resolveEntity,getExternalSubset,notationDecl,unparsedEntityDecl".replace(/\w+/g,function(key){
	DOMHandler.prototype[key] = function(){return null}
})

/* Private static helpers treated below as private instance methods, so don't need to add these to the public API; we might use a Relator to also get rid of non-standard public properties */
function appendElement (hander,node) {
    if (!hander.currentElement) {
        hander.doc.appendChild(node);
    } else {
        hander.currentElement.appendChild(node);
    }
}//appendChild and setAttributeNS are preformance key

exports.__DOMHandler = DOMHandler;
exports.normalizeLineEndings = normalizeLineEndings;
exports.DOMParser = DOMParser;


/***/ }),
/* 88 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var freeze = (__webpack_require__(86).freeze);

/**
 * The entities that are predefined in every XML document.
 *
 * @see https://www.w3.org/TR/2006/REC-xml11-20060816/#sec-predefined-ent W3C XML 1.1
 * @see https://www.w3.org/TR/2008/REC-xml-20081126/#sec-predefined-ent W3C XML 1.0
 * @see https://en.wikipedia.org/wiki/List_of_XML_and_HTML_character_entity_references#Predefined_entities_in_XML Wikipedia
 */
exports.XML_ENTITIES = freeze({
	amp: '&',
	apos: "'",
	gt: '>',
	lt: '<',
	quot: '"',
});

/**
 * A map of all entities that are detected in an HTML document.
 * They contain all entries from `XML_ENTITIES`.
 *
 * @see XML_ENTITIES
 * @see DOMParser.parseFromString
 * @see DOMImplementation.prototype.createHTMLDocument
 * @see https://html.spec.whatwg.org/#named-character-references WHATWG HTML(5) Spec
 * @see https://html.spec.whatwg.org/entities.json JSON
 * @see https://www.w3.org/TR/xml-entity-names/ W3C XML Entity Names
 * @see https://www.w3.org/TR/html4/sgml/entities.html W3C HTML4/SGML
 * @see https://en.wikipedia.org/wiki/List_of_XML_and_HTML_character_entity_references#Character_entity_references_in_HTML Wikipedia (HTML)
 * @see https://en.wikipedia.org/wiki/List_of_XML_and_HTML_character_entity_references#Entities_representing_special_characters_in_XHTML Wikpedia (XHTML)
 */
exports.HTML_ENTITIES = freeze({
	Aacute: '\u00C1',
	aacute: '\u00E1',
	Abreve: '\u0102',
	abreve: '\u0103',
	ac: '\u223E',
	acd: '\u223F',
	acE: '\u223E\u0333',
	Acirc: '\u00C2',
	acirc: '\u00E2',
	acute: '\u00B4',
	Acy: '\u0410',
	acy: '\u0430',
	AElig: '\u00C6',
	aelig: '\u00E6',
	af: '\u2061',
	Afr: '\uD835\uDD04',
	afr: '\uD835\uDD1E',
	Agrave: '\u00C0',
	agrave: '\u00E0',
	alefsym: '\u2135',
	aleph: '\u2135',
	Alpha: '\u0391',
	alpha: '\u03B1',
	Amacr: '\u0100',
	amacr: '\u0101',
	amalg: '\u2A3F',
	AMP: '\u0026',
	amp: '\u0026',
	And: '\u2A53',
	and: '\u2227',
	andand: '\u2A55',
	andd: '\u2A5C',
	andslope: '\u2A58',
	andv: '\u2A5A',
	ang: '\u2220',
	ange: '\u29A4',
	angle: '\u2220',
	angmsd: '\u2221',
	angmsdaa: '\u29A8',
	angmsdab: '\u29A9',
	angmsdac: '\u29AA',
	angmsdad: '\u29AB',
	angmsdae: '\u29AC',
	angmsdaf: '\u29AD',
	angmsdag: '\u29AE',
	angmsdah: '\u29AF',
	angrt: '\u221F',
	angrtvb: '\u22BE',
	angrtvbd: '\u299D',
	angsph: '\u2222',
	angst: '\u00C5',
	angzarr: '\u237C',
	Aogon: '\u0104',
	aogon: '\u0105',
	Aopf: '\uD835\uDD38',
	aopf: '\uD835\uDD52',
	ap: '\u2248',
	apacir: '\u2A6F',
	apE: '\u2A70',
	ape: '\u224A',
	apid: '\u224B',
	apos: '\u0027',
	ApplyFunction: '\u2061',
	approx: '\u2248',
	approxeq: '\u224A',
	Aring: '\u00C5',
	aring: '\u00E5',
	Ascr: '\uD835\uDC9C',
	ascr: '\uD835\uDCB6',
	Assign: '\u2254',
	ast: '\u002A',
	asymp: '\u2248',
	asympeq: '\u224D',
	Atilde: '\u00C3',
	atilde: '\u00E3',
	Auml: '\u00C4',
	auml: '\u00E4',
	awconint: '\u2233',
	awint: '\u2A11',
	backcong: '\u224C',
	backepsilon: '\u03F6',
	backprime: '\u2035',
	backsim: '\u223D',
	backsimeq: '\u22CD',
	Backslash: '\u2216',
	Barv: '\u2AE7',
	barvee: '\u22BD',
	Barwed: '\u2306',
	barwed: '\u2305',
	barwedge: '\u2305',
	bbrk: '\u23B5',
	bbrktbrk: '\u23B6',
	bcong: '\u224C',
	Bcy: '\u0411',
	bcy: '\u0431',
	bdquo: '\u201E',
	becaus: '\u2235',
	Because: '\u2235',
	because: '\u2235',
	bemptyv: '\u29B0',
	bepsi: '\u03F6',
	bernou: '\u212C',
	Bernoullis: '\u212C',
	Beta: '\u0392',
	beta: '\u03B2',
	beth: '\u2136',
	between: '\u226C',
	Bfr: '\uD835\uDD05',
	bfr: '\uD835\uDD1F',
	bigcap: '\u22C2',
	bigcirc: '\u25EF',
	bigcup: '\u22C3',
	bigodot: '\u2A00',
	bigoplus: '\u2A01',
	bigotimes: '\u2A02',
	bigsqcup: '\u2A06',
	bigstar: '\u2605',
	bigtriangledown: '\u25BD',
	bigtriangleup: '\u25B3',
	biguplus: '\u2A04',
	bigvee: '\u22C1',
	bigwedge: '\u22C0',
	bkarow: '\u290D',
	blacklozenge: '\u29EB',
	blacksquare: '\u25AA',
	blacktriangle: '\u25B4',
	blacktriangledown: '\u25BE',
	blacktriangleleft: '\u25C2',
	blacktriangleright: '\u25B8',
	blank: '\u2423',
	blk12: '\u2592',
	blk14: '\u2591',
	blk34: '\u2593',
	block: '\u2588',
	bne: '\u003D\u20E5',
	bnequiv: '\u2261\u20E5',
	bNot: '\u2AED',
	bnot: '\u2310',
	Bopf: '\uD835\uDD39',
	bopf: '\uD835\uDD53',
	bot: '\u22A5',
	bottom: '\u22A5',
	bowtie: '\u22C8',
	boxbox: '\u29C9',
	boxDL: '\u2557',
	boxDl: '\u2556',
	boxdL: '\u2555',
	boxdl: '\u2510',
	boxDR: '\u2554',
	boxDr: '\u2553',
	boxdR: '\u2552',
	boxdr: '\u250C',
	boxH: '\u2550',
	boxh: '\u2500',
	boxHD: '\u2566',
	boxHd: '\u2564',
	boxhD: '\u2565',
	boxhd: '\u252C',
	boxHU: '\u2569',
	boxHu: '\u2567',
	boxhU: '\u2568',
	boxhu: '\u2534',
	boxminus: '\u229F',
	boxplus: '\u229E',
	boxtimes: '\u22A0',
	boxUL: '\u255D',
	boxUl: '\u255C',
	boxuL: '\u255B',
	boxul: '\u2518',
	boxUR: '\u255A',
	boxUr: '\u2559',
	boxuR: '\u2558',
	boxur: '\u2514',
	boxV: '\u2551',
	boxv: '\u2502',
	boxVH: '\u256C',
	boxVh: '\u256B',
	boxvH: '\u256A',
	boxvh: '\u253C',
	boxVL: '\u2563',
	boxVl: '\u2562',
	boxvL: '\u2561',
	boxvl: '\u2524',
	boxVR: '\u2560',
	boxVr: '\u255F',
	boxvR: '\u255E',
	boxvr: '\u251C',
	bprime: '\u2035',
	Breve: '\u02D8',
	breve: '\u02D8',
	brvbar: '\u00A6',
	Bscr: '\u212C',
	bscr: '\uD835\uDCB7',
	bsemi: '\u204F',
	bsim: '\u223D',
	bsime: '\u22CD',
	bsol: '\u005C',
	bsolb: '\u29C5',
	bsolhsub: '\u27C8',
	bull: '\u2022',
	bullet: '\u2022',
	bump: '\u224E',
	bumpE: '\u2AAE',
	bumpe: '\u224F',
	Bumpeq: '\u224E',
	bumpeq: '\u224F',
	Cacute: '\u0106',
	cacute: '\u0107',
	Cap: '\u22D2',
	cap: '\u2229',
	capand: '\u2A44',
	capbrcup: '\u2A49',
	capcap: '\u2A4B',
	capcup: '\u2A47',
	capdot: '\u2A40',
	CapitalDifferentialD: '\u2145',
	caps: '\u2229\uFE00',
	caret: '\u2041',
	caron: '\u02C7',
	Cayleys: '\u212D',
	ccaps: '\u2A4D',
	Ccaron: '\u010C',
	ccaron: '\u010D',
	Ccedil: '\u00C7',
	ccedil: '\u00E7',
	Ccirc: '\u0108',
	ccirc: '\u0109',
	Cconint: '\u2230',
	ccups: '\u2A4C',
	ccupssm: '\u2A50',
	Cdot: '\u010A',
	cdot: '\u010B',
	cedil: '\u00B8',
	Cedilla: '\u00B8',
	cemptyv: '\u29B2',
	cent: '\u00A2',
	CenterDot: '\u00B7',
	centerdot: '\u00B7',
	Cfr: '\u212D',
	cfr: '\uD835\uDD20',
	CHcy: '\u0427',
	chcy: '\u0447',
	check: '\u2713',
	checkmark: '\u2713',
	Chi: '\u03A7',
	chi: '\u03C7',
	cir: '\u25CB',
	circ: '\u02C6',
	circeq: '\u2257',
	circlearrowleft: '\u21BA',
	circlearrowright: '\u21BB',
	circledast: '\u229B',
	circledcirc: '\u229A',
	circleddash: '\u229D',
	CircleDot: '\u2299',
	circledR: '\u00AE',
	circledS: '\u24C8',
	CircleMinus: '\u2296',
	CirclePlus: '\u2295',
	CircleTimes: '\u2297',
	cirE: '\u29C3',
	cire: '\u2257',
	cirfnint: '\u2A10',
	cirmid: '\u2AEF',
	cirscir: '\u29C2',
	ClockwiseContourIntegral: '\u2232',
	CloseCurlyDoubleQuote: '\u201D',
	CloseCurlyQuote: '\u2019',
	clubs: '\u2663',
	clubsuit: '\u2663',
	Colon: '\u2237',
	colon: '\u003A',
	Colone: '\u2A74',
	colone: '\u2254',
	coloneq: '\u2254',
	comma: '\u002C',
	commat: '\u0040',
	comp: '\u2201',
	compfn: '\u2218',
	complement: '\u2201',
	complexes: '\u2102',
	cong: '\u2245',
	congdot: '\u2A6D',
	Congruent: '\u2261',
	Conint: '\u222F',
	conint: '\u222E',
	ContourIntegral: '\u222E',
	Copf: '\u2102',
	copf: '\uD835\uDD54',
	coprod: '\u2210',
	Coproduct: '\u2210',
	COPY: '\u00A9',
	copy: '\u00A9',
	copysr: '\u2117',
	CounterClockwiseContourIntegral: '\u2233',
	crarr: '\u21B5',
	Cross: '\u2A2F',
	cross: '\u2717',
	Cscr: '\uD835\uDC9E',
	cscr: '\uD835\uDCB8',
	csub: '\u2ACF',
	csube: '\u2AD1',
	csup: '\u2AD0',
	csupe: '\u2AD2',
	ctdot: '\u22EF',
	cudarrl: '\u2938',
	cudarrr: '\u2935',
	cuepr: '\u22DE',
	cuesc: '\u22DF',
	cularr: '\u21B6',
	cularrp: '\u293D',
	Cup: '\u22D3',
	cup: '\u222A',
	cupbrcap: '\u2A48',
	CupCap: '\u224D',
	cupcap: '\u2A46',
	cupcup: '\u2A4A',
	cupdot: '\u228D',
	cupor: '\u2A45',
	cups: '\u222A\uFE00',
	curarr: '\u21B7',
	curarrm: '\u293C',
	curlyeqprec: '\u22DE',
	curlyeqsucc: '\u22DF',
	curlyvee: '\u22CE',
	curlywedge: '\u22CF',
	curren: '\u00A4',
	curvearrowleft: '\u21B6',
	curvearrowright: '\u21B7',
	cuvee: '\u22CE',
	cuwed: '\u22CF',
	cwconint: '\u2232',
	cwint: '\u2231',
	cylcty: '\u232D',
	Dagger: '\u2021',
	dagger: '\u2020',
	daleth: '\u2138',
	Darr: '\u21A1',
	dArr: '\u21D3',
	darr: '\u2193',
	dash: '\u2010',
	Dashv: '\u2AE4',
	dashv: '\u22A3',
	dbkarow: '\u290F',
	dblac: '\u02DD',
	Dcaron: '\u010E',
	dcaron: '\u010F',
	Dcy: '\u0414',
	dcy: '\u0434',
	DD: '\u2145',
	dd: '\u2146',
	ddagger: '\u2021',
	ddarr: '\u21CA',
	DDotrahd: '\u2911',
	ddotseq: '\u2A77',
	deg: '\u00B0',
	Del: '\u2207',
	Delta: '\u0394',
	delta: '\u03B4',
	demptyv: '\u29B1',
	dfisht: '\u297F',
	Dfr: '\uD835\uDD07',
	dfr: '\uD835\uDD21',
	dHar: '\u2965',
	dharl: '\u21C3',
	dharr: '\u21C2',
	DiacriticalAcute: '\u00B4',
	DiacriticalDot: '\u02D9',
	DiacriticalDoubleAcute: '\u02DD',
	DiacriticalGrave: '\u0060',
	DiacriticalTilde: '\u02DC',
	diam: '\u22C4',
	Diamond: '\u22C4',
	diamond: '\u22C4',
	diamondsuit: '\u2666',
	diams: '\u2666',
	die: '\u00A8',
	DifferentialD: '\u2146',
	digamma: '\u03DD',
	disin: '\u22F2',
	div: '\u00F7',
	divide: '\u00F7',
	divideontimes: '\u22C7',
	divonx: '\u22C7',
	DJcy: '\u0402',
	djcy: '\u0452',
	dlcorn: '\u231E',
	dlcrop: '\u230D',
	dollar: '\u0024',
	Dopf: '\uD835\uDD3B',
	dopf: '\uD835\uDD55',
	Dot: '\u00A8',
	dot: '\u02D9',
	DotDot: '\u20DC',
	doteq: '\u2250',
	doteqdot: '\u2251',
	DotEqual: '\u2250',
	dotminus: '\u2238',
	dotplus: '\u2214',
	dotsquare: '\u22A1',
	doublebarwedge: '\u2306',
	DoubleContourIntegral: '\u222F',
	DoubleDot: '\u00A8',
	DoubleDownArrow: '\u21D3',
	DoubleLeftArrow: '\u21D0',
	DoubleLeftRightArrow: '\u21D4',
	DoubleLeftTee: '\u2AE4',
	DoubleLongLeftArrow: '\u27F8',
	DoubleLongLeftRightArrow: '\u27FA',
	DoubleLongRightArrow: '\u27F9',
	DoubleRightArrow: '\u21D2',
	DoubleRightTee: '\u22A8',
	DoubleUpArrow: '\u21D1',
	DoubleUpDownArrow: '\u21D5',
	DoubleVerticalBar: '\u2225',
	DownArrow: '\u2193',
	Downarrow: '\u21D3',
	downarrow: '\u2193',
	DownArrowBar: '\u2913',
	DownArrowUpArrow: '\u21F5',
	DownBreve: '\u0311',
	downdownarrows: '\u21CA',
	downharpoonleft: '\u21C3',
	downharpoonright: '\u21C2',
	DownLeftRightVector: '\u2950',
	DownLeftTeeVector: '\u295E',
	DownLeftVector: '\u21BD',
	DownLeftVectorBar: '\u2956',
	DownRightTeeVector: '\u295F',
	DownRightVector: '\u21C1',
	DownRightVectorBar: '\u2957',
	DownTee: '\u22A4',
	DownTeeArrow: '\u21A7',
	drbkarow: '\u2910',
	drcorn: '\u231F',
	drcrop: '\u230C',
	Dscr: '\uD835\uDC9F',
	dscr: '\uD835\uDCB9',
	DScy: '\u0405',
	dscy: '\u0455',
	dsol: '\u29F6',
	Dstrok: '\u0110',
	dstrok: '\u0111',
	dtdot: '\u22F1',
	dtri: '\u25BF',
	dtrif: '\u25BE',
	duarr: '\u21F5',
	duhar: '\u296F',
	dwangle: '\u29A6',
	DZcy: '\u040F',
	dzcy: '\u045F',
	dzigrarr: '\u27FF',
	Eacute: '\u00C9',
	eacute: '\u00E9',
	easter: '\u2A6E',
	Ecaron: '\u011A',
	ecaron: '\u011B',
	ecir: '\u2256',
	Ecirc: '\u00CA',
	ecirc: '\u00EA',
	ecolon: '\u2255',
	Ecy: '\u042D',
	ecy: '\u044D',
	eDDot: '\u2A77',
	Edot: '\u0116',
	eDot: '\u2251',
	edot: '\u0117',
	ee: '\u2147',
	efDot: '\u2252',
	Efr: '\uD835\uDD08',
	efr: '\uD835\uDD22',
	eg: '\u2A9A',
	Egrave: '\u00C8',
	egrave: '\u00E8',
	egs: '\u2A96',
	egsdot: '\u2A98',
	el: '\u2A99',
	Element: '\u2208',
	elinters: '\u23E7',
	ell: '\u2113',
	els: '\u2A95',
	elsdot: '\u2A97',
	Emacr: '\u0112',
	emacr: '\u0113',
	empty: '\u2205',
	emptyset: '\u2205',
	EmptySmallSquare: '\u25FB',
	emptyv: '\u2205',
	EmptyVerySmallSquare: '\u25AB',
	emsp: '\u2003',
	emsp13: '\u2004',
	emsp14: '\u2005',
	ENG: '\u014A',
	eng: '\u014B',
	ensp: '\u2002',
	Eogon: '\u0118',
	eogon: '\u0119',
	Eopf: '\uD835\uDD3C',
	eopf: '\uD835\uDD56',
	epar: '\u22D5',
	eparsl: '\u29E3',
	eplus: '\u2A71',
	epsi: '\u03B5',
	Epsilon: '\u0395',
	epsilon: '\u03B5',
	epsiv: '\u03F5',
	eqcirc: '\u2256',
	eqcolon: '\u2255',
	eqsim: '\u2242',
	eqslantgtr: '\u2A96',
	eqslantless: '\u2A95',
	Equal: '\u2A75',
	equals: '\u003D',
	EqualTilde: '\u2242',
	equest: '\u225F',
	Equilibrium: '\u21CC',
	equiv: '\u2261',
	equivDD: '\u2A78',
	eqvparsl: '\u29E5',
	erarr: '\u2971',
	erDot: '\u2253',
	Escr: '\u2130',
	escr: '\u212F',
	esdot: '\u2250',
	Esim: '\u2A73',
	esim: '\u2242',
	Eta: '\u0397',
	eta: '\u03B7',
	ETH: '\u00D0',
	eth: '\u00F0',
	Euml: '\u00CB',
	euml: '\u00EB',
	euro: '\u20AC',
	excl: '\u0021',
	exist: '\u2203',
	Exists: '\u2203',
	expectation: '\u2130',
	ExponentialE: '\u2147',
	exponentiale: '\u2147',
	fallingdotseq: '\u2252',
	Fcy: '\u0424',
	fcy: '\u0444',
	female: '\u2640',
	ffilig: '\uFB03',
	fflig: '\uFB00',
	ffllig: '\uFB04',
	Ffr: '\uD835\uDD09',
	ffr: '\uD835\uDD23',
	filig: '\uFB01',
	FilledSmallSquare: '\u25FC',
	FilledVerySmallSquare: '\u25AA',
	fjlig: '\u0066\u006A',
	flat: '\u266D',
	fllig: '\uFB02',
	fltns: '\u25B1',
	fnof: '\u0192',
	Fopf: '\uD835\uDD3D',
	fopf: '\uD835\uDD57',
	ForAll: '\u2200',
	forall: '\u2200',
	fork: '\u22D4',
	forkv: '\u2AD9',
	Fouriertrf: '\u2131',
	fpartint: '\u2A0D',
	frac12: '\u00BD',
	frac13: '\u2153',
	frac14: '\u00BC',
	frac15: '\u2155',
	frac16: '\u2159',
	frac18: '\u215B',
	frac23: '\u2154',
	frac25: '\u2156',
	frac34: '\u00BE',
	frac35: '\u2157',
	frac38: '\u215C',
	frac45: '\u2158',
	frac56: '\u215A',
	frac58: '\u215D',
	frac78: '\u215E',
	frasl: '\u2044',
	frown: '\u2322',
	Fscr: '\u2131',
	fscr: '\uD835\uDCBB',
	gacute: '\u01F5',
	Gamma: '\u0393',
	gamma: '\u03B3',
	Gammad: '\u03DC',
	gammad: '\u03DD',
	gap: '\u2A86',
	Gbreve: '\u011E',
	gbreve: '\u011F',
	Gcedil: '\u0122',
	Gcirc: '\u011C',
	gcirc: '\u011D',
	Gcy: '\u0413',
	gcy: '\u0433',
	Gdot: '\u0120',
	gdot: '\u0121',
	gE: '\u2267',
	ge: '\u2265',
	gEl: '\u2A8C',
	gel: '\u22DB',
	geq: '\u2265',
	geqq: '\u2267',
	geqslant: '\u2A7E',
	ges: '\u2A7E',
	gescc: '\u2AA9',
	gesdot: '\u2A80',
	gesdoto: '\u2A82',
	gesdotol: '\u2A84',
	gesl: '\u22DB\uFE00',
	gesles: '\u2A94',
	Gfr: '\uD835\uDD0A',
	gfr: '\uD835\uDD24',
	Gg: '\u22D9',
	gg: '\u226B',
	ggg: '\u22D9',
	gimel: '\u2137',
	GJcy: '\u0403',
	gjcy: '\u0453',
	gl: '\u2277',
	gla: '\u2AA5',
	glE: '\u2A92',
	glj: '\u2AA4',
	gnap: '\u2A8A',
	gnapprox: '\u2A8A',
	gnE: '\u2269',
	gne: '\u2A88',
	gneq: '\u2A88',
	gneqq: '\u2269',
	gnsim: '\u22E7',
	Gopf: '\uD835\uDD3E',
	gopf: '\uD835\uDD58',
	grave: '\u0060',
	GreaterEqual: '\u2265',
	GreaterEqualLess: '\u22DB',
	GreaterFullEqual: '\u2267',
	GreaterGreater: '\u2AA2',
	GreaterLess: '\u2277',
	GreaterSlantEqual: '\u2A7E',
	GreaterTilde: '\u2273',
	Gscr: '\uD835\uDCA2',
	gscr: '\u210A',
	gsim: '\u2273',
	gsime: '\u2A8E',
	gsiml: '\u2A90',
	Gt: '\u226B',
	GT: '\u003E',
	gt: '\u003E',
	gtcc: '\u2AA7',
	gtcir: '\u2A7A',
	gtdot: '\u22D7',
	gtlPar: '\u2995',
	gtquest: '\u2A7C',
	gtrapprox: '\u2A86',
	gtrarr: '\u2978',
	gtrdot: '\u22D7',
	gtreqless: '\u22DB',
	gtreqqless: '\u2A8C',
	gtrless: '\u2277',
	gtrsim: '\u2273',
	gvertneqq: '\u2269\uFE00',
	gvnE: '\u2269\uFE00',
	Hacek: '\u02C7',
	hairsp: '\u200A',
	half: '\u00BD',
	hamilt: '\u210B',
	HARDcy: '\u042A',
	hardcy: '\u044A',
	hArr: '\u21D4',
	harr: '\u2194',
	harrcir: '\u2948',
	harrw: '\u21AD',
	Hat: '\u005E',
	hbar: '\u210F',
	Hcirc: '\u0124',
	hcirc: '\u0125',
	hearts: '\u2665',
	heartsuit: '\u2665',
	hellip: '\u2026',
	hercon: '\u22B9',
	Hfr: '\u210C',
	hfr: '\uD835\uDD25',
	HilbertSpace: '\u210B',
	hksearow: '\u2925',
	hkswarow: '\u2926',
	hoarr: '\u21FF',
	homtht: '\u223B',
	hookleftarrow: '\u21A9',
	hookrightarrow: '\u21AA',
	Hopf: '\u210D',
	hopf: '\uD835\uDD59',
	horbar: '\u2015',
	HorizontalLine: '\u2500',
	Hscr: '\u210B',
	hscr: '\uD835\uDCBD',
	hslash: '\u210F',
	Hstrok: '\u0126',
	hstrok: '\u0127',
	HumpDownHump: '\u224E',
	HumpEqual: '\u224F',
	hybull: '\u2043',
	hyphen: '\u2010',
	Iacute: '\u00CD',
	iacute: '\u00ED',
	ic: '\u2063',
	Icirc: '\u00CE',
	icirc: '\u00EE',
	Icy: '\u0418',
	icy: '\u0438',
	Idot: '\u0130',
	IEcy: '\u0415',
	iecy: '\u0435',
	iexcl: '\u00A1',
	iff: '\u21D4',
	Ifr: '\u2111',
	ifr: '\uD835\uDD26',
	Igrave: '\u00CC',
	igrave: '\u00EC',
	ii: '\u2148',
	iiiint: '\u2A0C',
	iiint: '\u222D',
	iinfin: '\u29DC',
	iiota: '\u2129',
	IJlig: '\u0132',
	ijlig: '\u0133',
	Im: '\u2111',
	Imacr: '\u012A',
	imacr: '\u012B',
	image: '\u2111',
	ImaginaryI: '\u2148',
	imagline: '\u2110',
	imagpart: '\u2111',
	imath: '\u0131',
	imof: '\u22B7',
	imped: '\u01B5',
	Implies: '\u21D2',
	in: '\u2208',
	incare: '\u2105',
	infin: '\u221E',
	infintie: '\u29DD',
	inodot: '\u0131',
	Int: '\u222C',
	int: '\u222B',
	intcal: '\u22BA',
	integers: '\u2124',
	Integral: '\u222B',
	intercal: '\u22BA',
	Intersection: '\u22C2',
	intlarhk: '\u2A17',
	intprod: '\u2A3C',
	InvisibleComma: '\u2063',
	InvisibleTimes: '\u2062',
	IOcy: '\u0401',
	iocy: '\u0451',
	Iogon: '\u012E',
	iogon: '\u012F',
	Iopf: '\uD835\uDD40',
	iopf: '\uD835\uDD5A',
	Iota: '\u0399',
	iota: '\u03B9',
	iprod: '\u2A3C',
	iquest: '\u00BF',
	Iscr: '\u2110',
	iscr: '\uD835\uDCBE',
	isin: '\u2208',
	isindot: '\u22F5',
	isinE: '\u22F9',
	isins: '\u22F4',
	isinsv: '\u22F3',
	isinv: '\u2208',
	it: '\u2062',
	Itilde: '\u0128',
	itilde: '\u0129',
	Iukcy: '\u0406',
	iukcy: '\u0456',
	Iuml: '\u00CF',
	iuml: '\u00EF',
	Jcirc: '\u0134',
	jcirc: '\u0135',
	Jcy: '\u0419',
	jcy: '\u0439',
	Jfr: '\uD835\uDD0D',
	jfr: '\uD835\uDD27',
	jmath: '\u0237',
	Jopf: '\uD835\uDD41',
	jopf: '\uD835\uDD5B',
	Jscr: '\uD835\uDCA5',
	jscr: '\uD835\uDCBF',
	Jsercy: '\u0408',
	jsercy: '\u0458',
	Jukcy: '\u0404',
	jukcy: '\u0454',
	Kappa: '\u039A',
	kappa: '\u03BA',
	kappav: '\u03F0',
	Kcedil: '\u0136',
	kcedil: '\u0137',
	Kcy: '\u041A',
	kcy: '\u043A',
	Kfr: '\uD835\uDD0E',
	kfr: '\uD835\uDD28',
	kgreen: '\u0138',
	KHcy: '\u0425',
	khcy: '\u0445',
	KJcy: '\u040C',
	kjcy: '\u045C',
	Kopf: '\uD835\uDD42',
	kopf: '\uD835\uDD5C',
	Kscr: '\uD835\uDCA6',
	kscr: '\uD835\uDCC0',
	lAarr: '\u21DA',
	Lacute: '\u0139',
	lacute: '\u013A',
	laemptyv: '\u29B4',
	lagran: '\u2112',
	Lambda: '\u039B',
	lambda: '\u03BB',
	Lang: '\u27EA',
	lang: '\u27E8',
	langd: '\u2991',
	langle: '\u27E8',
	lap: '\u2A85',
	Laplacetrf: '\u2112',
	laquo: '\u00AB',
	Larr: '\u219E',
	lArr: '\u21D0',
	larr: '\u2190',
	larrb: '\u21E4',
	larrbfs: '\u291F',
	larrfs: '\u291D',
	larrhk: '\u21A9',
	larrlp: '\u21AB',
	larrpl: '\u2939',
	larrsim: '\u2973',
	larrtl: '\u21A2',
	lat: '\u2AAB',
	lAtail: '\u291B',
	latail: '\u2919',
	late: '\u2AAD',
	lates: '\u2AAD\uFE00',
	lBarr: '\u290E',
	lbarr: '\u290C',
	lbbrk: '\u2772',
	lbrace: '\u007B',
	lbrack: '\u005B',
	lbrke: '\u298B',
	lbrksld: '\u298F',
	lbrkslu: '\u298D',
	Lcaron: '\u013D',
	lcaron: '\u013E',
	Lcedil: '\u013B',
	lcedil: '\u013C',
	lceil: '\u2308',
	lcub: '\u007B',
	Lcy: '\u041B',
	lcy: '\u043B',
	ldca: '\u2936',
	ldquo: '\u201C',
	ldquor: '\u201E',
	ldrdhar: '\u2967',
	ldrushar: '\u294B',
	ldsh: '\u21B2',
	lE: '\u2266',
	le: '\u2264',
	LeftAngleBracket: '\u27E8',
	LeftArrow: '\u2190',
	Leftarrow: '\u21D0',
	leftarrow: '\u2190',
	LeftArrowBar: '\u21E4',
	LeftArrowRightArrow: '\u21C6',
	leftarrowtail: '\u21A2',
	LeftCeiling: '\u2308',
	LeftDoubleBracket: '\u27E6',
	LeftDownTeeVector: '\u2961',
	LeftDownVector: '\u21C3',
	LeftDownVectorBar: '\u2959',
	LeftFloor: '\u230A',
	leftharpoondown: '\u21BD',
	leftharpoonup: '\u21BC',
	leftleftarrows: '\u21C7',
	LeftRightArrow: '\u2194',
	Leftrightarrow: '\u21D4',
	leftrightarrow: '\u2194',
	leftrightarrows: '\u21C6',
	leftrightharpoons: '\u21CB',
	leftrightsquigarrow: '\u21AD',
	LeftRightVector: '\u294E',
	LeftTee: '\u22A3',
	LeftTeeArrow: '\u21A4',
	LeftTeeVector: '\u295A',
	leftthreetimes: '\u22CB',
	LeftTriangle: '\u22B2',
	LeftTriangleBar: '\u29CF',
	LeftTriangleEqual: '\u22B4',
	LeftUpDownVector: '\u2951',
	LeftUpTeeVector: '\u2960',
	LeftUpVector: '\u21BF',
	LeftUpVectorBar: '\u2958',
	LeftVector: '\u21BC',
	LeftVectorBar: '\u2952',
	lEg: '\u2A8B',
	leg: '\u22DA',
	leq: '\u2264',
	leqq: '\u2266',
	leqslant: '\u2A7D',
	les: '\u2A7D',
	lescc: '\u2AA8',
	lesdot: '\u2A7F',
	lesdoto: '\u2A81',
	lesdotor: '\u2A83',
	lesg: '\u22DA\uFE00',
	lesges: '\u2A93',
	lessapprox: '\u2A85',
	lessdot: '\u22D6',
	lesseqgtr: '\u22DA',
	lesseqqgtr: '\u2A8B',
	LessEqualGreater: '\u22DA',
	LessFullEqual: '\u2266',
	LessGreater: '\u2276',
	lessgtr: '\u2276',
	LessLess: '\u2AA1',
	lesssim: '\u2272',
	LessSlantEqual: '\u2A7D',
	LessTilde: '\u2272',
	lfisht: '\u297C',
	lfloor: '\u230A',
	Lfr: '\uD835\uDD0F',
	lfr: '\uD835\uDD29',
	lg: '\u2276',
	lgE: '\u2A91',
	lHar: '\u2962',
	lhard: '\u21BD',
	lharu: '\u21BC',
	lharul: '\u296A',
	lhblk: '\u2584',
	LJcy: '\u0409',
	ljcy: '\u0459',
	Ll: '\u22D8',
	ll: '\u226A',
	llarr: '\u21C7',
	llcorner: '\u231E',
	Lleftarrow: '\u21DA',
	llhard: '\u296B',
	lltri: '\u25FA',
	Lmidot: '\u013F',
	lmidot: '\u0140',
	lmoust: '\u23B0',
	lmoustache: '\u23B0',
	lnap: '\u2A89',
	lnapprox: '\u2A89',
	lnE: '\u2268',
	lne: '\u2A87',
	lneq: '\u2A87',
	lneqq: '\u2268',
	lnsim: '\u22E6',
	loang: '\u27EC',
	loarr: '\u21FD',
	lobrk: '\u27E6',
	LongLeftArrow: '\u27F5',
	Longleftarrow: '\u27F8',
	longleftarrow: '\u27F5',
	LongLeftRightArrow: '\u27F7',
	Longleftrightarrow: '\u27FA',
	longleftrightarrow: '\u27F7',
	longmapsto: '\u27FC',
	LongRightArrow: '\u27F6',
	Longrightarrow: '\u27F9',
	longrightarrow: '\u27F6',
	looparrowleft: '\u21AB',
	looparrowright: '\u21AC',
	lopar: '\u2985',
	Lopf: '\uD835\uDD43',
	lopf: '\uD835\uDD5D',
	loplus: '\u2A2D',
	lotimes: '\u2A34',
	lowast: '\u2217',
	lowbar: '\u005F',
	LowerLeftArrow: '\u2199',
	LowerRightArrow: '\u2198',
	loz: '\u25CA',
	lozenge: '\u25CA',
	lozf: '\u29EB',
	lpar: '\u0028',
	lparlt: '\u2993',
	lrarr: '\u21C6',
	lrcorner: '\u231F',
	lrhar: '\u21CB',
	lrhard: '\u296D',
	lrm: '\u200E',
	lrtri: '\u22BF',
	lsaquo: '\u2039',
	Lscr: '\u2112',
	lscr: '\uD835\uDCC1',
	Lsh: '\u21B0',
	lsh: '\u21B0',
	lsim: '\u2272',
	lsime: '\u2A8D',
	lsimg: '\u2A8F',
	lsqb: '\u005B',
	lsquo: '\u2018',
	lsquor: '\u201A',
	Lstrok: '\u0141',
	lstrok: '\u0142',
	Lt: '\u226A',
	LT: '\u003C',
	lt: '\u003C',
	ltcc: '\u2AA6',
	ltcir: '\u2A79',
	ltdot: '\u22D6',
	lthree: '\u22CB',
	ltimes: '\u22C9',
	ltlarr: '\u2976',
	ltquest: '\u2A7B',
	ltri: '\u25C3',
	ltrie: '\u22B4',
	ltrif: '\u25C2',
	ltrPar: '\u2996',
	lurdshar: '\u294A',
	luruhar: '\u2966',
	lvertneqq: '\u2268\uFE00',
	lvnE: '\u2268\uFE00',
	macr: '\u00AF',
	male: '\u2642',
	malt: '\u2720',
	maltese: '\u2720',
	Map: '\u2905',
	map: '\u21A6',
	mapsto: '\u21A6',
	mapstodown: '\u21A7',
	mapstoleft: '\u21A4',
	mapstoup: '\u21A5',
	marker: '\u25AE',
	mcomma: '\u2A29',
	Mcy: '\u041C',
	mcy: '\u043C',
	mdash: '\u2014',
	mDDot: '\u223A',
	measuredangle: '\u2221',
	MediumSpace: '\u205F',
	Mellintrf: '\u2133',
	Mfr: '\uD835\uDD10',
	mfr: '\uD835\uDD2A',
	mho: '\u2127',
	micro: '\u00B5',
	mid: '\u2223',
	midast: '\u002A',
	midcir: '\u2AF0',
	middot: '\u00B7',
	minus: '\u2212',
	minusb: '\u229F',
	minusd: '\u2238',
	minusdu: '\u2A2A',
	MinusPlus: '\u2213',
	mlcp: '\u2ADB',
	mldr: '\u2026',
	mnplus: '\u2213',
	models: '\u22A7',
	Mopf: '\uD835\uDD44',
	mopf: '\uD835\uDD5E',
	mp: '\u2213',
	Mscr: '\u2133',
	mscr: '\uD835\uDCC2',
	mstpos: '\u223E',
	Mu: '\u039C',
	mu: '\u03BC',
	multimap: '\u22B8',
	mumap: '\u22B8',
	nabla: '\u2207',
	Nacute: '\u0143',
	nacute: '\u0144',
	nang: '\u2220\u20D2',
	nap: '\u2249',
	napE: '\u2A70\u0338',
	napid: '\u224B\u0338',
	napos: '\u0149',
	napprox: '\u2249',
	natur: '\u266E',
	natural: '\u266E',
	naturals: '\u2115',
	nbsp: '\u00A0',
	nbump: '\u224E\u0338',
	nbumpe: '\u224F\u0338',
	ncap: '\u2A43',
	Ncaron: '\u0147',
	ncaron: '\u0148',
	Ncedil: '\u0145',
	ncedil: '\u0146',
	ncong: '\u2247',
	ncongdot: '\u2A6D\u0338',
	ncup: '\u2A42',
	Ncy: '\u041D',
	ncy: '\u043D',
	ndash: '\u2013',
	ne: '\u2260',
	nearhk: '\u2924',
	neArr: '\u21D7',
	nearr: '\u2197',
	nearrow: '\u2197',
	nedot: '\u2250\u0338',
	NegativeMediumSpace: '\u200B',
	NegativeThickSpace: '\u200B',
	NegativeThinSpace: '\u200B',
	NegativeVeryThinSpace: '\u200B',
	nequiv: '\u2262',
	nesear: '\u2928',
	nesim: '\u2242\u0338',
	NestedGreaterGreater: '\u226B',
	NestedLessLess: '\u226A',
	NewLine: '\u000A',
	nexist: '\u2204',
	nexists: '\u2204',
	Nfr: '\uD835\uDD11',
	nfr: '\uD835\uDD2B',
	ngE: '\u2267\u0338',
	nge: '\u2271',
	ngeq: '\u2271',
	ngeqq: '\u2267\u0338',
	ngeqslant: '\u2A7E\u0338',
	nges: '\u2A7E\u0338',
	nGg: '\u22D9\u0338',
	ngsim: '\u2275',
	nGt: '\u226B\u20D2',
	ngt: '\u226F',
	ngtr: '\u226F',
	nGtv: '\u226B\u0338',
	nhArr: '\u21CE',
	nharr: '\u21AE',
	nhpar: '\u2AF2',
	ni: '\u220B',
	nis: '\u22FC',
	nisd: '\u22FA',
	niv: '\u220B',
	NJcy: '\u040A',
	njcy: '\u045A',
	nlArr: '\u21CD',
	nlarr: '\u219A',
	nldr: '\u2025',
	nlE: '\u2266\u0338',
	nle: '\u2270',
	nLeftarrow: '\u21CD',
	nleftarrow: '\u219A',
	nLeftrightarrow: '\u21CE',
	nleftrightarrow: '\u21AE',
	nleq: '\u2270',
	nleqq: '\u2266\u0338',
	nleqslant: '\u2A7D\u0338',
	nles: '\u2A7D\u0338',
	nless: '\u226E',
	nLl: '\u22D8\u0338',
	nlsim: '\u2274',
	nLt: '\u226A\u20D2',
	nlt: '\u226E',
	nltri: '\u22EA',
	nltrie: '\u22EC',
	nLtv: '\u226A\u0338',
	nmid: '\u2224',
	NoBreak: '\u2060',
	NonBreakingSpace: '\u00A0',
	Nopf: '\u2115',
	nopf: '\uD835\uDD5F',
	Not: '\u2AEC',
	not: '\u00AC',
	NotCongruent: '\u2262',
	NotCupCap: '\u226D',
	NotDoubleVerticalBar: '\u2226',
	NotElement: '\u2209',
	NotEqual: '\u2260',
	NotEqualTilde: '\u2242\u0338',
	NotExists: '\u2204',
	NotGreater: '\u226F',
	NotGreaterEqual: '\u2271',
	NotGreaterFullEqual: '\u2267\u0338',
	NotGreaterGreater: '\u226B\u0338',
	NotGreaterLess: '\u2279',
	NotGreaterSlantEqual: '\u2A7E\u0338',
	NotGreaterTilde: '\u2275',
	NotHumpDownHump: '\u224E\u0338',
	NotHumpEqual: '\u224F\u0338',
	notin: '\u2209',
	notindot: '\u22F5\u0338',
	notinE: '\u22F9\u0338',
	notinva: '\u2209',
	notinvb: '\u22F7',
	notinvc: '\u22F6',
	NotLeftTriangle: '\u22EA',
	NotLeftTriangleBar: '\u29CF\u0338',
	NotLeftTriangleEqual: '\u22EC',
	NotLess: '\u226E',
	NotLessEqual: '\u2270',
	NotLessGreater: '\u2278',
	NotLessLess: '\u226A\u0338',
	NotLessSlantEqual: '\u2A7D\u0338',
	NotLessTilde: '\u2274',
	NotNestedGreaterGreater: '\u2AA2\u0338',
	NotNestedLessLess: '\u2AA1\u0338',
	notni: '\u220C',
	notniva: '\u220C',
	notnivb: '\u22FE',
	notnivc: '\u22FD',
	NotPrecedes: '\u2280',
	NotPrecedesEqual: '\u2AAF\u0338',
	NotPrecedesSlantEqual: '\u22E0',
	NotReverseElement: '\u220C',
	NotRightTriangle: '\u22EB',
	NotRightTriangleBar: '\u29D0\u0338',
	NotRightTriangleEqual: '\u22ED',
	NotSquareSubset: '\u228F\u0338',
	NotSquareSubsetEqual: '\u22E2',
	NotSquareSuperset: '\u2290\u0338',
	NotSquareSupersetEqual: '\u22E3',
	NotSubset: '\u2282\u20D2',
	NotSubsetEqual: '\u2288',
	NotSucceeds: '\u2281',
	NotSucceedsEqual: '\u2AB0\u0338',
	NotSucceedsSlantEqual: '\u22E1',
	NotSucceedsTilde: '\u227F\u0338',
	NotSuperset: '\u2283\u20D2',
	NotSupersetEqual: '\u2289',
	NotTilde: '\u2241',
	NotTildeEqual: '\u2244',
	NotTildeFullEqual: '\u2247',
	NotTildeTilde: '\u2249',
	NotVerticalBar: '\u2224',
	npar: '\u2226',
	nparallel: '\u2226',
	nparsl: '\u2AFD\u20E5',
	npart: '\u2202\u0338',
	npolint: '\u2A14',
	npr: '\u2280',
	nprcue: '\u22E0',
	npre: '\u2AAF\u0338',
	nprec: '\u2280',
	npreceq: '\u2AAF\u0338',
	nrArr: '\u21CF',
	nrarr: '\u219B',
	nrarrc: '\u2933\u0338',
	nrarrw: '\u219D\u0338',
	nRightarrow: '\u21CF',
	nrightarrow: '\u219B',
	nrtri: '\u22EB',
	nrtrie: '\u22ED',
	nsc: '\u2281',
	nsccue: '\u22E1',
	nsce: '\u2AB0\u0338',
	Nscr: '\uD835\uDCA9',
	nscr: '\uD835\uDCC3',
	nshortmid: '\u2224',
	nshortparallel: '\u2226',
	nsim: '\u2241',
	nsime: '\u2244',
	nsimeq: '\u2244',
	nsmid: '\u2224',
	nspar: '\u2226',
	nsqsube: '\u22E2',
	nsqsupe: '\u22E3',
	nsub: '\u2284',
	nsubE: '\u2AC5\u0338',
	nsube: '\u2288',
	nsubset: '\u2282\u20D2',
	nsubseteq: '\u2288',
	nsubseteqq: '\u2AC5\u0338',
	nsucc: '\u2281',
	nsucceq: '\u2AB0\u0338',
	nsup: '\u2285',
	nsupE: '\u2AC6\u0338',
	nsupe: '\u2289',
	nsupset: '\u2283\u20D2',
	nsupseteq: '\u2289',
	nsupseteqq: '\u2AC6\u0338',
	ntgl: '\u2279',
	Ntilde: '\u00D1',
	ntilde: '\u00F1',
	ntlg: '\u2278',
	ntriangleleft: '\u22EA',
	ntrianglelefteq: '\u22EC',
	ntriangleright: '\u22EB',
	ntrianglerighteq: '\u22ED',
	Nu: '\u039D',
	nu: '\u03BD',
	num: '\u0023',
	numero: '\u2116',
	numsp: '\u2007',
	nvap: '\u224D\u20D2',
	nVDash: '\u22AF',
	nVdash: '\u22AE',
	nvDash: '\u22AD',
	nvdash: '\u22AC',
	nvge: '\u2265\u20D2',
	nvgt: '\u003E\u20D2',
	nvHarr: '\u2904',
	nvinfin: '\u29DE',
	nvlArr: '\u2902',
	nvle: '\u2264\u20D2',
	nvlt: '\u003C\u20D2',
	nvltrie: '\u22B4\u20D2',
	nvrArr: '\u2903',
	nvrtrie: '\u22B5\u20D2',
	nvsim: '\u223C\u20D2',
	nwarhk: '\u2923',
	nwArr: '\u21D6',
	nwarr: '\u2196',
	nwarrow: '\u2196',
	nwnear: '\u2927',
	Oacute: '\u00D3',
	oacute: '\u00F3',
	oast: '\u229B',
	ocir: '\u229A',
	Ocirc: '\u00D4',
	ocirc: '\u00F4',
	Ocy: '\u041E',
	ocy: '\u043E',
	odash: '\u229D',
	Odblac: '\u0150',
	odblac: '\u0151',
	odiv: '\u2A38',
	odot: '\u2299',
	odsold: '\u29BC',
	OElig: '\u0152',
	oelig: '\u0153',
	ofcir: '\u29BF',
	Ofr: '\uD835\uDD12',
	ofr: '\uD835\uDD2C',
	ogon: '\u02DB',
	Ograve: '\u00D2',
	ograve: '\u00F2',
	ogt: '\u29C1',
	ohbar: '\u29B5',
	ohm: '\u03A9',
	oint: '\u222E',
	olarr: '\u21BA',
	olcir: '\u29BE',
	olcross: '\u29BB',
	oline: '\u203E',
	olt: '\u29C0',
	Omacr: '\u014C',
	omacr: '\u014D',
	Omega: '\u03A9',
	omega: '\u03C9',
	Omicron: '\u039F',
	omicron: '\u03BF',
	omid: '\u29B6',
	ominus: '\u2296',
	Oopf: '\uD835\uDD46',
	oopf: '\uD835\uDD60',
	opar: '\u29B7',
	OpenCurlyDoubleQuote: '\u201C',
	OpenCurlyQuote: '\u2018',
	operp: '\u29B9',
	oplus: '\u2295',
	Or: '\u2A54',
	or: '\u2228',
	orarr: '\u21BB',
	ord: '\u2A5D',
	order: '\u2134',
	orderof: '\u2134',
	ordf: '\u00AA',
	ordm: '\u00BA',
	origof: '\u22B6',
	oror: '\u2A56',
	orslope: '\u2A57',
	orv: '\u2A5B',
	oS: '\u24C8',
	Oscr: '\uD835\uDCAA',
	oscr: '\u2134',
	Oslash: '\u00D8',
	oslash: '\u00F8',
	osol: '\u2298',
	Otilde: '\u00D5',
	otilde: '\u00F5',
	Otimes: '\u2A37',
	otimes: '\u2297',
	otimesas: '\u2A36',
	Ouml: '\u00D6',
	ouml: '\u00F6',
	ovbar: '\u233D',
	OverBar: '\u203E',
	OverBrace: '\u23DE',
	OverBracket: '\u23B4',
	OverParenthesis: '\u23DC',
	par: '\u2225',
	para: '\u00B6',
	parallel: '\u2225',
	parsim: '\u2AF3',
	parsl: '\u2AFD',
	part: '\u2202',
	PartialD: '\u2202',
	Pcy: '\u041F',
	pcy: '\u043F',
	percnt: '\u0025',
	period: '\u002E',
	permil: '\u2030',
	perp: '\u22A5',
	pertenk: '\u2031',
	Pfr: '\uD835\uDD13',
	pfr: '\uD835\uDD2D',
	Phi: '\u03A6',
	phi: '\u03C6',
	phiv: '\u03D5',
	phmmat: '\u2133',
	phone: '\u260E',
	Pi: '\u03A0',
	pi: '\u03C0',
	pitchfork: '\u22D4',
	piv: '\u03D6',
	planck: '\u210F',
	planckh: '\u210E',
	plankv: '\u210F',
	plus: '\u002B',
	plusacir: '\u2A23',
	plusb: '\u229E',
	pluscir: '\u2A22',
	plusdo: '\u2214',
	plusdu: '\u2A25',
	pluse: '\u2A72',
	PlusMinus: '\u00B1',
	plusmn: '\u00B1',
	plussim: '\u2A26',
	plustwo: '\u2A27',
	pm: '\u00B1',
	Poincareplane: '\u210C',
	pointint: '\u2A15',
	Popf: '\u2119',
	popf: '\uD835\uDD61',
	pound: '\u00A3',
	Pr: '\u2ABB',
	pr: '\u227A',
	prap: '\u2AB7',
	prcue: '\u227C',
	prE: '\u2AB3',
	pre: '\u2AAF',
	prec: '\u227A',
	precapprox: '\u2AB7',
	preccurlyeq: '\u227C',
	Precedes: '\u227A',
	PrecedesEqual: '\u2AAF',
	PrecedesSlantEqual: '\u227C',
	PrecedesTilde: '\u227E',
	preceq: '\u2AAF',
	precnapprox: '\u2AB9',
	precneqq: '\u2AB5',
	precnsim: '\u22E8',
	precsim: '\u227E',
	Prime: '\u2033',
	prime: '\u2032',
	primes: '\u2119',
	prnap: '\u2AB9',
	prnE: '\u2AB5',
	prnsim: '\u22E8',
	prod: '\u220F',
	Product: '\u220F',
	profalar: '\u232E',
	profline: '\u2312',
	profsurf: '\u2313',
	prop: '\u221D',
	Proportion: '\u2237',
	Proportional: '\u221D',
	propto: '\u221D',
	prsim: '\u227E',
	prurel: '\u22B0',
	Pscr: '\uD835\uDCAB',
	pscr: '\uD835\uDCC5',
	Psi: '\u03A8',
	psi: '\u03C8',
	puncsp: '\u2008',
	Qfr: '\uD835\uDD14',
	qfr: '\uD835\uDD2E',
	qint: '\u2A0C',
	Qopf: '\u211A',
	qopf: '\uD835\uDD62',
	qprime: '\u2057',
	Qscr: '\uD835\uDCAC',
	qscr: '\uD835\uDCC6',
	quaternions: '\u210D',
	quatint: '\u2A16',
	quest: '\u003F',
	questeq: '\u225F',
	QUOT: '\u0022',
	quot: '\u0022',
	rAarr: '\u21DB',
	race: '\u223D\u0331',
	Racute: '\u0154',
	racute: '\u0155',
	radic: '\u221A',
	raemptyv: '\u29B3',
	Rang: '\u27EB',
	rang: '\u27E9',
	rangd: '\u2992',
	range: '\u29A5',
	rangle: '\u27E9',
	raquo: '\u00BB',
	Rarr: '\u21A0',
	rArr: '\u21D2',
	rarr: '\u2192',
	rarrap: '\u2975',
	rarrb: '\u21E5',
	rarrbfs: '\u2920',
	rarrc: '\u2933',
	rarrfs: '\u291E',
	rarrhk: '\u21AA',
	rarrlp: '\u21AC',
	rarrpl: '\u2945',
	rarrsim: '\u2974',
	Rarrtl: '\u2916',
	rarrtl: '\u21A3',
	rarrw: '\u219D',
	rAtail: '\u291C',
	ratail: '\u291A',
	ratio: '\u2236',
	rationals: '\u211A',
	RBarr: '\u2910',
	rBarr: '\u290F',
	rbarr: '\u290D',
	rbbrk: '\u2773',
	rbrace: '\u007D',
	rbrack: '\u005D',
	rbrke: '\u298C',
	rbrksld: '\u298E',
	rbrkslu: '\u2990',
	Rcaron: '\u0158',
	rcaron: '\u0159',
	Rcedil: '\u0156',
	rcedil: '\u0157',
	rceil: '\u2309',
	rcub: '\u007D',
	Rcy: '\u0420',
	rcy: '\u0440',
	rdca: '\u2937',
	rdldhar: '\u2969',
	rdquo: '\u201D',
	rdquor: '\u201D',
	rdsh: '\u21B3',
	Re: '\u211C',
	real: '\u211C',
	realine: '\u211B',
	realpart: '\u211C',
	reals: '\u211D',
	rect: '\u25AD',
	REG: '\u00AE',
	reg: '\u00AE',
	ReverseElement: '\u220B',
	ReverseEquilibrium: '\u21CB',
	ReverseUpEquilibrium: '\u296F',
	rfisht: '\u297D',
	rfloor: '\u230B',
	Rfr: '\u211C',
	rfr: '\uD835\uDD2F',
	rHar: '\u2964',
	rhard: '\u21C1',
	rharu: '\u21C0',
	rharul: '\u296C',
	Rho: '\u03A1',
	rho: '\u03C1',
	rhov: '\u03F1',
	RightAngleBracket: '\u27E9',
	RightArrow: '\u2192',
	Rightarrow: '\u21D2',
	rightarrow: '\u2192',
	RightArrowBar: '\u21E5',
	RightArrowLeftArrow: '\u21C4',
	rightarrowtail: '\u21A3',
	RightCeiling: '\u2309',
	RightDoubleBracket: '\u27E7',
	RightDownTeeVector: '\u295D',
	RightDownVector: '\u21C2',
	RightDownVectorBar: '\u2955',
	RightFloor: '\u230B',
	rightharpoondown: '\u21C1',
	rightharpoonup: '\u21C0',
	rightleftarrows: '\u21C4',
	rightleftharpoons: '\u21CC',
	rightrightarrows: '\u21C9',
	rightsquigarrow: '\u219D',
	RightTee: '\u22A2',
	RightTeeArrow: '\u21A6',
	RightTeeVector: '\u295B',
	rightthreetimes: '\u22CC',
	RightTriangle: '\u22B3',
	RightTriangleBar: '\u29D0',
	RightTriangleEqual: '\u22B5',
	RightUpDownVector: '\u294F',
	RightUpTeeVector: '\u295C',
	RightUpVector: '\u21BE',
	RightUpVectorBar: '\u2954',
	RightVector: '\u21C0',
	RightVectorBar: '\u2953',
	ring: '\u02DA',
	risingdotseq: '\u2253',
	rlarr: '\u21C4',
	rlhar: '\u21CC',
	rlm: '\u200F',
	rmoust: '\u23B1',
	rmoustache: '\u23B1',
	rnmid: '\u2AEE',
	roang: '\u27ED',
	roarr: '\u21FE',
	robrk: '\u27E7',
	ropar: '\u2986',
	Ropf: '\u211D',
	ropf: '\uD835\uDD63',
	roplus: '\u2A2E',
	rotimes: '\u2A35',
	RoundImplies: '\u2970',
	rpar: '\u0029',
	rpargt: '\u2994',
	rppolint: '\u2A12',
	rrarr: '\u21C9',
	Rrightarrow: '\u21DB',
	rsaquo: '\u203A',
	Rscr: '\u211B',
	rscr: '\uD835\uDCC7',
	Rsh: '\u21B1',
	rsh: '\u21B1',
	rsqb: '\u005D',
	rsquo: '\u2019',
	rsquor: '\u2019',
	rthree: '\u22CC',
	rtimes: '\u22CA',
	rtri: '\u25B9',
	rtrie: '\u22B5',
	rtrif: '\u25B8',
	rtriltri: '\u29CE',
	RuleDelayed: '\u29F4',
	ruluhar: '\u2968',
	rx: '\u211E',
	Sacute: '\u015A',
	sacute: '\u015B',
	sbquo: '\u201A',
	Sc: '\u2ABC',
	sc: '\u227B',
	scap: '\u2AB8',
	Scaron: '\u0160',
	scaron: '\u0161',
	sccue: '\u227D',
	scE: '\u2AB4',
	sce: '\u2AB0',
	Scedil: '\u015E',
	scedil: '\u015F',
	Scirc: '\u015C',
	scirc: '\u015D',
	scnap: '\u2ABA',
	scnE: '\u2AB6',
	scnsim: '\u22E9',
	scpolint: '\u2A13',
	scsim: '\u227F',
	Scy: '\u0421',
	scy: '\u0441',
	sdot: '\u22C5',
	sdotb: '\u22A1',
	sdote: '\u2A66',
	searhk: '\u2925',
	seArr: '\u21D8',
	searr: '\u2198',
	searrow: '\u2198',
	sect: '\u00A7',
	semi: '\u003B',
	seswar: '\u2929',
	setminus: '\u2216',
	setmn: '\u2216',
	sext: '\u2736',
	Sfr: '\uD835\uDD16',
	sfr: '\uD835\uDD30',
	sfrown: '\u2322',
	sharp: '\u266F',
	SHCHcy: '\u0429',
	shchcy: '\u0449',
	SHcy: '\u0428',
	shcy: '\u0448',
	ShortDownArrow: '\u2193',
	ShortLeftArrow: '\u2190',
	shortmid: '\u2223',
	shortparallel: '\u2225',
	ShortRightArrow: '\u2192',
	ShortUpArrow: '\u2191',
	shy: '\u00AD',
	Sigma: '\u03A3',
	sigma: '\u03C3',
	sigmaf: '\u03C2',
	sigmav: '\u03C2',
	sim: '\u223C',
	simdot: '\u2A6A',
	sime: '\u2243',
	simeq: '\u2243',
	simg: '\u2A9E',
	simgE: '\u2AA0',
	siml: '\u2A9D',
	simlE: '\u2A9F',
	simne: '\u2246',
	simplus: '\u2A24',
	simrarr: '\u2972',
	slarr: '\u2190',
	SmallCircle: '\u2218',
	smallsetminus: '\u2216',
	smashp: '\u2A33',
	smeparsl: '\u29E4',
	smid: '\u2223',
	smile: '\u2323',
	smt: '\u2AAA',
	smte: '\u2AAC',
	smtes: '\u2AAC\uFE00',
	SOFTcy: '\u042C',
	softcy: '\u044C',
	sol: '\u002F',
	solb: '\u29C4',
	solbar: '\u233F',
	Sopf: '\uD835\uDD4A',
	sopf: '\uD835\uDD64',
	spades: '\u2660',
	spadesuit: '\u2660',
	spar: '\u2225',
	sqcap: '\u2293',
	sqcaps: '\u2293\uFE00',
	sqcup: '\u2294',
	sqcups: '\u2294\uFE00',
	Sqrt: '\u221A',
	sqsub: '\u228F',
	sqsube: '\u2291',
	sqsubset: '\u228F',
	sqsubseteq: '\u2291',
	sqsup: '\u2290',
	sqsupe: '\u2292',
	sqsupset: '\u2290',
	sqsupseteq: '\u2292',
	squ: '\u25A1',
	Square: '\u25A1',
	square: '\u25A1',
	SquareIntersection: '\u2293',
	SquareSubset: '\u228F',
	SquareSubsetEqual: '\u2291',
	SquareSuperset: '\u2290',
	SquareSupersetEqual: '\u2292',
	SquareUnion: '\u2294',
	squarf: '\u25AA',
	squf: '\u25AA',
	srarr: '\u2192',
	Sscr: '\uD835\uDCAE',
	sscr: '\uD835\uDCC8',
	ssetmn: '\u2216',
	ssmile: '\u2323',
	sstarf: '\u22C6',
	Star: '\u22C6',
	star: '\u2606',
	starf: '\u2605',
	straightepsilon: '\u03F5',
	straightphi: '\u03D5',
	strns: '\u00AF',
	Sub: '\u22D0',
	sub: '\u2282',
	subdot: '\u2ABD',
	subE: '\u2AC5',
	sube: '\u2286',
	subedot: '\u2AC3',
	submult: '\u2AC1',
	subnE: '\u2ACB',
	subne: '\u228A',
	subplus: '\u2ABF',
	subrarr: '\u2979',
	Subset: '\u22D0',
	subset: '\u2282',
	subseteq: '\u2286',
	subseteqq: '\u2AC5',
	SubsetEqual: '\u2286',
	subsetneq: '\u228A',
	subsetneqq: '\u2ACB',
	subsim: '\u2AC7',
	subsub: '\u2AD5',
	subsup: '\u2AD3',
	succ: '\u227B',
	succapprox: '\u2AB8',
	succcurlyeq: '\u227D',
	Succeeds: '\u227B',
	SucceedsEqual: '\u2AB0',
	SucceedsSlantEqual: '\u227D',
	SucceedsTilde: '\u227F',
	succeq: '\u2AB0',
	succnapprox: '\u2ABA',
	succneqq: '\u2AB6',
	succnsim: '\u22E9',
	succsim: '\u227F',
	SuchThat: '\u220B',
	Sum: '\u2211',
	sum: '\u2211',
	sung: '\u266A',
	Sup: '\u22D1',
	sup: '\u2283',
	sup1: '\u00B9',
	sup2: '\u00B2',
	sup3: '\u00B3',
	supdot: '\u2ABE',
	supdsub: '\u2AD8',
	supE: '\u2AC6',
	supe: '\u2287',
	supedot: '\u2AC4',
	Superset: '\u2283',
	SupersetEqual: '\u2287',
	suphsol: '\u27C9',
	suphsub: '\u2AD7',
	suplarr: '\u297B',
	supmult: '\u2AC2',
	supnE: '\u2ACC',
	supne: '\u228B',
	supplus: '\u2AC0',
	Supset: '\u22D1',
	supset: '\u2283',
	supseteq: '\u2287',
	supseteqq: '\u2AC6',
	supsetneq: '\u228B',
	supsetneqq: '\u2ACC',
	supsim: '\u2AC8',
	supsub: '\u2AD4',
	supsup: '\u2AD6',
	swarhk: '\u2926',
	swArr: '\u21D9',
	swarr: '\u2199',
	swarrow: '\u2199',
	swnwar: '\u292A',
	szlig: '\u00DF',
	Tab: '\u0009',
	target: '\u2316',
	Tau: '\u03A4',
	tau: '\u03C4',
	tbrk: '\u23B4',
	Tcaron: '\u0164',
	tcaron: '\u0165',
	Tcedil: '\u0162',
	tcedil: '\u0163',
	Tcy: '\u0422',
	tcy: '\u0442',
	tdot: '\u20DB',
	telrec: '\u2315',
	Tfr: '\uD835\uDD17',
	tfr: '\uD835\uDD31',
	there4: '\u2234',
	Therefore: '\u2234',
	therefore: '\u2234',
	Theta: '\u0398',
	theta: '\u03B8',
	thetasym: '\u03D1',
	thetav: '\u03D1',
	thickapprox: '\u2248',
	thicksim: '\u223C',
	ThickSpace: '\u205F\u200A',
	thinsp: '\u2009',
	ThinSpace: '\u2009',
	thkap: '\u2248',
	thksim: '\u223C',
	THORN: '\u00DE',
	thorn: '\u00FE',
	Tilde: '\u223C',
	tilde: '\u02DC',
	TildeEqual: '\u2243',
	TildeFullEqual: '\u2245',
	TildeTilde: '\u2248',
	times: '\u00D7',
	timesb: '\u22A0',
	timesbar: '\u2A31',
	timesd: '\u2A30',
	tint: '\u222D',
	toea: '\u2928',
	top: '\u22A4',
	topbot: '\u2336',
	topcir: '\u2AF1',
	Topf: '\uD835\uDD4B',
	topf: '\uD835\uDD65',
	topfork: '\u2ADA',
	tosa: '\u2929',
	tprime: '\u2034',
	TRADE: '\u2122',
	trade: '\u2122',
	triangle: '\u25B5',
	triangledown: '\u25BF',
	triangleleft: '\u25C3',
	trianglelefteq: '\u22B4',
	triangleq: '\u225C',
	triangleright: '\u25B9',
	trianglerighteq: '\u22B5',
	tridot: '\u25EC',
	trie: '\u225C',
	triminus: '\u2A3A',
	TripleDot: '\u20DB',
	triplus: '\u2A39',
	trisb: '\u29CD',
	tritime: '\u2A3B',
	trpezium: '\u23E2',
	Tscr: '\uD835\uDCAF',
	tscr: '\uD835\uDCC9',
	TScy: '\u0426',
	tscy: '\u0446',
	TSHcy: '\u040B',
	tshcy: '\u045B',
	Tstrok: '\u0166',
	tstrok: '\u0167',
	twixt: '\u226C',
	twoheadleftarrow: '\u219E',
	twoheadrightarrow: '\u21A0',
	Uacute: '\u00DA',
	uacute: '\u00FA',
	Uarr: '\u219F',
	uArr: '\u21D1',
	uarr: '\u2191',
	Uarrocir: '\u2949',
	Ubrcy: '\u040E',
	ubrcy: '\u045E',
	Ubreve: '\u016C',
	ubreve: '\u016D',
	Ucirc: '\u00DB',
	ucirc: '\u00FB',
	Ucy: '\u0423',
	ucy: '\u0443',
	udarr: '\u21C5',
	Udblac: '\u0170',
	udblac: '\u0171',
	udhar: '\u296E',
	ufisht: '\u297E',
	Ufr: '\uD835\uDD18',
	ufr: '\uD835\uDD32',
	Ugrave: '\u00D9',
	ugrave: '\u00F9',
	uHar: '\u2963',
	uharl: '\u21BF',
	uharr: '\u21BE',
	uhblk: '\u2580',
	ulcorn: '\u231C',
	ulcorner: '\u231C',
	ulcrop: '\u230F',
	ultri: '\u25F8',
	Umacr: '\u016A',
	umacr: '\u016B',
	uml: '\u00A8',
	UnderBar: '\u005F',
	UnderBrace: '\u23DF',
	UnderBracket: '\u23B5',
	UnderParenthesis: '\u23DD',
	Union: '\u22C3',
	UnionPlus: '\u228E',
	Uogon: '\u0172',
	uogon: '\u0173',
	Uopf: '\uD835\uDD4C',
	uopf: '\uD835\uDD66',
	UpArrow: '\u2191',
	Uparrow: '\u21D1',
	uparrow: '\u2191',
	UpArrowBar: '\u2912',
	UpArrowDownArrow: '\u21C5',
	UpDownArrow: '\u2195',
	Updownarrow: '\u21D5',
	updownarrow: '\u2195',
	UpEquilibrium: '\u296E',
	upharpoonleft: '\u21BF',
	upharpoonright: '\u21BE',
	uplus: '\u228E',
	UpperLeftArrow: '\u2196',
	UpperRightArrow: '\u2197',
	Upsi: '\u03D2',
	upsi: '\u03C5',
	upsih: '\u03D2',
	Upsilon: '\u03A5',
	upsilon: '\u03C5',
	UpTee: '\u22A5',
	UpTeeArrow: '\u21A5',
	upuparrows: '\u21C8',
	urcorn: '\u231D',
	urcorner: '\u231D',
	urcrop: '\u230E',
	Uring: '\u016E',
	uring: '\u016F',
	urtri: '\u25F9',
	Uscr: '\uD835\uDCB0',
	uscr: '\uD835\uDCCA',
	utdot: '\u22F0',
	Utilde: '\u0168',
	utilde: '\u0169',
	utri: '\u25B5',
	utrif: '\u25B4',
	uuarr: '\u21C8',
	Uuml: '\u00DC',
	uuml: '\u00FC',
	uwangle: '\u29A7',
	vangrt: '\u299C',
	varepsilon: '\u03F5',
	varkappa: '\u03F0',
	varnothing: '\u2205',
	varphi: '\u03D5',
	varpi: '\u03D6',
	varpropto: '\u221D',
	vArr: '\u21D5',
	varr: '\u2195',
	varrho: '\u03F1',
	varsigma: '\u03C2',
	varsubsetneq: '\u228A\uFE00',
	varsubsetneqq: '\u2ACB\uFE00',
	varsupsetneq: '\u228B\uFE00',
	varsupsetneqq: '\u2ACC\uFE00',
	vartheta: '\u03D1',
	vartriangleleft: '\u22B2',
	vartriangleright: '\u22B3',
	Vbar: '\u2AEB',
	vBar: '\u2AE8',
	vBarv: '\u2AE9',
	Vcy: '\u0412',
	vcy: '\u0432',
	VDash: '\u22AB',
	Vdash: '\u22A9',
	vDash: '\u22A8',
	vdash: '\u22A2',
	Vdashl: '\u2AE6',
	Vee: '\u22C1',
	vee: '\u2228',
	veebar: '\u22BB',
	veeeq: '\u225A',
	vellip: '\u22EE',
	Verbar: '\u2016',
	verbar: '\u007C',
	Vert: '\u2016',
	vert: '\u007C',
	VerticalBar: '\u2223',
	VerticalLine: '\u007C',
	VerticalSeparator: '\u2758',
	VerticalTilde: '\u2240',
	VeryThinSpace: '\u200A',
	Vfr: '\uD835\uDD19',
	vfr: '\uD835\uDD33',
	vltri: '\u22B2',
	vnsub: '\u2282\u20D2',
	vnsup: '\u2283\u20D2',
	Vopf: '\uD835\uDD4D',
	vopf: '\uD835\uDD67',
	vprop: '\u221D',
	vrtri: '\u22B3',
	Vscr: '\uD835\uDCB1',
	vscr: '\uD835\uDCCB',
	vsubnE: '\u2ACB\uFE00',
	vsubne: '\u228A\uFE00',
	vsupnE: '\u2ACC\uFE00',
	vsupne: '\u228B\uFE00',
	Vvdash: '\u22AA',
	vzigzag: '\u299A',
	Wcirc: '\u0174',
	wcirc: '\u0175',
	wedbar: '\u2A5F',
	Wedge: '\u22C0',
	wedge: '\u2227',
	wedgeq: '\u2259',
	weierp: '\u2118',
	Wfr: '\uD835\uDD1A',
	wfr: '\uD835\uDD34',
	Wopf: '\uD835\uDD4E',
	wopf: '\uD835\uDD68',
	wp: '\u2118',
	wr: '\u2240',
	wreath: '\u2240',
	Wscr: '\uD835\uDCB2',
	wscr: '\uD835\uDCCC',
	xcap: '\u22C2',
	xcirc: '\u25EF',
	xcup: '\u22C3',
	xdtri: '\u25BD',
	Xfr: '\uD835\uDD1B',
	xfr: '\uD835\uDD35',
	xhArr: '\u27FA',
	xharr: '\u27F7',
	Xi: '\u039E',
	xi: '\u03BE',
	xlArr: '\u27F8',
	xlarr: '\u27F5',
	xmap: '\u27FC',
	xnis: '\u22FB',
	xodot: '\u2A00',
	Xopf: '\uD835\uDD4F',
	xopf: '\uD835\uDD69',
	xoplus: '\u2A01',
	xotime: '\u2A02',
	xrArr: '\u27F9',
	xrarr: '\u27F6',
	Xscr: '\uD835\uDCB3',
	xscr: '\uD835\uDCCD',
	xsqcup: '\u2A06',
	xuplus: '\u2A04',
	xutri: '\u25B3',
	xvee: '\u22C1',
	xwedge: '\u22C0',
	Yacute: '\u00DD',
	yacute: '\u00FD',
	YAcy: '\u042F',
	yacy: '\u044F',
	Ycirc: '\u0176',
	ycirc: '\u0177',
	Ycy: '\u042B',
	ycy: '\u044B',
	yen: '\u00A5',
	Yfr: '\uD835\uDD1C',
	yfr: '\uD835\uDD36',
	YIcy: '\u0407',
	yicy: '\u0457',
	Yopf: '\uD835\uDD50',
	yopf: '\uD835\uDD6A',
	Yscr: '\uD835\uDCB4',
	yscr: '\uD835\uDCCE',
	YUcy: '\u042E',
	yucy: '\u044E',
	Yuml: '\u0178',
	yuml: '\u00FF',
	Zacute: '\u0179',
	zacute: '\u017A',
	Zcaron: '\u017D',
	zcaron: '\u017E',
	Zcy: '\u0417',
	zcy: '\u0437',
	Zdot: '\u017B',
	zdot: '\u017C',
	zeetrf: '\u2128',
	ZeroWidthSpace: '\u200B',
	Zeta: '\u0396',
	zeta: '\u03B6',
	Zfr: '\u2128',
	zfr: '\uD835\uDD37',
	ZHcy: '\u0416',
	zhcy: '\u0436',
	zigrarr: '\u21DD',
	Zopf: '\u2124',
	zopf: '\uD835\uDD6B',
	Zscr: '\uD835\uDCB5',
	zscr: '\uD835\uDCCF',
	zwj: '\u200D',
	zwnj: '\u200C',
});

/**
 * @deprecated use `HTML_ENTITIES` instead
 * @see HTML_ENTITIES
 */
exports.entityMap = exports.HTML_ENTITIES;


/***/ }),
/* 89 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

var NAMESPACE = (__webpack_require__(86).NAMESPACE);

//[4]   	NameStartChar	   ::=   	":" | [A-Z] | "_" | [a-z] | [#xC0-#xD6] | [#xD8-#xF6] | [#xF8-#x2FF] | [#x370-#x37D] | [#x37F-#x1FFF] | [#x200C-#x200D] | [#x2070-#x218F] | [#x2C00-#x2FEF] | [#x3001-#xD7FF] | [#xF900-#xFDCF] | [#xFDF0-#xFFFD] | [#x10000-#xEFFFF]
//[4a]   	NameChar	   ::=   	NameStartChar | "-" | "." | [0-9] | #xB7 | [#x0300-#x036F] | [#x203F-#x2040]
//[5]   	Name	   ::=   	NameStartChar (NameChar)*
var nameStartChar = /[A-Z_a-z\xC0-\xD6\xD8-\xF6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]///\u10000-\uEFFFF
var nameChar = new RegExp("[\\-\\.0-9"+nameStartChar.source.slice(1,-1)+"\\u00B7\\u0300-\\u036F\\u203F-\\u2040]");
var tagNamePattern = new RegExp('^'+nameStartChar.source+nameChar.source+'*(?:\:'+nameStartChar.source+nameChar.source+'*)?$');
//var tagNamePattern = /^[a-zA-Z_][\w\-\.]*(?:\:[a-zA-Z_][\w\-\.]*)?$/
//var handlers = 'resolveEntity,getExternalSubset,characters,endDocument,endElement,endPrefixMapping,ignorableWhitespace,processingInstruction,setDocumentLocator,skippedEntity,startDocument,startElement,startPrefixMapping,notationDecl,unparsedEntityDecl,error,fatalError,warning,attributeDecl,elementDecl,externalEntityDecl,internalEntityDecl,comment,endCDATA,endDTD,endEntity,startCDATA,startDTD,startEntity'.split(',')

//S_TAG,	S_ATTR,	S_EQ,	S_ATTR_NOQUOT_VALUE
//S_ATTR_SPACE,	S_ATTR_END,	S_TAG_SPACE, S_TAG_CLOSE
var S_TAG = 0;//tag name offerring
var S_ATTR = 1;//attr name offerring
var S_ATTR_SPACE=2;//attr name end and space offer
var S_EQ = 3;//=space?
var S_ATTR_NOQUOT_VALUE = 4;//attr value(no quot value only)
var S_ATTR_END = 5;//attr value end and no space(quot end)
var S_TAG_SPACE = 6;//(attr value end || tag end ) && (space offer)
var S_TAG_CLOSE = 7;//closed el<el />

/**
 * Creates an error that will not be caught by XMLReader aka the SAX parser.
 *
 * @param {string} message
 * @param {any?} locator Optional, can provide details about the location in the source
 * @constructor
 */
function ParseError(message, locator) {
	this.message = message
	this.locator = locator
	if(Error.captureStackTrace) Error.captureStackTrace(this, ParseError);
}
ParseError.prototype = new Error();
ParseError.prototype.name = ParseError.name

function XMLReader(){

}

XMLReader.prototype = {
	parse:function(source,defaultNSMap,entityMap){
		var domBuilder = this.domBuilder;
		domBuilder.startDocument();
		_copy(defaultNSMap ,defaultNSMap = {})
		parse(source,defaultNSMap,entityMap,
				domBuilder,this.errorHandler);
		domBuilder.endDocument();
	}
}
function parse(source,defaultNSMapCopy,entityMap,domBuilder,errorHandler){
	function fixedFromCharCode(code) {
		// String.prototype.fromCharCode does not supports
		// > 2 bytes unicode chars directly
		if (code > 0xffff) {
			code -= 0x10000;
			var surrogate1 = 0xd800 + (code >> 10)
				, surrogate2 = 0xdc00 + (code & 0x3ff);

			return String.fromCharCode(surrogate1, surrogate2);
		} else {
			return String.fromCharCode(code);
		}
	}
	function entityReplacer(a){
		var k = a.slice(1,-1);
		if (Object.hasOwnProperty.call(entityMap, k)) {
			return entityMap[k];
		}else if(k.charAt(0) === '#'){
			return fixedFromCharCode(parseInt(k.substr(1).replace('x','0x')))
		}else{
			errorHandler.error('entity not found:'+a);
			return a;
		}
	}
	function appendText(end){//has some bugs
		if(end>start){
			var xt = source.substring(start,end).replace(/&#?\w+;/g,entityReplacer);
			locator&&position(start);
			domBuilder.characters(xt,0,end-start);
			start = end
		}
	}
	function position(p,m){
		while(p>=lineEnd && (m = linePattern.exec(source))){
			lineStart = m.index;
			lineEnd = lineStart + m[0].length;
			locator.lineNumber++;
			//console.log('line++:',locator,startPos,endPos)
		}
		locator.columnNumber = p-lineStart+1;
	}
	var lineStart = 0;
	var lineEnd = 0;
	var linePattern = /.*(?:\r\n?|\n)|.*$/g
	var locator = domBuilder.locator;

	var parseStack = [{currentNSMap:defaultNSMapCopy}]
	var closeMap = {};
	var start = 0;
	while(true){
		try{
			var tagStart = source.indexOf('<',start);
			if(tagStart<0){
				if(!source.substr(start).match(/^\s*$/)){
					var doc = domBuilder.doc;
	    			var text = doc.createTextNode(source.substr(start));
	    			doc.appendChild(text);
	    			domBuilder.currentElement = text;
				}
				return;
			}
			if(tagStart>start){
				appendText(tagStart);
			}
			switch(source.charAt(tagStart+1)){
			case '/':
				var end = source.indexOf('>',tagStart+3);
				var tagName = source.substring(tagStart + 2, end).replace(/[ \t\n\r]+$/g, '');
				var config = parseStack.pop();
				if(end<0){

	        		tagName = source.substring(tagStart+2).replace(/[\s<].*/,'');
	        		errorHandler.error("end tag name: "+tagName+' is not complete:'+config.tagName);
	        		end = tagStart+1+tagName.length;
	        	}else if(tagName.match(/\s</)){
	        		tagName = tagName.replace(/[\s<].*/,'');
	        		errorHandler.error("end tag name: "+tagName+' maybe not complete');
	        		end = tagStart+1+tagName.length;
				}
				var localNSMap = config.localNSMap;
				var endMatch = config.tagName == tagName;
				var endIgnoreCaseMach = endMatch || config.tagName&&config.tagName.toLowerCase() == tagName.toLowerCase()
		        if(endIgnoreCaseMach){
		        	domBuilder.endElement(config.uri,config.localName,tagName);
					if(localNSMap){
						for (var prefix in localNSMap) {
							if (Object.prototype.hasOwnProperty.call(localNSMap, prefix)) {
								domBuilder.endPrefixMapping(prefix);
							}
						}
					}
					if(!endMatch){
		            	errorHandler.fatalError("end tag name: "+tagName+' is not match the current start tagName:'+config.tagName ); // No known test case
					}
		        }else{
		        	parseStack.push(config)
		        }

				end++;
				break;
				// end elment
			case '?':// <?...?>
				locator&&position(tagStart);
				end = parseInstruction(source,tagStart,domBuilder);
				break;
			case '!':// <!doctype,<![CDATA,<!--
				locator&&position(tagStart);
				end = parseDCC(source,tagStart,domBuilder,errorHandler);
				break;
			default:
				locator&&position(tagStart);
				var el = new ElementAttributes();
				var currentNSMap = parseStack[parseStack.length-1].currentNSMap;
				//elStartEnd
				var end = parseElementStartPart(source,tagStart,el,currentNSMap,entityReplacer,errorHandler);
				var len = el.length;


				if(!el.closed && fixSelfClosed(source,end,el.tagName,closeMap)){
					el.closed = true;
					if(!entityMap.nbsp){
						errorHandler.warning('unclosed xml attribute');
					}
				}
				if(locator && len){
					var locator2 = copyLocator(locator,{});
					//try{//attribute position fixed
					for(var i = 0;i<len;i++){
						var a = el[i];
						position(a.offset);
						a.locator = copyLocator(locator,{});
					}
					domBuilder.locator = locator2
					if(appendElement(el,domBuilder,currentNSMap)){
						parseStack.push(el)
					}
					domBuilder.locator = locator;
				}else{
					if(appendElement(el,domBuilder,currentNSMap)){
						parseStack.push(el)
					}
				}

				if (NAMESPACE.isHTML(el.uri) && !el.closed) {
					end = parseHtmlSpecialContent(source,end,el.tagName,entityReplacer,domBuilder)
				} else {
					end++;
				}
			}
		}catch(e){
			if (e instanceof ParseError) {
				throw e;
			}
			errorHandler.error('element parse error: '+e)
			end = -1;
		}
		if(end>start){
			start = end;
		}else{
			//TODO: 这里有可能sax回退，有位置错误风险
			appendText(Math.max(tagStart,start)+1);
		}
	}
}
function copyLocator(f,t){
	t.lineNumber = f.lineNumber;
	t.columnNumber = f.columnNumber;
	return t;
}

/**
 * @see #appendElement(source,elStartEnd,el,selfClosed,entityReplacer,domBuilder,parseStack);
 * @return end of the elementStartPart(end of elementEndPart for selfClosed el)
 */
function parseElementStartPart(source,start,el,currentNSMap,entityReplacer,errorHandler){

	/**
	 * @param {string} qname
	 * @param {string} value
	 * @param {number} startIndex
	 */
	function addAttribute(qname, value, startIndex) {
		if (el.attributeNames.hasOwnProperty(qname)) {
			errorHandler.fatalError('Attribute ' + qname + ' redefined')
		}
		el.addValue(
			qname,
			// @see https://www.w3.org/TR/xml/#AVNormalize
			// since the xmldom sax parser does not "interpret" DTD the following is not implemented:
			// - recursive replacement of (DTD) entity references
			// - trimming and collapsing multiple spaces into a single one for attributes that are not of type CDATA
			value.replace(/[\t\n\r]/g, ' ').replace(/&#?\w+;/g, entityReplacer),
			startIndex
		)
	}
	var attrName;
	var value;
	var p = ++start;
	var s = S_TAG;//status
	while(true){
		var c = source.charAt(p);
		switch(c){
		case '=':
			if(s === S_ATTR){//attrName
				attrName = source.slice(start,p);
				s = S_EQ;
			}else if(s === S_ATTR_SPACE){
				s = S_EQ;
			}else{
				//fatalError: equal must after attrName or space after attrName
				throw new Error('attribute equal must after attrName'); // No known test case
			}
			break;
		case '\'':
		case '"':
			if(s === S_EQ || s === S_ATTR //|| s == S_ATTR_SPACE
				){//equal
				if(s === S_ATTR){
					errorHandler.warning('attribute value must after "="')
					attrName = source.slice(start,p)
				}
				start = p+1;
				p = source.indexOf(c,start)
				if(p>0){
					value = source.slice(start, p);
					addAttribute(attrName, value, start-1);
					s = S_ATTR_END;
				}else{
					//fatalError: no end quot match
					throw new Error('attribute value no end \''+c+'\' match');
				}
			}else if(s == S_ATTR_NOQUOT_VALUE){
				value = source.slice(start, p);
				addAttribute(attrName, value, start);
				errorHandler.warning('attribute "'+attrName+'" missed start quot('+c+')!!');
				start = p+1;
				s = S_ATTR_END
			}else{
				//fatalError: no equal before
				throw new Error('attribute value must after "="'); // No known test case
			}
			break;
		case '/':
			switch(s){
			case S_TAG:
				el.setTagName(source.slice(start,p));
			case S_ATTR_END:
			case S_TAG_SPACE:
			case S_TAG_CLOSE:
				s =S_TAG_CLOSE;
				el.closed = true;
			case S_ATTR_NOQUOT_VALUE:
			case S_ATTR:
				break;
				case S_ATTR_SPACE:
					el.closed = true;
				break;
			//case S_EQ:
			default:
				throw new Error("attribute invalid close char('/')") // No known test case
			}
			break;
		case ''://end document
			errorHandler.error('unexpected end of input');
			if(s == S_TAG){
				el.setTagName(source.slice(start,p));
			}
			return p;
		case '>':
			switch(s){
			case S_TAG:
				el.setTagName(source.slice(start,p));
			case S_ATTR_END:
			case S_TAG_SPACE:
			case S_TAG_CLOSE:
				break;//normal
			case S_ATTR_NOQUOT_VALUE://Compatible state
			case S_ATTR:
				value = source.slice(start,p);
				if(value.slice(-1) === '/'){
					el.closed  = true;
					value = value.slice(0,-1)
				}
			case S_ATTR_SPACE:
				if(s === S_ATTR_SPACE){
					value = attrName;
				}
				if(s == S_ATTR_NOQUOT_VALUE){
					errorHandler.warning('attribute "'+value+'" missed quot(")!');
					addAttribute(attrName, value, start)
				}else{
					if(!NAMESPACE.isHTML(currentNSMap['']) || !value.match(/^(?:disabled|checked|selected)$/i)){
						errorHandler.warning('attribute "'+value+'" missed value!! "'+value+'" instead!!')
					}
					addAttribute(value, value, start)
				}
				break;
			case S_EQ:
				throw new Error('attribute value missed!!');
			}
//			console.log(tagName,tagNamePattern,tagNamePattern.test(tagName))
			return p;
		/*xml space '\x20' | #x9 | #xD | #xA; */
		case '\u0080':
			c = ' ';
		default:
			if(c<= ' '){//space
				switch(s){
				case S_TAG:
					el.setTagName(source.slice(start,p));//tagName
					s = S_TAG_SPACE;
					break;
				case S_ATTR:
					attrName = source.slice(start,p)
					s = S_ATTR_SPACE;
					break;
				case S_ATTR_NOQUOT_VALUE:
					var value = source.slice(start, p);
					errorHandler.warning('attribute "'+value+'" missed quot(")!!');
					addAttribute(attrName, value, start)
				case S_ATTR_END:
					s = S_TAG_SPACE;
					break;
				//case S_TAG_SPACE:
				//case S_EQ:
				//case S_ATTR_SPACE:
				//	void();break;
				//case S_TAG_CLOSE:
					//ignore warning
				}
			}else{//not space
//S_TAG,	S_ATTR,	S_EQ,	S_ATTR_NOQUOT_VALUE
//S_ATTR_SPACE,	S_ATTR_END,	S_TAG_SPACE, S_TAG_CLOSE
				switch(s){
				//case S_TAG:void();break;
				//case S_ATTR:void();break;
				//case S_ATTR_NOQUOT_VALUE:void();break;
				case S_ATTR_SPACE:
					var tagName =  el.tagName;
					if (!NAMESPACE.isHTML(currentNSMap['']) || !attrName.match(/^(?:disabled|checked|selected)$/i)) {
						errorHandler.warning('attribute "'+attrName+'" missed value!! "'+attrName+'" instead2!!')
					}
					addAttribute(attrName, attrName, start);
					start = p;
					s = S_ATTR;
					break;
				case S_ATTR_END:
					errorHandler.warning('attribute space is required"'+attrName+'"!!')
				case S_TAG_SPACE:
					s = S_ATTR;
					start = p;
					break;
				case S_EQ:
					s = S_ATTR_NOQUOT_VALUE;
					start = p;
					break;
				case S_TAG_CLOSE:
					throw new Error("elements closed character '/' and '>' must be connected to");
				}
			}
		}//end outer switch
		//console.log('p++',p)
		p++;
	}
}
/**
 * @return true if has new namespace define
 */
function appendElement(el,domBuilder,currentNSMap){
	var tagName = el.tagName;
	var localNSMap = null;
	//var currentNSMap = parseStack[parseStack.length-1].currentNSMap;
	var i = el.length;
	while(i--){
		var a = el[i];
		var qName = a.qName;
		var value = a.value;
		var nsp = qName.indexOf(':');
		if(nsp>0){
			var prefix = a.prefix = qName.slice(0,nsp);
			var localName = qName.slice(nsp+1);
			var nsPrefix = prefix === 'xmlns' && localName
		}else{
			localName = qName;
			prefix = null
			nsPrefix = qName === 'xmlns' && ''
		}
		//can not set prefix,because prefix !== ''
		a.localName = localName ;
		//prefix == null for no ns prefix attribute
		if(nsPrefix !== false){//hack!!
			if(localNSMap == null){
				localNSMap = {}
				//console.log(currentNSMap,0)
				_copy(currentNSMap,currentNSMap={})
				//console.log(currentNSMap,1)
			}
			currentNSMap[nsPrefix] = localNSMap[nsPrefix] = value;
			a.uri = NAMESPACE.XMLNS
			domBuilder.startPrefixMapping(nsPrefix, value)
		}
	}
	var i = el.length;
	while(i--){
		a = el[i];
		var prefix = a.prefix;
		if(prefix){//no prefix attribute has no namespace
			if(prefix === 'xml'){
				a.uri = NAMESPACE.XML;
			}if(prefix !== 'xmlns'){
				a.uri = currentNSMap[prefix || '']

				//{console.log('###'+a.qName,domBuilder.locator.systemId+'',currentNSMap,a.uri)}
			}
		}
	}
	var nsp = tagName.indexOf(':');
	if(nsp>0){
		prefix = el.prefix = tagName.slice(0,nsp);
		localName = el.localName = tagName.slice(nsp+1);
	}else{
		prefix = null;//important!!
		localName = el.localName = tagName;
	}
	//no prefix element has default namespace
	var ns = el.uri = currentNSMap[prefix || ''];
	domBuilder.startElement(ns,localName,tagName,el);
	//endPrefixMapping and startPrefixMapping have not any help for dom builder
	//localNSMap = null
	if(el.closed){
		domBuilder.endElement(ns,localName,tagName);
		if(localNSMap){
			for (prefix in localNSMap) {
				if (Object.prototype.hasOwnProperty.call(localNSMap, prefix)) {
					domBuilder.endPrefixMapping(prefix);
				}
			}
		}
	}else{
		el.currentNSMap = currentNSMap;
		el.localNSMap = localNSMap;
		//parseStack.push(el);
		return true;
	}
}
function parseHtmlSpecialContent(source,elStartEnd,tagName,entityReplacer,domBuilder){
	if(/^(?:script|textarea)$/i.test(tagName)){
		var elEndStart =  source.indexOf('</'+tagName+'>',elStartEnd);
		var text = source.substring(elStartEnd+1,elEndStart);
		if(/[&<]/.test(text)){
			if(/^script$/i.test(tagName)){
				//if(!/\]\]>/.test(text)){
					//lexHandler.startCDATA();
					domBuilder.characters(text,0,text.length);
					//lexHandler.endCDATA();
					return elEndStart;
				//}
			}//}else{//text area
				text = text.replace(/&#?\w+;/g,entityReplacer);
				domBuilder.characters(text,0,text.length);
				return elEndStart;
			//}

		}
	}
	return elStartEnd+1;
}
function fixSelfClosed(source,elStartEnd,tagName,closeMap){
	//if(tagName in closeMap){
	var pos = closeMap[tagName];
	if(pos == null){
		//console.log(tagName)
		pos =  source.lastIndexOf('</'+tagName+'>')
		if(pos<elStartEnd){//忘记闭合
			pos = source.lastIndexOf('</'+tagName)
		}
		closeMap[tagName] =pos
	}
	return pos<elStartEnd;
	//}
}

function _copy (source, target) {
	for (var n in source) {
		if (Object.prototype.hasOwnProperty.call(source, n)) {
			target[n] = source[n];
		}
	}
}

function parseDCC(source,start,domBuilder,errorHandler){//sure start with '<!'
	var next= source.charAt(start+2)
	switch(next){
	case '-':
		if(source.charAt(start + 3) === '-'){
			var end = source.indexOf('-->',start+4);
			//append comment source.substring(4,end)//<!--
			if(end>start){
				domBuilder.comment(source,start+4,end-start-4);
				return end+3;
			}else{
				errorHandler.error("Unclosed comment");
				return -1;
			}
		}else{
			//error
			return -1;
		}
	default:
		if(source.substr(start+3,6) == 'CDATA['){
			var end = source.indexOf(']]>',start+9);
			domBuilder.startCDATA();
			domBuilder.characters(source,start+9,end-start-9);
			domBuilder.endCDATA()
			return end+3;
		}
		//<!DOCTYPE
		//startDTD(java.lang.String name, java.lang.String publicId, java.lang.String systemId)
		var matchs = split(source,start);
		var len = matchs.length;
		if(len>1 && /!doctype/i.test(matchs[0][0])){
			var name = matchs[1][0];
			var pubid = false;
			var sysid = false;
			if(len>3){
				if(/^public$/i.test(matchs[2][0])){
					pubid = matchs[3][0];
					sysid = len>4 && matchs[4][0];
				}else if(/^system$/i.test(matchs[2][0])){
					sysid = matchs[3][0];
				}
			}
			var lastMatch = matchs[len-1]
			domBuilder.startDTD(name, pubid, sysid);
			domBuilder.endDTD();

			return lastMatch.index+lastMatch[0].length
		}
	}
	return -1;
}



function parseInstruction(source,start,domBuilder){
	var end = source.indexOf('?>',start);
	if(end){
		var match = source.substring(start,end).match(/^<\?(\S*)\s*([\s\S]*?)$/);
		if(match){
			var len = match[0].length;
			domBuilder.processingInstruction(match[1], match[2]) ;
			return end+2;
		}else{//error
			return -1;
		}
	}
	return -1;
}

function ElementAttributes(){
	this.attributeNames = {}
}
ElementAttributes.prototype = {
	setTagName:function(tagName){
		if(!tagNamePattern.test(tagName)){
			throw new Error('invalid tagName:'+tagName)
		}
		this.tagName = tagName
	},
	addValue:function(qName, value, offset) {
		if(!tagNamePattern.test(qName)){
			throw new Error('invalid attribute:'+qName)
		}
		this.attributeNames[qName] = this.length;
		this[this.length++] = {qName:qName,value:value,offset:offset}
	},
	length:0,
	getLocalName:function(i){return this[i].localName},
	getLocator:function(i){return this[i].locator},
	getQName:function(i){return this[i].qName},
	getURI:function(i){return this[i].uri},
	getValue:function(i){return this[i].value}
//	,getIndex:function(uri, localName)){
//		if(localName){
//
//		}else{
//			var qName = uri
//		}
//	},
//	getValue:function(){return this.getValue(this.getIndex.apply(this,arguments))},
//	getType:function(uri,localName){}
//	getType:function(i){},
}



function split(source,start){
	var match;
	var buf = [];
	var reg = /'[^']+'|"[^"]+"|[^\s<>\/=]+=?|(\/?\s*>|<)/g;
	reg.lastIndex = start;
	reg.exec(source);//skip <
	while(match = reg.exec(source)){
		buf.push(match);
		if(match[1])return buf;
	}
}

exports.XMLReader = XMLReader;
exports.ParseError = ParseError;


/***/ }),
/* 90 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

/**
 * GX_TYPE_* widget type constants — ported from common/inc/gx_api.h
 * Do NOT edit these values; they must match gx_api.h exactly.
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GX_STYLE_BORDER_NONE = exports.GX_STYLE_NONE = exports.GX_TYPE_TEMPLATE = exports.GX_TYPE_GENERIC_SCROLL_WHEEL = exports.GX_TYPE_RICH_TEXT_VIEW = exports.GX_TYPE_TREE_VIEW = exports.GX_TYPE_NUMERIC_SCROLL_WHEEL = exports.GX_TYPE_STRING_SCROLL_WHEEL = exports.GX_TYPE_TEXT_SCROLL_WHEEL = exports.GX_TYPE_SCROLL_WHEEL = exports.GX_TYPE_KEYBOARD = exports.GX_TYPE_DIALOG = exports.GX_TYPE_LINE_CHART = exports.GX_TYPE_MULTI_LINE_TEXT_INPUT = exports.GX_TYPE_MULTI_LINE_TEXT_VIEW = exports.GX_TYPE_POPUP_LIST = exports.GX_TYPE_HORIZONTAL_LIST = exports.GX_TYPE_VERTICAL_LIST = exports.GX_TYPE_ROOT_WINDOW = exports.GX_TYPE_WINDOW = exports.GX_TYPE_ACCORDION_MENU = exports.GX_TYPE_MENU = exports.GX_TYPE_MENU_LIST = exports.GX_TYPE_DROP_LIST = exports.GX_TYPE_PIXELMAP_TEXT_INPUT = exports.GX_TYPE_SINGLE_LINE_TEXT_INPUT = exports.GX_TYPE_NUMERIC_PIXELMAP_PROMPT = exports.GX_TYPE_PIXELMAP_PROMPT = exports.GX_TYPE_NUMERIC_PROMPT = exports.GX_TYPE_PROMPT = exports.GX_TYPE_RADIAL_SLIDER = exports.GX_TYPE_RADIAL_PROGRESS_BAR = exports.GX_TYPE_PROGRESS_BAR = exports.GX_TYPE_HORIZONTAL_SCROLL = exports.GX_TYPE_VERTICAL_SCROLL = exports.GX_TYPE_PIXELMAP_SLIDER = exports.GX_TYPE_SLIDER = exports.GX_TYPE_CIRCULAR_GAUGE = exports.GX_TYPE_SPRITE = exports.GX_TYPE_ICON = exports.GX_TYPE_SPIN_BUTTON = exports.GX_TYPE_ICON_BUTTON = exports.GX_TYPE_SHADOW_BUTTON = exports.GX_TYPE_PIXELMAP_BUTTON = exports.GX_TYPE_CHECKBOX = exports.GX_TYPE_RADIO_BUTTON = exports.GX_TYPE_MULTI_LINE_TEXT_BUTTON = exports.GX_TYPE_TEXT_BUTTON = exports.GX_TYPE_BUTTON = exports.GX_TYPE_WIDGET = void 0;
exports.RES_TYPE_FOLDER = exports.RES_TYPE_GROUP = exports.RES_TYPE_HEADER = exports.DYNAMIC_ALLOCATION_CHILD = exports.DYNAMIC_ALLOCATION_ROOT = exports.STATICALLY_ALLOCATED = exports.GX_COLOR_FORMAT_32BGRA = exports.GX_COLOR_FORMAT_32ABGR = exports.GX_COLOR_FORMAT_32RGBA = exports.GX_COLOR_FORMAT_32ARGB = exports.GX_COLOR_FORMAT_24BGRX = exports.GX_COLOR_FORMAT_24XRGB = exports.GX_COLOR_FORMAT_24BGR = exports.GX_COLOR_FORMAT_24RGB = exports.GX_COLOR_FORMAT_565BGR = exports.GX_COLOR_FORMAT_4444BGRA = exports.GX_COLOR_FORMAT_4444ARGB = exports.GX_COLOR_FORMAT_565RGB = exports.GX_COLOR_FORMAT_1555XRGB = exports.GX_COLOR_FORMAT_5551BGRX = exports.GX_COLOR_FORMAT_8BIT_PACKED_PIXEL = exports.GX_COLOR_FORMAT_8BIT_PALETTE = exports.GX_COLOR_FORMAT_8BIT_GRAY_INVERTED = exports.GX_COLOR_FORMAT_8BIT_GRAY = exports.GX_COLOR_FORMAT_4BIT_VGA = exports.GX_COLOR_FORMAT_4BIT_GRAY_INVERTED = exports.GX_COLOR_FORMAT_4BIT_GRAY = exports.GX_COLOR_FORMAT_2BIT_GRAY_INVERTED = exports.GX_COLOR_FORMAT_2BIT_GRAY = exports.GX_COLOR_FORMAT_MONOCHROME_INVERTED = exports.GX_COLOR_FORMAT_MONOCHROME = exports.GX_STATUS_STUDIO_CREATED = exports.GX_STATUS_ACCEPTS_INPUT = exports.GX_STATUS_VISIBLE = exports.GX_STYLE_CURSOR_ALWAYS_DRAW = exports.GX_STYLE_CURSOR_BLINK = exports.GX_STYLE_CHECKBOX_TICKMARK = exports.GX_STYLE_BUTTON_RADIO = exports.GX_STYLE_BUTTON_TOGGLE = exports.GX_STYLE_BUTTON_PUSHED = exports.GX_STYLE_TEXT_CENTER = exports.GX_STYLE_TEXT_RIGHT = exports.GX_STYLE_TEXT_LEFT = exports.GX_STYLE_ENABLED = exports.GX_STYLE_DRAW_SELECTED = exports.GX_STYLE_TRANSPARENT = exports.GX_STYLE_BORDER_THICK = exports.GX_STYLE_BORDER_THIN = exports.GX_STYLE_BORDER_RECESSED = exports.GX_STYLE_BORDER_RAISED = void 0;
exports.FONT_GROUP = exports.COLOR_GROUP = exports.CUSTOM_PIXELMAP_FOLDER = exports.DEFAULT_PIXELMAP_FOLDER = exports.CUSTOM_FONT_FOLDER = exports.DEFAULT_FONT_FOLDER = exports.CUSTOM_COLOR_FOLDER = exports.DEFAULT_COLOR_FOLDER = exports.DROP_LIST_PIXELMAP_INDEX = exports.WALLPAPER_PIXELMAP_INDEX = exports.NEEDLE_PIXELMAP_INDEX = exports.UPPER_PIXELMAP_INDEX = exports.LOWER_PIXELMAP_INDEX = exports.DISABLED_PIXELMAP_INDEX = exports.SELECTED_PIXELMAP_INDEX = exports.NORMAL_PIXELMAP_INDEX = exports.SELECTED_FONT_INDEX = exports.NORMAL_FONT_INDEX = exports.READONLY_TEXT_COLOR_INDEX = exports.READONLY_FILL_COLOR_INDEX = exports.DISABLED_TEXT_COLOR_INDEX = exports.SELECTED_TEXT_COLOR_INDEX = exports.NORMAL_TEXT_COLOR_INDEX = exports.DISABLED_FILL_COLOR_INDEX = exports.SELECTED_FILL_COLOR_INDEX = exports.NORMAL_FILL_COLOR_INDEX = exports.NUM_WIDGET_STRINGS = exports.NUM_WIDGET_PIXELMAPS = exports.NUM_WIDGET_FONTS = exports.NUM_WIDGET_COLORS = exports.BINARY_FILE_FORMAT_BIN_STANDALONE = exports.BINARY_FILE_FORMAT_BIN = exports.BINARY_FILE_FORMAT_SREC = exports.RESIZE_MODE_WIDTH = exports.RESIZE_MODE_HEIGHT = exports.RESIZE_MODE_ALL = exports.PALETTE_TYPE_SHARED = exports.PALETTE_TYPE_PRIVATE = exports.PALETTE_TYPE_NONE = exports.PATH_TYPE_ABSOLUTE = exports.PATH_TYPE_INSTALL_RELATIVE = exports.PATH_TYPE_PROJECT_RELATIVE = exports.RES_TYPE_STRING = exports.RES_TYPE_PIXELMAP = exports.RES_TYPE_COLOR = exports.RES_TYPE_FONT = exports.RES_TYPE_ADD_STRING = exports.RES_TYPE_ADD_PIXELMAP = exports.RES_TYPE_ADD_COLOR = exports.RES_TYPE_ADD_FONT = void 0;
exports.MAX_THEMES = exports.MAX_LANGUAGES = exports.MAX_DISPLAYS = exports.PROJECT_VERSION = exports.DECODER_TYPE_HW = exports.DECODER_TYPE_SW = exports.DECODER_TYPE_NONE = exports.STRING_EXPORT_TYPE_CSV = exports.STRING_EXPORT_TYPE_XLIFF = exports.GX_SCREEN_ROTATION_FLIP = exports.GX_SCREEN_ROTATION_CCW = exports.GX_SCREEN_ROTATION_CW = exports.GX_SCREEN_ROTATION_NONE = exports.NUM_FONT_EXTENDED_CHAR_RANGES = exports.NUM_FONT_CHAR_RANGES = exports.DEFAULT_THEME = exports.THEME_HEADER = exports.STRING_GROUP = exports.PIXELMAP_GROUP = void 0;
exports.isWindowType = isWindowType;
exports.gxTypeName = gxTypeName;
// Base widget types
exports.GX_TYPE_WIDGET = 1;
exports.GX_TYPE_BUTTON = 2;
exports.GX_TYPE_TEXT_BUTTON = 3;
exports.GX_TYPE_MULTI_LINE_TEXT_BUTTON = 4;
exports.GX_TYPE_RADIO_BUTTON = 5;
exports.GX_TYPE_CHECKBOX = 6;
exports.GX_TYPE_PIXELMAP_BUTTON = 7;
exports.GX_TYPE_SHADOW_BUTTON = 8;
exports.GX_TYPE_ICON_BUTTON = 9;
exports.GX_TYPE_SPIN_BUTTON = 10;
exports.GX_TYPE_ICON = 11;
exports.GX_TYPE_SPRITE = 12;
exports.GX_TYPE_CIRCULAR_GAUGE = 13;
exports.GX_TYPE_SLIDER = 20;
exports.GX_TYPE_PIXELMAP_SLIDER = 21;
exports.GX_TYPE_VERTICAL_SCROLL = 22;
exports.GX_TYPE_HORIZONTAL_SCROLL = 23;
exports.GX_TYPE_PROGRESS_BAR = 24;
exports.GX_TYPE_RADIAL_PROGRESS_BAR = 25;
exports.GX_TYPE_RADIAL_SLIDER = 26;
exports.GX_TYPE_PROMPT = 30;
exports.GX_TYPE_NUMERIC_PROMPT = 31;
exports.GX_TYPE_PIXELMAP_PROMPT = 32;
exports.GX_TYPE_NUMERIC_PIXELMAP_PROMPT = 33;
exports.GX_TYPE_SINGLE_LINE_TEXT_INPUT = 64;
exports.GX_TYPE_PIXELMAP_TEXT_INPUT = 65;
exports.GX_TYPE_DROP_LIST = 70;
exports.GX_TYPE_MENU_LIST = 75;
exports.GX_TYPE_MENU = 76;
exports.GX_TYPE_ACCORDION_MENU = 77;
// Window-derived types (always >= GX_TYPE_WINDOW)
exports.GX_TYPE_WINDOW = 128;
exports.GX_TYPE_ROOT_WINDOW = 129;
exports.GX_TYPE_VERTICAL_LIST = 131;
exports.GX_TYPE_HORIZONTAL_LIST = 132;
exports.GX_TYPE_POPUP_LIST = 133;
exports.GX_TYPE_MULTI_LINE_TEXT_VIEW = 134;
exports.GX_TYPE_MULTI_LINE_TEXT_INPUT = 135;
exports.GX_TYPE_LINE_CHART = 136;
exports.GX_TYPE_DIALOG = 137;
exports.GX_TYPE_KEYBOARD = 138;
exports.GX_TYPE_SCROLL_WHEEL = 139;
exports.GX_TYPE_TEXT_SCROLL_WHEEL = 140;
exports.GX_TYPE_STRING_SCROLL_WHEEL = 141;
exports.GX_TYPE_NUMERIC_SCROLL_WHEEL = 142;
exports.GX_TYPE_TREE_VIEW = 143;
exports.GX_TYPE_RICH_TEXT_VIEW = 144;
exports.GX_TYPE_GENERIC_SCROLL_WHEEL = 145;
// Studio-only pseudo-type
exports.GX_TYPE_TEMPLATE = 200;
// Widget style flags — from gx_api.h GX_STYLE_* defines
exports.GX_STYLE_NONE = 0x00000000;
exports.GX_STYLE_BORDER_NONE = 0x00000000;
exports.GX_STYLE_BORDER_RAISED = 0x00000001;
exports.GX_STYLE_BORDER_RECESSED = 0x00000002;
exports.GX_STYLE_BORDER_THIN = 0x00000004;
exports.GX_STYLE_BORDER_THICK = 0x00000008;
exports.GX_STYLE_TRANSPARENT = 0x10000000;
exports.GX_STYLE_DRAW_SELECTED = 0x00000020;
exports.GX_STYLE_ENABLED = 0x00000040;
exports.GX_STYLE_TEXT_LEFT = 0x00002000;
exports.GX_STYLE_TEXT_RIGHT = 0x00004000;
exports.GX_STYLE_TEXT_CENTER = 0x00000000;
exports.GX_STYLE_BUTTON_PUSHED = 0x00000010;
exports.GX_STYLE_BUTTON_TOGGLE = 0x00000200;
exports.GX_STYLE_BUTTON_RADIO = 0x00000400;
exports.GX_STYLE_CHECKBOX_TICKMARK = 0x00004000;
exports.GX_STYLE_CURSOR_BLINK = 0x00000200;
exports.GX_STYLE_CURSOR_ALWAYS_DRAW = 0x00000400;
// Widget status flags
exports.GX_STATUS_VISIBLE = 0x00000001;
exports.GX_STATUS_ACCEPTS_INPUT = 0x00000004;
exports.GX_STATUS_STUDIO_CREATED = 0x08000000;
// Color format constants — from gx_api.h GX_COLOR_FORMAT_*
exports.GX_COLOR_FORMAT_MONOCHROME = 1;
exports.GX_COLOR_FORMAT_MONOCHROME_INVERTED = 2;
exports.GX_COLOR_FORMAT_2BIT_GRAY = 3;
exports.GX_COLOR_FORMAT_2BIT_GRAY_INVERTED = 4;
exports.GX_COLOR_FORMAT_4BIT_GRAY = 5;
exports.GX_COLOR_FORMAT_4BIT_GRAY_INVERTED = 6;
exports.GX_COLOR_FORMAT_4BIT_VGA = 7;
exports.GX_COLOR_FORMAT_8BIT_GRAY = 8;
exports.GX_COLOR_FORMAT_8BIT_GRAY_INVERTED = 9;
exports.GX_COLOR_FORMAT_8BIT_PALETTE = 10;
exports.GX_COLOR_FORMAT_8BIT_PACKED_PIXEL = 11;
exports.GX_COLOR_FORMAT_5551BGRX = 12;
exports.GX_COLOR_FORMAT_1555XRGB = 13;
exports.GX_COLOR_FORMAT_565RGB = 14;
exports.GX_COLOR_FORMAT_4444ARGB = 15;
exports.GX_COLOR_FORMAT_4444BGRA = 16;
exports.GX_COLOR_FORMAT_565BGR = 17;
exports.GX_COLOR_FORMAT_24RGB = 18;
exports.GX_COLOR_FORMAT_24BGR = 19;
exports.GX_COLOR_FORMAT_24XRGB = 20;
exports.GX_COLOR_FORMAT_24BGRX = 21;
exports.GX_COLOR_FORMAT_32ARGB = 22;
exports.GX_COLOR_FORMAT_32RGBA = 23;
exports.GX_COLOR_FORMAT_32ABGR = 24;
exports.GX_COLOR_FORMAT_32BGRA = 25;
// Allocation type constants — from StudioXProject.h
exports.STATICALLY_ALLOCATED = 0;
exports.DYNAMIC_ALLOCATION_ROOT = 1;
exports.DYNAMIC_ALLOCATION_CHILD = 2;
// Resource item types — from StudioXProject.h resource_item_types enum
exports.RES_TYPE_HEADER = 1;
exports.RES_TYPE_GROUP = 2;
exports.RES_TYPE_FOLDER = 3;
exports.RES_TYPE_ADD_FONT = 4;
exports.RES_TYPE_ADD_COLOR = 5;
exports.RES_TYPE_ADD_PIXELMAP = 6;
exports.RES_TYPE_ADD_STRING = 7;
exports.RES_TYPE_FONT = 8;
exports.RES_TYPE_COLOR = 9;
exports.RES_TYPE_PIXELMAP = 10;
exports.RES_TYPE_STRING = 11;
// Path type constants — from StudioXProject.h PATHTYPES enum
exports.PATH_TYPE_PROJECT_RELATIVE = 0;
exports.PATH_TYPE_INSTALL_RELATIVE = 1;
exports.PATH_TYPE_ABSOLUTE = 2;
// Palette type constants — from StudioXProject.h PALETTE_TYPES enum
exports.PALETTE_TYPE_NONE = 0;
exports.PALETTE_TYPE_PRIVATE = 1;
exports.PALETTE_TYPE_SHARED = 2;
// Widget resize mode constants — from widget_service_provider.h
exports.RESIZE_MODE_ALL = 1;
exports.RESIZE_MODE_HEIGHT = 2;
exports.RESIZE_MODE_WIDTH = 3;
// Binary file format constants — from StudioXProject.h
exports.BINARY_FILE_FORMAT_SREC = 0x01;
exports.BINARY_FILE_FORMAT_BIN = 0x02;
exports.BINARY_FILE_FORMAT_BIN_STANDALONE = 0x03;
// Widget info array sizes — from StudioXProject.h
exports.NUM_WIDGET_COLORS = 8;
exports.NUM_WIDGET_FONTS = 4;
exports.NUM_WIDGET_PIXELMAPS = 8;
exports.NUM_WIDGET_STRINGS = 2;
// Color array indices — from StudioXProject.h
exports.NORMAL_FILL_COLOR_INDEX = 0;
exports.SELECTED_FILL_COLOR_INDEX = 1;
exports.DISABLED_FILL_COLOR_INDEX = 2;
exports.NORMAL_TEXT_COLOR_INDEX = 3;
exports.SELECTED_TEXT_COLOR_INDEX = 4;
exports.DISABLED_TEXT_COLOR_INDEX = 5;
exports.READONLY_FILL_COLOR_INDEX = 6;
exports.READONLY_TEXT_COLOR_INDEX = 7;
// Font array indices
exports.NORMAL_FONT_INDEX = 0;
exports.SELECTED_FONT_INDEX = 1;
// Pixelmap array indices
exports.NORMAL_PIXELMAP_INDEX = 0;
exports.SELECTED_PIXELMAP_INDEX = 1;
exports.DISABLED_PIXELMAP_INDEX = 2;
exports.LOWER_PIXELMAP_INDEX = 0;
exports.UPPER_PIXELMAP_INDEX = 1;
exports.NEEDLE_PIXELMAP_INDEX = 2;
exports.WALLPAPER_PIXELMAP_INDEX = 0;
exports.DROP_LIST_PIXELMAP_INDEX = 1;
// FolderIds enum — from StudioXProject.h
exports.DEFAULT_COLOR_FOLDER = 4096;
exports.CUSTOM_COLOR_FOLDER = 4097;
exports.DEFAULT_FONT_FOLDER = 4098;
exports.CUSTOM_FONT_FOLDER = 4099;
exports.DEFAULT_PIXELMAP_FOLDER = 4100;
exports.CUSTOM_PIXELMAP_FOLDER = 4101;
// GROUP_IDS enum — from StudioXProject.h
exports.COLOR_GROUP = 4096;
exports.FONT_GROUP = 4097;
exports.PIXELMAP_GROUP = 4098;
exports.STRING_GROUP = 4099;
// HEADER_IDS — from StudioXProject.h
exports.THEME_HEADER = 4096;
// Default theme index
exports.DEFAULT_THEME = 0;
// Font range counts — from StudioXProject.h
exports.NUM_FONT_CHAR_RANGES = 46;
exports.NUM_FONT_EXTENDED_CHAR_RANGES = 4;
// Screen rotation constants — from gx_api.h
exports.GX_SCREEN_ROTATION_NONE = 0;
exports.GX_SCREEN_ROTATION_CW = 90;
exports.GX_SCREEN_ROTATION_CCW = 270;
exports.GX_SCREEN_ROTATION_FLIP = 180;
// String export type constants — from StudioXProject.h STRING_EXPORT_TYPES
exports.STRING_EXPORT_TYPE_XLIFF = 1;
exports.STRING_EXPORT_TYPE_CSV = 2;
// Decoder type constants — from StudioXProject.h DECODER_TYPE
exports.DECODER_TYPE_NONE = 0;
exports.DECODER_TYPE_SW = 1;
exports.DECODER_TYPE_HW = 2;
// Project constants — from StudioXProject.h
exports.PROJECT_VERSION = 56;
exports.MAX_DISPLAYS = 4;
exports.MAX_LANGUAGES = 128;
exports.MAX_THEMES = 8;
/** Returns true if a widget type is window-derived (>= GX_TYPE_WINDOW). */
function isWindowType(widgetType) {
    return widgetType >= exports.GX_TYPE_WINDOW;
}
/** Returns the string name of a GX_TYPE_* constant (for diagnostics). */
function gxTypeName(widgetType) {
    const names = {
        [exports.GX_TYPE_WIDGET]: 'GX_TYPE_WIDGET',
        [exports.GX_TYPE_BUTTON]: 'GX_TYPE_BUTTON',
        [exports.GX_TYPE_TEXT_BUTTON]: 'GX_TYPE_TEXT_BUTTON',
        [exports.GX_TYPE_MULTI_LINE_TEXT_BUTTON]: 'GX_TYPE_MULTI_LINE_TEXT_BUTTON',
        [exports.GX_TYPE_RADIO_BUTTON]: 'GX_TYPE_RADIO_BUTTON',
        [exports.GX_TYPE_CHECKBOX]: 'GX_TYPE_CHECKBOX',
        [exports.GX_TYPE_PIXELMAP_BUTTON]: 'GX_TYPE_PIXELMAP_BUTTON',
        [exports.GX_TYPE_SHADOW_BUTTON]: 'GX_TYPE_SHADOW_BUTTON',
        [exports.GX_TYPE_ICON_BUTTON]: 'GX_TYPE_ICON_BUTTON',
        [exports.GX_TYPE_SPIN_BUTTON]: 'GX_TYPE_SPIN_BUTTON',
        [exports.GX_TYPE_ICON]: 'GX_TYPE_ICON',
        [exports.GX_TYPE_SPRITE]: 'GX_TYPE_SPRITE',
        [exports.GX_TYPE_CIRCULAR_GAUGE]: 'GX_TYPE_CIRCULAR_GAUGE',
        [exports.GX_TYPE_SLIDER]: 'GX_TYPE_SLIDER',
        [exports.GX_TYPE_PIXELMAP_SLIDER]: 'GX_TYPE_PIXELMAP_SLIDER',
        [exports.GX_TYPE_VERTICAL_SCROLL]: 'GX_TYPE_VERTICAL_SCROLL',
        [exports.GX_TYPE_HORIZONTAL_SCROLL]: 'GX_TYPE_HORIZONTAL_SCROLL',
        [exports.GX_TYPE_PROGRESS_BAR]: 'GX_TYPE_PROGRESS_BAR',
        [exports.GX_TYPE_RADIAL_PROGRESS_BAR]: 'GX_TYPE_RADIAL_PROGRESS_BAR',
        [exports.GX_TYPE_RADIAL_SLIDER]: 'GX_TYPE_RADIAL_SLIDER',
        [exports.GX_TYPE_PROMPT]: 'GX_TYPE_PROMPT',
        [exports.GX_TYPE_NUMERIC_PROMPT]: 'GX_TYPE_NUMERIC_PROMPT',
        [exports.GX_TYPE_PIXELMAP_PROMPT]: 'GX_TYPE_PIXELMAP_PROMPT',
        [exports.GX_TYPE_NUMERIC_PIXELMAP_PROMPT]: 'GX_TYPE_NUMERIC_PIXELMAP_PROMPT',
        [exports.GX_TYPE_SINGLE_LINE_TEXT_INPUT]: 'GX_TYPE_SINGLE_LINE_TEXT_INPUT',
        [exports.GX_TYPE_PIXELMAP_TEXT_INPUT]: 'GX_TYPE_PIXELMAP_TEXT_INPUT',
        [exports.GX_TYPE_DROP_LIST]: 'GX_TYPE_DROP_LIST',
        [exports.GX_TYPE_MENU_LIST]: 'GX_TYPE_MENU_LIST',
        [exports.GX_TYPE_MENU]: 'GX_TYPE_MENU',
        [exports.GX_TYPE_ACCORDION_MENU]: 'GX_TYPE_ACCORDION_MENU',
        [exports.GX_TYPE_WINDOW]: 'GX_TYPE_WINDOW',
        [exports.GX_TYPE_ROOT_WINDOW]: 'GX_TYPE_ROOT_WINDOW',
        [exports.GX_TYPE_VERTICAL_LIST]: 'GX_TYPE_VERTICAL_LIST',
        [exports.GX_TYPE_HORIZONTAL_LIST]: 'GX_TYPE_HORIZONTAL_LIST',
        [exports.GX_TYPE_POPUP_LIST]: 'GX_TYPE_POPUP_LIST',
        [exports.GX_TYPE_MULTI_LINE_TEXT_VIEW]: 'GX_TYPE_MULTI_LINE_TEXT_VIEW',
        [exports.GX_TYPE_MULTI_LINE_TEXT_INPUT]: 'GX_TYPE_MULTI_LINE_TEXT_INPUT',
        [exports.GX_TYPE_LINE_CHART]: 'GX_TYPE_LINE_CHART',
        [exports.GX_TYPE_DIALOG]: 'GX_TYPE_DIALOG',
        [exports.GX_TYPE_KEYBOARD]: 'GX_TYPE_KEYBOARD',
        [exports.GX_TYPE_SCROLL_WHEEL]: 'GX_TYPE_SCROLL_WHEEL',
        [exports.GX_TYPE_TEXT_SCROLL_WHEEL]: 'GX_TYPE_TEXT_SCROLL_WHEEL',
        [exports.GX_TYPE_STRING_SCROLL_WHEEL]: 'GX_TYPE_STRING_SCROLL_WHEEL',
        [exports.GX_TYPE_NUMERIC_SCROLL_WHEEL]: 'GX_TYPE_NUMERIC_SCROLL_WHEEL',
        [exports.GX_TYPE_TREE_VIEW]: 'GX_TYPE_TREE_VIEW',
        [exports.GX_TYPE_RICH_TEXT_VIEW]: 'GX_TYPE_RICH_TEXT_VIEW',
        [exports.GX_TYPE_GENERIC_SCROLL_WHEEL]: 'GX_TYPE_GENERIC_SCROLL_WHEEL',
        [exports.GX_TYPE_TEMPLATE]: 'GX_TYPE_TEMPLATE',
    };
    return names[widgetType] ?? `UNKNOWN(${widgetType})`;
}


/***/ }),
/* 91 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * TypeScript equivalent of res_info and related resource structures.
 * Ported from guix_studio/StudioXProject.h.
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createDefaultPathInfo = createDefaultPathInfo;
exports.createDefaultResInfo = createDefaultResInfo;
const gx_types_1 = __webpack_require__(90);
function createDefaultPathInfo() {
    return { pathname: '', pathtype: gx_types_1.PATH_TYPE_PROJECT_RELATIVE };
}
/** Create a ResInfo with all fields initialised to safe defaults. */
function createDefaultResInfo(type, name = '') {
    return {
        type,
        name,
        pathinfo: createDefaultPathInfo(),
        is_default: false,
        enabled: true,
        folder_id: 0,
        compress: false,
        keep_alpha: true,
        dither: false,
        raw: false,
        output_file_enabled: false,
        output_file: '',
        binary_mode: false,
        palette_type: gx_types_1.PALETTE_TYPE_NONE,
        output_color_format: 0,
        map_list: [],
        colorval: 0,
        font_height: 0,
        font_bits: 4,
        font_charset_include_string_table: true,
        font_support_extended_unicode: false,
        font_kerning: false,
        font_pages: [],
        is_modified: false,
        children: [],
    };
}


/***/ }),
/* 92 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * TypeScript equivalent of widget_info and all its dependent sub-structs.
 * Ported from guix_studio/StudioXProject.h.
 *
 * IMPORTANT: Field names mirror the XML attribute names used in the .gxp
 * serialiser so that JSON ↔ model conversion is trivial.
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createDefaultWidgetInfo = createDefaultWidgetInfo;
const gx_types_1 = __webpack_require__(90);
/** Create a WidgetInfo with all fields initialised to safe defaults. */
function createDefaultWidgetInfo(basetype) {
    return {
        basetype,
        misc_value: 0,
        allocation: gx_types_1.STATICALLY_ALLOCATED,
        size: { left: 0, top: 0, right: 0, bottom: 0 },
        color_id: [0, 0, 0, 0, 0, 0, 0, 0],
        pixelmap_id: [0, 0, 0, 0, 0, 0, 0, 0],
        string_id: [0, 0],
        font_id: [0, 0, 0, 0],
        style: 0,
        event_func: '',
        draw_func: '',
        id_name: '',
        app_name: '',
        base_name: '',
        custom_name: '',
        callback_func: '',
        format_func: '',
        user_data: '',
        accepts_focus: false,
        is_template: false,
        visible_at_startup: true,
        ewi: { kind: 'none' },
        children: [],
    };
}
// Compile-time assertion that array sizes match the C++ constants.
const _colorsCheck = gx_types_1.NUM_WIDGET_COLORS; // 8
const _fontsCheck = gx_types_1.NUM_WIDGET_FONTS; // 4
const _mapsCheck = gx_types_1.NUM_WIDGET_PIXELMAPS; // 8
const _strsCheck = gx_types_1.NUM_WIDGET_STRINGS; // 2
void _colorsCheck;
void _fontsCheck;
void _mapsCheck;
void _strsCheck;


/***/ }),
/* 93 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * GXP project file writer.
 *
 * Mirrors StudioXProject::Save(), WriteProjectHeader(), WriteDisplayInfo(),
 * WriteResources(), WriteOneResource(), WriteStringTable(), WriteScreenFlow(),
 * WriteWidgetFolders() and widget_service_provider::WriteToProject() from the
 * C++ GUIX Studio source.
 *
 * Attribute order and indentation match the C++ writer exactly so that diffs
 * between a file saved by GUIX Studio and by this writer are minimal.
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GxpWriter = exports.GxpWriteError = void 0;
const inversify_1 = __webpack_require__(2);
__webpack_require__(3);
const gx_types_1 = __webpack_require__(90);
// ---------------------------------------------------------------------------
// GxCodegenError
// ---------------------------------------------------------------------------
class GxpWriteError extends Error {
    constructor(message) {
        super(message);
        this.name = 'GxpWriteError';
    }
}
exports.GxpWriteError = GxpWriteError;
// ---------------------------------------------------------------------------
// Internal XML builder
// ---------------------------------------------------------------------------
class XmlBuilder {
    constructor() {
        this.parts = [];
        this.indentLevel = 0;
        this.indent = '    ';
    }
    writeHeader(docType) {
        this.parts.push('<?xml version="1.0" encoding="utf-8"?>\n');
        this.parts.push(`<!DOCTYPE ${docType}>\n`);
    }
    openTag(name, inline = false) {
        if (inline) {
            this.parts.push(`<${name}>`);
        }
        else {
            this.parts.push(`${this.getIndent()}<${name}>\n`);
            this.indentLevel++;
        }
    }
    closeTag(name, inline = false) {
        if (inline) {
            this.parts.push(`</${name}>\n`);
        }
        else {
            this.indentLevel--;
            this.parts.push(`${this.getIndent()}</${name}>\n`);
        }
    }
    writeString(name, value, force = false) {
        if (!force && value === '')
            return;
        this.openTag(name, true);
        this.parts.push(this.escapeXml(value));
        this.closeTag(name, true);
    }
    writeInt(name, value) {
        this.writeString(name, String(Math.trunc(value)), true);
    }
    writeUnsigned(name, value) {
        this.writeString(name, String(value >>> 0), true);
    }
    writeBool(name, value) {
        this.openTag(name, true);
        this.parts.push(value ? 'TRUE' : 'FALSE');
        this.closeTag(name, true);
    }
    writeRect(name, left, top, right, bottom) {
        this.openTag(name);
        this.writeInt('left', left);
        this.writeInt('top', top);
        this.writeInt('right', right);
        this.writeInt('bottom', bottom);
        this.closeTag(name);
    }
    writePathInfo(pathname, pathtype) {
        this.openTag('pathinfo');
        if (pathname !== '')
            this.writeString('pathname', pathname);
        let typeStr;
        switch (pathtype) {
            case gx_types_1.PATH_TYPE_INSTALL_RELATIVE:
                typeStr = 'studio_relative';
                break;
            case 2:
                typeStr = 'absolute';
                break;
            default: typeStr = 'project_relative';
        }
        this.writeString('pathtype', typeStr);
        this.closeTag('pathinfo');
    }
    toString() {
        return this.parts.join('');
    }
    getIndent() {
        return this.indent.repeat(this.indentLevel);
    }
    escapeXml(s) {
        return s
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}
// ---------------------------------------------------------------------------
// Helper: rotation angle → name
// ---------------------------------------------------------------------------
function rotationName(angle) {
    switch (angle) {
        case gx_types_1.GX_SCREEN_ROTATION_CW: return 'CW';
        case gx_types_1.GX_SCREEN_ROTATION_CCW: return 'CCW';
        case gx_types_1.GX_SCREEN_ROTATION_FLIP: return 'FLIP';
        default: return 'None';
    }
}
// ---------------------------------------------------------------------------
// Helper: color format → name (matches resource_gen::GetColorFormatName)
// ---------------------------------------------------------------------------
const COLOR_FORMAT_NAMES = new Map([
    [gx_types_1.GX_COLOR_FORMAT_MONOCHROME, 'GX_COLOR_FORMAT_MONOCHROME'],
    [gx_types_1.GX_COLOR_FORMAT_4BIT_GRAY, 'GX_COLOR_FORMAT_4BIT_GRAY'],
    [gx_types_1.GX_COLOR_FORMAT_8BIT_PALETTE, 'GX_COLOR_FORMAT_8BIT_PALETTE'],
    [gx_types_1.GX_COLOR_FORMAT_8BIT_PACKED_PIXEL, 'GX_COLOR_FORMAT_8BIT_PACKED_PIXEL'],
    [gx_types_1.GX_COLOR_FORMAT_565RGB, 'GX_COLOR_FORMAT_565RGB'],
    [gx_types_1.GX_COLOR_FORMAT_565BGR, 'GX_COLOR_FORMAT_565BGR'],
    [gx_types_1.GX_COLOR_FORMAT_1555XRGB, 'GX_COLOR_FORMAT_1555XRGB'],
    [gx_types_1.GX_COLOR_FORMAT_5551BGRX, 'GX_COLOR_FORMAT_5551BGRX'],
    [gx_types_1.GX_COLOR_FORMAT_4444ARGB, 'GX_COLOR_FORMAT_4444ARGB'],
    [gx_types_1.GX_COLOR_FORMAT_4444BGRA, 'GX_COLOR_FORMAT_4444BGRA'],
    [gx_types_1.GX_COLOR_FORMAT_24RGB, 'GX_COLOR_FORMAT_24RGB'],
    [gx_types_1.GX_COLOR_FORMAT_24XRGB, 'GX_COLOR_FORMAT_24XRGB'],
    [gx_types_1.GX_COLOR_FORMAT_32ARGB, 'GX_COLOR_FORMAT_32ARGB'],
    [gx_types_1.GX_COLOR_FORMAT_32BGRA, 'GX_COLOR_FORMAT_32BGRA'],
]);
function colorFormatName(fmt) {
    return COLOR_FORMAT_NAMES.get(fmt) ?? '';
}
// ---------------------------------------------------------------------------
// Helper: resource type → XML name string
// ---------------------------------------------------------------------------
const RES_TYPE_NAMES = new Map([
    [gx_types_1.RES_TYPE_HEADER, 'HEADER'],
    [gx_types_1.RES_TYPE_GROUP, 'GROUP'],
    [gx_types_1.RES_TYPE_FOLDER, 'FOLDER'],
    [gx_types_1.RES_TYPE_FONT, 'FONT'],
    [gx_types_1.RES_TYPE_COLOR, 'COLOR'],
    [gx_types_1.RES_TYPE_PIXELMAP, 'PIXELMAP'],
    [4, 'ADD_FONT'], // RES_TYPE_ADD_FONT
    [5, 'ADD_COLOR'],
    [6, 'ADD_PIXELMAP'],
    [7, 'ADD_STRING'],
]);
// ---------------------------------------------------------------------------
// Helper: folder_id → name strings
// ---------------------------------------------------------------------------
const FOLDER_ID_NAMES = new Map([
    [4096, 'DEFAULT_COLOR_FOLDER'],
    [4097, 'CUSTOM_COLOR_FOLDER'],
    [4098, 'DEFAULT_FONT_FOLDER'],
    [4099, 'CUSTOM_FONT_FOLDER'],
    [4100, 'DEFAULT_PIXELMAP_FOLDER'],
    [4101, 'CUSTOM_PIXELMAP_FOLDER'],
]);
const GROUP_ID_NAMES = new Map([
    [4096, 'COLOR_GROUP'],
    [4097, 'FONT_GROUP'],
    [4098, 'PIXELMAP_GROUP'],
    [4099, 'STRING_GROUP'],
]);
const HEADER_ID_NAMES = new Map([
    [4096, 'THEME_HEADER'],
]);
function folderIdString(resType, folderId) {
    if (resType === gx_types_1.RES_TYPE_HEADER)
        return HEADER_ID_NAMES.get(folderId) ?? '';
    if (resType === gx_types_1.RES_TYPE_GROUP)
        return GROUP_ID_NAMES.get(folderId) ?? '';
    if (resType === gx_types_1.RES_TYPE_FOLDER)
        return FOLDER_ID_NAMES.get(folderId) ?? '';
    return '';
}
// ---------------------------------------------------------------------------
// Helper: string export type name
// ---------------------------------------------------------------------------
function stringExportTypeName(t) {
    if (t === gx_types_1.STRING_EXPORT_TYPE_CSV)
        return 'STRING_EXPORT_TYPE_CSV';
    return 'STRING_EXPORT_TYPE_XLIFF';
}
// ---------------------------------------------------------------------------
// Helper: widget type → XML section name
// ---------------------------------------------------------------------------
const WIDGET_TYPE_TO_NAME = new Map([
    [1, 'widget'], [2, 'button'], [3, 'text button'],
    [4, 'multi line text button'], [5, 'radio button'],
    [6, 'checkbox'], [7, 'pixelmap button'], [8, 'shadow button'],
    [9, 'icon button'], [10, 'spin button'], [11, 'icon'],
    [12, 'sprite'], [13, 'circular gauge'],
    [20, 'slider'], [21, 'pixelmap slider'],
    [22, 'vertical scroll'], [23, 'horizontal scroll'],
    [24, 'progress bar'], [25, 'radial progress bar'],
    [26, 'radial slider'],
    [30, 'prompt'], [31, 'numeric prompt'],
    [32, 'pixelmap prompt'], [33, 'numeric pixelmap prompt'],
    [64, 'single line text input'], [65, 'pixelmap text input'],
    [70, 'drop list'], [75, 'menu list'], [76, 'menu'],
    [77, 'accordion menu'],
    [128, 'window'], [129, 'root window'],
    [131, 'vertical list'], [132, 'horizontal list'],
    [133, 'popup list'], [134, 'multi line text view'],
    [135, 'multi line text input'], [136, 'line chart'],
    [137, 'dialog'], [138, 'keyboard'],
    [139, 'scroll wheel'], [140, 'text scroll wheel'],
    [141, 'string scroll wheel'], [142, 'numeric scroll wheel'],
    [143, 'tree view'], [144, 'rich text view'],
    [145, 'generic scroll wheel'], [200, 'template'],
]);
// ---------------------------------------------------------------------------
// GxpWriter
// ---------------------------------------------------------------------------
let GxpWriter = class GxpWriter {
    /**
     * Serialise a `GxpProject` to a `.gxp` XML string.
     *
     * The output matches the C++ xml_writer output byte-for-byte in terms of
     * element structure and order.  Indentation uses 4 spaces per level to
     * match the C++ OpenTag() behaviour.
     */
    writeProject(project) {
        const b = new XmlBuilder();
        b.writeHeader('GUIX_Studio_Project');
        b.openTag('project');
        this.writeProjectHeader(b, project.header);
        for (let i = 0; i < project.header.max_displays; i++) {
            this.writeDisplayInfo(b, project, i);
        }
        b.closeTag('project');
        return b.toString();
    }
    // -------------------------------------------------------------------------
    // WriteProjectHeader
    // -------------------------------------------------------------------------
    writeProjectHeader(b, h) {
        b.openTag('header');
        b.writeInt('project_version', h.project_version);
        b.writeInt('guix_version', h.guix_version);
        b.writeInt('studio_version', h.studio_version);
        b.writeString('project_name', h.project_name);
        b.writeString('source_path', h.source_path);
        b.writeString('header_path', h.header_path);
        b.writeString('resource_path', h.resource_path);
        b.writeString('allocator_function', h.malloc_name);
        b.writeString('free_function', h.free_name);
        b.writeString('additional_headers', h.additional_headers);
        b.writeBool('insert_headers_before', h.insert_headers_before);
        b.writeInt('target_cpu', h.target_cpu);
        b.writeInt('target_tools', h.target_tools);
        b.writeBool('big_endian', h.big_endian);
        b.writeBool('dave2d_graph_accelerator', h.dave2d_graph_accelerator);
        b.writeInt('renesas_jpeg_decoder', h.renesas_jpeg_decoder);
        b.writeInt('renesas_png_decoder', h.renesas_png_decoder);
        b.writeBool('grid_enabled', h.grid_enabled);
        b.writeBool('snap_enabled', h.snap_enabled);
        b.writeBool('snap_to_widget_enabled', h.snap_to_widget_enabled);
        b.writeInt('grid_spacing', h.grid_spacing);
        b.writeInt('snap_spacing', h.snap_spacing);
        b.writeBool('gen_binary', h.gen_binary);
        b.writeUnsigned('binary_file_format', h.binary_file_format);
        b.writeUnsigned('memory_offset', h.memory_offset);
        b.writeBool('gen_res_header', h.gen_res_header);
        b.writeBool('custom_resource_enabled', h.custom_resource_enabled);
        b.writeString('custom_resource_file_name', h.custom_resource_file_name);
        b.writeInt('app_execute_xpos', h.app_execute_xpos);
        b.writeInt('app_execute_ypos', h.app_execute_ypos);
        b.writeBool('is_widget_position_locked', h.is_widget_position_locked);
        b.writeInt('palette_mode_aa_text_colors', h.palette_mode_aa_text_colors);
        b.writeInt('num_displays', h.num_displays);
        b.writeInt('max_displays', h.max_displays);
        b.writeInt('num_languages', h.num_languages);
        b.openTag('language_names');
        for (let i = 0; i < h.num_languages; i++) {
            const lang = h.languages[i];
            b.writeString('language', lang.name, true);
            b.writeBool('support_bidi_text', lang.support_bidi_text);
            b.writeBool('gen_reordered_bidi_text', lang.gen_reordered_bidi_text);
            b.writeBool('support_thai_glyph_shaping', lang.support_thai_glyph_shaping);
            b.writeBool('gen_adjusted_thai_string', lang.gen_adjusted_thai_string);
            b.writeBool('statically_defined', lang.statically_defined);
        }
        b.closeTag('language_names');
        b.openTag('string_export');
        b.writeInt('string_export_src', h.string_export_src);
        b.writeInt('string_export_target', h.string_export_target);
        b.writeInt('string_export_version', h.string_export_version);
        b.writeString('string_export_path', h.string_export_path);
        b.writeString('string_export_name', h.string_export_filename);
        b.writeString('string_export_filetype', stringExportTypeName(h.string_export_filetype));
        b.closeTag('string_export');
        b.closeTag('header');
    }
    // -------------------------------------------------------------------------
    // WriteDisplayInfo
    // -------------------------------------------------------------------------
    writeDisplayInfo(b, project, displayIndex) {
        const h = project.header;
        const d = project.displays[displayIndex];
        if (!d)
            return;
        b.openTag('display_info');
        b.writeInt('display_index', displayIndex);
        b.writeString('display_name', d.name);
        b.writeInt('xres', d.xres);
        b.writeInt('yres', d.yres);
        b.writeInt('bits_per_pix', d.bits_per_pix);
        b.writeBool('packed_format', d.packed_format);
        b.writeBool('format_555', d.format_555);
        b.writeBool('format_4444', d.format_4444);
        b.writeBool('format_332', d.format_332);
        b.writeBool('grayscale', d.grayscale);
        b.writeBool('reverse_order', d.reverse_order);
        b.writeBool('allocate_canvas', d.allocate_canvas);
        b.writeBool('enabled', d.enabled);
        b.writeString('rotation_angle', rotationName(d.rotation_angle));
        b.writeBool('default_map_format', d.default_map_format);
        b.openTag('theme_info');
        b.writeInt('num_themes', d.num_themes);
        b.writeInt('active_theme', d.active_theme);
        for (let t = 0; t < d.num_themes; t++) {
            const theme = d.themes[t];
            b.writeString('theme_name', theme.theme_name);
            b.writeBool('gen_color_table', theme.gen_color_table);
            b.writeBool('gen_font_table', theme.gen_font_table);
            b.writeBool('gen_pixelmap_table', theme.gen_pixelmap_table);
            b.writeBool('enabled', theme.enabled);
            b.writeBool('statically_defined', theme.statically_defined);
            b.openTag('theme_data');
            this.writeResources(b, theme.resources);
            this.writeThemeScrollbars(b, theme);
            if (theme.palette.length > 0) {
                this.writeThemePaletteInfo(b, theme);
            }
            b.closeTag('theme_data');
        }
        b.closeTag('theme_info');
        // Per-language gen flags
        for (let lang = 0; lang < h.num_languages; lang++) {
            const langName = h.languages[lang]?.name ?? `lang_${lang}`;
            b.writeBool(langName, d.gen_string_table[lang] ?? true);
        }
        if (displayIndex < h.num_displays) {
            this.writeStringTable(b, d, h);
            this.writeScreenFlow(b, d);
        }
        this.writeWidgetFolders(b, d);
        b.closeTag('display_info');
    }
    // -------------------------------------------------------------------------
    // WriteThemeScrollbars
    // -------------------------------------------------------------------------
    writeThemeScrollbars(b, theme) {
        b.openTag('vscroll_appearance');
        this.writeScrollbarAppearance(b, theme.vscroll_appearance);
        b.writeUnsigned('scroll_style', theme.vscroll_style);
        b.closeTag('vscroll_appearance');
        b.openTag('hscroll_appearance');
        this.writeScrollbarAppearance(b, theme.hscroll_appearance);
        b.writeUnsigned('scroll_style', theme.hscroll_style);
        b.closeTag('hscroll_appearance');
    }
    writeScrollbarAppearance(b, a) {
        b.writeInt('gx_scroll_width', a.gx_scroll_width);
        b.writeInt('gx_scroll_thumb_width', a.gx_scroll_thumb_width);
        b.writeInt('gx_scroll_thumb_travel_min', a.gx_scroll_thumb_travel_min);
        b.writeInt('gx_scroll_thumb_travel_max', a.gx_scroll_thumb_travel_max);
        b.writeUnsigned('gx_scroll_thumb_border_style', a.gx_scroll_thumb_border_style);
        b.writeUnsigned('gx_scroll_fill_pixelmap', a.gx_scroll_fill_pixelmap);
        b.writeUnsigned('gx_scroll_thumb_pixelmap', a.gx_scroll_thumb_pixelmap);
        b.writeUnsigned('gx_scroll_up_pixelmap', a.gx_scroll_up_pixelmap);
        b.writeUnsigned('gx_scroll_down_pixelmap', a.gx_scroll_down_pixelmap);
        b.writeUnsigned('gx_scroll_thumb_color', a.gx_scroll_thumb_color);
        b.writeUnsigned('gx_scroll_thumb_border_color', a.gx_scroll_thumb_border_color);
        b.writeUnsigned('gx_scroll_button_color', a.gx_scroll_button_color);
    }
    // -------------------------------------------------------------------------
    // WriteThemePaletteInfo
    // -------------------------------------------------------------------------
    writeThemePaletteInfo(b, theme) {
        b.openTag('palette');
        b.writeInt('total_size', theme.palette_total_size);
        b.writeInt('predefined', theme.palette_predefined);
        for (let i = 0; i < theme.palette_predefined; i++) {
            b.writeUnsigned('rgb', theme.palette[i] ?? 0);
        }
        b.closeTag('palette');
    }
    // -------------------------------------------------------------------------
    // WriteResources
    // -------------------------------------------------------------------------
    writeResources(b, resources) {
        for (const res of resources) {
            const skip = (res.type === gx_types_1.RES_TYPE_ADD_COLOR ||
                res.type === gx_types_1.RES_TYPE_ADD_FONT ||
                res.type === gx_types_1.RES_TYPE_ADD_PIXELMAP ||
                res.type === gx_types_1.RES_TYPE_ADD_STRING);
            if (!skip) {
                b.openTag('resource');
                this.writeOneResource(b, res);
            }
            this.writeResources(b, res.children);
            if (!skip) {
                b.closeTag('resource');
            }
        }
    }
    writeOneResource(b, res) {
        const typeName = RES_TYPE_NAMES.get(res.type) ?? '';
        b.writeString('type', typeName);
        b.writeString('name', res.name);
        b.writePathInfo(res.pathinfo.pathname, res.pathinfo.pathtype);
        b.writeBool('is_default', res.is_default);
        b.writeBool('enabled', res.enabled);
        b.writeBool('compress', res.compress);
        switch (res.type) {
            case gx_types_1.RES_TYPE_PIXELMAP: {
                b.writeBool('alpha', res.keep_alpha);
                b.writeBool('dither', res.dither);
                b.writeBool('raw', res.raw);
                b.writeString('color_format', colorFormatName(res.output_color_format));
                b.writeBool('output_file_enabled', res.output_file_enabled);
                b.writeString('output_file', res.output_file);
                b.writeBool('binary_mode', res.binary_mode);
                this.writePaletteType(b, res.palette_type);
                break;
            }
            case gx_types_1.RES_TYPE_COLOR:
                b.writeUnsigned('colorval', res.colorval);
                break;
            case gx_types_1.RES_TYPE_FONT: {
                b.writeInt('height', res.font_height);
                b.writeInt('font_bits', res.font_bits);
                b.writeBool('font_kerning', res.font_kerning);
                b.writeBool('font_include_st_glyphs', res.font_charset_include_string_table);
                b.writeBool('font_support_extended_unicode', res.font_support_extended_unicode);
                b.writeBool('output_file_enabled', res.output_file_enabled);
                b.writeString('output_file', res.output_file);
                b.writeBool('binary_mode', res.binary_mode);
                const pageCount = gx_types_1.NUM_FONT_CHAR_RANGES +
                    (res.font_support_extended_unicode ? gx_types_1.NUM_FONT_EXTENDED_CHAR_RANGES : 0);
                b.openTag('font_page_data');
                for (let i = 0; i < pageCount; i++) {
                    const page = res.font_pages[i];
                    if (page) {
                        b.writeBool('enabled', page.enabled);
                        b.writeInt('first_char', page.first_char);
                        b.writeInt('last_char', page.last_char);
                    }
                }
                b.closeTag('font_page_data');
                break;
            }
            default:
                b.writeString('folder_id', folderIdString(res.type, res.folder_id));
                break;
        }
    }
    writePaletteType(b, paletteType) {
        let name;
        switch (paletteType) {
            case gx_types_1.PALETTE_TYPE_PRIVATE:
                name = 'Private';
                break;
            case gx_types_1.PALETTE_TYPE_SHARED:
                name = 'Shared';
                break;
            default:
                name = 'None';
                break;
        }
        b.writeString('palette_type', name);
    }
    // -------------------------------------------------------------------------
    // WriteStringTable
    // -------------------------------------------------------------------------
    writeStringTable(b, d, h) {
        b.openTag('string_table');
        const entries = d.string_entries;
        b.writeInt('sort_column', -1); // default: no sort
        b.writeInt('num_strings', entries.length + 1); // +1: 1-based
        b.writeInt('num_languages', h.num_languages);
        for (const entry of entries) {
            b.openTag('string_record');
            b.writeString('id', entry.name, true);
            b.writeInt('font', 0);
            b.writeString('notes', '', true);
            for (let lang = 0; lang < h.num_languages; lang++) {
                b.writeString('val', entry.translations[lang] ?? '', true);
            }
            b.closeTag('string_record');
        }
        b.closeTag('string_table');
    }
    // -------------------------------------------------------------------------
    // WriteScreenFlow
    // -------------------------------------------------------------------------
    writeScreenFlow(b, d) {
        if (d.screen_flow.length === 0)
            return;
        b.openTag('screen_flow');
        b.writeInt('scale', 100);
        for (const item of d.screen_flow) {
            b.openTag('flow_item');
            b.writeString('screen_name', item.screen_name);
            b.writeRect('rect', 0, 0, 0, 0);
            b.writeBool('enabled', true);
            for (const trigger of item.trigger_list) {
                this.writeTriggerInfo(b, trigger);
            }
            b.closeTag('flow_item');
        }
        b.closeTag('screen_flow');
    }
    writeTriggerInfo(b, t) {
        b.openTag('trigger_info');
        b.writeString('trigger_name', t['trigger_name'] ?? '');
        b.writeString('signal_id_name', t['signal_id_name'] ?? '');
        b.writeString('trigger_type', t['trigger_type'] ?? '');
        b.writeString('event_type', t['event_type'] ?? '');
        b.writeString('system_event_animat_id_name', t['system_event_animat_id'] ?? '');
        b.writeString('user_event_id_name', t['user_event_id'] ?? '');
        b.openTag('action_list');
        const actions = t['actions'] ?? [];
        for (const action of actions) {
            this.writeActionInfo(b, action);
        }
        b.closeTag('action_list');
        b.closeTag('trigger_info');
    }
    writeActionInfo(b, a) {
        b.openTag('action_info');
        b.writeString('action_name', a['action_name'] ?? '');
        b.writeString('action_type', a['action_type'] ?? '');
        b.writeString('target_widget_name', a['target_widget_name'] ?? '');
        b.writeString('parent_widget_name', a['parent_widget_name'] ?? '');
        b.writeString('animation_id_name', a['animation_id_name'] ?? '');
        b.writeBool('target_show_child_widgets', a['target_show_children'] ?? false);
        b.writeBool('parent_show_child_widgets', a['parent_show_children'] ?? false);
        const anim = a['animation'];
        if (anim) {
            b.openTag('animation_info');
            b.writeInt('start_x', anim['start_x'] ?? 0);
            b.writeInt('start_y', anim['start_y'] ?? 0);
            b.writeInt('end_x', anim['end_x'] ?? 0);
            b.writeInt('end_y', anim['end_y'] ?? 0);
            // UByte / UShort fields
            b.writeString('steps', String(anim['steps'] ?? 0), true);
            b.writeString('frame_interval', String(anim['frame_interval'] ?? 0), true);
            b.writeString('start_delay', String(anim['start_delay'] ?? 0), true);
            b.writeString('start_alpha', String(anim['start_alpha'] ?? 255), true);
            b.writeString('end_alpha', String(anim['end_alpha'] ?? 255), true);
            b.writeBool('detach_target', anim['detach_target'] ?? false);
            b.writeBool('push_target', anim['push_target'] ?? false);
            b.writeString('easing_func_id_name', anim['easing_func'] ?? '');
            b.closeTag('animation_info');
        }
        b.closeTag('action_info');
    }
    // -------------------------------------------------------------------------
    // WriteWidgetFolders / WriteWidgets
    // -------------------------------------------------------------------------
    writeWidgetFolders(b, d) {
        for (const folder of d.folders) {
            b.openTag('widget_folder');
            b.writeString('folder_name', folder.folder_name, true);
            b.writeString('specified_output_name', folder.output_filename);
            this.writeWidgets(b, folder.widgets);
            b.closeTag('widget_folder');
        }
    }
    writeWidgets(b, widgets) {
        for (const w of widgets) {
            b.openTag('widget');
            this.writeOneWidget(b, w);
            this.writeWidgets(b, w.children);
            b.closeTag('widget');
        }
    }
    /**
     * Write one widget's base fields (mirrors widget_service_provider::WriteToProject).
     * Widget-type-specific fields are written by the WidgetService implementations.
     */
    writeOneWidget(b, w) {
        const typeName = WIDGET_TYPE_TO_NAME.get(w.basetype) ?? 'widget';
        b.writeString('type', typeName);
        b.writeString('app_name', w.app_name);
        b.writeRect('size', w.size.left, w.size.top, w.size.right, w.size.bottom);
        b.writeUnsigned('style', w.style);
        b.writeInt('allocation', w.allocation);
        b.writeBool('accepts_focus', w.accepts_focus);
        // Color IDs — stored as resource name strings (version 53+)
        // In the TypeScript model we store numeric IDs; reverse-lookup to name is in
        // the write path via ResourceDictionary.  For now write "0" as placeholder.
        b.writeString('normal_fill_color', String(w.color_id[0]), true);
        b.writeString('selected_fill_color', String(w.color_id[1]), true);
        b.writeString('disabled_fill_color', String(w.color_id[2]), true);
        b.writeString('event_handler', w.event_func);
        b.writeString('draw_func', w.draw_func);
        b.writeString('id_name', w.id_name);
        b.writeString('custom_name', w.custom_name);
        b.writeString('user_data', w.user_data);
        b.writeBool('template', w.is_template);
        b.writeBool('visible_at_startup', w.visible_at_startup);
    }
};
exports.GxpWriter = GxpWriter;
exports.GxpWriter = GxpWriter = __decorate([
    (0, inversify_1.injectable)()
], GxpWriter);


/***/ }),
/* 94 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * SnapEngine — snap-to-grid and snap-to-widget logic.
 *
 * Ports CalSnap2GridDelta(), CalSnap2WidgetDelta(), and Snap2Widget()
 * from target_screen.cpp.
 *
 * All coordinates are in canvas pixels (zoom-independent).
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SnapEngine = void 0;
const inversify_1 = __webpack_require__(2);
__webpack_require__(3);
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function rectWidth(r) { return r.right - r.left + 1; }
function rectHeight(r) { return r.bottom - r.top + 1; }
function shiftRect(r, dx, dy) {
    return { left: r.left + dx, top: r.top + dy, right: r.right + dx, bottom: r.bottom + dy };
}
// ---------------------------------------------------------------------------
// SnapEngine
// ---------------------------------------------------------------------------
let SnapEngine = class SnapEngine {
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
    snapToGrid(value, delta, spacing) {
        if (delta === 0 || spacing <= 0)
            return delta;
        const newPos = value + delta;
        const dist = newPos % spacing;
        const halfSpacing = Math.floor(spacing / 2);
        let snapDist = 0;
        if (dist !== 0) {
            if (Math.abs(dist) < halfSpacing) {
                // Closer to the previous grid line — snap back
                snapDist = -dist;
            }
            else {
                // Closer to the next grid line — snap forward
                const sign = dist < 0 ? -1 : 1;
                snapDist = spacing * sign - dist;
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
    snap(selected, siblings, deltaX, deltaY, snapSpacing) {
        const lines = [];
        const adjX = this.snapAxis(selected, siblings, deltaX, 0, snapSpacing, lines);
        const adjY = this.snapAxis(selected, siblings, deltaY, 1, snapSpacing, lines);
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
    snapAxis(selected, siblings, delta, axis, maxDist, outLines) {
        const candidate = axis === 0
            ? shiftRect(selected, delta, 0)
            : shiftRect(selected, 0, delta);
        let bestDist = maxDist + 1; // larger than any valid snap
        let bestSnap = 0;
        for (const target of siblings) {
            const srcEdges = this.getEdges(candidate, axis);
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
                const srcEdges = this.getEdges(snappedRect, axis);
                const targetEdges = this.getEdges(target, axis);
                for (const srcVal of srcEdges) {
                    for (const tgtVal of targetEdges) {
                        if (srcVal === tgtVal) {
                            outLines.push({
                                direction: axis === 0
                                    ? 1 /* SnapLineDirection.Vertical */
                                    : 0 /* SnapLineDirection.Horizontal */,
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
    getEdges(rect, axis) {
        if (axis === 0) {
            const w = rectWidth(rect);
            return [rect.left, rect.left + Math.floor(w / 2), rect.right];
        }
        else {
            const h = rectHeight(rect);
            return [rect.top, rect.top + Math.floor(h / 2), rect.bottom];
        }
    }
};
exports.SnapEngine = SnapEngine;
exports.SnapEngine = SnapEngine = __decorate([
    (0, inversify_1.injectable)()
], SnapEngine);


/***/ }),
/* 95 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * SelectionManager — tracks selected widgets and computes drag/resize mode.
 *
 * Ports the SelectedWidgets array, CheckResizeCursor(), UpdateWidgetSize(),
 * ShiftSelectedWidgets(), and IsWidgetSelected() logic from target_screen.cpp.
 *
 * All coordinates are canvas pixels (zoom-independent).
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SelectionManager = exports.SELECT_HANDLE_SIZE = void 0;
exports.cursorForDragMode = cursorForDragMode;
const inversify_1 = __webpack_require__(2);
__webpack_require__(3);
// ---------------------------------------------------------------------------
// Constants (mirrors target_screen.cpp #defines)
// ---------------------------------------------------------------------------
/** Half-width of the resize handle hit zone in canvas pixels. */
exports.SELECT_HANDLE_SIZE = 5;
/** CSS cursor name for a drag mode. */
function cursorForDragMode(mode) {
    switch (mode) {
        case 1 /* DragMode.TopLeft */: return 'nw-resize';
        case 2 /* DragMode.Top */: return 'n-resize';
        case 3 /* DragMode.TopRight */: return 'ne-resize';
        case 4 /* DragMode.Right */: return 'e-resize';
        case 5 /* DragMode.BottomRight */: return 'se-resize';
        case 6 /* DragMode.Bottom */: return 's-resize';
        case 7 /* DragMode.BottomLeft */: return 'sw-resize';
        case 8 /* DragMode.Left */: return 'w-resize';
        case 9 /* DragMode.All */: return 'move';
        default: return 'default';
    }
}
// ---------------------------------------------------------------------------
// SelectionManager
// ---------------------------------------------------------------------------
let SelectionManager = class SelectionManager {
    constructor() {
        this._selected = [];
    }
    // -------------------------------------------------------------------------
    // Selection state
    // -------------------------------------------------------------------------
    get selection() {
        return this._selected;
    }
    isSelected(widget) {
        return this._selected.includes(widget);
    }
    /** Replace the entire selection. */
    setSelection(widgets) {
        this._selected.length = 0;
        this._selected.push(...widgets);
    }
    /** Select a single widget; optionally add to existing selection. */
    selectWidget(widget, additive) {
        if (!additive) {
            this._selected.length = 0;
        }
        if (!this._selected.includes(widget)) {
            this._selected.push(widget);
        }
    }
    deselect(widget) {
        const idx = this._selected.indexOf(widget);
        if (idx !== -1)
            this._selected.splice(idx, 1);
    }
    clearSelection() {
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
    hitTestHandle(canvasPoint) {
        if (this._selected.length === 0)
            return 0 /* DragMode.None */;
        // Use the first (primary) selected widget
        const widget = this._selected[0];
        const inner = widget.size;
        const outer = expandRect(inner, exports.SELECT_HANDLE_SIZE);
        if (!pointInRect(canvasPoint, outer))
            return 0 /* DragMode.None */;
        if (pointInRect(canvasPoint, inner))
            return 0 /* DragMode.None */;
        const { x, y } = canvasPoint;
        if (y < inner.top) {
            if (x < inner.left)
                return 1 /* DragMode.TopLeft */;
            if (x > inner.right)
                return 3 /* DragMode.TopRight */;
            return 2 /* DragMode.Top */;
        }
        if (y > inner.bottom) {
            if (x < inner.left)
                return 7 /* DragMode.BottomLeft */;
            if (x > inner.right)
                return 5 /* DragMode.BottomRight */;
            return 6 /* DragMode.Bottom */;
        }
        // y is inside [inner.top, inner.bottom]
        if (x < inner.left)
            return 8 /* DragMode.Left */;
        return 4 /* DragMode.Right */;
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
    applyResize(rect, mode, deltaX, deltaY) {
        const r = { ...rect };
        switch (mode) {
            case 1 /* DragMode.TopLeft */:
                r.left += deltaX;
                r.top += deltaY;
                break;
            case 2 /* DragMode.Top */:
                r.top += deltaY;
                break;
            case 3 /* DragMode.TopRight */:
                r.right += deltaX;
                r.top += deltaY;
                break;
            case 4 /* DragMode.Right */:
                r.right += deltaX;
                break;
            case 5 /* DragMode.BottomRight */:
                r.right += deltaX;
                r.bottom += deltaY;
                break;
            case 6 /* DragMode.Bottom */:
                r.bottom += deltaY;
                break;
            case 7 /* DragMode.BottomLeft */:
                r.left += deltaX;
                r.bottom += deltaY;
                break;
            case 8 /* DragMode.Left */:
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
    computeMoveDeltas(deltaX, deltaY) {
        const result = new Map();
        for (const w of this._selected) {
            result.set(w, {
                left: w.size.left + deltaX,
                top: w.size.top + deltaY,
                right: w.size.right + deltaX,
                bottom: w.size.bottom + deltaY,
            });
        }
        return result;
    }
    // -------------------------------------------------------------------------
    // Selection rectangle (bounding box of all selected widgets)
    // -------------------------------------------------------------------------
    selectionBounds() {
        if (this._selected.length === 0)
            return null;
        let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity;
        for (const w of this._selected) {
            minL = Math.min(minL, w.size.left);
            minT = Math.min(minT, w.size.top);
            maxR = Math.max(maxR, w.size.right);
            maxB = Math.max(maxB, w.size.bottom);
        }
        return { left: minL, top: minT, right: maxR, bottom: maxB };
    }
};
exports.SelectionManager = SelectionManager;
exports.SelectionManager = SelectionManager = __decorate([
    (0, inversify_1.injectable)()
], SelectionManager);
// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function expandRect(r, by) {
    return { left: r.left - by, top: r.top - by, right: r.right + by, bottom: r.bottom + by };
}
function pointInRect(p, r) {
    return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}


/***/ }),
/* 96 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * ProjectView — VS Code TreeView provider for the GUIX project/screen hierarchy.
 *
 * Ports guix_studio/project_view.cpp (CTreeView-based MFC panel).
 *
 * Tree shape mirrors the original:
 *   Project
 *     Display 1
 *       Screen 1  (top-level widget in folder)
 *         Child widget
 *           Grandchild …
 *       Folder A
 *         Template widget
 *     Display 2
 *       …
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ProjectView = void 0;
const vscode = __importStar(__webpack_require__(1));
const inversify_1 = __webpack_require__(2);
// ---------------------------------------------------------------------------
// ProjectView — TreeDataProvider
// ---------------------------------------------------------------------------
let ProjectView = class ProjectView {
    constructor() {
        // ── VS Code event emitter ──────────────────────────────────────────────
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        // ── State ──────────────────────────────────────────────────────────────
        this.project = null;
        /** Currently selected widget info, broadast to other panels. */
        this._selectedWidget = null;
        /** Listeners notified when the selection changes. */
        this.selectionListeners = [];
    }
    get selectedWidget() { return this._selectedWidget; }
    // ── Project lifecycle ──────────────────────────────────────────────────
    /** Called by the extension when a project is opened / reloaded. */
    openProject(project) {
        this.project = project;
        this._selectedWidget = null;
        this._onDidChangeTreeData.fire();
    }
    /** Called by the extension when the project is closed. */
    closeProject() {
        this.project = null;
        this._selectedWidget = null;
        this._onDidChangeTreeData.fire();
    }
    /** Notify that a widget's name was changed externally (e.g. via property panel). */
    notifyNameChange(widget) {
        // Find and refresh the node for this widget
        const node = this.findNodeForWidget(widget);
        if (node) {
            this._onDidChangeTreeData.fire(node);
        }
    }
    /** Notify that the whole tree must be rebuilt (e.g. add/delete screen). */
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    // ── Selection ──────────────────────────────────────────────────────────
    /** Registers a listener called when the user selects a widget node. */
    onSelectionChange(listener) {
        this.selectionListeners.push(listener);
    }
    /** Called by the extension's `onDidChangeSelection` handler from the registered view. */
    handleSelectionChange(nodes) {
        const first = nodes[0];
        const widget = first?.kind === 'widget' ? (first.widgetInfo ?? null) : null;
        this._selectedWidget = widget;
        for (const l of this.selectionListeners)
            l(widget);
    }
    // ── TreeDataProvider implementation ────────────────────────────────────
    getTreeItem(node) {
        const collapsible = (node.kind === 'root' || node.kind === 'display' || node.kind === 'folder')
            ? vscode.TreeItemCollapsibleState.Expanded
            : this.hasChildren(node)
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None;
        const item = new vscode.TreeItem(node.label, collapsible);
        item.id = node.id;
        item.contextValue = node.kind;
        const icon = iconForNode(node);
        if (icon)
            item.iconPath = icon;
        item.tooltip = this.tooltipForNode(node);
        if (node.kind === 'widget') {
            item.command = {
                command: 'guixStudio.selectWidget',
                title: 'Select',
                arguments: [node],
            };
        }
        return item;
    }
    getChildren(node) {
        if (!this.project)
            return [];
        if (!node) {
            // Root level: one entry per display
            return this.project.displays.map((d, i) => displayNode(d, i));
        }
        switch (node.kind) {
            case 'display': {
                const disp = node.displayInfo;
                return disp.folders.map((f, fi) => folderNode(f, node.id, fi));
            }
            case 'folder': {
                const folder = node.folderInfo;
                return folder.widgets.map((w, wi) => widgetNode(w, node.id, wi));
            }
            case 'widget': {
                const w = node.widgetInfo;
                return w.children.map((c, ci) => widgetNode(c, node.id, ci));
            }
            default:
                return [];
        }
    }
    getParent(_node) {
        // VS Code uses this for reveal(); return null to keep things simple
        // (full parent-tracking would require a bidirectional index)
        return null;
    }
    // ── Helpers ────────────────────────────────────────────────────────────
    hasChildren(node) {
        if (node.kind === 'widget')
            return (node.widgetInfo?.children.length ?? 0) > 0;
        return false;
    }
    tooltipForNode(node) {
        if (node.kind === 'widget' && node.widgetInfo) {
            const w = node.widgetInfo;
            const sz = w.size;
            return `${w.app_name}  [${sz.left},${sz.top},${sz.right},${sz.bottom}]`;
        }
        if (node.kind === 'display' && node.displayInfo) {
            const d = node.displayInfo;
            return `${d.name}  ${d.xres}×${d.yres}`;
        }
        return node.label;
    }
    /**
     * Walk every widget in every display to find a node wrapping the given
     * WidgetInfo reference.  Returns null if not found.
     */
    findNodeForWidget(target) {
        if (!this.project)
            return null;
        for (const [di, disp] of this.project.displays.entries()) {
            for (const [fi, folder] of disp.folders.entries()) {
                const dn = displayNode(disp, di);
                const fn = folderNode(folder, dn.id, fi);
                const result = searchWidgets(folder.widgets, fn.id, target);
                if (result)
                    return result;
            }
        }
        return null;
    }
};
exports.ProjectView = ProjectView;
exports.ProjectView = ProjectView = __decorate([
    (0, inversify_1.injectable)()
], ProjectView);
// ---------------------------------------------------------------------------
// Pure node-factory helpers
// ---------------------------------------------------------------------------
function displayNode(disp, index) {
    return {
        kind: 'display',
        label: `${disp.name} (${disp.xres}×${disp.yres})`,
        id: `display-${index}`,
        displayInfo: disp,
    };
}
function folderNode(folder, parentId, index) {
    return {
        kind: 'folder',
        label: folder.folder_name || `Folder ${index}`,
        id: `${parentId}-folder-${index}`,
        folderInfo: folder,
    };
}
function widgetNode(w, parentId, index) {
    return {
        kind: 'widget',
        label: w.app_name || w.base_name || `Widget ${index}`,
        id: `${parentId}-widget-${w.app_name || index}`,
        widgetInfo: w,
    };
}
function searchWidgets(widgets, parentId, target) {
    for (const [i, w] of widgets.entries()) {
        const node = widgetNode(w, parentId, i);
        if (w === target)
            return node;
        const found = searchWidgets(w.children, node.id, target);
        if (found)
            return found;
    }
    return null;
}
// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------
function iconForNode(node) {
    switch (node.kind) {
        case 'display': return new vscode.ThemeIcon('device-desktop');
        case 'folder': return new vscode.ThemeIcon('folder');
        case 'widget': return iconForWidgetType(node.widgetInfo?.basetype ?? 0);
        default: return undefined;
    }
}
/**
 * Maps GX_TYPE_* to a VS Code codicon.
 * Full type-to-icon map mirrors ProjectViewImageMap[] in project_view.cpp.
 */
function iconForWidgetType(basetype) {
    // GX_TYPE ranges (from gx_api.h)
    //   0x00-0x0F  basic primitives / windows
    //   0x10-0x1F  buttons
    //   0x20-0x2F  text widgets
    //   0x30-0x3F  scrollbars
    //   0x40-0x4F  sliders / gauges
    //   0x50-0x5F  list / scroll wheel
    //   0x60-0x7F  charts / menus
    if (basetype >= 0x10 && basetype < 0x20)
        return new vscode.ThemeIcon('check'); // buttons
    if (basetype >= 0x20 && basetype < 0x30)
        return new vscode.ThemeIcon('symbol-string'); // text
    if (basetype >= 0x30 && basetype < 0x40)
        return new vscode.ThemeIcon('list-flat'); // scrollbar
    if (basetype >= 0x40 && basetype < 0x60)
        return new vscode.ThemeIcon('dashboard'); // sliders/gauges
    if (basetype >= 0x60 && basetype < 0x80)
        return new vscode.ThemeIcon('symbol-array'); // list/menu
    return new vscode.ThemeIcon('window'); // default: window
}


/***/ }),
/* 97 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PropertyPanel = void 0;
exports.applyPropertyChange = applyPropertyChange;
const inversify_1 = __webpack_require__(2);
// ---------------------------------------------------------------------------
// PropertyPanel
// ---------------------------------------------------------------------------
let PropertyPanel = class PropertyPanel {
    constructor() {
        this.currentWidget = null;
        this.currentProject = null;
        /** Listeners notified when the user edits a property. */
        this.changeListeners = [];
    }
    // ── Registration helpers ───────────────────────────────────────────────
    onPropertyChange(listener) {
        this.changeListeners.push(listener);
    }
    // ── IPropertyPanel ─────────────────────────────────────────────────────
    showWidget(widget, project) {
        this.currentWidget = widget;
        this.currentProject = project;
        this.updateView();
    }
    widgetWasModified(widget) {
        if (this.currentWidget === widget)
            this.updateView();
    }
    // ── WebviewViewProvider ────────────────────────────────────────────────
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.onDidDispose(() => { this.view = undefined; });
        webviewView.webview.onDidReceiveMessage((msg) => this.onMessage(msg));
        this.updateView();
    }
    // ── Internal ───────────────────────────────────────────────────────────
    updateView() {
        if (!this.view)
            return;
        this.view.webview.html = this.buildHtml(this.view.webview, this.currentWidget);
    }
    onMessage(msg) {
        if (typeof msg !== 'object' || msg === null)
            return;
        const m = msg;
        if (m['type'] !== 'propChange')
            return;
        if (!this.currentWidget)
            return;
        const event = {
            field: String(m['field'] ?? ''),
            value: m['value'],
        };
        applyPropertyChange(this.currentWidget, event);
        for (const l of this.changeListeners)
            l(this.currentWidget, event);
    }
    buildHtml(_webview, widget) {
        const nonce = generateNonce();
        const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;
        const body = widget
            ? buildPropertyGroups(widget, this.currentProject)
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
};
exports.PropertyPanel = PropertyPanel;
PropertyPanel.viewId = 'guixStudio.propertyPanel';
exports.PropertyPanel = PropertyPanel = __decorate([
    (0, inversify_1.injectable)()
], PropertyPanel);
// ---------------------------------------------------------------------------
// Property group builders  (mirrors AddWidgetProps() dispatch + per-type helpers)
// ---------------------------------------------------------------------------
function buildPropertyGroups(w, project) {
    const groups = [];
    groups.push(groupCommon(w));
    groups.push(groupGeometry(w.size));
    groups.push(groupAppearance(w, project));
    // ── Widget-type-specific groups ────────────────────────────────────────
    const ext = w.ewi;
    if (ext) {
        switch (ext.kind) {
            case 'slider':
                groups.push(groupSlider(ext.info));
                break;
            case 'progress':
                groups.push(groupProgress(ext.info));
                break;
            case 'radial_progress':
                groups.push(groupRadialProgress(ext.info));
                break;
            case 'radial_slider':
                groups.push(groupRadialSlider(ext.info));
                break;
            case 'vlist':
                groups.push(groupList(ext.info.total_rows, ext.info.seperation));
                break;
            case 'drop_list':
                groups.push(groupDropList(ext.info));
                break;
            case 'text_info':
                groups.push(groupTextInput(ext.info));
                break;
            case 'gauge':
                groups.push(groupGauge(ext.info));
                break;
            case 'line_chart':
                groups.push(groupLineChart(ext.info));
                break;
            case 'scroll_wheel':
            case 'string_scroll_wheel':
            case 'numeric_scroll_wheel':
                groups.push(groupScrollWheel(ext.kind === 'scroll_wheel' ? ext.info :
                    ext.kind === 'string_scroll_wheel' ? ext.info.base :
                        ext.info.base));
                break;
            case 'menu':
                groups.push(groupMenu(ext.info));
                break;
            default: break;
        }
    }
    groups.push(groupCallbacks(w));
    return groups.join('\n');
}
// ---------------------------------------------------------------------------
// Group: Common Properties
// ---------------------------------------------------------------------------
function groupCommon(w) {
    return group('Common', [
        row('Name', textField('app_name', w.app_name)),
        row('ID', textField('id_name', w.id_name)),
        row('Base Name', textField('base_name', w.base_name)),
        row('User Data', textField('user_data', w.user_data)),
        row('Visible', checkField('style_visible', !!(w.style & 0x00000001))),
        row('Enabled', checkField('style_enabled', !!(w.style & 0x00000002))),
        row('Transparent', checkField('style_transparent', !!(w.style & 0x00000010))),
    ]);
}
// ---------------------------------------------------------------------------
// Group: Geometry
// ---------------------------------------------------------------------------
function groupGeometry(size) {
    return group('Position & Size', [
        row('Left', numField('size.left', size.left)),
        row('Top', numField('size.top', size.top)),
        row('Right', numField('size.right', size.right)),
        row('Bottom', numField('size.bottom', size.bottom)),
        row('Width', `<span style="font-size:11px;padding:2px 4px">${size.right - size.left + 1}</span>`),
        row('Height', `<span style="font-size:11px;padding:2px 4px">${size.bottom - size.top + 1}</span>`),
    ]);
}
// ---------------------------------------------------------------------------
// Group: Appearance
// ---------------------------------------------------------------------------
function groupAppearance(w, _project) {
    const borderOptions = [
        [0, 'None'],
        [1, 'Simple'],
        [2, 'Raised'],
        [3, 'Recessed'],
        [4, 'Thin'],
    ];
    const borderSel = selectField('border', (w.style >> 8) & 0xF, borderOptions.map(([v, l]) => option(Number(v), String(l))).join(''));
    return group('Appearance', [
        row('Border', borderSel),
        row('Normal Color', numField('color_id.0', w.color_id[0])),
        row('Selected Color', numField('color_id.1', w.color_id[1])),
        row('Disabled Color', numField('color_id.2', w.color_id[2])),
        row('Normal Font', numField('font_id.0', w.font_id[0])),
        row('Normal Pixelmap', numField('pixelmap_id.0', w.pixelmap_id[0])),
        row('String 0', numField('string_id.0', w.string_id[0])),
    ]);
}
// ---------------------------------------------------------------------------
// Group: Callbacks
// ---------------------------------------------------------------------------
function groupCallbacks(w) {
    return group('Functions', [
        row('Event Func', textField('event_func', w.event_func)),
        row('Draw Func', textField('draw_func', w.draw_func)),
        row('Callback', textField('callback_func', w.callback_func)),
    ]);
}
// ---------------------------------------------------------------------------
// Type-specific property groups
// ---------------------------------------------------------------------------
function groupSlider(s) {
    return group('Slider', [
        row('Min Value', numField('ext.min_val', s.min_val)),
        row('Max Value', numField('ext.max_val', s.max_val)),
        row('Current Val', numField('ext.current_val', s.current_val)),
        row('Increment', numField('ext.increment', s.increment)),
        row('Min Travel', numField('ext.min_travel', s.min_travel)),
        row('Max Travel', numField('ext.max_travel', s.max_travel)),
        row('Needle Width', numField('ext.needle_width', s.needle_width)),
        row('Needle Height', numField('ext.needle_height', s.needle_height)),
        row('Needle Inset', numField('ext.needle_inset', s.needle_inset)),
    ]);
}
function groupProgress(p) {
    return group('Progress Bar', [
        row('Min Value', numField('ext.min_val', p.min_val)),
        row('Max Value', numField('ext.max_val', p.max_val)),
        row('Current Val', numField('ext.current_val', p.current_val)),
    ]);
}
function groupRadialProgress(r) {
    return group('Radial Progress', [
        row('Center X', numField('ext.xcenter', r.xcenter)),
        row('Center Y', numField('ext.ycenter', r.ycenter)),
        row('Radius', numField('ext.radius', r.radius)),
        row('Current Val', numField('ext.current_val', r.current_val)),
        row('Anchor Val', numField('ext.anchor_val', r.anchor_val)),
    ]);
}
function groupRadialSlider(r) {
    return group('Radial Slider', [
        row('Center X', numField('ext.xcenter', r.xcenter)),
        row('Center Y', numField('ext.ycenter', r.ycenter)),
        row('Radius', numField('ext.radius', r.radius)),
        row('Min Angle', numField('ext.min_angle', r.min_angle)),
        row('Max Angle', numField('ext.max_angle', r.max_angle)),
        row('Current Angle', numField('ext.current_angle', r.current_angle)),
    ]);
}
function groupList(totalRows, separation) {
    return group('List', [
        row('Total Rows', numField('ext.total_rows', totalRows)),
        row('Separation', numField('ext.seperation', separation)),
    ]);
}
function groupDropList(d) {
    return group('Drop List', [
        row('Total Rows', numField('ext.total_rows', d.total_rows)),
        row('Separation', numField('ext.seperation', d.seperation)),
        row('Open Height', numField('ext.open_height', d.open_height)),
    ]);
}
function groupTextInput(t) {
    return group('Text Input', [
        row('Whitespace', numField('ext.whitespace', t.whitespace)),
        row('Line Space', numField('ext.line_space', t.line_space)),
        row('Buffer Size', numField('ext.buffer_size', t.buffer_size)),
        row('Dynamic Buf', checkField('ext.dynamic_buffer', t.dynamic_buffer)),
    ]);
}
function groupGauge(g) {
    return group('Circular Gauge', [
        row('Center X', numField('ext.xcenter', g.xcenter)),
        row('Center Y', numField('ext.ycenter', g.ycenter)),
        row('Radius', numField('ext.radius', g.radius)),
        row('Start Angle', numField('ext.start_angle', g.start_angle)),
        row('End Angle', numField('ext.end_angle', g.end_angle)),
        row('Min Angle', numField('ext.min_angle', g.min_angle)),
        row('Max Angle', numField('ext.max_angle', g.max_angle)),
    ]);
}
function groupLineChart(c) {
    return group('Line Chart', [
        row('Left Margin', numField('ext.left_margin', c.left_margin)),
        row('Right Margin', numField('ext.right_margin', c.right_margin)),
        row('Top Margin', numField('ext.top_margin', c.top_margin)),
        row('Bottom Margin', numField('ext.bottom_margin', c.bottom_margin)),
        row('Max Data Cnt', numField('ext.max_data_count', c.max_data_count)),
    ]);
}
function groupScrollWheel(sw) {
    return group('Scroll Wheel', [
        row('Total Rows', numField('ext.total_rows', sw.total_rows)),
        row('Row Height', numField('ext.row_height', sw.row_height)),
        row('Selected Row', numField('ext.selected_row', sw.selected_row)),
        row('Start Alpha', numField('ext.start_alpha', sw.start_alpha)),
        row('End Alpha', numField('ext.end_alpha', sw.end_alpha)),
    ]);
}
function groupMenu(m) {
    return group('Menu', [
        row('Text X Offset', numField('ext.text_x_offset', m.text_x_offset)),
        row('Text Y Offset', numField('ext.text_y_offset', m.text_y_offset)),
        row('List Total Count', numField('ext.list_total_count', m.list_total_count)),
    ]);
}
// ---------------------------------------------------------------------------
// Apply property change (host-side mutation — called before undo command in Phase 4)
// ---------------------------------------------------------------------------
/**
 * Mutates `widget` in place for the given property field + value.
 * Supports dotted paths: 'size.left', 'color_id.0', 'style_visible', etc.
 */
function applyPropertyChange(widget, event) {
    const { field, value } = event;
    // Geometry
    if (field.startsWith('size.')) {
        const key = field.slice(5);
        if (key in widget.size)
            widget.size[key] = Number(value);
        return;
    }
    // Color IDs
    if (field.startsWith('color_id.')) {
        const idx = parseInt(field.slice(9), 10);
        if (idx >= 0 && idx < widget.color_id.length)
            widget.color_id[idx] = Number(value);
        return;
    }
    // Font IDs
    if (field.startsWith('font_id.')) {
        const idx = parseInt(field.slice(8), 10);
        if (idx >= 0 && idx < widget.font_id.length)
            widget.font_id[idx] = Number(value);
        return;
    }
    // Pixelmap IDs
    if (field.startsWith('pixelmap_id.')) {
        const idx = parseInt(field.slice(12), 10);
        if (idx >= 0 && idx < widget.pixelmap_id.length)
            widget.pixelmap_id[idx] = Number(value);
        return;
    }
    // String IDs
    if (field.startsWith('string_id.')) {
        const idx = parseInt(field.slice(10), 10);
        if (idx >= 0 && idx < widget.string_id.length)
            widget.string_id[idx] = Number(value);
        return;
    }
    // Style bit-flags
    if (field === 'style_visible') {
        toggleStyleBit(widget, 0x00000001, Boolean(value));
        return;
    }
    if (field === 'style_enabled') {
        toggleStyleBit(widget, 0x00000002, Boolean(value));
        return;
    }
    if (field === 'style_transparent') {
        toggleStyleBit(widget, 0x00000010, Boolean(value));
        return;
    }
    if (field === 'border') {
        widget.style = (widget.style & ~0x00000F00) | ((Number(value) & 0xF) << 8);
        return;
    }
    // Scalar fields
    const scalarFields = [
        'app_name', 'id_name', 'base_name', 'user_data',
        'event_func', 'draw_func', 'callback_func', 'format_func',
    ];
    for (const f of scalarFields) {
        if (field === f) {
            widget[f] = String(value);
            return;
        }
    }
}
function toggleStyleBit(widget, bit, on) {
    if (on)
        widget.style |= bit;
    else
        widget.style &= ~bit;
}
// ---------------------------------------------------------------------------
// HTML building helpers
// ---------------------------------------------------------------------------
function group(title, rows) {
    return `<div class="group-header">${escHtml(title)}</div>
<div class="group-body">${rows.join('')}</div>`;
}
function row(label, control) {
    return `<div class="prop-row">
  <div class="prop-label">${escHtml(label)}</div>
  <div class="prop-value">${control}</div>
</div>`;
}
function textField(field, value) {
    return `<input type="text" data-field="${escAttr(field)}" value="${escAttr(value)}">`;
}
function numField(field, value) {
    return `<input type="number" data-field="${escAttr(field)}" value="${value}">`;
}
function checkField(field, checked) {
    return `<input type="checkbox" data-field="${escAttr(field)}"${checked ? ' checked' : ''}>`;
}
function selectField(field, _value, optionsHtml) {
    return `<select data-field="${escAttr(field)}">${optionsHtml}</select>`;
}
function option(value, label) {
    return `<option value="${value}">${escHtml(label)}</option>`;
}
// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------
function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
function generateNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        const arr = new Uint32Array(16);
        globalThis.crypto.getRandomValues(arr);
        for (const n of arr)
            result += chars[n % chars.length];
    }
    else {
        for (let i = 0; i < 32; i++)
            result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}


/***/ }),
/* 98 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * ResourcePanel — VS Code TreeView provider for the GUIX resource tree.
 *
 * Ports guix_studio/resource_view.cpp (CScrollView + custom resource_tree renderer).
 *
 * Tree shape mirrors the original per-display, per-theme hierarchy:
 *
 *   [Theme]
 *     Colors
 *       Color 1
 *       Color 2
 *     Fonts
 *       Font 1
 *     Pixelmaps
 *       Default Folder
 *         Pixelmap 1
 *       Custom Folder A
 *         Pixelmap 2
 *     Strings
 *       String 1
 *
 * Each display × theme has its own resource tree.  The active display index
 * and active theme index are switched by calling selectDisplay() / selectTheme().
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ResourcePanel = void 0;
const vscode = __importStar(__webpack_require__(1));
const inversify_1 = __webpack_require__(2);
const gx_types_1 = __webpack_require__(90);
// ---------------------------------------------------------------------------
// ResourcePanel
// ---------------------------------------------------------------------------
let ResourcePanel = class ResourcePanel {
    constructor() {
        // ── VS Code event emitter ──────────────────────────────────────────────
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        // ── State ──────────────────────────────────────────────────────────────
        this.project = null;
        this.displayIndex = 0;
    }
    // ── Project lifecycle ──────────────────────────────────────────────────
    openProject(project) {
        this.project = project;
        this.displayIndex = 0;
        this._onDidChangeTreeData.fire();
    }
    closeProject() {
        this.project = null;
        this._onDidChangeTreeData.fire();
    }
    /** Switch active display; resets theme to 0. */
    selectDisplay(index) {
        this.displayIndex = index;
        this._onDidChangeTreeData.fire();
    }
    /** Switch active theme within the current display. */
    selectTheme(_index) {
        // Reserved for future per-theme resource scoping
        this._onDidChangeTreeData.fire();
    }
    /** Notify a resource was added, renamed or deleted. */
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    // ── Active display / theme accessors ───────────────────────────────────
    get activeDisplay() {
        return this.project?.displays[this.displayIndex] ?? null;
    }
    // activeTheme is available for future use (e.g. theme-scoped resource editing)
    // private get activeTheme(): ThemeInfo | null {
    //     return this.activeDisplay?.themes[this.themeIndex] ?? null;
    // }
    // ── TreeDataProvider ───────────────────────────────────────────────────
    getTreeItem(node) {
        const isLeaf = isLeafType(node.type);
        const state = isLeaf
            ? vscode.TreeItemCollapsibleState.None
            : vscode.TreeItemCollapsibleState.Expanded;
        const item = new vscode.TreeItem(node.label, state);
        item.id = node.id;
        item.contextValue = resContextValue(node.type);
        item.iconPath = iconForResType(node.type, node.resInfo);
        item.tooltip = tooltipForNode(node);
        if (!isLeaf && node.type !== gx_types_1.RES_TYPE_ADD_COLOR
            && node.type !== gx_types_1.RES_TYPE_ADD_FONT
            && node.type !== gx_types_1.RES_TYPE_ADD_PIXELMAP
            && node.type !== gx_types_1.RES_TYPE_ADD_STRING) {
            // No command on containers
        }
        else if (isAddType(node.type)) {
            item.command = {
                command: addCommandForType(node.type),
                title: node.label,
                arguments: [],
            };
        }
        else if (isLeaf) {
            item.command = {
                command: 'guixStudio.editResource',
                title: 'Edit',
                arguments: [node],
            };
        }
        return item;
    }
    getChildren(node) {
        if (!this.project)
            return [];
        if (!node) {
            // Root: one header per theme
            const disp = this.activeDisplay;
            if (!disp)
                return [];
            return disp.themes.map((t, i) => themeHeaderNode(t, i));
        }
        // If the node carries pre-built children (header / group / folder nodes)
        if (node.children)
            return node.children;
        // Leaf-level resource nodes have no children
        if (isLeafType(node.type))
            return [];
        // For folder-type nodes the children were built at construction time
        return [];
    }
    getParent(_node) {
        return null;
    }
};
exports.ResourcePanel = ResourcePanel;
ResourcePanel.viewId = 'guixStudio.resourcePanel';
exports.ResourcePanel = ResourcePanel = __decorate([
    (0, inversify_1.injectable)()
], ResourcePanel);
// ---------------------------------------------------------------------------
// Node-tree construction — mirrors resource_tree::BuildResourceTables()
// ---------------------------------------------------------------------------
function themeHeaderNode(theme, themeIndex) {
    const children = [];
    const resources = theme.resources;
    // The resources array contains the top-level group nodes from the .gxp reader:
    //   [0] = Color group root, [1] = Font group root, [2] = Pixelmap group root, [3] = String group root
    for (const [ri, res] of resources.entries()) {
        children.push(groupNode(res, `t${themeIndex}-g${ri}`));
    }
    return {
        id: `theme-${themeIndex}`,
        label: theme.theme_name || `Theme ${themeIndex}`,
        type: gx_types_1.RES_TYPE_HEADER,
        children,
    };
}
function groupNode(res, idPrefix) {
    // Group-level: Colors / Fonts / Pixelmaps / Strings
    const children = [];
    // Determine what type of resource items to emit
    const itemType = groupItemType(res.type);
    for (const [ci, child] of res.children.entries()) {
        const childId = `${idPrefix}-c${ci}`;
        if (child.type === gx_types_1.RES_TYPE_FOLDER) {
            children.push(folderNode(child, childId));
        }
        else {
            children.push(leafNode(child, childId, itemType));
        }
    }
    // "Add …" action node at end of group
    const addType = addTypeForGroup(res.type, itemType);
    if (addType !== 0) {
        children.push({
            id: `${idPrefix}-add`,
            label: addLabelForType(addType),
            type: addType,
        });
    }
    return {
        id: idPrefix,
        label: groupLabel(res),
        type: gx_types_1.RES_TYPE_GROUP,
        resInfo: res,
        children,
    };
}
function folderNode(res, idPrefix) {
    const children = res.children.map((c, i) => leafNode(c, `${idPrefix}-c${i}`, gx_types_1.RES_TYPE_PIXELMAP));
    // Add pixelmap action inside folders
    children.push({
        id: `${idPrefix}-add`,
        label: addLabelForType(gx_types_1.RES_TYPE_ADD_PIXELMAP),
        type: gx_types_1.RES_TYPE_ADD_PIXELMAP,
    });
    return {
        id: idPrefix,
        label: res.name || 'Folder',
        type: gx_types_1.RES_TYPE_FOLDER,
        resInfo: res,
        children,
    };
}
function leafNode(res, id, _hint) {
    return {
        id,
        label: res.name,
        type: res.type,
        resInfo: res,
    };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function groupLabel(res) {
    switch (res.type) {
        case gx_types_1.RES_TYPE_GROUP: {
            if (res.name)
                return res.name;
            // Infer from first child type
            const firstChild = res.children[0];
            if (!firstChild)
                return 'Resources';
            return groupLabelForItemType(firstChild.type);
        }
        default: return res.name || 'Group';
    }
}
function groupLabelForItemType(t) {
    switch (t) {
        case gx_types_1.RES_TYPE_COLOR: return 'Colors';
        case gx_types_1.RES_TYPE_FONT: return 'Fonts';
        case gx_types_1.RES_TYPE_PIXELMAP: return 'Pixelmaps';
        case gx_types_1.RES_TYPE_STRING: return 'Strings';
        default: return 'Resources';
    }
}
function groupItemType(groupType) {
    // Map group res.type → child leaf type
    // In the .gxp file, groups are stored with type=RES_TYPE_GROUP and their
    // children carry the real type.  We use folder_id as a hint stored in ResInfo.
    switch (groupType) {
        case gx_types_1.RES_TYPE_ADD_COLOR: return gx_types_1.RES_TYPE_COLOR;
        case gx_types_1.RES_TYPE_ADD_FONT: return gx_types_1.RES_TYPE_FONT;
        case gx_types_1.RES_TYPE_ADD_PIXELMAP: return gx_types_1.RES_TYPE_PIXELMAP;
        case gx_types_1.RES_TYPE_ADD_STRING: return gx_types_1.RES_TYPE_STRING;
        default: return gx_types_1.RES_TYPE_COLOR; // fallback
    }
}
function addTypeForGroup(groupResType, itemType) {
    if (groupResType === gx_types_1.RES_TYPE_GROUP) {
        switch (itemType) {
            case gx_types_1.RES_TYPE_COLOR: return gx_types_1.RES_TYPE_ADD_COLOR;
            case gx_types_1.RES_TYPE_FONT: return gx_types_1.RES_TYPE_ADD_FONT;
            case gx_types_1.RES_TYPE_PIXELMAP: return gx_types_1.RES_TYPE_ADD_PIXELMAP;
            case gx_types_1.RES_TYPE_STRING: return gx_types_1.RES_TYPE_ADD_STRING;
        }
    }
    return 0;
}
function addLabelForType(t) {
    switch (t) {
        case gx_types_1.RES_TYPE_ADD_COLOR: return '+ Add Color';
        case gx_types_1.RES_TYPE_ADD_FONT: return '+ Add Font';
        case gx_types_1.RES_TYPE_ADD_PIXELMAP: return '+ Add Pixelmap';
        case gx_types_1.RES_TYPE_ADD_STRING: return '+ Add String';
        default: return '+ Add';
    }
}
function addCommandForType(t) {
    switch (t) {
        case gx_types_1.RES_TYPE_ADD_COLOR: return 'guixStudio.addColor';
        case gx_types_1.RES_TYPE_ADD_FONT: return 'guixStudio.addFont';
        case gx_types_1.RES_TYPE_ADD_PIXELMAP: return 'guixStudio.addPixelmap';
        case gx_types_1.RES_TYPE_ADD_STRING: return 'guixStudio.addString';
        default: return 'guixStudio.addResource';
    }
}
function isLeafType(t) {
    return t === gx_types_1.RES_TYPE_COLOR
        || t === gx_types_1.RES_TYPE_FONT
        || t === gx_types_1.RES_TYPE_PIXELMAP
        || t === gx_types_1.RES_TYPE_STRING
        || isAddType(t);
}
function isAddType(t) {
    return t === gx_types_1.RES_TYPE_ADD_COLOR
        || t === gx_types_1.RES_TYPE_ADD_FONT
        || t === gx_types_1.RES_TYPE_ADD_PIXELMAP
        || t === gx_types_1.RES_TYPE_ADD_STRING;
}
function resContextValue(t) {
    switch (t) {
        case gx_types_1.RES_TYPE_HEADER: return 'resHeader';
        case gx_types_1.RES_TYPE_GROUP: return 'resGroup';
        case gx_types_1.RES_TYPE_FOLDER: return 'resFolder';
        case gx_types_1.RES_TYPE_COLOR: return 'resColor';
        case gx_types_1.RES_TYPE_FONT: return 'resFont';
        case gx_types_1.RES_TYPE_PIXELMAP: return 'resPixelmap';
        case gx_types_1.RES_TYPE_STRING: return 'resString';
        case gx_types_1.RES_TYPE_ADD_COLOR: return 'resAddColor';
        case gx_types_1.RES_TYPE_ADD_FONT: return 'resAddFont';
        case gx_types_1.RES_TYPE_ADD_PIXELMAP: return 'resAddPixelmap';
        case gx_types_1.RES_TYPE_ADD_STRING: return 'resAddString';
        default: return 'resUnknown';
    }
}
function iconForResType(t, res) {
    switch (t) {
        case gx_types_1.RES_TYPE_HEADER: return new vscode.ThemeIcon('symbol-namespace');
        case gx_types_1.RES_TYPE_GROUP: return new vscode.ThemeIcon('folder-opened');
        case gx_types_1.RES_TYPE_FOLDER: return new vscode.ThemeIcon('folder');
        case gx_types_1.RES_TYPE_COLOR: return colorSwatch(res);
        case gx_types_1.RES_TYPE_FONT: return new vscode.ThemeIcon('text-size');
        case gx_types_1.RES_TYPE_PIXELMAP: return new vscode.ThemeIcon('file-media');
        case gx_types_1.RES_TYPE_STRING: return new vscode.ThemeIcon('symbol-string');
        case gx_types_1.RES_TYPE_ADD_COLOR:
        case gx_types_1.RES_TYPE_ADD_FONT:
        case gx_types_1.RES_TYPE_ADD_PIXELMAP:
        case gx_types_1.RES_TYPE_ADD_STRING: return new vscode.ThemeIcon('add');
        default: return new vscode.ThemeIcon('circle-outline');
    }
}
function colorSwatch(res) {
    // VS Code doesn't support inline color swatches in tree items via ThemeIcon;
    // use a generic color icon.  A future enhancement could use a webview panel
    // or a custom TreeItem decoration.
    if (res && res.colorval !== 0) {
        return new vscode.ThemeIcon('symbol-color');
    }
    return new vscode.ThemeIcon('symbol-color');
}
function tooltipForNode(node) {
    if (!node.resInfo)
        return node.label;
    const r = node.resInfo;
    switch (r.type) {
        case gx_types_1.RES_TYPE_COLOR: {
            const hex = (r.colorval >>> 0).toString(16).toUpperCase().padStart(8, '0');
            return `${r.name}  #${hex}`;
        }
        case gx_types_1.RES_TYPE_FONT:
            return `${r.name}  ${r.font_height}px`;
        case gx_types_1.RES_TYPE_PIXELMAP:
            return r.pathinfo.pathname ? `${r.name}  ${r.pathinfo.pathname}` : r.name;
        default:
            return r.name;
    }
}


/***/ }),
/* 99 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ScreenFlowEditor = void 0;
const inversify_1 = __webpack_require__(2);
// ---------------------------------------------------------------------------
// Helper — convert ScreenFlowEntry[] from project model to FlowItem[]
// ---------------------------------------------------------------------------
function toFlowItems(entries) {
    return entries.map(e => ({
        screen_name: e.screen_name,
        // trigger_list is stored as unknown[] in the base model (typed here at the panel layer)
        triggers: e.trigger_list ?? [],
        enabled: true,
    }));
}
// ---------------------------------------------------------------------------
// ScreenFlowEditor
// ---------------------------------------------------------------------------
let ScreenFlowEditor = class ScreenFlowEditor {
    constructor() {
        this.project = null;
        this.displayIndex = 0;
        /** Per-display layout (positions + zoom), keyed by display index */
        this.layouts = new Map();
    }
    // ── Project lifecycle ──────────────────────────────────────────────────
    openProject(project) {
        this.project = project;
        this.displayIndex = 0;
        this.layouts.clear();
        this.updateView();
    }
    closeProject() {
        this.project = null;
        this.layouts.clear();
        this.updateView();
    }
    selectDisplay(index) {
        this.displayIndex = index;
        this.updateView();
    }
    /** Called when a screen was renamed — update diagram labels. */
    updateScreenName(oldName, newName) {
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
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.onDidDispose(() => { this.view = undefined; });
        webviewView.webview.onDidReceiveMessage((msg) => this.onMessage(msg));
        this.updateView();
    }
    // ── Internal ───────────────────────────────────────────────────────────
    get activeDisplay() {
        return this.project?.displays[this.displayIndex] ?? null;
    }
    layoutFor(displayIndex) {
        let l = this.layouts.get(displayIndex);
        if (!l) {
            l = { scale: 100, positions: {} };
            this.layouts.set(displayIndex, l);
        }
        return l;
    }
    updateView() {
        if (!this.view)
            return;
        const disp = this.activeDisplay;
        const items = disp ? toFlowItems(disp.screen_flow) : [];
        const layout = this.layoutFor(this.displayIndex);
        this.view.webview.html = buildDiagramHtml(items, layout);
    }
    onMessage(msg) {
        if (typeof msg !== 'object' || msg === null)
            return;
        const m = msg;
        switch (m['type']) {
            case 'move': {
                // User dragged a box
                const name = String(m['name'] ?? '');
                const x = Number(m['x'] ?? 0);
                const y = Number(m['y'] ?? 0);
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
};
exports.ScreenFlowEditor = ScreenFlowEditor;
ScreenFlowEditor.viewId = 'guixStudio.screenFlowEditor';
exports.ScreenFlowEditor = ScreenFlowEditor = __decorate([
    (0, inversify_1.injectable)()
], ScreenFlowEditor);
// ---------------------------------------------------------------------------
// SVG diagram builder
// ---------------------------------------------------------------------------
/** Fixed box dimensions — mirrors CRect in screen_flow.cpp */
const BOX_W = 120;
const BOX_H = 60;
const PAD_X = 180;
const PAD_Y = 100;
const COLS = 4; // default wrapping column count
function buildDiagramHtml(items, layout) {
    const nonce = generateNonce();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;
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
    const arrows = [];
    for (const item of items) {
        for (const trigger of item.triggers) {
            for (const action of trigger.actions) {
                if (action.target_widget_name) {
                    arrows.push({
                        from: item.screen_name,
                        to: action.target_widget_name,
                        label: trigger.trigger_name || eventLabel(trigger),
                    });
                }
            }
        }
    }
    const itemsJson = JSON.stringify(items);
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
function eventLabel(trigger) {
    switch (trigger.trigger_type) {
        case 0 /* TriggerType.SystemEvent */: return `sys:${trigger.event_type}`;
        case 1 /* TriggerType.Signal */: return trigger.signal_id_name || 'signal';
        case 2 /* TriggerType.UserEvent */: return trigger.user_event_id_name || 'user_event';
        default: return 'trigger';
    }
}
function generateNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        const arr = new Uint32Array(16);
        globalThis.crypto.getRandomValues(arr);
        for (const n of arr)
            result += chars[n % chars.length];
    }
    else {
        for (let i = 0; i < 32; i++)
            result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}


/***/ }),
/* 100 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * ResourceGenerator — emits *_resources.c and *_resources.h.
 *
 * Ports guix_studio/resource_gen.cpp.
 *
 * Key parity requirements (from guix-codegen.instructions.md):
 *   - Byte-for-byte output match with the C++ generator for the same .gxp input.
 *   - Section order: Color → Palette → Font → FontTable → Pixelmap → PixelmapTable
 *                    → Strings → LanguageTable → Themes → ThemeTable
 *   - Macro naming: GX_COLOR_ID_*, GX_FONT_ID_*, GX_PIXELMAP_ID_*, GX_STRING_ID_*
 *   - Windows CRLF line endings (handled by SourceWriter).
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ResourceGenerator = exports.GxCodegenError = void 0;
const inversify_1 = __webpack_require__(2);
const source_writer_1 = __webpack_require__(101);
const gx_types_1 = __webpack_require__(90);
// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
class GxCodegenError extends Error {
    constructor(message) {
        super(message);
        this.name = 'GxCodegenError';
    }
}
exports.GxCodegenError = GxCodegenError;
// ---------------------------------------------------------------------------
// ResourceGenerator
// ---------------------------------------------------------------------------
let ResourceGenerator = class ResourceGenerator {
    /**
     * Generate *_resources.h + *_resources.c for one display.
     *
     * @param project  Loaded project model
     * @param dispIdx  Index into project.displays
     */
    generate(project, dispIdx) {
        const disp = project.displays[dispIdx];
        if (!disp)
            throw new GxCodegenError(`Display index ${dispIdx} out of range`);
        const projName = sanitizeName(project.header.project_name);
        const dispName = sanitizeName(disp.name);
        const baseName = project.displays.length > 1
            ? `${projName}_${dispName}_resources`
            : `${projName}_resources`;
        const now = new Date();
        const studioVer = '6.2.0'; // TODO: read from project.header.studio_version
        return {
            header: {
                filename: baseName + '.h',
                content: this.generateHeader(project, disp, dispIdx, baseName, studioVer, now),
            },
            source: {
                filename: baseName + '.c',
                content: this.generateSource(project, disp, dispIdx, baseName, studioVer, now),
            },
        };
    }
    // ── Header file ──────────────────────────────────────────────────────────
    generateHeader(project, disp, dispIdx, baseName, studioVer, now) {
        const w = new source_writer_1.SourceWriter();
        const guard = '_' + (0, source_writer_1.toMacroName)(baseName) + '_H_';
        const dName = (0, source_writer_1.toMacroName)(disp.name);
        const fmtName = colorFormatName(disp.colorformat);
        (0, source_writer_1.writeFileHeader)(w, studioVer, now);
        w.ifndefGuard(guard);
        w.blank();
        w.include('gx_api.h');
        w.blank();
        // ── Error directives ─────────────────────────────────────────────
        // UTF-8 / extended unicode validation is emitted when fonts request it
        // (deferred to Phase 4 font pass — emit placeholders for now).
        // ── Display defines ──────────────────────────────────────────────
        w.lineComment(`Display ${disp.name}`);
        w.define(dName, dispIdx);
        w.define(`${dName}_COLOR_FORMAT`, `GX_COLOR_FORMAT_${fmtName}`);
        w.define(`${dName}_X_RESOLUTION`, disp.xres);
        w.define(`${dName}_Y_RESOLUTION`, disp.yres);
        w.blank();
        // ── Theme defines ────────────────────────────────────────────────
        w.lineComment('Themes');
        for (const [ti, theme] of disp.themes.entries()) {
            const tName = (0, source_writer_1.toMacroName)(disp.name + '_' + theme.theme_name);
            w.define(tName, ti);
        }
        w.define(`${dName}_THEME_TABLE_SIZE`, disp.themes.length);
        w.blank();
        // ── Language defines ─────────────────────────────────────────────
        w.lineComment('Languages');
        const langs = project.header.languages;
        for (const [li, lang] of langs.entries()) {
            if (!lang.name)
                continue;
            w.define(`${dName}_LANGUAGE_${(0, source_writer_1.toMacroName)(lang.name)}`, li);
        }
        w.define(`${dName}_LANGUAGE_TABLE_SIZE`, langs.filter(l => l.name).length);
        w.blank();
        // ── Resource ID defines ──────────────────────────────────────────
        this.writeResourceIds(w, disp, dName);
        w.endifGuard(guard);
        return w.toString();
    }
    writeResourceIds(w, disp, dName) {
        for (const theme of disp.themes) {
            this.writeIdsForType(w, theme, gx_types_1.RES_TYPE_COLOR, dName, 'COLOR', 'GX_COLOR_ID_');
            this.writeIdsForType(w, theme, gx_types_1.RES_TYPE_FONT, dName, 'FONT', 'GX_FONT_ID_');
            this.writeIdsForType(w, theme, gx_types_1.RES_TYPE_PIXELMAP, dName, 'PIXELMAP', 'GX_PIXELMAP_ID_');
            // Strings are per-display (shared across themes)
            break; // IDs are the same across themes — emit once
        }
        // String IDs (display-wide, not per-theme)
        this.writeStringIds(w, disp, dName);
    }
    writeIdsForType(w, theme, resType, dName, typeName, prefix) {
        const items = collectByType(theme.resources, resType);
        if (items.length === 0)
            return;
        w.lineComment(`${typeName} IDs for display ${dName}`);
        for (const [idx, item] of items.entries()) {
            w.define(prefix + (0, source_writer_1.toMacroName)(item.name), idx + 1); // IDs are 1-based
        }
        w.define(`${dName}_${typeName}_TABLE_SIZE`, items.length + 1); // +1 for null slot 0
        w.blank();
    }
    writeStringIds(w, disp, dName) {
        const entries = disp.string_entries;
        if (entries.length === 0)
            return;
        w.lineComment('String IDs');
        for (const entry of entries) {
            w.define('GX_STRING_ID_' + (0, source_writer_1.toMacroName)(entry.name), entry.string_id);
        }
        w.define(`${dName}_STRING_TABLE_SIZE`, entries.length + 1);
        w.blank();
    }
    // ── Source file ──────────────────────────────────────────────────────────
    generateSource(project, disp, _dispIdx, baseName, studioVer, now) {
        const w = new source_writer_1.SourceWriter();
        const dName = sanitizeName(disp.name);
        (0, source_writer_1.writeFileHeader)(w, studioVer, now);
        w.include('gx_api.h');
        w.include(baseName + '.h');
        w.blank();
        for (const [ti, theme] of disp.themes.entries()) {
            if (!theme.enabled)
                continue;
            const tPrefix = `${dName}_${sanitizeName(theme.theme_name)}`;
            this.writeColorTable(w, theme, tPrefix);
            if (disp.colorformat === gx_types_1.GX_COLOR_FORMAT_8BIT_PALETTE) {
                this.writePalette(w, theme, tPrefix);
            }
            this.writeFontTable(w, theme, tPrefix);
            this.writePixelmapTable(w, theme, tPrefix);
            this.writeThemeStruct(w, disp, theme, ti, tPrefix);
        }
        this.writeThemeTable(w, disp, dName);
        this.writeLanguageTables(w, disp, project, dName);
        return w.toString();
    }
    // ── Color table ─────────────────────────────────────────────────────────
    writeColorTable(w, theme, tPrefix) {
        if (!theme.gen_color_table)
            return;
        const colors = collectByType(theme.resources, gx_types_1.RES_TYPE_COLOR);
        if (colors.length === 0)
            return;
        // Element 0 is reserved (GX_COLOR_ID_DEFAULT = 0 → index 0 = black)
        const values = colors.map(c => (0, source_writer_1.hex32)(c.colorval));
        w.writeArray('GX_CONST GX_COLOR', `${tPrefix}_color_table`, values);
    }
    // ── Palette ──────────────────────────────────────────────────────────────
    writePalette(w, theme, tPrefix) {
        if (theme.palette.length === 0)
            return;
        const values = theme.palette.map(source_writer_1.hex32);
        w.writeArray('GX_CONST GX_COLOR', `${tPrefix}_palette`, values);
    }
    // ── Font table ───────────────────────────────────────────────────────────
    writeFontTable(w, theme, tPrefix) {
        if (!theme.gen_font_table)
            return;
        const fonts = collectByType(theme.resources, gx_types_1.RES_TYPE_FONT);
        if (fonts.length === 0)
            return;
        // Font data arrays (GX_GLYPH / GX_FONT structs) are generated by the
        // font-util module from TrueType input — this pass only emits the pointer table.
        // Glyph data emission is deferred to Phase 4 font-util integration.
        const ptrs = fonts.map(f => `&${tPrefix}_${sanitizeName(f.name)}_font`);
        w.writeArray('GX_CONST GX_FONT *', `${tPrefix}_font_table`, ptrs, 1);
    }
    // ── Pixelmap table ───────────────────────────────────────────────────────
    writePixelmapTable(w, theme, tPrefix) {
        if (!theme.gen_pixelmap_table)
            return;
        const pixelmaps = collectByType(theme.resources, gx_types_1.RES_TYPE_PIXELMAP);
        if (pixelmaps.length === 0)
            return;
        // Pixelmap pixel data is emitted by image-reader — this pass emits:
        // 1) GX_PIXELMAP structs referencing the data arrays
        // 2) The pointer table
        for (const pm of pixelmaps) {
            this.writePixelmapStruct(w, pm, tPrefix);
        }
        // Pointer table: element 0 = GX_NULL
        const ptrs = ['GX_NULL', ...pixelmaps.map(pm => `&${tPrefix}_${sanitizeName(pm.name)}_pixelmap`)];
        w.writeArray('GX_CONST GX_PIXELMAP *', `${tPrefix}_pixelmap_table`, ptrs, 1);
    }
    writePixelmapStruct(w, pm, tPrefix) {
        const pmName = `${tPrefix}_${sanitizeName(pm.name)}_pixelmap`;
        const dataVar = pmName + '_data';
        const mapData = pm.map_list[0];
        if (mapData && mapData.data.length > 0) {
            // Emit raw pixel data array
            const bytes = Array.from(mapData.data).map(b => (0, source_writer_1.hex32)(b));
            w.writeArray('GX_CONST GX_UBYTE', dataVar, bytes);
            w.writeStruct('GX_CONST GX_PIXELMAP', pmName, [
                '0', // gx_pixelmap_version_major
                '0', // gx_pixelmap_version_minor
                pm.keep_alpha ? '1' : '0', // gx_pixelmap_flags
                '0', // gx_pixelmap_format
                `(GX_CONST GX_UBYTE *) ${dataVar}`,
                String(mapData.data.length), // gx_pixelmap_data_size
                `GX_NULL`, // gx_pixelmap_aux_data
                '0', // gx_pixelmap_aux_data_size
                String(mapData.width),
                String(mapData.height),
            ]);
        }
        else {
            // No decoded data yet — emit null pixelmap
            w.writeStruct('GX_CONST GX_PIXELMAP', pmName, [
                '0', '0', '0', '0', 'GX_NULL', '0', 'GX_NULL', '0', '0', '0',
            ]);
        }
    }
    // ── Theme struct ─────────────────────────────────────────────────────────
    writeThemeStruct(w, disp, theme, _themeIdx, tPrefix) {
        const colors = collectByType(theme.resources, gx_types_1.RES_TYPE_COLOR);
        const fonts = collectByType(theme.resources, gx_types_1.RES_TYPE_FONT);
        const pixelmaps = collectByType(theme.resources, gx_types_1.RES_TYPE_PIXELMAP);
        const paletteSize = disp.colorformat === gx_types_1.GX_COLOR_FORMAT_8BIT_PALETTE
            ? theme.palette.length : 0;
        // Scrollbar appearance struct
        this.writeScrollbarAppearance(w, theme, tPrefix);
        w.writeStruct('GX_THEME', tPrefix, [
            theme.gen_color_table && colors.length > 0
                ? `(GX_COLOR *) ${tPrefix}_color_table`
                : 'GX_NULL',
            theme.gen_font_table && fonts.length > 0
                ? `(GX_FONT **) ${tPrefix}_font_table`
                : 'GX_NULL',
            theme.gen_pixelmap_table && pixelmaps.length > 0
                ? `(GX_PIXELMAP **) ${tPrefix}_pixelmap_table`
                : 'GX_NULL',
            paletteSize > 0 ? `(GX_COLOR *) ${tPrefix}_palette` : 'GX_NULL',
            `&${tPrefix}_vscroll_appearance`,
            `&${tPrefix}_hscroll_appearance`,
            scrollStyleFlags(theme.vscroll_style),
            scrollStyleFlags(theme.hscroll_style),
            String(colors.length + 1), // color_table_size (includes slot 0)
            String(fonts.length + 1), // font_table_size
            String(pixelmaps.length + 1), // pixelmap_table_size
            String(paletteSize),
        ]);
    }
    writeScrollbarAppearance(w, theme, tPrefix) {
        const vs = theme.vscroll_appearance;
        const hs = theme.hscroll_appearance;
        w.writeStruct('GX_SCROLLBAR_APPEARANCE', `${tPrefix}_vscroll_appearance`, [
            String(vs.gx_scroll_width),
            String(vs.gx_scroll_thumb_width),
            String(vs.gx_scroll_thumb_travel_min),
            String(vs.gx_scroll_thumb_travel_max),
            String(vs.gx_scroll_thumb_border_style),
            String(vs.gx_scroll_fill_pixelmap),
            String(vs.gx_scroll_thumb_pixelmap),
            String(vs.gx_scroll_up_pixelmap),
            String(vs.gx_scroll_down_pixelmap),
            String(vs.gx_scroll_thumb_color),
            String(vs.gx_scroll_thumb_border_color),
            String(vs.gx_scroll_button_color),
        ]);
        w.writeStruct('GX_SCROLLBAR_APPEARANCE', `${tPrefix}_hscroll_appearance`, [
            String(hs.gx_scroll_width),
            String(hs.gx_scroll_thumb_width),
            String(hs.gx_scroll_thumb_travel_min),
            String(hs.gx_scroll_thumb_travel_max),
            String(hs.gx_scroll_thumb_border_style),
            String(hs.gx_scroll_fill_pixelmap),
            String(hs.gx_scroll_thumb_pixelmap),
            String(hs.gx_scroll_up_pixelmap),
            String(hs.gx_scroll_down_pixelmap),
            String(hs.gx_scroll_thumb_color),
            String(hs.gx_scroll_thumb_border_color),
            String(hs.gx_scroll_button_color),
        ]);
    }
    // ── Theme table ──────────────────────────────────────────────────────────
    writeThemeTable(w, disp, dName) {
        const ptrs = disp.themes.map(t => {
            const tPrefix = `${dName}_${sanitizeName(t.theme_name)}`;
            return `&${tPrefix}`;
        });
        w.writeArray('GX_CONST GX_THEME *', `${dName}_theme_table`, ptrs, 1);
    }
    // ── Language / String tables ─────────────────────────────────────────────
    writeLanguageTables(w, disp, project, dName) {
        const langs = project.header.languages.filter(l => l.name);
        const entries = disp.string_entries;
        if (entries.length === 0 || langs.length === 0)
            return;
        // Per-language string data + table
        for (const [li, lang] of langs.entries()) {
            this.writeStringTableForLanguage(w, disp, entries, li, lang.name, dName);
        }
        // Language pointer table
        const langPtrs = langs.map(l => `${dName}_${(0, source_writer_1.toMacroName)(l.name)}_string_table`);
        w.writeArray('GX_CONST GX_STRING *', `${dName}_language_table`, langPtrs, 1);
        // Language direction table (LTR by default unless lang is RTL)
        const dirValues = langs.map(l => l.support_bidi_text ? 'GX_LANGUAGE_DIRECTION_RTL' : '0x00');
        w.writeArray('GX_CONST GX_UBYTE', `${dName}_language_direction_table`, dirValues, 8);
    }
    writeStringTableForLanguage(w, _disp, entries, langIdx, langName, dName) {
        const lMacro = (0, source_writer_1.toMacroName)(langName);
        const tblName = `${dName}_${lMacro}_string_table`;
        // Emit each non-empty string literal
        const tableEntries = ['{ GX_NULL, 0 }']; // slot 0 always null
        for (const entry of entries) {
            const text = entry.translations[langIdx] ?? '';
            const varName = `${dName}_${lMacro}_${(0, source_writer_1.toMacroName)(entry.name)}`;
            if (isAsciiOnly(text)) {
                w.writeLine(`GX_CONST GX_CHAR ${varName}[] = "${escapeC(text)}";`);
            }
            else {
                // Emit as hex byte array for UTF-8
                const bytes = stringToUtf8Bytes(text);
                w.writeArray('GX_CONST GX_UBYTE', varName, bytes.map(b => (0, source_writer_1.hex32)(b)));
            }
            tableEntries.push(`{ (GX_CONST GX_CHAR *) ${varName}, sizeof(${varName}) - 1 }`);
        }
        w.blank();
        // Emit GX_STRING table (new format for GX_VERSION_STRING_LENGTH_FIX)
        w.writeLine(`GX_CONST GX_STRING ${tblName}[] =`);
        w.writeLine('{');
        for (let idx = 0; idx < tableEntries.length; idx++) {
            const comma = idx < tableEntries.length - 1 ? ',' : '';
            w.writeLine('    ' + tableEntries[idx] + comma);
        }
        w.writeLine('};');
        w.blank();
    }
};
exports.ResourceGenerator = ResourceGenerator;
exports.ResourceGenerator = ResourceGenerator = __decorate([
    (0, inversify_1.injectable)()
], ResourceGenerator);
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function collectByType(resources, type) {
    const result = [];
    for (const r of resources) {
        collectByTypeRecursive(r, type, result);
    }
    return result;
}
function collectByTypeRecursive(r, type, out) {
    if (r.type === type && r.name)
        out.push(r);
    for (const child of r.children) {
        collectByTypeRecursive(child, type, out);
    }
}
function sanitizeName(name) {
    return name.replace(/[^A-Za-z0-9_]/g, '_');
}
function colorFormatName(fmt) {
    const map = {
        1: 'MONOCHROME',
        2: 'MONOCHROME_INVERTED',
        3: '2BIT_GRAY',
        8: '8BIT_GRAY',
        10: '8BIT_PALETTE',
        14: '565RGB',
        17: '565BGR',
        18: '24RGB',
        22: '32ARGB',
        23: '32RGBA',
    };
    return map[fmt] ?? String(fmt);
}
function scrollStyleFlags(style) {
    if (style === 0)
        return '0';
    const flags = [];
    if (style & 0x00000100)
        flags.push('GX_SCROLLBAR_RELATIVE_THUMB');
    if (style & 0x00000200)
        flags.push('GX_SCROLLBAR_END_BUTTONS');
    if (style & 0x00000400)
        flags.push('GX_SCROLLBAR_VERTICAL');
    if (style & 0x00000800)
        flags.push('GX_SCROLLBAR_HORIZONTAL');
    return flags.length > 0 ? flags.join(' | ') : String(style);
}
function isAsciiOnly(s) {
    for (let i = 0; i < s.length; i++) {
        if (s.charCodeAt(i) > 0x7E)
            return false;
    }
    return true;
}
function escapeC(s) {
    return s
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}
function stringToUtf8Bytes(s) {
    const result = [];
    for (let i = 0; i < s.length; i++) {
        let code = s.charCodeAt(i);
        // Handle surrogate pairs
        if (code >= 0xD800 && code <= 0xDBFF && i + 1 < s.length) {
            const low = s.charCodeAt(i + 1);
            if (low >= 0xDC00 && low <= 0xDFFF) {
                code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
                i++;
            }
        }
        if (code < 0x80) {
            result.push(code);
        }
        else if (code < 0x800) {
            result.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
        }
        else if (code < 0x10000) {
            result.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
        }
        else {
            result.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
        }
    }
    result.push(0); // null terminator
    return result;
}


/***/ }),
/* 101 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

/**
 * SourceWriter — buffered line writer for C code generation.
 *
 * Ports studio_source_writer from guix_studio/screen_generator.cpp and
 * resource_gen.cpp.
 *
 * Mirrors the C++ behaviour:
 *   - Windows-style CRLF line endings
 *   - Inline comments aligned to column 45 (content) and 80 (close)
 *   - Integer/float formatting matching C printf specifiers
 *   - No external dependencies — pure string accumulation
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SourceWriter = void 0;
exports.hex32 = hex32;
exports.hex16 = hex16;
exports.hex8 = hex8;
exports.toMacroName = toMacroName;
exports.writeFileHeader = writeFileHeader;
// ---------------------------------------------------------------------------
// Column constants (match C++ studio_source_writer)
// ---------------------------------------------------------------------------
const COMMENT_START_COL = 45;
const COMMENT_END_COL = 80;
const CRLF = '\r\n';
// ---------------------------------------------------------------------------
// SourceWriter
// ---------------------------------------------------------------------------
class SourceWriter {
    constructor() {
        this.lines = [];
    }
    // ── Primitive emit ─────────────────────────────────────────────────────
    /** Emit a raw line with CRLF. */
    writeLine(text = '') {
        this.lines.push(text + CRLF);
    }
    /** Emit a blank line. */
    blank() {
        this.writeLine();
    }
    // ── Comment helpers ────────────────────────────────────────────────────
    /**
     * Emit a full-width comment banner.
     * Mirrors WriteCommentBlock() — identical top/bottom border,
     * text lines padded to COMMENT_END_COL with trailing end-comment sequence.
     */
    commentBanner(lines) {
        const width = COMMENT_END_COL;
        const border = '/' + '*'.repeat(width - 1) + '/';
        this.writeLine(border);
        for (const text of lines) {
            const inner = '/*  ' + text;
            const padded = inner.padEnd(width - 2) + '*/';
            this.writeLine(padded);
        }
        this.writeLine(border);
    }
    /** Emit a single-line C block comment. */
    lineComment(text) {
        this.writeLine('/* ' + text + ' */');
    }
    // ── C construct helpers ────────────────────────────────────────────────
    /** `#include "file"` */
    include(file) {
        this.writeLine(`#include "${file}"`);
    }
    /** `#include <file>` */
    includeSystem(file) {
        this.writeLine(`#include <${file}>`);
    }
    /** `#define NAME VALUE` */
    define(name, value) {
        this.writeLine(`#define ${name} ${value}`);
    }
    /** `#ifndef NAME` */
    ifndefGuard(name) {
        this.writeLine(`#ifndef ${name}`);
        this.writeLine(`#define ${name}`);
    }
    /** Emit endif with a trailing name comment. */
    endifGuard(name) {
        this.writeLine(`#endif /* ${name} */`);
    }
    /** `#if condition` */
    ifDirective(condition) {
        this.writeLine(`#if ${condition}`);
    }
    /** `#endif` */
    endif() {
        this.writeLine(`#endif`);
    }
    /** `#error "msg"` */
    error(msg) {
        this.writeLine(`#error "${msg}"`);
    }
    // ── Array helpers ──────────────────────────────────────────────────────
    /**
     * Emit a C array declaration.
     *
     * @param type     Full type string, e.g. `GX_CONST GX_COLOR`
     * @param name     Array name
     * @param values   Hex strings or identifiers (already formatted)
     * @param perRow   Items per line (default 8)
     */
    writeArray(type, name, values, perRow = 8) {
        this.writeLine(`${type} ${name}[] =`);
        this.writeLine('{');
        for (let i = 0; i < values.length; i += perRow) {
            const chunk = values.slice(i, i + perRow);
            const isLast = i + perRow >= values.length;
            const row = '    ' + chunk.join(', ') + (isLast ? '' : ',');
            this.writeLine(row);
        }
        this.writeLine('};');
        this.blank();
    }
    /**
     * Emit a struct initialiser block.
     *
     * @param type   Type name
     * @param name   Variable name
     * @param fields Lines of field initialisers (without trailing commas)
     */
    writeStruct(type, name, fields) {
        this.writeLine(`${type} ${name} =`);
        this.writeLine('{');
        for (let i = 0; i < fields.length; i++) {
            const comma = i < fields.length - 1 ? ',' : '';
            this.writeLine('    ' + fields[i] + comma);
        }
        this.writeLine('};');
        this.blank();
    }
    // ── Inline-comment alignment ───────────────────────────────────────────
    /**
     * Emit a line that has trailing inline comment at column COMMENT_START_COL.
     * Mirrors the C++ comment-alignment in studio_source_writer.
     *
     * @param code    Code text (will be padded to COMMENT_START_COL)
     * @param comment Comment text (without comment delimiters)
     */
    writeWithComment(code, comment) {
        const padded = code.padEnd(COMMENT_START_COL);
        const full = padded + '/* ' + comment + ' */';
        this.writeLine(full);
    }
    // ── Header file helpers ────────────────────────────────────────────────
    /** Emit `extern "C" {` guard. */
    externCOpen() {
        this.writeLine('#ifdef __cplusplus');
        this.writeLine('extern "C" {');
        this.writeLine('#endif');
        this.blank();
    }
    /** Emit extern-C close guard. */
    externCClose() {
        this.blank();
        this.writeLine('#ifdef __cplusplus');
        this.writeLine('}');
        this.writeLine('#endif');
    }
    // ── Finalise ───────────────────────────────────────────────────────────
    /** Return the complete file contents as a single string. */
    toString() {
        return this.lines.join('');
    }
    /** Reset to empty. */
    reset() {
        this.lines = [];
    }
}
exports.SourceWriter = SourceWriter;
// ---------------------------------------------------------------------------
// Formatting helpers (used by all generators)
// ---------------------------------------------------------------------------
/** Format a 32-bit integer as 0xAABBCCDD */
function hex32(value) {
    return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(8, '0');
}
/** Format a 16-bit integer as 0xAABB */
function hex16(value) {
    return '0x' + (value & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}
/** Format an 8-bit integer as 0xAA */
function hex8(value) {
    return '0x' + (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}
/** Convert a resource name to UPPER_CASE identifier (replaces spaces/hyphens with _). */
function toMacroName(name) {
    return name
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '_');
}
/**
 * Emit the standard auto-generated file header comment block.
 * Text matches exactly what GUIX Studio C++ produces.
 */
function writeFileHeader(writer, studioVersion, date) {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    writer.commentBanner([
        'This file is auto-generated by Azure RTOS GUIX Studio. Do not edit this',
        'file by hand. Modifications to this file should only be made by running',
        'the Azure RTOS GUIX Studio application and re-generating the application',
        'specification file(s). For more information please refer to the Azure RTOS',
        'GUIX Studio User Guide, or visit our web site at azure.com/rtos',
        '',
        `GUIX Studio Revision ${studioVersion}`,
        `Date (dd.mm.yyyy): ${dd}.${mm}.${yyyy}  Time (hh:mm): ${hh}:${min}`,
    ]);
    writer.blank();
}


/***/ }),
/* 102 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * ScreenGenerator — emits *_specifications.c and *_specifications.h.
 *
 * Ports guix_studio/screen_generator.cpp.
 *
 * Key parity requirements:
 *   - Widget ID #define names: {SCREEN}_{WIDGET}_ID
 *   - Control block typedef per screen: {SCREEN_NAME}_PROPERTIES
 *   - Per-type GX_*_PROPERTIES struct fields match gx_studio_display_configure() API
 *   - Section order in .c: includes → widget control blocks → widget tables → display table
 *   - Section order in .h: guard → includes → IDs → typedefs → prototypes
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ScreenGenerator = void 0;
const inversify_1 = __webpack_require__(2);
const source_writer_1 = __webpack_require__(101);
const gx_types_1 = __webpack_require__(90);
const resource_generator_1 = __webpack_require__(100);
// ---------------------------------------------------------------------------
// ScreenGenerator
// ---------------------------------------------------------------------------
let ScreenGenerator = class ScreenGenerator {
    /**
     * Generate *_specifications.h + *_specifications.c for one display.
     *
     * @param project  Loaded project model
     * @param dispIdx  Index into project.displays
     */
    generate(project, dispIdx) {
        const disp = project.displays[dispIdx];
        if (!disp)
            throw new resource_generator_1.GxCodegenError(`Display index ${dispIdx} out of range`);
        const projName = sanitizeName(project.header.project_name);
        const dispName = sanitizeName(disp.name);
        const baseName = project.displays.length > 1
            ? `${projName}_${dispName}_specifications`
            : `${projName}_specifications`;
        const resBase = project.displays.length > 1
            ? `${projName}_${dispName}_resources`
            : `${projName}_resources`;
        const now = new Date();
        const studioVer = '6.2.0';
        return {
            header: {
                filename: baseName + '.h',
                content: this.generateHeader(project, disp, baseName, studioVer, now),
            },
            source: {
                filename: baseName + '.c',
                content: this.generateSource(project, disp, baseName, resBase, studioVer, now),
            },
        };
    }
    // ── Header file ──────────────────────────────────────────────────────────
    generateHeader(_project, disp, baseName, studioVer, now) {
        const w = new source_writer_1.SourceWriter();
        const guard = '_' + (0, source_writer_1.toMacroName)(baseName) + '_H_';
        const dName = sanitizeName(disp.name);
        (0, source_writer_1.writeFileHeader)(w, studioVer, now);
        w.ifndefGuard(guard);
        w.blank();
        w.include('gx_api.h');
        w.blank();
        w.externCOpen();
        // ── Widget ID defines ─────────────────────────────────────────────
        w.lineComment('Widget ID constants');
        let nextId = 1;
        for (const folder of disp.folders) {
            for (const widget of folder.widgets) {
                nextId = this.writeWidgetIds(w, widget, nextId);
            }
        }
        w.define('GX_NEXT_WIDGET_ID', nextId);
        w.blank();
        // ── Control block typedefs ────────────────────────────────────────
        w.lineComment('Screen control block typedefs');
        for (const folder of disp.folders) {
            for (const widget of folder.widgets) {
                this.writeControlBlockTypedef(w, widget, dName);
            }
        }
        // ── Function prototypes ───────────────────────────────────────────
        w.lineComment('Function prototypes');
        w.writeLine(`UINT ${dName}_setup(void);`);
        w.blank();
        for (const folder of disp.folders) {
            for (const widget of folder.widgets) {
                if (widget.event_func) {
                    w.writeLine(`UINT ${widget.event_func}(GX_WIDGET *widget, GX_EVENT *event_ptr);`);
                }
                if (widget.draw_func) {
                    w.writeLine(`VOID ${widget.draw_func}(GX_WIDGET *widget);`);
                }
            }
        }
        w.blank();
        w.externCClose();
        w.endifGuard(guard);
        return w.toString();
    }
    writeWidgetIds(w, widget, nextId) {
        if (widget.id_name) {
            w.define(widget.id_name, nextId++);
        }
        for (const child of widget.children) {
            nextId = this.writeWidgetIds(w, child, nextId);
        }
        return nextId;
    }
    writeControlBlockTypedef(w, widget, dName) {
        const structName = `${sanitizeName(widget.app_name)}_PROPERTIES`;
        const baseType = gxControlBlockType(widget.basetype);
        w.writeLine(`typedef struct {`);
        w.writeLine(`    ${baseType} ${sanitizeName(widget.app_name)};`);
        this.writeChildMemberDecls(w, widget.children);
        w.writeLine(`} ${structName};`);
        w.blank();
        // Recurse for children that are themselves containers
        for (const child of widget.children) {
            if (child.children.length > 0 || child.basetype >= gx_types_1.GX_TYPE_WINDOW) {
                this.writeControlBlockTypedef(w, child, dName);
            }
        }
    }
    writeChildMemberDecls(w, children) {
        for (const child of children) {
            const cType = gxControlBlockType(child.basetype);
            w.writeLine(`    ${cType} ${sanitizeName(child.app_name)};`);
        }
    }
    // ── Source file ──────────────────────────────────────────────────────────
    generateSource(project, disp, baseName, resBase, studioVer, now) {
        const w = new source_writer_1.SourceWriter();
        const dName = sanitizeName(disp.name);
        (0, source_writer_1.writeFileHeader)(w, studioVer, now);
        w.include('gx_api.h');
        w.include(resBase + '.h');
        w.include(baseName + '.h');
        if (project.header.additional_headers) {
            w.include(project.header.additional_headers);
        }
        w.blank();
        // ── Per-screen widget definitions ─────────────────────────────────
        for (const folder of disp.folders) {
            for (const widget of folder.widgets) {
                this.writeWidgetProperties(w, widget, dName);
            }
        }
        // ── Widget tables (GX_STUDIO_WIDGET_ENTRY arrays) ─────────────────
        for (const folder of disp.folders) {
            for (const widget of folder.widgets) {
                this.writeWidgetTable(w, widget);
            }
        }
        // ── Display configuration ─────────────────────────────────────────
        this.writeDisplayConfig(w, disp, project, dName, resBase);
        return w.toString();
    }
    // ── Widget properties struct (GX_WIDGET_PROPERTIES et al.) ───────────────
    writeWidgetProperties(w, widget, dName) {
        // Recurse children first (dependency order)
        for (const child of widget.children) {
            this.writeWidgetProperties(w, child, dName);
        }
        const varName = sanitizeName(widget.app_name) + '_properties';
        const propType = gxPropertiesType(widget.basetype);
        const fields = buildPropertyFields(widget, dName);
        w.writeLine(`${propType} ${varName} =`);
        w.writeLine('{');
        for (let i = 0; i < fields.length; i++) {
            const comma = i < fields.length - 1 ? ',' : '';
            w.writeLine('    ' + fields[i] + comma);
        }
        w.writeLine('};');
        w.blank();
    }
    // ── Widget table (GX_STUDIO_WIDGET_ENTRY) ────────────────────────────────
    writeWidgetTable(w, widget) {
        // Recurse first
        for (const child of widget.children) {
            this.writeWidgetTable(w, child);
        }
        const entries = [];
        // First entry: the widget itself
        entries.push(widgetTableEntry(widget));
        // Additional entries for children (referencing their sub-tables)
        for (const child of widget.children) {
            if (child.children.length > 0) {
                entries.push(`    { NULL, ${sanitizeName(child.app_name)}_widget_table, 0 }`);
            }
            else {
                entries.push(widgetTableEntry(child));
            }
        }
        const tableName = sanitizeName(widget.app_name) + '_widget_table';
        w.writeLine(`GX_STUDIO_WIDGET_ENTRY ${tableName}[] =`);
        w.writeLine('{');
        for (let i = 0; i < entries.length; i++) {
            const comma = i < entries.length - 1 ? ',' : '';
            w.writeLine('    ' + entries[i] + comma);
        }
        w.writeLine('};');
        w.blank();
    }
    // ── Display configuration ─────────────────────────────────────────────────
    writeDisplayConfig(w, disp, project, dName, resBase) {
        void resBase; // included via w.include(resBase + '.h') in generateSource
        const langCount = project.header.languages.filter(l => l.name).length;
        const themeCount = disp.themes.length;
        const strCount = disp.string_entries.length + 1;
        // Root window list
        const rootEntries = [];
        for (const folder of disp.folders) {
            for (const widget of folder.widgets) {
                rootEntries.push(`    { &${sanitizeName(widget.app_name)}_properties, ${sanitizeName(widget.app_name)}_widget_table, 0 }`);
            }
        }
        w.writeLine(`GX_STUDIO_DISPLAY_INFO ${dName}_display_info =`);
        w.writeLine('{');
        w.writeLine(`    "${dName}",`);
        w.writeLine(`    ${disp.xres},`);
        w.writeLine(`    ${disp.yres},`);
        w.writeLine(`    ${langCount},`);
        w.writeLine(`    ${themeCount},`);
        w.writeLine(`    ${strCount},`);
        w.writeLine(`    (GX_CONST GX_THEME **) ${dName}_theme_table,`);
        w.writeLine(`    (GX_CONST GX_STRING **) ${dName}_language_table,`);
        w.writeLine(`    ${dName}_language_direction_table,`);
        w.writeLine('    0,  /* rotation angle */');
        w.writeLine(`    ${rootEntries.length}`);
        w.writeLine('};');
        w.blank();
        // Setup function
        w.writeLine(`UINT ${dName}_setup(void)`);
        w.writeLine('{');
        w.writeLine(`    return gx_studio_display_configure(&${dName}_display_info, NULL, NULL, NULL, NULL);`);
        w.writeLine('}');
        w.blank();
    }
};
exports.ScreenGenerator = ScreenGenerator;
exports.ScreenGenerator = ScreenGenerator = __decorate([
    (0, inversify_1.injectable)()
], ScreenGenerator);
// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
function sanitizeName(name) {
    return name.replace(/[^A-Za-z0-9_]/g, '_');
}
/**
 * Map GX_TYPE_* → the GX_*_PROPERTIES struct name used in specifications.c.
 * Mirrors studio_widget_type_get_properties_name() in screen_generator.cpp.
 */
function gxPropertiesType(basetype) {
    switch (basetype) {
        case gx_types_1.GX_TYPE_WIDGET: return 'GX_WIDGET_PROPERTIES';
        case gx_types_1.GX_TYPE_BUTTON: return 'GX_BUTTON_PROPERTIES';
        case gx_types_1.GX_TYPE_TEXT_BUTTON:
        case gx_types_1.GX_TYPE_MULTI_LINE_TEXT_BUTTON: return 'GX_TEXT_BUTTON_PROPERTIES';
        case gx_types_1.GX_TYPE_RADIO_BUTTON: return 'GX_RADIO_BUTTON_PROPERTIES';
        case gx_types_1.GX_TYPE_CHECKBOX: return 'GX_CHECKBOX_PROPERTIES';
        case gx_types_1.GX_TYPE_PIXELMAP_BUTTON: return 'GX_PIXELMAP_BUTTON_PROPERTIES';
        case gx_types_1.GX_TYPE_ICON_BUTTON: return 'GX_ICON_BUTTON_PROPERTIES';
        case gx_types_1.GX_TYPE_SPIN_BUTTON: return 'GX_SPIN_BUTTON_PROPERTIES';
        case gx_types_1.GX_TYPE_ICON: return 'GX_ICON_PROPERTIES';
        case gx_types_1.GX_TYPE_SPRITE: return 'GX_SPRITE_PROPERTIES';
        case gx_types_1.GX_TYPE_CIRCULAR_GAUGE: return 'GX_CIRCULAR_GAUGE_PROPERTIES';
        case gx_types_1.GX_TYPE_SLIDER: return 'GX_SLIDER_PROPERTIES';
        case gx_types_1.GX_TYPE_PIXELMAP_SLIDER: return 'GX_PIXELMAP_SLIDER_PROPERTIES';
        case gx_types_1.GX_TYPE_VERTICAL_SCROLL:
        case gx_types_1.GX_TYPE_HORIZONTAL_SCROLL: return 'GX_SCROLLBAR_PROPERTIES';
        case gx_types_1.GX_TYPE_PROGRESS_BAR: return 'GX_PROGRESS_BAR_PROPERTIES';
        case gx_types_1.GX_TYPE_RADIAL_PROGRESS_BAR: return 'GX_RADIAL_PROGRESS_BAR_PROPERTIES';
        case gx_types_1.GX_TYPE_RADIAL_SLIDER: return 'GX_RADIAL_SLIDER_PROPERTIES';
        case gx_types_1.GX_TYPE_PROMPT: return 'GX_PROMPT_PROPERTIES';
        case gx_types_1.GX_TYPE_NUMERIC_PROMPT: return 'GX_NUMERIC_PROMPT_PROPERTIES';
        case gx_types_1.GX_TYPE_PIXELMAP_PROMPT: return 'GX_PIXELMAP_PROMPT_PROPERTIES';
        case gx_types_1.GX_TYPE_NUMERIC_PIXELMAP_PROMPT: return 'GX_NUMERIC_PIXELMAP_PROMPT_PROPERTIES';
        case gx_types_1.GX_TYPE_SINGLE_LINE_TEXT_INPUT: return 'GX_SINGLE_LINE_TEXT_INPUT_PROPERTIES';
        case gx_types_1.GX_TYPE_DROP_LIST: return 'GX_DROP_LIST_PROPERTIES';
        case gx_types_1.GX_TYPE_MENU: return 'GX_MENU_PROPERTIES';
        case gx_types_1.GX_TYPE_ACCORDION_MENU: return 'GX_ACCORDION_MENU_PROPERTIES';
        case gx_types_1.GX_TYPE_WINDOW: return 'GX_WINDOW_PROPERTIES';
        case gx_types_1.GX_TYPE_VERTICAL_LIST: return 'GX_VERTICAL_LIST_PROPERTIES';
        case gx_types_1.GX_TYPE_HORIZONTAL_LIST: return 'GX_HORIZONTAL_LIST_PROPERTIES';
        case gx_types_1.GX_TYPE_MULTI_LINE_TEXT_VIEW: return 'GX_MULTI_LINE_TEXT_VIEW_PROPERTIES';
        case gx_types_1.GX_TYPE_MULTI_LINE_TEXT_INPUT: return 'GX_MULTI_LINE_TEXT_INPUT_PROPERTIES';
        case gx_types_1.GX_TYPE_LINE_CHART: return 'GX_LINE_CHART_PROPERTIES';
        case gx_types_1.GX_TYPE_DIALOG: return 'GX_WINDOW_PROPERTIES';
        case gx_types_1.GX_TYPE_SCROLL_WHEEL: return 'GX_SCROLL_WHEEL_PROPERTIES';
        case gx_types_1.GX_TYPE_STRING_SCROLL_WHEEL: return 'GX_STRING_SCROLL_WHEEL_PROPERTIES';
        case gx_types_1.GX_TYPE_NUMERIC_SCROLL_WHEEL: return 'GX_NUMERIC_SCROLL_WHEEL_PROPERTIES';
        case gx_types_1.GX_TYPE_TREE_VIEW: return 'GX_TREE_VIEW_PROPERTIES';
        case gx_types_1.GX_TYPE_GENERIC_SCROLL_WHEEL: return 'GX_GENERIC_SCROLL_WHEEL_PROPERTIES';
        case gx_types_1.GX_TYPE_TEMPLATE: return 'GX_WIDGET_PROPERTIES';
        default: return 'GX_WIDGET_PROPERTIES';
    }
}
/**
 * Map GX_TYPE_* → the C control block struct type name.
 * Mirrors what gx_studio_widget_create() expects.
 */
function gxControlBlockType(basetype) {
    switch (basetype) {
        case gx_types_1.GX_TYPE_WIDGET: return 'GX_WIDGET';
        case gx_types_1.GX_TYPE_BUTTON: return 'GX_BUTTON';
        case gx_types_1.GX_TYPE_TEXT_BUTTON: return 'GX_TEXT_BUTTON';
        case gx_types_1.GX_TYPE_MULTI_LINE_TEXT_BUTTON: return 'GX_MULTI_LINE_TEXT_BUTTON';
        case gx_types_1.GX_TYPE_RADIO_BUTTON: return 'GX_RADIO_BUTTON';
        case gx_types_1.GX_TYPE_CHECKBOX: return 'GX_CHECKBOX';
        case gx_types_1.GX_TYPE_PIXELMAP_BUTTON: return 'GX_PIXELMAP_BUTTON';
        case gx_types_1.GX_TYPE_ICON_BUTTON: return 'GX_ICON_BUTTON';
        case gx_types_1.GX_TYPE_SPIN_BUTTON: return 'GX_SPIN_BUTTON';
        case gx_types_1.GX_TYPE_ICON: return 'GX_ICON';
        case gx_types_1.GX_TYPE_SPRITE: return 'GX_SPRITE';
        case gx_types_1.GX_TYPE_CIRCULAR_GAUGE: return 'GX_CIRCULAR_GAUGE';
        case gx_types_1.GX_TYPE_SLIDER: return 'GX_SLIDER';
        case gx_types_1.GX_TYPE_PIXELMAP_SLIDER: return 'GX_PIXELMAP_SLIDER';
        case gx_types_1.GX_TYPE_VERTICAL_SCROLL: return 'GX_SCROLLBAR';
        case gx_types_1.GX_TYPE_HORIZONTAL_SCROLL: return 'GX_SCROLLBAR';
        case gx_types_1.GX_TYPE_PROGRESS_BAR: return 'GX_PROGRESS_BAR';
        case gx_types_1.GX_TYPE_RADIAL_PROGRESS_BAR: return 'GX_RADIAL_PROGRESS_BAR';
        case gx_types_1.GX_TYPE_RADIAL_SLIDER: return 'GX_RADIAL_SLIDER';
        case gx_types_1.GX_TYPE_PROMPT: return 'GX_PROMPT';
        case gx_types_1.GX_TYPE_NUMERIC_PROMPT: return 'GX_NUMERIC_PROMPT';
        case gx_types_1.GX_TYPE_PIXELMAP_PROMPT: return 'GX_PIXELMAP_PROMPT';
        case gx_types_1.GX_TYPE_NUMERIC_PIXELMAP_PROMPT: return 'GX_NUMERIC_PIXELMAP_PROMPT';
        case gx_types_1.GX_TYPE_SINGLE_LINE_TEXT_INPUT: return 'GX_SINGLE_LINE_TEXT_INPUT';
        case gx_types_1.GX_TYPE_DROP_LIST: return 'GX_DROP_LIST';
        case gx_types_1.GX_TYPE_MENU: return 'GX_MENU';
        case gx_types_1.GX_TYPE_ACCORDION_MENU: return 'GX_ACCORDION_MENU';
        case gx_types_1.GX_TYPE_WINDOW: return 'GX_WINDOW';
        case gx_types_1.GX_TYPE_VERTICAL_LIST: return 'GX_VERTICAL_LIST';
        case gx_types_1.GX_TYPE_HORIZONTAL_LIST: return 'GX_HORIZONTAL_LIST';
        case gx_types_1.GX_TYPE_MULTI_LINE_TEXT_VIEW: return 'GX_MULTI_LINE_TEXT_VIEW';
        case gx_types_1.GX_TYPE_MULTI_LINE_TEXT_INPUT: return 'GX_MULTI_LINE_TEXT_INPUT';
        case gx_types_1.GX_TYPE_LINE_CHART: return 'GX_LINE_CHART';
        case gx_types_1.GX_TYPE_DIALOG: return 'GX_WINDOW';
        case gx_types_1.GX_TYPE_SCROLL_WHEEL: return 'GX_SCROLL_WHEEL';
        case gx_types_1.GX_TYPE_STRING_SCROLL_WHEEL: return 'GX_STRING_SCROLL_WHEEL';
        case gx_types_1.GX_TYPE_NUMERIC_SCROLL_WHEEL: return 'GX_NUMERIC_SCROLL_WHEEL';
        case gx_types_1.GX_TYPE_TREE_VIEW: return 'GX_TREE_VIEW';
        case gx_types_1.GX_TYPE_GENERIC_SCROLL_WHEEL: return 'GX_GENERIC_SCROLL_WHEEL';
        default: return 'GX_WIDGET';
    }
}
/**
 * Build the initialiser field list for a GX_*_PROPERTIES struct.
 * Mirrors widget_service_provider::GetProperties() chain.
 *
 * Field order matches the C struct definitions in gx_api.h.
 */
function buildPropertyFields(w, dName) {
    const size = w.size;
    // Common GX_WIDGET_PROPERTIES fields (always first)
    const common = [
        `"${w.app_name}"`, // widget_name
        `"${w.id_name || '0'}"`, // widget_id (stringified in old Studio; we emit the #define name)
        `${w.id_name || '0'}`, // widget_id (integer)
        `GX_NULL`, // parent (linked at runtime)
        `{${size.left}, ${size.top}, ${size.right}, ${size.bottom}}`, // size
        (0, source_writer_1.hex32)(w.style), // style
        `${w.color_id[0]}`, // normal_fill_color
        `${w.color_id[1]}`, // selected_fill_color
        `${w.color_id[2]}`, // disabled_fill_color
        w.draw_func || 'GX_NULL', // draw_function
        w.event_func || 'GX_NULL', // event_function
    ];
    // Append type-specific extra fields
    const extra = buildExtraFields(w, dName);
    return [...common, ...extra];
}
function buildExtraFields(w, _dName) {
    const ext = w.ewi;
    switch (w.basetype) {
        // ── Buttons ───────────────────────────────────────────────────────
        case gx_types_1.GX_TYPE_TEXT_BUTTON:
        case gx_types_1.GX_TYPE_MULTI_LINE_TEXT_BUTTON:
        case gx_types_1.GX_TYPE_RADIO_BUTTON:
        case gx_types_1.GX_TYPE_CHECKBOX:
            return [
                String(w.string_id[0]), // text_id
                String(w.font_id[0]), // font_id
                String(w.color_id[0]), // normal_text_color
                String(w.color_id[1]), // selected_text_color
                String(w.color_id[2]), // disabled_text_color
            ];
        case gx_types_1.GX_TYPE_PIXELMAP_BUTTON:
            return [
                String(w.pixelmap_id[0]), // normal_pixelmap
                String(w.pixelmap_id[1]), // selected_pixelmap
                String(w.pixelmap_id[2]), // disabled_pixelmap
            ];
        case gx_types_1.GX_TYPE_ICON_BUTTON:
            return [String(w.pixelmap_id[0])];
        case gx_types_1.GX_TYPE_ICON:
        case gx_types_1.GX_TYPE_PIXELMAP_PROMPT:
            return [String(w.pixelmap_id[0])];
        // ── Sliders ───────────────────────────────────────────────────────
        case gx_types_1.GX_TYPE_SLIDER:
        case gx_types_1.GX_TYPE_PIXELMAP_SLIDER: {
            if (!ext || ext.kind !== 'slider')
                return [];
            const s = ext.info;
            return [
                String(s.min_val),
                String(s.max_val),
                String(s.current_val),
                String(s.increment),
                String(s.min_travel),
                String(s.max_travel),
                String(s.needle_width),
                String(s.needle_height),
                String(s.needle_inset),
                String(s.needle_hotspot),
            ];
        }
        // ── Progress bars ─────────────────────────────────────────────────
        case gx_types_1.GX_TYPE_PROGRESS_BAR: {
            if (!ext || ext.kind !== 'progress')
                return [];
            return [
                String(ext.info.min_val),
                String(ext.info.max_val),
                String(ext.info.current_val),
                String(w.pixelmap_id[0]),
                String(w.color_id[0]),
                String(w.color_id[1]),
            ];
        }
        case gx_types_1.GX_TYPE_RADIAL_PROGRESS_BAR: {
            if (!ext || ext.kind !== 'radial_progress')
                return [];
            const r = ext.info;
            return [
                String(r.xcenter), String(r.ycenter), String(r.radius),
                String(r.current_val), String(r.anchor_val),
                String(r.font_index),
                String(r.normal_text_color), String(r.selected_text_color),
                String(r.disabled_text_color),
                String(r.normal_brush_width), String(r.selected_brush_width),
                String(r.normal_brush_color), String(r.selected_brush_color),
                String(r.disabled_brush_color),
                String(r.normal_brush_alpha), String(r.selected_brush_alpha),
                String(r.disabled_brush_alpha),
            ];
        }
        case gx_types_1.GX_TYPE_RADIAL_SLIDER: {
            if (!ext || ext.kind !== 'radial_slider')
                return [];
            const r = ext.info;
            return [
                String(r.xcenter), String(r.ycenter), String(r.radius),
                String(r.track_width), String(r.needle_offset),
                String(r.current_angle), String(r.min_angle), String(r.max_angle),
                String(r.background_pixelmap), String(r.needle_pixelmap),
                String(r.animation_total_steps), String(r.animation_delay),
                String(r.animation_style),
            ];
        }
        // ── Text / prompts ────────────────────────────────────────────────
        case gx_types_1.GX_TYPE_PROMPT:
        case gx_types_1.GX_TYPE_NUMERIC_PROMPT:
            return [
                String(w.string_id[0]),
                String(w.font_id[0]),
                String(w.color_id[0]),
                String(w.color_id[1]),
                String(w.color_id[2]),
            ];
        case gx_types_1.GX_TYPE_SINGLE_LINE_TEXT_INPUT: {
            const ti = ext && ext.kind === 'text_info' ? ext.info : null;
            return [
                String(w.string_id[0]),
                String(w.font_id[0]),
                String(w.color_id[0]),
                String(w.color_id[1]),
                String(w.color_id[2]),
                'GX_NULL', // buffer
                String(ti?.buffer_size ?? 128),
            ];
        }
        // ── Lists ─────────────────────────────────────────────────────────
        case gx_types_1.GX_TYPE_VERTICAL_LIST:
        case gx_types_1.GX_TYPE_HORIZONTAL_LIST: {
            if (!ext || (ext.kind !== 'vlist'))
                return [];
            return [
                String(ext.info.total_rows),
                String(ext.info.seperation),
                'GX_NULL', // callback
            ];
        }
        case gx_types_1.GX_TYPE_DROP_LIST: {
            if (!ext || ext.kind !== 'drop_list')
                return [];
            return [
                String(ext.info.total_rows),
                String(ext.info.open_height),
                String(ext.info.seperation),
                'GX_NULL',
            ];
        }
        // ── Circular gauge ────────────────────────────────────────────────
        case gx_types_1.GX_TYPE_CIRCULAR_GAUGE: {
            if (!ext || ext.kind !== 'gauge')
                return [];
            const g = ext.info;
            return [
                String(g.xcenter), String(g.ycenter), String(g.radius),
                String(g.needle_length), String(g.needle_width), String(g.needle_pixelmap),
                String(g.start_angle), String(g.end_angle), String(g.increment),
                String(g.current_angle), String(g.min_angle), String(g.max_angle),
                String(g.animation_steps), String(g.animation_delay), String(g.animation_style),
            ];
        }
        // ── Line chart ────────────────────────────────────────────────────
        case gx_types_1.GX_TYPE_LINE_CHART: {
            if (!ext || ext.kind !== 'line_chart')
                return [];
            const c = ext.info;
            return [
                String(c.left_margin), String(c.right_margin),
                String(c.top_margin), String(c.bottom_margin),
                String(c.max_data_count), String(c.active_data_count),
                String(c.axis_line_width), String(c.data_line_width),
                String(c.axis_color), String(c.line_color),
            ];
        }
        // ── Scroll wheels ─────────────────────────────────────────────────
        case gx_types_1.GX_TYPE_STRING_SCROLL_WHEEL: {
            if (!ext || ext.kind !== 'string_scroll_wheel')
                return [];
            const sw = ext.info.base;
            return [
                String(sw.total_rows), String(sw.row_height), String(sw.selected_row),
                String(sw.start_alpha), String(sw.end_alpha),
                String(w.font_id[0]), String(w.color_id[0]), String(w.color_id[1]),
            ];
        }
        case gx_types_1.GX_TYPE_NUMERIC_SCROLL_WHEEL: {
            if (!ext || ext.kind !== 'numeric_scroll_wheel')
                return [];
            const sw = ext.info;
            return [
                String(sw.base.total_rows), String(sw.base.row_height), String(sw.base.selected_row),
                String(sw.base.start_alpha), String(sw.base.end_alpha),
                String(sw.start_val), String(sw.end_val),
                String(w.font_id[0]), String(w.color_id[0]), String(w.color_id[1]),
            ];
        }
        // ── Multi-line text ───────────────────────────────────────────────
        case gx_types_1.GX_TYPE_MULTI_LINE_TEXT_VIEW:
        case gx_types_1.GX_TYPE_MULTI_LINE_TEXT_INPUT:
            return [
                String(w.string_id[0]),
                String(w.font_id[0]),
                String(w.color_id[0]),
                String(w.color_id[1]),
            ];
        // ── Windows (no extra fields beyond common) ───────────────────────
        case gx_types_1.GX_TYPE_WINDOW:
        case gx_types_1.GX_TYPE_DIALOG:
        case gx_types_1.GX_TYPE_TREE_VIEW:
        case gx_types_1.GX_TYPE_GENERIC_SCROLL_WHEEL:
        default:
            return [];
    }
}
/** Format one GX_STUDIO_WIDGET_ENTRY line. */
function widgetTableEntry(w) {
    const propVar = sanitizeName(w.app_name) + '_properties';
    const childTbl = w.children.length > 0
        ? sanitizeName(w.app_name) + '_widget_table'
        : 'GX_NULL';
    return `{ (GX_STUDIO_WIDGET *) &${propVar}, ${childTbl}, ${w.children.length} }`;
}


/***/ }),
/* 103 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * BinaryResourceGenerator — emits binary resource files (.bin or S-record).
 *
 * Ports guix_studio/binary_resource_gen.cpp.
 *
 * The binary format mirrors what gx_display_theme_install() consumes:
 *   GX_RESOURCE_HEADER
 *     GX_THEME_HEADER[n_themes]
 *       GX_COLOR_HEADER + color data
 *       GX_PALETTE_HEADER + palette data
 *       GX_FONT_HEADER + page + glyph blocks
 *       GX_PIXELMAP_HEADER + pixel data
 *     GX_STRING_HEADER + GX_LANGUAGE_HEADER[n_langs] + string data
 *
 * S-record format: Motorola SREC with S0 / S3 / S8 records.
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BinaryResourceGenerator = exports.BINARY_FORMAT_SREC = exports.BINARY_FORMAT_RAW = void 0;
const inversify_1 = __webpack_require__(2);
const gx_types_1 = __webpack_require__(90);
const resource_generator_1 = __webpack_require__(100);
// ---------------------------------------------------------------------------
// Binary struct size constants (must match common/inc/gx_api.h)
// ---------------------------------------------------------------------------
const GX_RESOURCE_HEADER_SIZE = 16;
const GX_THEME_HEADER_SIZE = 12;
const GX_COLOR_HEADER_SIZE = 8;
const GX_PALETTE_HEADER_SIZE = 8;
const GX_FONT_HEADER_SIZE = 14;
const GX_PIXELMAP_HEADER_SIZE = 20;
const GX_STRING_HEADER_SIZE = 8;
const GX_LANGUAGE_HEADER_SIZE = 8;
// Magic / version
const GX_RESOURCE_MAGIC = 0x47584249; // 'GXBI'
const GX_RESOURCE_VERSION = 0x0001;
// SREC line data payload (bytes per record)
const SREC_MAX_DATA_SIZE = 32;
// ---------------------------------------------------------------------------
// Output formats
// ---------------------------------------------------------------------------
exports.BINARY_FORMAT_RAW = 0;
exports.BINARY_FORMAT_SREC = 1;
// ---------------------------------------------------------------------------
// BinaryResourceGenerator
// ---------------------------------------------------------------------------
let BinaryResourceGenerator = class BinaryResourceGenerator {
    /**
     * Generate the binary resource file for one display.
     *
     * @param project   Loaded project model
     * @param dispIdx   Index into project.displays
     * @param format    BINARY_FORMAT_RAW | BINARY_FORMAT_SREC
     */
    generate(project, dispIdx, format) {
        const disp = project.displays[dispIdx];
        if (!disp)
            throw new resource_generator_1.GxCodegenError(`Display index ${dispIdx} out of range`);
        const projName = project.header.project_name.replace(/[^A-Za-z0-9_]/g, '_');
        const dispName = disp.name.replace(/[^A-Za-z0-9_]/g, '_');
        const baseName = project.displays.length > 1
            ? `${projName}_${dispName}_resources`
            : `${projName}_resources`;
        const ext = format === exports.BINARY_FORMAT_SREC ? '.srec' : '.bin';
        const buf = this.buildBinary(project, disp);
        return {
            filename: baseName + ext,
            content: buf,
            srec: format === exports.BINARY_FORMAT_SREC ? this.toSrec(baseName, buf) : '',
        };
    }
    // ── Binary layout builder ────────────────────────────────────────────────
    buildBinary(project, disp) {
        const bigEndian = project.header.big_endian;
        const enabledThemes = disp.themes.filter(t => t.enabled);
        const langs = project.header.languages.filter(l => l.name);
        const nThemes = enabledThemes.length;
        const nLangs = langs.length;
        // ── Compute total size ──────────────────────────────────────────
        let totalSize = GX_RESOURCE_HEADER_SIZE
            + nThemes * GX_THEME_HEADER_SIZE;
        for (const theme of enabledThemes) {
            totalSize += this.colorBlockSize(disp, theme);
            totalSize += this.paletteBlockSize(disp, theme);
            totalSize += this.fontBlockSize(theme);
            totalSize += this.pixelmapBlockSize(theme);
        }
        totalSize += this.stringBlockSize(disp, nLangs);
        // ── Allocate buffer ─────────────────────────────────────────────
        const data = new Uint8Array(totalSize);
        const view = new DataView(data.buffer);
        let offset = 0;
        // ── GX_RESOURCE_HEADER ──────────────────────────────────────────
        offset += writeU32(view, offset, bigEndian, GX_RESOURCE_MAGIC); // magic
        offset += writeU16(view, offset, bigEndian, GX_RESOURCE_VERSION); // version
        offset += writeU16(view, offset, bigEndian, nThemes); // theme_count
        offset += writeU16(view, offset, bigEndian, nLangs); // language_count
        offset += writeU32(view, offset, bigEndian, totalSize); // total_size
        offset += writeU16(view, offset, bigEndian, 0); // reserved
        // ── Per-theme data ──────────────────────────────────────────────
        for (const theme of enabledThemes) {
            // GX_THEME_HEADER
            const themeStart = offset;
            offset += writeU32(view, offset, bigEndian, 0); // color_data_offset (back-fill)
            offset += writeU32(view, offset, bigEndian, 0); // font_data_offset (back-fill)
            offset += writeU32(view, offset, bigEndian, 0); // pixelmap_data_offset (back-fill)
            const colorOffset = offset;
            offset = this.writeColorBlock(data, view, offset, bigEndian, disp, theme);
            offset = this.writePaletteBlockIfNeeded(view, offset, bigEndian, disp, theme);
            const fontOffset = offset;
            offset = this.writeFontBlock(data, view, offset, bigEndian, theme);
            const mapOffset = offset;
            offset = this.writePixelmapBlock(data, view, offset, bigEndian, theme);
            // Back-fill offsets in GX_THEME_HEADER
            writeU32(view, themeStart, bigEndian, colorOffset);
            writeU32(view, themeStart + 4, bigEndian, fontOffset);
            writeU32(view, themeStart + 8, bigEndian, mapOffset);
        }
        // ── String data ─────────────────────────────────────────────────
        offset = this.writeStringBlock(data, view, offset, bigEndian, disp, project);
        return data.subarray(0, offset);
    }
    // ── Color block ──────────────────────────────────────────────────────────
    colorBlockSize(_disp, theme) {
        const colors = collectByType(theme.resources, gx_types_1.RES_TYPE_COLOR);
        if (colors.length === 0)
            return 0;
        return GX_COLOR_HEADER_SIZE + colors.length * 4;
    }
    writeColorBlock(_data, view, offset, bigEndian, _disp, theme) {
        const colors = collectByType(theme.resources, gx_types_1.RES_TYPE_COLOR);
        if (colors.length === 0)
            return offset;
        // GX_COLOR_HEADER
        offset += writeU16(view, offset, bigEndian, GX_COLOR_HEADER_SIZE); // header_size
        offset += writeU16(view, offset, bigEndian, colors.length); // color_count
        offset += writeU32(view, offset, bigEndian, 0); // reserved
        for (const c of colors) {
            offset += writeU32(view, offset, bigEndian, c.colorval);
        }
        return offset;
    }
    // ── Palette block ─────────────────────────────────────────────────────────
    paletteBlockSize(disp, theme) {
        if (disp.colorformat !== gx_types_1.GX_COLOR_FORMAT_8BIT_PALETTE)
            return 0;
        if (theme.palette.length === 0)
            return 0;
        return GX_PALETTE_HEADER_SIZE + theme.palette.length * 4;
    }
    writePaletteBlockIfNeeded(view, offset, bigEndian, disp, theme) {
        if (disp.colorformat !== gx_types_1.GX_COLOR_FORMAT_8BIT_PALETTE)
            return offset;
        return this.writePaletteBlock(view, offset, bigEndian, theme);
    }
    writePaletteBlock(view, offset, bigEndian, theme) {
        if (theme.palette.length === 0)
            return offset;
        offset += writeU16(view, offset, bigEndian, GX_PALETTE_HEADER_SIZE);
        offset += writeU16(view, offset, bigEndian, theme.palette.length);
        offset += writeU32(view, offset, bigEndian, 0);
        for (const c of theme.palette) {
            offset += writeU32(view, offset, bigEndian, c);
        }
        return offset;
    }
    // ── Font block ────────────────────────────────────────────────────────────
    fontBlockSize(theme) {
        const fonts = collectByType(theme.resources, gx_types_1.RES_TYPE_FONT);
        if (fonts.length === 0)
            return 0;
        // Header only — actual glyph data not yet generated (font-util deferred)
        return GX_FONT_HEADER_SIZE * fonts.length;
    }
    writeFontBlock(_data, view, offset, bigEndian, theme) {
        const fonts = collectByType(theme.resources, gx_types_1.RES_TYPE_FONT);
        for (const f of fonts) {
            // GX_FONT_HEADER (placeholder — real data from font-util)
            offset += writeU16(view, offset, bigEndian, GX_FONT_HEADER_SIZE); // header_size
            offset += writeU16(view, offset, bigEndian, f.font_height); // font_height
            offset += writeU16(view, offset, bigEndian, f.font_bits); // font_bits
            offset += writeU16(view, offset, bigEndian, 0); // page_count
            offset += writeU32(view, offset, bigEndian, 0); // font_data_size
            offset += writeU16(view, offset, bigEndian, 0); // first_char
            offset += writeU16(view, offset, bigEndian, 0); // last_char
        }
        return offset;
    }
    // ── Pixelmap block ────────────────────────────────────────────────────────
    pixelmapBlockSize(theme) {
        const maps = collectByType(theme.resources, gx_types_1.RES_TYPE_PIXELMAP);
        if (maps.length === 0)
            return 0;
        let size = 0;
        for (const m of maps) {
            size += GX_PIXELMAP_HEADER_SIZE;
            const mapData = m.map_list[0];
            if (mapData)
                size += mapData.data.length;
        }
        return size;
    }
    writePixelmapBlock(data, view, offset, bigEndian, theme) {
        const maps = collectByType(theme.resources, gx_types_1.RES_TYPE_PIXELMAP);
        for (const m of maps) {
            const mapData = m.map_list[0];
            const pixelBytes = mapData ? mapData.data.length : 0;
            const width = mapData ? mapData.width : 0;
            const height = mapData ? mapData.height : 0;
            // GX_PIXELMAP_HEADER
            offset += writeU16(view, offset, bigEndian, GX_PIXELMAP_HEADER_SIZE);
            offset += writeU16(view, offset, bigEndian, 0); // flags
            offset += writeU16(view, offset, bigEndian, 0); // format
            offset += writeU16(view, offset, bigEndian, width);
            offset += writeU16(view, offset, bigEndian, height);
            offset += writeU32(view, offset, bigEndian, pixelBytes); // data_size
            offset += writeU32(view, offset, bigEndian, 0); // aux_data_size
            offset += writeU32(view, offset, bigEndian, 0); // reserved
            if (mapData && mapData.data.length > 0) {
                data.set(mapData.data, offset);
                offset += mapData.data.length;
            }
        }
        return offset;
    }
    // ── String block ──────────────────────────────────────────────────────────
    stringBlockSize(disp, nLangs) {
        if (disp.string_entries.length === 0 || nLangs === 0)
            return 0;
        let size = GX_STRING_HEADER_SIZE + nLangs * GX_LANGUAGE_HEADER_SIZE;
        for (let li = 0; li < nLangs; li++) {
            for (const entry of disp.string_entries) {
                const text = entry.translations[li] ?? '';
                const bytes = textToUtf8(text);
                size += 2 + bytes.length + 1; // length(u16) + data + null
            }
        }
        return size;
    }
    writeStringBlock(data, view, offset, bigEndian, disp, project) {
        const langs = project.header.languages.filter(l => l.name);
        const entries = disp.string_entries;
        if (entries.length === 0 || langs.length === 0)
            return offset;
        // GX_STRING_HEADER
        offset += writeU16(view, offset, bigEndian, GX_STRING_HEADER_SIZE);
        offset += writeU16(view, offset, bigEndian, langs.length);
        offset += writeU16(view, offset, bigEndian, entries.length + 1); // +1 for null slot
        offset += writeU16(view, offset, bigEndian, 0);
        // Per-language GX_LANGUAGE_HEADER + string data
        for (const [li] of langs.entries()) {
            // GX_LANGUAGE_HEADER
            offset += writeU16(view, offset, bigEndian, GX_LANGUAGE_HEADER_SIZE);
            offset += writeU16(view, offset, bigEndian, entries.length + 1);
            offset += writeU32(view, offset, bigEndian, 0); // data_size (back-fill)
            for (const entry of entries) {
                const text = entry.translations[li] ?? '';
                const bytes = textToUtf8(text);
                // length-prefixed string
                offset += writeU16(view, offset, bigEndian, bytes.length);
                data.set(bytes, offset);
                offset += bytes.length;
                data[offset++] = 0; // null terminator
            }
        }
        return offset;
    }
    // ── S-record formatter ────────────────────────────────────────────────────
    /**
     * Encode binary data as Motorola S-record file.
     * Uses S0 (header), S3 (32-bit address data), S8 (end-of-file).
     */
    toSrec(name, data) {
        const lines = [];
        // S0 record — header
        const nameBytes = new TextEncoder().encode(name.substring(0, 20));
        lines.push(buildSrec(0x00, 0, nameBytes));
        // S3 records — data at sequential addresses
        for (let addr = 0; addr < data.length; addr += SREC_MAX_DATA_SIZE) {
            const chunk = data.subarray(addr, addr + SREC_MAX_DATA_SIZE);
            lines.push(buildSrec(0x03, addr, chunk));
        }
        // S8 record — end of file (32-bit start address = 0)
        lines.push(buildSrec(0x08, 0, new Uint8Array(0)));
        return lines.join('\r\n') + '\r\n';
    }
};
exports.BinaryResourceGenerator = BinaryResourceGenerator;
exports.BinaryResourceGenerator = BinaryResourceGenerator = __decorate([
    (0, inversify_1.injectable)()
], BinaryResourceGenerator);
// ---------------------------------------------------------------------------
// S-record helper
// ---------------------------------------------------------------------------
/**
 * Build one S-record line.
 *
 * @param type    0=S0, 3=S3 (32-bit addr data), 8=S8 (end, 32-bit addr)
 * @param addr    Address
 * @param payload Data bytes
 */
function buildSrec(type, addr, payload) {
    const addrBytes = type === 0 ? 2 : 4; // S0 uses 16-bit address
    const byteCount = addrBytes + payload.length + 1; // addr + data + checksum
    let hex = byteCount.toString(16).toUpperCase().padStart(2, '0');
    // Address
    if (addrBytes === 4) {
        hex += (addr >>> 24 & 0xFF).toString(16).toUpperCase().padStart(2, '0');
        hex += (addr >>> 16 & 0xFF).toString(16).toUpperCase().padStart(2, '0');
    }
    hex += (addr >> 8 & 0xFF).toString(16).toUpperCase().padStart(2, '0');
    hex += (addr & 0xFF).toString(16).toUpperCase().padStart(2, '0');
    // Data
    for (const b of payload) {
        hex += b.toString(16).toUpperCase().padStart(2, '0');
    }
    // Checksum: ones-complement of all bytes sum
    let sum = byteCount;
    if (addrBytes === 4) {
        sum += (addr >>> 24 & 0xFF) + (addr >>> 16 & 0xFF);
    }
    sum += (addr >> 8 & 0xFF) + (addr & 0xFF);
    for (const b of payload)
        sum += b;
    const checksum = (~sum) & 0xFF;
    hex += checksum.toString(16).toUpperCase().padStart(2, '0');
    return `S${type}${hex}`;
}
// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------
function writeU16(view, offset, bigEndian, value) {
    view.setUint16(offset, value & 0xFFFF, !bigEndian);
    return 2;
}
function writeU32(view, offset, bigEndian, value) {
    view.setUint32(offset, value >>> 0, !bigEndian);
    return 4;
}
// ---------------------------------------------------------------------------
// Resource tree helpers
// ---------------------------------------------------------------------------
function collectByType(resources, type) {
    const result = [];
    for (const r of resources)
        collectRec(r, type, result);
    return result;
}
function collectRec(r, type, out) {
    if (r.type === type && r.name)
        out.push(r);
    for (const child of r.children)
        collectRec(child, type, out);
}
// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------
function textToUtf8(s) {
    return new TextEncoder().encode(s);
}


/***/ }),
/* 104 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * UndoManager — command/undo stack for GUIX Studio edits.
 *
 * Ports guix_studio/undo_manager.cpp.
 *
 * Design:
 *   - Every edit is wrapped in an ICommand with execute() + undo().
 *   - Commands are pushed onto a fixed-size ring (MAX_UNDO_ENTRIES = 40).
 *   - Redo stack is cleared on any new command (standard linear undo).
 *   - Commands may be folded: fold=true merges with the last command of the
 *     same type (e.g. repeated single-pixel moves become one undo entry).
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UndoManager = exports.CompositeCommand = exports.DeleteWidgetCommand = exports.InsertWidgetCommand = exports.ChangePropertyCommand = exports.MoveWidgetCommand = exports.UNDO_TYPE_RADIAL_SLIDER_INFO = exports.UNDO_TYPE_INSERT_TOP_LEVEL_WIDGETS = exports.UNDO_TYPE_DELETE_FOLDER = exports.UNDO_TYPE_INSERT_FOLDER = exports.UNDO_TYPE_VISIBLE_AT_STARTUP = exports.UNDO_TYPE_TREE_VIEW_INFO = exports.UNDO_TYPE_MENU_INFO = exports.UNDO_TYPE_NUMERIC_PROMPT_INFO = exports.UNDO_TYPE_TEMPLATE = exports.UNDO_TYPE_NUMERIC_SCROLL_WHEEL_INFO = exports.UNDO_TYPE_STRING_SCROLL_WHEEL_INFO = exports.UNDO_TYPE_TEXT_SCROLL_WHEEL_INFO = exports.UNDO_TYPE_SCROLL_WHEEL_INFO = exports.UNDO_TYPE_CHART_INFO = exports.UNDO_TYPE_CIRCULAR_GAUGE_INFO = exports.UNDO_TYPE_FOCUS = exports.UNDO_TYPE_ALLOCATION = exports.UNDO_TYPE_USER_DATA = exports.UNDO_TYPE_NAMES = exports.UNDO_TYPE_STRING = exports.UNDO_TYPE_PIXELMAP = exports.UNDO_TYPE_FONT = exports.UNDO_TYPE_COLOR = exports.UNDO_TYPE_DELETE_WIDGET = exports.UNDO_TYPE_INSERT_WIDGET = exports.UNDO_TYPE_SCROLL_STYLE = exports.UNDO_TYPE_SCROLL_APPEARANCE = exports.UNDO_TYPE_TEXT_BUFFER_SIZE = exports.UNDO_TYPE_TEXT_VIEW_WHITESPACE = exports.UNDO_TYPE_TEXT_VIEW_LINE_SPACE = exports.UNDO_TYPE_DYNAMIC_TEXT_BUFFER = exports.UNDO_TYPE_OPEN_HEIGHT = exports.UNDO_TYPE_LIST_ROWS = exports.UNDO_TYPE_RADIAL_PROGRESS_BAR_INFO = exports.UNDO_TYPE_PROGRESS_BAR_INFO = exports.UNDO_TYPE_SLIDER_INFO = exports.UNDO_TYPE_STYLE = exports.UNDO_TYPE_SIZE = exports.UNDO_TYPE_POSITION = exports.UNDO_TYPE_NONE = void 0;
const inversify_1 = __webpack_require__(2);
// ---------------------------------------------------------------------------
// Undo type constants (mirrors undo_types enum in undo_manager.h)
// ---------------------------------------------------------------------------
exports.UNDO_TYPE_NONE = 0;
exports.UNDO_TYPE_POSITION = 1;
exports.UNDO_TYPE_SIZE = 2;
exports.UNDO_TYPE_STYLE = 3;
exports.UNDO_TYPE_SLIDER_INFO = 4;
exports.UNDO_TYPE_PROGRESS_BAR_INFO = 5;
exports.UNDO_TYPE_RADIAL_PROGRESS_BAR_INFO = 6;
exports.UNDO_TYPE_LIST_ROWS = 7;
exports.UNDO_TYPE_OPEN_HEIGHT = 8;
exports.UNDO_TYPE_DYNAMIC_TEXT_BUFFER = 9;
exports.UNDO_TYPE_TEXT_VIEW_LINE_SPACE = 10;
exports.UNDO_TYPE_TEXT_VIEW_WHITESPACE = 11;
exports.UNDO_TYPE_TEXT_BUFFER_SIZE = 12;
exports.UNDO_TYPE_SCROLL_APPEARANCE = 13;
exports.UNDO_TYPE_SCROLL_STYLE = 14;
exports.UNDO_TYPE_INSERT_WIDGET = 15;
exports.UNDO_TYPE_DELETE_WIDGET = 16;
exports.UNDO_TYPE_COLOR = 17;
exports.UNDO_TYPE_FONT = 18;
exports.UNDO_TYPE_PIXELMAP = 19;
exports.UNDO_TYPE_STRING = 20;
exports.UNDO_TYPE_NAMES = 21;
exports.UNDO_TYPE_USER_DATA = 22;
exports.UNDO_TYPE_ALLOCATION = 23;
exports.UNDO_TYPE_FOCUS = 24;
exports.UNDO_TYPE_CIRCULAR_GAUGE_INFO = 25;
exports.UNDO_TYPE_CHART_INFO = 26;
exports.UNDO_TYPE_SCROLL_WHEEL_INFO = 27;
exports.UNDO_TYPE_TEXT_SCROLL_WHEEL_INFO = 28;
exports.UNDO_TYPE_STRING_SCROLL_WHEEL_INFO = 29;
exports.UNDO_TYPE_NUMERIC_SCROLL_WHEEL_INFO = 30;
exports.UNDO_TYPE_TEMPLATE = 31;
exports.UNDO_TYPE_NUMERIC_PROMPT_INFO = 32;
exports.UNDO_TYPE_MENU_INFO = 33;
exports.UNDO_TYPE_TREE_VIEW_INFO = 34;
exports.UNDO_TYPE_VISIBLE_AT_STARTUP = 35;
exports.UNDO_TYPE_INSERT_FOLDER = 36;
exports.UNDO_TYPE_DELETE_FOLDER = 37;
exports.UNDO_TYPE_INSERT_TOP_LEVEL_WIDGETS = 38;
exports.UNDO_TYPE_RADIAL_SLIDER_INFO = 39;
const MAX_UNDO_ENTRIES = 40;
// ---------------------------------------------------------------------------
// Built-in command implementations
// ---------------------------------------------------------------------------
/** Move / resize one widget. */
class MoveWidgetCommand {
    constructor(widget, newRect, oldRect) {
        this.widget = widget;
        this.newRect = newRect;
        this.oldRect = oldRect;
        this.undoType = exports.UNDO_TYPE_POSITION;
        this.label = 'Move Widget';
    }
    execute(_project) {
        Object.assign(this.widget.size, this.newRect);
    }
    undo(_project) {
        Object.assign(this.widget.size, this.oldRect);
    }
}
exports.MoveWidgetCommand = MoveWidgetCommand;
/** Change a single numeric/string property on a widget. */
class ChangePropertyCommand {
    constructor(undoType, label, widget, field, newValue, oldValue) {
        this.widget = widget;
        this.field = field;
        this.newValue = newValue;
        this.oldValue = oldValue;
        this.undoType = undoType;
        this.label = label;
    }
    execute(_project) {
        this.widget[this.field] = this.newValue;
    }
    undo(_project) {
        this.widget[this.field] = this.oldValue;
    }
}
exports.ChangePropertyCommand = ChangePropertyCommand;
/** Insert a widget into a parent's children array at a given index. */
class InsertWidgetCommand {
    constructor(parent, folder, widget, index) {
        this.parent = parent;
        this.folder = folder;
        this.widget = widget;
        this.index = index;
        this.undoType = exports.UNDO_TYPE_INSERT_WIDGET;
        this.label = 'Insert Widget';
    }
    execute(_project) {
        if (this.parent) {
            this.parent.children.splice(this.index, 0, this.widget);
        }
        else if (this.folder) {
            this.folder.widgets.splice(this.index, 0, this.widget);
        }
    }
    undo(_project) {
        if (this.parent) {
            this.parent.children.splice(this.index, 1);
        }
        else if (this.folder) {
            this.folder.widgets.splice(this.index, 1);
        }
    }
}
exports.InsertWidgetCommand = InsertWidgetCommand;
/** Delete a widget from its parent. */
class DeleteWidgetCommand {
    constructor(parent, folder, widget) {
        this.parent = parent;
        this.folder = folder;
        this.widget = widget;
        this.undoType = exports.UNDO_TYPE_DELETE_WIDGET;
        this.label = 'Delete Widget';
        this.savedIndex = 0;
    }
    execute(_project) {
        if (this.parent) {
            this.savedIndex = this.parent.children.indexOf(this.widget);
            this.parent.children.splice(this.savedIndex, 1);
        }
        else if (this.folder) {
            this.savedIndex = this.folder.widgets.indexOf(this.widget);
            this.folder.widgets.splice(this.savedIndex, 1);
        }
    }
    undo(_project) {
        if (this.parent) {
            this.parent.children.splice(this.savedIndex, 0, this.widget);
        }
        else if (this.folder) {
            this.folder.widgets.splice(this.savedIndex, 0, this.widget);
        }
    }
}
exports.DeleteWidgetCommand = DeleteWidgetCommand;
// ---------------------------------------------------------------------------
// Composite / macro command (fold multiple operations into one undo step)
// ---------------------------------------------------------------------------
class CompositeCommand {
    constructor(undoType, label, cmds) {
        this.undoType = undoType;
        this.label = label;
        this.cmds = [...cmds];
    }
    execute(project) {
        for (const c of this.cmds)
            c.execute(project);
    }
    undo(project) {
        for (let i = this.cmds.length - 1; i >= 0; i--) {
            this.cmds[i].undo(project);
        }
    }
}
exports.CompositeCommand = CompositeCommand;
// ---------------------------------------------------------------------------
// UndoManager
// ---------------------------------------------------------------------------
let UndoManager = class UndoManager {
    constructor() {
        this.undoStack = [];
        this.redoStack = [];
        this.locked = false;
    }
    /**
     * Push a command, execute it, and clear the redo stack.
     *
     * @param cmd   The command to execute and record.
     * @param fold  If true and the last undo entry has the same undoType,
     *              merge by discarding the previous entry's new-state snapshot
     *              (matches C++ fold behaviour).
     */
    push(cmd, project, fold = false) {
        if (this.locked)
            return;
        if (fold && this.undoStack.length > 0) {
            const last = this.undoStack[this.undoStack.length - 1];
            if (last.undoType === cmd.undoType) {
                // Drop the last entry — we'll replace it with the new command
                // so that a single undo reverts all the way back to before the
                // first folded operation.
                this.undoStack.pop();
            }
        }
        cmd.execute(project);
        this.undoStack.push(cmd);
        this.redoStack = [];
        // Trim to max size (ring-buffer semantics from C++)
        if (this.undoStack.length > MAX_UNDO_ENTRIES) {
            this.undoStack.shift();
        }
    }
    undo(project) {
        if (this.undoStack.length === 0)
            return false;
        const cmd = this.undoStack.pop();
        cmd.undo(project);
        this.redoStack.push(cmd);
        return true;
    }
    redo(project) {
        if (this.redoStack.length === 0)
            return false;
        const cmd = this.redoStack.pop();
        cmd.execute(project);
        this.undoStack.push(cmd);
        return true;
    }
    reset() {
        this.undoStack = [];
        this.redoStack = [];
    }
    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    undoLabel() {
        return this.undoStack.length > 0
            ? this.undoStack[this.undoStack.length - 1].label
            : '';
    }
    redoLabel() {
        return this.redoStack.length > 0
            ? this.redoStack[this.redoStack.length - 1].label
            : '';
    }
    countEntries() { return this.undoStack.length; }
    /**
     * Run a callback with undo recording suspended.
     * Used when programmatic changes (e.g. from undo itself) should not be
     * recorded again.
     */
    withLock(fn) {
        this.locked = true;
        try {
            fn();
        }
        finally {
            this.locked = false;
        }
    }
};
exports.UndoManager = UndoManager;
exports.UndoManager = UndoManager = __decorate([
    (0, inversify_1.injectable)()
], UndoManager);


/***/ }),
/* 105 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * WidgetRegistry — maps GX_TYPE_* integer constants to WidgetService instances.
 *
 * Ports guix_studio/widget_factory.cpp (GetServiceProvider / InitServiceProviders).
 *
 * Usage:
 *   const svc = registry.getService(GX_TYPE_BUTTON);   // ButtonService
 *   const all = registry.allTypes();                     // [128, 1, 2, ...]
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.WidgetRegistry = void 0;
const inversify_1 = __webpack_require__(2);
const gx_types_1 = __webpack_require__(90);
const widget_service_1 = __webpack_require__(106);
let WidgetRegistry = class WidgetRegistry {
    constructor() {
        this.byType = new Map();
        const services = [
            new widget_service_1.WidgetServiceBase(),
            new widget_service_1.WindowService(),
            new widget_service_1.RootWindowService(),
            new widget_service_1.ButtonService(),
            new widget_service_1.TextButtonService(),
            new widget_service_1.MultiLineTextButtonService(),
            new widget_service_1.CheckboxService(),
            new widget_service_1.RadioButtonService(),
            new widget_service_1.IconButtonService(),
            new widget_service_1.PixelmapButtonService(),
            new widget_service_1.IconService(),
            new widget_service_1.SpriteService(),
            new widget_service_1.CircularGaugeService(),
            new widget_service_1.ProgressBarService(),
            new widget_service_1.RadialProgressBarService(),
            new widget_service_1.PromptService(),
            new widget_service_1.NumericPromptService(),
            new widget_service_1.PixelmapPromptService(),
            new widget_service_1.NumericPixelmapPromptService(),
            new widget_service_1.SingleLineTextInputService(),
            new widget_service_1.MultiLineTextInputService(),
            new widget_service_1.MultiLineTextViewService(),
            new widget_service_1.RichTextViewService(),
            new widget_service_1.VerticalListService(),
            new widget_service_1.HorizontalListService(),
            new widget_service_1.DropListService(),
            new widget_service_1.GenericScrollWheelService(),
            new widget_service_1.StringScrollWheelService(),
            new widget_service_1.NumericScrollWheelService(),
            new widget_service_1.TemplateService(),
            new widget_service_1.HorizontalScrollbarService(),
            new widget_service_1.VerticalScrollbarService(),
            new widget_service_1.SliderService(),
            new widget_service_1.PixelmapSliderService(),
            new widget_service_1.RadialSliderService(),
            new widget_service_1.LineChartService(),
            new widget_service_1.MenuService(),
            new widget_service_1.AccordionMenuService(),
            new widget_service_1.TreeViewService(),
        ];
        for (const svc of services) {
            this.register(svc);
        }
    }
    /**
     * Return the WidgetService for `type`.
     * Falls back to WidgetServiceBase for unknown types.
     */
    getService(type) {
        return this.byType.get(type) ?? this.byType.get(gx_types_1.GX_TYPE_WIDGET);
    }
    /**
     * Register a WidgetService.  Replaces any previously registered service
     * for the same type (allows user-extension at runtime).
     */
    register(service) {
        this.byType.set(service.getType(), service);
    }
    /** Return all registered GX_TYPE_* integers in insertion order. */
    allTypes() {
        return [...this.byType.keys()];
    }
    /**
     * Return the control-block C type name for a given GX_TYPE_* value,
     * e.g. getControlBlockName(GX_TYPE_BUTTON) → "GX_BUTTON".
     */
    getControlBlockName(type) {
        return this.getService(type).getControlBlockName();
    }
    /**
     * Return the short name used in code generation, e.g. "button".
     */
    getShortName(type) {
        return this.getService(type).getShortName();
    }
};
exports.WidgetRegistry = WidgetRegistry;
exports.WidgetRegistry = WidgetRegistry = __decorate([
    (0, inversify_1.injectable)(),
    __metadata("design:paramtypes", [])
], WidgetRegistry);


/***/ }),
/* 106 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

/**
 * WidgetService — abstract base class for per-type widget services.
 *
 * Ports guix_studio/widget_service_provider.h/.cpp.
 *
 * One concrete subclass exists per GX_TYPE_* constant.  The subclass:
 *   - reports its type number and string names
 *   - creates a default-initialised WidgetInfo for that type
 *   - provides the property descriptor list used by the property panel
 *   - maps resource indices (color, font, pixelmap, string) to names
 *   - reports resize constraints
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TreeViewService = exports.AccordionMenuService = exports.MenuService = exports.LineChartService = exports.RadialSliderService = exports.PixelmapSliderService = exports.SliderService = exports.VerticalScrollbarService = exports.HorizontalScrollbarService = exports.TemplateService = exports.NumericScrollWheelService = exports.StringScrollWheelService = exports.GenericScrollWheelService = exports.DropListService = exports.HorizontalListService = exports.VerticalListService = exports.RichTextViewService = exports.MultiLineTextViewService = exports.MultiLineTextInputService = exports.SingleLineTextInputService = exports.NumericPixelmapPromptService = exports.PixelmapPromptService = exports.NumericPromptService = exports.PromptService = exports.RadialProgressBarService = exports.ProgressBarService = exports.CircularGaugeService = exports.SpriteService = exports.IconService = exports.PixelmapButtonService = exports.IconButtonService = exports.RadioButtonService = exports.CheckboxService = exports.MultiLineTextButtonService = exports.TextButtonService = exports.ButtonService = exports.RootWindowService = exports.WindowService = exports.WidgetServiceBase = exports.WidgetService = exports.RESIZE_MODE_WIDTH = exports.RESIZE_MODE_HEIGHT = exports.RESIZE_MODE_ALL = void 0;
const gx_types_1 = __webpack_require__(90);
Object.defineProperty(exports, "RESIZE_MODE_ALL", ({ enumerable: true, get: function () { return gx_types_1.RESIZE_MODE_ALL; } }));
Object.defineProperty(exports, "RESIZE_MODE_HEIGHT", ({ enumerable: true, get: function () { return gx_types_1.RESIZE_MODE_HEIGHT; } }));
Object.defineProperty(exports, "RESIZE_MODE_WIDTH", ({ enumerable: true, get: function () { return gx_types_1.RESIZE_MODE_WIDTH; } }));
const widget_info_1 = __webpack_require__(92);
// ---------------------------------------------------------------------------
// WidgetService — abstract base
// ---------------------------------------------------------------------------
class WidgetService {
    /**
     * Create a new WidgetInfo with sensible defaults for this widget type.
     * Mirrors CreateNewInstance in the C++ service provider.
     */
    createDefault(parent) {
        const info = (0, widget_info_1.createDefaultWidgetInfo)(this.getType());
        void parent; // subclasses may use parent for positioning
        return info;
    }
    /**
     * Return the ordered list of property fields the panel should display.
     * Common fields (name, position, size, style, colors…) are prepended
     * by the base implementation; subclasses add type-specific fields.
     */
    getPropertyFields() {
        return [
            ...this.commonFields(),
            ...this.typeSpecificFields(),
        ];
    }
    /** Override to add type-specific fields after the common ones. */
    typeSpecificFields() {
        return [];
    }
    /**
     * Resize mode reported to the canvas snap engine.
     * Default: allow resize in all directions.
     */
    getResizeMode() { return gx_types_1.RESIZE_MODE_ALL; }
    /**
     * Return the default bounding rectangle for a new widget of this type
     * placed in a 320x240 display with its top-left at (10,10).
     */
    getDefaultRect() {
        return { left: 10, top: 10, right: 109, bottom: 59 };
    }
    // ── Resource index label maps ─────────────────────────────────────────────
    /** Labels for color_id[0..7] slots. Override to name them. */
    colorLabels() {
        return ['Normal color', 'Selected color', 'Disabled color',
            'Color 3', 'Color 4', 'Color 5', 'Color 6', 'Color 7'];
    }
    /** Labels for font_id[0..3] slots. Override to name them. */
    fontLabels() {
        return ['Normal font', 'Selected font', 'Disabled font', 'Font 3'];
    }
    /** Labels for pixelmap_id[0..7] slots. Override to name them. */
    pixelmapLabels() {
        return ['Normal pixelmap', 'Selected pixelmap', 'Disabled pixelmap',
            'Map 3', 'Map 4', 'Map 5', 'Map 6', 'Map 7'];
    }
    /** Labels for string_id[0..1] slots. Override to name them. */
    stringLabels() {
        return ['Text string', 'String 1'];
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    commonFields() {
        return [
            { label: 'Widget name', path: 'app_name', kind: 'string' },
            { label: 'Widget ID', path: 'id_name', kind: 'string' },
            { label: 'Left', path: 'size.left', kind: 'number' },
            { label: 'Top', path: 'size.top', kind: 'number' },
            { label: 'Right', path: 'size.right', kind: 'number' },
            { label: 'Bottom', path: 'size.bottom', kind: 'number' },
            { label: 'Visible at startup', path: 'visible_at_startup', kind: 'boolean' },
            { label: 'Accepts focus', path: 'accepts_focus', kind: 'boolean' },
            { label: 'Style', path: 'style', kind: 'style_bits' },
        ];
    }
}
exports.WidgetService = WidgetService;
// ===========================================================================
// Concrete service implementations (one per GX_TYPE_* constant)
// ===========================================================================
class WidgetServiceBase extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_WIDGET; }
    getControlBlockName() { return 'GX_WIDGET'; }
    getShortName() { return 'widget'; }
}
exports.WidgetServiceBase = WidgetServiceBase;
class WindowService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_WINDOW; }
    getControlBlockName() { return 'GX_WINDOW'; }
    getShortName() { return 'window'; }
}
exports.WindowService = WindowService;
class RootWindowService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_ROOT_WINDOW; }
    getControlBlockName() { return 'GX_WINDOW'; }
    getShortName() { return 'root_window'; }
}
exports.RootWindowService = RootWindowService;
class ButtonService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_BUTTON; }
    getControlBlockName() { return 'GX_BUTTON'; }
    getShortName() { return 'button'; }
    typeSpecificFields() {
        return [
            { label: 'Normal color', path: 'color_id.0', kind: 'color_id' },
            { label: 'Selected color', path: 'color_id.1', kind: 'color_id' },
            { label: 'Disabled color', path: 'color_id.2', kind: 'color_id' },
        ];
    }
}
exports.ButtonService = ButtonService;
class TextButtonService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_TEXT_BUTTON; }
    getControlBlockName() { return 'GX_TEXT_BUTTON'; }
    getShortName() { return 'text_button'; }
    typeSpecificFields() {
        return [
            { label: 'Text', path: 'string_id.0', kind: 'string_id' },
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Normal color', path: 'color_id.0', kind: 'color_id' },
            { label: 'Selected color', path: 'color_id.1', kind: 'color_id' },
            { label: 'Disabled color', path: 'color_id.2', kind: 'color_id' },
        ];
    }
}
exports.TextButtonService = TextButtonService;
class MultiLineTextButtonService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_MULTI_LINE_TEXT_BUTTON; }
    getControlBlockName() { return 'GX_MULTI_LINE_TEXT_BUTTON'; }
    getShortName() { return 'ml_text_button'; }
    typeSpecificFields() {
        return [
            { label: 'Text', path: 'string_id.0', kind: 'string_id' },
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Normal color', path: 'color_id.0', kind: 'color_id' },
            { label: 'Selected color', path: 'color_id.1', kind: 'color_id' },
            { label: 'Disabled color', path: 'color_id.2', kind: 'color_id' },
        ];
    }
}
exports.MultiLineTextButtonService = MultiLineTextButtonService;
class CheckboxService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_CHECKBOX; }
    getControlBlockName() { return 'GX_CHECKBOX'; }
    getShortName() { return 'checkbox'; }
    typeSpecificFields() {
        return [
            { label: 'Text', path: 'string_id.0', kind: 'string_id' },
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Normal pixelmap', path: 'pixelmap_id.0', kind: 'pixelmap_id' },
            { label: 'Selected pixelmap', path: 'pixelmap_id.1', kind: 'pixelmap_id' },
        ];
    }
}
exports.CheckboxService = CheckboxService;
class RadioButtonService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_RADIO_BUTTON; }
    getControlBlockName() { return 'GX_RADIO_BUTTON'; }
    getShortName() { return 'radio_button'; }
    typeSpecificFields() {
        return [
            { label: 'Text', path: 'string_id.0', kind: 'string_id' },
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Off pixelmap', path: 'pixelmap_id.0', kind: 'pixelmap_id' },
            { label: 'On pixelmap', path: 'pixelmap_id.1', kind: 'pixelmap_id' },
        ];
    }
}
exports.RadioButtonService = RadioButtonService;
class IconButtonService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_ICON_BUTTON; }
    getControlBlockName() { return 'GX_ICON_BUTTON'; }
    getShortName() { return 'icon_button'; }
    typeSpecificFields() {
        return [
            { label: 'Normal pixelmap', path: 'pixelmap_id.0', kind: 'pixelmap_id' },
        ];
    }
}
exports.IconButtonService = IconButtonService;
class PixelmapButtonService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_PIXELMAP_BUTTON; }
    getControlBlockName() { return 'GX_PIXELMAP_BUTTON'; }
    getShortName() { return 'pixelmap_button'; }
    typeSpecificFields() {
        return [
            { label: 'Normal pixelmap', path: 'pixelmap_id.0', kind: 'pixelmap_id' },
            { label: 'Selected pixelmap', path: 'pixelmap_id.1', kind: 'pixelmap_id' },
            { label: 'Disabled pixelmap', path: 'pixelmap_id.2', kind: 'pixelmap_id' },
        ];
    }
}
exports.PixelmapButtonService = PixelmapButtonService;
class IconService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_ICON; }
    getControlBlockName() { return 'GX_ICON'; }
    getShortName() { return 'icon'; }
    typeSpecificFields() {
        return [
            { label: 'Normal pixelmap', path: 'pixelmap_id.0', kind: 'pixelmap_id' },
            { label: 'Selected pixelmap', path: 'pixelmap_id.1', kind: 'pixelmap_id' },
        ];
    }
}
exports.IconService = IconService;
class SpriteService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_SPRITE; }
    getControlBlockName() { return 'GX_SPRITE'; }
    getShortName() { return 'sprite'; }
}
exports.SpriteService = SpriteService;
class CircularGaugeService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_CIRCULAR_GAUGE; }
    getControlBlockName() { return 'GX_CIRCULAR_GAUGE'; }
    getShortName() { return 'circular_gauge'; }
    typeSpecificFields() {
        return [
            { label: 'Background pixelmap', path: 'pixelmap_id.0', kind: 'pixelmap_id' },
            { label: 'Needle pixelmap', path: 'pixelmap_id.1', kind: 'pixelmap_id' },
        ];
    }
}
exports.CircularGaugeService = CircularGaugeService;
class ProgressBarService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_PROGRESS_BAR; }
    getControlBlockName() { return 'GX_PROGRESS_BAR'; }
    getShortName() { return 'progress_bar'; }
    typeSpecificFields() {
        return [
            { label: 'Normal color', path: 'color_id.0', kind: 'color_id' },
            { label: 'Fill color', path: 'color_id.1', kind: 'color_id' },
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Text string', path: 'string_id.0', kind: 'string_id' },
        ];
    }
}
exports.ProgressBarService = ProgressBarService;
class RadialProgressBarService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_RADIAL_PROGRESS_BAR; }
    getControlBlockName() { return 'GX_RADIAL_PROGRESS_BAR'; }
    getShortName() { return 'radial_progress_bar'; }
    typeSpecificFields() {
        return [
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Text string', path: 'string_id.0', kind: 'string_id' },
        ];
    }
}
exports.RadialProgressBarService = RadialProgressBarService;
class PromptService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_PROMPT; }
    getControlBlockName() { return 'GX_PROMPT'; }
    getShortName() { return 'prompt'; }
    typeSpecificFields() {
        return [
            { label: 'Text', path: 'string_id.0', kind: 'string_id' },
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Normal color', path: 'color_id.0', kind: 'color_id' },
            { label: 'Selected color', path: 'color_id.1', kind: 'color_id' },
            { label: 'Disabled color', path: 'color_id.2', kind: 'color_id' },
            { label: 'Fill color', path: 'color_id.3', kind: 'color_id' },
        ];
    }
}
exports.PromptService = PromptService;
class NumericPromptService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_NUMERIC_PROMPT; }
    getControlBlockName() { return 'GX_NUMERIC_PROMPT'; }
    getShortName() { return 'numeric_prompt'; }
    typeSpecificFields() {
        return [
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Normal color', path: 'color_id.0', kind: 'color_id' },
        ];
    }
}
exports.NumericPromptService = NumericPromptService;
class PixelmapPromptService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_PIXELMAP_PROMPT; }
    getControlBlockName() { return 'GX_PIXELMAP_PROMPT'; }
    getShortName() { return 'pixelmap_prompt'; }
    typeSpecificFields() {
        return [
            { label: 'Text', path: 'string_id.0', kind: 'string_id' },
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Left pixelmap', path: 'pixelmap_id.0', kind: 'pixelmap_id' },
            { label: 'Fill pixelmap', path: 'pixelmap_id.1', kind: 'pixelmap_id' },
            { label: 'Right pixelmap', path: 'pixelmap_id.2', kind: 'pixelmap_id' },
            { label: 'Selected left', path: 'pixelmap_id.3', kind: 'pixelmap_id' },
            { label: 'Selected fill', path: 'pixelmap_id.4', kind: 'pixelmap_id' },
            { label: 'Selected right', path: 'pixelmap_id.5', kind: 'pixelmap_id' },
        ];
    }
}
exports.PixelmapPromptService = PixelmapPromptService;
class NumericPixelmapPromptService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_NUMERIC_PIXELMAP_PROMPT; }
    getControlBlockName() { return 'GX_NUMERIC_PIXELMAP_PROMPT'; }
    getShortName() { return 'numeric_pixelmap_prompt'; }
    typeSpecificFields() {
        return [
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Left pixelmap', path: 'pixelmap_id.0', kind: 'pixelmap_id' },
            { label: 'Fill pixelmap', path: 'pixelmap_id.1', kind: 'pixelmap_id' },
            { label: 'Right pixelmap', path: 'pixelmap_id.2', kind: 'pixelmap_id' },
        ];
    }
}
exports.NumericPixelmapPromptService = NumericPixelmapPromptService;
class SingleLineTextInputService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_SINGLE_LINE_TEXT_INPUT; }
    getControlBlockName() { return 'GX_SINGLE_LINE_TEXT_INPUT'; }
    getShortName() { return 'sl_input'; }
    typeSpecificFields() {
        return [
            { label: 'Text', path: 'string_id.0', kind: 'string_id' },
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Normal color', path: 'color_id.0', kind: 'color_id' },
            { label: 'Selected color', path: 'color_id.1', kind: 'color_id' },
            { label: 'Cursor color', path: 'color_id.4', kind: 'color_id' },
        ];
    }
}
exports.SingleLineTextInputService = SingleLineTextInputService;
class MultiLineTextInputService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_MULTI_LINE_TEXT_INPUT; }
    getControlBlockName() { return 'GX_MULTI_LINE_TEXT_INPUT'; }
    getShortName() { return 'ml_text_input'; }
    typeSpecificFields() {
        return [
            { label: 'Text', path: 'string_id.0', kind: 'string_id' },
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Normal color', path: 'color_id.0', kind: 'color_id' },
            { label: 'Selected color', path: 'color_id.1', kind: 'color_id' },
        ];
    }
}
exports.MultiLineTextInputService = MultiLineTextInputService;
class MultiLineTextViewService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_MULTI_LINE_TEXT_VIEW; }
    getControlBlockName() { return 'GX_MULTI_LINE_TEXT_VIEW'; }
    getShortName() { return 'ml_text_view'; }
    typeSpecificFields() {
        return [
            { label: 'Text', path: 'string_id.0', kind: 'string_id' },
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Normal color', path: 'color_id.0', kind: 'color_id' },
        ];
    }
}
exports.MultiLineTextViewService = MultiLineTextViewService;
class RichTextViewService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_RICH_TEXT_VIEW; }
    getControlBlockName() { return 'GX_RICH_TEXT_VIEW'; }
    getShortName() { return 'rich_text_view'; }
    typeSpecificFields() {
        return [
            { label: 'Text', path: 'string_id.0', kind: 'string_id' },
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Bold font', path: 'font_id.1', kind: 'font_id' },
            { label: 'Italic font', path: 'font_id.2', kind: 'font_id' },
            { label: 'Bold-italic', path: 'font_id.3', kind: 'font_id' },
            { label: 'Normal color', path: 'color_id.0', kind: 'color_id' },
        ];
    }
}
exports.RichTextViewService = RichTextViewService;
class VerticalListService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_VERTICAL_LIST; }
    getControlBlockName() { return 'GX_VERTICAL_LIST'; }
    getShortName() { return 'vertical_list'; }
}
exports.VerticalListService = VerticalListService;
class HorizontalListService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_HORIZONTAL_LIST; }
    getControlBlockName() { return 'GX_HORIZONTAL_LIST'; }
    getShortName() { return 'horizontal_list'; }
}
exports.HorizontalListService = HorizontalListService;
class DropListService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_DROP_LIST; }
    getControlBlockName() { return 'GX_DROP_LIST'; }
    getShortName() { return 'drop_list'; }
    typeSpecificFields() {
        return [
            { label: 'Background pixelmap', path: 'pixelmap_id.0', kind: 'pixelmap_id' },
        ];
    }
}
exports.DropListService = DropListService;
class GenericScrollWheelService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_GENERIC_SCROLL_WHEEL; }
    getControlBlockName() { return 'GX_GENERIC_SCROLL_WHEEL'; }
    getShortName() { return 'generic_scroll_wheel'; }
}
exports.GenericScrollWheelService = GenericScrollWheelService;
class StringScrollWheelService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_STRING_SCROLL_WHEEL; }
    getControlBlockName() { return 'GX_STRING_SCROLL_WHEEL'; }
    getShortName() { return 'string_scroll_wheel'; }
    typeSpecificFields() {
        return [
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Selected font', path: 'font_id.1', kind: 'font_id' },
            { label: 'Normal color', path: 'color_id.0', kind: 'color_id' },
            { label: 'Selected color', path: 'color_id.1', kind: 'color_id' },
            { label: 'Selected fill color', path: 'color_id.4', kind: 'color_id' },
        ];
    }
}
exports.StringScrollWheelService = StringScrollWheelService;
class NumericScrollWheelService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_NUMERIC_SCROLL_WHEEL; }
    getControlBlockName() { return 'GX_NUMERIC_SCROLL_WHEEL'; }
    getShortName() { return 'numeric_scroll_wheel'; }
    typeSpecificFields() {
        return [
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Selected font', path: 'font_id.1', kind: 'font_id' },
            { label: 'Normal color', path: 'color_id.0', kind: 'color_id' },
            { label: 'Selected color', path: 'color_id.1', kind: 'color_id' },
        ];
    }
}
exports.NumericScrollWheelService = NumericScrollWheelService;
class TemplateService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_TEMPLATE; }
    getControlBlockName() { return 'GX_WIDGET'; }
    getShortName() { return 'template'; }
}
exports.TemplateService = TemplateService;
class HorizontalScrollbarService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_HORIZONTAL_SCROLL; }
    getControlBlockName() { return 'GX_SCROLLBAR'; }
    getShortName() { return 'hscroll'; }
    getResizeMode() { return gx_types_1.RESIZE_MODE_WIDTH; }
}
exports.HorizontalScrollbarService = HorizontalScrollbarService;
class VerticalScrollbarService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_VERTICAL_SCROLL; }
    getControlBlockName() { return 'GX_SCROLLBAR'; }
    getShortName() { return 'vscroll'; }
    getResizeMode() { return gx_types_1.RESIZE_MODE_HEIGHT; }
}
exports.VerticalScrollbarService = VerticalScrollbarService;
class SliderService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_SLIDER; }
    getControlBlockName() { return 'GX_SLIDER'; }
    getShortName() { return 'slider'; }
    typeSpecificFields() {
        return [
            { label: 'Normal color', path: 'color_id.0', kind: 'color_id' },
            { label: 'Selected color', path: 'color_id.1', kind: 'color_id' },
        ];
    }
}
exports.SliderService = SliderService;
class PixelmapSliderService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_PIXELMAP_SLIDER; }
    getControlBlockName() { return 'GX_PIXELMAP_SLIDER'; }
    getShortName() { return 'pixelmap_slider'; }
    typeSpecificFields() {
        return [
            { label: 'Lower pixelmap', path: 'pixelmap_id.0', kind: 'pixelmap_id' },
            { label: 'Upper pixelmap', path: 'pixelmap_id.1', kind: 'pixelmap_id' },
            { label: 'Needle pixelmap', path: 'pixelmap_id.2', kind: 'pixelmap_id' },
        ];
    }
}
exports.PixelmapSliderService = PixelmapSliderService;
class RadialSliderService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_RADIAL_SLIDER; }
    getControlBlockName() { return 'GX_RADIAL_SLIDER'; }
    getShortName() { return 'radial_slider'; }
    typeSpecificFields() {
        return [
            { label: 'Background pixelmap', path: 'pixelmap_id.0', kind: 'pixelmap_id' },
            { label: 'Needle pixelmap', path: 'pixelmap_id.1', kind: 'pixelmap_id' },
        ];
    }
}
exports.RadialSliderService = RadialSliderService;
class LineChartService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_LINE_CHART; }
    getControlBlockName() { return 'GX_LINE_CHART'; }
    getShortName() { return 'line_chart'; }
    typeSpecificFields() {
        return [
            { label: 'Background color', path: 'color_id.0', kind: 'color_id' },
            { label: 'Axis color', path: 'color_id.1', kind: 'color_id' },
            { label: 'Line color', path: 'color_id.2', kind: 'color_id' },
        ];
    }
}
exports.LineChartService = LineChartService;
class MenuService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_MENU; }
    getControlBlockName() { return 'GX_MENU'; }
    getShortName() { return 'menu'; }
    typeSpecificFields() {
        return [
            { label: 'Text', path: 'string_id.0', kind: 'string_id' },
            { label: 'Normal font', path: 'font_id.0', kind: 'font_id' },
            { label: 'Normal color', path: 'color_id.0', kind: 'color_id' },
            { label: 'Fill color', path: 'color_id.3', kind: 'color_id' },
        ];
    }
}
exports.MenuService = MenuService;
class AccordionMenuService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_ACCORDION_MENU; }
    getControlBlockName() { return 'GX_ACCORDION_MENU'; }
    getShortName() { return 'accordion_menu'; }
}
exports.AccordionMenuService = AccordionMenuService;
class TreeViewService extends WidgetService {
    getType() { return gx_types_1.GX_TYPE_TREE_VIEW; }
    getControlBlockName() { return 'GX_TREE_VIEW'; }
    getShortName() { return 'tree_view'; }
    typeSpecificFields() {
        return [
            { label: 'Root pixelmap', path: 'pixelmap_id.0', kind: 'pixelmap_id' },
            { label: 'Expanded pixelmap', path: 'pixelmap_id.1', kind: 'pixelmap_id' },
            { label: 'Collapsed pixelmap', path: 'pixelmap_id.2', kind: 'pixelmap_id' },
        ];
    }
}
exports.TreeViewService = TreeViewService;


/***/ }),
/* 107 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * StringTable — per-display multi-language string management.
 *
 * Ports guix_studio/string_table.cpp.
 *
 * The string table is stored in DisplayInfo.string_entries[].  This class
 * provides helper operations on top of that array:
 *   - Add / remove / find strings by ID name
 *   - Add / remove languages
 *   - Import from XLIFF / CSV (delegates to xliff-rw / csv-rw)
 *   - Generate the FontCharMap used by font subsetting
 *
 * NOTE: this class mutates DisplayInfo in place — callers are responsible for
 * wrapping mutations in UndoManager commands if undo/redo is required.
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StringTable = void 0;
const inversify_1 = __webpack_require__(2);
// ---------------------------------------------------------------------------
// StringTable
// ---------------------------------------------------------------------------
let StringTable = class StringTable {
    // ── Add / remove ─────────────────────────────────────────────────────────
    /**
     * Add a new empty string entry and return its 1-based string_id.
     * If a string with `idName` already exists, returns its existing id.
     */
    addString(disp, idName, numLanguages) {
        const existing = this.findByIdName(disp, idName);
        if (existing)
            return existing.string_id;
        const nextId = disp.string_entries.length + 1; // 1-based
        const entry = {
            string_id: nextId,
            name: idName,
            translations: Array(numLanguages).fill(''),
        };
        disp.string_entries.push(entry);
        return nextId;
    }
    /**
     * Remove a string entry by id name.
     * Returns true if found and removed.
     */
    removeString(disp, idName) {
        const idx = disp.string_entries.findIndex(e => e.name === idName);
        if (idx < 0)
            return false;
        disp.string_entries.splice(idx, 1);
        // Re-number remaining entries to keep IDs contiguous
        for (let i = idx; i < disp.string_entries.length; i++) {
            disp.string_entries[i].string_id = i + 1;
        }
        return true;
    }
    /**
     * Set the translation for one string + language.
     * Returns false if the entry or language index doesn't exist.
     */
    setTranslation(disp, idName, langIdx, text) {
        const entry = this.findByIdName(disp, idName);
        if (!entry)
            return false;
        if (langIdx < 0 || langIdx >= entry.translations.length)
            return false;
        entry.translations[langIdx] = text;
        return true;
    }
    /**
     * Find a string entry by its resource ID name.
     */
    findByIdName(disp, idName) {
        return disp.string_entries.find(e => e.name === idName);
    }
    /**
     * Find a string entry by its 1-based numeric string_id.
     */
    findById(disp, stringId) {
        return disp.string_entries.find(e => e.string_id === stringId);
    }
    // ── Language operations ───────────────────────────────────────────────────
    /**
     * Append a new language column (empty translations) to every string entry.
     */
    addLanguage(disp) {
        for (const entry of disp.string_entries) {
            entry.translations.push('');
        }
    }
    /**
     * Remove language at `langIdx` from every string entry.
     */
    removeLanguage(disp, langIdx) {
        for (const entry of disp.string_entries) {
            entry.translations.splice(langIdx, 1);
        }
    }
    // ── Bulk import (from xliff-rw / csv-rw) ─────────────────────────────────
    /**
     * Merge an array of imported records into the table.
     *
     * `records` is `[{ idName, translations: string[] }]` — keyed by ID name,
     * translations indexed by language.  New strings are added; existing
     * strings have their translations updated column-by-column.
     *
     * @param srcLangIdx  Source language column in `records.translations`
     * @param dstLangIdx  Destination language column in disp.string_entries
     */
    importRecords(disp, records, srcLangIdx, dstLangIdx, numLanguages) {
        for (const rec of records) {
            let entry = this.findByIdName(disp, rec.idName);
            if (!entry) {
                this.addString(disp, rec.idName, numLanguages);
                entry = this.findByIdName(disp, rec.idName);
            }
            const text = rec.translations[srcLangIdx] ?? '';
            while (entry.translations.length <= dstLangIdx) {
                entry.translations.push('');
            }
            entry.translations[dstLangIdx] = text;
        }
    }
    // ── Font character map ────────────────────────────────────────────────────
    /**
     * Collect all unique Unicode code points used across all languages for
     * the given string IDs.  Used by font subsetting to determine which
     * glyphs need to be included.
     *
     * Returns a `Set<number>` of code points.
     */
    collectCodePoints(disp, stringIds) {
        const points = new Set();
        const idSet = new Set(stringIds);
        for (const entry of disp.string_entries) {
            if (!idSet.has(entry.string_id))
                continue;
            for (const text of entry.translations) {
                for (const char of text) {
                    points.add(char.codePointAt(0) ?? 0);
                }
            }
        }
        return points;
    }
    /**
     * Collect all code points for every string in the display (all languages).
     */
    collectAllCodePoints(disp) {
        const ids = disp.string_entries.map(e => e.string_id);
        return this.collectCodePoints(disp, ids);
    }
};
exports.StringTable = StringTable;
exports.StringTable = StringTable = __decorate([
    (0, inversify_1.injectable)()
], StringTable);


/***/ }),
/* 108 */
/***/ ((__unused_webpack_module, exports) => {

"use strict";

/**
 * Dependency injection tokens for the GUIX Studio extension.
 * All DI symbols are exported from this single file so that every injector
 * site imports from one canonical location.
 *
 * Pattern: export const <ServiceName>Token = Symbol('<ServiceName>');
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LoggerToken = exports.WidgetRegistryToken = exports.StringTableToken = exports.BinaryResourceGeneratorToken = exports.ResourceGeneratorToken = exports.ScreenGeneratorToken = exports.ScreenFlowEditorToken = exports.ProjectViewToken = exports.ResourcePanelToken = exports.PropertyPanelToken = exports.SelectionManagerToken = exports.SnapEngineToken = exports.CanvasControllerToken = exports.ProjectModelToken = exports.UndoManagerToken = exports.GxpWriterToken = exports.GxpReaderToken = void 0;
exports.GxpReaderToken = Symbol('GxpReader');
exports.GxpWriterToken = Symbol('GxpWriter');
exports.UndoManagerToken = Symbol('UndoManager');
exports.ProjectModelToken = Symbol('ProjectModel');
exports.CanvasControllerToken = Symbol('CanvasController');
exports.SnapEngineToken = Symbol.for('SnapEngine');
exports.SelectionManagerToken = Symbol.for('SelectionManager');
exports.PropertyPanelToken = Symbol('PropertyPanel');
exports.ResourcePanelToken = Symbol('ResourcePanel');
exports.ProjectViewToken = Symbol('ProjectView');
exports.ScreenFlowEditorToken = Symbol('ScreenFlowEditor');
exports.ScreenGeneratorToken = Symbol('ScreenGenerator');
exports.ResourceGeneratorToken = Symbol('ResourceGenerator');
exports.BinaryResourceGeneratorToken = Symbol('BinaryResourceGenerator');
exports.StringTableToken = Symbol('StringTable');
exports.WidgetRegistryToken = Symbol('WidgetRegistry');
exports.LoggerToken = Symbol('Logger');


/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__(0);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=extension.js.map