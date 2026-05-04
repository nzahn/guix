/**
 * Tests for applyPropertyChange() and buildPropertyGroups() (via HTML output).
 */

import { applyPropertyChange, PropertyChangeEvent } from '../../src/panels/property-panel';
import { createDefaultWidgetInfo, WidgetInfo } from '../../src/common/widget-info';
import { createEmptyProject } from '../../src/common/project-model';
import {
    GX_TYPE_BUTTON,
    GX_TYPE_SLIDER,
    GX_TYPE_CIRCULAR_GAUGE,
    GX_TYPE_STRING_SCROLL_WHEEL,
    GX_TYPE_SINGLE_LINE_TEXT_INPUT,
    RES_TYPE_COLOR,
    RES_TYPE_FONT,
} from '../../src/common/gx-types';
import { createDefaultResInfo } from '../../src/common/res-info';

// ---------------------------------------------------------------------------
// Helper — apply + return mutated widget
// ---------------------------------------------------------------------------

function apply(widget: WidgetInfo, field: string, value: unknown): WidgetInfo {
    applyPropertyChange(widget, { field, value } as PropertyChangeEvent);
    return widget;
}

// ===========================================================================
// applyPropertyChange — scalar / geometry fields
// ===========================================================================

describe('applyPropertyChange — scalar fields', () => {

    test('sets app_name', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        apply(w, 'app_name', 'my_button');
        expect(w.app_name).toBe('my_button');
    });

    test('sets id_name', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        apply(w, 'id_name', 'ID_BTN_OK');
        expect(w.id_name).toBe('ID_BTN_OK');
    });

    test('sets draw_func', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        apply(w, 'draw_func', 'my_draw');
        expect(w.draw_func).toBe('my_draw');
    });

    test('sets callback_func', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        apply(w, 'callback_func', 'on_press');
        expect(w.callback_func).toBe('on_press');
    });

    test('sets format_func', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        apply(w, 'format_func', 'fmt_val');
        expect(w.format_func).toBe('fmt_val');
    });
});

// ===========================================================================
// applyPropertyChange — geometry
// ===========================================================================

describe('applyPropertyChange — geometry', () => {

    test('sets size.left', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        apply(w, 'size.left', 42);
        expect(w.size.left).toBe(42);
    });

    test('sets size.top', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        apply(w, 'size.top', 10);
        expect(w.size.top).toBe(10);
    });

    test('sets size.right as number', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        apply(w, 'size.right', '200');  // string value coerced
        expect(w.size.right).toBe(200);
    });

    test('sets size.bottom', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        apply(w, 'size.bottom', 80);
        expect(w.size.bottom).toBe(80);
    });
});

// ===========================================================================
// applyPropertyChange — resource IDs
// ===========================================================================

describe('applyPropertyChange — resource IDs', () => {

    test('sets color_id[0]', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        apply(w, 'color_id.0', 3);
        expect(w.color_id[0]).toBe(3);
    });

    test('sets color_id[2]', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        apply(w, 'color_id.2', 7);
        expect(w.color_id[2]).toBe(7);
    });

    test('sets font_id[0]', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        apply(w, 'font_id.0', 2);
        expect(w.font_id[0]).toBe(2);
    });

    test('sets pixelmap_id[1]', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        apply(w, 'pixelmap_id.1', 5);
        expect(w.pixelmap_id[1]).toBe(5);
    });

    test('sets string_id[0]', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        apply(w, 'string_id.0', 4);
        expect(w.string_id[0]).toBe(4);
    });

    test('ignores out-of-range color_id index', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        const before = w.color_id.slice();
        apply(w, 'color_id.99', 9);
        expect(w.color_id).toEqual(before);
    });
});

// ===========================================================================
// applyPropertyChange — style bits
// ===========================================================================

describe('applyPropertyChange — style bits', () => {

    test('toggles style_visible on', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        w.style = 0;
        apply(w, 'style_visible', true);
        expect(w.style & 0x00000001).toBe(1);
    });

    test('toggles style_visible off', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        w.style = 0xFFFF;
        apply(w, 'style_visible', false);
        expect(w.style & 0x00000001).toBe(0);
    });

    test('sets border bits', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        w.style = 0;
        apply(w, 'border', 2);  // Raised
        expect((w.style >> 8) & 0xF).toBe(2);
    });

    test('replaces existing border bits', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        w.style = 0x0300; // border = 3
        apply(w, 'border', 1);
        expect((w.style >> 8) & 0xF).toBe(1);
    });
});

// ===========================================================================
// applyPropertyChange — ext.* (SliderInfo)
// ===========================================================================

describe('applyPropertyChange — ext.* (slider)', () => {

    function makeSlider(): WidgetInfo {
        const w = createDefaultWidgetInfo(GX_TYPE_SLIDER);
        w.ewi = {
            kind: 'slider',
            info: {
                min_val: 0, max_val: 100, current_val: 50,
                increment: 1, min_travel: 0, max_travel: 100,
                needle_width: 10, needle_height: 20,
                needle_inset: 5, needle_hotspot: 0,
            },
        };
        return w;
    }

    test('sets ext.min_val', () => {
        const w = makeSlider();
        apply(w, 'ext.min_val', 10);
        expect(w.ewi!.kind === 'slider' && w.ewi.info.min_val).toBe(10);
    });

    test('sets ext.max_val', () => {
        const w = makeSlider();
        apply(w, 'ext.max_val', 200);
        expect(w.ewi!.kind === 'slider' && w.ewi.info.max_val).toBe(200);
    });

    test('sets ext.current_val', () => {
        const w = makeSlider();
        apply(w, 'ext.current_val', 50);
        expect(w.ewi!.kind === 'slider' && w.ewi.info.current_val).toBe(50);
    });

    test('sets ext.needle_width', () => {
        const w = makeSlider();
        apply(w, 'ext.needle_width', 8);
        expect(w.ewi!.kind === 'slider' && w.ewi.info.needle_width).toBe(8);
    });

    test('ignores unknown ext key', () => {
        const w = makeSlider();
        // Should not throw
        expect(() => apply(w, 'ext.nonexistent_key', 99)).not.toThrow();
    });
});

// ===========================================================================
// applyPropertyChange — ext.* (CircularGaugeInfo)
// ===========================================================================

describe('applyPropertyChange — ext.* (circular gauge)', () => {

    function makeGauge(): WidgetInfo {
        const w = createDefaultWidgetInfo(GX_TYPE_CIRCULAR_GAUGE);
        w.ewi = {
            kind: 'gauge',
            info: {
                xcenter: 0, ycenter: 0, radius: 50,
                needle_length: 40, needle_width: 5,
                needle_pixelmap: 0, start_angle: 0, end_angle: 360,
                increment: 1, current_angle: 0, min_angle: 0, max_angle: 360,
                animation_steps: 10, animation_delay: 1, animation_style: 0,
            },
        };
        return w;
    }

    test('sets ext.xcenter', () => {
        const w = makeGauge();
        apply(w, 'ext.xcenter', 80);
        expect(w.ewi!.kind === 'gauge' && w.ewi.info.xcenter).toBe(80);
    });

    test('sets ext.start_angle', () => {
        const w = makeGauge();
        apply(w, 'ext.start_angle', 45);
        expect(w.ewi!.kind === 'gauge' && w.ewi.info.start_angle).toBe(45);
    });
});

// ===========================================================================
// applyPropertyChange — ext.* (TextInputInfo with boolean field)
// ===========================================================================

describe('applyPropertyChange — ext.* (text input)', () => {

    function makeTextInput(): WidgetInfo {
        const w = createDefaultWidgetInfo(GX_TYPE_SINGLE_LINE_TEXT_INPUT);
        w.ewi = {
            kind: 'text_info',
            info: { whitespace: 4, line_space: 2, buffer_size: 128, dynamic_buffer: false },
        };
        return w;
    }

    test('sets ext.buffer_size', () => {
        const w = makeTextInput();
        apply(w, 'ext.buffer_size', 256);
        expect(w.ewi!.kind === 'text_info' && w.ewi.info.buffer_size).toBe(256);
    });

    test('sets ext.dynamic_buffer boolean', () => {
        const w = makeTextInput();
        apply(w, 'ext.dynamic_buffer', true);
        expect(w.ewi!.kind === 'text_info' && w.ewi.info.dynamic_buffer).toBe(true);
    });
});

// ===========================================================================
// applyPropertyChange — ext.* (string scroll wheel — nested .base)
// ===========================================================================

describe('applyPropertyChange — ext.* (string scroll wheel)', () => {

    function makeStringWheel(): WidgetInfo {
        const w = createDefaultWidgetInfo(GX_TYPE_STRING_SCROLL_WHEEL);
        w.ewi = {
            kind: 'string_scroll_wheel',
            info: {
                base: { total_rows: 5, row_height: 24, selected_row: 0, start_alpha: 255, end_alpha: 64 },
                string_id_list: [],
            },
        };
        return w;
    }

    test('sets ext.total_rows on base', () => {
        const w = makeStringWheel();
        apply(w, 'ext.total_rows', 20);
        expect(
            w.ewi!.kind === 'string_scroll_wheel' && w.ewi.info.base.total_rows
        ).toBe(20);
    });

    test('sets ext.row_height on base', () => {
        const w = makeStringWheel();
        apply(w, 'ext.row_height', 32);
        expect(
            w.ewi!.kind === 'string_scroll_wheel' && w.ewi.info.base.row_height
        ).toBe(32);
    });
});

// ===========================================================================
// resourceOpts — indirectly via HTML output snapshot
// Tests that resource dropdown options appear when project has resources
// ===========================================================================

import { PropertyPanel } from '../../src/panels/property-panel';

describe('PropertyPanel.buildHtml — resource dropdowns', () => {

    function makeProject() {
        const p = createEmptyProject('TestApp', '/tmp/TestApp.gxp');
        const theme = p.displays[0].themes[0];
        // Add a color and a font resource
        const col = createDefaultResInfo(RES_TYPE_COLOR, 'GX_COLOR_ID_RED');
        const fnt = createDefaultResInfo(RES_TYPE_FONT, 'GX_FONT_ID_SYSTEM');
        theme.resources.push(col, fnt);
        return p;
    }

    // Access the private buildHtml via reflection for white-box test
    function getHtml(widget: WidgetInfo, displayIdx = 0): string {
        const panel = new PropertyPanel();
        panel.showWidget(widget, makeProject(), displayIdx);
        // view is not set, so updateView is a no-op; call buildHtml directly
        return (panel as unknown as Record<string, (w: undefined, widget: WidgetInfo, displayIdx: number) => string>)
            ['buildHtml'](undefined, widget, displayIdx);
    }

    test('color dropdown contains resource name', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        const html = getHtml(w, 0);
        expect(html).toContain('GX_COLOR_ID_RED');
    });

    test('font dropdown contains resource name', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        const html = getHtml(w, 0);
        expect(html).toContain('GX_FONT_ID_SYSTEM');
    });

    test('contains (none) option for resources', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        const html = getHtml(w, 0);
        expect(html).toContain('(none)');
    });

    test('slider group appears for slider widget', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_SLIDER);
        w.ewi = {
            kind: 'slider',
            info: {
                min_val: 0, max_val: 100, current_val: 50,
                increment: 1, min_travel: 0, max_travel: 100,
                needle_width: 10, needle_height: 20,
                needle_inset: 5, needle_hotspot: 0,
            },
        };
        const html = getHtml(w, 0);
        expect(html).toContain('Min Value');
        expect(html).toContain('Max Value');
    });

    test('callbacks group has format_func row', () => {
        const w = createDefaultWidgetInfo(GX_TYPE_BUTTON);
        const html = getHtml(w, 0);
        expect(html).toContain('Format Func');
    });
});
