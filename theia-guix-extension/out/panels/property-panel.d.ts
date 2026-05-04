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
import { GxpProject } from '../common/project-model';
import { WidgetInfo } from '../common/widget-info';
export interface IPropertyPanel {
    showWidget(widget: WidgetInfo | null, project: GxpProject | null): void;
    widgetWasModified(widget: WidgetInfo): void;
}
/** Identifies a single property mutation. */
export interface PropertyChangeEvent {
    readonly field: string;
    readonly value: unknown;
}
export declare class PropertyPanel implements vscode.WebviewViewProvider, IPropertyPanel {
    static readonly viewId = "guixStudio.propertyPanel";
    private view;
    private currentWidget;
    private currentProject;
    /** Listeners notified when the user edits a property. */
    private changeListeners;
    onPropertyChange(listener: (w: WidgetInfo, e: PropertyChangeEvent) => void): void;
    showWidget(widget: WidgetInfo | null, project: GxpProject | null): void;
    widgetWasModified(widget: WidgetInfo): void;
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    private updateView;
    private onMessage;
    private buildHtml;
}
/**
 * Mutates `widget` in place for the given property field + value.
 * Supports dotted paths: 'size.left', 'color_id.0', 'style_visible', etc.
 */
export declare function applyPropertyChange(widget: WidgetInfo, event: PropertyChangeEvent): void;
//# sourceMappingURL=property-panel.d.ts.map