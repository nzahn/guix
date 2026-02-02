import * as vscode from 'vscode';

import {
	applyGxpEdit,
	LATEST_GXP_VERSION,
	parseGxp,
	type GxpEditOperation,
	type GxpProject,
} from './gxpModel';

type DesignerCommand = 'exportStringsCsv' | 'importStringsCsv' | 'exportXliff' | 'importXliff';

type WebviewToExtensionMessage =
	| { type: 'ready' }
	| { type: 'edit'; op: GxpEditOperation }
	| { type: 'editBatch'; ops: GxpEditOperation[] }
	| { type: 'undo' }
	| { type: 'redo' }
	| { type: 'migrate' }
	| { type: 'command'; command: DesignerCommand };

type ExtensionToWebviewMessage =
	| { type: 'init'; project: GxpProject; readOnly: boolean; reason?: string }
	| { type: 'update'; project: GxpProject; readOnly: boolean; reason?: string }
	| { type: 'error'; message: string };

function replaceDocumentText(document: vscode.TextDocument, newText: string): vscode.WorkspaceEdit {
	const edit = new vscode.WorkspaceEdit();
	const wholeRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
	edit.replace(document.uri, wholeRange, newText);
	return edit;
}

function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n));
}

function sanitizeRectEdit(op: Extract<GxpEditOperation, { kind: 'setRect' }>, project: GxpProject): GxpEditOperation {
	const display = project.displays.find((d) => d.index === op.displayIndex);
	if (!display) return op;
	const xMax = Math.max(0, display.xres - 1);
	const yMax = Math.max(0, display.yres - 1);
	const left = clamp(op.rect.left, 0, xMax);
	const top = clamp(op.rect.top, 0, yMax);
	const right = clamp(op.rect.right, 0, xMax);
	const bottom = clamp(op.rect.bottom, 0, yMax);
	return { ...op, rect: { left, top, right, bottom } };
}

export class GxpDesignerEditorProvider implements vscode.CustomTextEditorProvider {
	public static readonly viewType = 'guixStudio.gxpDesigner';

	constructor(private readonly context: vscode.ExtensionContext) {}

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new GxpDesignerEditorProvider(context);
		return vscode.window.registerCustomEditorProvider(GxpDesignerEditorProvider.viewType, provider, {
			webviewOptions: { retainContextWhenHidden: true },
			supportsMultipleEditorsPerDocument: false,
		});
	}

	async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		};

		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		const postProject = (type: 'init' | 'update') => {
			let project: GxpProject;
			try {
				project = parseGxp(document.getText());
			} catch (err) {
				void webviewPanel.webview.postMessage({
					type: 'error',
					message: err instanceof Error ? err.message : String(err),
				} satisfies ExtensionToWebviewMessage);
				return;
			}

			const isLegacy = project.projectVersion > 0 && project.projectVersion < LATEST_GXP_VERSION;
			const reason = isLegacy
				? `Project version ${project.projectVersion} is older than latest (${LATEST_GXP_VERSION}). Opened read-only.`
				: undefined;
			void webviewPanel.webview.postMessage({
				type,
				project,
				readOnly: isLegacy,
				reason,
			} satisfies ExtensionToWebviewMessage);
		};

		await new Promise<void>((resolve) => {
			const sub = webviewPanel.webview.onDidReceiveMessage((m: WebviewToExtensionMessage) => {
				if (m?.type === 'ready') {
					sub.dispose();
					resolve();
				}
			});
		});

		postProject('init');

		const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() === document.uri.toString()) {
				postProject('update');
			}
		});
		webviewPanel.onDidDispose(() => changeSub.dispose());

		webviewPanel.webview.onDidReceiveMessage(async (m: WebviewToExtensionMessage) => {
			if (!m || typeof m !== 'object') return;
			if (m.type === 'undo') {
				await vscode.commands.executeCommand('undo');
				return;
			}
			if (m.type === 'redo') {
				await vscode.commands.executeCommand('redo');
				return;
			}
			if (m.type === 'migrate') {
				await vscode.commands.executeCommand('guix.migrateProject', document.uri.fsPath);
				return;
			}
			if (m.type === 'command') {
				const map: Record<DesignerCommand, string> = {
					exportStringsCsv: 'guix.exportStringsCsv',
					importStringsCsv: 'guix.importStringsCsv',
					exportXliff: 'guix.exportXliff',
					importXliff: 'guix.importXliff',
				};
				const cmd = map[m.command];
				await vscode.commands.executeCommand(cmd, document.uri.fsPath);
				return;
			}
			if (m.type !== 'edit' && m.type !== 'editBatch') return;

			let project: GxpProject;
			try {
				project = parseGxp(document.getText());
			} catch (err) {
				void webviewPanel.webview.postMessage({
					type: 'error',
					message: err instanceof Error ? err.message : String(err),
				} satisfies ExtensionToWebviewMessage);
				return;
			}

			const isLegacy = project.projectVersion > 0 && project.projectVersion < LATEST_GXP_VERSION;
			if (isLegacy) {
				void vscode.window.showWarningMessage('This project is legacy; migrate before editing.');
				return;
			}

			const ops: GxpEditOperation[] =
				m.type === 'editBatch'
					? Array.isArray(m.ops)
						? m.ops
						: []
					: [m.op];

			let updatedText = document.getText();
			try {
				for (const rawOp of ops) {
					let op: GxpEditOperation = rawOp;
					if (op.kind === 'setRect') {
						op = sanitizeRectEdit(op, project);
					}
					updatedText = applyGxpEdit(updatedText, op);
				}
			} catch (err) {
				void webviewPanel.webview.postMessage({
					type: 'error',
					message: err instanceof Error ? err.message : String(err),
				} satisfies ExtensionToWebviewMessage);
				return;
			}

			await vscode.workspace.applyEdit(replaceDocumentText(document, updatedText));
		});
	}

	private getHtmlForWebview(webview: vscode.Webview): string {
		const nonce = String(Date.now());
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>GUIX Designer (Preview)</title>
	<style>
		:root {
			--bg: #1e1e1e;
			--panel: #252526;
			--border: #3c3c3c;
			--fg: #d4d4d4;
			--muted: #9da0a6;
			--accent: #4fc1ff;
			--danger: #f48771;
		}
		html, body { height: 100%; }
		body {
			margin: 0;
			background: var(--bg);
			color: var(--fg);
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
			font-size: 13px;
		}
		#root { height: 100%; display: flex; flex-direction: column; }
		#banner {
			display: none;
			padding: 8px 10px;
			border-bottom: 1px solid var(--border);
			background: #2d2d30;
		}
		#banner .row { display: flex; align-items: center; gap: 10px; }
		#banner .msg { flex: 1; color: var(--muted); }
		button {
			background: #0e639c;
			border: 1px solid #0e639c;
			color: white;
			padding: 5px 8px;
			border-radius: 4px;
			cursor: pointer;
		}
		button.secondary { background: transparent; border: 1px solid var(--border); color: var(--fg); }
		button.secondary.active { border-color: var(--accent); color: var(--accent); background: rgba(79,193,255,0.10); }
		button.danger { background: transparent; border: 1px solid var(--danger); color: var(--danger); }
		button:disabled { opacity: 0.4; cursor: default; }
		select {
			background: #1f1f1f;
			border: 1px solid var(--border);
			color: var(--fg);
			padding: 4px 6px;
			border-radius: 4px;
		}
		#main { flex: 1; display: grid; grid-template-columns: 280px 1fr 360px; min-height: 0; }
		.panel { border-right: 1px solid var(--border); background: var(--panel); min-height: 0; display: flex; flex-direction: column; }
		.panel:last-child { border-right: none; border-left: 1px solid var(--border); }
		.panel-header { padding: 8px 10px; border-bottom: 1px solid var(--border); color: var(--muted); display:flex; align-items:center; gap:8px; }
		.panel-body { padding: 8px; overflow: auto; }
		.tree-item { padding: 3px 6px; border-radius: 4px; cursor: pointer; user-select: none; }
		.tree-item:hover { background: rgba(255,255,255,0.06); }
		.tree-item.selected { outline: 1px solid var(--accent); background: rgba(79,193,255,0.12); }
		.tree-item .meta { color: var(--muted); margin-left: 6px; }
		.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
		.kv { display: grid; grid-template-columns: 90px 1fr; gap: 6px 8px; align-items: center; }
		input {
			width: 100%;
			background: #1f1f1f;
			border: 1px solid var(--border);
			color: var(--fg);
			padding: 5px 6px;
			border-radius: 4px;
		}
		input.warn { border-color: var(--danger) !important; color: var(--danger) !important; }
		input.small {
			width: 64px;
			padding: 4px 6px;
			font-size: 12px;
		}
		canvas { width: 100%; height: 100%; background: #1b1b1b; display:block; }
		#canvasWrap { position: relative; height: 100%; }
		#hint { color: var(--muted); padding: 6px 10px; border-top: 1px solid var(--border); }
	</style>
</head>
<body>
	<div id="root">
		<div id="banner">
			<div class="row">
				<div class="msg" id="bannerMsg"></div>
				<button id="migrateBtn">Migrate…</button>
			</div>
		</div>
		<div id="main">
			<div class="panel">
				<div class="panel-header">Widgets</div>
				<div class="panel-body" id="tree"></div>
			</div>
			<div class="panel" style="border-right:none;">
				<div class="panel-header">
					<span id="canvasTitle">Canvas</span>
					<select id="displaySel" title="Active display"></select>
					<select id="themeSel" title="Active theme"></select>
					<select id="languageSel" title="Active language"></select>
					<select id="stringsActionSel" title="Strings import/export actions">
						<option value="exportStringsCsv">Strings: Export CSV</option>
						<option value="importStringsCsv">Strings: Import CSV</option>
						<option value="exportXliff">Strings: Export XLIFF</option>
						<option value="importXliff">Strings: Import XLIFF</option>
					</select>
					<button class="secondary" id="stringsRunBtn" title="Run selected strings action">Run</button>
					<button class="secondary" id="addRootBtn" title="Add a new root widget (screen/window)">Add Screen</button>
					<button class="secondary" id="deleteRootBtn" title="Delete selected root widget (screen/window)">Delete Screen</button>
					<button class="secondary" id="gridBtn" title="Toggle grid overlay">Grid</button>
					<input class="small" id="gridSpacing" title="Grid spacing (px)" value="10" />
					<button class="secondary" id="snapBtn" title="Snap moves to grid">Snap</button>
					<input class="small" id="snapSpacing" title="Snap spacing (px)" value="10" />
					<span style="flex:1"></span>
					<button class="secondary" id="zoomFitBtn">Fit</button>
				</div>
				<div class="panel-body" style="padding:0;">
					<div id="canvasWrap"><canvas id="c"></canvas></div>
				</div>
				<div id="hint">Click to select. Drag to move. Drag edges/corners to resize. Wheel to zoom. Alt+drag / middle-drag to pan. Arrow keys nudge (Shift = 10×). Delete removes selection. Esc clears selection.</div>
			</div>
			<div class="panel">
				<div class="panel-header">Properties</div>
				<div class="panel-body">
					<div class="kv">
						<div>Name</div>
						<input id="name" />
						<div>Type</div>
						<input id="type" disabled />
						<div>Fill</div>
						<select id="normalFill"></select>
						<div>Sel Fill</div>
						<select id="selectedFill"></select>
						<div>Dis Fill</div>
						<select id="disabledFill"></select>
						<div>Text</div>
						<select id="normalText"></select>
						<div>Sel Text</div>
						<select id="selectedText"></select>
						<div>Dis Text</div>
						<select id="disabledText"></select>
						<div>Font</div>
						<select id="fontId"></select>
						<div>Pixelmap</div>
						<select id="normalMapId"></select>
						<div>String</div>
						<select id="stringId"></select>
						<div></div>
						<button class="secondary" id="newStringBtn" title="Create a new string_id, assign it to the widget, and set the current language value">New string…</button>
						<div></div>
						<button class="secondary" id="createStringBtn" title="Create/extend a string_record for the selected string_id">Create/extend string_record</button>
						<div>Str Preview</div>
						<input id="stringPreview" disabled />
						<div></div>
						<div id="stringPreviewHint" style="color:var(--muted); font-size:12px; margin-top:-2px;"></div>
						<div>Str Value</div>
						<input id="stringValue" />
						<div></div>
						<button class="secondary" id="setStringValueBtn" title="Set the string_table value for the current language">Set value</button>
						<div>Left</div>
						<input id="left" />
						<div>Top</div>
						<input id="top" />
						<div>Right</div>
						<input id="right" />
						<div>Bottom</div>
						<input id="bottom" />
					</div>
					<div style="height:10px"></div>
					<div class="row">
						<button id="applyBtn">Apply</button>
						<button class="secondary" id="moveUpBtn">Back</button>
						<button class="secondary" id="moveDownBtn">Front</button>
						<button class="secondary" id="addChildBtn">Add Child</button>
						<button class="secondary" id="addSiblingBtn">Add Sibling</button>
						<button class="secondary" id="duplicateBtn">Duplicate</button>
						<button class="danger" id="deleteBtn">Delete</button>
					</div>
					<div style="height:10px"></div>
					<div id="status" style="color:var(--muted)"></div>
					<div id="propsWarning" style="color:var(--danger); display:none"></div>
				</div>
			</div>
		</div>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		let model = null;
		let readOnly = false;
		let selection = null; // { displayIndex, path }
		let pendingSelection = null; // { displayIndex, path }
		let drag = null;
		let resize = null;
		let pan = null;
		let pendingRectCommit = null; // { timer, displayIndex, path, rect }
		let currentDisplayIndex = null;
		let currentThemeIndex = 0;
		let currentLanguageIndex = 0;
		let view = { scale: 1, offsetX: 0, offsetY: 0 };
		let showGrid = false;
		let snapToGrid = false;
		let gridSpacing = 10;
		let snapSpacing = 10;
		let spacingLoadedFromProject = false;
		let propsDirty = false;
		let propsSelectionKey = '';
		let stringValueDirty = false;
		let stringValueKey = '';

		const elTree = document.getElementById('tree');
		const elBanner = document.getElementById('banner');
		const elBannerMsg = document.getElementById('bannerMsg');
		const elMigrateBtn = document.getElementById('migrateBtn');
		const elCanvas = document.getElementById('c');
		const ctx = elCanvas.getContext('2d');
		const elStatus = document.getElementById('status');
		const elPropsWarning = document.getElementById('propsWarning');
		const elDisplaySel = document.getElementById('displaySel');
		const elThemeSel = document.getElementById('themeSel');
		const elLanguageSel = document.getElementById('languageSel');
			const elStringsActionSel = document.getElementById('stringsActionSel');
			const elStringsRunBtn = document.getElementById('stringsRunBtn');
		const elAddRoot = document.getElementById('addRootBtn');
		const elDeleteRoot = document.getElementById('deleteRootBtn');
		const elGridBtn = document.getElementById('gridBtn');
		const elGridSpacing = document.getElementById('gridSpacing');
		const elSnapBtn = document.getElementById('snapBtn');
		const elSnapSpacing = document.getElementById('snapSpacing');

			function isImportCommand(cmd) {
				return cmd === 'importStringsCsv' || cmd === 'importXliff';
			}

			function updateStringsActionsUi() {
				if (!elStringsActionSel || !elStringsRunBtn) return;
				const cmd = String(elStringsActionSel.value || '');
				const disabled = !cmd || (readOnly && isImportCommand(cmd));
				elStringsRunBtn.disabled = !!disabled;
				elStringsRunBtn.title = !cmd
					? 'Select a strings action'
					: disabled
						? 'This project is read-only (legacy). Migrate before importing.'
						: 'Run selected strings action';
			}

			function runSelectedStringsAction() {
				if (!elStringsActionSel) return;
				const cmd = String(elStringsActionSel.value || '');
				if (!cmd) return;
				if (readOnly && isImportCommand(cmd)) {
					window.alert('This project is read-only (legacy). Migrate before importing.');
					return;
				}
				vscode.postMessage({ type: 'command', command: cmd });
			}

		const elName = document.getElementById('name');
		const elType = document.getElementById('type');
		const elNormalFill = document.getElementById('normalFill');
		const elSelectedFill = document.getElementById('selectedFill');
		const elDisabledFill = document.getElementById('disabledFill');
		const elNormalText = document.getElementById('normalText');
		const elSelectedText = document.getElementById('selectedText');
		const elDisabledText = document.getElementById('disabledText');
		const elFontId = document.getElementById('fontId');
		const elNormalMapId = document.getElementById('normalMapId');
		const elStringId = document.getElementById('stringId');
		const elNewStringBtn = document.getElementById('newStringBtn');
		const elCreateStringBtn = document.getElementById('createStringBtn');
		const elStringPreview = document.getElementById('stringPreview');
		const elStringPreviewHint = document.getElementById('stringPreviewHint');
		const elStringValue = document.getElementById('stringValue');
		const elSetStringValueBtn = document.getElementById('setStringValueBtn');
		const elLeft = document.getElementById('left');
		const elTop = document.getElementById('top');
		const elRight = document.getElementById('right');
		const elBottom = document.getElementById('bottom');
		const elApply = document.getElementById('applyBtn');
		const elMoveUp = document.getElementById('moveUpBtn');
		const elMoveDown = document.getElementById('moveDownBtn');
		const elAddChild = document.getElementById('addChildBtn');
		const elAddSibling = document.getElementById('addSiblingBtn');
		const elDuplicate = document.getElementById('duplicateBtn');
		const elDelete = document.getElementById('deleteBtn');
		const elZoomFit = document.getElementById('zoomFitBtn');

		function setStatus(s) { elStatus.textContent = s || ''; }
		function setPropsWarning(s) {
			if (!elPropsWarning) return;
			const msg = String(s || '').trim();
			elPropsWarning.textContent = msg;
			elPropsWarning.style.display = msg ? 'block' : 'none';
		}
		function asInt(v, fallback) {
			const n = parseInt(String(v || ''), 10);
			return Number.isFinite(n) ? n : fallback;
		}
		function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
		function snap(n) {
			if (!snapToGrid) return n;
			const s = Math.max(1, snapSpacing | 0);
			return Math.round(n / s) * s;
		}
		function updateToggleButton(el, on) {
			if (!el) return;
			if (on) el.classList.add('active');
			else el.classList.remove('active');
		}
		function cancelPendingRectCommit() {
			if (pendingRectCommit && pendingRectCommit.timer) {
				clearTimeout(pendingRectCommit.timer);
			}
			pendingRectCommit = null;
		}
		function scheduleRectCommit(displayIndex, path, rect) {
			cancelPendingRectCommit();
			pendingRectCommit = {
				displayIndex,
				path: (path || []).slice(),
				rect,
				timer: setTimeout(() => {
					const p = pendingRectCommit;
					pendingRectCommit = null;
					if (!p) return;
					vscode.postMessage({
						type: 'edit',
						op: { kind: 'setRect', displayIndex: p.displayIndex, path: p.path, rect: p.rect },
					});
				}, 200),
			};
		}
		function arrayEq(a, b) {
			if (!a || !b || a.length !== b.length) return false;
			for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
			return true;
		}
		function getDisplay(idx) {
			if (!model) return null;
			for (const d of model.displays || []) if (d.index === idx) return d;
			return null;
		}
		function getCurrentDisplay() {
			if (!model || !model.displays || model.displays.length === 0) return null;
			if (currentDisplayIndex === null) return model.displays[0];
			return getDisplay(currentDisplayIndex) || model.displays[0];
		}
		function flattenWidgets(displayIndex, widgets, out) {
			for (const w of widgets || []) {
				out.push({ displayIndex, w });
				flattenWidgets(displayIndex, w.children || [], out);
			}
		}
		function findWidget(sel) {
			if (!model || !sel) return null;
			const d = getDisplay(sel.displayIndex);
			if (!d) return null;
			let node = null;
			function walk(list) {
				for (const w of list || []) {
					if (arrayEq(w.path, sel.path)) { node = w; return; }
					walk(w.children || []);
					if (node) return;
				}
			}
			walk(d.rootWidgets || []);
			return node;
		}
		function getAvailableColorNames() {
			const d = getCurrentDisplay();
			const idx = clamp(currentThemeIndex, 0, Math.max(0, ((d && d.themeResources && d.themeResources.length) ? (d.themeResources.length - 1) : 0)));
			const colors = d && d.themeResources && d.themeResources[idx] && d.themeResources[idx].colorNames && d.themeResources[idx].colorNames.length
				? d.themeResources[idx].colorNames
				: (d && d.colorNames && d.colorNames.length ? d.colorNames : ['CANVAS']);
			return colors.slice();
		}
		function getAvailableFontNames() {
			const d = getCurrentDisplay();
			const idx = clamp(currentThemeIndex, 0, Math.max(0, ((d && d.themeResources && d.themeResources.length) ? (d.themeResources.length - 1) : 0)));
			const fonts = d && d.themeResources && d.themeResources[idx] && d.themeResources[idx].fontNames && d.themeResources[idx].fontNames.length
				? d.themeResources[idx].fontNames
				: (d && d.fontNames && d.fontNames.length ? d.fontNames : ['SYSTEM']);
			return fonts.slice();
		}
		function getAvailablePixelmapNames() {
			const d = getCurrentDisplay();
			const idx = clamp(currentThemeIndex, 0, Math.max(0, ((d && d.themeResources && d.themeResources.length) ? (d.themeResources.length - 1) : 0)));
			const maps = d && d.themeResources && d.themeResources[idx] && d.themeResources[idx].pixelmapNames && d.themeResources[idx].pixelmapNames.length
				? d.themeResources[idx].pixelmapNames
				: (d && d.pixelmapNames && d.pixelmapNames.length ? d.pixelmapNames : []);
			return maps.slice();
		}
		function setSelectOptions(el, options, currentValue) {
			if (!el) return;
			el.innerHTML = '';
			const set = new Set(options);
			const cur = String(currentValue || '').trim();
			if (cur && !set.has(cur)) options = [cur].concat(options);
			for (const o of options) {
				const opt = document.createElement('option');
				opt.value = o;
				opt.textContent = o;
				el.appendChild(opt);
			}
			el.value = cur || (options[0] || '');
		}
		function setSelectOptionsAllowEmpty(el, options, currentValue) {
			if (!el) return;
			const cur = String(currentValue || '').trim();
			const opts = [''].concat(options || []);
			setSelectOptions(el, opts, cur);
		}
		function renderStringIdSelector(currentValue) {
			if (!elStringId) return;
			const cur = String(currentValue || '').trim();
			let ids = (model && model.stringIds && model.stringIds.length > 0) ? model.stringIds.slice() : [];
			ids.sort();
			// Ensure current value stays selectable even if missing from string_table.
			if (cur && ids.indexOf(cur) < 0) ids = [cur].concat(ids);
			elStringId.innerHTML = '';
			const empty = document.createElement('option');
			empty.value = '';
			empty.textContent = '';
			elStringId.appendChild(empty);
			for (const id of ids) {
				const opt = document.createElement('option');
				opt.value = String(id);
				opt.textContent = String(id);
				elStringId.appendChild(opt);
			}
			const custom = document.createElement('option');
			custom.value = '__custom__';
			custom.textContent = 'Custom…';
			elStringId.appendChild(custom);
			elStringId.value = cur;
			elStringId.setAttribute('data-prev', cur);
		}

		function renderDisplaySelector() {
			elDisplaySel.innerHTML = '';
			if (!model) return;
			for (const d of model.displays || []) {
				const opt = document.createElement('option');
				opt.value = String(d.index);
				opt.textContent = String(d.name) + ' (' + String(d.xres) + 'x' + String(d.yres) + ')';
				elDisplaySel.appendChild(opt);
			}
			const cur = getCurrentDisplay();
			if (cur) elDisplaySel.value = String(cur.index);
		}
		function renderThemeSelector() {
			if (!elThemeSel) return;
			elThemeSel.innerHTML = '';
			const d = getCurrentDisplay();
			if (!d) { elThemeSel.disabled = true; return; }
			const themes = (d.themes || []).length > 0 ? d.themes : ['(default)'];
			for (let i = 0; i < themes.length; i++) {
				const opt = document.createElement('option');
				opt.value = String(i);
				opt.textContent = themes[i];
				elThemeSel.appendChild(opt);
			}
			const idx = clamp(currentThemeIndex, 0, themes.length - 1);
			currentThemeIndex = idx;
			elThemeSel.value = String(idx);
			elThemeSel.disabled = themes.length <= 1;
		}
		function renderLanguageSelector() {
			if (!elLanguageSel) return;
			elLanguageSel.innerHTML = '';
			const langs = (model && model.languages && model.languages.length > 0) ? model.languages : ['English'];
			for (let i = 0; i < langs.length; i++) {
				const opt = document.createElement('option');
				opt.value = String(i);
				opt.textContent = langs[i];
				elLanguageSel.appendChild(opt);
			}
			const idx = clamp(currentLanguageIndex, 0, langs.length - 1);
			currentLanguageIndex = idx;
			elLanguageSel.value = String(idx);
			elLanguageSel.disabled = langs.length <= 1;
		}

		function setCurrentDisplay(idx) {
			currentDisplayIndex = idx;
			renderDisplaySelector();
			const d = getDisplay(idx);
			currentThemeIndex = d ? clamp(d.activeTheme || 0, 0, Math.max(0, ((d.themes || []).length - 1))) : 0;
			renderThemeSelector();
			if (!selection || selection.displayIndex !== idx) {
				if (d && d.rootWidgets && d.rootWidgets[0]) selection = { displayIndex: d.index, path: d.rootWidgets[0].path };
				else selection = null;
			}
			renderTree();
			fitToDisplay();
			updateProperties();
			draw();
		}

		function renderTree() {
			elTree.innerHTML = '';
			if (!model) return;
			const cur = getCurrentDisplay();
			const curIdx = cur ? cur.index : null;
			for (const d of model.displays || []) {
				const header = document.createElement('div');
				header.style.padding = '6px 6px 4px 6px';
				header.style.cursor = 'pointer';
				header.style.color = (curIdx !== null && curIdx === d.index) ? '#d4d4d4' : '#9da0a6';
				header.style.fontWeight = (curIdx !== null && curIdx === d.index) ? '600' : '400';
				header.textContent = String(d.name) + ' (' + String(d.xres) + 'x' + String(d.yres) + ')';
				header.addEventListener('click', () => setCurrentDisplay(d.index));
				elTree.appendChild(header);
				renderWidgetList(d.index, d.rootWidgets || [], 0);
			}
		}
		function renderWidgetList(displayIndex, list, depth) {
			for (const w of list || []) {
				const item = document.createElement('div');
				const isSel = selection && selection.displayIndex === displayIndex && arrayEq(selection.path, w.path);
				item.className = 'tree-item' + (isSel ? ' selected' : '');
				item.style.marginLeft = String(depth * 12) + 'px';
				item.textContent = w.name || '(unnamed)';
				const meta = document.createElement('span');
				meta.className = 'meta';
				meta.textContent = w.type ? ('<' + String(w.type) + '>') : '';
				item.appendChild(meta);
				item.addEventListener('click', () => selectWidget(displayIndex, w.path));
				elTree.appendChild(item);
				renderWidgetList(displayIndex, w.children || [], depth + 1);
			}
		}

		function resizeCanvasToDisplay() {
			const wrap = elCanvas.parentElement;
			const rect = wrap.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			elCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
			elCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}
		function fitToDisplay() {
			const d = getCurrentDisplay();
			if (!d) return;
			const wrap = elCanvas.parentElement;
			const rect = wrap.getBoundingClientRect();
			const sx = rect.width / Math.max(1, d.xres);
			const sy = rect.height / Math.max(1, d.yres);
			view.scale = Math.max(0.1, Math.min(sx, sy));
			view.offsetX = (rect.width - d.xres * view.scale) / 2;
			view.offsetY = (rect.height - d.yres * view.scale) / 2;
		}
		function toCanvasPt(clientX, clientY) {
			const r = elCanvas.getBoundingClientRect();
			const x = (clientX - r.left - view.offsetX) / view.scale;
			const y = (clientY - r.top - view.offsetY) / view.scale;
			return { x, y };
		}
		function clampRectToDisplay(rect, display) {
			const xMax = Math.max(0, (display && display.xres ? display.xres : 0) - 1);
			const yMax = Math.max(0, (display && display.yres ? display.yres : 0) - 1);
			return {
				left: clamp(rect.left, 0, xMax),
				top: clamp(rect.top, 0, yMax),
				right: clamp(rect.right, 0, xMax),
				bottom: clamp(rect.bottom, 0, yMax),
			};
		}
		function normalizeRect(rect) {
			let left = rect.left, right = rect.right, top = rect.top, bottom = rect.bottom;
			if (left > right) { const t = left; left = right; right = t; }
			if (top > bottom) { const t = top; top = bottom; bottom = t; }
			// enforce min size 1x1 pixels in GUIX terms (inclusive rect)
			if (right < left) right = left;
			if (bottom < top) bottom = top;
			return { left, top, right, bottom };
		}
		function getResizeHandle(pt, rect) {
			// Hit-test in world coords with tolerance in screen pixels.
			const tol = 6 / Math.max(0.0001, view.scale);
			const nearLeft = Math.abs(pt.x - rect.left) <= tol;
			const nearRight = Math.abs(pt.x - rect.right) <= tol;
			const nearTop = Math.abs(pt.y - rect.top) <= tol;
			const nearBottom = Math.abs(pt.y - rect.bottom) <= tol;
			const insideX = pt.x >= rect.left - tol && pt.x <= rect.right + tol;
			const insideY = pt.y >= rect.top - tol && pt.y <= rect.bottom + tol;

			const left = nearLeft && insideY;
			const right = nearRight && insideY;
			const top = nearTop && insideX;
			const bottom = nearBottom && insideX;
			const any = left || right || top || bottom;
			if (!any) return null;
			return { left, right, top, bottom };
		}
		function cursorForHandle(h) {
			if (!h) return '';
			const lr = (h.left && h.right) ? 'both' : (h.left ? 'left' : (h.right ? 'right' : ''));
			const tb = (h.top && h.bottom) ? 'both' : (h.top ? 'top' : (h.bottom ? 'bottom' : ''));
			// corners
			if ((h.left && h.top) || (h.right && h.bottom)) return 'nwse-resize';
			if ((h.right && h.top) || (h.left && h.bottom)) return 'nesw-resize';
			if (h.left || h.right) return 'ew-resize';
			if (h.top || h.bottom) return 'ns-resize';
			return '';
		}
		function draw() {
			resizeCanvasToDisplay();
			ctx.clearRect(0, 0, elCanvas.width, elCanvas.height);
			const d = getCurrentDisplay();
			if (!d) return;
			ctx.save();
			ctx.translate(view.offsetX, view.offsetY);
			ctx.scale(view.scale, view.scale);
			ctx.strokeStyle = '#3c3c3c';
			ctx.lineWidth = 1 / view.scale;
			ctx.strokeRect(0, 0, d.xres, d.yres);
			if (showGrid) {
				const s = Math.max(1, gridSpacing | 0);
				ctx.strokeStyle = 'rgba(255,255,255,0.06)';
				ctx.lineWidth = 1 / view.scale;
				for (let x = 0; x <= d.xres; x += s) {
					ctx.beginPath();
					ctx.moveTo(x + 0.5, 0);
					ctx.lineTo(x + 0.5, d.yres);
					ctx.stroke();
				}
				for (let y = 0; y <= d.yres; y += s) {
					ctx.beginPath();
					ctx.moveTo(0, y + 0.5);
					ctx.lineTo(d.xres, y + 0.5);
					ctx.stroke();
				}
			}
			const flat = [];
			flattenWidgets(d.index, d.rootWidgets || [], flat);
			for (const item of flat) {
				const w = item.w;
				const r = w.rect;
				const isSel = selection && selection.displayIndex === item.displayIndex && arrayEq(selection.path, w.path);
				ctx.strokeStyle = isSel ? '#4fc1ff' : '#9da0a6';
				ctx.lineWidth = isSel ? (2 / view.scale) : (1 / view.scale);
				ctx.strokeRect(r.left, r.top, Math.max(0, r.right - r.left + 1), Math.max(0, r.bottom - r.top + 1));
				if (isSel) {
					// Resize handles
					const size = 6 / view.scale;
					ctx.fillStyle = '#4fc1ff';
					const pts = [
						{ x: r.left, y: r.top },
						{ x: r.right, y: r.top },
						{ x: r.left, y: r.bottom },
						{ x: r.right, y: r.bottom },
						{ x: (r.left + r.right) / 2, y: r.top },
						{ x: (r.left + r.right) / 2, y: r.bottom },
						{ x: r.left, y: (r.top + r.bottom) / 2 },
						{ x: r.right, y: (r.top + r.bottom) / 2 },
					];
					for (const p of pts) {
						ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
					}
				}
			}
			ctx.restore();
		}
		function pickWidgetAt(pt) {
			const d = getCurrentDisplay();
			if (!d) return null;
			const flat = [];
			flattenWidgets(d.index, d.rootWidgets || [], flat);
			for (let i = flat.length - 1; i >= 0; i--) {
				const it = flat[i];
				const r = it.w.rect;
				if (pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom) {
					return { displayIndex: it.displayIndex, path: it.w.path, rect: r };
				}
			}
			return null;
		}
		function selectWidget(displayIndex, path) {
			cancelPendingRectCommit();
			selection = { displayIndex, path };
			if (currentDisplayIndex !== displayIndex) {
				currentDisplayIndex = displayIndex;
				renderDisplaySelector();
			}
			renderTree();
			updateProperties();
			draw();
		}

		function updateBanner(reason) {
			if (readOnly) {
				elBanner.style.display = 'block';
				elBannerMsg.textContent = reason || 'Opened read-only.';
			} else {
				elBanner.style.display = 'none';
				elBannerMsg.textContent = '';
			}
			elMigrateBtn.disabled = false;
			if (elAddRoot) elAddRoot.disabled = !!readOnly;
			if (elDeleteRoot) elDeleteRoot.disabled = !!readOnly;
		}
		function findWidgetContext(sel) {
			if (!model || !sel) return null;
			const d = getDisplay(sel.displayIndex);
			if (!d) return null;
			let found = null;
			function walk(list, parentPath) {
				for (let i = 0; i < (list || []).length; i++) {
					const w = list[i];
					if (arrayEq(w.path, sel.path)) {
						found = {
							display: d,
							widget: w,
							siblings: list,
							index: i,
							parentPath,
						};
						return;
					}
					walk(w.children || [], w.path);
					if (found) return;
				}
			}
			walk(d.rootWidgets || [], null);
			return found;
		}
		function addRootToCurrentDisplay() {
			if (readOnly) return;
			const d = getCurrentDisplay();
			if (!d) return;
			cancelPendingRectCommit();
			const nextIndex = (d.rootWidgets || []).length;
			const defaultName = 'screen_' + String(nextIndex + 1);
			const name = window.prompt('New screen/root widget name:', defaultName);
			if (!name) return;
			pendingSelection = { displayIndex: d.index, path: [nextIndex] };
			vscode.postMessage({ type: 'edit', op: { kind: 'addRoot', displayIndex: d.index, name } });
		}
		function deleteSelectedRoot() {
			if (readOnly || !selection) return;
			if (!selection.path || selection.path.length !== 1) {
				window.alert('Select a root widget (screen) to delete.');
				return;
			}
			const d = getDisplay(selection.displayIndex);
			if (!d) return;
			const rootIndex = selection.path[0];
			const roots = d.rootWidgets || [];
			if (rootIndex < 0 || rootIndex >= roots.length) return;
			if (!window.confirm('Delete selected screen/root widget?')) return;
			cancelPendingRectCommit();
			const newCount = roots.length - 1;
			if (newCount <= 0) {
				pendingSelection = null;
			} else {
				const nextIdx = Math.min(rootIndex, newCount - 1);
				pendingSelection = { displayIndex: selection.displayIndex, path: [nextIdx] };
			}
			vscode.postMessage({ type: 'edit', op: { kind: 'deleteRoot', displayIndex: selection.displayIndex, rootIndex } });
		}
		function updateProperties() {
			const w = findWidget(selection);
			const selKey = selection ? (String(selection.displayIndex) + ':' + String((selection.path || []).join('.'))) : '';
			if (!w) {
				propsDirty = false;
				propsSelectionKey = '';
				stringValueDirty = false;
				stringValueKey = '';
				elName.value = '';
				elType.value = '';
				if (elNormalFill) elNormalFill.innerHTML = '';
				if (elSelectedFill) elSelectedFill.innerHTML = '';
				if (elDisabledFill) elDisabledFill.innerHTML = '';
				if (elNormalText) elNormalText.innerHTML = '';
				if (elSelectedText) elSelectedText.innerHTML = '';
				if (elDisabledText) elDisabledText.innerHTML = '';
				if (elFontId) elFontId.innerHTML = '';
				if (elNormalMapId) elNormalMapId.innerHTML = '';
				if (elStringId) elStringId.innerHTML = '';
				if (elNewStringBtn) elNewStringBtn.disabled = true;
				if (elCreateStringBtn) elCreateStringBtn.disabled = true;
				if (elStringPreview) { elStringPreview.value = ''; elStringPreview.classList.remove('warn'); }
				if (elStringPreviewHint) elStringPreviewHint.textContent = '';
				if (elStringValue) elStringValue.value = '';
				if (elStringValue) elStringValue.disabled = true;
				if (elSetStringValueBtn) elSetStringValueBtn.disabled = true;
				setPropsWarning('');
				elLeft.value = '';
				elTop.value = '';
				elRight.value = '';
				elBottom.value = '';
				elApply.disabled = true;
				elMoveUp.disabled = true;
				elMoveDown.disabled = true;
				elAddChild.disabled = true;
				if (elAddSibling) elAddSibling.disabled = true;
				if (elDuplicate) elDuplicate.disabled = true;
				elDelete.disabled = true;
				if (elDeleteRoot) elDeleteRoot.disabled = true;
				setStatus('');
				return;
			}
			const selectionChanged = selKey !== propsSelectionKey;
			if (selectionChanged) {
				propsDirty = false;
				propsSelectionKey = selKey;
			}
			elName.value = w.name || '';
			elType.value = w.type || '';
			const colors = getAvailableColorNames();
			if (!propsDirty) {
				elName.value = w.name || '';
				if (elStringId) renderStringIdSelector(w.stringId || '');
				elLeft.value = String(w.rect.left);
				elTop.value = String(w.rect.top);
				elRight.value = String(w.rect.right);
				elBottom.value = String(w.rect.bottom);
			}
			if (propsDirty && elStringId) {
				renderStringIdSelector(elStringId.value);
			}
			// String preview + missing-string warning.
			let sid = (propsDirty && elStringId) ? String(elStringId.value || '').trim() : String(w.stringId || '').trim();
			if (sid === '__custom__') sid = '';
			const rec = (model && model.stringTable) ? model.stringTable[sid] : null;
			const hasRecord = !!sid && !!rec;
			const hasAnyValue = hasRecord && rec.length > 0;
			const langs = (model && model.languages && model.languages.length > 0) ? model.languages : ['English'];
			const desiredVals = Math.max(1, langs.length || 1);
			const langIdx = clamp(currentLanguageIndex, 0, Math.max(0, langs.length - 1));
			const langName = String(langs[langIdx] ?? '');
			const missingTranslation = hasAnyValue && (currentLanguageIndex >= rec.length);
			const nextStringValueKey = sid ? (sid + '::' + String(currentLanguageIndex)) : '';
			if (nextStringValueKey !== stringValueKey) {
				stringValueDirty = false;
				stringValueKey = nextStringValueKey;
			}
			if (elStringPreview) {
				if (!sid) {
					elStringPreview.value = '';
					elStringPreview.classList.remove('warn');
				} else if (!hasRecord) {
					elStringPreview.value = '(not found)';
					elStringPreview.classList.add('warn');
				} else if (!hasAnyValue) {
					elStringPreview.value = '(empty)';
					elStringPreview.classList.add('warn');
				} else {
					const idx = clamp(currentLanguageIndex, 0, rec.length - 1);
					elStringPreview.value = String(rec[idx] ?? rec[0] ?? '');
					elStringPreview.classList.remove('warn');
				}
			}
			if (elStringPreviewHint) {
				if (!sid) {
					elStringPreviewHint.textContent = '';
				} else if (!hasRecord) {
					elStringPreviewHint.textContent = 'Missing string_record; setting a value will create it.';
				} else if (!hasAnyValue) {
					elStringPreviewHint.textContent = 'String_record has no values yet.';
				} else if (missingTranslation) {
					elStringPreviewHint.textContent = 'No translation for ' + (langName || 'current language') + '; preview shows a fallback.';
				} else {
					elStringPreviewHint.textContent = '';
				}
			}
			if (!sid) {
				setPropsWarning('');
			} else if (!hasRecord) {
				setPropsWarning('Warning: string_id not found in string_table: ' + sid + ' (will be created when you set a value)');
			} else if (!hasAnyValue) {
				setPropsWarning('Warning: string_id has no values (no <val> entries): ' + sid);
			} else if (missingTranslation) {
				setPropsWarning('Warning: missing translation for ' + langName + ' (string has ' + String(rec.length) + ' value(s))');
			} else {
				setPropsWarning('');
			}
			if (elStringValue) {
				if (!sid) {
					elStringValue.placeholder = 'Select a string_id (or use New string…)';
				} else if (!hasRecord) {
					elStringValue.placeholder = 'Set value to create string_record (' + (langName || 'current language') + ')';
				} else {
					elStringValue.placeholder = langName ? ('Value for ' + langName) : '';
				}
			}
			if (elStringValue && !stringValueDirty) {
				if (!sid || !hasRecord) {
					elStringValue.value = '';
				} else {
					const idx = clamp(currentLanguageIndex, 0, Math.max(0, rec.length - 1));
					elStringValue.value = String(rec[idx] ?? '');
				}
			}
			if (elSetStringValueBtn) {
				elSetStringValueBtn.disabled = !!readOnly || !sid;
				if (!sid) {
					elSetStringValueBtn.textContent = 'Set value';
					elSetStringValueBtn.title = 'Select or create a string_id first.';
				} else if (!hasRecord) {
					elSetStringValueBtn.textContent = 'Set value (create)';
					elSetStringValueBtn.title = 'Create string_record and set the value for the current language.';
				} else {
					elSetStringValueBtn.textContent = 'Set value';
					elSetStringValueBtn.title = 'Set the string_table value for the current language.';
				}
			}
			if (elCreateStringBtn) {
				const canEnsure = !readOnly && !!sid && (!hasRecord || (Array.isArray(rec) && rec.length < desiredVals));
				elCreateStringBtn.disabled = !canEnsure;
				elCreateStringBtn.textContent = !sid
					? 'Create/extend string_record'
					: (!hasRecord ? 'Create string_record' : (rec.length < desiredVals ? 'Extend translations' : 'Create/extend string_record'));
			}
			// Always refresh selector options, but preserve in-progress edits when dirty.
			setSelectOptions(elNormalFill, colors.slice(), propsDirty && elNormalFill ? elNormalFill.value : w.normalFillColor);
			setSelectOptions(elSelectedFill, colors.slice(), propsDirty && elSelectedFill ? elSelectedFill.value : w.selectedFillColor);
			setSelectOptions(elDisabledFill, colors.slice(), propsDirty && elDisabledFill ? elDisabledFill.value : w.disabledFillColor);
			setSelectOptions(elNormalText, colors.slice(), propsDirty && elNormalText ? elNormalText.value : w.normalTextColor);
			setSelectOptions(elSelectedText, colors.slice(), propsDirty && elSelectedText ? elSelectedText.value : w.selectedTextColor);
			setSelectOptions(elDisabledText, colors.slice(), propsDirty && elDisabledText ? elDisabledText.value : w.disabledTextColor);
			setSelectOptions(elFontId, getAvailableFontNames(), propsDirty && elFontId ? elFontId.value : (w.fontId || 'SYSTEM'));
			setSelectOptionsAllowEmpty(elNormalMapId, getAvailablePixelmapNames(), propsDirty && elNormalMapId ? elNormalMapId.value : (w.normalMapId || ''));
			const disabled = !!readOnly;
			elApply.disabled = disabled;
			elAddChild.disabled = disabled;
			elDelete.disabled = disabled;
			if (elNormalFill) elNormalFill.disabled = disabled;
			if (elSelectedFill) elSelectedFill.disabled = disabled;
			if (elDisabledFill) elDisabledFill.disabled = disabled;
			if (elNormalText) elNormalText.disabled = disabled;
			if (elSelectedText) elSelectedText.disabled = disabled;
			if (elDisabledText) elDisabledText.disabled = disabled;
			if (elFontId) elFontId.disabled = disabled;
			if (elNormalMapId) elNormalMapId.disabled = disabled;
			if (elStringId) elStringId.disabled = disabled;
			if (elStringValue) elStringValue.disabled = disabled || !sid;
			if (elDuplicate) elDuplicate.disabled = disabled;
			const ctx = findWidgetContext(selection);
			if (disabled || !ctx) {
				elMoveUp.disabled = true;
				elMoveDown.disabled = true;
			} else {
				const len = (ctx.siblings || []).length;
				elMoveUp.disabled = ctx.index <= 0;
				elMoveDown.disabled = ctx.index >= (len - 1);
			}
			if (elAddSibling) {
				// Root-level sibling creation is handled by "Add Screen".
				elAddSibling.disabled = disabled || !selection || !selection.path || selection.path.length === 1;
			}
			if (elDeleteRoot) {
				elDeleteRoot.disabled = disabled || !selection || !selection.path || selection.path.length !== 1;
			}
			const ver = model && model.projectVersion ? ('v' + String(model.projectVersion)) : '';
			setStatus((disabled ? 'Read-only' : 'Editable') + (ver ? (' • ' + ver) : ''));
		}

		function applyEditsFromProperties() {
			const w = findWidget(selection);
			if (!w || readOnly) return;
			cancelPendingRectCommit();
			propsDirty = false;
			const rect = {
				left: asInt(elLeft.value, w.rect.left),
				top: asInt(elTop.value, w.rect.top),
				right: asInt(elRight.value, w.rect.right),
				bottom: asInt(elBottom.value, w.rect.bottom),
			};
			vscode.postMessage({
				type: 'editBatch',
				ops: [
					{ kind: 'rename', displayIndex: selection.displayIndex, path: selection.path, name: elName.value },
					{
						kind: 'setFillColors',
						displayIndex: selection.displayIndex,
						path: selection.path,
						normalFillColor: elNormalFill ? elNormalFill.value : w.normalFillColor,
						selectedFillColor: elSelectedFill ? elSelectedFill.value : w.selectedFillColor,
						disabledFillColor: elDisabledFill ? elDisabledFill.value : w.disabledFillColor,
					},
					{
						kind: 'setTextColors',
						displayIndex: selection.displayIndex,
						path: selection.path,
						normalTextColor: elNormalText ? elNormalText.value : (w.normalTextColor || ''),
						selectedTextColor: elSelectedText ? elSelectedText.value : (w.selectedTextColor || ''),
						disabledTextColor: elDisabledText ? elDisabledText.value : (w.disabledTextColor || ''),
					},
					{ kind: 'setFontId', displayIndex: selection.displayIndex, path: selection.path, fontId: elFontId ? elFontId.value : (w.fontId || '') },
					{ kind: 'setNormalMapId', displayIndex: selection.displayIndex, path: selection.path, normalMapId: elNormalMapId ? elNormalMapId.value : (w.normalMapId || '') },
					{ kind: 'setStringId', displayIndex: selection.displayIndex, path: selection.path, stringId: (elStringId && elStringId.value !== '__custom__') ? elStringId.value : (w.stringId || '') },
					{ kind: 'setRect', displayIndex: selection.displayIndex, path: selection.path, rect: rect },
				],
			});
		}
		function deleteSelected() {
			if (!selection || readOnly) return;
			cancelPendingRectCommit();
			pendingSelection = null;
			const ctx = findWidgetContext(selection);
			if (ctx && ctx.siblings) {
				const siblingsLen = (ctx.siblings || []).length;
				const i = ctx.index;
				const newCount = siblingsLen - 1;
				if (newCount <= 0) {
					if (ctx.parentPath && ctx.parentPath.length > 0) {
						pendingSelection = { displayIndex: selection.displayIndex, path: ctx.parentPath.slice() };
					} else {
						pendingSelection = null;
					}
				} else {
					const nextIdx = Math.min(i, newCount - 1);
					pendingSelection = { displayIndex: selection.displayIndex, path: (selection.path || []).slice(0, -1).concat([nextIdx]) };
				}
			}
			vscode.postMessage({ type: 'edit', op: { kind: 'delete', displayIndex: selection.displayIndex, path: selection.path } });
		}
		function moveSelected(direction) {
			if (!selection || readOnly) return;
			cancelPendingRectCommit();
			pendingSelection = null;
			const ctx = findWidgetContext(selection);
			if (ctx && ctx.siblings) {
				const siblingsLen = (ctx.siblings || []).length;
				const i = ctx.index;
				const nextIdx = direction === 'up' ? i - 1 : i + 1;
				if (nextIdx < 0 || nextIdx >= siblingsLen) return;
				pendingSelection = { displayIndex: selection.displayIndex, path: (selection.path || []).slice(0, -1).concat([nextIdx]) };
			}
			vscode.postMessage({ type: 'edit', op: { kind: 'move', displayIndex: selection.displayIndex, path: selection.path, direction: direction } });
		}
		function addChildToSelected() {
			if (!selection || readOnly) return;
			cancelPendingRectCommit();
			const t = window.prompt('Widget type to add (e.g. text_button, prompt, window):', 'text_button');
			if (!t) return;
			vscode.postMessage({ type: 'edit', op: { kind: 'addChild', displayIndex: selection.displayIndex, path: selection.path, widgetType: t } });
		}
		function addSiblingToSelected() {
			if (!selection || readOnly) return;
			if (!selection.path || selection.path.length === 1) {
				window.alert('Use “Add Screen” to create a new root widget.');
				return;
			}
			cancelPendingRectCommit();
			const w = findWidget(selection);
			const defaultType = w && w.type ? w.type : 'text_button';
			const t = window.prompt('Sibling widget type (e.g. text_button, prompt, window):', defaultType);
			if (!t) return;
			const ctx = findWidgetContext(selection);
			if (ctx) {
				pendingSelection = { displayIndex: selection.displayIndex, path: (selection.path || []).slice(0, -1).concat([ctx.index + 1]) };
			}
			vscode.postMessage({ type: 'edit', op: { kind: 'addSibling', displayIndex: selection.displayIndex, path: selection.path, widgetType: t } });
		}
		function duplicateSelected() {
			if (!selection || readOnly) return;
			cancelPendingRectCommit();
			const ctx = findWidgetContext(selection);
			if (ctx) {
				pendingSelection = { displayIndex: selection.displayIndex, path: (selection.path || []).slice(0, -1).concat([ctx.index + 1]) };
			}
			vscode.postMessage({ type: 'edit', op: { kind: 'duplicate', displayIndex: selection.displayIndex, path: selection.path } });
		}
		function nudgeSelected(dx, dy) {
			if (!selection || readOnly) return;
			const w = findWidget(selection);
			if (!w) return;
			const rect = { left: w.rect.left + dx, top: w.rect.top + dy, right: w.rect.right + dx, bottom: w.rect.bottom + dy };
			w.rect = rect;
			updateProperties();
			draw();
			scheduleRectCommit(selection.displayIndex, selection.path, rect);
		}

		elApply.addEventListener('click', applyEditsFromProperties);
		// Mark Properties as dirty on edits so we don't clobber pending values during refresh.
		[elName, elNormalFill, elSelectedFill, elDisabledFill, elNormalText, elSelectedText, elDisabledText, elFontId, elNormalMapId, elStringId, elLeft, elTop, elRight, elBottom]
			.filter(Boolean)
			.forEach((el) => {
				el.addEventListener('input', () => { propsDirty = true; });
				el.addEventListener('change', () => { propsDirty = true; });
			});
		if (elStringId) {
			elStringId.addEventListener('change', () => {
				if (elStringId.value === '__custom__') {
					const prev = String(elStringId.getAttribute('data-prev') || '').trim();
					const next = window.prompt('Enter custom string_id:', prev);
					if (next === null) {
						elStringId.value = prev;
					} else {
						const trimmed = String(next).trim();
						renderStringIdSelector(trimmed);
						elStringId.value = trimmed;
					}
				}
				elStringId.setAttribute('data-prev', String(elStringId.value || '').trim());
				propsDirty = true;
				updateProperties();
			});
		}
		if (elStringValue) {
			elStringValue.addEventListener('input', () => { stringValueDirty = true; });
			elStringValue.addEventListener('change', () => { stringValueDirty = true; });
			elStringValue.addEventListener('keydown', (ev) => {
				if (ev.key !== 'Enter') return;
				if (readOnly) return;
				// Treat Enter as "Set value" for quick authoring.
				if (elSetStringValueBtn && !elSetStringValueBtn.disabled) {
					ev.preventDefault();
					elSetStringValueBtn.click();
				}
			});
		}
		if (elSetStringValueBtn) {
			elSetStringValueBtn.addEventListener('click', () => {
				if (readOnly || !selection) return;
				const w = findWidget(selection);
				if (!w) return;
				let sid = (propsDirty && elStringId) ? String(elStringId.value || '').trim() : String(w.stringId || '').trim();
				if (sid === '__custom__') sid = '';
				if (!sid) return;
				const value = elStringValue ? String(elStringValue.value ?? '') : '';
				const curSid = String(w.stringId || '').trim();
				stringValueDirty = false;
				const ops = [];
				// If the widget currently has no string_id, make this button a one-click authoring flow:
				// apply widget string_id + set the string_table value.
				if (!curSid) {
					ops.push({ kind: 'setStringId', displayIndex: selection.displayIndex, path: selection.path, stringId: sid });
				}
				ops.push({ kind: 'setStringTableValue', displayIndex: selection.displayIndex, stringId: sid, languageIndex: currentLanguageIndex, value });
				if (ops.length === 1) {
					vscode.postMessage({ type: 'edit', op: ops[0] });
				} else {
					vscode.postMessage({ type: 'editBatch', ops });
				}
			});
		}
		if (elNewStringBtn) {
			elNewStringBtn.addEventListener('click', () => {
				if (readOnly || !selection) return;
				const w = findWidget(selection);
				if (!w) return;

				const rawName = String(w.name || '').trim();
				const base = rawName
					? ('STR_' + rawName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
					: 'STR_NEW';
				const suggestedId = base.length > 0 ? base : 'STR_NEW';

				const idInput = window.prompt('Enter new string_id:', suggestedId);
				if (idInput === null) return;
				const sid = String(idInput).trim();
				if (!sid) return;
				const exists = !!(model && model.stringTable && model.stringTable[sid]);

				const langs = (model && model.languages && model.languages.length > 0) ? model.languages : ['English'];
				const idx = clamp(currentLanguageIndex, 0, Math.max(0, langs.length - 1));
				const langName = String(langs[idx] ?? '');
				if (exists) {
					const ok = window.confirm(
						'String_id already exists: ' + sid + '\n\n' +
						'Update the value for ' + (langName || 'current language') + '?' 
					);
					if (!ok) return;
				}
				let defaultValue = '';
				if (exists && model && model.stringTable && model.stringTable[sid]) {
					const rec = model.stringTable[sid];
					if (Array.isArray(rec) && rec.length > 0) {
						const vIdx = clamp(currentLanguageIndex, 0, Math.max(0, rec.length - 1));
						defaultValue = String(rec[vIdx] ?? '');
					}
				}
				const valueInput = window.prompt('Enter value for ' + (langName || 'current language') + ':', defaultValue);
				if (valueInput === null) return;
				const value = String(valueInput ?? '');

				stringValueDirty = false;
				vscode.postMessage({
					type: 'editBatch',
					ops: [
						{ kind: 'setStringId', displayIndex: selection.displayIndex, path: selection.path, stringId: sid },
						{ kind: 'setStringTableValue', displayIndex: selection.displayIndex, stringId: sid, languageIndex: currentLanguageIndex, value },
					],
				});
			});
		}
		elDelete.addEventListener('click', deleteSelected);
		elMoveUp.addEventListener('click', () => moveSelected('up'));
		elMoveDown.addEventListener('click', () => moveSelected('down'));
		elAddChild.addEventListener('click', addChildToSelected);
		if (elAddSibling) elAddSibling.addEventListener('click', addSiblingToSelected);
		if (elDuplicate) elDuplicate.addEventListener('click', duplicateSelected);
		if (elAddRoot) elAddRoot.addEventListener('click', addRootToCurrentDisplay);
		if (elDeleteRoot) elDeleteRoot.addEventListener('click', deleteSelectedRoot);
		elMigrateBtn.addEventListener('click', () => vscode.postMessage({ type: 'migrate' }));
		if (elStringsActionSel) elStringsActionSel.addEventListener('change', updateStringsActionsUi);
		if (elStringsRunBtn) elStringsRunBtn.addEventListener('click', runSelectedStringsAction);
		elZoomFit.addEventListener('click', () => { fitToDisplay(); draw(); });
		elDisplaySel.addEventListener('change', () => { setCurrentDisplay(asInt(elDisplaySel.value, 0)); });
		elGridBtn.addEventListener('click', () => {
			showGrid = !showGrid;
			updateToggleButton(elGridBtn, showGrid);
			draw();
			if (!readOnly) {
				const d = getCurrentDisplay();
				if (d) vscode.postMessage({ type: 'edit', op: { kind: 'setGridEnabled', displayIndex: d.index, enabled: !!showGrid } });
			}
		});
		elSnapBtn.addEventListener('click', () => {
			snapToGrid = !snapToGrid;
			updateToggleButton(elSnapBtn, snapToGrid);
			if (!readOnly) {
				const d = getCurrentDisplay();
				if (d) vscode.postMessage({ type: 'edit', op: { kind: 'setSnapEnabled', displayIndex: d.index, enabled: !!snapToGrid } });
			}
		});
		elGridSpacing.addEventListener('change', () => {
			gridSpacing = clamp(asInt(elGridSpacing.value, 10), 1, 256);
			elGridSpacing.value = String(gridSpacing);
			draw();
			if (!readOnly) {
				const d = getCurrentDisplay();
				if (d) vscode.postMessage({ type: 'edit', op: { kind: 'setGridSpacing', displayIndex: d.index, spacing: gridSpacing } });
			}
		});
		if (elSnapSpacing) {
			elSnapSpacing.addEventListener('change', () => {
				snapSpacing = clamp(asInt(elSnapSpacing.value, 10), 1, 256);
				elSnapSpacing.value = String(snapSpacing);
				if (!readOnly) {
					const d = getCurrentDisplay();
					if (d) vscode.postMessage({ type: 'edit', op: { kind: 'setSnapSpacing', displayIndex: d.index, spacing: snapSpacing } });
				}
			});
		}
		updateToggleButton(elGridBtn, showGrid);
		updateToggleButton(elSnapBtn, snapToGrid);
		gridSpacing = clamp(asInt(elGridSpacing.value, 10), 1, 256);
		elGridSpacing.value = String(gridSpacing);
		snapSpacing = clamp(asInt(elSnapSpacing ? elSnapSpacing.value : 10, 10), 1, 256);
		if (elSnapSpacing) elSnapSpacing.value = String(snapSpacing);
		if (elThemeSel) elThemeSel.addEventListener('change', () => {
			currentThemeIndex = asInt(elThemeSel.value, 0);
			const d = getCurrentDisplay();
			if (d && !readOnly) {
				vscode.postMessage({ type: 'edit', op: { kind: 'setActiveTheme', displayIndex: d.index, activeTheme: currentThemeIndex } });
			}
			updateProperties();
			draw();
		});
		if (elLanguageSel) elLanguageSel.addEventListener('change', () => {
			currentLanguageIndex = asInt(elLanguageSel.value, 0);
			updateProperties();
		});
		if (elCreateStringBtn) elCreateStringBtn.addEventListener('click', () => {
			if (readOnly) return;
			const w = findWidget(selection);
			if (!w) return;
			let sid = (propsDirty && elStringId) ? String(elStringId.value || '').trim() : String(w.stringId || '').trim();
			if (sid === '__custom__') sid = '';
			if (!sid) return;
			const langs = (model && model.languages && model.languages.length > 0) ? model.languages : ['English'];
			const desiredVals = Math.max(1, langs.length || 1);
			const rec = (model && model.stringTable) ? model.stringTable[sid] : null;
			if (rec && Array.isArray(rec) && rec.length >= desiredVals) return;
			vscode.postMessage({ type: 'edit', op: { kind: 'ensureStringRecord', displayIndex: selection.displayIndex, stringId: sid } });
		});

		elCanvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

		elCanvas.addEventListener('mousedown', (ev) => {
			if (ev.button === 1 || ev.button === 2 || ev.altKey) {
				pan = { startX: ev.clientX, startY: ev.clientY, startOffX: view.offsetX, startOffY: view.offsetY };
				return;
			}
			const pt = toCanvasPt(ev.clientX, ev.clientY);
			const hit = pickWidgetAt(pt);
			if (!hit) {
				cancelPendingRectCommit();
				selection = null;
				renderTree();
				updateProperties();
				draw();
				return;
			}
			selectWidget(hit.displayIndex, hit.path);
			if (readOnly) return;
			// If user grabbed a resize handle on the selected widget, start resize.
			const sel = selection && selection.displayIndex === hit.displayIndex && arrayEq(selection.path, hit.path);
			if (sel) {
				const h = getResizeHandle(pt, hit.rect);
				if (h) {
					resize = {
						handle: h,
						startPt: pt,
						startRect: { left: hit.rect.left, top: hit.rect.top, right: hit.rect.right, bottom: hit.rect.bottom },
					};
					return;
				}
			}
			drag = { startPt: pt, startRect: { left: hit.rect.left, top: hit.rect.top, right: hit.rect.right, bottom: hit.rect.bottom } };
		});
		window.addEventListener('mousemove', (ev) => {
			if (pan) {
				view.offsetX = pan.startOffX + (ev.clientX - pan.startX);
				view.offsetY = pan.startOffY + (ev.clientY - pan.startY);
				draw();
				return;
			}
			if (resize && selection && !readOnly) {
				const pt = toCanvasPt(ev.clientX, ev.clientY);
				let dx = Math.round(pt.x - resize.startPt.x);
				let dy = Math.round(pt.y - resize.startPt.y);
				if (snapToGrid) {
					const s = Math.max(1, snapSpacing | 0);
					dx = Math.round(dx / s) * s;
					dy = Math.round(dy / s) * s;
				}
				const w = findWidget(selection);
				if (!w) return;
				let r = { ...resize.startRect };
				if (resize.handle.left) r.left = snap(resize.startRect.left + dx);
				if (resize.handle.right) r.right = snap(resize.startRect.right + dx);
				if (resize.handle.top) r.top = snap(resize.startRect.top + dy);
				if (resize.handle.bottom) r.bottom = snap(resize.startRect.bottom + dy);
				r = normalizeRect(r);
				const d = getCurrentDisplay();
				r = clampRectToDisplay(r, d);
				w.rect = r;
				updateProperties();
				draw();
				return;
			}
			if (!drag || !selection || readOnly) return;
			const pt = toCanvasPt(ev.clientX, ev.clientY);
			let dx = Math.round(pt.x - drag.startPt.x);
			let dy = Math.round(pt.y - drag.startPt.y);
			if (snapToGrid) {
				const s = Math.max(1, snapSpacing | 0);
				dx = Math.round(dx / s) * s;
				dy = Math.round(dy / s) * s;
			}
			const w = findWidget(selection);
			if (!w) return;
			w.rect = { left: drag.startRect.left + dx, top: drag.startRect.top + dy, right: drag.startRect.right + dx, bottom: drag.startRect.bottom + dy };
			updateProperties();
			draw();
		});
		window.addEventListener('mouseup', () => {
			if (pan) { pan = null; return; }
			if (resize) {
				if (selection && !readOnly) {
					const w = findWidget(selection);
					if (w) vscode.postMessage({ type: 'edit', op: { kind: 'setRect', displayIndex: selection.displayIndex, path: selection.path, rect: w.rect } });
				}
				resize = null;
				return;
			}
			if (!drag || !selection || readOnly) { drag = null; return; }
			const w = findWidget(selection);
			if (w) vscode.postMessage({ type: 'edit', op: { kind: 'setRect', displayIndex: selection.displayIndex, path: selection.path, rect: w.rect } });
			drag = null;
		});
		elCanvas.addEventListener('wheel', (ev) => {
			ev.preventDefault();
			const r = elCanvas.getBoundingClientRect();
			const sx = ev.clientX - r.left;
			const sy = ev.clientY - r.top;
			const worldX = (sx - view.offsetX) / view.scale;
			const worldY = (sy - view.offsetY) / view.scale;
			const factor = ev.deltaY < 0 ? 1.1 : 0.9;
			view.scale = clamp(view.scale * factor, 0.05, 20);
			view.offsetX = sx - worldX * view.scale;
			view.offsetY = sy - worldY * view.scale;
			draw();
		}, { passive: false });
		window.addEventListener('resize', () => draw());
		elCanvas.addEventListener('mousemove', (ev) => {
			if (drag || resize || pan) return;
			if (!selection || readOnly) { elCanvas.style.cursor = ''; return; }
			const pt = toCanvasPt(ev.clientX, ev.clientY);
			const w = findWidget(selection);
			if (!w) { elCanvas.style.cursor = ''; return; }
			const h = getResizeHandle(pt, w.rect);
			elCanvas.style.cursor = h ? cursorForHandle(h) : '';
		});
		window.addEventListener('keydown', (ev) => {
			const t = ev.target;
			const tag = t && t.tagName ? String(t.tagName).toUpperCase() : '';
			const isEditable = !!(t && (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable));

			// Let inputs keep their native undo/redo.
			if (!isEditable) {
				const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
				const mod = isMac ? ev.metaKey : ev.ctrlKey;
				if (mod && (ev.key === 'z' || ev.key === 'Z')) {
					ev.preventDefault();
					vscode.postMessage({ type: ev.shiftKey ? 'redo' : 'undo' });
					return;
				}
				if (mod && (ev.key === 'y' || ev.key === 'Y')) {
					ev.preventDefault();
					vscode.postMessage({ type: 'redo' });
					return;
				}
			}

			if (!isEditable && ev.key === 'Escape') {
				ev.preventDefault();
				cancelPendingRectCommit();
				selection = null;
				renderTree();
				updateProperties();
				draw();
				return;
			}
			if (!isEditable && (ev.key === 'Backspace' || ev.key === 'Delete')) {
				if (!readOnly && selection) {
					ev.preventDefault();
					deleteSelected();
				}
				return;
			}

			if (isEditable || !selection || readOnly) return;
			const base = snapToGrid ? Math.max(1, snapSpacing | 0) : 1;
			const step = base * (ev.shiftKey ? 10 : 1);
			if (ev.key === 'ArrowLeft') { ev.preventDefault(); nudgeSelected(-step, 0); }
			else if (ev.key === 'ArrowRight') { ev.preventDefault(); nudgeSelected(step, 0); }
			else if (ev.key === 'ArrowUp') { ev.preventDefault(); nudgeSelected(0, -step); }
			else if (ev.key === 'ArrowDown') { ev.preventDefault(); nudgeSelected(0, step); }
		});

		window.addEventListener('message', (event) => {
			const msg = event.data;
			if (!msg || typeof msg !== 'object') return;
			if (msg.type === 'error') { setStatus(msg.message || 'Error'); return; }
			if (msg.type === 'init' || msg.type === 'update') {
				cancelPendingRectCommit();
				model = msg.project;
				readOnly = !!msg.readOnly;
				updateBanner(msg.reason);
				// String selector options are rendered within updateProperties() (depends on selection + dirty state).
				if (!spacingLoadedFromProject && model) {
					showGrid = !!model.gridEnabled;
					snapToGrid = !!model.snapEnabled;
					gridSpacing = clamp(asInt(model.gridSpacing, 10), 1, 256);
					snapSpacing = clamp(asInt(model.snapSpacing, 10), 1, 256);
					elGridSpacing.value = String(gridSpacing);
					if (elSnapSpacing) elSnapSpacing.value = String(snapSpacing);
					updateToggleButton(elGridBtn, showGrid);
					updateToggleButton(elSnapBtn, snapToGrid);
					spacingLoadedFromProject = true;
				}
				if (currentDisplayIndex === null) {
					currentDisplayIndex = model.displays && model.displays[0] ? model.displays[0].index : 0;
				}
				renderDisplaySelector();
				// Initialize active theme/language once.
				const curDisp = getCurrentDisplay();
				if (curDisp) currentThemeIndex = clamp(curDisp.activeTheme || 0, 0, Math.max(0, ((curDisp.themes || []).length - 1)));
				renderThemeSelector();
				renderLanguageSelector();
				if (pendingSelection && findWidget(pendingSelection)) {
					selection = pendingSelection;
				}
				pendingSelection = null;
				if (selection && !findWidget(selection)) selection = null;
				if (!selection) {
					const d = getCurrentDisplay();
					if (d && d.rootWidgets && d.rootWidgets[0]) selection = { displayIndex: d.index, path: d.rootWidgets[0].path };
				}
				if (selection && selection.displayIndex !== currentDisplayIndex) {
					currentDisplayIndex = selection.displayIndex;
					renderDisplaySelector();
				}
				renderTree();
				fitToDisplay();
				updateProperties();
				updateStringsActionsUi();
				draw();
			}
		});

		vscode.postMessage({ type: 'ready' });
	</script>
</body>
</html>`;
	}
}
