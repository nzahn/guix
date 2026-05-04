/**
 * widget-registry.test.ts — unit tests for WidgetRegistry.
 */

import { WidgetRegistry } from '../../src/widgets/widget-registry';
import {
    GX_TYPE_BUTTON,
    GX_TYPE_TEXT_BUTTON,
    GX_TYPE_WINDOW,
    GX_TYPE_PROMPT,
    GX_TYPE_CHECKBOX,
    GX_TYPE_HORIZONTAL_SCROLL,
    GX_TYPE_VERTICAL_SCROLL,
} from '../../src/common/gx-types';

function reg(): WidgetRegistry {
    return new WidgetRegistry();
}

describe('WidgetRegistry', () => {
    it('registers all built-in types without throwing', () => {
        expect(() => reg()).not.toThrow();
    });

    it('returns correct control block name for GX_TYPE_BUTTON', () => {
        expect(reg().getControlBlockName(GX_TYPE_BUTTON)).toBe('GX_BUTTON');
    });

    it('returns correct control block name for GX_TYPE_TEXT_BUTTON', () => {
        expect(reg().getControlBlockName(GX_TYPE_TEXT_BUTTON)).toBe('GX_TEXT_BUTTON');
    });

    it('returns correct control block name for GX_TYPE_WINDOW', () => {
        expect(reg().getControlBlockName(GX_TYPE_WINDOW)).toBe('GX_WINDOW');
    });

    it('returns correct control block name for GX_TYPE_PROMPT', () => {
        expect(reg().getControlBlockName(GX_TYPE_PROMPT)).toBe('GX_PROMPT');
    });

    it('returns correct control block name for GX_TYPE_CHECKBOX', () => {
        expect(reg().getControlBlockName(GX_TYPE_CHECKBOX)).toBe('GX_CHECKBOX');
    });

    it('returns correct control block name for horizontal scrollbar', () => {
        expect(reg().getControlBlockName(GX_TYPE_HORIZONTAL_SCROLL)).toBe('GX_SCROLLBAR');
    });

    it('returns correct control block name for vertical scrollbar', () => {
        expect(reg().getControlBlockName(GX_TYPE_VERTICAL_SCROLL)).toBe('GX_SCROLLBAR');
    });

    it('falls back to GX_WIDGET for unknown type', () => {
        expect(reg().getControlBlockName(9999)).toBe('GX_WIDGET');
    });

    it('allTypes returns at least 30 registered types', () => {
        expect(reg().allTypes().length).toBeGreaterThanOrEqual(30);
    });

    it('getService returns the registered service instance', () => {
        const r   = reg();
        const svc = r.getService(GX_TYPE_BUTTON);
        expect(svc.getType()).toBe(GX_TYPE_BUTTON);
    });

    it('register replaces existing service', () => {
        const r = reg();
        const custom = {
            getType: () => GX_TYPE_BUTTON,
            getControlBlockName: () => 'MY_BUTTON',
            getShortName: () => 'my_btn',
            createDefault: () => ({ children: [] } as never),
            getPropertyFields: () => [],
            getResizeMode: () => 1,
            getDefaultRect: () => ({ left: 0, top: 0, right: 100, bottom: 50 }),
            colorLabels: () => [],
            fontLabels: () => [],
            pixelmapLabels: () => [],
            stringLabels: () => [],
        };
        r.register(custom as never);
        expect(r.getControlBlockName(GX_TYPE_BUTTON)).toBe('MY_BUTTON');
    });
});
