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
import { GxpProject } from '../common/project-model';
export declare const enum TriggerType {
    SystemEvent = 0,
    Signal = 1,
    UserEvent = 2
}
export declare const enum ActionType {
    ScreenShow = 0,
    ScreenHide = 1,
    ScreenToggle = 2,
    ScreenAttach = 3,
    AnimationExecute = 4
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
    positions: Record<string, {
        x: number;
        y: number;
    }>;
}
export declare class ScreenFlowEditor implements vscode.WebviewViewProvider {
    static readonly viewId = "guixStudio.screenFlowEditor";
    private view;
    private project;
    private displayIndex;
    /** Per-display layout (positions + zoom), keyed by display index */
    private layouts;
    openProject(project: GxpProject): void;
    closeProject(): void;
    selectDisplay(index: number): void;
    /** Called when a screen was renamed — update diagram labels. */
    updateScreenName(oldName: string, newName: string): void;
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    private get activeDisplay();
    private layoutFor;
    private updateView;
    private onMessage;
}
//# sourceMappingURL=screen-flow-editor.d.ts.map