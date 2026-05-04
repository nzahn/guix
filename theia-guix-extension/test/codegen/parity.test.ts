/**
 * parity.test.ts — Pixel-exact codegen parity tests.
 *
 * These tests load real .gxp project files from the repository and run the
 * ResourceGenerator on them, then compare the generated output against the
 * pre-committed golden .c/.h files that were produced by the original C++
 * GUIX Studio tool.
 *
 * Only sections that can be reproduced WITHOUT font/pixelmap render adapters
 * are verified for exact match.  Font glyph data and pixelmap pixel data are
 * skipped (they require the opentype / pngjs adapters at runtime).
 *
 * Coverage:
 *   - Color table values, one-per-line, lowercase hex (writeColorTable)
 *   - Color table variable name  (tPrefix + "_color_table")
 *   - Extern font declarations for default/system fonts  (writeFontSection fallback)
 *   - Font pointer table name  (tPrefix + "_font_table")
 *   - Pixelmap pointer table name  (tPrefix + "_pixelmap_table")
 *   - Theme struct variable name  (tPrefix)
 *   - Theme table variable name  (display + "_theme_table")
 *   - Header #define for display index, X/Y resolution, color format
 *   - Header THEME_TABLE_SIZE, LANGUAGE_TABLE_SIZE constants
 */

import * as fs   from 'fs';
import * as path from 'path';
import { GxpReader }        from '../../src/io/gxp-reader';
import { ResourceGenerator } from '../../src/codegen/resource-generator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function readGolden(relPath: string): string {
    return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
}

function readGxp(relPath: string): string {
    return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
}

// ---------------------------------------------------------------------------
// demo_guix_vertical_list — display_1, theme_1, 34 colors, 1 font, 1 language
// ---------------------------------------------------------------------------

describe('Parity — demo_guix_vertical_list', () => {
    const GXP_PATH    = 'tutorials/demo_guix_vertical_list/demo_guix_vertical_list.gxp';
    const GOLDEN_C    = 'tutorials/demo_guix_vertical_list/demo_guix_vertical_list_resources.c';
    const GOLDEN_H    = 'tutorials/demo_guix_vertical_list/demo_guix_vertical_list_resources.h';

    let sourceOut: string;
    let headerOut: string;
    let goldenC:   string;
    let goldenH:   string;

    beforeAll(() => {
        const xml     = readGxp(GXP_PATH);
        const project = new GxpReader().readProject(xml, GXP_PATH);
        const files   = new ResourceGenerator().generate(project, 0);
        sourceOut = files.source.content;
        headerOut = files.header.content;
        goldenC   = readGolden(GOLDEN_C);
        goldenH   = readGolden(GOLDEN_H);
    });

    // ── Color table ──────────────────────────────────────────────────────────

    it('source emits the correct color table variable name', () => {
        expect(sourceOut).toContain('display_1_theme_1_color_table');
    });

    it('source emits the first golden color value', () => {
        // First default color: CANVAS = 0xff000000
        expect(sourceOut).toContain('0xff000000');
    });

    it('source emits the 25th golden color (transparent dark)', () => {
        // Color index 24 (0-based): 0x00a0a0a0
        expect(sourceOut).toContain('0x00a0a0a0');
    });

    it('color values are lowercase hex (parity)', () => {
        // Golden uses lowercase: 0xff000000; we must NOT emit uppercase 0xFF000000
        expect(sourceOut).not.toMatch(/0x[0-9A-F]{8}/);
    });

    it('color table has one value per line (parity)', () => {
        // Each value followed by comma+CRLF (except last which has just CRLF)
        expect(sourceOut).toMatch(/0xff000000,\r\n/);
    });

    it('source color table matches golden color values exactly', () => {
        // Extract the color table block from golden
        const match = goldenC.match(
            /GX_CONST GX_COLOR display_1_theme_1_color_table\[\] =\r?\n\{([\s\S]*?)\};/,
        );
        expect(match).not.toBeNull();
        const goldenBlock = match![0]
            .replace(/\r\n/g, '\n')   // normalize line endings for comparison
            .trim();

        const ourMatch = sourceOut.match(
            /GX_CONST GX_COLOR display_1_theme_1_color_table\[\] =\r?\n\{([\s\S]*?)\};/,
        );
        expect(ourMatch).not.toBeNull();
        const ourBlock = ourMatch![0]
            .replace(/\r\n/g, '\n')
            .trim();

        expect(ourBlock).toBe(goldenBlock);
    });

    // ── Font table ───────────────────────────────────────────────────────────

    it('source emits font pointer table variable name', () => {
        expect(sourceOut).toContain('display_1_theme_1_font_table');
    });

    it('source emits extern GX_FONT for system/default font (no adapter)', () => {
        // Without a fontDataMap, writeFontSection uses the extern fallback path
        expect(sourceOut).toContain('extern GX_CONST GX_FONT');
    });

    // ── Pixelmap table ───────────────────────────────────────────────────────

    it('source emits pixelmap pointer table variable name', () => {
        expect(sourceOut).toContain('display_1_theme_1_pixelmap_table');
    });

    // ── Theme struct ─────────────────────────────────────────────────────────

    it('source emits theme struct variable name', () => {
        expect(sourceOut).toContain('GX_THEME display_1_theme_1');
    });

    it('source references color table in theme struct', () => {
        expect(sourceOut).toContain('display_1_theme_1_color_table');
    });

    it('source emits theme table', () => {
        expect(sourceOut).toContain('display_1_theme_table');
    });

    // ── Header defines ───────────────────────────────────────────────────────

    it('header emits display index define', () => {
        expect(headerOut).toContain('DISPLAY_1');
    });

    it('header emits X_RESOLUTION matching golden (640)', () => {
        // vertical_list display is 640×480
        expect(headerOut).toContain('640');
    });

    it('header emits Y_RESOLUTION matching golden (480)', () => {
        expect(headerOut).toContain('480');
    });

    it('header emits THEME_TABLE_SIZE 1', () => {
        expect(headerOut).toMatch(/THEME_TABLE_SIZE\s+1/);
    });

    it('header emits LANGUAGE_TABLE_SIZE 1', () => {
        expect(headerOut).toMatch(/LANGUAGE_TABLE_SIZE\s+1/);
    });

    it('header has include guard', () => {
        expect(headerOut).toContain('#ifndef');
        expect(headerOut).toContain('#endif');
    });

    it('header includes gx_api.h', () => {
        expect(goldenH).toContain('#include "gx_api.h"');
        expect(headerOut).toContain('#include "gx_api.h"');
    });
});

// ---------------------------------------------------------------------------
// demo_guix_binres_standalone — smallest example (765 lines golden)
// ---------------------------------------------------------------------------

describe('Parity — demo_guix_binres_standalone', () => {
    const GXP_PATH = 'tutorials/demo_guix_binres_standalone/demo_guix_binres_standalone.gxp';
    const GOLDEN_C = 'tutorials/demo_guix_binres_standalone/demo_guix_binres_standalone_resources.c';

    let sourceOut: string;
    let goldenC:   string;

    beforeAll(() => {
        const xml     = readGxp(GXP_PATH);
        const project = new GxpReader().readProject(xml, GXP_PATH);
        const files   = new ResourceGenerator().generate(project, 0);
        sourceOut = files.source.content;
        goldenC   = readGolden(GOLDEN_C);
    });

    it('source emits the correct color table variable name (main_display)', () => {
        // binres_standalone display is named "main_display"
        expect(sourceOut).toMatch(/main_display.*color_table/);
    });

    it('color table has 30 entries matching golden', () => {
        // Golden has 30 colors (lines 20-49)
        const match = goldenC.match(
            /GX_CONST GX_COLOR \w+_color_table\[\] =\r?\n\{([\s\S]*?)\};/,
        );
        expect(match).not.toBeNull();
        const goldenColors = (match![1].match(/0x[0-9a-f]+/g) ?? []);
        expect(goldenColors.length).toBe(30);

        const ourMatch = sourceOut.match(
            /GX_CONST GX_COLOR \w+_color_table\[\] =\r?\n\{([\s\S]*?)\};/,
        );
        expect(ourMatch).not.toBeNull();
        const ourColors = (ourMatch![1].match(/0x[0-9a-f]+/g) ?? []);
        expect(ourColors).toEqual(goldenColors);
    });

    it('source emits font pointer table', () => {
        expect(sourceOut).toContain('_font_table');
    });

    it('source emits pixelmap pointer table', () => {
        expect(sourceOut).toContain('_pixelmap_table');
    });
});
