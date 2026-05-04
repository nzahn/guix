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

import * as vscode from 'vscode';
import { injectable } from 'inversify';
import { GxpProject, DisplayInfo } from '../common/project-model';
import { WidgetInfo, FolderInfo } from '../common/widget-info';

// ---------------------------------------------------------------------------
// Node discriminated union
// ---------------------------------------------------------------------------

export type ProjectNodeKind =
    | 'root'
    | 'display'
    | 'folder'
    | 'widget';

/** A single item rendered in the project tree. */
export interface ProjectNode {
    readonly kind: ProjectNodeKind;
    readonly label: string;
    readonly id: string;
    /** Only set for 'widget' nodes. */
    readonly widgetInfo?: WidgetInfo;
    /** Only set for 'folder' nodes. */
    readonly folderInfo?: FolderInfo;
    /** Only set for 'display' nodes. */
    readonly displayInfo?: DisplayInfo;
}

// ---------------------------------------------------------------------------
// ProjectView — TreeDataProvider
// ---------------------------------------------------------------------------

@injectable()
export class ProjectView implements vscode.TreeDataProvider<ProjectNode> {

    // ── VS Code event emitter ──────────────────────────────────────────────
    private readonly _onDidChangeTreeData =
        new vscode.EventEmitter<ProjectNode | ProjectNode[] | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    // ── State ──────────────────────────────────────────────────────────────
    private project: GxpProject | null = null;

    /** Currently selected widget info, broadast to other panels. */
    private _selectedWidget: WidgetInfo | null = null;
    get selectedWidget(): WidgetInfo | null { return this._selectedWidget; }

    /** Listeners notified when the selection changes. */
    private selectionListeners: Array<(w: WidgetInfo | null) => void> = [];

    // ── Project lifecycle ──────────────────────────────────────────────────

    /** Called by the extension when a project is opened / reloaded. */
    openProject(project: GxpProject): void {
        this.project = project;
        this._selectedWidget = null;
        this._onDidChangeTreeData.fire();
    }

    /** Called by the extension when the project is closed. */
    closeProject(): void {
        this.project = null;
        this._selectedWidget = null;
        this._onDidChangeTreeData.fire();
    }

    /** Notify that a widget's name was changed externally (e.g. via property panel). */
    notifyNameChange(widget: WidgetInfo): void {
        // Find and refresh the node for this widget
        const node = this.findNodeForWidget(widget);
        if (node) {
            this._onDidChangeTreeData.fire(node);
        }
    }

    /** Notify that the whole tree must be rebuilt (e.g. add/delete screen). */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // ── Selection ──────────────────────────────────────────────────────────

    /** Registers a listener called when the user selects a widget node. */
    onSelectionChange(listener: (w: WidgetInfo | null) => void): void {
        this.selectionListeners.push(listener);
    }

    /** Called by the extension's `onDidChangeSelection` handler from the registered view. */
    handleSelectionChange(nodes: readonly ProjectNode[]): void {
        const first = nodes[0];
        const widget = first?.kind === 'widget' ? (first.widgetInfo ?? null) : null;
        this._selectedWidget = widget;
        for (const l of this.selectionListeners) l(widget);
    }

    // ── TreeDataProvider implementation ────────────────────────────────────

    getTreeItem(node: ProjectNode): vscode.TreeItem {
        const collapsible = (node.kind === 'root' || node.kind === 'display' || node.kind === 'folder')
            ? vscode.TreeItemCollapsibleState.Expanded
            : this.hasChildren(node)
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None;

        const item = new vscode.TreeItem(node.label, collapsible);
        item.id = node.id;
        item.contextValue = node.kind;
        const icon = iconForNode(node);
        if (icon) item.iconPath = icon;
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

    getChildren(node?: ProjectNode): vscode.ProviderResult<ProjectNode[]> {
        if (!this.project) return [];

        if (!node) {
            // Root level: one entry per display
            return this.project.displays.map((d, i) => displayNode(d, i));
        }

        switch (node.kind) {
            case 'display': {
                const disp = node.displayInfo!;
                return disp.folders.map((f, fi) => folderNode(f, node.id, fi));
            }
            case 'folder': {
                const folder = node.folderInfo!;
                return folder.widgets.map((w, wi) => widgetNode(w, node.id, wi));
            }
            case 'widget': {
                const w = node.widgetInfo!;
                return w.children.map((c, ci) => widgetNode(c, node.id, ci));
            }
            default:
                return [];
        }
    }

    getParent(_node: ProjectNode): vscode.ProviderResult<ProjectNode> {
        // VS Code uses this for reveal(); return null to keep things simple
        // (full parent-tracking would require a bidirectional index)
        return null;
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private hasChildren(node: ProjectNode): boolean {
        if (node.kind === 'widget') return (node.widgetInfo?.children.length ?? 0) > 0;
        return false;
    }

    private tooltipForNode(node: ProjectNode): string {
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
    private findNodeForWidget(target: WidgetInfo): ProjectNode | null {
        if (!this.project) return null;
        for (const [di, disp] of this.project.displays.entries()) {
            for (const [fi, folder] of disp.folders.entries()) {
                const dn = displayNode(disp, di);
                const fn = folderNode(folder, dn.id, fi);
                const result = searchWidgets(folder.widgets, fn.id, target);
                if (result) return result;
            }
        }
        return null;
    }
}

// ---------------------------------------------------------------------------
// Pure node-factory helpers
// ---------------------------------------------------------------------------

function displayNode(disp: DisplayInfo, index: number): ProjectNode {
    return {
        kind: 'display',
        label: `${disp.name} (${disp.xres}×${disp.yres})`,
        id: `display-${index}`,
        displayInfo: disp,
    };
}

function folderNode(folder: FolderInfo, parentId: string, index: number): ProjectNode {
    return {
        kind: 'folder',
        label: folder.folder_name || `Folder ${index}`,
        id: `${parentId}-folder-${index}`,
        folderInfo: folder,
    };
}

function widgetNode(w: WidgetInfo, parentId: string, index: number): ProjectNode {
    return {
        kind: 'widget',
        label: w.app_name || w.base_name || `Widget ${index}`,
        id: `${parentId}-widget-${w.app_name || index}`,
        widgetInfo: w,
    };
}

function searchWidgets(
    widgets: WidgetInfo[],
    parentId: string,
    target: WidgetInfo,
): ProjectNode | null {
    for (const [i, w] of widgets.entries()) {
        const node = widgetNode(w, parentId, i);
        if (w === target) return node;
        const found = searchWidgets(w.children, node.id, target);
        if (found) return found;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------

function iconForNode(node: ProjectNode): vscode.ThemeIcon | undefined {
    switch (node.kind) {
        case 'display': return new vscode.ThemeIcon('device-desktop');
        case 'folder':  return new vscode.ThemeIcon('folder');
        case 'widget':  return iconForWidgetType(node.widgetInfo?.basetype ?? 0);
        default:        return undefined;
    }
}

/**
 * Maps GX_TYPE_* to a VS Code codicon.
 * Full type-to-icon map mirrors ProjectViewImageMap[] in project_view.cpp.
 */
function iconForWidgetType(basetype: number): vscode.ThemeIcon {
    // GX_TYPE ranges (from gx_api.h)
    //   0x00-0x0F  basic primitives / windows
    //   0x10-0x1F  buttons
    //   0x20-0x2F  text widgets
    //   0x30-0x3F  scrollbars
    //   0x40-0x4F  sliders / gauges
    //   0x50-0x5F  list / scroll wheel
    //   0x60-0x7F  charts / menus
    if (basetype >= 0x10 && basetype < 0x20) return new vscode.ThemeIcon('check');        // buttons
    if (basetype >= 0x20 && basetype < 0x30) return new vscode.ThemeIcon('symbol-string');// text
    if (basetype >= 0x30 && basetype < 0x40) return new vscode.ThemeIcon('list-flat');    // scrollbar
    if (basetype >= 0x40 && basetype < 0x60) return new vscode.ThemeIcon('dashboard');    // sliders/gauges
    if (basetype >= 0x60 && basetype < 0x80) return new vscode.ThemeIcon('symbol-array'); // list/menu
    return new vscode.ThemeIcon('window');                                                  // default: window
}
