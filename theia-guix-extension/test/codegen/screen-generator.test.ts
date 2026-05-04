/**
 * screen-generator.test.ts — structural tests for ScreenGenerator.
 */

import { ScreenGenerator } from '../../src/codegen/screen-generator';
import { createEmptyProject } from '../../src/common/project-model';
import { GX_TYPE_WINDOW, GX_TYPE_BUTTON } from '../../src/common/gx-types';
import { createDefaultWidgetInfo } from '../../src/common/widget-info';
import type { FolderInfo } from '../../src/common/widget-info';

function gen(): ScreenGenerator {
    return new ScreenGenerator();
}

// ---------------------------------------------------------------------------
// Minimal project — no screens
// ---------------------------------------------------------------------------

describe('ScreenGenerator — minimal project (no screens)', () => {
    const project = createEmptyProject('TestApp');
    project.displays[0].name = 'Display_1';

    const files = gen().generate(project, 0);

    it('header filename follows naming convention', () => {
        expect(files.header.filename).toMatch(/specifications\.h$/i);
        expect(files.header.filename).toContain('TestApp');
    });

    it('source filename follows naming convention', () => {
        expect(files.source.filename).toMatch(/specifications\.c$/i);
        expect(files.source.filename).toContain('TestApp');
    });

    it('header has ifndef guard', () => {
        expect(files.header.content).toContain('#ifndef');
        expect(files.header.content).toContain('#endif');
    });

    it('header includes gx_api.h', () => {
        expect(files.header.content).toContain('gx_api.h');
    });

    it('source uses CRLF line endings', () => {
        expect(files.source.content).toContain('\r\n');
    });

    it('source includes own resource header', () => {
        expect(files.source.content).toContain('_resources.h');
    });
});

// ---------------------------------------------------------------------------
// Project with one window screen
// ---------------------------------------------------------------------------

describe('ScreenGenerator — project with one window', () => {
    const project = createEmptyProject('MyApp');
    project.displays[0].name = 'Display_1';

    const folder: FolderInfo = {
        folder_name: 'Screens',
        output_filename: 'myapp_specifications',
        widgets: [],
    };

    const win = createDefaultWidgetInfo(GX_TYPE_WINDOW);
    win.app_name = 'main_screen';
    win.id_name  = 'ID_MAIN_SCREEN';
    win.size     = { left: 0, top: 0, right: 319, bottom: 239 };

    const btn = createDefaultWidgetInfo(GX_TYPE_BUTTON);
    btn.app_name = 'ok_button';
    btn.id_name  = 'ID_OK_BUTTON';
    btn.size     = { left: 10, top: 10, right: 80, bottom: 40 };
    win.children.push(btn);

    folder.widgets.push(win);
    project.displays[0].folders.push(folder);

    const files = gen().generate(project, 0);

    it('header defines widget ID for the window', () => {
        expect(files.header.content).toContain('ID_MAIN_SCREEN');
    });

    it('header defines widget ID for the button', () => {
        expect(files.header.content).toContain('ID_OK_BUTTON');
    });

    it('source references window control block type', () => {
        expect(files.source.content).toContain('GX_WINDOW');
    });

    it('source references button control block type', () => {
        expect(files.source.content).toContain('GX_BUTTON');
    });

    it('source references widget app names', () => {
        expect(files.source.content).toContain('main_screen');
        expect(files.source.content).toContain('ok_button');
    });
});

// ---------------------------------------------------------------------------
// Multi-display project uses display name in filename
// ---------------------------------------------------------------------------

describe('ScreenGenerator — multi-display project', () => {
    const project = createEmptyProject('MultiApp');
    project.displays[0].name = 'Display_1';
    project.displays[0].enabled = true;
    const { createDefaultDisplay } = require('../../src/common/project-model');
    project.displays[1] = createDefaultDisplay('Display_2');
    project.displays[1].enabled = true;
    project.header.num_displays = 2;

    const files0 = gen().generate(project, 0);
    const files1 = gen().generate(project, 1);

    it('display 0 filenames include project + display name', () => {
        expect(files0.header.filename).toContain('MultiApp');
        expect(files0.header.filename).toContain('Display_1');
    });

    it('display 1 filenames include display_2', () => {
        expect(files1.header.filename).toContain('Display_2');
    });

    it('files are distinct', () => {
        expect(files0.header.filename).not.toBe(files1.header.filename);
    });
});
