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
import { ResInfo } from '../common/res-info';
import { GxpProject } from '../common/project-model';
export interface ResourceNode {
    readonly id: string;
    readonly label: string;
    readonly type: number;
    readonly resInfo?: ResInfo;
    /** For group/header nodes — child nodes are built lazily. */
    readonly children?: ResourceNode[];
}
export declare class ResourcePanel implements vscode.TreeDataProvider<ResourceNode> {
    static readonly viewId = "guixStudio.resourcePanel";
    private readonly _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<void | ResourceNode | ResourceNode[] | null | undefined>;
    private project;
    private displayIndex;
    openProject(project: GxpProject): void;
    closeProject(): void;
    /** Switch active display; resets theme to 0. */
    selectDisplay(index: number): void;
    /** Switch active theme within the current display. */
    selectTheme(_index: number): void;
    /** Notify a resource was added, renamed or deleted. */
    refresh(): void;
    private get activeDisplay();
    getTreeItem(node: ResourceNode): vscode.TreeItem;
    getChildren(node?: ResourceNode): vscode.ProviderResult<ResourceNode[]>;
    getParent(_node: ResourceNode): vscode.ProviderResult<ResourceNode>;
}
//# sourceMappingURL=resource-panel.d.ts.map