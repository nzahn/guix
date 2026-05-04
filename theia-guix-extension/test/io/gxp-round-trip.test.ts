/**
 * gxp-round-trip.test.ts — Tests for GxpReader / GxpWriter.
 *
 * Covers:
 *   - Parsing a minimal hand-crafted XML snippet
 *   - Round-trip: writer output → reader → same values
 *   - Key field preservation: project_version, display name, language name,
 *     color resource, string entry
 */

import { GxpReader, GxpParseError } from '../../src/io/gxp-reader';
import { GxpWriter } from '../../src/io/gxp-writer';
import {
    createEmptyProject,
} from '../../src/common/project-model';
import { createDefaultResInfo } from '../../src/common/res-info';
import { RES_TYPE_COLOR, PROJECT_VERSION } from '../../src/common/gx-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reader(): GxpReader { return new GxpReader(); }
function writer(): GxpWriter { return new GxpWriter(); }

// Minimal valid GXP XML (schema version 56, 1 display, 1 language)
const MINIMAL_GXP = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE GUIX_Studio_Project>
<project>
<header>
<project_version>56</project_version>
<guix_version>60200</guix_version>
<studio_version>6020000</studio_version>
<project_name>TestProj</project_name>
<source_path>.\\</source_path>
<header_path>.\\</header_path>
<resource_path>.\\</resource_path>
<insert_headers_before>FALSE</insert_headers_before>
<target_cpu>0</target_cpu>
<target_tools>0</target_tools>
<big_endian>FALSE</big_endian>
<dave2d_graph_accelerator>FALSE</dave2d_graph_accelerator>
<renesas_jpeg_decoder>0</renesas_jpeg_decoder>
<renesas_png_decoder>0</renesas_png_decoder>
<grid_enabled>FALSE</grid_enabled>
<snap_enabled>FALSE</snap_enabled>
<grid_spacing>10</grid_spacing>
<snap_spacing>10</snap_spacing>
<gen_binary>FALSE</gen_binary>
<binary_file_format>1</binary_file_format>
<memory_offset>0</memory_offset>
<gen_res_header>TRUE</gen_res_header>
<custom_resource_enabled>FALSE</custom_resource_enabled>
<app_execute_xpos>0</app_execute_xpos>
<app_execute_ypos>0</app_execute_ypos>
<is_widget_position_locked>FALSE</is_widget_position_locked>
<palette_mode_aa_text_colors>8</palette_mode_aa_text_colors>
<num_displays>1</num_displays>
<max_displays>4</max_displays>
<num_languages>1</num_languages>
<language_names>
<language>English</language>
<support_bidi_text>FALSE</support_bidi_text>
<gen_reordered_bidi_text>FALSE</gen_reordered_bidi_text>
<support_thai_glyph_shaping>FALSE</support_thai_glyph_shaping>
<gen_adjusted_thai_string>FALSE</gen_adjusted_thai_string>
<statically_defined>TRUE</statically_defined>
</language_names>
<string_export>
<string_export_src>0</string_export_src>
<string_export_target>1</string_export_target>
<string_export_version>2</string_export_version>
<string_export_path>.\\</string_export_path>
<string_export_filetype>STRING_EXPORT_TYPE_XLIFF</string_export_filetype>
</string_export>
</header>
<display_info>
<display_index>0</display_index>
<display_name>MyDisplay</display_name>
<xres>320</xres>
<yres>240</yres>
<bits_per_pix>16</bits_per_pix>
<packed_format>FALSE</packed_format>
<format_555>FALSE</format_555>
<format_4444>FALSE</format_4444>
<format_332>FALSE</format_332>
<grayscale>FALSE</grayscale>
<reverse_order>FALSE</reverse_order>
<allocate_canvas>TRUE</allocate_canvas>
<enabled>TRUE</enabled>
<rotation_angle>0</rotation_angle>
<default_map_format>FALSE</default_map_format>
<theme_info>
<num_themes>1</num_themes>
<active_theme>0</active_theme>
<theme_name>Theme_1</theme_name>
<gen_color_table>TRUE</gen_color_table>
<gen_font_table>TRUE</gen_font_table>
<gen_pixelmap_table>TRUE</gen_pixelmap_table>
<enabled>TRUE</enabled>
<statically_defined>TRUE</statically_defined>
<theme_data>
</theme_data>
</theme_info>
<string_group>
</string_group>
<screen_flow>
</screen_flow>
</display_info>
</project>`;

// ---------------------------------------------------------------------------
// Parsing a minimal GXP snippet
// ---------------------------------------------------------------------------

describe('GxpReader — parse minimal XML', () => {
    const project = reader().readProject(MINIMAL_GXP, '/path/to/TestProj.gxp');

    it('derives project_name from filePath', () => {
        expect(project.header.project_name).toBe('TestProj');
    });

    it('reads project_version', () => {
        expect(project.header.project_version).toBe(56);
    });

    it('reads num_displays', () => {
        expect(project.header.num_displays).toBe(1);
    });

    it('reads max_displays', () => {
        expect(project.header.max_displays).toBe(4);
    });

    it('reads first language name', () => {
        expect(project.header.languages[0].name).toBe('English');
    });

    it('reads display name', () => {
        expect(project.displays[0].name).toBe('MyDisplay');
    });

    it('reads display xres and yres', () => {
        expect(project.displays[0].xres).toBe(320);
        expect(project.displays[0].yres).toBe(240);
    });

    it('sets filePath on the returned project', () => {
        expect(project.filePath).toBe('/path/to/TestProj.gxp');
    });

    it('sets isModified to false', () => {
        expect(project.isModified).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('GxpReader — error cases', () => {
    it('throws GxpParseError for non-project XML root', () => {
        const xml = `<?xml version="1.0"?><notaproject/>`;
        expect(() => reader().readProject(xml, 'bad.gxp')).toThrow(GxpParseError);
    });
});

// ---------------------------------------------------------------------------
// Writer — structural correctness
// ---------------------------------------------------------------------------

describe('GxpWriter — write minimal project', () => {
    const project = createEmptyProject('RoundTrip', '/tmp/RoundTrip.gxp');
    const xml = writer().writeProject(project);

    it('produces a <project> root element', () => {
        expect(xml).toContain('<project>');
        expect(xml).toContain('</project>');
    });

    it('writes project_version', () => {
        expect(xml).toContain(`<project_version>${PROJECT_VERSION}</project_version>`);
    });

    it('writes project_name', () => {
        expect(xml).toContain('<project_name>RoundTrip</project_name>');
    });

    it('writes display_info elements', () => {
        expect(xml).toContain('<display_info>');
    });

    it('writes header before display_info', () => {
        const headerPos    = xml.indexOf('<header>');
        const displayPos   = xml.indexOf('<display_info>');
        expect(headerPos).toBeGreaterThan(-1);
        expect(displayPos).toBeGreaterThan(-1);
        expect(headerPos).toBeLessThan(displayPos);
    });
});

// ---------------------------------------------------------------------------
// Round-trip: write → read → same values
// ---------------------------------------------------------------------------

describe('GXP round-trip (writer → reader)', () => {
    const original = createEmptyProject('RT_Test', '/tmp/RT_Test.gxp');
    original.displays[0].name = 'RT_Display';
    original.displays[0].xres = 480;
    original.displays[0].yres = 272;
    original.header.languages[0].name = 'English';
    original.header.num_languages = 1;

    const xml      = writer().writeProject(original);
    const restored = reader().readProject(xml, '/tmp/RT_Test.gxp');

    it('preserves project_version', () => {
        expect(restored.header.project_version).toBe(original.header.project_version);
    });

    it('preserves num_displays', () => {
        expect(restored.header.num_displays).toBe(original.header.num_displays);
    });

    it('preserves max_displays', () => {
        expect(restored.header.max_displays).toBe(original.header.max_displays);
    });

    it('preserves display name', () => {
        expect(restored.displays[0].name).toBe('RT_Display');
    });

    it('preserves display xres', () => {
        expect(restored.displays[0].xres).toBe(480);
    });

    it('preserves display yres', () => {
        expect(restored.displays[0].yres).toBe(272);
    });

    it('preserves num_languages', () => {
        expect(restored.header.num_languages).toBe(1);
    });

    it('preserves first language name', () => {
        expect(restored.header.languages[0].name).toBe('English');
    });
});

// ---------------------------------------------------------------------------
// Round-trip with a color resource
// ---------------------------------------------------------------------------

describe('GXP round-trip — color resource', () => {
    const project = createEmptyProject('ColorTest', '/tmp/ColorTest.gxp');
    const color   = createDefaultResInfo(RES_TYPE_COLOR, 'GX_COLOR_ID_MY_RED');
    color.colorval = 0x00FF0000;

    // Insert the color into the first theme's resource list
    project.displays[0].themes[0].resources.push(color);

    const xml      = writer().writeProject(project);
    const restored = reader().readProject(xml, '/tmp/ColorTest.gxp');

    it('writes the color element', () => {
        expect(xml).toContain('GX_COLOR_ID_MY_RED');
    });

    it('restored display has themes', () => {
        expect(restored.displays[0].themes.length).toBeGreaterThan(0);
    });

    it('round-trips the color name', () => {
        const resources = restored.displays[0].themes[0].resources;
        const found     = resources.find(r => r.name === 'GX_COLOR_ID_MY_RED');
        expect(found).toBeDefined();
    });

    it('round-trips the color value', () => {
        const resources = restored.displays[0].themes[0].resources;
        const found     = resources.find(r => r.name === 'GX_COLOR_ID_MY_RED');
        expect(found?.colorval).toBe(0x00FF0000);
    });
});
