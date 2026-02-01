import { XMLBuilder, XMLParser } from 'fast-xml-parser';

export const LATEST_GXP_VERSION = 56;

export type Rect = {
	left: number;
	top: number;
	right: number;
	bottom: number;
};

export type WidgetPath = number[];

export type GxpWidget = {
	id: string;
	type: string;
	name: string;
	rect: Rect;
	normalFillColor: string;
	selectedFillColor: string;
	disabledFillColor: string;
	fontId: string;
	stringId: string;
	normalMapId: string;
	normalTextColor: string;
	selectedTextColor: string;
	disabledTextColor: string;
	children: GxpWidget[];
	path: WidgetPath;
};

export type GxpDisplay = {
	index: number;
	name: string;
	xres: number;
	yres: number;
	themes: string[];
	activeTheme: number;
	themeResources: { colorNames: string[]; fontNames: string[]; pixelmapNames: string[] }[];
	colorNames: string[];
	fontNames: string[];
	pixelmapNames: string[];
	rootWidgets: GxpWidget[];
};

export type GxpProject = {
	projectVersion: number;
	projectName: string;
	widgetPositionLocked: boolean;
	gridEnabled: boolean;
	snapEnabled: boolean;
	gridSpacing: number;
	snapSpacing: number;
	languages: string[];
	stringIds: string[];
	stringTable: Record<string, string[]>;
	displays: GxpDisplay[];
};

type AnyRecord = Record<string, any>;

function asArray<T>(value: T | T[] | undefined | null): T[] {
	if (!value) return [];
	return Array.isArray(value) ? value : [value];
}

function toInt(value: unknown, defaultValue = 0): number {
	const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
	return Number.isFinite(n) ? n : defaultValue;
}

function toBool(value: unknown): boolean {
	const s = String(value ?? '').trim().toLowerCase();
	return s === 'true' || s === '1';
}

function getProjectXmlBody(xmlText: string): { prefix: string; projectXml: string } {
	const xmlDecl = xmlText.match(/^\s*<\?xml[^>]*\?>\s*/i)?.[0] ?? '';
	const doctype = xmlText.match(/<!DOCTYPE[^>]*>\s*/i)?.[0] ?? '';
	const idx = xmlText.indexOf('<project');
	if (idx < 0) {
		return { prefix: xmlDecl + doctype, projectXml: xmlText };
	}
	const prefix = xmlText.slice(0, idx);
	const preservedPrefix = xmlDecl + doctype;
	// Prefer canonical prefix if present, otherwise keep whatever was before <project>.
	return { prefix: preservedPrefix.trim().length > 0 ? preservedPrefix : prefix, projectXml: xmlText.slice(idx) };
}

function buildProjectXml(prefix: string, project: AnyRecord): string {
	const builder = new XMLBuilder({
		ignoreAttributes: true,
		format: true,
		indentBy: '',
		suppressEmptyNode: false,
	});
	const body = builder.build({ project });
	const trimmedPrefix = prefix.trim();
	if (trimmedPrefix.length > 0) {
		return trimmedPrefix + '\n' + body + '\n';
	}
	return `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE GUIX_Studio_Project>\n${body}\n`;
}

function createParser(): XMLParser {
	return new XMLParser({
		ignoreAttributes: true,
		parseTagValue: false,
		trimValues: false,
	});
}

function extractWidgetTree(widgetNode: AnyRecord, displayIndex: number, path: WidgetPath): GxpWidget {
	const type = String(widgetNode.type ?? '').trim();
	const name = String(widgetNode.app_name ?? '').trim();
	const normalFillColor = String(widgetNode.normal_fill_color ?? 'CANVAS').trim();
	const selectedFillColor = String(widgetNode.selected_fill_color ?? normalFillColor).trim();
	const disabledFillColor = String(widgetNode.disabled_fill_color ?? normalFillColor).trim();
	const fontId = String(widgetNode.font_id ?? '').trim();
	const stringId = String(widgetNode.string_id ?? '').trim();
	const normalMapId = String(widgetNode.normal_map_id ?? '').trim();
	const normalTextColor = String(widgetNode.normal_text_color ?? '').trim();
	const selectedTextColor = String(widgetNode.selected_text_color ?? '').trim();
	const disabledTextColor = String(widgetNode.disabled_text_color ?? '').trim();
	const size = widgetNode.size ?? {};
	const rect: Rect = {
		left: toInt(size.left, 0),
		top: toInt(size.top, 0),
		right: toInt(size.right, 0),
		bottom: toInt(size.bottom, 0),
	};
	const childrenNodes = asArray<AnyRecord>(widgetNode.widget);
	const children = childrenNodes.map((c, idx) => extractWidgetTree(c, displayIndex, [...path, idx]));
	const id = `d${displayIndex}:${path.join('.') || 'root'}`;
	return {
		id,
		type,
		name,
		rect,
		normalFillColor,
		selectedFillColor,
		disabledFillColor,
		fontId,
		stringId,
		normalMapId,
		normalTextColor,
		selectedTextColor,
		disabledTextColor,
		children,
		path,
	};
}

function collectResourceNamesFromThemeData(themeData: AnyRecord, resourceType: 'COLOR' | 'FONT' | 'PIXELMAP'): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	function add(name: unknown) {
		const s = String(name ?? '').trim();
		if (!s) return;
		if (seen.has(s)) return;
		seen.add(s);
		out.push(s);
	}
	function walkResource(node: AnyRecord) {
		if (!node || typeof node !== 'object') return;
		if (String(node.type ?? '').trim().toUpperCase() === resourceType) {
			add(node.name);
		}
		const kids = asArray<AnyRecord>((node as AnyRecord).resource);
		for (const k of kids) walkResource(k);
	}
	const roots = asArray<AnyRecord>(themeData?.resource);
	for (const r of roots) walkResource(r);
	return out;
}

function guessThemeNameFromThemeData(themeData: AnyRecord): string {
	function walk(node: AnyRecord): string {
		if (!node || typeof node !== 'object') return '';
		if (String(node.type ?? '').trim().toUpperCase() === 'HEADER') {
			const n = String(node.name ?? '').trim();
			if (n) return n;
		}
		const kids = asArray<AnyRecord>((node as AnyRecord).resource);
		for (const k of kids) {
			const found = walk(k);
			if (found) return found;
		}
		return '';
	}
	const roots = asArray<AnyRecord>(themeData?.resource);
	for (const r of roots) {
		const found = walk(r);
		if (found) return found;
	}
	return '';
}

export function parseGxp(xmlText: string): GxpProject {
	const { projectXml } = getProjectXmlBody(xmlText);
	const parser = createParser();
	const doc = parser.parse(projectXml) as AnyRecord;
	const project = doc.project ?? {};
	const header = project.header ?? {};
	const projectVersion = toInt(header.project_version, 0);
	const projectName = String(header.project_name ?? '').trim();
	const widgetPositionLocked = toBool(header.is_widget_position_locked);
	const gridEnabled = toBool(header.grid_enabled);
	const snapEnabled = toBool(header.snap_enabled);
	const gridSpacing = toInt(header.grid_spacing, 10);
	const snapSpacing = toInt(header.snap_spacing, 10);
	const languageNames = header.language_names ?? {};
	const languages = asArray<any>(languageNames.language).map((l) => String(l ?? '').trim()).filter((s) => s.length > 0);
	const stringTable = project.string_table ?? {};
	const stringTableMap: Record<string, string[]> = {};
	for (const r of asArray<AnyRecord>(stringTable.string_record)) {
		const id = String(r?.id ?? '').trim();
		if (!id) continue;
		const vals = asArray<any>(r?.val).map((v) => String(v ?? ''));
		stringTableMap[id] = vals;
	}
	const stringIds = Object.keys(stringTableMap);

	const displays = asArray<AnyRecord>(project.display_info).map((d, di) => {
		const index = toInt(d.display_index, di);
		const name = String(d.display_name ?? `display_${index}`).trim();
		const xres = toInt(d.xres, 0);
		const yres = toInt(d.yres, 0);
		const themeInfo = d.theme_info ?? {};
		const rawThemes = asArray<any>(themeInfo.theme_name).map((t) => String(t ?? '').trim()).filter((s) => s.length > 0);
		const activeTheme = toInt(themeInfo.active_theme, 0);
		const themeDatas = asArray<AnyRecord>(themeInfo.theme_data);
		const themeCount = Math.max(rawThemes.length, themeDatas.length, 1);
		const themeResources = Array.from({ length: themeCount }, (_v, i) => {
			const td = themeDatas[i] ?? (themeDatas[0] ?? themeInfo.theme_data ?? {});
			return {
				colorNames: collectResourceNamesFromThemeData(td ?? {}, 'COLOR'),
				fontNames: collectResourceNamesFromThemeData(td ?? {}, 'FONT'),
				pixelmapNames: collectResourceNamesFromThemeData(td ?? {}, 'PIXELMAP'),
			};
		});
		const themes = Array.from({ length: themeCount }, (_v, i) => {
			const existing = rawThemes[i];
			if (existing) return existing;
			const td = themeDatas[i] ?? (themeDatas[0] ?? themeInfo.theme_data ?? {});
			const guessed = guessThemeNameFromThemeData(td);
			return guessed || `theme_${i + 1}`;
		});
		const activeIdx = Math.max(0, Math.min(activeTheme, themeResources.length - 1));
		const colorNames = themeResources[activeIdx]?.colorNames ?? [];
		const fontNames = themeResources[activeIdx]?.fontNames ?? [];
		const pixelmapNames = themeResources[activeIdx]?.pixelmapNames ?? [];
		const widgetFolder = d.widget_folder ?? {};
		const roots = asArray<AnyRecord>(widgetFolder.widget);
		const rootWidgets = roots.map((w, idx) => extractWidgetTree(w, index, [idx]));
		return { index, name, xres, yres, themes, activeTheme, themeResources, colorNames, fontNames, pixelmapNames, rootWidgets } satisfies GxpDisplay;
	});

	return { projectVersion, projectName, widgetPositionLocked, gridEnabled, snapEnabled, gridSpacing, snapSpacing, languages, stringIds, stringTable: stringTableMap, displays };
}

function getDisplayNode(project: AnyRecord, displayIndex: number): AnyRecord {
	const displays = asArray<AnyRecord>(project.display_info);
	const found = displays.find((d) => toInt(d.display_index, -1) === displayIndex);
	if (found) return found;
	// Fallback: treat displayIndex as array index.
	return displays[displayIndex] ?? (() => {
		throw new Error(`Display not found: ${displayIndex}`);
	})();
}

function getRootWidgetsArray(display: AnyRecord): AnyRecord[] {
	if (!display.widget_folder) display.widget_folder = {};
	const wf = display.widget_folder;
	const roots = asArray<AnyRecord>(wf.widget);
	// Ensure array is stored back to preserve future edits.
	wf.widget = roots;
	return roots;
}

function getWidgetByPath(roots: AnyRecord[], path: WidgetPath): { parent: AnyRecord | null; widget: AnyRecord; siblings: AnyRecord[]; index: number } {
	if (path.length === 0) {
		throw new Error('Empty widget path');
	}
	let siblings: AnyRecord[] = roots;
	let parent: AnyRecord | null = null;
	let widget: AnyRecord | undefined;
	for (let i = 0; i < path.length; i++) {
		const idx = path[i];
		widget = siblings[idx];
		if (!widget) throw new Error(`Widget path not found: ${path.join('.')}`);
		if (i === path.length - 1) {
			return { parent, widget, siblings, index: idx };
		}
		parent = widget;
		const children = asArray<AnyRecord>(widget.widget);
		widget.widget = children;
		siblings = children;
	}
	throw new Error(`Widget path not found: ${path.join('.')}`);
}

export type GxpEditOperation =
	| { kind: 'setRect'; displayIndex: number; path: WidgetPath; rect: Rect }
	| { kind: 'rename'; displayIndex: number; path: WidgetPath; name: string }
	| { kind: 'setFillColors'; displayIndex: number; path: WidgetPath; normalFillColor: string; selectedFillColor: string; disabledFillColor: string }
	| { kind: 'setTextColors'; displayIndex: number; path: WidgetPath; normalTextColor: string; selectedTextColor: string; disabledTextColor: string }
	| { kind: 'setActiveTheme'; displayIndex: number; activeTheme: number }
	| { kind: 'setGridEnabled'; displayIndex: number; enabled: boolean }
	| { kind: 'setSnapEnabled'; displayIndex: number; enabled: boolean }
	| { kind: 'setGridSpacing'; displayIndex: number; spacing: number }
	| { kind: 'setSnapSpacing'; displayIndex: number; spacing: number }
	| { kind: 'setFontId'; displayIndex: number; path: WidgetPath; fontId: string }
	| { kind: 'setStringId'; displayIndex: number; path: WidgetPath; stringId: string }
	| { kind: 'ensureStringRecord'; displayIndex: number; stringId: string }
	| { kind: 'setStringTableValue'; displayIndex: number; stringId: string; languageIndex: number; value: string }
	| { kind: 'setNormalMapId'; displayIndex: number; path: WidgetPath; normalMapId: string }
	| { kind: 'delete'; displayIndex: number; path: WidgetPath }
	| { kind: 'addChild'; displayIndex: number; path: WidgetPath; widgetType: string }
	| { kind: 'addSibling'; displayIndex: number; path: WidgetPath; widgetType: string }
	| { kind: 'duplicate'; displayIndex: number; path: WidgetPath }
	| { kind: 'move'; displayIndex: number; path: WidgetPath; direction: 'up' | 'down' }
	| { kind: 'addRoot'; displayIndex: number; name: string }
	| { kind: 'deleteRoot'; displayIndex: number; rootIndex: number };

function makeDefaultWidgetNode(widgetType: string, name: string): AnyRecord {
	const rect = { left: '0', top: '0', right: '99', bottom: '29' };
	return {
		type: widgetType,
		app_name: name,
		size: rect,
		style: '0',
		allocation: '0',
		accepts_focus: 'TRUE',
		normal_fill_color: 'CANVAS',
		selected_fill_color: 'CANVAS',
		disabled_fill_color: 'CANVAS',
		template: 'FALSE',
		visible_at_startup: 'FALSE',
	};
}

function deepCloneWidgetNode(node: AnyRecord): AnyRecord {
	const out: AnyRecord = { ...node };
	if (out.app_name) out.app_name = String(out.app_name) + '_copy';
	const kids = asArray<AnyRecord>(node.widget);
	if (kids.length > 0) {
		out.widget = kids.map((c) => deepCloneWidgetNode(c));
	} else {
		delete out.widget;
	}
	return out;
}

export function applyGxpEdit(xmlText: string, op: GxpEditOperation): string {
	const { prefix, projectXml } = getProjectXmlBody(xmlText);
	const parser = createParser();
	const doc = parser.parse(projectXml) as AnyRecord;
	const project = doc.project ?? {};
	if (!project.header) project.header = {};
	const header = project.header;

	const display = getDisplayNode(project, op.displayIndex);
	const roots = getRootWidgetsArray(display);

	switch (op.kind) {
			case 'setActiveTheme': {
				if (!display.theme_info) display.theme_info = {};
				display.theme_info.active_theme = String(toInt(op.activeTheme, 0));
				break;
			}
			case 'setGridEnabled': {
				header.grid_enabled = op.enabled ? 'TRUE' : 'FALSE';
				break;
			}
			case 'setSnapEnabled': {
				header.snap_enabled = op.enabled ? 'TRUE' : 'FALSE';
				break;
			}
			case 'setGridSpacing': {
				header.grid_spacing = String(Math.max(1, toInt(op.spacing, 10)));
				break;
			}
			case 'setSnapSpacing': {
				header.snap_spacing = String(Math.max(1, toInt(op.spacing, 10)));
				break;
			}
		case 'setRect': {
			const { widget } = getWidgetByPath(roots, op.path);
			if (!widget.size) widget.size = {};
			widget.size.left = String(op.rect.left);
			widget.size.top = String(op.rect.top);
			widget.size.right = String(op.rect.right);
			widget.size.bottom = String(op.rect.bottom);
			break;
		}
		case 'rename': {
			const { widget } = getWidgetByPath(roots, op.path);
			widget.app_name = op.name;
			break;
		}
		case 'setFillColors': {
			const { widget } = getWidgetByPath(roots, op.path);
			widget.normal_fill_color = op.normalFillColor;
			widget.selected_fill_color = op.selectedFillColor;
			widget.disabled_fill_color = op.disabledFillColor;
			break;
		}
		case 'setTextColors': {
			const { widget } = getWidgetByPath(roots, op.path);
			widget.normal_text_color = op.normalTextColor;
			widget.selected_text_color = op.selectedTextColor;
			widget.disabled_text_color = op.disabledTextColor;
			break;
		}
		case 'setFontId': {
			const { widget } = getWidgetByPath(roots, op.path);
			const v = String(op.fontId ?? '').trim();
			if (v) widget.font_id = v;
			else delete widget.font_id;
			break;
		}
		case 'setStringId': {
			const { widget } = getWidgetByPath(roots, op.path);
			const v = String(op.stringId ?? '').trim();
			if (v) widget.string_id = v;
			else delete widget.string_id;
			break;
		}
		case 'ensureStringRecord': {
			const id = String(op.stringId ?? '').trim();
			if (!id) break;
			if (!project.string_table) project.string_table = {};
			const stringTable = project.string_table;
			const records = asArray<AnyRecord>(stringTable.string_record);
			stringTable.string_record = records;
			let rec: AnyRecord | undefined;
			for (const r of records) {
				if (String(r?.id ?? '').trim() === id) {
					rec = r;
					break;
				}
			}
			if (!rec) {
				rec = { id, val: [] };
				records.push(rec);
			}
			const languageNames = header.language_names ?? {};
			const languages = asArray<any>(languageNames.language)
				.map((l) => String(l ?? '').trim())
				.filter((s) => s.length > 0);
			const desired = Math.max(1, languages.length || 1);
			const vals = asArray<any>(rec.val).map((v) => String(v ?? ''));
			while (vals.length < desired) vals.push('');
			rec.val = vals;
			break;
		}
			case 'setStringTableValue': {
				const id = String(op.stringId ?? '').trim();
				if (!id) break;
				const langIndex = Math.max(0, toInt(op.languageIndex, 0));
				if (!project.string_table) project.string_table = {};
				const stringTable = project.string_table;
				const records = asArray<AnyRecord>(stringTable.string_record);
				stringTable.string_record = records;
				let rec: AnyRecord | undefined;
				for (const r of records) {
					if (String(r?.id ?? '').trim() === id) {
						rec = r;
						break;
					}
				}
				if (!rec) {
					rec = { id, val: [] };
					records.push(rec);
				}
				const languageNames = header.language_names ?? {};
				const languages = asArray<any>(languageNames.language)
					.map((l) => String(l ?? '').trim())
					.filter((s) => s.length > 0);
				const desired = Math.max(1, languages.length || 1, langIndex + 1);
				const vals = asArray<any>(rec.val).map((v) => String(v ?? ''));
				while (vals.length < desired) vals.push('');
				vals[langIndex] = String(op.value ?? '');
				rec.val = vals;
				break;
			}
		case 'setNormalMapId': {
			const { widget } = getWidgetByPath(roots, op.path);
			const v = String(op.normalMapId ?? '').trim();
			if (v) widget.normal_map_id = v;
			else delete widget.normal_map_id;
			break;
		}
		case 'delete': {
			const { siblings, index } = getWidgetByPath(roots, op.path);
			siblings.splice(index, 1);
			break;
		}
		case 'addChild': {
			const { widget } = getWidgetByPath(roots, op.path);
			const children = asArray<AnyRecord>(widget.widget);
			widget.widget = children;
			children.push(makeDefaultWidgetNode(op.widgetType, `${op.widgetType}_${children.length + 1}`));
			break;
		}
		case 'addSibling': {
			if (op.path.length === 1) {
				// Root-level sibling insertion.
				const rootIndex = op.path[0];
				const insertIndex = Math.min(Math.max(rootIndex + 1, 0), roots.length);
				roots.splice(insertIndex, 0, makeDefaultWidgetNode(op.widgetType, `${op.widgetType}_${insertIndex + 1}`));
				break;
			}
			const { siblings, index } = getWidgetByPath(roots, op.path);
			const insertIndex = Math.min(index + 1, siblings.length);
			siblings.splice(insertIndex, 0, makeDefaultWidgetNode(op.widgetType, `${op.widgetType}_${insertIndex + 1}`));
			break;
		}
		case 'duplicate': {
			if (op.path.length === 1) {
				const rootIndex = op.path[0];
				if (rootIndex < 0 || rootIndex >= roots.length) break;
				const clone = deepCloneWidgetNode(roots[rootIndex]);
				roots.splice(rootIndex + 1, 0, clone);
				break;
			}
			const { siblings, index } = getWidgetByPath(roots, op.path);
			const clone = deepCloneWidgetNode(siblings[index]);
			siblings.splice(index + 1, 0, clone);
			break;
		}
		case 'move': {
			const { siblings, index } = getWidgetByPath(roots, op.path);
			const newIndex = op.direction === 'up' ? index - 1 : index + 1;
			if (newIndex < 0 || newIndex >= siblings.length) break;
			const [item] = siblings.splice(index, 1);
			siblings.splice(newIndex, 0, item);
			break;
		}
		case 'addRoot': {
			roots.push({
				type: 'window',
				app_name: op.name,
				size: { left: '0', top: '0', right: String(toInt(display.xres, 319)), bottom: String(toInt(display.yres, 239)) },
				style: '0',
				allocation: '0',
				accepts_focus: 'TRUE',
				normal_fill_color: 'CANVAS',
				selected_fill_color: 'CANVAS',
				disabled_fill_color: 'CANVAS',
				template: 'FALSE',
				visible_at_startup: 'FALSE',
			});
			break;
		}
		case 'deleteRoot': {
			if (op.rootIndex >= 0 && op.rootIndex < roots.length) {
				roots.splice(op.rootIndex, 1);
			}
			break;
		}
		default:
			// exhaustive
			break;
	}

	return buildProjectXml(prefix, project);
}
