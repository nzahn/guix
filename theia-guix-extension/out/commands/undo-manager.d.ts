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
import { GxpProject } from '../common/project-model';
import { WidgetInfo } from '../common/widget-info';
import { GxRectangle } from '../common/widget-info';
export declare const UNDO_TYPE_NONE = 0;
export declare const UNDO_TYPE_POSITION = 1;
export declare const UNDO_TYPE_SIZE = 2;
export declare const UNDO_TYPE_STYLE = 3;
export declare const UNDO_TYPE_SLIDER_INFO = 4;
export declare const UNDO_TYPE_PROGRESS_BAR_INFO = 5;
export declare const UNDO_TYPE_RADIAL_PROGRESS_BAR_INFO = 6;
export declare const UNDO_TYPE_LIST_ROWS = 7;
export declare const UNDO_TYPE_OPEN_HEIGHT = 8;
export declare const UNDO_TYPE_DYNAMIC_TEXT_BUFFER = 9;
export declare const UNDO_TYPE_TEXT_VIEW_LINE_SPACE = 10;
export declare const UNDO_TYPE_TEXT_VIEW_WHITESPACE = 11;
export declare const UNDO_TYPE_TEXT_BUFFER_SIZE = 12;
export declare const UNDO_TYPE_SCROLL_APPEARANCE = 13;
export declare const UNDO_TYPE_SCROLL_STYLE = 14;
export declare const UNDO_TYPE_INSERT_WIDGET = 15;
export declare const UNDO_TYPE_DELETE_WIDGET = 16;
export declare const UNDO_TYPE_COLOR = 17;
export declare const UNDO_TYPE_FONT = 18;
export declare const UNDO_TYPE_PIXELMAP = 19;
export declare const UNDO_TYPE_STRING = 20;
export declare const UNDO_TYPE_NAMES = 21;
export declare const UNDO_TYPE_USER_DATA = 22;
export declare const UNDO_TYPE_ALLOCATION = 23;
export declare const UNDO_TYPE_FOCUS = 24;
export declare const UNDO_TYPE_CIRCULAR_GAUGE_INFO = 25;
export declare const UNDO_TYPE_CHART_INFO = 26;
export declare const UNDO_TYPE_SCROLL_WHEEL_INFO = 27;
export declare const UNDO_TYPE_TEXT_SCROLL_WHEEL_INFO = 28;
export declare const UNDO_TYPE_STRING_SCROLL_WHEEL_INFO = 29;
export declare const UNDO_TYPE_NUMERIC_SCROLL_WHEEL_INFO = 30;
export declare const UNDO_TYPE_TEMPLATE = 31;
export declare const UNDO_TYPE_NUMERIC_PROMPT_INFO = 32;
export declare const UNDO_TYPE_MENU_INFO = 33;
export declare const UNDO_TYPE_TREE_VIEW_INFO = 34;
export declare const UNDO_TYPE_VISIBLE_AT_STARTUP = 35;
export declare const UNDO_TYPE_INSERT_FOLDER = 36;
export declare const UNDO_TYPE_DELETE_FOLDER = 37;
export declare const UNDO_TYPE_INSERT_TOP_LEVEL_WIDGETS = 38;
export declare const UNDO_TYPE_RADIAL_SLIDER_INFO = 39;
export interface ICommand {
    /** Unique type tag (UNDO_TYPE_*). Used for fold detection. */
    readonly undoType: number;
    /** Human-readable label for display in "Undo <label>" menu items. */
    readonly label: string;
    /** Apply the command. */
    execute(project: GxpProject): void;
    /** Reverse the command. */
    undo(project: GxpProject): void;
}
/** Move / resize one widget. */
export declare class MoveWidgetCommand implements ICommand {
    private readonly widget;
    private readonly newRect;
    private readonly oldRect;
    readonly undoType = 1;
    readonly label = "Move Widget";
    constructor(widget: WidgetInfo, newRect: GxRectangle, oldRect: GxRectangle);
    execute(_project: GxpProject): void;
    undo(_project: GxpProject): void;
}
/** Change a single numeric/string property on a widget. */
export declare class ChangePropertyCommand<T> implements ICommand {
    private readonly widget;
    private readonly field;
    private readonly newValue;
    private readonly oldValue;
    readonly undoType: number;
    readonly label: string;
    constructor(undoType: number, label: string, widget: WidgetInfo, field: keyof WidgetInfo, newValue: T, oldValue: T);
    execute(_project: GxpProject): void;
    undo(_project: GxpProject): void;
}
/** Insert a widget into a parent's children array at a given index. */
export declare class InsertWidgetCommand implements ICommand {
    private readonly parent;
    private readonly folder;
    private readonly widget;
    private readonly index;
    readonly undoType = 15;
    readonly label = "Insert Widget";
    constructor(parent: WidgetInfo | null, folder: import('../common/widget-info').FolderInfo | null, widget: WidgetInfo, index: number);
    execute(_project: GxpProject): void;
    undo(_project: GxpProject): void;
}
/** Delete a widget from its parent. */
export declare class DeleteWidgetCommand implements ICommand {
    private readonly parent;
    private readonly folder;
    private readonly widget;
    readonly undoType = 16;
    readonly label = "Delete Widget";
    private savedIndex;
    constructor(parent: WidgetInfo | null, folder: import('../common/widget-info').FolderInfo | null, widget: WidgetInfo);
    execute(_project: GxpProject): void;
    undo(_project: GxpProject): void;
}
export declare class CompositeCommand implements ICommand {
    readonly undoType: number;
    readonly label: string;
    private readonly cmds;
    constructor(undoType: number, label: string, cmds: ICommand[]);
    execute(project: GxpProject): void;
    undo(project: GxpProject): void;
}
export declare class UndoManager {
    private undoStack;
    private redoStack;
    private locked;
    /**
     * Push a command, execute it, and clear the redo stack.
     *
     * @param cmd   The command to execute and record.
     * @param fold  If true and the last undo entry has the same undoType,
     *              merge by discarding the previous entry's new-state snapshot
     *              (matches C++ fold behaviour).
     */
    push(cmd: ICommand, project: GxpProject, fold?: boolean): void;
    undo(project: GxpProject): boolean;
    redo(project: GxpProject): boolean;
    reset(): void;
    canUndo(): boolean;
    canRedo(): boolean;
    undoLabel(): string;
    redoLabel(): string;
    countEntries(): number;
    /**
     * Run a callback with undo recording suspended.
     * Used when programmatic changes (e.g. from undo itself) should not be
     * recorded again.
     */
    withLock(fn: () => void): void;
}
//# sourceMappingURL=undo-manager.d.ts.map