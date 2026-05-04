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
import { GxpProject, DisplayInfo } from '../common/project-model';
import { WidgetInfo, FolderInfo } from '../common/widget-info';
export type ProjectNodeKind = 'root' | 'display' | 'folder' | 'widget';
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
export declare class ProjectView implements vscode.TreeDataProvider<ProjectNode> {
    private readonly _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<void | ProjectNode | ProjectNode[] | null | undefined>;
    private project;
    /** Currently selected widget info, broadast to other panels. */
    private _selectedWidget;
    get selectedWidget(): WidgetInfo | null;
    /** Listeners notified when the selection changes. */
    private selectionListeners;
    /** Called by the extension when a project is opened / reloaded. */
    openProject(project: GxpProject): void;
    /** Called by the extension when the project is closed. */
    closeProject(): void;
    /** Notify that a widget's name was changed externally (e.g. via property panel). */
    notifyNameChange(widget: WidgetInfo): void;
    /** Notify that the whole tree must be rebuilt (e.g. add/delete screen). */
    refresh(): void;
    /** Registers a listener called when the user selects a widget node. */
    onSelectionChange(listener: (w: WidgetInfo | null) => void): void;
    /** Called by the extension's `onDidChangeSelection` handler from the registered view. */
    handleSelectionChange(nodes: readonly ProjectNode[]): void;
    getTreeItem(node: ProjectNode): vscode.TreeItem;
    getChildren(node?: ProjectNode): vscode.ProviderResult<ProjectNode[]>;
    getParent(_node: ProjectNode): vscode.ProviderResult<ProjectNode>;
    private hasChildren;
    private tooltipForNode;
    /**
     * Walk every widget in every display to find a node wrapping the given
     * WidgetInfo reference.  Returns null if not found.
     */
    private findNodeForWidget;
}
//# sourceMappingURL=project-view.d.ts.map