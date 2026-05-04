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

import * as vscode from 'vscode';
import { injectable } from 'inversify';
import {
    RES_TYPE_HEADER,
    RES_TYPE_GROUP,
    RES_TYPE_FOLDER,
    RES_TYPE_COLOR,
    RES_TYPE_FONT,
    RES_TYPE_PIXELMAP,
    RES_TYPE_STRING,
    RES_TYPE_ADD_COLOR,
    RES_TYPE_ADD_FONT,
    RES_TYPE_ADD_PIXELMAP,
    RES_TYPE_ADD_STRING,
} from '../common/gx-types';
import { ResInfo } from '../common/res-info';
import { GxpProject, DisplayInfo, ThemeInfo } from '../common/project-model';

// ---------------------------------------------------------------------------
// Resource node
// ---------------------------------------------------------------------------

export interface ResourceNode {
    readonly id: string;
    readonly label: string;
    readonly type: number;        // RES_TYPE_*
    readonly resInfo?: ResInfo;
    /** For group/header nodes — child nodes are built lazily. */
    readonly children?: ResourceNode[];
}

// ---------------------------------------------------------------------------
// ResourcePanel
// ---------------------------------------------------------------------------

@injectable()
export class ResourcePanel implements vscode.TreeDataProvider<ResourceNode> {

    static readonly viewId = 'guixStudio.resourcePanel';

    // ── VS Code event emitter ──────────────────────────────────────────────
    private readonly _onDidChangeTreeData =
        new vscode.EventEmitter<ResourceNode | ResourceNode[] | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    // ── State ──────────────────────────────────────────────────────────────
    private project: GxpProject | null = null;
    private displayIndex = 0;

    // ── Project lifecycle ──────────────────────────────────────────────────

    openProject(project: GxpProject): void {
        this.project      = project;
        this.displayIndex = 0;
        this._onDidChangeTreeData.fire();
    }

    closeProject(): void {
        this.project = null;
        this._onDidChangeTreeData.fire();
    }

    /** Switch active display; resets theme to 0. */
    selectDisplay(index: number): void {
        this.displayIndex = index;
        this._onDidChangeTreeData.fire();
    }

    /** Switch active theme within the current display. */
    selectTheme(_index: number): void {
        // Reserved for future per-theme resource scoping
        this._onDidChangeTreeData.fire();
    }

    /** Notify a resource was added, renamed or deleted. */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // ── Active display / theme accessors ───────────────────────────────────

    private get activeDisplay(): DisplayInfo | null {
        return this.project?.displays[this.displayIndex] ?? null;
    }

    // activeTheme is available for future use (e.g. theme-scoped resource editing)
    // private get activeTheme(): ThemeInfo | null {
    //     return this.activeDisplay?.themes[this.themeIndex] ?? null;
    // }

    // ── TreeDataProvider ───────────────────────────────────────────────────

    getTreeItem(node: ResourceNode): vscode.TreeItem {
        const isLeaf = isLeafType(node.type);
        const state  = isLeaf
            ? vscode.TreeItemCollapsibleState.None
            : vscode.TreeItemCollapsibleState.Expanded;

        const item = new vscode.TreeItem(node.label, state);
        item.id           = node.id;
        item.contextValue = resContextValue(node.type);
        item.iconPath     = iconForResType(node.type, node.resInfo);
        item.tooltip      = tooltipForNode(node);

        if (!isLeaf && node.type !== RES_TYPE_ADD_COLOR
                    && node.type !== RES_TYPE_ADD_FONT
                    && node.type !== RES_TYPE_ADD_PIXELMAP
                    && node.type !== RES_TYPE_ADD_STRING) {
            // No command on containers
        } else if (isAddType(node.type)) {
            item.command = {
                command: addCommandForType(node.type),
                title: node.label,
                arguments: [],
            };
        } else if (isLeaf) {
            item.command = {
                command: 'guixStudio.editResource',
                title: 'Edit',
                arguments: [node],
            };
        }

        return item;
    }

    getChildren(node?: ResourceNode): vscode.ProviderResult<ResourceNode[]> {
        if (!this.project) return [];

        if (!node) {
            // Root: one header per theme
            const disp = this.activeDisplay;
            if (!disp) return [];
            return disp.themes.map((t, i) => themeHeaderNode(t, i));
        }

        // If the node carries pre-built children (header / group / folder nodes)
        if (node.children) return node.children;

        // Leaf-level resource nodes have no children
        if (isLeafType(node.type)) return [];

        // For folder-type nodes the children were built at construction time
        return [];
    }

    getParent(_node: ResourceNode): vscode.ProviderResult<ResourceNode> {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Node-tree construction — mirrors resource_tree::BuildResourceTables()
// ---------------------------------------------------------------------------

function themeHeaderNode(theme: ThemeInfo, themeIndex: number): ResourceNode {
    const children: ResourceNode[] = [];
    const resources = theme.resources;

    // The resources array contains the top-level group nodes from the .gxp reader:
    //   [0] = Color group root, [1] = Font group root, [2] = Pixelmap group root, [3] = String group root
    for (const [ri, res] of resources.entries()) {
        children.push(groupNode(res, `t${themeIndex}-g${ri}`));
    }

    return {
        id: `theme-${themeIndex}`,
        label: theme.theme_name || `Theme ${themeIndex}`,
        type: RES_TYPE_HEADER,
        children,
    };
}

function groupNode(res: ResInfo, idPrefix: string): ResourceNode {
    // Group-level: Colors / Fonts / Pixelmaps / Strings
    const children: ResourceNode[] = [];

    // Determine what type of resource items to emit
    const itemType = groupItemType(res.type);

    for (const [ci, child] of res.children.entries()) {
        const childId = `${idPrefix}-c${ci}`;
        if (child.type === RES_TYPE_FOLDER) {
            children.push(folderNode(child, childId));
        } else {
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
        type: RES_TYPE_GROUP,
        resInfo: res,
        children,
    };
}

function folderNode(res: ResInfo, idPrefix: string): ResourceNode {
    const children: ResourceNode[] = res.children.map((c, i) =>
        leafNode(c, `${idPrefix}-c${i}`, RES_TYPE_PIXELMAP),
    );
    // Add pixelmap action inside folders
    children.push({
        id: `${idPrefix}-add`,
        label: addLabelForType(RES_TYPE_ADD_PIXELMAP),
        type: RES_TYPE_ADD_PIXELMAP,
    });
    return {
        id: idPrefix,
        label: res.name || 'Folder',
        type: RES_TYPE_FOLDER,
        resInfo: res,
        children,
    };
}

function leafNode(res: ResInfo, id: string, _hint: number): ResourceNode {
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

function groupLabel(res: ResInfo): string {
    switch (res.type) {
        case RES_TYPE_GROUP: {
            if (res.name) return res.name;
            // Infer from first child type
            const firstChild = res.children[0];
            if (!firstChild) return 'Resources';
            return groupLabelForItemType(firstChild.type);
        }
        default: return res.name || 'Group';
    }
}

function groupLabelForItemType(t: number): string {
    switch (t) {
        case RES_TYPE_COLOR:    return 'Colors';
        case RES_TYPE_FONT:     return 'Fonts';
        case RES_TYPE_PIXELMAP: return 'Pixelmaps';
        case RES_TYPE_STRING:   return 'Strings';
        default:                return 'Resources';
    }
}

function groupItemType(groupType: number): number {
    // Map group res.type → child leaf type
    // In the .gxp file, groups are stored with type=RES_TYPE_GROUP and their
    // children carry the real type.  We use folder_id as a hint stored in ResInfo.
    switch (groupType) {
        case RES_TYPE_ADD_COLOR:    return RES_TYPE_COLOR;
        case RES_TYPE_ADD_FONT:     return RES_TYPE_FONT;
        case RES_TYPE_ADD_PIXELMAP: return RES_TYPE_PIXELMAP;
        case RES_TYPE_ADD_STRING:   return RES_TYPE_STRING;
        default:                    return RES_TYPE_COLOR; // fallback
    }
}

function addTypeForGroup(groupResType: number, itemType: number): number {
    if (groupResType === RES_TYPE_GROUP) {
        switch (itemType) {
            case RES_TYPE_COLOR:    return RES_TYPE_ADD_COLOR;
            case RES_TYPE_FONT:     return RES_TYPE_ADD_FONT;
            case RES_TYPE_PIXELMAP: return RES_TYPE_ADD_PIXELMAP;
            case RES_TYPE_STRING:   return RES_TYPE_ADD_STRING;
        }
    }
    return 0;
}

function addLabelForType(t: number): string {
    switch (t) {
        case RES_TYPE_ADD_COLOR:    return '+ Add Color';
        case RES_TYPE_ADD_FONT:     return '+ Add Font';
        case RES_TYPE_ADD_PIXELMAP: return '+ Add Pixelmap';
        case RES_TYPE_ADD_STRING:   return '+ Add String';
        default:                    return '+ Add';
    }
}

function addCommandForType(t: number): string {
    switch (t) {
        case RES_TYPE_ADD_COLOR:    return 'guixStudio.addColor';
        case RES_TYPE_ADD_FONT:     return 'guixStudio.addFont';
        case RES_TYPE_ADD_PIXELMAP: return 'guixStudio.addPixelmap';
        case RES_TYPE_ADD_STRING:   return 'guixStudio.addString';
        default:                    return 'guixStudio.addResource';
    }
}

function isLeafType(t: number): boolean {
    return t === RES_TYPE_COLOR
        || t === RES_TYPE_FONT
        || t === RES_TYPE_PIXELMAP
        || t === RES_TYPE_STRING
        || isAddType(t);
}

function isAddType(t: number): boolean {
    return t === RES_TYPE_ADD_COLOR
        || t === RES_TYPE_ADD_FONT
        || t === RES_TYPE_ADD_PIXELMAP
        || t === RES_TYPE_ADD_STRING;
}

function resContextValue(t: number): string {
    switch (t) {
        case RES_TYPE_HEADER:       return 'resHeader';
        case RES_TYPE_GROUP:        return 'resGroup';
        case RES_TYPE_FOLDER:       return 'resFolder';
        case RES_TYPE_COLOR:        return 'resColor';
        case RES_TYPE_FONT:         return 'resFont';
        case RES_TYPE_PIXELMAP:     return 'resPixelmap';
        case RES_TYPE_STRING:       return 'resString';
        case RES_TYPE_ADD_COLOR:    return 'resAddColor';
        case RES_TYPE_ADD_FONT:     return 'resAddFont';
        case RES_TYPE_ADD_PIXELMAP: return 'resAddPixelmap';
        case RES_TYPE_ADD_STRING:   return 'resAddString';
        default:                    return 'resUnknown';
    }
}

function iconForResType(t: number, res: ResInfo | undefined): vscode.ThemeIcon {
    switch (t) {
        case RES_TYPE_HEADER:       return new vscode.ThemeIcon('symbol-namespace');
        case RES_TYPE_GROUP:        return new vscode.ThemeIcon('folder-opened');
        case RES_TYPE_FOLDER:       return new vscode.ThemeIcon('folder');
        case RES_TYPE_COLOR:        return colorSwatch(res);
        case RES_TYPE_FONT:         return new vscode.ThemeIcon('text-size');
        case RES_TYPE_PIXELMAP:     return new vscode.ThemeIcon('file-media');
        case RES_TYPE_STRING:       return new vscode.ThemeIcon('symbol-string');
        case RES_TYPE_ADD_COLOR:
        case RES_TYPE_ADD_FONT:
        case RES_TYPE_ADD_PIXELMAP:
        case RES_TYPE_ADD_STRING:   return new vscode.ThemeIcon('add');
        default:                    return new vscode.ThemeIcon('circle-outline');
    }
}

function colorSwatch(res: ResInfo | undefined): vscode.ThemeIcon {
    // VS Code doesn't support inline color swatches in tree items via ThemeIcon;
    // use a generic color icon.  A future enhancement could use a webview panel
    // or a custom TreeItem decoration.
    if (res && res.colorval !== 0) {
        return new vscode.ThemeIcon('symbol-color');
    }
    return new vscode.ThemeIcon('symbol-color');
}

function tooltipForNode(node: ResourceNode): string {
    if (!node.resInfo) return node.label;
    const r = node.resInfo;
    switch (r.type) {
        case RES_TYPE_COLOR: {
            const hex = (r.colorval >>> 0).toString(16).toUpperCase().padStart(8, '0');
            return `${r.name}  #${hex}`;
        }
        case RES_TYPE_FONT:
            return `${r.name}  ${r.font_height}px`;
        case RES_TYPE_PIXELMAP:
            return r.pathinfo.pathname ? `${r.name}  ${r.pathinfo.pathname}` : r.name;
        default:
            return r.name;
    }
}
