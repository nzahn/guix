/**
 * undo-manager.test.ts — unit tests for the UndoManager and ICommand types.
 */

import { UndoManager, MoveWidgetCommand } from '../../src/commands/undo-manager';
import { createDefaultWidgetInfo } from '../../src/common/widget-info';
import { GxpProject } from '../../src/common/project-model';
import { GX_TYPE_WIDGET } from '../../src/common/gx-types';

function makeProject(): GxpProject {
    return { header: {} as never, displays: [], filePath: '', isModified: false };
}

describe('UndoManager', () => {
    let mgr: UndoManager;
    let project: GxpProject;

    beforeEach(() => {
        mgr     = new UndoManager();
        project = makeProject();
    });

    it('starts with empty stacks', () => {
        expect(mgr.canUndo()).toBe(false);
        expect(mgr.canRedo()).toBe(false);
    });

    it('executes the command on push', () => {
        const widget = createDefaultWidgetInfo(GX_TYPE_WIDGET);
        const oldRect = { ...widget.size };
        const newRect = { left: 10, top: 20, right: 110, bottom: 70 };
        const cmd = new MoveWidgetCommand(widget, newRect, oldRect);

        mgr.push(cmd, project);

        expect(widget.size).toEqual(newRect);
        expect(mgr.canUndo()).toBe(true);
        expect(mgr.canRedo()).toBe(false);
    });

    it('undoes the last command', () => {
        const widget = createDefaultWidgetInfo(GX_TYPE_WIDGET);
        const oldRect = { ...widget.size };
        const newRect = { left: 10, top: 20, right: 110, bottom: 70 };
        const cmd = new MoveWidgetCommand(widget, newRect, oldRect);

        mgr.push(cmd, project);
        mgr.undo(project);

        expect(widget.size).toEqual(oldRect);
        expect(mgr.canUndo()).toBe(false);
        expect(mgr.canRedo()).toBe(true);
    });

    it('redoes an undone command', () => {
        const widget = createDefaultWidgetInfo(GX_TYPE_WIDGET);
        const oldRect = { ...widget.size };
        const newRect = { left: 10, top: 20, right: 110, bottom: 70 };
        const cmd = new MoveWidgetCommand(widget, newRect, oldRect);

        mgr.push(cmd, project);
        mgr.undo(project);
        mgr.redo(project);

        expect(widget.size).toEqual(newRect);
        expect(mgr.canRedo()).toBe(false);
    });

    it('clears the redo stack on new command', () => {
        const widget = createDefaultWidgetInfo(GX_TYPE_WIDGET);
        const r1 = { left: 1, top: 1, right: 10, bottom: 10 };
        const r2 = { left: 2, top: 2, right: 20, bottom: 20 };
        const r3 = { left: 3, top: 3, right: 30, bottom: 30 };

        mgr.push(new MoveWidgetCommand(widget, r1, { ...widget.size }), project);
        mgr.push(new MoveWidgetCommand(widget, r2, r1), project);
        mgr.undo(project);

        expect(mgr.canRedo()).toBe(true);

        mgr.push(new MoveWidgetCommand(widget, r3, r1), project);

        expect(mgr.canRedo()).toBe(false);
    });

    it('respects MAX_UNDO_ENTRIES (40)', () => {
        const widget = createDefaultWidgetInfo(GX_TYPE_WIDGET);
        for (let i = 0; i < 45; i++) {
            const prev = { ...widget.size };
            const next = { left: i, top: i, right: i + 10, bottom: i + 10 };
            mgr.push(new MoveWidgetCommand(widget, next, prev), project);
        }
        expect(mgr.countEntries()).toBe(40);
    });

    it('reset clears both stacks', () => {
        const widget = createDefaultWidgetInfo(GX_TYPE_WIDGET);
        mgr.push(new MoveWidgetCommand(widget,
            { left: 1, top: 1, right: 10, bottom: 10 },
            { ...widget.size }), project);

        mgr.reset();

        expect(mgr.canUndo()).toBe(false);
        expect(mgr.canRedo()).toBe(false);
        expect(mgr.countEntries()).toBe(0);
    });
});
