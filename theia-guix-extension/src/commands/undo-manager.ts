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

import { injectable } from 'inversify';
import { GxpProject } from '../common/project-model';
import { WidgetInfo } from '../common/widget-info';
import { GxRectangle } from '../common/widget-info';

// ---------------------------------------------------------------------------
// Undo type constants (mirrors undo_types enum in undo_manager.h)
// ---------------------------------------------------------------------------

export const UNDO_TYPE_NONE                       = 0;
export const UNDO_TYPE_POSITION                   = 1;
export const UNDO_TYPE_SIZE                       = 2;
export const UNDO_TYPE_STYLE                      = 3;
export const UNDO_TYPE_SLIDER_INFO                = 4;
export const UNDO_TYPE_PROGRESS_BAR_INFO          = 5;
export const UNDO_TYPE_RADIAL_PROGRESS_BAR_INFO   = 6;
export const UNDO_TYPE_LIST_ROWS                  = 7;
export const UNDO_TYPE_OPEN_HEIGHT                = 8;
export const UNDO_TYPE_DYNAMIC_TEXT_BUFFER        = 9;
export const UNDO_TYPE_TEXT_VIEW_LINE_SPACE       = 10;
export const UNDO_TYPE_TEXT_VIEW_WHITESPACE       = 11;
export const UNDO_TYPE_TEXT_BUFFER_SIZE           = 12;
export const UNDO_TYPE_SCROLL_APPEARANCE          = 13;
export const UNDO_TYPE_SCROLL_STYLE               = 14;
export const UNDO_TYPE_INSERT_WIDGET              = 15;
export const UNDO_TYPE_DELETE_WIDGET              = 16;
export const UNDO_TYPE_COLOR                      = 17;
export const UNDO_TYPE_FONT                       = 18;
export const UNDO_TYPE_PIXELMAP                   = 19;
export const UNDO_TYPE_STRING                     = 20;
export const UNDO_TYPE_NAMES                      = 21;
export const UNDO_TYPE_USER_DATA                  = 22;
export const UNDO_TYPE_ALLOCATION                 = 23;
export const UNDO_TYPE_FOCUS                      = 24;
export const UNDO_TYPE_CIRCULAR_GAUGE_INFO        = 25;
export const UNDO_TYPE_CHART_INFO                 = 26;
export const UNDO_TYPE_SCROLL_WHEEL_INFO          = 27;
export const UNDO_TYPE_TEXT_SCROLL_WHEEL_INFO     = 28;
export const UNDO_TYPE_STRING_SCROLL_WHEEL_INFO   = 29;
export const UNDO_TYPE_NUMERIC_SCROLL_WHEEL_INFO  = 30;
export const UNDO_TYPE_TEMPLATE                   = 31;
export const UNDO_TYPE_NUMERIC_PROMPT_INFO        = 32;
export const UNDO_TYPE_MENU_INFO                  = 33;
export const UNDO_TYPE_TREE_VIEW_INFO             = 34;
export const UNDO_TYPE_VISIBLE_AT_STARTUP         = 35;
export const UNDO_TYPE_INSERT_FOLDER              = 36;
export const UNDO_TYPE_DELETE_FOLDER              = 37;
export const UNDO_TYPE_INSERT_TOP_LEVEL_WIDGETS   = 38;
export const UNDO_TYPE_RADIAL_SLIDER_INFO         = 39;

const MAX_UNDO_ENTRIES = 40;

// ---------------------------------------------------------------------------
// ICommand — base interface for all undoable operations
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Built-in command implementations
// ---------------------------------------------------------------------------

/** Move / resize one widget. */
export class MoveWidgetCommand implements ICommand {
    readonly undoType = UNDO_TYPE_POSITION;
    readonly label    = 'Move Widget';

    constructor(
        private readonly widget: WidgetInfo,
        private readonly newRect: GxRectangle,
        private readonly oldRect: GxRectangle,
    ) {}

    execute(_project: GxpProject): void {
        Object.assign(this.widget.size, this.newRect);
    }

    undo(_project: GxpProject): void {
        Object.assign(this.widget.size, this.oldRect);
    }
}

/** Change a single numeric/string property on a widget. */
export class ChangePropertyCommand<T> implements ICommand {
    readonly undoType: number;
    readonly label: string;

    constructor(
        undoType: number,
        label: string,
        private readonly widget: WidgetInfo,
        private readonly field: keyof WidgetInfo,
        private readonly newValue: T,
        private readonly oldValue: T,
    ) {
        this.undoType = undoType;
        this.label    = label;
    }

    execute(_project: GxpProject): void {
        (this.widget as unknown as Record<string, unknown>)[this.field as string] = this.newValue;
    }

    undo(_project: GxpProject): void {
        (this.widget as unknown as Record<string, unknown>)[this.field as string] = this.oldValue;
    }
}

/** Insert a widget into a parent's children array at a given index. */
export class InsertWidgetCommand implements ICommand {
    readonly undoType = UNDO_TYPE_INSERT_WIDGET;
    readonly label    = 'Insert Widget';

    constructor(
        private readonly parent: WidgetInfo | null,
        private readonly folder: import('../common/widget-info').FolderInfo | null,
        private readonly widget: WidgetInfo,
        private readonly index: number,
    ) {}

    execute(_project: GxpProject): void {
        if (this.parent) {
            this.parent.children.splice(this.index, 0, this.widget);
        } else if (this.folder) {
            this.folder.widgets.splice(this.index, 0, this.widget);
        }
    }

    undo(_project: GxpProject): void {
        if (this.parent) {
            this.parent.children.splice(this.index, 1);
        } else if (this.folder) {
            this.folder.widgets.splice(this.index, 1);
        }
    }
}

/** Delete a widget from its parent. */
export class DeleteWidgetCommand implements ICommand {
    readonly undoType = UNDO_TYPE_DELETE_WIDGET;
    readonly label    = 'Delete Widget';

    private savedIndex = 0;

    constructor(
        private readonly parent: WidgetInfo | null,
        private readonly folder: import('../common/widget-info').FolderInfo | null,
        private readonly widget: WidgetInfo,
    ) {}

    execute(_project: GxpProject): void {
        if (this.parent) {
            this.savedIndex = this.parent.children.indexOf(this.widget);
            this.parent.children.splice(this.savedIndex, 1);
        } else if (this.folder) {
            this.savedIndex = this.folder.widgets.indexOf(this.widget);
            this.folder.widgets.splice(this.savedIndex, 1);
        }
    }

    undo(_project: GxpProject): void {
        if (this.parent) {
            this.parent.children.splice(this.savedIndex, 0, this.widget);
        } else if (this.folder) {
            this.folder.widgets.splice(this.savedIndex, 0, this.widget);
        }
    }
}

// ---------------------------------------------------------------------------
// Composite / macro command (fold multiple operations into one undo step)
// ---------------------------------------------------------------------------

export class CompositeCommand implements ICommand {
    readonly undoType: number;
    readonly label: string;
    private readonly cmds: ICommand[];

    constructor(undoType: number, label: string, cmds: ICommand[]) {
        this.undoType = undoType;
        this.label    = label;
        this.cmds     = [...cmds];
    }

    execute(project: GxpProject): void {
        for (const c of this.cmds) c.execute(project);
    }

    undo(project: GxpProject): void {
        for (let i = this.cmds.length - 1; i >= 0; i--) {
            this.cmds[i].undo(project);
        }
    }
}

// ---------------------------------------------------------------------------
// UndoManager
// ---------------------------------------------------------------------------

@injectable()
export class UndoManager {

    private undoStack: ICommand[] = [];
    private redoStack: ICommand[] = [];
    private locked = false;

    /**
     * Push a command, execute it, and clear the redo stack.
     *
     * @param cmd   The command to execute and record.
     * @param fold  If true and the last undo entry has the same undoType,
     *              merge by discarding the previous entry's new-state snapshot
     *              (matches C++ fold behaviour).
     */
    push(cmd: ICommand, project: GxpProject, fold = false): void {
        if (this.locked) return;

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

    undo(project: GxpProject): boolean {
        if (this.undoStack.length === 0) return false;
        const cmd = this.undoStack.pop()!;
        cmd.undo(project);
        this.redoStack.push(cmd);
        return true;
    }

    redo(project: GxpProject): boolean {
        if (this.redoStack.length === 0) return false;
        const cmd = this.redoStack.pop()!;
        cmd.execute(project);
        this.undoStack.push(cmd);
        return true;
    }

    reset(): void {
        this.undoStack = [];
        this.redoStack = [];
    }

    canUndo(): boolean { return this.undoStack.length > 0; }
    canRedo(): boolean { return this.redoStack.length > 0; }

    undoLabel(): string {
        return this.undoStack.length > 0
            ? this.undoStack[this.undoStack.length - 1].label
            : '';
    }
    redoLabel(): string {
        return this.redoStack.length > 0
            ? this.redoStack[this.redoStack.length - 1].label
            : '';
    }

    countEntries(): number { return this.undoStack.length; }

    /**
     * Run a callback with undo recording suspended.
     * Used when programmatic changes (e.g. from undo itself) should not be
     * recorded again.
     */
    withLock(fn: () => void): void {
        this.locked = true;
        try { fn(); } finally { this.locked = false; }
    }
}
